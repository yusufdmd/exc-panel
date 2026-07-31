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
import { state, t, showToast, escapeHtml, rankClass, statusOf, gvgColorClass, formatPower, renderAll } from "./ui.js";
import { filteredSortedMembers } from "./members.js";

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
  state.entryContext = { type, weekId };
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

export function renderEntryRows() {
  if (!state.entryContext) return;
  const { type, weekId } = state.entryContext;
  const store = storeFor(type);
  const query = (document.getElementById("entrySearch").value || "").toLowerCase().trim();
  const list = filteredSortedMembers().filter((m) => !query || m.name.toLowerCase().includes(query) || String(m.gameId).toLowerCase().includes(query));
  const rowsEl = document.getElementById("entryRows");

  if (type === "svs" || type === "other") {
    rowsEl.innerHTML = list.map((member) => {
      const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === weekId);
      const status = statusOf(entry);
      const points = entry ? entry.points : 0;
      const excused = entry ? !!entry.excused : false;
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
      const points = entry ? entry.points : 0;
      return `<tr>
        <td>${escapeHtml(member.name)}</td>
        <td><span class="rank-badge ${rankClass(member.rank)}" style="font-size:11px;padding:2px 8px;">${member.rank}</span></td>
        <td><input type="number" class="pts-input" data-mid="${member.id}" value="${points}"></td>
      </tr>`;
    }).join("");
  } else if (type === "kod") {
    rowsEl.innerHTML = list.map((member) => {
      const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === weekId);
      const status = statusOf(entry);
      const excused = entry ? !!entry.excused : false;
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
      const group = entry ? (entry.group || "") : "";
      const attended = entry ? !!entry.attended : false;
      const excused = entry ? !!entry.excused : false;
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
  return reportSection(t("legendJoined"), "var(--success)", joined)
    + reportSection(t("legendNotJoined"), "var(--danger)", absent);
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
      ${reportSection(t("legendJoined"), "var(--success)", bucket.joined)}
      ${reportSection(t("legendNotJoined"), "var(--danger)", bucket.absent)}
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
  return reportSection(t("zoneGreen"), "var(--success)", zones["pill-green"])
    + reportSection(t("zoneYellow"), "var(--warn)", zones["pill-yellow"])
    + reportSection(t("zoneRed"), "var(--danger)", zones["pill-red"]);
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
