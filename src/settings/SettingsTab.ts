import { App, PluginSettingTab, Setting } from 'obsidian';
import DailyWorkflowPlugin from '../../main';

export class SettingsTab extends PluginSettingTab {
  plugin: DailyWorkflowPlugin;

  constructor(app: App, plugin: DailyWorkflowPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Daily Workflow Settings' });

    new Setting(containerEl)
      .setName('Jira base URL')
      .setDesc('e.g. getrnd.atlassian.net (no https://, no trailing slash)')
      .addText(t => t
        .setPlaceholder('your-site.atlassian.net')
        .setValue(this.plugin.settings.jiraBaseUrl)
        .onChange(async v => { this.plugin.settings.jiraBaseUrl = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Email')
      .setDesc('Your Atlassian account email')
      .addText(t => t
        .setPlaceholder('me@company.com')
        .setValue(this.plugin.settings.email)
        .onChange(async v => { this.plugin.settings.email = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('API token')
      .setDesc('Generate at id.atlassian.com/manage-profile/security/api-tokens')
      .addText(t => {
        t.inputEl.type = 'password';
        t.setValue(this.plugin.settings.apiToken)
          .onChange(async v => { this.plugin.settings.apiToken = v.trim(); await this.plugin.saveSettings(); });
      });

    new Setting(containerEl)
      .setName('Project keys')
      .setDesc('Comma-separated Jira project keys (e.g. PROD, SL)')
      .addText(t => t
        .setPlaceholder('PROD, SL')
        .setValue(this.plugin.settings.projectKeys.join(', '))
        .onChange(async v => {
          this.plugin.settings.projectKeys = v.split(',').map(s => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Verify connection')
      .setDesc('Test the API token and cache your accountId')
      .addButton(btn => btn
        .setButtonText('Verify')
        .onClick(async () => {
          const ok = await this.plugin.verifyConnection();
          btn.setButtonText(ok ? 'Verified ✓' : 'Failed');
        }));
  }
}
