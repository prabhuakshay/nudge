/**
 * Every keyboard shortcut in Nudge, in one place. Handlers, the `?` dialog, tooltips and menus
 * all read their keys from here, so a key is changed once and shows the same everywhere.
 */
import { matchKeyBindingPress, parseKeybinding } from "tinykeys";

/**
 * Where a shortcut works: anywhere, on a focused row of a Task list (Task keys also work in the
 * open drawer), or in the Task drawer.
 */
export type ShortcutScope = "global" | "list" | "detail";

export type Shortcut = {
  /**
   * tinykeys key bindings: `Shift+Tab`, `$mod+z` (⌘ on Apple devices, Ctrl elsewhere), or a
   * sequence such as `g i`. Any one of them triggers the shortcut.
   */
  keys: readonly string[];
  scope: ShortcutScope;
  label: string;
  /** How the keys read when listing each would be noise, such as `0–4`. */
  hint?: string;
};

export const SHORTCUTS = {
  quickAdd: { keys: ["c"], scope: "global", label: "Add a task" },
  showShortcuts: { keys: ["Shift+?"], scope: "global", label: "Show keyboard shortcuts" },
  undo: { keys: ["$mod+z"], scope: "global", label: "Undo the last change" },
  goToInbox: { keys: ["g i"], scope: "global", label: "Go to Inbox" },
  goToToday: { keys: ["g t"], scope: "global", label: "Go to Today" },
  goToUpcoming: { keys: ["g u"], scope: "global", label: "Go to Upcoming" },
  goToSearch: { keys: ["g s"], scope: "global", label: "Go to Search" },
  goToTrash: { keys: ["g x"], scope: "global", label: "Go to Trash" },
  goToSettings: { keys: ["g ,"], scope: "global", label: "Open Settings" },

  previousRow: { keys: ["ArrowUp", "k"], scope: "list", label: "Previous task" },
  nextRow: { keys: ["ArrowDown", "j"], scope: "list", label: "Next task" },
  openTask: { keys: ["Enter"], scope: "list", label: "Open the task" },
  completeTask: { keys: ["Space"], scope: "list", label: "Complete or reopen" },
  indent: { keys: ["Tab"], scope: "list", label: "Nest under the task above" },
  outdent: { keys: ["Shift+Tab"], scope: "list", label: "Move out a level" },
  moveUp: { keys: ["Alt+ArrowUp"], scope: "list", label: "Move up" },
  moveDown: { keys: ["Alt+ArrowDown"], scope: "list", label: "Move down" },
  setPriority: {
    keys: ["0", "1", "2", "3", "4"],
    scope: "list",
    label: "Set priority (none, P1–P4)",
    hint: "0–4",
  },
  setDate: { keys: ["d"], scope: "list", label: "Set date" },
  addTag: { keys: ["t"], scope: "list", label: "Add tag" },
  moveToProject: { keys: ["m"], scope: "list", label: "Move to project" },
  markBlocked: { keys: ["b"], scope: "list", label: "Mark blocked" },
  markWontDo: { keys: ["w"], scope: "list", label: "Won't do" },
  togglePin: { keys: ["p"], scope: "list", label: "Pin or unpin" },
  editTitle: { keys: ["e", "F2"], scope: "list", label: "Edit title" },
  deleteTask: { keys: ["Backspace", "Delete"], scope: "list", label: "Delete" },

  previousTask: { keys: ["k", "ArrowUp"], scope: "detail", label: "Previous task" },
  nextTask: { keys: ["j", "ArrowDown"], scope: "detail", label: "Next task" },
  sendComment: { keys: ["$mod+Enter"], scope: "detail", label: "Send comment" },
  back: {
    keys: ["Escape"],
    scope: "detail",
    label: "Back out: picker, then edit, then the drawer",
  },
} as const satisfies Record<string, Shortcut>;

export type ShortcutId = keyof typeof SHORTCUTS;

