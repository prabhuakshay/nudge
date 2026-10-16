import { screen, waitFor, within } from "@testing-library/react";

import { ProjectPage } from "@/features/projects/project-page";
import type { SidebarProject } from "@/features/projects/projects";
import { INBOX, WORK, json, renderListRoute } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { DOING, TO_DO, mockApi, writes } from "@/test/sections";
import { makeTask } from "@/test/tasks";

const BOARD: SidebarProject = { ...WORK, layout: "board" };

function renderProject(project: SidebarProject) {
  return renderListRoute(<ProjectPage projectId={project.id} />);
}

/** The Board's column labels, left to right. */
function columnNames() {
  return within(screen.getByRole("group", { name: "Work board" }))
    .getAllByRole("region", { name: /, column \d+ of \d+$/ })
    .map((column) => column.getAttribute("aria-label"));
}

/** The card titles in one column, top to bottom. */
function cardsIn(column: string) {
  return within(screen.getByRole("list", { name: `${column} tasks` }))
    .getAllByRole("listitem")
    .map((card) => card.querySelector("[data-task-title]")?.textContent);
}

describe("A Project's Layout", () => {
  it("switches a Project to Board and back from its header", async () => {
    const fetchSpy = mockApi({});
    const { user } = renderProject(WORK);
    expect(await screen.findByRole("treegrid", { name: "Work tasks" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Board" }));

    expect(await screen.findByRole("group", { name: "Work board" })).toBeInTheDocument();
    expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "List" }));

    expect(await screen.findByRole("treegrid", { name: "Work tasks" })).toBeInTheDocument();
    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        [`PATCH /api/v1/projects/${String(WORK.id)}`, { layout: "board" }],
        [`PATCH /api/v1/projects/${String(WORK.id)}`, { layout: "list" }],
      ]);
    });
  });

  it("offers no Layout switch in the Inbox", async () => {
    mockApi({});

    renderProject(INBOX);

    expect(await screen.findByRole("treegrid", { name: "Inbox tasks" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Layout" })).not.toBeInTheDocument();
  });
});

/** The ⋯ menu button on the card titled `title`. */
function cardMenu(title: string) {
  const card = screen.getByText(title).closest("li");
  if (!card) throw new Error(`No card for “${title}”`);
  return within(card).getByRole("button", { name: "More actions" });
}

describe("A Project's Board", () => {
  it("shows No section first, then each Section in order, each with its count", async () => {
    mockApi({
      project: BOARD,
      open: [
        makeTask({ id: 1, project_id: WORK.id, title: "Loose end" }),
        makeTask({ id: 2, project_id: WORK.id, title: "Review copy", section_id: DOING.id }),
        makeTask({ id: 3, project_id: WORK.id, title: "Write brief", section_id: DOING.id }),
      ],
    });

    renderProject(BOARD);

    expect(await screen.findByText("Review copy")).toBeInTheDocument();
    expect(columnNames()).toEqual([
      "No section, column 1 of 3",
      "To do, column 2 of 3",
      "Doing, column 3 of 3",
    ]);
    expect(within(screen.getByRole("region", { name: /^Doing/ })).getByText("2")).toBeVisible();
    expect(cardsIn("No section")).toEqual(["Loose end"]);
    expect(cardsIn("Doing")).toEqual(["Review copy", "Write brief"]);
  });

  it("hides No section when every Task has a Section", async () => {
    mockApi({
      project: BOARD,
      open: [makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id })],
    });

    renderProject(BOARD);

    expect(await screen.findByText("Write brief")).toBeInTheDocument();
    expect(columnNames()).toEqual(["To do, column 1 of 2", "Doing, column 2 of 2"]);
  });

  it("shows a card's Priority, date, Tags and Subtask progress, Pinned cards first", async () => {
    mockApi({
      project: BOARD,
      open: [
        makeTask({
          id: 1,
          project_id: WORK.id,
          title: "Pinned plan",
          section_id: TO_DO.id,
          pinned_at: "2026-10-15T09:00:00Z",
        }),
        makeTask({
          id: 2,
          project_id: WORK.id,
          title: "Write brief",
          section_id: TO_DO.id,
          priority: 1,
          due_date: "2030-01-02",
          tags: [{ id: 21, name: "work", color: "teal" }],
        }),
        makeTask({ id: 3, project_id: WORK.id, title: "Outline", parent_id: 2, depth: 1 }),
        makeTask({
          id: 4,
          project_id: WORK.id,
          title: "Research",
          parent_id: 2,
          depth: 1,
          status: "completed",
        }),
      ],
    });

    renderProject(BOARD);

    expect(await screen.findByText("Write brief")).toBeInTheDocument();
    expect(cardsIn("To do")).toEqual(["Pinned plan", "Write brief"]);
    const card = screen.getByRole("button", { name: "Write brief, 2 of 2 in To do" });
    const item = within(card.closest("li") ?? document.body);
    expect(item.getByRole("img", { name: "Priority 1" })).toBeInTheDocument();
    expect(item.getByText("work")).toBeInTheDocument();
    expect(item.getByText("1 of 2 subtasks done")).toBeInTheDocument();
    expect(item.getByText(/2 Jan/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Pinned" })).toBeInTheDocument();
  });

  it("opens a Task from its card", async () => {
    mockApi({
      project: BOARD,
      open: [makeTask({ id: 5, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id })],
    });
    const { user, router } = renderProject(BOARD);

    await user.click(await screen.findByRole("button", { name: "Write brief, 1 of 1 in To do" }));

    expect(router.state.location.search).toEqual({ task: 5 });
  });

  it("closes a Task ticked on its card", async () => {
    const fetchSpy = mockApi({
      project: BOARD,
      open: [makeTask({ id: 5, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id })],
    });
    const { user, router } = renderProject(BOARD);

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Write brief”" }));

    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([["PATCH /api/v1/tasks/5", { status: "completed" }]]);
    });
    expect(router.state.location.search).toEqual({});
  });

  it("adds a Task with its typed fields at the bottom of a column", async () => {
    const fetchSpy = mockApi({
      project: BOARD,
      open: [makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: DOING.id })],
    });
    const { user } = renderProject(BOARD);

    await user.click(await screen.findByRole("button", { name: "Add a task to Doing" }));
    await user.keyboard("Review copy !1 #urgent{Escape}{Enter}");

    await waitFor(() => {
      expect(cardsIn("Doing")).toEqual(["Write brief", "Review copy"]);
    });
    expect(screen.getByRole("combobox", { name: "Add a task to Doing" })).toHaveFocus();
    expect(await writes(fetchSpy)).toEqual([
      [
        "POST /api/v1/tasks",
        {
          title: "Review copy",
          project_id: WORK.id,
          section_id: DOING.id,
          last: true,
          priority: 1,
          tags: ["urgent"],
        },
      ],
    ]);
  });

  it("adds a Task with no Section from the No section column", async () => {
    const fetchSpy = mockApi({
      project: BOARD,
      open: [makeTask({ id: 1, project_id: WORK.id, title: "Loose end" })],
    });
    const { user } = renderProject(BOARD);

    await user.click(await screen.findByRole("button", { name: "Add a task to No section" }));
    await user.keyboard("Tidy desk{Enter}");

    await waitFor(() => {
      expect(cardsIn("No section")).toEqual(["Loose end", "Tidy desk"]);
    });
    expect(await writes(fetchSpy)).toEqual([
      [
        "POST /api/v1/tasks",
        { title: "Tidy desk", project_id: WORK.id, section_id: null, last: true },
      ],
    ]);
  });

  it("offers no add-Task control on an archived Project's Board", async () => {
    const archived = { ...BOARD, is_archived: true };
    mockApi({
      project: archived,
      open: [makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: DOING.id })],
    });

    renderProject(archived);

    expect(await screen.findByText("Write brief")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add a task to/ })).not.toBeInTheDocument();
  });

  it("moves a card to another column from its menu with the keyboard", async () => {
    const fetchSpy = mockApi({
      project: BOARD,
      open: [makeTask({ id: 5, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id })],
    });
    const { user } = renderProject(BOARD);
    await screen.findByText("Write brief");

    cardMenu("Write brief").focus();
    await user.keyboard("{Enter}");
    (await screen.findByRole("menuitem", { name: "Move to section" })).focus();
    await user.keyboard("{ArrowRight}");
    // To do, the card's own column, isn't offered: No section, then Doing.
    expect(await screen.findByRole("menuitem", { name: "Doing" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "To do" })).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() => {
      expect(cardsIn("Doing")).toEqual(["Write brief"]);
    });
    expect(await writes(fetchSpy)).toEqual([
      ["POST /api/v1/tasks/5/move", { parent_id: null, after_id: null, section_id: DOING.id }],
    ]);
  });

  it("keeps a card in its column and says why when a move fails", async () => {
    const fetchSpy = mockApi({
      project: BOARD,
      open: [makeTask({ id: 5, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id })],
    });
    const server = fetchSpy.getMockImplementation();
    fetchSpy.mockImplementation(async (input, init) =>
      requestOf(input).url.endsWith("/move")
        ? json({ detail: "That Section is gone." }, 422)
        : (server?.(input, init) ?? json({})),
    );
    const { user } = renderProject(BOARD);
    await screen.findByText("Write brief");

    await user.click(cardMenu("Write brief"));
    (await screen.findByRole("menuitem", { name: "Move to section" })).focus();
    await user.keyboard("{ArrowRight}");
    (await screen.findByRole("menuitem", { name: "Doing" })).focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText("That Section is gone.")).toBeInTheDocument();
    await waitFor(() => {
      expect(cardsIn("To do")).toEqual(["Write brief"]);
    });
  });
});
