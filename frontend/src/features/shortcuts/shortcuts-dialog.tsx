import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { ShortcutList } from "./shortcut-list";
import { useSingleKeyShortcuts } from "./use-shortcuts";

/** The `?` dialog: every keyboard shortcut, grouped by where it works. */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const singleKey = useSingleKeyShortcuts();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="sm:max-h-[85dvh] sm:w-[min(52rem,calc(100vw-4rem))]"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pr-2 pl-5 sm:pl-6">
          <DialogTitle className="text-lg font-bold">Keyboard shortcuts</DialogTitle>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              className="text-muted-foreground"
            >
              <X aria-hidden />
            </Button>
          </DialogClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {!singleKey && (
            <p className="mb-5 rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
              Single-key shortcuts are off in Settings, so only keys with Ctrl, ⌘ or Alt, and keys
              such as Esc, Delete and the arrows, work.
            </p>
          )}
          <ShortcutList className="sm:grid-cols-2 sm:gap-x-10" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
