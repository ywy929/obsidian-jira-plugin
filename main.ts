import { Plugin, Notice, normalizePath } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './src/settings/types';
import { SettingsTab } from './src/settings/SettingsTab';
import { JiraClient } from './src/jira/JiraClient';
import { DailyView, VIEW_TYPE_DAILY } from './src/view/DailyView';
import { DailyNoteSync, VaultPort } from './src/daily/DailyNoteSync';

export default class DailyWorkflowPlugin extends Plugin {
  settings: PluginSettings;
  jira: JiraClient;

  async onload() {
    await this.loadSettings();
    this.jira = new JiraClient(this.settings);
    this.addSettingTab(new SettingsTab(this.app, this));

    this.registerView(VIEW_TYPE_DAILY, (leaf) => new DailyView(leaf, this));
    this.addCommand({
      id: 'open-daily-workflow',
      name: 'Open Daily Workflow',
      callback: () => this.activateView(),
    });
  }

  async onunload() {}

  async activateView() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_DAILY);
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_DAILY, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.jira = new JiraClient(this.settings);
  }

  buildVaultPort(): VaultPort {
    const vault = this.app.vault;
    return {
      exists: async (p: string) => await vault.adapter.exists(normalizePath(p)),
      read: async (p: string) => await vault.adapter.read(normalizePath(p)),
      write: async (p: string, c: string) => { await vault.adapter.write(normalizePath(p), c); },
      stat: async (p: string) => {
        const s = await vault.adapter.stat(normalizePath(p));
        return s ? { mtime: s.mtime } : null;
      },
      ensureFolder: async (p: string) => {
        const norm = normalizePath(p);
        if (!(await vault.adapter.exists(norm))) {
          await vault.adapter.mkdir(norm);
        }
      },
    };
  }

  buildDailyNoteSync(): DailyNoteSync {
    return new DailyNoteSync(this.buildVaultPort(), this.settings.dailyFolderPath);
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
