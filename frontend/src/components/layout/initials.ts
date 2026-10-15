import type { User } from "@/features/auth/session";
import { initials } from "@/lib/initials";

/** Up to two initials from the user's name, or the first letter of their email. */
export function initialsFor(user: Pick<User, "full_name" | "email">): string {
  return initials(user.full_name) || initials(user.email);
}
