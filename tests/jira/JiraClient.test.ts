import { JiraClient } from '../../src/jira/JiraClient';
import { PluginSettings } from '../../src/settings/types';
import { requestUrl } from 'obsidian';

const mockedRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

const baseSettings: PluginSettings = {
  jiraBaseUrl: 'example.atlassian.net',
  email: 'me@example.com',
  apiToken: 'tok123',
  projectKeys: ['PROD'],
  dailyFolderPath: 'daily',
};

describe('JiraClient base request', () => {
  beforeEach(() => mockedRequestUrl.mockReset());

  it('sends Basic auth header with base64(email:token)', async () => {
    mockedRequestUrl.mockResolvedValueOnce({
      status: 200,
      json: { accountId: 'abc', displayName: 'Me' },
    } as any);

    const client = new JiraClient(baseSettings);
    await client.getMyself();

    const expectedAuth = 'Basic ' + Buffer.from('me@example.com:tok123').toString('base64');
    expect(mockedRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.atlassian.net/rest/api/3/myself',
      method: 'GET',
      headers: expect.objectContaining({ Authorization: expectedAuth, Accept: 'application/json' }),
    }));
  });

  it('classifies 401 as auth error', async () => {
    mockedRequestUrl.mockResolvedValueOnce({ status: 401, json: {} } as any);
    const client = new JiraClient(baseSettings);
    await expect(client.getMyself()).rejects.toMatchObject({ kind: 'auth', status: 401 });
  });

  it('classifies 403 as permission error', async () => {
    mockedRequestUrl.mockResolvedValueOnce({ status: 403, json: {} } as any);
    const client = new JiraClient(baseSettings);
    await expect(client.getMyself()).rejects.toMatchObject({ kind: 'permission', status: 403 });
  });

  it('classifies 404 as notfound error', async () => {
    mockedRequestUrl.mockResolvedValueOnce({ status: 404, json: {} } as any);
    const client = new JiraClient(baseSettings);
    await expect(client.getMyself()).rejects.toMatchObject({ kind: 'notfound', status: 404 });
  });

  it('classifies 429 as ratelimit and parses Retry-After', async () => {
    jest.useFakeTimers();
    mockedRequestUrl.mockResolvedValueOnce({
      status: 429,
      headers: { 'retry-after': '12' },
      json: {},
    } as any);
    const client = new JiraClient(baseSettings);
    const promise = client.getMyself();
    const assertion = expect(promise).rejects.toMatchObject({
      kind: 'ratelimit',
      status: 429,
      retryAfterSeconds: 12,
    });
    await jest.advanceTimersByTimeAsync(13000);
    await assertion;
    jest.useRealTimers();
  });

  it('classifies 5xx as server error', async () => {
    mockedRequestUrl.mockResolvedValueOnce({ status: 503, json: {} } as any);
    const client = new JiraClient(baseSettings);
    await expect(client.getMyself()).rejects.toMatchObject({ kind: 'server', status: 503 });
  });

  it('classifies thrown errors as network', async () => {
    mockedRequestUrl.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const client = new JiraClient(baseSettings);
    await expect(client.getMyself()).rejects.toMatchObject({ kind: 'network' });
  });

  it('retries once on 429 after Retry-After wait', async () => {
    jest.useFakeTimers();
    mockedRequestUrl
      .mockResolvedValueOnce({ status: 429, headers: { 'retry-after': '1' }, json: {} } as any)
      .mockResolvedValueOnce({ status: 200, json: { accountId: 'abc' } } as any);

    const client = new JiraClient(baseSettings);
    const promise = client.getMyself();
    await jest.advanceTimersByTimeAsync(1500);
    const result = await promise;

    expect(result.accountId).toBe('abc');
    expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});

describe('JiraClient.searchMyIssues', () => {
  beforeEach(() => mockedRequestUrl.mockReset());

  it('sends JQL for assigned-to-me in open sprint of given project', async () => {
    mockedRequestUrl.mockResolvedValueOnce({
      status: 200,
      json: {
        issues: [{
          id: '1', key: 'PROD-1',
          fields: {
            summary: 'Test', status: { id: '1', name: 'In Progress', statusCategory: { key: 'indeterminate' } },
            priority: { id: '3', name: 'Medium' },
            assignee: { accountId: 'abc', displayName: 'Me' },
            labels: [], subtasks: [], issuetype: { name: 'Task', subtask: false },
          },
        }],
        isLast: true,
      },
    } as any);

    const settings = { ...baseSettings, selfAccountId: 'abc' };
    const client = new JiraClient(settings);
    const issues = await client.searchMyIssues('PROD');

    expect(issues).toHaveLength(1);
    expect(issues[0].key).toBe('PROD-1');

    const callArgs = mockedRequestUrl.mock.calls[0][0];
    expect(callArgs.method).toBe('POST');
    expect(callArgs.url).toContain('/rest/api/3/search/jql');
    const body = JSON.parse(callArgs.body as string);
    expect(body.jql).toContain('project = PROD');
    expect(body.jql).toContain('assignee = currentUser()');
    expect(body.jql).toContain('sprint in openSprints()');
  });
});

