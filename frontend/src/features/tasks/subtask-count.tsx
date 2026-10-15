import { cn } from "@/lib/utils";

import type { SubtaskProgress } from "./task-tree";

const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** A ring that fills as Subtasks close, green once they all have. */
function ProgressRing({ done, total }: SubtaskProgress) {
  const filled = total ? (done / total) * CIRCUMFERENCE : 0;
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r={RADIUS} fill="none" strokeWidth="2.5" className="stroke-border" />
      <circle
        cx="8"
        cy="8"
        r={RADIUS}
        fill="none"
        strokeWidth="2.5"
        strokeDasharray={`${String(filled)} ${String(CIRCUMFERENCE)}`}
        strokeLinecap="round"
        className={done === total ? "stroke-success" : "stroke-primary"}
      />
    </svg>
  );
}

/** How many of a Task's direct Subtasks are done, as a ring and "2/5". Nothing without Subtasks. */
export function SubtaskCount({ done, total, className }: SubtaskProgress & { className?: string }) {
  if (total === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums",
        className,
      )}
    >
      <ProgressRing done={done} total={total} />
      <span aria-hidden>
        {done}/{total}
      </span>
      <span className="sr-only">
        {done} of {total} subtasks done
      </span>
    </span>
  );
}
