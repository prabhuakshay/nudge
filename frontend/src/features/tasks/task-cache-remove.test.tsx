import {
  calendar,
  FLIGHTS,
  GYM,
  OCTOBER,
  seeded,
  titles,
  TRIP,
  type CalendarRange,
} from "@/test/task-cache";
import { makeTask } from "@/test/tasks";

import { showTaskChanges, taskKeys } from "./task-cache";
import type { Task, TaskDetail } from "./tasks";

describe("showTaskChanges removing a Task whose Subtasks a view holds without it", () => {
  const SEATS = makeTask({
    id: 5,
    title: "Seats",
    parent_id: FLIGHTS.id,
    depth: 2,
    due_date: "2026-10-20",
    repeat_rule: "FREQ=WEEKLY",
  });
  const WINDOW = makeTask({
    id: 6,
    title: "Window",
    parent_id: SEATS.id,
    depth: 3,
    due_date: "2026-10-21",
  });

  /** Trip's drawer holds its whole tree; October and the search hold only Seats and Window. */
  function withSeats() {
    const queryClient = seeded();
    queryClient.setQueryData<TaskDetail>(taskKeys.detail(TRIP.id), {
      ...TRIP,
      subtasks: [FLIGHTS, SEATS, WINDOW],
    });
    queryClient.setQueryData<CalendarRange>(taskKeys.calendar(OCTOBER), {
      items: [GYM, SEATS, WINDOW],
      occurrences: [
        { task_id: GYM.id, date: "2026-10-17" },
        { task_id: SEATS.id, date: "2026-10-27" },
      ],
      repeating: [GYM, SEATS],
    });
    queryClient.setQueryData<Task[]>(taskKeys.search("seats"), [SEATS, WINDOW]);
    return queryClient;
  }

  it("takes them off a Calendar range that doesn't hold the parent", () => {
    const queryClient = withSeats();

    showTaskChanges(queryClient, [{ kind: "remove", taskId: TRIP.id }]);

    expect(calendar(queryClient).items.map((task) => task.title)).toEqual(["Gym"]);
  });

  it("takes them out of a search that doesn't hold the parent", () => {
    const queryClient = withSeats();

    showTaskChanges(queryClient, [{ kind: "remove", taskId: TRIP.id }]);

    expect(titles(queryClient, taskKeys.search("seats"))).toEqual([]);
  });

  it("drops a removed Subtask's future Occurrences", () => {
    const queryClient = withSeats();

    showTaskChanges(queryClient, [{ kind: "remove", taskId: TRIP.id }]);

    expect(calendar(queryClient).occurrences).toEqual([{ task_id: GYM.id, date: "2026-10-17" }]);
    expect(calendar(queryClient).repeating.map((task) => task.title)).toEqual(["Gym"]);
  });

  it("follows a Subtask that only a range's repeating Tasks hold", () => {
    const queryClient = seeded();
    queryClient.setQueryData<CalendarRange>(taskKeys.calendar(OCTOBER), {
      items: [GYM, WINDOW],
      occurrences: [{ task_id: GYM.id, date: "2026-10-17" }],
      repeating: [GYM, SEATS],
    });

    showTaskChanges(queryClient, [{ kind: "remove", taskId: TRIP.id }]);

    expect(calendar(queryClient).items.map((task) => task.title)).toEqual(["Gym"]);
  });
});
