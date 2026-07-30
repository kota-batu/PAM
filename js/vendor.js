/******************************************************************
 * FILE : vendor.js — logic khusus vendor.html
 * Versi optimasi (Sprint 2 — Smart Sync):
 * - Directory tampil INSTAN dari cache (localStorage).
 * - Lalu tanya server "versi data sekarang berapa?" (getSyncVersion —
 *   super ringan, cuma baca 1 baris). Kalau versi SAMA dengan cache,
 *   SELESAI, tidak ada fetch data tambahan sama sekali.
 * - Kalau versi BEDA (atau belum ada cache), baru fetch data lengkap
 *   (getMemberDirectory) dan simpan cache + versi barunya.
 * - Offline / fetch gagal -> tetap tampil cache lama, tidak error.
 * - Library QR scanner (html5-qrcode) baru di-load pas user klik tab
 *   Scan pertama kali, bukan langsung saat halaman dibuka.
 * ================================================================ */

const DIRECTORY_CACHE_KEY = "pam_directory_cache_v2"; // v2: sekarang nyimpen versi juga

var cardAssetsReady = null; // promise, dipakai supaya tidak blocking saat init

async function initVendorPage() {
  // preload asset kartu jalan di belakang, tidak menghambat tampilan awal
  cardAssetsReady = preloadCardAssets();

  setupTabs();
  document.getElementById("search-input").addEventListener("input", debounce(handleSearch, 400));

  updateSyncIndicator("loading");
  loadDirectory(); // tampil dari cache dulu (jika ada), lalu cek versi ke server

  window.addEventListener("online", () => updateSyncIndicator("online"));
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
        ensureScannerLibLoaded();
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
  if (state === "online") {
    dot.classList.add("online");
    text.textContent = "Data tersinkron";
  } else if (state === "offline") {
    dot.classList.add("offline");
    text.textContent = "Offline — pakai data tersimpan";
  } else {
    text.textContent = "Memuat...";
  }
}


/* ================ SEARCH ================ */

