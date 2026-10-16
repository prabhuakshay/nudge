import { screen, waitFor, within } from "@testing-library/react";

import { INBOX, WORK, renderTaskList } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { DOING, DONE, TO_DO, groupNames, mockApi, titlesIn, writes } from "@/test/sections";
import { makeTask } from "@/test/tasks";

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

  it("deletes a Section after a confirm, moving its Tasks to No section", async () => {
    const fetchSpy = mockApi({
      open: [makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id })],
    });
    const { user } = renderTaskList({ project: WORK });
    await screen.findByText("Write brief");

    await user.click(screen.getByRole("button", { name: "To do actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete “To do”?" });
    expect(dialog).toHaveTextContent("Its tasks move to No section.");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "To do" })).not.toBeInTheDocument();
    });
    expect(await screen.findByRole("region", { name: "No section" })).toBeInTheDocument();
    expect(titlesIn("No section")).toEqual(["Write brief"]);
    expect(await writes(fetchSpy)).toEqual([[`DELETE /api/v1/sections/${String(TO_DO.id)}`, null]]);
  });

  it("keeps a Section when its delete is cancelled", async () => {
    const fetchSpy = mockApi({});
    const { user } = renderTaskList({ project: WORK });
    await screen.findByRole("region", { name: "To do" });

    await user.click(screen.getByRole("button", { name: "To do actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("region", { name: "To do" })).toBeInTheDocument();
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
