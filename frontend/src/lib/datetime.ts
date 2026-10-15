/** Locale-aware date and time formatting for display. */

/** The date as people say it, e.g. "Wednesday, 15 October", in the browser's locale. */
export function formatLongDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

/** Hours and minutes in the locale's clock style, e.g. "14:05" or "2:05 PM". */
export function formatTime(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
}
