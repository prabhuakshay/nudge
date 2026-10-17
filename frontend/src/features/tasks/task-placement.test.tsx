import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { json } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";

import { taskKeys } from "./task-cache";
import { useDuplicateTask } from "./task-placement";
import type { Task } from "./tasks";

const TEA = makeTask({ id: 1, title: "Tea" });
const CAKE = makeTask({ id: 2, title: "Cake" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDuplicateTask", () => {
  it("shows the copy right after the original once the server answers, before any refetch", async () => {
    const copy = makeTask({ id: 10, title: "Tea" });
    // The refetch never answers, so the list shows only what the answer put in it.
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      requestOf(input).method === "POST" ? json(copy, 201) : new Promise(() => undefined),
    );
    const queryClient = new QueryClient();
    queryClient.setQueryData<Task[]>(taskKeys.open({ project: 7 }), [TEA, CAKE]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDuplicateTask(), { wrapper });

    act(() => {
      result.current.mutate(TEA.id);
    });

    await vi.waitFor(() => {
      const rows = queryClient.getQueryData<Task[]>(taskKeys.open({ project: 7 }));
      expect(rows?.map((task) => task.id)).toEqual([TEA.id, copy.id, CAKE.id]);
    });
  });
});
