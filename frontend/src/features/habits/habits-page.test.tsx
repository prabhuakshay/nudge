import { screen, waitFor, within } from "@testing-library/react";

import { requestOf } from "@/test/fetch";
import {
  added,
  changes,
  EVERY_DAY,
  fakeHabitsToday,
  makeHabit,
  mockApi,
  names,
  namesIn,
  pick,
  renderPage,
} from "@/test/habits";
import { json } from "@/test/drawer";

/**
 * jsdom lays nothing out, so stack the rows in document order for dnd-kit to measure. The drag
 * preview floats outside the list, so it sits where the focused grip is.
 */
function layOutInDocumentOrder() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const rows = [...document.querySelectorAll("li")];
    const row = this.closest("li") ?? document.activeElement?.closest("li");
    return new DOMRect(0, row ? rows.indexOf(row) * 40 : 0, 400, 40);
  });
}

describe("The Habits page", () => {
  fakeHabitsToday();

  it("lists the user's Habits in their order", async () => {
    mockApi([
      makeHabit({ id: 1, name: "Read" }),
      makeHabit({ id: 2, name: "Run", icon: "footprints" }),
    ]);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Habits" })).toBeInTheDocument();
    await waitFor(() => {
      expect(names()).toEqual(["Read", "Run"]);
    });
  });

  it("invites the user to add a first Habit when there are none", async () => {
    mockApi([]);

    renderPage();

    expect(await screen.findByRole("heading", { name: "No habits yet" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Habits" })).not.toBeInTheDocument();
  });

  it("adds a Habit with a name, colour and icon at the bottom of the list", async () => {
    const sent = mockApi([makeHabit({ id: 1, name: "Read" })]);
    const user = renderPage();
    await screen.findByText("Read");

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    expect(within(dialog).getByRole("radio", { name: "Every day" })).toBeChecked();
    expect(within(dialog).getByLabelText("Start date")).toHaveValue("2026-10-18");
    await user.type(within(dialog).getByLabelText("Name"), "Drink water");
    await user.click(within(dialog).getByRole("radio", { name: "Blue" }));
    await user.click(within(dialog).getByRole("radio", { name: "Water" }));
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    await waitFor(() => {
      expect(names()).toEqual(["Read", "Drink water"]);
    });
    expect(added(sent)).toEqual([
      {
        name: "Drink water",
        color: "blue",
        icon: "droplet",
        ...EVERY_DAY,
        start_date: "2026-10-18",
      },
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adds a Habit from the keyboard alone, with a colour and icon picked for it", async () => {
    const sent = mockApi([]);
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.tab();
    expect(screen.getByRole("button", { name: "Add habit" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog", { name: "New habit" });
    expect(screen.getByLabelText("Name")).toHaveFocus();
    await user.keyboard("Read{Enter}");

    await waitFor(() => {
      expect(names()).toEqual(["Read"]);
    });
    expect(added(sent)).toEqual([
      {
        name: "Read",
        color: "green",
        icon: "circle-check",
        ...EVERY_DAY,
        start_date: "2026-10-18",
      },
    ]);
  });

  it("keeps the dialog open and says why when the server refuses the Habit", async () => {
    mockApi([]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const request = requestOf(input);
      if (request.method === "POST") return json({ detail: [{ msg: "too long" }] }, 422);
      return json([]);
    });
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    await user.type(screen.getByLabelText("Name"), "Read{Enter}");

    expect(await screen.findByText("Could not add the habit.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "New habit" })).toBeInTheDocument();
  });

  it("reorders Habits by dragging from the keyboard and keeps the new order", async () => {
    layOutInDocumentOrder();
    const sent = mockApi([
      makeHabit({ id: 1, name: "Read" }),
      makeHabit({ id: 2, name: "Run" }),
      makeHabit({ id: 3, name: "Meditate" }),
    ]);
    const user = renderPage();

    (await screen.findByRole("button", { name: "Drag “Meditate”" })).focus();
    await user.keyboard(" {ArrowUp} ");

    await waitFor(() => {
      expect(names()).toEqual(["Read", "Meditate", "Run"]);
    });
    expect(changes(sent)).toEqual([
      { method: "POST", path: "/api/v1/habits/3/move", body: { after_id: 1 } },
    ]);
  });

  it("archives a Habit into a collapsed Archived section at the bottom", async () => {
    const sent = mockApi([makeHabit({ id: 1, name: "Read" }), makeHabit({ id: 2, name: "Run" })]);
    const user = renderPage();

    await pick(user, "Read", "Archive");

    await waitFor(() => {
      expect(names()).toEqual(["Run"]);
    });
    const toggle = screen.getByRole("button", { name: "Archived" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Archived habits" })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(namesIn("Archived habits")).toEqual(["Read"]);
    expect(changes(sent)).toEqual([
      { method: "POST", path: "/api/v1/habits/1/archive", body: null },
    ]);
  });

  it("hides the Archived section while nothing is archived", async () => {
    mockApi([makeHabit({ id: 1, name: "Read" })]);

    renderPage();

    await screen.findByText("Read");
    expect(screen.queryByRole("button", { name: "Archived" })).not.toBeInTheDocument();
  });

  it("unarchives a Habit back into its place", async () => {
    const sent = mockApi([
      makeHabit({ id: 1, name: "Read" }),
      makeHabit({ id: 2, name: "Run", is_archived: true }),
      makeHabit({ id: 3, name: "Meditate" }),
    ]);
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: "Archived" }));
    await pick(user, "Run", "Unarchive");

    await waitFor(() => {
      expect(names()).toEqual(["Read", "Run", "Meditate"]);
    });
    expect(screen.queryByRole("button", { name: "Archived" })).not.toBeInTheDocument();
    expect(changes(sent)).toEqual([
      { method: "POST", path: "/api/v1/habits/2/unarchive", body: null },
    ]);
  });

  it("asks before deleting a Habit and keeps it when the user cancels", async () => {
    const sent = mockApi([makeHabit({ id: 1, name: "Read" })]);
    const user = renderPage();

    await pick(user, "Read", "Delete");
    const dialog = await screen.findByRole("dialog", { name: "Delete “Read”?" });
    expect(dialog).toHaveTextContent("can't be undone");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(names()).toEqual(["Read"]);
    expect(changes(sent)).toEqual([]);
  });

  it("deletes a Habit for good once the user confirms", async () => {
    const sent = mockApi([makeHabit({ id: 1, name: "Read" }), makeHabit({ id: 2, name: "Run" })]);
    const user = renderPage();

    await pick(user, "Read", "Delete");
    const dialog = await screen.findByRole("dialog", { name: "Delete “Read”?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(names()).toEqual(["Run"]);
    });
    expect(changes(sent)).toEqual([{ method: "DELETE", path: "/api/v1/habits/1", body: null }]);
  });

  it("deletes an archived Habit from the Archived section", async () => {
    const sent = mockApi([
      makeHabit({ id: 1, name: "Read" }),
      makeHabit({ id: 2, name: "Run", is_archived: true }),
    ]);
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: "Archived" }));
    await pick(user, "Run", "Delete");
    const dialog = await screen.findByRole("dialog", { name: "Delete “Run”?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Archived" })).not.toBeInTheDocument();
    });
    expect(changes(sent)).toEqual([{ method: "DELETE", path: "/api/v1/habits/2", body: null }]);
  });
});
