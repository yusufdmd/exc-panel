// =====================================================================
// EXC PANELİ — events.js
// =====================================================================
// Dört etkinlik türü (gvg/svs/ss/other) için ORTAK olan hafta ve toplu
// kayıt girişi mantığı burada. Hangi türün hangi state deposuna
// karşılık geldiği `storeFor(type)` ile çözülür; tür-özel görünüm
// farkları (SVS/Diğer durum seçici, GVG sade puan, SS grup+katıldı)
// sadece `renderEntryRows`/`saveEntry` içindeki dallanmalarda kalır —
// haftayı eklemek/silmek ve modalı açıp kapatmak tüm türler için
// tamamen aynıdır.
//
// `mapWeek`/`mapEntry`, app.js'in ilk yüklemede (loadAll) kullandığı
// satır -> uygulama şekli dönüştürücüleridir; en doğal yeri burasıdır
// çünkü bu dosyadaki CRUD fonksiyonları da aynı dönüşümü kullanır.
// =====================================================================

import { createWeek as dbCreateWeek, updateWeek as dbUpdateWeek, deleteWeek as dbDeleteWeek, upsertRecordsBulk } from "./database.js";
import { supabase } from "./supabase.js";
import {
  state, t, showToast, escapeHtml, rankClass, statusOf, gvgColorClass, formatPower, formatRatio, renderAll,
  cellInfoHtml, svsOtherCellInfo, ssCellInfo, attendanceCellInfo, gvgCellInfo, isExempt, isDigitsOnly,
  ratioStatus, ratioSs, sumGvgPoints, RANK_ORDER, todayStr
} from "./ui.js";
import { filteredSortedMembers } from "./members.js";
import { openExportModal } from "./exportCsv.js";

/** Supabase hafta satırını uygulama şekline çevirir. */
export function mapWeek(row) {
  return { id: row.id, label: row.label, date: row.week_date || "" };
}

/** Supabase kayıt satırını, türüne göre uygulama şekline çevirir. */
export function mapEntry(type, row) {
  if (type === "gvg") return { id: row.id, memberId: row.member_id, weekId: row.week_id, points: row.points };
  if (type === "ss") return { id: row.id, memberId: row.member_id, weekId: row.week_id, group: row.group_name, attended: row.attended, excused: row.excused };
  if (type === "kod") return { id: row.id, memberId: row.member_id, weekId: row.week_id, status: row.status, excused: row.excused };
  return { id: row.id, memberId: row.member_id, weekId: row.week_id, status: row.status, points: row.points, excused: row.excused };
}

/** Etkinlik türüne (gvg/svs/ss/kod/other) karşılık gelen state deposunu döndürür. */
function storeFor(type) {
  if (type === "svs") return state.svs;
  if (type === "gvg") return state.gvg;
  if (type === "ss") return state.ss;
  if (type === "kod") return state.kod;
  return state.other;
}

/** Etkinlik türüne karşılık gelen hücre-bilgisi fonksiyonunu döndürür (tablolardakiyle BİREBİR aynı metin — bkz. gvg.js/svs.js/ss.js/kod.js render fonksiyonları). */
function cellInfoFor(type) {
  if (type === "svs" || type === "other") return svsOtherCellInfo;
  if (type === "gvg") return gvgCellInfo;
  if (type === "ss") return ssCellInfo;
  return attendanceCellInfo; // kod
}

/**
 * "Dışa Aktar" — admin, hangi haftaların/etkinliklerin dahil olacağını seçer; her
 * seçili hafta kendi sütunu olarak, ekrandaki tabloyla birebir aynı hücre metinleriyle
 * tek bir CSV'de birleşir. GVG/SVS/SS/KoD/Diğer'in hepsi için ortak (bkz. storeFor/cellInfoFor).
 */
export function exportEventTable(type) {
  const store = storeFor(type);
  const cellInfoFn = cellInfoFor(type);
  const items = store.weeks.map((week) => ({ id: week.id, label: week.label }));
  openExportModal(t("exportBtn"), items, (selectedIds) => {
    const weeks = store.weeks.filter((week) => selectedIds.includes(week.id));
    const members = filteredSortedMembers();
    const rows = [[t("thRank"), t("thUsername"), ...weeks.map((week) => week.label)]];
    members.forEach((member) => {
      rows.push([member.rank, member.name || "", ...weeks.map((week) => cellInfoFn(store, member, week).text)]);
    });
    return { filename: "exc-paneli-" + type + "-" + todayStr() + ".csv", rows };
  });
}

