import { CalendarCheck, CalendarDays, Inbox, type LucideIcon } from "lucide-react";

export type NavItem = {
  to: "/" | "/inbox" | "/upcoming";
  label: string;
  icon: LucideIcon;
};

/** Smart views shown in the sidebar on desktop and the bottom bar on mobile. The Inbox comes first. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/", label: "Today", icon: CalendarCheck },
  { to: "/upcoming", label: "Upcoming", icon: CalendarDays },
];
