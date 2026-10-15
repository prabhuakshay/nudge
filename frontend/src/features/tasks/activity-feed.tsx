import { useInfiniteQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { activityTime, exactTime } from "./activity-time";
import { PRIORITY, STATUS_VERB } from "./task-properties";
import { taskActivityQuery, type TaskActivity } from "./tasks";

type StatusChange = Extract<TaskActivity, { kind: "status_changed" }>["data"];

/** A Status change, naming the relative whose change caused it, or the Subtasks it closed too. */
function describeStatus(change: StatusChange): string {
  const verb = STATUS_VERB[change.new];
  const closedSubtasks = change.closed_subtasks;
  if (change.via_parent) return `${verb} via parent “${change.via_parent}”`;
  if (change.via_subtask) return `${verb} via Subtask “${change.via_subtask}”`;
  if (closedSubtasks > 0) {
    return `${verb} with ${String(closedSubtasks)} ${closedSubtasks === 1 ? "Subtask" : "Subtasks"}`;
  }
  return change.blocked_reason ? `${verb}: “${change.blocked_reason}”` : verb;
}

/** What an event says happened, in the user's words rather than the API's. */
function describe(event: TaskActivity): string {
  switch (event.kind) {
    case "created":
      return "Created this task";
    case "title_changed":
      return `Renamed from “${event.data.old}” to “${event.data.new}”`;
    case "description_edited":
      return "Edited the description";
    case "status_changed":
      return describeStatus(event.data);
    case "priority_changed":
      return `Changed priority from ${PRIORITY[event.data.old].short} to ${PRIORITY[event.data.new].short}`;
  }
}

/** A Task's history as a timeline, newest first, with older events a click away. */
export function ActivityFeed({ taskId }: { taskId: number }) {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery(
    taskActivityQuery(taskId),
  );
  const events = data?.pages.flatMap((page) => page.items) ?? [];
  const now = new Date();

  return (
    <>
      <ol className="relative ml-2 border-l border-border">
        {events.map((event) => {
          const at = new Date(event.at);
          return (
            <li key={event.id} className="relative pb-3 pl-4 last:pb-0">
              <span
                className="absolute top-1.5 -left-[4.5px] size-2 rounded-full border-2 border-surface bg-muted-foreground/60"
                aria-hidden
              />
              <p className="text-[13px]">{describe(event)}</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <time dateTime={event.at} className="text-[11px] text-muted-foreground">
                    {activityTime(at, now)}
                  </time>
                </TooltipTrigger>
                <TooltipContent>{exactTime(at)}</TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ol>
      {hasNextPage && (
        <Button
          variant="ghost"
          className="mt-3"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          Show older activity
        </Button>
      )}
    </>
  );
}
