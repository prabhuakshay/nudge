/* What the view Quick add sits in gives a new Task, and whether the Task then shows in it. */

import type { Person } from "@/features/people/people";
import { splitMentions } from "@/features/people/mentions";

import type { QuickAdd, QuickAddTag } from "./quick-add";
import type { DatesIn, NewTask, SidebarProject, Task, TaskPriority } from "./tasks";

/** The list Quick add sits above. */
export type QuickAddView =
  | { kind: "project"; project: SidebarProject }
  | { kind: "today" | "upcoming"; today: string; tomorrow: string }
  | { kind: "all" }
  | { kind: "calendar"; label: string; dates: NonNullable<DatesIn> }
  | { kind: "tag"; tag: QuickAddTag }
  | { kind: "person"; person: Person }
  /** A Matrix Quadrant: the Priority that makes a Task Important there, and today if Urgent. */
  | { kind: "quadrant"; priority: Exclude<TaskPriority, 0> | null; today: string | null };

/** A removable chip a view starts Quick add with, so new Tasks land where the user is looking. */
export type ViewDefault =
  | { kind: "project"; project: SidebarProject }
  | { kind: "date"; label: string; dates: NonNullable<DatesIn> }
  | { kind: "priority"; priority: Exclude<TaskPriority, 0> }
  | { kind: "tag"; tag: QuickAddTag }
  | { kind: "person"; person: Person };

function todayChip(today: string): ViewDefault {
  return { kind: "date", label: "Today", dates: { due_date: today } };
}

/** A Quadrant's chips: its Priority, then today. */
function quadrantDefaults(view: Extract<QuickAddView, { kind: "quadrant" }>): ViewDefault[] {
  return [
    ...(view.priority === null ? [] : [{ kind: "priority", priority: view.priority } as const]),
    ...(view.today === null ? [] : [todayChip(view.today)]),
  ];
}

/**
 * The chips a view starts with: its Project, today, tomorrow, the Calendar slot's date and time,
 * its Tag, its Person, or a Quadrant's Priority and today; none in All.
 */
export function viewDefaults(view: QuickAddView): ViewDefault[] {
  switch (view.kind) {
    case "project":
      // The Inbox is where Tasks go anyway.
      return view.project.is_inbox ? [] : [view];
    case "all":
      return [];
    case "calendar":
      return [{ kind: "date", label: view.label, dates: view.dates }];
    case "today":
      return [todayChip(view.today)];
    case "upcoming":
      return [{ kind: "date", label: "Tomorrow", dates: { due_date: view.tomorrow } }];
    case "quadrant":
      return quadrantDefaults(view);
    case "tag":
    case "person":
      return [view];
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

/** The view's chips still in play: a typed Project, date or Priority takes the place of the view's. */
export function keptDefaults(parsed: QuickAdd, given: readonly ViewDefault[]): ViewDefault[] {
  return given.filter(
    (chip) =>
      !(chip.kind === "project" && parsed.projectId !== null) &&
      !(chip.kind === "date" && parsed.dates !== null) &&
      !(chip.kind === "priority" && parsed.priority > 0),
  );
}

/** A new Task's fields besides its title, from what was typed and the view's chips. */
export function newTaskFields(
  parsed: QuickAdd,
  given: readonly ViewDefault[],
  inboxId: number,
): Omit<NewTask, "title"> {
  let projectId = inboxId;
  let tagIds = parsed.tagIds;
  const fields: Omit<NewTask, "title"> = {};
  for (const chip of given) {
    if (chip.kind === "project") projectId = chip.project.id;
    if (chip.kind === "date") fields.dates = chip.dates;
    if (chip.kind === "priority") fields.priority = chip.priority;
    if (chip.kind === "tag" && !tagIds.includes(chip.tag.id)) tagIds = [...tagIds, chip.tag.id];
  }
  return {
    project_id: parsed.projectId ?? projectId,
    ...fields,
    ...typedFields(parsed, tagIds),
  };
}

function mentions(title: string, personId: number) {
  return splitMentions(title).some((part) => typeof part !== "string" && part.id === personId);
}

/** The title with the view's Person mentioned at the end, unless it mentions them already. */
export function withGivenMention(title: string, given: readonly ViewDefault[]): string {
  const person = given.find((chip) => chip.kind === "person")?.person;
  if (!person || mentions(title, person.id)) return title;
  return `${title} [@${person.name}](person:${String(person.id)})`;
}

type DateView = Extract<QuickAddView, { kind: "calendar" | "today" | "upcoming" }>;

/** Whether a Task shows in a view chosen by the date its dates begin on. */
function showsOnDate(view: DateView, task: Task): boolean {
  const from = task.start_date ?? task.due_date;
  if (from === null) return false;
  switch (view.kind) {
    case "calendar":
      return true;
    case "today":
      return from <= view.today;
    case "upcoming":
      return from > view.today;
  }
}

/** Whether a Task shows in the view, so Quick add can point to one that landed elsewhere. */
export function showsTask(view: QuickAddView, task: Task): boolean {
  switch (view.kind) {
    case "project":
      return task.project_id === view.project.id;
    case "all":
    case "quadrant":
      // Quick add can't put a Task in an archived Project, so every new Task shows in All and in
      // the Matrix, if not always in the Quadrant it was added in.
      return true;
    case "calendar":
    case "today":
    case "upcoming":
      return showsOnDate(view, task);
    case "tag":
      return task.tags.some((tag) => tag.id === view.tag.id);
    case "person":
      return mentions(task.title, view.person.id);
  }
}
