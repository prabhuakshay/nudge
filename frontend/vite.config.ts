/// <reference types="vitest/config" />
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The repository root holds the single .env file shared with the backend.
const envDir = path.resolve(import.meta.dirname, "..");

/**
 * Host check and HMR websocket settings for a dev server behind the reverse proxy at the
 * deployment's public URL, where the browser can't reach Vite's own address.
 */
function behindProxy(publicUrl: string | undefined) {
  if (!publicUrl) return {};
  const url = new URL(publicUrl);
  const secure = url.protocol === "https:";
  return {
    allowedHosts: [url.hostname],
    hmr: {
      host: url.hostname,
      protocol: secure ? "wss" : "ws",
      clientPort: Number(url.port || (secure ? 443 : 80)),
    },
  };
}

/** Clears every cache, unregisters itself and reloads open tabs onto the live dev server. */
const SELF_DESTROYING_SERVICE_WORKER = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
`;

/**
 * Serves a self-destroying service worker in dev. A browser that once loaded a production build
 * on the same origin keeps serving that build's precached app, and the dev server would
 * otherwise answer the worker's update check with index.html, so the old worker never retires.
 */
function retireServiceWorkerInDev(): Plugin {
  return {
    name: "nudge:retire-service-worker",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/sw.js", (_request, response) => {
        response.setHeader("Content-Type", "text/javascript");
        response.setHeader("Cache-Control", "no-cache");
        response.end(SELF_DESTROYING_SERVICE_WORKER);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "NUDGE_");
  const backendUrl =
    env.NUDGE_DEV_BACKEND_URL ??
    `http://${env.NUDGE_WEB_HOST ?? "localhost"}:${env.NUDGE_WEB_PORT ?? "8000"}`;
  const proxyToBackend = { target: backendUrl, changeOrigin: false };

  return {
    envDir,
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      retireServiceWorkerInDev(),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        injectRegister: "script-defer",
        // The manifest is generated with the rest of the brand assets in branding/.
        manifest: false,
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
        },
        // Push notifications need a service worker, so the dev server runs one too.
        devOptions: { enabled: true, type: "module" },
      }),
    ],
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "src") },
    },
    server: {
      host: env.NUDGE_DEV_FRONTEND_HOST ?? "localhost",
      port: Number(env.NUDGE_DEV_FRONTEND_PORT ?? "5173"),
      strictPort: true,
      ...behindProxy(env.NUDGE_PUBLIC_URL),
      proxy: {
        "/api": proxyToBackend,
        "/admin": proxyToBackend,
        "/static": proxyToBackend,
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      css: false,
      restoreMocks: true,
      // Node 25's built-in localStorage shadows jsdom's and is unusable without a backing file.
      execArgv: ["--no-experimental-webstorage"],
    },
  };
});
