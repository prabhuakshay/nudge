import { CommandShortcut } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { isSingleKey, keyCaps } from "@/features/shortcuts/registry";
import { useSingleKeyShortcuts } from "@/features/shortcuts/use-shortcuts";

/**
 * A command's key binding as key caps at the end of its row, such as `G` `I`. Left out when the
 * user has turned single-key shortcuts off and this is one.
 */
export function KeyHint({ binding }: { binding: string }) {
  const singleKey = useSingleKeyShortcuts();
  if (!singleKey && isSingleKey(binding)) return null;
  return (
    <CommandShortcut className="flex items-center gap-1">
      {keyCaps(binding)
        .flat()
        .map((cap, index) => (
          <Kbd key={index}>{cap}</Kbd>
        ))}
    </CommandShortcut>
  );
}
