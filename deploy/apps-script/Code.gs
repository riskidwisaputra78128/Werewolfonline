/**
 * Werewolf Online — versi Google Apps Script (tanpa server, P2P via WebRTC)
 * Deploy: Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Werewolf Online — Desa 3D')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Dipakai untuk membuat link undangan (?room=KODE) */
function getAppUrl() {
  return ScriptApp.getService().getUrl();
}
