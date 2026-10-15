import { LoaderCircle } from "lucide-react";
import { useId, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
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
