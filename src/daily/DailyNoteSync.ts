import { renderTemplate, formatIsoDate, formatPrettyDate } from './template';

export interface VaultPort {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  stat(path: string): Promise<{ mtime: number } | null>;
  ensureFolder(path: string): Promise<void>;
}

type LaneName = 'Tram' | 'GIMS' | 'Smart Street Light';
const LANES: LaneName[] = ['Tram', 'GIMS', 'Smart Street Light'];

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
    if (await this.vault.exists(path)) return path;

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
      yesterday: { Tram: [], GIMS: [], 'Smart Street Light': [] },
      today: { Tram: [], GIMS: [], 'Smart Street Light': [] },
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
