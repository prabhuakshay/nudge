/**
 * Web Push on this browser: whether it can work here, and turning it on and off. The browser
 * holds the subscription; the server keeps a copy so the worker knows where to push.
 */
import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";

/**
 * - `unsupported`: this browser can't receive push (or, on iPhone and iPad, Nudge isn't
 *   installed to the Home Screen).
 * - `unavailable`: the server has no VAPID keys, so push isn't set up.
 * - `blocked`: the user denied notifications for this site.
 */
export type PushStatus = "unsupported" | "unavailable" | "blocked" | "off" | "on";

/** Raised when push can't be turned on; `message` is safe to show the user. */
export class PushError extends Error {
  override name = "PushError";
}

function browserSupportsPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function serverPublicKey(): Promise<string | null> {
  const { data } = await api.GET("/api/v1/notifications/push");
  if (!data) {
    throw new Error("Could not load the push settings.");
  }
  return data.public_key ?? null;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!browserSupportsPush()) {
    return null;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Push keys arrive as unpadded base64url; the Push API wants the raw bytes. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** Whether push works on this browser and, if so, whether it's on. */
export const pushStatusQuery = queryOptions({
  queryKey: ["push-status"],
  queryFn: async (): Promise<PushStatus> => {
    if (!browserSupportsPush()) {
      return "unsupported";
    }
    if (!(await serverPublicKey())) {
      return "unavailable";
    }
    if (Notification.permission === "denied") {
      return "blocked";
    }
    return (await currentSubscription()) ? "on" : "off";
  },
});

/** Ask for permission, subscribe this browser and register it with the server. */
export async function enablePush(): Promise<void> {
  const publicKey = await serverPublicKey();
  if (!publicKey) {
    throw new PushError("Push notifications aren't set up on this server.");
  }
  if ((await Notification.requestPermission()) !== "granted") {
    throw new PushError("Allow notifications for this site in your browser to turn them on.");
  }
  const registration = await navigator.serviceWorker.ready;
  // Start from a fresh subscription: an old one may belong to keys the server no longer has.
  await (await registration.pushManager.getSubscription())?.unsubscribe();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  });
  const { endpoint, keys } = subscription.toJSON();
  const p256dh = keys?.["p256dh"];
  const auth = keys?.["auth"];
  if (!endpoint || !p256dh || !auth) {
    throw new PushError("This browser returned an incomplete push subscription.");
  }
  const { response } = await api.POST("/api/v1/notifications/push/subscriptions", {
    body: { endpoint, keys: { p256dh, auth } },
  });
  if (!response.ok) {
    await subscription.unsubscribe();
    throw new PushError("Couldn't turn on notifications. Check your connection and try again.");
  }
}

/** Stop pushing to this browser, on the server first while the session still exists. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) {
    return;
  }
  await api.DELETE("/api/v1/notifications/push/subscriptions", {
    body: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
}
