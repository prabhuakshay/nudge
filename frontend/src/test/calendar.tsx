/** Test helpers for the Calendar View: a stand-in server and a router to render it on. */
import { screen } from "@testing-library/react";

import { validateCalendarSearch, type CalendarRange } from "@/features/calendar/calendar";
import { CalendarView } from "@/features/calendar/calendar-view";
import type { NewTask, TaskDetail } from "@/features/tasks/tasks";

import { INBOX, json, renderListRoute, WORK } from "./drawer";
import { requestOf } from "./fetch";
import { makeTask } from "./tasks";

/** Repeating Tasks and the days they come back on, as the Calendar range returns them. */
type Later = Pick<CalendarRange, "occurrences"> & { repeating: TaskDetail[] };

/**
 * A stand-in server: the sidebar, the Calendar's Tasks and future Occurrences, each Task's
 * detail and its PATCHes.
 */
export function mockApi(
  tasks: TaskDetail[] = [],
  { occurrences, repeating }: Later = { occurrences: [], repeating: [] },
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/sidebar") {
      return json({ inbox: INBOX, items: [WORK], archived: [], tags: [], people: [] });
    }
    if (url.pathname === "/api/v1/tasks/calendar")
      return json({ items: tasks, occurrences, repeating });
    if (url.pathname === "/api/v1/tasks" && request.method === "POST") {
      const body = (await request.clone().json()) as NewTask;
      const added = makeTask({ id: 50, title: body.title, ...body.dates });
      tasks.push(added);
      return json(added, 201);
    }
    if (url.pathname.endsWith("/activity")) return json({ items: [], next_cursor: null, count: 0 });
    if (url.pathname.endsWith("/attachments") || url.pathname.endsWith("/comments"))
      return json([]);
    const found = [...tasks, ...repeating].find(
      (each) => each.id === Number(url.pathname.split("/").at(-1)),
    );
    if (!found) return json({ detail: "Not found." }, 404);
    if (request.method === "PATCH") {
      const { dates, ...change } = (await request.clone().json()) as Partial<TaskDetail> & {
        dates?: Partial<TaskDetail>;
      };
      const affected = [{ id: found.id, prior_status: found.status, prior_blocked_reason: "" }];
      Object.assign(found, change, dates);
      return json({ task: found, affected });
    }
    return json(found);
  });
}

/** The query strings of every Calendar range the page asked for. */
export function calendarRequests(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .map(([input]) => new URL(requestOf(input).url))
    .filter((url) => url.pathname === "/api/v1/tasks/calendar")
    .map((url) => url.search);
}

const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;

/**
 * Makes media queries answer as a desktop screen would, or a phone's when `wide` is false. Only
 * width queries match, so neither screen is a touch screen.
 */
export function stubScreenWidth({ wide }: { wide: boolean }) {
  const width = wide ? DESKTOP_WIDTH : PHONE_WIDTH;
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? Infinity),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/**
 * The Calendar View on a test router, at `url`, on a screen from `sm` up unless `wide` is false,
 * which makes it a phone.
 */
export function renderCalendar(url = "/", { wide = true } = {}) {
  stubScreenWidth({ wide });
  return renderListRoute(<CalendarView inbox={INBOX} timeZone="Europe/London" />, {
    url,
    validateSearch: validateCalendarSearch,
  });
}

/** The Month cell whose label starts with `label`. */
export function day(label: string) {
  return screen.getByRole("gridcell", { name: new RegExp(`^${label}`) });
}

/** Fixes the clock at Thursday 15 October 2026, 10:00 in London, for every test in the file. */
export function fakeCalendarToday() {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-15T09:00:00Z"), toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
}
