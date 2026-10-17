import { useQuery } from "@tanstack/react-query";
import { Hourglass } from "lucide-react";

import { plainMentions } from "@/features/people/mentions";

import { countdownHeadline, soonestCountdown } from "./countdown";
import { viewTasksQuery } from "./tasks";

/**
 * Today's reminder of the soonest Countdown still to come, such as "Exam in 12 days", which opens
 * its Task. Nothing when no Countdown is ahead.
 */
export function CountdownHeadline({
  today,
  onOpen,
}: {
  /** The user's ISO date. */
  today: string;
  onOpen: (taskId: number) => void;
}) {
  // Upcoming holds exactly the Tasks dated after today.
  const { data: upcoming = [] } = useQuery(viewTasksQuery("upcoming"));
  const soonest = soonestCountdown(upcoming, today);
  if (!soonest) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onOpen(soonest.task.id);
      }}
      className="flex max-w-full items-center gap-1.5 truncate rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Hourglass className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {countdownHeadline(plainMentions(soonest.task.title), soonest.days)}
      </span>
    </button>
  );
}
