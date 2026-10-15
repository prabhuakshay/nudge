import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import type { User } from "@/features/auth/session";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { undoLatestChange } from "@/lib/undo-toast";

import { ShortcutsDialog } from "./shortcuts-dialog";
import { useShortcuts } from "./use-shortcuts";

/**
 * The shortcuts that work on every page: `?` for the list of shortcuts, Mod+Z to undo the latest
 * change still in a toast, and the G chords that go to a view or open Settings.
 */
export function GlobalShortcuts({ user }: { user: User }) {
  const navigate = useNavigate();
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const goTo = (to: "/" | "/inbox" | "/upcoming" | "/search" | "/trash") => () =>
    void navigate({ to });

  useShortcuts({
    showShortcuts: () => {
      setHelp(true);
    },
    undo: undoLatestChange,
    goToInbox: goTo("/inbox"),
    goToToday: goTo("/"),
    goToUpcoming: goTo("/upcoming"),
    goToSearch: goTo("/search"),
    goToTrash: goTo("/trash"),
    goToSettings: () => {
      setSettings(true);
    },
  });

  return (
    <>
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
      <SettingsDialog user={user} open={settings} onOpenChange={setSettings} />
    </>
  );
}
