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
