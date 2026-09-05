// =====================================================================
// EXC PANELİ — app.js
// =====================================================================
// Uygulamanın giriş noktası. Sorumlulukları:
//   - Supabase'ten ilk veri yüklemesi (loadAll) + yedek yoklama + realtime abonelik
//   - Sekme/dil geçişleri (birden fazla domain'i etkileyen, bu yüzden
//     tek bir domain dosyasına ait olmayan işlemler)
//   - Tüm modüllerin onclick/onchange'den çağrılabilen fonksiyonlarını
//     `window`'a bağlamak
//   - Sayfa ilk açıldığında çalışacak başlangıç dizisini tetiklemek
//
// gvg.js/svs.js/ss.js/dashboard.js modüllerinden hiçbir isim import
// EDİLMEZ ama yine de import edilirler — çünkü her biri kendi render
// fonksiyonunu ui.js'e KAYDEDER (registerRenderer) ve bu kayıt, modül
// ilk yüklendiğinde (import edildiğinde) çalışır. Bu satırlar olmadan
// o dosyalar hiç çalıştırılmaz ve tabloları hiç çizilmez.
// =====================================================================

import { getMembers, getAllPowerHistory, getAllTeamPowerHistory, getEngagementPeriods, getWeeks, getAllRecords, getMigrationPeriods, getMigrationProspects, getMigrationLeads, getNameSuggestions, getSiteLinks, getNews, getFeaturedVideos, getRecentActivity, subscribeToTables } from "./database.js";
import { POLL_INTERVAL_MS } from "./config.js";
import { state, t, showToast, buildLangSwitch, applyStaticText, initLangFromStorage, persistLanguage, initThemeFromStorage, toggleTheme, renderAll, registerDataLoader, registerRenderer } from "./ui.js";
import { mapMember, renderMembers, openMemberModal, closeMemberModal, toggleOld, toggleMigrated, markUserChanged, setTeamElement, saveMember, deleteMember, restoreMember, openHistoryModal, closeHistoryModal, setMemberView, setRankFilter, setElementFilter, setSort, exportMembers, mapNameSuggestion, openNameSuggestModal, closeNameSuggestModal, submitNameSuggestion, approveNameSuggestion, dismissNameSuggestion } from "./members.js";
import { mapWeek, mapEntry, openWeekModal, closeWeekModal, saveWeek, deleteWeek, openEntryModal, closeEntryModal, renderEntryRows, saveEntry, handleEntryScreenshot, removeUnmatchedItem, openWeekReportModal, closeWeekReportModal, openOverallReportModal, closeOverallReportModal, setOverallReportSort, exportEventTable } from "./events.js";
import { setBoardSort, openParticipationReportModal, closeParticipationReportModal } from "./dashboard.js";
import { mapEngagementPeriod, setEngagementSort, startNewEngagementPeriod, endEngagementPeriod, deleteEngagementPeriod, selectEngagementPeriod, renderEngagement, openEngagementReportModal } from "./engagement.js";
import {
  mapPeriod, mapProspect, mapLead, renderMigration, setMigrationSort, setMigrationView,
  selectMigrationPeriod, openPeriodModal, closePeriodModal, savePeriod, deletePeriod,
  openProspectModal, closeProspectModal, saveProspect, deleteProspect, approveProspect,
  markProspectFailed, restoreProspect, markProspectConfirmed, unconfirmProspect, markProspectFinalized, unfinalizeProspect,
  setMigrationColorFilter, setMigrationStatusFilter, setProspectTeamElement,
  processLead, dismissLead, exportMigration, copyProspectToNextPeriod
} from "./migration.js";
import { exportBackup, importBackup } from "./backup.js";
import { closeExportModal, toggleExportAll, confirmExport } from "./exportCsv.js";
import { mapSiteLinks, populateSiteLinksForm, saveSiteLinks } from "./siteLinks.js";
import { mapNewsItem, openNewsModal, closeNewsModal, saveNews, deleteNews } from "./news.js";
import { mapVideoItem, openVideoModal, closeVideoModal, saveVideo, deleteVideo, moveVideo } from "./videos.js";
import { mapActivity } from "./activity.js";
import { doLogin, doLogout } from "./auth.js";
import "./gvg.js";
import "./svs.js";
import "./ss.js";
import "./kod.js";

const REALTIME_RELOAD_DEBOUNCE_MS = 400;

/** Promise.allSettled sonucundan, başarısız olursa boş dizi döndüren güvenli bir liste çıkarır. */
function settledList(result) {
  return result.status === "fulfilled" ? (result.value || []) : [];
}

