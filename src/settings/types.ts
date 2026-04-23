export interface PluginSettings {
  jiraBaseUrl: string;       // e.g. "getrnd.atlassian.net"
  email: string;
  apiToken: string;
  projectKeys: string[];     // ['PROD', 'SL']
  selfAccountId?: string;    // populated on first successful API call
  dailyFolderPath: string;   // "daily" — relative to vault root
  dailyNoteTemplate?: string;  // override; uses built-in template if missing
  tasksOnHandPath: string;   // vault-relative path to tasks-on-hand.md
  tasksOnHandOwnerHeading: string;  // e.g. "Yeow (Senior)" — which section to parse
}

export const DEFAULT_SETTINGS: PluginSettings = {
  jiraBaseUrl: 'getrnd.atlassian.net',
  email: '',
  apiToken: '',
  projectKeys: ['PROD', 'SL'],
  dailyFolderPath: 'daily',
  tasksOnHandPath: 'team/tasks-on-hand.md',
  tasksOnHandOwnerHeading: 'Yeow (Senior)',
};
