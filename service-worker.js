/******************************************************************
 * FILE : service-worker.js
 * PROJECT : Anggota Aktif PAM — PWA
 * ================================================================
 * v2: tambah js/db.js ke daftar precache (Sprint 4 — IndexedDB).
 *
 * INGAT: setiap kali file CSS/JS/HTML diubah dan diupload ulang,
 * WAJIB naikkan CACHE_VERSION di bawah ini (v2 -> v3 -> dst), atau
 * HP pengguna akan terus memakai file LAMA dari cache.
 *
 * File ini TIDAK menyentuh request ke Apps Script (POST ke API_URL)
 * — itu selalu langsung ke network, tidak dicache di sini. Cache
 * data anggota ditangani terpisah oleh vendor.js/anggota-public.js
 * (localStorage untuk directory/nama, IndexedDB untuk kartu+foto).
 * ================================================================ */

const CACHE_VERSION = "v2";
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

  "icons/whatsapp.png",
  "icons/instagram.png",
  "icons/tiktok.png",
  "icons/link.png",
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
