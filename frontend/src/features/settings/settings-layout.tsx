import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A tinted block that holds one setting or form on a settings page. */
export function SettingsCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl bg-surface-muted p-4 sm:p-5", className)}>{children}</div>;
}

/** The stack of cards that makes up one settings page. */
export function SettingsStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 sm:max-w-xl sm:gap-6">{children}</div>;
}
