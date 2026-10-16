import { screen, within } from "@testing-library/react";

import { ProjectPage } from "@/features/projects/project-page";
import type { SidebarProject } from "@/features/projects/projects";
import { WORK, renderListRoute } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { DOING, TO_DO, mockApi } from "@/test/sections";
import { makeTask } from "@/test/tasks";

const BOARD: SidebarProject = { ...WORK, layout: "board" };

function renderBoard() {
  return renderListRoute(<ProjectPage projectId={BOARD.id} />);
}

/** The `section` filters of the Closed lists asked for so far. */
function closedListsAsked(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .map(([input]) => new URL(requestOf(input).url).searchParams)
    .filter((query) => query.get("closed") === "true")
    .map((query) => query.get("section"));
}

function column(name: string) {
  return within(screen.getByRole("region", { name: new RegExp(`^${name}, column`) }));
}

describe("A Board column's Closed fold", () => {
  it("loads only that column's Closed Tasks, and only once opened", async () => {
    const fetchSpy = mockApi({
      project: BOARD,
      open: [
        makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id }),
        makeTask({ id: 4, project_id: WORK.id, title: "Loose end" }),
      ],
      closed: [
        makeTask({ id: 2, title: "Sent invoice", section_id: TO_DO.id, status: "completed" }),
        makeTask({ id: 3, title: "Reviewed copy", section_id: DOING.id, status: "completed" }),
      ],
    });
    const { user } = renderBoard();
    expect(await screen.findByText("Write brief")).toBeInTheDocument();
    expect(closedListsAsked(fetchSpy)).toEqual([]);

    await user.click(column("To do").getByRole("button", { name: "Closed" }));

    expect(await column("To do").findByText("Sent invoice")).toBeInTheDocument();
    expect(screen.queryByText("Reviewed copy")).not.toBeInTheDocument();
    expect(closedListsAsked(fetchSpy)).toEqual([String(TO_DO.id)]);
  });

  it("shows No section with only Closed Tasks, so they stay reachable", async () => {
    mockApi({
      project: BOARD,
      open: [makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id })],
      closed: [makeTask({ id: 2, title: "Sent invoice", status: "completed" })],
    });
    const { user } = renderBoard();

    await screen.findByRole("region", { name: /^No section, column/ });
    await user.click(column("No section").getByRole("button", { name: "Closed" }));

    expect(await column("No section").findByText("Sent invoice")).toBeInTheDocument();
  });

  it("puts a Task reopened from the fold back among the column's cards", async () => {
    mockApi({
      project: BOARD,
      closed: [
        makeTask({ id: 2, title: "Sent invoice", section_id: TO_DO.id, status: "completed" }),
      ],
    });
    const { user } = renderBoard();
    await screen.findByRole("region", { name: /^To do, column/ });
    await user.click(column("To do").getByRole("button", { name: "Closed" }));

    await user.click(await screen.findByRole("checkbox", { name: "Reopen “Sent invoice”" }));

    const cards = await column("To do").findByRole("list", { name: "To do tasks" });
    expect(within(cards).getByText("Sent invoice")).toBeInTheDocument();
  });
});
