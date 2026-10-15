const MORNING_ENDS = 12;
const AFTERNOON_ENDS = 18;

/** "Good morning", "Good afternoon" or "Good evening" for the given time. */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < MORNING_ENDS) return "Good morning";
  if (hour < AFTERNOON_ENDS) return "Good afternoon";
  return "Good evening";
}

/** The date as people say it, e.g. "Wednesday, 15 October", in the browser's locale. */
export function formatLongDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}
