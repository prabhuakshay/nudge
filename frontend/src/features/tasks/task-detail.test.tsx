import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeTask } from "@/test/tasks";

import { TaskList } from "./task-list";
import type { TaskActivity, TaskDetail } from "./tasks";

const INBOX = { id: 7, name: "Inbox", open_count: 3 };

const task = makeTask;

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/**
 * A stand-in for the server holding a few Tasks, which saves PATCHes to them. Each Task starts
 * with the given history, and a rename adds to it as the real server does.
 */
function mockApi(tasks: TaskDetail[], history: TaskActivity[] = []) {
  const activity = [...history];
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    if (url.pathname.endsWith("/activity")) {
      return json({ items: activity, next_cursor: null, count: activity.length });
    }
    if (url.pathname.endsWith("/attachments")) return json([]);
    const id = Number(url.pathname.split("/").at(-1));
    const found = tasks.find((item) => item.id === id);
    if (request.method === "PATCH" && found) {
      const change = (await request.clone().json()) as Partial<TaskDetail>;
      return json(applyPatch(found, change, activity));
    }
    if (found) return json(found);
    if (url.searchParams.get("closed") === "true") {
      return json({ items: [], next_cursor: null });
    }
    return json({ items: tasks, next_cursor: null });
  });
}

function applyPatch(found: TaskDetail, change: Partial<TaskDetail>, activity: TaskActivity[]) {
  if (change.title !== undefined) {
    const data = { old: found.title, new: change.title };
    activity.unshift({ id: activity.length + 1, kind: "title_changed", at: minutesAgo(0), data });
  }
  const statusChanged = change.status !== undefined && change.status !== found.status;
  const affected = statusChanged
    ? [{ id: found.id, prior_status: found.status, prior_blocked_reason: found.blocked_reason }]
    : [];
  Object.assign(found, statusChanged ? { blocked_reason: "" } : {}, change);
  return { task: found, affected };
}

async function patches(fetchSpy: ReturnType<typeof mockApi>) {
  const requests = fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method === "PATCH");
  return Promise.all(
    requests.map(async (request) => [
      new URL(request.url).pathname,
      (await request.json()) as unknown,
    ]),
  );
}

