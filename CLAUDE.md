# Nudge

Open-source, self-hostable TickTick alternative. Django + Django Ninja backend, React SPA
frontend, served from one container. Decisions and roadmap live in [PLAN.md](PLAN.md); read it
before starting any feature.

## The standard

Nudge is held to the highest standard of open-source code quality and architecture. Every change
should be something a maintainer of a well-known project would merge without asking for edits:

- Readable first. Code is read far more than written. Clear names, small functions, obvious flow.
- Simple over clever. No abstraction until the second real use. No speculative options.
- Tested. New behavior ships with tests; bug fixes start with a failing test.
- Typed. No `Any`, no `# type: ignore`, no `as` casts without a comment saying why.
- Documented. Every module, class and public function has a docstring that says what it is for.
  Comments explain *why*, never *what*.
- Consistent. Follow the patterns already in the codebase. If a pattern is wrong, change it
  everywhere in a separate commit.
- Zero warnings. Linters, type checkers and tests pass with no warnings and no suppressions
  unless the suppression carries a reason.

## Product rules that shape the code

- **No sign-up.** Accounts are created by an admin (`createsuperuser` or the Django admin). Never
  add a registration endpoint or page.
- **Use the glossary's words.** Name things in code, UI and docs as [GLOSSARY.md](GLOSSARY.md)
  does: Project (not list), Comment (not note), Repeat, Occurrence, Closed, Pinned, Mention,
  Calendar feed.
- **Everything belongs to a user.** Every Task, Project, Tag, Person and Reminder has an owner,
  and every query filters by `request.user`. A user must never be able to read or change another
  user's data, including through IDs in URLs. Test this for every endpoint.
- **API endpoints are private by default.** The Ninja API uses session auth globally; an endpoint
  opts out only with an explicit `auth=None`.
- **Users sign in with email.** `apps.accounts.User` has `email` (unique, case-insensitive) and
  `full_name`; there is no username and no first/last name.
- **Everything is configurable from `.env`.** Any value that could differ between deployments
  is read in `config/settings.py` with a `NUDGE_` prefix and documented in `.env.example`
  (default, meaning, when to change it). Never hard-code hosts, ports, URLs or secrets.
- **PostgreSQL on the host.** Docker stacks use host networking and the host's PostgreSQL. Don't
  add a database container.

## Commands

```sh
make setup          # install deps + git hooks
make dev            # hot-reload dev stack: http://localhost:5173
make test           # backend (pytest) + frontend (vitest)
make lint           # prek run --all-files: ruff, mypy, eslint, prettier, tsc, ...
make migrations     # after changing models
make api            # after changing API endpoints or schemas
```

Backend commands outside Docker need `NUDGE_DEBUG=true` (or a `NUDGE_SECRET_KEY`), for example
`NUDGE_DEBUG=true uv run --directory backend pytest`. Tests need a PostgreSQL role with
`CREATEDB`; `DATABASE_URL` in `.env` points at it.

## Backend (backend/)

- `config/`: settings, root URLs, the single `NinjaAPI` (`config/api.py`).
- `apps/<app>/`: one Django app per domain area. Inside each:
  - `models.py`: data and invariants.
  - `services.py`: business logic. Views and background jobs call services; services never
    touch `request`.
  - `schemas.py`: Ninja request/response schemas (`...In`, `...Out`).
  - `api.py`: thin HTTP layer exposing `router`, registered in `config/api.py`.
  - `tests/`: pytest, one file per module under test.
- `apps/tasks/` holds Tasks, Projects, Folders, Tags, People, Comments, Attachments, Activity and
  Reminders, with one router file per resource. Reminder delivery lives in `apps/notifications/`.
- Return explicit status codes with `ninja.Status(code, body)`; errors use `ErrorOut`.
- `PATCH /{id}` edits a resource; `POST /{id}/<verb>` performs an action on it (`/archive`,
  `/move`, `/restore`).
- A request that breaks a domain rule (too deep, a cycle, an Inbox guard, a bad RRULE, a Mention
  of another user's Person) returns 422 with the reason in `ErrorOut.detail`. Another user's id
  returns 404.
- Ruff runs with `select = ["ALL"]` and Google-style docstrings. Fix the code rather than adding
  `noqa`; when a suppression is right, add the reason after it.
- mypy runs in strict mode with the django-stubs plugin.
- Coverage must stay at or above 90%.
- Tasks and Projects get `updated_at` and soft delete (`deleted_at`) from their first migration,
  for Trash and Activity. Repeat is stored as an RFC 5545 RRULE string.

## Frontend (frontend/)

- `src/routes/`: TanStack Router file routes. `_app.tsx` is the signed-in layout and auth guard;
  `login.tsx` is public. `routeTree.gen.ts` is generated: don't edit it.
- `src/features/<feature>/`: feature logic and components (queries, mutations, forms).
- `src/components/ui/`: shadcn-style primitives. `src/components/layout/`: app shell pieces.
- `src/api/`: `client.ts` (typed `openapi-fetch` client with CSRF) and `schema.d.ts`, generated
  from `backend/openapi.json` by `make api`. Never hand-write API types.
- Server data goes through TanStack Query (`queryOptions` + hooks in the feature folder). No
  `useEffect` for fetching.
- The UI takes heavy inspiration from TickTick and Any.do: match their layouts, interactions
  and density before inventing new patterns.
- Styling is Tailwind with the semantic tokens in `src/styles/globals.css` (`bg-surface`,
  `text-muted-foreground`, `bg-primary`). Never use raw hex values or Tailwind palette colors in
  components. Light and dark modes follow the system.
- Mobile first: write the phone layout first, then add `sm:`/`lg:` overrides. The app shell
  switches from bottom navigation to a sidebar at `lg`.
- Accessibility is required: labelled controls, keyboard support, visible focus. ESLint's
  jsx-a11y strict rules enforce the basics.
- TypeScript is strict, with `noUncheckedIndexedAccess`. ESLint uses typescript-eslint's
  strict-type-checked rules.
- TypeScript stays on 5.9 until openapi-typescript supports a newer major.

## Branding

Logos, icons and colors live in `branding/` and are generated by `branding/source/build_brand.py`.
Don't edit the exported files by hand. The frontend copies favicons into `frontend/public/` and
marks into `frontend/src/assets/brand/`.

## Git

- Conventional Commits, enforced by a commit-msg hook: `feat(tasks): add due dates`. Types: build,
  chore, ci, docs, feat, fix, perf, refactor, revert, style, test.
- One logical change per commit. Generated files (`openapi.json`, `schema.d.ts`,
  `routeTree.gen.ts`, migrations) are committed with the change that produced them.
- Never bypass hooks with `--no-verify`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`prabhuakshay/nudge`), managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
