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
its own, and it can be brought back unchanged.
_Avoid_: Hidden, closed

**Folder**:
A named group of Projects in the sidebar.
_Avoid_: Group, space

**Tag**:
A label attached to any number of tasks across Projects. Tags are flat: a Tag never contains
another Tag.
_Avoid_: Label, category

## Tasks

**Task**:
One thing to do, owned by one user and living in either one Project or the Inbox.
_Avoid_: Todo, item

**Subtask**:
A Task whose parent is another Task; it always shares its root Task's Project. Nesting stops at
four levels.
_Avoid_: Checklist item, child task

**Description**:
The single markdown body of a Task.
_Avoid_: Notes, content

**Priority**:
How urgent a Task is: None, or P1 (most urgent) through P4.
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
A notification set to fire at a fixed distance before or after a Task's date.
_Avoid_: Alert, alarm

**Snooze**:
Delaying a fired Reminder by a chosen amount without changing the Task.

**Comment**:
A timestamped markdown entry added to a Task after it is created; a Task can have many.
_Avoid_: Note

**Activity**:
The history of changes made to a Task, shown on that Task.
_Avoid_: Audit log, history

**Trash**:
Where deleted Tasks and Projects wait for 30 days before they are gone for good.
_Avoid_: Bin, archive

**Attachment**:
A file uploaded against a Task.
_Avoid_: File, upload

## People

**Person**:
A name in one user's private address book that can be mentioned; not an account.
_Avoid_: Contact, user, member

**Mention**:
A reference to a Person written with `@` in a Task's title, Description, Comments or Blocked
reason. It always shows the Person's current name, and it puts the Task in that Person's view.
