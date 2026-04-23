import { Issue } from '../jira/types';

export interface RowCallbacks {
  onToggle: (issue: Issue, checked: boolean) => Promise<void>;
  onExpandToggle: (issue: Issue, expandEl: HTMLElement) => Promise<void>;
  onMenu: (issue: Issue, anchor: HTMLElement) => void;
  onKeyClick: (issue: Issue) => void;
}

export interface RenderedRow {
  rowEl: HTMLElement;
  expansionEl: HTMLElement;
}

export function renderIssueRow(parent: HTMLElement, issue: Issue, cb: RowCallbacks): RenderedRow {
  const wrapper = parent.createDiv({ cls: 'dw-row-wrapper' });
  const row = wrapper.createDiv({ cls: 'dw-row' });
  const checkbox = row.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
  checkbox.checked = issue.status.statusCategory.key === 'done';
  checkbox.onchange = () => cb.onToggle(issue, checkbox.checked);

  const badge = row.createSpan({ cls: 'dw-key dw-clickable' });
  badge.setText(issue.key);
  badge.title = 'Open in Jira';
  badge.onclick = (e) => { e.stopPropagation(); cb.onKeyClick(issue); };

  if (issue.status.name === 'Blocked') {
    row.createSpan({ cls: 'dw-badge dw-badge-blocked', text: 'Blocked' });
  }

  const summary = row.createSpan({ cls: 'dw-summary' });
  summary.setText(' ' + issue.summary);

  const expansion = wrapper.createDiv({ cls: 'dw-expansion' });
  expansion.style.display = 'none';
  let populated = false;

  summary.onclick = async () => {
    if (expansion.style.display === 'none') {
      expansion.style.display = 'block';
      if (!populated) {
        await cb.onExpandToggle(issue, expansion);
        populated = true;
      }
    } else {
      expansion.style.display = 'none';
    }
  };

  const menuBtn = row.createEl('button', { cls: 'dw-menu-btn', text: '⚙' });
  menuBtn.onclick = (e) => { e.stopPropagation(); cb.onMenu(issue, menuBtn); };

  return { rowEl: row, expansionEl: expansion };
}
