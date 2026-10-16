import { Avatar } from "@/components/ui/avatar";
import { HUE } from "@/features/projects/project-style";
import { cn } from "@/lib/utils";

import type { Person } from "./people";

/** A Person's initials on a disc of their colour. Decorative: their name sits beside it. */
export function PersonAvatar({
  person,
  size = "sm",
  className,
}: {
  person: Pick<Person, "name" | "color">;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  return (
    <Avatar
      name={person.name}
      size={size}
      className={cn("text-surface", HUE[person.color].bg, className)}
    />
  );
}
