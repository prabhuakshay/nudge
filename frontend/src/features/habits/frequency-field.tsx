import { useId, type ReactNode } from "react";

import type { Frequency } from "./habits";

const KINDS: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "On chosen days" },
  { value: "times_per_week", label: "Times a week" },
];

/** ISO weekday numbers, as the server counts them: 1 is Monday. */
const WEEKDAYS = [
  { day: 1, short: "Mon", name: "Monday" },
  { day: 2, short: "Tue", name: "Tuesday" },
  { day: 3, short: "Wed", name: "Wednesday" },
  { day: 4, short: "Thu", name: "Thursday" },
  { day: 5, short: "Fri", name: "Friday" },
  { day: 6, short: "Sat", name: "Saturday" },
  { day: 7, short: "Sun", name: "Sunday" },
];

const TIMES = [1, 2, 3, 4, 5, 6];

const PILL =
  "flex h-10 cursor-pointer items-center justify-center rounded-md border border-border px-2 text-sm font-medium text-muted-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring hover:bg-surface-muted sm:h-8";

/** The Frequency the user is picking: its kind plus the days or times a week it needs. */
export type FrequencyChoice = {
  frequency: Frequency;
  weekdays: number[];
  timesPerWeek: number;
};

/** Pick a Habit's Frequency: every day, chosen weekdays, or a number of times a week. */
export function FrequencyField({
  value,
  onChange,
}: {
  value: FrequencyChoice;
  onChange: (value: FrequencyChoice) => void;
}) {
  const name = useId();
  function toggle(day: number) {
    const weekdays = value.weekdays.includes(day)
      ? value.weekdays.filter((chosen) => chosen !== day)
      : [...value.weekdays, day].sort((a, b) => a - b);
    onChange({ ...value, weekdays });
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Frequency</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {KINDS.map((kind) => (
            <Pill key={kind.value}>
              <input
                type="radio"
                name={`${name}-kind`}
                value={kind.value}
                checked={value.frequency === kind.value}
                onChange={() => {
                  onChange({ ...value, frequency: kind.value });
                }}
                className="peer sr-only"
              />
              <span className={PILL}>{kind.label}</span>
            </Pill>
          ))}
        </div>
      </fieldset>

      {value.frequency === "weekdays" && (
        <fieldset>
          <legend className="sr-only">Days</legend>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map(({ day, short, name: dayName }) => (
              <Pill key={day}>
                <input
                  type="checkbox"
                  checked={value.weekdays.includes(day)}
                  onChange={() => {
                    toggle(day);
                  }}
                  aria-label={dayName}
                  className="peer sr-only"
                />
                <span className={PILL} aria-hidden>
                  {short}
                </span>
              </Pill>
            ))}
          </div>
        </fieldset>
      )}

      {value.frequency === "times_per_week" && (
        <div role="radiogroup" aria-label="How many times a week" className="flex flex-col gap-1">
          <div className="grid grid-cols-6 gap-1">
            {TIMES.map((times) => (
              <Pill key={times}>
                <input
                  type="radio"
                  name={`${name}-times`}
                  value={times}
                  checked={value.timesPerWeek === times}
                  onChange={() => {
                    onChange({ ...value, timesPerWeek: times });
                  }}
                  className="peer sr-only"
                />
                <span className={PILL}>{times}</span>
              </Pill>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">times a week, on any days</span>
        </div>
      )}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <label className="relative min-w-0">{children}</label>;
}
