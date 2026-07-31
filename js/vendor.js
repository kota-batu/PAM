/******************************************************************
 * FILE : vendor.js — logic khusus vendor.html
 * ================================================================
 * ARSITEKTUR BARU:
 * 1. Begitu halaman dibuka, performSync() jalan (dari db.js):
 *    - Cek versi server (ringan). Kalau sama dengan lokal -> skip.
 *    - Kalau beda / pertama kali -> download SEMUA data+foto sekaligus
 *      (getAllCardsBulk), simpan ke IndexedDB.
 *    - Offline -> langsung skip, pakai data yang sudah ada.
 * 2. SETELAH sync, Search, Directory (klik nama), dan QR Scan SEMUA
 *    baca dari IndexedDB — TIDAK ADA fetch ke server lagi sama sekali
 *    saat user berinteraksi. Beneran offline, bukan cuma fallback.
 * ================================================================ */

const DIRECTORY_CACHE_KEY = "pam_directory_cache_v2";

var cardAssetsReady = null;

async function initVendorPage() {
  cardAssetsReady = preloadCardAssets();

  setupTabs();
  document.getElementById("search-input").addEventListener("input", debounce(handleSearch, 400));

  document.getElementById("btn-start-scan").addEventListener("click", startScanner);
  document.getElementById("btn-stop-scan").addEventListener("click", stopScanner);

  updateSyncIndicator("checking");
  loadDirectory(); // tetap pakai localStorage untuk STRUKTUR pohon (ringan)

  await performSync(updateSyncIndicator); // download semua kartu+foto ke IndexedDB

  window.addEventListener("online", () => updateSyncIndicator("online-idle"));
  window.addEventListener("offline", () => updateSyncIndicator("offline"));
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-content").forEach(t => t.style.display = "none");
      document.getElementById("tab-" + btn.dataset.tab).style.display = "block";

      if (btn.dataset.tab === "scan") {
        ensureScannerLibLoaded().catch(function () {});
      }
    });
  });
}

