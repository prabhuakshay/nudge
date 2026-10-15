import { Link } from "@tanstack/react-router";

import { NAV_ITEMS } from "./nav-items";

/** Mobile navigation pinned to the bottom of the screen, within thumb reach. */
export function BottomNav() {
  return (
    <nav
      aria-label="Views"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              activeOptions={{ exact: true }}
              className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-muted-foreground data-[status=active]:text-primary"
            >
              <Icon className="size-6" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
