import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/brand/logo";
import type { User } from "@/features/auth/session";
import { SidebarArchived } from "@/features/projects/sidebar-archived";
import { SidebarProjects } from "@/features/projects/sidebar-projects";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { SidebarTags } from "@/features/tags/sidebar-tags";
import { sidebarQuery } from "@/features/tasks/tasks";

import { NAV_ITEMS } from "./nav-items";
import { UserAvatar } from "./user-avatar";

/** Desktop navigation: smart views, Projects and the account, always visible. */
export function Sidebar({ user }: { user: User }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <Logo className="h-11" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <SidebarNav />
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

/**
 * The views, then the user's Projects and Tags: the body of the desktop sidebar and of the phone
 * menu. `onNavigate` runs when a link is followed, so the phone menu can close.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data: sidebar } = useQuery(sidebarQuery);
  return (
    <>
      <nav aria-label="Views" className="flex flex-col gap-0.5 px-2 pt-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const count = to === "/inbox" ? sidebar?.inbox.open_count : undefined;
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              activeOptions={{ exact: true }}
              className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground data-[status=active]:bg-primary-soft data-[status=active]:text-primary lg:h-9"
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
    </>
  );
}
