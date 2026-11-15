// =====================================================================
// EXC PANELİ — selfReports.js
// =====================================================================
// Discord'daki "/report-participation" slash komutuyla oyuncuların kendi
// gönderdiği, bir AI'nin okuyup admin onayı bekleyen katılım kayıtları
// (bkz. sql/add_self_report_submissions.sql, api/discord-interactions.js).
// Onaylanan bir kayıt, admin panelindeki toplu girişle AYNI yazma
// fonksiyonunu (upsertRecord) ve AYNI app<->DB alan eşlemesini
// (entryToDbPayload, bkz. events.js) kullanarak ilgili {type}_records
// tablosuna işlenir — iki ayrı yazma yolu birbirinden sapmasın diye.
// =====================================================================

import { updateSelfReportSubmission, upsertRecord, logActivity } from "./database.js";
import { entryToDbPayload, mapEntry } from "./events.js";
import { state, t, escapeHtml, showToast, registerRenderer, renderAll, isExempt } from "./ui.js";
import { supabase } from "./supabase.js";

const EVENT_LABELS = { svs: "SVS", ss: "Sandstorm (SS)", kod: "King of Desert (KoD)", gvg: "GVG", kodgvg: "KoD-GVG" };
// Discord'dan kendi kendine bildirim SADECE bu 3 etkinlik için var (kullanıcı
// talebi, bkz. api/discord-register-commands.js'teki komut seçenekleri) -
// "Bu Hafta Eksik Olanlar" listesi de aynı 3'le sınırlı, aksi halde SS/GVG
// için "eksik" gösterip aslında Discord'dan bildirilemeyen bir şeyi işaret
// etmiş olurduk. EVENT_LABELS'ın kendisi 5 türü de tutmaya devam ediyor -
// bu kısıtlamadan ÖNCE gelmiş eski ss/gvg bildirimleri hâlâ doğru etiketle
// gösterilebilsin diye (bkz. renderSelfReports).
const SELF_REPORTABLE_TYPES = ["svs", "kod", "kodgvg"];

export function mapSelfReportSubmission(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    discordId: row.discord_id,
    eventType: row.event_type,
    weekId: row.week_id,
    imageUrl: row.image_url,
    aiExtracted: row.ai_extracted,
    aiUnmatched: !!row.ai_unmatched,
    status: row.status,
    createdAt: row.created_at
  };
}

// Admin'in onaydan ÖNCE düzeltebileceği taslak değerler - sadece bu
// tarayıcı sekmesinde yaşayan geçici bir anlık görüntü (state'te DEĞİL,
// kalıcı/paylaşılan bir şey değil). İlk render'da sub.eventType/
// aiExtracted'tan türetilir, admin bir alanı değiştirdikçe güncellenir.
const selfReportEdits = {};

function getSelfReportEdit(sub) {
  if (!selfReportEdits[sub.id]) {
    const ex = sub.aiExtracted || {};
    selfReportEdits[sub.id] = {
      eventType: sub.eventType,
      status: ex.status === "absent" ? "absent" : "joined",
      points: ex.points != null ? Number(ex.points) : 0,
      excused: !!ex.excused
    };
  }
  return selfReportEdits[sub.id];
}

export function setSelfReportEditType(id, eventType) {
  const sub = state.selfReportSubmissions.find((s) => s.id === id);
  if (!sub) return;
  getSelfReportEdit(sub).eventType = eventType;
  renderAll();
}

export function setSelfReportEditField(id, field, value) {
  const sub = state.selfReportSubmissions.find((s) => s.id === id);
  if (!sub) return;
  const edit = getSelfReportEdit(sub);
  edit[field] = field === "excused" ? !!value : field === "points" ? value : value;
  renderAll();
}

/** AI'nin (veya admin'in düzelttiği) değeri kısa, okunur bir özete çevirir — satırda, modalı açmadan önce bir fikir versin diye. */
function summarizeEdit(edit) {
  if (edit.eventType === "kodgvg") return `${Number(edit.points) || 0} ${t("thPointsCol")}`;
  return `${edit.status === "joined" ? t("legendJoined") : t("legendNotJoined")}${edit.excused ? " (M)" : ""} · ${Number(edit.points) || 0}p`;
}

