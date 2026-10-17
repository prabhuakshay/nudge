import { QueryClient, type InfiniteData } from "@tanstack/react-query";

import type { components } from "@/api/schema";
import { taskKeys, type DayRange } from "@/features/tasks/task-cache";
import type { Task, TaskDetail } from "@/features/tasks/tasks";
import { makeTask } from "@/test/tasks";

/* A cache seeded with every shape that holds Tasks, shared by the Task cache's test files. */

export type CalendarRange = components["schemas"]["CalendarOut"];
export type TaskPage = components["schemas"]["TaskListOut"];

export const WORK_LIST = { project: 7 };
export const OCTOBER: DayRange = { start: "2026-10-01", end: "2026-10-31" };
export const NOVEMBER: DayRange = { start: "2026-11-01", end: "2026-11-30" };

export const TRIP = makeTask({ id: 1, title: "Trip" });
export const FLIGHTS = makeTask({ id: 2, title: "Flights", parent_id: 1 });
export const GYM = makeTask({
  id: 3,
  title: "Gym",
  due_date: "2026-10-16",
  repeat_rule: "FREQ=DAILY",
});
export const READ = makeTask({ id: 4, title: "Read", status: "completed" });

/** A cache holding every shape that holds Tasks, as if each view had loaded. */
export function seeded() {
  const queryClient = new QueryClient();
  queryClient.setQueryData<Task[]>(taskKeys.open(WORK_LIST), [TRIP, FLIGHTS, GYM]);
  queryClient.setQueryData<Task[]>(taskKeys.open({ view: "today" }), [GYM]);
  queryClient.setQueryData<TaskDetail>(taskKeys.detail(TRIP.id), { ...TRIP, subtasks: [FLIGHTS] });
  queryClient.setQueryData<CalendarRange>(taskKeys.calendar(OCTOBER), {
    items: [GYM],
    occurrences: [{ task_id: GYM.id, date: "2026-10-17" }],
    repeating: [GYM],
  });
  queryClient.setQueryData<InfiniteData<TaskPage>>(taskKeys.closed(WORK_LIST), {
    pages: [{ items: [READ], next_cursor: null }],
    pageParams: [null],
  });
  queryClient.setQueryData<Task[]>(taskKeys.search("gym"), [GYM]);
  queryClient.setQueryData(taskKeys.sidebar, { counts: "open counts" });
  return queryClient;
}

/** The titles of the Tasks a list holds. */
export function titles(queryClient: QueryClient, key: readonly unknown[]) {
  return queryClient.getQueryData<Task[]>(key)?.map((task) => task.title);
}

/** October's Calendar range. */
export function calendar(queryClient: QueryClient) {
  const range = queryClient.getQueryData<CalendarRange>(taskKeys.calendar(OCTOBER));
  if (!range) throw new Error("The Calendar range is gone.");
  return range;
}

/** Cache an empty Calendar range, as if it had loaded with nothing in it. */
export function emptyRange(queryClient: QueryClient, range: DayRange) {
  queryClient.setQueryData<CalendarRange>(taskKeys.calendar(range), {
    items: [],
    occurrences: [],
    repeating: [],
  });
}

/** The ids of the Tasks a Calendar range shows. */
export function rangeIds(queryClient: QueryClient, range: DayRange) {
  return queryClient
    .getQueryData<CalendarRange>(taskKeys.calendar(range))
    ?.items.map((task) => task.id);
}

/** The titles of the Closed Tasks of Project 7. */
export function closedTitles(queryClient: QueryClient) {
  const data = queryClient.getQueryData<InfiniteData<TaskPage>>(taskKeys.closed(WORK_LIST));
  return data?.pages.flatMap((page) => page.items.map((task) => task.title));
}

/** Trip's drawer. */
export function detail(queryClient: QueryClient) {
  return queryClient.getQueryData<TaskDetail>(taskKeys.detail(TRIP.id));
}
