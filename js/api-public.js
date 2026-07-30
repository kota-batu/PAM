/******************************************************************
 * FILE : api-public.js — situs "Anggota Aktif PAM"
 * Tidak ada lagi layar login — PIN dipakai otomatis dari config.js.
 * ================================================================ */

async function callApiPublic(action, params) {
  params = params || {};
  if (!params.pin) params.pin = SITE_PIN;

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

function formatTanggalWaktuIndo(dateStr) {
  if (!dateStr) return "-";
  var d = new Date(dateStr);
  var bulanNama = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var jam = String(d.getHours()).padStart(2, "0");
  var menit = String(d.getMinutes()).padStart(2, "0");
  return d.getDate() + " " + bulanNama[d.getMonth()] + " " + d.getFullYear() + ", " + jam + ":" + menit;
}
