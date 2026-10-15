import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLogout } from "@/features/auth/session";

/** Ends the session and returns to the login page, even if the server call fails. */
export function SignOutButton() {
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <Button
      variant="danger"
      disabled={logout.isPending}
      onClick={() => {
        logout.mutate(undefined, {
          onSettled: () => void navigate({ to: "/login" }),
        });
      }}
    >
      <LogOut aria-hidden />
      {logout.isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
