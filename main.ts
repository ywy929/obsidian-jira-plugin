import { Plugin, Notice } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './src/settings/types';
import { SettingsTab } from './src/settings/SettingsTab';
import { JiraClient } from './src/jira/JiraClient';

export default class DailyWorkflowPlugin extends Plugin {
  settings: PluginSettings;
  jira: JiraClient;

  async onload() {
    await this.loadSettings();
    this.jira = new JiraClient(this.settings);
    this.addSettingTab(new SettingsTab(this.app, this));
  }

  async onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.jira = new JiraClient(this.settings);
  }

  async verifyConnection(): Promise<boolean> {
    try {
      const me = await this.jira.getMyself();
      this.settings.selfAccountId = me.accountId;
      await this.saveSettings();
      new Notice(`Connected as ${me.displayName}`);
      return true;
    } catch (e: any) {
      new Notice(`Jira connection failed: ${e.message ?? 'unknown error'}`);
      return false;
    }
  }
}
