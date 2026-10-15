import { LoaderCircle } from "lucide-react";
import { useId, useState, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

import { PasswordChangeError, useChangePassword } from "./session";

type ChangePasswordFormProps = {
  onSuccess: () => void;
  onCancel: () => void;
};

/** Changes the signed-in user's password after they confirm the current one. */
export function ChangePasswordForm({ onSuccess, onCancel }: ChangePasswordFormProps) {
  const changePassword = useChangePassword();
  const [mismatch, setMismatch] = useState(false);
  const messageId = useId();
  const currentId = useId();
  const newId = useId();
  const confirmId = useId();

  const error = mismatch
    ? "The new passwords don't match."
    : changePassword.error
      ? errorMessage(changePassword.error)
      : null;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = textField(form, "new_password");
    if (newPassword !== textField(form, "confirm_password")) {
      changePassword.reset();
      setMismatch(true);
      return;
    }
    setMismatch(false);
    changePassword.mutate(
      { current_password: textField(form, "current_password"), new_password: newPassword },
      { onSuccess },
    );
  }

  const invalidProps = error
    ? { "aria-invalid": true, "aria-describedby": messageId }
    : { "aria-invalid": undefined, "aria-describedby": undefined };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p
          id={messageId}
          role="alert"
          className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={currentId}>Current password</Label>
        <PasswordInput
          id={currentId}
          name="current_password"
          autoComplete="current-password"
          required
          {...invalidProps}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={newId}>New password</Label>
        <PasswordInput
          id={newId}
          name="new_password"
          autoComplete="new-password"
          required
          {...invalidProps}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={confirmId}>Confirm new password</Label>
        <PasswordInput
          id={confirmId}
          name="confirm_password"
          autoComplete="new-password"
          required
          {...invalidProps}
        />
      </div>
      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={changePassword.isPending}>
          {changePassword.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {changePassword.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: Error): string {
  return error instanceof PasswordChangeError
    ? error.message
    : "Couldn't reach the server. Check your connection and try again.";
}
