import { Menu } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/brand/logo";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { SidebarNav } from "./sidebar";

/**
 * The sidebar on phones and tablets: a button in the top bar slides it in from the left, as
 * TickTick's drawer does. Following a link closes it.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className="-ml-2 flex size-11 items-center justify-center rounded-md text-muted-foreground lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent
        side="left"
        aria-describedby={undefined}
        className="w-[85vw] max-w-xs pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Logo className="h-10" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <SidebarNav
            onNavigate={() => {
              setOpen(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
