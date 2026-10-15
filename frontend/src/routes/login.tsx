import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import markWhite from "@/assets/brand/mark-mono-white.svg";
import wordmarkWhite from "@/assets/brand/wordmark-white.svg";
import { Logo } from "@/components/brand/logo";
import { LoginForm } from "@/features/auth/login-form";
import { safeRedirectPath } from "@/features/auth/redirect";
import { getSession } from "@/features/auth/session";

type LoginSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {},
  beforeLoad: async ({ context, search }) => {
    const user = await getSession(context.queryClient);
    if (user) {
      throw redirect({ href: safeRedirectPath(search.redirect) });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect: target } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <BrandPanel />

      <main className="flex flex-col px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-10">
        <Logo className="lg:hidden" />

        <div className="my-auto w-full max-w-sm self-center py-8">
          <h1 className="text-2xl font-extrabold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to see what&apos;s on today.</p>

          <div className="mt-6">
            <LoginForm
              onSuccess={() => void navigate({ href: safeRedirectPath(target), replace: true })}
            />
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            No account yet? Ask the person who runs this Nudge server to create one for you.
          </p>
        </div>
      </main>
    </div>
  );
}

/** Desktop-only brand panel: the mark large, on brand blue. */
function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-brand-surface p-12 lg:flex lg:flex-col">
      <img src={wordmarkWhite} alt="Nudge" className="h-9 w-fit" />
      <img
        src={markWhite}
        alt=""
        className="absolute -right-24 -bottom-24 w-[28rem] rotate-[-8deg] opacity-15"
      />
      <div className="relative mt-auto max-w-sm text-on-brand">
        <p className="text-4xl leading-tight font-extrabold tracking-tight text-balance">
          Small pushes. Things get done.
        </p>
        <p className="mt-4 text-lg text-on-brand/80">
          Your tasks, lists and reminders, on a server you control.
        </p>
      </div>
    </aside>
  );
}
