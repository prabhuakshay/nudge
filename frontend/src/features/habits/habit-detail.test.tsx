import { screen, waitFor, within } from "@testing-library/react";

import { fakeCalendarToday, stubScreenWidth } from "@/test/calendar";
import { changes, habit, mockApi, names, renderPage, renderPageRoute } from "@/test/habits";

const READ = habit({
  id: 1,
  name: "Read",
  goal: 2,
  start_date: "2026-10-01",
  current_streak: 3,
  best_streak: 12,
});

const details = () => screen.findByRole("region", { name: "Read details" });

/**
 * The heatmap cell for a day, by the start of its label such as "Wed 14 Oct". A role query over a
 * year of cells is too slow, so this matches the label directly.
 */
function cell(day: string) {
  const found = screen
    .getByRole("grid", { name: "Read, last 12 months" })
    .querySelector<HTMLButtonElement>(`button[aria-label^="${day}:"]`);
  if (!found) throw new Error(`No heatmap cell for ${day}`);
  return found;
}

describe("A Habit's details", () => {
  fakeCalendarToday();

  it("open beside the list from lg, with the Streaks, heatmap and actions", async () => {
    stubScreenWidth({ wide: true });
    mockApi([READ, habit({ id: 2, name: "Run" })]);
    const { user, router } = renderPageRoute();

    await user.click(await screen.findByRole("button", { name: "Read" }));

    const panel = await details();
    expect(names()).toEqual(["Read", "Run"]);
    expect(router.state.location.search).toEqual({ habit: 1 });
    expect(within(panel).getByText("Current streak")).toBeInTheDocument();
    expect(within(panel).getByText("3 days")).toBeInTheDocument();
    expect(within(panel).getByText("12 days")).toBeInTheDocument();
    expect(within(panel).getByRole("grid", { name: "Read, last 12 months" })).toBeInTheDocument();
    for (const action of ["Edit", "Archive", "Delete"]) {
      expect(within(panel).getByRole("button", { name: action })).toBeInTheDocument();
    }

    await user.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Read details" })).not.toBeInTheDocument();
  });

  it("take the whole page on a phone, and Back returns to the list", async () => {
    stubScreenWidth({ wide: false });
    mockApi([READ, habit({ id: 2, name: "Run" })]);
    const user = renderPage("Europe/London", "/?habit=1");

    await details();
    expect(screen.queryByRole("list", { name: "Habits" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to Habits" }));

    await waitFor(() => {
      expect(names()).toEqual(["Read", "Run"]);
    });
    expect(screen.queryByRole("region", { name: "Read details" })).not.toBeInTheDocument();
  });

  it("shade each day of the heatmap by its Check-ins and dim the days before the start", async () => {
    stubScreenWidth({ wide: true });
    mockApi([READ], {
      1: [
        { date: "2026-10-12", count: 2 },
        { date: "2026-10-13", count: 1 },
      ],
    });
    renderPage("Europe/London", "/?habit=1");
    await details();

    await waitFor(() => {
      expect(cell("Mon 12 Oct")).toHaveAccessibleName("Mon 12 Oct: done");
    });
    expect(cell("Tue 13 Oct")).toHaveAccessibleName("Tue 13 Oct: 1 of 2");
    expect(cell("Wed 14 Oct")).toHaveAccessibleName("Wed 14 Oct: not done");
    expect(cell("Wed 30 Sep")).toHaveAccessibleName("Wed 30 Sep: not started");
    expect(cell("Wed 30 Sep")).toHaveAttribute("aria-disabled", "true");
    expect(cell("Mon 27 Oct 2025")).toBeInTheDocument();
  });

  it("add a Check-in for a past day when its cell is tapped", async () => {
    stubScreenWidth({ wide: true });
    const sent = mockApi([READ], { 1: [{ date: "2026-10-13", count: 1 }] });
    const user = renderPage("Europe/London", "/?habit=1");
    await details();

    await user.click(cell("Tue 13 Oct"));

    await waitFor(() => {
      expect(cell("Tue 13 Oct")).toHaveAccessibleName("Tue 13 Oct: done");
    });
    expect(changes(sent)).toEqual([
      { method: "PUT", path: "/api/v1/habits/1/check-ins/2026-10-13", body: { count: 2 } },
    ]);
  });

  it("set the exact count for a past day", async () => {
    stubScreenWidth({ wide: true });
    const sent = mockApi([READ], { 1: [{ date: "2026-10-13", count: 2 }] });
    const user = renderPage("Europe/London", "/?habit=1");
    await details();

    await user.click(cell("Tue 13 Oct"));
    const day = screen.getByRole("group", { name: "Tue 13 Oct" });
    expect(day).toHaveTextContent("2 of 2");
    await user.click(within(day).getByRole("button", { name: "Remove a Check-in" }));
    await user.click(within(day).getByRole("button", { name: "Remove a Check-in" }));

    await waitFor(() => {
      expect(cell("Tue 13 Oct")).toHaveAccessibleName("Tue 13 Oct: not done");
    });
    expect(within(day).getByRole("button", { name: "Remove a Check-in" })).toBeDisabled();
    expect(changes(sent)).toEqual([
      { method: "PUT", path: "/api/v1/habits/1/check-ins/2026-10-13", body: { count: 1 } },
      { method: "PUT", path: "/api/v1/habits/1/check-ins/2026-10-13", body: { count: 0 } },
    ]);
  });

  it("pick a day from the keyboard without changing it", async () => {
    stubScreenWidth({ wide: true });
    const sent = mockApi([READ]);
    const user = renderPage("Europe/London", "/?habit=1");
    await details();

    // Only one cell is a tab stop, so Tab moves past the heatmap in one step.
    expect(cell("Thu 15 Oct")).toHaveAttribute("tabindex", "0");
    expect(cell("Wed 14 Oct")).toHaveAttribute("tabindex", "-1");
    cell("Thu 15 Oct").focus();
    await user.keyboard("{ArrowUp}{ArrowLeft}");

    expect(cell("Wed 7 Oct")).toHaveFocus();
    expect(screen.getByRole("group", { name: "Wed 7 Oct" })).toHaveTextContent("0 of 2");
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowDown}{ArrowDown}");
    expect(cell("Thu 15 Oct")).toHaveFocus();
    expect(changes(sent)).toEqual([]);
  });

  it("leave days before the start date and after today alone", async () => {
    stubScreenWidth({ wide: true });
    const sent = mockApi([READ]);
    const user = renderPage("Europe/London", "/?habit=1");
    await details();

    await user.click(cell("Wed 30 Sep"));

    const day = screen.getByRole("group", { name: "Wed 30 Sep" });
    expect(within(day).getByRole("button", { name: "Add a Check-in" })).toBeDisabled();
    expect(() => cell("Fri 16 Oct")).toThrow();
    expect(changes(sent)).toEqual([]);
  });

  it("archive the Habit and offer to bring it back", async () => {
    stubScreenWidth({ wide: true });
    const sent = mockApi([READ]);
    const user = renderPage("Europe/London", "/?habit=1");
    const panel = await details();

    await user.click(within(panel).getByRole("button", { name: "Archive" }));

    expect(await within(panel).findByRole("button", { name: "Unarchive" })).toBeInTheDocument();
    expect(changes(sent)).toEqual([
      { method: "POST", path: "/api/v1/habits/1/archive", body: null },
    ]);
  });

  it("edit the Habit in its dialog", async () => {
    stubScreenWidth({ wide: true });
    mockApi([READ]);
    const user = renderPage("Europe/London", "/?habit=1");
    const panel = await details();

    await user.click(within(panel).getByRole("button", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit habit" });
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Read");
  });

  it("close once the Habit is deleted", async () => {
    stubScreenWidth({ wide: true });
    const sent = mockApi([READ, habit({ id: 2, name: "Run" })]);
    const user = renderPage("Europe/London", "/?habit=1");
    const panel = await details();

    await user.click(within(panel).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete “Read”?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(names()).toEqual(["Run"]);
    });
    expect(screen.queryByRole("region", { name: "Read details" })).not.toBeInTheDocument();
    expect(changes(sent)).toEqual([{ method: "DELETE", path: "/api/v1/habits/1", body: null }]);
  });
});
