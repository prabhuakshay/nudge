/**
 * The message the server pushes for a notification. Shared by the service worker, which shows
 * it, and the app's tests; it must use nothing but plain JavaScript.
 */
export type PushPayload = {
  /** The notification's id, which Reminder actions need; absent from a malformed push. */
  id?: number;
  title: string;
  body: string;
  /** Path in the app to open when the notification is clicked. */
  url: string;
  /** Whether a Reminder sent it, so its Task can be completed or snoozed from it. */
  isReminder: boolean;
};

const FALLBACK: PushPayload = { title: "Nudge", body: "", url: "/", isReminder: false };

function nonEmptyString(value: object, key: string): string | undefined {
  const field: unknown = Reflect.get(value, key);
  return typeof field === "string" && field !== "" ? field : undefined;
}

/**
 * Reads a push message's JSON. Anything missing falls back to a generic notification, because
 * browsers revoke push for sites that receive a push without showing a notification.
 */
export function parsePushPayload(value: unknown): PushPayload {
  if (typeof value !== "object" || value === null) {
    return FALLBACK;
  }
  const id: unknown = Reflect.get(value, "id");
  return {
    ...(typeof id === "number" && { id }),
    title: nonEmptyString(value, "title") ?? FALLBACK.title,
    body: nonEmptyString(value, "body") ?? FALLBACK.body,
    url: nonEmptyString(value, "url") ?? FALLBACK.url,
    isReminder: Reflect.get(value, "is_reminder") === true,
  };
}

/** A button on a pushed notification, as `showNotification` takes it. */
export type PushAction = { action: string; title: string };

/**
 * The buttons a pushed notification shows. Browsers that don't support buttons ignore them, and
 * a click on the notification itself still opens the Task.
 */
export function pushActions(payload: PushPayload): PushAction[] {
  if (!payload.isReminder || payload.id === undefined) return [];
  return [
    { action: "complete", title: "Complete" },
    { action: "snooze", title: "Snooze 15 min" },
  ];
}

/** The API call a click on one of the notification's buttons makes. */
export type PushActionRequest = { path: string; body?: { until: string } };

/** The API call for a click on the notification's `action` button, or undefined for a plain click. */
export function pushActionRequest(
  action: string,
  payload: PushPayload,
): PushActionRequest | undefined {
  if (!payload.isReminder || payload.id === undefined) return undefined;
  const base = `/api/v1/notifications/${String(payload.id)}`;
  if (action === "complete") return { path: `${base}/complete` };
  if (action === "snooze") return { path: `${base}/snooze`, body: { until: "in_15_minutes" } };
  return undefined;
}
