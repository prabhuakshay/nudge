import { cleanup, screen } from "@testing-library/react";

import { calendarRequests, fakeCalendarToday, mockApi, renderCalendar } from "@/test/calendar";
import { makeTask as task } from "@/test/tasks";

fakeCalendarToday();

describe("CalendarView's Closed toggle", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hides and shows Closed Tasks without asking the server again", async () => {
    const fetchSpy = mockApi([
      task({ id: 1, title: "Pay rent", due_date: "2026-10-15" }),
      task({ id: 2, title: "Buy milk", due_date: "2026-10-15", status: "completed" }),
    ]);
    const { user } = renderCalendar();
    await screen.findByText("Buy milk");
    const toggle = screen.getByRole("button", { name: "Show Closed Tasks" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Buy milk")).not.toBeInTheDocument();
    expect(screen.getByText("Pay rent")).toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(calendarRequests(fetchSpy)).toHaveLength(1);
  });

  it("remembers the choice in this browser for the next visit", async () => {
    mockApi([task({ id: 2, title: "Buy milk", due_date: "2026-10-15", status: "completed" })]);
    const first = renderCalendar();
    await screen.findByText("Buy milk");
    await first.user.click(screen.getByRole("button", { name: "Show Closed Tasks" }));
    cleanup();

    renderCalendar();

    const toggle = await screen.findByRole("button", { name: "Show Closed Tasks" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await screen.findByRole("gridcell", { name: /^Thursday 15 October/ });
    expect(screen.queryByText("Buy milk")).not.toBeInTheDocument();
  });

  it("still toggles when browser storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mockApi([task({ id: 2, title: "Buy milk", due_date: "2026-10-15", status: "completed" })]);
    const { user } = renderCalendar();
    await screen.findByText("Buy milk");

    await user.click(screen.getByRole("button", { name: "Show Closed Tasks" }));

    expect(screen.queryByText("Buy milk")).not.toBeInTheDocument();
  });
});
