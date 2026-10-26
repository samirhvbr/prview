const ENDPOINT = 'https://api.github.com/graphql';

// This connection contains PRs authored by the user, without Search's 1,000-result cap.
export const PULL_REQUESTS_QUERY = `
  query OpenPullRequests($username: String!, $cursor: String, $pageSize: Int!) {
    user(login: $username) {
      pullRequests(first: $pageSize, after: $cursor, states: OPEN,
        orderBy: { field: CREATED_AT, direction: ASC }) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id number title url createdAt updatedAt isDraft
          author { login }
          reviewDecision mergeable
          repository { nameWithOwner isPrivate }
          commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        }
      }
    }
    rateLimit { remaining resetAt }
  }
`;

const MESSAGES = {
  AUTHENTICATION: 'O token do GitHub expirou ou não é válido. Verifique a configuração do servidor.',
  FORBIDDEN: 'O GitHub recusou o acesso. Verifique as permissões do token no servidor.',
  RATE_LIMITED: 'Limite da API do GitHub atingido. A atualização será retomada automaticamente.',
  USER_NOT_FOUND: 'Usuário não encontrado no GitHub. Verifique GITHUB_USERNAME.',
  TIMEOUT: 'O GitHub demorou para responder. Uma nova tentativa será feita automaticamente.',
  UNAVAILABLE: 'Não foi possível consultar o GitHub. Uma nova tentativa será feita automaticamente.',
  INCOMPLETE: 'O GitHub retornou dados incompletos. A última lista completa foi preservada.',
  COLLECTION_CHANGED: 'A lista mudou durante a consulta. Uma nova atualização será feita automaticamente.',
};

export class GitHubError extends Error {
  constructor(code, { retryAt = null, rateLimit = null, smallerPage = false } = {}) {
    super(MESSAGES[code] ?? MESSAGES.UNAVAILABLE);
    this.name = 'GitHubError';
    this.code = Object.hasOwn(MESSAGES, code) ? code : 'UNAVAILABLE';
    this.retryAt = retryAt;
    this.rateLimit = rateLimit;
    this.smallerPage = smallerPage;
  }
}

function date(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function rateLimitFrom(data) {
  if (!data || !Number.isInteger(data.remaining) || data.remaining < 0 || !date(data.resetAt)) {
    return null;
  }
  return { remaining: data.remaining, resetAt: new Date(data.resetAt).toISOString() };
}

function headerRetryAt(headers, now) {
  const retryAfter = headers.get('retry-after');
  const seconds = retryAfter !== null && /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) : NaN;
  const retryDate = retryAfter !== null && !Number.isFinite(seconds) ? Date.parse(retryAfter) : NaN;
  const reset = Number(headers.get('x-ratelimit-reset')) * 1_000;
  const retryTime = Number.isFinite(seconds) ? now + seconds * 1_000 : retryDate;
  const candidates = [retryTime];
  // A primary rate-limit reset is only relevant when that budget was exhausted.
  if (headers.get('x-ratelimit-remaining') === '0' && reset > now) candidates.push(reset);
  const latest = Math.max(now, ...candidates.filter(Number.isFinite));
  return latest > now ? latest : null;
}

function normalizePullRequest(node, username) {
  const integer = (value) => Number.isSafeInteger(value) && value >= 0;
  const validUrl = (() => {
    try {
      const url = new URL(node?.url);
      return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password;
    } catch { return false; }
  })();
  if (!node || typeof node.id !== 'string' || !integer(node.number) || node.number === 0
    || typeof node.title !== 'string' || !validUrl || !date(node.createdAt) || !date(node.updatedAt)
    || typeof node.isDraft !== 'boolean' || typeof node.repository?.nameWithOwner !== 'string'
    || !/^[\w.-]+\/[\w.-]+$/.test(node.repository.nameWithOwner)
    || typeof node.repository.isPrivate !== 'boolean'
    || typeof node.author?.login !== 'string' || node.author.login.toLowerCase() !== username.toLowerCase()
    || ![null, 'APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'].includes(node.reviewDecision)
    || !['MERGEABLE', 'CONFLICTING', 'UNKNOWN'].includes(node.mergeable)
    || !Array.isArray(node.commits?.nodes)) {
    throw new GitHubError('INCOMPLETE');
  }
  const lastCommit = node.commits.nodes[0];
  if (node.commits.nodes.length && (!lastCommit || !lastCommit.commit
    || !Object.hasOwn(lastCommit.commit, 'statusCheckRollup'))) throw new GitHubError('INCOMPLETE');
  const rollup = lastCommit?.commit.statusCheckRollup;
  if (rollup !== null && rollup !== undefined && typeof rollup.state !== 'string') throw new GitHubError('INCOMPLETE');
  const checks = rollup?.state ?? null;
  if (![null, 'SUCCESS', 'FAILURE', 'PENDING', 'ERROR', 'EXPECTED'].includes(checks)) {
    throw new GitHubError('INCOMPLETE');
  }
  return {
    id: node.id, number: node.number, title: node.title, url: node.url,
    repository: node.repository.nameWithOwner, isPrivate: node.repository.isPrivate,
    createdAt: node.createdAt, updatedAt: node.updatedAt, isDraft: node.isDraft,
    reviewDecision: node.reviewDecision, mergeable: node.mergeable, checks,
  };
}

