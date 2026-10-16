import { useState, type ComponentProps } from "react";

import { CommandBar } from "@/features/command-bar/command-bar";

/** The command bar holding its own open state, as the app shell holds it. */
export function OpenableCommandBar(
  props: Omit<ComponentProps<typeof CommandBar>, "open" | "onOpenChange">,
) {
  const [open, setOpen] = useState(false);
  return <CommandBar open={open} onOpenChange={setOpen} {...props} />;
}
