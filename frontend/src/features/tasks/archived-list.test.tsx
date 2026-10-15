import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { GARDEN, mockApi, renderList, task } from "@/test/drawer";

const BULBS = { ...task({ id: 1, title: "Plant bulbs", project_id: GARDEN.id }), description: "" };

describe("An archived Project's list", () => {
  it("is read-only: no Quick add, and no controls that change a Task", async () => {
    mockApi([BULBS]);
    renderList({ project: GARDEN });

    const row = await screen.findByRole("row", { name: /Plant bulbs/ });
    expect(screen.queryByRole("combobox", { name: "New task" })).not.toBeInTheDocument();
    expect(within(row).getByRole("checkbox")).toBeDisabled();
    expect(within(row).getByRole("button", { name: /Status/ })).toBeDisabled();
    expect(screen.getByText(/This project is archived/)).toBeInTheDocument();
  });

  it("opens a Task read-only in the drawer, offering only its link", async () => {
    mockApi([BULBS]);
    const user = renderList({ project: GARDEN });

    // user-event treats everything in a disabled fieldset as disabled, but browsers only disable
    // its form controls and still deliver clicks to the rows, so this clicks the plain way.
    fireEvent.click(await screen.findByText("Plant bulbs"));

    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByRole("textbox", { name: "Title" })).toBeDisabled();
    expect(within(drawer).getByRole("button", { name: /Status/ })).toBeDisabled();
    await user.click(within(drawer).getByRole("button", { name: "More actions" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Copy link"]);
  });

  it("shows a Task's Comments in the drawer without a way to change them", async () => {
    const at = new Date().toISOString();
    mockApi([BULBS], [], [{ id: 1, task_id: 1, body: "Tulips", created_at: at, updated_at: at }]);
    renderList({ project: GARDEN });

    fireEvent.click(await screen.findByText("Plant bulbs"));

    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("Tulips")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Edit comment" })).toBeDisabled();
    expect(within(drawer).getByRole("button", { name: "Delete comment" })).toBeDisabled();
    expect(within(drawer).queryByRole("textbox", { name: "Write a comment" })).toBeNull();
  });

  it("unarchives the Project from its banner", async () => {
    const fetchSpy = mockApi([BULBS]);
    const user = renderList({ project: GARDEN });

    await user.click(await screen.findByRole("button", { name: "Unarchive" }));

    await waitFor(() => {
      const posts = fetchSpy.mock.calls
        .map(([input]) => input as Request)
        .filter((request) => request.method === "POST")
        .map((request) => new URL(request.url).pathname);
      expect(posts).toEqual(["/api/v1/projects/9/unarchive"]);
    });
  });
});