// loadAll'ın en son state'e yazdığı verinin JSON anlık görüntüsü — 12 saniyelik
// yoklama ve her realtime yankısında sunucudan gelen veri BİREBİR AYNIYSA state'e
// dokunmadan/tabloları yeniden çizmeden çıkmak için (bkz. loadAll). Aksi halde hiçbir
// şey değişmemiş olsa bile her döngüde tüm tablolar sıfırdan çizilir — bu da kaydırma
// konumunu/fare vurgusunu sıfırlayıp ekranda "titreme" hissi yaratır.
let lastDataSnapshot = null;

/**
 * Supabase'ten tüm veriyi (üyeler + dört etkinlik türü) çeker ve state'i günceller.
 * Ne admin ne üye girişi doğrulanmadan (bkz. auth.js -> updateGateVisibility)
 * hiçbir şey çekmez — panel giriş kapısının arkasındayken gereksiz istek
 * atılmasın diye. Üye (viewer) rolü için Göç/Aktivite çağrıları hiç
 * yapılmaz — zaten RLS bunları engeller, boşuna "izin reddedildi" hatası
 * üretmemek için baştan atlanır (bkz. sql/add_member_role.sql).
 */
async function loadAll(silent) {
  if (!state.isAdmin && !state.isMember) return;
  try {
    document.getElementById("syncText").textContent = t("syncConnecting");
    const restricted = state.isMember;
    const [
      membersRes, historyRes, teamHistoryRes, engagementPeriodsRes,
      svsWeeksRes, svsRecordsRes,
      gvgWeeksRes, gvgRecordsRes,
      ssWeeksRes, ssRecordsRes,
      kodWeeksRes, kodRecordsRes,
      otherWeeksRes, otherRecordsRes,
      migrationPeriodsRes, migrationRes, migrationLeadsRes, nameSuggestionsRes, siteLinksRes, newsRes, videosRes, activityRes
    ] = await Promise.allSettled([
      getMembers(), getAllPowerHistory(), getAllTeamPowerHistory(), getEngagementPeriods(),
      getWeeks("svs"), getAllRecords("svs"),
      getWeeks("gvg"), getAllRecords("gvg"),
      getWeeks("ss"), getAllRecords("ss"),
      getWeeks("kod"), getAllRecords("kod"),
      getWeeks("other"), getAllRecords("other"),
      restricted ? Promise.resolve([]) : getMigrationPeriods(),
      restricted ? Promise.resolve([]) : getMigrationProspects(),
      restricted ? Promise.resolve([]) : getMigrationLeads(),
      restricted ? Promise.resolve([]) : getNameSuggestions(),
      getSiteLinks(), getNews(), getFeaturedVideos(),
      restricted ? Promise.resolve([]) : getRecentActivity()
    ]);

    const historyByMember = {};
    settledList(historyRes).forEach((entry) => {
      if (!historyByMember[entry.member_id]) historyByMember[entry.member_id] = [];
      historyByMember[entry.member_id].push({ date: entry.history_date, power: entry.power });
    });
    const teamHistoryByMember = {};
    settledList(teamHistoryRes).forEach((entry) => {
      if (!teamHistoryByMember[entry.member_id]) teamHistoryByMember[entry.member_id] = [];
      teamHistoryByMember[entry.member_id].push({ date: entry.history_date, teamPower: entry.team_power });
    });
    const nextMembers = settledList(membersRes).map((row) => {
      const member = mapMember(row);
      member.powerHistory = (historyByMember[row.id] || []).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      member.teamPowerHistory = (teamHistoryByMember[row.id] || []).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return member;
    });

    const nextData = {
      members: nextMembers,
      engagementPeriods: settledList(engagementPeriodsRes).map(mapEngagementPeriod),
      svs: { weeks: settledList(svsWeeksRes).map(mapWeek), entries: settledList(svsRecordsRes).map((r) => mapEntry("svs", r)) },
      gvg: { weeks: settledList(gvgWeeksRes).map(mapWeek), entries: settledList(gvgRecordsRes).map((r) => mapEntry("gvg", r)) },
      ss: { weeks: settledList(ssWeeksRes).map(mapWeek), entries: settledList(ssRecordsRes).map((r) => mapEntry("ss", r)) },
      kod: { weeks: settledList(kodWeeksRes).map(mapWeek), entries: settledList(kodRecordsRes).map((r) => mapEntry("kod", r)) },
      other: { weeks: settledList(otherWeeksRes).map(mapWeek), entries: settledList(otherRecordsRes).map((r) => mapEntry("other", r)) },
      migrationPeriods: settledList(migrationPeriodsRes).map(mapPeriod),
      migration: settledList(migrationRes).map(mapProspect),
      migrationLeads: settledList(migrationLeadsRes).map(mapLead),
      nameSuggestions: settledList(nameSuggestionsRes).map(mapNameSuggestion),
      siteLinks: mapSiteLinks(siteLinksRes.status === "fulfilled" ? siteLinksRes.value : null),
      news: settledList(newsRes).map(mapNewsItem),
      featuredVideos: settledList(videosRes).map(mapVideoItem),
      activityLog: settledList(activityRes).map(mapActivity)
    };

    document.getElementById("syncText").textContent = t("syncLive");

    const snapshot = JSON.stringify(nextData);
    if (snapshot === lastDataSnapshot) return; // sunucudan gelen veri öncekiyle birebir aynı — yeniden çizmeye gerek yok
    lastDataSnapshot = snapshot;

    Object.assign(state, nextData);
    renderAll();
  } catch (error) {
    console.error("load error", error);
    document.getElementById("syncText").textContent = t("syncError");
    if (!silent) showToast(t("syncError"));
  }
}
registerDataLoader(loadAll);

