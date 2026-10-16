import { screen, waitFor, within } from "@testing-library/react";

import type { Task } from "@/features/tasks/tasks";
import { INBOX, WORK, json, renderTaskList } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";

import type { Section } from "./sections";

const TO_DO: Section = { id: 31, project_id: WORK.id, name: "To do", collapsed: false };
const DOING: Section = { id: 32, project_id: WORK.id, name: "Doing", collapsed: false };

/** A stand-in server holding one Project's Sections and open Tasks, which adds Sections. */
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
    if (url.pathname === "/api/v1/tasks" && request.method === "POST") {
      const body = (await request.clone().json()) as Pick<Task, "title" | "section_id">;
      const created = makeTask({ id: nextId++, project_id: WORK.id, ...body });
      open = [created, ...open];
      return json(created, 201);
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

  it("adds a Task inside a Section from its header", async () => {
    const fetchSpy = mockApi({});
    const { user } = renderTaskList({ project: WORK });

    await user.click(await screen.findByRole("button", { name: "Add a task to Doing" }));
    await user.keyboard("Review copy{Enter}");

    await waitFor(() => {
      expect(titlesIn("Doing")).toEqual(["Review copy"]);
    });
    expect(screen.getByRole("combobox", { name: "Add a task to Doing" })).toHaveFocus();
    expect(await writes(fetchSpy)).toEqual([
      ["POST /api/v1/tasks", { title: "Review copy", project_id: WORK.id, section_id: DOING.id }],
    ]);
  });

  it("closes a Section's add-Task field left empty", async () => {
    const fetchSpy = mockApi({});
    const { user } = renderTaskList({ project: WORK });
    await user.click(await screen.findByRole("button", { name: "Add a task to Doing" }));

    await user.tab();

    expect(screen.queryByRole("combobox", { name: "Add a task to Doing" })).not.toBeInTheDocument();
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
