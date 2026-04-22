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
