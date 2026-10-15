# Nudge — Project Plan

Nudge is an open-source, self-hostable alternative to TickTick. This file records the decisions already made. Change it when a decision changes, so later work doesn't contradict it.

## Decisions

| Area | Choice |
| --- | --- |
| Frontend | React + Vite + TypeScript, single-page app |
| Routing | TanStack Router (type-safe routes and search params) |
| Server state | TanStack Query (caching, optimistic updates, invalidation) |
| UI components | shadcn/ui + Tailwind, themed from `branding/colors` |
| Drag and drop | dnd-kit |
| Toasts / command bar / icons | sonner, cmdk, Lucide |
| Long lists (later) | TanStack Virtual |
| API client | Generated from Django Ninja's OpenAPI schema with `openapi-typescript` + `openapi-fetch`. Never hand-write API types. |
| Backend | Django + Django Ninja, managed with uv |
| Database | PostgreSQL on the host. Docker stacks use host networking; no database container. |
| Background jobs | Procrastinate (Postgres-backed, no Redis), run as a separate `worker` service from the same image |
| Recurrence | Store RFC 5545 RRULE strings and expand with `python-dateutil` |
| Auth | Django session cookies + CSRF (same origin). Add API tokens only when native mobile apps need them. |
| Accounts | Email + password, custom user model with `email` and `full_name`. No sign-up: an admin creates accounts. |
| Data ownership | Every record belongs to one user; every query is scoped to the signed-in user. |
| Tooling | uv, Ruff (all rules), mypy strict, pytest; npm, ESLint strict, Prettier, Vitest; prek hooks; Conventional Commits |
| Deployment | One Docker image serves the API and the SPA on one port, behind Caddy on the host. Configured entirely from `.env`. |

## Project structure

```
nudge/
├── backend/
│   ├── pyproject.toml
│   ├── manage.py
│   ├── config/                 # settings, urls, asgi
│   └── apps/
│       ├── accounts/
│       ├── lists/              # lists, folders, tags
│       ├── tasks/              # models, schemas.py, api.py, services.py
│       └── reminders/          # scheduling + delivery
├── frontend/
│   ├── vite.config.ts          # dev: proxies /api → :8000
│   ├── public/                 # favicons copied from branding/favicon
│   └── src/
│       ├── api/                # generated client
│       ├── routes/
│       ├── features/           # tasks/, lists/, calendar/
│       ├── components/ui/      # shadcn components
│       └── styles/tokens.css   # from branding/colors
├── branding/                   # logos, icons, colours (see branding/README.md)
├── docker/
│   ├── Dockerfile              # multi-stage: node build → python runtime
│   └── entrypoint.sh           # migrate, collectstatic, start server
├── compose.yaml                # app, worker, postgres
├── Caddyfile.example
└── .env.example
```

Backend apps keep HTTP handling in `api.py`, request/response shapes in `schemas.py`, and business logic in `services.py`, so the worker and the API share the same logic.

## Serving and deployment

1. The Docker build compiles `frontend/dist` in a Node stage and copies it into the Python runtime stage.
2. Django serves the built SPA with WhiteNoise.
3. URL routing:
   - `/api/v1/*` → Django Ninja
   - `/admin/` → Django admin
   - `/static/*` → WhiteNoise
   - everything else → `index.html` (client-side routing)
4. Gunicorn with threaded workers (`gthread`) listens on `NUDGE_WEB_HOST:NUDGE_WEB_PORT`. No nginx in the container. (Changed from Uvicorn workers: there are no async views yet and WhiteNoise is synchronous, so plain WSGI is simpler and faster. Revisit if async views arrive.)
5. Caddy on the host handles HTTPS and forwards to the web container. The public URL and the listen address both come from `.env` (see `Caddyfile.example`).
6. Behind the proxy, set `NUDGE_PUBLIC_URL` (derives allowed hosts and trusted origins) and `NUDGE_TRUST_PROXY_HEADERS=true`.

In development (`compose.dev.yaml`), Django's runserver, the worker and Vite all hot-reload. Vite runs on its own port and proxies `/api`, `/admin` and `/static` to Django, so cookies and CSRF behave the same as in production.

## Product scope

### v1: the core loop
- Quick add with natural-language parsing ("pay rent every month on the 1st 9am #home !high")
- Lists, folders and tags
- Due dates, times and priorities
- Repeating tasks (RRULE)
- Reminders
- Views: Inbox, Today, Upcoming
- Ctrl+K command bar
- Sign-in page and responsive app shell (done: bottom navigation on phones, sidebar from `lg`)

### How Nudge differs from TickTick
- Self-host friendly notifications: Web Push (installable PWA), email, and Apprise/ntfy. (Web Push done: notification center, per-device push setting, test notification; VAPID keys from `.env`.)
- Read-only iCal feed so tasks appear in any calendar app. Two-way CalDAV later.
- Offline-ready data model from day one (see rules below), with full offline mode later.

### Later
- Calendar view
- Habits, Pomodoro, Eisenhower matrix
- Shared lists and collaboration
- CalDAV sync
- Native mobile apps

## Rules to keep from day one

- Every user-data model has an owner, and every query filters by `request.user`. Each endpoint has a test proving another user can't reach the data.
- API endpoints are private by default (global session auth); public ones opt out with `auth=None`.
- Every syncable model has `updated_at` and soft deletes (`deleted_at`). Adding these later breaks offline sync.
- Recurrence is always an RRULE string, never a custom format.
- Frontend types come from the generated API client only.
- All colours in the frontend come from tokens derived from `branding/colors`. No hard-coded hex values in components.
- Logo and icon files come from `branding/`. Regenerate them with `branding/source/build_brand.py`; don't edit the exports by hand.
