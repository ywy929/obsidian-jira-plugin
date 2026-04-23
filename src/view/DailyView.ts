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
            onToggle: async (iss, checked) => { new Notice(`toggle ${iss.key} → ${checked} (Task 16)`); },
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

  private laneNameForProject(projectKey: string): string {
    if (projectKey === 'PROD') return 'Tram';
    if (projectKey === 'SL') return 'Smart Street Light (incl. GIMS)';
    return projectKey;
  }
}
