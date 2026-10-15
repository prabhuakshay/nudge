import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// eslint-disable-next-line react-refresh/only-export-components -- shared so links and buttons can look like a Badge, as in shadcn
export const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-full font-semibold whitespace-nowrap [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary-soft text-primary",
        secondary: "border border-border bg-surface-muted text-muted-foreground",
        outline: "border border-border text-foreground",
        danger: "bg-danger-soft text-danger",
      },
      size: {
        sm: "h-5 px-1.5 text-[11px] [&_svg]:size-3",
        md: "h-6 px-2 text-xs [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

/** A small pill for counts, Tags and states. Callers may pass their own colour classes. */
export function Badge({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, size, className }))} {...props} />;
}
