import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboard } from '../server/dashboard.mjs';
import { GitHubError } from '../server/github.mjs';

function harness(fetchPullRequests) {
  let clock = Date.parse('2026-01-01T00:00:00Z');
  return {
    dashboard: createDashboard({ username: 'octocat', refreshSeconds: 60, pageSeconds: 15, staleDays: 7,
      fetchPullRequests, now: () => clock }),
    advance(ms) { clock += ms; },
    now() { return clock; },
  };
}

const result = { pullRequests: [{ id: 'one' }], rateLimit: { remaining: 4999, resetAt: '2026-01-01T01:00:00Z' } };

test('fetches lazily and shares cache across viewers', async () => {
  let calls = 0;
  const { dashboard, advance } = harness(async () => { calls += 1; return result; });
  const first = await dashboard.getSnapshot();
  assert.equal(first.username, 'octocat');
  assert.equal(first.stale, false);
  assert.equal(first.error, null);
  assert.equal(first.retryAt, null);
  assert.equal(first.updatedAt, '2026-01-01T00:00:00.000Z');
  advance(59_999);
  assert.deepEqual(await dashboard.getSnapshot(), first);
  assert.equal(calls, 1);
  advance(1);
  await dashboard.getSnapshot();
  assert.equal(calls, 2);
});

test('coalesces concurrent refresh requests', async () => {
  let calls = 0;
  let resolve;
  const { dashboard } = harness(() => {
    calls += 1;
    return new Promise((done) => { resolve = done; });
  });
  const first = dashboard.getSnapshot();
  const second = dashboard.getSnapshot();
  assert.equal(calls, 1);
  resolve(result);
  assert.deepEqual(await first, await second);
});

test('keeps the last full result and timestamp after an error, then recovers', async () => {
  let calls = 0;
  const { dashboard, advance } = harness(async () => {
    calls += 1;
    if (calls === 2) throw new GitHubError('INCOMPLETE');
    return calls === 1 ? result : { ...result, pullRequests: [] };
  });
  const first = await dashboard.getSnapshot();
  advance(60_000);
  const failed = await dashboard.getSnapshot();
  assert.deepEqual(failed.pullRequests, first.pullRequests);
  assert.equal(failed.updatedAt, first.updatedAt);
  assert.equal(failed.stale, true);
  assert.equal(failed.error.code, 'INCOMPLETE');
  assert.equal(failed.retryAt, '2026-01-01T00:02:00.000Z');
  advance(60_000);
  const recovered = await dashboard.getSnapshot();
  assert.deepEqual(recovered.pullRequests, []);
  assert.equal(recovered.error, null);
  assert.equal(recovered.stale, false);
  assert.equal(recovered.retryAt, null);
});

test('first failure returns an unavailable snapshot rather than a successful empty state', async () => {
  const { dashboard } = harness(async () => { throw new Error('token=very-secret'); });
  const snapshot = await dashboard.getSnapshot();
  assert.equal(snapshot.updatedAt, null);
  assert.equal(snapshot.stale, true);
  assert.equal(snapshot.error.code, 'UNAVAILABLE');
  assert.deepEqual(snapshot.pullRequests, []);
  assert.doesNotMatch(JSON.stringify(snapshot), /very-secret/);
});

test('provider retry time wins over refresh interval and cannot be bypassed by reloads', async () => {
  let calls = 0;
  const { dashboard, advance, now } = harness(async () => {
    calls += 1;
    throw new GitHubError('RATE_LIMITED', { retryAt: now() + 600_000 });
  });
  const failed = await dashboard.getSnapshot();
  assert.equal(failed.retryAt, '2026-01-01T00:10:01.000Z');
  advance(600_000);
  await Promise.all(Array.from({ length: 10 }, () => dashboard.getSnapshot()));
  assert.equal(calls, 1);
  advance(1_000);
  await dashboard.getSnapshot();
  assert.equal(calls, 2);
});

test('repeated failures back off exponentially to a fifteen minute cap', async () => {
  const { dashboard, advance, now } = harness(async () => { throw new GitHubError('UNAVAILABLE'); });
  for (const delay of [60_000, 120_000, 240_000, 480_000, 900_000, 900_000]) {
    const snapshot = await dashboard.getSnapshot();
    assert.equal(Date.parse(snapshot.retryAt) - now(), delay);
    advance(delay);
  }
});

test('successful response with exhausted budget waits for its reset before fetching again', async () => {
  let calls = 0;
  const { dashboard, advance } = harness(async () => {
    calls += 1;
    return { ...result, rateLimit: { remaining: 0, resetAt: '2026-01-01T01:00:00Z' } };
  });
  assert.equal((await dashboard.getSnapshot()).stale, false);
  advance(60_000);
  await dashboard.getSnapshot();
  assert.equal(calls, 1);
  advance(3_541_000);
  await dashboard.getSnapshot();
  assert.equal(calls, 2);
});
