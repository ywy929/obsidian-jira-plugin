import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import DailyWorkflowPlugin from '../../main';
import { Issue } from '../jira/types';
import { renderIssueRow } from './IssueRow';
import { showRowMenu } from './RowMenu';
import { InterruptModal } from './InterruptModal';
import { TextPromptModal } from './TextPromptModal';

export const VIEW_TYPE_DAILY = 'daily-workflow-view';

interface LaneGroup { lane: string; projectKey: string; issues: Issue[]; }

export class DailyView extends ItemView {
  plugin: DailyWorkflowPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: DailyWorkflowPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_DAILY; }
  getDisplayText(): string { return 'Daily Workflow'; }
  getIcon(): string { return 'checkbox-glyph'; }

  async onOpen() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass('dw-view');

    const header = root.createDiv({ cls: 'dw-header' });
    header.createEl('h3', { text: 'Daily Workflow' });
    const refresh = header.createEl('button', { text: '⟳ Refresh', cls: 'dw-refresh' });
    refresh.onclick = () => this.render();

    const body = root.createDiv({ cls: 'dw-body' });
    body.createEl('p', { text: 'Loading...', cls: 'dw-status' });

    // ensure today's note exists + roll forward
    const sync = this.plugin.getDailyNoteSync();
    await sync.ensureTodayNote();
    try { await sync.rollForwardFromYesterday(); } catch (_) { /* best effort */ }

    await this.render();
  }

  async onClose() {}

  async render() {
    const body = this.containerEl.querySelector('.dw-body') as HTMLElement;
    if (!body) return;
    body.empty();

    if (!this.plugin.settings.apiToken) {
      body.createEl('p', { text: 'Set up Jira credentials in Settings first.', cls: 'dw-status' });
      return;
    }

    body.createEl('p', { text: 'Loading issues...', cls: 'dw-status' });

    try {
      const groups: LaneGroup[] = [];
      for (const pk of this.plugin.settings.projectKeys) {
        const issues = await this.plugin.jira.searchMyIssues(pk);
        groups.push({ lane: this.laneNameForProject(pk), projectKey: pk, issues });
      }

      body.empty();
      for (const g of groups) {
        const section = body.createDiv({ cls: 'dw-lane' });
        section.createEl('h4', { text: g.lane });
        if (g.issues.length === 0) {
          section.createEl('p', { text: '(nothing assigned)', cls: 'dw-empty' });
          continue;
        }
        for (const issue of g.issues) {
          renderIssueRow(section, issue, {
            onToggle: async (iss, checked) => { await this.handleToggle(iss, checked); },
            onExpandToggle: async (iss, expandEl) => { await this.renderExpansion(iss, expandEl); },
            onMenu: (iss, anchor) => showRowMenu(this.plugin, iss, anchor),
          });
        }
      }

      const interruptSection = body.createDiv({ cls: 'dw-lane' });
      interruptSection.createEl('h4', { text: 'Interrupts' });
      const addBtn = interruptSection.createEl('button', { text: '+ Add interrupt', cls: 'dw-add-interrupt' });
      addBtn.onclick = () => {
        new InterruptModal(this.app, this.plugin, this.plugin.settings.projectKeys[0], () => this.render()).open();
      };
    } catch (e: any) {
      body.empty();
      body.createEl('p', { text: `Error: ${e.message ?? e.kind ?? 'unknown'}`, cls: 'dw-error' });
    }
  }

  private async handleToggle(issue: Issue, checked: boolean) {
    const sync = this.plugin.getDailyNoteSync();

    // optimistic markdown write
    try {
      await sync.toggleCheckbox(issue.key, checked);
    } catch (e: any) {
      if (e.kind === 'conflict') {
        new Notice('Daily note changed on disk — click refresh.');
        await this.render();
        return;
      }
      new Notice(`Write failed: ${e.message ?? 'unknown'}`);
      await this.render();
      return;
    }

    // resolve transition id
    try {
      const transitions = await this.plugin.jira.getTransitions(issue.key);
      const target = checked
        ? transitions.find(t => t.to.statusCategory.key === 'done')
        : transitions.find(t => t.to.name === 'In Progress')
          ?? transitions.find(t => t.to.name === 'To Do')
          ?? transitions.find(t => t.to.statusCategory.key !== 'done');

      if (!target) {
        new Notice(`No suitable transition for ${issue.key}`);
        return;
      }
      await this.plugin.jira.transitionIssue(issue.key, target.id);
    } catch (e: any) {
      try {
        await sync.toggleCheckbox(issue.key, !checked);
        new Notice(`Jira transition failed (${e.kind ?? 'error'}) — rolled back.`);
      } catch {
        new Notice(`Jira transition failed AND rollback failed — click Refresh to resync.`);
      }
      await this.render();
    }
  }

  private async renderExpansion(issue: Issue, host: HTMLElement) {
    host.empty();
    host.createEl('p', { text: 'Loading…', cls: 'dw-status' });

    try {
      const full = await this.plugin.jira.getIssue(issue.key);
      host.empty();

      // Acceptance Criteria (read-only)
      if (full.acceptanceCriteria.length > 0) {
        host.createEl('div', { text: 'Acceptance Criteria', cls: 'dw-sub-heading' });
        const ul = host.createEl('ul', { cls: 'dw-ac' });
        for (const ac of full.acceptanceCriteria) ul.createEl('li', { text: ac });
      }

      // Subtasks
      host.createEl('div', { text: 'Subtasks', cls: 'dw-sub-heading' });
      const subList = host.createDiv({ cls: 'dw-subtasks' });
      if (full.subtasks.length === 0) {
        subList.createEl('p', { text: '(none)', cls: 'dw-empty' });
      } else {
        for (const sub of full.subtasks) {
          const subRow = subList.createDiv({ cls: 'dw-subtask-row' });
          const cb = subRow.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
          cb.checked = sub.status.statusCategory.key === 'done';
          cb.onchange = async () => {
            try {
              const transitions = await this.plugin.jira.getTransitions(sub.key);
              const target = cb.checked
                ? transitions.find(t => t.to.statusCategory.key === 'done')
                : transitions.find(t => t.to.statusCategory.key !== 'done');
              if (!target) { new Notice(`No transition for ${sub.key}`); return; }
              await this.plugin.jira.transitionIssue(sub.key, target.id);
              new Notice(`${sub.key} → ${target.to.name}`);
            } catch (e: any) {
              cb.checked = !cb.checked;
              new Notice(`Failed: ${e.message ?? e.kind}`);
            }
          };
          subRow.createSpan({ cls: 'dw-key', text: sub.key });
          subRow.createSpan({ text: ' ' + sub.summary });
        }
      }

      // Add subtask button
      const addBtn = host.createEl('button', { text: '+ Add subtask', cls: 'dw-add-subtask' });
      addBtn.onclick = () => {
        new TextPromptModal(this.app, 'Subtask summary', async (summary) => {
          if (!summary.trim()) return;
          try {
            await this.plugin.jira.createIssue({
              projectKey: issue.key.split('-')[0],
              issueTypeName: 'Sub-task',
              summary,
              parentKey: issue.key,
            });
            new Notice('Subtask created.');
            await this.renderExpansion(issue, host);
          } catch (e: any) { new Notice(`Failed: ${e.message ?? e.kind}`); }
        }).open();
      };

      // Description preview (collapsed by default)
      if (full.description) {
        const descHeading = host.createEl('div', { text: 'Description', cls: 'dw-sub-heading dw-collapsible' });
        const descBody = host.createDiv({ cls: 'dw-desc' });
        descBody.style.display = 'none';
        descBody.setText(full.description);
        descHeading.onclick = () => {
          descBody.style.display = descBody.style.display === 'none' ? 'block' : 'none';
        };
      }
    } catch (e: any) {
      host.empty();
      host.createEl('p', { text: `Error: ${e.message ?? e.kind}`, cls: 'dw-error' });
    }
  }

  private laneNameForProject(projectKey: string): string {
    if (projectKey === 'PROD') return 'Tram';
    if (projectKey === 'SL') return 'Smart Street Light (incl. GIMS)';
    return projectKey;
  }
}