describe('JiraClient.getIssue', () => {
  beforeEach(() => mockedRequestUrl.mockReset());

  it('fetches an issue with markdown description and populates acceptanceCriteria', async () => {
    mockedRequestUrl.mockResolvedValueOnce({
      status: 200,
      json: {
        id: '1', key: 'SL-5',
        fields: {
          summary: 'Finalise arch',
          description: '**Acceptance Criteria**\n\n* one\n* two',
          status: { id: '1', name: 'Blocked', statusCategory: { key: 'indeterminate' } },
          labels: [], subtasks: [], issuetype: { name: 'Story', subtask: false },
          comment: { comments: [] },
          attachment: [],
          worklog: { worklogs: [] },
        },
      },
    } as any);

    const client = new JiraClient(baseSettings);
    const issue = await client.getIssue('SL-5');

    expect(issue.acceptanceCriteria).toEqual(['one', 'two']);
    expect(issue.summary).toBe('Finalise arch');

    const callArgs = mockedRequestUrl.mock.calls[0][0];
    expect(callArgs.url).toContain('/rest/api/3/issue/SL-5');
    expect(callArgs.url).toContain('expand=renderedFields');
  });

  it('returns empty acceptanceCriteria when description has no AC heading', async () => {
    mockedRequestUrl.mockResolvedValueOnce({
      status: 200,
      json: {
        id: '1', key: 'SL-1',
        fields: {
          summary: 'Whatever', description: 'Just text, no AC heading.',
          status: { id: '1', name: 'To Do', statusCategory: { key: 'new' } },
          labels: [], subtasks: [], issuetype: { name: 'Task', subtask: false },
          comment: { comments: [] }, attachment: [], worklog: { worklogs: [] },
        },
      },
    } as any);

    const client = new JiraClient(baseSettings);
    const issue = await client.getIssue('SL-1');
    expect(issue.acceptanceCriteria).toEqual([]);
  });
});

describe('JiraClient transitions', () => {
  beforeEach(() => mockedRequestUrl.mockReset());

  it('fetches transitions for an issue', async () => {
    mockedRequestUrl.mockResolvedValueOnce({
      status: 200,
      json: {
        transitions: [
          { id: '11', name: 'In Progress', to: { id: '1', name: 'In Progress', statusCategory: { key: 'indeterminate' } } },
          { id: '31', name: 'Done', to: { id: '2', name: 'Done', statusCategory: { key: 'done' } } },
        ],
      },
    } as any);

    const client = new JiraClient(baseSettings);
    const transitions = await client.getTransitions('PROD-1');
    expect(transitions).toHaveLength(2);
    expect(transitions[1].name).toBe('Done');
  });

  it('caches transitions per-project (second call to same project hits no API)', async () => {
    // first call
    mockedRequestUrl.mockResolvedValueOnce({
      status: 200,
      json: { transitions: [{ id: '31', name: 'Done', to: { id: '2', name: 'Done', statusCategory: { key: 'done' } } }] },
    } as any);

    const client = new JiraClient(baseSettings);
    await client.getTransitions('PROD-1');
    await client.getTransitions('PROD-2');  // same project, should be cached

    expect(mockedRequestUrl).toHaveBeenCalledTimes(1);
  });

  it('transitionIssue POSTs the transition id', async () => {
    mockedRequestUrl.mockResolvedValueOnce({ status: 204, json: {} } as any);

    const client = new JiraClient(baseSettings);
    await client.transitionIssue('PROD-1', '31');

    const callArgs = mockedRequestUrl.mock.calls[0][0];
    expect(callArgs.method).toBe('POST');
    expect(callArgs.url).toContain('/rest/api/3/issue/PROD-1/transitions');
    const body = JSON.parse(callArgs.body as string);
    expect(body.transition.id).toBe('31');
  });
});

