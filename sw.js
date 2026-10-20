"use strict";

// Increase the version when publishing changed images, audio, or app shell files.
// Scope-specific names keep other GitHub Pages projects' caches untouched.
const CACHE_PREFIX = `meteor-dodge:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const CORE_FILES = [
  "./", "./index.html", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png",
];
const GAME_FILES = [
  "./images/Person-transparent.png", "./images/tiles.png",
  "./sound/bgm.mp3.mp3", "./sound/bgm.wood.mp3",
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_FILES);
    // A missing optional picture or sound must not block app installation.
    await Promise.allSettled(GAME_FILES.map(path => cache.add(path)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

// Audio elements may ask for byte ranges, even while offline.
async function audioRange(request, cached) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("Range") || "");
  if (!match || (!match[1] && !match[2])) return cached;
  const bytes = await cached.arrayBuffer();
  const size = bytes.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}

async function respond(request) {
  const cache = await caches.open(CACHE_NAME);
  const url = new URL(request.url);
  if (request.mode === "navigate") {
    // Get the latest HTML when online; use the app shell when offline.
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put("./index.html", response.clone());
        return response;
      }
      return await cache.match("./index.html") || response;
    } catch {
      return await cache.match("./index.html") || Response.error();
    }
  }

  const cached = await cache.match(request.url);
  if (cached) {
    return request.headers.has("Range") ? audioRange(request, cached) : cached;
  }
  try {
    const response = await fetch(request);
    // Never cache partial media responses as if they were the whole file.
    if (response.ok && response.status === 200) await cache.put(url.href, response.clone());
    return response;
  } catch {
    return Response.error(); // Existing image/audio fallbacks handle unavailable assets.
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith(respond(request));
});
