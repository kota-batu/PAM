/******************************************************************
 * FILE : api-public.js — situs "Anggota Aktif PAM"
 * ================================================================ */

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
  sessionStorage.setItem(PIN_STORAGE_KEY, pin);
}

function getSitePin() {
  return sessionStorage.getItem(PIN_STORAGE_KEY);
}

function clearSitePin() {
  sessionStorage.removeItem(PIN_STORAGE_KEY);
}

function requirePin() {
  var pin = getSitePin();
  if (!pin) {
    window.location.href = "index.html";
    return null;
  }
  return pin;
}

function formatTanggalWaktuIndo(dateStr) {
  if (!dateStr) return "-";
  var d = new Date(dateStr);
  var bulanNama = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var jam = String(d.getHours()).padStart(2, "0");
  var menit = String(d.getMinutes()).padStart(2, "0");
  return d.getDate() + " " + bulanNama[d.getMonth()] + " " + jam + ":" + menit;
}
