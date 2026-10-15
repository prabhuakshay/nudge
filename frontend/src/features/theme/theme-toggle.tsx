import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

import { saveTheme, type Theme, useTheme } from "./theme";

type Scheme = Exclude<Theme, "system">;

function systemScheme(): Scheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** One-tap switch between light and dark, starting from whatever is showing now. */
export function ThemeToggle() {
  const theme = useTheme();
  const scheme = theme === "system" ? systemScheme() : theme;
  const dark = scheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="text-muted-foreground"
      onClick={() => {
        const next = dark ? "light" : "dark";
        // Matching the system again hands control back to it, so the app follows later OS changes.
        saveTheme(next === systemScheme() ? "system" : next);
      }}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
