import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import type { ComponentProps } from "react";
import { DayPicker, type ChevronProps } from "react-day-picker";

import { cn } from "@/lib/utils";

function CalendarChevron({ orientation, className }: ChevronProps) {
  const Icon =
    orientation === "left"
      ? ChevronLeft
      : orientation === "right"
        ? ChevronRight
        : orientation === "up"
          ? ChevronUp
          : ChevronDown;
  return <Icon className={cn("size-4", className)} aria-hidden />;
}

/** A month grid date picker. Weeks start on Monday; today is marked in the brand colour. */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      weekStartsOn={1}
      showOutsideDays={showOutsideDays}
      className={cn("p-3 text-sm", className)}
      classNames={{
        root: "relative",
        months: "flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-3",
        month_caption: "flex h-8 items-center justify-start px-1",
        caption_label: "text-sm font-bold",
        nav: "absolute top-0 right-0 flex h-8 items-center gap-1",
        button_previous:
          "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-40",
        button_next:
          "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-40",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-center text-[11px] font-semibold text-muted-foreground uppercase",
        weeks: "flex flex-col gap-0.5",
        week: "mt-1 flex w-full",
        day: "relative size-9 p-0 text-center",
        day_button:
          "flex size-9 items-center justify-center rounded-md text-sm transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring",
        today: "font-bold text-primary",
        selected:
          "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary-hover",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-40",
        range_middle: "[&>button]:rounded-none [&>button]:bg-primary-soft [&>button]:text-primary",
        hidden: "invisible",
        ...classNames,
      }}
      components={{ Chevron: CalendarChevron }}
      {...props}
    />
  );
}
