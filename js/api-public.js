/******************************************************************
 * FILE : api-public.js — situs "Anggota Aktif PAM"
 * Perubahan: LOGIN DIHAPUS. PIN diisi otomatis dari kode (AUTO_PIN),
 * tersimpan di localStorage sejak pertama kali dibuka. requirePin()
 * TIDAK PERNAH redirect ke index.html lagi — murni cek lokal, tidak
 * ada request ke internet sama sekali untuk tahap ini.
 *
 * PENTING: ganti nilai AUTO_PIN di bawah supaya SAMA PERSIS dengan
 * nilai VENDOR_SITE_PIN di sheet SETTINGS kamu, kalau tidak, request
 * ke Apps Script akan ditolak (INVALID_PIN).
 * ================================================================ */

const AUTO_PIN = "123456"; // GANTI sesuai VENDOR_SITE_PIN di sheet SETTINGS

async function callApiPublic(action, params) {
  params = params || {};

  var pin = getSitePin();
  if (pin && !params.pin) params.pin = pin;

  var body = Object.assign({ action: action }, params);

  try {
    var response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body)
    });
    return await response.json();
  } catch (err) {
    return {
      status: "error",
      message: "Gagal terhubung ke server. Periksa koneksi internet kamu.",
      code: "NETWORK_ERROR",
      data: null
    };
  }
}

function saveSitePin(pin) {
  localStorage.setItem(PIN_STORAGE_KEY, pin);
}

function getSitePin() {
  var pin = localStorage.getItem(PIN_STORAGE_KEY);
  if (!pin) {
    pin = AUTO_PIN;
    saveSitePin(pin);
  }
  return pin;
}

function clearSitePin() {
  localStorage.removeItem(PIN_STORAGE_KEY);
}

/**
 * Dulu: redirect ke index.html kalau belum login.
 * Sekarang: PIN selalu ada (auto-fill), jadi TIDAK PERNAH redirect.
 * Fungsi ini sengaja dibiarkan ada (bukan dihapus) supaya vendor.html
 * / anggota.html yang masih manggil requirePin() tidak perlu diubah.
 */
function requirePin() {
  return getSitePin();
}

function formatTanggalWaktuIndo(dateStr) {
  if (!dateStr) return "-";
  var d = new Date(dateStr);
  var bulanNama = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var jam = String(d.getHours()).padStart(2, "0");
  var menit = String(d.getMinutes()).padStart(2, "0");
  return d.getDate() + " " + bulanNama[d.getMonth()] + " " + jam + ":" + menit;
}
