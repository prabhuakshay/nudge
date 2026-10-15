import { screen, within } from "@testing-library/react";

import { bulkRequests, json, mockApi, patches, renderList, task } from "@/test/drawer";
import { requestOf } from "@/test/fetch";

function row(title: string) {
  const found = screen
    .getAllByRole("row")
    .find((candidate) => candidate.querySelector("[data-task-title]")?.textContent === title);
  if (!found) throw new Error(`No row for “${title}”`);
  return found;
}

function bar() {
  return screen.getByRole("toolbar", { name: "Selected tasks" });
}

const MILK = () => task({ id: 1, title: "Buy milk", priority: 2 });
const RENT = () => task({ id: 2, title: "Pay rent", position: "a1" });
const BOOKS = () => task({ id: 3, title: "Return books", position: "a2" });

type Affected = { id: number; prior_status: string; prior_blocked_reason: string }[];
type Place = { id: number; project_id: number; parent_id: number | null; after_id: number | null };

/** The stand-in server, answering `POST /tasks/bulk` with `affected` and `movedFrom`. */
function mockBulk(affected: Affected = [], movedFrom: Place[] = []) {
  const fetchSpy = mockApi([MILK(), RENT(), BOOKS()]);
  const tasksApi = fetchSpy.getMockImplementation();
  fetchSpy.mockImplementation((input, init) => {
    const request = requestOf(input);
    if (new URL(request.url).pathname.endsWith("/tasks/bulk")) {
      return json({ affected, moved_from: movedFrom });
    }
    if (!tasksApi) throw new Error("mockApi has no implementation");
    return tasksApi(input, init);
  });
  return fetchSpy;
}

/** Mod-click "Buy milk", then Shift-click "Return books": all three rows. */
async function selectAll(user: ReturnType<typeof renderList>) {
  await screen.findByText("Buy milk");
  await user.keyboard("{Control>}");
  await user.click(row("Buy milk"));
  await user.keyboard("{/Control}{Shift>}");
  await user.click(row("Return books"));
  await user.keyboard("{/Shift}");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("selecting several Tasks", () => {
  it("selects with Mod-click and Shift-click and shows how many", async () => {
    mockBulk();
    const user = renderList();

    await selectAll(user);

    expect(within(bar()).getByRole("status")).toHaveTextContent("3 selected");
    expect(row("Pay rent")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("dialog", { name: "Task details" })).not.toBeInTheDocument();
  });

  it("takes a row off with a second Mod-click", async () => {
    mockBulk();
    const user = renderList();
    await selectAll(user);

    await user.keyboard("{Control>}");
    await user.click(row("Pay rent"));
    await user.keyboard("{/Control}");

    expect(within(bar()).getByRole("status")).toHaveTextContent("2 selected");
    expect(row("Pay rent")).toHaveAttribute("aria-selected", "false");
  });

  it("grows the selection with Shift+↓ and clears it with Esc", async () => {
    mockBulk();
    const user = renderList();
    await screen.findByText("Buy milk");
    row("Buy milk").focus();

    await user.keyboard("{Shift>}{ArrowDown}{ArrowDown}{/Shift}");

    expect(within(bar()).getByRole("status")).toHaveTextContent("3 selected");
    expect(row("Return books")).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("toolbar", { name: "Selected tasks" })).not.toBeInTheDocument();
  });

  it("opens the Task instead on phones", async () => {
    mockBulk();
    const user = renderList({ wide: false });
    await screen.findByText("Buy milk");

    await user.keyboard("{Shift>}");
    await user.click(row("Pay rent"));
    await user.keyboard("{/Shift}");

    expect(screen.queryByRole("toolbar", { name: "Selected tasks" })).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
  });
});

