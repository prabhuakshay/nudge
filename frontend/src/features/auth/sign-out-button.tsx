import { useNavigate } from "@tanstack/react-router";

import { useLogout } from "@/features/auth/session";

/** Ends the session and returns to the login page, even if the server call fails. */
export function SignOutButton() {
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      disabled={logout.isPending}
      onClick={() => {
        logout.mutate(undefined, {
          onSettled: () => void navigate({ to: "/login" }),
        });
      }}
      className="font-medium text-danger hover:underline disabled:opacity-60"
    >
      {logout.isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
