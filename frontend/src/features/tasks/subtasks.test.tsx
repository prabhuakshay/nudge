import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

import { INBOX, bulkRequests, renderTaskList } from "@/test/drawer";
import { makeTask } from "@/test/tasks";

import { isClosed } from "./task-properties";
import type { Task, TaskDetail } from "./tasks";

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** Trip > Flights > Seats, and Trip > Hotel (done), then Groceries on its own. */
function seed(): Task[] {
  return [
    makeTask({ id: 1, title: "Trip" }),
    makeTask({ id: 2, title: "Groceries" }),
    makeTask({ id: 3, title: "Flights", parent_id: 1, depth: 1, parent_title: "Trip" }),
    makeTask({ id: 4, title: "Seats", parent_id: 3, depth: 2, parent_title: "Flights" }),
    makeTask({
      id: 5,
      title: "Hotel",
      parent_id: 1,
      depth: 1,
      parent_title: "Trip",
      status: "completed",
    }),
  ];
}

/**
 * A stand-in for the server holding flat rows. It answers the list, a Task with its ancestors
 * and Subtasks, Subtask creation, and Status changes, closing open Subtasks with their parent.
 */
function mockApi(rows: Task[] = seed()) {
  const server = fakeServer(rows);
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const task = server.byId(Number(url.pathname.split("/").at(-1)));
    if (url.pathname.endsWith("/tasks/bulk")) return json({ affected: [] });
    if (request.method === "POST")
      return server.create((await request.clone().json()) as NewSubtask);
    if (request.method === "PATCH" && task) {
      return server.setStatus(task, (await request.clone().json()) as StatusChange);
    }
    if (url.pathname.endsWith("/activity")) {
      return json({ items: [], next_cursor: null, count: 0 });
    }
    if (url.pathname.endsWith("/attachments") || url.pathname.endsWith("/comments")) {
      return json([]);
    }
    if (task) return json(server.detail(task));
    if (url.pathname === "/api/v1/sidebar") return json({ inbox: INBOX, items: [], archived: [] });
    const closed = url.searchParams.get("closed") === "true";
    return json({ items: server.trees(closed), next_cursor: null });
  });
}

type NewSubtask = { title: string; parent_id: number };
type StatusChange = Pick<Task, "status">;

function fakeServer(rows: Task[]) {
  let nextId = 100;
  const byId = (id: number | null) => rows.find((row) => row.id === id);
  const below = (id: number): Task[] =>
    rows.filter((row) => row.parent_id === id).flatMap((row) => [row, ...below(row.id)]);
  const rootOf = (row: Task): Task => byId(row.parent_id) ?? row;
  return {
    byId,
    detail(task: Task): TaskDetail {
      const ancestors = [];
      for (let up = byId(task.parent_id); up; up = byId(up.parent_id)) {
        ancestors.unshift({ id: up.id, title: up.title });
      }
      return makeTask({ ...task, ancestors, subtasks: below(task.id) });
    },
    create(body: NewSubtask) {
      const parent = byId(body.parent_id);
      const created = makeTask({
        id: nextId++,
        title: body.title,
        parent_id: body.parent_id,
        depth: (parent?.depth ?? 0) + 1,
        parent_title: parent?.title ?? null,
      });
      rows.push(created);
      return json(created, 201);
    },
    setStatus(task: Task, { status }: StatusChange) {
      const changed = isClosed(status) ? [task, ...below(task.id)] : [task];
      const affected = changed
        .filter((row) => row === task || !isClosed(row.status))
        .map((row) => ({ id: row.id, prior_status: row.status, prior_blocked_reason: "" }));
      for (const { id } of affected) Object.assign(byId(id) ?? {}, { status });
      return json({ task: this.detail(task), affected });
    },
    trees(closed: boolean) {
      const root = (row: Task): Task => (row.parent_id === null ? row : root(rootOf(row)));
      return rows.filter((row) => isClosed(root(row).status) === closed);
    },
  };
}

function renderList() {
  return renderTaskList().user;
}

/** The open rows as an outline: one indent per level below the top. */
function outline() {
  return within(screen.getByRole("region", { name: "Tasks" }))
    .queryAllByRole("row")
    .map((row) => {
      const level = Number(row.getAttribute("aria-level")) - 1;
      return `${"  ".repeat(level)}${row.querySelector("[data-task-title]")?.textContent ?? ""}`;
    });
}

function row(title: string) {
  const found = screen
    .getAllByRole("row")
    .find((item) => item.querySelector("[data-task-title]")?.textContent === title);
  if (!found) throw new Error(`No row for ${title}`);
  return found;
}

describe("Subtasks in the list", () => {
  it("nests Subtasks under their parent with each parent's progress", async () => {
    mockApi();

    renderList();

    expect(await screen.findByText("Seats")).toBeInTheDocument();
    expect(outline()).toEqual(["Trip", "  Flights", "    Seats", "  Hotel", "Groceries"]);
    expect(within(row("Trip")).getAllByText("1 of 2 subtasks done")).not.toHaveLength(0);
    expect(screen.getByRole("region", { name: "Tasks" })).toHaveTextContent("Tasks2");
  });

  it("collapses one Task's Subtasks from its chevron", async () => {
    mockApi();
    const user = renderList();
    await screen.findByText("Seats");

    await user.click(
      within(row("Flights")).getByRole("button", { name: "Collapse subtasks of “Flights”" }),
    );

    expect(outline()).toEqual(["Trip", "  Flights", "  Hotel", "Groceries"]);
  });

  it("collapses and expands every Task at once", async () => {
    mockApi();
    const user = renderList();
    await screen.findByText("Seats");

    await user.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(outline()).toEqual(["Trip", "Groceries"]);

    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(outline()).toEqual(["Trip", "  Flights", "    Seats", "  Hotel", "Groceries"]);
  });

  it("closes a parent with its Subtasks and undoes all of it", async () => {
    const fetchSpy = mockApi();
    const user = renderList();

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Trip”" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }, { timeout: 2000 }));

    expect(screen.getByText("Completed “Trip” with 2 Subtasks")).toBeInTheDocument();
    await vi.waitFor(async () => {
      expect(await bulkRequests(fetchSpy)).toEqual([
        {
          ids: [1, 3, 4],
          action: {
            kind: "statuses",
            statuses: [1, 3, 4].map((id) => ({ id, status: "open", blocked_reason: "" })),
          },
        },
      ]);
    });
  });
});

