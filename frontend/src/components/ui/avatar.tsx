import type { ComponentProps } from "react";

import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
} as const;

type AvatarProps = ComponentProps<"span"> & { name: string; size?: keyof typeof SIZE_CLASS };

/** A round badge with a name's initials. Callers pick the colour through `className`. */
export function Avatar({ name, size = "sm", className, ...props }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary",
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    >
      {initials(name)}
    </span>
  );
}
