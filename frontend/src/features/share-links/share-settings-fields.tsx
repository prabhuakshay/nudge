import { Input } from "@/components/ui/input";

import {
  EXPIRY_PRESETS,
  MAX_EXPIRY_DAYS,
  RANGE_PRESETS,
  type ExpiryChoice,
  type RangeChoice,
  type ShareSettings,
} from "./share-settings";

/** Native fields, so phones show their own pickers. 16 px stops iOS zooming into them. */
const FIELD =
  "h-9 rounded-md border border-border bg-surface px-2 text-base text-foreground focus-visible:border-primary focus-visible:outline-none sm:h-8 sm:text-sm";

/**
 * A Share link's expiry and timeline range. Editing a link adds a "Keep" expiry option,
 * because a new expiry counts from now.
 */
export function ShareSettingsFields({
  settings,
  currentExpiry,
  onChange,
}: {
  settings: ShareSettings;
  currentExpiry?: string;
  onChange: (settings: ShareSettings) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <label className="flex items-center gap-2">
        Expires
        <select
          value={settings.expiry}
          onChange={(event) => {
            // The options are exactly the expiry choices.
            onChange({ ...settings, expiry: event.target.value as ExpiryChoice });
          }}
          className={FIELD}
        >
          {currentExpiry !== undefined && <option value="keep">{currentExpiry}</option>}
          {EXPIRY_PRESETS.map((days) => (
            <option key={days} value={days}>
              {days === "1" ? "1 day" : `${days} days`}
            </option>
          ))}
          <option value="custom">Custom</option>
          <option value="never">Never</option>
        </select>
      </label>
      {settings.expiry === "custom" && (
        <Input
          type="number"
          required
          min={1}
          max={MAX_EXPIRY_DAYS}
          aria-label="Days until it expires"
          placeholder="Days"
          value={settings.customDays}
          onChange={(event) => {
            onChange({ ...settings, customDays: event.target.value });
          }}
          className="h-9 w-24 sm:h-8"
        />
      )}
      <label className="flex items-center gap-2">
        Timeline
        <select
          value={settings.range}
          onChange={(event) => {
            // The options are exactly the range choices.
            onChange({ ...settings, range: event.target.value as RangeChoice });
          }}
          className={FIELD}
        >
          {RANGE_PRESETS.map((days) => (
            <option key={days} value={days}>
              {days} days
            </option>
          ))}
          <option value="all">All</option>
        </select>
      </label>
    </div>
  );
}
