import { Hourglass } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useToday } from "@/features/time-zone/time-zone";

import { countdownLabel, daysLeft } from "./countdown";
import type { Task } from "./tasks";

/** A Countdown's days left, such as "12 days left"; nothing once Closed or past. */
export function CountdownBadge({ task }: { task: Task }) {
  const days = daysLeft(task, useToday());
  if (days === null) return null;
  return (
    <Badge size="sm" data-countdown className="tabular-nums">
      <Hourglass aria-hidden />
      <span className="sr-only">Countdown: </span>
      {countdownLabel(days)}
    </Badge>
  );
}