describe("the N selected bar", () => {
  it("sets the Priority of every Task in one request, and Undo puts each one back", async () => {
    const fetchSpy = mockBulk();
    const user = renderList();
    await selectAll(user);

    await user.click(screen.getByRole("button", { name: "Priority" }));
    await user.click(await screen.findByRole("menuitem", { name: "Priority 1" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await vi.waitFor(async () => {
      expect(await bulkRequests(fetchSpy)).toEqual([
        { ids: [1, 2, 3], action: { kind: "priority", priority: 1 } },
        { ids: [1], action: { kind: "priority", priority: 2 } },
        { ids: [2, 3], action: { kind: "priority", priority: 0 } },
      ]);
    });
    expect(screen.getByText("Changed the priority of 3 tasks")).toBeInTheDocument();
  });

  it("completes every Task, and Undo reopens in one request each Task the server says it closed", async () => {
    const fetchSpy = mockBulk([
      { id: 1, prior_status: "open", prior_blocked_reason: "" },
      { id: 2, prior_status: "blocked", prior_blocked_reason: "Waiting on the bank" },
    ]);
    const user = renderList();
    await selectAll(user);

    await user.click(screen.getByRole("button", { name: "Status" }));
    await user.click(await screen.findByRole("menuitem", { name: "Completed" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await vi.waitFor(async () => {
      expect(await bulkRequests(fetchSpy)).toEqual([
        { ids: [1, 2, 3], action: { kind: "status", status: "completed" } },
        {
          ids: [1, 2],
          action: {
            kind: "statuses",
            statuses: [
              { id: 1, status: "open", blocked_reason: "" },
              { id: 2, status: "blocked", blocked_reason: "Waiting on the bank" },
            ],
          },
        },
      ]);
    });
  });

  it("moves every Task to Trash, and Undo restores each one", async () => {
    const fetchSpy = mockBulk();
    const user = renderList();
    await selectAll(user);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await vi.waitFor(() => {
      const restored = fetchSpy.mock.calls
        .map(([input]) => new URL(requestOf(input).url).pathname)
        .filter((path) => path.endsWith("/restore"));
      expect(restored).toEqual([
        "/api/v1/tasks/1/restore",
        "/api/v1/tasks/2/restore",
        "/api/v1/tasks/3/restore",
      ]);
    });
    expect(screen.getByText("Moved 3 tasks to Trash")).toBeInTheDocument();
  });

  it("adds a Tag only some Tasks have, and Undo takes it off those that lacked it", async () => {
    const fetchSpy = mockBulk();
    const user = renderList();
    await selectAll(user);

    await user.click(screen.getByRole("button", { name: "Tags" }));
    await user.click(await screen.findByRole("option", { name: /work/ }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await vi.waitFor(async () => {
      expect(await bulkRequests(fetchSpy)).toEqual([
        { ids: [1, 2, 3], action: { kind: "add_tag", tag_id: 21 } },
        { ids: [1, 2, 3], action: { kind: "remove_tag", tag_id: 21 } },
      ]);
    });
  });

  it("moves every Task to another Project, and Undo puts each back in its place", async () => {
    const places = [
      { id: 1, project_id: 7, parent_id: null, after_id: null },
      { id: 2, project_id: 7, parent_id: null, after_id: 1 },
      { id: 3, project_id: 7, parent_id: null, after_id: 2 },
    ];
    const fetchSpy = mockBulk([], places);
    const user = renderList();
    await selectAll(user);

    await user.click(screen.getByRole("button", { name: "Move" }));
    await user.click(await screen.findByRole("option", { name: /Work/ }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await vi.waitFor(async () => {
      expect(await bulkRequests(fetchSpy)).toEqual([
        { ids: [1, 2, 3], action: { kind: "move", project_id: 8 } },
        { ids: [1, 2, 3], action: { kind: "place", places } },
      ]);
    });
  });

  it("dates every Task, and Undo takes the date off the undated ones", async () => {
    const fetchSpy = mockBulk();
    const user = renderList();
    await selectAll(user);

    await user.click(screen.getByRole("button", { name: "Date" }));
    await user.click(await screen.findByRole("button", { name: "Today" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await vi.waitFor(async () => {
      expect(await patches(fetchSpy)).toEqual([
        ["/api/v1/tasks/1", { dates: null }],
        ["/api/v1/tasks/2", { dates: null }],
        ["/api/v1/tasks/3", { dates: null }],
      ]);
    });
    const [first] = (await bulkRequests(fetchSpy)) as { action: { kind: string } }[];
    expect(first?.action.kind).toBe("dates");
  });
});