function debounce(fn, delay) {
  var timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function updateSyncIndicator(state) {
  var dot = document.getElementById("sync-dot");
  var text = document.getElementById("sync-text");
  if (!dot || !text) return;

  dot.classList.remove("online", "offline");

  switch (state) {
    case "checking":
      text.textContent = "Memeriksa data...";
      break;
    case "syncing":
      text.textContent = "Menyinkronkan data & foto...";
      break;
    case "done":
      dot.classList.add("online");
      text.textContent = "Data tersinkron";
      break;
    case "up-to-date":
    case "online-idle":
      dot.classList.add("online");
      text.textContent = "Data tersinkron";
      break;
    case "offline":
      dot.classList.add("offline");
      text.textContent = "Offline — pakai data tersimpan";
      break;
    case "error":
      dot.classList.add("offline");
      text.textContent = "Gagal sinkron — pakai data tersimpan";
      break;
  }
}

/**
 * Hitung status aktif TANPA bergantung ke cache yang mungkin basi.
 * Untuk TIDAK_TETAP, dihitung ulang dari jam HP sendiri vs berlakuSampai
 * (supaya tetap akurat meskipun belum sempat sync ulang).
 */
function computeIsActive(tipe, data) {
  if (tipe === "TETAP") {
    return data.statusKartu === "AKTIF";
  }
  if (!data.berlakuSampai) return false;
  return new Date() <= new Date(data.berlakuSampai);
}


/* ================ SEARCH — baca dari IndexedDB, bukan API ================ */

async function handleSearch() {
  var q = document.getElementById("search-input").value.trim().toLowerCase();
  var box = document.getElementById("search-results");
  if (!q) { box.innerHTML = ""; return; }

  var allCards = await dbGetAllCards();
  var matches = allCards.filter(function (c) {
    return c.data && c.data.nama && c.data.nama.toLowerCase().indexOf(q) !== -1;
  });

  if (matches.length === 0) {
    box.innerHTML = '<div class="empty-state">Tidak ditemukan (atau belum tersinkron — sambungkan internet dulu).</div>';
    return;
  }

  var html = '<div class="card"><div class="table-wrap"><table class="data-table"><tbody>';
  matches.forEach(function (c) {
    var sub = c.data.perusahaan || "-";
    html += '<tr style="cursor:pointer;" onclick="showCardByRef(\'' + c.tipe + '\',\'' + c.id + '\')">';
    html += '<td><strong>' + c.data.nama + '</strong><br><span class="text-muted" style="font-size:12px;">' + sub + '</span></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  box.innerHTML = html;
}


/* ================ TAMPILKAN KARTU — 100% dari IndexedDB ================ */

async function showCardByRef(tipe, id) {
  var record = await dbGetCard(tipe, id);

  if (!record) {
    alert("Data belum tersinkron. Sambungkan internet, lalu buka ulang halaman ini supaya data ter-download.");
    return;
  }

  var engineType = record.tipe === "TETAP" ? "TETAP" : "TIM";
  displayCard(record.tipe, engineType, record.data, record.savedAt);
}

async function displayCard(tipe, engineType, data, savedAt) {
  var box = document.getElementById("card-result-box");
  box.style.display = "block";

  var isActive = computeIsActive(tipe, data);
  var banner = document.getElementById("status-banner");
  if (isActive) {
    banner.style.background = "#e6f9ec";
    banner.style.color = "#1a7f37";
    banner.textContent = "🟢 ANGGOTA AKTIF";
  } else {
    banner.style.background = "#fdecea";
    banner.style.color = "#c0392b";
    banner.textContent = "🔴 ANGGOTA TIDAK AKTIF";
  }

  var offlineNote = document.getElementById("offline-note");
  if (offlineNote) {
    var waktu = savedAt ? new Date(savedAt).toLocaleString("id-ID") : "";
    offlineNote.style.display = "block";
    offlineNote.textContent = waktu ? "Data tersimpan — terakhir sinkron " + waktu : "";
  }

  if (cardAssetsReady) await cardAssetsReady;

  var canvas = document.getElementById("result-canvas");
  updateCardDisplay(canvas, engineType, data);
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}


/* ================ QR SCANNER — verifikasi dari IndexedDB, TANPA internet ================ */

var html5QrCode;
var scannerLibPromise = null;

function ensureScannerLibLoaded() {
  if (scannerLibPromise) return scannerLibPromise;

  scannerLibPromise = new Promise(function (resolve, reject) {
    if (window.Html5Qrcode) { resolve(); return; }

    var script = document.createElement("script");
    script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
    script.onload = function () { resolve(); };
    script.onerror = function () {
      scannerLibPromise = null;
      reject(new Error("Gagal memuat modul scanner"));
    };
    document.head.appendChild(script);
  });

  return scannerLibPromise;
}

async function startScanner() {
  var startBtn = document.getElementById("btn-start-scan");
  var stopBtn = document.getElementById("btn-stop-scan");
  var resultBox = document.getElementById("scan-result");

  if (startBtn.disabled) return;

  startBtn.disabled = true;
  resultBox.innerHTML = '<div class="empty-state">Menyiapkan pemindai...</div>';

  try {
    await ensureScannerLibLoaded();
  } catch (e) {
    resultBox.innerHTML = '<div class="alert alert-error show">Gagal memuat modul scanner (perlu internet sekali saja buat modul ini). Coba lagi.</div>';
    startBtn.disabled = false;
    return;
  }

  resultBox.innerHTML = "";
  startBtn.style.display = "none";
  startBtn.disabled = false;
  stopBtn.style.display = "inline-flex";

  html5QrCode = new Html5Qrcode("qr-reader");
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    onScanSuccess,
    function () {}
  ).catch(function (err) {
    resultBox.innerHTML = '<div class="alert alert-error show">Gagal membuka kamera: ' + err + '</div>';
    stopScanner();
  });
}

function stopScanner() {
  document.getElementById("btn-start-scan").style.display = "inline-flex";
  document.getElementById("btn-stop-scan").style.display = "none";
  if (html5QrCode) {
    html5QrCode.stop().then(function () { html5QrCode.clear(); }).catch(function () {});
  }
}

/**
 * Verifikasi QR SEPENUHNYA dari IndexedDB — tidak ada panggilan ke
 * server sama sekali. Cocok untuk lokasi tanpa sinyal.
 */
async function onScanSuccess(decodedText) {
  stopScanner();
  var qrId = extractQrId(decodedText);
  var resultBox = document.getElementById("scan-result");

  if (!qrId) {
    resultBox.innerHTML = '<div class="alert alert-error show">QR tidak dikenali.</div>';
    return;
  }

  var record = await dbGetCardByQrId(qrId);

  if (!record) {
    resultBox.innerHTML = '<div class="alert alert-error show">🔴 Kartu tidak ditemukan di data tersimpan. Sambungkan internet dan sinkron ulang.</div>';
    return;
  }

  var isActive = computeIsActive(record.tipe, record.data);

  resultBox.innerHTML = isActive
    ? '<div class="alert alert-success show">🟢 Valid & Aktif — kartu ditampilkan di bawah</div>'
    : '<div class="alert alert-error show">🔴 Ditemukan, tapi TIDAK AKTIF</div>';

  var engineType = record.tipe === "TETAP" ? "TETAP" : "TIM";
  displayCard(record.tipe, engineType, record.data, record.savedAt);
}

function extractQrId(text) {
  try {
    var url = new URL(text);
    return url.searchParams.get("qrId");
  } catch (e) {
    return null;
  }
}


/* ================ DIRECTORY (POHON) — struktur tetap dari localStorage ================ */

function loadDirectory() {
  var container = document.getElementById("directory-container");
  var cache = readDirectoryCache();

  if (cache) {
    renderDirectory(cache.data);
  } else {
    container.innerHTML = '<div class="empty-state">Memuat direktori...</div>';
  }

  syncDirectoryStructure(cache);
}

async function syncDirectoryStructure(cache) {
  if (navigator.onLine === false) return;

  try {
    var verRes = await callApiPublic("getSyncVersion", {});
    if (verRes.status !== "success") return;

    var serverVersion = verRes.data.version;
    if (cache && cache.version === serverVersion) return;

    var dirRes = await callApiPublic("getMemberDirectory", {});
    if (dirRes.status !== "success") return;

    if (dirRes.data.length > 0) {
      renderDirectory(dirRes.data);
    }
    writeDirectoryCache(serverVersion, dirRes.data);

  } catch (e) {
    // gagal konek -> biarkan struktur lama tetap tampil
  }
}

function readDirectoryCache() {
  try {
    var raw = localStorage.getItem(DIRECTORY_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeDirectoryCache(version, data) {
  try {
    localStorage.setItem(DIRECTORY_CACHE_KEY, JSON.stringify({ version: version, data: data }));
  } catch (e) {
    // storage penuh/diblokir -> abaikan
  }
}

function renderDirectory(data) {
  var container = document.getElementById("directory-container");

  var html = "";
  data.forEach(function (group) {
    html += '<details class="tree-instansi"><summary>📁 ' + group.instansi + '</summary>';
    group.anggotaTetap.forEach(function (leader) {
      var badge = leader.statusKartu === "AKTIF" ? "🟢" : "🔴";
      html += '<details class="tree-leader"><summary>' + badge + ' <span onclick="event.stopPropagation(); showCardByRef(\'TETAP\',\'' + leader.id + '\')" style="cursor:pointer; text-decoration:underline;">' + leader.nama + '</span></summary>';
      if (leader.team.length === 0) {
        html += '<div class="tree-team-item text-muted" style="cursor:default;">(belum ada team)</div>';
      } else {
        leader.team.forEach(function (member) {
          var mbadge = member.statusTampil === "AKTIF" ? "🟢" : (member.statusTampil === "EXPIRED" ? "⚪" : "🔴");
          html += '<div class="tree-team-item" onclick="showCardByRef(\'TIDAK_TETAP\',\'' + member.id + '\')">' + mbadge + ' ' + member.nama + '</div>';
        });
      }
      html += '</details>';
    });
    html += '</details>';
  });

  container.innerHTML = html;
}
