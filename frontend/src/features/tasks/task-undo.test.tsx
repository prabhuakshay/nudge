import { QueryClient } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react";

import type { SidebarTag } from "@/features/tags/tags";
import { INBOX, WORK, json } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { renderChanges } from "@/test/task-undo";
import { makeTask } from "@/test/tasks";
import { undoLatestChange } from "@/lib/undo-toast";

import { taskKeys } from "./task-cache";
import type { Task } from "./tasks";

const URGENT = makeTask({ id: 1, title: "Tea", priority: 3 });
const LOW = makeTask({ id: 2, title: "Cake", priority: 1, due_date: "2026-10-20" });
const FLIGHTS = makeTask({ id: 3, title: "Flights", parent_id: 1 });
const WORK_LIST = { project: WORK.id };
const WORK_TAG: SidebarTag = { id: 21, name: "work", color: null, open_count: 0, task_count: 0 };

type Sent = { method: string; path: string; body: unknown };
type Answers = { affected?: unknown[]; movedFrom?: unknown[]; failRestore?: boolean };

/** A stand-in server that records what it is sent and answers each write as the real one does. */
function mockServer({ affected = [], movedFrom = [], failRestore = false }: Answers = {}) {
  const sent: Sent[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const path = new URL(request.url).pathname;
    const body = request.method === "GET" ? undefined : await request.clone().text();
    // JSON.parse returns any; unknown keeps the recorded bodies checked.
    const parsed = body ? (JSON.parse(body) as unknown) : null;
    sent.push({ method: request.method, path, body: parsed });
    if (path.endsWith("/restore")) {
      if (failRestore) return json({ detail: "The Project is gone." }, 422);
      return json({ task: URGENT, project: INBOX });
    }
    if (path.endsWith("/tasks/bulk")) return json({ affected, moved_from: movedFrom });
    if (request.method === "DELETE") return new Response(null, { status: 204 });
    return json({ task: URGENT, affected });
  });
  return sent;
}

/** Wait for the change's toast, then press Mod+Z, and return what Undo sent. */
async function undo(sent: Sent[], message: string) {
  await screen.findByText(message);
  const before = sent.length;
  act(() => {
    undoLatestChange();
  });
  await vi.waitFor(() => {
    expect(sent.filter((each) => each.method !== "GET").length).toBeGreaterThan(before);
  });
  return sent.slice(before).filter((each) => each.method !== "GET");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Undo of a Status change", () => {
  const affected = [
    { id: 1, prior_status: "open", prior_blocked_reason: "" },
    { id: 3, prior_status: "blocked", prior_blocked_reason: "Waiting" },
  ];

  it("sets every Task the change touched back, in one request", async () => {
    const sent = mockServer({ affected });
    const changes = renderChanges();

    changes.current.setStatus([URGENT, LOW], "completed");

    expect(await undo(sent, "Completed 2 tasks")).toEqual([
      {
        method: "POST",
        path: "/api/v1/tasks/bulk",
        body: {
          ids: [1, 3],
          action: {
            kind: "statuses",
            statuses: [
              { id: 1, status: "open", blocked_reason: "" },
              { id: 3, status: "blocked", blocked_reason: "Waiting" },
            ],
          },
        },
      },
    ]);
  });

  it("does the same for one Task, which it changes with a PATCH", async () => {
    const sent = mockServer({ affected });
    const changes = renderChanges();

    changes.current.setStatus([URGENT], "completed");

    const [restored] = await undo(sent, "Completed “Tea” with 1 Subtask");
    expect(sent[0]).toMatchObject({ method: "PATCH", path: "/api/v1/tasks/1" });
    expect(restored?.body).toMatchObject({ ids: [1, 3], action: { kind: "statuses" } });
  });
});

describe("Undo of a Priority change", () => {
  it("gives each Task back its own Priority, one request per Priority", async () => {
    const sent = mockServer();
    const changes = renderChanges();

    changes.current.setPriority([URGENT, LOW], 0);

    expect((await undo(sent, "Changed the priority of 2 tasks")).map((each) => each.body)).toEqual([
      { ids: [1], action: { kind: "priority", priority: 3 } },
      { ids: [2], action: { kind: "priority", priority: 1 } },
    ]);
  });

  it("shows the old Priority in the lists before the server answers", async () => {
    mockServer();
    const queryClient = new QueryClient();
    queryClient.setQueryData<Task[]>(taskKeys.open(WORK_LIST), [{ ...URGENT, priority: 0 }]);
    const changes = renderChanges(queryClient);

    changes.current.setPriority([URGENT], 0);
    await screen.findByText("Changed the priority of “Tea”");
    act(() => {
      undoLatestChange();
    });

    await vi.waitFor(() => {
      expect(queryClient.getQueryData<Task[]>(taskKeys.open(WORK_LIST))?.[0]?.priority).toBe(3);
    });
  });
});

