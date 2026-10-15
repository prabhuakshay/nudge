/**
 * Service worker: precaches the built app so Nudge installs as a PWA and its shell opens
 * without a network connection, and shows pushed notifications.
 */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import type { PrecacheEntry } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

import {
  parsePushPayload,
  pushActionRequest,
  pushActions,
  type PushActionRequest,
} from "./features/notifications/push-payload";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] };

// Pages always come from the network so the server keeps deciding what a path is: the app, the
// admin at its configurable URL, or a new deploy's index.html. The cached shell is only the
// offline fallback. Registered before the precache route so that route doesn't answer `/`.
registerRoute(
  new NavigationRoute(async ({ request }) => {
    try {
      return await fetch(request);
    } catch {
      return (await matchPrecache("index.html")) ?? Response.error();
    }
  }),
);

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
void self.skipWaiting();
clientsClaim();

self.addEventListener("push", (event) => {
  let message: unknown;
  try {
    message = event.data?.json();
  } catch {
    message = undefined;
  }
  const payload = parsePushPayload(message);
  // `actions` is missing from TypeScript's NotificationOptions, though browsers support it.
  const options: NotificationOptions & { actions: ReturnType<typeof pushActions> } = {
    body: payload.body,
    icon: "/android-chrome-192.png",
    data: message,
    actions: pushActions(payload),
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const payload = parsePushPayload(event.notification.data);
  const url = new URL(payload.url, self.location.origin).href;
  const request = pushActionRequest(event.action, payload);
  event.waitUntil(request ? actOrOpen(request, url) : openApp(url));
});

/** Makes a Reminder action's API call; if it fails, say when signed out, opens the Task instead. */
async function actOrOpen(request: PushActionRequest, url: string): Promise<void> {
  try {
    const response = await fetch(request.path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRFToken": await csrfToken() },
      ...(request.body && { body: JSON.stringify(request.body) }),
    });
    if (response.ok) return;
  } catch {
    // Offline: fall through and open the Task, which shows the cached shell.
  }
  await openApp(url);
}

// The cookie `api/csrf.ts` reads; that module needs `document`, which a worker doesn't have.
const CSRF_COOKIE_NAME = "csrftoken";

/** Django's CSRF token. A worker can't read `document.cookie`, only the Cookie Store API. */
async function csrfToken(): Promise<string> {
  if (!("cookieStore" in self)) return "";
  const cookie = await self.cookieStore.get(CSRF_COOKIE_NAME);
  return cookie?.value ?? "";
}

/** Brings an open Nudge window to the front at `url`, or opens one. */
async function openApp(url: string): Promise<void> {
  const [open] = await self.clients.matchAll({ type: "window" });
  if (open) {
    await open.focus();
    await open.navigate(url);
    return;
  }
  await self.clients.openWindow(url);
}
