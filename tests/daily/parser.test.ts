import { parseDailyNote } from '../../src/daily/parser';

describe('parseDailyNote', () => {
  const sample = `---
type: daily
date: 2026-04-22
---

# Wednesday, 22 Apr 2026

## Yesterday
### Tram
- [x] PROD-295
### GIMS
- [ ]
### Smart Street Light
- [ ]

## Today
### Tram
- [ ] PROD-269
### GIMS
- [ ] SL-5
### Smart Street Light
- [ ]

## Interrupts (#adhoc)
- [ ] PROD-300

## Blockers
- SL-5 — chikeen — 1 days

## Decisions / Notes
- decided to defer v2 linking
`;

  it('extracts completed items under Yesterday', () => {
    const parsed = parseDailyNote(sample);
    expect(parsed.yesterdayCompleted.map(i => i.key)).toContain('PROD-295');
  });

  it('extracts open items under Today', () => {
    const parsed = parseDailyNote(sample);
    expect(parsed.todayOpen.map(i => i.key).sort()).toEqual(['PROD-269', 'SL-5']);
  });

  it('extracts interrupts with #adhoc tag', () => {
    const parsed = parseDailyNote(sample);
    expect(parsed.interrupts.map(i => i.key)).toEqual(['PROD-300']);
  });

  it('extracts blockers as raw lines', () => {
    const parsed = parseDailyNote(sample);
    expect(parsed.blockers).toHaveLength(1);
    expect(parsed.blockers[0]).toContain('SL-5');
    expect(parsed.blockers[0]).toContain('chikeen');
  });

  it('extracts decisions as raw lines', () => {
    const parsed = parseDailyNote(sample);
    expect(parsed.decisions).toHaveLength(1);
    expect(parsed.decisions[0]).toContain('defer v2');
  });
});
