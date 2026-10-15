import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useId } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { UserAvatar } from "@/components/layout/user-avatar";
import { SignOutButton } from "@/features/auth/sign-out-button";

export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
});

function AccountPage() {
  const { user } = Route.useRouteContext();
  return (
    <>
      <PageHeader title="Account" />
      <div className="flex flex-col gap-8">
        <Section title="Profile">
          <div className="flex items-center gap-4 p-4">
            <UserAvatar user={user} className="size-14 text-lg" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{user.full_name || user.email}</p>
              {user.full_name && (
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              )}
            </div>
          </div>
        </Section>

        <Section title="Session">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="font-semibold">Sign out of Nudge</p>
              <p className="text-sm text-muted-foreground">
                You&apos;ll need your email and password to sign back in on this device.
              </p>
            </div>
            <SignOutButton />
          </div>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="mb-2 px-1 text-xs font-bold tracking-wider text-muted-foreground uppercase"
      >
        {title}
      </h2>
      <div className="rounded-xl border border-border bg-surface">{children}</div>
    </section>
  );
}