/** The shortcuts of one scope, in the order the registry lists them. */
export function shortcutsIn(scope: ShortcutScope): (Shortcut & { id: ShortcutId })[] {
  return (Object.entries(SHORTCUTS) as [ShortcutId, Shortcut][])
    .filter(([, shortcut]) => shortcut.scope === scope)
    .map(([id, shortcut]) => ({ id, ...shortcut }));
}

/** Which of a shortcut's key bindings a single key press is, if any. Sequences never match. */
export function matchingBinding(event: KeyboardEvent, id: ShortcutId): string | undefined {
  const keys: readonly string[] = SHORTCUTS[id].keys;
  return keys.find((binding) => {
    const [press, ...rest] = parseKeybinding(binding);
    return press !== undefined && rest.length === 0 && matchKeyBindingPress(event, press);
  });
}

/** Whether a single key press is one of a shortcut's bindings. */
export function matchesShortcut(event: KeyboardEvent, id: ShortcutId): boolean {
  return matchingBinding(event, id) !== undefined;
}

/**
 * Whether a key binding is made only of character keys, so speech input could type it. These
 * are the ones the "Single-key shortcuts" setting turns off (WCAG 2.1.4).
 */
export function isSingleKey(binding: string): boolean {
  return parseKeybinding(binding).every(
    ([mods, key]) =>
      typeof key === "string" && key.length === 1 && mods.every((mod) => mod === "Shift"),
  );
}

const FIELD_KEYS = new Set(["Escape", "$mod+k", "$mod+Enter"]);

/** Whether a key binding works while typing in a text field; every other key is the field's. */
export function worksInTextFields(binding: string): boolean {
  return FIELD_KEYS.has(binding);
}

/** Whether this is an Apple device, where `$mod` is ⌘ and modifiers read as symbols. */
export const APPLE =
  typeof navigator === "object" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

const KEY_NAMES: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "Esc",
  Delete: "Del",
  Backspace: "⌫",
};

function modName(mod: string, apple: boolean) {
  const names: Record<string, [apple: string, other: string]> = {
    $mod: ["⌘", "Ctrl"],
    Meta: ["⌘", "Win"],
    Control: ["⌃", "Ctrl"],
    Alt: ["⌥", "Alt"],
    Shift: ["⇧", "Shift"],
  };
  const name = names[mod];
  return name ? name[apple ? 0 : 1] : mod;
}

/**
 * A key binding as the key caps to show for each press: `g i` is `[["G"], ["I"]]` and `$mod+z`
 * is `[["Ctrl", "Z"]]`. Shift is left out before a symbol it is needed to type, as in `?`.
 */
export function keyCaps(binding: string, apple = APPLE): string[][] {
  return binding.split(" ").map((press) => {
    const parts = press.split(/\b\+/);
    const key = parts.pop() ?? "";
    const symbol = key.length === 1 && !/[a-z0-9]/i.test(key);
    const mods = parts.filter((mod) => !(symbol && mod === "Shift"));
    const name = KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
    return [...mods.map((mod) => modName(mod, apple)), name];
  });
}

/**
 * A shortcut's keys for `aria-keyshortcuts`, such as `K ArrowUp`. Sequences such as `G I` have no
 * way to be written there, so they are left out.
 */
export function ariaKeyShortcuts(id: ShortcutId, apple = APPLE): string {
  const keys: readonly string[] = SHORTCUTS[id].keys;
  return keys
    .filter((binding) => !binding.includes(" "))
    .map((binding) =>
      binding
        .replace("$mod", apple ? "Meta" : "Control")
        .replace(/(^|\+)([a-z])$/, (_, plus: string, key: string) => plus + key.toUpperCase()),
    )
    .join(" ");
}

/** A shortcut's first key binding as plain text for a tooltip or menu, such as `G then I`. */
export function shortcutText(id: ShortcutId, apple = APPLE): string {
  const shortcut: Shortcut = SHORTCUTS[id];
  if (shortcut.hint) return shortcut.hint;
  const [binding = ""] = shortcut.keys;
  return keyCaps(binding, apple)
    .map((press) => press.join(apple ? "" : "+"))
    .join(" then ");
}
