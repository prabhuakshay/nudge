import type { NewShareLink, ShareLinkChange } from "./share-links";

/** The longest custom expiry the server accepts. */
export const MAX_EXPIRY_DAYS = 3650;

export const EXPIRY_PRESETS = ["1", "7", "30"] as const;
export const RANGE_PRESETS = ["7", "14", "30"] as const;

/** How a Share link's expiry is picked: a preset, a custom number of days, never, or left as is. */
export type ExpiryChoice = (typeof EXPIRY_PRESETS)[number] | "custom" | "never" | "keep";
export type RangeChoice = (typeof RANGE_PRESETS)[number] | "all";

/** The Share link settings as the form holds them, before they become API values. */
export type ShareSettings = {
  expiry: ExpiryChoice;
  customDays: string;
  range: RangeChoice;
};

/** A new link's settings: it expires in 7 days and shows 14 days of history. */
export const DEFAULT_SETTINGS: ShareSettings = { expiry: "7", customDays: "", range: "14" };

const DEFAULT_BODY: NewShareLink = { expires_in_days: 7, range_days: 14 };

/** The settings a link already has, with its expiry left as is until the user picks another. */
export function currentSettings(rangeDays: number | null): ShareSettings {
  return { expiry: "keep", customDays: "", range: rangeChoice(rangeDays) };
}

/**
 * The API body for these settings. A kept expiry, or a range equal to `savedRange`, is left out,
 * so editing a link changes only what the user changed.
 */
export function settingsBody(settings: ShareSettings, savedRange?: number | null): ShareLinkChange {
  const { expiry, customDays, range } = settings;
  const days = range === "all" ? null : Number(range);
  return {
    ...(expiry !== "keep" && {
      expires_in_days:
        expiry === "never" ? null : Number(expiry === "custom" ? customDays : expiry),
    }),
    ...(days !== savedRange && { range_days: days }),
  };
}

/** The API body that creates a link with these settings. */
export function newLinkBody(settings: ShareSettings): NewShareLink {
  return { ...DEFAULT_BODY, ...settingsBody(settings) };
}

/** How a link's range reads in the Share panel. */
export function describeRange(days: number | null): string {
  return days === null ? "Shows all history" : `Shows ${String(days)} days`;
}

function rangeChoice(days: number | null): RangeChoice {
  if (days === null) return "all";
  return RANGE_PRESETS.find((preset) => preset === String(days)) ?? "14";
}
