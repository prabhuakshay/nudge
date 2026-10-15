# Security policy

## Reporting a vulnerability

Please report security issues privately through
[GitHub's private vulnerability reporting](https://github.com/prabhuakshay/nudge/security/advisories/new).
Don't open a public issue.

Include what you found, how to reproduce it, and the impact you expect. You'll get an
acknowledgement within 3 days and a plan for a fix within 14 days.

## Supported versions

Nudge is in early development. Only the latest release on the `main` branch receives security
fixes.

## Running Nudge securely

- Keep `NUDGE_DEBUG=false` on any server other people can reach.
- Use a long random `NUDGE_SECRET_KEY` and keep `.env` private.
- Serve Nudge over HTTPS through a reverse proxy, and set `NUDGE_TRUST_PROXY_HEADERS=true` only
  when that proxy is the only way to reach Nudge.
- Bind `NUDGE_WEB_HOST` to an address only your proxy can reach.
