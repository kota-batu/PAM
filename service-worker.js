/******************************************************************
 * FILE : service-worker.js
 * PROJECT : Anggota Aktif PAM — PWA
 * ================================================================
 * v4: - Hapus icons/whatsapp.png, instagram.png, tiktok.png, link.png
 *       dari precache (sudah tidak dipakai lagi di kartu).
 *
 * INGAT: setiap file CSS/JS/HTML berubah, WAJIB naikkan CACHE_VERSION
 * (v4 -> v5 -> dst), atau HP pengguna tetap pakai file lama.
 * ================================================================ */

const CACHE_VERSION = "v4";
const CACHE_NAME = "pam-app-shell-" + CACHE_VERSION;

const PRECACHE_ASSETS = [
  "./index.html",
  "./pilih.html",
  "./anggota.html",
  "./vendor.html",

  "css/style.css",

  "js/config.js",
  "js/api-public.js",
  "js/db.js",
  "js/card-engine.js",
  "js/anggota-public.js",
  "js/vendor.js",

  "images/idcardtetap.png",
  "images/idcardteam.png",
  "images/logo.png",

  "icons/icon-192.png",
  "icons/icon-192-maskable.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png",

  "manifest.json"
];


self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});


self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});


self.addEventListener("fetch", function (event) {
  var req = event.request;

  if (req.method !== "GET") {
    return;
  }

  if (req.url.indexOf("script.google.com") !== -1 || req.url.indexOf("script.googleusercontent.com") !== -1) {
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) {
        fetchAndUpdateCache(req);
        return cached;
      }

      return fetchAndUpdateCache(req).catch(function () {
        return new Response(
          "Sedang offline dan file ini belum tersimpan. Silakan buka ulang saat ada internet.",
          { status: 503, headers: { "Content-Type": "text/plain" } }
        );
      });
    })
  );
});

function fetchAndUpdateCache(req) {
  return fetch(req).then(function (networkRes) {
    if (networkRes && networkRes.status === 200) {
      var copy = networkRes.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(req, copy);
      });
    }
    return networkRes;
  });
}
