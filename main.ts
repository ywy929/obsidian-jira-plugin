import { Plugin } from 'obsidian';

export default class DailyWorkflowPlugin extends Plugin {
  async onload() {
    console.log('Daily Workflow plugin loaded.');
  }

  async onunload() {
    console.log('Daily Workflow plugin unloaded.');
  }
}
