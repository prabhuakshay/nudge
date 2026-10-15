import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/logo";
import type { User } from "@/features/auth/session";

import { AccountMenu } from "./account-menu";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";

/**
 * The signed-in layout. Mobile gets a top bar and bottom navigation; from the `lg`
 * breakpoint the navigation moves into a permanent sidebar.
 */
export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar user={user} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <LogoMark className="size-8" />
          <AccountMenu user={user} />
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-12 lg:pb-12">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
