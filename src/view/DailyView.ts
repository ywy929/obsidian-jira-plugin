import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import DailyWorkflowPlugin from '../../main';
import { Issue } from '../jira/types';
import { renderIssueRow } from './IssueRow';

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
    const title = header.createEl('h3', { text: 'Daily Workflow' });
    const refresh = header.createEl('button', { text: '⟳ Refresh', cls: 'dw-refresh' });
    refresh.onclick = () => this.render();

    const body = root.createDiv({ cls: 'dw-body' });
    body.createEl('p', { text: 'Loading...', cls: 'dw-status' });

    // ensure today's note exists + roll forward
    const sync = this.plugin.buildDailyNoteSync();
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
            onExpand: async (iss, rowEl) => { new Notice(`expand ${iss.key} (Task 19)`); },
            onMenu: (iss, anchor) => { new Notice(`menu ${iss.key} (Task 17)`); },
          });
        }
      }
    } catch (e: any) {
      body.empty();
      body.createEl('p', { text: `Error: ${e.message ?? e.kind ?? 'unknown'}`, cls: 'dw-error' });
    }
  }

  private async handleToggle(issue: Issue, checked: boolean) {
    const sync = this.plugin.buildDailyNoteSync();

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
      // rollback markdown
      await sync.toggleCheckbox(issue.key, !checked);
      new Notice(`Jira transition failed (${e.kind ?? 'error'}) — rolled back.`);
      await this.render();
    }
  }

  private laneNameForProject(projectKey: string): string {
    if (projectKey === 'PROD') return 'Tram';
    if (projectKey === 'SL') return 'Smart Street Light (incl. GIMS)';
    return projectKey;
  }
}
