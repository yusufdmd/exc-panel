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

import { getMembers, getMemberDiscordIds, getAllPowerHistory, getAllTeamPowerHistory, getEngagementPeriods, getWeeks, getAllRecords, getMigrationPeriods, getMigrationProspects, getMigrationLeads, getNameSuggestions, getSelfReportSubmissions, getTeamPowerSuggestions, getSiteLinks, getNews, getFeaturedVideos, getRecentActivity, getAccountVault, getSetting, subscribeToTables } from "./database.js";
import { POLL_INTERVAL_MS } from "./config.js";
import { state, t, showToast, buildLangSwitch, applyStaticText, initLangFromStorage, persistLanguage, initThemeFromStorage, toggleTheme, renderAll, registerDataLoader, registerRenderer, liveFormatNumberInput, expandPowerShorthandInput, initPowerShorthandMode, setEventWeekSort } from "./ui.js";
import { mapMember, renderMembers, openMemberModal, closeMemberModal, toggleOld, toggleMigrated, markUserChanged, setTeamElement, saveMember, deleteMember, restoreMember, openHistoryModal, closeHistoryModal, copyDiscordId, setMemberView, setRankFilter, setElementFilter, setSort, exportMembers, mapNameSuggestion, openNameSuggestModal, closeNameSuggestModal, submitNameSuggestion, approveNameSuggestion, dismissNameSuggestion, handlePowerScreenshot, removePowerUnmatchedItem, discardPowerDraft, applyPowerDraft, acceptSuspiciousPower, rejectSuspiciousPower } from "./members.js";
import { mapWeek, mapEntry, openWeekModal, closeWeekModal, saveWeek, deleteWeek, openEntryModal, closeEntryModal, renderEntryRows, onEntrySearchInput, saveEntry, handleEntryScreenshot, handleSsAppliedScreenshot, removeUnmatchedItem, openWeekReportModal, closeWeekReportModal, openOverallReportModal, closeOverallReportModal, setOverallReportSort, exportEventTable } from "./events.js";
import { setBoardSort, openParticipationReportModal, closeParticipationReportModal, renderBoard } from "./dashboard.js";
import { mapEngagementPeriod, setEngagementSort, startNewEngagementPeriod, endEngagementPeriod, closeEngagementWinners, confirmEngagementWinners,deleteEngagementPeriod, selectEngagementPeriod, renderEngagement, openEngagementReportModal, openEngagementBoardModal, closeEngagementBoardModal, downloadEngagementBoardImage, openEngagementBoardSettings, closeEngagementBoardSettings, saveEngagementBoardTiers, openEngagementBoardSend, closeEngagementBoardSend, updateEngagementBoardSendCounter, sendEngagementBoardToDiscord } from "./engagement.js";
import {
  mapPeriod, mapProspect, mapLead, renderMigration, setMigrationSort, setMigrationView,
  selectMigrationPeriod, openPeriodModal, closePeriodModal, savePeriod, deletePeriod,
  openProspectModal, closeProspectModal, saveProspect, deleteProspect, approveProspect,
  markProspectFailed, restoreProspect, markProspectConfirmed, unconfirmProspect, markProspectFinalized, unfinalizeProspect,
  setMigrationColorFilter, setMigrationStatusFilter, setProspectTeamElement,
  processLead, dismissLead, exportMigration, copyProspectToNextPeriod,
  setMigrationLeadView, rejectLead, restoreLead
} from "./migration.js";
import { exportBackup, importBackup } from "./backup.js";
import { closeExportModal, toggleExportAll, confirmExport } from "./exportCsv.js";
import { mapSiteLinks, populateSiteLinksForm, saveSiteLinks } from "./siteLinks.js";
import { mapNewsItem, openNewsModal, closeNewsModal, saveNews, deleteNews } from "./news.js";
import { mapVideoItem, openVideoModal, closeVideoModal, saveVideo, deleteVideo, moveVideo } from "./videos.js";
import { mapActivity, restoreDeletedMember, restoreDeletedWeek, restoreDeletedSimple, restoreSelfReportApproval, showActivityDetails, closeActivityDetails } from "./activity.js";
import {
  mapSelfReportSubmission, approveSelfReportSubmission, rejectSelfReportSubmission, sendSelfReportReminder,
  setSelfReportEditType, setSelfReportEditField, openSelfReportReviewModal, closeSelfReportReviewModal,
  setReviewingEventType, setReviewingField, approveReviewingSelfReportSubmission
} from "./selfReports.js";
import {
  openSelfReportUploadModal, closeSelfReportUploadModal, setSelfReportUploadType, setSelfReportUploadMemberQuery,
  selectSelfReportUploadMember, setSelfReportUploadFile, submitSelfReportUpload
} from "./selfReportUpload.js";
import {
  openTeamPowerUploadModal, closeTeamPowerUploadModal, setTeamPowerUploadMemberQuery,
  selectTeamPowerUploadMember, setTeamPowerUploadFile, submitTeamPowerUpload, setTeamPowerUploadClaimedElement
} from "./teamPowerUpload.js";
import {
  mapTeamPowerSuggestion, approveTeamPowerSuggestion, rejectTeamPowerSuggestion,
  openTeamPowerReviewModal, closeTeamPowerReviewModal, setReviewingTeamElement, setReviewingTeamPower,
  approveReviewingTeamPowerSuggestion, setReviewingHawkBoss, setReviewingSnakeBoss
} from "./teamPowerSuggestions.js";
import { doLogin, doLogout, openChangePasswordModal, closeChangePasswordModal, submitChangePassword } from "./auth.js";
import {
  mapAccountVaultEntry, renderAccountVault, openAccountVaultModal, closeAccountVaultModal,
  applyAccountVaultMemberSelection, saveAccountVault, deleteAccountVaultEntry, toggleAccountVaultReveal
} from "./accountVault.js";
import "./gvg.js";
import "./svs.js";
import "./ss.js";
import "./kod.js";
import "./kodgvg.js";

