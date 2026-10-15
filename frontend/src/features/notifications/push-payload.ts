/**
 * The message the server pushes for a notification. Shared by the service worker, which shows
 * it, and the app's tests; it must use nothing but plain JavaScript.
 */
export type PushPayload = {
  title: string;
  body: string;
  /** Path in the app to open when the notification is clicked. */
  url: string;
};

const FALLBACK: PushPayload = { title: "Nudge", body: "", url: "/" };

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
  return {
    title: nonEmptyString(value, "title") ?? FALLBACK.title,
    body: nonEmptyString(value, "body") ?? FALLBACK.body,
    url: nonEmptyString(value, "url") ?? FALLBACK.url,
  };
}
