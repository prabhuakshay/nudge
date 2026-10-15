/** Fixtures shared by the tasks feature's tests. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { validateTaskSearch } from "./open-task";
import { TaskList } from "./task-list";

/** The Inbox the tests' Tasks live in. */
export const INBOX = { id: 7, name: "Inbox", open_count: 3 };

/** A JSON response, as the mocked `fetch` returns it. */
export function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/**
 * Render the Inbox's TaskList at `url` in a router of its own, as a list route renders it.
 * Returns the router, to read the URL, and a user to drive the page.
 */
export function renderTaskList({ url = "/" } = {}) {
  const user = userEvent.setup();
  const rootRoute = createRootRoute({
    validateSearch: validateTaskSearch,
    component: () => (
      <TooltipProvider>
        <TaskList project={INBOX} />
        <Toaster />
      </TooltipProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { user, router };
}
