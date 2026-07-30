/******************************************************************
 * FILE : vendor.js — logic khusus vendor.html
 * Search & Directory pakai data offline (cepat, jalan tanpa
 * internet). Scan QR tetap coba online dulu (biar status paling
 * baru), kalau gagal konek baru fallback ke data offline.
 * ================================================================ */

async function initVendorPage() {
  await preloadCardAssets();
  setupTabs();
  document.getElementById("search-input").addEventListener("input", debounce(handleSearch, 300));
  document.getElementById("btn-start-scan").addEventListener("click", startScanner);
  document.getElementById("btn-stop-scan").addEventListener("click", stopScanner);

  updateSyncBanner();
  await initOfflineData();
  updateSyncBanner();

  loadDirectory();
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-content").forEach(t => t.style.display = "none");
      document.getElementById("tab-" + btn.dataset.tab).style.display = "block";
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


/* ================ SEARCH (offline) ================ */

function handleSearch() {
  var q = document.getElementById("search-input").value.trim();
  var box = document.getElementById("search-results");
  if (!q) { box.innerHTML = ""; return; }

  var results = searchOfflineCards(q);

  if (!results.length) {
    box.innerHTML = '<div class="empty-state">Tidak ditemukan.</div>';
    return;
  }

  var html = '<div class="card"><div class="table-wrap"><table class="data-table"><tbody>';
  results.forEach(function (m) {
    var sub = m.tipe === "TETAP" ? (m.perusahaan || "-") : ("Team dari " + (m.dibuatOleh || "-"));
    html += '<tr style="cursor:pointer;" onclick="showCardByRef(\'' + m.tipe + '\',\'' + m.id + '\')">';
    html += '<td><strong>' + m.nama + '</strong><br><span class="text-muted" style="font-size:12px;">' + sub + '</span></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  box.innerHTML = html;
}


/* ================ TAMPILKAN KARTU (dipakai search, directory, scan) ================ */

function showCardByRef(tipe, id) {
  var data = findCard(tipe, id);
  if (!data) {
    alert("Kartu tidak ditemukan di data offline. Sambungkan internet lalu buka ulang halaman untuk sinkron.");
    return;
  }
  var engineType = data.tipe === "TETAP" ? "TETAP" : "TIM";
  displayCard(engineType, data);
}

function displayCard(engineType, data) {
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

  var canvas = document.getElementById("result-canvas");
  updateCardDisplay(canvas, engineType, data);
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}


/* ================ QR SCANNER (KAMERA) ================ */

var html5QrCode;

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

  // Coba online dulu supaya status paling baru (verifikasi tidak butuh PIN).
  var res = await callApiPublic("verifyQr", { qrId: qrId });

  if (res.status === "success") {
    if (!res.data.valid) {
      var pesan = res.data.pesan || "Tidak valid";
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
      berlakuSampai: res.data.berlakuSampai,
      tipe: engineType
    };

    if (engineType === "TETAP") {
      cardData.statusKartu = "AKTIF";
    } else {
      cardData.statusTampil = "AKTIF";
    }

    displayCard(engineType, cardData);
    return;
  }

  // Gagal konek ke server (offline) — coba cari qrId di data offline.
  var local = OFFLINE.cards.find(function (c) { return c.qrId === qrId; });
  if (local) {
    resultBox.innerHTML = '<div class="alert alert-error show">📡 Mode offline — status ditampilkan dari data tersimpan terakhir, mungkin belum terbaru.</div>';
    var engineType2 = local.tipe === "TETAP" ? "TETAP" : "TIM";
    displayCard(engineType2, local);
  } else {
    resultBox.innerHTML = '<div class="alert alert-error show">QR tidak ditemukan di data offline.</div>';
  }
}

function extractQrId(text) {
  try {
    var url = new URL(text);
    return url.searchParams.get("qrId");
  } catch (e) {
    return null;
  }
}


/* ================ DIRECTORY (POHON, offline) ================ */

function loadDirectory() {
  var container = document.getElementById("directory-container");

  if (!OFFLINE.directory.length) {
    container.innerHTML = '<div class="empty-state">Belum ada data.</div>';
    return;
  }

  var html = "";
  OFFLINE.directory.forEach(function (group) {
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
