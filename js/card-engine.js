/******************************************************************
 * FILE : card-engine.js — situs "Anggota Aktif PAM"
 * ================================================================
 * v3: SEMUA ICON (WhatsApp/Instagram/TikTok/Link) DIHAPUS TOTAL.
 * Kartu sekarang cuma render: template + foto + nama + info teks
 * (No KTA/No HP + perusahaan/instansi). Ini bikin preload cuma
 * perlu 2 gambar (2 template), bukan 6 -> lebih cepat & lebih
 * jarang gagal karena jaringan.
 * ================================================================ */

const CARD_CONFIG = {
  TETAP: {
    template: "images/idcardtetap.png",
    width: 1007, height: 1562,
    foto: { x: 504, y: 902, w: 320, h: 432 },
    nama: { x: 609, y: 1225 },
    noKta: { x: 609, y: 1291 },
    perusahaan: { x: 609, y: 1375 }
  },
  TIM: {
    template: "images/idcardteam.png",
    width: 1007, height: 1562,
    foto: { x: 504, y: 902, w: 320, h: 432 },
    nama: { x: 609, y: 1225 },
    noHp: { x: 609, y: 1291 },
    perusahaan: { x: 609, y: 1375 },
    expired: { x: 477, y: 1494 }
  }
};

var templateCache = {};

const IMAGE_LOAD_TIMEOUT_MS = 8000;

function loadImageAsync(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    var settled = false;
    var img = new Image();
    img.crossOrigin = "anonymous";

    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new Error("Timeout memuat gambar (" + (timeoutMs || IMAGE_LOAD_TIMEOUT_MS) + "ms): " + src));
    }, timeoutMs || IMAGE_LOAD_TIMEOUT_MS);

    img.onload = function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("Gagal memuat gambar: " + src));
    };
    img.src = src;
  });
}

function loadImageFromBase64(base64, mime) {
  if (!base64) return Promise.resolve(null);
  return loadImageAsync("data:" + (mime || "image/jpeg") + ";base64," + base64, 15000);
}

function generateQrImage(text, sizePx) {
  return new Promise((resolve) => {
    var tempDiv = document.createElement("div");
    new QRCode(tempDiv, { text: text, width: sizePx, height: sizePx, correctLevel: QRCode.CorrectLevel.M });
    setTimeout(function () {
      var el = tempDiv.querySelector("canvas") || tempDiv.querySelector("img");
      resolve(el);
    }, 50);
  });
}

function drawCenteredText(ctx, text, x, y, fontPx, color) {
  ctx.font = "bold " + fontPx + "px Helvetica, Arial, sans-serif";
  ctx.fillStyle = color || "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text || "-", x, y);
}

function drawWatermark(ctx, w, h, label) {
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "center";
  var now = new Date();
  var jamText = now.toLocaleTimeString("id-ID");
  var offset = (now.getSeconds() % 20) * 6;
  var text = label + " • " + jamText;

  ctx.translate(w / 2, h / 2);
  ctx.rotate(-25 * Math.PI / 180);
  for (var row = -h; row < h * 1.5; row += 140) {
    ctx.fillText(text, offset - w / 2, row - h / 2);
    ctx.fillText(text, offset - w / 2 + 350, row - h / 2);
  }
  ctx.restore();
}

function buildVerifikasiUrl(qrId) {
  return MAIN_SITE_URL.replace(/\/$/, "") + "/verifikasi.html?qrId=" + encodeURIComponent(qrId);
}

/**
 * WAJIB dipanggil 1x saat halaman dibuka. Sekarang cuma load 2 gambar
 * (template TETAP & TIM) secara paralel dengan timeout 8 detik.
 */
async function preloadCardAssets() {
  var results = await Promise.allSettled([
    loadImageAsync(CARD_CONFIG.TETAP.template),
    loadImageAsync(CARD_CONFIG.TIM.template)
  ]);

  templateCache.TETAP = results[0].status === "fulfilled" ? results[0].value : null;
  templateCache.TIM = results[1].status === "fulfilled" ? results[1].value : null;

  if (results[0].status === "rejected") console.warn("Gagal load template TETAP:", results[0].reason);
  if (results[1].status === "rejected") console.warn("Gagal load template TIM:", results[1].reason);
}

function drawTemplateMissingMessage(canvasEl, cfg) {
  canvasEl.width = cfg.width;
  canvasEl.height = cfg.height;
  var ctx = canvasEl.getContext("2d");
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(0, 0, cfg.width, cfg.height);
  ctx.fillStyle = "#c0392b";
  ctx.textAlign = "center";
  ctx.font = "bold 44px Arial";
  ctx.fillText("Gagal memuat template kartu", cfg.width / 2, cfg.height / 2 - 30);
  ctx.fillStyle = "#555";
  ctx.font = "30px Arial";
  ctx.fillText("Sambungkan internet, lalu buka lagi", cfg.width / 2, cfg.height / 2 + 30);
}

/**
 * Render kartu: template + foto + nama + info teks. TIDAK ADA ICON.
 */
async function updateCardDisplay(canvasEl, engineType, data) {
  var cfg = CARD_CONFIG[engineType];
  var template = templateCache[engineType];

  if (!template) {
    drawTemplateMissingMessage(canvasEl, cfg);
    canvasEl.__redraw = null;
    return;
  }

  canvasEl.width = cfg.width;
  canvasEl.height = cfg.height;
  var ctx = canvasEl.getContext("2d");

  var foto = await loadImageFromBase64(data.fotoBase64, data.fotoMime).catch(function () { return null; });

  function draw() {
    ctx.clearRect(0, 0, cfg.width, cfg.height);
    ctx.drawImage(template, 0, 0, cfg.width, cfg.height);

    if (foto) {
      ctx.drawImage(foto, cfg.foto.x - cfg.foto.w / 2, cfg.foto.y - cfg.foto.h / 2, cfg.foto.w, cfg.foto.h);
    }

    drawCenteredText(ctx, data.nama, cfg.nama.x, cfg.nama.y, 63);

    if (engineType === "TETAP") {
      drawCenteredText(ctx, data.noKta, cfg.noKta.x, cfg.noKta.y, 63);
      drawCenteredText(ctx, data.perusahaan, cfg.perusahaan.x, cfg.perusahaan.y, 63);
    } else {
      drawCenteredText(ctx, data.noHp || "-", cfg.noHp.x, cfg.noHp.y, 63);
      drawCenteredText(ctx, data.perusahaan || "-", cfg.perusahaan.x, cfg.perusahaan.y, 63);
      var expiredText = data.berlakuSampai ? formatTanggalWaktuIndo(data.berlakuSampai) : "Belum Aktif";
      drawCenteredText(ctx, expiredText, cfg.expired.x, cfg.expired.y, 40);
    }

    drawWatermark(ctx, cfg.width, cfg.height, data.nama);
  }

  draw();
  canvasEl.__redraw = draw;
}

async function renderQrOnly(canvasEl, qrUrl, label) {
  var size = 500;
  canvasEl.width = size;
  canvasEl.height = size + 70;
  var ctx = canvasEl.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

  var qrImg = await generateQrImage(qrUrl, size - 40);
  ctx.drawImage(qrImg, 20, 20, size - 40, size - 40);

  if (label) {
    ctx.fillStyle = "#1B2430";
    ctx.font = "bold 26px Arial";
    ctx.textAlign = "center";
    ctx.fillText(label, size / 2, size + 40);
  }

  canvasEl.__redraw = null;
}

setInterval(function () {
  document.querySelectorAll("canvas[data-card-canvas]").forEach(function (c) {
    if (c.__redraw) c.__redraw();
  });
}, 1000);
