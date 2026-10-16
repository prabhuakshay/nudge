import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import type { User } from "@/features/auth/session";
import { CommandBar } from "@/features/command-bar/command-bar";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { undoLatestChange } from "@/lib/undo-toast";

import { ShortcutsDialog } from "./shortcuts-dialog";
import { useShortcuts } from "./use-shortcuts";

/**
 * The shortcuts that work on every page: `?` for the list of shortcuts, Mod+Z to undo the latest
 * change still in a toast, the G chords that go to a view or open Settings, and Mod+K or `/` for
 * the command bar, which offers the same actions. Renders the command bar's button for phones,
 * so it goes in the top bar. `commandBar` and `onCommandBarChange` hold whether the command bar
 * is open, so other parts of the shell can open it. `onAddTask` opens the global Quick add with a
 * draft.
 */
export function GlobalShortcuts({
  user,
  commandBar,
  onCommandBarChange,
  onAddTask,
}: {
  user: User;
  commandBar: boolean;
  onCommandBarChange: (open: boolean) => void;
  onAddTask: (draft: string) => void;
}) {
  const navigate = useNavigate();
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const goTo = (to: "/" | "/inbox" | "/upcoming" | "/all" | "/search" | "/trash") => () =>
    void navigate({ to });

  const actions = {
    showShortcuts: () => {
      setHelp(true);
    },
    undo: undoLatestChange,
    goToInbox: goTo("/inbox"),
    goToToday: goTo("/"),
    goToUpcoming: goTo("/upcoming"),
    goToAll: goTo("/all"),
    goToSearch: goTo("/search"),
    goToTrash: goTo("/trash"),
    goToSettings: () => {
      setSettings(true);
    },
  };
  useShortcuts(actions);

  return (
    <>
      <CommandBar
        open={commandBar}
        onOpenChange={onCommandBarChange}
        actions={{
          ...actions,
          // Not bound here: on its own, C focuses the page's Quick add card where there is one.
          quickAdd: () => {
            onAddTask("");
          },
        }}
        onCreateTask={onAddTask}
      />
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
      <SettingsDialog user={user} open={settings} onOpenChange={setSettings} />
    </>
  );
}
