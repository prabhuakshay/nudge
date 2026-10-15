import { screen, waitFor } from "@testing-library/react";

import { mockApi, openTask, renderList, task } from "@/test/drawer";

import { recentTasks, rememberTask } from "./recent-tasks";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("recent Tasks", () => {
  it("remembers the Tasks opened in the drawer, newest first", async () => {
    mockApi([task({ id: 1, title: "Pay rent" }), task({ id: 2, title: "Call mum" })]);
    const user = renderList();

    await openTask(user, "Pay rent");
    await user.keyboard("j");

    expect(await screen.findByDisplayValue("Call mum")).toBeInTheDocument();
    await waitFor(() => {
      expect(recentTasks().map((recent) => recent.title)).toEqual(["Call mum", "Pay rent"]);
    });
  });

  it("keeps the last five, each once", () => {
    for (const id of [1, 2, 3, 4, 5, 6, 3]) {
      rememberTask({ id, title: `Task ${String(id)}`, project_id: 7 });
    }

    expect(recentTasks().map((recent) => recent.id)).toEqual([3, 6, 5, 4, 2]);
  });

  it("ignores what it can't read", () => {
    localStorage.setItem("nudge.recent-tasks", "{not json");

    expect(recentTasks()).toEqual([]);
  });
});
