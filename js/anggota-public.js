/******************************************************************
 * FILE : anggota-public.js — logic khusus anggota.html (situs baru)
 * Sprint 4: integrasi IndexedDB — kartu yang pernah dibuka saat
 * online otomatis tersimpan, bisa dibuka lagi walau offline.
 * ================================================================ */

var currentMode = "qr";
var currentSelection = null;

const MEMBER_NAMES_CACHE_KEY = "pam_member_names_cache_v1";

async function initMemberPage() {
  await preloadCardAssets();
  await loadNameOptions();

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
    // gagal konek -> biarkan cache yang sudah tampil tetap ada
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

/**
 * Alur baru (Sprint 4): coba online dulu, kalau gagal coba IndexedDB.
 */
async function renderCurrentSelection() {
  if (!currentSelection) return;

  var tipe = currentSelection.tipe;
  var id = currentSelection.id;
  var d, fromCache = false, savedAt = null;

  var res = await callApiPublic("getPublicCard", { tipe: tipe, id: id });

  if (res.status === "success") {
    d = res.data;
    dbSaveCard(tipe, id, d); // simpan di background buat cadangan offline
  } else {
    var cached = await dbGetCard(tipe, id);
    if (cached) {
      d = cached.data;
      fromCache = true;
      savedAt = cached.savedAt;
    } else {
      alert(res.message || "Gagal memuat data.");
      return;
    }
  }

  var isActive = d.tipe === "TETAP" ? d.statusKartu === "AKTIF" : d.statusTampil === "AKTIF";

  document.getElementById("inactive-banner").style.display = isActive ? "none" : "block";
  document.getElementById("display-box").style.display = "block";

  var offlineNote = document.getElementById("offline-note");
  if (offlineNote) {
    if (fromCache) {
      var waktu = savedAt ? new Date(savedAt).toLocaleString("id-ID") : "";
      offlineNote.style.display = "block";
      offlineNote.textContent = "📴 Data tersimpan (offline)" + (waktu ? " — terakhir sinkron " + waktu : "") + ".";
    } else {
      offlineNote.style.display = "none";
    }
  }

  var canvas = document.getElementById("member-canvas");

  if (currentMode === "qr") {
    var verifUrl = buildVerifikasiUrl(d.qrId);
    await renderQrOnly(canvas, verifUrl, d.nama);
  } else {
    var engineType = d.tipe === "TETAP" ? "TETAP" : "TIM";
    await updateCardDisplay(canvas, engineType, d);
  }
}
