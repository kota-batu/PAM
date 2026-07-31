/******************************************************************
 * FILE : anggota-public.js — logic khusus anggota.html
 * Sama arsitekturnya dengan vendor.js: sync sekali di awal (semua
 * data+foto ke IndexedDB), abis itu pilih nama baca dari IndexedDB,
 * tidak ada fetch lagi.
 * ================================================================ */

var currentMode = "qr";
var currentSelection = null;

const MEMBER_NAMES_CACHE_KEY = "pam_member_names_cache_v1";

async function initMemberPage() {
  cardAssetsReadyPromise = preloadCardAssets();

  await loadNameOptions(); // tampil dari cache localStorage (ringan, instan)

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

  await performSync(function () {}); // download semua kartu+foto ke IndexedDB di background
}

var cardAssetsReadyPromise = null;

async function loadNameOptions() {
  var select = document.getElementById("member-select");
  var cache = readNameCache();

  if (cache) {
    renderNameOptions(cache.data, select);
  } else {
    select.innerHTML = '<option value="">-- Memuat daftar... --</option>';
  }

  checkNameVersionAndMaybeSync(cache, select); // tidak perlu ditunggu, biar UI gak nge-block
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
 * 100% dari IndexedDB — tidak ada fetch ke server saat memilih nama.
 */
async function renderCurrentSelection() {
  if (!currentSelection) return;

  var tipe = currentSelection.tipe;
  var id = currentSelection.id;

  var record = await dbGetCard(tipe, id);

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
