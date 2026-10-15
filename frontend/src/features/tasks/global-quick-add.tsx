import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { QuickAddCard } from "./quick-add-card";
import { isAddKey, useAnnounceTask } from "./quick-add-page";
import { sidebarQuery, type Task } from "./tasks";

/** Open the dialog on `C` when the page has no Quick add card of its own to focus. */
function useOpenOnC(setOpen: (open: boolean) => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isAddKey(event) || document.querySelector("[data-quick-add-card]")) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [setOpen]);
}

/**
 * Quick add for pages without a card of their own, such as Search and Trash: `C` opens it in a
 * dialog. New Tasks go to the Inbox unless they name a Project; the dialog then closes and a
 * toast points to the Task.
 */
export function GlobalQuickAdd() {
  const [open, setOpen] = useState(false);
  const { data: sidebar } = useQuery(sidebarQuery);
  const announce = useAnnounceTask();
  useOpenOnC(setOpen);
  if (!sidebar) return null;

  const added = (task: Task) => {
    setOpen(false);
    announce(task);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby={undefined} className="sm:w-[36rem]">
        <div className="flex h-14 shrink-0 items-center pr-14 pl-5">
          <DialogTitle className="text-lg font-bold tracking-tight">Add a task</DialogTitle>
        </div>
        <div className="px-4 pb-1">
          <QuickAddCard view={{ kind: "project", project: sidebar.inbox }} onAdded={added} />
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
