import { screen, within } from "@testing-library/react";

import { INBOX, json, renderTaskList } from "@/test/drawer";
import { makeTask } from "@/test/tasks";

import type { TaskDetail } from "./tasks";

const task = makeTask;
// Sub-resources the drawer loads that these tests leave empty.
const EMPTY_LISTS = new Set<string | undefined>(["attachments", "comments"]);

/**
 * A stand-in for the server holding a few Tasks: it lists the open ones pinned first, saves
 * PATCHes, and duplicates a Task right after the original.
 */
function mockApi(tasks: TaskDetail[]) {
  let nextId = 100;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const [, id, action] = /\/tasks\/(\d+)(?:\/(\w+))?$/.exec(url.pathname) ?? [];
    const found = tasks.find((item) => item.id === Number(id));
    if (action === "activity") {
      return json({ items: [], next_cursor: null, count: 0 });
    }
    if (EMPTY_LISTS.has(action)) {
      return json([]);
    }
    if (action === "duplicate" && found) {
      const copy = { ...found, id: nextId++, status: "open" as const, pinned_at: null };
      tasks.splice(tasks.indexOf(found) + 1, 0, copy);
      return json(copy, 201);
    }
    if (request.method === "PATCH" && found) {
      return patch(found, request);
    }
    if (found) {
      return json(found);
    }
    return id ? json({ detail: "Task not found." }, 404) : list(tasks, url);
  });
}

/** Save a PATCH to the Task, pinning it as the server does when asked. */
async function patch(found: TaskDetail, request: Request) {
  const { pinned, ...change } = (await request.clone().json()) as Partial<TaskDetail> & {
    pinned?: boolean;
  };
  Object.assign(found, change);
  if (pinned !== undefined) found.pinned_at = pinned ? "2026-10-15T10:00:00Z" : null;
  return json({ task: found, affected: [] });
}

/** A list as the server sends it: the Inbox alone, or open Tasks pinned first and no Closed ones. */
function list(tasks: TaskDetail[], url: URL) {
  if (url.pathname.endsWith("/sidebar")) {
    return json({ inbox: INBOX, items: [], archived: [] });
  }
  if (url.searchParams.get("closed") === "true") {
    return json({ items: [], next_cursor: null });
  }
  const open = tasks.filter((item) => item.status === "open" || item.status === "blocked");
  const pinnedFirst = [
    ...open.filter((item) => item.pinned_at),
    ...open.filter((item) => !item.pinned_at),
  ];
  return json({ items: pinnedFirst, next_cursor: null });
}

function requests(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method !== "GET")
    .map((request) => `${request.method} ${new URL(request.url).pathname}`);
}

function titlesIn(group: string) {
  return within(screen.getByRole("region", { name: group }))
    .queryAllByRole("row")
    .map((row) => row.querySelector("[data-task-title]")?.textContent);
}

function row(title: string) {
  const found = screen
    .getAllByRole("row")
    .find((candidate) => candidate.querySelector("[data-task-title]")?.textContent === title);
  if (!found) throw new Error(`No row for “${title}”`);
  return found;
}

/** A row's ⋯ button. Rows have one for phones and one for wider screens; either will do. */
function moreActions(title: string) {
  const [button] = within(row(title)).getAllByRole("button", { name: "More actions" });
  if (!button) throw new Error(`No actions for “${title}”`);
  return button;
}

