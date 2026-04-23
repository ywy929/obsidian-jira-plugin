import { renderTemplate, formatIsoDate, formatPrettyDate } from './template';

export interface VaultPort {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  stat(path: string): Promise<{ mtime: number } | null>;
  ensureFolder(path: string): Promise<void>;
}

export type LaneName = 'Tram' | 'GIMS' | 'Smart Street Light' | 'Cross-cutting';
const LANES: LaneName[] = ['Tram', 'GIMS', 'Smart Street Light', 'Cross-cutting'];

interface ParsedSections {
  yesterday: Record<LaneName, string[]>;  // raw lines (excluding blank placeholder)
  today: Record<LaneName, string[]>;
}

export class DailyNoteSync {
  private lastKnownMtime = new Map<string, number>();

  constructor(
    private vault: VaultPort,
    private dailyFolder: string,
    private now: Date = new Date(),
  ) {}

  private isoFor(d: Date): string { return formatIsoDate(d); }
  private pathFor(d: Date): string { return `${this.dailyFolder}/${this.isoFor(d)}.md`; }

  async ensureTodayNote(): Promise<string> {
    await this.vault.ensureFolder(this.dailyFolder);
    const path = this.pathFor(this.now);
    if (await this.vault.exists(path)) {
      const stat = await this.vault.stat(path);
      if (stat) this.lastKnownMtime.set(path, stat.mtime);
      return path;
    }

    const content = renderTemplate({
      isoDate: this.isoFor(this.now),
      prettyDate: formatPrettyDate(this.now),
    });
    await this.vault.write(path, content);
    const stat = await this.vault.stat(path);
    if (stat) this.lastKnownMtime.set(path, stat.mtime);
    return path;
  }

