import { screen, within } from "@testing-library/react";

import type { Section } from "@/features/sections/sections";
import { moveRow } from "@/features/tasks/task-drag";
import type { SidebarProject, Task } from "@/features/tasks/tasks";
import { INBOX, WORK, json } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";

/* A stand-in server and list queries for the Sections feature's tests, shared by their files. */

export const TO_DO: Section = { id: 31, project_id: WORK.id, name: "To do", collapsed: false };
export const DOING: Section = { id: 32, project_id: WORK.id, name: "Doing", collapsed: false };
export const DONE: Section = { id: 33, project_id: WORK.id, name: "Done", collapsed: false };

/** The Sections with one's fields changed. */
function changed(sections: Section[], changedId: number, fields: Partial<Section>) {
  return sections.map((section) =>
    section.id === changedId ? { ...section, ...fields } : section,
  );
}

/** The Sections with one moved right after `afterId`, or first when it's null. */
function placedAfter(sections: Section[], movedId: number, afterId: number | null) {
  const section = sections.find(({ id }) => id === movedId);
  const rest = sections.filter((other) => other !== section);
  const at = afterId === null ? 0 : rest.findIndex(({ id }) => id === afterId) + 1;
  return section ? [...rest.slice(0, at), section, ...rest.slice(at)] : rest;
}

/** A Task move as the client sends it. */
type MoveBody = { parent_id: number | null; after_id: number | null; section_id?: number | null };

/** The Tasks with one moved as `body` says; a Section left out stays as it was. */
function movedTask(tasks: Task[], movedId: number, body: MoveBody) {
  const placement = { parentId: body.parent_id, afterId: body.after_id };
  return moveRow(tasks, movedId, placement).map((task) =>
    task.id === movedId && body.section_id !== undefined
      ? { ...task, section_id: body.section_id }
      : task,
  );
}

/**
 * A stand-in server holding a Project's Sections and open Tasks; it adds, changes, moves and
 * deletes Sections, adds and moves Tasks, and changes the Project.
 */
export function mockApi({
  sections = [TO_DO, DOING],
  open = [],
  project = WORK,
}: {
  sections?: Section[];
  open?: Task[];
  /** The Project the sidebar lists beside the Inbox; PATCHes to it change it. */
  project?: SidebarProject;
}) {
  let nextId = 100;
  /** Adds the Task a POST describes, first in the Project or last when it asks; its answer. */
  const createTask = async (request: Request) => {
    const { last, ...body } = (await request.clone().json()) as Pick<
      Task,
      "title" | "section_id"
    > & { last?: boolean };
    const created = makeTask({ id: nextId++, project_id: WORK.id, ...body });
    open = last ? [...open, created] : [created, ...open];
    return json(created, 201);
  };
  /** Changes, moves or deletes the Section a `/sections/{id}` request names; its answer. */
  const changeSection = async (request: Request, path: string) => {
    const id = Number(/\/sections\/(\d+)/.exec(path)?.[1]);
    if (request.method === "DELETE") {
      sections = sections.filter((section) => section.id !== id);
      open = open.map((task) => (task.section_id === id ? { ...task, section_id: null } : task));
      return new Response(null, { status: 204 });
    }
    if (request.method === "PATCH") {
      sections = changed(sections, id, (await request.clone().json()) as Partial<Section>);
      return json(sections.find((section) => section.id === id));
    }
    const { after_id } = (await request.clone().json()) as { after_id: number | null };
    sections = placedAfter(sections, id, after_id);
    return new Response(null, { status: 204 });
  };
  /** The sidebar, or the Project after a PATCH to it; undefined for any other request. */
  const sidebarAndProject = async (request: Request, path: string) => {
    if (path === "/api/v1/sidebar") return json({ inbox: INBOX, items: [project], archived: [] });
    if (!path.startsWith("/api/v1/projects/") || request.method !== "PATCH") return undefined;
    project = { ...project, ...((await request.clone().json()) as Partial<SidebarProject>) };
    return json(project);
  };
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/sections") && request.method === "POST") {
      const { name } = (await request.clone().json()) as { name: string };
      const created = { id: nextId++, project_id: WORK.id, name, collapsed: false };
      sections = [...sections, created];
      return json(created, 201);
    }
    if (url.pathname === "/api/v1/tasks" && request.method === "POST") return createTask(request);
    const moved = /^\/api\/v1\/tasks\/(\d+)\/move$/.exec(url.pathname);
    if (moved) {
      const id = Number(moved[1]);
      open = movedTask(open, id, (await request.clone().json()) as MoveBody);
      return json({ task: makeTask({ id }), affected: [] });
    }
    if (url.pathname.startsWith("/api/v1/sections/")) return changeSection(request, url.pathname);
    if (url.pathname.endsWith("/sections")) return json(sections);
    const sidebarOrProject = await sidebarAndProject(request, url.pathname);
    if (sidebarOrProject) return sidebarOrProject;
    if (url.searchParams.get("closed") === "true") return json({ items: [], next_cursor: null });
    return json({ items: open, next_cursor: null });
  });
}

/** The requests that changed something, as `METHOD /path` and body, null when there is none. */
export async function writes(fetchSpy: ReturnType<typeof mockApi>) {
  const requests = fetchSpy.mock.calls
    .map(([input]) => requestOf(input))
    .filter((request) => request.method !== "GET");
  return Promise.all(
    requests.map(async (request) => {
      const body = await request.text();
      return [
        `${request.method} ${new URL(request.url).pathname}`,
        body ? (JSON.parse(body) as unknown) : null,
      ];
    }),
  );
}

/** The list's group names, top to bottom. */
export function groupNames() {
  return within(screen.getByRole("treegrid"))
    .getAllByRole("region")
    .map((region) => region.getAttribute("aria-label"));
}

/** The Task titles shown in one group. */
export function titlesIn(group: string) {
  return within(screen.getByRole("region", { name: group }))
    .queryAllByRole("row")
    .map((row) => row.querySelector("[data-task-title]")?.textContent);
}
