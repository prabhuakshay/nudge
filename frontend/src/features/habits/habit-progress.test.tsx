import { screen, waitFor, within } from "@testing-library/react";

import { fakeCalendarToday } from "@/test/calendar";
import { checkInButton, habit, mockApi, renderPage } from "@/test/habits";

/** What each of a Habit's last 7 days says, oldest first. */
async function lastSevenDays(name: string) {
  const days = await screen.findByRole("list", { name: `${name}, last 7 days` });
  return within(days)
    .getAllByRole("listitem")
    .map((day) => day.textContent);
}

describe("A Habit's row", () => {
  fakeCalendarToday();

  it("shows the current and best Streak in days", async () => {
    mockApi([habit({ current_streak: 3, best_streak: 12 })]);

    renderPage();

    expect(await screen.findByText("3 days")).toBeInTheDocument();
    expect(screen.getByText("Best 12")).toBeInTheDocument();
  });

  it("counts a times-a-week Habit's Streak in weeks", async () => {
    mockApi([
      habit({
        frequency: "times_per_week",
        times_per_week: 3,
        current_streak: 1,
        best_streak: 1,
        streak_unit: "weeks",
      }),
    ]);

    renderPage();

    expect(await screen.findByText("1 week")).toBeInTheDocument();
  });

  it("shows the last 7 days, dimming the days the Habit doesn't ask for", async () => {
    mockApi(
      [
        habit({
          id: 1,
          name: "Run",
          frequency: "weekdays",
          weekdays: [1, 3, 5],
          goal: 2,
          start_date: "2026-01-01",
        }),
      ],
      {
        1: [
          { date: "2026-10-09", count: 2 },
          { date: "2026-10-12", count: 1 },
        ],
      },
    );

    renderPage();

    await screen.findByText("Fri 9 Oct: done");
    expect(await lastSevenDays("Run")).toEqual([
      "Fri 9 Oct: done",
      "Sat 10 Oct: not asked for",
      "Sun 11 Oct: not asked for",
      "Mon 12 Oct: 1 of 2",
      "Tue 13 Oct: not asked for",
      "Wed 14 Oct: not done",
      "Thu 15 Oct: not asked for",
    ]);
  });

  it("fills today's dot as soon as the user checks in", async () => {
    mockApi([habit({ name: "Read" })]);
    const user = renderPage();
    expect((await lastSevenDays("Read")).at(-1)).toBe("Thu 15 Oct: not done");

    await user.click(checkInButton("Read"));

    await waitFor(async () => {
      expect((await lastSevenDays("Read")).at(-1)).toBe("Thu 15 Oct: done");
    });
  });
});
