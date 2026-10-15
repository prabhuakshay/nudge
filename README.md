<p align="center">
  <img src="branding/logo/png/lockup-horizontal-color-128h.png" alt="Nudge" height="64">
</p>

<p align="center"><strong>Small pushes. Things get done.</strong></p>

<p align="center">
  An open-source, self-hostable task manager in the spirit of TickTick.<br>
  Your tasks, projects and reminders, on a server you control.
</p>

---

> **Status:** early development. The v1 core loop is being finished: tasks, projects and
> reminders. See [PLAN.md](PLAN.md) for the roadmap.

## Features

- **Private by design.** Each account sees only its own tasks. There is no public sign-up: the
  server's admin creates accounts.
- **Mobile first.** Built for phones, with a full desktop layout from 1024px wide.
- **One container, one port.** The API and the web app are served together, ready to sit behind
  Caddy or any reverse proxy.
- **Configured entirely from `.env`.** Every option is documented in
  [`.env.example`](.env.example).

Planned for v1: natural-language quick add, projects and tags, repeating tasks, reminders by
browser push, email and ntfy, and an iCal feed.

## Self-hosting

You need Docker with Compose, and PostgreSQL running on the same machine. The containers use the
host's network, so they reach PostgreSQL at `localhost`.

1. Create the database:

   ```sh
   sudo -u postgres psql -c "CREATE ROLE nudge LOGIN PASSWORD 'choose-a-password';"
   sudo -u postgres psql -c "CREATE DATABASE nudge OWNER nudge;"
   ```

2. Configure Nudge:

   ```sh
   cp .env.example .env
   ```

   Set at least `NUDGE_SECRET_KEY`, `NUDGE_PUBLIC_URL` and `DATABASE_URL`. Behind a reverse proxy,
   also set `NUDGE_TRUST_PROXY_HEADERS=true` and the address to listen on
   (`NUDGE_WEB_HOST`, `NUDGE_WEB_PORT`).

3. Start it:

   ```sh
   docker compose up -d --build
   ```

   Migrations run automatically. Check health with `docker compose ps`.

4. Create your account:

   ```sh
   docker compose exec web python manage.py createsuperuser
   ```

5. Point your reverse proxy at `NUDGE_WEB_HOST:NUDGE_WEB_PORT`. For Caddy, see
   [`Caddyfile.example`](Caddyfile.example).

### Upgrading

```sh
git pull
docker compose up -d --build
```

## Development

Requirements: [uv](https://docs.astral.sh/uv/), Node.js 24+, Docker,
[prek](https://github.com/j178/prek) and a local PostgreSQL. The database role needs `CREATEDB` to
run the tests.

```sh
make setup   # install dependencies and git hooks
make dev     # backend, worker and frontend with hot reload
```

Open <http://localhost:5173>. Vite serves the frontend and forwards `/api`, `/admin` and `/static`
to Django.

| Command | What it does |
| --- | --- |
| `make test` | Backend and frontend tests |
| `make lint` | Every linter, formatter and type checker |
| `make check` | Everything CI runs |
| `make migrations` | Create migrations after changing models |
| `make api` | Regenerate the frontend's API types after changing the API |

Run `make help` for the full list. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull
request.

### Stack

| | |
| --- | --- |
| Backend | Django, Django Ninja, PostgreSQL, Procrastinate (background jobs) |
| Frontend | React, TypeScript, Vite, TanStack Router and Query, Tailwind, shadcn/ui |
| Serving | Gunicorn and WhiteNoise in one container, behind your reverse proxy |
| Quality | Ruff, mypy, pytest, ESLint, Prettier, Vitest, prek, Conventional Commits |

### Layout

```
backend/     Django project (config/) and apps (apps/)
frontend/    React single-page app
branding/    Logos, icons and colors
docker/      Dockerfile, entrypoint and health check
```

## License

[MIT](LICENSE)
