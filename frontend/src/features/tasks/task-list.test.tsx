import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { TaskList } from "./task-list";
import type { Task } from "./tasks";

const INBOX = { id: 7, name: "Inbox", open_count: 2 };

function task(overrides: Partial<Task>): Task {
  return {
    id: 1,
    project_id: INBOX.id,
    title: "Buy milk",
    status: "open",
    priority: 0,
    blocked_reason: "",
    completed_at: null,
    created_at: "2026-10-15T09:00:00Z",
    updated_at: "2026-10-15T09:00:00Z",
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** A small stand-in for the server: open Tasks, pages of Closed ones, and Task creation. */
function mockApi({
  open = [] as Task[],
  closedPages = [] as Task[][],
}: { open?: Task[]; closedPages?: Task[][] } = {}) {
  let nextId = 100;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    if (request.method === "POST") {
      const body = (await request.clone().json()) as { title: string };
      const created = task({ id: nextId++, title: body.title });
      open = [created, ...open];
      return json(created, 201);
    }
    if (request.method === "PATCH") {
      const change = (await request.clone().json()) as Partial<Task>;
      const id = Number(url.pathname.split("/").at(-1));
      const before =
        [...open, ...closedPages.flat()].find((item) => item.id === id) ?? task({ id });
      const changed = { ...before, ...change };
      const affected = change.status
        ? [{ id, prior_status: before.status, prior_blocked_reason: before.blocked_reason }]
        : [];
      open = [changed, ...open.filter((item) => item.id !== id)].filter(
        (item) => item.status === "open" || item.status === "blocked",
      );
      return json({ task: { ...changed, description: "" }, affected });
    }
    if (url.pathname === "/api/v1/sidebar") {
      return json({ inbox: { ...INBOX, open_count: open.length } });
    }
    if (url.searchParams.get("closed") === "true") {
      const page = Number(url.searchParams.get("cursor") ?? 0);
      const next = page + 1 < closedPages.length ? String(page + 1) : null;
      return json({ items: closedPages[page] ?? [], next_cursor: next });
    }
    return json({ items: open, next_cursor: null });
  });
}

