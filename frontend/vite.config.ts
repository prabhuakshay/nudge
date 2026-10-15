/// <reference types="vitest/config" />
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "NUDGE_");
  const backendUrl =
    env.NUDGE_DEV_BACKEND_URL ??
    `http://${env.NUDGE_WEB_HOST ?? "localhost"}:${env.NUDGE_WEB_PORT ?? "8000"}`;
  const proxyToBackend = { target: backendUrl, changeOrigin: false };

  return {
    envDir,
    plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
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
