import { describe, expect, it } from "vitest";

import { openTrees, parentsOf, treeRows } from "./task-tree";
import { taskRow } from "./test-data";

const ROWS = [
  taskRow({ id: 1, title: "Trip" }),
  taskRow({ id: 2, title: "Groceries" }),
  taskRow({ id: 3, title: "Flights", parent_id: 1 }),
  taskRow({ id: 4, title: "Seats", parent_id: 3, status: "completed" }),
  taskRow({ id: 5, title: "Hotel", parent_id: 1, status: "wont_do" }),
];

function outline(rows: ReturnType<typeof treeRows>) {
  return rows.map((row) => `${"  ".repeat(row.level)}${row.task.title}`);
}

describe("treeRows", () => {
  it("walks each root's Subtasks depth first, keeping sibling order", () => {
    expect(outline(treeRows(ROWS))).toEqual([
      "Trip",
      "  Flights",
      "    Seats",
      "  Hotel",
      "Groceries",
    ]);
  });

  it("hides the Subtasks of collapsed Tasks", () => {
    expect(outline(treeRows(ROWS, new Set([3])))).toEqual([
      "Trip",
      "  Flights",
      "  Hotel",
      "Groceries",
    ]);
  });

  it("counts each Task's direct Subtasks and how many are Closed", () => {
    const progress = Object.fromEntries(
      treeRows(ROWS).map((row) => [row.task.title, row.subtasks]),
    );

    expect(progress).toEqual({
      Trip: { done: 1, total: 2 },
      Flights: { done: 1, total: 1 },
      Seats: { done: 0, total: 0 },
      Hotel: { done: 0, total: 0 },
      Groceries: { done: 0, total: 0 },
    });
  });

  it("starts from rows whose parent isn't among them, as in a drawer's Subtasks", () => {
    expect(outline(treeRows(ROWS.slice(2)))).toEqual(["Flights", "  Seats", "Hotel"]);
  });
});

describe("parentsOf", () => {
  it("lists the Tasks that have Subtasks", () => {
    expect(parentsOf(ROWS)).toEqual([1, 3]);
  });
});

describe("openTrees", () => {
  it("drops every tree whose root is Closed", () => {
    const rows = ROWS.map((row) => (row.id === 1 ? { ...row, status: "completed" as const } : row));

    expect(openTrees(rows).map((row) => row.title)).toEqual(["Groceries"]);
  });
});
