import type { ReactNode } from "react";

/** A rounded block of settings rows, like a grouped table on iOS. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-surface-muted">{children}</div>;
}

/** One labelled setting, with its value or actions on the right. */
export function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex min-w-0 items-center">{children}</div>
    </div>
  );
}
