/**
 * Service worker: precaches the built app so Nudge installs as a PWA and its shell opens
 * without a network connection.
 */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import type { PrecacheEntry } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

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
