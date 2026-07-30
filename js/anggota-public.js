/******************************************************************
 * FILE : anggota-public.js — logic khusus anggota.html
 * Semua data diambil dari cache offline (OFFLINE.cards) — bukan
 * panggil API tiap ganti nama, jadi ganti kartu jadi instan &
 * tetap jalan walau tidak ada internet.
 * ================================================================ */

var currentMode = "qr";
var currentSelection = null;

async function initMemberPage() {
  await preloadCardAssets();

  updateSyncBanner();
  await initOfflineData();
  updateSyncBanner();

  loadNameOptions();

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

function loadNameOptions() {
  var select = document.getElementById("member-select");

  if (!OFFLINE.cards.length) {
    select.innerHTML = '<option value="">-- Tidak ada data --</option>';
    return;
  }

  var options = '<option value="">-- Pilih nama --</option>';
  OFFLINE.cards.forEach(function (m) {
    options += '<option value="' + m.tipe + '|' + m.id + '">' + m.nama + '</option>';
  });
  select.innerHTML = options;
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

async function renderCurrentSelection() {
  if (!currentSelection) return;

  var d = findCard(currentSelection.tipe, currentSelection.id);
  if (!d) {
    alert("Data anggota ini belum tersedia di penyimpanan offline. Sambungkan internet lalu buka ulang halaman untuk sinkron.");
    return;
  }

  var isActive = d.tipe === "TETAP" ? d.statusKartu === "AKTIF" : d.statusTampil === "AKTIF";

  document.getElementById("inactive-banner").style.display = isActive ? "none" : "block";
  document.getElementById("display-box").style.display = "block";

  var canvas = document.getElementById("member-canvas");

  if (currentMode === "qr") {
    var verifUrl = buildVerifikasiUrl(d.qrId);
    await renderQrOnly(canvas, verifUrl, d.nama);
  } else {
    var engineType = d.tipe === "TETAP" ? "TETAP" : "TIM";
    await updateCardDisplay(canvas, engineType, d);
  }
}
