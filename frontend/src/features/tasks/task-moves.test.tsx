import { screen } from "@testing-library/react";

import { GARDEN, INBOX, json, renderTaskList } from "@/test/drawer";
import { makeTask } from "@/test/tasks";
import { requestOf } from "@/test/fetch";

import { moveRow, type Placement } from "./task-drag";
import type { Task } from "./tasks";

/** Trip > Flights, then Groceries and Laundry on their own. */
function seed(): Task[] {
  return [
    makeTask({ id: 1, title: "Trip" }),
    makeTask({ id: 2, title: "Groceries" }),
    makeTask({ id: 3, title: "Laundry" }),
    makeTask({ id: 4, title: "Flights", parent_id: 1, depth: 1, parent_title: "Trip" }),
  ];
}

/** A stand-in server that lists the rows and makes moves, or refuses them with `refusal`. */
function mockApi(rows: Task[] = seed(), refusal?: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/move")) {
      if (refusal) return json({ detail: refusal }, 422);
      const id = Number(url.pathname.split("/").at(-2));
      const body = (await request.clone().json()) as {
        parent_id: number | null;
        after_id: number | null;
      };
      const placement: Placement = { parentId: body.parent_id, afterId: body.after_id };
      rows = moveRow(rows, id, placement);
      return json({ task: makeTask({ id }), affected: [] });
    }
    if (url.pathname === "/api/v1/sidebar") return json({ inbox: INBOX, items: [] });
    if (url.searchParams.get("closed") === "true") return json({ items: [], next_cursor: null });
    return json({ items: rows, next_cursor: null });
  });
}

async function moves(fetchSpy: ReturnType<typeof mockApi>) {
  const requests = fetchSpy.mock.calls
    .map(([input]) => requestOf(input))
    .filter((request) => request.method === "POST");
  return Promise.all(
    requests.map(async (request) => [
      new URL(request.url).pathname,
      (await request.json()) as unknown,
    ]),
  );
}

function stubPointer({ touch }: { touch: boolean }) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: query.includes("coarse") ? touch : true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function focusRow(title: string) {
  const row = (await screen.findByText(title)).closest<HTMLElement>("[role=row]");
  if (!row) throw new Error(`No row for ${title}`);
  row.focus();
  return row;
}

function titles() {
  return [...document.querySelectorAll("[data-task-id] [data-task-title]")].map(
    (title) => title.textContent,
  );
}

function rowOf(title: string) {
  return screen.getByText(title).closest("[role=row]");
}

describe("moving Tasks in the list", () => {
  beforeEach(() => {
    stubPointer({ touch: false });
  });

  it("nests a row under the one above with Tab, after its last Subtask", async () => {
    const fetchSpy = mockApi();
    const { user } = renderTaskList();
    await focusRow("Groceries");

    await user.keyboard("{Tab}");

    await vi.waitFor(() => {
      expect(rowOf("Groceries")).toHaveAttribute("aria-level", "2");
    });
    expect(await moves(fetchSpy)).toEqual([
      ["/api/v1/tasks/2/move", { parent_id: 1, after_id: 4 }],
    ]);
  });

  it("moves a Subtask out to right after its parent with Shift+Tab", async () => {
    const fetchSpy = mockApi();
    const { user } = renderTaskList();
    await focusRow("Flights");

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    await vi.waitFor(() => {
      expect(rowOf("Flights")).toHaveAttribute("aria-level", "1");
    });
    expect(await moves(fetchSpy)).toEqual([
      ["/api/v1/tasks/4/move", { parent_id: null, after_id: 1 }],
    ]);
  });

  it("swaps a row with its sibling with Alt+↑ and Alt+↓", async () => {
    const fetchSpy = mockApi();
    const { user } = renderTaskList();
    await focusRow("Groceries");

    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await vi.waitFor(() => {
      expect(titles()).toEqual(["Trip", "Flights", "Laundry", "Groceries"]);
    });
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");

    expect(await moves(fetchSpy)).toEqual([
      ["/api/v1/tasks/2/move", { parent_id: null, after_id: 3 }],
      ["/api/v1/tasks/2/move", { parent_id: null, after_id: 1 }],
    ]);
  });

  it("refuses a Tab that would nest past the fourth level", async () => {
    // Other, at the third level, carries a Subtask; under Level 2 that would sit at a fifth.
    const rows = [
      makeTask({ id: 1, title: "Level 0" }),
      makeTask({ id: 2, title: "Level 1", parent_id: 1, depth: 1 }),
      makeTask({ id: 3, title: "Level 2", parent_id: 2, depth: 2 }),
      makeTask({ id: 4, title: "Other", parent_id: 2, depth: 2 }),
      makeTask({ id: 5, title: "Other's Subtask", parent_id: 4, depth: 3 }),
    ];
    const fetchSpy = mockApi(rows);
    const { user } = renderTaskList();
    await focusRow("Other");

    await user.keyboard("{Tab}");

    expect(await screen.findByText("Tasks can only nest four levels deep.")).toBeInTheDocument();
    expect(await moves(fetchSpy)).toEqual([]);
  });

  it("shows the server's reason when it refuses a move", async () => {
    mockApi(seed(), "A task can't go under itself or one of its subtasks.");
    const { user } = renderTaskList();
    await focusRow("Laundry");

    await user.keyboard("{Tab}");

    expect(
      await screen.findByText("A task can't go under itself or one of its subtasks."),
    ).toBeInTheDocument();
  });

  it("gives each row a drag grip with a mouse", async () => {
    mockApi();
    renderTaskList();

    expect(await screen.findByRole("button", { name: "Drag “Groceries”" })).toBeInTheDocument();
  });

  it("has no grips on touch screens, where a press and hold drags the row", async () => {
    stubPointer({ touch: true });
    mockApi();
    renderTaskList();

    await screen.findByText("Groceries");
    expect(screen.queryByRole("button", { name: /^Drag/ })).not.toBeInTheDocument();
  });

  it("leaves an archived Project's rows where they are", async () => {
    const fetchSpy = mockApi(seed().map((row) => ({ ...row, project_id: GARDEN.id })));
    const { user } = renderTaskList({ project: GARDEN });
    await focusRow("Groceries");

    await user.keyboard("{Tab}");

    expect(screen.queryByRole("button", { name: /^Drag/ })).not.toBeInTheDocument();
    expect(await moves(fetchSpy)).toEqual([]);
  });
});
