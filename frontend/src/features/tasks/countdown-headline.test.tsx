import { screen, within } from "@testing-library/react";

import { INBOX, json, renderListRoute } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask as task } from "@/test/tasks";

import { ScheduleList } from "./schedule-list";
import type { Task } from "./tasks";

/** A stand-in server listing Today's and Upcoming's open Tasks, and any one Task by id. */
function mockApi({ today = [], upcoming = [] }: { today?: Task[]; upcoming?: Task[] }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = new URL(requestOf(input).url);
    if (url.pathname === "/api/v1/sidebar") {
      return Promise.resolve(json({ inbox: INBOX, items: [], archived: [] }));
    }
    const found = /^\/api\/v1\/tasks\/(\d+)$/.exec(url.pathname);
    if (found) {
      const all = [...today, ...upcoming];
      return Promise.resolve(json(all.find((each) => each.id === Number(found[1]))));
    }
    if (/\/(activity|attachments|comments)$/.test(url.pathname)) {
      return Promise.resolve(
        url.pathname.endsWith("activity")
          ? json({ items: [], next_cursor: null, count: 0 })
          : json([]),
      );
    }
    const items = url.searchParams.get("view") === "upcoming" ? upcoming : today;
    const closed = url.searchParams.get("closed") === "true";
    return Promise.resolve(json({ items: closed ? [] : items, next_cursor: null }));
  });
}

function renderToday() {
  return renderListRoute(<ScheduleList view="today" inbox={INBOX} timeZone="Europe/London" />).user;
}

function rowOf(title: string) {
  const row = screen.getByText(title).closest<HTMLElement>("[role=row]");
  if (!row) throw new Error(`No row for “${title}”.`);
  return row;
}

beforeEach(() => {
  // Thursday 15 October 2026, 10:00 in London.
  vi.useFakeTimers({ now: new Date("2026-10-15T09:00:00Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Countdown rows", () => {
  it("shows a Countdown's days left on its row", async () => {
    mockApi({
      today: [
        task({ id: 1, title: "Party", countdown: true, due_date: "2026-10-15" }),
        task({ id: 2, title: "Pay rent", due_date: "2026-10-15" }),
      ],
    });
    renderToday();

    expect(await screen.findByText("Party")).toBeInTheDocument();
    expect(rowOf("Party").querySelector("[data-countdown]")).toHaveTextContent("Countdown: Today");
    expect(rowOf("Pay rent").querySelector("[data-countdown]")).toBeNull();
  });

  it("shows no days left once a Countdown is Overdue", async () => {
    mockApi({
      today: [
        task({ id: 1, title: "Exam", countdown: true, due_date: "2026-10-14", is_overdue: true }),
      ],
    });
    renderToday();

    expect(await screen.findByText("Exam")).toBeInTheDocument();
    expect(rowOf("Exam").querySelector("[data-countdown]")).toBeNull();
  });
});

describe("Today's Countdown headline", () => {
  it("names the soonest Countdown still to come", async () => {
    mockApi({
      today: [task({ id: 1, title: "Party", countdown: true, due_date: "2026-10-15" })],
      upcoming: [
        task({ id: 2, title: "Trip", countdown: true, due_date: "2026-11-20" }),
        task({ id: 3, title: "Dentist", due_date: "2026-10-16" }),
        task({ id: 4, title: "Exam", countdown: true, due_date: "2026-10-27" }),
      ],
    });
    renderToday();

    expect(await screen.findByRole("button", { name: "Exam in 12 days" })).toBeInTheDocument();
  });

  it("opens the Countdown's Task when clicked", async () => {
    mockApi({
      upcoming: [task({ id: 4, title: "Exam", countdown: true, due_date: "2026-10-27" })],
    });
    const user = renderToday();

    await user.click(await screen.findByRole("button", { name: "Exam in 12 days" }));

    const drawer = await screen.findByRole("dialog", { name: "Task details" });
    expect(await within(drawer).findByDisplayValue("Exam")).toBeInTheDocument();
  });

  it("isn't there without a Countdown to come", async () => {
    mockApi({
      today: [task({ id: 1, title: "Party", countdown: true, due_date: "2026-10-15" })],
      upcoming: [task({ id: 3, title: "Dentist", due_date: "2026-10-16" })],
    });
    renderToday();

    expect(await screen.findByText("Party")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\bin \d+ days\b|tomorrow$/ })).toBeNull();
  });
});
