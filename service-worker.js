/******************************************************************
 * FILE : service-worker.js
 * PROJECT : Anggota Aktif PAM — PWA (Sprint 3)
 * ================================================================
 * TUJUAN:
 * Cache semua file STATIS (HTML, CSS, JS, gambar template kartu,
 * icon sosmed) supaya:
 *  - Buka aplikasi jadi INSTAN (file diambil dari HP, bukan network)
 *  - Aplikasi tetap kebuka walau offline TOTAL (app shell tetap ada)
 *
 * PENTING — YANG TIDAK DI-CACHE:
 * Semua request ke Apps Script (API_URL, method POST) SENGAJA
 * TIDAK disentuh Service Worker ini sama sekali. Kenapa?
 * 1. Itu request POST, bukan GET — cache API browser memang untuk GET.
 * 2. Cache utk data anggota (nama, status aktif/nonaktif) SUDAH
 *    ditangani terpisah oleh vendor.js/anggota-public.js lewat
 *    localStorage + Smart Sync (getSyncVersion). Jangan didobelin
 *    di sini, supaya tidak ada 2 sistem cache yang saling tabrakan.
 *
 * KALAU KAMU UPDATE FILE CSS/JS/HTML NANTI:
 * WAJIB naikkan CACHE_VERSION di bawah ini (misal v1 -> v2), supaya
 * HP pengguna otomatis ambil versi baru. Kalau lupa dinaikkan, HP
 * pengguna akan TERUS pakai file lama dari cache walau kamu sudah
 * upload versi baru ke server.
 * ================================================================ */

const CACHE_VERSION = "v1";
const CACHE_NAME = "pam-app-shell-" + CACHE_VERSION;

const PRECACHE_ASSETS = [
  // Halaman
  "./index.html",
  "./pilih.html",
  "./anggota.html",
  "./vendor.html",

  // Styling
  "css/style.css",

  // Script sendiri
  "js/config.js",
  "js/api-public.js",
  "js/card-engine.js",
  "js/anggota-public.js",
  "js/vendor.js",

  // Gambar template kartu
  "images/idcardtetap.png",
  "images/idcardteam.png",
  "images/logo.png",

  // Icon sosmed di kartu
  "icons/whatsapp.png",
  "icons/instagram.png",
  "icons/tiktok.png",
  "icons/link.png",

  // PWA
  "manifest.json"
];


/* ================ INSTALL: simpan semua asset di atas ke cache ================ */

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(function () {
      return self.skipWaiting(); // langsung aktif, tidak nunggu tab lama ditutup
    })
  );
});


/* ================ ACTIVATE: buang cache versi lama ================ */

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    }).then(function () {
      return self.clients.claim(); // langsung kontrol tab yang sudah terbuka
    })
  );
});


/* ================ FETCH: strategi cache ================ */

self.addEventListener("fetch", function (event) {
  var req = event.request;

  // Jangan sentuh apapun selain GET (terutama POST ke Apps Script / API_URL)
  if (req.method !== "GET") {
    return;
  }

  // Jangan sentuh request ke domain Apps Script (script.google.com / script.googleusercontent.com)
  // biarkan itu selalu langsung ke network apa adanya.
  if (req.url.indexOf("script.google.com") !== -1 || req.url.indexOf("script.googleusercontent.com") !== -1) {
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      // Cache-first: kalau ada di cache, langsung pakai itu (INSTAN)
      if (cached) {
        // Sambil itu, diam-diam update cache di background buat kunjungan berikutnya
        fetchAndUpdateCache(req);
        return cached;
      }

      // Belum ada di cache (misal file baru / CDN eksternal) -> ambil dari network,
      // simpan ke cache buat next time, kalau gagal (offline) ya sudah gagal.
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
    // Simpan salinan ke cache (cuma kalau responnya valid)
    if (networkRes && networkRes.status === 200) {
      var copy = networkRes.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(req, copy);
      });
    }
    return networkRes;
  });
}
