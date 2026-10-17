import { useId, useState, type SubmitEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorField } from "@/features/projects/color-field";
import { DialogFooter, SidebarDialog } from "@/features/projects/project-dialog";
import { HUE } from "@/features/projects/project-style";
import type { PaletteColor } from "@/features/projects/projects";
import { cn } from "@/lib/utils";

import { HABIT_ICONS } from "./habit-style";
import { useCreateHabit, type HabitIconKey } from "./habits";

// `Object.keys` types keys as strings; these are exactly HABIT_ICONS' keys.
const ICON_KEYS = Object.keys(HABIT_ICONS) as HabitIconKey[];

/** Add a Habit: its name, colour and icon. It's done every day, starting today. */
export function HabitDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <SidebarDialog open={open} onOpenChange={onOpenChange} title="New habit">
      {/* Keyed by `open` so each opening starts from an empty form. */}
      <HabitForm
        key={String(open)}
        onDone={() => {
          onOpenChange(false);
        }}
      />
    </SidebarDialog>
  );
}

function HabitForm({ onDone }: { onDone: () => void }) {
  const nameId = useId();
  const frequencyId = useId();
  const [name, setName] = useState("");
  const [color, setColor] = useState<PaletteColor>("green");
  const [icon, setIcon] = useState<HabitIconKey>("circle-check");
  const create = useCreateHabit();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate({ name, color, icon }, { onSuccess: onDone });
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
              setName(event.target.value);
            }}
          />
        </div>

        <div role="group" aria-labelledby={frequencyId} className="flex flex-col gap-1.5">
          <span id={frequencyId} className="text-sm font-semibold">
            Frequency
          </span>
          <span className="text-sm text-muted-foreground">Every day</span>
        </div>

        <ColorField value={color} onChange={setColor} />

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
                      setIcon(key);
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
      </div>

      <DialogFooter pending={create.isPending} label="Add habit" />
    </form>
  );
}
