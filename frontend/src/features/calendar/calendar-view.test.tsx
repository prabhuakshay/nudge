import { screen, within } from "@testing-library/react";
import { useState } from "react";

import { INBOX, json, renderListRoute, WORK } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";
import { GlobalQuickAdd } from "@/features/tasks/global-quick-add";
import type { NewTask, TaskDetail } from "@/features/tasks/tasks";

import { validateCalendarSearch } from "./calendar";
import { CalendarView } from "./calendar-view";

const task = makeTask;

/** A stand-in server: the sidebar, the Calendar's Tasks, each Task's detail and its PATCHes. */
function mockApi(tasks: TaskDetail[] = []) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/sidebar") {
      return json({ inbox: INBOX, items: [WORK], archived: [], tags: [], people: [] });
    }
    if (url.pathname === "/api/v1/tasks/calendar") return json({ items: tasks });
    if (url.pathname === "/api/v1/tasks" && request.method === "POST") {
      const body = (await request.clone().json()) as NewTask;
      const added = task({ id: 50, title: body.title, ...body.dates });
      tasks.push(added);
      return json(added, 201);
    }
    if (url.pathname.endsWith("/activity")) return json({ items: [], next_cursor: null, count: 0 });
    if (url.pathname.endsWith("/attachments") || url.pathname.endsWith("/comments"))
      return json([]);
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

function calendarRequests(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .map(([input]) => new URL(requestOf(input).url))
    .filter((url) => url.pathname === "/api/v1/tasks/calendar")
    .map((url) => url.search);
}

function renderCalendar(url = "/") {
  return renderListRoute(<CalendarView inbox={INBOX} timeZone="Europe/London" />, {
    url,
    validateSearch: validateCalendarSearch,
  });
}

/** The Quick add dialog as the app hosts it, open on the given draft. */
function QuickAddHost({ draft }: { draft: string }) {
  const [shown, setShown] = useState<string | null>(draft);
  return <GlobalQuickAdd draft={shown} onDraftChange={setShown} />;
}

function day(label: string) {
  return screen.getByRole("gridcell", { name: new RegExp(`^${label}`) });
}

