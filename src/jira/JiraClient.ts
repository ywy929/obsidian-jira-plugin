import { requestUrl, RequestUrlParam } from 'obsidian';
import { PluginSettings } from '../settings/types';
import { JiraError, User } from './types';

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
        retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : 5,
      };
    }
    if (status >= 500) return { kind: 'server', status, message: `Server error ${status}.` };
    return { kind: 'unknown', status, message: `Unexpected status ${status}.` };
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
}
