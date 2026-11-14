import { plainMentions } from "@/features/people/mentions";

import { describeDates, longDate } from "./due";
import { remindersLabel } from "./reminders";
import { REPEAT_FROM, repeatLabel } from "./repeat";
import { PRIORITY, STATUS_VERB } from "./task-properties";
import type { DatesChange, RemindersChange, RepeatChange, TaskActivity } from "./tasks";

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
  countdown_marked: () => "Marked as a countdown",
  countdown_unmarked: () => "Unmarked as a countdown",
  attachment_added: (data) => `Attached “${data.name}”`,
  attachment_removed: (data) => `Deleted the attachment “${data.name}”`,
  dates_changed: (data) => describeDatesChange(data),
  reminders_changed: (data) => describeRemindersChange(data),
  moved: (data) => describeMove(data),
  tag_added: (data) => `Added the tag #${data.name}`,
  tag_removed: (data) => `Removed the tag #${data.name}`,
  tags_merged: (data) => `Merged the tag #${data.from_tag} into #${data.into_tag}`,
  person_merged: (data) => `Merged @${data.from_person} into @${data.to_person}`,
  repeat_changed: (data) => describeRepeatChange(data),
  repeat_removed: (data) =>
    `Stopped repeating ${repeatLabel(data.rule)}, as only dated top-level tasks repeat`,
  repeat_advanced: (data) =>
    `${data.action === "completed" ? "Completed" : "Skipped"} ${longDate(data.occurrence)}; next on ${longDate(data.next)}`,
  trashed: () => "Moved to Trash",
  restored: () => "Restored from Trash",
};

/** What an Activity event says happened, in a sentence: "Changed priority from P3 to P1". */
export function describeActivity<K extends TaskActivity["kind"]>(event: {
  kind: K;
  data: ActivityData[K];
}): string {
  return DESCRIBE[event.kind](event.data);
}

function describeMove(move: ActivityData["moved"]): string {
  const under = move.to_parent ? `under “${move.to_parent}”` : null;
  if (move.from_project !== move.to_project) {
    const between = `Moved from “${move.from_project}” to “${move.to_project}”`;
    return under ? `${between}, ${under}` : between;
  }
  if (under) return `Moved ${under}`;
  // Same Project and same top level: only the Section changed.
  if (!move.from_parent) {
    return move.to_section ? `Moved to the section “${move.to_section}”` : "Moved to No section";
  }
  return "Moved to the top level";
}

function describeDatesChange({ old, new: next }: DatesChange): string {
  if (old === null)
    return next === null ? "Removed the date" : `Set the date to ${describeDates(next)}`;
  if (next === null) return `Removed the date (was ${describeDates(old)})`;
  return `Changed the date from ${describeDates(old)} to ${describeDates(next)}`;
}

function describeRepeatChange({ old, new: next }: RepeatChange): string {
  const full = (repeat: NonNullable<RepeatChange["old"]>) =>
    `${repeatLabel(repeat.rule)} (${REPEAT_FROM[repeat.repeat_from]})`;
  if (old === null)
    return next === null ? "Stopped repeating" : `Set to repeat ${repeatLabel(next.rule)}`;
  if (next === null) return `Stopped repeating (was ${repeatLabel(old.rule)})`;
  return `Changed repeat from ${full(old)} to ${full(next)}`;
}

function describeRemindersChange({ old, new: next, all_day: allDay }: RemindersChange): string {
  if (old.length === 0) return `Set reminders: ${remindersLabel(next, allDay)}`;
  if (next.length === 0) return `Removed reminders (was ${remindersLabel(old, allDay)})`;
  return `Changed reminders from ${remindersLabel(old, allDay)} to ${remindersLabel(next, allDay)}`;
}