function manualRefresh() {
  loadAll();
}

setInterval(() => loadAll(true), POLL_INTERVAL_MS);

let realtimeReloadTimer = null;
subscribeToTables(
  ["members", "power_history", "team_power_history", "engagement_periods", "gvg_weeks", "gvg_records", "svs_weeks", "svs_records", "ss_weeks", "ss_records", "kod_weeks", "kod_records", "other_weeks", "other_records", "migration_periods", "migration_prospects", "migration_leads", "name_suggestions", "site_links", "news", "featured_videos", "activity_logs"],
  () => {
    clearTimeout(realtimeReloadTimer);
    realtimeReloadTimer = setTimeout(() => loadAll(true), REALTIME_RELOAD_DEBOUNCE_MS);
  }
);

// =====================================================================
// SEKME / DİL GEÇİŞLERİ (birden fazla domain'i etkiler)
// =====================================================================
function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll(".tab").forEach((el) => el.classList.toggle("active", el.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
  document.getElementById("panel-" + tab).classList.add("active");
  if (tab === "sitelinks") populateSiteLinksForm();
  renderAll();
}

// =====================================================================
// PANEL KATMANI (Veri Paneli / Site Editörü) — giriş sonrası önce bir
// seçim ekranı gösterilir, "data"/"site" seçildikten sonra ilgili sekme
// çubuğu ve panelleri görünür olur. state.panelMode her yeni girişte
// null'a döner (bkz. auth.js -> updateGateVisibility), ama bu ekranın
// kendisi (renderPanelMode) her renderAll() çağrısında sadece MEVCUT
// panelMode'u DOM'a uygular — realtime/yoklama güncellemeleri admin
// başka bir sekmedeyken onu seçim ekranına GERİ ATMAZ.
//
// Üye (viewer) rolü bu katmanı hiç görmez: seçim ekranı atlanır (bkz.
// auth.js -> panelMode her zaman "data"), Site Editörü'ne hiç geçilemez,
// ve Veri Paneli içindeki Göç/Aktivite sekmeleri (hassas veri) tek tek
// gizlenir — bunlar zaten RLS'te de kapalı, burası sadece arayüz.
// =====================================================================
function renderPanelMode() {
  const chooser = document.getElementById("panelChooser");
  if (!chooser) return; // panelWrap henüz DOM'a hiç render edilmemiş olabilir
  const dataTabs = document.getElementById("dataTabs");
  const siteTabs = document.getElementById("siteTabs");
  const statsRow = document.getElementById("statsRow");
  const dataOnlyActions = document.getElementById("dataOnlyActions");
  const backBtn = document.getElementById("backToChooserBtn");
  const restricted = state.isMember;
  const isData = state.panelMode === "data";
  const isSite = state.panelMode === "site" && !restricted;
  chooser.style.display = (state.panelMode || restricted) ? "none" : "";
  dataTabs.style.display = isData ? "" : "none";
  siteTabs.style.display = isSite ? "" : "none";
  statsRow.style.display = isData ? "" : "none";
  dataOnlyActions.style.display = isData && !restricted ? "contents" : "none";
  backBtn.style.display = state.panelMode && !restricted ? "" : "none";
  const migrationTab = document.querySelector('#dataTabs .tab[data-tab="migration"]');
  const activityTab = document.querySelector('#dataTabs .tab[data-tab="activity"]');
  if (migrationTab) migrationTab.style.display = restricted ? "none" : "";
  if (activityTab) activityTab.style.display = restricted ? "none" : "";
  // Üye rolü üye listesinde sadece "Aktif Üyeler"i görür — eski/göç eden üye
  // alt sekmeleri de gizlenir (bkz. members.js -> setMemberView'daki eşleşen koruma).
  const oldMembersTab = document.querySelector('.subtab[data-mv="old"]');
  const migratedMembersTab = document.querySelector('.subtab[data-mv="migrated"]');
  if (oldMembersTab) oldMembersTab.style.display = restricted ? "none" : "";
  if (migratedMembersTab) migratedMembersTab.style.display = restricted ? "none" : "";
  // Üye rolü chooser'ı hiç görmediği için normalde "Veri Paneli"ni seçerken
  // çalışan switchTab() hiç tetiklenmez — ilk girişte hiçbir panel/sekme aktif
  // olmaz ve ekran boş görünür. Henüz aktif bir panel yoksa burada Etkinlikler
  // sekmesi otomatik açılır (switchTab kendi renderAll()'ını tetikler, bu
  // yüzden hemen return edilir — sonraki geçişte panel zaten aktif olacağından
  // tekrar çalışmaz).
  if (restricted && isData && !document.querySelector(".panel.active")) {
    switchTab("events");
    return;
  }
}
registerRenderer(renderPanelMode);

function selectPanelMode(mode) {
  if (state.isMember) return; // üye rolü seçim ekranını hiç görmez, buraya erişemez
  state.panelMode = mode;
  switchTab(mode === "data" ? "members" : "sitelinks");
}

function backToChooser() {
  if (state.isMember) return; // üye rolü için dönülecek bir seçim ekranı yok
  state.panelMode = null;
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
  renderAll();
}

function switchSub(sub) {
  state.currentSub = sub;
  document.querySelectorAll(".subtab[data-sub]").forEach((el) => el.classList.toggle("active", el.dataset.sub === sub));
  document.querySelectorAll(".subpanel").forEach((panel) => panel.classList.remove("active"));
  document.getElementById("sub-" + sub).classList.add("active");
  renderAll();
}

function setLang(lang) {
  state.currentLang = lang;
  buildLangSwitch();
  applyStaticText();
  renderAll();
  persistLanguage(lang);
}

// =====================================================================
// GLOBAL BAĞLAMA (module scope -> HTML'deki inline onclick/onchange)
// =====================================================================
Object.assign(window, {
  exportBackup, importBackup, manualRefresh,
  switchTab, switchSub, setMemberView, setRankFilter, setElementFilter, setSort, renderMembers,
  openMemberModal, closeMemberModal, toggleOld, toggleMigrated, markUserChanged, setTeamElement, saveMember, deleteMember, restoreMember, exportMembers,
  openNameSuggestModal, closeNameSuggestModal, submitNameSuggestion, approveNameSuggestion, dismissNameSuggestion,
  openWeekModal, closeWeekModal, saveWeek, deleteWeek,
  openEntryModal, closeEntryModal, saveEntry, renderEntryRows, handleEntryScreenshot, removeUnmatchedItem,
  openWeekReportModal, closeWeekReportModal,
  openOverallReportModal, closeOverallReportModal, setOverallReportSort, exportEventTable,
  openHistoryModal, closeHistoryModal,
  setBoardSort, openParticipationReportModal, closeParticipationReportModal, setLang,
  setEngagementSort, startNewEngagementPeriod, endEngagementPeriod, deleteEngagementPeriod, selectEngagementPeriod, renderEngagement, openEngagementReportModal,
  renderMigration, setMigrationSort, setMigrationView, openProspectModal, closeProspectModal, saveProspect, deleteProspect, approveProspect,
  markProspectFailed, restoreProspect, markProspectConfirmed, unconfirmProspect, markProspectFinalized, unfinalizeProspect,
  setMigrationColorFilter, setMigrationStatusFilter, setProspectTeamElement,
  selectMigrationPeriod, openPeriodModal, closePeriodModal, savePeriod, deletePeriod,
  processLead, dismissLead, exportMigration, copyProspectToNextPeriod,
  closeExportModal, toggleExportAll, confirmExport,
  saveSiteLinks,
  openNewsModal, closeNewsModal, saveNews, deleteNews,
  openVideoModal, closeVideoModal, saveVideo, deleteVideo, moveVideo,
  selectPanelMode, backToChooser,
  doLogin, doLogout, toggleTheme
});

// =====================================================================
// BAŞLANGIÇ
// =====================================================================
initLangFromStorage();
initThemeFromStorage();
buildLangSwitch();
applyStaticText();
