import type { InfiniteData } from "@tanstack/react-query";

import {
  calendar,
  detail,
  FLIGHTS,
  GYM,
  OCTOBER,
  READ,
  seeded,
  titles,
  TRIP,
  WORK_LIST,
  type CalendarRange,
  type TaskPage,
} from "@/test/task-cache";
import { makeTask } from "@/test/tasks";

import { showTaskChanges, taskKeys, type TaskChange } from "./task-cache";
import type { Task, TaskDetail } from "./tasks";

const HOME = { project: 8 };
const toHome = (taskId: number): TaskChange => ({ kind: "project", taskId, projectId: 8 });

describe("showTaskChanges moving a Task to another Project", () => {
  const PAINT = makeTask({ id: 20, title: "Paint", project_id: 8 });

  function withHome() {
    const queryClient = seeded();
    queryClient.setQueryData<Task[]>(taskKeys.open(HOME), [PAINT]);
    queryClient.setQueryData<Task[]>(taskKeys.open({ view: "today" }), [GYM, FLIGHTS]);
    return queryClient;
  }

  it("takes it with its Subtasks out of the old Project and puts them first in the new", () => {
    const queryClient = withHome();

    showTaskChanges(queryClient, [toHome(TRIP.id)]);

    expect(titles(queryClient, taskKeys.open(WORK_LIST))).toEqual(["Gym"]);
    const home = queryClient.getQueryData<Task[]>(taskKeys.open(HOME));
    expect(home?.map((task) => [task.title, task.project_id])).toEqual([
      ["Trip", 8],
      ["Flights", 8],
      ["Paint", 8],
    ]);
  });

  it("keeps it in other lists with its new Project", () => {
    const queryClient = withHome();

    showTaskChanges(queryClient, [toHome(GYM.id), toHome(TRIP.id)]);

    const today = queryClient.getQueryData<Task[]>(taskKeys.open({ view: "today" }));
    expect(today?.map((task) => [task.title, task.project_id])).toEqual([
      ["Gym", 8],
      ["Flights", 8],
    ]);
    expect(calendar(queryClient).items[0]?.project_id).toBe(8);
    expect(calendar(queryClient).repeating[0]?.project_id).toBe(8);
    expect(queryClient.getQueryData<Task[]>(taskKeys.search("gym"))?.[0]?.project_id).toBe(8);
    expect(detail(queryClient)).toMatchObject({ project_id: 8 });
    expect(detail(queryClient)?.subtasks[0]?.project_id).toBe(8);
  });

  it("makes a Subtask moved alone a root with no Section", () => {
    const queryClient = withHome();
    queryClient.setQueryData<TaskDetail>(taskKeys.detail(FLIGHTS.id), {
      ...FLIGHTS,
      section_id: 31,
      depth: 1,
      parent_title: "Trip",
      ancestors: [{ id: TRIP.id, title: "Trip" }],
    });

    showTaskChanges(queryClient, [toHome(FLIGHTS.id)]);

    expect(titles(queryClient, taskKeys.open(WORK_LIST))).toEqual(["Trip", "Gym"]);
    expect(queryClient.getQueryData<Task[]>(taskKeys.open(HOME))?.[0]).toMatchObject({
      id: FLIGHTS.id,
      parent_id: null,
    });
    expect(queryClient.getQueryData<TaskDetail>(taskKeys.detail(FLIGHTS.id))).toMatchObject({
      project_id: 8,
      parent_id: null,
      section_id: null,
      depth: 0,
      parent_title: null,
      ancestors: [],
    });
    expect(detail(queryClient)?.subtasks).toEqual([]);
  });

  it("moves a Closed Task in the Closed list", () => {
    const queryClient = withHome();

    showTaskChanges(queryClient, [toHome(READ.id)]);

    const data = queryClient.getQueryData<InfiniteData<TaskPage>>(taskKeys.closed(WORK_LIST));
    expect(data?.pages[0]?.items[0]?.project_id).toBe(8);
  });

  it("leaves the new Project's list alone when no list holds the Task", () => {
    const queryClient = withHome();

    showTaskChanges(queryClient, [toHome(99)]);

    expect(titles(queryClient, taskKeys.open(HOME))).toEqual(["Paint"]);
  });
});

