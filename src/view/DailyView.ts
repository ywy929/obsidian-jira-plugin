import { ItemView, WorkspaceLeaf } from 'obsidian';
import DailyWorkflowPlugin from '../../main';

export const VIEW_TYPE_DAILY = 'daily-workflow-view';

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

    await this.render();
  }

  async onClose() {}

  async render() {
    const body = this.containerEl.querySelector('.dw-body');
    if (!body) return;
    body.empty();
    body.createEl('p', { text: '(DailyView — to be populated in Task 15)' });
  }
}
