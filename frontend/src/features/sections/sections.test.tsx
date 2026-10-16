import { screen, waitFor, within } from "@testing-library/react";

import type { Task } from "@/features/tasks/tasks";
import { INBOX, WORK, json, renderTaskList } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";

import type { Section } from "./sections";

const TO_DO: Section = { id: 31, project_id: WORK.id, name: "To do", collapsed: false };
const DOING: Section = { id: 32, project_id: WORK.id, name: "Doing", collapsed: false };
const DONE: Section = { id: 33, project_id: WORK.id, name: "Done", collapsed: false };

/** A stand-in server holding one Project's Sections and open Tasks, which adds and moves Sections. */
function mockApi({
  sections = [TO_DO, DOING],
  open = [],
}: {
  sections?: Section[];
  open?: Task[];
}) {
  let nextId = 100;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/sections") && request.method === "POST") {
      const { name } = (await request.clone().json()) as { name: string };
      const created = { id: nextId++, project_id: WORK.id, name, collapsed: false };
      sections = [...sections, created];
      return json(created, 201);
    }
    const moved = /^\/api\/v1\/sections\/(\d+)\/move$/.exec(url.pathname);
    if (moved) {
      const { after_id } = (await request.clone().json()) as { after_id: number | null };
      const section = sections.find(({ id }) => id === Number(moved[1]));
      const rest = sections.filter((other) => other !== section);
      const at = after_id === null ? 0 : rest.findIndex(({ id }) => id === after_id) + 1;
      sections = section ? [...rest.slice(0, at), section, ...rest.slice(at)] : rest;
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/sections")) return json(sections);
    if (url.pathname === "/api/v1/sidebar") return json({ inbox: INBOX, items: [WORK] });
    if (url.searchParams.get("closed") === "true") return json({ items: [], next_cursor: null });
    return json({ items: open, next_cursor: null });
  });
}

async function writes(fetchSpy: ReturnType<typeof mockApi>) {
  const requests = fetchSpy.mock.calls
    .map(([input]) => requestOf(input))
    .filter((request) => request.method !== "GET");
  return Promise.all(
    requests.map(async (request) => [
      `${request.method} ${new URL(request.url).pathname}`,
      (await request.json()) as unknown,
    ]),
  );
}

function groupNames() {
  return within(screen.getByRole("treegrid"))
    .getAllByRole("region")
    .map((region) => region.getAttribute("aria-label"));
}

function titlesIn(group: string) {
  return within(screen.getByRole("region", { name: group }))
    .queryAllByRole("row")
    .map((row) => row.querySelector("[data-task-title]")?.textContent);
}

describe("Sections in a Project", () => {
  it("groups root Tasks under No section, then each Section in order, Pinned first", async () => {
    mockApi({
      open: [
        makeTask({
          id: 1,
          project_id: WORK.id,
          title: "Pinned plan",
          section_id: TO_DO.id,
          pinned_at: "2026-10-15T09:00:00Z",
        }),
        makeTask({ id: 2, project_id: WORK.id, title: "Loose end" }),
        makeTask({ id: 3, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id }),
        makeTask({
          id: 4,
          project_id: WORK.id,
          title: "Outline",
          parent_id: 3,
          depth: 1,
          parent_title: "Write brief",
        }),
        makeTask({ id: 5, project_id: WORK.id, title: "Review copy", section_id: DOING.id }),
      ],
    });

    renderTaskList({ project: WORK });

    expect(await screen.findByText("Review copy")).toBeInTheDocument();
    expect(groupNames().slice(0, 3)).toEqual(["No section", "To do", "Doing"]);
    expect(titlesIn("No section")).toEqual(["Loose end"]);
    expect(titlesIn("To do")).toEqual(["Pinned plan", "Write brief", "Outline"]);
    expect(titlesIn("Doing")).toEqual(["Review copy"]);
    expect(screen.queryByRole("region", { name: "Pinned" })).not.toBeInTheDocument();
  });

  it("hides No section when every Task has a Section", async () => {
    mockApi({
      open: [makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id })],
    });

    renderTaskList({ project: WORK });

    expect(await screen.findByText("Write brief")).toBeInTheDocument();
    expect(groupNames().slice(0, 2)).toEqual(["To do", "Doing"]);
  });

  it("adds a Section last from the keyboard", async () => {
    const fetchSpy = mockApi({});
    const { user } = renderTaskList({ project: WORK });
    await screen.findByRole("region", { name: "Doing" });

    screen.getByRole("button", { name: "Add section" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("Review{Enter}");

    expect(await screen.findByRole("region", { name: "Review" })).toBeInTheDocument();
    expect(groupNames().slice(0, 3)).toEqual(["To do", "Doing", "Review"]);
    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        [`POST /api/v1/projects/${String(WORK.id)}/sections`, { name: "Review" }],
      ]);
    });
  });

  it("puts the Escape key back to the Add section button without adding one", async () => {
    const fetchSpy = mockApi({});
    const { user } = renderTaskList({ project: WORK });
    await user.click(await screen.findByRole("button", { name: "Add section" }));

    await user.keyboard("Review{Escape}");

    expect(screen.getByRole("button", { name: "Add section" })).toHaveFocus();
    expect(await writes(fetchSpy)).toEqual([]);
  });

  it("gives the Inbox no Sections", async () => {
    const fetchSpy = mockApi({ open: [makeTask({ id: 1, title: "Buy milk" })] });

    renderTaskList({ project: INBOX });

    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add section" })).not.toBeInTheDocument();
    const paths = fetchSpy.mock.calls.map(([input]) => new URL(requestOf(input).url).pathname);
    expect(paths.filter((path) => path.endsWith("/sections"))).toEqual([]);
  });

  it("moves a Section up or down from its header menu with the keyboard", async () => {
    const fetchSpy = mockApi({ sections: [TO_DO, DOING, DONE] });
    const { user } = renderTaskList({ project: WORK });
    await screen.findByRole("region", { name: "Done" });

    screen.getByRole("button", { name: "Done actions" }).focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("menuitem", { name: "Move up" }));
    await waitFor(() => {
      expect(groupNames().slice(0, 3)).toEqual(["To do", "Done", "Doing"]);
    });

    screen.getByRole("button", { name: "To do actions" }).focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("menuitem", { name: "Move down" }));
    await waitFor(() => {
      expect(groupNames().slice(0, 3)).toEqual(["Done", "To do", "Doing"]);
    });

    expect(await writes(fetchSpy)).toEqual([
      [`POST /api/v1/sections/${String(DONE.id)}/move`, { after_id: TO_DO.id }],
      [`POST /api/v1/sections/${String(TO_DO.id)}/move`, { after_id: DONE.id }],
    ]);
  });

  it("moves the second Section to the top", async () => {
    const fetchSpy = mockApi({});
    const { user } = renderTaskList({ project: WORK });

    await user.click(await screen.findByRole("button", { name: "Doing actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Move up" }));

    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        [`POST /api/v1/sections/${String(DOING.id)}/move`, { after_id: null }],
      ]);
    });
  });

  it("offers no Move up for the first Section or Move down for the last", async () => {
    mockApi({});
    const { user } = renderTaskList({ project: WORK });

    await user.click(await screen.findByRole("button", { name: "To do actions" }));
    expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Doing actions" }));
    expect(screen.getByRole("menuitem", { name: "Move down" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
