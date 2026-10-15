import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** A key cap for keyboard shortcut hints. */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-b-2 border-border bg-surface-muted px-1 font-sans text-[11px] font-semibold text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
