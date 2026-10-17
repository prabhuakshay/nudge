import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { taskKeys } from "@/features/tasks/task-cache";
import type { Task } from "@/features/tasks/tasks";
import { json } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";

import { useCompleteFromReminder } from "./notifications";

const RENT = makeTask({ id: 1, title: "Rent" });
const WATER = makeTask({
  id: 2,
  title: "Water",
  due_date: "2026-10-17",
  repeat_rule: "FREQ=DAILY",
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Complete from a Reminder, the server answering with `task`, and return the Inbox list after. */
async function completed(task: Task) {
  // The refetch never answers, so the list shows only what the answer put in it.
  vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
    requestOf(input).method === "POST"
      ? json({ task, affected: [] })
      : new Promise(() => undefined),
  );
  const queryClient = new QueryClient();
  queryClient.setQueryData<Task[]>(taskKeys.open({ project: 7 }), [RENT, WATER]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useCompleteFromReminder(), { wrapper });

  act(() => {
    result.current.mutate(5);
  });

  await vi.waitFor(() => {
    expect(result.current.isSuccess).toBe(true);
  });
  return queryClient.getQueryData<Task[]>(taskKeys.open({ project: 7 })) ?? [];
}

describe("useCompleteFromReminder", () => {
  it("shows the Task completed once the server answers", async () => {
    const rows = await completed({ ...RENT, status: "completed" });

    expect(rows.map((task) => task.title)).toEqual(["Water"]);
  });

  it("shows a repeating Task on its next Occurrence once the server answers", async () => {
    const rows = await completed({ ...WATER, due_date: "2026-10-18" });

    expect(rows.map((task) => [task.title, task.due_date])).toEqual([
      ["Rent", null],
      ["Water", "2026-10-18"],
    ]);
  });
});
