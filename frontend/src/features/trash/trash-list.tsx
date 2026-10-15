import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { plainMentions } from "@/features/people/mentions";

import { trashQuery, useRestoreTask, type TrashedTask } from "./trash";

const DAY = 24 * 60 * 60 * 1000;

/** How many days a unit has before it is deleted for good, counting a part day as a whole one. */
function daysLeft(expiresAt: string, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / DAY));
}

function plural(count: number, noun: string) {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/** Where a unit came from, what went with it and how long it has left, on one line. */
function details(row: TrashedTask) {
  return [
    row.project_name,
    ...(row.subtask_count > 0 ? [plural(row.subtask_count, "Subtask")] : []),
    `${plural(daysLeft(row.expires_at), "day")} left`,
  ].join(" · ");
}

/** The Trash: one row per deleted unit, newest first, each with a Restore button. */
export function TrashList() {
  const { data: rows } = useQuery(trashQuery);
  const { mutate: restore } = useRestoreTask();
  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground">
          <Trash2 className="size-5" aria-hidden />
        </span>
        <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">Trash</h1>
      </header>
      {rows?.length === 0 && (
        <EmptyState
          icon={Trash2}
          title="Trash is empty"
          description="Deleted tasks wait here for a while, so you can bring them back."
        />
      )}
      {rows && rows.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map((row) => {
            const title = plainMentions(row.title);
            return (
              <li
                key={row.id}
                className="flex min-h-14 items-center gap-3 border-b border-border/60 py-2 pr-2 pl-4 last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span data-title className="truncate text-sm font-semibold">
                    {title}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{details(row)}</span>
                </div>
                <Button
                  variant="ghost"
                  aria-label={`Restore “${title}”`}
                  onClick={() => {
                    restore(row.id);
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Restore</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