async function handleSearch() {
  var q = document.getElementById("search-input").value.trim();
  var box = document.getElementById("search-results");
  if (!q) { box.innerHTML = ""; return; }

  box.innerHTML = '<div class="empty-state">Mencari...</div>';
  var res = await callApiPublic("searchMembers", { query: q });

  if (res.status !== "success" || res.data.length === 0) {
    box.innerHTML = '<div class="empty-state">Tidak ditemukan.</div>';
    return;
  }

  var html = '<div class="card"><div class="table-wrap"><table class="data-table"><tbody>';
  res.data.forEach(function (m) {
    var sub = m.tipe === "TETAP" ? (m.perusahaan || "-") : ("Team dari " + (m.dibuatOleh || "-"));
    html += '<tr style="cursor:pointer;" onclick="showCardByRef(\'' + m.tipe + '\',\'' + m.id + '\')">';
    html += '<td><strong>' + m.nama + '</strong><br><span class="text-muted" style="font-size:12px;">' + sub + '</span></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  box.innerHTML = html;
}


/* ================ TAMPILKAN KARTU (dipakai search, directory, scan) ================ */

async function showCardByRef(tipe, id) {
  var res = await callApiPublic("getPublicCard", { tipe: tipe, id: id });
  if (res.status !== "success") { alert(res.message || "Gagal memuat kartu."); return; }
  var engineType = res.data.tipe === "TETAP" ? "TETAP" : "TIM";
  displayCard(engineType, res.data);
}

async function displayCard(engineType, data) {
  var box = document.getElementById("card-result-box");
  box.style.display = "block";

  var isActive = data.tipe === "TETAP" ? data.statusKartu === "AKTIF" : data.statusTampil === "AKTIF";
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

  // pastikan template & ikon kartu sudah siap sebelum digambar
  if (cardAssetsReady) await cardAssetsReady;

  var canvas = document.getElementById("result-canvas");
  updateCardDisplay(canvas, engineType, data);
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}


/* ================ QR SCANNER (KAMERA) — lazy load library ================ */

var html5QrCode;
var scannerLibPromise = null;

function ensureScannerLibLoaded() {
  if (scannerLibPromise) return scannerLibPromise;

  scannerLibPromise = new Promise(function (resolve, reject) {
    if (window.Html5Qrcode) { resolve(); return; }

    var script = document.createElement("script");
    script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
    script.onload = function () {
      bindScannerButtons();
      resolve();
    };
    script.onerror = function () {
      document.getElementById("scan-result").innerHTML =
        '<div class="alert alert-error show">Gagal memuat modul scanner. Cek koneksi internet.</div>';
      reject();
    };
    document.head.appendChild(script);
  });

  return scannerLibPromise;
}

function bindScannerButtons() {
  var startBtn = document.getElementById("btn-start-scan");
  var stopBtn = document.getElementById("btn-stop-scan");
  if (startBtn.__bound) return; // hindari double-binding
  startBtn.__bound = true;

  startBtn.addEventListener("click", startScanner);
  stopBtn.addEventListener("click", stopScanner);
}

function startScanner() {
  document.getElementById("btn-start-scan").style.display = "none";
  document.getElementById("btn-stop-scan").style.display = "inline-flex";
  document.getElementById("scan-result").innerHTML = "";

  html5QrCode = new Html5Qrcode("qr-reader");
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    onScanSuccess,
    function () {} // error normal terpanggil terus saat belum ketemu QR, sengaja diabaikan
  ).catch(function (err) {
    document.getElementById("scan-result").innerHTML = '<div class="alert alert-error show">Gagal membuka kamera: ' + err + '</div>';
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

async function onScanSuccess(decodedText) {
  stopScanner();
  var qrId = extractQrId(decodedText);
  var resultBox = document.getElementById("scan-result");

  if (!qrId) {
    resultBox.innerHTML = '<div class="alert alert-error show">QR tidak dikenali.</div>';
    return;
  }

  resultBox.innerHTML = '<div class="empty-state">Memverifikasi...</div>';
  var res = await callApiPublic("verifyQr", { qrId: qrId });

  if (res.status !== "success" || !res.data.valid) {
    var pesan = res.data ? res.data.pesan : (res.message || "Tidak valid");
    resultBox.innerHTML = '<div class="alert alert-error show">🔴 ' + pesan + '</div>';
    return;
  }

  resultBox.innerHTML = '<div class="alert alert-success show">🟢 Valid — kartu ditampilkan di bawah</div>';

  var engineType = res.data.jenis === "Anggota Tetap" ? "TETAP" : "TIM";
  var cardData = {
    nama: res.data.nama,
    perusahaan: res.data.perusahaan,
    noKta: res.data.noKta,
    noHp: res.data.noHp,
    fotoBase64: res.data.fotoBase64,
    fotoMime: res.data.fotoMime,
    instagram: res.data.instagram,
    tiktok: res.data.tiktok,
    linkLainnya: res.data.linkLainnya,
    whatsapp: res.data.whatsapp,
    berlakuSampai: res.data.berlakuSampai,
    tipe: engineType
  };

  // verifyQr sudah memvalidasi qrId (valid=true berarti kartu ini aktif)
  if (engineType === "TETAP") {
    cardData.statusKartu = "AKTIF";
  } else {
    cardData.statusTampil = "AKTIF";
  }

  displayCard(engineType, cardData);
}

function extractQrId(text) {
  try {
    var url = new URL(text);
    return url.searchParams.get("qrId");
  } catch (e) {
    return null;
  }
}


/* ================ DIRECTORY (POHON) — Smart Sync: cek versi dulu, fetch cuma kalau beda ================ */

function loadDirectory() {
  var container = document.getElementById("directory-container");
  var cache = readDirectoryCache(); // { version, data } atau null

  // 1) tampilkan cache dulu kalau ada, INSTAN tanpa nunggu network
  if (cache) {
    renderDirectory(cache.data);
  } else {
    container.innerHTML = '<div class="empty-state">Memuat direktori...</div>';
  }

  // 2) cek ke server: ada perubahan atau tidak (super ringan)
  checkVersionAndMaybeSync(cache);
}

async function checkVersionAndMaybeSync(cache) {
  if (navigator.onLine === false) {
    updateSyncIndicator("offline");
    return;
  }

  try {
    var verRes = await callApiPublic("getSyncVersion", {});

    if (verRes.status !== "success") {
      // gagal cek versi -> anggap seperti offline, tetap pakai cache
      updateSyncIndicator(cache ? "offline" : "loading");
      if (!cache) {
        document.getElementById("directory-container").innerHTML =
          '<div class="empty-state">' + (verRes.message || "Gagal memuat data.") + '</div>';
      }
      return;
    }

    var serverVersion = verRes.data.version;

    // Versi sama persis dengan cache -> TIDAK ADA PERUBAHAN, tidak perlu fetch apapun lagi
    if (cache && cache.version === serverVersion) {
      updateSyncIndicator("online");
      return;
    }

    // Versi beda (atau belum ada cache sama sekali) -> baru fetch data lengkap
    var dirRes = await callApiPublic("getMemberDirectory", {});

    if (dirRes.status !== "success") {
      updateSyncIndicator(cache ? "offline" : "loading");
      if (!cache) {
        document.getElementById("directory-container").innerHTML =
          '<div class="empty-state">' + (dirRes.message || "Gagal memuat data.") + '</div>';
      }
      return;
    }

    updateSyncIndicator("online");

    if (dirRes.data.length === 0) {
      document.getElementById("directory-container").innerHTML = '<div class="empty-state">Belum ada data.</div>';
    } else {
      renderDirectory(dirRes.data);
    }

    writeDirectoryCache(serverVersion, dirRes.data);

  } catch (e) {
    // gagal konek (timeout dll) — biarkan tampilan cache lama tetap ada
    updateSyncIndicator(cache ? "offline" : "loading");
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
    // storage penuh / diblokir browser — abaikan, tidak fatal
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
