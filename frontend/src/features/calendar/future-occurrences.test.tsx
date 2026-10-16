import { screen, within } from "@testing-library/react";

import { day, fakeCalendarToday, mockApi, renderCalendar } from "@/test/calendar";
import { makeTask } from "@/test/tasks";

const task = makeTask;

fakeCalendarToday();

const gym = task({
  id: 4,
  title: "Gym",
  due_date: "2026-10-08",
  due_time: "07:00:00",
  repeat_rule: "FREQ=WEEKLY",
});
const later = {
  occurrences: [
    { task_id: 4, date: "2026-10-22" },
    { task_id: 4, date: "2026-10-29" },
  ],
  repeating: [gym],
};

describe("CalendarView future Occurrences", () => {
  it("shows a repeating Task's future Occurrences faded on their days in Month mode", async () => {
    mockApi([], later);
    renderCalendar();

    const occurrence = await within(
      await screen.findByRole("gridcell", { name: /^Thursday 22/ }),
    ).findByRole("button", {
      name: "Gym, Thursday 22 October, 07:00, in Inbox, future Occurrence",
    });

    expect(occurrence.closest("li")).toHaveClass("opacity-50");
    expect(within(day("Thursday 29 October")).getByText("Gym")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Complete “Gym”" })).not.toBeInTheDocument();
  });

  it("colours a future Occurrence's Repeat mark by its Task's Priority", async () => {
    mockApi([], { ...later, repeating: [{ ...gym, priority: 1 }] });
    renderCalendar();

    const occurrence = await screen.findByRole("button", { name: /^Gym, Thursday 22 October/ });

    expect(occurrence.closest("li")?.querySelector("svg")).toHaveClass("text-p1");
  });

  it("opens the repeating Task when a future Occurrence is clicked", async () => {
    mockApi([], later);
    const { user, router } = renderCalendar();

    await user.click(await screen.findByRole("button", { name: /^Gym, Thursday 22 October/ }));

    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ task: 4 });
  });

  it("draws a future Occurrence as a faded block at its time in Week mode", async () => {
    mockApi([], later);
    renderCalendar("/?mode=week&date=2026-10-22");

    const block = await screen.findByRole("button", {
      name: "Gym, Thursday 22 October, 07:00, in Inbox, future Occurrence",
    });

    expect(block.parentElement).toHaveClass("opacity-50");
    expect(block.closest("[role=gridcell]")).toHaveAccessibleName(
      "Thursday 22 October 2026, 07:00",
    );
    expect(screen.queryByRole("checkbox", { name: "Complete “Gym”" })).not.toBeInTheDocument();
  });

  it("shows a future Occurrence in Day mode", async () => {
    mockApi([], later);
    renderCalendar("/?mode=day&date=2026-10-29");

    expect(
      await screen.findByRole("button", {
        name: /^Gym, Thursday 29 October, 07:00, .*future Occurrence$/,
      }),
    ).toBeInTheDocument();
  });
});
