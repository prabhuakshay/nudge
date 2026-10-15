import { useEffect, useId, useRef, useState } from "react";

import type { User } from "@/features/auth/session";

import { SignOutButton } from "./sign-out-button";
import { UserAvatar } from "./user-avatar";

/** Avatar button that opens the account panel on mobile. Closes on Escape or outside tap. */
export function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="rounded-full"
      >
        <UserAvatar user={user} />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-12 right-0 z-30 w-64 rounded-lg border border-border bg-surface p-2 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{user.full_name || user.email}</p>
            {user.full_name && (
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            )}
          </div>
          <SignOutButton className="w-full" />
        </div>
      )}
    </div>
  );
}
