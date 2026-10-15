import { useInfiniteQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { plainMentions } from "@/features/people/mentions";

import { activityTime, exactTime } from "./activity-time";
import { describeDates } from "./due";
import { remindersLabel } from "./reminders";
import { PRIORITY, STATUS_VERB } from "./task-properties";
import {
  taskActivityQuery,
  type DatesChange,
  type RemindersChange,
  type TaskActivity,
} from "./tasks";

type ActivityData = { [E in TaskActivity as E["kind"]]: E["data"] };

/** A Status change, naming the relative whose change caused it, or the Subtasks it closed too. */
function describeStatus(change: ActivityData["status_changed"]): string {
  const verb = STATUS_VERB[change.new];
  const closedSubtasks = change.closed_subtasks;
  if (change.via_parent) return `${verb} via parent “${plainMentions(change.via_parent)}”`;
  if (change.via_subtask) return `${verb} via Subtask “${plainMentions(change.via_subtask)}”`;
  if (closedSubtasks > 0) {
    return `${verb} with ${String(closedSubtasks)} ${closedSubtasks === 1 ? "Subtask" : "Subtasks"}`;
  }
  return change.blocked_reason ? `${verb}: “${plainMentions(change.blocked_reason)}”` : verb;
}

/** What each kind of event says happened, in the user's words rather than the API's. */
const DESCRIBE: { [K in keyof ActivityData]: (data: ActivityData[K]) => string } = {
  created: () => "Created this task",
  title_changed: (data) =>
    `Renamed from “${plainMentions(data.old)}” to “${plainMentions(data.new)}”`,
  description_edited: () => "Edited the description",
  status_changed: (data) => describeStatus(data),
  priority_changed: (data) =>
    `Changed priority from ${PRIORITY[data.old].short} to ${PRIORITY[data.new].short}`,
  pinned: () => "Pinned to the top",
  unpinned: () => "Unpinned",
  attachment_added: (data) => `Attached “${data.name}”`,
  attachment_removed: (data) => `Deleted the attachment “${data.name}”`,
  dates_changed: (data) => describeDatesChange(data),
  reminders_changed: (data) => describeRemindersChange(data),
  moved: (data) => describeMove(data),
  tag_added: (data) => `Added the tag #${data.name}`,
  tag_removed: (data) => `Removed the tag #${data.name}`,
  tags_merged: (data) => `Merged the tag #${data.from_tag} into #${data.into_tag}`,
  person_merged: (data) => `Merged @${data.from_person} into @${data.to_person}`,
  trashed: () => "Moved to Trash",
  restored: () => "Restored from Trash",
};

function describe<K extends keyof ActivityData>(event: { kind: K; data: ActivityData[K] }) {
  return DESCRIBE[event.kind](event.data);
}

function describeMove(move: ActivityData["moved"]): string {
  const under = move.to_parent ? `under “${move.to_parent}”` : null;
  if (move.from_project !== move.to_project) {
    const between = `Moved from “${move.from_project}” to “${move.to_project}”`;
    return under ? `${between}, ${under}` : between;
  }
  return under ? `Moved ${under}` : "Moved to the top level";
}

function describeDatesChange({ old, new: next }: DatesChange): string {
  if (old === null)
    return next === null ? "Removed the date" : `Set the date to ${describeDates(next)}`;
  if (next === null) return `Removed the date (was ${describeDates(old)})`;
  return `Changed the date from ${describeDates(old)} to ${describeDates(next)}`;
}

function describeRemindersChange({ old, new: next, all_day: allDay }: RemindersChange): string {
  if (old.length === 0) return `Set reminders: ${remindersLabel(next, allDay)}`;
  if (next.length === 0) return `Removed reminders (was ${remindersLabel(old, allDay)})`;
  return `Changed reminders from ${remindersLabel(old, allDay)} to ${remindersLabel(next, allDay)}`;
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
