import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import type { components } from "@/api/schema";
import { makeTask } from "@/test/tasks";

import {
  showTaskChanges,
  taskKeys,
  useTaskMutation,
  type DayRange,
  type TaskChange,
} from "./task-cache";
import type { Task, TaskDetail } from "./tasks";

type CalendarRange = components["schemas"]["CalendarOut"];
type TaskPage = components["schemas"]["TaskListOut"];

const WORK = { project: 7 };
const OCTOBER: DayRange = { start: "2026-10-01", end: "2026-10-31" };

const TRIP = makeTask({ id: 1, title: "Trip" });
const FLIGHTS = makeTask({ id: 2, title: "Flights", parent_id: 1 });
const GYM = makeTask({ id: 3, title: "Gym", due_date: "2026-10-16", repeat_rule: "FREQ=DAILY" });
const READ = makeTask({ id: 4, title: "Read", status: "completed" });

/** A cache holding every shape that holds Tasks, as if each view had loaded. */
function seeded() {
  const queryClient = new QueryClient();
  queryClient.setQueryData<Task[]>(taskKeys.open(WORK), [TRIP, FLIGHTS, GYM]);
  queryClient.setQueryData<Task[]>(taskKeys.open({ view: "today" }), [GYM]);
  queryClient.setQueryData<TaskDetail>(taskKeys.detail(TRIP.id), { ...TRIP, subtasks: [FLIGHTS] });
  queryClient.setQueryData<CalendarRange>(taskKeys.calendar(OCTOBER), {
    items: [GYM],
    occurrences: [{ task_id: GYM.id, date: "2026-10-17" }],
    repeating: [GYM],
  });
  queryClient.setQueryData<InfiniteData<TaskPage>>(taskKeys.closed(WORK), {
    pages: [{ items: [READ], next_cursor: null }],
    pageParams: [null],
  });
  queryClient.setQueryData<Task[]>(taskKeys.search("gym"), [GYM]);
  queryClient.setQueryData(taskKeys.sidebar, { counts: "open counts" });
  return queryClient;
}

function titles(queryClient: QueryClient, key: readonly unknown[]) {
  return queryClient.getQueryData<Task[]>(key)?.map((task) => task.title);
}

function calendar(queryClient: QueryClient) {
  const range = queryClient.getQueryData<CalendarRange>(taskKeys.calendar(OCTOBER));
  if (!range) throw new Error("The Calendar range is gone.");
  return range;
}

function closedTitles(queryClient: QueryClient) {
  const data = queryClient.getQueryData<InfiniteData<TaskPage>>(taskKeys.closed(WORK));
  return data?.pages.flatMap((page) => page.items.map((task) => task.title));
}

function detail(queryClient: QueryClient) {
  return queryClient.getQueryData<TaskDetail>(taskKeys.detail(TRIP.id));
}

