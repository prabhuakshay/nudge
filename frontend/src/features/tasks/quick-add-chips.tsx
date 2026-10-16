import { X } from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

import type { QuickAddMatch } from "./quick-add";
import { chipLabel, CHIP_ICON, isNew, matchClass } from "./quick-add-style";
import type { ViewDefault } from "./quick-add-view";

/** One chip: an icon, the name, *new* for an item to create, and × to drop it. */
function Chip({
  match,
  removeLabel,
  onRemove,
}: {
  match: QuickAddMatch | ViewDefault;
  removeLabel: string;
  onRemove: () => void;
}) {
  const Icon = CHIP_ICON[match.kind];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md pr-0.5 pl-2 text-xs font-semibold",
        matchClass(match),
      )}
    >
      <Icon className="size-3" aria-hidden />
      {chipLabel(match)}
      {isNew(match) && <em className="font-normal opacity-80">new</em>}
      <button
        type="button"
        aria-label={removeLabel}
        // Keep focus in the input, so the user can type on.
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={onRemove}
        className="ml-0.5 flex size-5 items-center justify-center rounded opacity-60 hover:bg-current/10 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}

/**
 * A chip for each of the view's own chips and each match below the input. The × on a match turns
 * it back into plain text; on a view's chip it drops what the view would give the Task.
 */
export function QuickAddChips({
  matches,
  given = [],
  onKeep,
  onDropGiven,
}: {
  matches: readonly QuickAddMatch[];
  given?: readonly ViewDefault[];
  onKeep: (match: QuickAddMatch) => void;
  onDropGiven?: (chip: ViewDefault) => void;
}) {
  if (matches.length === 0 && given.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {given.map((chip) => (
        <Chip
          key={chip.kind}
          match={chip}
          removeLabel={`Remove ${chipLabel(chip)}`}
          onRemove={() => onDropGiven?.(chip)}
        />
      ))}
      {matches.map((match) => (
        <Chip
          key={`${match.kind}-${String(match.start)}`}
          match={match}
          removeLabel={`Keep “${match.text}” as text`}
          onRemove={() => {
            onKeep(match);
          }}
        />
      ))}
    </div>
  );
}

/** What Quick add understands, shown under the input while it's focused: tokens, dates, Repeat. */
export function QuickAddHint({ allowProject = true }: { allowProject?: boolean }) {
  const hints = [
    ["#", "Tag"],
    ["!1", "Priority"],
    ...(allowProject ? [["~", "Project"]] : []),
    ["@", "Person"],
  ];
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {hints.map(([key, label]) => (
        <span key={label}>
          <Kbd>{key}</Kbd> {label}
        </span>
      ))}
      <span>“tomorrow 9am”, “every monday”</span>
    </p>
  );
}