describe("Task actions", () => {
  it("lists pinned Tasks in their own group above the rest", async () => {
    mockApi([
      task({ id: 1, title: "Buy milk" }),
      task({ id: 2, title: "Pay rent", pinned_at: "2026-10-15T09:00:00Z" }),
    ]);

    renderTaskList();

    expect(await screen.findByRole("region", { name: "Pinned" })).toBeInTheDocument();
    expect(titlesIn("Pinned")).toEqual(["Pay rent"]);
    expect(titlesIn("Tasks")).toEqual(["Buy milk"]);
  });

  it("has no Pinned group when nothing is pinned", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);

    renderTaskList();

    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Pinned" })).not.toBeInTheDocument();
  });

  it("pins a Task from its row's ⋯ menu", async () => {
    const fetchSpy = mockApi([
      task({ id: 1, title: "Buy milk" }),
      task({ id: 2, title: "Pay rent" }),
    ]);
    const { user } = renderTaskList();
    await screen.findByText("Pay rent");

    await user.click(moreActions("Pay rent"));
    await user.click(await screen.findByRole("menuitem", { name: "Pin to top" }));

    expect(await screen.findByRole("region", { name: "Pinned" })).toBeInTheDocument();
    expect(titlesIn("Pinned")).toEqual(["Pay rent"]);
    expect(requests(fetchSpy)).toEqual(["PATCH /api/v1/tasks/2"]);
    expect(screen.queryByRole("dialog", { name: "Task details" })).not.toBeInTheDocument();
  });

  it("unpins a pinned Task", async () => {
    mockApi([task({ id: 1, title: "Pay rent", pinned_at: "2026-10-15T09:00:00Z" })]);
    const { user } = renderTaskList();
    await screen.findByText("Pay rent");

    await user.click(moreActions("Pay rent"));
    await user.click(await screen.findByRole("menuitem", { name: "Unpin" }));

    expect(await screen.findByRole("region", { name: "Tasks" })).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(screen.queryByRole("region", { name: "Pinned" })).not.toBeInTheDocument();
    });
    expect(titlesIn("Tasks")).toEqual(["Pay rent"]);
  });

  it("offers every action on right-click", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);
    const { user } = renderTaskList();
    await screen.findByText("Buy milk");

    await user.pointer({ keys: "[MouseRight]", target: row("Buy milk") });

    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "OpenEnter",
      "Complete",
      "Pin to top",
      "Won't do",
      "Duplicate",
      "Copy link",
      "Delete⌫",
    ]);
  });

  it("opens the Task from the right-click menu", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);
    const { user } = renderTaskList();
    await screen.findByText("Buy milk");

    await user.pointer({ keys: "[MouseRight]", target: row("Buy milk") });
    await user.click(await screen.findByRole("menuitem", { name: /Open/ }));

    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
  });

  it("marks a Task Won't do from the drawer's actions menu", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);
    const { user } = renderTaskList({ url: "/?task=1" });
    const drawer = await screen.findByRole("dialog", { name: "Task details" });

    await user.click(await within(drawer).findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Won't do" }));

    expect(await within(drawer).findByRole("button", { name: "Status: Won't do" })).toBeVisible();
    expect(requests(fetchSpy)).toEqual(["PATCH /api/v1/tasks/1"]);
    expect(await screen.findByText("Marked Won't do “Buy milk”")).toBeInTheDocument();
  });

  it("duplicates a Task right after it", async () => {
    const fetchSpy = mockApi([
      task({ id: 1, title: "Buy milk" }),
      task({ id: 2, title: "Pay rent" }),
    ]);
    const { user } = renderTaskList();
    await screen.findByText("Pay rent");

    await user.click(moreActions("Buy milk"));
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));

    await vi.waitFor(() => {
      expect(titlesIn("Tasks")).toEqual(["Buy milk", "Buy milk", "Pay rent"]);
    });
    expect(requests(fetchSpy)).toEqual(["POST /api/v1/tasks/1/duplicate"]);
  });

  it("copies a link that opens the drawer on the Task", async () => {
    mockApi([task({ id: 1, title: "Buy milk" }), task({ id: 2, title: "Pay rent" })]);
    const { user } = renderTaskList();
    await screen.findByText("Pay rent");

    await user.click(moreActions("Pay rent"));
    await user.click(await screen.findByRole("menuitem", { name: "Copy link" }));

    const link = new URL(await navigator.clipboard.readText());
    expect(link.origin).toBe(globalThis.location.origin);
    expect(`${link.pathname}${link.search}`).toBe("/?task=2");
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });
});

describe("The open Task in the URL", () => {
  it("opens the drawer on the Task the URL names", async () => {
    mockApi([task({ id: 1, title: "Buy milk" }), task({ id: 2, title: "Pay rent" })]);

    renderTaskList({ url: "/?task=2" });

    const drawer = await screen.findByRole("dialog", { name: "Task details" });
    expect(await within(drawer).findByRole("textbox", { name: "Title" })).toHaveValue("Pay rent");
  });

  it("names the Task opened from the list, and drops it on close", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);
    const { user, router } = renderTaskList();

    await user.click(await screen.findByText("Buy milk"));
    await screen.findByRole("dialog", { name: "Task details" });
    expect(router.state.location.search).toEqual({ task: 1 });

    await user.keyboard("{Escape}");
    await vi.waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });

  it("keeps the drawer closed when the URL names a Task that isn't there", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);

    renderTaskList({ url: "/?task=99" });

    await screen.findByText("Buy milk");
    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Task details" })).not.toBeInTheDocument();
    });
  });

  it("ignores a task parameter that isn't an id", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);

    renderTaskList({ url: "/?task=milk" });

    await screen.findByText("Buy milk");
    expect(screen.queryByRole("dialog", { name: "Task details" })).not.toBeInTheDocument();
    const urls = fetchSpy.mock.calls.map(([input]) => new URL((input as Request).url).pathname);
    expect(urls).not.toContain("/api/v1/tasks/milk");
  });
});
