import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

type Side = "right" | "left" | "top" | "bottom";

const SIDE_CLASS: Record<Side, string> = {
  right:
    "inset-y-0 right-0 h-full w-full border-l sm:max-w-md data-[state=closed]:translate-x-full starting:translate-x-full",
  left: "inset-y-0 left-0 h-full w-full border-r sm:max-w-md data-[state=closed]:-translate-x-full starting:-translate-x-full",
  top: "inset-x-0 top-0 border-b data-[state=closed]:-translate-y-full starting:-translate-y-full",
  bottom:
    "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-xl border-t data-[state=closed]:translate-y-full starting:translate-y-full",
};

/** A panel that slides in from one edge of the screen over a dimmed backdrop. */
export function SheetContent({
  className,
  children,
  side = "right",
  showClose = true,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { side?: Side; showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px] transition-opacity duration-200 data-[state=closed]:opacity-0 starting:opacity-0" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col border-border bg-surface shadow-2xl transition-transform duration-300 ease-out focus-visible:outline-none",
          SIDE_CLASS[side],
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1 border-b border-border p-4 pr-14", className)}
      {...props}
    />
  );
}

export function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-auto flex items-center gap-2 border-t border-border p-4", className)}
      {...props}
    />
  );
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-base font-bold", className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
