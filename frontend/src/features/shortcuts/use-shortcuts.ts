import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef } from "react";
import { tinykeys, type KeyBindingMap } from "tinykeys";

import { sessionQuery } from "@/features/auth/session";

import {
  SHORTCUTS,
  isSingleKey,
  matchingBinding,
  worksInTextFields,
  type ShortcutId,
} from "./registry";

export type ShortcutHandlers = Partial<Record<ShortcutId, (event: KeyboardEvent) => void>>;

/** How long after G its second key still counts, as tinykeys waits between a sequence's presses. */
const CHORD_WINDOW = 1000;

/**
 * Whether a key press belongs to something the user is typing in or choosing from, where letters
 * are text or a menu's typeahead rather than shortcuts.
 */
export function inTextField(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      "input:not([type=checkbox],[type=radio],[type=button]), textarea, select, [contenteditable=''], [contenteditable=true], [role=menu], [role=listbox]",
    ) !== null
  );
}

let chordStartedAt = -Infinity;
let chordSecondKey: KeyboardEvent | null = null;

function trackChords(event: KeyboardEvent) {
  if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
  if (Date.now() - chordStartedAt < CHORD_WINDOW) {
    chordSecondKey = event;
    chordStartedAt = -Infinity;
  } else if (event.key === "g" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (!inTextField(event.target)) chordStartedAt = Date.now();
  }
}

let watchingChords = false;

/**
 * Note each G and the key after it before anything else sees them, so that in `G T` the T goes
 * to Today and not to a focused Task's Tag picker.
 */
function watchChords() {
  if (watchingChords) return;
  watchingChords = true;
  window.addEventListener("keydown", trackChords, { capture: true });
}

/** Whether the user wants shortcuts of one unmodified key; they do until they say otherwise. */
export function useSingleKeyShortcuts(): boolean {
  const { data: user } = useQuery(sessionQuery);
  return user?.single_key_shortcuts ?? true;
}

function allowed(event: KeyboardEvent, binding: string, sequence: boolean) {
  if (event.defaultPrevented) return false;
  if (inTextField(event.target) && !worksInTextFields(binding)) return false;
  return sequence || event !== chordSecondKey;
}

/**
 * Run the first of `handlers` whose shortcut this key press is, as an element's own key handler
 * does. Returns whether one ran; its key's default action is then prevented.
 */
export function runShortcut(
  event: KeyboardEvent,
  handlers: ShortcutHandlers,
  singleKey: boolean,
): boolean {
  // `Object.entries` types keys as strings; ShortcutHandlers is keyed by ShortcutId only.
  const entries = Object.entries(handlers) as [ShortcutId, (event: KeyboardEvent) => void][];
  for (const [id, handler] of entries) {
    const binding = matchingBinding(event, id);
    if (binding === undefined || (!singleKey && isSingleKey(binding))) continue;
    if (!allowed(event, binding, false)) continue;
    event.preventDefault();
    handler(event);
    return true;
  }
  return false;
}

/**
 * Bind shortcuts to the whole page while the component is mounted. Keys typed into a text field
 * stay there, except Esc, Mod+K and Mod+Enter; G chords win over the key after G; and when the
 * user has turned single-key shortcuts off, only modified and non-character keys work.
 */
export function useShortcuts(handlers: ShortcutHandlers, enabled = true) {
  const singleKey = useSingleKeyShortcuts();
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });
  const ids = Object.keys(handlers).join(" ");

  useEffect(() => {
    if (!enabled) return;
    watchChords();
    const bindings: KeyBindingMap = {};
    // `ids` is the handlers' keys joined, so every part is a ShortcutId.
    for (const id of ids.split(" ").filter(Boolean) as ShortcutId[]) {
      for (const binding of SHORTCUTS[id].keys) {
        if (!singleKey && isSingleKey(binding)) continue;
        const sequence = binding.includes(" ");
        bindings[binding] = (event) => {
          if (!allowed(event, binding, sequence)) return;
          event.preventDefault();
          latest.current[id]?.(event);
        };
      }
    }
    return tinykeys(window, bindings);
  }, [ids, enabled, singleKey]);
}
