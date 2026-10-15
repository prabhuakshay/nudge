import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import { HUE } from "./project-style";
import { PALETTE, type PaletteColor } from "./projects";

const SWATCH =
  "flex size-9 cursor-pointer items-center justify-center rounded-full text-surface ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring sm:size-7";

/**
 * The palette as a row of round swatches to pick one from. With `allowNone`, a grey swatch
 * first stands for no colour.
 */
export function ColorField({
  value,
  onChange,
  allowNone = false,
}: {
  value: PaletteColor | null;
  onChange: (color: PaletteColor | null) => void;
  allowNone?: boolean;
}) {
  const swatch = (color: PaletteColor | null, label: string, className: string) => (
    <label key={color ?? "none"} className="relative">
      <input
        type="radio"
        name="color"
        checked={value === color}
        onChange={() => {
          onChange(color);
        }}
        aria-label={label}
        className="peer sr-only"
      />
      <span className={cn(SWATCH, className)}>
        {value === color && <Check className="size-4" aria-hidden />}
      </span>
    </label>
  );
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">Colour</legend>
      <div className="flex flex-wrap gap-2">
        {allowNone && swatch(null, "No colour", "bg-muted-foreground")}
        {PALETTE.map((hue) => swatch(hue, hue.charAt(0).toUpperCase() + hue.slice(1), HUE[hue].bg))}
      </div>
    </fieldset>
  );
}
