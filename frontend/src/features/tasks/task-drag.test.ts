import { describe, expect, it } from "vitest";

import { makeTask } from "@/test/tasks";

import {
  currentPlacement,
  indentPlacement,
  moveRow,
  nudgePlacement,
  outdentPlacement,
  projectDrop,
} from "./task-drag";
import { treeRows } from "./task-tree";
import type { Task } from "./tasks";

/** Trip > Flights > Seats, Trip > Hotel, then Groceries and Laundry on their own. */
const TASKS: Task[] = [
  makeTask({ id: 1, title: "Trip" }),
  makeTask({ id: 2, title: "Groceries" }),
  makeTask({ id: 6, title: "Laundry" }),
  makeTask({ id: 3, title: "Flights", parent_id: 1 }),
  makeTask({ id: 4, title: "Seats", parent_id: 3 }),
  makeTask({ id: 5, title: "Hotel", parent_id: 1 }),
];
const LIST = { parentId: null, maxLevel: 3 };

/** The outline while a Task is dragged: its Subtasks travel with it, out of sight. */
function dragging(id: number, tasks = TASKS) {
  const rows = treeRows(tasks);
  const start = rows.findIndex((row) => row.task.id === id);
  const end = rows.findIndex(
    (row, index) => index > start && row.level <= (rows[start]?.level ?? 0),
  );
  return [...rows.slice(0, start + 1), ...rows.slice(end === -1 ? rows.length : end)];
}

describe("projectDrop", () => {
  it("drops in place at the level the row had when not moved sideways", () => {
    expect(projectDrop(dragging(2), 2, 2, 0, LIST)).toEqual({
      level: 0,
      parentId: null,
      afterId: 1,
      valid: true,
    });
  });

  it("nests under the row above when dragged one step right", () => {
    expect(projectDrop(dragging(2), 2, 2, 1, LIST)).toEqual({
      level: 1,
      parentId: 1,
      afterId: 5,
      valid: true,
    });
  });

  it("can't nest deeper than one level below the row above", () => {
    // The row above is Hotel, at level 1.
    expect(projectDrop(dragging(2), 2, 2, 5, LIST)?.level).toBe(2);
  });

  it("moves up the list, following the row it lands under", () => {
    expect(projectDrop(dragging(6), 6, 1, 0, LIST)).toEqual({
      level: 0,
      parentId: null,
      afterId: null,
      valid: true,
    });
  });

  it("keeps a row between nested siblings at their level", () => {
    // Over Hotel, so Laundry lands between Seats (level 2) and Hotel (level 1).
    expect(projectDrop(dragging(6), 6, 5, -3, LIST)).toEqual({
      level: 1,
      parentId: 1,
      afterId: 3,
      valid: true,
    });
  });

  it("is invalid when the carried Subtasks would end up too deep", () => {
    const tasks = [...TASKS, makeTask({ id: 7, title: "Socks", parent_id: 6 })];
    const drop = projectDrop(dragging(6, tasks), 6, 5, 0, { parentId: null, maxLevel: 1 });

    expect(drop?.valid).toBe(false);
  });

  it("puts level-0 rows under the given parent, as the drawer's Subtasks do", () => {
    const subtasks = TASKS.slice(3);
    expect(projectDrop(dragging(5, subtasks), 5, 3, 0, { parentId: 1, maxLevel: 2 })).toEqual({
      level: 0,
      parentId: 1,
      afterId: null,
      valid: true,
    });
  });
});

describe("currentPlacement", () => {
  it("names the Task's parent and the sibling it follows", () => {
    expect(currentPlacement(treeRows(TASKS), 5, LIST)).toEqual({ parentId: 1, afterId: 3 });
    expect(currentPlacement(treeRows(TASKS), 1, LIST)).toEqual({ parentId: null, afterId: null });
  });
});

describe("keyboard moves", () => {
  it("indents a Task under the sibling above, after its last Subtask", () => {
    expect(indentPlacement(TASKS, 2)).toEqual({ parentId: 1, afterId: 5 });
    expect(indentPlacement(TASKS, 1)).toBeNull();
  });

  it("outdents a Task to right after its parent, but not past the top", () => {
    expect(outdentPlacement(TASKS, 4, null)).toEqual({ parentId: 1, afterId: 3 });
    expect(outdentPlacement(TASKS, 1, null)).toBeNull();
    expect(outdentPlacement(TASKS.slice(3), 3, 1)).toBeNull();
  });

  it("swaps a Task with the sibling above or below", () => {
    expect(nudgePlacement(TASKS, 6, -1)).toEqual({ parentId: null, afterId: 1 });
    expect(nudgePlacement(TASKS, 2, -1)).toEqual({ parentId: null, afterId: null });
    expect(nudgePlacement(TASKS, 1, 1)).toEqual({ parentId: null, afterId: 2 });
    expect(nudgePlacement(TASKS, 6, 1)).toBeNull();
  });
});

describe("moveRow", () => {
  function outline(tasks: Task[]) {
    return treeRows(tasks).map((row) => `${"  ".repeat(row.level)}${row.task.title}`);
  }

  it("shows a Task in its new place before the server answers", () => {
    expect(outline(moveRow(TASKS, 6, { parentId: 1, afterId: 3 }))).toEqual([
      "Trip",
      "  Flights",
      "    Seats",
      "  Laundry",
      "  Hotel",
      "Groceries",
    ]);
    expect(outline(moveRow(TASKS, 5, { parentId: null, afterId: null }))[0]).toBe("Hotel");
  });

  it("drops the pin of a Task that becomes a Subtask", () => {
    const pinned = TASKS.map((task) =>
      task.id === 2 ? { ...task, pinned_at: "2026-10-15T09:00:00Z" } : task,
    );

    expect(moveRow(pinned, 2, { parentId: 1, afterId: 5 }).find((t) => t.id === 2)).toMatchObject({
      parent_id: 1,
      pinned_at: null,
    });
  });
});
