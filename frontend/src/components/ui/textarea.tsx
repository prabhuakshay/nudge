import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const textareaClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none aria-invalid:border-danger sm:text-sm";

/** A multi-line text field styled like `Input`. */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(textareaClass, "min-h-20", className)} {...props} />;
}

/** A textarea that grows with its content, starting at `rows` lines. */
export function AutosizeTextarea({ className, rows = 2, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(textareaClass, "[field-sizing:content] resize-none", className)}
      {...props}
    />
  );
}
