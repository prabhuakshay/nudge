import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-md border border-border bg-surface px-4 text-base text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}
