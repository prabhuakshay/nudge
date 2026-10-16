import { cleanup, screen, waitFor, within } from "@testing-library/react";

import { stubScreenWidth } from "@/test/calendar";
import { INBOX, json, renderListRoute, WORK } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { patches } from "@/test/drawer";
import { makeTask as task } from "@/test/tasks";
import type { NewTask, TaskDetail } from "@/features/tasks/tasks";

import { MatrixView } from "./matrix-view";

/** Add the Task a create request asks for to `tasks`, as the server would. */
async function addTask(request: Request, tasks: TaskDetail[]) {
  const body = (await request.clone().json()) as NewTask;
  const added = task({
    id: 100 + tasks.length,
    title: body.title,
    project_id: body.project_id ?? INBOX.id,
    priority: body.priority ?? 0,
    ...body.dates,
  });
  tasks.push(added);
  return added;
}

/**
 * A stand-in server: All's open Tasks, each Task's details, PATCHes that save to them, and new
 * Tasks added to them.
 */
function mockApi(tasks: TaskDetail[] = []) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/sidebar") {
      return json({ inbox: INBOX, items: [WORK], archived: [], tags: [], people: [] });
    }
    if (url.pathname === "/api/v1/tasks" && request.method === "POST") {
      return json(await addTask(request, tasks), 201);
    }
    if (url.pathname === "/api/v1/tasks") {
      const open = tasks.filter((each) => each.status === "open" || each.status === "blocked");
      return json({ items: open, next_cursor: null });
    }
    if (url.pathname.endsWith("/activity")) return json({ items: [], next_cursor: null, count: 0 });
    if (url.pathname.endsWith("/attachments") || url.pathname.endsWith("/comments")) {
      return json([]);
    }
    const found = tasks.find((each) => each.id === Number(url.pathname.split("/").at(-1)));
    if (!found) return json({ detail: "Not found." }, 404);
    if (request.method === "PATCH") {
      const change = (await request.clone().json()) as Partial<TaskDetail>;
      const affected = [{ id: found.id, prior_status: found.status, prior_blocked_reason: "" }];
      Object.assign(found, change);
      return json({ task: found, affected });
    }
    return json(found);
  });
}

function renderMatrix({ wide = true } = {}) {
  stubScreenWidth({ wide });
  return renderListRoute(<MatrixView inbox={INBOX} timeZone="Europe/London" />);
}

function quadrant(label: string) {
  return screen.getByRole("region", { name: label });
}

/** The titles of a Quadrant's cards, top to bottom. */
function titlesIn(label: string) {
  return within(quadrant(label))
    .queryAllByRole("listitem")
    .map((card) => card.querySelector("[data-task-title]")?.textContent);
}

