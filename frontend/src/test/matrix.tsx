import { screen, within } from "@testing-library/react";

import { MatrixView } from "@/features/matrix/matrix-view";
import type { NewTask, TaskDetail } from "@/features/tasks/tasks";
import { stubScreenWidth } from "@/test/calendar";
import { INBOX, json, renderListRoute, WORK } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { bulkApplied, makeTask, type BulkBody } from "@/test/tasks";

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

/** A new Task added to the Tasks, or a bulk change made to them. */
async function posted(request: Request, tasks: TaskDetail[]) {
  if (new URL(request.url).pathname.endsWith("/tasks/bulk")) {
    return json(bulkApplied(tasks, (await request.clone().json()) as BulkBody));
  }
  return json(await addTask(request, tasks), 201);
}

/**
 * A stand-in server: All's open Tasks, each Task's details, PATCHes and bulk changes that save
 * to them, and new Tasks added to them.
 */
export function mockApi(tasks: TaskDetail[] = []) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/sidebar") {
      return json({ inbox: INBOX, items: [WORK], archived: [], tags: [], people: [] });
    }
    if (request.method === "POST") return posted(request, tasks);
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
      const { dates, ...change } = (await request.clone().json()) as Partial<TaskDetail> & {
        dates?: Partial<TaskDetail> | null;
      };
      const affected = [{ id: found.id, prior_status: found.status, prior_blocked_reason: "" }];
      Object.assign(found, change, dates);
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

/**
 * jsdom lays nothing out, so place the Quadrants in their 2×2 grid and stack each one's cards
 * down it for dnd-kit to measure. The drag preview floats outside the grid, so it sits where the
 * focused grip's card is.
 */
export function layOutMatrix() {
  const QUADRANT = 'section[aria-labelledby^="quadrant-"]';
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const target = this.closest(QUADRANT) ? this : document.activeElement;
    const section = target?.closest(QUADRANT);
    if (!target || !section) return new DOMRect(0, 0, 0, 0);
    const index = [...document.querySelectorAll(QUADRANT)].indexOf(section);
    const left = (index % 2) * 500;
    const top = Math.floor(index / 2) * 400;
    const card = target.closest("li");
    if (!card) return new DOMRect(left, top, 480, 380);
    const below = [...section.querySelectorAll("li")].indexOf(card) * 60;
    return new DOMRect(left + 10, top + 40 + below, 460, 50);
  });
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
