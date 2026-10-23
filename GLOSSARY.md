# Nudge

A self-hostable personal task manager in the spirit of TickTick. Each account's data is private to
that account.

## Organising

**Project**:
A named container of tasks, with a colour and an icon, that can be archived or deleted.
_Avoid_: List

**Inbox**:
Where Tasks that belong to no Project live. Every user has exactly one; it can't be renamed,
archived, deleted or put in a Folder.

**Archived**:
A Project put away out of the sidebar's main list; its Tasks are hidden from every view but
its own, and it can be brought back unchanged. A Habit can be Archived too: it keeps its
Check-ins but leaves Today and stops sending Reminders.
_Avoid_: Hidden, closed

**Folder**:
A named group of Projects in the sidebar.
_Avoid_: Group, space

**Section**:
A named, ordered group of Tasks inside one Project (never the Inbox); a Task belongs to at most
one Section, and leaves it when the Task moves to another Project.
_Avoid_: Column, heading, group

**Tag**:
A label attached to any number of tasks across Projects. Tags are flat: a Tag never contains
another Tag.
_Avoid_: Label, category

## Tasks

**Task**:
One thing to do, owned by one user and living in either one Project or the Inbox.
_Avoid_: Todo, item

**Quick add**:
The single line for creating a Task where typed symbols and phrases set its Project, Tags,
Priority, date, Repeat and Mentions as you type.
_Avoid_: Smart add, magic input

**Subtask**:
A Task whose parent is another Task; it always shares its root Task's Project. Nesting stops at
four levels.
_Avoid_: Checklist item, child task

**Description**:
The single markdown body of a Task.
_Avoid_: Notes, content

**Priority**:
How much a Task matters: None, or P1 (matters most) through P4. P1 and P2 make a Task
Important in the Matrix.
_Avoid_: Importance, level

**Status**:
Where a Task stands: Open, Completed, Won't do, or Blocked.

**Closed**:
A Task whose Status is Completed or Won't do. A Closed Task never has an open Subtask.

**Pinned**:
A root Task held at the top of every list it appears in.

**Blocked reason**:
The optional free-text reason a Blocked Task is waiting, which may mention a Person.

**Repeat**:
The rule that makes a root Task come back on a schedule. Closing it moves the same Task on to its
next occurrence instead of closing it for good.
_Avoid_: Recurrence, recurring task

**Occurrence**:
One date in a repeating Task's schedule. The Task always shows its current occurrence.
_Avoid_: Instance

**Reminder**:
A notification set to fire at a fixed distance before or after a Task's date, or at a Habit's
chosen time of day on its scheduled days until that day's goal is met.
_Avoid_: Alert, alarm

**Countdown**:
A dated Task marked to show how many days are left until its date.
_Avoid_: Countdown timer, event

**Snooze**:
Delaying a fired Reminder by a chosen amount without changing the Task.

**Comment**:
A timestamped markdown entry added to a Task after it is created; a Task can have many.
_Avoid_: Note

**Activity**:
The history of changes made to a Task, shown on that Task.
_Avoid_: Audit log, history

**Trash**:
Where deleted Tasks and Projects wait, for a year by default, before they are gone for good.
_Avoid_: Bin, archive

**Attachment**:
A file uploaded against a Task.
_Avoid_: File, upload

## Views

**Today**:
The view of Tasks due today, ranges that include today, and everything Overdue.

**Upcoming**:
The view of Tasks due after today, grouped by day for a week and by month after that.
_Avoid_: Next 7 days, scheduled

**All**:
The view of every open Task in the Inbox and every Project that isn't archived, grouped by date,
with undated Tasks last.
_Avoid_: Everything, all tasks list

**Overdue**:
An open Task whose date has passed: a timed Task once its time passes, an all-day Task once its
day ends, a range once its end passes.
_Avoid_: Late, missed

**Matrix**:
The View that sorts every open root Task the All view shows into four Quadrants by whether it
is Important and whether it is Urgent.
_Avoid_: Eisenhower view, priority grid

**Quadrant**:
One of the Matrix's four groups: Urgent & Important, Important not urgent, Urgent not
important, or Neither.

**Important**:
A Task whose Priority is P1 or P2.

**Urgent**:
A Task that is Overdue, or whose date (or a range's start) falls today or tomorrow. A Task with
no date is never Urgent.

**Layout**:
How a View or Project arranges its Tasks: List, Board or Calendar. A View decides which Tasks
show; a Layout decides how they are drawn.
_Avoid_: View mode, display

**Board**:
The Layout that shows a Project's Sections as columns of Task cards.
_Avoid_: Kanban, columns view

**Calendar**:
The View of every dated Task drawn on a calendar, a month, week or day at a time.
_Avoid_: Schedule, planner

**Mode**:
How much of the Calendar shows at a time: Month, Week or Day. Switching Mode zooms the same
Calendar in or out; it is not a Layout, which decides how a View's Tasks are drawn.
_Avoid_: Calendar view, zoom, period

**Calendar feed**:
A private, read-only address a calendar app subscribes to, showing each open dated Task as an
event on its current date.
_Avoid_: iCal export, calendar sync

**Tab**:
One of up to five places in the phone's bottom bar, each opening a View, Habits, a Project, a
Tag or a Person. Each user chooses and orders their own Tabs.
_Avoid_: Pinned view, shortcut, favourite

**Browse**:
The Tab that is always last and can't be removed; it lists everything the other Tabs don't
show, including Settings and Trash.
_Avoid_: More, menu

## People

**Person**:
A name in one user's private address book that can be mentioned; not an account.
_Avoid_: Contact, user, member

**Mention**:
A reference to a Person written with `@` in a Task's title, Description, Comments or Blocked
reason. It always shows the Person's current name, and it puts the Task in that Person's view.

## Habits

**Habit**:
Something the user wants to do regularly, tracked by Check-ins rather than closed; not a Task.
_Avoid_: Routine, recurring task

**Check-in**:
A record that the user did a Habit on a given day, counted toward that day's goal.
_Avoid_: Log, tick, completion

**Frequency**:
When a Habit is meant to be done: every day, on chosen weekdays, or a number of times a week.
_Avoid_: Repeat, schedule, recurrence

**Goal**:
How many Check-ins a Habit needs on one day for that day to count as done; one unless set.
_Avoid_: Target, quota

**Streak**:
The current run of a Habit's done days in a row, skipping days its Frequency doesn't ask for;
for a number-of-times-a-week Habit, the run of weeks that met the number. The best Streak is
the longest run ever.
_Avoid_: Chain, combo
