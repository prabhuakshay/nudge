import { screen, within } from "@testing-library/react";

import type { Section } from "@/features/sections/sections";
import type { Task } from "@/features/tasks/tasks";
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

/**
 * A stand-in server holding a Project's Sections and open Tasks; it adds, changes, moves and
 * deletes Sections, and adds Tasks.
 */
export function mockApi({
  sections = [TO_DO, DOING],
  open = [],
}: {
  sections?: Section[];
  open?: Task[];
}) {
  let nextId = 100;
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
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/sections") && request.method === "POST") {
      const { name } = (await request.clone().json()) as { name: string };
      const created = { id: nextId++, project_id: WORK.id, name, collapsed: false };
      sections = [...sections, created];
      return json(created, 201);
    }
    if (url.pathname === "/api/v1/tasks" && request.method === "POST") {
      const body = (await request.clone().json()) as Pick<Task, "title" | "section_id">;
      const created = makeTask({ id: nextId++, project_id: WORK.id, ...body });
      open = [created, ...open];
      return json(created, 201);
    }
    if (url.pathname.startsWith("/api/v1/sections/")) return changeSection(request, url.pathname);
    if (url.pathname.endsWith("/sections")) return json(sections);
    if (url.pathname === "/api/v1/sidebar") return json({ inbox: INBOX, items: [WORK] });
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
