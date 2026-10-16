import { screen, within } from "@testing-library/react";

import { INBOX, json, renderListRoute } from "@/test/drawer";
import { makeTask } from "@/test/tasks";
import { requestOf } from "@/test/fetch";

import type { ScheduleView } from "./schedule";
import { ScheduleList } from "./schedule-list";
import type { Task } from "./tasks";

const task = makeTask;

/** A stand-in server: a view's open Tasks, the Tasks closed today, and Task creation. */
function mockApi({ open = [], closed = [] }: { open?: Task[]; closed?: Task[] } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    if (request.method === "POST") {
      const body = (await request.clone().json()) as { title: string };
      return json(task({ id: 100, title: body.title }), 201);
    }
    if (url.pathname === "/api/v1/sidebar") {
      return json({ inbox: INBOX, items: [], archived: [], today_count: 0, upcoming_count: 0 });
    }
    if (url.searchParams.get("closed") === "true") {
      return json({ items: closed, next_cursor: null });
    }
    return json({ items: open, next_cursor: null });
  });
}

async function requestsTo(fetchSpy: ReturnType<typeof mockApi>, method: string) {
  const requests = fetchSpy.mock.calls
    .map(([input]) => requestOf(input))
    .filter((request) => request.method === method);
  return Promise.all(
    requests.map(async (request) => {
      const url = new URL(request.url);
      return method === "GET"
        ? `${url.pathname}${url.search}`
        : ((await request.clone().json()) as unknown);
    }),
  );
}

function renderView(view: ScheduleView) {
  return renderListRoute(<ScheduleList view={view} inbox={INBOX} timeZone="Europe/London" />).user;
}

function titlesIn(group: string) {
  return within(screen.getByRole("region", { name: group }))
    .queryAllByRole("row")
    .map((row) => row.querySelector("[data-task-title]")?.textContent);
}

beforeEach(() => {
  // Thursday 15 October 2026, 10:00 in London.
  vi.useFakeTimers({ now: new Date("2026-10-15T09:00:00Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ScheduleList", () => {
  it("shows Today's Tasks with Overdue first, flat, each Subtask under its parent's title", async () => {
    const fetchSpy = mockApi({
      open: [
        task({ id: 1, title: "Pay rent", due_date: "2026-10-12", is_overdue: true }),
        task({
          id: 2,
          title: "Book the van",
          due_date: "2026-10-15",
          parent_id: 9,
          parent_title: "Move house",
          depth: 1,
        }),
        task({ id: 3, title: "Buy milk", due_date: "2026-10-15" }),
      ],
    });

    renderView("today");

    expect(await screen.findByText("Pay rent")).toBeInTheDocument();
    expect(await requestsTo(fetchSpy, "GET")).toContain("/api/v1/tasks?view=today");
    expect(titlesIn("Overdue")).toEqual(["Pay rent"]);
    expect(titlesIn("Today")).toEqual(["Book the van", "Buy milk"]);
    const subtask = screen.getByText("Book the van").closest<HTMLElement>("[role=row]");
    if (!subtask) throw new Error("No row for the Subtask.");
    expect(subtask).toHaveAttribute("aria-level", "1");
    expect(within(subtask).getByText("Move house")).toBeInTheDocument();
  });

  it("shows Pinned Tasks in their own group first", async () => {
    mockApi({
      open: [
        task({
          id: 1,
          title: "Pay rent",
          due_date: "2026-10-15",
          pinned_at: "2026-10-01T09:00:00Z",
        }),
        task({ id: 2, title: "Buy milk", due_date: "2026-10-15" }),
      ],
    });

    renderView("today");

    expect(await screen.findByText("Pay rent")).toBeInTheDocument();
    expect(titlesIn("Pinned")).toEqual(["Pay rent"]);
    expect(titlesIn("Today")).toEqual(["Buy milk"]);
    expect(screen.getAllByRole("region")[0]).toHaveAccessibleName("Pinned");
  });

  it("keeps the Tasks closed today folded away until asked", async () => {
    const fetchSpy = mockApi({
      closed: [task({ id: 4, title: "Call mum", status: "completed", due_date: "2026-10-15" })],
    });
    const user = renderView("today");

    await user.click(await screen.findByRole("button", { name: "Closed today" }));

    expect(await screen.findByText("Call mum")).toBeInTheDocument();
    expect(await requestsTo(fetchSpy, "GET")).toContain("/api/v1/tasks?view=today&closed=true");
  });

  it.each([
    ["today", "2026-10-15"],
    ["upcoming", "2026-10-16"],
  ] as const)("adds a Task from %s's Quick add due on %s, in the Inbox", async (view, date) => {
    const fetchSpy = mockApi();
    const user = renderView(view);

    await user.type(
      await screen.findByRole("combobox", { name: "New task" }),
      "Water plants{Enter}",
    );

    await vi.waitFor(async () => {
      expect(await requestsTo(fetchSpy, "POST")).toEqual([
        { title: "Water plants", project_id: INBOX.id, dates: { due_date: date } },
      ]);
    });
  });

  it("lets a typed date take the place of the view's", async () => {
    const fetchSpy = mockApi();
    const user = renderView("today");
    const field = await screen.findByRole("combobox", { name: "New task" });

    await user.type(field, "Water plants friday 5pm");
    expect(screen.queryByRole("button", { name: "Remove Today" })).not.toBeInTheDocument();
    expect(screen.getByText("Tomorrow, 17:00")).toBeInTheDocument();
    await user.keyboard("{Enter}");

    await vi.waitFor(async () => {
      expect(await requestsTo(fetchSpy, "POST")).toEqual([
        {
          title: "Water plants",
          project_id: INBOX.id,
          dates: { due_date: "2026-10-16", due_time: "17:00", start_date: null, start_time: null },
        },
      ]);
    });
  });

  it("groups Upcoming by day for a week, then by month", async () => {
    mockApi({
      open: [
        task({ id: 1, title: "Dentist", due_date: "2026-10-16" }),
        task({ id: 2, title: "Hike", due_date: "2026-10-18" }),
        task({ id: 3, title: "Renew passport", due_date: "2026-11-20" }),
      ],
    });

    renderView("upcoming");

    expect(await screen.findByText("Dentist")).toBeInTheDocument();
    expect(titlesIn("Tomorrow")).toEqual(["Dentist"]);
    expect(titlesIn("Sunday")).toEqual(["Hike"]);
    expect(titlesIn("November")).toEqual(["Renew passport"]);
    expect(screen.queryByRole("region", { name: "Pinned" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Closed/ })).not.toBeInTheDocument();
  });
});
