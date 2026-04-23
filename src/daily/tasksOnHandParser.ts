import { LaneName } from './DailyNoteSync';

export interface TasksOnHandItem {
  task: string;
  project: string;
  status: string;
  notes?: string;
}

/**
 * Parse a specific person's section of tasks-on-hand.md.
 * Expects the section to be led by `## <ownerHeading>` followed by a pipe-delimited
 * table with columns: Task | Project | Status | Notes.
 * Returns items until the next `## ` heading or EOF. Skips the table's header + separator rows.
 */
export function parseTasksOnHand(content: string, ownerHeading: string): TasksOnHandItem[] {
  const lines = content.split(/\r?\n/);
  const ownerIdx = lines.findIndex(l => l.trim() === `## ${ownerHeading}`);
  if (ownerIdx === -1) return [];

  // find end of section
  let endIdx = lines.length;
  for (let i = ownerIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i].trim())) { endIdx = i; break; }
  }

  const items: TasksOnHandItem[] = [];
  let headerSeen = false;
  let separatorSeen = false;

  for (let i = ownerIdx + 1; i < endIdx; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    // first pipe row is the header (Task | Project | Status | Notes), second is separator (| --- |)
    if (!headerSeen) { headerSeen = true; continue; }
    if (!separatorSeen) { separatorSeen = true; continue; }

    const cells = trimmed
      .split('|')
      .slice(1, -1)   // drop leading/trailing empty strings from outer pipes
      .map(c => c.trim());

    if (cells.length < 3) continue;
    if (!cells[0]) continue;  // empty task = skip

    items.push({
      task: cells[0],
      project: cells[1] ?? '',
      status: cells[2] ?? '',
      notes: cells[3] && cells[3].length > 0 ? cells[3] : undefined,
    });
  }

  return items;
}

/**
 * Map a tasks-on-hand `Project` column value to the plugin's lane names.
 * "All" and unknown project labels land in Cross-cutting.
 */
export function laneForProject(project: string): LaneName {
  const p = project.trim().toLowerCase();
  if (p === 'tram') return 'Tram';
  if (p === 'gims') return 'GIMS';
  if (p === 'sl' || p === 'smart street light') return 'Smart Street Light';
  return 'Cross-cutting';
}
