/**
 * Whether the Calendar shows Closed Tasks. Kept in localStorage: it's a convenience, so a browser
 * that can't store it shows them on every visit.
 */
import { useState } from "react";

const KEY = "nudge.calendar-show-closed";

function readShowClosed(): boolean {
  try {
    return localStorage.getItem(KEY) !== "false";
  } catch {
    return true;
  }
}

/** The Calendar's Closed toggle, remembered in this browser across visits. */
export function useShowClosed(): [boolean, (show: boolean) => void] {
  const [showClosed, setShowClosed] = useState(readShowClosed);
  const change = (show: boolean) => {
    setShowClosed(show);
    try {
      localStorage.setItem(KEY, String(show));
    } catch {
      // Storage is full or blocked; the choice still holds for this visit.
    }
  };
  return [showClosed, change];
}
