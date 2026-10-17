import { HUE } from "@/features/projects/project-style";
import type { PaletteColor } from "@/features/projects/projects";
import { cn } from "@/lib/utils";

import type { HabitIconKey } from "./habits";
import { HABIT_ICONS } from "./habit-style";

/** A Habit's icon on a soft disc of its colour. Decorative: the name always sits beside it. */
export function HabitIcon({
  habit,
  className,
}: {
  habit: { icon: HabitIconKey; color: PaletteColor };
  className?: string;
}) {
  const { icon: Icon } = HABIT_ICONS[habit.icon];
  const hue = HUE[habit.color];
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full",
        hue.soft,
        hue.text,
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
