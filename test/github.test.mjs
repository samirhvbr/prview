import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubClient, GitHubError } from '../server/github.mjs';

const now = Date.parse('2026-01-01T12:00:00Z');
const budget = { remaining: 4999, resetAt: '2026-01-01T13:00:00Z' };

function node(id, createdAt = '2026-01-01T00:00:00Z') {
  return {
    id, number: Number(id), title: `PR ${id}`, url: `https://github.com/octo/repo/pull/${id}`,
    createdAt, updatedAt: createdAt, isDraft: false, author: { login: 'octocat' },
    repository: { nameWithOwner: 'octo/repo', isPrivate: false },
    reviewDecision: 'APPROVED', mergeable: 'MERGEABLE',
    commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
  };
}

function payload(nodes, { totalCount = nodes.length, next = null, rateLimit = budget } = {}) {
  return { data: { user: { pullRequests: {
    totalCount, nodes, pageInfo: { hasNextPage: next !== null, endCursor: next },
  } }, rateLimit } };
}

function client(fetchImpl) {
  return createGitHubClient({ token: 'secret-test-token', username: 'octocat', fetchImpl, now: () => now });
}

test('fetches every cursor, normalizes data and sorts oldest first', async () => {
  const calls = [];
  const service = client(async (url, options) => {
    calls.push({ url, options });
    return Response.json(calls.length === 1
      ? payload([node('2', '2025-12-31T00:00:00Z')], { totalCount: 2, next: 'cursor-1' })
      : payload([node('1', '2025-01-01T00:00:00Z')], { totalCount: 2 }));
  });
  const result = await service.fetchPullRequests();
  assert.deepEqual(result.pullRequests.map((pr) => pr.id), ['1', '2']);
  assert.equal(result.pullRequests[0].repository, 'octo/repo');
  assert.equal(result.pullRequests[0].checks, 'SUCCESS');
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].options.body).variables.cursor, 'cursor-1');
  assert.equal(JSON.parse(calls[0].options.body).variables.pageSize, 50);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-test-token');
  assert.equal(calls[0].url, 'https://api.github.com/graphql');
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(result.rateLimit, { ...budget, resetAt: '2026-01-01T13:00:00.000Z' });
});

test('returns an empty successful result for a user with no open PRs', async () => {
  assert.deepEqual((await client(async () => Response.json(payload([]))).fetchPullRequests()).pullRequests, []);
});

test('paginates beyond GitHub Search\'s 1,000-result boundary', async () => {
  const records = Array.from({ length: 1001 }, (_unused, index) => node(String(index + 1)));
  let calls = 0;
  const service = client(async (_url, options) => {
    calls += 1;
    const { cursor, pageSize } = JSON.parse(options.body).variables;
    const start = cursor ? Number(cursor) : 0;
    const end = Math.min(start + pageSize, records.length);
    return Response.json(payload(records.slice(start, end), {
      totalCount: records.length, next: end < records.length ? String(end) : null,
    }));
  });
  assert.equal((await service.fetchPullRequests()).pullRequests.length, 1001);
  assert.equal(calls, 21);
});

test('accepts missing review/check results without inventing success', async () => {
  const pr = node('1');
  pr.reviewDecision = null;
  pr.commits.nodes[0].commit.statusCheckRollup = null;
  const result = await client(async () => Response.json(payload([pr]))).fetchPullRequests();
  assert.equal(result.pullRequests[0].checks, null);
  assert.equal(result.pullRequests[0].reviewDecision, null);
});

test('rejects partial GraphQL data and does not expose upstream messages', async () => {
  const body = { ...payload([node('1')]), errors: [{ message: 'secret-test-token internal upstream detail' }] };
  await assert.rejects(client(async () => Response.json(body)).fetchPullRequests(), (error) => {
    assert.equal(error.code, 'INCOMPLETE');
    assert.doesNotMatch(error.message, /secret-test-token|internal upstream/);
    return true;
  });
});

test('does not publish a collection that changed during pagination', async () => {
  let calls = 0;
  await assert.rejects(client(async () => Response.json(++calls === 1
    ? payload([node('1')], { totalCount: 3, next: 'cursor' })
    : payload([node('2')], { totalCount: 2 }))).fetchPullRequests(), { code: 'COLLECTION_CHANGED' });
});

