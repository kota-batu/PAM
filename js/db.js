/******************************************************************
 * FILE : db.js — wrapper IndexedDB + Sync Engine
 * PROJECT : Anggota Aktif PAM
 * ================================================================
 * v2: - Bump DB version -> tambah index "qrId" (buat scan QR offline,
 *       cari kartu langsung dari IndexedDB tanpa panggil verifyQr).
 *     - Tambah dbSaveCardsBulk() — simpan banyak kartu sekaligus
 *       dalam satu transaction (lebih cepat daripada satu-satu).
 *     - Tambah dbGetAllCards() — ambil semua kartu tersimpan.
 *     - Tambah performSync() — SATU fungsi terpusat dipakai
 *       vendor.js & anggota-public.js untuk sinkronisasi:
 *         1. Cek versi server (ringan)
 *         2. Kalau sama dengan versi lokal DAN sudah ada data
 *            tersimpan -> SKIP, tidak fetch apapun lagi
 *         3. Kalau beda (atau belum pernah sync) -> download SEMUA
 *            data + foto (getAllCardsBulk), simpan ke IndexedDB
 *         4. Kalau offline -> langsung skip, tidak error
 * ================================================================ */

const PAM_DB_NAME = "pam_offline_db";
const PAM_DB_VERSION = 2; // naik dari 1 -> 2 karena nambah index qrId
const PAM_STORE_CARDS = "cards";
const SYNC_VERSION_KEY = "pam_sync_version";

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
      var store;

      if (!db.objectStoreNames.contains(PAM_STORE_CARDS)) {
        store = db.createObjectStore(PAM_STORE_CARDS, { keyPath: "cacheKey" });
      } else {
        store = event.target.transaction.objectStore(PAM_STORE_CARDS);
      }

      if (!store.indexNames.contains("qrId")) {
        store.createIndex("qrId", "qrId", { unique: false });
      }
    };

    request.onsuccess = function (event) { resolve(event.target.result); };
    request.onerror = function (event) { reject(event.target.error); };
  });

  return _pamDbPromise;
}

function buildCacheKey(tipe, id) {
  return tipe + "|" + id;
}

/**
 * Simpan / update SATU kartu. Dipakai untuk kasus lama (fallback per-klik),
 * tetap dipertahankan untuk kompatibilitas.
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
        qrId: data && data.qrId ? data.qrId : null,
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
 * Simpan BANYAK kartu sekaligus dalam satu transaction (dipakai saat sync).
 * items: array of { tipe, id, data }
 */
async function dbSaveCardsBulk(items) {
  try {
    var db = await openPamDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(PAM_STORE_CARDS, "readwrite");
      var store = tx.objectStore(PAM_STORE_CARDS);
      var now = new Date().toISOString();

      items.forEach(function (item) {
        store.put({
          cacheKey: buildCacheKey(item.tipe, item.id),
          tipe: item.tipe,
          id: item.id,
          qrId: item.data && item.data.qrId ? item.data.qrId : null,
          data: item.data,
          savedAt: now
        });
      });

      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  } catch (e) {
    console.warn("dbSaveCardsBulk gagal:", e);
    return false;
  }
}

/**
 * REPLACE PENUH (bukan merge): hapus semua isi objectStore lalu isi ulang
 * dengan `items`, dalam SATU transaksi atomik. Dipakai saat sync supaya
 * IndexedDB selalu jadi salinan PERSIS dari server — tidak ada kartu lama
 * yang "yatim" tertinggal (misal anggota yang sudah dihapus di server),
 * dan tidak ada risiko campuran data lama+baru kalau sync sebelumnya
 * gagal di tengah jalan. clear() dan semua put() ada dalam transaksi yang
 * sama, jadi kalau salah satu gagal, SEMUANYA di-rollback otomatis oleh
 * IndexedDB (tidak akan pernah ada kondisi "kehapus tapi belum keisi").
 */
async function dbReplaceAllCards(items) {
  try {
    var db = await openPamDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(PAM_STORE_CARDS, "readwrite");
      var store = tx.objectStore(PAM_STORE_CARDS);
      var now = new Date().toISOString();

      store.clear();

      items.forEach(function (item) {
        store.put({
          cacheKey: buildCacheKey(item.tipe, item.id),
          tipe: item.tipe,
          id: item.id,
          qrId: item.data && item.data.qrId ? item.data.qrId : null,
          data: item.data,
          savedAt: now
        });
      });

      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  } catch (e) {
    console.warn("dbReplaceAllCards gagal:", e);
    return false;
  }
}

async function dbGetCard(tipe, id) {
  try {
    var db = await openPamDb();
    return new Promise(function (resolve) {
      var tx = db.transaction(PAM_STORE_CARDS, "readonly");
      var store = tx.objectStore(PAM_STORE_CARDS);
      var req = store.get(buildCacheKey(tipe, id));
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { resolve(null); };
    });
  } catch (e) {
    return null;
  }
}

/**
 * Cari kartu berdasarkan qrId — dipakai QR Scanner supaya bisa verifikasi
 * TANPA internet sama sekali (baca dari IndexedDB, bukan verifyQr API).
 */
async function dbGetCardByQrId(qrId) {
  try {
    var db = await openPamDb();
    return new Promise(function (resolve) {
      var tx = db.transaction(PAM_STORE_CARDS, "readonly");
      var store = tx.objectStore(PAM_STORE_CARDS);
      var index = store.index("qrId");
      var req = index.get(qrId);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { resolve(null); };
    });
  } catch (e) {
    return null;
  }
}

