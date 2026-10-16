# TODO

## High impact

- [x] Add a Board layout for Projects (#70)
- [ ] Add import from TickTick and Todoist
  - Settings → Import takes a TickTick backup CSV or a Todoist CSV export.
  - Maps lists to Projects, folders to Folders, tags to Tags, priority to Priority, repeat
    rules to Repeat (RRULE), checklist items to Subtasks and done items to Closed Tasks.
  - Runs in the worker; the user gets a notification with what was created and every skipped
    row with its reason.
  - Importing twice creates duplicates; the page says so. No de-duplication.
- [ ] Add export
  - Settings → Export builds a ZIP of the signed-in user's data: one JSON file that Import can
    read back without loss, a CSV of Tasks for spreadsheets, and Attachments as files.
  - Includes Closed Tasks, archived Projects and Trash; purged rows are gone.
  - Built in the worker; a notification links to the download, which expires after 24 hours.
- [ ] Add backup
  - Instance-wide and admin-only, unlike Export: a worker job writes `pg_dump` plus the media
    directory to `NUDGE_BACKUP_DIR` on `NUDGE_BACKUP_SCHEDULE` (cron), keeping the newest
    `NUDGE_BACKUP_KEEP`.
  - `docs/backup.md` documents restore; a test restores a backup into an empty database.
- [ ] Add Smart lists (replaces "saved filters" and "smart lists")
  - A Smart list is a named filter in the sidebar: Projects or Folders, Tags, People, Priority,
    Status and a date rule (Overdue, today, next N days, no date), combined with all or any.
  - Opens like a Project, with List, Board by Project and Calendar Layouts.
  - Quick add inside it fills the filter's Project, Tags and Priority when there is exactly one.
  - Filtering runs on the server and shares one query module with Search.
  - Add "Smart list" to GLOSSARY.md (avoid: saved filter, custom view).
- [ ] Add notification channels: email and Apprise (replaces ntfy, Gotify, Telegram, Discord)
  - PLAN.md already promises email and Apprise. One Apprise URL covers ntfy, Gotify, Telegram,
    Discord, Matrix and Slack, so there is one integration instead of four.
  - Settings → Notifications: add channel URLs, send a test, turn each one on or off. The API
    never returns a stored URL in full, since URLs carry tokens.
  - The email channel sends to the account email through `NUDGE_EMAIL_URL`.
  - Reminders go to Web Push and every enabled channel. One failing channel retries in the
    worker without delaying the others.
- [ ] Add overdue nudges
  - Once a day, at a time the user picks, send one message listing Tasks that became Overdue
    since the last one, through the user's channels. Never one message per Task.
  - Off, or on with a time, in Settings. Tasks without a date never nudge.
  - Tapping it opens Today.
- [ ] Add API tokens
  - Settings → API tokens: create a named token (shown once, stored hashed), choose read-only or
    read-write, see when it was last used, revoke it.
  - `Authorization: Bearer` works on `/api/v1` alongside sessions; token requests skip CSRF.
  - Rate-limited by `NUDGE_API_TOKEN_RATE_LIMIT`.
  - Needed first by MCP, scripts and native apps.

## Medium impact

- [x] Add the Matrix view (#103, split into #104 to #106)
- [ ] Add Review (replaces "report", "streaks and completion stats", "summarize" and "AI review")
  - A page for any period (this week, this month, a custom range): Tasks completed per day,
    by Project and by Tag, share closed on time, and current and best streak of days with at
    least one completed Task.
  - Lists what was completed, grouped by Project, ready to copy as markdown.
  - Optional AI summary of that list, off unless `NUDGE_LLM_URL` and `NUDGE_LLM_API_KEY` are
    set. The page says which text leaves the server.
- [ ] Add Habits
  - A Habit is not a Task: a name, a schedule (every day, chosen weekdays or N times a week)
    and a daily goal count. The user checks it in once per day, or up to the goal.
  - Shows current and best streak and a year heatmap. Today shows a strip of today's Habits.
  - Optional Reminder per Habit, delivered like Task Reminders.
  - Add Habit, Check-in and Streak to GLOSSARY.md.
- [ ] Add a daily digest
  - At a time the user picks, send Today's Tasks and the Overdue count through their channels;
    email gets an HTML version.
  - Shares the schedule setting with overdue nudges, so users who want both get one message.
- [ ] Add password reset by email
  - "Forgot password" on the sign-in page emails a link valid for one hour. This resets a
    password; it never creates an account.
  - Same response whether the email exists; rate-limited like sign-in.
  - Hidden when `NUDGE_EMAIL_URL` is the console backend.
- [ ] Add two-factor auth (TOTP)
  - Enroll by scanning a QR code and confirming one code; get ten single-use recovery codes.
  - Sign-in asks for a code after the password; codes count toward `NUDGE_LOGIN_RATE_LIMIT`.
  - An admin can turn it off for a user who lost their device.
- [ ] Add OIDC / SSO sign-in
  - Configured by `NUDGE_OIDC_ISSUER`, `NUDGE_OIDC_CLIENT_ID` and `NUDGE_OIDC_CLIENT_SECRET`.
  - Signs in the existing account whose email matches the verified email claim. Never creates
    accounts, to keep the no-sign-up rule.
  - `NUDGE_PASSWORD_LOGIN_ENABLED=false` hides the password form for SSO-only deployments.
- [ ] Add webhooks on Task events
  - Per-user URLs subscribed to `task.created`, `task.updated`, `task.closed`, `task.deleted`.
  - The body is the Task as the API returns it, signed with an HMAC-SHA256 header.
  - The worker retries with backoff, keeps the last 20 deliveries for the Settings page, and
    turns a webhook off after 20 failures in a row.
  - Private-network targets are refused unless `NUDGE_WEBHOOK_ALLOW_PRIVATE=true`.
- [ ] Add an MCP server (needs API tokens)
  - Served at `/mcp` over streamable HTTP with token auth.
  - Tools: search Tasks, list Today and Overdue, add a Task from Quick add text, close a Task,
    add a Comment. Read-only tokens see only the read tools.
- [ ] Add a focus timer with YouTube playlist support
  - Focus and break lengths are user settings (25 and 5 minutes by default). A session can be
    tied to a Task; the Task shows its total focus time.
  - Timing uses start timestamps so a background tab stays correct; Web Push fires at the end.
  - An optional YouTube playlist URL plays through `youtube-nocookie.com` during focus and
    pauses on breaks.
- [ ] Add Templates
  - Save a Task with its Subtasks, Tags, Description and Reminders, or a Project with its
    Sections and Tasks, as a Template.
  - Creating from a Template keeps dates relative to the day it is used.

## Low impact

- [ ] Limit Tags and People in the sidebar
  - Show the first 8 in their sort order, then "Show all (N)". The choice is remembered with the
    other sidebar sections.
- [ ] Add countdown
  - Mark a dated Task as a countdown; its row and the Today header show "12 days left".
  - Add Countdown to GLOSSARY.md.
- [ ] Add Share to Nudge on phones
  - The installed PWA registers a share target. Sharing a link or text opens Quick add with the
    shared title, and the URL goes into the Description.
- [ ] Add two-way CalDAV sync (PLAN.md: Later)