beforeEach(() => {
  // Thursday 15 October 2026, 10:00 in London.
  vi.useFakeTimers({ now: new Date("2026-10-15T09:00:00Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("MatrixView", () => {
  it("sorts All's open Tasks into Quadrants by Priority and date", async () => {
    const fetchSpy = mockApi([
      task({ id: 1, title: "Pay rent", priority: 1, due_date: "2026-10-12", is_overdue: true }),
      task({ id: 2, title: "Plan the trip", priority: 2 }),
      task({ id: 3, title: "Reply to Sam", priority: 3, due_date: "2026-10-16" }),
      task({ id: 4, title: "Tidy the shed", due_date: "2026-10-20" }),
    ]);

    renderMatrix();

    expect(await screen.findByText("Pay rent")).toBeInTheDocument();
    const lists = fetchSpy.mock.calls
      .map(([input]) => new URL(requestOf(input).url))
      .filter((url) => url.pathname === "/api/v1/tasks");
    expect(lists.map((url) => url.search)).toEqual(["?view=all"]);
    expect(titlesIn("Urgent & Important")).toEqual(["Pay rent"]);
    expect(titlesIn("Important not urgent")).toEqual(["Plan the trip"]);
    expect(titlesIn("Urgent not important")).toEqual(["Reply to Sam"]);
    expect(titlesIn("Neither")).toEqual(["Tidy the shed"]);
  });

  it("lists Pinned Tasks first, then by date with undated last, then by Priority", async () => {
    mockApi([
      task({ id: 1, title: "Sort photos", priority: 3 }),
      task({ id: 2, title: "Clean the car", due_date: "2026-10-25" }),
      task({ id: 3, title: "Fix the bike", priority: 4, due_date: "2026-10-20" }),
      task({ id: 4, title: "Water plants", due_date: "2026-10-20" }),
      task({ id: 5, title: "Call the bank", priority: 3, due_date: "2026-10-20" }),
      task({ id: 6, title: "Read a book", pinned_at: "2026-10-01T09:00:00Z" }),
    ]);

    renderMatrix();

    expect(await screen.findByText("Sort photos")).toBeInTheDocument();
    expect(titlesIn("Neither")).toEqual([
      "Read a book",
      "Call the bank",
      "Fix the bike",
      "Water plants",
      "Clean the car",
      "Sort photos",
    ]);
  });

  it("counts each Quadrant's Tasks and says when one is empty", async () => {
    mockApi([
      task({ id: 1, title: "Pay rent", priority: 1, due_date: "2026-10-15" }),
      task({ id: 2, title: "Call mum", priority: 2, due_date: "2026-10-16" }),
    ]);

    renderMatrix();

    expect(await screen.findByText("Pay rent")).toBeInTheDocument();
    expect(
      within(quadrant("Urgent & Important")).getByRole("heading", {
        name: "Urgent & Important, 2 tasks",
      }),
    ).toBeInTheDocument();
    expect(
      within(quadrant("Neither")).getByRole("heading", { name: "Neither, 0 tasks" }),
    ).toBeInTheDocument();
    expect(within(quadrant("Neither")).getByText("Nothing here.")).toBeInTheDocument();
    expect(within(quadrant("Important not urgent")).getByText("Nothing here.")).toBeInTheDocument();
  });

  it("shows Blocked Tasks, marked Blocked", async () => {
    mockApi([task({ id: 1, title: "Fix the roof", priority: 2, status: "blocked" })]);

    renderMatrix();

    const card = (await screen.findByText("Fix the roof")).closest("li");
    if (!card) throw new Error("No card for the Blocked Task.");
    expect(within(card).getByText("Blocked")).toBeInTheDocument();
    expect(titlesIn("Important not urgent")).toEqual(["Fix the roof"]);
  });

  it("leaves Subtasks out, so only root Tasks show", async () => {
    mockApi([
      task({ id: 1, title: "Move house" }),
      task({ id: 2, title: "Book the van", parent_id: 1, parent_title: "Move house", depth: 1 }),
    ]);

    renderMatrix();

    expect(await screen.findByText("Move house")).toBeInTheDocument();
    expect(titlesIn("Neither")).toEqual(["Move house"]);
    expect(screen.queryByText("Book the van")).not.toBeInTheDocument();
  });

  it("completes a Task from its card", async () => {
    const fetchSpy = mockApi([
      task({ id: 1, title: "Pay rent", priority: 1, due_date: "2026-10-15" }),
    ]);
    const { user } = renderMatrix();

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Pay rent”" }));

    await waitFor(() => {
      expect(screen.queryByText("Pay rent")).not.toBeInTheDocument();
    });
    expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { status: "completed" }]]);
  });

  it("moves a Task to its new Quadrant when its Priority changes in the drawer", async () => {
    mockApi([task({ id: 1, title: "Plan the trip", priority: 3 })]);
    const { user } = renderMatrix();

    await user.click(await screen.findByRole("button", { name: /^Plan the trip/ }));
    const drawer = await screen.findByRole("dialog", { name: "Task details" });
    await user.click(within(drawer).getByRole("button", { name: "Priority: Priority 3" }));
    await user.click(screen.getByRole("menuitemradio", { name: /Priority 1/ }));
    await within(drawer).findByRole("button", { name: "Priority: Priority 1" });
    await user.click(within(drawer).getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(titlesIn("Important not urgent")).toEqual(["Plan the trip"]);
    });
    expect(titlesIn("Neither")).toEqual([]);
  });

  it("stacks the Quadrants on a phone as sections that fold away, remembered", async () => {
    mockApi([task({ id: 1, title: "Pay rent", priority: 1, due_date: "2026-10-15" })]);
    const { user } = renderMatrix({ wide: false });

    const fold = await screen.findByRole("button", { name: /^Urgent & Important/ });
    expect(fold).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Pay rent")).toBeInTheDocument();
    await user.click(fold);

    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Pay rent")).not.toBeInTheDocument();
    cleanup();
    renderMatrix({ wide: false });
    expect(await screen.findByRole("button", { name: /^Urgent & Important/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: /^Neither/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("shows every Quadrant open in the grid from lg, with nothing to fold", async () => {
    localStorage.setItem("nudge.matrix.collapsed", JSON.stringify(["urgent-important"]));
    mockApi([task({ id: 1, title: "Pay rent", priority: 1, due_date: "2026-10-15" })]);

    renderMatrix();

    expect(await screen.findByText("Pay rent")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Urgent & Important/ })).not.toBeInTheDocument();
  });
});

/** The body of every Task the page created. */
function created(fetchSpy: ReturnType<typeof mockApi>) {
  return Promise.all(
    fetchSpy.mock.calls
      .map(([input]) => requestOf(input))
      .filter((request) => request.method === "POST")
      .map(async (request) => (await request.clone().json()) as NewTask),
  );
}

/** Open a Quadrant's Quick add line, type into it and press Enter. */
async function addIn(user: ReturnType<typeof renderMatrix>["user"], label: string, text: string) {
  await user.click(within(quadrant(label)).getByRole("button", { name: `Add a task to ${label}` }));
  await user.type(within(quadrant(label)).getByRole("combobox", { name: "New task" }), text);
  await user.keyboard("{Enter}");
}

describe("MatrixView Quick add", () => {
  it("adds a Task to Urgent & Important as Priority 1, due today, in the Inbox", async () => {
    const fetchSpy = mockApi();
    const { user } = renderMatrix();

    await screen.findAllByText("Nothing here.");
    await addIn(user, "Urgent & Important", "Pay rent");

    await waitFor(async () => {
      expect(await created(fetchSpy)).toEqual([
        { title: "Pay rent", project_id: INBOX.id, priority: 1, dates: { due_date: "2026-10-15" } },
      ]);
    });
    await waitFor(() => {
      expect(titlesIn("Urgent & Important")).toEqual(["Pay rent"]);
    });
  });

  it.each([
    ["Important not urgent", { priority: 2 }],
    ["Urgent not important", { dates: { due_date: "2026-10-15" } }],
    ["Neither", {}],
  ])("adds a Task to %s with what puts it there", async (label, defaults) => {
    const fetchSpy = mockApi();
    const { user } = renderMatrix();

    await screen.findAllByText("Nothing here.");
    await addIn(user, label, "Call mum");

    await waitFor(async () => {
      expect(await created(fetchSpy)).toEqual([
        { title: "Call mum", project_id: INBOX.id, ...defaults },
      ]);
    });
    await waitFor(() => {
      expect(titlesIn(label)).toEqual(["Call mum"]);
    });
  });

  it("lets a typed Priority, date and Project take the place of the Quadrant's", async () => {
    const fetchSpy = mockApi();
    const { user } = renderMatrix();

    await screen.findAllByText("Nothing here.");
    await addIn(user, "Urgent & Important", "Call Sam !3 next monday ~Work{Escape}");

    await waitFor(async () => {
      expect(await created(fetchSpy)).toEqual([
        {
          title: "Call Sam",
          project_id: WORK.id,
          priority: 3,
          dates: { due_date: "2026-10-19", due_time: null, start_date: null, start_time: null },
        },
      ]);
    });
    await waitFor(() => {
      expect(titlesIn("Neither")).toEqual(["Call Sam"]);
    });
  });

  it("drops a Quadrant's Priority when its chip is removed", async () => {
    const fetchSpy = mockApi();
    const { user } = renderMatrix();

    await screen.findAllByText("Nothing here.");
    await user.click(
      within(quadrant("Important not urgent")).getByRole("button", {
        name: "Add a task to Important not urgent",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Remove Priority 2" }));
    await user.keyboard("Water plants{Enter}");

    await waitFor(async () => {
      expect(await created(fetchSpy)).toEqual([{ title: "Water plants", project_id: INBOX.id }]);
    });
  });

  it("closes Quick add when it is left empty", async () => {
    mockApi();
    const { user } = renderMatrix();

    await screen.findAllByText("Nothing here.");
    await user.click(screen.getByRole("button", { name: "Add a task to Neither" }));
    expect(within(quadrant("Neither")).getByRole("combobox", { name: "New task" })).toHaveFocus();
    await user.click(document.body);

    expect(screen.queryByRole("combobox", { name: "New task" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a task to Neither" })).toBeInTheDocument();
  });

  it("hides a folded Quadrant's Quick add on a phone", async () => {
    mockApi();
    const { user } = renderMatrix({ wide: false });

    await user.click(await screen.findByRole("button", { name: /^Neither/ }));

    expect(screen.queryByRole("button", { name: "Add a task to Neither" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a task to Urgent & Important" })).toBeVisible();
  });
});
