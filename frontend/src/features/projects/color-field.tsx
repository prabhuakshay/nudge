import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import { HUE } from "./project-style";
import { PALETTE, type PaletteColor } from "./projects";

const SWATCH =
  "flex size-9 cursor-pointer items-center justify-center rounded-full text-surface ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring sm:size-7";

function Swatch({
  checked,
  label,
  className,
  onSelect,
}: {
  checked: boolean;
  label: string;
  className: string;
  onSelect: () => void;
}) {
  return (
    <label className="relative">
      <input
        type="radio"
        name="color"
        checked={checked}
        onChange={onSelect}
        aria-label={label}
        className="peer sr-only"
      />
      <span className={cn(SWATCH, className)}>
        {checked && <Check className="size-4" aria-hidden />}
      </span>
    </label>
  );
}

/**
 * The palette as a row of round swatches; nothing is picked until the user picks one. With
 * `onClear`, a grey swatch first stands for no colour.
 */
export function ColorField({
  value,
  onChange,
  onClear,
}: {
  value: PaletteColor | null;
  onChange: (color: PaletteColor) => void;
  onClear?: () => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">Colour</legend>
      <div className="flex flex-wrap gap-2">
        {onClear && (
          <Swatch
            checked={value === null}
            label="No colour"
            className="bg-muted-foreground"
            onSelect={onClear}
          />
        )}
        {PALETTE.map((hue) => (
          <Swatch
            key={hue}
            checked={value === hue}
            label={hue.charAt(0).toUpperCase() + hue.slice(1)}
            className={HUE[hue].bg}
            onSelect={() => {
              onChange(hue);
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}
