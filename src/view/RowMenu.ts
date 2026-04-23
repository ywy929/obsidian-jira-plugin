import { Menu, Notice } from 'obsidian';
import { Issue } from '../jira/types';
import DailyWorkflowPlugin from '../../main';
import { TextPromptModal } from './TextPromptModal';

export function showRowMenu(plugin: DailyWorkflowPlugin, issue: Issue, anchor: HTMLElement): void {
  const menu = new Menu();

  menu.addItem(i => i.setTitle('Assign to me').setIcon('user').onClick(async () => {
    try { await plugin.jira.assignToSelf(issue.key); new Notice(`Assigned ${issue.key} to you.`); }
    catch (e: any) { new Notice(`Assign failed: ${e.message ?? e.kind}`); }
  }));

  menu.addItem(i => i.setTitle('Set due date…').setIcon('calendar').onClick(() => {
    new TextPromptModal(plugin.app, 'Due date (YYYY-MM-DD, empty to clear)', async v => {
      try {
        await plugin.jira.updateIssue(issue.key, { duedate: v.trim() || null });
        new Notice(`Due date updated for ${issue.key}`);
      } catch (e: any) { new Notice(`Failed: ${e.message ?? e.kind}`); }
    }).open();
  }));

  menu.addItem(i => i.setTitle('Set priority…').setIcon('alert-triangle').onClick(() => {
    new TextPromptModal(plugin.app, 'Priority (Highest | High | Medium | Low | Lowest)', async v => {
      try {
        await plugin.jira.updateIssue(issue.key, { priority: { name: v.trim() } });
        new Notice(`Priority updated.`);
      } catch (e: any) { new Notice(`Failed: ${e.message ?? e.kind}`); }
    }).open();
  }));

  menu.addItem(i => i.setTitle('Add/remove label…').setIcon('tag').onClick(() => {
    new TextPromptModal(plugin.app, `Labels (comma-separated, current: ${issue.labels.join(', ') || 'none'})`, async v => {
      try {
        const labels = v.split(',').map(s => s.trim()).filter(Boolean);
        await plugin.jira.updateIssue(issue.key, { labels });
        new Notice(`Labels updated.`);
      } catch (e: any) { new Notice(`Failed: ${e.message ?? e.kind}`); }
    }).open();
  }));

  menu.addItem(i => i.setTitle('Add comment…').setIcon('message-square').onClick(() => {
    new TextPromptModal(plugin.app, 'Comment body', async v => {
      if (!v.trim()) return;
      try {
        await plugin.jira.addComment(issue.key, v);
        new Notice('Comment added.');
      } catch (e: any) { new Notice(`Failed: ${e.message ?? e.kind}`); }
    }, true).open();
  }));

  menu.addItem(i => i.setTitle('Log work…').setIcon('clock').onClick(() => {
    new TextPromptModal(plugin.app, 'Time spent (e.g. 30m, 2h, 1h30m) + optional comment on line 2', async v => {
      const [firstLine, ...rest] = v.split(/\r?\n/);
      const seconds = parseDuration(firstLine.trim());
      if (seconds === null) { new Notice('Could not parse duration.'); return; }
      const comment = rest.join('\n').trim() || undefined;
      try {
        await plugin.jira.logWork(issue.key, seconds, comment);
        new Notice(`Logged ${seconds}s on ${issue.key}`);
      } catch (e: any) { new Notice(`Failed: ${e.message ?? e.kind}`); }
    }, true).open();
  }));

  menu.addItem(i => i.setTitle('Attach file…').setIcon('paperclip').onClick(() => {
    openFilePickerAndAttach(plugin, issue);
  }));

  const rect = anchor.getBoundingClientRect();
  menu.showAtPosition({ x: rect.left, y: rect.bottom });
}

function parseDuration(s: string): number | null {
  const match = /^(\d+)h(?:\s*(\d+)m)?$|^(\d+)m$/.exec(s);
  if (!match) return null;
  if (match[3]) return parseInt(match[3], 10) * 60;
  const h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  return h * 3600 + m * 60;
}

function openFilePickerAndAttach(plugin: DailyWorkflowPlugin, issue: Issue) {
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    try {
      await plugin.jira.attachFile(issue.key, file.name, file.type || 'application/octet-stream', buf);
      new Notice(`Attached ${file.name} to ${issue.key}`);
    } catch (e: any) {
      new Notice(`Attach failed: ${e.message ?? e.kind}`);
    }
  };
  input.click();
}

