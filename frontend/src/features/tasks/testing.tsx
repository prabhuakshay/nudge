/** Fixtures shared by the tasks feature's tests. */
import type { TaskDetail } from "./tasks";

/** The Inbox the tests' Tasks live in. */
export const INBOX = { id: 7, name: "Inbox", open_count: 3 };

/** A Task as the server returns it, open and in the Inbox unless `overrides` say otherwise. */
export function task(overrides: Partial<TaskDetail>): TaskDetail {
  return {
    id: 1,
    project_id: INBOX.id,
    title: "Buy milk",
    description: "",
    status: "open",
    priority: 0,
    blocked_reason: "",
    completed_at: null,
    pinned_at: null,
    created_at: "2026-10-15T09:00:00Z",
    updated_at: "2026-10-15T09:00:00Z",
    ...overrides,
  };
}

/** A JSON response, as the mocked `fetch` returns it. */
export function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
