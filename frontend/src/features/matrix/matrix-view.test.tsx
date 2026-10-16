import { cleanup, screen, waitFor, within } from "@testing-library/react";

import { stubScreenWidth } from "@/test/calendar";
import { INBOX, json, renderListRoute, WORK } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { patches } from "@/test/drawer";
import { makeTask as task } from "@/test/tasks";
import type { TaskDetail } from "@/features/tasks/tasks";

import { MatrixView } from "./matrix-view";

/** A stand-in server: All's open Tasks, each Task's details, and PATCHes that save to them. */
function mockApi(tasks: TaskDetail[] = []) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/sidebar") {
      return json({ inbox: INBOX, items: [WORK], archived: [], tags: [], people: [] });
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
