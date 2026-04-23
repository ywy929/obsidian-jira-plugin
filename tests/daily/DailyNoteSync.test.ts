import { DailyNoteSync, VaultPort } from '../../src/daily/DailyNoteSync';

class InMemoryVault implements VaultPort {
  files = new Map<string, string>();
  mtimes = new Map<string, number>();

  async exists(path: string) { return this.files.has(path); }
  async read(path: string) {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`not found: ${path}`);
    return content;
  }
  async write(path: string, content: string) {
    this.files.set(path, content);
    this.mtimes.set(path, Date.now());
  }
  async stat(path: string) {
    const mtime = this.mtimes.get(path);
    return mtime === undefined ? null : { mtime };
  }
  async ensureFolder(_path: string) { /* noop in memory */ }
}

describe('DailyNoteSync.ensureTodayNote', () => {
  it('creates today\'s note from template when missing', async () => {
    const vault = new InMemoryVault();
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22)); // Apr 22 2026

    const path = await sync.ensureTodayNote();

    expect(path).toBe('daily/2026-04-22.md');
    const content = await vault.read(path);
    expect(content).toContain('# Wednesday, 22 Apr 2026');
    expect(content).toContain('## Today');
    expect(content).toContain('### Tram');
  });

  it('does not overwrite existing today\'s note', async () => {
    const vault = new InMemoryVault();
    await vault.write('daily/2026-04-22.md', 'CUSTOM CONTENT');
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));

    const path = await sync.ensureTodayNote();

    expect(await vault.read(path)).toBe('CUSTOM CONTENT');
  });
});

describe('DailyNoteSync.rollForwardFromYesterday', () => {
  it('copies [ ] items from yesterday\'s Today into today\'s Today; [x] items into today\'s Yesterday', async () => {
    const vault = new InMemoryVault();
    const yesterdayContent = `---
type: daily
---

# Tuesday, 21 Apr 2026

## Yesterday
### Tram
- [x] PROD-250
### GIMS
- [ ]
### Smart Street Light
- [ ]

## Today
### Tram
- [ ] PROD-269
- [x] PROD-295
### GIMS
- [ ] SL-5
### Smart Street Light
- [ ]

## Interrupts (#adhoc)
-

## Blockers
-

## Decisions / Notes
-
`;
    await vault.write('daily/2026-04-21.md', yesterdayContent);

    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));
    await sync.rollForwardFromYesterday();

    const today = await vault.read('daily/2026-04-22.md');

    // yesterday's [x] lands in today's Yesterday
    expect(today).toMatch(/## Yesterday[\s\S]*### Tram[\s\S]*- \[x\] PROD-295/);
    // yesterday's [ ] lands in today's Today
    expect(today).toMatch(/## Today[\s\S]*### Tram[\s\S]*- \[ \] PROD-269/);
    expect(today).toMatch(/## Today[\s\S]*### GIMS[\s\S]*- \[ \] SL-5/);
  });

  it('noop when yesterday\'s note does not exist', async () => {
    const vault = new InMemoryVault();
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));
    await sync.rollForwardFromYesterday();
    // today's note still gets created (fresh template)
    expect(await vault.exists('daily/2026-04-22.md')).toBe(true);
  });
});

describe('DailyNoteSync.toggleCheckbox', () => {
  async function setupToday(vault: InMemoryVault, body: string) {
    const content = `---
type: daily
---

# Wednesday, 22 Apr 2026

## Yesterday
### Tram
- [ ]
### GIMS
- [ ]
### Smart Street Light
- [ ]

## Today
${body}

## Interrupts (#adhoc)
-

## Blockers
-

## Decisions / Notes
-
`;
    await vault.write('daily/2026-04-22.md', content);
  }

  it('flips [ ] to [x] for a given key', async () => {
    const vault = new InMemoryVault();
    await setupToday(vault, `### Tram\n- [ ] PROD-269\n### GIMS\n- [ ]\n### Smart Street Light\n- [ ]`);
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));
    await sync.ensureTodayNote();  // loads mtime

    await sync.toggleCheckbox('PROD-269', true);

    const content = await vault.read('daily/2026-04-22.md');
    expect(content).toContain('- [x] PROD-269');
  });

  it('flips [x] back to [ ]', async () => {
    const vault = new InMemoryVault();
    await setupToday(vault, `### Tram\n- [x] PROD-269\n### GIMS\n- [ ]\n### Smart Street Light\n- [ ]`);
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));
    await sync.ensureTodayNote();

    await sync.toggleCheckbox('PROD-269', false);

    const content = await vault.read('daily/2026-04-22.md');
    expect(content).toContain('- [ ] PROD-269');
    expect(content).not.toContain('- [x] PROD-269');
  });

  it('throws conflict error when file has been modified externally', async () => {
    const vault = new InMemoryVault();
    await setupToday(vault, `### Tram\n- [ ] PROD-269\n### GIMS\n- [ ]\n### Smart Street Light\n- [ ]`);
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));
    await sync.ensureTodayNote();

    // simulate external edit bumping mtime
    await new Promise(r => setTimeout(r, 5));
    await vault.write('daily/2026-04-22.md', 'MANUALLY CHANGED');

    await expect(sync.toggleCheckbox('PROD-269', true))
      .rejects.toMatchObject({ kind: 'conflict' });
  });

  it('noop when key not in today\'s note', async () => {
    const vault = new InMemoryVault();
    await setupToday(vault, `### Tram\n- [ ] PROD-269\n### GIMS\n- [ ]\n### Smart Street Light\n- [ ]`);
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));
    await sync.ensureTodayNote();

    await sync.toggleCheckbox('SL-99', true); // not present
    const content = await vault.read('daily/2026-04-22.md');
    expect(content).toContain('- [ ] PROD-269'); // unchanged
  });
});

