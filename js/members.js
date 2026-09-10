// =====================================================================
// EXC PANELİ — members.js
// =====================================================================
// Üye durumu, üye tablosu (arama/filtre/sıralama), üye ekle/düzenle/sil/
// eski-üyeden-geri-al akışları, rütbe kontenjan kontrolü ve üye kartındaki
// güç geçmişi + etkinlik özeti modalı bu dosyada.
//
// `activeMembers()` ve `filteredSortedMembers()` diğer domain dosyaları
// (gvg.js, svs.js, ss.js, events.js, dashboard.js) tarafından da
// kullanılır — bu yüzden export edilirler. members.js kendisi hiçbir
// domain dosyasını import ETMEZ (sadece ui.js + database.js + config.js);
// bağımlılık tek yönlüdür, döngü oluşmaz.
// =====================================================================

import { createMember, updateMember, deleteMember as dbDeleteMember, addPowerHistoryEntry, addTeamPowerHistoryEntry, updateMigrationProspect, createNameSuggestion, deleteNameSuggestion, logActivity } from "./database.js";
import { supabase } from "./supabase.js";
import { RANK_LIMITS } from "./config.js";
import {
  state,
  t,
  showToast,
  escapeHtml,
  formatPower,
  formatRatio,
  rankClass,
  rankChevrons,
  rowNumHtml,
  todayStr,
  RANK_ORDER,
  buildCampOptions,
  campLevelSortValue,
  isDigitsOnly,
  elementBadge,
  buildElementPicker,
  setElementPickerActive,
  renderElementFilter,
  gvgCellInfo,
  ssCellInfo,
  svsOtherCellInfo,
  attendanceCellInfo,
  sumGvgPoints,
  sumStatusPoints,
  ratioStatus,
  ratioSs,
  elementLabel,
  registerRenderer,
  renderAll
} from "./ui.js";
import { openExportModal } from "./exportCsv.js";

/** Supabase'ten dönen ham üye satırını uygulamanın kullandığı şekle çevirir. */
export function mapMember(row) {
  return {
    id: row.id,
    name: row.name,
    gameId: row.game_id,
    rank: row.rank,
    campLevel: row.camp_level,
    power: row.power,
    teamPower: row.team_power || 0,
    teamElement: row.team_element || null,
    isOld: row.is_old,
    oldSince: row.old_since,
    joinedAt: row.joined_at,
    userChangedAt: row.user_changed_at || null,
    nameHistory: Array.isArray(row.name_history) ? row.name_history : [],
    isMigrated: !!row.is_migrated,
    migratedTo: row.migrated_to_server ?? null,
    powerHistory: []
  };
}

/** Supabase'ten dönen ham isim değişikliği önerisi satırını uygulamanın kullandığı şekle çevirir. */
export function mapNameSuggestion(row) {
  return { id: row.id, memberId: row.member_id, oldName: row.old_name || "", suggestedName: row.suggested_name, createdAt: row.created_at };
}

/** Bir üyenin hangi listede (aktif/eski/göç eden) görüneceğini belirler. */
function memberCategory(member) {
  if (member.isMigrated) return "migrated";
  return member.isOld ? "old" : "active";
}

/** Ne eski (OLD) işaretli ne de başka sunucuya göç etmiş üyeleri döndürür. */
export function activeMembers() {
  return state.members.filter((member) => memberCategory(member) === "active");
}

/** Etkinlik tablolarında ve toplu giriş modalında kullanılan, rütbeye sonra isme göre sıralı aktif üye listesi. */
export function filteredSortedMembers() {
  return activeMembers().sort((a, b) => {
    const rankDiff = RANK_ORDER[b.rank] - RANK_ORDER[a.rank];
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name);
  });
}

// =====================================================================
// İSTATİSTİK KARTLARI
// =====================================================================
function renderStats() {
  const active = activeMembers();
  const counts = { R5: 0, R4: 0, R3: 0, R2: 0, R1: 0 };
  active.forEach((member) => { counts[member.rank] = (counts[member.rank] || 0) + 1; });
  document.getElementById("statsRow").innerHTML = `
    <div class="stat-card"><div class="num">${active.length}</div><div class="lbl">${t("statTotal")}</div></div>
    <div class="stat-card r5"><div class="num">${counts.R5}</div><div class="lbl">R5</div></div>
    <div class="stat-card r4"><div class="num">${counts.R4}</div><div class="lbl">R4</div></div>
    <div class="stat-card r3"><div class="num">${counts.R3}</div><div class="lbl">R3</div></div>
    <div class="stat-card r2"><div class="num">${counts.R2}</div><div class="lbl">R2</div></div>
    <div class="stat-card r1"><div class="num">${counts.R1}</div><div class="lbl">R1</div></div>
  `;
}