function requests(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls.map(([input]) => {
    const request = input as Request;
    const url = new URL(request.url);
    return `${request.method} ${url.pathname}${url.search}`;
  });
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

function titlesIn(group: string) {
  return within(screen.getByRole("region", { name: group }))
    .queryAllByRole("row")
    .map((row) => row.querySelector("[data-task-title]")?.textContent);
}

describe("TaskList", () => {
  it("lists the open Tasks in the server's order with the open count", async () => {
    mockApi({ open: [task({ id: 1, title: "Buy milk" }), task({ id: 2, title: "Call mum" })] });

    renderList();

    expect(await screen.findByText("Call mum")).toBeInTheDocument();
    expect(titlesIn("Tasks")).toEqual(["Buy milk", "Call mum"]);
    expect(screen.getByText("2 open")).toBeInTheDocument();
  });

  it("adds a Task from Quick add at the top and keeps the input focused", async () => {
    const fetchSpy = mockApi({ open: [task({ id: 1, title: "Buy milk" })] });
    const user = renderList();
    await screen.findByText("Buy milk");

    const input = screen.getByRole("textbox", { name: "New task" });
    await user.type(input, "  Call mum {Enter}");

    expect(await screen.findByText("Call mum")).toBeInTheDocument();
    expect(titlesIn("Tasks")).toEqual(["Call mum", "Buy milk"]);
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(requests(fetchSpy)).toContain("POST /api/v1/tasks");
  });

  it("ignores Enter on an empty Quick add", async () => {
    const fetchSpy = mockApi();
    const user = renderList();

    await user.type(screen.getByRole("textbox", { name: "New task" }), "   {Enter}");

    expect(requests(fetchSpy)).not.toContain("POST /api/v1/tasks");
  });

  it("focuses Quick add when C is pressed outside a text field", async () => {
    mockApi();
    const user = renderList();

    await user.keyboard("c");

    expect(screen.getByRole("textbox", { name: "New task" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "New task" })).toHaveValue("");
  });

  it("completes a Task from its checkbox and takes it out of the open list", async () => {
    const fetchSpy = mockApi({ open: [task({ id: 1, title: "Buy milk" })] });
    const user = renderList();

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Buy milk”" }));

    expect(requests(fetchSpy)).toContain("PATCH /api/v1/tasks/1");
    expect(await screen.findByText("Nothing left here. Add a task above.")).toBeInTheDocument();
  });

  it("keeps Closed Tasks collapsed until asked, then loads them a page at a time", async () => {
    const fetchSpy = mockApi({
      closedPages: [
        [task({ id: 3, title: "Paid rent", status: "completed" })],
        [task({ id: 4, title: "Filed taxes", status: "completed" })],
      ],
    });
    const user = renderList();
    const toggle = await screen.findByRole("button", { name: /Closed/ });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(requests(fetchSpy).some((request) => request.includes("closed=true"))).toBe(false);

    await user.click(toggle);
    expect(await screen.findByText("Paid rent")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Filed taxes")).toBeInTheDocument();
    expect(titlesIn("Closed")).toEqual(["Paid rent", "Filed taxes"]);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("reopens a Closed Task from its checkbox", async () => {
    const fetchSpy = mockApi({
      closedPages: [[task({ id: 3, title: "Paid rent", status: "completed" })]],
    });
    const user = renderList();
    await user.click(await screen.findByRole("button", { name: /Closed/ }));

    await user.click(await screen.findByRole("checkbox", { name: "Reopen “Paid rent”" }));

    const patch = fetchSpy.mock.calls
      .map(([input]) => input as Request)
      .find((request) => request.method === "PATCH");
    expect(await patch?.json()).toEqual({ status: "open" });
  });

  it("offers Undo after completing a Task, which reopens it", async () => {
    const fetchSpy = mockApi({ open: [task({ id: 1, title: "Buy milk" })] });
    const user = renderList();

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Buy milk”" }));
    expect(await screen.findByText("Completed “Buy milk”")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByRole("checkbox", { name: "Complete “Buy milk”" })).toBeVisible();
    expect(requests(fetchSpy).filter((request) => request.startsWith("PATCH"))).toHaveLength(2);
  });

  it("changes the Status and Priority from the row's cells", async () => {
    const fetchSpy = mockApi({ open: [task({ id: 1, title: "Ship it" })] });
    const user = renderList();
    const row = (await screen.findByText("Ship it")).closest<HTMLElement>("[role=row]");
    if (!row) throw new Error("No row for the Task.");

    await user.click(within(row).getByRole("button", { name: "Status: Open" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Blocked" }));
    await user.click(await within(row).findByRole("button", { name: "Priority: No priority" }));
    await user.click(screen.getByRole("menuitemradio", { name: /Priority 2/ }));

    expect(await within(row).findByRole("button", { name: "Status: Blocked" })).toBeVisible();
    expect(await within(row).findByRole("button", { name: "Priority: Priority 2" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const bodies = await Promise.all(
      fetchSpy.mock.calls
        .map(([input]) => input as Request)
        .filter((request) => request.method === "PATCH")
        .map((request) => request.json() as Promise<unknown>),
    );
    expect(bodies).toEqual([{ status: "blocked" }, { priority: 2 }]);
  });

  it("shows a Blocked Task's reason and the Priority flag under its title", async () => {
    mockApi({
      open: [
        task({ id: 1, title: "Ship it", status: "blocked", blocked_reason: "Waiting on Ada" }),
        task({ id: 2, title: "Pay rent", priority: 1 }),
      ],
    });
    renderList();

    const blocked = (await screen.findByText("Ship it")).closest<HTMLElement>("[role=row]");
    const urgent = screen.getByText("Pay rent").closest<HTMLElement>("[role=row]");
    if (!blocked || !urgent) throw new Error("No rows for the Tasks.");

    expect(within(blocked).getAllByText("Waiting on Ada").length).toBeGreaterThan(0);
    expect(within(urgent).getByRole("img", { name: "Priority 1" })).toBeInTheDocument();
  });
});
