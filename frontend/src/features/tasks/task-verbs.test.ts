import { makeTask } from "@/test/tasks";

import { completionToggled, taskVerbs, wontDoToggled, type TaskPlace } from "./task-verbs";

const IN_LIST: TaskPlace = { readOnly: false, inDrawer: false };

function ids(place: TaskPlace, overrides: Parameters<typeof makeTask>[0] = {}) {
  return taskVerbs(makeTask(overrides), place).map((verb) =>
    verb.id === "setPriority" ? `setPriority ${String(verb.priority)}` : verb.id,
  );
}

function labelOf(id: string, overrides: Parameters<typeof makeTask>[0]) {
  return taskVerbs(makeTask(overrides), IN_LIST).find((verb) => verb.id === id)?.label;
}

describe("taskVerbs", () => {
  it("offers every verb on a root Task in a list", () => {
    expect(ids(IN_LIST)).toEqual([
      "openTask",
      "completeTask",
      "togglePin",
      "markWontDo",
      "duplicateTask",
      "copyLink",
      "deleteTask",
      "setPriority 0",
      "setPriority 1",
      "setPriority 2",
      "setPriority 3",
      "setPriority 4",
      "setDate",
      "addTag",
      "moveToProject",
      "markBlocked",
      "editTitle",
    ]);
  });

  it("doesn't pin a Subtask or move it to another Project", () => {
    const verbs = ids(IN_LIST, { parent_id: 3 });
    expect(verbs).not.toContain("togglePin");
    expect(verbs).not.toContain("moveToProject");
  });

  it("doesn't open the Task the drawer shows", () => {
    expect(ids({ readOnly: false, inDrawer: true })).not.toContain("openTask");
  });

  it("only opens a read-only Task and copies its link", () => {
    expect(ids({ readOnly: true, inDrawer: false })).toEqual(["openTask", "copyLink"]);
    expect(ids({ readOnly: true, inDrawer: true })).toEqual(["copyLink"]);
  });

  it("names each toggle by what it will do", () => {
    expect(labelOf("completeTask", {})).toBe("Complete");
    expect(labelOf("completeTask", { status: "wont_do" })).toBe("Reopen");
    expect(labelOf("markWontDo", {})).toBe("Won't do");
    expect(labelOf("markWontDo", { status: "wont_do" })).toBe("Reopen");
    expect(labelOf("togglePin", {})).toBe("Pin to top");
    expect(labelOf("togglePin", { pinned_at: "2026-10-15T09:00:00Z" })).toBe("Unpin");
  });

  it("puts each verb in the menus that list it", () => {
    const menus = Object.fromEntries(
      taskVerbs(makeTask(), IN_LIST).map((verb) => [verb.id, verb.menu]),
    );
    expect(menus).toMatchObject({
      openTask: "context",
      completeTask: "context",
      togglePin: "all",
      deleteTask: "all",
      setDate: undefined,
    });
  });
});

describe("completionToggled", () => {
  it.each([
    ["open", "completed"],
    ["blocked", "completed"],
    ["completed", "open"],
    ["wont_do", "open"],
  ] as const)("takes %s to %s", (from, to) => {
    expect(completionToggled(from)).toBe(to);
  });
});

describe("wontDoToggled", () => {
  it.each([
    ["open", "wont_do"],
    ["blocked", "wont_do"],
    ["completed", "wont_do"],
    ["wont_do", "open"],
  ] as const)("takes %s to %s", (from, to) => {
    expect(wontDoToggled(from)).toBe(to);
  });
});
