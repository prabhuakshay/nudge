import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Trash2, X } from "lucide-react";
import { useState, type SubmitEvent } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { plainMentions } from "@/features/people/mentions";
import { DialogFooter, SidebarDialog } from "@/features/projects/project-dialog";
import { ProjectIcon } from "@/features/projects/project-icon";

import {
  plural,
  rowKey,
  trashQuery,
  useDeleteForever,
  useEmptyTrash,
  useRestoreProject,
  useRestoreRows,
  useRestoreTask,
  type TrashedRow,
} from "./trash";
import { TrashSelectionBar } from "./trash-selection-bar";

const DAY = 24 * 60 * 60 * 1000;

/** How many days a unit has before it is deleted for good, counting a part day as a whole one. */
function daysLeft(expiresAt: string, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / DAY));
}

/** A row's name: a Task's title as plain text, or a Project's name. */
function titleOf(row: TrashedRow) {
  return row.kind === "project" ? row.name : plainMentions(row.title);
}

/** What went to Trash with a row: a Task's Subtasks or a Project's Tasks. */
function contents(row: TrashedRow) {
  return row.kind === "project"
    ? { count: row.task_count, noun: "task" }
    : { count: row.subtask_count, noun: "Subtask" };
}

/** Where a unit came from, what went with it and how long it has left, on one line. */
function details(row: TrashedRow) {
  const { count, noun } = contents(row);
  return [
    row.kind === "project" ? "Project" : row.project_name,
    ...(row.kind === "project" || count > 0 ? [plural(count, noun)] : []),
    `${plural(daysLeft(row.expires_at), "day")} left`,
  ].join(" · ");
}

/** What the confirm dialog is asking about: one unit, the selected ones, or the whole Trash. */
type Confirm =
  | { kind: "row"; row: TrashedRow }
  | { kind: "rows"; rows: TrashedRow[] }
  | { kind: "empty"; count: number };

/**
 * The Trash: one row per deleted Task or Project, newest first, each with Restore and Delete
 * forever, and Empty Trash in the header. Ticking rows selects them, for restoring or deleting
 * them together from the bar. Deleting for good asks first.
 */
export function TrashList() {
  const { data: rows } = useQuery(trashQuery);
  const { mutate: restoreTask } = useRestoreTask();
  const { mutate: restoreProject } = useRestoreProject();
  const { mutate: restoreRows } = useRestoreRows();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // A selected row can leave the Trash from elsewhere, so the selection is what's still listed.
  const chosen = rows?.filter((row) => selected.has(rowKey(row))) ?? [];
  const clearSelection = () => {
    setSelected(new Set());
  };
  const toggle = (row: TrashedRow, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(rowKey(row));
    else next.delete(rowKey(row));
    setSelected(next);
  };
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
          description="Deleted tasks and projects wait here for a while, so you can bring them back."
        />
      )}
      {rows && rows.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map((row) => {
            const title = titleOf(row);
            return (
              <li
                key={rowKey(row)}
                className="flex min-h-14 items-center gap-1 border-b border-border/60 py-2 pr-2 pl-4 last:border-b-0"
              >
                <Checkbox
                  aria-label={`Select “${title}”`}
                  checked={selected.has(rowKey(row))}
                  onCheckedChange={(checked) => {
                    toggle(row, checked === true);
                  }}
                  className="mr-3"
                />
                {row.kind === "project" && <ProjectIcon project={row} className="mr-2" />}
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
                    if (row.kind === "project") restoreProject(row.id);
                    else restoreTask(row.id);
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
      <TrashSelectionBar
        count={chosen.length}
        onRestore={() => {
          restoreRows(chosen);
          clearSelection();
        }}
        onDeleteForever={() => {
          setConfirm({ kind: "rows", rows: chosen });
        }}
        onClear={clearSelection}
      />
      <ConfirmDialog
        confirm={confirm}
        onDeleted={clearSelection}
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
  if (confirm.kind === "rows") {
    const count = plural(confirm.rows.length, "item");
    return { title: `Delete ${count} forever?`, what: `The ${count}`, action: "Delete forever" };
  }
  const { count, noun } = contents(confirm.row);
  return {
    title: `Delete “${titleOf(confirm.row)}” forever?`,
    what: count > 0 ? `It and its ${plural(count, noun)}` : "It",
    action: "Delete forever",
  };
}

/** Asks before deleting for good, which can't be undone, saying what goes with it. */
function ConfirmDialog({
  confirm,
  onDeleted,
  onClose,
}: {
  confirm: Confirm | null;
  /** Called once rows are deleted, so they leave the selection. */
  onDeleted: () => void;
  onClose: () => void;
}) {
  const deleteForever = useDeleteForever();
  const emptyTrash = useEmptyTrash();
  if (!confirm) return null;
  const copy = confirmCopy(confirm);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirm?.kind === "row") {
      const title = titleOf(confirm.row);
      deleteForever.mutate([confirm.row], {
        onSuccess: () => toast(`Deleted “${title}” forever`),
      });
    } else if (confirm?.kind === "rows") {
      const count = plural(confirm.rows.length, "item");
      deleteForever.mutate(confirm.rows, { onSuccess: () => toast(`Deleted ${count} forever`) });
      onDeleted();
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
