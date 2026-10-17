import { screen, waitFor, within } from "@testing-library/react";

import { fakeCalendarToday } from "@/test/calendar";
import { added, changes, habit, mockApi, names, pick, renderPage } from "@/test/habits";

describe("The Habit dialog", () => {
  fakeCalendarToday();

  it("starts a new Habit today on the user's clock", async () => {
    mockApi([]);
    // 09:00 UTC on 15 October is still 14 October in Pago Pago.
    const user = renderPage("Pacific/Pago_Pago");
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));

    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    expect(within(dialog).getByLabelText("Start date")).toHaveValue("2026-10-14");
  });

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
      habit({ id: 1, name: "Read" }),
      habit({
        id: 2,
        name: "Gym",
        frequency: "weekdays",
        weekdays: [1, 3],
        goal: 2,
        start_date: "2026-09-01",
      }),
    ]);
    const user = renderPage();
    await screen.findByText("Gym");

    await pick(user, "Gym", "Edit");
    const dialog = await screen.findByRole("dialog", { name: "Edit habit" });
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Gym");
    expect(within(dialog).getByRole("radio", { name: "On chosen days" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Monday" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Tuesday" })).not.toBeChecked();
    expect(within(dialog).getByLabelText("Start date")).toHaveValue("2026-09-01");
    const goal = within(dialog).getByRole("spinbutton", { name: "Goal per day" });
    expect(goal).toHaveValue(2);
    await user.clear(goal);
    await user.type(goal, "3");
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
          goal: 3,
          start_date: "2026-09-01",
          reminder_time: null,
        },
      },
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adds a Habit with no Reminder unless given a time", async () => {
    const sent = mockApi([]);
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    await user.type(within(dialog).getByLabelText("Name"), "Read");
    expect(within(dialog).getByLabelText("Reminder")).toHaveValue("");
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));
    await user.click(await screen.findByRole("button", { name: "Add habit" }));
    const second = await screen.findByRole("dialog", { name: "New habit" });
    await user.type(within(second).getByLabelText("Name"), "Stretch");
    await user.type(within(second).getByLabelText("Reminder"), "07:30");
    await user.click(within(second).getByRole("button", { name: "Add habit" }));

    await waitFor(() => {
      expect(names()).toEqual(["Read", "Stretch"]);
    });
    expect(added(sent)).toEqual([
      expect.objectContaining({ name: "Read", reminder_time: null }),
      expect.objectContaining({ name: "Stretch", reminder_time: "07:30" }),
    ]);
  });

  it("shows a Habit's Reminder time when editing, and removes it", async () => {
    const sent = mockApi([habit({ id: 1, name: "Read", reminder_time: "21:15:00" })]);
    const user = renderPage();
    await screen.findByText("Read");

    await pick(user, "Read", "Edit");
    const dialog = await screen.findByRole("dialog", { name: "Edit habit" });
    expect(within(dialog).getByLabelText("Reminder")).toHaveValue("21:15");
    await user.click(within(dialog).getByRole("button", { name: "Remove reminder" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(changes(sent).map((write) => write.body)).toEqual([
        expect.objectContaining({ reminder_time: null }),
      ]);
    });
  });
});
