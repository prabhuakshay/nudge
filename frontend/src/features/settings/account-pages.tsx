import { useState } from "react";

import { UserAvatar } from "@/components/layout/user-avatar";
import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "@/features/auth/change-password-form";
import { EditNameForm } from "@/features/auth/edit-name-form";
import type { User } from "@/features/auth/session";

import { SettingsCard, SettingsStack } from "./settings-layout";

/** The signed-in user's name and email, with the name editable in place. */
export function ProfilePage({ user }: { user: User }) {
  const [editing, setEditing] = useState(false);

  return (
    <SettingsStack>
      <div className="flex items-center gap-4">
        <UserAvatar user={user} className="size-16 text-xl" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{user.full_name || "No name set"}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <SettingsCard>
        {editing ? (
          <EditNameForm
            fullName={user.full_name}
            onSuccess={() => {
              setEditing(false);
            }}
            onCancel={() => {
              setEditing(false);
            }}
          />
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium">Full name</p>
              <p className="truncate text-sm text-muted-foreground">
                {user.full_name || "Not set"}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(true);
              }}
            >
              Edit
            </Button>
          </div>
        )}
      </SettingsCard>
      <p className="text-xs text-muted-foreground">
        Your email is how you sign in, so only an administrator can change it.
      </p>
    </SettingsStack>
  );
}

/** Changing the password, behind a button so the form only shows when wanted. */
export function PasswordPage() {
  const [editing, setEditing] = useState(false);
  const [changed, setChanged] = useState(false);

  return (
    <SettingsStack>
      <SettingsCard>
        {editing ? (
          <ChangePasswordForm
            onSuccess={() => {
              setEditing(false);
              setChanged(true);
            }}
            onCancel={() => {
              setEditing(false);
            }}
          />
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Password</p>
              <p className="text-sm text-muted-foreground">
                {changed ? <span role="status">Changed.</span> : "Used with your email to sign in."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(true);
                setChanged(false);
              }}
            >
              Change password
            </Button>
          </div>
        )}
      </SettingsCard>
    </SettingsStack>
  );
}
