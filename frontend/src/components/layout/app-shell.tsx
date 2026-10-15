import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/logo";
import type { User } from "@/features/auth/session";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { ThemeToggle } from "@/features/theme/theme-toggle";

import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { UserAvatar } from "./user-avatar";

/**
 * The signed-in layout. Mobile gets a top bar and bottom navigation; from the `lg`
 * breakpoint the navigation moves into a permanent sidebar.
 */
export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar user={user} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <LogoMark className="size-7" />
          <div className="flex items-center gap-1">
            <NotificationCenter />
            <ThemeToggle />
            <SettingsDialog user={user}>
              <button type="button" aria-label="Settings" className="rounded-full">
                <UserAvatar user={user} />
              </button>
            </SettingsDialog>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-24 sm:px-6 lg:px-8 lg:pt-8 lg:pb-8">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
