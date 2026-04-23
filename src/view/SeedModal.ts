import { App, Modal, Setting, Notice, normalizePath } from 'obsidian';
import DailyWorkflowPlugin from '../../main';
import { parseTasksOnHand, laneForProject, TasksOnHandItem } from '../daily/tasksOnHandParser';

export class SeedModal extends Modal {
  items: (TasksOnHandItem & { selected: boolean })[] = [];
  loading = true;
  errorMsg = '';

  constructor(app: App, private plugin: DailyWorkflowPlugin, private onDone: () => void) {
    super(app);
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Seed today from tasks-on-hand' });
    contentEl.createEl('p', {
      text: 'Tick the items to add to today\'s Today section. Status "Done" is excluded. Items are added as unchecked `[ ]` under the lane that matches the Project column.',
      cls: 'dw-seed-desc',
    });
    const bodyEl = contentEl.createDiv({ cls: 'dw-seed-body' });
    bodyEl.createEl('p', { text: 'Loading…', cls: 'dw-status' });

    try {
      const path = normalizePath(this.plugin.settings.tasksOnHandPath);
      const exists = await this.plugin.app.vault.adapter.exists(path);
      if (!exists) {
        this.errorMsg = `File not found: ${path}`;
        this.showError(bodyEl);
        return;
      }
      const content = await this.plugin.app.vault.adapter.read(path);
      const rows = parseTasksOnHand(content, this.plugin.settings.tasksOnHandOwnerHeading)
        .filter(i => i.status.trim().toLowerCase() !== 'done');

      this.items = rows.map(r => ({ ...r, selected: r.status.trim().toLowerCase() !== 'ongoing' }));
      this.loading = false;
      this.renderList(bodyEl);
    } catch (e: any) {
      this.errorMsg = `Parse error: ${e?.message ?? 'unknown'}`;
      this.showError(bodyEl);
    }

    new Setting(contentEl)
      .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(b => b.setCta().setButtonText('Seed').onClick(async () => {
        const picked = this.items.filter(i => i.selected);
        if (picked.length === 0) { new Notice('Nothing selected.'); return; }
        const sync = this.plugin.getDailyNoteSync();
        try {
          const result = await sync.seedToday(picked.map(i => ({
            lane: laneForProject(i.project),
            text: i.task,
          })));
          const tail = result.skipped > 0 ? ` (${result.skipped} already present, skipped)` : '';
          new Notice(`Seeded ${result.added} item(s) into today's note.${tail}`);
          this.close();
          this.onDone();
        } catch (e: any) {
          new Notice(`Seed failed: ${e?.message ?? e?.kind ?? 'unknown'}`);
        }
      }));
  }

  private showError(host: HTMLElement) {
    host.empty();
    host.createEl('p', { text: this.errorMsg, cls: 'dw-error' });
    host.createEl('p', {
      text: `Expected path: ${this.plugin.settings.tasksOnHandPath}  |  Owner heading: ${this.plugin.settings.tasksOnHandOwnerHeading}`,
      cls: 'dw-status',
    });
    host.createEl('p', { text: 'Adjust in Settings → Daily Workflow.', cls: 'dw-status' });
  }

  private renderList(host: HTMLElement) {
    host.empty();
    if (this.items.length === 0) {
      host.createEl('p', { text: 'No open tasks found for this owner heading.', cls: 'dw-status' });
      return;
    }
    for (const item of this.items) {
      const row = host.createDiv({ cls: 'dw-seed-row' });
      const cb = row.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
      cb.checked = item.selected;
      cb.onchange = () => { item.selected = cb.checked; };
      const lane = laneForProject(item.project);
      const meta = row.createSpan({ cls: 'dw-seed-meta' });
      meta.setText(`[${lane}] `);
      const statusSpan = row.createSpan({ cls: 'dw-seed-status' });
      statusSpan.setText(`(${item.status}) `);
      const taskSpan = row.createSpan({ cls: 'dw-seed-task' });
      taskSpan.setText(item.task);
    }
  }

  onClose() { this.contentEl.empty(); }
}
