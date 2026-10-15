import { LoaderCircle, Mail } from "lucide-react";
import { useId, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

import { LoginError, useLogin, type User } from "./session";

type LoginFormProps = {
  onSuccess: (user: User) => void;
};

export function LoginForm({ onSuccess }: LoginFormProps) {
  const login = useLogin();
  const errorId = useId();
  const error = login.error ? errorMessage(login.error) : null;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    login.mutate(
      { email: textField(form, "email"), password: textField(form, "password") },
      { onSuccess },
    );
  }

  const invalidProps = error
    ? { "aria-invalid": true, "aria-describedby": errorId }
    : { "aria-invalid": undefined, "aria-describedby": undefined };

  return (
    <form
      onSubmit={handleSubmit}
      // Editing either field means the user is acting on the error, so stop showing it.
      onChange={() => {
        if (login.isError) {
          login.reset();
        }
      }}
      className="flex flex-col gap-4"
    >
      {error && (
        <p
          id={errorId}
          role="alert"
          className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder="you@example.com"
            required
            className="pl-9"
            {...invalidProps}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          {...invalidProps}
        />
      </div>
      <Button type="submit" size="lg" disabled={login.isPending} className="mt-1">
        {login.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
        {login.isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: Error): string {
  return error instanceof LoginError
    ? error.message
    : "Couldn't reach the server. Check your connection and try again.";
}