test('rejects duplicate, missing, null, or malformed PR records', async (t) => {
  const cases = [
    { label: 'duplicate', data: payload([node('1'), node('1')]), code: 'COLLECTION_CHANGED' },
    { label: 'missing', data: payload([node('1')], { totalCount: 2 }), code: 'INCOMPLETE' },
    { label: 'null', data: payload([null]), code: 'INCOMPLETE' },
    { label: 'javascript URL', data: payload([{ ...node('1'), url: 'javascript:alert(1)' }]), code: 'INCOMPLETE' },
    { label: 'other author', data: payload([{ ...node('1'), author: { login: 'someone-else' } }]), code: 'INCOMPLETE' },
  ];
  for (const { label, data, code } of cases) {
    await t.test(label, () => assert.rejects(client(async () => Response.json(data)).fetchPullRequests(), { code }));
  }
});

test('rejects repeated cursors instead of looping indefinitely', async () => {
  let calls = 0;
  await assert.rejects(client(async () => Response.json(payload([node(String(++calls))], {
    totalCount: 10, next: 'same-cursor',
  }))).fetchPullRequests(), { code: 'INCOMPLETE' });
  assert.equal(calls, 2);
});

test('shrinks expensive GraphQL pages without losing or duplicating the cursor', async () => {
  const requests = [];
  const service = client(async (_url, options) => {
    const variables = JSON.parse(options.body).variables;
    requests.push(variables);
    if (requests.length === 1) return Response.json(payload([node('1')], { totalCount: 2, next: 'first' }));
    if (requests.length === 2) return new Response('execution exceeded', { status: 502 });
    return Response.json(payload([node('2')], { totalCount: 2 }));
  });
  assert.deepEqual((await service.fetchPullRequests()).pullRequests.map((pr) => pr.id), ['1', '2']);
  assert.deepEqual(requests.map(({ cursor, pageSize }) => ({ cursor, pageSize })), [
    { cursor: null, pageSize: 50 }, { cursor: 'first', pageSize: 50 }, { cursor: 'first', pageSize: 25 },
  ]);
});

test('page reduction is bounded when GitHub keeps timing out', async () => {
  const sizes = [];
  const service = client(async (_url, options) => {
    sizes.push(JSON.parse(options.body).variables.pageSize);
    return new Response('', { status: 502 });
  });
  await assert.rejects(service.fetchPullRequests(), { code: 'UNAVAILABLE' });
  assert.deepEqual(sizes, [50, 25, 12, 6, 5]);
});

test('HTTP secondary rate limit honors Retry-After', async () => {
  await assert.rejects(client(async () => new Response('private upstream data', {
    status: 429, headers: { 'retry-after': '120' },
  })).fetchPullRequests(), (error) => error instanceof GitHubError && error.code === 'RATE_LIMITED'
    && error.retryAt === now + 120_000 && !error.message.includes('private upstream'));
});

test('HTTP primary rate limit honors reset timestamp', async () => {
  await assert.rejects(client(async () => new Response('', {
    status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String((now + 600_000) / 1_000) },
  })).fetchPullRequests(), (error) => error.code === 'RATE_LIMITED' && error.retryAt === now + 600_000);
});

test('GraphQL rate-limit errors honor reset time, even with partial data', async () => {
  const data = { ...payload([node('1')], { rateLimit: { ...budget, remaining: 0 } }), errors: [{ type: 'RATE_LIMITED' }] };
  await assert.rejects(client(async () => Response.json(data)).fetchPullRequests(),
    (error) => error.code === 'RATE_LIMITED' && error.retryAt === Date.parse(budget.resetAt));
});

test('does not request another page after exhausting the budget', async () => {
  let calls = 0;
  await assert.rejects(client(async () => {
    calls += 1;
    return Response.json(payload([node('1')], { totalCount: 2, next: 'next', rateLimit: { ...budget, remaining: 0 } }));
  }).fetchPullRequests(), { code: 'RATE_LIMITED' });
  assert.equal(calls, 1);
});

test('maps authentication, permission, missing user, and network errors safely', async (t) => {
  const cases = [
    ['authentication', async () => new Response('secret', { status: 401 }), 'AUTHENTICATION'],
    ['permission', async () => new Response('secret', { status: 403 }), 'FORBIDDEN'],
    ['missing user', async () => Response.json({ data: { user: null, rateLimit: budget } }), 'USER_NOT_FOUND'],
    ['network', async () => { throw new Error('secret'); }, 'UNAVAILABLE'],
    ['timeout', async () => { throw new DOMException('secret', 'TimeoutError'); }, 'TIMEOUT'],
    ['invalid JSON', async () => new Response('<html>secret</html>'), 'UNAVAILABLE'],
  ];
  for (const [label, mock, code] of cases) {
    await t.test(label, () => assert.rejects(client(mock).fetchPullRequests(), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    }));
  }
});
