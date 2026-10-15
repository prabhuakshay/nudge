import type { User } from "@/features/auth/session";

/** Up to two initials from the user's name, or the first letter of their email. */
export function initialsFor(user: Pick<User, "full_name" | "email">): string {
  const words = user.full_name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 0 ? words.map((word) => word[0]) : [user.email[0]];
  return letters.slice(0, 2).join("").toUpperCase();
}
