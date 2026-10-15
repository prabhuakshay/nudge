import { CalendarCheck, CalendarDays, Inbox, type LucideIcon } from "lucide-react";

export type NavItem = {
  to: "/" | "/inbox" | "/upcoming";
  label: string;
  icon: LucideIcon;
};

/** Smart views shown in the sidebar on desktop and the bottom bar on mobile. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Today", icon: CalendarCheck },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/upcoming", label: "Upcoming", icon: CalendarDays },
];