describe("showTaskChanges", () => {
  it("patches the Task in every list, drawer, Calendar range and search", () => {
    const queryClient = seeded();

    showTaskChanges(queryClient, [{ kind: "patch", patch: { id: GYM.id, title: "Swim" } }]);

    expect(titles(queryClient, taskKeys.open(WORK))).toEqual(["Trip", "Flights", "Swim"]);
    expect(titles(queryClient, taskKeys.open({ view: "today" }))).toEqual(["Swim"]);
    expect(calendar(queryClient).items[0]?.title).toBe("Swim");
    expect(calendar(queryClient).repeating[0]?.title).toBe("Swim");
    expect(titles(queryClient, taskKeys.search("gym"))).toEqual(["Swim"]);
  });

  it("patches a Subtask in its parent's drawer", () => {
    const queryClient = seeded();

    showTaskChanges(queryClient, [{ kind: "patch", patch: { id: FLIGHTS.id, priority: 3 } }]);

    expect(detail(queryClient)?.subtasks[0]?.priority).toBe(3);
  });

  it("takes a closed tree out of the open lists but keeps it on the Calendar", () => {
    const queryClient = seeded();

    showTaskChanges(queryClient, [{ kind: "patch", patch: { id: TRIP.id, status: "completed" } }]);
    showTaskChanges(queryClient, [{ kind: "patch", patch: { id: GYM.id, status: "completed" } }]);

    expect(titles(queryClient, taskKeys.open(WORK))).toEqual([]);
    expect(calendar(queryClient).items[0]?.status).toBe("completed");
  });

  it("takes a reopened Task out of the Closed list", () => {
    const queryClient = seeded();

    showTaskChanges(queryClient, [{ kind: "patch", patch: { id: READ.id, status: "open" } }]);

    expect(closedTitles(queryClient)).toEqual([]);
  });

  it("moves a Task in the lists and its parent's drawer, and on the Calendar", () => {
    const queryClient = seeded();
    const move: TaskChange = {
      kind: "move",
      move: { taskId: GYM.id, parentId: TRIP.id, afterId: FLIGHTS.id, sectionId: null },
    };

    showTaskChanges(queryClient, [move]);

    expect(queryClient.getQueryData<Task[]>(taskKeys.open(WORK))?.at(-1)).toMatchObject({
      id: GYM.id,
      parent_id: TRIP.id,
    });
    expect(detail(queryClient)?.subtasks.map((task) => task.title)).toEqual(["Flights"]);
    expect(calendar(queryClient).items[0]?.parent_id).toBe(TRIP.id);
  });

  it("removes a Task with its Subtasks from every shape", () => {
    const queryClient = seeded();

    showTaskChanges(queryClient, [{ kind: "remove", taskId: TRIP.id }]);
    showTaskChanges(queryClient, [{ kind: "remove", taskId: GYM.id }]);

    expect(titles(queryClient, taskKeys.open(WORK))).toEqual([]);
    expect(calendar(queryClient).items).toEqual([]);
    expect(calendar(queryClient).repeating).toEqual([]);
    expect(titles(queryClient, taskKeys.search("gym"))).toEqual([]);
  });

  it("moves the Task in its own drawer", () => {
    const queryClient = seeded();
    queryClient.setQueryData<TaskDetail>(taskKeys.detail(GYM.id), GYM);

    showTaskChanges(queryClient, [
      { kind: "move", move: { taskId: GYM.id, parentId: TRIP.id, afterId: null, sectionId: 31 } },
    ]);

    expect(queryClient.getQueryData<TaskDetail>(taskKeys.detail(GYM.id))).toMatchObject({
      parent_id: TRIP.id,
      section_id: 31,
    });
  });

  it("drops the future Occurrences of a Task that stops repeating", () => {
    const queryClient = seeded();

    showTaskChanges(queryClient, [{ kind: "patch", patch: { id: GYM.id, repeat_rule: "" } }]);

    expect(calendar(queryClient).occurrences).toEqual([]);
  });

  it("drops the future Occurrences of a removed Task", () => {
    const queryClient = seeded();

    showTaskChanges(queryClient, [{ kind: "remove", taskId: GYM.id }]);

    expect(calendar(queryClient).occurrences).toEqual([]);
  });

  it("keeps the Closed list's order when a Task in it moves", () => {
    const queryClient = seeded();
    const done = makeTask({ id: 5, title: "Done", status: "completed" });
    queryClient.setQueryData<InfiniteData<TaskPage>>(taskKeys.closed(WORK), {
      pages: [{ items: [READ, done], next_cursor: null }],
      pageParams: [null],
    });

    showTaskChanges(queryClient, [
      { kind: "move", move: { taskId: READ.id, parentId: null, afterId: TRIP.id } },
    ]);

    expect(closedTitles(queryClient)).toEqual(["Read", "Done"]);
  });

  it("removes a Subtask from its parent's drawer", () => {
    const queryClient = seeded();

    showTaskChanges(queryClient, [{ kind: "remove", taskId: FLIGHTS.id }]);

    expect(detail(queryClient)?.subtasks).toEqual([]);
  });

  it("inserts a new Task first in its Project, or last when asked", () => {
    const queryClient = seeded();
    const tea = makeTask({ id: 10, title: "Tea" });
    const cake = makeTask({ id: 11, title: "Cake" });

    showTaskChanges(queryClient, [
      { kind: "insert", task: tea },
      { kind: "insert", task: cake, last: true },
    ]);

    expect(titles(queryClient, taskKeys.open(WORK))).toEqual([
      "Tea",
      "Trip",
      "Flights",
      "Gym",
      "Cake",
    ]);
  });

  it("inserts a new Subtask last under its parent", () => {
    const queryClient = seeded();
    const hotel = makeTask({ id: 10, title: "Hotel", parent_id: TRIP.id });

    showTaskChanges(queryClient, [{ kind: "insert", task: hotel }]);

    expect(detail(queryClient)?.subtasks.map((task) => task.title)).toEqual(["Flights", "Hotel"]);
    expect(titles(queryClient, taskKeys.open(WORK))?.at(-1)).toBe("Hotel");
  });

  it("inserts a new Task in the Calendar ranges its dates fall in", () => {
    const queryClient = seeded();
    const november: DayRange = { start: "2026-11-01", end: "2026-11-30" };
    queryClient.setQueryData<CalendarRange>(taskKeys.calendar(november), {
      items: [],
      occurrences: [],
      repeating: [],
    });
    const trip = makeTask({ id: 10, start_date: "2026-10-30", due_date: "2026-11-02" });
    const later = makeTask({ id: 11, due_date: "2026-12-01" });

    showTaskChanges(queryClient, [
      { kind: "insert", task: trip },
      { kind: "insert", task: later },
    ]);

    const ids = (range: DayRange) =>
      queryClient.getQueryData<CalendarRange>(taskKeys.calendar(range))?.items.map((t) => t.id);
    expect(ids(OCTOBER)).toEqual([GYM.id, 10]);
    expect(ids(november)).toEqual([10]);
  });
});

describe("useTaskMutation", () => {
  function render(queryClient: QueryClient, mutationFn: (change: TaskChange) => Promise<Task>) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(
      () =>
        useTaskMutation({
          mutationFn,
          changes: (change) => [change],
          answered: (task) => [{ kind: "insert", task }],
        }),
      { wrapper },
    );
  }

  it("puts every shape back when the request fails", async () => {
    const queryClient = seeded();
    const before = queryClient.getQueriesData({ queryKey: taskKeys.all });
    const { result } = render(queryClient, () => Promise.reject(new Error("Offline")));

    act(() => {
      result.current.mutate({ kind: "remove", taskId: TRIP.id });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(queryClient.getQueriesData({ queryKey: taskKeys.all })).toEqual(before);
  });

  it("shows what the server answered, then refetches every Task and the sidebar", async () => {
    const queryClient = seeded();
    const tea = makeTask({ id: 10, title: "Tea" });
    const { result } = render(queryClient, () => Promise.resolve(tea));

    act(() => {
      result.current.mutate({ kind: "patch", patch: { id: GYM.id, title: "Swim" } });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(titles(queryClient, taskKeys.open(WORK))).toEqual(["Tea", "Trip", "Flights", "Swim"]);
    const queries = queryClient.getQueryCache().getAll();
    expect(queries.map((query) => query.queryKey)).toContainEqual(taskKeys.sidebar);
    expect(queries.every((query) => query.state.isInvalidated)).toBe(true);
  });
});
