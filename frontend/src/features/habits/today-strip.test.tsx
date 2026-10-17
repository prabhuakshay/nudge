import { screen, waitFor, within } from "@testing-library/react";

import { fakeCalendarToday } from "@/test/calendar";
import { changes, checkInButton, habit, mockApi, pick, renderStrip } from "@/test/habits";

const strip = () => screen.getByRole("list", { name: "Today's habits" });

const chips = () =>
  within(strip())
    .getAllByRole("listitem")
    .map((chip) => within(chip).getByRole("button", { name: /options$/ }).ariaLabel);

describe("The Today strip", () => {
  fakeCalendarToday();

  it("shows today's Habits as chips in the user's order", async () => {
    const sent = mockApi([habit({ id: 1, name: "Read" }), habit({ id: 2, name: "Gym" })]);
    renderStrip();

    await screen.findByText("Read");

    expect(chips()).toEqual(["Read options", "Gym options"]);
    expect(changes(sent)).toEqual([]);
  });

  it("fades a Habit done today and keeps it in the strip", async () => {
    mockApi([habit({ id: 1, name: "Read", today_count: 1 }), habit({ id: 2, name: "Gym" })]);
    renderStrip();

    const done = (await screen.findByText("Read")).closest("li");

    expect(done).toHaveClass("opacity-60");
    expect(screen.getByText("Gym").closest("li")).not.toHaveClass("opacity-60");
    expect(checkInButton("Read")).toHaveAccessibleDescription("Done today");
  });

  it("checks in with a tap, showing it at once and fading the chip once done", async () => {
    const sent = mockApi([habit({ id: 1, name: "Read" })]);
    const user = renderStrip();
    await screen.findByText("Read");
    vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));

    await user.click(checkInButton("Read"));

    expect(checkInButton("Read")).toHaveAccessibleDescription("Done today");
    expect(screen.getByText("Read").closest("li")).toHaveClass("opacity-60");
    expect(changes(sent)).toEqual([]);
  });

  it("sends a tap's Check-in for today on the user's clock", async () => {
    const sent = mockApi([habit({ id: 2, name: "Drink water", goal: 3, today_count: 1 })]);
    const user = renderStrip();
    await screen.findByText("Drink water");

    await user.click(checkInButton("Drink water"));

    expect(checkInButton("Drink water")).toHaveAccessibleDescription("2 of 3 today");
    await waitFor(() => {
      expect(changes(sent)).toEqual([
        { method: "PUT", path: "/api/v1/habits/2/check-ins/2026-10-15", body: { count: 2 } },
      ]);
    });
  });

  it("undoes a Check-in from the chip's menu", async () => {
    const sent = mockApi([habit({ id: 1, name: "Read", today_count: 1 })]);
    const user = renderStrip();
    await screen.findByText("Read");

    await pick(user, "Read", "Undo Check-in");

    expect(checkInButton("Read")).toHaveAccessibleDescription("Not done today");
    expect(screen.getByText("Read").closest("li")).not.toHaveClass("opacity-60");
    await waitFor(() => {
      expect(changes(sent)).toEqual([
        { method: "PUT", path: "/api/v1/habits/1/check-ins/2026-10-15", body: { count: 0 } },
      ]);
    });
  });

  it("is hidden when no Habit is due today", async () => {
    mockApi([]);
    renderStrip();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(screen.queryByRole("list", { name: "Today's habits" })).not.toBeInTheDocument();
  });
});