describe('DailyNoteSync.appendInterrupt / appendBlocker', () => {
  it('appends issue key under ## Interrupts (#adhoc)', async () => {
    const vault = new InMemoryVault();
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));
    await sync.ensureTodayNote();

    await sync.appendInterrupt('PROD-300');

    const content = await vault.read('daily/2026-04-22.md');
    expect(content).toMatch(/## Interrupts \(#adhoc\)[\s\S]*- \[ \] PROD-300/);
  });

  it('appends multiple interrupts on separate lines', async () => {
    const vault = new InMemoryVault();
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));
    await sync.ensureTodayNote();

    await sync.appendInterrupt('PROD-300');
    await sync.appendInterrupt('SL-99');

    const content = await vault.read('daily/2026-04-22.md');
    expect(content).toContain('- [ ] PROD-300');
    expect(content).toContain('- [ ] SL-99');
  });

  it('appends blocker with unblocker name and age', async () => {
    const vault = new InMemoryVault();
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));
    await sync.ensureTodayNote();

    await sync.appendBlocker('SL-5', 'chikeen', 3);

    const content = await vault.read('daily/2026-04-22.md');
    expect(content).toMatch(/## Blockers[\s\S]*SL-5 — chikeen — 3 days/);
  });
});

describe('DailyNoteSync.seedToday', () => {
  it('appends items under the right lane and reports added count', async () => {
    const vault = new InMemoryVault();
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));
    await sync.ensureTodayNote();

    const result = await sync.seedToday([
      { lane: 'Tram', text: 'Tram UI close-out' },
      { lane: 'GIMS', text: 'GIMS docs review' },
      { lane: 'Cross-cutting', text: 'Junior dev result review' },
    ]);

    expect(result).toEqual({ added: 3, skipped: 0 });
    const content = await vault.read('daily/2026-04-22.md');
    expect(content).toMatch(/### Tram[\s\S]*- \[ \] Tram UI close-out/);
    expect(content).toMatch(/### GIMS[\s\S]*- \[ \] GIMS docs review/);
    expect(content).toMatch(/### Cross-cutting[\s\S]*- \[ \] Junior dev result review/);
  });

  it('skips items already present in the same lane (dedup)', async () => {
    const vault = new InMemoryVault();
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));
    await sync.ensureTodayNote();

    await sync.seedToday([{ lane: 'Tram', text: 'Tram UI close-out' }]);
    const second = await sync.seedToday([
      { lane: 'Tram', text: 'Tram UI close-out' },      // duplicate
      { lane: 'Tram', text: 'Tram maintenance UI' },    // new
    ]);

    expect(second).toEqual({ added: 1, skipped: 1 });
    const content = await vault.read('daily/2026-04-22.md');
    const occurrences = (content.match(/- \[ \] Tram UI close-out/g) ?? []).length;
    expect(occurrences).toBe(1);
    expect(content).toContain('- [ ] Tram maintenance UI');
  });

  it('ticked-off item in the same text is still considered present (dedup ignores checkbox state)', async () => {
    const vault = new InMemoryVault();
    const sync = new DailyNoteSync(vault, 'daily', new Date(2026, 3, 22));
    await sync.ensureTodayNote();

    // seed then manually tick the item done
    await sync.seedToday([{ lane: 'Tram', text: 'Tram UI close-out' }]);
    let content = await vault.read('daily/2026-04-22.md');
    content = content.replace('- [ ] Tram UI close-out', '- [x] Tram UI close-out');
    await vault.write('daily/2026-04-22.md', content);

    const result = await sync.seedToday([{ lane: 'Tram', text: 'Tram UI close-out' }]);
    expect(result).toEqual({ added: 0, skipped: 1 });
  });
});
