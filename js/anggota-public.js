/******************************************************************
 * FILE : anggota-public.js — logic khusus anggota.html (situs baru)
 * ================================================================ */

var currentMode = "qr";
var currentSelection = null;

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
  var res = await callApiPublic("getAllMemberNamesPublic", {});

  if (res.status !== "success" || res.data.length === 0) {
    select.innerHTML = '<option value="">-- Tidak ada data --</option>';
    return;
  }

  var options = '<option value="">-- Pilih nama --</option>';
  res.data.forEach(function (m) {
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

  var res = await callApiPublic("getPublicCard", { tipe: currentSelection.tipe, id: currentSelection.id });
  if (res.status !== "success") {
    alert(res.message || "Gagal memuat data.");
    return;
  }

  var d = res.data;
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