async function dbGetAllCards() {
  try {
    var db = await openPamDb();
    return new Promise(function (resolve) {
      var tx = db.transaction(PAM_STORE_CARDS, "readonly");
      var store = tx.objectStore(PAM_STORE_CARDS);
      var req = store.getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { resolve([]); };
    });
  } catch (e) {
    return [];
  }
}

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

function getLocalSyncVersion() {
  return parseInt(localStorage.getItem(SYNC_VERSION_KEY) || "0", 10);
}

function setLocalSyncVersion(v) {
  localStorage.setItem(SYNC_VERSION_KEY, String(v));
}

/**
 * SATU fungsi sinkronisasi terpusat, dipakai vendor.js & anggota-public.js.
 *
 * DESAIN (v3 — server sebagai source of truth penuh):
 * - Server tidak cuma dipercaya soal nomor versi, tapi juga soal JUMLAH
 *   kartu (totalCards). Kalau versi sama tapi jumlah lokal beda dari
 *   server, tetap dipaksa sync ulang — jadi versi yang "kelihatan cocok"
 *   tidak lagi cukup jadi bukti data lokal sudah lengkap/benar.
 * - Sync selalu REPLACE penuh (dbReplaceAllCards: clear + insert dalam
 *   satu transaksi atomik), bukan menambah/menimpa sebagian (put per-key).
 *   Jadi IndexedDB selalu jadi salinan persis dari server: tidak ada
 *   kartu lama yang ketinggalan, tidak ada kartu yang statusnya sudah
 *   berubah di server tapi versi lama masih nyangkut di lokal.
 * - localStorage (pam_sync_version) HANYA diupdate setelah replace
 *   benar-benar sukses. Kalau replace gagal (mis. kuota IndexedDB penuh),
 *   local version TIDAK diupdate, supaya sync berikutnya otomatis
 *   mencoba lagi dari awal — bukan dianggap "sudah sinkron" secara keliru.
 *
 * statusCallback(state) dipanggil dengan salah satu:
 *   "offline"  -> tidak ada internet, sync dilewati, pakai data lama
 *   "checking" -> lagi cek versi (cepat)
 *   "syncing"  -> lagi download semua data+foto (bisa agak lama di awal)
 *   "done"     -> selesai sync, ada data baru
 *   "up-to-date" -> sudah dicek, tidak ada perubahan, tidak fetch apapun
 *   "error"    -> gagal (tapi tidak fatal, data lama tetap dipakai)
 *
 * Return: { synced: boolean, cardCount: number }
 */
async function performSync(statusCallback) {
  function report(state) { if (statusCallback) statusCallback(state); }

  if (navigator.onLine === false) {
    report("offline");
    return { synced: false, reason: "offline" };
  }

  try {
    report("checking");
    var verRes = await callApiPublic("getSyncVersion", {});

    if (verRes.status !== "success") {
      report("error");
      return { synced: false, reason: "error" };
    }

    var serverVersion = verRes.data.version;
    var serverTotalCards = verRes.data.totalCards;
    var localVersion = getLocalSyncVersion();
    var existingCount = await dbCountCards();

    // PENTING (fix): dulu cuma cek localVersion === serverVersion. Itu
    // tidak cukup — versi bisa "cocok" walau IndexedDB sebenarnya tidak
    // lengkap (misal sync sebelumnya gagal di tengah jalan sebelum fix
    // ini ada). Sekarang jumlah kartu lokal WAJIB sama dengan jumlah di
    // server juga, baru boleh skip.
    var versionMatches = localVersion === serverVersion;
    var countMatches = typeof serverTotalCards === "number"
      ? existingCount === serverTotalCards
      : existingCount > 0; // fallback kalau server lama belum kirim totalCards

    if (versionMatches && countMatches) {
      report("up-to-date");
      return { synced: false, reason: "up-to-date", cardCount: existingCount };
    }

    report("syncing");
    var bulkRes = await callApiPublic("getAllCardsBulk", {});

    if (bulkRes.status !== "success") {
      report("error");
      return { synced: false, reason: "error" };
    }

    var items = bulkRes.data.cards.map(function (card) {
      return { tipe: card.tipe, id: card.id, data: card };
    });

    if (typeof bulkRes.data.totalExpected === "number" && items.length !== bulkRes.data.totalExpected) {
      console.warn(
        "Sync: server cuma berhasil kirim " + items.length + " dari " +
        bulkRes.data.totalExpected + " kartu yang seharusnya ada. " +
        "Kemungkinan ada anggota yang fotonya gagal diambil di server."
      );
    }

    // Replace PENUH, bukan merge -> IndexedDB jadi salinan persis server.
    var saveOk = await dbReplaceAllCards(items);

    if (!saveOk) {
      // dbReplaceAllCards() menangkap error-nya sendiri dan cuma return
      // false kalau gagal (mis. kuota penyimpanan IndexedDB penuh -- ini
      // makin mungkin terjadi karena replace penuh nyimpen SEMUA foto
      // sekaligus dalam satu transaksi). local version SENGAJA TIDAK
      // diupdate di sini, supaya sync berikutnya otomatis coba lagi dari
      // awal, bukan dianggap sudah sinkron padahal gagal.
      report("error");
      return { synced: false, reason: "save_failed" };
    }


    setLocalSyncVersion(bulkRes.data.version);

    report("done");
    return { synced: true, cardCount: items.length };

  } catch (e) {
    report("error");
    return { synced: false, reason: "error" };
  }
}
