import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";

import { readTheme, saveTheme, type Theme } from "./theme";

const OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const satisfies readonly { value: Theme; label: string; icon: typeof Sun }[];

/** Segmented radio group for choosing between the system, light and dark themes. */
export function ThemePicker() {
  const [theme, setTheme] = useState(readTheme);

  return (
    <fieldset className="grid grid-cols-3 gap-1 rounded-lg bg-surface-muted p-1">
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <label
          key={value}
          className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-semibold text-muted-foreground transition-colors has-checked:bg-surface has-checked:text-foreground has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={theme === value}
            onChange={() => {
              saveTheme(value);
              setTheme(value);
            }}
            className="sr-only"
          />
          <Icon className="size-4" aria-hidden />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
