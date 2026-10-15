const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
const calendarDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** How long ago something happened, as a notification list shows it: "5 min. ago", "Mar 3". */
export function timeAgo(date: Date, now: Date): string {
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) {
    return "Just now";
  }
  if (elapsed < HOUR) {
    return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  }
  if (elapsed < DAY) {
    return relative.format(-Math.floor(elapsed / HOUR), "hour");
  }
  if (elapsed < WEEK) {
    return relative.format(-Math.floor(elapsed / DAY), "day");
  }
  return calendarDate.format(date);
}
