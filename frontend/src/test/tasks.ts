import type { TaskDetail } from "@/features/tasks/tasks";

/** An open, undated root Task in Project 7 as the API returns it, with the given fields changed. */
export function makeTask(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: 1,
    project_id: 7,
    parent_id: null,
    position: "a0",
    depth: 0,
    parent_title: null,
    title: "Buy milk",
    description: "",
    status: "open",
    priority: 0,
    blocked_reason: "",
    completed_at: null,
    pinned_at: null,
    due_date: null,
    due_time: null,
    start_date: null,
    start_time: null,
    is_overdue: false,
    created_at: "2026-10-15T09:00:00Z",
    updated_at: "2026-10-15T09:00:00Z",
    attachment_count: 0,
    comment_count: 0,
    ancestors: [],
    subtasks: [],
    ...overrides,
  };
}
