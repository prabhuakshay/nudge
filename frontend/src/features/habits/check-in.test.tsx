import { screen, waitFor } from "@testing-library/react";

import { fakeCalendarToday } from "@/test/calendar";
import { changes, checkInButton, habit, mockApi, pick, renderPage } from "@/test/habits";

describe("Checking in on the Habits page", () => {
  fakeCalendarToday();

  it("checks in for today with one tap", async () => {
    const sent = mockApi([habit({ id: 1, name: "Read" })]);
    const user = renderPage();
    await screen.findByText("Read");
    expect(checkInButton("Read")).toHaveAccessibleDescription("Not done today");

    await user.click(checkInButton("Read"));

    await waitFor(() => {
      expect(checkInButton("Read")).toHaveAccessibleDescription("Done today");
    });
    expect(changes(sent)).toEqual([
      { method: "PUT", path: "/api/v1/habits/1/check-ins/2026-10-15", body: { count: 1 } },
    ]);
  });

  it("fills the ring one Check-in at a time toward the Goal", async () => {
    const sent = mockApi([habit({ id: 2, name: "Drink water", goal: 3, today_count: 1 })]);
    const user = renderPage();
    await screen.findByText("Drink water");
    expect(checkInButton("Drink water")).toHaveAccessibleDescription("1 of 3 today");

    await user.click(checkInButton("Drink water"));

    expect(checkInButton("Drink water")).toHaveAccessibleDescription("2 of 3 today");
    await waitFor(() => {
      expect(changes(sent)).toEqual([
        { method: "PUT", path: "/api/v1/habits/2/check-ins/2026-10-15", body: { count: 2 } },
      ]);
    });
  });

  it("shows a Check-in at once, before the server answers", async () => {
    mockApi([habit({ id: 1, name: "Read", goal: 2 })]);
    const user = renderPage();
    await screen.findByText("Read");
    vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));

    await user.click(checkInButton("Read"));

    expect(checkInButton("Read")).toHaveAccessibleDescription("1 of 2 today");
  });

  it("does nothing on a tap once today's Goal is met", async () => {
    const sent = mockApi([habit({ id: 1, name: "Read", goal: 2, today_count: 2 })]);
    const user = renderPage();
    await screen.findByText("Read");

    await user.click(checkInButton("Read"));

    expect(checkInButton("Read")).toHaveAccessibleDescription("Done today");
    expect(changes(sent)).toEqual([]);
  });

  it("undoes one Check-in from the Habit's menu", async () => {
    const sent = mockApi([habit({ id: 1, name: "Drink water", goal: 3, today_count: 2 })]);
    const user = renderPage();
    await screen.findByText("Drink water");

    await pick(user, "Drink water", "Undo Check-in");

    expect(checkInButton("Drink water")).toHaveAccessibleDescription("1 of 3 today");
    await waitFor(() => {
      expect(changes(sent)).toEqual([
        { method: "PUT", path: "/api/v1/habits/1/check-ins/2026-10-15", body: { count: 1 } },
      ]);
    });
  });

  it("offers no undo before the first Check-in of the day", async () => {
    mockApi([habit({ id: 1, name: "Read" })]);
    const user = renderPage();
    await screen.findByText("Read");

    await user.click(screen.getByRole("button", { name: "Read options" }));

    expect(await screen.findByRole("menuitem", { name: "Undo Check-in" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