describe('JiraClient write ops', () => {
  beforeEach(() => mockedRequestUrl.mockReset());

  it('createIssue POSTs fields payload and returns id + key', async () => {
    mockedRequestUrl.mockResolvedValueOnce({
      status: 201,
      json: { id: '99', key: 'PROD-99', self: 'https://example.atlassian.net/rest/api/3/issue/99' },
    } as any);

    const client = new JiraClient(baseSettings);
    const result = await client.createIssue({
      projectKey: 'PROD',
      issueTypeName: 'Task',
      summary: 'New',
      labels: ['adhoc'],
    });

    expect(result.key).toBe('PROD-99');
    expect(result.id).toBe('99');
    const body = JSON.parse(mockedRequestUrl.mock.calls[0][0].body as string);
    expect(body.fields.project.key).toBe('PROD');
    expect(body.fields.issuetype.name).toBe('Task');
    expect(body.fields.labels).toEqual(['adhoc']);
  });

  it('createIssue includes parent when creating subtask', async () => {
    mockedRequestUrl.mockResolvedValueOnce({
      status: 201,
      json: { id: '100', key: 'PROD-100', self: 'https://example.atlassian.net/rest/api/3/issue/100' },
    } as any);

    const client = new JiraClient(baseSettings);
    await client.createIssue({
      projectKey: 'PROD',
      issueTypeName: 'Sub-task',
      summary: 'Sub',
      parentKey: 'PROD-1',
    });

    const body = JSON.parse(mockedRequestUrl.mock.calls[0][0].body as string);
    expect(body.fields.parent.key).toBe('PROD-1');
  });

  it('updateIssue PUTs the field patch', async () => {
    mockedRequestUrl.mockResolvedValueOnce({ status: 204, json: {} } as any);

    const client = new JiraClient(baseSettings);
    await client.updateIssue('PROD-1', { summary: 'Renamed', priority: { name: 'High' } });

    const callArgs = mockedRequestUrl.mock.calls[0][0];
    expect(callArgs.method).toBe('PUT');
    expect(callArgs.url).toContain('/rest/api/3/issue/PROD-1');
    const body = JSON.parse(callArgs.body as string);
    expect(body.fields.summary).toBe('Renamed');
    expect(body.fields.priority.name).toBe('High');
  });

  it('assignToSelf PUTs accountId from settings', async () => {
    mockedRequestUrl.mockResolvedValueOnce({ status: 204, json: {} } as any);

    const settings = { ...baseSettings, selfAccountId: 'abc-123' };
    const client = new JiraClient(settings);
    await client.assignToSelf('PROD-1');

    const callArgs = mockedRequestUrl.mock.calls[0][0];
    expect(callArgs.method).toBe('PUT');
    expect(callArgs.url).toContain('/rest/api/3/issue/PROD-1/assignee');
    const body = JSON.parse(callArgs.body as string);
    expect(body.accountId).toBe('abc-123');
  });

  it('addComment POSTs body and returns mapped comment', async () => {
    mockedRequestUrl.mockResolvedValueOnce({
      status: 201,
      json: {
        id: 'c1', author: { accountId: 'abc', displayName: 'Me' },
        body: 'Hello', created: '2026-04-22T10:00:00.000+0000', updated: '2026-04-22T10:00:00.000+0000',
      },
    } as any);

    const client = new JiraClient(baseSettings);
    const comment = await client.addComment('PROD-1', 'Hello');
    expect(comment.body).toBe('Hello');
    const body = JSON.parse(mockedRequestUrl.mock.calls[0][0].body as string);
    expect(body.body.type).toBe('doc');
    expect(body.body.content[0].content[0].text).toBe('Hello');
  });

  it('logWork POSTs worklog payload with timeSpentSeconds', async () => {
    mockedRequestUrl.mockResolvedValueOnce({
      status: 201,
      json: {
        id: 'w1', author: { accountId: 'abc', displayName: 'Me' },
        timeSpentSeconds: 1800, comment: 'pairing',
        started: '2026-04-22T10:00:00.000+0000',
      },
    } as any);

    const client = new JiraClient(baseSettings);
    const wl = await client.logWork('PROD-1', 1800, 'pairing');
    expect(wl.timeSpentSeconds).toBe(1800);
    const body = JSON.parse(mockedRequestUrl.mock.calls[0][0].body as string);
    expect(body.timeSpentSeconds).toBe(1800);
    expect(body.comment.type).toBe('doc');
    expect(body.comment.content[0].content[0].text).toBe('pairing');
  });

  it('attachFile sends multipart with X-Atlassian-Token no-check', async () => {
    mockedRequestUrl.mockResolvedValueOnce({
      status: 200,
      json: [{ id: 'a1', filename: 'x.pdf', mimeType: 'application/pdf', size: 100, content: 'http://...', created: '2026-04-22' }],
    } as any);

    const client = new JiraClient(baseSettings);
    const buf = new ArrayBuffer(100);
    const att = await client.attachFile('PROD-1', 'x.pdf', 'application/pdf', buf);
    expect(att.filename).toBe('x.pdf');

    const callArgs = mockedRequestUrl.mock.calls[0][0];
    expect(callArgs.headers['X-Atlassian-Token']).toBe('no-check');
    expect(callArgs.headers['Content-Type']).toContain('multipart/form-data');
  });
});