beforeEach(() => {
  // Thursday 15 October 2026, 10:00 in London.
  vi.useFakeTimers({ now: new Date("2026-10-15T09:00:00Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CalendarView in Month mode", () => {
  it("shows this month in whole weeks from Monday, today marked", async () => {
    const fetchSpy = mockApi();

    renderCalendar();

    expect(await screen.findByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    const days = screen.getAllByRole("gridcell");
    expect(days).toHaveLength(35);
    expect(days[0]).toHaveAccessibleName(/^Monday 28 September 2026/);
    expect(day("Thursday 15 October 2026")).toHaveAccessibleName("Thursday 15 October 2026, today");
    expect(calendarRequests(fetchSpy)).toEqual(["?start=2026-09-28&end=2026-11-01"]);
  });

  it("draws each Task on every day its dates cover", async () => {
    mockApi([
      task({ id: 1, title: "Pay rent", due_date: "2026-10-01" }),
      task({ id: 2, title: "Trip", start_date: "2026-10-20", due_date: "2026-10-22" }),
    ]);

    renderCalendar();

    await screen.findByText("Pay rent");
    expect(within(day("Thursday 1 October")).getByText("Pay rent")).toBeInTheDocument();
    for (const covered of ["Tuesday 20 October", "Wednesday 21 October", "Thursday 22 October"]) {
      expect(within(day(covered)).getByText("Trip")).toBeInTheDocument();
    }
    expect(within(day("Monday 19 October")).queryByText("Trip")).not.toBeInTheDocument();
  });

  it("labels each Task with its date, time and state, and a Subtask with its parent", async () => {
    mockApi([
      task({
        id: 1,
        title: "Call the bank",
        due_date: "2026-10-12",
        due_time: "09:30:00",
        is_overdue: true,
        project_id: WORK.id,
      }),
      task({ id: 2, title: "Buy milk", due_date: "2026-10-14", status: "completed" }),
      task({
        id: 3,
        title: "Book the van",
        due_date: "2026-10-16",
        parent_id: 9,
        parent_title: "Move house",
      }),
    ]);

    renderCalendar();

    expect(
      await screen.findByRole("button", {
        name: "Call the bank, Monday 12 October, 09:30, in Work, overdue",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Buy milk, Wednesday 14 October, in Inbox, completed" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Reopen “Buy milk”" })).toBeChecked();
    expect(within(day("Friday 16 October")).getByText("Move house")).toBeInTheDocument();
  });

  it("steps to the next and previous month and back to today, keeping the place in the address", async () => {
    const fetchSpy = mockApi();
    const { user, router } = renderCalendar();

    await user.click(await screen.findByRole("button", { name: "Next month" }));

    expect(await screen.findByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ mode: "month", date: "2026-11-15" });

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await user.click(screen.getByRole("button", { name: "Previous month" }));

    expect(await screen.findByRole("heading", { name: "September 2026" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(await screen.findByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(new Set(calendarRequests(fetchSpy))).toEqual(
      new Set([
        "?start=2026-09-28&end=2026-11-01",
        "?start=2026-10-26&end=2026-12-06",
        "?start=2026-08-31&end=2026-10-04",
      ]),
    );
  });

  it("opens the month a link names", async () => {
    mockApi();

    renderCalendar("/?mode=month&date=2026-12-03");

    expect(await screen.findByRole("heading", { name: "December 2026" })).toBeInTheDocument();
    expect(day("Thursday 3 December 2026")).toHaveAttribute("tabindex", "0");
  });

  it("shows today's month for a link with a date that isn't one", async () => {
    mockApi();

    renderCalendar("/?mode=month&date=2026-13-45");

    expect(await screen.findByRole("heading", { name: "October 2026" })).toBeInTheDocument();
  });

  it("opens a Task's detail when it is clicked", async () => {
    mockApi([task({ id: 4, title: "Pay rent", due_date: "2026-10-15" })]);
    const { user, router } = renderCalendar();

    await user.click(await screen.findByRole("button", { name: /^Pay rent/ }));

    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ task: 4 });
  });

  it("completes a Task in place when it is ticked", async () => {
    const fetchSpy = mockApi([task({ id: 4, title: "Pay rent", due_date: "2026-10-15" })]);
    const { user } = renderCalendar();

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Pay rent”" }));

    expect(screen.getByRole("checkbox", { name: "Reopen “Pay rent”" })).toBeChecked();
    const patches = fetchSpy.mock.calls
      .map(([input]) => requestOf(input))
      .filter((request) => request.method === "PATCH");
    expect(patches.map((request) => new URL(request.url).pathname)).toEqual(["/api/v1/tasks/4"]);
    expect(await patches[0]?.json()).toEqual({ status: "completed" });
    await vi.waitFor(() => {
      expect(calendarRequests(fetchSpy)).toHaveLength(2);
    });
  });

  it("moves between days with the arrow keys and into a day's Tasks with Tab", async () => {
    mockApi([task({ id: 4, title: "Pay rent", due_date: "2026-10-23" })]);
    const { user, router } = renderCalendar();
    await screen.findByText("Pay rent");

    day("Thursday 15 October").focus();
    await user.keyboard("{ArrowRight}");
    expect(day("Friday 16 October")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(day("Friday 23 October")).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(screen.getByRole("checkbox", { name: "Complete “Pay rent”" })).toHaveFocus();
    await user.keyboard("{Tab}{Enter}");

    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ date: "2026-10-23", task: 4 });
  });

  it("moves into the next month with the arrow keys past the last week", async () => {
    mockApi();
    const { user } = renderCalendar("/?mode=month&date=2026-10-31");
    await screen.findByRole("heading", { name: "October 2026" });

    day("Saturday 31 October").focus();
    await user.keyboard("{ArrowDown}");

    expect(await screen.findByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    expect(day("Saturday 7 November")).toHaveFocus();
  });

  it("shows a Task added from Quick add straight away", async () => {
    mockApi();
    const { user } = renderListRoute(
      <>
        <CalendarView inbox={INBOX} timeZone="Europe/London" />
        <QuickAddHost draft="Water plants tomorrow" />
      </>,
      { validateSearch: validateCalendarSearch },
    );

    await user.type(await screen.findByRole("combobox", { name: "New task" }), "{Enter}");

    await vi.waitFor(() => {
      expect(within(day("Friday 16 October")).getByText("Water plants")).toBeInTheDocument();
    });
  });
});
