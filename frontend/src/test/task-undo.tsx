import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { useUndoableTaskChanges } from "@/features/tasks/task-undo";

/* The Undoable Task changes rendered for a test, shared by the Undo module's test files. */

/** Render the Undoable changes over `queryClient`, with the toasts they show. */
export function renderChanges(queryClient = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
  return renderHook(() => useUndoableTaskChanges(), { wrapper }).result;
}