function renderList({ wide = true } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: wide,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
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

async function openTask(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByText(title));
  return screen.findByRole("dialog", { name: "Task details" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TaskDetail", () => {
  it("opens a Task from a click anywhere on its row, under its Project", async () => {
    mockApi([task({ id: 1, title: "Buy milk", description: "Two **litres**" })]);
    const user = renderList();

    const drawer = await openTask(user, "Buy milk");

    expect(within(drawer).getByRole("textbox", { name: "Title" })).toHaveValue("Buy milk");
    expect(within(drawer).getByText("Inbox")).toBeInTheDocument();
    expect(await within(drawer).findByText("litres")).toContainHTML("<strong>litres</strong>");
  });

  it("leaves the drawer closed when the row's checkbox is clicked", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Buy milk”" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the focused row with Enter", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();
    await screen.findByText("Buy milk");

    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
  });

  it("renames the Task on Enter", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");
    const title = await within(drawer).findByRole("textbox", { name: "Title" });

    await user.clear(title);
    await user.type(title, "  Buy oat milk {Enter}");

    expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { title: "Buy oat milk" }]]);
    expect(title).not.toHaveFocus();
  });

  it("puts a cleared title back instead of saving it", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");
    const title = await within(drawer).findByRole("textbox", { name: "Title" });

    await user.clear(title);
    await user.tab();

    expect(title).toHaveValue("Buy milk");
    expect(await patches(fetchSpy)).toEqual([]);
  });

  it("edits the Description as markdown text and saves it on blur", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk", description: "Two **litres**" })]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");

    await user.click(await within(drawer).findByRole("button", { name: "Edit description" }));
    const description = within(drawer).getByRole("textbox", { name: "Description" });
    expect(description).toHaveFocus();
    expect(description).toHaveValue("Two **litres**");
    await user.type(description, ", semi-skimmed");
    await user.tab();

    expect(await patches(fetchSpy)).toEqual([
      ["/api/v1/tasks/1", { description: "Two **litres**, semi-skimmed" }],
    ]);
    expect(await within(drawer).findByText(/semi-skimmed/)).toBeInTheDocument();
  });

  it("renders a Description's raw HTML and script links as inert text", async () => {
    mockApi([
      task({
        id: 1,
        title: "Buy milk",
        description: '<img src=x onerror="alert(1)"> [click](javascript:alert(1))',
      }),
    ]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");

    const link = (await within(drawer).findByText("click")).closest("a");

    expect(link?.getAttribute("href")).not.toContain("javascript");
    expect(drawer.querySelector("img")).toBeNull();
  });

  it("steps through the list with J/K and the arrow keys", async () => {
    mockApi([
      task({ id: 1, title: "Buy milk" }),
      task({ id: 2, title: "Call mum" }),
      task({ id: 3, title: "Pay rent" }),
    ]);
    const user = renderList();
    await openTask(user, "Buy milk");
    const title = () => screen.findByRole("textbox", { name: "Title" });

    await user.keyboard("j");
    expect(await title()).toHaveValue("Call mum");
    await user.keyboard("{ArrowDown}");
    expect(await title()).toHaveValue("Pay rent");
    expect(screen.getByRole("button", { name: "Next task" })).toBeDisabled();
    await user.keyboard("k");
    expect(await title()).toHaveValue("Call mum");
    await user.keyboard("{ArrowUp}");
    expect(await title()).toHaveValue("Buy milk");
    expect(screen.getByRole("button", { name: "Previous task" })).toBeDisabled();
  });

  it("closes on Esc and hands focus to the row of the Task it showed", async () => {
    mockApi([task({ id: 1, title: "Buy milk" }), task({ id: 2, title: "Call mum" })]);
    const user = renderList();
    await openTask(user, "Buy milk");
    await user.click(await screen.findByRole("button", { name: "Next task" }));
    expect(await screen.findByRole("textbox", { name: "Title" })).toHaveValue("Call mum");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Call mum").closest("[role=row]")).toHaveFocus();
  });

  it("opens as a bottom sheet on a phone", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList({ wide: false });

    const sheet = await openTask(user, "Buy milk");

    expect(within(sheet).getByRole("textbox", { name: "Title" })).toHaveValue("Buy milk");
  });

  it("shows the Task's history, newest first, in the Activity tab", async () => {
    mockApi(
      [task({ id: 1, title: "Buy oat milk" })],
      [
        { id: 3, kind: "description_edited", at: minutesAgo(2), data: {} },
        {
          id: 2,
          kind: "title_changed",
          at: minutesAgo(5),
          data: { old: "Buy milk", new: "Buy oat milk" },
        },
        { id: 1, kind: "created", at: minutesAgo(10), data: {} },
      ],
    );
    const user = renderList();
    const drawer = await openTask(user, "Buy oat milk");

    await user.click(await within(drawer).findByRole("tab", { name: "Activity 3" }));

    const events = within(within(drawer).getByRole("tabpanel")).getAllByRole("listitem");
    expect(events.map((event) => event.textContent)).toEqual([
      "Edited the description2 minutes ago",
      "Renamed from “Buy milk” to “Buy oat milk”5 minutes ago",
      "Created this task10 minutes ago",
    ]);
  });

  it("counts a rename in the Activity tab straight away", async () => {
    mockApi(
      [task({ id: 1, title: "Buy milk" })],
      [{ id: 1, kind: "created", at: minutesAgo(10), data: {} }],
    );
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");
    expect(await within(drawer).findByRole("tab", { name: "Activity 1" })).toBeInTheDocument();
    const title = within(drawer).getByRole("textbox", { name: "Title" });

    await user.clear(title);
    await user.type(title, "Buy oat milk{Enter}");

    expect(await within(drawer).findByRole("tab", { name: "Activity 2" })).toBeInTheDocument();
  });

  it("sets the Status from its chip, with an Undo toast that puts it back", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");

    await user.click(within(drawer).getByRole("button", { name: "Status: Open" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Won't do" }));

    expect(await within(drawer).findByRole("button", { name: "Status: Won't do" })).toBeVisible();
    expect(await screen.findByText("Marked Won't do “Buy milk”")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await within(drawer).findByRole("button", { name: "Status: Open" })).toBeVisible();
    expect(await patches(fetchSpy)).toEqual([
      ["/api/v1/tasks/1", { status: "wont_do" }],
      ["/api/v1/tasks/1", { status: "open" }],
    ]);
  });

  it("keeps a Blocked reason in its card and restores it with Undo", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Ship it" })]);
    const user = renderList();
    const drawer = await openTask(user, "Ship it");

    await user.click(within(drawer).getByRole("button", { name: "Status: Open" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Blocked" }));
    const reason = await within(drawer).findByRole("textbox", { name: "Blocked reason" });
    await user.type(reason, "Waiting on Ada");
    await user.tab();
    await user.click(within(drawer).getByRole("checkbox", { name: "Complete “Ship it”" }));
    const toast = (await screen.findByText("Completed “Ship it”")).closest<HTMLElement>("li");
    if (!toast) throw new Error("No toast for the change.");
    await user.click(within(toast).getByRole("button", { name: "Undo" }));

    expect(await within(drawer).findByRole("textbox", { name: "Blocked reason" })).toHaveValue(
      "Waiting on Ada",
    );
    expect(await patches(fetchSpy)).toEqual([
      ["/api/v1/tasks/1", { status: "blocked" }],
      ["/api/v1/tasks/1", { blocked_reason: "Waiting on Ada" }],
      ["/api/v1/tasks/1", { status: "completed" }],
      ["/api/v1/tasks/1", { status: "blocked", blocked_reason: "Waiting on Ada" }],
    ]);
  });

  it("sets the Priority from its chip", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");

    await user.click(within(drawer).getByRole("button", { name: "Priority: No priority" }));
    await user.click(screen.getByRole("menuitemradio", { name: /Priority 1/ }));

    const chip = await within(drawer).findByRole("button", { name: "Priority: Priority 1" });
    expect(chip).toBeVisible();
    expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { priority: 1 }]]);
  });
});
