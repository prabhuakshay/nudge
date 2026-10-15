import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/brand/logo";
import type { User } from "@/features/auth/session";

import { NAV_ITEMS } from "./nav-items";
import { UserAvatar } from "./user-avatar";

/** Desktop navigation: smart views, lists and the account, always visible. */
export function Sidebar({ user }: { user: User }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="px-6 pt-6 pb-8">
        <Logo />
      </div>

      <nav aria-label="Views" className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            className="flex h-11 items-center gap-3 rounded-md px-3 font-semibold text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground data-[status=active]:bg-primary-soft data-[status=active]:text-primary"
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      <section aria-labelledby="lists-heading" className="mt-8 px-6">
        <h2
          id="lists-heading"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          Lists
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">Lists you create will appear here.</p>
      </section>

      <div className="mt-auto border-t border-border p-3">
        <Link
          to="/account"
          className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-muted data-[status=active]:bg-primary-soft"
        >
          <UserAvatar user={user} />
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