describe("showTaskChanges moving a Task whose Subtasks a View holds without it", () => {
  const SEATS = makeTask({ id: 5, title: "Seats", parent_id: FLIGHTS.id, depth: 2 });

  /** Trip's drawer holds its whole tree; Today holds only Seats. */
  function withSeats() {
    const queryClient = seeded();
    queryClient.setQueryData<TaskDetail>(taskKeys.detail(TRIP.id), {
      ...TRIP,
      subtasks: [FLIGHTS, SEATS],
    });
    queryClient.setQueryData<Task[]>(taskKeys.open({ view: "today" }), [GYM, SEATS]);
    return queryClient;
  }

  it("moves a Subtask two levels down in a View that doesn't hold the Tasks above it", () => {
    const queryClient = withSeats();

    showTaskChanges(queryClient, [toHome(TRIP.id)]);

    const today = queryClient.getQueryData<Task[]>(taskKeys.open({ view: "today" }));
    expect(today?.map((task) => [task.title, task.project_id, task.depth])).toEqual([
      ["Gym", 7, 0],
      ["Seats", 8, 2],
    ]);
  });

  it("raises a Subtask under the moved one by its depth from the whole cache", () => {
    const queryClient = withSeats();

    showTaskChanges(queryClient, [toHome(FLIGHTS.id)]);

    const today = queryClient.getQueryData<Task[]>(taskKeys.open({ view: "today" }));
    expect(today?.find((task) => task.id === SEATS.id)).toMatchObject({ project_id: 8, depth: 1 });
  });

  it("drops from the old Project's list Subtasks linked to the Task through another View", () => {
    const queryClient = withSeats();
    queryClient.setQueryData<Task[]>(taskKeys.open(WORK_LIST), [TRIP, GYM, SEATS]);

    showTaskChanges(queryClient, [toHome(TRIP.id)]);

    expect(titles(queryClient, taskKeys.open(WORK_LIST))).toEqual(["Gym"]);
  });

  it("moves a drawer's Subtasks with it when the drawer's Task is inside the moved tree", () => {
    const queryClient = withSeats();
    queryClient.setQueryData<TaskDetail>(taskKeys.detail(FLIGHTS.id), {
      ...FLIGHTS,
      ancestors: [{ id: TRIP.id, title: "Trip" }],
      subtasks: [SEATS],
    });

    showTaskChanges(queryClient, [toHome(TRIP.id)]);

    const drawer = queryClient.getQueryData<TaskDetail>(taskKeys.detail(FLIGHTS.id));
    expect(drawer).toMatchObject({ project_id: 8, parent_id: TRIP.id });
    expect(drawer?.subtasks.map((task) => [task.title, task.project_id])).toEqual([["Seats", 8]]);
  });

  it("drops from a moved drawer's ancestors the Tasks the move leaves behind", () => {
    const queryClient = withSeats();
    queryClient.setQueryData<TaskDetail>(taskKeys.detail(SEATS.id), {
      ...SEATS,
      ancestors: [
        { id: TRIP.id, title: "Trip" },
        { id: FLIGHTS.id, title: "Flights" },
      ],
      subtasks: [],
    });

    showTaskChanges(queryClient, [toHome(FLIGHTS.id)]);

    const drawer = queryClient.getQueryData<TaskDetail>(taskKeys.detail(SEATS.id));
    expect(drawer).toMatchObject({ project_id: 8, depth: 1 });
    expect(drawer?.ancestors).toEqual([{ id: FLIGHTS.id, title: "Flights" }]);
  });

  it("puts in the new Project's list only Subtasks it can hang under the moved Task", () => {
    const queryClient = withSeats();
    queryClient.setQueryData<Task[]>(taskKeys.open(WORK_LIST), [GYM]);
    queryClient.setQueryData<Task[]>(taskKeys.open({ view: "today" }), [TRIP, SEATS]);
    queryClient.setQueryData<Task[]>(taskKeys.open(HOME), []);

    showTaskChanges(queryClient, [toHome(TRIP.id)]);

    expect(titles(queryClient, taskKeys.open(HOME))).toEqual(["Trip"]);
  });

  it("moves a Subtask in a Calendar range that doesn't hold the Tasks above it", () => {
    const queryClient = withSeats();
    queryClient.setQueryData<CalendarRange>(taskKeys.calendar(OCTOBER), {
      items: [GYM, SEATS],
      occurrences: [],
      repeating: [GYM],
    });

    showTaskChanges(queryClient, [toHome(TRIP.id)]);

    expect(calendar(queryClient).items.map((task) => task.project_id)).toEqual([7, 8]);
  });
});
