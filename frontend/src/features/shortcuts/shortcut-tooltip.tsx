import type { ComponentProps, ReactElement } from "react";

import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { ariaKeyShortcuts, shortcutText, type ShortcutId } from "./registry";

/**
 * A tooltip naming what a button does and the key that does the same, in a key cap. The button
 * must accept a ref, and is given `aria-keyshortcuts` itself. Other props, such as those a
 * picker's trigger passes down, go to the button too.
 */
export function ShortcutTooltip({
  label,
  shortcut,
  children,
  ...props
}: ComponentProps<typeof TooltipTrigger> & {
  label: string;
  shortcut: ShortcutId;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        asChild
        aria-keyshortcuts={ariaKeyShortcuts(shortcut) || undefined}
        {...props}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {label}
        <Kbd className="border-background/30 bg-background/15 text-background">
          {shortcutText(shortcut)}
        </Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
