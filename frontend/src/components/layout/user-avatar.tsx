import type { User } from "@/features/auth/session";
import { cn } from "@/lib/utils";

import { initialsFor } from "./initials";

export function UserAvatar({ user, className }: { user: User; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary",
        className,
      )}
    >
      {initialsFor(user)}
    </span>
  );
}
