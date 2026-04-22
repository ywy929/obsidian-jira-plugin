import { requestUrl, RequestUrlParam } from 'obsidian';
import { PluginSettings } from '../settings/types';
import { JiraError, User, Issue, Transition, Comment, Attachment, Worklog, CreateIssueInput, FieldPatch } from './types';
import { parseAcceptanceCriteria } from './ac-parser';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  contentType?: string;
  rawBody?: ArrayBuffer;
  noRetry?: boolean;
};

export class JiraClient {
  private transitionCache = new Map<string, Transition[]>();

  constructor(private settings: PluginSettings) {}

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.settings.email}:${this.settings.apiToken}`).toString('base64');
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const base = `https://${this.settings.jiraBaseUrl}${path}`;
    if (!query) return base;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  private classify(status: number, retryAfter?: string): JiraError {
    if (status === 401) return { kind: 'auth', status, message: 'Jira authentication failed.' };
    if (status === 403) return { kind: 'permission', status, message: 'Permission denied.' };
    if (status === 404) return { kind: 'notfound', status, message: 'Not found.' };
    if (status === 429) {
      return {
        kind: 'ratelimit',
        status,
        message: 'Rate limited.',
        retryAfterSeconds: this.parseRetryAfter(retryAfter),
      };
    }
    if (status >= 500) return { kind: 'server', status, message: `Server error ${status}.` };
    return { kind: 'unknown', status, message: `Unexpected status ${status}.` };
  }

  private parseRetryAfter(v?: string): number {
    if (!v) return 5;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 5;
  }

  async request<T = any>(opts: RequestOptions): Promise<T> {
    const url = this.buildUrl(opts.path, opts.query);
    const isMultipart = !!opts.rawBody;

    const params: RequestUrlParam = {
      url,
      method: opts.method ?? 'GET',
      headers: {
        Authorization: this.authHeader(),
        Accept: 'application/json',
        ...(isMultipart
          ? { 'X-Atlassian-Token': 'no-check', 'Content-Type': opts.contentType ?? 'application/octet-stream' }
          : opts.body !== undefined
            ? { 'Content-Type': 'application/json' }
            : {}),
      },
      throw: false,
    };

    if (isMultipart && opts.rawBody) {
      (params as any).body = opts.rawBody;
    } else if (opts.body !== undefined) {
      params.body = JSON.stringify(opts.body);
    }

    let response;
    try {
      response = await requestUrl(params);
    } catch (e) {
      throw { kind: 'network', message: (e as Error).message } as JiraError;
    }

    if (response.status >= 200 && response.status < 300) {
      return (response.json ?? {}) as T;
    }

    const retryAfter = (response as any).headers?.['retry-after'];
    const err = this.classify(response.status, retryAfter);

    // one-shot retry on rate limit
    if (err.kind === 'ratelimit' && !opts.noRetry) {
      await new Promise(r => setTimeout(r, (err.retryAfterSeconds ?? 5) * 1000));
      try {
        return await this.request<T>({ ...opts, noRetry: true });
      } catch (_retryErr) {
        throw err; // re-throw original ratelimit error if retry also fails
      }
    }

    throw err;
  }

  async getMyself(): Promise<User> {
    const raw = await this.request<any>({ path: '/rest/api/3/myself' });
    return {
      accountId: raw.accountId,
      displayName: raw.displayName,
      emailAddress: raw.emailAddress,
    };
  }

  private mapIssue(raw: any): Issue {
    const fields = raw.fields ?? {};
    const description = fields.description ?? undefined;

    return {
      id: raw.id,
      key: raw.key,
      summary: fields.summary ?? '',
      description,
      status: fields.status,
      priority: fields.priority,
      assignee: fields.assignee,
      duedate: fields.duedate ?? undefined,
      labels: fields.labels ?? [],
      subtasks: (fields.subtasks ?? []).map((s: any) => ({
        id: s.id, key: s.key, summary: s.fields?.summary ?? '',
        status: s.fields?.status, priority: s.fields?.priority,
      })),
      comments: (fields.comment?.comments ?? []).map((c: any) => ({
        id: c.id, author: c.author, body: c.body, created: c.created, updated: c.updated,
      })),
      attachments: (fields.attachment ?? []).map((a: any) => ({
        id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size,
        content: a.content, created: a.created,
      })),
      worklogs: (fields.worklog?.worklogs ?? []).map((w: any) => ({
        id: w.id, author: w.author, timeSpentSeconds: w.timeSpentSeconds,
        comment: w.comment, started: w.started,
      })),
      acceptanceCriteria: parseAcceptanceCriteria(description),
      parent: fields.parent ? { key: fields.parent.key } : undefined,
      issuetype: { name: fields.issuetype?.name ?? 'Task', subtask: !!fields.issuetype?.subtask },
    };
  }

  async searchMyIssues(projectKey: string): Promise<Issue[]> {
    const jql = `project = ${projectKey} AND assignee = currentUser() AND sprint in openSprints() ORDER BY status, priority DESC`;
    const raw = await this.request<any>({
      method: 'POST',
      path: '/rest/api/3/search/jql',
      body: {
        jql,
        fields: ['summary', 'status', 'priority', 'assignee', 'duedate', 'labels', 'subtasks', 'issuetype', 'parent'],
        maxResults: 100,
      },
    });
    return (raw.issues ?? []).map((i: any) => this.mapIssue(i));
  }

  async getIssue(key: string): Promise<Issue> {
    const raw = await this.request<any>({
      path: `/rest/api/3/issue/${encodeURIComponent(key)}`,
      query: { expand: 'renderedFields', fields: '*all' },
    });
    return this.mapIssue(raw);
  }

  async getTransitions(issueKey: string): Promise<Transition[]> {
    const projectKey = issueKey.split('-')[0];
    const cached = this.transitionCache.get(projectKey);
    if (cached) return cached;

    const raw = await this.request<any>({
      path: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    });
    const transitions: Transition[] = (raw.transitions ?? []).map((t: any) => ({
      id: t.id, name: t.name, to: t.to,
    }));
    this.transitionCache.set(projectKey, transitions);
    return transitions;
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.request<void>({
      method: 'POST',
      path: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      body: { transition: { id: transitionId } },
    });
  }

  async createIssue(input: CreateIssueInput): Promise<{ id: string; key: string }> {
    const fields: any = {
      project: { key: input.projectKey },
      issuetype: { name: input.issueTypeName },
      summary: input.summary,
    };
    if (input.description) fields.description = input.description;
    if (input.parentKey) fields.parent = { key: input.parentKey };
    if (input.labels) fields.labels = input.labels;
    if (input.priority) fields.priority = { name: input.priority };
    if (input.assigneeAccountId) fields.assignee = { accountId: input.assigneeAccountId };
    if (input.duedate) fields.duedate = input.duedate;

    const raw = await this.request<{ id: string; key: string }>({
      method: 'POST',
      path: '/rest/api/3/issue',
      body: { fields },
    });
    return { id: raw.id, key: raw.key };
  }

  async updateIssue(key: string, patch: FieldPatch): Promise<void> {
    await this.request<void>({
      method: 'PUT',
      path: `/rest/api/3/issue/${encodeURIComponent(key)}`,
      body: { fields: patch },
    });
  }

  async assignToSelf(key: string): Promise<void> {
    if (!this.settings.selfAccountId) throw { kind: 'unknown', message: 'selfAccountId not set; call getMyself first.' } as JiraError;
    await this.request<void>({
      method: 'PUT',
      path: `/rest/api/3/issue/${encodeURIComponent(key)}/assignee`,
      body: { accountId: this.settings.selfAccountId },
    });
  }

  async addComment(key: string, body: string): Promise<Comment> {
    const adfBody = {
      version: 1,
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }],
    };
    const raw = await this.request<any>({
      method: 'POST',
      path: `/rest/api/3/issue/${encodeURIComponent(key)}/comment`,
      body: { body: adfBody },
    });
    return {
      id: raw.id, author: raw.author, body,
      created: raw.created, updated: raw.updated,
    };
  }

  async logWork(key: string, seconds: number, comment?: string): Promise<Worklog> {
    if (seconds <= 0) throw { kind: 'unknown', message: 'logWork: seconds must be > 0' } as JiraError;
    const body: any = { timeSpentSeconds: seconds };
    if (comment) {
      body.comment = {
        version: 1,
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }],
      };
    }
    const raw = await this.request<any>({
      method: 'POST',
      path: `/rest/api/3/issue/${encodeURIComponent(key)}/worklog`,
      body,
    });
    return {
      id: raw.id, author: raw.author, timeSpentSeconds: raw.timeSpentSeconds,
      comment: comment ?? undefined, started: raw.started,
    };
  }

  async attachFile(key: string, filename: string, mimeType: string, fileBytes: ArrayBuffer): Promise<Attachment> {
    const boundary = '----ObsidianBoundary' + Date.now();
    const encoder = new TextEncoder();
    const head = encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const tail = encoder.encode(`\r\n--${boundary}--\r\n`);

    const combined = new Uint8Array(head.byteLength + fileBytes.byteLength + tail.byteLength);
    combined.set(head, 0);
    combined.set(new Uint8Array(fileBytes), head.byteLength);
    combined.set(tail, head.byteLength + fileBytes.byteLength);

    const raw = await this.request<any[]>({
      method: 'POST',
      path: `/rest/api/3/issue/${encodeURIComponent(key)}/attachments`,
      rawBody: combined.buffer,
      contentType: `multipart/form-data; boundary=${boundary}`,
    });
    const first = raw[0];
    return {
      id: first.id, filename: first.filename, mimeType: first.mimeType,
      size: first.size, content: first.content, created: first.created,
    };
  }
}