// =====================================================================
// ÜYE TABLOSU
// =====================================================================
export function renderMembers() {
  renderStats();
  renderNameSuggestions();
  renderElementFilter();
  const query = (document.getElementById("memberSearch").value || "").toLowerCase().trim();
  const list = state.members.filter((member) => {
    const matchesView = memberCategory(member) === state.memberView;
    const matchesRank = state.rankFilter === "ALL" || member.rank === state.rankFilter;
    const matchesElement = state.elementFilter === "ALL" || member.teamElement === state.elementFilter;
    const matchesQuery = !query || (member.name || "").toLowerCase().includes(query) || String(member.gameId || "").toLowerCase().includes(query);
    return matchesView && matchesRank && matchesElement && matchesQuery;
  });

  list.sort((a, b) => {
    let valueA;
    let valueB;
    if (state.sortKey === "rank") {
      valueA = RANK_ORDER[a.rank];
      valueB = RANK_ORDER[b.rank];
      if (valueA === valueB) return (Number(b.power) || 0) - (Number(a.power) || 0); // aynı rütbede güç azalan sırada, her zaman
    } else if (state.sortKey === "name") {
      valueA = (a.name || "").toLowerCase();
      valueB = (b.name || "").toLowerCase();
    } else if (state.sortKey === "campSort") {
      valueA = campLevelSortValue(a.campLevel);
      valueB = campLevelSortValue(b.campLevel);
    } else if (state.sortKey === "joinedAt") {
      valueA = a.joinedAt || "";
      valueB = b.joinedAt || "";
    } else {
      valueA = Number(a[state.sortKey]) || 0;
      valueB = Number(b[state.sortKey]) || 0;
    }
    if (valueA < valueB) return -1 * state.sortDir;
    if (valueA > valueB) return 1 * state.sortDir;
    return 0;
  });

  const rowsEl = document.getElementById("memberRows");
  document.getElementById("memberEmpty").style.display = list.length ? "none" : "block";
  rowsEl.innerHTML = list.map((member, index) => {
    const draftPower = state.powerAiDraft && state.powerAiDraft[member.id];
    const suspiciousPower = state.powerAiSuspicious && state.powerAiSuspicious[member.id];
    let powerCell;
    if (draftPower != null) {
      powerCell = `<span style="text-decoration:line-through; color:var(--text-dim);">${formatPower(member.power)}</span> → <strong style="color:var(--cyan-ink);">${formatPower(draftPower)}</strong>`;
    } else if (suspiciousPower != null) {
      powerCell = `<span style="color:var(--warn-ink); font-weight:700;" title="${t("powerSuspiciousTitle")}">⚠️ ${formatPower(member.power)} → ${formatPower(suspiciousPower)}</span>
        <button class="icon-btn admin-only" style="width:20px;height:20px;" onclick="acceptSuspiciousPower('${member.id}')" title="${t("powerSuspiciousAccept")}">✓</button>
        <button class="icon-btn danger admin-only" style="width:20px;height:20px;" onclick="rejectSuspiciousPower('${member.id}')" title="${t("powerSuspiciousReject")}">✕</button>`;
    } else {
      powerCell = formatPower(member.power);
    }
    return `
    <tr>
      <td class="sticky-col">${rowNumHtml(index)}<span class="rank-badge ${rankClass(member.rank)}">${member.rank}<span class="chev">${rankChevrons(member.rank)}</span></span></td>
      <td class="sticky-col" style="left:145px;"><span class="member-name">${escapeHtml(member.name || "—")}</span>${member.isOld ? `<span class="old-tag">OLD${state.memberView === "old" && member.oldSince ? " · " + member.oldSince : ""}</span>` : ""}${member.isMigrated ? `<span class="old-tag">${t("migratedTag")}${member.migratedTo != null ? " · " + member.migratedTo : ""}</span>` : ""}</td>
      <td class="member-id">${escapeHtml(String(member.gameId || "—"))}</td>
      <td class="num-cell" title="${Number(member.power) || 0}">${powerCell}</td>
      <td class="num-cell">${escapeHtml(String(member.campLevel || "-"))}</td>
      <td class="num-cell">${member.teamPower ? `${elementBadge(member.teamElement, 20)} <span style="vertical-align:middle;">${formatPower(member.teamPower)}</span>` : "—"}</td>
      <td class="num-cell">${escapeHtml((member.joinedAt || "").slice(0, 10)) || "—"}</td>
      <td><div class="row-actions">
        <button class="icon-btn" onclick="openHistoryModal('${member.id}')" title="${t("powerHistory")}">📈</button>
        <button class="icon-btn" onclick="openNameSuggestModal('${member.id}')" title="${t("suggestNameChangeTitle")}">✏️</button>
        ${state.memberView === "old" ? `<button class="icon-btn admin-only" onclick="restoreMember('${member.id}')" title="${t("restoreMember")}">↺</button>` : ""}
        <button class="icon-btn admin-only" onclick="openMemberModal('${member.id}')">✎</button>
        <button class="icon-btn danger admin-only" onclick="deleteMember('${member.id}')">✕</button>
      </div></td>
    </tr>
  `;
  }).join("");
}
registerRenderer(renderMembers);

export function setMemberView(view) {
  // Üye (viewer) rolü sadece "Aktif Üyeler"i görebilir (bkz. app.js -> renderPanelMode,
  // bu sekmeleri zaten arayüzden gizler) — burada da savunma amaçlı engellenir.
  if (state.isMember && view !== "active") return;
  state.memberView = view;
  document.querySelectorAll(".subtab[data-mv]").forEach((el) => el.classList.toggle("active", el.dataset.mv === view));
  renderMembers();
}

export function setRankFilter(rank) {
  state.rankFilter = rank;
  document.querySelectorAll(".filter-chip").forEach((el) => el.classList.toggle("active", el.dataset.rank === rank));
  renderMembers();
}

/** Element filtre rozetlerinden birine tıklanınca çağrılır; zaten seçiliyse tekrar tıklamak filtreyi kaldırır (Tümü). */
export function setElementFilter(element) {
  state.elementFilter = state.elementFilter === element ? "ALL" : element;
  renderMembers();
}

export function setSort(key) {
  if (state.sortKey === key) {
    state.sortDir *= -1;
  } else {
    state.sortKey = key;
    state.sortDir = key === "rank" ? -1 : 1; // rütbe sütunu her zaman R5-önce ile başlar
  }
  renderMembers();
}

/** "Dışa Aktar" — admin, Aktif/Eski/Göç Edenler listelerinden hangilerinin dahil olacağını seçer, tek bir CSV'ye birleşir. */
export function exportMembers() {
  const items = [
    { id: "active", label: t("subActiveMembers") },
    { id: "old", label: t("subOldMembers") },
    { id: "migrated", label: t("subMigratedMembers") }
  ];
  const listLabel = { active: t("subActiveMembers"), old: t("subOldMembers"), migrated: t("subMigratedMembers") };
  openExportModal(t("exportBtn"), items, (selectedIds) => {
    const list = state.members.filter((m) => selectedIds.includes(memberCategory(m)));
    const rows = [[
      t("thRank"), t("thUsername"), t("thId"), t("thPower"), t("thCamp"),
      t("lblTeamPower"), t("lblTeamElement"), t("lblJoinedAt"), t("thListView")
    ]];
    list.forEach((m) => {
      rows.push([
        m.rank, m.name || "", m.gameId || "", Number(m.power) || 0, m.campLevel || "",
        Number(m.teamPower) || 0, m.teamElement ? elementLabel(m.teamElement) : t("elementNone"),
        (m.joinedAt || "").slice(0, 10), listLabel[memberCategory(m)]
      ]);
    });
    return { filename: "exc-paneli-uyeler-" + todayStr() + ".csv", rows };
  });
}

// =====================================================================
// İSİM DEĞİŞİKLİĞİ ÖNERİLERİ — üye (viewer) rolü gönderir, admin onaylar
// =====================================================================
/**
 * Bekleyen isim değişikliği önerilerini (sadece admin görür — bkz.
 * sql/add_name_suggestions.sql RLS) "Üyeler" panelinin üstünde,
 * "Göç Başvuruları" ile aynı desende çizer.
 */
function renderNameSuggestions() {
  const hasSuggestions = state.nameSuggestions.length > 0;
  document.getElementById("nameSuggestionsEmpty").style.display = hasSuggestions ? "none" : "block";
  document.getElementById("nameSuggestionsTableWrap").style.display = hasSuggestions ? "" : "none";
  document.getElementById("nameSuggestionsRows").innerHTML = state.nameSuggestions.map((suggestion) => `
    <tr>
      <td><span class="member-name">${escapeHtml(suggestion.oldName || "—")}</span></td>
      <td><span class="member-name">${escapeHtml(suggestion.suggestedName || "—")}</span></td>
      <td>${escapeHtml((suggestion.createdAt || "").slice(0, 10))}</td>
      <td><div class="row-actions">
        <button class="icon-btn" onclick="approveNameSuggestion('${suggestion.id}')" title="${t("approveNameSuggestionTitle")}">✅</button>
        <button class="icon-btn danger" onclick="dismissNameSuggestion('${suggestion.id}')">✕</button>
      </div></td>
    </tr>
  `).join("");
}

