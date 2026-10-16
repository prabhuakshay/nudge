import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import type { Dates } from "@/features/tasks/due";
import { startsOn } from "@/features/tasks/schedule";

/*
 * Pure layout for the Calendar: which days a grid shows and which Tasks fall on each. Days are ISO
 * dates ("2026-10-15") on the user's clock, as the API sends them, so no time zone comes in here.
 */

/** Weeks start on Monday, as in the date picker. */
const WEEK_STARTS_ON = 1;

function iso(day: Date): string {
  return format(day, "yyyy-MM-dd");
}

/** The month around a date as whole weeks from Monday: four to six rows of seven days. */
export function monthWeeks(date: string): string[][] {
  const day = parseISO(date);
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(day), { weekStartsOn: WEEK_STARTS_ON }),
    end: endOfWeek(endOfMonth(day), { weekStartsOn: WEEK_STARTS_ON }),
  }).map(iso);
  const weeks: string[][] = [];
  for (let start = 0; start < days.length; start += 7) {
    weeks.push(days.slice(start, start + 7));
  }
  return weeks;
}

/** The seven days of a date's week, Monday first. */
export function weekDays(date: string): string[] {
  const start = startOfWeek(parseISO(date), { weekStartsOn: WEEK_STARTS_ON });
  return eachDayOfInterval({ start, end: addDays(start, 6) }).map(iso);
}

/** The date the given number of months away, on the same day or the month's last if it's shorter. */
export function shiftMonths(date: string, months: number): string {
  return iso(addMonths(parseISO(date), months));
}

/** The date the given number of days away. */
export function shiftDays(date: string, days: number): string {
  return iso(addDays(parseISO(date), days));
}

/** Whether a Task's dates cover a day: its due date, or every day of its range. */
export function coversDay(dates: Dates, day: string): boolean {
  const from = startsOn(dates);
  if (from === null || dates.due_date === null) return false;
  return from <= day && day <= dates.due_date;
}

/** The Tasks whose dates cover a day, in the order given. */
export function tasksOn<T extends Dates>(tasks: readonly T[], day: string): T[] {
  return tasks.filter((task) => coversDay(task, day));
}

/** A row of Week and Day mode's grid: the all-day strip or an hour of the day, 0 to 23. */
export type Row = "all-day" | number;

/** The minutes in a day, which is the height of a Week or Day column. */
export const DAY_MINUTES = 24 * 60;

/** How tall a block is drawn for a Task with a due time but no start: display only. */
const DEFAULT_BLOCK_MINUTES = 30;

/** The minutes from midnight a block covers on its day, `end` excluded. */
export type TimeSpan = { start: number; end: number };

/** The minutes from midnight of an "HH:MM[:SS]" time. */
export function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** A fraction as a CSS percentage, for placing blocks inside their hour slot. */
export function percent(fraction: number): string {
  return `${String(fraction * 100)}%`;
}

/** The "HH:MM" a number of minutes after midnight reads as. */
export function clockTime(minutes: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * Where a Task's block sits on its day: from its start time, or its due time when it has no start,
 * to its due time, or 30 minutes on. Null when it belongs in the all-day strip instead: it has no
 * time, or its range covers more than one day.
 */
export function timeSpan(dates: Dates): TimeSpan | null {
  const { due_date, due_time, start_date, start_time } = dates;
  if (due_date === null || due_time === null) return null;
  if (start_date !== null && start_date !== due_date) return null;
  const start = minutesOf(start_time ?? due_time);
  const end = start_time === null ? start : minutesOf(due_time);
  return { start, end: Math.min(end > start ? end : start + DEFAULT_BLOCK_MINUTES, DAY_MINUTES) };
}

/** The Tasks a day's all-day strip shows: those without a time and ranges over several days. */
export function allDayTasks<T extends Dates>(tasks: readonly T[], day: string): T[] {
  return tasksOn(tasks, day).filter((task) => timeSpan(task) === null);
}

/**
 * A timed Task placed in a Week or Day column: its span, and which of `columns` equal side-by-side
 * columns it takes, so overlapping blocks share the width instead of hiding one another.
 */
export type Block<T> = { task: T; span: TimeSpan; column: number; columns: number };

/**
 * A day's timed Tasks as blocks, earliest first. Blocks that overlap, directly or through a chain
 * of others, form a group that splits the width into as many columns as it needs at its busiest;
 * each block takes the leftmost column free when it starts.
 */
export function dayBlocks<T extends Dates>(tasks: readonly T[], day: string): Block<T>[] {
  const blocks = tasksOn(tasks, day)
    .flatMap((task) => {
      const span = timeSpan(task);
      return span === null ? [] : [{ task, span, column: 0, columns: 1 }];
    })
    // Longer blocks first among those starting together, so they take the left columns.
    .sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);

  let group: Block<T>[] = [];
  let columnEnds: number[] = [];
  const closeGroup = () => {
    for (const block of group) block.columns = columnEnds.length;
    group = [];
    columnEnds = [];
  };
  for (const block of blocks) {
    if (columnEnds.every((end) => end <= block.span.start)) closeGroup();
    const free = columnEnds.findIndex((end) => end <= block.span.start);
    block.column = free === -1 ? columnEnds.length : free;
    columnEnds[block.column] = block.span.end;
    group.push(block);
  }
  closeGroup();
  return blocks;
}
