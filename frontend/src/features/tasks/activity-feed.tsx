import { useInfiniteQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { plainMentions } from "@/features/people/mentions";

import { activityTime, exactTime } from "./activity-time";
import { describeDates } from "./due";
import { PRIORITY, STATUS_VERB } from "./task-properties";
import { taskActivityQuery, type DatesChange, type TaskActivity } from "./tasks";

type ActivityData = { [E in TaskActivity as E["kind"]]: E["data"] };

/** What each kind of event says happened, in the user's words rather than the API's. */
const DESCRIBE: { [K in keyof ActivityData]: (data: ActivityData[K]) => string } = {
  created: () => "Created this task",
  title_changed: (data) =>
    `Renamed from “${plainMentions(data.old)}” to “${plainMentions(data.new)}”`,
  description_edited: () => "Edited the description",
  status_changed: ({ new: status, blocked_reason: reason }) =>
    reason ? `${STATUS_VERB[status]}: “${plainMentions(reason)}”` : STATUS_VERB[status],
  priority_changed: (data) =>
    `Changed priority from ${PRIORITY[data.old].short} to ${PRIORITY[data.new].short}`,
  attachment_added: (data) => `Attached “${data.name}”`,
  attachment_removed: (data) => `Deleted the attachment “${data.name}”`,
  dates_changed: (data) => describeDatesChange(data),
  moved: (data) => `Moved from “${data.from_project}” to “${data.to_project}”`,
  person_merged: (data) => `Merged @${data.from_person} into @${data.to_person}`,
};

function describe<K extends keyof ActivityData>(event: { kind: K; data: ActivityData[K] }) {
  return DESCRIBE[event.kind](event.data);
}

function describeDatesChange({ old, new: next }: DatesChange): string {
  if (old === null)
    return next === null ? "Removed the date" : `Set the date to ${describeDates(next)}`;
  if (next === null) return `Removed the date (was ${describeDates(old)})`;
  return `Changed the date from ${describeDates(old)} to ${describeDates(next)}`;
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