// =====================================================================
// HAFTA MODALI (EKLE/DÜZENLE)
// =====================================================================
/** weekId verilirse mevcut haftayı düzenleme modunda açar; verilmezse yeni hafta ekler. */
export function openWeekModal(type, weekId) {
  document.getElementById("weekType").value = type;
  document.getElementById("weekEditId").value = weekId || "";
  const isOther = type === "other";
  document.getElementById("t_lblWeekLabel").textContent = isOther ? t("lblEventLabel") : t("lblWeekLabel");
  const store = storeFor(type);
  if (weekId) {
    const week = store.weeks.find((w) => w.id === weekId);
    document.getElementById("weekModalTitle").textContent = isOther ? t("eventEditTitle") : t("weekEditTitle");
    document.getElementById("wkLabel").value = week ? week.label : "";
    document.getElementById("wkDate").value = week ? week.date : "";
  } else {
    document.getElementById("weekModalTitle").textContent = isOther ? t("eventAddTitle") : t("weekAddTitle");
    document.getElementById("wkLabel").value = (isOther ? (state.currentLang === "tr" ? "Etkinlik " : "Event ") : "Hafta ") + (store.weeks.length + 1);
    document.getElementById("wkDate").value = "";
  }
  document.getElementById("weekOverlay").classList.add("active");
}

export function closeWeekModal() {
  document.getElementById("weekOverlay").classList.remove("active");
}

