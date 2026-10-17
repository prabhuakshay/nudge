import type { Task, TaskDetail } from "@/features/tasks/tasks";

/** An open, undated root Task in Project 7 as the API returns it, with the given fields changed. */
export function makeTask(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: 1,
    project_id: 7,
    parent_id: null,
    section_id: null,
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
    repeat_rule: "",
    repeat_from: "calendar",
    is_overdue: false,
    tags: [],
    created_at: "2026-10-15T09:00:00Z",
    updated_at: "2026-10-15T09:00:00Z",
    attachment_count: 0,
    comment_count: 0,
    ancestors: [],
    subtasks: [],
    reminders: [],
    ...overrides,
  };
}

/** A Task move as the client sends it to `POST /tasks/{id}/move`. */
export type MoveBody = {
  parent_id: number | null;
  after_id: number | null;
  section_id?: number | null;
};

/**
 * The rows a stand-in server lists after a move: the Task right after `after_id`, or first for
 * null, under its new parent and in the Section the move names. A Subtask is never Pinned.
 */
export function movedAsAsked(rows: Task[], id: number, body: MoveBody): Task[] {
  const row = rows.find((each) => each.id === id);
  if (!row) return rows;
  const rest = rows.filter((each) => each !== row);
  const at = body.after_id === null ? 0 : rest.findIndex((each) => each.id === body.after_id) + 1;
  const moved = {
    ...row,
    parent_id: body.parent_id,
    pinned_at: body.parent_id === null ? row.pinned_at : null,
    section_id: body.section_id === undefined ? row.section_id : body.section_id,
  };
  return rest.toSpliced(at, 0, moved);
}