/** Üye listesindeki "✏️" ile bir isim değişikliği önerisi formu açar — üye (viewer) rolü de dahil herkes kullanabilir. */
export function openNameSuggestModal(id) {
  const member = state.members.find((m) => m.id === id);
  if (!member) return;
  document.getElementById("nsMemberId").value = id;
  document.getElementById("nsOldName").value = member.name || "";
  document.getElementById("nsSuggestedName").value = "";
  document.getElementById("nameSuggestOverlay").classList.add("active");
}

export function closeNameSuggestModal() {
  document.getElementById("nameSuggestOverlay").classList.remove("active");
}

export async function submitNameSuggestion() {
  const memberId = document.getElementById("nsMemberId").value;
  const member = state.members.find((m) => m.id === memberId);
  const suggestedName = document.getElementById("nsSuggestedName").value.trim();
  if (!suggestedName) {
    showToast(t("nameSuggestionRequired"));
    return;
  }
  if (member && suggestedName === member.name) {
    showToast(t("nameSuggestionSameAsCurrent"));
    return;
  }
  try {
    await createNameSuggestion({ member_id: memberId, old_name: member ? member.name : "", suggested_name: suggestedName });
    closeNameSuggestModal();
    showToast(t("toastNameSuggestionSent"));
    notifyDiscordNameSuggestion(member ? member.name : "", suggestedName);
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/**
 * Öneri kaydedildikten SONRA Discord kanalına bildirim düşürür (bkz.
 * api/notify-name-suggestion.js). Bilerek "fire-and-forget" — bildirim
 * başarısız olursa sessizce yutulur, çünkü önerinin kendisi zaten
 * kaydedildi ve kullanıcıya bunun için ayrı bir hata gösterilmesine
 * gerek yok.
 */
async function notifyDiscordNameSuggestion(oldName, suggestedName) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData && sessionData.session ? sessionData.session.access_token : "";
    await fetch("/api/notify-name-suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ oldName, suggestedName })
    });
  } catch (error) {
    console.error(error);
  }
}

/**
 * Bir isim önerisini onaylar: üyenin kayıtlı adını gerçekten değiştirir
 * (eski adı, mevcut "önceki isimler" geçmişine eklenir — bkz. saveMember'daki
 * aynı nameHistory mantığı) ve öneriyi kuyruktan siler.
 */
