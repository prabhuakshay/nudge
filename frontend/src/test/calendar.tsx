import { screen } from "@testing-library/react";

import { CalendarView } from "@/features/calendar/calendar-view";
import { validateCalendarSearch } from "@/features/calendar/calendar";
import type { NewTask, TaskDetail } from "@/features/tasks/tasks";

import { INBOX, json, renderListRoute, WORK } from "./drawer";
import { requestOf } from "./fetch";
import { makeTask } from "./tasks";

/*
 * What the Calendar's component tests share: a stand-in server, the Calendar rendered on a route,
 * and a way to find a day in the grid.
 */

/** A stand-in server: the sidebar, the Calendar's Tasks, each Task's detail and its PATCHes. */
export function mockApi(tasks: TaskDetail[] = []) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/sidebar") {
      return json({ inbox: INBOX, items: [WORK], archived: [], tags: [], people: [] });
    }
    if (url.pathname === "/api/v1/tasks/calendar") return json({ items: tasks });
    if (url.pathname === "/api/v1/tasks" && request.method === "POST") {
      const body = (await request.clone().json()) as NewTask;
      const added = makeTask({ id: 50, title: body.title, ...body.dates });
      tasks.push(added);
      return json(added, 201);
    }
    if (url.pathname.endsWith("/activity")) return json({ items: [], next_cursor: null, count: 0 });
    if (url.pathname.endsWith("/attachments") || url.pathname.endsWith("/comments"))
      return json([]);
    const found = tasks.find((each) => each.id === Number(url.pathname.split("/").at(-1)));
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

/** The search of every Calendar range asked for, in order. */
export function calendarRequests(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .map(([input]) => new URL(requestOf(input).url))
    .filter((url) => url.pathname === "/api/v1/tasks/calendar")
    .map((url) => url.search);
}

/** The Calendar View on a route at `url`, in London. */
export function renderCalendar(url = "/") {
  return renderListRoute(<CalendarView inbox={INBOX} timeZone="Europe/London" />, {
    url,
    validateSearch: validateCalendarSearch,
  });
}

/** The grid's day whose label starts with `label`, such as "Thursday 15 October". */
export function day(label: string) {
  return screen.getByRole("gridcell", { name: new RegExp(`^${label}`) });
}
