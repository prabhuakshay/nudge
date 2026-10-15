import { screen, waitFor } from "@testing-library/react";

import { INBOX, json, renderListRoute } from "@/test/drawer";

import { TrashList } from "./trash-list";
import type { TrashedProject, TrashedRow, TrashedTask } from "./trash";

const DAY = 24 * 60 * 60 * 1000;

function trashed(overrides: Partial<TrashedTask> = {}): TrashedTask {
  return {
    kind: "task",
    id: 1,
    title: "Move house",
    project_name: "Home",
    subtask_count: 0,
    deleted_at: new Date(Date.now() - DAY).toISOString(),
    expires_at: new Date(Date.now() + 30 * DAY - 60_000).toISOString(),
    ...overrides,
  };
}

function trashedProject(overrides: Partial<TrashedProject> = {}): TrashedProject {
  return {
    kind: "project",
    id: 1,
    name: "Home",
    color: "teal",
    icon: "house",
    task_count: 3,
    deleted_at: new Date(Date.now() - DAY).toISOString(),
    expires_at: new Date(Date.now() + 30 * DAY - 60_000).toISOString(),
    ...overrides,
  };
}

function mockApi(rows: TrashedRow[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const request = input as Request;
    const url = new URL(request.url);
    if (url.pathname.endsWith("/trash")) return json(rows);
    if (url.pathname.endsWith("/restore")) {
      const [kind, id] = url.pathname.split("/").slice(-3, -1);
      const restored = rows.find((row) => `${row.kind}s` === kind && row.id === Number(id));
      rows.splice(0, rows.length, ...rows.filter((row) => row !== restored));
      if (restored?.kind === "project") return json({ ...INBOX, id: 7, name: "Home (2)" });
      return json({ task: {}, project: INBOX });
    }
    return json({ inbox: INBOX, items: [], archived: [] });
  });
}

describe("The Trash", () => {
  it("lists each deleted unit with its Subtasks counted and the days it has left", async () => {
    mockApi([
      trashed({ id: 2, title: "Pay [@Priya](person:1) back", project_name: "Inbox" }),
      trashed({ subtask_count: 2, expires_at: new Date(Date.now() + DAY / 2).toISOString() }),
    ]);

    renderListRoute(<TrashList />);

    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("[data-title]")?.textContent)).toEqual([
      "Pay @Priya back",
      "Move house",
    ]);
    expect(screen.getByText("Inbox · 30 days left")).toBeVisible();
    expect(screen.getByText("Home · 2 Subtasks · 1 day left")).toBeVisible();
  });

  it("restores a Task from its row", async () => {
    const fetchSpy = mockApi([trashed({ id: 4 })]);
    const { user } = renderListRoute(<TrashList />);

    await user.click(await screen.findByRole("button", { name: "Restore “Move house”" }));

    expect(await screen.findByText("Restored to Inbox")).toBeInTheDocument();
    expect(await screen.findByText("Trash is empty")).toBeInTheDocument();
    const posts = fetchSpy.mock.calls
      .map(([input]) => input as Request)
      .filter((request) => request.method === "POST")
      .map((request) => new URL(request.url).pathname);
    expect(posts).toEqual(["/api/v1/tasks/4/restore"]);
  });

  it("lists a deleted Project with its Tasks counted", async () => {
    mockApi([trashedProject({ id: 4 }), trashed({ id: 4, title: "Pay rent" })]);

    renderListRoute(<TrashList />);

    expect(await screen.findByText("Project · 3 tasks · 30 days left")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("restores a Project from its row, saying what it is called now", async () => {
    const fetchSpy = mockApi([trashedProject({ id: 4 }), trashed({ id: 4, title: "Pay rent" })]);
    const { user } = renderListRoute(<TrashList />);

    await user.click(await screen.findByRole("button", { name: "Restore “Home”" }));

    expect(await screen.findByText("Restored “Home (2)”")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Restore “Home”" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Restore “Pay rent”" })).toBeInTheDocument();
    const posts = fetchSpy.mock.calls
      .map(([input]) => input as Request)
      .filter((request) => request.method === "POST")
      .map((request) => new URL(request.url).pathname);
    expect(posts).toEqual(["/api/v1/projects/4/restore"]);
  });

  it("says so when the Trash is empty", async () => {
    mockApi([]);

    renderListRoute(<TrashList />);

    expect(await screen.findByText("Trash is empty")).toBeInTheDocument();
  });
});