export async function approveNameSuggestion(id) {
  const suggestion = state.nameSuggestions.find((s) => s.id === id);
  if (!suggestion) return;
  const member = state.members.find((m) => m.id === suggestion.memberId);
  if (!member) {
    showToast(t("nameSuggestionMemberGone"));
    return;
  }
  if (!confirm(t("confirmApproveNameSuggestion"))) return;
  try {
    const previousName = member.name;
    const nameHistory = Array.isArray(member.nameHistory) ? [...member.nameHistory] : [];
    if (previousName && previousName !== suggestion.suggestedName) {
      nameHistory.push({ name: previousName, changedAt: todayStr(), type: "renamed" });
    }
    const row = await updateMember(member.id, { name: suggestion.suggestedName, name_history: nameHistory });
    const index = state.members.findIndex((m) => m.id === member.id);
    if (index >= 0) state.members[index] = { ...mapMember(row), powerHistory: state.members[index].powerHistory };
    await deleteNameSuggestion(id);
    state.nameSuggestions = state.nameSuggestions.filter((s) => s.id !== id);
    await logActivity("updated", "member", member.id, { name: suggestion.suggestedName }, state.currentAdminUsername);
    renderAll();
    showToast(t("toastNameSuggestionApproved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/** Bir isim önerisini reddeder — üyenin adı değişmez, öneri sadece kuyruktan silinir. */
export async function dismissNameSuggestion(id) {
  if (!confirm(t("confirmDismissNameSuggestion"))) return;
  try {
    await deleteNameSuggestion(id);
    state.nameSuggestions = state.nameSuggestions.filter((s) => s.id !== id);
    renderAll();
    showToast(t("toastNameSuggestionDismissed"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

// =====================================================================
// ÜYE MODALI (EKLE/DÜZENLE)
// =====================================================================
/** OLD ve Göç Etti anahtarlarının görünümünü ve göç sunucu alanının görünürlüğünü state ile senkronize eder. Bu iki durum birbirini dışlar. */
function syncMemberStatusToggles() {
  document.getElementById("oldToggle").classList.toggle("on", state.oldFlag);
  document.getElementById("migratedToggle").classList.toggle("on", state.migratedFlag);
  document.getElementById("migratedToField").style.display = state.migratedFlag ? "" : "none";
}

export function openMemberModal(id) {
  state.pendingProspectApprovalId = null; // varsayılan: normal ekleme/düzenleme, göç adayı onay akışı değil (bkz. migration.js -> approveProspect)
  buildCampOptions();
  buildElementPicker();
  document.getElementById("memberEditId").value = id || "";
  if (id) {
    const member = state.members.find((m) => m.id === id);
    document.getElementById("memberModalTitle").textContent = t("memberEditTitle");
    document.getElementById("fName").value = member.name || "";
    document.getElementById("fGameId").value = member.gameId || "";
    document.getElementById("fRank").value = member.rank;
    document.getElementById("fPower").value = member.power;
    document.getElementById("fCamp").value = member.campLevel;
    document.getElementById("fTeamPower").value = member.teamPower || "";
    document.getElementById("fTeamElement").value = member.teamElement || "";
    setElementPickerActive(member.teamElement || "");
    document.getElementById("fJoinedAt").value = member.joinedAt ? member.joinedAt.slice(0, 10) : "";
    document.getElementById("fMigratedTo").value = member.migratedTo != null ? member.migratedTo : "";
    document.getElementById("fUserChangedAt").value = member.userChangedAt ? member.userChangedAt.slice(0, 10) : "";
    document.getElementById("userChangedStatus").textContent = member.userChangedAt ? (t("userChangedStagedLabel") + ": " + member.userChangedAt.slice(0, 10)) : "";
    document.getElementById("userChangedField").style.display = "";
    state.oldFlag = !!member.isOld;
    state.migratedFlag = !!member.isMigrated;
  } else {
    document.getElementById("memberModalTitle").textContent = t("memberAddTitle");
    ["fName", "fGameId", "fPower", "fMigratedTo", "fTeamPower", "fTeamElement"].forEach((fieldId) => { document.getElementById(fieldId).value = ""; });
    setElementPickerActive("");
    document.getElementById("fRank").value = "R1";
    document.getElementById("fCamp").value = "1";
    document.getElementById("fJoinedAt").value = todayStr();
    document.getElementById("fUserChangedAt").value = "";
    document.getElementById("userChangedStatus").textContent = "";
    document.getElementById("userChangedField").style.display = "none";
    state.oldFlag = false;
    state.migratedFlag = false;
  }
  syncMemberStatusToggles();
  document.getElementById("memberOverlay").classList.add("active");
}

export function closeMemberModal() {
  document.getElementById("memberOverlay").classList.remove("active");
  state.pendingProspectApprovalId = null;
}

export function toggleOld() {
  state.oldFlag = !state.oldFlag;
  if (state.oldFlag) state.migratedFlag = false; // "eski üye" ve "göç etti" birbirini dışlar
  syncMemberStatusToggles();
}

export function toggleMigrated() {
  state.migratedFlag = !state.migratedFlag;
  if (state.migratedFlag) state.oldFlag = false; // "eski üye" ve "göç etti" birbirini dışlar
  syncMemberStatusToggles();
}

/** Element seçicide bir elemente tıklanınca çağrılır; zaten seçiliyse tekrar tıklamak seçimi kaldırır. */
export function setTeamElement(element) {
  const hidden = document.getElementById("fTeamElement");
  const next = hidden.value === element ? "" : element;
  hidden.value = next;
  setElementPickerActive(next);
}

/**
 * Hesabı bugün itibariyle yeni bir kullanıcının devraldığını işaretler (kayıt
 * "Kaydet" ile onaylanana kadar sadece formda bekler). Genellikle değişen tek
 * bilgi kullanıcı adı olduğu için (ID değişemez, kamp seviyesi/güç zaten
 * elle düzenlenebilir alanlar) kullanıcı adı alanı bilerek boşaltılıp
 * odaklanır — admin yeni kullanıcının adını girmeye zorlanır.
 */
export function markUserChanged() {
  if (!confirm(t("confirmUserChanged"))) return;
  const today = todayStr();
  document.getElementById("fUserChangedAt").value = today;
  document.getElementById("userChangedStatus").textContent = t("userChangedStagedLabel") + ": " + today;
  const nameField = document.getElementById("fName");
  nameField.value = "";
  nameField.focus();
}

/** Verilen rütbe için kontenjan doluysa uyarı metni, aksi halde null döndürür. Göç eden üyeler kontenjana sayılmaz. */
function rankLimitBlockedMessage(rank, excludeId) {
  const limit = RANK_LIMITS[rank];
  if (!limit) return null;
  const activeCountAtRank = state.members.filter((m) => memberCategory(m) === "active" && m.rank === rank && m.id !== excludeId).length;
  return activeCountAtRank >= limit ? (rank + " rütbesi için üye sınırına ulaşıldı (maks. " + limit + ").") : null;
}

/** Aynı ID numarasını kullanan başka bir üye varsa, kullanıcıyı onaylatır (devam/vazgeç). true dönerse kayda devam edilir. */
function confirmDuplicateGameId(gameId, excludeId) {
  if (!gameId) return true;
  const duplicate = state.members.find((m) => m.id !== excludeId && String(m.gameId || "").trim() === gameId);
  if (!duplicate) return true;
  return confirm(`Bu ID numarası ("${gameId}") zaten "${duplicate.name || "isimsiz bir üye"}" adlı kayıtta kullanılıyor. Yine de devam etmek istiyor musunuz?`);
}

export async function saveMember() {
  const name = document.getElementById("fName").value.trim();
  const gameId = document.getElementById("fGameId").value.trim();
  const editId = document.getElementById("memberEditId").value;
  // Göç sunucu numarası, sadece "Göç Etti" anahtarı açıkken anlamlıdır ve o zaman bile opsiyoneldir.
  const migratedToRaw = state.migratedFlag ? document.getElementById("fMigratedTo").value.trim() : "";
  const migratedTo = migratedToRaw === "" ? null : (Number(migratedToRaw) || null);

  // Göç eden üyeler için tüm bilgiler eksik olabilir; diğer tüm üyelerde isim/ID hâlâ zorunlu.
  if (!state.migratedFlag && (!name || !gameId)) {
    showToast(t("nameIdRequired"));
    return;
  }
  // ID numarası girildiyse (göç eden üyeler için boş bırakılabilir), sadece rakamlardan oluşmalı ve tam 15 basamak olmalı.
  if (gameId && !isDigitsOnly(gameId, 15)) {
    showToast(t("invalidGameId"));
    return;
  }
  if (!confirmDuplicateGameId(gameId, editId)) return;

  const powerRaw = document.getElementById("fPower").value.trim();
  const teamPowerRaw = document.getElementById("fTeamPower").value.trim();
  if ((powerRaw && !isDigitsOnly(powerRaw)) || (teamPowerRaw && !isDigitsOnly(teamPowerRaw)) || (migratedToRaw && !isDigitsOnly(migratedToRaw))) {
    showToast(t("invalidNumberField"));
    return;
  }

  const power = Number(powerRaw) || 0;
  const rank = document.getElementById("fRank").value;
  const campLevel = document.getElementById("fCamp").value;
  const teamPower = Number(teamPowerRaw) || 0;
  const teamElement = document.getElementById("fTeamElement").value || null;
  const joinedAt = document.getElementById("fJoinedAt").value || todayStr();

  if (!state.oldFlag && !state.migratedFlag) {
    const blockMessage = rankLimitBlockedMessage(rank, editId);
    if (blockMessage) {
      showToast(blockMessage);
      return;
    }
  }

  try {
    if (editId) {
      const index = state.members.findIndex((m) => m.id === editId);
      const previous = state.members[index];
      let oldSince = previous.oldSince || null;
      if (state.oldFlag && !previous.isOld) oldSince = todayStr();
      if (!state.oldFlag) oldSince = null;

      const userChangedAt = document.getElementById("fUserChangedAt").value || null;
      // "Kullanıcı Değişti" bu kayıtta İLK KEZ işaretlendiyse (markUserChanged() ile
      // fUserChangedAt bu oturumda değiştiyse), isim değişikliği "aynı kişi adını
      // değiştirdi" değil, "hesabı yeni biri devraldı" anlamına gelir — bu iki durum
      // oyuncu kartında ayrı gösterilir (bkz. buildNameHistoryHtml).
      const userChangedJustSet = !!userChangedAt && userChangedAt !== (previous.userChangedAt ? previous.userChangedAt.slice(0, 10) : null);

      const nameHistory = Array.isArray(previous.nameHistory) ? [...previous.nameHistory] : [];
      if (previous.name && previous.name !== name) {
        nameHistory.push({ name: previous.name, changedAt: todayStr(), type: userChangedJustSet ? "userChanged" : "renamed" });
      }

      const row = await updateMember(editId, {
        name: name || null, game_id: gameId || null, rank, power, camp_level: campLevel,
        team_power: teamPower, team_element: teamElement,
        is_old: state.oldFlag, old_since: oldSince, name_history: nameHistory,
        is_migrated: state.migratedFlag, migrated_to_server: migratedTo,
        user_changed_at: userChangedAt, joined_at: joinedAt
      });

      const history = Array.isArray(previous.powerHistory) ? [...previous.powerHistory] : [];
      const lastEntry = history[history.length - 1];
      if (!lastEntry || Number(lastEntry.power) !== power) {
        const today = todayStr();
        if (lastEntry && lastEntry.date === today) lastEntry.power = power;
        else history.push({ date: today, power });
        await addPowerHistoryEntry(editId, history[history.length - 1].date, power);
      }
      const teamHistory = Array.isArray(previous.teamPowerHistory) ? [...previous.teamPowerHistory] : [];
      const lastTeamEntry = teamHistory[teamHistory.length - 1];
      if (!lastTeamEntry || Number(lastTeamEntry.teamPower) !== teamPower) {
        const today = todayStr();
        if (lastTeamEntry && lastTeamEntry.date === today) lastTeamEntry.teamPower = teamPower;
        else teamHistory.push({ date: today, teamPower });
        await addTeamPowerHistoryEntry(editId, teamHistory[teamHistory.length - 1].date, teamPower);
      }
      state.members[index] = { ...mapMember(row), powerHistory: history, teamPowerHistory: teamHistory };
      await logActivity("updated", "member", editId, { name: name || previous.name || "İsimsiz" }, state.currentAdminUsername);
    } else {
      const today = todayStr();
      const row = await createMember({
        name: name || null, game_id: gameId || null, rank, power, camp_level: campLevel,
        team_power: teamPower, team_element: teamElement,
        is_old: state.oldFlag, old_since: state.oldFlag ? today : null,
        is_migrated: state.migratedFlag, migrated_to_server: migratedTo,
        joined_at: joinedAt
      });
      await addPowerHistoryEntry(row.id, today, power);
      await addTeamPowerHistoryEntry(row.id, today, teamPower);
      state.members.push({ ...mapMember(row), powerHistory: [{ date: today, power }], teamPowerHistory: [{ date: today, teamPower }] });
      await logActivity("created", "member", row.id, { name: name || "İsimsiz" }, state.currentAdminUsername);

      // "Onayla" akışından geldiyse (bkz. migration.js -> approveProspect), üye başarıyla
      // oluşturulduktan sonra göç adayını "Tamamlandı" listesinden SİLMEZ — admin kimin göç
      // ettiğini orada kalıcı olarak görebilsin diye sadece converted_to_member işaretlenir
      // (bkz. migration.js -> renderMigration, ✅ butonunun tekrar tıklanıp bir daha üye
      // oluşturulmasını engellemek için de kullanılır). Bu adım kendi try/catch'inde tutulur
      // ki işaretleme başarısız olsa bile üyenin oluşturulduğu doğru şekilde bildirilsin.
      if (state.pendingProspectApprovalId) {
        const prospectId = state.pendingProspectApprovalId;
        state.pendingProspectApprovalId = null;
        try {
          await updateMigrationProspect(prospectId, { converted_to_member: true });
          const prospect = state.migration.find((p) => p.id === prospectId);
          if (prospect) prospect.convertedToMember = true;
        } catch (cleanupError) {
          console.error(cleanupError);
        }
      }
    }
    closeMemberModal();
    renderAll();
    showToast(t("toastMemberSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/** Bir üyeyi (app-shape), `createMember`'a doğrudan geri verilebilecek veritabanı satırı şekline çevirir — silme anlık görüntüsü (bkz. deleteMember) ve activity.js -> restoreDeletedMember için. */
function memberToDbSnapshot(member) {
  return {
    id: member.id, name: member.name, game_id: member.gameId, rank: member.rank, camp_level: member.campLevel,
    power: member.power, team_power: member.teamPower, team_element: member.teamElement,
    is_old: member.isOld, old_since: member.oldSince, joined_at: member.joinedAt, user_changed_at: member.userChangedAt,
    name_history: member.nameHistory, is_migrated: member.isMigrated, migrated_to_server: member.migratedTo
  };
}

export async function deleteMember(id) {
  if (!confirm(t("confirmDeleteMember"))) return;
  const target = state.members.find((m) => m.id === id);
  // Geri yükleme (bkz. activity.js -> restoreDeletedMember) için, silinmeden önce
  // üyenin ve tüm etkinlik türlerindeki kayıtlarının bir anlık görüntüsü alınır.
  const snapshot = target ? {
    member: memberToDbSnapshot(target),
    powerHistory: target.powerHistory || [],
    teamPowerHistory: target.teamPowerHistory || [],
    entries: {
      gvg: state.gvg.entries.filter((e) => e.memberId === id),
      svs: state.svs.entries.filter((e) => e.memberId === id),
      ss: state.ss.entries.filter((e) => e.memberId === id),
      kod: state.kod.entries.filter((e) => e.memberId === id),
      other: state.other.entries.filter((e) => e.memberId === id)
    }
  } : null;
  try {
    await dbDeleteMember(id);
    state.members = state.members.filter((m) => m.id !== id);
    state.svs.entries = state.svs.entries.filter((e) => e.memberId !== id);
    state.gvg.entries = state.gvg.entries.filter((e) => e.memberId !== id);
    state.ss.entries = state.ss.entries.filter((e) => e.memberId !== id);
    state.kod.entries = state.kod.entries.filter((e) => e.memberId !== id);
    state.other.entries = state.other.entries.filter((e) => e.memberId !== id);
    await logActivity("deleted", "member", id, { name: (target && target.name) || "İsimsiz", snapshot }, state.currentAdminUsername);
    renderAll();
    showToast(t("toastMemberDeleted"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

export async function restoreMember(id) {
  const index = state.members.findIndex((m) => m.id === id);
  if (index < 0) return;
  const blockMessage = rankLimitBlockedMessage(state.members[index].rank, id);
  if (blockMessage) {
    showToast(blockMessage);
    return;
  }
  try {
    const row = await updateMember(id, { is_old: false, old_since: null });
    state.members[index] = { ...mapMember(row), powerHistory: state.members[index].powerHistory };
    await logActivity("restored", "member", id, { name: row.name || "İsimsiz" }, state.currentAdminUsername);
    renderAll();
    showToast(t("toastMemberSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

// =====================================================================
// GÜÇ GEÇMİŞİ + ETKİNLİK ÖZETİ MODALI
// =====================================================================
// `valueKey` sayesinde hem ana güç (power) hem "1. Takım Gücü" (teamPower)
// geçmişi için aynı grafik/tablo kodu kullanılır (bkz. buildHistoryRowsHtml).
function buildHistoryChart(history, valueKey = "power") {
  if (!history || history.length < 2) return "";
  const width = 600;
  const height = 150;
  const padLeft = 8;
  const padRight = 8;
  const padTop = 14;
  const padBottom = 16;
  const powers = history.map((h) => Number(h[valueKey]) || 0);
  const min = Math.min(...powers);
  const max = Math.max(...powers);
  const range = (max - min) || 1;
  const stepX = history.length > 1 ? (width - padLeft - padRight) / (history.length - 1) : 0;
  const points = history.map((h, i) => {
    const x = padLeft + i * stepX;
    const y = padTop + (height - padTop - padBottom) * (1 - ((Number(h[valueKey]) - min) / range));
    return { x, y, h };
  });
  const polylinePoints = points.map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
  const circles = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--cyan-ink)" stroke="var(--bg-panel)" stroke-width="2"><title>${escapeHtml(p.h.date)}: ${formatPower(p.h[valueKey])}</title></circle>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%; height:150px; display:block; margin-bottom:16px;">
    <polyline points="${polylinePoints}" fill="none" stroke="var(--cyan-ink)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${circles}
  </svg>`;
}

/** Güç/1. Takım Gücü geçmiş tablosunun satırlarını (tarih + değer + bir öncekine göre fark) üretir. */
function buildHistoryRowsHtml(history, valueKey = "power") {
  return history.map((entry, index) => {
    const previousValue = index > 0 ? history[index - 1][valueKey] : null;
    let deltaHtml = '<span style="color:var(--text-dim);">—</span>';
    if (previousValue != null) {
      const delta = Number(entry[valueKey]) - Number(previousValue);
      const color = delta > 0 ? "var(--success-ink)" : delta < 0 ? "var(--danger-ink)" : "var(--text-dim)";
      const sign = delta > 0 ? "+" : "";
      deltaHtml = `<span style="color:${color}; font-family:var(--font-mono); font-weight:700;">${sign}${formatPower(delta)}</span>`;
    }
    return `<tr>
      <td>${entry.date}</td>
      <td class="num-cell">${formatPower(entry[valueKey])}</td>
      <td>${deltaHtml}</td>
    </tr>`;
  }).reverse().join("");
}

/** Bir üyenin "Kullanıcı Değişti" eşik tarihini ("YYYY-MM-DD") döndürür; hiç işaretlenmemişse katılma tarihini kullanır. */
function memberThreshold(member) {
  return (member.userChangedAt || member.joinedAt || "").slice(0, 10);
}

/**
 * Bir üyenin SVS/GVG/SS/Diğer etkinlik özetini, tablolardakiyle aynı renk
 * kurallarıyla üretir. Üyenin "Kullanıcı Değişti" eşik tarihinden ÖNCEKİ
 * haftalar buraya hiç dahil edilmez — o veriler hesabı önceden kullanan
 * kişiye ait olduğu için, güncel kullanıcının oyuncu kartında görünmesi
 * yanıltıcı olur (haftalık tablolarda/Genel Rapor'da hâlâ görünürler,
 * sadece bu kişisel özet kartından gizlenir).
 */
function buildEventSummaryHtml(member) {
  const threshold = memberThreshold(member);
  const sections = [
    { key: "svs", store: state.svs, title: "SVS" },
    { key: "gvg", store: state.gvg, title: "GVG" },
    { key: "ss", store: state.ss, title: "SS" },
    { key: "kod", store: state.kod, title: "King of Desert" },
    { key: "other", store: state.other, title: t("subOther") }
  ];
  const html = sections.map(({ key, store, title }) => {
    const weeks = threshold ? store.weeks.filter((week) => !week.date || week.date >= threshold) : store.weeks;
    if (!weeks.length) return "";
    // sumGvgPoints/sumStatusPoints haftaya bakmadan doğrudan entries üzerinden toplar,
    // bu yüzden entries de görünür haftalarla eşleşecek şekilde filtrelenmeli — yoksa
    // eşik öncesi haftaların puanları toplama sızar (chip'lerde gizli olsalar bile).
    const visibleWeekIds = new Set(weeks.map((w) => w.id));
    const visibleEntries = store.entries.filter((e) => visibleWeekIds.has(e.weekId));
    const visibleStore = { weeks, entries: visibleEntries };
    let summary;
    if (key === "gvg") {
      summary = t("lbGvgTotal") + ": " + sumGvgPoints(visibleStore, member.id);
    } else if (key === "ss") {
      const ratio = ratioSs(visibleStore, member);
      summary = t("lbSsRatio") + ": " + formatRatio(ratio.num, ratio.den);
    } else if (key === "kod") {
      const ratio = ratioStatus(visibleStore, member);
      summary = t("lbKodRatio") + ": " + formatRatio(ratio.num, ratio.den);
    } else {
      const ratio = ratioStatus(visibleStore, member);
      const total = sumStatusPoints(visibleStore, member.id);
      const ratioLabel = key === "svs" ? t("lbSvsRatio") : t("lbOtherRatio");
      const totalLabel = key === "svs" ? t("lbSvsTotal") : t("lbOtherTotal");
      summary = ratioLabel + ": " + formatRatio(ratio.num, ratio.den) + " · " + totalLabel + ": " + total;
    }
    const chips = weeks.map((week) => {
      const info = key === "gvg" ? gvgCellInfo(visibleStore, member, week)
        : key === "ss" ? ssCellInfo(visibleStore, member, week)
        : key === "kod" ? attendanceCellInfo(visibleStore, member, week)
        : svsOtherCellInfo(visibleStore, member, week);
      return `<span class="cell-pill ${info.cls}" style="margin:3px 4px 3px 0;" title="${escapeHtml(week.label)}">${escapeHtml(week.label)}: ${info.text}</span>`;
    }).join("");
    return `<div style="margin-bottom:14px;">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${title} — ${summary}</div>
      <div style="display:flex;flex-wrap:wrap;">${chips}</div>
    </div>`;
  }).join("");
  return html || "";
}

/** Bir üyenin eski kullanıcı adlarını (varsa) "Ad (tarih), Ad (tarih)" biçiminde listeler. */
/**
 * Aynı kişinin kendi adını değiştirmesi ("renamed") ile hesabın başka birine
 * geçmesi ("userChanged", bkz. saveMember) ayrı gösterilir — ikincisi "aynı
 * kişinin adı değişmiş" gibi bir yanılgıya yol açmasın diye farklı etiketle.
 * Eski (tip bilgisi olmayan) kayıtlar geriye dönük uyumluluk için "renamed" sayılır.
 */
function buildNameHistoryHtml(member) {
  if (!Array.isArray(member.nameHistory) || !member.nameHistory.length) return "";
  const renamed = member.nameHistory.filter((entry) => (entry.type || "renamed") === "renamed");
  const userChanged = member.nameHistory.filter((entry) => entry.type === "userChanged");
  let html = "";
  if (renamed.length) {
    const items = renamed.map((entry) => `${escapeHtml(entry.name)} (${entry.changedAt})`).join(", ");
    html += `<div style="margin-bottom:8px; font-size:12px; color:var(--text-muted);">
      <span style="text-transform:uppercase; letter-spacing:0.5px; color:var(--text-dim);">${t("previousNames")}:</span>
      ${items}
    </div>`;
  }
  if (userChanged.length) {
    const items = userChanged.map((entry) => `${escapeHtml(entry.name)} (${entry.changedAt})`).join(", ");
    html += `<div style="margin-bottom:8px; font-size:12px; color:var(--warn-ink);">
      <span style="text-transform:uppercase; letter-spacing:0.5px;">${t("userChangedHistoryLabel")}:</span>
      ${items}
    </div>`;
  }
  return html;
}

export function openHistoryModal(id) {
  state.historyMemberId = id;
  const member = state.members.find((m) => m.id === id);
  if (!member) return;
  document.getElementById("historyTitle").textContent = t("powerHistory") + " — " + member.name;
  // Önceki kullanıcı adı / "Kullanıcı Değişti" geçmişi idari bir bilgidir —
  // üye (viewer) rolü hiç görmez, sadece admin görür.
  document.getElementById("historyNameHistoryWrap").innerHTML = state.isMember ? "" : buildNameHistoryHtml(member);
  // "Kullanıcı Değişti" eşiğinden önceki güç kayıtları önceki kullanıcıya ait olduğu
  // için oyuncu kartından gizlenir (bkz. buildEventSummaryHtml'deki aynı mantık).
  const threshold = memberThreshold(member);
  const visiblePowerHistory = Array.isArray(member.powerHistory)
    ? member.powerHistory.filter((entry) => !threshold || entry.date >= threshold)
    : [];
  const history = visiblePowerHistory.length
    ? [...visiblePowerHistory].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    : [{ date: threshold || todayStr(), power: member.power || 0 }];
  document.getElementById("historyChartWrap").innerHTML = buildHistoryChart(history);
  document.getElementById("historyEventsWrap").innerHTML = buildEventSummaryHtml(member);
  document.getElementById("historyRows").innerHTML = buildHistoryRowsHtml(history);

  // "1. Takım Gücü" geçmişi — üyenin bu değeri hiç kaydedilmediyse (ör. bu
  // özellik eklenmeden önce oluşturulmuş, bir daha hiç düzenlenmemiş üyeler)
  // bölüm tamamen gizlenir; boş bir grafik/tablo göstermenin bir anlamı yok.
  const visibleTeamPowerHistory = Array.isArray(member.teamPowerHistory)
    ? member.teamPowerHistory.filter((entry) => !threshold || entry.date >= threshold)
    : [];
  const teamHistorySection = document.getElementById("teamHistorySection");
  if (visibleTeamPowerHistory.length) {
    const teamHistory = [...visibleTeamPowerHistory].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    document.getElementById("teamHistoryChartWrap").innerHTML = buildHistoryChart(teamHistory, "teamPower");
    document.getElementById("teamHistoryRows").innerHTML = buildHistoryRowsHtml(teamHistory, "teamPower");
    teamHistorySection.style.display = "";
  } else {
    teamHistorySection.style.display = "none";
  }

  document.getElementById("historyOverlay").classList.add("active");
}

export function closeHistoryModal() {
  document.getElementById("historyOverlay").classList.remove("active");
  state.historyMemberId = null;
}

// =====================================================================
// EKRAN GÖRÜNTÜSÜNDEN AI İLE GÜÇ GÜNCELLEME
// =====================================================================
// Toplu giriş modalındaki "AI ile Doldur" (bkz. events.js) ile AYNI
// sunucu ucunu (api/read-screenshot.js, type:"power") ve aynı ilkeleri
// kullanır: görsel hiçbir yerde saklanmaz, sonuçlar doğrudan kaydedilmez
// — `state.powerAiDraft`'a yazılıp üye tablosunda "eski → yeni" olarak
// gösterilir, admin "✅ Değişiklikleri Uygula"ya basana kadar hiçbir şey
// veritabanına yazılmaz. events.js'i import ETMEDEN (members.js'in tek
// yönlü bağımlılık kuralı, bkz. dosya başı) aynı küçük yardımcı burada
// ayrıca tanımlanır.

const POWER_BATCH_SIZE = 6;
const POWER_MAX_SCREENSHOTS = 30;
// Yeni okunan güç, eskisinin bu kaç katından fazlaysa "şüpheli" sayılır (ör.
// OCR bir haneyi/basamağı yanlış okumuş olabilir) — otomatik uygulanmaz,
// satırda ⚠️ ile gösterilip tek tek onay/red istenir. Düşüşler eski değer
// ne olursa olsun HER ZAMAN şüpheli sayılır (bkz. classifyPowerReading).
const SUSPICIOUS_JUMP_MULTIPLIER = 2;

/** Seçilen görseli, API'ye göndermeden önce makul bir boyuta küçültüp JPEG data URL'ine çevirir (bkz. events.js'teki eşdeğeri — burada da aynı mantık, döngüsel import olmasın diye ayrıca tanımlı). */
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

function renderPowerUnmatchedBox() {
  const box = document.getElementById("powerUnmatchedBox");
  if (!box) return;
  const list = state.powerAiUnmatched;
  if (!list || !list.length) {
    box.style.display = "none";
    return;
  }
  document.getElementById("powerUnmatchedTitle").textContent = t("aiUnmatchedTitle").replace("{n}", String(list.length));
  document.getElementById("powerUnmatchedList").innerHTML = list
    .map((u, i) => `<span style="display:inline-flex; align-items:center; gap:6px; background:rgba(0,0,0,0.06); border:1px solid rgba(232,195,74,0.5); border-radius:999px; padding:4px 4px 4px 10px; font-size:12px; color:var(--text-primary);">
      <span><strong>${escapeHtml(u.rawName)}</strong> — ${escapeHtml(u.details)}</span>
      <button onclick="removePowerUnmatchedItem(${i})" title="${t("aiUnmatchedRemove")}" style="border:none; background:transparent; cursor:pointer; font-weight:700; color:var(--warn-ink); line-height:1; padding:3px 5px; border-radius:50%;">✕</button>
    </span>`)
    .join("");
  box.style.display = "";
}

/** Bir "eşleşmeyen" etiketinin ✕'ine basılınca sadece o etiketi görünümden kaldırır. */
export function removePowerUnmatchedItem(index) {
  if (!state.powerAiUnmatched) return;
  state.powerAiUnmatched.splice(index, 1);
  renderPowerUnmatchedBox();
}

/** Yeni okunan bir güç değerinin otomatik uygulanacak (artış) mı, yoksa tek tek onay isteyen "şüpheli" mi (düşüş veya aşırı sıçrama) olduğuna karar verir. */
function isSuspiciousPowerReading(currentPower, newPower) {
  if (currentPower <= 0) return false; // hiç güç girilmemiş üyede her değer normal bir ilk kayıttır
  if (newPower < currentPower) return true; // her düşüş şüpheli
  return newPower > currentPower * SUSPICIOUS_JUMP_MULTIPLIER; // aşırı büyük sıçrama da şüpheli
}

function renderPowerDraftBar() {
  const bar = document.getElementById("powerDraftBar");
  if (!bar) return;
  const count = state.powerAiDraft ? Object.keys(state.powerAiDraft).length : 0;
  const suspiciousCount = state.powerAiSuspicious ? Object.keys(state.powerAiSuspicious).length : 0;
  if (!count && !suspiciousCount) {
    bar.style.display = "none";
    return;
  }
  let label = count ? t("powerDraftLabel").replace("{n}", String(count)) : "";
  if (suspiciousCount) label += (label ? " " : "") + t("powerSuspiciousLabel").replace("{n}", String(suspiciousCount));
  document.getElementById("powerDraftLabel").textContent = label;
  bar.style.display = "flex";
}

/** Admin — tablodaki ⚠️ satırında "✓"ye basınca, o şüpheli değeri normal (otomatik uygulanacak) taslağa taşır. */
export function acceptSuspiciousPower(memberId) {
  if (!state.powerAiSuspicious || state.powerAiSuspicious[memberId] == null) return;
  if (!state.powerAiDraft) state.powerAiDraft = {};
  state.powerAiDraft[memberId] = state.powerAiSuspicious[memberId];
  delete state.powerAiSuspicious[memberId];
  renderMembers();
  renderPowerDraftBar();
}

/** Admin — tablodaki ⚠️ satırında "✕"e basınca, o şüpheli değeri tamamen atar (hiçbir şey uygulanmaz). */
export function rejectSuspiciousPower(memberId) {
  if (!state.powerAiSuspicious) return;
  delete state.powerAiSuspicious[memberId];
  renderMembers();
  renderPowerDraftBar();
}

/** "🤖 AI ile Güç Güncelle" — seçilen ekran görüntüsü/görüntülerini (gerekirse gruplar hâlinde) sunucuya gönderir, dönen güç değerlerini taslak olarak tabloya işler. */
export async function handlePowerScreenshot(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!files.length) return;
  if (files.length > POWER_MAX_SCREENSHOTS) {
    showToast(t("aiFillTooMany").replace("{n}", String(POWER_MAX_SCREENSHOTS)));
    return;
  }
  const roster = activeMembers().map((m) => ({ id: m.id, name: m.name || "", gameId: m.gameId || "" }));
  if (!roster.length) {
    showToast(t("aiFillNoMembers"));
    return;
  }

  const batches = [];
  for (let i = 0; i < files.length; i += POWER_BATCH_SIZE) batches.push(files.slice(i, i + POWER_BATCH_SIZE));

  const btn = document.getElementById("t_powerAiFillBtn");
  const originalLabel = btn ? btn.textContent : "";
  if (btn) btn.disabled = true;

  // Yeni bir okuma turu — önceki taslak/şüpheli/eşleşmeyenler listelerinin üstüne değil, sıfırdan birikir.
  state.powerAiDraft = null;
  state.powerAiSuspicious = null;
  state.powerAiUnmatched = null;
  renderPowerUnmatchedBox();
  renderPowerDraftBar();

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData && sessionData.session ? sessionData.session.access_token : "";

  let failedBatches = 0;
  let firstError = "";
  try {
    for (let i = 0; i < batches.length; i++) {
      if (btn) {
        btn.textContent = batches.length > 1
          ? t("aiFillWorkingBatch").replace("{i}", String(i + 1)).replace("{n}", String(batches.length))
          : t("aiFillWorking");
      }
      try {
        const images = await Promise.all(batches[i].map((file) => resizeImageToDataUrl(file)));
        const res = await fetch("/api/read-screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ type: "power", roster, images })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
        const membersById = new Map(state.members.map((m) => [m.id, m]));
        (payload.results || []).forEach((r) => {
          if (!r || !r.memberId || r.power == null) return;
          const newPower = Number(r.power) || 0;
          const member = membersById.get(r.memberId);
          const currentPower = member ? Number(member.power) || 0 : 0;
          if (isSuspiciousPowerReading(currentPower, newPower)) {
            if (!state.powerAiSuspicious) state.powerAiSuspicious = {};
            state.powerAiSuspicious[r.memberId] = newPower;
          } else {
            if (!state.powerAiDraft) state.powerAiDraft = {};
            state.powerAiDraft[r.memberId] = newPower;
          }
        });
        state.powerAiUnmatched = (state.powerAiUnmatched || []).concat(payload.unmatched || []);
        renderMembers();
        renderPowerUnmatchedBox();
        renderPowerDraftBar();
      } catch (batchError) {
        console.error(batchError);
        if (!firstError) firstError = batchError && batchError.message ? batchError.message : String(batchError);
        failedBatches++;
      }
    }
    const matchedCount = state.powerAiDraft ? Object.keys(state.powerAiDraft).length : 0;
    const suspiciousCount = state.powerAiSuspicious ? Object.keys(state.powerAiSuspicious).length : 0;
    const unmatchedCount = state.powerAiUnmatched ? state.powerAiUnmatched.length : 0;
    let message = t("aiFillDone").replace("{n}", String(matchedCount));
    if (suspiciousCount) message += " " + t("powerSuspiciousToast").replace("{n}", String(suspiciousCount));
    if (unmatchedCount) message += " " + t("aiFillUnmatchedToast").replace("{n}", String(unmatchedCount));
    if (failedBatches) message += " " + t("aiFillBatchFailed").replace("{n}", String(failedBatches)) + (firstError ? ` – ${firstError}` : "");
    showToast(message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
  }
}

/** Admin — taslaktaki (ve onay bekleyen şüpheli) tüm önerilen güç değerlerinden vazgeçip görünümden temizler (hiçbir şey zaten kaydedilmemişti). */
export function discardPowerDraft() {
  state.powerAiDraft = null;
  state.powerAiSuspicious = null;
  renderPowerDraftBar();
  renderMembers();
}

/** Admin — "✅ Değişiklikleri Uygula": taslaktaki her üyenin gücünü tek tek kaydeder (mevcut güç geçmişi mantığıyla aynı şekilde), başarısız olan tek tek atlanır. */
export async function applyPowerDraft() {
  const entries = state.powerAiDraft ? Object.entries(state.powerAiDraft) : [];
  if (!entries.length) {
    if (state.powerAiSuspicious && Object.keys(state.powerAiSuspicious).length) showToast(t("powerOnlySuspiciousLeft"));
    return;
  }
  if (!confirm(t("confirmApplyPowerDraft").replace("{n}", String(entries.length)))) return;

  let successCount = 0;
  for (const [memberId, newPower] of entries) {
    try {
      const row = await updateMember(memberId, { power: newPower });
      const index = state.members.findIndex((m) => m.id === memberId);
      if (index < 0) continue;
      const previous = state.members[index];
      const history = Array.isArray(previous.powerHistory) ? [...previous.powerHistory] : [];
      const lastEntry = history[history.length - 1];
      const today = todayStr();
      if (!lastEntry || Number(lastEntry.power) !== newPower) {
        if (lastEntry && lastEntry.date === today) lastEntry.power = newPower;
        else history.push({ date: today, power: newPower });
        await addPowerHistoryEntry(memberId, history[history.length - 1].date, newPower);
      }
      state.members[index] = { ...mapMember(row), powerHistory: history, teamPowerHistory: previous.teamPowerHistory };
      await logActivity("updated", "member", memberId, { name: row.name || "İsimsiz" }, state.currentAdminUsername);
      successCount++;
    } catch (error) {
      console.error(error);
    }
  }

  state.powerAiDraft = null;
  renderPowerDraftBar();
  renderAll();
  showToast(t("toastPowerDraftApplied").replace("{n}", String(successCount)));
}
