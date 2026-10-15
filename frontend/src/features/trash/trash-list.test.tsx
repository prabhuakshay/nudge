import { screen, waitFor, within } from "@testing-library/react";

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
    if (url.pathname.endsWith("/trash") && request.method === "DELETE") {
      rows.splice(0);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.pathname.endsWith("/trash")) return json(rows);
    if (url.pathname.endsWith("/restore")) {
      const [kind, id] = url.pathname.split("/").slice(-3, -1);
      const restored = rows.find((row) => `${row.kind}s` === kind && row.id === Number(id));
      rows.splice(0, rows.length, ...rows.filter((row) => row !== restored));
      if (restored?.kind === "project") return json({ ...INBOX, id: 7, name: "Home (2)" });
      return json({ task: {}, project: INBOX });
    }
    if (url.pathname.endsWith("/trash/delete")) {
      return request
        .clone()
        .json()
        .then((body: { task_ids: number[]; project_ids: number[] }) => {
          const gone = (row: TrashedRow) =>
            (row.kind === "task" ? body.task_ids : body.project_ids).includes(row.id);
          rows.splice(0, rows.length, ...rows.filter((row) => !gone(row)));
          return new Response(null, { status: 204 });
        });
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

  it("deletes a Task forever from its row once confirmed", async () => {
    const fetchSpy = mockApi([
      trashed({ id: 4, subtask_count: 2 }),
      trashed({ id: 5, title: "Buy milk" }),
    ]);
    const { user } = renderListRoute(<TrashList />);

    await user.click(await screen.findByRole("button", { name: "Delete “Move house” forever" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete “Move house” forever?" });
    expect(within(dialog).getByText(/It and its 2 Subtasks/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Delete forever" }));

    expect(await screen.findByText("Deleted “Move house” forever")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore “Move house”" })).not.toBeInTheDocument();
    const deletes = fetchSpy.mock.calls
      .map(([input]) => input as Request)
      .filter((request) => new URL(request.url).pathname === "/api/v1/trash/delete");
    expect(deletes).toHaveLength(1);
    expect(await deletes[0]?.json()).toEqual({ task_ids: [4], project_ids: [] });
  });

  it("deletes a Project forever from its row once confirmed, saying its Tasks go too", async () => {
    const fetchSpy = mockApi([trashedProject({ id: 4 }), trashed({ id: 4, title: "Pay rent" })]);
    const { user } = renderListRoute(<TrashList />);

    await user.click(await screen.findByRole("button", { name: "Delete “Home” forever" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete “Home” forever?" });
    expect(within(dialog).getByText(/It and its 3 tasks/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Delete forever" }));

    expect(await screen.findByText("Deleted “Home” forever")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore “Pay rent”" })).toBeVisible();
    const deletes = fetchSpy.mock.calls
      .map(([input]) => input as Request)
      .filter((request) => new URL(request.url).pathname === "/api/v1/trash/delete");
    expect(await deletes[0]?.json()).toEqual({ task_ids: [], project_ids: [4] });
  });

  it("keeps the Task when the delete is cancelled", async () => {
    const fetchSpy = mockApi([trashed({ id: 4 })]);
    const { user } = renderListRoute(<TrashList />);

    await user.click(await screen.findByRole("button", { name: "Delete “Move house” forever" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore “Move house”" })).toBeVisible();
    const methods = fetchSpy.mock.calls.map(([input]) => (input as Request).method);
    expect(methods).not.toContain("POST");
  });

  it("empties the Trash once confirmed", async () => {
    const fetchSpy = mockApi([trashed({ id: 4 }), trashed({ id: 5, title: "Buy milk" })]);
    const { user } = renderListRoute(<TrashList />);

    await user.click(await screen.findByRole("button", { name: "Empty Trash" }));
    const dialog = await screen.findByRole("dialog", { name: "Empty Trash?" });
    expect(within(dialog).getByText(/All 2 items in Trash/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Empty Trash" }));

    expect(await screen.findByText("Trash is empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Empty Trash" })).not.toBeInTheDocument();
    const deletes = fetchSpy.mock.calls
      .map(([input]) => input as Request)
      .filter((request) => request.method === "DELETE")
      .map((request) => new URL(request.url).pathname);
    expect(deletes).toEqual(["/api/v1/trash"]);
  });

  it("restores several selected rows at once", async () => {
    const fetchSpy = mockApi([
      trashedProject({ id: 4 }),
      trashed({ id: 4, title: "Pay rent" }),
      trashed({ id: 5, title: "Buy milk" }),
    ]);
    const { user } = renderListRoute(<TrashList />);

    await user.click(await screen.findByRole("checkbox", { name: "Select “Home”" }));
    await user.click(screen.getByRole("checkbox", { name: "Select “Pay rent”" }));
    const bar = screen.getByRole("toolbar", { name: "Selected items" });
    expect(within(bar).getByText("2 selected")).toBeVisible();
    await user.click(within(bar).getByRole("button", { name: "Restore" }));

    expect(await screen.findByText("Restored 2 items")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual([
      "Select “Buy milk”",
    ]);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    const posts = fetchSpy.mock.calls
      .map(([input]) => input as Request)
      .filter((request) => request.method === "POST")
      .map((request) => new URL(request.url).pathname);
    expect(posts).toEqual(["/api/v1/projects/4/restore", "/api/v1/tasks/4/restore"]);
  });

  it("deletes several selected rows forever in one request once confirmed", async () => {
    const fetchSpy = mockApi([
      trashedProject({ id: 4 }),
      trashed({ id: 4, title: "Pay rent" }),
      trashed({ id: 5, title: "Buy milk" }),
    ]);
    const { user } = renderListRoute(<TrashList />);

    await user.click(await screen.findByRole("checkbox", { name: "Select “Home”" }));
    await user.click(screen.getByRole("checkbox", { name: "Select “Buy milk”" }));
    const bar = screen.getByRole("toolbar", { name: "Selected items" });
    await user.click(within(bar).getByRole("button", { name: "Delete forever" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete 2 items forever?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete forever" }));

    expect(await screen.findByText("Deleted 2 items forever")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual([
      "Select “Pay rent”",
    ]);
    const deletes = fetchSpy.mock.calls
      .map(([input]) => input as Request)
      .filter((request) => new URL(request.url).pathname === "/api/v1/trash/delete");
    expect(await deletes[0]?.json()).toEqual({ task_ids: [5], project_ids: [4] });
  });

  it("says so when the Trash is empty", async () => {
    mockApi([]);

    renderListRoute(<TrashList />);

    expect(await screen.findByText("Trash is empty")).toBeInTheDocument();
  });
});
