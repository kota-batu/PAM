/******************************************************************
 * FILE : db.js — wrapper sederhana untuk IndexedDB
 * PROJECT : Anggota Aktif PAM (Sprint 4 — Offline Card Storage)
 * ================================================================
 * TUJUAN:
 * Simpan hasil getPublicCard() (termasuk foto base64) di HP, supaya
 * kartu ID yang PERNAH dibuka sekali (saat online) bisa dibuka lagi
 * tanpa internet.
 *
 * INI BUKAN pengganti localStorage yang sudah dipakai untuk:
 * - Directory (pam_directory_cache_v2)
 * - Dropdown nama anggota (pam_member_names_cache_v1)
 * Keduanya TETAP di localStorage karena datanya kecil (cuma teks).
 *
 * IndexedDB CUMA dipakai untuk data yang lebih berat: detail kartu
 * lengkap + foto per anggota.
 *
 * CARA PAKAI (dari vendor.js / anggota-public.js):
 *   await dbSaveCard(tipe, id, dataKartu);   // simpan/update
 *   var kartu = await dbGetCard(tipe, id);   // ambil (null kalau belum ada)
 * ================================================================ */

const PAM_DB_NAME = "pam_offline_db";
const PAM_DB_VERSION = 1;
const PAM_STORE_CARDS = "cards";

var _pamDbPromise = null;

function openPamDb() {
  if (_pamDbPromise) return _pamDbPromise;

  _pamDbPromise = new Promise(function (resolve, reject) {
    if (!window.indexedDB) {
      reject(new Error("Browser ini tidak mendukung IndexedDB."));
      return;
    }

    var request = indexedDB.open(PAM_DB_NAME, PAM_DB_VERSION);

    request.onupgradeneeded = function (event) {
      var db = event.target.result;
      if (!db.objectStoreNames.contains(PAM_STORE_CARDS)) {
        // key = "TETAP|AG123..." atau "TIDAK_TETAP|TMP123..."
        db.createObjectStore(PAM_STORE_CARDS, { keyPath: "cacheKey" });
      }
    };

    request.onsuccess = function (event) {
      resolve(event.target.result);
    };

    request.onerror = function (event) {
      reject(event.target.error);
    };
  });

  return _pamDbPromise;
}

function buildCacheKey(tipe, id) {
  return tipe + "|" + id;
}

/**
 * Simpan / update data kartu anggota (termasuk foto) ke IndexedDB.
 * Dipanggil setiap kali getPublicCard() berhasil (online).
 */
async function dbSaveCard(tipe, id, data) {
  try {
    var db = await openPamDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(PAM_STORE_CARDS, "readwrite");
      var store = tx.objectStore(PAM_STORE_CARDS);

      var record = {
        cacheKey: buildCacheKey(tipe, id),
        tipe: tipe,
        id: id,
        data: data,
        savedAt: new Date().toISOString()
      };

      var req = store.put(record);
      req.onsuccess = function () { resolve(true); };
      req.onerror = function () { reject(req.error); };
    });
  } catch (e) {
    console.warn("dbSaveCard gagal (bukan fatal):", e);
    return false;
  }
}

/**
 * Ambil data kartu anggota yang pernah tersimpan.
 * Return null kalau belum pernah ada / gagal buka DB.
 */
async function dbGetCard(tipe, id) {
  try {
    var db = await openPamDb();
    return new Promise(function (resolve) {
      var tx = db.transaction(PAM_STORE_CARDS, "readonly");
      var store = tx.objectStore(PAM_STORE_CARDS);
      var req = store.get(buildCacheKey(tipe, id));

      req.onsuccess = function () {
        resolve(req.result || null);
      };
      req.onerror = function () {
        resolve(null);
      };
    });
  } catch (e) {
    return null;
  }
}

/**
 * Hitung berapa banyak kartu yang sudah tersimpan offline.
 * Berguna untuk ditampilkan ke user ("32 kartu tersedia offline").
 */
async function dbCountCards() {
  try {
    var db = await openPamDb();
    return new Promise(function (resolve) {
      var tx = db.transaction(PAM_STORE_CARDS, "readonly");
      var store = tx.objectStore(PAM_STORE_CARDS);
      var req = store.count();
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(0); };
    });
  } catch (e) {
    return 0;
  }
}
