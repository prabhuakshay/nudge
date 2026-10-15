import type { ReactNode, SyntheticEvent } from "react";

import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

type ResponsivePopoverProps = {
  /** The panel's accessible name, and the sheet's title on phones. */
  label: string;
  /** The element that opens the panel; it must accept a ref, like a button. */
  trigger: ReactNode;
  /** The panel's body, which scrolls when the screen is too short for it. */
  children: ReactNode;
  /** Actions kept in view below the scrolling body. */
  footer?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  /** Classes for the popover, such as its width; the sheet always spans the screen. */
  className?: string;
};

/** React events bubble out of portals to whatever holds the trigger, such as a clickable row. */
function keepClicksInside(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * A picker's panel, as TickTick shows one: a popover anchored to its trigger from `sm` up, and a
 * bottom sheet on phones, where a popover has no room. Either way it fits the screen, scrolling
 * its body and keeping the footer in view.
 */
export function ResponsivePopover({
  label,
  trigger,
  children,
  footer,
  open,
  onOpenChange,
  align = "start",
  className,
}: ResponsivePopoverProps) {
  const wide = useMediaQuery("(min-width: 640px)");
  const body = (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      {children}
    </div>
  );

  if (!wide) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent aria-describedby={undefined} onClick={keepClicksInside}>
          <DrawerTitle className="sr-only">{label}</DrawerTitle>
          {body}
          {footer}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        aria-label={label}
        className={cn("overflow-hidden", className)}
        onClick={keepClicksInside}
      >
        {body}
        {footer}
      </PopoverContent>
    </Popover>
  );
}
