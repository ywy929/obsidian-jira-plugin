export interface TemplateContext {
  isoDate: string;           // YYYY-MM-DD
  prettyDate: string;        // "Wednesday, 22 Apr 2026"
}

export function renderTemplate(ctx: TemplateContext): string {
  return `---
type: daily
tags: [daily, standup]
date: ${ctx.isoDate}
---

# ${ctx.prettyDate}

## Yesterday
### Tram
- [ ]
### GIMS
- [ ]
### Smart Street Light
- [ ]

## Today
### Tram
- [ ]
### GIMS
- [ ]
### Smart Street Light
- [ ]

## Interrupts (#adhoc)
-

## Blockers
-

## Decisions / Notes
-
`;
}

export function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatPrettyDate(d: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
