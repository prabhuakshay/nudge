# Nudge

A self-hostable personal task manager in the spirit of TickTick. Each account's data is private to
that account.

## Organising

**Project**:
A named container of tasks, with a colour and emoji, that can be archived or deleted.
_Avoid_: List

**Inbox**:
The built-in Project that new tasks land in when no Project is given; it can't be deleted.

**Folder**:
A named group of Projects in the sidebar.
_Avoid_: Group, space

**Tag**:
A label attached to any number of tasks across Projects; a Tag may have one parent Tag.
_Avoid_: Label, category

## Tasks

**Task**:
One thing to do, owned by one user and living in exactly one Project.
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

**Blocked reason**:
The optional free-text reason a Blocked Task is waiting, which may mention a Person.

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
A reference to a Person written with `@` in a Task's title, Description or comments.
