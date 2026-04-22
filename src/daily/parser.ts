export interface ParsedItem {
  key: string;
  lane?: string;
  done: boolean;
}

export interface ParsedDailyNote {
  yesterdayCompleted: ParsedItem[];
  todayOpen: ParsedItem[];
  interrupts: ParsedItem[];
  blockers: string[];
  decisions: string[];
}

const CHECK_LINE = /^- \[([x ])\]\s+([A-Z]+-\d+)/;
const KEY_PICK = /([A-Z]+-\d+)/;

export function parseDailyNote(content: string): ParsedDailyNote {
  const lines = content.split(/\r?\n/);
  const result: ParsedDailyNote = {
    yesterdayCompleted: [], todayOpen: [], interrupts: [], blockers: [], decisions: [],
  };

  let section: 'yesterday' | 'today' | 'interrupts' | 'blockers' | 'decisions' | null = null;
  let lane: string | undefined;

  for (const line of lines) {
    const t = line.trim();
    if (t === '## Yesterday') { section = 'yesterday'; lane = undefined; continue; }
    if (t === '## Today') { section = 'today'; lane = undefined; continue; }
    if (/^## Interrupts/.test(t)) { section = 'interrupts'; lane = undefined; continue; }
    if (t === '## Blockers') { section = 'blockers'; lane = undefined; continue; }
    if (/^## Decisions/.test(t)) { section = 'decisions'; lane = undefined; continue; }
    if (/^## /.test(t)) { section = null; lane = undefined; continue; }

    if ((section === 'yesterday' || section === 'today') && /^### /.test(t)) {
      lane = t.replace(/^###\s*/, '');
      continue;
    }

    const cbMatch = CHECK_LINE.exec(t);
    if (cbMatch && section) {
      const done = cbMatch[1] === 'x';
      const key = cbMatch[2];
      const item: ParsedItem = { key, lane, done };
      if (section === 'yesterday' && done) result.yesterdayCompleted.push(item);
      else if (section === 'today' && !done) result.todayOpen.push(item);
      else if (section === 'interrupts') result.interrupts.push(item);
      continue;
    }

    if (section === 'blockers' && t.startsWith('-') && t !== '-' && KEY_PICK.test(t)) {
      result.blockers.push(t.replace(/^-\s*/, ''));
    }
    if (section === 'decisions' && t.startsWith('-') && t !== '-') {
      result.decisions.push(t.replace(/^-\s*/, ''));
    }
  }

  return result;
}
