/******************************************************************
 * FILE : anggota-public.js — logic khusus anggota.html
 * FIX: tambah indikator sync (sebelumnya cuma ada di vendor.js) +
 * auto-retry kalau user pilih nama SAAT sync masih berjalan
 * (daripada langsung gagal dengan alert).
 * ================================================================ */

var currentMode = "qr";
var currentSelection = null;
var cardAssetsReadyPromise = null;
var syncPromise = null; // dipakai buat nunggu sync kelar kalau user kecepetan pilih nama

const MEMBER_NAMES_CACHE_KEY = "pam_member_names_cache_v1";

async function initMemberPage() {
  cardAssetsReadyPromise = preloadCardAssets();
  updateSyncIndicator("checking");

  await loadNameOptions(); // dropdown nama (ringan, dari localStorage/API kecil)

  document.getElementById("member-select").addEventListener("change", handleSelectChange);

  document.querySelectorAll(".mode-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".mode-btn").forEach(b => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-secondary");
      });
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
      currentMode = btn.dataset.mode;
      renderCurrentSelection();
    });
  });

  // Sync SEMUA kartu+foto ke IndexedDB (bisa agak lama di awal).
  // Disimpan promise-nya supaya renderCurrentSelection() bisa nunggu
  // kalau user sempat pilih nama SEBELUM ini selesai.
  syncPromise = performSync(updateSyncIndicator);
  await syncPromise;
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

async function loadNameOptions() {
  var select = document.getElementById("member-select");
  var cache = readNameCache();

  if (cache) {
    renderNameOptions(cache.data, select);
  } else {
    select.innerHTML = '<option value="">-- Memuat daftar... --</option>';
  }

  await checkNameVersionAndMaybeSync(cache, select);
}

async function checkNameVersionAndMaybeSync(cache, select) {
  if (navigator.onLine === false) return;

  try {
    var verRes = await callApiPublic("getSyncVersion", {});
    if (verRes.status !== "success") return;

    var serverVersion = verRes.data.version;
    if (cache && cache.version === serverVersion) return;

    var res = await callApiPublic("getAllMemberNamesPublic", {});

    if (res.status !== "success" || res.data.length === 0) {
      if (!cache) select.innerHTML = '<option value="">-- Tidak ada data --</option>';
      return;
    }

    renderNameOptions(res.data, select);
    writeNameCache(serverVersion, res.data);

  } catch (e) {
    // gagal konek -> biarkan cache lama tetap tampil
  }
}

function renderNameOptions(data, select) {
  var previousValue = select.value;

  var options = '<option value="">-- Pilih nama --</option>';
  data.forEach(function (m) {
    options += '<option value="' + m.tipe + '|' + m.id + '">' + m.nama + '</option>';
  });
  select.innerHTML = options;

  if (previousValue) select.value = previousValue;
}

function readNameCache() {
  try {
    var raw = localStorage.getItem(MEMBER_NAMES_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeNameCache(version, data) {
  try {
    localStorage.setItem(MEMBER_NAMES_CACHE_KEY, JSON.stringify({ version: version, data: data }));
  } catch (e) {
    // storage penuh/diblokir -> abaikan
  }
}

function handleSelectChange(e) {
  var val = e.target.value;
  if (!val) {
    currentSelection = null;
    document.getElementById("display-box").style.display = "none";
    document.getElementById("inactive-banner").style.display = "none";
    return;
  }
  var parts = val.split("|");
  currentSelection = { tipe: parts[0], id: parts[1] };
  renderCurrentSelection();
}

function computeIsActiveLocal(tipe, data) {
  if (tipe === "TETAP") {
    return data.statusKartu === "AKTIF";
  }
  if (!data.berlakuSampai) return false;
  return new Date() <= new Date(data.berlakuSampai);
}

/**
 * 100% dari IndexedDB. Kalau belum ketemu TAPI sync masih berjalan,
 * tunggu sync selesai dulu lalu coba sekali lagi (mengatasi race
 * condition: user pilih nama sebelum sync kelar).
 */
async function renderCurrentSelection() {
  if (!currentSelection) return;

  var tipe = currentSelection.tipe;
  var id = currentSelection.id;

  var record = await dbGetCard(tipe, id);

  if (!record && syncPromise) {
    var box = document.getElementById("display-box");
    box.style.display = "block";
    document.getElementById("offline-note").style.display = "block";
    document.getElementById("offline-note").textContent = "Menyinkronkan data, mohon tunggu sebentar...";

    await syncPromise;
    record = await dbGetCard(tipe, id);
  }

  if (!record) {
    alert("Data belum tersinkron. Sambungkan internet, lalu buka ulang halaman ini.");
    return;
  }

  var d = record.data;
  var isActive = computeIsActiveLocal(record.tipe, d);

  document.getElementById("inactive-banner").style.display = isActive ? "none" : "block";
  document.getElementById("display-box").style.display = "block";

  var offlineNote = document.getElementById("offline-note");
  if (offlineNote) {
    var waktu = record.savedAt ? new Date(record.savedAt).toLocaleString("id-ID") : "";
    offlineNote.style.display = "block";
    offlineNote.textContent = waktu ? "Data tersimpan — terakhir sinkron " + waktu : "";
  }

  var canvas = document.getElementById("member-canvas");

  if (cardAssetsReadyPromise) await cardAssetsReadyPromise;

  if (currentMode === "qr") {
    var verifUrl = buildVerifikasiUrl(d.qrId);
    await renderQrOnly(canvas, verifUrl, d.nama);
  } else {
    var engineType = record.tipe === "TETAP" ? "TETAP" : "TIM";
    await updateCardDisplay(canvas, engineType, d);
  }
}
