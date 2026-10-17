/**
 * What can be done to a Task, here: every verb the menus, row keys, drawer and command bar offer,
 * and when each is available. Those places only render or bind these verbs.
 */
import { Ban, Copy, Link2, Pin, PinOff, Trash2, type LucideIcon } from "lucide-react";

import { SHORTCUTS, type ShortcutId } from "@/features/shortcuts/registry";

import { isClosed } from "./task-properties";
import type { Task, TaskPriority, TaskStatus } from "./tasks";

/** A verb the drawer does itself: a picker to open, or a field to edit. */
export type DetailVerbId = "setDate" | "addTag" | "moveToProject" | "markBlocked" | "editTitle";

export type TaskVerbId =
  | DetailVerbId
  | "openTask"
  | "completeTask"
  | "setPriority"
  | "markWontDo"
  | "togglePin"
  | "duplicateTask"
  | "copyLink"
  | "deleteTask";

/** Where a Task shows, which decides what can be done to it there. */
export type TaskPlace = {
  /** In an archived Project, a Task can only be opened and its link copied. */
  readOnly: boolean;
  /** The drawer shows this Task already, so it isn't opened again. */
  inDrawer: boolean;
};

type TaskVerbFields = {
  /** What the menus call it, for the Task as it is now. */
  label: string;
  icon?: LucideIcon;
  shortcut?: ShortcutId;
  /** Which of the shortcut's keys runs this verb, when each of its keys runs a different one. */
  binding?: string;
  /** Listed by the right-click menu only, or by the ⋯ menu as well; left out of both if unset. */
  menu?: "context" | "all";
  /** Destructive verbs come last in the menus and show in the danger colour. */
  danger?: boolean;
};

export type TaskVerb = TaskVerbFields &
  ({ id: "setPriority"; priority: TaskPriority } | { id: Exclude<TaskVerbId, "setPriority"> });

const LEVELS: readonly TaskPriority[] = [0, 1, 2, 3, 4];

/** The Status that completes a Task, or reopens it when it is Closed. */
export function completionToggled(status: TaskStatus): TaskStatus {
  return isClosed(status) ? "open" : "completed";
}

/** The Status that marks a Task Won't do, or reopens it when it is already. */
export function wontDoToggled(status: TaskStatus): TaskStatus {
  return status === "wont_do" ? "open" : "wont_do";
}

function keyVerb(id: DetailVerbId): TaskVerb {
  return { id, label: SHORTCUTS[id].label, shortcut: id };
}

/** The verbs available on `task` in `place`, in the order the menus list them. */
export function taskVerbs(task: Task, { readOnly, inDrawer }: TaskPlace): TaskVerb[] {
  const open: TaskVerb[] = inDrawer
    ? []
    : [{ id: "openTask", label: "Open", shortcut: "openTask", menu: "context" }];
  const copyLink: TaskVerb = { id: "copyLink", label: "Copy link", icon: Link2, menu: "all" };
  if (readOnly) return [...open, copyLink];

  // Only a root is Pinned or moves to another Project: a Subtask shows under its parent.
  const root = task.parent_id === null;
  const pinned = task.pinned_at !== null;
  const pin: TaskVerb[] = root
    ? [
        {
          id: "togglePin",
          label: pinned ? "Unpin" : "Pin to top",
          icon: pinned ? PinOff : Pin,
          shortcut: "togglePin",
          menu: "all",
        },
      ]
    : [];
  return [
    ...open,
    {
      id: "completeTask",
      label: isClosed(task.status) ? "Reopen" : "Complete",
      shortcut: "completeTask",
      menu: "context",
    },
    ...pin,
    {
      id: "markWontDo",
      label: wontDoToggled(task.status) === "open" ? "Reopen" : "Won't do",
      icon: Ban,
      shortcut: "markWontDo",
      menu: "all",
    },
    { id: "duplicateTask", label: "Duplicate", icon: Copy, menu: "all" },
    copyLink,
    {
      id: "deleteTask",
      label: "Delete",
      icon: Trash2,
      shortcut: "deleteTask",
      menu: "all",
      danger: true,
    },
    ...LEVELS.map((priority): TaskVerb => ({
      id: "setPriority",
      priority,
      label: priority === 0 ? "Set priority: none" : `Set priority: P${String(priority)}`,
      shortcut: "setPriority",
      binding: String(priority),
    })),
    keyVerb("setDate"),
    keyVerb("addTag"),
    ...(root ? [keyVerb("moveToProject")] : []),
    keyVerb("markBlocked"),
    keyVerb("editTitle"),
  ];
}
