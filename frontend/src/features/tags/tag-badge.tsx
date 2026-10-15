import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { tagHue, type Tag } from "./tags";

/** A Tag as a small pill in its colour; with `onRemove` it gets a × that takes it off. */
export function TagBadge({
  tag,
  className,
  onRemove,
}: {
  tag: Tag;
  className?: string;
  onRemove?: () => void;
}) {
  const hue = tagHue(tag);
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold",
        hue.soft,
        hue.text,
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", hue.bg)} aria-hidden />
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove tag ${tag.name}`}
          className="-mr-1 ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-full opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X className="size-3" aria-hidden />
        </button>
      )}
    </span>
  );
}
