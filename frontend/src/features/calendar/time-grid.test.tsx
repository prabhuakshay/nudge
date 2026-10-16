import { screen, within } from "@testing-library/react";

import { calendarRequests, mockApi, renderCalendar } from "@/test/calendar";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";

const task = makeTask;

beforeEach(() => {
  // Thursday 15 October 2026, 10:00 in London.
  vi.useFakeTimers({ now: new Date("2026-10-15T09:00:00Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

function headers() {
  return screen.getAllByRole("columnheader").map((header) => header.textContent);
}

/** A Week or Day slot by its full label, like "Friday 16 October 2026, 09:00". */
function slot(label: string) {
  return screen.getByRole("gridcell", { name: label });
}

/** Where a Task's block sits in its hour slot, as fractions of the slot. */
function blockStyle(title: string) {
  const block = screen.getByRole("button", { name: new RegExp(`^${title},`) }).closest("li");
  const { top, height, left, width } = block?.style ?? {};
  return { top, height, left, width };
}

describe("CalendarView modes", () => {
  it("switches between Month, Week and Day, keeping the mode in the address", async () => {
    const fetchSpy = mockApi();
    const { user, router } = renderCalendar();

    await user.click(await screen.findByRole("button", { name: "Week" }));

    expect(await screen.findByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(headers()).toEqual([
      "Mon 12",
      "Tue 13",
      "Wed 14",
      "Thu 15",
      "Fri 16",
      "Sat 17",
      "Sun 18",
    ]);
    expect(router.state.location.search).toEqual({ mode: "week", date: "2026-10-15" });

    await user.click(screen.getByRole("button", { name: "Day" }));

    expect(
      await screen.findByRole("heading", { name: "Thursday 15 October 2026" }),
    ).toBeInTheDocument();
    expect(headers()).toEqual(["Thu 15"]);

    await user.click(screen.getByRole("button", { name: "Month" }));

    expect(await screen.findByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(headers()).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(new Set(calendarRequests(fetchSpy))).toEqual(
      new Set([
        "?start=2026-09-28&end=2026-11-01",
        "?start=2026-10-12&end=2026-10-18",
        "?start=2026-10-15&end=2026-10-15",
      ]),
    );
  });
});

describe("CalendarView in Day mode", () => {
  it("shows one day's timeline and steps a day at a time", async () => {
    mockApi([
      task({ id: 1, title: "Pay rent", due_date: "2026-10-16" }),
      task({ id: 2, title: "Dentist", due_date: "2026-10-16", due_time: "11:00:00" }),
      task({ id: 3, title: "Gym", due_date: "2026-10-15", due_time: "07:00:00" }),
    ]);
    const { user } = renderCalendar("/?mode=day&date=2026-10-15");

    expect(await screen.findByRole("img", { name: "Now, 10:00" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next day" }));

    expect(
      await screen.findByRole("heading", { name: "Friday 16 October 2026" }),
    ).toBeInTheDocument();
    expect(headers()).toEqual(["Fri 16"]);
    expect(
      within(
        await screen.findByRole("gridcell", { name: "Friday 16 October 2026, all day" }),
      ).getByText("Pay rent"),
    ).toBeInTheDocument();
    expect(within(slot("Friday 16 October 2026, 11:00")).getByText("Dentist")).toBeInTheDocument();
    expect(screen.queryByText("Gym")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^Now/ })).not.toBeInTheDocument();
  });
});

describe("CalendarView in Week mode", () => {
  it("puts all-day Tasks in the strip and timed Tasks at their hour, as tall as their range", async () => {
    mockApi([
      task({ id: 1, title: "Pay rent", due_date: "2026-10-13" }),
      task({ id: 2, title: "Call the bank", due_date: "2026-10-16", due_time: "09:15:00" }),
      task({
        id: 3,
        title: "Workshop",
        start_date: "2026-10-14",
        start_time: "14:30:00",
        due_date: "2026-10-14",
        due_time: "16:00:00",
      }),
    ]);

    renderCalendar("/?mode=week&date=2026-10-15");

    await screen.findByText("Pay rent");
    expect(
      within(slot("Tuesday 13 October 2026, all day")).getByText("Pay rent"),
    ).toBeInTheDocument();
    expect(
      within(slot("Friday 16 October 2026, 09:00")).getByText("Call the bank"),
    ).toBeInTheDocument();
    expect(blockStyle("Call the bank")).toEqual({
      top: "25%",
      height: "50%",
      left: "0%",
      width: "100%",
    });
    expect(
      within(slot("Wednesday 14 October 2026, 14:00")).getByText("Workshop"),
    ).toBeInTheDocument();
    expect(blockStyle("Workshop")).toMatchObject({ top: "50%", height: "150%" });
    expect(
      await screen.findByRole("button", {
        name: "Workshop, Wednesday 14 October, 14:30 – 16:00, in Inbox",
      }),
    ).toBeInTheDocument();
  });

  it("draws a range over several days in the strip of every day it covers", async () => {
    mockApi([
      task({
        id: 1,
        title: "Trip",
        start_date: "2026-10-11",
        start_time: "09:00:00",
        due_date: "2026-10-13",
        due_time: "18:00:00",
      }),
    ]);

    renderCalendar("/?mode=week&date=2026-10-15");

    await screen.findAllByText("Trip");
    expect(within(slot("Monday 12 October 2026, all day")).getByText("Trip")).toBeInTheDocument();
    expect(within(slot("Tuesday 13 October 2026, all day")).getByText("Trip")).toBeInTheDocument();
    expect(screen.getAllByText("Trip")).toHaveLength(2);
  });

  it("puts Tasks that overlap side by side", async () => {
    mockApi([
      task({ id: 1, title: "Standup", due_date: "2026-10-15", due_time: "09:00:00" }),
      task({
        id: 2,
        title: "Planning",
        start_date: "2026-10-15",
        start_time: "09:00:00",
        due_date: "2026-10-15",
        due_time: "10:00:00",
      }),
    ]);

    renderCalendar("/?mode=week&date=2026-10-15");

    await screen.findByText("Standup");
    expect(blockStyle("Planning")).toMatchObject({ left: "0%", width: "50%" });
    expect(blockStyle("Standup")).toMatchObject({ left: "50%", width: "50%" });
  });

  it("marks the current time on today, on the user's clock", async () => {
    mockApi();

    renderCalendar("/?mode=week&date=2026-10-15");

    const line = await screen.findByRole("img", { name: "Now, 10:00" });
    expect(slot("Thursday 15 October 2026, today, 10:00")).toContainElement(line);
    expect(line).toHaveStyle({ top: "0%" });
  });

  it("steps a week at a time and back to today, naming both months of a week across two", async () => {
    const fetchSpy = mockApi();
    const { user, router } = renderCalendar("/?mode=week&date=2026-10-15");

    await user.click(await screen.findByRole("button", { name: "Next week" }));
    await user.click(screen.getByRole("button", { name: "Next week" }));

    expect(
      await screen.findByRole("heading", { name: "October – November 2026" }),
    ).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ mode: "week", date: "2026-10-29" });

    await user.click(screen.getByRole("button", { name: "Previous week" }));
    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(await screen.findByRole("columnheader", { name: "Thu 15" })).toHaveAttribute(
      "aria-current",
      "date",
    );
    expect(new Set(calendarRequests(fetchSpy))).toEqual(
      new Set([
        "?start=2026-10-12&end=2026-10-18",
        "?start=2026-10-19&end=2026-10-25",
        "?start=2026-10-26&end=2026-11-01",
      ]),
    );
  });

  it("moves between slots with the arrow keys and into the day's Tasks with Tab", async () => {
    mockApi([task({ id: 4, title: "Gym", due_date: "2026-10-19", due_time: "07:30:00" })]);
    const { user, router } = renderCalendar("/?mode=week&date=2026-10-18");
    await screen.findByRole("columnheader", { name: "Sun 18" });

    const start = slot("Sunday 18 October 2026, 08:00");
    expect(start).toHaveAttribute("tabindex", "0");
    start.focus();
    await user.keyboard("{ArrowRight}");

    expect(await screen.findByRole("columnheader", { name: "Mon 19" })).toBeInTheDocument();
    expect(slot("Monday 19 October 2026, 08:00")).toHaveFocus();
    expect(router.state.location.search).toEqual({ mode: "week", date: "2026-10-19" });

    await user.keyboard("{ArrowUp}");
    expect(slot("Monday 19 October 2026, 07:00")).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(screen.getByRole("checkbox", { name: "Complete “Gym”" })).toHaveFocus();
    await user.keyboard("{Tab}{Enter}");

    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ task: 4 });
  });

  it("moves up from midnight into the all-day strip", async () => {
    mockApi();
    const { user } = renderCalendar("/?mode=week&date=2026-10-15");
    await screen.findByRole("columnheader", { name: "Thu 15" });

    slot("Thursday 15 October 2026, today, 08:00").focus();
    for (let hour = 0; hour < 9; hour += 1) await user.keyboard("{ArrowUp}");

    expect(slot("Thursday 15 October 2026, today, all day")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(slot("Thursday 15 October 2026, today, 00:00")).toHaveFocus();
  });

  it("completes a timed Task in place when it is ticked", async () => {
    const fetchSpy = mockApi([
      task({ id: 4, title: "Gym", due_date: "2026-10-15", due_time: "07:30:00" }),
    ]);
    const { user } = renderCalendar("/?mode=week&date=2026-10-15");

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Gym”" }));

    expect(screen.getByRole("checkbox", { name: "Reopen “Gym”" })).toBeChecked();
    const patch = fetchSpy.mock.calls
      .map(([input]) => requestOf(input))
      .find((request) => request.method === "PATCH");
    expect(await patch?.json()).toEqual({ status: "completed" });
  });

  it("leaves the current time out of a week without today", async () => {
    mockApi();

    renderCalendar("/?mode=week&date=2026-10-22");

    expect(await screen.findByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^Now/ })).not.toBeInTheDocument();
  });
});