export function createGitHubClient({ token, username, fetchImpl = fetch, now = Date.now, timeoutMs = 15_000 }) {
  async function request(cursor, pageSize) {
    let response;
    let body;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'prview',
        },
        body: JSON.stringify({ query: PULL_REQUESTS_QUERY, variables: { username, cursor, pageSize } }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
      // Error bodies may contain credentials, provider internals, or HTML. Never expose them.
      if (response.ok) body = await response.json();
    } catch (error) {
      const timedOut = ['AbortError', 'TimeoutError'].includes(error?.name);
      throw new GitHubError(timedOut ? 'TIMEOUT' : 'UNAVAILABLE', { smallerPage: timedOut });
    }

    const retryAt = headerRetryAt(response.headers, now());
    if (!response.ok) {
      if (response.status === 401) throw new GitHubError('AUTHENTICATION');
      if (response.status === 429 || (response.status === 403 &&
        (retryAt !== null || response.headers.get('x-ratelimit-remaining') === '0'))) {
        throw new GitHubError('RATE_LIMITED', { retryAt: retryAt ?? now() + 60_000 });
      }
      if (response.status === 403) throw new GitHubError('FORBIDDEN');
      throw new GitHubError('UNAVAILABLE', { retryAt, smallerPage: [502, 503, 504].includes(response.status) && !retryAt });
    }

    const rateLimit = rateLimitFrom(body?.data?.rateLimit);
    if (Array.isArray(body?.errors) && body.errors.length) {
      if (body.errors.some((error) => error.type === 'RATE_LIMITED' || error.extensions?.code === 'RATE_LIMITED')) {
        const resetAt = rateLimit?.resetAt ? Date.parse(rateLimit.resetAt) : 0;
        throw new GitHubError('RATE_LIMITED', {
          retryAt: Math.max(now() + 60_000, resetAt, retryAt ?? 0), rateLimit,
        });
      }
      if (body.errors.some((error) => error.type === 'FORBIDDEN')) throw new GitHubError('FORBIDDEN', { rateLimit });
      if (body.errors.some((error) => error.type === 'NOT_FOUND') && body.data?.user === null) {
        throw new GitHubError('USER_NOT_FOUND', { rateLimit });
      }
      throw new GitHubError('INCOMPLETE', { rateLimit });
    }
    if (body?.data?.user === null) throw new GitHubError('USER_NOT_FOUND', { rateLimit });
    if (!rateLimit || !body?.data?.user?.pullRequests) throw new GitHubError('INCOMPLETE');
    return { connection: body.data.user.pullRequests, rateLimit };
  }

  return {
    async fetchPullRequests() {
      const pullRequests = [];
      const cursors = new Set();
      const ids = new Set();
      let cursor = null;
      let expectedCount = null;
      let rateLimit = null;
      // The query contains only displayed fields; reduce page size if GitHub cannot finish it.
      let pageSize = 50;

      do {
        let page;
        try {
          page = await request(cursor, pageSize);
        } catch (error) {
          if (error.smallerPage && pageSize > 5) {
            pageSize = Math.max(5, Math.floor(pageSize / 2));
            continue;
          }
          throw error;
        }
        const { connection } = page;
        rateLimit = page.rateLimit;
        if (!Number.isSafeInteger(connection.totalCount) || connection.totalCount < 0
          || !Array.isArray(connection.nodes) || typeof connection.pageInfo?.hasNextPage !== 'boolean') {
          throw new GitHubError('INCOMPLETE', { rateLimit });
        }
        expectedCount ??= connection.totalCount;
        if (expectedCount !== connection.totalCount) throw new GitHubError('COLLECTION_CHANGED', { rateLimit });
        for (const node of connection.nodes) {
          const pr = normalizePullRequest(node, username);
          if (ids.has(pr.id)) throw new GitHubError('COLLECTION_CHANGED', { rateLimit });
          ids.add(pr.id);
          pullRequests.push(pr);
        }
        if (!connection.pageInfo.hasNextPage) break;
        cursor = connection.pageInfo.endCursor;
        if (typeof cursor !== 'string' || !cursor || cursors.has(cursor) || !connection.nodes.length
          || pullRequests.length >= expectedCount) {
          throw new GitHubError('INCOMPLETE', { rateLimit });
        }
        cursors.add(cursor);
        if (rateLimit.remaining === 0) {
          throw new GitHubError('RATE_LIMITED', { retryAt: Date.parse(rateLimit.resetAt), rateLimit });
        }
      } while (true);

      if (pullRequests.length !== expectedCount) throw new GitHubError('INCOMPLETE', { rateLimit });
      pullRequests.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
        || left.id.localeCompare(right.id));
      return { pullRequests, rateLimit };
    },
  };
}
