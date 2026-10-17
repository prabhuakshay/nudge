/*
 * Undo for every Task change. Each change here captures what puts its Tasks back as they were,
 * makes the change, then offers Undo in a toast and on Mod+Z. Undo runs the inverse through the
 * Task cache, so every view shows the Tasks as they were before the server answers.
 */

import { useCallback, useMemo } from "react";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { plainMentions } from "@/features/people/mentions";
import { hasTag, type Tag } from "@/features/tags/tags";
import { trashQuery, useRestoreFromTrash } from "@/features/trash/trash";
import { toastWithUndo } from "@/lib/undo-toast";

import { datesOf, type Dates } from "./due";
import { advances, statusToast } from "./repeat";
import { useTaskMutation, type TaskChange, type TaskPatch } from "./task-cache";
import { STATUS_VERB } from "./task-properties";
import { chosenTops } from "./task-tree";
import {
  patchTask,
  type DatesIn,
  type SidebarProject,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "./tasks";

/** A Task a Status change touched, with the Status and Blocked reason it had before. */
export type AffectedTask = components["schemas"]["AffectedTaskOut"];
type TaskPlace = components["schemas"]["TaskPlace"];
type BulkAction = components["schemas"]["TaskBulkIn"]["action"];
type Repeat = Pick<Task, "repeat_rule" | "repeat_from">;

/** A Task's dates before a change, with the Reminders, Repeat and Countdown that went with them. */
type PriorDates = { id: number; dates: DatesIn; reminders?: number[] } & Went;
type Went = { repeat?: Repeat; countdown?: boolean };

/** A Task whose dates come off, with the Repeat and Countdown mark that go with them. */
type UndatedTask = Dates & Repeat & Pick<Task, "id" | "countdown">;

/** The PATCH that gives a Task back its dates, and what went with them. */
function datesBack({ id, dates, reminders, repeat, countdown }: PriorDates) {
  return { id, dates, ...(reminders && { reminders }), ...repeat, ...(countdown && { countdown }) };
}

/**
 * Whether a bulk dates action can put the Task back: it has dates to set and nothing else went.
 * The rest go back one PATCH each.
 */
function bulkDatable(prior: PriorDates): prior is PriorDates & { dates: NonNullable<DatesIn> } {
  return prior.dates !== null && !prior.reminders && !prior.repeat && !prior.countdown;
}

/** What puts Tasks back as they were before a change. */
export type TaskUndo =
  | { kind: "statuses"; affected: AffectedTask[] }
  | { kind: "priorities"; tasks: Pick<Task, "id" | "priority">[] }
  | { kind: "dates"; tasks: PriorDates[] }
  | { kind: "tag"; tag: Tag; tasks: Pick<Task, "id" | "tags">[] }
  | { kind: "places"; places: TaskPlace[] }
  | { kind: "trash"; ids: number[] };

/** How a toast names the Tasks: one by its title, several by how many: "3 tasks". */
function named(tasks: Task[]) {
  const [only] = tasks;
  return only && tasks.length === 1
    ? `“${plainMentions(only.title)}”`
    : `${String(tasks.length)} tasks`;
}

/** The ids of the items, in order. */
function idsOf(items: { id: number }[]) {
  return items.map((item) => item.id);
}

/** The items grouped by `key`, each group as the ids of its items with the key's value. */
function groupBy<T extends { id: number }, K>(items: T[], key: (item: T) => K) {
  const groups = new Map<string, { value: K; ids: number[] }>();
  for (const item of items) {
    const value = key(item);
    const name = JSON.stringify(value);
    const group = groups.get(name) ?? { value, ids: [] };
    group.ids.push(item.id);
    groups.set(name, group);
  }
  return [...groups.values()];
}

/** Apply one action to several Tasks in one request. */
async function bulk(ids: number[], action: BulkAction, fallback: string) {
  const { data, error } = await api.POST("/api/v1/tasks/bulk", { body: { ids, action } });
  if (!data) throw new Error(failureReason(error, fallback));
  return data;
}

const UNDO_FAILED = "Could not undo the change.";

/** Send what puts the Tasks back. Trash is the one inverse that goes elsewhere. */
function sendUndo(undo: Exclude<TaskUndo, { kind: "trash" }>): Promise<unknown> {
  switch (undo.kind) {
    case "statuses": {
      const statuses = undo.affected.map((prior) => ({
        id: prior.id,
        status: prior.prior_status,
        blocked_reason: prior.prior_blocked_reason,
      }));
      return bulk(idsOf(statuses), { kind: "statuses", statuses }, UNDO_FAILED);
    }
    case "priorities":
      return Promise.all(
        groupBy(undo.tasks, (task) => task.priority).map(({ ids, value }) =>
          bulk(ids, { kind: "priority", priority: value }, UNDO_FAILED),
        ),
      );
    case "dates": {
      const grouped = groupBy(undo.tasks.filter(bulkDatable), (prior) => prior.dates);
      const single = undo.tasks.filter((prior) => !bulkDatable(prior));
      return Promise.all([
        ...grouped.map(({ ids, value }) => bulk(ids, { kind: "dates", dates: value }, UNDO_FAILED)),
        ...single.map((prior) => patchTask(datesBack(prior))),
      ]);
    }
    case "tag": {
      const { tag } = undo;
      return Promise.all(
        groupBy(undo.tasks, (task) => hasTag(task, tag)).map(({ ids, value: had }) =>
          bulk(ids, { kind: had ? "add_tag" : "remove_tag", tag_id: tag.id }, UNDO_FAILED),
        ),
      );
    }
    case "places":
      return bulk(idsOf(undo.places), { kind: "place", places: undo.places }, UNDO_FAILED);
  }
}

/** The change that gives a Task back the Status and Blocked reason it had. */
function priorStatus(prior: AffectedTask): TaskChange {
  const patch = {
    id: prior.id,
    status: prior.prior_status,
    ...(prior.prior_status === "blocked" && { blocked_reason: prior.prior_blocked_reason }),
  };
  return { kind: "patch", patch };
}

/** How the Tasks look once Undo is done, to show before the server answers. */
function undoneChanges(undo: Exclude<TaskUndo, { kind: "trash" }>): TaskChange[] {
  switch (undo.kind) {
    case "statuses":
      return undo.affected.map(priorStatus);
    case "priorities":
      return undo.tasks.map(({ id, priority }) => ({ kind: "patch", patch: { id, priority } }));
    case "dates":
      return undo.tasks.map((prior) => ({ kind: "patch", patch: datesBack(prior) }));
    case "tag":
      return undo.tasks.map(({ id, tags }) => ({ kind: "patch", patch: { id, tags } }));
    case "places":
      // The server picks each Task's order key, so the lists show the places once they refetch.
      return [];
  }
}

/**
 * Report a change in a toast with Undo, which also Mod+Z runs, for changes made outside this
 * module such as completing a Task from its Reminder.
 */
export function useOfferUndo() {
  const { mutate: restore } = useRestoreFromTrash();
  const { mutate: putBack } = useTaskMutation({
    mutationFn: sendUndo,
    changes: undoneChanges,
  });
  return useCallback(
    (message: string, undo: TaskUndo) => {
      toastWithUndo(message, () => {
        if (undo.kind === "trash") restore(undo.ids.map((id) => ({ kind: "task", id })));
        else putBack(undo);
      });
    },
    [restore, putBack],
  );
}

/** What a change says it did, and what undoes it. */
type Offer = { message: string; undo: TaskUndo };

/** A change to make: how it looks before the server answers, and the request that makes it. */
type Edit = { changes?: TaskChange[]; send: () => Promise<Offer> };

const CHANGE_FAILED = "Could not change the tasks.";

/** The same fields patched on each of the Tasks. */
function patchEach(tasks: Task[], fields: Omit<TaskPatch, "id">): TaskChange[] {
  return tasks.map(({ id }) => ({ kind: "patch", patch: { id, ...fields } }));
}

/** One action on several Tasks in one request: how it looks, what it says and what undoes it. */
function bulkEdit(tasks: Task[], action: BulkAction, offer: Offer, changes: TaskChange[]): Edit {
  return {
    changes,
    send: async () => {
      await bulk(idsOf(tasks), action, CHANGE_FAILED);
      return offer;
    },
  };
}

/**
 * A Status change. One Task says what happened to it, such as a repeating Task moving on, which
 * stays where it is until the server says; several say how many changed. The relatives it closes
 * or reopens show once the lists refetch.
 */
function statusEdit(tasks: Task[], status: TaskStatus): Edit {
  const changes = patchEach(
    tasks.filter((task) => !advances(task, status)),
    { status },
  );
  const [only] = tasks;
  if (only && tasks.length === 1) {
    return {
      changes,
      send: async () => {
        const { task, affected } = await patchTask({ id: only.id, status });
        const message = statusToast(task, status, affected.length - 1);
        return { message, undo: { kind: "statuses", affected } };
      },
    };
  }
  return {
    changes,
    send: async () => {
      const { affected } = await bulk(idsOf(tasks), { kind: "status", status }, CHANGE_FAILED);
      const message = `${STATUS_VERB[status]} ${named(tasks)}`;
      return { message, undo: { kind: "statuses", affected } };
    },
  };
}

/** What removing the due date removed, as its toast says: "Date, reminders and repeat removed". */
function removedMessage(reminders: boolean, repeat: boolean): string {
  const removed = ["Date", ...(reminders ? ["reminders"] : []), ...(repeat ? ["repeat"] : [])];
  const last = removed.pop() ?? "";
  return `${removed.length > 0 ? `${removed.join(", ")} and ${last}` : last} removed`;
}

/** Taking a Task's dates off, which takes its Reminders, Repeat and Countdown on the server. */
function removeDatesEdit(task: UndatedTask, reminders: number[]): Edit {
  const repeat = task.repeat_rule
    ? { repeat_rule: task.repeat_rule, repeat_from: task.repeat_from }
    : undefined;
  const { id, countdown } = task;
  const prior = { id, dates: datesOf(task), reminders, countdown, ...(repeat && { repeat }) };
  return {
    changes: [{ kind: "patch", patch: { id: task.id, dates: null } }],
    send: async () => {
      await patchTask({ id: task.id, dates: null });
      const message = removedMessage(reminders.length > 0, repeat !== undefined);
      return { message, undo: { kind: "dates", tasks: [prior] } };
    },
  };
}

/**
 * Moving Tasks first into a Project; the server says where each was, for Undo. A chosen Subtask
 * of a chosen ancestor goes with it, as `rows` show.
 */
function moveEdit(tasks: Task[], { id: projectId, name }: SidebarProject, rows: Task[]): Edit {
  const tops = chosenTops(tasks, rows);
  return {
    changes: tops.map(({ id }) => ({ kind: "project", taskId: id, projectId })),
    send: async () => {
      const action = { kind: "move", project_id: projectId } as const;
      const { moved_from: places } = await bulk(idsOf(tasks), action, CHANGE_FAILED);
      const message = `Moved ${named(tasks)} to “${name}”`;
      return { message, undo: { kind: "places", places } };
    },
  };
}

/** Moving Tasks to Trash, each with its Subtasks; Undo brings back each unit Trash took. */
function removeEdit(tasks: Task[], rows: Task[]): Edit {
  const units = idsOf(chosenTops(tasks, rows));
  const undo = { kind: "trash", ids: units } as const;
  const [only] = tasks;
  if (!only || tasks.length > 1) {
    const offer = { message: `Moved ${named(tasks)} to Trash`, undo };
    const changes = tasks.map(({ id }): TaskChange => ({ kind: "remove", taskId: id }));
    return bulkEdit(tasks, { kind: "delete" }, offer, changes);
  }
  return {
    changes: [{ kind: "remove", taskId: only.id }],
    send: async () => {
      const { error } = await api.DELETE("/api/v1/tasks/{task_id}", {
        params: { path: { task_id: only.id } },
      });
      if (error) throw new Error(failureReason(error, "Could not delete the task."));
      return { message: `Moved ${named(tasks)} to Trash`, undo };
    },
  };
}

/** Putting a Tag on Tasks or taking it off; Undo leaves each Task with the Tags it had. */
function tagEdit(tasks: Task[], tag: Tag, add: boolean): Edit {
  const them = named(tasks);
  const message = add ? `Added “${tag.name}” to ${them}` : `Removed “${tag.name}” from ${them}`;
  const undo = { kind: "tag", tag, tasks: tasks.map(({ id, tags }) => ({ id, tags })) } as const;
  const action = { kind: add ? "add_tag" : "remove_tag", tag_id: tag.id } as const;
  const tagged = (task: Task): TaskChange => {
    const others = task.tags.filter((each) => each.id !== tag.id);
    return { kind: "patch", patch: { id: task.id, tags: add ? [...others, tag] : others } };
  };
  const changes = tasks.map(tagged);
  return bulkEdit(tasks, action, { message, undo }, changes);
}

/**
 * The changes to Tasks that offer Undo, each for one Task or several. Each says what it did in a
 * toast whose Undo, or Mod+Z, puts every Task back exactly as it was.
 */
export function useUndoableTaskChanges() {
  const offer = useOfferUndo();
  const { mutate: change } = useTaskMutation({
    mutationFn: (edit: Edit) => edit.send(),
    changes: (edit) => edit.changes ?? [],
    onSuccess: ({ message, undo }) => {
      offer(message, undo);
    },
    alsoRefetch: [trashQuery.queryKey],
  });

  return useMemo(
    () => ({
      /** Set the Tasks' Status; Undo also puts back the relatives it closed or reopened. */
      setStatus: (tasks: Task[], status: TaskStatus) => {
        change(statusEdit(tasks, status));
      },
      /** Set the Tasks' Priority; Undo gives each its own back. */
      setPriority: (tasks: Task[], priority: TaskPriority) => {
        const undo = {
          kind: "priorities",
          tasks: tasks.map(({ id, priority }) => ({ id, priority })),
        } as const;
        const message = `Changed the priority of ${named(tasks)}`;
        const changes = patchEach(tasks, { priority });
        change(bulkEdit(tasks, { kind: "priority", priority }, { message, undo }, changes));
      },
      /** Give the Tasks a due date; Undo gives each its own dates back, or none. */
      setDueDate: (tasks: Task[], dueDate: string) => {
        const undo = {
          kind: "dates",
          tasks: tasks.map((task) => ({ id: task.id, dates: datesOf(task) })),
        } as const;
        const message = `Changed the date of ${named(tasks)}`;
        const dates = { due_date: dueDate };
        const changes = patchEach(tasks, { dates });
        change(bulkEdit(tasks, { kind: "dates", dates }, { message, undo }, changes));
      },
      /** Take a Task's dates off; `reminders` are the offsets of the Reminders that go with them. */
      removeDates: (task: UndatedTask, reminders: number[]) => {
        change(removeDatesEdit(task, reminders));
      },
      /** Put a Tag on the Tasks. */
      addTag: (tasks: Task[], tag: Tag) => {
        change(tagEdit(tasks, tag, true));
      },
      /** Take a Tag off the Tasks. */
      removeTag: (tasks: Task[], tag: Tag) => {
        change(tagEdit(tasks, tag, false));
      },
      /**
       * Move the Tasks first into a Project; Undo puts each back in its old place. `rows` are the
       * list's rows, to tell which go with a chosen ancestor.
       */
      moveTo: (tasks: Task[], project: SidebarProject, rows: Task[] = tasks) => {
        change(moveEdit(tasks, project, rows));
      },
      /** Move Tasks to Trash. `rows` are the list's rows, to tell which go with a chosen parent. */
      remove: (tasks: Task[], rows: Task[] = tasks) => {
        change(removeEdit(tasks, rows));
      },
    }),
    [change],
  );
}
