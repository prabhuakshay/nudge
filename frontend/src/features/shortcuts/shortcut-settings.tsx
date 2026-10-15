import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { sessionQuery } from "@/features/auth/session";
import { SettingsCard, SettingsStack } from "@/features/settings/settings-layout";

import { ShortcutList } from "./shortcut-list";

/** Turn single-key shortcuts on or off, and put the updated user in the session cache. */
function useSetSingleKeyShortcuts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data } = await api.PUT("/api/v1/auth/shortcuts", { body: { single_key: enabled } });
      if (!data) throw new Error("Could not save your shortcut setting.");
      return data;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQuery.queryKey, user);
    },
    onError: (error) => toast.error(error.message),
  });
}

/** The settings page for keyboard shortcuts: the single-key switch, then every shortcut. */
export function ShortcutSettings({ singleKey }: { singleKey: boolean }) {
  const { mutate: setSingleKey, isPending } = useSetSingleKeyShortcuts();
  const id = useId();
  return (
    <SettingsStack>
      <SettingsCard className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={singleKey}
          disabled={isPending}
          onCheckedChange={(checked) => {
            setSingleKey(checked === true);
          }}
          className="mt-0.5"
          aria-describedby={`${id}-hint`}
        />
        <div>
          <Label htmlFor={id} className="font-medium">
            Single-key shortcuts
          </Label>
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            Keys without Ctrl, ⌘ or Alt, such as C to add a task. Turn them off if speech input or a
            stray key press sets them off.
          </p>
        </div>
      </SettingsCard>
      <ShortcutList />
    </SettingsStack>
  );
}
