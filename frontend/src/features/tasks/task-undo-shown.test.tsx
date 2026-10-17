import { QueryClient } from "@tanstack/react-query";
import { screen } from "@testing-library/react";

import { INBOX, WORK, json } from "@/test/drawer";
import { renderChanges } from "@/test/task-undo";
import { makeTask } from "@/test/tasks";

import { taskKeys } from "./task-cache";
import type { Task } from "./tasks";

const URGENT = makeTask({ id: 1, title: "Tea", priority: 3 });
const LOW = makeTask({ id: 2, title: "Cake", priority: 1, due_date: "2026-10-20" });
const FLIGHTS = makeTask({ id: 3, title: "Flights", parent_id: 1 });
const WORK_LIST = { project: WORK.id };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a change to several Tasks", () => {
  const INBOX_LIST = { project: INBOX.id };
  const WATER = makeTask({
    id: 4,
    title: "Water",
    due_date: "2026-10-17",
    repeat_rule: "FREQ=DAILY",
  });

  /** A cache with the Inbox, holding the Tasks, and Work, empty, as if both lists had loaded. */
  function loaded() {
    const queryClient = new QueryClient();
    queryClient.setQueryData<Task[]>(taskKeys.open(INBOX_LIST), [URGENT, FLIGHTS, LOW, WATER]);
    queryClient.setQueryData<Task[]>(taskKeys.open(WORK_LIST), []);
    return queryClient;
  }

  /** A stand-in server that never answers, so the lists show only what the change showed. */
  function silentServer() {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => undefined));
  }

  function shown(queryClient: QueryClient, source: { project: number }) {
    return queryClient.getQueryData<Task[]>(taskKeys.open(source)) ?? [];
  }

  it("shows a Status change before the server answers, leaving a repeating Task to move on", async () => {
    silentServer();
    const queryClient = loaded();
    const changes = renderChanges(queryClient);

    changes.current.setStatus([URGENT, LOW, WATER], "completed");

    await vi.waitFor(() => {
      expect(shown(queryClient, INBOX_LIST).map((task) => task.title)).toEqual(["Water"]);
    });
  });

  it("shows a new due date before the server answers", async () => {
    silentServer();
    const queryClient = loaded();
    const changes = renderChanges(queryClient);

    changes.current.setDueDate([URGENT, LOW], "2026-11-01");

    await vi.waitFor(() => {
      const dates = shown(queryClient, INBOX_LIST).map((task) => task.due_date);
      expect(dates).toEqual(["2026-11-01", null, "2026-11-01", "2026-10-17"]);
    });
  });

  it("shows a delete before the server answers", async () => {
    silentServer();
    const queryClient = loaded();
    const changes = renderChanges(queryClient);

    changes.current.remove([URGENT, LOW]);

    await vi.waitFor(() => {
      expect(shown(queryClient, INBOX_LIST).map((task) => task.title)).toEqual(["Water"]);
    });
  });

  it("shows a move to another Project before the server answers, Subtasks with their parent", async () => {
    silentServer();
    const queryClient = loaded();
    const changes = renderChanges(queryClient);

    changes.current.moveTo([URGENT, FLIGHTS, LOW], WORK);

    await vi.waitFor(() => {
      expect(shown(queryClient, INBOX_LIST).map((task) => task.title)).toEqual(["Water"]);
    });
    expect(shown(queryClient, WORK_LIST).map((task) => [task.title, task.parent_id])).toEqual([
      ["Cake", null],
      ["Tea", null],
      ["Flights", 1],
    ]);
  });

  it("moves a chosen Subtask with its chosen ancestor, as the list's rows show", async () => {
    silentServer();
    const queryClient = loaded();
    const seats = makeTask({ id: 5, title: "Seats", parent_id: FLIGHTS.id });
    const changes = renderChanges(queryClient);

    changes.current.moveTo([URGENT, seats], WORK, [URGENT, FLIGHTS, seats]);

    await vi.waitFor(() => {
      expect(shown(queryClient, WORK_LIST).map((task) => task.title)).toEqual(["Tea", "Flights"]);
    });
  });

  it("puts every list back when the server refuses the move", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      json({ detail: "The Project is archived." }, 422),
    );
    const queryClient = loaded();
    const changes = renderChanges(queryClient);

    changes.current.moveTo([URGENT, LOW], WORK);

    expect(await screen.findByText("The Project is archived.")).toBeInTheDocument();
    expect(shown(queryClient, INBOX_LIST)).toEqual([URGENT, FLIGHTS, LOW, WATER]);
    expect(shown(queryClient, WORK_LIST)).toEqual([]);
  });
});
