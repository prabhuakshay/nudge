import { format, parseISO } from "date-fns";

import type { components } from "@/api/schema";

/*
 * A Repeat is an RFC 5545 RRULE, which the server reads and follows. The client only builds the
 * presets the date picker offers and describes rules in the user's words.
 */

export type RepeatFrom = components["schemas"]["RepeatFrom"];

/** What a repeating Task's next date counts from, as the date picker names it. */
export const REPEAT_FROM: Record<RepeatFrom, string> = {
  calendar: "Calendar",
  due: "Due date",
  completion: "Completion date",
};

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_NAMES: Record<string, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};
const WORKWEEK = "MO,TU,WE,TH,FR";

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${String(day)}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th";
  return `${String(day)}${suffix}`;
}

function every(interval: number, unit: string, once: string): string {
  if (interval === 1) return once;
  if (interval === 2 && unit === "week") return "Every other week";
  return `Every ${String(interval)} ${unit}s`;
}

type Parts = Map<string, string>;

function weekly(parts: Parts, interval: number): string | null {
  const byDay = parts.get("BYDAY");
  if (byDay === WORKWEEK && interval === 1) return "Every weekday";
  const base = every(interval, "week", "Weekly");
  if (byDay === undefined) return base;
  const days = byDay.split(",").map((day) => DAY_NAMES[day]);
  return days.every((day) => day !== undefined) ? `${base} on ${days.join(", ")}` : null;
}

function monthly(parts: Parts, interval: number): string | null {
  const base = every(interval, "month", "Monthly");
  const byMonthDay = parts.get("BYMONTHDAY");
  if (parts.has("BYDAY")) return null;
  if (byMonthDay === undefined) return base;
  return `${base} on the ${byMonthDay === "-1" ? "last day" : ordinal(Number(byMonthDay))}`;
}

function yearly(parts: Parts): string {
  const month = parts.get("BYMONTH");
  const day = parts.get("BYMONTHDAY");
  if (month === undefined || day === undefined) return "Yearly";
  return `Yearly on ${format(new Date(2000, Number(month) - 1, Number(day)), "d MMM")}`;
}

/** Each frequency's pattern in words, or null when the rule uses parts the presets don't. */
const PATTERNS: Record<string, (parts: Parts, interval: number) => string | null> = {
  DAILY: (_parts, interval) => every(interval, "day", "Daily"),
  WEEKLY: weekly,
  MONTHLY: monthly,
  YEARLY: yearly,
};

/** A rule in the user's words, such as "Weekly on Thursday" or "Daily, 5 times". */
export function repeatLabel(rule: string): string {
  const parts = new Map(
    rule.split(";").map((part) => part.split("=", 2) as [string, string]), // Each part is NAME=VALUE.
  );
  const describe = PATTERNS[parts.get("FREQ") ?? ""];
  const base = describe?.(parts, Number(parts.get("INTERVAL") ?? "1")) ?? null;
  if (base === null) return "Custom repeat";
  const count = parts.get("COUNT");
  if (count !== undefined) return `${base}, ${count} times`;
  const until = parts.get("UNTIL");
  if (until !== undefined)
    return `${base}, until ${format(parseISO(until.slice(0, 8)), "d MMM yyyy")}`;
  return base;
}

/** The presets the date picker offers for a Task due on the date, as in TickTick. */
export function repeatOptions(dueDate: string): { rule: string; label: string }[] {
  const due = parseISO(dueDate);
  const weekday = WEEKDAYS[due.getDay()] ?? "MO";
  const rules = [
    "FREQ=DAILY",
    `FREQ=WEEKLY;BYDAY=${weekday}`,
    `FREQ=WEEKLY;BYDAY=${WORKWEEK}`,
    "FREQ=WEEKLY;INTERVAL=2",
    `FREQ=MONTHLY;BYMONTHDAY=${String(due.getDate())}`,
    "FREQ=MONTHLY;BYMONTHDAY=-1",
    `FREQ=YEARLY;BYMONTH=${String(due.getMonth() + 1)};BYMONTHDAY=${String(due.getDate())}`,
    "FREQ=DAILY;INTERVAL=3",
  ];
  return rules.map((rule) => ({ rule, label: repeatLabel(rule) }));
}
