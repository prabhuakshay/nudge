import type { Task, TaskDetail } from "./tasks";

/** The Project the Task tests' Tasks live in, as the sidebar returns it. */
export const INBOX_ID = 7;

/** A root Task row for tests, open and with no Priority unless overridden. */
export function taskRow(overrides: Partial<Task>): Task {
  return {
    id: 1,
    project_id: INBOX_ID,
    parent_id: null,
    position: "a0",
    depth: 0,
    parent_title: null,
    title: "Buy milk",
    status: "open",
    priority: 0,
    blocked_reason: "",
    completed_at: null,
    created_at: "2026-10-15T09:00:00Z",
    updated_at: "2026-10-15T09:00:00Z",
    ...overrides,
  };
}

/** A Task as the drawer reads it for tests, with no Description, ancestors or Subtasks. */
export function taskDetail(overrides: Partial<TaskDetail>): TaskDetail {
  return { ...taskRow({}), description: "", ancestors: [], subtasks: [], ...overrides };
}

/** A JSON response from the stand-in server. */
export function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
