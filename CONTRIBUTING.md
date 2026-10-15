# Contributing to Nudge

Thanks for helping. This guide covers setting up, the standards every change meets, and how to
get a pull request merged.

## Before you start

For anything bigger than a small fix, open an issue first so we can agree on the approach. Check
[PLAN.md](PLAN.md) for decisions already made and what's in scope.

## Setting up

You need [uv](https://docs.astral.sh/uv/), Node.js 24+, Docker, [prek](https://github.com/j178/prek)
and PostgreSQL on your machine.

1. Create a database role that can create test databases:

   ```sh
   sudo -u postgres psql -c "CREATE ROLE nudge LOGIN PASSWORD 'nudge' CREATEDB;"
   sudo -u postgres psql -c "CREATE DATABASE nudge OWNER nudge;"
   ```

2. Install everything and the git hooks:

   ```sh
   cp .env.example .env    # the defaults work for local development
   make setup
   ```

3. Start the dev stack and open <http://localhost:5173>:

   ```sh
   make dev
   ```

4. Create an account to sign in with:

   ```sh
   NUDGE_DEBUG=true uv run --directory backend python manage.py createsuperuser
   ```

## Standards

- **Tests.** New behavior needs tests. Bug fixes start with a test that fails without the fix.
  Backend coverage must stay at or above 90%.
- **Types.** Python is checked by mypy in strict mode; TypeScript is strict. No `Any`, no ignores
  without a stated reason.
- **Docstrings.** Every Python module, class and public function has one (Google style). Explain
  why in comments, not what.
- **Lint clean.** `make lint` runs Ruff (all rules), mypy, ESLint (strict type-checked and
  accessibility rules), Prettier and tsc. It must pass with no warnings.
- **User data stays private.** Every query that reads or writes user data filters by the
  signed-in user, and the tests prove another user can't reach it.
- **Configuration.** New settings are read from the environment in `config/settings.py` and
  documented in `.env.example`.
- **API changes.** Run `make api` and commit the regenerated `backend/openapi.json` and
  `frontend/src/api/schema.d.ts`.
- **UI.** Mobile first, both color schemes, keyboard accessible. Include phone and desktop
  screenshots in the pull request.

## Commits and pull requests

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org). A git hook
checks them.

```
feat(tasks): add due dates to quick add
fix(auth): keep the redirect after signing in
docs: explain the reverse proxy settings
```

Allowed types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`,
`style`, `test`.

Pull requests are squash-merged, so the PR title must follow the same format. Keep each pull
request to one change, run `make check` before pushing, and fill in the template.

## Reporting security issues

Don't open a public issue. See [SECURITY.md](SECURITY.md).
