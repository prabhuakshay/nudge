import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Trash2, X } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { plainMentions } from "@/features/people/mentions";
import { DialogFooter, SidebarDialog } from "@/features/projects/project-dialog";

import {
  trashQuery,
  useDeleteForever,
  useEmptyTrash,
  useRestoreTask,
  type TrashedTask,
} from "./trash";

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

/** What the confirm dialog is asking about: one unit, or the whole Trash. */
type Confirm = { kind: "row"; row: TrashedTask } | { kind: "empty"; count: number };

/**
 * The Trash: one row per deleted unit, newest first, each with Restore and Delete forever, and
 * Empty Trash in the header. Deleting for good asks first.
 */
export function TrashList() {
  const { data: rows } = useQuery(trashQuery);
  const { mutate: restore } = useRestoreTask();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground">
          <Trash2 className="size-5" aria-hidden />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
          Trash
        </h1>
        {rows && rows.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              setConfirm({ kind: "empty", count: rows.length });
            }}
          >
            Empty Trash
          </Button>
        )}
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
                className="flex min-h-14 items-center gap-1 border-b border-border/60 py-2 pr-2 pl-4 last:border-b-0"
              >
                <div className="mr-2 flex min-w-0 flex-1 flex-col">
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
                <Button
                  variant="ghost"
                  aria-label={`Delete “${title}” forever`}
                  className="text-muted-foreground"
                  onClick={() => {
                    setConfirm({ kind: "row", row });
                  }}
                >
                  <X className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Delete forever</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        confirm={confirm}
        onClose={() => {
          setConfirm(null);
        }}
      />
    </div>
  );
}

/** The confirm dialog's title, what it says will go, and its button. */
function confirmCopy(confirm: Confirm) {
  if (confirm.kind === "empty") {
    return {
      title: "Empty Trash?",
      what: `All ${plural(confirm.count, "item")} in Trash`,
      action: "Empty Trash",
    };
  }
  const { subtask_count: subtasks } = confirm.row;
  return {
    title: `Delete “${plainMentions(confirm.row.title)}” forever?`,
    what: subtasks > 0 ? `It and its ${plural(subtasks, "Subtask")}` : "It",
    action: "Delete forever",
  };
}

/** Asks before deleting for good, which can't be undone, saying what goes with it. */
function ConfirmDialog({ confirm, onClose }: { confirm: Confirm | null; onClose: () => void }) {
  const deleteForever = useDeleteForever();
  const emptyTrash = useEmptyTrash();
  if (!confirm) return null;
  const copy = confirmCopy(confirm);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirm?.kind === "row") {
      const title = plainMentions(confirm.row.title);
      deleteForever.mutate([confirm.row.id], {
        onSuccess: () => toast(`Deleted “${title}” forever`),
      });
    } else {
      emptyTrash.mutate(undefined, { onSuccess: () => toast("Emptied the Trash") });
    }
    onClose();
  }

  return (
    <SidebarDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.title}
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          {copy.what} will be deleted along with comments and attachments. This can&apos;t be
          undone.
        </p>
        <DialogFooter pending={false} label={copy.action} />
      </form>
    </SidebarDialog>
  );
}
