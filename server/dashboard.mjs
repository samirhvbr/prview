import { GitHubError } from './github.mjs';

/** One shared snapshot per server, independent of the number of connected screens. */
export function createDashboard({ username, refreshSeconds, pageSeconds, staleDays, fetchPullRequests, now = Date.now }) {
  let pullRequests = [];
  let updatedAt = null;
  let rateLimit = null;
  let error = null;
  let nextAttemptAt = 0;
  let failures = 0;
  let inFlight = null;

  async function refresh() {
    try {
      const result = await fetchPullRequests();
      pullRequests = result.pullRequests;
      rateLimit = result.rateLimit;
      updatedAt = new Date(now()).toISOString();
      error = null;
      failures = 0;
      nextAttemptAt = now() + refreshSeconds * 1_000;
      if (rateLimit?.remaining === 0) nextAttemptAt = Math.max(nextAttemptAt, Date.parse(rateLimit.resetAt) + 1_000);
    } catch (failure) {
      const safe = failure instanceof GitHubError ? failure : new GitHubError('UNAVAILABLE');
      error = { code: safe.code, message: safe.message };
      if (safe.rateLimit) rateLimit = safe.rateLimit;
      failures += 1;
      // Never let screen reloads or concurrent viewers bypass provider backoff.
      const delay = Math.min(15 * 60_000, Math.max(30_000, refreshSeconds * 1_000) * 2 ** Math.min(failures - 1, 8));
      nextAttemptAt = Math.max(now() + delay, safe.retryAt ? Number(safe.retryAt) + 1_000 : 0);
    }
  }

  return {
    async getSnapshot() {
      if (now() >= nextAttemptAt && !inFlight) {
        inFlight = refresh().finally(() => { inFlight = null; });
      }
      if (inFlight) await inFlight;
      return {
        username,
        pullRequests,
        updatedAt,
        stale: error !== null || updatedAt === null,
        error,
        retryAt: error ? new Date(nextAttemptAt).toISOString() : null,
        refreshSeconds,
        pageSeconds,
        staleDays,
        rateLimit,
      };
    },
  };
}
