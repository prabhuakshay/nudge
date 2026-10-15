import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { TaskList } from "./task-list";
import { isClosed } from "./task-properties";
import { INBOX_ID, json, taskDetail, taskRow } from "./test-data";
import type { Task, TaskDetail } from "./tasks";

const INBOX = { id: INBOX_ID, name: "Inbox", open_count: 4 };

/** Trip > Flights > Seats, and Trip > Hotel (done), then Groceries on its own. */
function seed(): Task[] {
  return [
    taskRow({ id: 1, title: "Trip" }),
    taskRow({ id: 2, title: "Groceries" }),
    taskRow({ id: 3, title: "Flights", parent_id: 1, depth: 1, parent_title: "Trip" }),
    taskRow({ id: 4, title: "Seats", parent_id: 3, depth: 2, parent_title: "Flights" }),
    taskRow({
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
    if (request.method === "POST")
      return server.create((await request.clone().json()) as NewSubtask);
    if (request.method === "PATCH" && task) {
      return server.setStatus(task, (await request.clone().json()) as StatusChange);
    }
    if (url.pathname.endsWith("/activity")) {
      return json({ items: [], next_cursor: null, count: 0 });
    }
    if (task) return json(server.detail(task));
    if (url.pathname === "/api/v1/sidebar") return json({ inbox: INBOX });
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
      return taskDetail({ ...task, ancestors, subtasks: below(task.id) });
    },
    create(body: NewSubtask) {
      const parent = byId(body.parent_id);
      const created = taskRow({
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
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <TaskList project={INBOX} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
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
    await vi.waitFor(() => {
      const undone = fetchSpy.mock.calls
        .map(([input]) => input as Request)
        .filter((request) => request.method === "PATCH")
        .slice(1)
        .map((request) => new URL(request.url).pathname);
      expect(undone.sort()).toEqual(["/api/v1/tasks/1", "/api/v1/tasks/3", "/api/v1/tasks/4"]);
    });
  });
});

describe("Subtasks in the drawer", () => {
  async function open(user: ReturnType<typeof userEvent.setup>, title: string) {
    await user.click(await screen.findByText(title));
    return screen.findByRole("dialog", { name: "Task details" });
  }

  it("shows the parent breadcrumb, which opens a parent", async () => {
    mockApi();
    const user = renderList();
    const drawer = await open(user, "Seats");
    const breadcrumb = await within(drawer).findByRole("navigation", { name: "Breadcrumb" });

    await user.click(within(breadcrumb).getByRole("button", { name: "Trip" }));

    expect(await within(drawer).findByRole("textbox", { name: "Title" })).toHaveValue("Trip");
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
      await within(drawer).findByRole("textbox", { name: "Add a subtask" }),
      "Oat milk{Enter}",
    );

    const post = fetchSpy.mock.calls
      .map(([input]) => input as Request)
      .find((request) => request.method === "POST");
    expect(await post?.json()).toEqual({ title: "Oat milk", parent_id: 2 });
    expect(await within(drawer).findByText("Oat milk")).toBeInTheDocument();
  });

  it("offers no Subtasks below the fourth level", async () => {
    mockApi([
      ...seed(),
      taskRow({ id: 6, title: "Aisle", parent_id: 4, depth: 3, parent_title: "Seats" }),
    ]);
    const user = renderList();

    const drawer = await open(user, "Aisle");

    expect(
      await within(drawer).findByText("This is the fourth level, so it can't have Subtasks."),
    ).toBeInTheDocument();
    expect(within(drawer).queryByRole("textbox", { name: "Add a subtask" })).toBeNull();
  });
});