describe("Subtasks in the drawer", () => {
  async function open(user: ReturnType<typeof userEvent.setup>, title: string) {
    await user.click(await screen.findByText(title));
    return screen.findByRole("dialog", { name: "Task details" });
  }

  it("shows the parent breadcrumb, which opens a parent, and no Project chip", async () => {
    mockApi();
    const user = renderList();
    const drawer = await open(user, "Seats");
    const breadcrumb = await within(drawer).findByRole("navigation", { name: "Breadcrumb" });
    const projectChip = { name: "Project: Inbox. Move to another project" };
    expect(within(drawer).queryByRole("button", projectChip)).toBeNull();

    await user.click(within(breadcrumb).getByRole("button", { name: "Trip" }));

    expect(await within(drawer).findByRole("textbox", { name: "Title" })).toHaveValue("Trip");
    expect(within(drawer).getByRole("button", projectChip)).toBeInTheDocument();
  });

  it("lists the Subtasks nested and opens one from its title", async () => {
    mockApi();
    const user = renderList();
    const drawer = await open(user, "Trip");
    const subtasks = await within(drawer).findByRole("region", { name: "Subtasks" });

    expect(within(subtasks).getByText("1/2")).toBeInTheDocument();
    expect(
      within(subtasks)
        .getAllByRole("listitem")
        .map((item) => item.querySelector("[data-task-title]")?.textContent),
    ).toEqual(["Flights", "Seats", "Hotel"]);

    await user.click(within(subtasks).getByRole("button", { name: "Seats" }));
    expect(await within(drawer).findByRole("textbox", { name: "Title" })).toHaveValue("Seats");
  });

  it("adds a Subtask under the open Task", async () => {
    const fetchSpy = mockApi();
    const user = renderList();
    const drawer = await open(user, "Groceries");

    await user.type(
      await within(drawer).findByRole("combobox", { name: "Add a subtask" }),
      "Oat milk{Enter}",
    );

    const post = fetchSpy.mock.calls
      .map(([input]) => input as Request)
      .find((request) => request.method === "POST");
    expect(await post?.json()).toEqual({ title: "Oat milk", parent_id: 2 });
    expect(await within(drawer).findByText("Oat milk")).toBeInTheDocument();
  });

  it("reads Priority and Tags in a new Subtask, but leaves `~project` as text", async () => {
    const fetchSpy = mockApi();
    const user = renderList();
    const drawer = await open(user, "Groceries");

    await user.type(
      await within(drawer).findByRole("combobox", { name: "Add a subtask" }),
      "Oat milk !2 #dairy{Escape} ~Work{Enter}",
    );

    await vi.waitFor(async () => {
      const post = fetchSpy.mock.calls
        .map(([input]) => input as Request)
        .find((request) => request.method === "POST");
      expect(await post?.clone().json()).toEqual({
        title: "Oat milk ~Work",
        parent_id: 2,
        priority: 2,
        tags: ["dairy"],
      });
    });
    expect(drawer).toBeInTheDocument();
  });

  it("reads a date in a new Subtask, but leaves a Repeat phrase as text", async () => {
    // Thursday 15 October 2026.
    vi.useFakeTimers({ now: new Date(2026, 9, 15, 10, 0), toFake: ["Date"] });
    const fetchSpy = mockApi();
    const user = renderList();
    const drawer = await open(user, "Groceries");

    await user.type(
      await within(drawer).findByRole("combobox", { name: "Add a subtask" }),
      "Check the fridge every monday tomorrow{Enter}",
    );

    await vi.waitFor(async () => {
      const post = fetchSpy.mock.calls
        .map(([input]) => input as Request)
        .find((request) => request.method === "POST");
      expect(await post?.clone().json()).toEqual({
        title: "Check the fridge every monday",
        parent_id: 2,
        dates: { due_date: "2026-10-16", due_time: null, start_date: null, start_time: null },
      });
    });
    vi.useRealTimers();
  });

  it("offers no Pin action for a Subtask", async () => {
    mockApi();
    const user = renderList();
    const drawer = await open(user, "Flights");

    await user.click(await within(drawer).findByRole("button", { name: "More actions" }));

    expect(await screen.findByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Pin to top" })).toBeNull();
  });

  it("offers no Subtasks below the fourth level", async () => {
    mockApi([
      ...seed(),
      makeTask({ id: 6, title: "Aisle", parent_id: 4, depth: 3, parent_title: "Seats" }),
    ]);
    const user = renderList();

    const drawer = await open(user, "Aisle");

    expect(
      await within(drawer).findByText("This is the fourth level, so it can't have Subtasks."),
    ).toBeInTheDocument();
    expect(within(drawer).queryByRole("combobox", { name: "Add a subtask" })).toBeNull();
  });
});
