import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LogOut,
  type LucideIcon,
  Palette,
  UserRound,
  X,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { UserAvatar } from "@/components/layout/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { User } from "@/features/auth/session";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { NotificationSettings } from "@/features/notifications/notification-settings";
import { PUSH_STATUS_LABELS, pushStatusQuery } from "@/features/notifications/push";
import { THEME_LABELS, useTheme } from "@/features/theme/theme";
import { ThemePicker } from "@/features/theme/theme-picker";
import { cn } from "@/lib/utils";

import { PasswordPage, ProfilePage } from "./account-pages";

type Page = "profile" | "password" | "notifications" | "appearance";

const PAGES: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: "profile", label: "Profile", icon: UserRound },
  { page: "password", label: "Password", icon: KeyRound },
  { page: "notifications", label: "Notifications", icon: Bell },
  { page: "appearance", label: "Appearance", icon: Palette },
];

type SettingsDialogProps = {
  user: User;
  /** The element that opens the dialog; it must accept a ref and an `onClick`, like a button. */
  children: ReactNode;
};

/**
 * Account and app settings, modelled on iOS and macOS Settings. Phones drill down from a list
 * of pages into one page at a time; from `sm` up the list stays beside the open page.
 */
export function SettingsDialog({ user, children }: SettingsDialogProps) {
  // `null` is the list on phones; wider screens show the profile beside it instead.
  const [page, setPage] = useState<Page | null>(null);
  const shown = page ?? "profile";
  const titleId = useId();

  return (
    <Dialog
      onOpenChange={() => {
        setPage(null);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="sm:h-[min(44rem,calc(100dvh-4rem))] sm:w-[min(64rem,calc(100vw-4rem))]"
      >
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "flex h-full w-[200%] transition-transform duration-300 ease-out motion-reduce:transition-none sm:w-full sm:translate-x-0",
              page && "-translate-x-1/2",
            )}
          >
            <SettingsNav
              user={user}
              current={shown}
              onSelect={setPage}
              className={cn(page && "max-sm:invisible")}
            />
            <section
              aria-labelledby={titleId}
              className={cn(
                "flex h-full w-1/2 min-w-0 flex-col sm:w-auto sm:flex-1",
                !page && "max-sm:invisible",
              )}
            >
              <div className="flex h-12 shrink-0 items-center sm:hidden">
                <button
                  type="button"
                  onClick={() => {
                    setPage(null);
                  }}
                  className="ml-1 flex h-10 items-center gap-0.5 rounded-md pr-3 pl-1 font-medium text-primary"
                >
                  <ChevronLeft className="size-5" aria-hidden />
                  Settings
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-12 sm:pt-12 sm:pb-10">
                <h2
                  id={titleId}
                  className="mb-5 text-3xl font-bold tracking-tight sm:mb-8 sm:text-2xl"
                >
                  {PAGES.find((item) => item.page === shown)?.label}
                </h2>
                <PageContent page={shown} user={user} />
              </div>
            </section>
          </div>

          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close settings"
              className="absolute top-1 right-2 text-muted-foreground sm:top-2"
            >
              <X aria-hidden />
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PageContent({ page, user }: { page: Page; user: User }) {
  switch (page) {
    case "profile":
      return <ProfilePage user={user} />;
    case "password":
      return <PasswordPage />;
    case "notifications":
      return <NotificationSettings />;
    case "appearance":
      return <ThemePicker />;
  }
}

type SettingsNavProps = {
  user: User;
  current: Page;
  onSelect: (page: Page) => void;
  className?: string;
};

/** The list of pages: a grouped list on phones, a sidebar from `sm` up. */
function SettingsNav({ user, current, onSelect, className }: SettingsNavProps) {
  const { data: pushStatus } = useQuery(pushStatusQuery);
  const theme = useTheme();
  const hints: Partial<Record<Page, string>> = {
    notifications: pushStatus && PUSH_STATUS_LABELS[pushStatus],
    appearance: THEME_LABELS[theme],
  };

  return (
    <nav
      aria-label="Settings"
      className={cn(
        "flex h-full w-1/2 shrink-0 flex-col overflow-y-auto sm:w-72 sm:border-r sm:border-border sm:bg-surface-muted",
        className,
      )}
    >
      <DialogTitle className="px-5 pt-5 pb-3 text-3xl font-bold tracking-tight sm:px-6 sm:pt-6 sm:pb-4 sm:text-xl">
        Settings
      </DialogTitle>

      <button
        type="button"
        aria-current={current === "profile" ? "page" : undefined}
        onClick={() => {
          onSelect("profile");
        }}
        className="mx-4 mb-3 flex items-center gap-3 rounded-xl bg-surface p-3 text-left sm:mx-3 sm:rounded-lg sm:bg-transparent sm:hover:bg-surface sm:aria-[current=page]:bg-primary-soft"
      >
        <UserAvatar user={user} className="size-12 text-base sm:size-11 sm:text-sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{user.full_name || user.email}</span>
          <span className="block truncate text-sm text-muted-foreground">{user.email}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground sm:hidden" aria-hidden />
      </button>

      <ul className="mx-4 overflow-hidden rounded-xl bg-surface sm:mx-3 sm:space-y-1 sm:bg-transparent">
        {PAGES.slice(1).map(({ page, label, icon }) => (
          <li key={page} className="border-t border-border first:border-t-0 sm:border-0">
            <NavRow
              icon={icon}
              label={label}
              hint={hints[page]}
              current={current === page}
              onClick={() => {
                onSelect(page);
              }}
            />
          </li>
        ))}
      </ul>

      <div className="mt-auto p-4 sm:p-3">
        <div className="flex min-h-12 items-center gap-3 rounded-xl bg-surface px-3 text-sm sm:min-h-11 sm:rounded-lg sm:bg-transparent">
          <IconTile icon={LogOut} className="bg-danger-soft text-danger" />
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}

type NavRowProps = {
  icon: LucideIcon;
  label: string;
  /** The page's current value, shown on phones where the page itself is out of sight. */
  hint: string | undefined;
  current: boolean;
  onClick: () => void;
};

function NavRow({ icon, label, hint, current, onClick }: NavRowProps) {
  return (
    <button
      type="button"
      aria-current={current ? "page" : undefined}
      onClick={onClick}
      className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm font-medium sm:min-h-11 sm:rounded-lg sm:hover:bg-surface sm:aria-[current=page]:bg-primary-soft sm:aria-[current=page]:text-primary"
    >
      <IconTile icon={icon} className="bg-primary-soft text-primary" />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-muted-foreground sm:hidden">{hint}</span>}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground sm:hidden" aria-hidden />
    </button>
  );
}

function IconTile({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", className)}>
      <Icon className="size-4" aria-hidden />
    </span>
  );
}
