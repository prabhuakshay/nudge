import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CircleCheck, Pin } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { GRID } from "./task-row";

/** The table's column headings, shown from `lg` where the rows become a grid. */
export function TaskTableHeader() {
  return (
    <div
      role="row"
      className={cn(
        GRID,
        "sticky top-14 z-10 hidden h-9 items-center rounded-t-xl border-b border-border bg-surface-muted/95 pr-2 pl-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur",
      )}
    >
      <span role="columnheader" className="pl-[54px]">
        Title
      </span>
      <span role="columnheader" className="px-2">
        Status
      </span>
      <span role="columnheader" className="px-2">
        Priority
      </span>
      <span role="columnheader" className="px-2">
        Due
      </span>
      <span role="columnheader" className="hidden px-2 xl:block">
        Tags
      </span>
      <span role="columnheader" className="px-2 text-right">
        Activity
      </span>
      <span role="columnheader" aria-label="Actions" />
    </div>
  );
}

/** A titled section of the table, with a count of the Tasks in it. */
export function Group({
  icon,
  label,
  hint,
  count,
  children,
}: {
  icon: ReactNode;
  label: string;
  /** Quieter text after the label, such as a weekday's date. */
  hint?: string | null;
  count: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="border-b border-border">
      <h2 className="flex h-9 items-center gap-2 border-b border-border/70 bg-surface-muted/50 px-3 text-xs font-semibold text-foreground">
        {icon}
        {label}
        {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
        <span className="rounded-full bg-surface px-1.5 py-px text-[11px] font-medium text-muted-foreground tabular-nums ring-1 ring-border">
          {count}
        </span>
      </h2>
      {children}
    </section>
  );
}

/**
 * Closed Tasks stay out of the way, and aren't fetched, until the group is opened. `children` are
 * its rows; `empty` says there are none once loaded.
 */
/** The group of Pinned Tasks, which every list shows first. */
export function PinnedGroup({ count, children }: { count: number; children: ReactNode }) {
  return (
    <Group
      icon={<Pin className="size-3.5 text-primary" aria-hidden />}
      label="Pinned"
      count={count}
    >
      {children}
    </Group>
  );
}

export function ClosedGroup({
  label = "Closed",
  query: closed,
  empty,
  expanded,
  onExpandedChange,
  children,
}: {
  label?: string;
  query: UseInfiniteQueryResult;
  empty: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          onExpandedChange(!expanded);
        }}
        className={cn(
          "flex h-10 w-full items-center gap-2 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-muted/60 hover:text-foreground",
          !expanded && "rounded-b-xl",
        )}
      >
        {expanded ? (
          <ChevronDown className="size-4" aria-hidden />
        ) : (
          <ChevronRight className="size-4" aria-hidden />
        )}
        <CircleCheck className="size-3.5 text-success" aria-hidden />
        {label}
      </button>
      {expanded && (
        <div className="border-t border-border/60 pb-1">
          {children}
          {closed.isSuccess && empty && (
            <p className="px-4 py-4 text-center text-sm text-muted-foreground">
              Nothing closed yet.
            </p>
          )}
          {closed.hasNextPage && (
            <div className="flex justify-center py-1">
              <Button
                variant="ghost"
                disabled={closed.isFetchingNextPage}
                onClick={() => void closed.fetchNextPage()}
              >
                Show more
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
