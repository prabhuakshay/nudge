import { screen, within } from "@testing-library/react";

import { GARDEN, INBOX, json, renderTaskList } from "@/test/drawer";
import { makeTask } from "@/test/tasks";

import type { TaskDetail } from "@/features/tasks/tasks";

const task = makeTask;

/** What the drawer and sidebar load besides Tasks, which these tests leave empty. */
function others(url: URL, action: string | undefined) {
  if (url.pathname.endsWith("/sidebar")) {
    return json({ inbox: INBOX, items: [], archived: [GARDEN] });
  }
  if (action === "activity") return json({ items: [], next_cursor: null, count: 0 });
  const empty = ["/trash", "/people", "/attachments", "/comments"];
  if (empty.some((path) => url.pathname.endsWith(path))) return json([]);
  return undefined;
}

/**
 * A stand-in for the server holding a few Tasks: DELETE moves one to Trash with its Subtasks,
 * and restore brings it back to `restoredTo`.
 */
function mockApi(tasks: TaskDetail[], restoredTo = INBOX) {
  const trashed: TaskDetail[] = [];
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const [, id, action] = /\/tasks\/(\d+)(?:\/(\w+))?$/.exec(url.pathname) ?? [];
    const found = tasks.find((item) => item.id === Number(id));
    const other = others(url, action);
    if (other) return other;
    if (request.method === "DELETE" && found) {
      const gone = tasks.filter((item) => item === found || item.parent_id === found.id);
      trashed.push(...gone);
      tasks.splice(0, tasks.length, ...tasks.filter((item) => !gone.includes(item)));
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (action === "restore") {
      const back = trashed.splice(0);
      tasks.push(...back);
      return json({ task: back[0], project: restoredTo });
    }
    if (found) return json(found);
    if (id) return json({ detail: "Task not found." }, 404);
    const closed = url.searchParams.get("closed") === "true";
    return json({ items: closed ? [] : tasks, next_cursor: null });
  });
}

function writes(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method !== "GET")
    .map((request) => `${request.method} ${new URL(request.url).pathname}`);
}

function row(title: string) {
  const found = screen
    .getAllByRole("row")
    .find((candidate) => candidate.querySelector("[data-task-title]")?.textContent === title);
  if (!found) throw new Error(`No row for “${title}”`);
  return found;
}

const MILK = () => task({ id: 1, title: "Buy milk" });
const RENT = () => task({ id: 2, title: "Pay rent", position: "a1" });

describe("Deleting a Task", () => {
  it("moves it to Trash from its row's ⋯ menu, and Undo brings it back", async () => {
    const fetchSpy = mockApi([MILK(), RENT()]);
    const { user } = renderTaskList();
    await screen.findByText("Pay rent");

    const [more] = within(row("Pay rent")).getAllByRole("button", { name: "More actions" });
    if (!more) throw new Error("No actions for “Pay rent”");
    await user.click(more);
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    await vi.waitFor(() => {
      expect(screen.queryByText("Pay rent")).not.toBeInTheDocument();
    });
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Pay rent")).toBeInTheDocument();
    expect(await screen.findByText("Restored to Inbox")).toBeInTheDocument();
    expect(writes(fetchSpy)).toEqual(["DELETE /api/v1/tasks/2", "POST /api/v1/tasks/2/restore"]);
  });

  it("takes the Task's Subtasks with it", async () => {
    mockApi([MILK(), task({ id: 3, title: "Skimmed", parent_id: 1, depth: 1 }), RENT()]);
    const { user } = renderTaskList();
    await screen.findByText("Skimmed");

    await user.pointer({ keys: "[MouseRight]", target: row("Buy milk") });
    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));

    await vi.waitFor(() => {
      expect(screen.queryByText("Skimmed")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Pay rent")).toBeInTheDocument();
    expect(await screen.findByText("Moved “Buy milk” to Trash")).toBeInTheDocument();
  });

  it("moves a focused row's Task to Trash with the Delete key", async () => {
    const fetchSpy = mockApi([MILK(), RENT()]);
    const { user } = renderTaskList();
    await screen.findByText("Pay rent");

    row("Buy milk").focus();
    await user.keyboard("{Delete}");

    await vi.waitFor(() => {
      expect(screen.queryByText("Buy milk")).not.toBeInTheDocument();
    });
    expect(writes(fetchSpy)).toEqual(["DELETE /api/v1/tasks/1"]);
  });

  it("closes the drawer when its Task is deleted from the drawer's menu", async () => {
    const fetchSpy = mockApi([MILK()]);
    const { user, router } = renderTaskList({ url: "/?task=1" });
    const drawer = await screen.findByRole("dialog", { name: "Task details" });

    await user.click(await within(drawer).findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    await vi.waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    expect(writes(fetchSpy)).toEqual(["DELETE /api/v1/tasks/1"]);
  });

  it("deletes the open Task with the Delete key, but not while a field is being edited", async () => {
    const fetchSpy = mockApi([MILK()]);
    const { user, router } = renderTaskList({ url: "/?task=1" });
    const drawer = await screen.findByRole("dialog", { name: "Task details" });
    const title = await within(drawer).findByRole("textbox", { name: "Title" });

    await user.click(title);
    await user.keyboard("{End}{Backspace}");
    expect(writes(fetchSpy)).toEqual([]);

    title.blur();
    drawer.focus();
    await user.keyboard("{Delete}");

    await vi.waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    expect(writes(fetchSpy)).toContain("DELETE /api/v1/tasks/1");
  });

  it("says when a Task went back into an archived Project", async () => {
    mockApi([MILK()], GARDEN);
    const { user } = renderTaskList();
    await screen.findByText("Buy milk");

    row("Buy milk").focus();
    await user.keyboard("{Delete}");
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Restored to Garden (archived)")).toBeInTheDocument();
  });
});
