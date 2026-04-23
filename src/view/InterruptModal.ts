import { App, Modal, Setting, Notice } from 'obsidian';
import DailyWorkflowPlugin from '../../main';

export class InterruptModal extends Modal {
  summary = '';
  projectKey: string;
  issueType = 'Task';

  constructor(app: App, private plugin: DailyWorkflowPlugin, defaultProject: string, private onDone: () => void) {
    super(app);
    this.projectKey = defaultProject;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Add interrupt (ad-hoc ticket)' });

    new Setting(contentEl).setName('Project').addDropdown(d => {
      for (const pk of this.plugin.settings.projectKeys) d.addOption(pk, pk);
      d.setValue(this.projectKey).onChange(v => this.projectKey = v);
    });

    new Setting(contentEl).setName('Issue type').addDropdown(d => {
      for (const t of ['Task', 'Bug', 'Story']) d.addOption(t, t);
      d.setValue(this.issueType).onChange(v => this.issueType = v);
    });

    new Setting(contentEl).setName('Summary').addTextArea(t => t.onChange(v => this.summary = v));

    new Setting(contentEl)
      .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(b => b.setCta().setButtonText('Create').onClick(async () => {
        if (!this.summary.trim()) { new Notice('Summary required.'); return; }
        try {
          const issue = await this.plugin.jira.createIssue({
            projectKey: this.projectKey,
            issueTypeName: this.issueType,
            summary: this.summary.trim(),
            labels: ['adhoc'],
            assigneeAccountId: this.plugin.settings.selfAccountId,
          });

          const sync = this.plugin.getDailyNoteSync();
          await sync.appendInterrupt(issue.key);

          new Notice(`Created ${issue.key}`);
          this.close();
          this.onDone();
        } catch (e: any) {
          new Notice(`Failed: ${e.message ?? e.kind}`);
        }
      }));
  }

  onClose() { this.contentEl.empty(); }
}
