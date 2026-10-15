import { Fragment } from "react";

import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

import { SHORTCUTS, keyCaps, shortcutsIn, type Shortcut, type ShortcutId } from "./registry";

const SECTIONS = [
  { scope: "global", title: "Anywhere" },
  { scope: "list", title: "Task list", note: "Task keys also work in the open drawer." },
  { scope: "detail", title: "Task drawer" },
] as const;

/** A shortcut's keys as key caps: `G` then `I`, or `J` / `↓` where either works. */
export function ShortcutKeys({ id }: { id: ShortcutId }) {
  const shortcut: Shortcut = SHORTCUTS[id];
  if (shortcut.hint) return <Kbd>{shortcut.hint}</Kbd>;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1 text-[11px] text-muted-foreground">
      {shortcut.keys.map((binding, index) => (
        <Fragment key={binding}>
          {index > 0 && <span>or</span>}
          {keyCaps(binding).map((press, step) => (
            <Fragment key={step}>
              {step > 0 && <span>then</span>}
              {press.map((cap) => (
                <Kbd key={cap}>{cap}</Kbd>
              ))}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

/** Every registered shortcut, grouped by where it works, as the `?` dialog and Settings list them. */
export function ShortcutList({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-6", className)}>
      {SECTIONS.map((section) => (
        <section key={section.scope} aria-label={section.title}>
          <h3 className="mb-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            {section.title}
          </h3>
          {"note" in section && (
            <p className="mb-1 text-xs text-muted-foreground">{section.note}</p>
          )}
          <dl className="divide-y divide-border/60">
            {shortcutsIn(section.scope).map(({ id, label }) => (
              <div key={id} className="flex min-h-9 items-center justify-between gap-4 py-1">
                <dt className="text-sm">{label}</dt>
                <dd>
                  <ShortcutKeys id={id} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
