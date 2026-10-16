import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, Trash2 } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Kbd } from "@/components/ui/kbd";
import type { User } from "@/features/auth/session";
import { SidebarArchived } from "@/features/projects/sidebar-archived";
import { SidebarPeople } from "@/features/people/sidebar-people";
import { SidebarProjects } from "@/features/projects/sidebar-projects";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { ariaKeyShortcuts, keyCaps, SHORTCUTS } from "@/features/shortcuts/registry";
import { SidebarTags } from "@/features/tags/sidebar-tags";
import { sidebarQuery, type Sidebar as SidebarData } from "@/features/tasks/tasks";

import { NAV_ITEMS, type NavItem } from "./nav-items";
import { UserAvatar } from "./user-avatar";

/**
 * Desktop navigation: Search, smart views, Projects and the account, always visible.
 * `onSearch` opens the command bar.
 */
export function Sidebar({ user, onSearch }: { user: User; onSearch: () => void }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <Logo className="h-11" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <SidebarNav onSearch={onSearch} />
      </div>

      <div className="border-t border-border p-2">
        <SettingsDialog user={user}>
          <button
            type="button"
            aria-label="Settings"
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-muted"
          >
            <UserAvatar user={user} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.full_name || user.email}</p>
              {user.full_name && (
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              )}
            </div>
          </button>
        </SettingsDialog>
      </div>
    </aside>
  );
}

/** How many open Tasks a view lists; Today's count takes in Overdue. */
function navCount(sidebar: SidebarData, to: NavItem["to"]) {
  return {
    "/inbox": sidebar.inbox.open_count,
    "/": sidebar.today_count,
    "/upcoming": sidebar.upcoming_count,
  }[to];
}

const LINK =
  "flex h-10 items-center gap-2.5 rounded-md px-2.5 text-sm text-foreground transition-colors hover:bg-surface-muted data-[status=active]:bg-primary-soft data-[status=active]:text-primary lg:h-9";

/**
 * The views, then the user's Projects, Tags and People, then Trash: the body of the desktop
 * sidebar and of the phone menu, which holds what the bottom bar has no room for.
 * `onNavigate` runs when a link is followed, so the phone menu can close. `onSearch` adds a
 * Search row that opens the command bar; the phone menu leaves it out, as its top bar has one.
 */
export function SidebarNav({
  onNavigate,
  onSearch,
}: {
  onNavigate?: () => void;
  onSearch?: () => void;
}) {
  const { data: sidebar } = useQuery(sidebarQuery);
  return (
    <>
      <nav aria-label="Views" className="flex flex-col gap-0.5 px-2 pt-3">
        {onSearch && (
          <button
            type="button"
            onClick={onSearch}
            aria-keyshortcuts={ariaKeyShortcuts("openCommandBar")}
            className={LINK}
          >
            <Search className="size-4" aria-hidden />
            Search
            <span aria-hidden className="ml-auto flex gap-1">
              {keyCaps(SHORTCUTS.openCommandBar.keys[0])
                .flat()
                .map((cap) => (
                  <Kbd key={cap}>{cap}</Kbd>
                ))}
            </span>
          </button>
        )}
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const count = sidebar && navCount(sidebar, to);
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              activeOptions={{ exact: true }}
              className={LINK}
            >
              <Icon className="size-4" aria-hidden />
              {label}
              {count !== undefined && count > 0 && (
                <>
                  <span aria-hidden className="ml-auto text-xs font-medium tabular-nums">
                    {count}
                  </span>
                  <span className="sr-only">, {count} open</span>
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5">
        <SidebarProjects onNavigate={onNavigate} />
      </div>
      <div className="mt-3">
        <SidebarArchived onNavigate={onNavigate} />
      </div>

      <div className="mt-5">
        <SidebarTags onNavigate={onNavigate} />
      </div>

      <div className="mt-5">
        <SidebarPeople onNavigate={onNavigate} />
      </div>

      <div className="mt-5 px-2">
        <Link to="/trash" onClick={onNavigate} className={LINK}>
          <Trash2 className="size-4" aria-hidden />
          Trash
        </Link>
      </div>
    </>
  );
}