  async rollForwardFromYesterday(): Promise<void> {
    const yesterday = new Date(this.now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yPath = this.pathFor(yesterday);

    const todayPath = await this.ensureTodayNote();

    if (!(await this.vault.exists(yPath))) return;

    const yContent = await this.vault.read(yPath);
    const parsed = this.parseSections(yContent);

    const todayContent = await this.vault.read(todayPath);
    let updated = todayContent;

    for (const lane of LANES) {
      const doneItems = (parsed.today[lane] ?? []).filter(l => /^- \[x\] /.test(l));
      const openItems = (parsed.today[lane] ?? []).filter(l => /^- \[ \] /.test(l));

      if (doneItems.length > 0) {
        updated = this.replaceLaneItems(updated, 'Yesterday', lane, doneItems);
      }
      if (openItems.length > 0) {
        updated = this.replaceLaneItems(updated, 'Today', lane, openItems);
      }
    }

    await this.vault.write(todayPath, updated);
    const stat = await this.vault.stat(todayPath);
    if (stat) this.lastKnownMtime.set(todayPath, stat.mtime);
  }

  private parseSections(content: string): ParsedSections {
    const result: ParsedSections = {
      yesterday: { Tram: [], GIMS: [], 'Smart Street Light': [], 'Cross-cutting': [] },
      today: { Tram: [], GIMS: [], 'Smart Street Light': [], 'Cross-cutting': [] },
    };
    const lines = content.split(/\r?\n/);

    let section: 'yesterday' | 'today' | null = null;
    let lane: LaneName | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '## Yesterday') { section = 'yesterday'; lane = null; continue; }
      if (trimmed === '## Today') { section = 'today'; lane = null; continue; }
      if (/^## /.test(trimmed)) { section = null; lane = null; continue; }
      if (section && /^### /.test(trimmed)) {
        const name = trimmed.replace(/^###\s*/, '') as LaneName;
        lane = LANES.includes(name) ? name : null;
        continue;
      }
      if (section && lane && /^- \[(x| )\] /.test(trimmed)) {
        result[section][lane].push(trimmed);
      }
    }
    return result;
  }

  async toggleCheckbox(issueKey: string, done: boolean): Promise<void> {
    const path = this.pathFor(this.now);
    if (!(await this.vault.exists(path))) return;

    const stat = await this.vault.stat(path);
    const lastKnown = this.lastKnownMtime.get(path);
    if (lastKnown !== undefined && stat && stat.mtime > lastKnown) {
      throw { kind: 'conflict', message: 'Daily note changed on disk.' };
    }

    const content = await this.vault.read(path);
    const escaped = this.escape(issueKey);
    const newMark = done ? 'x' : ' ';
    const oldMark = done ? ' ' : 'x';
    const pattern = new RegExp(`^- \\[${oldMark === ' ' ? ' ' : 'x'}\\] ${escaped}\\b`, 'm');
    if (!pattern.test(content)) return;

    const updated = content.replace(pattern, `- [${newMark}] ${issueKey}`);
    await this.vault.write(path, updated);
    const newStat = await this.vault.stat(path);
    if (newStat) this.lastKnownMtime.set(path, newStat.mtime);
  }

  async seedToday(items: { lane: LaneName; text: string }[]): Promise<{ added: number; skipped: number }> {
    const path = this.pathFor(this.now);
    if (!(await this.vault.exists(path))) await this.ensureTodayNote();

    // ensure all lanes exist under ## Today (migrates older files that predate Cross-cutting lane)
    for (const lane of LANES) {
      await this.ensureLaneExists('Today', lane);
    }

    // dedup against items already present in today's ## Today section
    const content = await this.vault.read(path);
    const existing = this.collectCheckboxTextsBySection(content, 'Today');
    const toAdd: { lane: LaneName; text: string }[] = [];
    let skipped = 0;
    for (const item of items) {
      const laneSet = existing.get(item.lane) ?? new Set<string>();
      if (laneSet.has(item.text.trim())) { skipped++; continue; }
      toAdd.push(item);
    }

    // group by lane, append each as a checkbox line
    const byLane = new Map<LaneName, string[]>();
    for (const item of toAdd) {
      const arr = byLane.get(item.lane) ?? [];
      arr.push(`- [ ] ${item.text}`);
      byLane.set(item.lane, arr);
    }

    for (const [lane, lines] of byLane.entries()) {
      for (const line of lines) {
        await this.appendToLane('Today', lane, line);
      }
    }

    return { added: toAdd.length, skipped };
  }

  private collectCheckboxTextsBySection(content: string, section: 'Yesterday' | 'Today'): Map<LaneName, Set<string>> {
    const result = new Map<LaneName, Set<string>>();
    for (const lane of LANES) result.set(lane, new Set<string>());

    const lines = content.split(/\r?\n/);
    const sectionStart = lines.findIndex(l => l.trim() === `## ${section}`);
    if (sectionStart === -1) return result;
    let sectionEnd = lines.length;
    for (let i = sectionStart + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i].trim())) { sectionEnd = i; break; }
    }

    let currentLane: LaneName | null = null;
    for (let i = sectionStart + 1; i < sectionEnd; i++) {
      const trimmed = lines[i].trim();
      if (/^### /.test(trimmed)) {
        const name = trimmed.replace(/^###\s*/, '') as LaneName;
        currentLane = (LANES as readonly string[]).includes(name) ? (name as LaneName) : null;
        continue;
      }
      if (currentLane) {
        const match = /^- \[(x| )\]\s+(.+?)\s*$/.exec(trimmed);
        if (match) result.get(currentLane)!.add(match[2].trim());
      }
    }
    return result;
  }

  private async ensureLaneExists(section: 'Yesterday' | 'Today', lane: LaneName): Promise<void> {
    const path = this.pathFor(this.now);
    const content = await this.vault.read(path);
    const lines = content.split(/\r?\n/);
    const sectionStart = lines.findIndex(l => l.trim() === `## ${section}`);
    if (sectionStart === -1) return;
    const laneHeader = `### ${lane}`;
    const laneExists = lines.slice(sectionStart + 1).some((l, _i) => l.trim() === laneHeader);
    if (laneExists) return;

    // find end of section: next ## or EOF
    let sectionEnd = lines.length;
    for (let i = sectionStart + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i].trim())) { sectionEnd = i; break; }
    }

    // insert lane header + placeholder before the section end (trim trailing blanks first)
    const sectionTail = lines.slice(sectionStart + 1, sectionEnd);
    while (sectionTail.length > 0 && sectionTail[sectionTail.length - 1].trim() === '') sectionTail.pop();

    const updated = [
      ...lines.slice(0, sectionStart + 1),
      ...sectionTail,
      laneHeader,
      '- [ ]',
      '',
      ...lines.slice(sectionEnd),
    ].join('\n');
    await this.vault.write(path, updated);
    const stat = await this.vault.stat(path);
    if (stat) this.lastKnownMtime.set(path, stat.mtime);
  }

  private async appendToLane(section: 'Yesterday' | 'Today', lane: LaneName, newLine: string): Promise<void> {
    const path = this.pathFor(this.now);
    const content = await this.vault.read(path);
    const lines = content.split(/\r?\n/);
    const sectionStart = lines.findIndex(l => l.trim() === `## ${section}`);
    if (sectionStart === -1) return;
    const laneHeader = `### ${lane}`;
    const laneStart = lines.findIndex((l, i) => i > sectionStart && l.trim() === laneHeader);
    if (laneStart === -1) return;

    // find end of lane: next ### or ## or EOF
    let laneEnd = lines.length;
    for (let i = laneStart + 1; i < lines.length; i++) {
      if (/^#{2,3} /.test(lines[i].trim())) { laneEnd = i; break; }
    }

    // drop placeholder bare `- [ ]` if present as first/only item
    const laneBody = lines.slice(laneStart + 1, laneEnd);
    const cleaned: string[] = [];
    let skippedPlaceholder = false;
    for (const l of laneBody) {
      if (!skippedPlaceholder && l.trim() === '- [ ]') { skippedPlaceholder = true; continue; }
      cleaned.push(l);
    }
    // trim trailing blanks
    while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') cleaned.pop();
    cleaned.push(newLine);

    const updated = [
      ...lines.slice(0, laneStart + 1),
      ...cleaned,
      '',
      ...lines.slice(laneEnd),
    ].join('\n');
    await this.vault.write(path, updated);
    const stat = await this.vault.stat(path);
    if (stat) this.lastKnownMtime.set(path, stat.mtime);
  }

  async appendInterrupt(issueKey: string): Promise<void> {
    await this.appendUnderHeading('## Interrupts (#adhoc)', `- [ ] ${issueKey}`);
  }

  async appendBlocker(issueKey: string, unblocker: string, ageDays?: number): Promise<void> {
    const ageStr = ageDays !== undefined ? ` — ${ageDays} days` : '';
    await this.appendUnderHeading('## Blockers', `- ${issueKey} — ${unblocker}${ageStr}`);
  }

  private async appendUnderHeading(heading: string, newLine: string): Promise<void> {
    const path = this.pathFor(this.now);
    if (!(await this.vault.exists(path))) await this.ensureTodayNote();

    const content = await this.vault.read(path);
    const lines = content.split(/\r?\n/);
    const headingIdx = lines.findIndex(l => l.trim() === heading);
    if (headingIdx === -1) throw { kind: 'unknown', message: `Heading "${heading}" not found.` };

    // find end of section: next ## or EOF
    let endIdx = lines.length;
    for (let i = headingIdx + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i].trim())) { endIdx = i; break; }
    }

    // drop trailing blank lines and the placeholder "- " line if present; insert before section end
    const sectionLines = lines.slice(headingIdx + 1, endIdx);
    const cleaned: string[] = [];
    let insertedPlaceholderSkipped = false;
    for (const l of sectionLines) {
      if (!insertedPlaceholderSkipped && l.trim() === '-') { insertedPlaceholderSkipped = true; continue; }
      cleaned.push(l);
    }

    // trim trailing blanks
    while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') cleaned.pop();
    cleaned.push(newLine);
    cleaned.push('');

    const updated = [
      ...lines.slice(0, headingIdx + 1),
      ...cleaned,
      ...lines.slice(endIdx),
    ].join('\n');

    await this.vault.write(path, updated);
    const stat = await this.vault.stat(path);
    if (stat) this.lastKnownMtime.set(path, stat.mtime);
  }

  private escape(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  private replaceLaneItems(
    content: string, section: 'Yesterday' | 'Today', lane: LaneName, items: string[],
  ): string {
    const lines = content.split(/\r?\n/);
    const sectionStart = lines.findIndex(l => l.trim() === `## ${section}`);
    if (sectionStart === -1) return content;
    const laneHeader = `### ${lane}`;
    const laneStart = lines.findIndex((l, i) => i > sectionStart && l.trim() === laneHeader);
    if (laneStart === -1) return content;

    // find end of this lane: next ### or ## or EOF
    let laneEnd = lines.length;
    for (let i = laneStart + 1; i < lines.length; i++) {
      if (/^#{2,3} /.test(lines[i].trim())) { laneEnd = i; break; }
    }

    // remove existing items inside (only checkbox lines), keep other content alone
    const before = lines.slice(0, laneStart + 1);
    const existingLaneLines = lines.slice(laneStart + 1, laneEnd);
    const keptLines = existingLaneLines.filter(l => !/^- \[(x| )\] /.test(l.trim()));

    // append new items
    const newLaneBody = [...keptLines.filter(l => l.trim() !== ''), ...items];
    // ensure a blank line between lanes only if not at end
    const after = lines.slice(laneEnd);

    return [...before, ...newLaneBody, ...after].join('\n');
  }
}
