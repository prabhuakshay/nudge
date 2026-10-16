import {
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Inbox,
  Layers,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to: "/" | "/inbox" | "/upcoming" | "/calendar" | "/all";
  label: string;
  icon: LucideIcon;
};

/** Smart views in the bottom bar on phones. The Inbox comes first. */
export const BOTTOM_NAV_ITEMS: readonly NavItem[] = [
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/", label: "Today", icon: CalendarCheck },
  { to: "/upcoming", label: "Upcoming", icon: CalendarDays },
];

/** Views in the sidebar and the phone menu: the bottom bar's, then those it has no room for. */
export const NAV_ITEMS: readonly NavItem[] = [
  ...BOTTOM_NAV_ITEMS,
  { to: "/calendar", label: "Calendar", icon: CalendarRange },
  { to: "/all", label: "All", icon: Layers },
];
