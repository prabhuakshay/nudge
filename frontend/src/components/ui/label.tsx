import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    // eslint-disable-next-line jsx-a11y-x/label-has-associated-control -- callers pass htmlFor
    <label className={cn("text-sm font-semibold text-foreground", className)} {...props} />
  );
}
