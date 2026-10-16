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

const INBOX: NavItem = { to: "/inbox", label: "Inbox", icon: Inbox };
const TODAY: NavItem = { to: "/", label: "Today", icon: CalendarCheck };
const CALENDAR: NavItem = { to: "/calendar", label: "Calendar", icon: CalendarRange };

/** Views in the bottom bar on phones. The Inbox comes first; Upcoming waits in the menu. */
export const BOTTOM_NAV_ITEMS: readonly NavItem[] = [INBOX, TODAY, CALENDAR];

/** Views in the sidebar and the phone menu, which also holds those the bottom bar leaves out. */
export const NAV_ITEMS: readonly NavItem[] = [
  INBOX,
  TODAY,
  { to: "/upcoming", label: "Upcoming", icon: CalendarDays },
  CALENDAR,
  { to: "/all", label: "All", icon: Layers },
];
