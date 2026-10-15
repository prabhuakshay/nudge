import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLogout } from "@/features/auth/session";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      className={cn("justify-start", className)}
      disabled={logout.isPending}
      onClick={() => {
        logout.mutate(undefined, {
          onSettled: () => void navigate({ to: "/login" }),
        });
      }}
    >
      <LogOut aria-hidden />
      Sign out
    </Button>
  );
}
