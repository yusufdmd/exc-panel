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

import { getMembers, getAllPowerHistory, getWeeks, getAllRecords, getMigrationPeriods, getMigrationProspects, subscribeToTables } from "./database.js";
import { POLL_INTERVAL_MS } from "./config.js";
import { state, t, showToast, buildLangSwitch, applyStaticText, initLangFromStorage, persistLanguage, renderAll, registerDataLoader } from "./ui.js";
import { mapMember, renderMembers, openMemberModal, closeMemberModal, toggleOld, toggleMigrated, markUserChanged, saveMember, deleteMember, restoreMember, openHistoryModal, closeHistoryModal, setMemberView, setRankFilter, setSort } from "./members.js";
import { mapWeek, mapEntry, openWeekModal, closeWeekModal, saveWeek, deleteWeek, openEntryModal, closeEntryModal, renderEntryRows, saveEntry, openWeekReportModal, closeWeekReportModal, openOverallReportModal, closeOverallReportModal, setOverallReportSort } from "./events.js";
import { setBoardSort } from "./dashboard.js";
import {
  mapPeriod, mapProspect, renderMigration, setMigrationSort,
  selectMigrationPeriod, openPeriodModal, closePeriodModal, savePeriod, deletePeriod,
  openProspectModal, closeProspectModal, saveProspect, deleteProspect, approveProspect
} from "./migration.js";
import { exportBackup, importBackup } from "./backup.js";
import { openLoginModal, closeLoginModal, doLogin, doLogout } from "./auth.js";
import "./gvg.js";
import "./svs.js";
import "./ss.js";
import "./kod.js";

const REALTIME_RELOAD_DEBOUNCE_MS = 400;

/** Promise.allSettled sonucundan, başarısız olursa boş dizi döndüren güvenli bir liste çıkarır. */
function settledList(result) {
  return result.status === "fulfilled" ? (result.value || []) : [];
}

/** Supabase'ten tüm veriyi (üyeler + dört etkinlik türü) çeker ve state'i günceller. */
async function loadAll(silent) {
  try {
    document.getElementById("syncText").textContent = t("syncConnecting");
    const [
      membersRes, historyRes,
      svsWeeksRes, svsRecordsRes,
      gvgWeeksRes, gvgRecordsRes,
      ssWeeksRes, ssRecordsRes,
      kodWeeksRes, kodRecordsRes,
      otherWeeksRes, otherRecordsRes,
      migrationPeriodsRes, migrationRes
    ] = await Promise.allSettled([
      getMembers(), getAllPowerHistory(),
      getWeeks("svs"), getAllRecords("svs"),
      getWeeks("gvg"), getAllRecords("gvg"),
      getWeeks("ss"), getAllRecords("ss"),
      getWeeks("kod"), getAllRecords("kod"),
      getWeeks("other"), getAllRecords("other"),
      getMigrationPeriods(), getMigrationProspects()
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
  ["members", "power_history", "gvg_weeks", "gvg_records", "svs_weeks", "svs_records", "ss_weeks", "ss_records", "kod_weeks", "kod_records", "other_weeks", "other_records", "migration_periods", "migration_prospects"],
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
  switchTab, switchSub, setMemberView, setRankFilter, setSort, renderMembers,
  openMemberModal, closeMemberModal, toggleOld, toggleMigrated, markUserChanged, saveMember, deleteMember, restoreMember,
  openWeekModal, closeWeekModal, saveWeek, deleteWeek,
  openEntryModal, closeEntryModal, saveEntry, renderEntryRows,
  openWeekReportModal, closeWeekReportModal,
  openOverallReportModal, closeOverallReportModal, setOverallReportSort,
  openHistoryModal, closeHistoryModal,
  setBoardSort, setLang,
  renderMigration, setMigrationSort, openProspectModal, closeProspectModal, saveProspect, deleteProspect, approveProspect,
  selectMigrationPeriod, openPeriodModal, closePeriodModal, savePeriod, deletePeriod,
  openLoginModal, closeLoginModal, doLogin, doLogout
});

// =====================================================================
// BAŞLANGIÇ
// =====================================================================
initLangFromStorage();
buildLangSwitch();
applyStaticText();
loadAll();
