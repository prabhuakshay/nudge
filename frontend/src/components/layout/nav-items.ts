import { CalendarCheck, CalendarDays, Inbox, Layers, type LucideIcon } from "lucide-react";

export type NavItem = {
  to: "/" | "/inbox" | "/upcoming" | "/all";
  label: string;
  icon: LucideIcon;
};

/** Smart views in the bottom bar on phones. The Inbox comes first. */
export const BOTTOM_NAV_ITEMS: readonly NavItem[] = [
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/", label: "Today", icon: CalendarCheck },
  { to: "/upcoming", label: "Upcoming", icon: CalendarDays },
];

/** Smart views in the sidebar and the phone menu: the bottom bar's, then All, which it has no room for. */
export const NAV_ITEMS: readonly NavItem[] = [
  ...BOTTOM_NAV_ITEMS,
  { to: "/all", label: "All", icon: Layers },
];
