# Habits are not Tasks

A Habit is its own model in its own `apps/habits` app, tracked by daily Check-ins against a Goal,
and its Frequency is stored as plain fields rather than an RRULE. We considered making a Habit a
repeating Task, since Repeat already brings a schedule, Reminders and Today, but a repeating Task
moves on to its next Occurrence when closed and keeps no per-day history, while a Habit needs
every past day (for Streaks, the heatmap and back-filled Check-ins) and is never closed. Bending
Task to fit would add Habit-only branches to Status, Repeat and every View query.

## Considered options

- **Repeating Task with a Habit flag**: rejected; Check-ins, counts per day and Streaks have no
  place in the Task model, and every Task View would need to exclude Habits.
- **Habit model inside `apps/tasks`**: rejected; `apps/tasks` stays together because its models
  are coupled through services (Status cascades, Project delete, merges). A Habit shares none of
  that, so a separate app keeps the boundary visible.
- **Frequency as an RRULE**: rejected; "N times a week, any days" has no RRULE form, so it would
  need a side field anyway, and the project rule that Repeat is always an RRULE applies to Repeat,
  which Frequency is not.

## Consequences

- Habit Reminders fire at a time of day rather than an offset from a date, so they are a field on
  the Habit, not rows of the Task `Reminder` model. `Notification` gains an optional `habit` link
  beside `reminder`.
- Habits stay out of Trash, Activity, Search and the Calendar feed, which are defined around Tasks.
