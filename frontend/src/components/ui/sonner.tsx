import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";

/** App-wide toasts, kept clear of the phone bottom navigation. */
export function Toaster(props: ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      position="bottom-center"
      mobileOffset={{ bottom: 80 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-3 rounded-lg border border-border bg-foreground px-4 py-3 text-sm text-background shadow-xl sm:w-auto sm:min-w-80",
          title: "font-semibold",
          description: "text-background/70",
          actionButton:
            "ml-auto shrink-0 rounded-md px-2 py-1 text-sm font-bold text-background underline-offset-2 hover:underline",
          cancelButton: "shrink-0 rounded-md px-2 py-1 text-sm text-background/70",
          icon: "shrink-0",
        },
      }}
      {...props}
    />
  );
}
