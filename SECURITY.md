# Security

PRVIEW is a read-only, self-hosted dashboard. Access is intentionally based on possession of a secret URL, suitable for unattended displays. There are no accounts, passwords, roles, or per-viewer permissions.

## Credential boundaries

- `GITHUB_TOKEN` stays on the server and controls which GitHub resources can be read. Use the minimum permissions and repository selection necessary. Do not use it in the TV URL.
- `DASHBOARD_TOKEN` is an independent random secret with at least 32 URL-safe characters. Anyone who obtains it can read the entire configured dashboard, including metadata from private repositories visible to the GitHub token.
- The initial `/?token=…` request sets an HMAC-signed, `HttpOnly`, `SameSite=Lax` cookie, then redirects to a URL without the token. `Lax` allows top-level GET navigation from another site to complete the authorization redirect, while withholding the cookie from cross-site subrequests. The dashboard API also rejects requests marked as cross-site by Fetch Metadata. Valid dashboard API requests renew the cookie for 30 days. Changing `DASHBOARD_TOKEN` and restarting invalidates existing sessions and links.
- Valid display parameters are preserved in that redirect. Repository and search filters are presentation preferences, not authorization boundaries: every authorized viewer can read the complete configured dashboard. Display parameters cannot change the GitHub credential, configured author, or server refresh interval. Never put `GITHUB_TOKEN` in a URL.
- `COOKIE_SECURE=true` enables a `Secure` cookie with the `__Host-` prefix and HSTS. Use this when the browser-facing endpoint is HTTPS, including behind a reverse proxy. It does not enable TLS in Node itself.

## Deployment

Use HTTPS for access beyond local development. Avoid logging query strings in your reverse proxy, ingress, CDN, analytics, or browser management tooling. The application does not log incoming URLs or credentials and sends `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. The initial URL can still appear in browser history, bookmarks, intermediary logs, screenshots, or clipboard history; the redirect cannot erase copies already made.

The clean URL still contains valid display options such as `repo` and `q`. These can reveal private repository names or search terms in history and screenshots even after the token is removed. Share such links with the same care as the displayed metadata.

Keep `.env` private, outside version control and container images. Do not paste `docker compose config` output, environment dumps, dashboard URLs, or request headers into public issues. The Docker image runs as a non-root user; the supplied Compose configuration also uses a read-only filesystem and drops capabilities.

This is one shared access level for all viewers. Run separate instances with separate GitHub credentials and dashboard tokens when audiences need different visibility. Use a dedicated hostname and a trusted reverse proxy for public hosting. The service has no built-in TLS, per-IP throttling, or audit log; enforce connection and request limits at the proxy if exposing it to the Internet.

## Reporting

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/samirhvbr/prview/security/advisories/new) when available. Do not open a public issue containing credentials, a working dashboard link, private repository metadata, or an unpatched exploit. Include the affected revision and a reproduction with synthetic data.
