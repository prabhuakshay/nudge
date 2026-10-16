import { screen, within } from "@testing-library/react";

import { MatrixView } from "@/features/matrix/matrix-view";
import type { NewTask, TaskDetail } from "@/features/tasks/tasks";
import { stubScreenWidth } from "@/test/calendar";
import { INBOX, json, renderListRoute, WORK } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";

/* Shared setup for the Matrix's tests. */

/** Add the Task a create request asks for to `tasks`, as the server would. */
async function addTask(request: Request, tasks: TaskDetail[]) {
  const body = (await request.clone().json()) as NewTask;
  const added = makeTask({
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
export function mockApi(tasks: TaskDetail[] = []) {
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

/** The Matrix on a test router, in the `lg` grid unless `wide` is false, which makes it a phone. */
export function renderMatrix({ wide = true } = {}) {
  stubScreenWidth({ wide });
  return renderListRoute(<MatrixView inbox={INBOX} timeZone="Europe/London" />);
}

/** A Quadrant's region, by its label. */
export function quadrant(label: string) {
  return screen.getByRole("region", { name: label });
}

/** The titles of a Quadrant's cards, top to bottom. */
export function titlesIn(label: string) {
  return within(quadrant(label))
    .queryAllByRole("listitem")
    .map((card) => card.querySelector("[data-task-title]")?.textContent);
}
