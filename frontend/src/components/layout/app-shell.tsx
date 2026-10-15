import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/logo";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { User } from "@/features/auth/session";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { ThemeToggle } from "@/features/theme/theme-toggle";
import { TimeZoneBanner } from "@/features/time-zone/time-zone-banner";

import { BottomNav } from "./bottom-nav";
import { Clock } from "./clock";
import { Sidebar } from "./sidebar";
import { UserAvatar } from "./user-avatar";

/**
 * The signed-in layout. A top bar holds notifications and the theme switch everywhere. Mobile
 * adds the logo and account there plus bottom navigation; from the `lg` breakpoint those move
 * into a permanent sidebar. It also hosts the toasts and tooltips every page can use.
 */
export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex min-h-dvh">
        <Sidebar user={user} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface px-4 pt-[env(safe-area-inset-top)] lg:px-8">
            <span className="lg:hidden">
              <LogoMark className="size-8" />
            </span>
            {/* On phones the clock is fixed to the viewport, so the top bar must not use backdrop-blur:
              a backdrop filter would trap fixed children inside the bar. */}
            <Clock />
            <div className="flex items-center gap-1">
              <NotificationCenter />
              <ThemeToggle />
              <SettingsDialog user={user}>
                <button
                  type="button"
                  aria-label="Settings"
                  className="flex size-11 items-center justify-center rounded-full lg:hidden"
                >
                  <UserAvatar user={user} />
                </button>
              </SettingsDialog>
            </div>
          </header>

          <TimeZoneBanner user={user} />

          <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-24 sm:px-6 lg:px-8 lg:pt-6 lg:pb-8">
            {children}
          </main>
        </div>

        <BottomNav />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
