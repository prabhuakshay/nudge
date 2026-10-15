import * as TabsPrimitive from "@radix-ui/react-tabs";
import { createContext, useContext, type ComponentProps } from "react";

import { cn } from "@/lib/utils";

type TabsVariant = "segmented" | "underline";

const TabsVariantContext = createContext<TabsVariant>("segmented");

export const Tabs = TabsPrimitive.Root;

/** The tab strip: a segmented control by default, or underlined tabs. */
export function TabsList({
  className,
  variant = "segmented",
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        className={cn(
          "inline-flex items-center text-muted-foreground",
          variant === "segmented"
            ? "h-9 gap-1 rounded-lg bg-surface-muted p-1"
            : "h-10 gap-4 border-b border-border",
          className,
        )}
        {...props}
      />
    </TabsVariantContext.Provider>
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex items-center justify-center gap-1.5 text-sm font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
        variant === "segmented"
          ? "h-full rounded-md px-3 data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          : "-mb-px h-full border-b-2 border-transparent px-0.5 data-[state=active]:border-primary data-[state=active]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content className={cn("focus-visible:outline-none", className)} {...props} />
  );
}
