/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { ExpirationPlugin, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope {
    __SW_MANIFEST: Array<string | { url: string; revision: string | null }>;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Phase 23A: Never interrupt active sessions mid-task; activate updated SW on next navigation
  skipWaiting: false,
  clientsClaim: false,
  cleanupOutdatedCaches: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
      handler: new StaleWhileRevalidate({
        cacheName: "apex-google-fonts-swr-v2",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 60 * 60 * 24 * 365,
          }),
        ],
      }),
    },
    {
      matcher: /^\/api\/(?:workspace|marketplace-jobs)(?:\/.*)?$/i,
      handler: new StaleWhileRevalidate({
        cacheName: "apex-assigned-scripts-swr-v2",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 * 7,
          }),
        ],
      }),
    },
    {
      matcher: /^\/(?:dashboard|jobs-board|offline)?$/i,
      handler: new StaleWhileRevalidate({
        cacheName: "apex-shell-routes-swr-v2",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24 * 7,
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document" && !request.url.includes("/admin");
        },
      },
    ],
  },
});

// Promote waiting worker cleanly only when the client signals a fresh navigation cycle
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING_ON_NEXT_NAVIGATION") {
    void self.skipWaiting();
  }
});

serwist.addEventListeners();