function renderSelfReports() {
  const wrap = document.getElementById("selfReportsSection");
  if (!wrap) return;
  const hasItems = state.selfReportSubmissions.length > 0;
  document.getElementById("selfReportsEmpty").style.display = hasItems ? "none" : "block";
  document.getElementById("selfReportsTableWrap").style.display = hasItems ? "" : "none";
  document.getElementById("selfReportsRows").innerHTML = state.selfReportSubmissions.map((sub) => {
    const member = state.members.find((m) => m.id === sub.memberId);
    const memberName = member ? member.name : "—";
    const edit = getSelfReportEdit(sub);
    const unmatchedNote = sub.aiUnmatched ? `<div style="color:var(--danger-ink,#E5484D); font-size:11px;">${t("selfReportUnmatched")}</div>` : "";
    return `
    <tr>
      <td><span class="member-name">${escapeHtml(memberName)}</span></td>
      <td>${escapeHtml(EVENT_LABELS[edit.eventType] || edit.eventType)}</td>
      <td>${escapeHtml(summarizeEdit(edit))}${unmatchedNote}</td>
      <td>${escapeHtml((sub.createdAt || "").slice(0, 16).replace("T", " "))}</td>
      <td><a href="${escapeHtml(sub.imageUrl)}" target="_blank" rel="noopener" title="${t("selfReportViewImage")}">🖼️</a></td>
      <td><div class="row-actions">
        <button class="icon-btn" onclick="openSelfReportReviewModal('${sub.id}')" title="${t("approveSelfReportTitle")}">✅</button>
        <button class="icon-btn danger" onclick="rejectSelfReportSubmission('${sub.id}')" title="${t("rejectSelfReportTitle")}">✕</button>
      </div></td>
    </tr>
  `;
  }).join("");
}

// =====================================================================
// ONAY/DÜZELTME EKRANI — "✅" tıklanınca önce doğrudan onaylamak yerine
// bir modal açılır (bkz. kullanıcı talebi): admin burada AI'nin okuduğu
// değeri/etkinlik türünü/haftayı GÖREBİLİR ve isterse değiştirebilir,
// sonra TEK "Onayla" butonuna basar — hiç dokunmazsa AI'nin okuduğu
// değerle, dokunursa düzeltilmiş değerle onaylanmış olur.
// =====================================================================
let reviewingSubmissionId = null;

export function openSelfReportReviewModal(id) {
  reviewingSubmissionId = id;
  document.getElementById("selfReportReviewOverlay").classList.add("active");
  renderSelfReportReviewModal();
}

export function closeSelfReportReviewModal() {
  reviewingSubmissionId = null;
  document.getElementById("selfReportReviewOverlay").classList.remove("active");
}

// Modal tek bir statik DOM parçası (her açılışta yeniden kurulmuyor), bu
// yüzden formdaki alanların onchange'leri doğrudan bir submission id'si
// TAŞIYAMAZ - o an açık olan reviewingSubmissionId'yi burada okuyan ince
// sarmalayıcılar kullanılır (bkz. panel/index.html'deki onchange'ler).
export function setReviewingEventType(eventType) {
  if (reviewingSubmissionId) setSelfReportEditType(reviewingSubmissionId, eventType);
}
export function setReviewingField(field, value) {
  if (reviewingSubmissionId) setSelfReportEditField(reviewingSubmissionId, field, value);
}

