import { screen, waitFor, within } from "@testing-library/react";

import {
  added,
  changes,
  fakeHabitsToday,
  makeHabit,
  mockApi,
  names,
  pick,
  renderPage,
} from "@/test/habits";

describe("The Habit dialog", () => {
  fakeHabitsToday();

  it("adds a Habit done on chosen weekdays, from a chosen start date", async () => {
    const sent = mockApi([]);
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    await user.type(within(dialog).getByLabelText("Name"), "Gym");
    await user.click(within(dialog).getByRole("radio", { name: "On chosen days" }));
    const days = within(dialog).getByRole("group", { name: "Days" });
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      expect(within(days).getByRole("checkbox", { name: day })).toBeChecked();
    }
    await user.click(within(days).getByRole("checkbox", { name: "Tuesday" }));
    await user.click(within(days).getByRole("checkbox", { name: "Thursday" }));
    await user.click(within(days).getByRole("checkbox", { name: "Sunday" }));
    await user.clear(within(dialog).getByLabelText("Start date"));
    await user.type(within(dialog).getByLabelText("Start date"), "2026-11-02");
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    await waitFor(() => {
      expect(names()).toEqual(["Gym"]);
    });
    expect(added(sent)).toEqual([
      expect.objectContaining({
        frequency: "weekdays",
        weekdays: [1, 3, 5, 7],
        times_per_week: null,
        start_date: "2026-11-02",
      }),
    ]);
  });

  it("adds a Habit done a number of times a week, on any days", async () => {
    const sent = mockApi([]);
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    await user.type(within(dialog).getByLabelText("Name"), "Run");
    await user.click(within(dialog).getByRole("radio", { name: "Times a week" }));
    const times = within(dialog).getByRole("radiogroup", { name: "How many times a week" });
    expect(
      within(times)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("value")),
    ).toEqual(["1", "2", "3", "4", "5", "6"]);
    await user.click(within(times).getByRole("radio", { name: "4" }));
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    await waitFor(() => {
      expect(names()).toEqual(["Run"]);
    });
    expect(added(sent)).toEqual([
      expect.objectContaining({ frequency: "times_per_week", weekdays: [], times_per_week: 4 }),
    ]);
  });

  it("refuses chosen weekdays with no day chosen, and says why", async () => {
    const sent = mockApi([]);
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    await user.type(within(dialog).getByLabelText("Name"), "Gym");
    await user.click(within(dialog).getByRole("radio", { name: "On chosen days" }));
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      await user.click(within(dialog).getByRole("checkbox", { name: day }));
    }
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Choose at least one day.");
    expect(added(sent)).toEqual([]);
    expect(screen.getByRole("dialog", { name: "New habit" })).toBeInTheDocument();
  });

  it("refuses a Habit with only spaces for a name, and says why", async () => {
    const sent = mockApi([]);
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    await user.type(within(dialog).getByLabelText("Name"), "   ");
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Give the habit a name.");
    expect(added(sent)).toEqual([]);
  });

  it("edits a Habit's settings from its row", async () => {
    const sent = mockApi([
      makeHabit({ id: 1, name: "Read" }),
      makeHabit({ id: 2, name: "Gym", frequency: "weekdays", weekdays: [1, 3] }),
    ]);
    const user = renderPage();
    await screen.findByText("Gym");

    await pick(user, "Gym", "Edit");
    const dialog = await screen.findByRole("dialog", { name: "Edit habit" });
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Gym");
    expect(within(dialog).getByRole("radio", { name: "On chosen days" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Monday" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Tuesday" })).not.toBeChecked();
    expect(within(dialog).getByLabelText("Start date")).toHaveValue("2026-10-17");
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Lift");
    await user.click(within(dialog).getByRole("radio", { name: "Times a week" }));
    await user.click(within(dialog).getByRole("radio", { name: "2" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(names()).toEqual(["Read", "Lift"]);
    });
    expect(changes(sent)).toEqual([
      {
        method: "PATCH",
        path: "/api/v1/habits/2",
        body: {
          name: "Lift",
          color: "teal",
          icon: "book-open",
          frequency: "times_per_week",
          weekdays: [],
          times_per_week: 2,
          start_date: "2026-10-17",
        },
      },
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
