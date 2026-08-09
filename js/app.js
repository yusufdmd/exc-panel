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

import { getMembers, getAllPowerHistory, getWeeks, getAllRecords, getMigrationPeriods, getMigrationProspects, getMigrationLeads, getSiteLinks, getNews, subscribeToTables } from "./database.js";
import { POLL_INTERVAL_MS } from "./config.js";
import { state, t, showToast, buildLangSwitch, applyStaticText, initLangFromStorage, persistLanguage, renderAll, registerDataLoader, registerRenderer } from "./ui.js";
import { mapMember, renderMembers, openMemberModal, closeMemberModal, toggleOld, toggleMigrated, markUserChanged, setTeamElement, saveMember, deleteMember, restoreMember, openHistoryModal, closeHistoryModal, setMemberView, setRankFilter, setElementFilter, setSort } from "./members.js";
import { mapWeek, mapEntry, openWeekModal, closeWeekModal, saveWeek, deleteWeek, openEntryModal, closeEntryModal, renderEntryRows, saveEntry, openWeekReportModal, closeWeekReportModal, openOverallReportModal, closeOverallReportModal, setOverallReportSort } from "./events.js";
import { setBoardSort } from "./dashboard.js";
import {
  mapPeriod, mapProspect, mapLead, renderMigration, setMigrationSort,
  selectMigrationPeriod, openPeriodModal, closePeriodModal, savePeriod, deletePeriod,
  openProspectModal, closeProspectModal, saveProspect, deleteProspect, approveProspect,
  processLead, dismissLead
} from "./migration.js";
import { exportBackup, importBackup } from "./backup.js";
import { mapSiteLinks, populateSiteLinksForm, saveSiteLinks } from "./siteLinks.js";
import { mapNewsItem, openNewsModal, closeNewsModal, saveNews, deleteNews } from "./news.js";
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

/**
 * Supabase'ten tüm veriyi (üyeler + dört etkinlik türü) çeker ve state'i günceller.
 * Admin girişi doğrulanmadan (bkz. auth.js -> updateGateVisibility) hiçbir şey
 * çekmez — panel giriş kapısının arkasındayken gereksiz istek atılmasın diye.
 */
async function loadAll(silent) {
  if (!state.isAdmin) return;
  try {
    document.getElementById("syncText").textContent = t("syncConnecting");
    const [
      membersRes, historyRes,
      svsWeeksRes, svsRecordsRes,
      gvgWeeksRes, gvgRecordsRes,
      ssWeeksRes, ssRecordsRes,
      kodWeeksRes, kodRecordsRes,
      otherWeeksRes, otherRecordsRes,
      migrationPeriodsRes, migrationRes, migrationLeadsRes, siteLinksRes, newsRes
    ] = await Promise.allSettled([
      getMembers(), getAllPowerHistory(),
      getWeeks("svs"), getAllRecords("svs"),
      getWeeks("gvg"), getAllRecords("gvg"),
      getWeeks("ss"), getAllRecords("ss"),
      getWeeks("kod"), getAllRecords("kod"),
      getWeeks("other"), getAllRecords("other"),
      getMigrationPeriods(), getMigrationProspects(), getMigrationLeads(), getSiteLinks(), getNews()
    ]);

    const historyByMember = {};
    settledList(historyRes).forEach((entry) => {
      if (!historyByMember[entry.member_id]) historyByMember[entry.member_id] = [];
      historyByMember[entry.member_id].push({ date: entry.history_date, power: entry.power });
    });
    state.members = settledList(membersRes).map((row) => {
      const member = mapMember(row);
      member.powerHistory = (historyByMember[row.id] || []).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return member;
    });

    state.svs = { weeks: settledList(svsWeeksRes).map(mapWeek), entries: settledList(svsRecordsRes).map((r) => mapEntry("svs", r)) };
    state.gvg = { weeks: settledList(gvgWeeksRes).map(mapWeek), entries: settledList(gvgRecordsRes).map((r) => mapEntry("gvg", r)) };
    state.ss = { weeks: settledList(ssWeeksRes).map(mapWeek), entries: settledList(ssRecordsRes).map((r) => mapEntry("ss", r)) };
    state.kod = { weeks: settledList(kodWeeksRes).map(mapWeek), entries: settledList(kodRecordsRes).map((r) => mapEntry("kod", r)) };
    state.other = { weeks: settledList(otherWeeksRes).map(mapWeek), entries: settledList(otherRecordsRes).map((r) => mapEntry("other", r)) };
    state.migrationPeriods = settledList(migrationPeriodsRes).map(mapPeriod);
    state.migration = settledList(migrationRes).map(mapProspect);
    state.migrationLeads = settledList(migrationLeadsRes).map(mapLead);
    state.siteLinks = mapSiteLinks(siteLinksRes.status === "fulfilled" ? siteLinksRes.value : null);
    state.news = settledList(newsRes).map(mapNewsItem);

    document.getElementById("syncText").textContent = t("syncLive");
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
  ["members", "power_history", "gvg_weeks", "gvg_records", "svs_weeks", "svs_records", "ss_weeks", "ss_records", "kod_weeks", "kod_records", "other_weeks", "other_records", "migration_periods", "migration_prospects", "migration_leads", "site_links", "news"],
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
// =====================================================================
function renderPanelMode() {
  const chooser = document.getElementById("panelChooser");
  if (!chooser) return; // panelWrap henüz DOM'a hiç render edilmemiş olabilir
  const dataTabs = document.getElementById("dataTabs");
  const siteTabs = document.getElementById("siteTabs");
  const statsRow = document.getElementById("statsRow");
  const dataOnlyActions = document.getElementById("dataOnlyActions");
  const backBtn = document.getElementById("backToChooserBtn");
  const isData = state.panelMode === "data";
  const isSite = state.panelMode === "site";
  chooser.style.display = state.panelMode ? "none" : "";
  dataTabs.style.display = isData ? "" : "none";
  siteTabs.style.display = isSite ? "" : "none";
  statsRow.style.display = isData ? "" : "none";
  dataOnlyActions.style.display = isData ? "contents" : "none";
  backBtn.style.display = state.panelMode ? "" : "none";
}
registerRenderer(renderPanelMode);

function selectPanelMode(mode) {
  state.panelMode = mode;
  switchTab(mode === "data" ? "members" : "sitelinks");
}

function backToChooser() {
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
  openMemberModal, closeMemberModal, toggleOld, toggleMigrated, markUserChanged, setTeamElement, saveMember, deleteMember, restoreMember,
  openWeekModal, closeWeekModal, saveWeek, deleteWeek,
  openEntryModal, closeEntryModal, saveEntry, renderEntryRows,
  openWeekReportModal, closeWeekReportModal,
  openOverallReportModal, closeOverallReportModal, setOverallReportSort,
  openHistoryModal, closeHistoryModal,
  setBoardSort, setLang,
  renderMigration, setMigrationSort, openProspectModal, closeProspectModal, saveProspect, deleteProspect, approveProspect,
  selectMigrationPeriod, openPeriodModal, closePeriodModal, savePeriod, deletePeriod,
  processLead, dismissLead,
  saveSiteLinks,
  openNewsModal, closeNewsModal, saveNews, deleteNews,
  selectPanelMode, backToChooser,
  doLogin, doLogout
});

// =====================================================================
// BAŞLANGIÇ
// =====================================================================
initLangFromStorage();
buildLangSwitch();
applyStaticText();
