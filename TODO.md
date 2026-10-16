# TODO

## High impact

- [x] Add a Board layout for Projects (#70)
- [ ] Add export
  - Settings → Export builds a ZIP of the signed-in user's data: one JSON file with everything,
    read back without loss, a CSV of Tasks for spreadsheets, and Attachments as files.
  - Includes Closed Tasks, archived Projects and Trash; purged rows are gone.
  - Built in the worker; a notification links to the download, which expires after 24 hours.
- [ ] Add Smart lists (replaces "saved filters" and "smart lists")
  - A Smart list is a named filter in the sidebar: Projects or Folders, Tags, People, Priority,
    Status and a date rule (Overdue, today, next N days, no date), combined with all or any.
  - Opens like a Project, with List, Board by Project and Calendar Layouts.
  - Quick add inside it fills the filter's Project, Tags and Priority when there is exactly one.
  - Filtering runs on the server and shares one query module with Search.
  - Add "Smart list" to GLOSSARY.md (avoid: saved filter, custom view).
- [ ] Add email notifications
  - Settings → Notifications: turn email on or off and send a test. Mail goes to the account
    email through `NUDGE_EMAIL_URL`.
  - Reminders go to Web Push and, when it is on, email. A failed email retries in the worker
    without delaying Web Push.
- [ ] Add overdue nudges
  - Once a day, at a time the user picks, send one message listing Tasks that became Overdue
    since the last one, through the user's channels. Never one message per Task.
  - Off, or on with a time, in Settings. Tasks without a date never nudge.
  - Tapping it opens Today.

## Medium impact

- [x] Add the Matrix view (#103, split into #104 to #106)
- [ ] Add Review (replaces "report", "streaks and completion stats", "summarize" and "AI review")
  - A page for any period (this week, this month, a custom range): Tasks completed per day,
    by Project and by Tag, share closed on time, and current and best streak of days with at
    least one completed Task.
  - Lists what was completed, grouped by Project, ready to copy as markdown.
  - Optional AI summary of that list, off unless `NUDGE_LLM_URL` and `NUDGE_LLM_API_KEY` are
    set. The page says which text leaves the server.
- [ ] Add Habits (#114)
- [ ] Add a daily digest
  - At a time the user picks, send Today's Tasks and the Overdue count through their channels;
    email gets an HTML version.
  - Shares the schedule setting with overdue nudges, so users who want both get one message.
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

## Low impact

- [ ] Add Countdown (#113)
- [ ] Add Share to Nudge on phones
  - The installed PWA registers a share target. Sharing a link or text opens Quick add with the
    shared title, and the URL goes into the Description.
