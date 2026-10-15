import * as Tabs from "@radix-ui/react-tabs";
import { UserRound, X } from "lucide-react";
import { type ReactNode, useState } from "react";

import { UserAvatar } from "@/components/layout/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChangePasswordForm } from "@/features/auth/change-password-form";
import { EditNameForm } from "@/features/auth/edit-name-form";
import type { User } from "@/features/auth/session";
import { SignOutButton } from "@/features/auth/sign-out-button";

const TABS = [{ value: "account", label: "Account", icon: UserRound }] as const;

type SettingsDialogProps = {
  user: User;
  /** The element that opens the dialog; it must accept a ref and an `onClick`, like a button. */
  children: ReactNode;
};

/** Account and app settings in a modal with a tab per area, modelled on TickTick's. */
export function SettingsDialog({ user, children }: SettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="sm:h-[min(36rem,calc(100dvh-4rem))] sm:w-[min(50rem,calc(100vw-4rem))]"
      >
        <Tabs.Root defaultValue="account" className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div className="flex shrink-0 flex-col gap-1 border-b border-border p-2 sm:w-52 sm:border-r sm:border-b-0">
            <DialogTitle className="px-2.5 pt-2 pb-1 font-bold">Settings</DialogTitle>
            <Tabs.List aria-label="Settings" className="flex gap-0.5 sm:flex-col">
              {TABS.map(({ value, label, icon: Icon }) => (
                <Tabs.Trigger
                  key={value}
                  value={value}
                  className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted data-[state=active]:bg-surface-muted data-[state=active]:font-semibold"
                >
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:px-6 sm:pt-10">
            <Tabs.Content
              value="account"
              className="flex flex-col gap-4 focus-visible:outline-none"
            >
              <AccountTab user={user} />
            </Tabs.Content>
          </div>
        </Tabs.Root>

        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close settings"
            className="absolute top-[calc(env(safe-area-inset-top)+0.5rem)] right-2 text-muted-foreground sm:top-2"
          >
            <X aria-hidden />
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function AccountTab({ user }: { user: User }) {
  const [passwordChanged, setPasswordChanged] = useState(false);

  return (
    <>
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <UserAvatar user={user} className="size-16 text-xl" />
        <p className="max-w-full truncate font-semibold">{user.full_name || user.email}</p>
      </div>

      <Group>
        <Row label="Email">
          <span className="truncate text-muted-foreground">{user.email}</span>
        </Row>
        <Row label="Name">
          <span className="mr-4 truncate text-muted-foreground">{user.full_name || "Not set"}</span>
          <ActionDialog action="Edit" title="Edit name">
            {(close) => (
              <EditNameForm fullName={user.full_name} onSuccess={close} onCancel={close} />
            )}
          </ActionDialog>
        </Row>
        <Row label="Password">
          {passwordChanged && (
            <span role="status" className="mr-4 text-muted-foreground">
              Changed
            </span>
          )}
          <ActionDialog action="Change password" title="Change password">
            {(close) => (
              <ChangePasswordForm
                onCancel={close}
                onSuccess={() => {
                  close();
                  setPasswordChanged(true);
                }}
              />
            )}
          </ActionDialog>
        </Row>
      </Group>

      <Group>
        <Row label="Sign out of this device">
          <SignOutButton />
        </Row>
      </Group>
    </>
  );
}

type ActionDialogProps = {
  /** Text of the link that opens the dialog. */
  action: string;
  title: string;
  /** The dialog's form, given a function that closes the dialog. */
  children: (close: () => void) => ReactNode;
};

/** A small dialog stacked over the settings for one change, as TickTick does it. */
function ActionDialog({ action, title, children }: ActionDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label={action === title ? undefined : title}
        className="font-medium text-primary hover:underline"
      >
        {action}
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="p-4 sm:w-[min(24rem,calc(100vw-2rem))] sm:p-6"
      >
        <DialogTitle className="mb-4 text-lg font-bold">{title}</DialogTitle>
        {children(() => {
          setOpen(false);
        })}
      </DialogContent>
    </Dialog>
  );
}

/** A rounded block of settings rows, like a grouped table on iOS. */
function Group({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-surface-muted">{children}</div>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex min-w-0 items-center">{children}</div>
    </div>
  );
}
