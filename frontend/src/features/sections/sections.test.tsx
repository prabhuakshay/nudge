import { screen, waitFor, within } from "@testing-library/react";

import type { Task } from "@/features/tasks/tasks";
import { INBOX, WORK, json, renderTaskList } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";

import type { Section } from "./sections";

const TO_DO: Section = { id: 31, project_id: WORK.id, name: "To do", collapsed: false };
const DOING: Section = { id: 32, project_id: WORK.id, name: "Doing", collapsed: false };

/** A stand-in server holding one Project's Sections and open Tasks, which adds and changes Sections. */
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
    const one = /^\/api\/v1\/sections\/(\d+)$/.exec(url.pathname);
    if (one && request.method === "PATCH") {
      const fields = (await request.clone().json()) as Partial<Section>;
      sections = sections.map((section) =>
        section.id === Number(one[1]) ? { ...section, ...fields } : section,
      );
      return json(sections.find((section) => section.id === Number(one[1])));
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

  it("collapses and expands a Section from its header, keeping its open-Task count", async () => {
    const fetchSpy = mockApi({
      open: [
        makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id }),
        makeTask({ id: 2, project_id: WORK.id, title: "Plan launch", section_id: TO_DO.id }),
      ],
    });
    const { user } = renderTaskList({ project: WORK });
    const toggle = await screen.findByRole("button", { name: "To do", expanded: true });
    const toDo = screen.getByRole("region", { name: "To do" });
    expect(within(toDo).getByText("2")).toBeInTheDocument();

    toggle.focus();
    await user.keyboard("{Enter}");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(titlesIn("To do")).toEqual([]);
    expect(within(toDo).getByText("2")).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(titlesIn("To do")).toEqual(["Write brief", "Plan launch"]);
    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        [`PATCH /api/v1/sections/${String(TO_DO.id)}`, { collapsed: true }],
        [`PATCH /api/v1/sections/${String(TO_DO.id)}`, { collapsed: false }],
      ]);
    });
  });

  it("shows a Section collapsed when the server remembers it so", async () => {
    mockApi({
      sections: [{ ...TO_DO, collapsed: true }, DOING],
      open: [
        makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id }),
        makeTask({ id: 2, project_id: WORK.id, title: "Review copy", section_id: DOING.id }),
      ],
    });

    renderTaskList({ project: WORK });

    expect(await screen.findByText("Review copy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "To do" })).toHaveAttribute("aria-expanded", "false");
    expect(titlesIn("To do")).toEqual([]);
  });

  it("renames a Section from its header menu with the keyboard", async () => {
    const fetchSpy = mockApi({});
    const { user } = renderTaskList({ project: WORK });
    (await screen.findByRole("button", { name: "To do options" })).focus();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menuitem", { name: "Rename" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const name = await screen.findByRole("textbox", { name: "Section name" });
    expect(name).toHaveValue("To do");
    expect(name).toHaveFocus();
    await user.clear(name);
    await user.keyboard("Next up{Enter}");

    expect(await screen.findByRole("region", { name: "Next up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next up options" })).toHaveFocus();
    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        [`PATCH /api/v1/sections/${String(TO_DO.id)}`, { name: "Next up" }],
      ]);
    });
  });

  it("leaves a Section's name alone when renaming is cancelled with Escape", async () => {
    const fetchSpy = mockApi({});
    const { user } = renderTaskList({ project: WORK });
    await user.click(await screen.findByRole("button", { name: "To do options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));

    await user.keyboard("Other{Escape}");

    expect(screen.getByRole("region", { name: "To do" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "To do options" })).toHaveFocus();
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
});
