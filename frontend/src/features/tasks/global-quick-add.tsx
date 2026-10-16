import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useShortcuts } from "@/features/shortcuts/use-shortcuts";

import { QuickAddCard } from "./quick-add-card";
import { useAnnounceTask } from "./announce-task";
import type { QuickAddView } from "./quick-add-view";
import { sidebarQuery, type Task } from "./tasks";

/**
 * On the Quick add shortcut, focus the page's own Quick add card, or open the dialog where there
 * is none. Nothing happens while the drawer or another dialog is open.
 */
function useQuickAddShortcut(open: () => void) {
  useShortcuts({
    quickAdd: (event) => {
      if (event.target instanceof Element && event.target.closest("[role=dialog]")) return;
      const card = document.querySelector<HTMLInputElement>("[data-quick-add-card] input");
      if (card) card.focus();
      else open();
    },
  });
}

/**
 * Quick add in a dialog, for adding a Task where the page has no card of its own. It closes once
 * a Task is added and hands the Task to `onAdded`.
 */
export function QuickAddDialog({
  view,
  initialText,
  onClose,
  onAdded,
}: {
  view: QuickAddView;
  initialText?: string;
  onClose: () => void;
  onAdded?: (task: Task) => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined} className="sm:w-[36rem]">
        <div className="flex h-14 shrink-0 items-center pr-14 pl-5">
          <DialogTitle className="text-lg font-bold tracking-tight">Add a task</DialogTitle>
        </div>
        <div className="px-4 pb-1">
          <QuickAddCard
            view={view}
            initialText={initialText}
            onAdded={(task) => {
              onClose();
              onAdded?.(task);
            }}
          />
        </div>
        {/* After the card, so the dialog focuses Quick add first when it opens. */}
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            className="absolute top-[calc(env(safe-area-inset-top)+0.375rem)] right-2 text-muted-foreground sm:top-2.5"
          >
            <X aria-hidden />
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Quick add for pages without a card of their own, such as Search and Trash: its shortcut, `C`,
 * opens it in a dialog. New Tasks go to the Inbox unless they name a Project; the dialog then
 * closes and a toast points to the Task. The host keeps whether it is open as its `draft`, the
 * text it opens with, so the command bar can open it with words already typed.
 */
export function GlobalQuickAdd({
  draft,
  onDraftChange,
}: {
  /** The text to open with, or null while closed. */
  draft: string | null;
  onDraftChange: (draft: string | null) => void;
}) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const announce = useAnnounceTask();
  useQuickAddShortcut(() => {
    onDraftChange("");
  });
  if (!sidebar || draft === null) return null;
  return (
    <QuickAddDialog
      view={{ kind: "project", project: sidebar.inbox }}
      initialText={draft}
      onClose={() => {
        onDraftChange(null);
      }}
      onAdded={announce}
    />
  );
}