function renderSelfReportReviewModal() {
  const overlay = document.getElementById("selfReportReviewOverlay");
  if (!overlay || !overlay.classList.contains("active") || !reviewingSubmissionId) return;
  const sub = state.selfReportSubmissions.find((s) => s.id === reviewingSubmissionId);
  if (!sub) { closeSelfReportReviewModal(); return; }

  const member = state.members.find((m) => m.id === sub.memberId);
  const edit = getSelfReportEdit(sub);
  document.getElementById("selfReportReviewMember").textContent = member ? member.name : "—";
  document.getElementById("selfReportReviewImage").src = sub.imageUrl;
  const unmatchedEl = document.getElementById("selfReportReviewUnmatched");
  unmatchedEl.style.display = sub.aiUnmatched ? "block" : "none";
  unmatchedEl.textContent = sub.aiUnmatched ? t("selfReportUnmatched") : "";

  document.getElementById("selfReportReviewType").innerHTML = SELF_REPORTABLE_TYPES
    .map((ty) => `<option value="${ty}" ${edit.eventType === ty ? "selected" : ""}>${escapeHtml(EVENT_LABELS[ty])}</option>`).join("");

  const weekStore = state[edit.eventType];
  // En güncel hafta en üstte seçili gelir - bilerek sub.weekId (gönderim anındaki
  // "o anki en güncel hafta") değil, HER RENDER'DA yeniden hesaplanan gerçek en
  // güncel hafta: admin onaylamadan önce yeni bir hafta eklerse, açılır liste
  // otomatik olarak o yeni haftayı varsayılan gösterir.
  const sortedWeeks = weekStore ? [...weekStore.weeks].sort((a, b) => (b.date || "").localeCompare(a.date || "")) : [];
  const weekSelectEl = document.getElementById("selfReportReviewWeek");
  weekSelectEl.innerHTML = sortedWeeks.map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.date || "—")}</option>`).join("");
  document.getElementById("selfReportReviewNoWeek").style.display = sortedWeeks.length ? "none" : "block";
  weekSelectEl.style.display = sortedWeeks.length ? "" : "none";

  const isKodGvg = edit.eventType === "kodgvg";
  document.getElementById("selfReportReviewStatusRow").style.display = isKodGvg ? "none" : "flex";
  document.getElementById("selfReportReviewStatus").value = edit.status;
  document.getElementById("selfReportReviewExcused").checked = edit.excused;
  document.getElementById("selfReportReviewPoints").value = edit.points;

  document.getElementById("selfReportReviewApproveBtn").disabled = !sortedWeeks.length;
}
registerRenderer(renderSelfReportReviewModal);

/**
 * Bir bildirimi onaylar: AI'nin okuduğu veriyi ilgili {type}_records tablosuna
 * işler, bildirimi "approved" işaretler. Onaydan ÖNCE o (hafta, üye) için
 * NE vardıysa (hiç kayıt yoksa null) aktivite logunun details.snapshot'ına
 * yazılır — "Aktivite" sekmesindeki ↺ ile bu TEK yazma geri alınabilsin diye
 * (bkz. activity.js -> restoreSelfReportApproval).
 */
/** Onay/düzeltme modalındaki TEK "Onayla" butonu - o an açık olan bildirimi onaylar (bkz. openSelfReportReviewModal). */
export function approveReviewingSelfReportSubmission() {
  if (reviewingSubmissionId) approveSelfReportSubmission(reviewingSubmissionId);
}

export async function approveSelfReportSubmission(id) {
  const sub = state.selfReportSubmissions.find((s) => s.id === id);
  if (!sub) return;
  // Artık sub.aiExtracted'ı DEĞİL, admin'in düzenleme ekranında o an
  // gördüğü (gerekirse düzelttiği) değerleri kullanıyoruz - bkz.
  // getSelfReportEdit/setSelfReportEditField. AI hiç okuyamamış olsa
  // (aiUnmatched) bile admin değerleri elle girip onaylayabilir.
  const edit = getSelfReportEdit(sub);
  const eventType = edit.eventType;
  // Hangi haftaya yazılacağı, gönderim anında kaydedilen sub.weekId değil,
  // admin'in modalda o an gördüğü açılır listeden SEÇTİĞİ hafta (bkz.
  // renderSelfReportReviewModal - varsayılan olarak en güncel hafta seçili gelir).
  const weekSelect = document.getElementById("selfReportReviewWeek");
  const weekId = weekSelect ? weekSelect.value : null;
  if (!weekId) return;
  if (!confirm(t("confirmApproveSelfReport"))) return;
  try {
    const store = state[eventType];
    const previousEntry = store ? store.entries.find((e) => e.weekId === weekId && e.memberId === sub.memberId) || null : null;
    const week = store ? store.weeks.find((w) => w.id === weekId) : null;
    const member = state.members.find((m) => m.id === sub.memberId);

    const entry = eventType === "kodgvg"
      ? { weekId, points: Number(edit.points) || 0 }
      : { weekId, status: edit.status, points: Number(edit.points) || 0, excused: !!edit.excused };
    const payload = entryToDbPayload(eventType, entry, sub.memberId);
    const row = await upsertRecord(eventType, payload);
    const mapped = mapEntry(eventType, row);
    const index = store.entries.findIndex((e) => e.weekId === weekId && e.memberId === sub.memberId);
    if (index >= 0) store.entries[index] = mapped; else store.entries.push(mapped);

    await updateSelfReportSubmission(id, {
      status: "approved", event_type: eventType, week_id: weekId, ai_extracted: entry, ai_unmatched: false,
      reviewed_by: state.currentAdminUsername || null, reviewed_at: new Date().toISOString()
    });
    state.selfReportSubmissions = state.selfReportSubmissions.filter((s) => s.id !== id);
    delete selfReportEdits[id];
    if (reviewingSubmissionId === id) closeSelfReportReviewModal();
    await logActivity("approved", "self_report", id, {
      name: `${member ? member.name : "—"} — ${EVENT_LABELS[eventType] || eventType}${week ? ` (${week.date})` : ""}`,
      snapshot: { type: eventType, weekId, memberId: sub.memberId, submissionId: sub.id, previousEntry }
    }, state.currentAdminUsername);
    renderAll();
    showToast(t("toastSelfReportApproved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/** Bir bildirimi reddeder — hiçbir katılım kaydına dokunulmaz, sadece durumu "rejected" olur (hesap verebilirlik için silinmez). */
export async function rejectSelfReportSubmission(id) {
  if (!confirm(t("confirmRejectSelfReport"))) return;
  try {
    await updateSelfReportSubmission(id, { status: "rejected", reviewed_by: state.currentAdminUsername || null, reviewed_at: new Date().toISOString() });
    state.selfReportSubmissions = state.selfReportSubmissions.filter((s) => s.id !== id);
    delete selfReportEdits[id];
    if (reviewingSubmissionId === id) closeSelfReportReviewModal();
    renderAll();
    showToast(t("toastSelfReportRejected"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/**
 * Bir etkinlik türü için "bu haftanın en güncel haftasında" ne elle bir
 * kaydı NE DE bekleyen/onaylanmış bir self-report'u olan TÜM aktif üyeleri
 * bulur (Discord'u bağlı olsun olmasın — bağlı olmayanlar Discord'dan kendi
 * bildiremez ama yine de "eksik" sayılırlar, sadece elle girilmeleri gerekir).
 * Tamamen tarayıcıda, zaten yüklü state'ten hesaplanır — sunucu tarafındaki
 * BENZER (ama sadece Discord'u bağlı olanları tarayan, çünkü DM atmak için
 * Discord ID şart) tanım için bkz. api/_lib/selfReportGaps.js - ikisi ayrı
 * dilde olduğu için elle senkron tutulan birer kopya, bkz.
 * engagementScoring.js'teki NOT.
 */
// SVS/KoD/Diğer'de bir hafta açıldığında her üyeye status="unknown" ile
// GERÇEK bir veritabanı satırı oluşuyor (bkz. events.js -> renderEntryRows,
// "statusUnknown" seçeneği) - bu "veri girilmedi" demek, "satır var" demek
// değil. GVG/KoD-GVG/SS'de böyle bir sentinel yok - bir satırın varlığı hâlâ
// "veri girilmiş" sayılıyor, bu yüzden GVG/KoD-GVG'nin toplu giriş ekranında
// (events.js -> saveEntry) admin'in HİÇ dokunmadığı satırlar artık hiç
// kaydedilmiyor (eskiden varsayılan 0 ile herkes yazılıyordu, bu da "herkes
// raporlamış" yanlış sonucuna yol açıyordu - canlı bir şikayetle bulundu ve
// düzeltildi). Yine de bu düzeltme GERİYE DÖNÜK DEĞİL: bu değişiklikten önce
// yanlışlıkla yazılmış "hayalet" 0 puanlı satırlar veritabanında duruyor
// olabilir, o haftalar için hâlâ yanlış "kapsanmış" görünebilir.
function hasRealData(type, entry) {
  if (type === "svs" || type === "kod" || type === "other") return entry.status && entry.status !== "unknown";
  return true;
}

function computeMissingForType(type) {
  const store = state[type];
  if (!store || !store.weeks.length) return { week: null, missing: [] };
  const week = [...store.weeks].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  const coveredMemberIds = new Set([
    ...store.entries.filter((e) => e.weekId === week.id && hasRealData(type, e)).map((e) => e.memberId),
    ...state.selfReportSubmissions.filter((s) => s.eventType === type && s.weekId === week.id).map((s) => s.memberId)
  ]);
  const missing = state.members
    .filter((m) => !m.isOld && !m.isMigrated)
    .filter((m) => !isExempt(m, week)) // haftadan önce katılmış/hesabı devralmışsa bu haftadan muaf (bkz. ui.js -> isExempt, engagement.js'teki AYNI kural)
    .filter((m) => !coveredMemberIds.has(m.id))
    .map((m) => ({ name: m.name, hasDiscord: !!m.discordId }));
  return { week, missing };
}

function renderSelfReportGaps() {
  const wrap = document.getElementById("selfReportGapsRows");
  if (!wrap) return;
  const rows = SELF_REPORTABLE_TYPES.map((type) => {
    const { week, missing } = computeMissingForType(type);
    return { type, week, missing };
  }).filter((r) => r.week);
  wrap.innerHTML = rows.map((r) => {
    const dmEligible = r.missing.filter((m) => m.hasDiscord).length;
    return `
    <tr>
      <td style="white-space:nowrap; vertical-align:top;">${escapeHtml(EVENT_LABELS[r.type])}</td>
      <td style="white-space:nowrap; vertical-align:top;">${escapeHtml(r.week.date || "—")}</td>
      <td>${r.missing.length
        ? `<div style="margin-bottom:4px; font-weight:600; color:var(--danger-ink,#E5484D);">${r.missing.length} ${t("selfReportGapCount")}</div>
           <div style="display:flex; flex-wrap:wrap; gap:4px; max-width:900px;">${r.missing.map((m) => `<span class="cell-pill pill-red" title="${m.hasDiscord ? "" : t("selfReportGapNoDiscord")}">${escapeHtml(m.name)}${m.hasDiscord ? "" : " 🔗"}</span>`).join("")}</div>`
        : `<span style="color:var(--text-muted);">${t("selfReportGapsNone")}</span>`}</td>
      <td style="vertical-align:top;">${dmEligible
        ? `<button class="btn-ghost" onclick="sendSelfReportReminder('${r.type}')" title="${t("sendReminderTitle")}">📨 ${t("sendReminderBtn")} (${dmEligible})</button>`
        : ""}</td>
    </tr>
  `;
  }).join("");
}

/** Admin — bu etkinlik türü için hâlâ eksik + Discord'u bağlı üyelere elle bir hatırlatma DM'i gönderir (bkz. api/send-self-report-reminder.js). */
export async function sendSelfReportReminder(type) {
  if (!confirm(t("confirmSendReminder"))) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData && sessionData.session ? sessionData.session.access_token : "";
    const res = await fetch("/api/send-self-report-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ type })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      console.error(body);
      showToast("Error");
      return;
    }
    showToast(`${t("toastReminderSent")} (${body.attempted - body.failed}/${body.attempted})`);
    if (body.failed && Array.isArray(body.failures)) {
      console.error("[selfReports] Gönderilemeyen hatırlatmalar:", body.failures);
      alert(body.failures.map((f) => `${f.name}: ${f.error}`).join("\n"));
    }
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

registerRenderer(renderSelfReports);
registerRenderer(renderSelfReportGaps);
