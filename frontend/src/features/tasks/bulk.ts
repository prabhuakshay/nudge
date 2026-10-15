import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { trashQuery } from "@/features/trash/trash";
import type { SidebarTag } from "@/features/tags/tags";
import { toastWithUndo } from "@/lib/undo-toast";

import { useRestoreStatuses } from "./set-status";
import { STATUS_VERB } from "./task-properties";
import {
  refreshTasks,
  useUpdateTask,
  type SidebarProject,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "./tasks";

export type BulkAction = components["schemas"]["TaskBulkIn"]["action"];
type BulkChange = { ids: number[]; action: BulkAction };

/** Whether the Task has the Tag. */
export function hasTag(task: Task, tag: SidebarTag) {
  return task.tags.some((each) => each.id === tag.id);
}

/** "1 task" or "3 tasks". */
function tasksCount(count: number) {
  return count === 1 ? "1 task" : `${String(count)} tasks`;
}

/** The Tasks grouped by `key`, each group as the ids of its Tasks with the key's value. */
function groupBy<T extends Task, K>(tasks: T[], key: (task: T) => K) {
  const groups = new Map<string, { value: K; ids: number[] }>();
  for (const task of tasks) {
    const value = key(task);
    const name = JSON.stringify(value);
    const group = groups.get(name) ?? { value, ids: [] };
    group.ids.push(task.id);
    groups.set(name, group);
  }
  return [...groups.values()];
}

/** The Tasks none of whose ancestors among `tasks` is also in `tasks`: what Trash takes as units. */
function tops(chosen: Task[], tasks: Task[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ids = new Set(chosen.map((task) => task.id));
  return chosen.filter((task) => {
    for (let above = task.parent_id; above !== null; above = byId.get(above)?.parent_id ?? null) {
      if (ids.has(above)) return false;
    }
    return true;
  });
}

/** Apply one action to several Tasks in one request; the lists refresh once it's done. */
function useBulkChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, action }: BulkChange) => {
      const { data, error } = await api.POST("/api/v1/tasks/bulk", { body: { ids, action } });
      if (error) {
        throw new Error("detail" in error ? error.detail : "Could not change the tasks.");
      }
      return data;
    },
    onError: (error) => toast.error(error.message),
    onSettled: (_, __, { action }) =>
      Promise.all([
        refreshTasks(queryClient),
        action.kind === "delete" && queryClient.invalidateQueries(trashQuery),
      ]),
  });
}

/** Bring Tasks back from Trash without a toast for each, for a bulk delete's Undo. */
function useRestoreTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(
        ids.map((taskId) =>
          api.POST("/api/v1/tasks/{task_id}/restore", { params: { path: { task_id: taskId } } }),
        ),
      ),
    onSettled: () =>
      Promise.all([refreshTasks(queryClient), queryClient.invalidateQueries(trashQuery)]),
  });
}

/**
 * What the "N selected" bar does to the chosen Tasks, each in one request with one Undo toast.
 * `tasks` are all the list's rows, so a delete can tell which chosen Tasks go with a parent.
 * Undo puts back what each Task had before: its Status (with cascades), Priority, dates,
 * Project or Tags, or brings it back from Trash.
 */
export function useBulkActions(chosen: Task[], tasks: Task[]) {
  const { mutate: change } = useBulkChange();
  const { mutate: update } = useUpdateTask();
  const { mutate: restore } = useRestoreTasks();
  const { mutate: restoreStatuses } = useRestoreStatuses();
  const ids = chosen.map((task) => task.id);
  const count = tasksCount(chosen.length);

  const run = (action: BulkAction, message: string, undo: () => void) => {
    change(
      { ids, action },
      {
        onSuccess: () => {
          toastWithUndo(message, undo);
        },
      },
    );
  };
  /** Give each of `some` back its value of `key`, one request per distinct value. */
  const changeBack = <T extends Task, K>(
    some: T[],
    key: (task: T) => K,
    action: (value: K) => BulkAction,
  ) => {
    for (const group of groupBy(some, key)) change({ ids: group.ids, action: action(group.value) });
  };
  /** Put the Tag back on the Tasks that had it, and take it off the others. */
  const tagBack = (tag: SidebarTag) => {
    changeBack(
      chosen,
      (task) => hasTag(task, tag),
      (had) => ({ kind: had ? "add_tag" : "remove_tag", tag_id: tag.id }),
    );
  };

  return {
    setStatus: (status: TaskStatus) => {
      change(
        { ids, action: { kind: "status", status } },
        {
          onSuccess: ({ affected }) => {
            toastWithUndo(`${STATUS_VERB[status]} ${count}`, () => {
              restoreStatuses(affected);
            });
          },
        },
      );
    },
    setPriority: (priority: TaskPriority) => {
      run({ kind: "priority", priority }, `Changed the priority of ${count}`, () => {
        changeBack(
          chosen,
          (task) => task.priority,
          (prior) => ({ kind: "priority", priority: prior }),
        );
      });
    },
    setDueDate: (dueDate: string) => {
      run({ kind: "dates", dates: { due_date: dueDate } }, `Changed the date of ${count}`, () => {
        const dated: (Task & { due_date: string })[] = [];
        for (const task of chosen) {
          if (task.due_date === null) update({ id: task.id, dates: null });
          else dated.push({ ...task, due_date: task.due_date });
        }
        changeBack(
          dated,
          (task) => ({
            due_date: task.due_date,
            due_time: task.due_time,
            start_date: task.start_date,
            start_time: task.start_time,
          }),
          (dates) => ({ kind: "dates", dates }),
        );
      });
    },
    moveTo: (project: SidebarProject) => {
      run({ kind: "move", project_id: project.id }, `Moved ${count} to “${project.name}”`, () => {
        changeBack(
          chosen,
          (task) => task.project_id,
          (prior) => ({ kind: "move", project_id: prior }),
        );
      });
    },
    addTag: (tag: SidebarTag) => {
      run({ kind: "add_tag", tag_id: tag.id }, `Added “${tag.name}” to ${count}`, () => {
        tagBack(tag);
      });
    },
    removeTag: (tag: SidebarTag) => {
      run({ kind: "remove_tag", tag_id: tag.id }, `Removed “${tag.name}” from ${count}`, () => {
        tagBack(tag);
      });
    },
    remove: () => {
      const units = tops(chosen, tasks).map((task) => task.id);
      run({ kind: "delete" }, `Moved ${count} to Trash`, () => {
        restore(units);
      });
    },
  };
}
