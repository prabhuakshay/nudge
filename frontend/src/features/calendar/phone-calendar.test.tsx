import { screen, within } from "@testing-library/react";

import { calendarRequests, day, fakeCalendarToday, mockApi, renderCalendar } from "@/test/calendar";
import { makeTask as task } from "@/test/tasks";

fakeCalendarToday();

function modes() {
  return within(screen.getByRole("group", { name: "Mode" }))
    .getAllByRole("button")
    .map((button) => button.textContent);
}

describe("CalendarView on a phone", () => {
  it("offers Month and Day but not Week", async () => {
    mockApi();
    renderCalendar("/", { wide: false });

    await screen.findByRole("heading", { name: "October 2026" });
    expect(modes()).toEqual(["Month", "Day"]);
  });

  it("shows a Week link as that day's timeline", async () => {
    const fetchSpy = mockApi();
    renderCalendar("/?mode=week&date=2026-10-16", { wide: false });

    expect(
      await screen.findByRole("heading", { name: "Friday 16 October 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Next day" })).toBeInTheDocument();
    expect(calendarRequests(fetchSpy)).toEqual(["?start=2026-10-16&end=2026-10-16"]);
  });

  it("offers all three modes from sm up", async () => {
    mockApi();
    renderCalendar();

    await screen.findByRole("heading", { name: "October 2026" });
    expect(modes()).toEqual(["Month", "Week", "Day"]);
  });
});

describe("The compact Month on a phone", () => {
  const tasks = () => [
    task({ id: 1, title: "Pay rent", due_date: "2026-10-15" }),
    task({ id: 2, title: "Dentist", due_date: "2026-10-15", due_time: "11:00:00" }),
    task({ id: 3, title: "Gym", due_date: "2026-10-16" }),
  ];

  /** The list of a day's Tasks below the grid, by its heading. */
  const dayList = (label: string) => screen.getByRole("region", { name: label });

  it("marks how many Tasks each day has instead of listing them in the grid", async () => {
    mockApi(tasks());
    renderCalendar("/", { wide: false });

    expect(await screen.findByRole("gridcell", { name: /, 2 Tasks$/ })).toBe(
      day("Thursday 15 October 2026, today"),
    );
    expect(day("Friday 16 October 2026")).toHaveAccessibleName("Friday 16 October 2026, 1 Task");
    expect(within(screen.getByRole("grid")).queryByText("Pay rent")).toBeNull();
  });

  it("lists the selected day's Tasks below the grid, today at first", async () => {
    mockApi(tasks());
    renderCalendar("/", { wide: false });
    await screen.findByText("Pay rent");

    expect(
      within(dayList("Thursday 15 October"))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Pay rent", "11:00Dentist"]);
    expect(day("Thursday 15 October")).toHaveAttribute("aria-selected", "true");
  });

  it("lists a day's Tasks when it is tapped", async () => {
    mockApi(tasks());
    const { user, router } = renderCalendar("/", { wide: false });
    await screen.findByText("Pay rent");

    await user.click(day("Friday 16 October"));

    expect(
      within(await screen.findByRole("region", { name: "Friday 16 October" })).getByRole("button", {
        name: /^Gym,/,
      }),
    ).toBeInTheDocument();
    expect(day("Friday 16 October")).toHaveAttribute("aria-selected", "true");
    expect(day("Thursday 15 October")).toHaveAttribute("aria-selected", "false");
    expect(router.state.location.search).toEqual({ mode: "month", date: "2026-10-16" });

    await user.click(day("Saturday 17 October"));

    expect(
      within(await screen.findByRole("region", { name: "Saturday 17 October" })).getByText(
        "Nothing planned.",
      ),
    ).toBeInTheDocument();
  });

  it("opens a listed Task's detail", async () => {
    mockApi(tasks());
    const { user, router } = renderCalendar("/", { wide: false });
    await screen.findByText("Pay rent");

    await user.click(
      within(dayList("Thursday 15 October")).getByRole("button", { name: /^Dentist,/ }),
    );

    expect(router.state.location.search).toMatchObject({ task: 2 });
  });
});
