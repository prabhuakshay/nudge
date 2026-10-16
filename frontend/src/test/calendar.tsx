import { INBOX, json, renderListRoute, WORK } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";
import { validateCalendarSearch } from "@/features/calendar/calendar";
import { CalendarView } from "@/features/calendar/calendar-view";
import type { NewTask, TaskDetail } from "@/features/tasks/tasks";

/*
 * Shared by the Calendar View's tests: a stand-in server, the Calendar requests it saw, and the
 * View rendered on a route.
 */

const task = makeTask;

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

export function calendarRequests(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .map(([input]) => new URL(requestOf(input).url))
    .filter((url) => url.pathname === "/api/v1/tasks/calendar")
    .map((url) => url.search);
}

export function renderCalendar(url = "/") {
  return renderListRoute(<CalendarView inbox={INBOX} timeZone="Europe/London" />, {
    url,
    validateSearch: validateCalendarSearch,
  });
}
