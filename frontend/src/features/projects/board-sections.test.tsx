import { screen, waitFor, within } from "@testing-library/react";

import { ProjectPage } from "@/features/projects/project-page";
import type { SidebarProject } from "@/features/projects/projects";
import { WORK, renderListRoute } from "@/test/drawer";
import { TO_DO, columnNames, mockApi, writes } from "@/test/sections";
import { makeTask } from "@/test/tasks";

const BOARD: SidebarProject = { ...WORK, layout: "board" };

function renderBoard(project = BOARD) {
  return renderListRoute(<ProjectPage projectId={project.id} />);
}

describe("A Board's columns", () => {
  it("adds a Section as the last column", async () => {
    const fetchSpy = mockApi({ project: BOARD });
    const { user } = renderBoard();
    await screen.findByRole("region", { name: /^Doing/ });

    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.keyboard("Review{Enter}");

    await waitFor(() => {
      expect(columnNames()).toEqual([
        "To do, column 1 of 3",
        "Doing, column 2 of 3",
        "Review, column 3 of 3",
      ]);
    });
    expect(await writes(fetchSpy)).toEqual([
      [`POST /api/v1/projects/${String(WORK.id)}/sections`, { name: "Review" }],
    ]);
  });

  it("renames a column from its header menu with the keyboard", async () => {
    const fetchSpy = mockApi({ project: BOARD });
    const { user } = renderBoard();
    await screen.findByRole("region", { name: /^Doing/ });

    screen.getByRole("button", { name: "To do actions" }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menuitem", { name: "Rename" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("textbox", { name: "Section name" })).toHaveFocus();
    await user.keyboard("Next up{Enter}");

    expect(await screen.findByRole("region", { name: "Next up, column 1 of 2" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Next up actions" })).toHaveFocus();
    expect(await writes(fetchSpy)).toEqual([
      [`PATCH /api/v1/sections/${String(TO_DO.id)}`, { name: "Next up" }],
    ]);
  });

  it("deletes a column after a confirm, moving its cards to No section", async () => {
    const fetchSpy = mockApi({
      project: BOARD,
      open: [makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id })],
    });
    const { user } = renderBoard();
    await screen.findByText("Write brief");

    await user.click(screen.getByRole("button", { name: "To do actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete “To do”?" });
    expect(dialog).toHaveTextContent("Its tasks move to No section.");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(columnNames()).toEqual(["No section, column 1 of 2", "Doing, column 2 of 2"]);
    });
    expect(screen.getByRole("button", { name: "Write brief, 1 of 1 in No section" })).toBeVisible();
    expect(await writes(fetchSpy)).toEqual([[`DELETE /api/v1/sections/${String(TO_DO.id)}`, null]]);
  });

  it("collapses a column to its name and count, and expands it again", async () => {
    const fetchSpy = mockApi({
      project: BOARD,
      open: [makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id })],
    });
    const { user } = renderBoard();
    await screen.findByText("Write brief");

    await user.click(screen.getByRole("button", { name: "To do", expanded: true }));

    const column = await screen.findByRole("region", { name: "To do, column 1 of 2" });
    await waitFor(() => {
      expect(within(column).getByRole("button", { name: "To do" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });
    expect(within(column).getByText("1")).toBeVisible();
    expect(screen.queryByText("Write brief")).not.toBeInTheDocument();
    expect(within(column).queryByRole("button", { name: "To do actions" })).not.toBeInTheDocument();

    await user.click(within(column).getByRole("button", { name: "To do" }));

    expect(await screen.findByText("Write brief")).toBeVisible();
    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        [`PATCH /api/v1/sections/${String(TO_DO.id)}`, { collapsed: true }],
        [`PATCH /api/v1/sections/${String(TO_DO.id)}`, { collapsed: false }],
      ]);
    });
  });

  it("offers no column changes on an archived Project's Board", async () => {
    const archived = { ...BOARD, is_archived: true };
    mockApi({
      project: archived,
      open: [makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id })],
    });

    renderBoard(archived);

    expect(await screen.findByText("Write brief")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "To do", expanded: true })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "To do actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add section" })).not.toBeInTheDocument();
  });

  it("keeps a column when its delete is cancelled", async () => {
    const fetchSpy = mockApi({ project: BOARD });
    const { user } = renderBoard();
    await screen.findByRole("region", { name: /^Doing/ });

    await user.click(screen.getByRole("button", { name: "To do actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(columnNames()).toEqual(["To do, column 1 of 2", "Doing, column 2 of 2"]);
    expect(await writes(fetchSpy)).toEqual([]);
  });
});
