/** The colour theme preference, kept per device in localStorage and applied to `<html>`. */
import { useSyncExternalStore } from "react";

export const THEMES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const listeners = new Set<() => void>();

/** Must match the key read by the inline script in index.html. */
const STORAGE_KEY = "nudge-theme";

function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme); // `includes` on a readonly tuple only accepts its own members.
}

/** The saved preference, or `system` when none is saved or storage is unavailable. */
export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isTheme(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

/** Applies the theme to the page and remembers it on this device. */
export function saveTheme(theme: Theme): void {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
  try {
    if (theme === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch {
    // Storage can be blocked (private mode); the theme still applies for this visit.
  }
  listeners.forEach((listener) => {
    listener();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The saved preference, kept in sync with every `saveTheme` so all theme controls agree. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme);
}
