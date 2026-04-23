import { Issue } from '../jira/types';

export interface RowCallbacks {
  onToggle: (issue: Issue, checked: boolean) => Promise<void>;
  onExpand: (issue: Issue, rowEl: HTMLElement) => Promise<void>;
  onMenu: (issue: Issue, anchor: HTMLElement) => void;
}

export function renderIssueRow(parent: HTMLElement, issue: Issue, cb: RowCallbacks): HTMLElement {
  const row = parent.createDiv({ cls: 'dw-row' });
  const checkbox = row.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
  checkbox.checked = issue.status.statusCategory.key === 'done';
  checkbox.onchange = () => cb.onToggle(issue, checkbox.checked);

  const badge = row.createSpan({ cls: 'dw-key' });
  badge.setText(issue.key);

  if (issue.status.name === 'Blocked') {
    row.createSpan({ cls: 'dw-badge dw-badge-blocked', text: 'Blocked' });
  }

  const summary = row.createSpan({ cls: 'dw-summary' });
  summary.setText(' ' + issue.summary);
  summary.onclick = () => cb.onExpand(issue, row);

  const menuBtn = row.createEl('button', { cls: 'dw-menu-btn', text: '⚙' });
  menuBtn.onclick = (e) => { e.stopPropagation(); cb.onMenu(issue, menuBtn); };

  return row;
}
