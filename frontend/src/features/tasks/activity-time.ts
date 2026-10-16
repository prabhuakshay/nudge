import { differenceInCalendarDays, format, formatDistanceStrict } from "date-fns";

const MINUTE = 60_000;

/** When an Activity event happened, like TickTick: "5 minutes ago", "Yesterday, 14:00", "1 Oct, 09:30". */
export function activityTime(at: Date, now: Date): string {
  const days = differenceInCalendarDays(now, at);
  if (days === 0) {
    return now.getTime() - at.getTime() < MINUTE
      ? "Just now"
      : `${formatDistanceStrict(at, now)} ago`;
  }
  if (days === 1) return `Yesterday, ${format(at, "HH:mm")}`;
  if (days < 7) return format(at, "EEEE, HH:mm");
  return format(at, "d MMM, HH:mm");
}

/** The full date and time, for a tooltip over the relative one. */
export function exactTime(at: Date): string {
  return format(at, "EEEE d MMMM yyyy, HH:mm");
}
