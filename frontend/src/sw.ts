/**
 * Service worker: precaches the built app so Nudge installs as a PWA and its shell opens
 * without a network connection, and shows pushed notifications.
 */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import type { PrecacheEntry } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

import { parsePushPayload } from "./features/notifications/push-payload";

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
  const { title, body, url } = parsePushPayload(message);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/android-chrome-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url } = parsePushPayload(event.notification.data);
  event.waitUntil(openApp(new URL(url, self.location.origin).href));
});

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