// 400ms'den 2000ms'ye çıkarıldı (2026-11-20, egress düzeltmesiyle birlikte) -
// toplu kayıt girişleri (ör. 50 üyeye SVS puanı girmek) art arda onlarca
// realtime olayı üretir; dar bir pencerede bunların çoğu birbirini
// YAKALAYAMAZ ve her biri ayrı bir yeniden yüklemeyi (bkz. loadAll)
// tetikler. 2sn, bir admin'in diğerini canlı görmesini fark edilir şekilde
// yavaşlatmadan, böyle patlamaları tek bir yeniden yüklemede birleştirir.
const REALTIME_RELOAD_DEBOUNCE_MS = 2000;

/** Promise.allSettled sonucundan, başarısız olursa boş dizi döndüren güvenli bir liste çıkarır. */
function settledList(result) {
  return result.status === "fulfilled" ? (result.value || []) : [];
}

// loadAll'ın en son state'e yazdığı TAM verinin JSON anlık görüntüsü — sadece
// TAM yüklemelerde (scope=null, ör. 5 dakikalık yedek yoklama) kullanılır:
// sunucudan gelen veri öncekiyle birebir aynıysa state'e dokunmadan/tabloları
// yeniden çizmeden çıkılır. Kısmi (realtime kaynaklı) yüklemelerde bu kısayola
// gerek yok — zaten SADECE gerçekten değişen bir tablo olduğunda tetiklenirler.
let lastDataSnapshot = null;

