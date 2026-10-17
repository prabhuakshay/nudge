import type { components } from "@/api/schema";
import type { Tag } from "@/features/tags/tags";
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

/** A `POST /tasks/bulk` body. */
export type BulkBody = components["schemas"]["TaskBulkIn"];

type BulkAction = BulkBody["action"];

/** A Task's Tags after a bulk add or remove, adding from `tags`. */
function tagsAfter(
  task: TaskDetail,
  { kind, tag_id: tagId }: { kind: string; tag_id: number },
  tags: Tag[],
) {
  const others = task.tags.filter((each) => each.id !== tagId);
  return kind === "add_tag" ? [...others, ...tags.filter((each) => each.id === tagId)] : others;
}

/**
 * What a bulk action does to one Task, as the stand-in server makes it. The tests that send the
 * other actions check the request, not what the server does with it.
 */
function changed(task: TaskDetail, action: BulkAction, tags: Tag[]): Partial<TaskDetail> {
  if (action.kind === "add_tag" || action.kind === "remove_tag") {
    return { tags: tagsAfter(task, action, tags) };
  }
  if (action.kind === "priority") return { priority: action.priority };
  if (action.kind === "move") return { project_id: action.project_id };
  if (action.kind !== "statuses") return {};
  const own = action.statuses.find((status) => status.id === task.id);
  return own ? { status: own.status, blocked_reason: own.blocked_reason } : {};
}

/**
 * A bulk change as a stand-in server makes it to its Tasks: Priority, Tags (looked up in `tags`),
 * a move to a Project, or each Task's own Status. Answers with where each moved Task was.
 */
export function bulkApplied(tasks: TaskDetail[], { ids, action }: BulkBody, tags: Tag[] = []) {
  const chosen = tasks.filter((each) => ids.includes(each.id));
  const movedFrom = chosen.map(({ id, project_id, parent_id, section_id }) => ({
    id,
    project_id,
    parent_id,
    after_id: null,
    section_id,
  }));
  for (const each of chosen) Object.assign(each, changed(each, action, tags));
  return { affected: [], moved_from: action.kind === "move" ? movedFrom : [] };
}
