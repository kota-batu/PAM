/******************************************************************
 * FILE : card-engine.js — situs "Anggota Aktif PAM"
 * Versi optimasi: template PNG & ikon di-load SEKALI (preloadCardAssets),
 * setiap ganti anggota cuma redraw pakai data baru, bukan load ulang gambar.
 * ================================================================ */

const CARD_CONFIG = {
  TETAP: {
    template: "images/idcardtetap.png",
    width: 1007, height: 1562,
    foto: { x: 504, y: 902, w: 320, h: 432 },
    nama: { x: 609, y: 1225 },
    noKta: { x: 609, y: 1291 },
    perusahaan: { x: 609, y: 1375 },
    iconsCenter: { x: 477, y: 1494 }
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
var iconCache = {};

function loadImageAsync(src) {
  return new Promise((resolve, reject) => {
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function loadImageFromBase64(base64, mime) {
  if (!base64) return Promise.resolve(null);
  return loadImageAsync("data:" + (mime || "image/jpeg") + ";base64," + base64);
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
 * WAJIB dipanggil 1x saat halaman dibuka, SEBELUM menampilkan kartu apapun.
 * Setelah ini, ganti-ganti anggota tidak akan reload gambar template/ikon lagi.
 */
async function preloadCardAssets() {
  templateCache.TETAP = await loadImageAsync(CARD_CONFIG.TETAP.template);
  templateCache.TIM = await loadImageAsync(CARD_CONFIG.TIM.template);

  var iconFiles = {
    whatsapp: "icons/whatsapp.png",
    instagram: "icons/instagram.png",
    tiktok: "icons/tiktok.png",
    link: "icons/link.png"
  };

  for (var key in iconFiles) {
    try {
      iconCache[key] = await loadImageAsync(iconFiles[key]);
    } catch (e) {
      iconCache[key] = null;
    }
  }
}

function buildSocialIconList(data) {
  var mapping = [
    { key: "whatsapp", url: data.whatsapp ? "https://wa.me/" + data.whatsapp : "" },
    { key: "instagram", url: data.instagram || "" },
    { key: "tiktok", url: data.tiktok || "" },
    { key: "link", url: data.linkLainnya || "" }
  ];
  return mapping.filter(m => m.url).map(m => ({ img: iconCache[m.key], url: m.url }));
}

/**
 * Update tampilan kartu di canvas. HANYA foto anggota yang di-load ulang
 * (memang beda tiap orang) — template & ikon pakai yang sudah di-cache.
 * engineType: "TETAP" atau "TIM"
 */
async function updateCardDisplay(canvasEl, engineType, data) {
  var cfg = CARD_CONFIG[engineType];
  var template = templateCache[engineType];

  canvasEl.width = cfg.width;
  canvasEl.height = cfg.height;
  var ctx = canvasEl.getContext("2d");

  var foto = await loadImageFromBase64(data.fotoBase64, data.fotoMime);

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

      var icons = buildSocialIconList(data);
      var iconSize = 70, gap = 24;
      var totalW = icons.length * iconSize + (icons.length - 1) * gap;
      var startX = cfg.iconsCenter.x - totalW / 2;

      icons.forEach(function (item, idx) {
        var ix = startX + idx * (iconSize + gap);
        var iy = cfg.iconsCenter.y - iconSize / 2;
        if (item.img) ctx.drawImage(item.img, ix, iy, iconSize, iconSize);
      });
    } else {
      drawCenteredText(ctx, data.noHp || "-", cfg.noHp.x, cfg.noHp.y, 63);
      drawCenteredText(ctx, data.perusahaan || "-", cfg.perusahaan.x, cfg.perusahaan.y, 63);
      var expiredText = data.berlakuSampai ? formatTanggalWaktuIndo(data.berlakuSampai) : "Belum Aktif";
      drawCenteredText(ctx, expiredText, cfg.expired.x, cfg.expired.y, 40);
    }

    drawWatermark(ctx, cfg.width, cfg.height, data.nama);
  }

  draw();
  canvasEl.__redraw = draw; // dipakai loop di bawah supaya watermark tetap bergerak
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

  canvasEl.__redraw = null; // QR statis, tidak perlu redraw berkala
}

// Loop global: bikin watermark di kartu yang lagi tampil tetap "bergerak" & jam update
setInterval(function () {
  document.querySelectorAll("canvas[data-card-canvas]").forEach(function (c) {
    if (c.__redraw) c.__redraw();
  });
}, 1000);
