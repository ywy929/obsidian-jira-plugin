import { App, Modal, Setting, Notice } from 'obsidian';
import DailyWorkflowPlugin from '../../main';

export class NewTaskModal extends Modal {
  summary = '';
  projectKey: string;
  issueType: 'Story' | 'Bug' | 'Spike' = 'Story';
  duedate = '';
  addToSprint = true;

  constructor(app: App, private plugin: DailyWorkflowPlugin, defaultProject: string, private onDone: () => void) {
    super(app);
    this.projectKey = defaultProject;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Create new task (assigned to you)' });

    new Setting(contentEl).setName('Project').addDropdown(d => {
      for (const pk of this.plugin.settings.projectKeys) d.addOption(pk, pk);
      d.setValue(this.projectKey).onChange(v => this.projectKey = v);
    });

    new Setting(contentEl).setName('Type').addDropdown(d => {
      for (const t of ['Story', 'Bug', 'Spike']) d.addOption(t, t);
      d.setValue(this.issueType).onChange(v => this.issueType = v as 'Story' | 'Bug' | 'Spike');
    });

    new Setting(contentEl).setName('Summary').addTextArea(t => t.onChange(v => this.summary = v));

    new Setting(contentEl).setName('Due date').setDesc('YYYY-MM-DD, optional').addText(t => {
      t.setPlaceholder('2026-05-15').onChange(v => this.duedate = v);
    });

    new Setting(contentEl)
      .setName('Add to current sprint')
      .setDesc('Otherwise it lands in backlog and won\'t appear in this view')
      .addToggle(t => t.setValue(this.addToSprint).onChange(v => this.addToSprint = v));

    new Setting(contentEl)
      .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(b => b.setCta().setButtonText('Create').onClick(async () => {
        const summary = this.summary.trim();
        if (!summary) { new Notice('Summary required.'); return; }
        if (this.duedate && !/^\d{4}-\d{2}-\d{2}$/.test(this.duedate.trim())) {
          new Notice('Due date must be YYYY-MM-DD or empty.');
          return;
        }

        try {
          const issue = await this.plugin.jira.createIssue({
            projectKey: this.projectKey,
            issueTypeName: this.issueType,
            summary,
            assigneeAccountId: this.plugin.settings.selfAccountId,
            duedate: this.duedate.trim() || undefined,
          });
          new Notice(`Created ${issue.key}`);

          if (this.addToSprint) {
            const sprint = await this.plugin.jira.getActiveSprint(this.projectKey);
            if (!sprint) {
              new Notice(`${issue.key} created but no active sprint — stayed in backlog.`);
            } else {
              try {
                await this.plugin.jira.addIssueToSprint(sprint.id, issue.key);
                new Notice(`${issue.key} added to sprint "${sprint.name}".`);
              } catch (e: any) {
                new Notice(`${issue.key} created but sprint add failed: ${e.message ?? e.kind}`);
              }
            }
          }

          this.close();
          this.onDone();
        } catch (e: any) {
          new Notice(`Failed: ${e.message ?? e.kind}`);
        }
      }));
  }

  onClose() { this.contentEl.empty(); }
}
