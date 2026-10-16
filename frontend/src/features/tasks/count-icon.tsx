import type { LucideIcon } from "lucide-react";

/** A small icon and number for a list row's Activity column; nothing at all when the count is 0. */
export function CountIcon({
  icon: Icon,
  count,
  label,
}: {
  icon: LucideIcon;
  count: number;
  /** What is counted, plural, for screen readers: "attachments". */
  label: string;
}) {
  if (count === 0) return null;
  return (
    <span
      role="img"
      aria-label={`${String(count)} ${label}`}
      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums"
    >
      <Icon className="size-3" aria-hidden />
      {count}
    </span>
  );
}
