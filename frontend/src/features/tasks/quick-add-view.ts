/* What the view Quick add sits in gives a new Task, and whether the Task then shows in it. */

import type { Person } from "@/features/people/people";
import { splitMentions } from "@/features/people/mentions";

import type { QuickAdd, QuickAddTag } from "./quick-add";
import type { DatesIn, NewTask, SidebarProject, Task } from "./tasks";

/** The list Quick add sits above. */
export type QuickAddView =
  | { kind: "project"; project: SidebarProject }
  | { kind: "today" | "upcoming"; today: string; tomorrow: string }
  | { kind: "all" }
  | { kind: "tag"; tag: QuickAddTag }
  | { kind: "person"; person: Person };

/** A removable chip a view starts Quick add with, so new Tasks land where the user is looking. */
export type ViewDefault =
  | { kind: "project"; project: SidebarProject }
  | { kind: "date"; label: string; dates: NonNullable<DatesIn> }
  | { kind: "tag"; tag: QuickAddTag }
  | { kind: "person"; person: Person };

/** The chip a view starts with: its Project, today, tomorrow, its Tag or its Person; none in All. */
export function viewDefault(view: QuickAddView): ViewDefault | null {
  switch (view.kind) {
    case "project":
      // The Inbox is where Tasks go anyway.
      return view.project.is_inbox ? null : view;
    case "all":
      return null;
    case "today":
      return { kind: "date", label: "Today", dates: { due_date: view.today } };
    case "upcoming":
      return { kind: "date", label: "Tomorrow", dates: { due_date: view.tomorrow } };
    case "tag":
    case "person":
      return view;
  }
}

/** The Priority, Tags, dates and Repeat typed in Quick add as a new Task's fields, leaving out unset ones. */
export function typedFields(
  parsed: QuickAdd,
  tagIds: readonly number[] = parsed.tagIds,
): Pick<NewTask, "priority" | "tag_ids" | "tags" | "dates" | "repeat_rule"> {
  return {
    ...(parsed.priority > 0 && { priority: parsed.priority }),
    ...(tagIds.length > 0 && { tag_ids: [...tagIds] }),
    ...(parsed.newTags.length > 0 && { tags: parsed.newTags }),
    ...(parsed.dates && { dates: parsed.dates }),
    ...(parsed.repeatRule && { repeat_rule: parsed.repeatRule }),
  };
}

/** The view's chip still in play: a typed Project or date takes the place of the view's. */
export function keptDefault(parsed: QuickAdd, given: ViewDefault | null): ViewDefault | null {
  if (given?.kind === "project" && parsed.projectId !== null) return null;
  if (given?.kind === "date" && parsed.dates !== null) return null;
  return given;
}

/** A new Task's fields besides its title, from what was typed and the view's chip if kept. */
export function newTaskFields(
  parsed: QuickAdd,
  given: ViewDefault | null,
  inboxId: number,
): Omit<NewTask, "title"> {
  const givenProject = given?.kind === "project" ? given.project.id : null;
  const givenTag = given?.kind === "tag" && !parsed.tagIds.includes(given.tag.id);
  return {
    project_id: parsed.projectId ?? givenProject ?? inboxId,
    ...(given?.kind === "date" && { dates: given.dates }),
    ...typedFields(parsed, givenTag ? [...parsed.tagIds, given.tag.id] : parsed.tagIds),
  };
}

function mentions(title: string, personId: number) {
  return splitMentions(title).some((part) => typeof part !== "string" && part.id === personId);
}

/** The title with the view's Person mentioned at the end, unless it mentions them already. */
export function withGivenMention(title: string, given: ViewDefault | null): string {
  if (given?.kind !== "person" || mentions(title, given.person.id)) return title;
  return `${title} [@${given.person.name}](person:${String(given.person.id)})`;
}

/** Whether a Task shows in the view, so Quick add can point to one that landed elsewhere. */
export function showsTask(view: QuickAddView, task: Task): boolean {
  const from = task.start_date ?? task.due_date;
  switch (view.kind) {
    case "project":
      return task.project_id === view.project.id;
    case "all":
      // Quick add can't put a Task in an archived Project, so every new Task shows in All.
      return true;
    case "today":
      return from !== null && from <= view.today;
    case "upcoming":
      return from !== null && from > view.today;
    case "tag":
      return task.tags.some((tag) => tag.id === view.tag.id);
    case "person":
      return mentions(task.title, view.person.id);
  }
}