export async function saveWeek() {
  const type = document.getElementById("weekType").value;
  const editId = document.getElementById("weekEditId").value;
  const label = document.getElementById("wkLabel").value.trim();
  if (!label) {
    showToast(type === "other" ? t("eventNameRequired") : t("weekNameRequired"));
    return;
  }
  const weekDate = document.getElementById("wkDate").value || null;
  try {
    const store = storeFor(type);
    if (editId) {
      const row = await dbUpdateWeek(type, editId, { label, week_date: weekDate });
      const index = store.weeks.findIndex((w) => w.id === editId);
      if (index >= 0) store.weeks[index] = mapWeek(row);
    } else {
      const row = await dbCreateWeek(type, { label, week_date: weekDate });
      store.weeks.push(mapWeek(row));
    }
    closeWeekModal();
    renderAll();
    showToast(type === "other" ? t("toastEventSaved") : t("toastWeekSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

export async function deleteWeek(type, weekId) {
  if (!confirm(type === "other" ? t("confirmDeleteEvent") : t("confirmDeleteWeek"))) return;
  try {
    await dbDeleteWeek(type, weekId);
    const store = storeFor(type);
    store.weeks = store.weeks.filter((w) => w.id !== weekId);
    store.entries = store.entries.filter((e) => e.weekId !== weekId);
    renderAll();
    showToast(type === "other" ? t("toastEventDeleted") : t("toastWeekDeleted"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

// =====================================================================
// TOPLU GİRİŞ MODALI (bir haftanın tüm üyeleri, tek seferde)
// =====================================================================
export function openEntryModal(type, weekId) {
  state.entryContext = { type, weekId, aiDraft: null };
  const store = storeFor(type);
  const week = store.weeks.find((w) => w.id === weekId);
  const titleKey = type === "svs" ? "entryTitleSVS" : type === "gvg" ? "entryTitleGVG" : type === "ss" ? "entryTitleSS" : type === "kod" ? "entryTitleKoD" : "entryTitleOther";
  document.getElementById("entryTitle").textContent = (week ? week.label + " — " : "") + t(titleKey);
  document.getElementById("entrySearch").value = "";
  const thead = document.getElementById("entryThead");
  if (type === "svs" || type === "other") {
    thead.innerHTML = `<tr><th>${t("thStatus")}</th><th>${t("thUsername")}</th><th>${t("thRank")}</th><th>${t("thPointsCol")}</th><th>${t("thExcused")}</th></tr>`;
  } else if (type === "gvg") {
    thead.innerHTML = `<tr><th>${t("thUsername")}</th><th>${t("thRank")}</th><th>${t("thPointsCol")}</th></tr>`;
  } else if (type === "kod") {
    thead.innerHTML = `<tr><th>${t("thStatus")}</th><th>${t("thUsername")}</th><th>${t("thRank")}</th><th>${t("thExcused")}</th></tr>`;
  } else {
    thead.innerHTML = `<tr><th>${t("thUsername")}</th><th>${t("thRank")}</th><th>${t("thGroup")}</th><th>${t("thAttended")}</th><th>${t("thExcused")}</th></tr>`;
  }
  document.getElementById("entryOverlay").classList.add("active");
  renderEntryRows();
}

export function closeEntryModal() {
  document.getElementById("entryOverlay").classList.remove("active");
  state.entryContext = null;
}

/**
 * Toplu giriş modalında görünecek üye listesi. `query` verilmezse (AI'a
 * gönderilecek roster için) arama kutusu dikkate alınmaz, sadece muafiyet
 * kuralı uygulanır — ekran görüntüsündeki bir üye arama kutusundan
 * bağımsız olarak eşleşebilmeli.
 */
function entryVisibleMembers(query) {
  const { type, weekId } = state.entryContext;
  const store = storeFor(type);
  const week = store.weeks.find((w) => w.id === weekId);
  let list = filteredSortedMembers();
  if (query) list = list.filter((m) => m.name.toLowerCase().includes(query) || String(m.gameId).toLowerCase().includes(query));
  // Henüz kaydı olmayan muaf üyeler (yeni katılan/kullanıcısı değişen) toplu giriş
  // listesinde HİÇ gösterilmez — aksi halde "Kaydet" ile hepsine varsayılan
  // (unknown/0) gerçek bir kayıt yazılır ve muafiyet bir daha geri gelmez.
  return list.filter((member) => !isExempt(member, week) || store.entries.some((e) => e.memberId === member.id && e.weekId === weekId));
}

export function renderEntryRows() {
  if (!state.entryContext) return;
  const { type, weekId, aiDraft } = state.entryContext;
  const store = storeFor(type);
  const query = (document.getElementById("entrySearch").value || "").toLowerCase().trim();
  const list = entryVisibleMembers(query);
  const rowsEl = document.getElementById("entryRows");

  if (type === "svs" || type === "other") {
    rowsEl.innerHTML = list.map((member) => {
      const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === weekId);
      const draft = aiDraft && aiDraft[member.id];
      const status = draft ? (draft.status || "unknown") : statusOf(entry);
      const points = draft && draft.points != null ? draft.points : (entry ? entry.points : 0);
      const excused = draft && draft.excused != null ? !!draft.excused : (entry ? !!entry.excused : false);
      return `<tr>
        <td><select class="status-select" data-mid="${member.id}">
          <option value="joined" ${status === "joined" ? "selected" : ""}>${t("statusYes")}</option>
          <option value="absent" ${status === "absent" ? "selected" : ""}>${t("statusNo")}</option>
          <option value="unknown" ${status === "unknown" ? "selected" : ""}>${t("statusUnknown")}</option>
        </select></td>
        <td>${escapeHtml(member.name)}</td>
        <td><span class="rank-badge ${rankClass(member.rank)}" style="font-size:11px;padding:2px 8px;">${member.rank}</span></td>
        <td><input type="number" class="pts-input" data-mid="${member.id}" value="${points}"></td>
        <td><input type="checkbox" class="excused-check" data-mid="${member.id}" ${excused ? "checked" : ""}></td>
      </tr>`;
    }).join("");
  } else if (type === "gvg") {
    rowsEl.innerHTML = list.map((member) => {
      const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === weekId);
      const draft = aiDraft && aiDraft[member.id];
      const points = draft && draft.points != null ? draft.points : (entry ? entry.points : 0);
      return `<tr>
        <td>${escapeHtml(member.name)}</td>
        <td><span class="rank-badge ${rankClass(member.rank)}" style="font-size:11px;padding:2px 8px;">${member.rank}</span></td>
        <td><input type="number" class="pts-input" data-mid="${member.id}" value="${points}"></td>
      </tr>`;
    }).join("");
  } else if (type === "kod") {
    rowsEl.innerHTML = list.map((member) => {
      const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === weekId);
      const draft = aiDraft && aiDraft[member.id];
      const status = draft ? (draft.status || "unknown") : statusOf(entry);
      const excused = draft && draft.excused != null ? !!draft.excused : (entry ? !!entry.excused : false);
      return `<tr>
        <td><select class="status-select" data-mid="${member.id}">
          <option value="joined" ${status === "joined" ? "selected" : ""}>${t("statusYes")}</option>
          <option value="absent" ${status === "absent" ? "selected" : ""}>${t("statusNo")}</option>
          <option value="unknown" ${status === "unknown" ? "selected" : ""}>${t("statusUnknown")}</option>
        </select></td>
        <td>${escapeHtml(member.name)}</td>
        <td><span class="rank-badge ${rankClass(member.rank)}" style="font-size:11px;padding:2px 8px;">${member.rank}</span></td>
        <td><input type="checkbox" class="excused-check" data-mid="${member.id}" ${excused ? "checked" : ""}></td>
      </tr>`;
    }).join("");
  } else {
    rowsEl.innerHTML = list.map((member) => {
      const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === weekId);
      const draft = aiDraft && aiDraft[member.id];
      const group = draft && draft.group != null ? draft.group : (entry ? (entry.group || "") : "");
      const attended = draft && draft.attended != null ? !!draft.attended : (entry ? !!entry.attended : false);
      const excused = draft && draft.excused != null ? !!draft.excused : (entry ? !!entry.excused : false);
      return `<tr>
        <td>${escapeHtml(member.name)}</td>
        <td><span class="rank-badge ${rankClass(member.rank)}" style="font-size:11px;padding:2px 8px;">${member.rank}</span></td>
        <td><select class="grp-select" data-mid="${member.id}">
          <option value="" ${group === "" ? "selected" : ""}>${t("groupNone")}</option>
          <option value="A" ${group === "A" ? "selected" : ""}>${t("groupA")}</option>
          <option value="B" ${group === "B" ? "selected" : ""}>${t("groupB")}</option>
        </select></td>
        <td><input type="checkbox" class="attend-check" data-mid="${member.id}" ${attended ? "checked" : ""}></td>
        <td><input type="checkbox" class="excused-check" data-mid="${member.id}" ${excused ? "checked" : ""}></td>
      </tr>`;
    }).join("");
  }
}

// =====================================================================
// EKRAN GÖRÜNTÜSÜNDEN AI İLE DOLDURMA
// =====================================================================
// Görsel hiçbir yerde saklanmaz — sadece bu istek için sunucudaki
// api/read-screenshot.js fonksiyonuna, oradan da görüntü okuyabilen
// yapay zeka modeline gönderilir. Dönen sonuçlar, kaydedilmeden önce
// admin gözden geçirsin diye doğrudan tabloya değil `aiDraft`'a yazılır
// (bkz. renderEntryRows) — "Kaydet"e basılana kadar hiçbir şey Supabase'e
// yazılmaz.

/** Seçilen görseli, API'ye göndermeden önce makul bir boyuta küçültüp JPEG data URL'ine çevirir. */
function resizeImageToDataUrl(file, maxDim = 1568, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** AI'dan dönen sonuçları (memberId -> alanlar) entryContext.aiDraft'a yazar. */
function applyAiDraft(results) {
  const draft = {};
  (results || []).forEach((r) => { if (r && r.memberId) draft[r.memberId] = r; });
  state.entryContext.aiDraft = draft;
  return Object.keys(draft).length;
}

// Tek istekte gönderilebilecek en fazla ekran görüntüsü sayısı — Vercel'in
// istek gövdesi boyutu sınırının içinde kalmak için.
const MAX_SCREENSHOTS = 6;

/** "🤖 AI ile Doldur" — seçilen ekran görüntüsü/görüntülerini sunucuya gönderir, dönen sonuçları taslak olarak tabloya işler. */
export async function handleEntryScreenshot(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!files.length || !state.entryContext) return;
  if (files.length > MAX_SCREENSHOTS) {
    showToast(t("aiFillTooMany").replace("{n}", String(MAX_SCREENSHOTS)));
    return;
  }
  const { type } = state.entryContext;
  const roster = entryVisibleMembers("").map((m) => ({ id: m.id, name: m.name || "", gameId: m.gameId || "" }));
  if (!roster.length) {
    showToast(t("aiFillNoMembers"));
    return;
  }
  const btn = document.getElementById("t_aiFillBtn");
  const originalLabel = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = t("aiFillWorking"); }
  try {
    const images = await Promise.all(files.map((file) => resizeImageToDataUrl(file)));
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData && sessionData.session ? sessionData.session.access_token : "";
    const res = await fetch("/api/read-screenshot", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ type, roster, images })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
    const count = applyAiDraft(payload.results);
    renderEntryRows();
    showToast(t("aiFillDone").replace("{n}", String(count)));
  } catch (error) {
    console.error(error);
    showToast(t("aiFillError"));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
  }
}

export async function saveEntry() {
  if (!state.entryContext) return;
  const { type, weekId } = state.entryContext;
  const store = storeFor(type);
  const payloads = [];

  if (type === "svs" || type === "other") {
    document.querySelectorAll("#entryRows tr").forEach((tr) => {
      const memberId = tr.querySelector(".pts-input").dataset.mid;
      const status = tr.querySelector(".status-select").value;
      const points = Number(tr.querySelector(".pts-input").value) || 0;
      const excused = tr.querySelector(".excused-check").checked;
      payloads.push({ week_id: weekId, member_id: memberId, status, points, excused });
    });
  } else if (type === "gvg") {
    // Tüm satırlar geçerli olmadan hiçbiri kaydedilmez (kısmi/tutarsız bir kayıt kalmasın diye).
    const invalidRow = [...document.querySelectorAll("#entryRows tr")].some((tr) => {
      const raw = tr.querySelector(".pts-input").value.trim();
      return raw && !isDigitsOnly(raw);
    });
    if (invalidRow) {
      showToast(t("invalidNumberField"));
      return;
    }
    document.querySelectorAll("#entryRows tr").forEach((tr) => {
      const memberId = tr.querySelector(".pts-input").dataset.mid;
      const points = Number(tr.querySelector(".pts-input").value) || 0;
      payloads.push({ week_id: weekId, member_id: memberId, points });
    });
  } else if (type === "kod") {
    document.querySelectorAll("#entryRows tr").forEach((tr) => {
      const memberId = tr.querySelector(".status-select").dataset.mid;
      const status = tr.querySelector(".status-select").value;
      const excused = tr.querySelector(".excused-check").checked;
      payloads.push({ week_id: weekId, member_id: memberId, status, excused });
    });
  } else {
    document.querySelectorAll("#entryRows tr").forEach((tr) => {
      const memberId = tr.querySelector(".grp-select").dataset.mid;
      const group = tr.querySelector(".grp-select").value;
      const attended = tr.querySelector(".attend-check").checked;
      const excused = tr.querySelector(".excused-check").checked;
      payloads.push({ week_id: weekId, member_id: memberId, group_name: group || null, attended, excused });
    });
  }

  try {
    const rows = await upsertRecordsBulk(type, payloads);
    rows.forEach((row) => {
      const mapped = mapEntry(type, row);
      const index = store.entries.findIndex((e) => e.memberId === mapped.memberId && e.weekId === mapped.weekId);
      if (index >= 0) store.entries[index] = mapped;
      else store.entries.push(mapped);
    });
    closeEntryModal();
    renderAll();
    showToast(t("toastEntrySaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

// =====================================================================
// HAFTA RAPORU (salt okunur — herkes görebilir, admin girişi gerekmez)
// =====================================================================
function memberEntryFor(store, memberId, weekId) {
  return store.entries.find((e) => e.memberId === memberId && e.weekId === weekId);
}

/** Bir isim listesini renkli başlıklı bir bölüm olarak biçimlendirir. */
function reportSection(title, color, names) {
  return `<div style="margin-bottom:16px;">
    <div style="font-size:12px; font-weight:700; color:${color}; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${escapeHtml(title)} (${names.length})</div>
    <div style="font-size:13px; color:var(--text-primary); line-height:1.7;">${names.length ? names.map(escapeHtml).join(", ") : "—"}</div>
  </div>`;
}

/** SVS/KoD/Diğer türü haftalık rapor: katıldı/katılmadı listeleri. */
function buildStatusReportHtml(store, week, members) {
  const joined = [];
  const absent = [];
  members.forEach((member) => {
    const entry = memberEntryFor(store, member.id, week.id);
    const status = statusOf(entry);
    if (status === "joined") joined.push(member.name);
    else if (status === "absent") absent.push(entry.excused ? member.name + " (M)" : member.name);
  });
  return reportSection(t("legendJoined"), "var(--success-ink)", joined)
    + reportSection(t("legendNotJoined"), "var(--danger-ink)", absent);
}

/** SS türü haftalık rapor: A/B grubu ayrı ayrı katıldı/katılmadı listeleri. */
function buildSsReportHtml(store, week, members) {
  const groups = { A: { joined: [], absent: [] }, B: { joined: [], absent: [] } };
  members.forEach((member) => {
    const entry = memberEntryFor(store, member.id, week.id);
    if (!entry || !entry.group || !groups[entry.group]) return;
    const bucket = groups[entry.group];
    if (entry.attended) bucket.joined.push(member.name);
    else bucket.absent.push(entry.excused ? member.name + " (M)" : member.name);
  });
  const groupSection = (label, bucket) => `<div style="margin-bottom:8px;">
      <div style="font-size:13px; font-weight:700; margin-bottom:8px;">${escapeHtml(label)}</div>
      ${reportSection(t("legendJoined"), "var(--success-ink)", bucket.joined)}
      ${reportSection(t("legendNotJoined"), "var(--danger-ink)", bucket.absent)}
    </div>`;
  return groupSection(t("groupA"), groups.A) + groupSection(t("groupB"), groups.B);
}

/** GVG türü haftalık rapor: puana göre yeşil/sarı/kırmızı bölge listeleri. */
function buildGvgReportHtml(store, week, members) {
  const zones = { "pill-green": [], "pill-yellow": [], "pill-red": [] };
  members.forEach((member) => {
    const entry = memberEntryFor(store, member.id, week.id);
    const points = entry ? (Number(entry.points) || 0) : 0;
    zones[gvgColorClass(points)].push(member.name + " (" + formatPower(points) + ")");
  });
  return reportSection(t("zoneGreen"), "var(--success-ink)", zones["pill-green"])
    + reportSection(t("zoneYellow"), "var(--warn-ink)", zones["pill-yellow"])
    + reportSection(t("zoneRed"), "var(--danger-ink)", zones["pill-red"]);
}

/** Herkesin görebildiği, salt okunur haftalık katılım/puan raporunu açar. */
export function openWeekReportModal(type, weekId) {
  const store = storeFor(type);
  const week = store.weeks.find((w) => w.id === weekId);
  if (!week) return;
  document.getElementById("weekReportTitle").textContent = week.label;
  const members = filteredSortedMembers();
  const bodyHtml = type === "ss" ? buildSsReportHtml(store, week, members)
    : type === "gvg" ? buildGvgReportHtml(store, week, members)
    : buildStatusReportHtml(store, week, members);
  document.getElementById("weekReportBody").innerHTML = bodyHtml;
  document.getElementById("weekReportOverlay").classList.add("active");
}

export function closeWeekReportModal() {
  document.getElementById("weekReportOverlay").classList.remove("active");
}

// =====================================================================
// GENEL RAPOR (salt okunur — herkes görebilir, admin girişi gerekmez)
// =====================================================================
// Haftalık raporun (yukarıda) aksine tek bir haftaya değil, o etkinlik
// türünün TÜM haftalarına birden bakar: her üye için tek bir özet satırı
// (GVG dışında katılım oranı, GVG'de toplam puan) + hafta hafta renkli
// küçük işaretler gösterir. Sıralama, dashboard.js'deki lider tablosuyla
// aynı desende (state.overallReportSortKey/Dir, tıklanan sütun başlığı).

/** Bir hafta + hücre bilgisini rapor tablosundaki küçük renkli bir işarete (chip) çevirir. */
function overallReportChip(week, info) {
  return `<span class="cell-pill ${info.cls}" style="margin:2px; display:inline-block;" title="${escapeHtml(week.label)}">${escapeHtml(week.label)}: ${info.text}</span>`;
}

/** GVG dışındaki türler (svs/ss/kod/other) için üye başına özet satırı üretir. */
function buildOverallReportRow(type, store, member) {
  const ratio = type === "ss" ? ratioSs(store, member) : ratioStatus(store, member);
  const chips = store.weeks.map((week) => {
    const info = type === "ss" ? ssCellInfo(store, member, week)
      : type === "kod" ? attendanceCellInfo(store, member, week)
      : svsOtherCellInfo(store, member, week);
    return overallReportChip(week, info);
  }).join("");
  const sortValue = ratio.den ? ratio.num / ratio.den : -1;
  return { member, sortValue, summaryHtml: formatRatio(ratio.num, ratio.den), chips };
}

/** GVG için üye başına özet satırı üretir: katılım oranı yerine toplam puan anlamlıdır. */
function buildOverallReportRowGvg(store, member) {
  const total = sumGvgPoints(store, member.id);
  const chips = store.weeks.map((week) => overallReportChip(week, gvgCellInfo(store, member, week))).join("");
  return { member, sortValue: total, summaryHtml: `<span style="color:var(--cyan-ink); font-weight:700;">${formatPower(total)}</span>`, chips };
}

/** Genel rapor satırlarını, tıklanan sütuna göre (lider tablosuyla aynı desende) sıralar. */
function sortOverallReportRows(rows) {
  const key = state.overallReportSortKey;
  const dir = state.overallReportSortDir;
  rows.sort((a, b) => {
    let valueA;
    let valueB;
    if (key === "name") {
      valueA = a.member.name.toLowerCase();
      valueB = b.member.name.toLowerCase();
    } else if (key === "value") {
      valueA = a.sortValue;
      valueB = b.sortValue;
    } else {
      valueA = RANK_ORDER[a.member.rank];
      valueB = RANK_ORDER[b.member.rank];
    }
    if (valueA < valueB) return -1 * dir;
    if (valueA > valueB) return 1 * dir;
    return 0;
  });
  return rows;
}

/** Genel rapor modalının içeriğini, mevcut açık tür ve sıralamaya göre yeniden çizer. */
function renderOverallReport() {
  const type = state.overallReportType;
  if (!type) return;
  const store = storeFor(type);
  const body = document.getElementById("overallReportBody");
  if (!store.weeks.length) {
    body.innerHTML = `<div class="empty-state"><h3>${t("emptyWeeksTitle")}</h3><p>${t("emptyWeeksDesc")}</p></div>`;
    return;
  }

  const members = filteredSortedMembers();
  const rows = sortOverallReportRows(
    members.map((member) => type === "gvg" ? buildOverallReportRowGvg(store, member) : buildOverallReportRow(type, store, member))
  );
  const valueHeaderKey = type === "gvg" ? "lbGvgTotal" : type === "ss" ? "lbSsRatio" : type === "kod" ? "lbKodRatio" : type === "svs" ? "lbSvsRatio" : "lbOtherRatio";

  body.innerHTML = `
    <table>
      <thead>
        <tr>
          <th onclick="setOverallReportSort('rank')">${t("thRank")}</th>
          <th onclick="setOverallReportSort('name')">${t("lbMember")}</th>
          <th onclick="setOverallReportSort('value')">${t(valueHeaderKey)}</th>
          <th>${t("thWeeks")}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td><span class="rank-badge ${rankClass(row.member.rank)}" style="font-size:11px;padding:2px 8px;">${row.member.rank}</span></td>
            <td class="member-name">${escapeHtml(row.member.name)}</td>
            <td class="num-cell">${row.summaryHtml}</td>
            <td>${row.chips}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/** Sıralama sütununa tıklanınca (lider tablosuyla aynı desende) sıralamayı değiştirir ve yeniden çizer. */
export function setOverallReportSort(key) {
  if (state.overallReportSortKey === key) {
    state.overallReportSortDir *= -1;
  } else {
    state.overallReportSortKey = key;
    state.overallReportSortDir = key === "rank" ? -1 : 1;
  }
  renderOverallReport();
}

/** Herkesin görebildiği, salt okunur — bir etkinlik türünün TÜM haftalarını kapsayan genel raporunu açar. */
export function openOverallReportModal(type) {
  state.overallReportType = type;
  state.overallReportSortKey = "rank";
  state.overallReportSortDir = -1;
  document.getElementById("overallReportOverlay").classList.add("active");
  renderOverallReport();
}

export function closeOverallReportModal() {
  document.getElementById("overallReportOverlay").classList.remove("active");
  state.overallReportType = null;
}