// =====================================================================
// BÖLÜM BAZLI YÜKLEME (2026-11-20, egress mimari düzeltmesi)
// =====================================================================
// Önceden `loadAll` HER ZAMAN ~29 sorgunun tamamını (üyeler + 6 etkinlik
// türünün tüm hafta+kayıtları + göç + aktivite + ... ) birden çekiyordu —
// hem 12sn'lik yoklamada HEM DE 27 tablodan herhangi birinde TEK bir satır
// değiştiğinde (realtime). Supabase'in egress kotasını (5GB/ay) aşmasının
// (8,2GB) ana sebebi buydu (bkz. commit geçmişi). Yoklama aralığı zaten
// 5 dakikaya çekildi; burada da realtime'ın SADECE DEĞİŞEN tabloya karşılık
// gelen "bölüm"ü yeniden çekmesi sağlanıyor — ör. sadece `gvg_records`
// değiştiyse, üyeleri/göçü/haberleri/aktivite logunu yeniden çekmeye hiç
// gerek yok.
//
// Her bölüm, `loadAll`'ın eski tek-blok mantığıyla BİREBİR AYNI veriyi
// üretir (aynı restricted/canAccessVault korumaları, aynı mapper'lar) —
// sadece ayrı ayrı çağrılabilir hâle getirildi. `TABLE_TO_SECTION`,
// gerçek Postgres tablo adını (realtime payload'ının `table` alanı) ilgili
// bölüme eşler.
// =====================================================================
const SECTION_LOADERS = {
  members: async (restricted) => {
    const [membersRes, historyRes, teamHistoryRes, memberDiscordIdsRes] = await Promise.allSettled([
      getMembers(), getAllPowerHistory(), getAllTeamPowerHistory(),
      restricted ? Promise.resolve([]) : getMemberDiscordIds()
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
    const discordIdByMember = {};
    settledList(memberDiscordIdsRes).forEach((entry) => { discordIdByMember[entry.member_id] = entry.discord_id; });
    const nextMembers = settledList(membersRes).map((row) => {
      const member = mapMember(row);
      member.discordId = discordIdByMember[row.id] || null;
      member.powerHistory = (historyByMember[row.id] || []).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      member.teamPowerHistory = (teamHistoryByMember[row.id] || []).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return member;
    });
    return { members: nextMembers };
  },
  engagementPeriods: async () => ({ engagementPeriods: (await getEngagementPeriods()).map(mapEngagementPeriod) }),
  svs: async () => {
    const [weeksRes, recordsRes] = await Promise.allSettled([getWeeks("svs"), getAllRecords("svs")]);
    return { svs: { weeks: settledList(weeksRes).map(mapWeek), entries: settledList(recordsRes).map((r) => mapEntry("svs", r)) } };
  },
  gvg: async () => {
    const [weeksRes, recordsRes] = await Promise.allSettled([getWeeks("gvg"), getAllRecords("gvg")]);
    return { gvg: { weeks: settledList(weeksRes).map(mapWeek), entries: settledList(recordsRes).map((r) => mapEntry("gvg", r)) } };
  },
  ss: async () => {
    const [weeksRes, recordsRes] = await Promise.allSettled([getWeeks("ss"), getAllRecords("ss")]);
    return { ss: { weeks: settledList(weeksRes).map(mapWeek), entries: settledList(recordsRes).map((r) => mapEntry("ss", r)) } };
  },
  kod: async () => {
    const [weeksRes, recordsRes] = await Promise.allSettled([getWeeks("kod"), getAllRecords("kod")]);
    return { kod: { weeks: settledList(weeksRes).map(mapWeek), entries: settledList(recordsRes).map((r) => mapEntry("kod", r)) } };
  },
  kodgvg: async () => {
    const [weeksRes, recordsRes] = await Promise.allSettled([getWeeks("kodgvg"), getAllRecords("kodgvg")]);
    return { kodgvg: { weeks: settledList(weeksRes).map(mapWeek), entries: settledList(recordsRes).map((r) => mapEntry("kodgvg", r)) } };
  },
  other: async () => {
    const [weeksRes, recordsRes] = await Promise.allSettled([getWeeks("other"), getAllRecords("other")]);
    return { other: { weeks: settledList(weeksRes).map(mapWeek), entries: settledList(recordsRes).map((r) => mapEntry("other", r)) } };
  },
  migrationPeriods: async (restricted) => (restricted ? { migrationPeriods: [] } : { migrationPeriods: (await getMigrationPeriods()).map(mapPeriod) }),
  migration: async (restricted) => (restricted ? { migration: [] } : { migration: (await getMigrationProspects()).map(mapProspect) }),
  migrationLeads: async (restricted) => (restricted ? { migrationLeads: [] } : { migrationLeads: (await getMigrationLeads()).map(mapLead) }),
  nameSuggestions: async (restricted) => (restricted ? { nameSuggestions: [] } : { nameSuggestions: (await getNameSuggestions()).map(mapNameSuggestion) }),
  selfReportSubmissions: async (restricted) => (restricted ? { selfReportSubmissions: [] } : { selfReportSubmissions: (await getSelfReportSubmissions()).map(mapSelfReportSubmission) }),
  teamPowerSuggestions: async (restricted) => (restricted ? { teamPowerSuggestions: [] } : { teamPowerSuggestions: (await getTeamPowerSuggestions()).map(mapTeamPowerSuggestion) }),
  siteLinks: async () => ({ siteLinks: mapSiteLinks(await getSiteLinks().catch(() => null)) }),
  news: async () => ({ news: (await getNews()).map(mapNewsItem) }),
  featuredVideos: async () => ({ featuredVideos: (await getFeaturedVideos()).map(mapVideoItem) }),
  activityLog: async (restricted) => (restricted ? { activityLog: [] } : { activityLog: (await getRecentActivity(200)).map(mapActivity) }),
  accountVault: async (restricted) => ((restricted || !state.canAccessVault) ? { accountVault: [] } : { accountVault: (await getAccountVault()).map(mapAccountVaultEntry) }),
  // Realtime'a hiç abone değil (settings tablosu TABLE_TO_SECTION'da yok) - sadece TAM yüklemelerde tazelenir.
  engagementBoardTiers: async () => {
    const value = await getSetting("engagementBoardTiers", null).catch(() => null);
    return { engagementBoardTiers: (Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(n))) ? value : state.engagementBoardTiers };
  }
};
const ALL_SECTIONS = Object.keys(SECTION_LOADERS);

// Gerçek Postgres tablo adını (realtime payload.table) ilgili bölüme eşler -
// subscribeToTables'a verilen liste de buradan türetilir, elle senkron
// tutulan ayrı bir dizi YOKTUR (bkz. aşağıdaki subscribeToTables çağrısı).
const TABLE_TO_SECTION = {
  members: "members", power_history: "members", team_power_history: "members", member_discord_ids: "members",
  engagement_periods: "engagementPeriods",
  svs_weeks: "svs", svs_records: "svs",
  gvg_weeks: "gvg", gvg_records: "gvg",
  ss_weeks: "ss", ss_records: "ss",
  kod_weeks: "kod", kod_records: "kod",
  kodgvg_weeks: "kodgvg", kodgvg_records: "kodgvg",
  other_weeks: "other", other_records: "other",
  migration_periods: "migrationPeriods",
  migration_prospects: "migration",
  migration_leads: "migrationLeads",
  name_suggestions: "nameSuggestions",
  self_report_submissions: "selfReportSubmissions",
  team_power_suggestions: "teamPowerSuggestions",
  site_links: "siteLinks",
  news: "news",
  featured_videos: "featuredVideos",
  activity_logs: "activityLog",
  account_vault: "accountVault"
};

/**
 * Supabase'ten veriyi çeker ve state'i günceller. `scope` verilmezse (null/undefined)
 * TÜM bölümler çekilir (ilk giriş, elle "Yenile", 5dk'lık yedek yoklama, yedek
 * geri yükleme). `scope` bir bölüm adı dizisi/Set'iyse SADECE o bölümler çekilir
 * (bkz. aşağıdaki realtime aboneliği) — diğer bölümlerin state'teki mevcut
 * değerlerine HİÇ dokunulmaz.
 *
 * Ne admin ne üye girişi doğrulanmadan (bkz. auth.js -> updateGateVisibility)
 * hiçbir şey çekmez — panel giriş kapısının arkasındayken gereksiz istek
 * atılmasın diye. Üye (viewer) rolü için Göç/Aktivite çağrıları hiç
 * yapılmaz — zaten RLS bunları engeller, boşuna "izin reddedildi" hatası
 * üretmemek için baştan atlanır (bkz. sql/add_member_role.sql).
 */
async function loadAll(silent, scope) {
  if (!state.isAdmin && !state.isMember) return;
  try {
    // "Bağlanıyor…" metni sadece sessiz OLMAYAN (ilk giriş / elle "Yenile") yüklemelerde
    // gösterilir. Arka plan yüklemelerinde (silent=true) bunu her seferinde yazıp hemen
    // "Canlı"ya geri döndürmek, iki metnin uzunluğu farklı olduğu için üst barın o
    // bölümünün genişliğini periyodik olarak değiştirip görünür bir "titreme" yaratıyordu
    // — bağlantı hiç kopmadığı hâlde.
    if (!silent) document.getElementById("syncText").textContent = t("syncConnecting");
    const restricted = state.isMember;
    const sectionsToLoad = scope ? Array.from(scope).filter((name) => SECTION_LOADERS[name]) : ALL_SECTIONS;
    if (!sectionsToLoad.length) { document.getElementById("syncText").textContent = t("syncLive"); return; }

    const results = await Promise.allSettled(sectionsToLoad.map((name) => SECTION_LOADERS[name](restricted)));
    const nextDataPartial = {};
    results.forEach((result, index) => {
      if (result.status === "fulfilled") Object.assign(nextDataPartial, result.value);
      else console.error(`[loadAll] "${sectionsToLoad[index]}" bölümü çekilemedi:`, result.reason); // bu bölüm bu turda GÜNCELLENMEZ, state'teki eski değeri korunur
    });

    document.getElementById("syncText").textContent = t("syncLive");

    if (!scope) {
      // Sadece TAM yüklemede: sunucudan gelen veri öncekiyle birebir aynıysa
      // state'e dokunmadan/tabloları yeniden çizmeden çık (kaydırma konumu/fare
      // vurgusu korunsun diye — bkz. lastDataSnapshot yorumu).
      const snapshot = JSON.stringify(nextDataPartial);
      if (snapshot === lastDataSnapshot) return;
      lastDataSnapshot = snapshot;
    } else {
      lastDataSnapshot = null; // kısmi güncellemeden sonra tam-karşılaştırma anlık görüntüsü geçersiz - bir sonraki TAM yüklemede yeniden hesaplanır
    }

    Object.assign(state, nextDataPartial);
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
let pendingChangedTables = new Set();
subscribeToTables(
  Object.keys(TABLE_TO_SECTION),
  (payload) => {
    if (payload && payload.table) pendingChangedTables.add(payload.table);
    clearTimeout(realtimeReloadTimer);
    realtimeReloadTimer = setTimeout(() => {
      const changedTables = pendingChangedTables;
      pendingChangedTables = new Set();
      const sections = new Set();
      changedTables.forEach((table) => { const section = TABLE_TO_SECTION[table]; if (section) sections.add(section); });
      loadAll(true, sections);
    }, REALTIME_RELOAD_DEBOUNCE_MS);
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
  const accountVaultTab = document.querySelector('#dataTabs .tab[data-tab="accountvault"]');
  if (migrationTab) migrationTab.style.display = restricted ? "none" : "";
  if (activityTab) activityTab.style.display = restricted ? "none" : "";
  if (accountVaultTab) accountVaultTab.style.display = (restricted || !state.canAccessVault) ? "none" : "";
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
  exportBackup, importBackup, manualRefresh, liveFormatNumberInput, expandPowerShorthandInput, initPowerShorthandMode, setEventWeekSort,
  switchTab, switchSub, setMemberView, setRankFilter, setElementFilter, setSort, renderMembers,
  openMemberModal, closeMemberModal, toggleOld, toggleMigrated, markUserChanged, setTeamElement, saveMember, deleteMember, restoreMember, exportMembers,
  handlePowerScreenshot, removePowerUnmatchedItem, discardPowerDraft, applyPowerDraft, acceptSuspiciousPower, rejectSuspiciousPower,
  openNameSuggestModal, closeNameSuggestModal, submitNameSuggestion, approveNameSuggestion, dismissNameSuggestion,
  approveSelfReportSubmission, rejectSelfReportSubmission, sendSelfReportReminder, setSelfReportEditType, setSelfReportEditField,
  openSelfReportReviewModal, closeSelfReportReviewModal, setReviewingEventType, setReviewingField, approveReviewingSelfReportSubmission,
  openSelfReportUploadModal, closeSelfReportUploadModal, setSelfReportUploadType, setSelfReportUploadMemberQuery,
  selectSelfReportUploadMember, setSelfReportUploadFile, submitSelfReportUpload,
  openTeamPowerUploadModal, closeTeamPowerUploadModal, setTeamPowerUploadMemberQuery,
  selectTeamPowerUploadMember, setTeamPowerUploadFile, submitTeamPowerUpload, setTeamPowerUploadClaimedElement,
  approveTeamPowerSuggestion, rejectTeamPowerSuggestion,
  openTeamPowerReviewModal, closeTeamPowerReviewModal, setReviewingTeamElement, setReviewingTeamPower, approveReviewingTeamPowerSuggestion,
  setReviewingHawkBoss, setReviewingSnakeBoss,
  openWeekModal, closeWeekModal, saveWeek, deleteWeek,
  openEntryModal, closeEntryModal, saveEntry, renderEntryRows, onEntrySearchInput, handleEntryScreenshot, handleSsAppliedScreenshot, removeUnmatchedItem,
  openWeekReportModal, closeWeekReportModal,
  openOverallReportModal, closeOverallReportModal, setOverallReportSort, exportEventTable,
  openHistoryModal, closeHistoryModal, copyDiscordId,
  setBoardSort, openParticipationReportModal, closeParticipationReportModal, renderBoard, setLang,
  setEngagementSort, startNewEngagementPeriod, endEngagementPeriod, closeEngagementWinners, confirmEngagementWinners, deleteEngagementPeriod, selectEngagementPeriod, renderEngagement, openEngagementReportModal, openEngagementBoardModal, closeEngagementBoardModal, downloadEngagementBoardImage, openEngagementBoardSettings, closeEngagementBoardSettings, saveEngagementBoardTiers, openEngagementBoardSend, closeEngagementBoardSend, updateEngagementBoardSendCounter, sendEngagementBoardToDiscord,
  renderMigration, setMigrationSort, setMigrationView, openProspectModal, closeProspectModal, saveProspect, deleteProspect, approveProspect,
  markProspectFailed, restoreProspect, markProspectConfirmed, unconfirmProspect, markProspectFinalized, unfinalizeProspect,
  setMigrationColorFilter, setMigrationStatusFilter, setProspectTeamElement,
  selectMigrationPeriod, openPeriodModal, closePeriodModal, savePeriod, deletePeriod,
  processLead, dismissLead, exportMigration, copyProspectToNextPeriod,
  setMigrationLeadView, rejectLead, restoreLead,
  closeExportModal, toggleExportAll, confirmExport,
  saveSiteLinks,
  openNewsModal, closeNewsModal, saveNews, deleteNews,
  openVideoModal, closeVideoModal, saveVideo, deleteVideo, moveVideo,
  selectPanelMode, backToChooser,
  doLogin, doLogout, toggleTheme, openChangePasswordModal, closeChangePasswordModal, submitChangePassword,
  restoreDeletedMember, restoreDeletedWeek, restoreDeletedSimple, restoreSelfReportApproval, showActivityDetails, closeActivityDetails,
  renderAccountVault, openAccountVaultModal, closeAccountVaultModal, applyAccountVaultMemberSelection,
  saveAccountVault, deleteAccountVaultEntry, toggleAccountVaultReveal
});

// =====================================================================
// BAŞLANGIÇ
// =====================================================================
initLangFromStorage();
initThemeFromStorage();
buildLangSwitch();
applyStaticText();
