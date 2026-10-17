import { X } from "lucide-react";
import { useId, useState, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorField } from "@/features/projects/color-field";
import { DialogFooter, SidebarDialog } from "@/features/projects/project-dialog";
import { HUE } from "@/features/projects/project-style";
import type { PaletteColor } from "@/features/projects/projects";
import { todayIn } from "@/features/tasks/schedule";
import { cn } from "@/lib/utils";

import { FrequencyField, type FrequencyChoice } from "./frequency-field";
import { HABIT_ICONS } from "./habit-style";
import {
  MAX_GOAL,
  useCreateHabit,
  useUpdateHabit,
  type Habit,
  type HabitIconKey,
  type HabitSettings,
} from "./habits";

// `Object.keys` types keys as strings; these are exactly HABIT_ICONS' keys.
const ICON_KEYS = Object.keys(HABIT_ICONS) as HabitIconKey[];

const WORKING_WEEK = [1, 2, 3, 4, 5];

type HabitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The user's time zone, which decides the day a new Habit starts on. */
  timeZone: string;
  /** The Habit to edit; a new Habit is added when left out. */
  habit?: Habit;
};

/** Add a Habit or edit one: its name, Frequency, Goal, start date, Reminder, colour and icon. */
export function HabitDialog({ open, onOpenChange, timeZone, habit }: HabitDialogProps) {
  return (
    <SidebarDialog
      open={open}
      onOpenChange={onOpenChange}
      title={habit ? "Edit habit" : "New habit"}
    >
      {/* Keyed by `open` so each opening starts from the Habit's saved settings. */}
      <HabitForm
        key={String(open)}
        habit={habit}
        today={todayIn(timeZone)}
        onDone={() => {
          onOpenChange(false);
        }}
      />
    </SidebarDialog>
  );
}

type OwnFields = Pick<HabitSettings, "name" | "color" | "icon" | "start_date" | "reminder_time">;

/** The form's starting fields: the Habit's own, or a new Habit's starting today. */
function initialFields(habit: Habit | undefined, today: string): OwnFields {
  if (habit) {
    return {
      name: habit.name,
      color: habit.color,
      icon: habit.icon,
      start_date: habit.start_date,
      // The server sends seconds; the time field shows hours and minutes.
      reminder_time: habit.reminder_time?.slice(0, 5) ?? null,
    };
  }
  return { name: "", color: "green", icon: "circle-check", start_date: today, reminder_time: null };
}

/** The form's starting Frequency, with working days and three a week ready to pick. */
function initialFrequency(habit: Habit | undefined): FrequencyChoice {
  return {
    frequency: habit?.frequency ?? "daily",
    weekdays: habit?.weekdays.length ? habit.weekdays : WORKING_WEEK,
    timesPerWeek: habit?.times_per_week ?? 3,
  };
}

/** The Habit's settings as the server takes them, keeping only what its Frequency uses. */
function settingsOf(
  fields: OwnFields,
  { frequency, weekdays, timesPerWeek }: FrequencyChoice,
  goal: number,
): HabitSettings {
  return {
    ...fields,
    frequency,
    weekdays: frequency === "weekdays" ? weekdays : [],
    times_per_week: frequency === "times_per_week" ? timesPerWeek : null,
    goal,
  };
}

/** Why the settings can't be saved, or null when they can. */
function problemWith(settings: HabitSettings): string | null {
  if (!settings.name.trim()) return "Give the habit a name.";
  if (settings.frequency === "weekdays" && settings.weekdays.length === 0) {
    return "Choose at least one day.";
  }
  return null;
}

function HabitForm({ habit, today, onDone }: { habit?: Habit; today: string; onDone: () => void }) {
  const nameId = useId();
  const goalId = useId();
  const startId = useId();
  const reminderId = useId();
  const [fields, setFields] = useState(() => initialFields(habit, today));
  const [frequency, setFrequency] = useState(() => initialFrequency(habit));
  // A string, so the field can be cleared while typing; `required`, `min` and `max` check it.
  const [goal, setGoal] = useState(String(habit?.goal ?? 1));
  const [problem, setProblem] = useState<string | null>(null);
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const { name, color, icon } = fields;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const settings = settingsOf(fields, frequency, Number(goal));
    const found = problemWith(settings);
    setProblem(found);
    if (found) return;
    if (habit) {
      update.mutate({ id: habit.id, ...settings }, { onSuccess: onDone });
    } else {
      create.mutate(settings, { onSuccess: onDone });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            required
            maxLength={100}
            autoComplete="off"
            placeholder="Drink water"
            value={name}
            onChange={(event) => {
              setFields({ ...fields, name: event.target.value });
            }}
          />
        </div>

        <FrequencyField value={frequency} onChange={setFrequency} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={goalId}>Goal per day</Label>
          <div className="flex items-center gap-2">
            <Input
              id={goalId}
              type="number"
              required
              min={1}
              max={MAX_GOAL}
              inputMode="numeric"
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value);
              }}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">Check-ins make a day done</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={startId}>Start date</Label>
          <Input
            id={startId}
            type="date"
            required
            value={fields.start_date}
            onChange={(event) => {
              setFields({ ...fields, start_date: event.target.value });
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={reminderId}>Reminder</Label>
          <div className="flex items-center gap-2">
            <Input
              id={reminderId}
              type="time"
              value={fields.reminder_time ?? ""}
              onChange={(event) => {
                setFields({ ...fields, reminder_time: event.target.value || null });
              }}
              className="w-32"
            />
            {fields.reminder_time ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove reminder"
                onClick={() => {
                  setFields({ ...fields, reminder_time: null });
                }}
              >
                <X aria-hidden />
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">No reminder</span>
            )}
          </div>
        </div>

        <ColorField
          value={color}
          onChange={(picked: PaletteColor) => {
            setFields({ ...fields, color: picked });
          }}
        />

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Icon</legend>
          <div className="grid grid-cols-8 gap-1">
            {ICON_KEYS.map((key) => {
              const { icon: Icon, label } = HABIT_ICONS[key];
              return (
                <label key={key} className="relative">
                  <input
                    type="radio"
                    name="icon"
                    value={key}
                    checked={icon === key}
                    onChange={() => {
                      setFields({ ...fields, icon: key });
                    }}
                    aria-label={label}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "flex aspect-square cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-ring hover:bg-surface-muted",
                      icon === key && HUE[color].text,
                    )}
                  >
                    <Icon className="size-5 sm:size-4" aria-hidden />
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
      </div>

      <DialogFooter
        pending={create.isPending || update.isPending}
        label={habit ? "Save" : "Add habit"}
      />
    </form>
  );
}
