// =====================================================================
// EXC PANELİ — exportCsv.js
// =====================================================================
// Admin panelindeki "Dışa Aktar" (CSV) özelliğinin ortak kısmı: hangi
// sekmelerin/haftaların/listelerin dahil olacağını seçtiren TEK bir
// modal + CSV dosyası üretip indiren yardımcılar. Her domain dosyası
// (members.js, migration.js, events.js) kendi sütun/satır mantığını
// kurup burada tanımlı openExportModal/downloadCsv'yi çağırır — bu
// dosya hiçbir domain'e özel veri bilmez.
// =====================================================================

import { t, showToast } from "./ui.js";

// Modal onaylanınca çağrılacak, seçilen id listesini alıp {filename, rows} döndürecek
// fonksiyonu tutar (bkz. openExportModal). Aynı anda tek bir export akışı olabilir.
let pendingBuilder = null;

/** CSV hücresi için kaçış: virgül/tırnak/satır sonu içeriyorsa tırnak içine alır. */
function csvEscapeCell(value) {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

/** 2 boyutlu bir satır dizisini (ilk satır başlık) CSV dosyası olarak indirir. UTF-8 BOM ile — Excel Türkçe karakterleri (ı,ş,ğ,ü,ö,ç) BOM olmadan bozuk gösterir. */
export function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscapeCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Dışa aktarma seçim modalını açar. `items`: [{id, label}] — kullanıcının hangilerini
 * dahil edeceğini seçtiği onay kutuları (hepsi varsayılan olarak işaretli gelir).
 * `onConfirm(selectedIds)` "Dışa Aktar"a basılınca çağrılır, {filename, rows} döndürmeli.
 */
export function openExportModal(title, items, onConfirm) {
  pendingBuilder = onConfirm;
  document.getElementById("exportModalTitle").textContent = title;
  document.getElementById("exportItems").innerHTML = items.map((item) => `
    <label class="export-item">
      <input type="checkbox" class="export-check" value="${item.id}" checked>
      <span>${item.label}</span>
    </label>
  `).join("");
  document.getElementById("exportOverlay").classList.add("active");
}

export function closeExportModal() {
  document.getElementById("exportOverlay").classList.remove("active");
  pendingBuilder = null;
}

/** Modaldaki "Tümünü Seç" / "Tümünü Kaldır" butonlarına bağlıdır. */
export function toggleExportAll(checked) {
  document.querySelectorAll(".export-check").forEach((el) => { el.checked = checked; });
}

export function confirmExport() {
  const selectedIds = [...document.querySelectorAll(".export-check:checked")].map((el) => el.value);
  if (!selectedIds.length) {
    showToast(t("exportNoSelection"));
    return;
  }
  const { filename, rows } = pendingBuilder(selectedIds);
  downloadCsv(filename, rows);
  closeExportModal();
}
