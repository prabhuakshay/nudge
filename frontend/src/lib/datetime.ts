/** Locale-aware date formatting for display. */

/** The date as people say it, e.g. "Wednesday, 15 October", in the browser's locale. */
export function formatLongDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}
