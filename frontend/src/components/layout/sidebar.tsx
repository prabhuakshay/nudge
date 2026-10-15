import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/brand/logo";
import type { User } from "@/features/auth/session";

import { Clock } from "./clock";
import { NAV_ITEMS } from "./nav-items";
import { UserAvatar } from "./user-avatar";

/** Desktop navigation: smart views, lists and the account, always visible. */
export function Sidebar({ user }: { user: User }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex flex-col gap-1 px-4 pt-5 pb-5">
        <Logo />
        <Clock />
      </div>

      <nav aria-label="Views" className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground data-[status=active]:bg-primary-soft data-[status=active]:text-primary"
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      <section aria-labelledby="lists-heading" className="mt-6 px-4">
        <h2
          id="lists-heading"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          Lists
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Lists you create will appear here.</p>
      </section>

      <div className="mt-auto border-t border-border p-2">
        <Link
          to="/account"
          className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-muted data-[status=active]:bg-primary-soft"
        >
          <UserAvatar
            user={user}
            className="group-data-[status=active]:bg-primary group-data-[status=active]:text-primary-foreground"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.full_name || user.email}</p>
            {user.full_name && (
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            )}
          </div>
        </Link>
      </div>
    </aside>
  );
}
