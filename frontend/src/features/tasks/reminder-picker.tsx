import { Check, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { Dates } from "./due";
import {
  describeFireTime,
  fireTime,
  isAllDay,
  MAX_OFFSET_DAYS,
  MAX_REMINDERS,
  PRESETS,
  reminderLabel,
  remindersLabel,
} from "./reminders";

/** Native fields, so phones show their own pickers. 16 px stops iOS zooming into them. */
const FIELD =
  "h-9 rounded-md border border-border bg-surface px-2 text-base text-foreground focus-visible:border-primary focus-visible:outline-none sm:h-8 sm:text-sm";

const UNITS = { minutes: 1, hours: 60, days: 24 * 60, weeks: 7 * 24 * 60 };
type Unit = keyof typeof UNITS;

type PickerProps = {
  dates: Dates;
  disabled: boolean;
  reminders: number[];
  onChange: (reminders: number[]) => void;
};

/**
 * A Task's Reminders as in TickTick: toggle presets, or add a Custom offset with a preview of
 * when it fires. Waits for a due date, since Reminders count from it, and for `disabled` to clear,
 * which the date picker sets until it has loaded the Reminders.
 */
export function ReminderPicker({ dates, disabled, reminders, onChange }: PickerProps) {
  const [custom, setCustom] = useState(false);
  const allDay = isAllDay(dates);
  const label = remindersLabel(reminders, allDay);
  const add = (offset: number) => {
    onChange([...reminders, offset]);
  };

  return (
    <Popover
      onOpenChange={() => {
        setCustom(false);
      }}
    >
      <PopoverTrigger asChild disabled={disabled || dates.due_date === null}>
        <button
          type="button"
          aria-label={`Reminders: ${label}`}
          className="flex h-9 w-40 items-center justify-between gap-1 rounded-md border border-border bg-surface px-2.5 text-sm disabled:opacity-50 sm:h-8"
        >
          <span className="truncate">{label}</span>
          <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Reminders" className="w-60 p-1">
        {custom ? (
          <CustomReminder
            dates={dates}
            reminders={reminders}
            onAdd={(offset) => {
              add(offset);
              setCustom(false);
            }}
            onCancel={() => {
              setCustom(false);
            }}
          />
        ) : (
          <ReminderOptions
            allDay={allDay}
            reminders={reminders}
            onChange={onChange}
            onCustom={() => {
              setCustom(true);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The presets, and any Custom offsets already set, each toggled with one tap. */
function ReminderOptions({
  allDay,
  reminders,
  onChange,
  onCustom,
}: {
  allDay: boolean;
  reminders: number[];
  onChange: (reminders: number[]) => void;
  onCustom: () => void;
}) {
  const presets = allDay ? PRESETS.allDay : PRESETS.timed;
  const options = [...new Set([...presets, ...reminders])];
  const full = reminders.length >= MAX_REMINDERS;
  return (
    <>
      {options.map((offset) => {
        const on = reminders.includes(offset);
        return (
          <button
            key={offset}
            type="button"
            aria-pressed={on}
            disabled={!on && full}
            onClick={() => {
              onChange(on ? reminders.filter((item) => item !== offset) : [...reminders, offset]);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-muted disabled:opacity-50"
          >
            <Check className={cn("size-4 text-primary", !on && "invisible")} aria-hidden />
            {reminderLabel(offset, allDay)}
          </button>
        );
      })}
      <Separator className="my-1" />
      <button
        type="button"
        disabled={full}
        onClick={onCustom}
        className="w-full rounded px-2 py-1.5 text-left text-sm text-primary hover:bg-surface-muted disabled:opacity-50"
      >
        {full ? `Up to ${String(MAX_REMINDERS)} reminders` : "Custom…"}
      </button>
    </>
  );
}

/** Why a Custom offset can't be added, or null when it can. */
function refusal(offset: number | null, reminders: number[]): string | null {
  if (offset === null) return "Enter a whole number.";
  if (Math.abs(offset) > MAX_OFFSET_DAYS * UNITS.days) {
    return `Keep it within ${String(MAX_OFFSET_DAYS)} days.`;
  }
  if (reminders.includes(offset)) return "That reminder is already set.";
  return null;
}

function wholeNumber(text: string): number | null {
  return /^\d+$/.test(text) ? Number(text) : null;
}

/**
 * A Custom offset: an amount of time before or after a timed Task, or a number of days before
 * an all-day one at a clock time. Shows when it would fire before it is added.
 */
function CustomReminder({
  dates,
  reminders,
  onAdd,
  onCancel,
}: {
  dates: Dates;
  reminders: number[];
  onAdd: (offset: number) => void;
  onCancel: () => void;
}) {
  const allDay = isAllDay(dates);
  const [amount, setAmount] = useState(allDay ? "1" : "15");
  const [unit, setUnit] = useState<Unit>("minutes");
  const [direction, setDirection] = useState<-1 | 1>(-1);
  const [time, setTime] = useState("09:00");
  const offset = customOffset({ allDay, amount, unit, direction, time });
  const problem = refusal(offset, reminders);
  const fire = offset === null ? null : fireTime(dates, offset);

  return (
    <form
      className="space-y-2 p-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (offset !== null && problem === null) onAdd(offset);
      }}
    >
      <div className="flex flex-wrap items-center gap-1">
        <input
          aria-label={allDay ? "Days before" : "Amount"}
          inputMode="numeric"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
          }}
          className={cn(FIELD, "w-14")}
        />
        {allDay ? (
          <AllDayFields time={time} onTime={setTime} />
        ) : (
          <TimedFields
            unit={unit}
            direction={direction}
            onUnit={setUnit}
            onDirection={setDirection}
          />
        )}
      </div>
      <p className="text-[12px] text-muted-foreground" aria-live="polite">
        {problem ?? (fire && `Fires ${describeFireTime(fire)}`)}
      </p>
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" disabled={problem !== null}>
          Add
        </Button>
      </div>
    </form>
  );
}

function customOffset(fields: {
  allDay: boolean;
  amount: string;
  unit: Unit;
  direction: -1 | 1;
  time: string;
}): number | null {
  const amount = wholeNumber(fields.amount);
  if (amount === null) return null;
  if (!fields.allDay) return fields.direction * amount * UNITS[fields.unit];
  const [hours = 0, minutes = 0] = fields.time.split(":").map(Number);
  return -amount * UNITS.days + hours * 60 + minutes;
}

function TimedFields({
  unit,
  direction,
  onUnit,
  onDirection,
}: {
  unit: Unit;
  direction: -1 | 1;
  onUnit: (unit: Unit) => void;
  onDirection: (direction: -1 | 1) => void;
}) {
  return (
    <>
      <select
        aria-label="Unit"
        value={unit}
        onChange={(event) => {
          onUnit(event.target.value as Unit); // The options are exactly the units.
        }}
        className={FIELD}
      >
        {Object.keys(UNITS).map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <select
        aria-label="Before or after"
        value={direction}
        onChange={(event) => {
          onDirection(event.target.value === "1" ? 1 : -1);
        }}
        className={FIELD}
      >
        <option value={-1}>before</option>
        <option value={1}>after</option>
      </select>
    </>
  );
}

function AllDayFields({ time, onTime }: { time: string; onTime: (time: string) => void }) {
  return (
    <>
      <span className="text-sm">days before, at</span>
      <input
        type="time"
        aria-label="Time"
        value={time}
        required
        onChange={(event) => {
          onTime(event.target.value);
        }}
        className={cn(FIELD, "w-24")}
      />
    </>
  );
}
