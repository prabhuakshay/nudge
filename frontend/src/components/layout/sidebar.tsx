import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, Trash2 } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Kbd } from "@/components/ui/kbd";
import type { User } from "@/features/auth/session";
import { SidebarPeople } from "@/features/people/sidebar-people";
import { SidebarProjects } from "@/features/projects/sidebar-projects";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { ariaKeyShortcuts, keyCaps, SHORTCUTS } from "@/features/shortcuts/registry";
import { SidebarTags } from "@/features/tags/sidebar-tags";
import { sidebarQuery, type Sidebar as SidebarData } from "@/features/tasks/tasks";

import { NAV_ITEMS, type NavItem } from "./nav-items";
import { UserAvatar } from "./user-avatar";

/**
 * Desktop navigation: the Search field, smart views, Projects and the account, always visible.
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
    "/all": sidebar.all_count,
  }[to];
}

const LINK =
  "flex h-10 items-center gap-2.5 rounded-md px-2.5 text-sm text-foreground transition-colors hover:bg-surface-muted data-[status=active]:bg-primary-soft data-[status=active]:text-primary lg:h-9";

/**
 * The views, then the user's Projects, Tags and People, then Trash: the body of the desktop
 * sidebar and of the phone menu, which holds what the bottom bar has no room for.
 * `onNavigate` runs when a link is followed, so the phone menu can close. `onSearch` adds a
 * Search field that opens the command bar; the phone menu leaves it out, as its top bar has one.
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
      {onSearch && <SearchField onSearch={onSearch} />}
      <nav aria-label="Views" className="flex flex-col gap-0.5 px-2 pt-3">
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

      <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
        <SidebarProjects onNavigate={onNavigate} />
        <SidebarTags onNavigate={onNavigate} />
        <SidebarPeople onNavigate={onNavigate} />
      </div>

      <div className="mt-3 border-t border-border px-2 pt-3">
        <Link to="/trash" onClick={onNavigate} className={LINK}>
          <Trash2 className="size-4" aria-hidden />
          Trash
        </Link>
      </div>
    </>
  );
}

/**
 * What looks like a search box at the top of the sidebar, as in TickTick. It's a button: typing
 * happens in the command bar it opens, which searches Tasks and offers every action.
 */
function SearchField({ onSearch }: { onSearch: () => void }) {
  return (
    <div className="px-2 pt-3">
      <button
        type="button"
        onClick={onSearch}
        aria-haspopup="dialog"
        aria-keyshortcuts={ariaKeyShortcuts("openCommandBar")}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface-muted px-2.5 text-sm text-muted-foreground shadow-xs transition-colors hover:border-ring/50 hover:bg-surface focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        Search
        <span aria-hidden className="ml-auto flex gap-1">
          {keyCaps(SHORTCUTS.openCommandBar.keys[0])
            .flat()
            .map((cap) => (
              <Kbd key={cap}>{cap}</Kbd>
            ))}
        </span>
      </button>
    </div>
  );
}
