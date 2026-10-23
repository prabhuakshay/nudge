# Changelog

All notable changes to Nudge are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-23

### Added

- Attachments can be stored in Cloudflare R2 or any other S3-compatible bucket (Backblaze B2,
  MinIO, Wasabi, AWS S3) instead of the server's disk, configured entirely in `.env`. Files stay
  private: only their owner can download them, through Nudge. Nudge refuses to start if only some
  of the bucket settings are filled in, and names the missing ones. Deployments that set nothing
  keep using the disk as before. (#134)
- A setup wizard, `scripts/setup-r2.sh`, tells you what to click in the Cloudflare dashboard to
  create an R2 bucket and a token limited to it. It then writes the settings to `.env` if you
  want, copies your existing Attachments into the bucket and tests it. (#134)
- Two commands for self-hosters: `check_storage` tests the bucket at any time, for example after
  rotating keys, and `copy_media_to_storage` copies Attachments from disk to the bucket. Running
  the copy again is safe, and it never deletes the local files. (#134)

## [0.1.1] - 2026-10-23

### Fixed

- The container image is now published at `ghcr.io/prabhuakshay/nudge`. The 0.1.0 image was held
  back because it carried packages with known security vulnerabilities; this one ships without
  them.

## [0.1.0] - 2026-10-23

The first release of Nudge, a self-hostable task manager in the spirit of TickTick.

### Added

**Tasks**

- Capture Tasks in the Inbox with Quick add, which understands `#tag`, `~project`, `!priority`,
  `@person`, dates, times and Repeat phrases such as "every other Monday".
- Open a Task in a drawer to edit its title, Description, Status (including Won't do and
  Blocked), Priority, due date, time or range, and see its Activity history.
- Nest Subtasks four levels deep; completing a parent completes its Subtasks.
- Repeat dated Tasks on any schedule, see future Occurrences on the Calendar, and mark a Task as
  a Countdown to show the days left.
- Pin, duplicate, drag to reorder or nest, and change several Tasks at once from a selection bar,
  with Undo for most changes.
- Add Comments, attach files, and Mention People you track.

**Organizing**

- Projects grouped in Folders, with Sections, a List or Board Layout per Project, and archiving.
- Tags to label Tasks across Projects, with merge and reorder.
- Today, Upcoming, All, Search, and a Matrix view that sorts Tasks by urgency and importance.
- A Calendar with Month, Week and Day modes, where you can drag and resize Tasks.
- Habits done every day, on chosen weekdays or a number of times a week, with Goals, Check-ins,
  Streaks and a heatmap of the past year.
- Trash for deleted Tasks and Projects, restored or purged automatically after a set time.

**Staying on track**

- Reminders by browser push, with Complete and Snooze right from the notification, plus an in-app
  notification center.
- A private Calendar feed for any calendar app, which you can turn on, reset or off.

**Everywhere**

- A Ctrl+K command bar and keyboard shortcuts for nearly everything (press `?` for the list).
- An installable app that works on phones and desktops, in light, dark or system theme.
- Your own time zone, name and password in Settings. Accounts are created by an admin; there is
  no public sign-up.

**Self-hosting**

- A ready-to-run image for amd64 and arm64 at `ghcr.io/prabhuakshay/nudge`, run with Docker
  Compose against your own PostgreSQL. Every setting lives in `.env`.

[Unreleased]: https://github.com/prabhuakshay/nudge/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/prabhuakshay/nudge/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/prabhuakshay/nudge/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/prabhuakshay/nudge/releases/tag/v0.1.0