describe("Undo of a date change", () => {
  it("gives each Task back its dates, taking them off the undated ones", async () => {
    const sent = mockServer();
    const changes = renderChanges();

    changes.current.setDueDate([URGENT, LOW], "2026-10-18");

    expect(await undo(sent, "Changed the date of 2 tasks")).toEqual([
      {
        method: "POST",
        path: "/api/v1/tasks/bulk",
        body: {
          ids: [2],
          action: {
            kind: "dates",
            dates: { due_date: "2026-10-20", due_time: null, start_date: null, start_time: null },
          },
        },
      },
      { method: "PATCH", path: "/api/v1/tasks/1", body: { dates: null } },
    ]);
  });

  it("puts back the Reminders and Repeat that went with a removed due date", async () => {
    const sent = mockServer();
    const changes = renderChanges();
    const gym = { ...LOW, repeat_rule: "FREQ=DAILY", repeat_from: "due" as const };

    changes.current.removeDates(gym, [0, 60]);

    expect(await undo(sent, "Date, reminders and repeat removed")).toEqual([
      {
        method: "PATCH",
        path: "/api/v1/tasks/2",
        body: {
          dates: { due_date: "2026-10-20", due_time: null, start_date: null, start_time: null },
          reminders: [0, 60],
          repeat_rule: "FREQ=DAILY",
          repeat_from: "due",
        },
      },
    ]);
  });

  it("marks a removed due date's Task as a Countdown again", async () => {
    const sent = mockServer();
    const changes = renderChanges();

    changes.current.removeDates({ ...LOW, countdown: true }, []);

    expect((await undo(sent, "Date removed")).map((each) => each.body)).toEqual([
      {
        dates: { due_date: "2026-10-20", due_time: null, start_date: null, start_time: null },
        reminders: [],
        countdown: true,
      },
    ]);
  });
});

describe("Undo of a Tag change", () => {
  it("puts the Tag back on the Tasks that had it and takes it off the others", async () => {
    const sent = mockServer();
    const changes = renderChanges();
    const tagged = { ...URGENT, tags: [{ id: 21, name: "work", color: null }] };

    changes.current.removeTag([tagged, LOW], WORK_TAG);

    expect((await undo(sent, "Removed “work” from 2 tasks")).map((each) => each.body)).toEqual([
      { ids: [1], action: { kind: "add_tag", tag_id: 21 } },
      { ids: [2], action: { kind: "remove_tag", tag_id: 21 } },
    ]);
  });
});

describe("a Tag change", () => {
  it("shows on the Task before the server answers, and names one Task in its toast", async () => {
    mockServer();
    const queryClient = new QueryClient();
    queryClient.setQueryData<Task[]>(taskKeys.open(WORK_LIST), [URGENT]);
    const changes = renderChanges(queryClient);

    changes.current.addTag([URGENT], WORK_TAG);

    await vi.waitFor(() => {
      const [shown] = queryClient.getQueryData<Task[]>(taskKeys.open(WORK_LIST)) ?? [];
      expect(shown?.tags.map((tag) => tag.name)).toEqual(["work"]);
    });
    expect(await screen.findByText("Added “work” to “Tea”")).toBeInTheDocument();
  });
});

describe("Undo of a move", () => {
  it("puts each Task back in the place the server said it was, Section and order included", async () => {
    const places = [
      { id: 1, project_id: 7, parent_id: null, after_id: null, section_id: 4 },
      { id: 2, project_id: 7, parent_id: 1, after_id: 5, section_id: null },
    ];
    const sent = mockServer({ movedFrom: places });
    const changes = renderChanges();

    changes.current.moveTo([URGENT, LOW], WORK);

    expect((await undo(sent, "Moved 2 tasks to “Work”")).map((each) => each.body)).toEqual([
      { ids: [1, 2], action: { kind: "place", places } },
    ]);
  });
});

describe("Undo of a delete", () => {
  it("brings one Task back from Trash", async () => {
    const sent = mockServer();
    const changes = renderChanges();

    changes.current.remove([URGENT]);

    expect(await undo(sent, "Moved “Tea” to Trash")).toEqual([
      { method: "POST", path: "/api/v1/tasks/1/restore", body: null },
    ]);
    expect(sent[0]).toMatchObject({ method: "DELETE", path: "/api/v1/tasks/1" });
  });

  it("brings back each Task deleted on its own, not the Subtasks that went with a parent", async () => {
    const sent = mockServer();
    const changes = renderChanges();

    changes.current.remove([URGENT, LOW, FLIGHTS]);

    expect((await undo(sent, "Moved 3 tasks to Trash")).map((each) => each.path)).toEqual([
      "/api/v1/tasks/1/restore",
      "/api/v1/tasks/2/restore",
    ]);
  });

  it("says why when the Task can't come back", async () => {
    const sent = mockServer({ failRestore: true });
    const changes = renderChanges();

    changes.current.remove([URGENT]);
    await undo(sent, "Moved “Tea” to Trash");

    expect(await screen.findByText("The Project is gone.")).toBeInTheDocument();
  });
});
