import { describe, expect, it } from "vitest";

import {
  SHORTCUTS,
  ariaKeyShortcuts,
  isSingleKey,
  keyCaps,
  matchesShortcut,
  shortcutsIn,
  worksInTextFields,
} from "./registry";

function press(key: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", { key, ...init });
}

describe("the shortcut registry", () => {
  it("files every shortcut under one scope", () => {
    const ids = [...shortcutsIn("global"), ...shortcutsIn("list"), ...shortcutsIn("detail")].map(
      (shortcut) => shortcut.id,
    );

    expect(ids.sort()).toEqual(Object.keys(SHORTCUTS).sort());
    expect(shortcutsIn("global").map((shortcut) => shortcut.id)).toContain("goToInbox");
    expect(shortcutsIn("detail").map((shortcut) => shortcut.id)).toContain("nextTask");
  });

  it("navigates with G chords", () => {
    expect(SHORTCUTS.goToInbox.keys).toEqual(["g i"]);
    expect(SHORTCUTS.goToToday.keys).toEqual(["g t"]);
    expect(SHORTCUTS.goToUpcoming.keys).toEqual(["g u"]);
    expect(SHORTCUTS.goToMatrix.keys).toEqual(["g m"]);
    expect(SHORTCUTS.goToAll.keys).toEqual(["g a"]);
    expect(SHORTCUTS.goToSearch.keys).toEqual(["g s"]);
    expect(SHORTCUTS.goToTrash.keys).toEqual(["g x"]);
    expect(SHORTCUTS.goToHabits.keys).toEqual(["g h"]);
    expect(SHORTCUTS.goToSettings.keys).toEqual(["g ,"]);
  });

  it("opens the command bar with Mod+K, even from a text field, or with /", () => {
    expect(matchesShortcut(press("k", { ctrlKey: true }), "openCommandBar")).toBe(true);
    expect(matchesShortcut(press("/"), "openCommandBar")).toBe(true);
    expect(worksInTextFields("$mod+k")).toBe(true);
    expect(worksInTextFields("/")).toBe(false);
  });

  it("matches a key press to its shortcut, modifiers included", () => {
    expect(matchesShortcut(press("d"), "setDate")).toBe(true);
    expect(matchesShortcut(press("D", { shiftKey: true }), "setDate")).toBe(false);
    expect(matchesShortcut(press("F2"), "editTitle")).toBe(true);
    expect(matchesShortcut(press("Backspace"), "deleteTask")).toBe(true);
    expect(matchesShortcut(press("Tab", { shiftKey: true }), "outdent")).toBe(true);
    expect(matchesShortcut(press("Tab", { shiftKey: true }), "indent")).toBe(false);
  });

  it("tells single-key shortcuts from keys that are safe from speech input", () => {
    expect(isSingleKey("c")).toBe(true);
    expect(isSingleKey("g i")).toBe(true);
    expect(isSingleKey("Shift+?")).toBe(true);
    expect(isSingleKey("Escape")).toBe(false);
    expect(isSingleKey("ArrowDown")).toBe(false);
    expect(isSingleKey("F2")).toBe(false);
    expect(isSingleKey("$mod+z")).toBe(false);
  });

  it("lets only Esc, Mod+K and Mod+Enter through in a text field", () => {
    expect(worksInTextFields("Escape")).toBe(true);
    expect(worksInTextFields("$mod+k")).toBe(true);
    expect(worksInTextFields("$mod+Enter")).toBe(true);
    expect(worksInTextFields("$mod+z")).toBe(false);
    expect(worksInTextFields("c")).toBe(false);
  });

  it("writes single presses for aria-keyshortcuts", () => {
    expect(ariaKeyShortcuts("nextTask", false)).toBe("J ArrowDown");
    expect(ariaKeyShortcuts("undo", false)).toBe("Control+Z");
    expect(ariaKeyShortcuts("undo", true)).toBe("Meta+Z");
    expect(ariaKeyShortcuts("goToInbox", false)).toBe("");
  });

  it("spells each press of a key binding as key caps", () => {
    expect(keyCaps("g ,", false)).toEqual([["G"], [","]]);
    expect(keyCaps("Shift+?", false)).toEqual([["?"]]);
    expect(keyCaps("$mod+z", false)).toEqual([["Ctrl", "Z"]]);
    expect(keyCaps("$mod+z", true)).toEqual([["⌘", "Z"]]);
    expect(keyCaps("Alt+ArrowUp", false)).toEqual([["Alt", "↑"]]);
    expect(keyCaps("Shift+Tab", false)).toEqual([["Shift", "Tab"]]);
    expect(keyCaps("Escape", false)).toEqual([["Esc"]]);
  });
});
