import { CircleDashed, CircleDot, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type { TaskStatus } from "./tasks";

const STATUS: Record<TaskStatus, { label: string; icon: LucideIcon; className: string }> = {
  open: { label: "Open", icon: CircleDashed, className: "bg-surface-muted text-muted-foreground" },
  completed: { label: "Completed", icon: CircleDot, className: "bg-success-soft text-success" },
};

/** A Task's Status as a small coloured label. */
export function StatusBadge({ status }: { status: TaskStatus }) {
  const { label, icon: Icon, className } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}
