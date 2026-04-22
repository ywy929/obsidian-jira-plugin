export interface User {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface Status {
  id: string;
  name: string;
  statusCategory: { key: 'new' | 'indeterminate' | 'done' };
}

export interface Priority {
  id: string;
  name: string;
}

export interface Transition {
  id: string;
  name: string;
  to: Status;
}

export interface Comment {
  id: string;
  author: User;
  body: string;      // plain markdown (we request responseContentFormat=markdown)
  created: string;
  updated: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  content: string;   // download URL
  created: string;
}

export interface Worklog {
  id: string;
  author: User;
  timeSpentSeconds: number;
  comment?: string;
  started: string;
}

export interface SubtaskSummary {
  id: string;
  key: string;
  summary: string;
  status: Status;
  priority?: Priority;
}

export interface Issue {
  id: string;
  key: string;
  summary: string;
  description?: string;                // markdown
  status: Status;
  priority?: Priority;
  assignee?: User;
  duedate?: string;                    // ISO date YYYY-MM-DD
  labels: string[];
  subtasks: SubtaskSummary[];
  comments: Comment[];                 // only populated by getIssue, not search
  attachments: Attachment[];           // only populated by getIssue, not search
  worklogs: Worklog[];                 // only populated by getIssue, not search
  acceptanceCriteria: string[];        // parsed from description; empty if absent
  parent?: { key: string };
  issuetype: { name: string; subtask: boolean };
}

export interface CreateIssueInput {
  projectKey: string;
  issueTypeName: string;    // 'Task', 'Story', 'Sub-task', etc.
  summary: string;
  description?: string;
  parentKey?: string;       // for subtasks
  labels?: string[];
  priority?: string;        // priority name e.g. 'Medium'
  assigneeAccountId?: string;
  duedate?: string;
}

export type FieldPatch = Partial<{
  summary: string;
  description: string;
  priority: { name: string };
  duedate: string | null;
  labels: string[];
}>;

export interface JiraError {
  kind: 'network' | 'auth' | 'permission' | 'ratelimit' | 'notfound' | 'server' | 'unknown';
  status?: number;
  message: string;
  retryAfterSeconds?: number;
}
