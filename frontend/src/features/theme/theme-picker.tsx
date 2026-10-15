import { cn } from "@/lib/utils";

import { saveTheme, type Theme, THEME_LABELS, THEMES, useTheme } from "./theme";

/** Light, dark or system, as cards with a small preview of each. */
export function ThemePicker() {
  const theme = useTheme();

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-sm text-muted-foreground">
        Saved on this device. System follows your device&apos;s setting.
      </legend>
      <div className="grid grid-cols-3 gap-3">
        {THEMES.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer flex-col gap-2 rounded-xl border-2 border-border p-2 text-center text-sm font-medium has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
          >
            <input
              type="radio"
              name="theme"
              value={option}
              checked={theme === option}
              onChange={() => {
                saveTheme(option);
              }}
              className="sr-only"
            />
            <span className="block h-16 overflow-hidden rounded-lg border border-border">
              <ThemePreview theme={option} />
            </span>
            {THEME_LABELS[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ThemePreview({ theme }: { theme: Theme }) {
  if (theme !== "system") return <Swatch scheme={theme} />;
  return (
    <span aria-hidden className="flex size-full">
      <Swatch scheme="light" />
      <Swatch scheme="dark" />
    </span>
  );
}

/** A miniature page drawn with the theme tokens, forced to one scheme. */
function Swatch({ scheme }: { scheme: "light" | "dark" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-full flex-col gap-1 bg-background p-2",
        scheme === "light" ? "scheme-light" : "scheme-dark",
      )}
    >
      <span className="h-2 w-8 max-w-full rounded-sm bg-primary" />
      <span className="h-3 rounded-sm bg-surface" />
      <span className="h-3 rounded-sm bg-surface" />
    </span>
  );
}
