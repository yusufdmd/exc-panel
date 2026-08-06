// =====================================================================
// EXC PANELİ — ui.js
// =====================================================================
// Bu dosya, uygulamanın tüm modüllerinin ortak temelidir:
//   - Paylaşılan uygulama durumu (state)
//   - Çok dilli metin sözlüğü (i18n) ve çeviri fonksiyonu
//   - Genel biçimlendirme / DOM yardımcıları (toast, rütbe rengi, sayı
//     biçimlendirme, muafiyet hesaplama, hücre boyama kuralları)
//
// Bu dosya BAŞKA HİÇBİR uygulama modülüne (members.js, gvg.js, auth.js,
// app.js, vb.) bağımlı değildir — bağımlılık zinciri tek yönlüdür:
//   config.js/supabase.js -> database.js -> ui.js -> diğer tüm modüller -> app.js
// Bu sayede döngüsel import oluşmaz ve her modül tek bir ortak temelden
// (state + çeviri + biçimlendirme) beslenir.
// =====================================================================

import {
  RANK_ORDER,
  GVG_THRESHOLDS,
  CAMP_LEVELS,
  campLevelSortValue,
  LANGUAGES,
  DEFAULT_LANGUAGE,
  MIGRATION_COLORS,
  MIGRATION_COLOR_ORDER
} from "./config.js";

// ---------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------
const LANGUAGE_STORAGE_KEY = "exc-lang";
const TOAST_DISPLAY_DURATION_MS = 2200;
const LANG_FLAG_LABELS = { tr: "TR", en: "EN", de: "DE", es: "ES", fr: "FR" };

// ---------------------------------------------------------------------
// Paylaşılan uygulama durumu.
// Tüm modüller bu NESNEYİ import eder ve alanlarını değiştirir; nesnenin
// kendisi asla yeniden atanmaz (böylece her modülde aynı referans geçerli
// kalır). Örnek: `state.members = yeniListe;` doğru, ama
// `import { state } ...; state = { ... };` YANLIŞ ve zaten JS bunu
// import edilen `const` bağlamalar için engeller.
// ---------------------------------------------------------------------
export const state = {
  members: [],
  svs: { weeks: [], entries: [] },
  gvg: { weeks: [], entries: [] },
  ss: { weeks: [], entries: [] },
  kod: { weeks: [], entries: [] },
  other: { weeks: [], entries: [] },
  migration: [],
  migrationPeriods: [],
  migrationActivePeriodId: null,
  pendingProspectApprovalId: null, // "Onayla" ile üye ekleme ekranına gidilirken hangi göç adayının dönüştürüldüğünü hatırlar (bkz. members.js -> saveMember)
  migrationLeads: [], // genel tanıtım sitesindeki formdan gelen, henüz işlenmemiş ham başvurular
  pendingLeadProcessingId: null, // "İşle" ile aday ekleme formuna gidilirken hangi başvurunun dönüştürüldüğünü hatırlar (bkz. migration.js -> saveProspect)
  migrationSortKey: "color",
  migrationSortDir: -1, // -1: varsayılan görünümde Altın üstte, Griye doğru azalan sıra
  currentTab: "members",
  currentSub: "svs",
  currentLang: DEFAULT_LANGUAGE,
  memberView: "active",
  rankFilter: "ALL",
  sortKey: "rank",
  sortDir: -1, // -1: varsayılan görünümde R5 üstte, R1'e doğru azalan sıra
  oldFlag: false,
  migratedFlag: false,
  entryContext: null, // { type: 'svs'|'gvg'|'ss'|'other', weekId }
  boardSortKey: "gvgPts",
  boardSortDir: -1,
  overallReportType: null,
  overallReportSortKey: "rank",
  overallReportSortDir: -1,
  historyMemberId: null,
  isAdmin: false,
  currentAdminUsername: "" // auth.js buraya Supabase oturumundaki sahte email'i (bkz. ADMIN_LOGIN_DOMAIN) DEĞİL, kullanıcıya gösterilecek çıplak kullanıcı adını yazar
};

export { RANK_ORDER, MIGRATION_COLORS, MIGRATION_COLOR_ORDER };

// =====================================================================
// RENDER KAYIT MEKANİZMASI
// =====================================================================
// Bir üye silindiğinde/eklendiğinde sadece üye tablosu değil, etkinlik
// tabloları ve puan sıralaması da güncellenmelidir. Ama members.js,
// gvg.js gibi dosyaların render fonksiyonlarını DOĞRUDAN import etmesi
// (ya da tam tersi) döngüsel bağımlılık yaratır. Çözüm: her domain
// modülü kendi render fonksiyonunu buraya KAYDEDER (module yüklenirken,
// bir kere); `renderAll()` çağrıldığında kayıtlı tüm fonksiyonlar sırayla
// çalışır. Böylece hiçbir domain dosyası bir diğerinin render
// fonksiyonunu bilmek zorunda kalmaz.
const registeredRenderers = [];

/** Bir domain modülünün render fonksiyonunu `renderAll()` kapsamına ekler. */
export function registerRenderer(renderFn) {
  registeredRenderers.push(renderFn);
}

/** Kayıtlı tüm render fonksiyonlarını (üyeler, etkinlik tabloları, puan sıralaması, vb.) sırayla çalıştırır. */
export function renderAll() {
  registeredRenderers.forEach((renderFn) => renderFn());
}

// ---------------------------------------------------------------------
// Aynı sebeple: yedek içe aktarma (backup.js), tüm veriyi Supabase'de
// yeniden oluşturduktan sonra state'i taze ID'lerle senkronize etmek için
// tam bir veritabanı yeniden yüklemesi (app.js'teki loadAll) yapmalıdır.
// loadAll, members.js'deki mapMember'a ve events.js'deki mapWeek/mapEntry'e
// bağımlı olduğu için ui.js'te DEĞİL, app.js'te tanımlanır — o yüzden
// backup.js'in çağırabilmesi için aynı kayıt deseni kullanılır.
// ---------------------------------------------------------------------
let registeredDataLoader = null;

/** app.js kendi `loadAll` fonksiyonunu burada kaydeder (bootstrap sırasında, bir kere). */
export function registerDataLoader(loaderFn) {
  registeredDataLoader = loaderFn;
}

/** Kayıtlı veri yükleyiciyi (app.js'teki loadAll) çalıştırır. */
export async function reloadAllData(silent) {
  if (registeredDataLoader) await registeredDataLoader(silent);
}

// =====================================================================
// I18N — Çok dilli metin sözlüğü
// =====================================================================
export const LANGS = LANGUAGES;
export const LANG_FLAG = LANG_FLAG_LABELS;

const DICT = {
  tr: { appName:'EXC Paneli', tagline:'Üye · Rütbe · Güç & Kamp Seviyesi · Etkinlik Takibi', refresh:'Yenile', backToSite:'← Ana Siteye Dön',
    syncConnecting:'Bağlanıyor…', syncLive:'Canlı — herkes görüyor', syncError:'Bağlantı hatası',
    tabMembers:'Üyeler', tabEvents:'Etkinlikler', tabBoard:'Puan Sıralaması', tabMigration:'Göç',
    addProspect:'+ Aday Ekle', prospectAddTitle:'Aday Ekle', prospectEditTitle:'Adayı Düzenle',
    lblColor:'Unvan', thColor:'Unvan', thServer:'Sunucu', lblServer:'Mevcut Sunucu',
    colorGold:'İmparatorluk Rakibi', colorPurple:'Hudut Kaptanı', colorBlue:'Keşif Peşinde', colorGray:'Gezgin', colorUnknown:'Bilinmiyor',
    emptyMigrationTitle:'Henüz aday yok', emptyMigrationDesc:'"+ Aday Ekle" ile ilk göç adayını ekle.',
    toastProspectSaved:'Aday kaydedildi.', toastProspectDeleted:'Aday silindi.', confirmDeleteProspect:'Bu adayı silmek istediğinize emin misiniz?',
    approveProspectTitle:'Üye Olarak Onayla', confirmApproveProspect:'Bu adayı üye olarak onaylamak istediğinize emin misiniz? Eksik bilgileri dolduracağınız üye ekleme ekranına yönlendirileceksiniz.',
    leadsHeading:'📥 Göç Başvuruları', thLeadContact:'İletişim', thLeadMessage:'Mesaj', thLeadDate:'Tarih',
    emptyLeadsDesc:'Genel siteden gelen yeni başvurular burada görünecek.',
    processLeadTitle:'Aday Olarak İşle', confirmDismissLead:'Bu başvuruyu reddetmek/silmek istediğinize emin misiniz?',
    toastLeadDismissed:'Başvuru silindi.',
    statMigrationTotal:'Toplam Aday', migrationStatusCertain:'Kesin', migrationStatusUncertain:'Belirsiz',
    addPeriod:'+ Dönem Ekle', periodAddTitle:'Dönem Ekle', periodEditTitle:'Dönemi Düzenle', lblPeriodLabel:'Dönem Etiketi',
    periodNameRequired:'Dönem etiketi gerekli.', confirmDeletePeriod:'Bu dönemi silmek istediğinize emin misiniz? İçindeki tüm adaylar da silinecek.',
    toastPeriodSaved:'Dönem kaydedildi.', toastPeriodDeleted:'Dönem silindi.',
    emptyPeriodsTitle:'Henüz dönem yok', emptyPeriodsDesc:'"+ Dönem Ekle" ile ilk göç dönemini oluştur.',
    needPeriodFirst:'Önce bir göç dönemi oluşturun.',
    statTotal:'Toplam Üye', filterAll:'Tümü', addMember:'+ Üye Ekle', searchPh:'İsim veya ID ile ara…',
    thRank:'Rütbe', thUsername:'Kullanıcı Adı', thId:'ID', thPower:'Güç Seviyesi', thCamp:'Kamp Seviyesi', thTotalPoints:'Toplam Puan',
    emptyMembersTitle:'Henüz üye yok', emptyMembersDesc:'"+ Üye Ekle" ile ilk üyeyi kaydet.',
    memberAddTitle:'Üye Ekle', memberEditTitle:'Üyeyi Düzenle',
    lblUsername:'Kullanıcı Adı', lblGameId:'ID Numarası', lblRank:'Rütbe', lblPower:'Güç Seviyesi', lblCamp:'Kamp Seviyesi', lblJoinedAt:'Katılma Tarihi', lblOld:'Eski üye (OLD)',
    cancel:'Vazgeç', save:'Kaydet', close:'Kapat',
    toastMemberSaved:'Üye kaydedildi.', toastMemberDeleted:'Üye silindi.', confirmDeleteMember:'Bu üyeyi silmek istediğinize emin misiniz?',
    nameIdRequired:'Kullanıcı adı ve ID zorunludur.',
    addWeek:'+ Hafta Ekle', weekAddTitle:'Hafta Ekle', lblWeekLabel:'Hafta Etiketi', lblWeekDate:'Tarih', weekNameRequired:'Hafta etiketi gerekli.',
    toastWeekSaved:'Hafta eklendi.', toastWeekDeleted:'Hafta silindi.', confirmDeleteWeek:'Bu haftayı ve tüm verilerini silmek istiyor musunuz?',
    emptyWeeksTitle:'Henüz hafta yok', emptyWeeksDesc:'"+ Hafta Ekle" ile ilk haftayı oluştur.',
    legendJoined:'Katıldı', legendNotJoined:'Katılmadı', legendAttended:'Kayıtlı ve Katıldı', legendRegNotAttend:'Kayıtlı, Katılmadı', legendNoReg:'Kayıt Yok',
    thJoined:'Katıldı', thPointsCol:'Puan', thGroup:'Grup', thAttended:'Katıldı mı', groupNone:'Kayıt Yok', groupA:'A Grubu', groupB:'B Grubu',
    entryTitleSVS:'SVS Girişi', entryTitleGVG:'GVG Girişi', entryTitleSS:'SS Girişi', entryTitleKoD:'King of Desert Girişi',
    toastEntrySaved:'Kayıt tamamlandı.', notRegistered:'—',
    boardEmptyTitle:'Henüz veri yok', boardEmptyDesc:'Üye ve etkinlik ekledikçe sıralama burada oluşur.',
    searchMember:'Üye ara…',
    statusYes:'Katıldı', statusNo:'Katılmadı', statusUnknown:'Bilgi Yok', legendUnknown:'Bilgi Yok',
    subOther:'Diğer', addEvent:'+ Etkinlik Ekle', eventAddTitle:'Etkinlik Ekle', lblEventLabel:'Etkinlik Adı', eventNameRequired:'Etkinlik adı gerekli.',
    toastEventSaved:'Etkinlik eklendi.', toastEventDeleted:'Etkinlik silindi.', confirmDeleteEvent:'Bu etkinliği ve tüm verilerini silmek istiyor musunuz?',
    emptyEventsTitle:'Henüz etkinlik yok', emptyEventsDesc:'"+ Etkinlik Ekle" ile ilk etkinliği oluştur.',
    entryTitleOther:'Diğer Etkinlik Girişi', thStatus:'Durum',
    lbRankCol:'Sıra', lbMember:'Üye', lbGvgTotal:'GVG Toplam', lbSvsTotal:'SVS Toplam', lbSvsRatio:'SVS Katılım', lbSsRatio:'SS Katılım', lbKodRatio:'KoD Katılım', lbOtherTotal:'Diğer Toplam', lbOtherRatio:'Diğer Katılım',
    exemptLabel:'Muaf', powerHistory:'Güç Geçmişi', restoreMember:'Aktif Üyeye Al',
    exportBackupLabel:'Yedekle', importBackupLabel:'İçe Aktar', backupSuccess:'Yedek indirildi.',
    importConfirm:'Bu dosyadaki veriler herkesin gördüğü ortak veriyle değiştirilecek. Devam edilsin mi?',
    importSuccess:'Veriler içe aktarıldı.', importFail:'Dosya okunamadı veya bozuk.',
    subActiveMembers:'Aktif Üyeler', subOldMembers:'Eski Üyeler (OLD)',
    thDate:'Tarih', thPowerVal:'Güç', thDelta:'Fark', thExcused:'Mazeretli',
    loginTitle:'Yönetici Girişi', lblEmail:'E-posta', lblPassword:'Şifre', loginBtn:'Giriş Yap', logoutBtn:'Çıkış Yap',
    gateDesc:'Bu panele sadece yönetici hesapları erişebilir.',
    loginFailed:'Giriş başarısız.', loginSuccess:'Giriş yapıldı.', logoutSuccess:'Çıkış yapıldı.',
    emailPasswordRequired:'Kullanıcı adı ve şifre gerekli.', viewOnlyLabel:'Salt okunur',
    previousNames:'Önceki Kullanıcı Adları',
    lblUserChanged:'Kullanıcı Değişikliği', userChangedBtn:'🔄 Kullanıcı Değişti',
    confirmUserChanged:'Bu hesabı bugün itibariyle yeni bir kullanıcının devraldığını işaretlemek istiyor musunuz? Bu tarihten önceki etkinlik haftaları bu üye için otomatik olarak muaf sayılacak.',
    userChangedStagedLabel:'Kullanıcı değişikliği',
    subMigratedMembers:'Göç Edenler', lblMigratedTo:'Göç Ettiği Sunucu',
    lblMigrated:'Başka sunucuya göç etti', migratedTag:'Göç Etti',
    weekReport:'Hafta Raporu', zoneGreen:'Yeşil Bölge', zoneYellow:'Sarı Bölge', zoneRed:'Kırmızı Bölge',
    weekEditTitle:'Haftayı Düzenle', eventEditTitle:'Etkinliği Düzenle',
    overallReportBtn:'📊 Genel Rapor', overallReport:'Genel Rapor', thWeeks:'Haftalar' },
  en: { appName:'EXC Panel', tagline:'Members · Rank · Power & Camp Level · Event Tracking', refresh:'Refresh', backToSite:'← Back to Site',
    syncConnecting:'Connecting…', syncLive:'Live — everyone sees this', syncError:'Connection error',
    tabMembers:'Members', tabEvents:'Events', tabBoard:'Leaderboard', tabMigration:'Migration',
    addProspect:'+ Add Candidate', prospectAddTitle:'Add Candidate', prospectEditTitle:'Edit Candidate',
    lblColor:'Title', thColor:'Title', thServer:'Server', lblServer:'Current Server',
    colorGold:'Empire Challenger', colorPurple:'Frontier Captain', colorBlue:'Discovery Seeker', colorGray:'Voyager', colorUnknown:'Unknown',
    emptyMigrationTitle:'No candidates yet', emptyMigrationDesc:'Use "+ Add Candidate" to add the first migration candidate.',
    toastProspectSaved:'Candidate saved.', toastProspectDeleted:'Candidate deleted.', confirmDeleteProspect:'Are you sure you want to delete this candidate?',
    approveProspectTitle:'Approve as Member', confirmApproveProspect:'Are you sure you want to approve this candidate as a member? You will be taken to the add-member screen to fill in the missing details.',
    leadsHeading:'📥 Migration Applications', thLeadContact:'Contact', thLeadMessage:'Message', thLeadDate:'Date',
    emptyLeadsDesc:'New applications from the main site will appear here.',
    processLeadTitle:'Process as Candidate', confirmDismissLead:'Are you sure you want to dismiss/delete this request?',
    toastLeadDismissed:'Request deleted.',
    statMigrationTotal:'Total Candidates', migrationStatusCertain:'Certain', migrationStatusUncertain:'Uncertain',
    addPeriod:'+ Add Period', periodAddTitle:'Add Period', periodEditTitle:'Edit Period', lblPeriodLabel:'Period Label',
    periodNameRequired:'Period label is required.', confirmDeletePeriod:'Are you sure you want to delete this period? All candidates in it will also be deleted.',
    toastPeriodSaved:'Period saved.', toastPeriodDeleted:'Period deleted.',
    emptyPeriodsTitle:'No periods yet', emptyPeriodsDesc:'Use "+ Add Period" to create the first migration period.',
    needPeriodFirst:'Create a migration period first.',
    statTotal:'Total Members', filterAll:'All', addMember:'+ Add Member', searchPh:'Search by name or ID…',
    thRank:'Rank', thUsername:'Username', thId:'ID', thPower:'Power Level', thCamp:'Camp Level', thTotalPoints:'Total Points',
    emptyMembersTitle:'No members yet', emptyMembersDesc:'Use "+ Add Member" to add the first one.',
    memberAddTitle:'Add Member', memberEditTitle:'Edit Member',
    lblUsername:'Username', lblGameId:'ID Number', lblRank:'Rank', lblPower:'Power Level', lblCamp:'Camp Level', lblJoinedAt:'Join Date', lblOld:'Old member (OLD)',
    cancel:'Cancel', save:'Save', close:'Close',
    toastMemberSaved:'Member saved.', toastMemberDeleted:'Member deleted.', confirmDeleteMember:'Are you sure you want to delete this member?',
    nameIdRequired:'Username and ID are required.',
    addWeek:'+ Add Week', weekAddTitle:'Add Week', lblWeekLabel:'Week Label', lblWeekDate:'Date', weekNameRequired:'Week label is required.',
    toastWeekSaved:'Week added.', toastWeekDeleted:'Week deleted.', confirmDeleteWeek:'Delete this week and all its data?',
    emptyWeeksTitle:'No weeks yet', emptyWeeksDesc:'Use "+ Add Week" to create the first one.',
    legendJoined:'Joined', legendNotJoined:'Not joined', legendAttended:'Registered & Attended', legendRegNotAttend:'Registered, Absent', legendNoReg:'Not Registered',
    thJoined:'Joined', thPointsCol:'Points', thGroup:'Group', thAttended:'Attended', groupNone:'Not registered', groupA:'Group A', groupB:'Group B',
    entryTitleSVS:'SVS Entry', entryTitleGVG:'GVG Entry', entryTitleSS:'SS Entry', entryTitleKoD:'King of Desert Entry',
    toastEntrySaved:'Saved.', notRegistered:'—',
    boardEmptyTitle:'No data yet', boardEmptyDesc:'The leaderboard fills in as you add members and events.',
    searchMember:'Search member…',
    statusYes:'Joined', statusNo:'Not joined', statusUnknown:'No info', legendUnknown:'No info',
    subOther:'Other', addEvent:'+ Add Event', eventAddTitle:'Add Event', lblEventLabel:'Event Name', eventNameRequired:'Event name is required.',
    toastEventSaved:'Event added.', toastEventDeleted:'Event deleted.', confirmDeleteEvent:'Delete this event and all its data?',
    emptyEventsTitle:'No events yet', emptyEventsDesc:'Use "+ Add Event" to create the first one.',
    entryTitleOther:'Other Event Entry', thStatus:'Status',
    lbRankCol:'Rank', lbMember:'Member', lbGvgTotal:'GVG Total', lbSvsTotal:'SVS Total', lbSvsRatio:'SVS Attendance', lbSsRatio:'SS Attendance', lbKodRatio:'KoD Attendance', lbOtherTotal:'Other Total', lbOtherRatio:'Other Attendance',
    exemptLabel:'Exempt', powerHistory:'Power History', restoreMember:'Restore to Active',
    exportBackupLabel:'Backup', importBackupLabel:'Import', backupSuccess:'Backup downloaded.',
    importConfirm:'This file will replace the shared data everyone sees. Continue?',
    importSuccess:'Data imported.', importFail:'Could not read the file, it may be corrupted.',
    subActiveMembers:'Active Members', subOldMembers:'Old Members (OLD)',
    thDate:'Date', thPowerVal:'Power', thDelta:'Change', thExcused:'Excused',
    loginTitle:'Admin Login', lblEmail:'Email', lblPassword:'Password', loginBtn:'Sign In', logoutBtn:'Sign Out',
    gateDesc:'Only admin accounts can access this panel.',
    loginFailed:'Sign-in failed.', loginSuccess:'Signed in.', logoutSuccess:'Signed out.',
    emailPasswordRequired:'Username and password are required.', viewOnlyLabel:'View only',
    previousNames:'Previous Usernames',
    lblUserChanged:'User Change', userChangedBtn:'🔄 User Changed',
    confirmUserChanged:'Mark this account as taken over by a new user as of today? Event weeks before this date will automatically be treated as exempt for this member.',
    userChangedStagedLabel:'User changed',
    subMigratedMembers:'Migrated Members', lblMigratedTo:'Migrated To Server',
    lblMigrated:'Migrated to another server', migratedTag:'Migrated',
    weekReport:'Week Report', zoneGreen:'Green Zone', zoneYellow:'Yellow Zone', zoneRed:'Red Zone',
    weekEditTitle:'Edit Week', eventEditTitle:'Edit Event',
    overallReportBtn:'📊 Overall Report', overallReport:'Overall Report', thWeeks:'Weeks' },
  de: { appName:'EXC Panel', tagline:'Mitglieder · Rang · Machtstufe & Basisstufe · Event-Tracking', refresh:'Aktualisieren', backToSite:'← Zur Website',
    syncConnecting:'Verbinde…', syncLive:'Live — alle sehen dies', syncError:'Verbindungsfehler',
    tabMembers:'Mitglieder', tabEvents:'Events', tabBoard:'Bestenliste', tabMigration:'Migration',
    addProspect:'+ Kandidat hinzufügen', prospectAddTitle:'Kandidat hinzufügen', prospectEditTitle:'Kandidat bearbeiten',
    lblColor:'Titel', thColor:'Titel', thServer:'Server', lblServer:'Aktueller Server',
    colorGold:'Reichsherausforderer', colorPurple:'Grenzkapitän', colorBlue:'Entdeckungssuchender', colorGray:'Reisender', colorUnknown:'Unbekannt',
    emptyMigrationTitle:'Noch keine Kandidaten', emptyMigrationDesc:'Mit "+ Kandidat hinzufügen" den ersten Migrationskandidaten hinzufügen.',
    toastProspectSaved:'Kandidat gespeichert.', toastProspectDeleted:'Kandidat gelöscht.', confirmDeleteProspect:'Diesen Kandidaten wirklich löschen?',
    approveProspectTitle:'Als Mitglied bestätigen', confirmApproveProspect:'Diesen Kandidaten wirklich als Mitglied bestätigen? Sie werden zum Formular für neue Mitglieder weitergeleitet, um die fehlenden Angaben zu ergänzen.',
    leadsHeading:'📥 Migrationsbewerbungen', thLeadContact:'Kontakt', thLeadMessage:'Nachricht', thLeadDate:'Datum',
    emptyLeadsDesc:'Neue Bewerbungen von der Hauptseite erscheinen hier.',
    processLeadTitle:'Als Kandidat bearbeiten', confirmDismissLead:'Diese Anfrage wirklich ablehnen/löschen?',
    toastLeadDismissed:'Anfrage gelöscht.',
    statMigrationTotal:'Kandidaten gesamt', migrationStatusCertain:'Sicher', migrationStatusUncertain:'Unsicher',
    addPeriod:'+ Zeitraum hinzufügen', periodAddTitle:'Zeitraum hinzufügen', periodEditTitle:'Zeitraum bearbeiten', lblPeriodLabel:'Zeitraumbezeichnung',
    periodNameRequired:'Zeitraumbezeichnung erforderlich.', confirmDeletePeriod:'Diesen Zeitraum wirklich löschen? Alle Kandidaten darin werden ebenfalls gelöscht.',
    toastPeriodSaved:'Zeitraum gespeichert.', toastPeriodDeleted:'Zeitraum gelöscht.',
    emptyPeriodsTitle:'Noch kein Zeitraum', emptyPeriodsDesc:'Mit "+ Zeitraum hinzufügen" den ersten Migrationszeitraum anlegen.',
    needPeriodFirst:'Zuerst einen Migrationszeitraum anlegen.',
    statTotal:'Mitglieder gesamt', filterAll:'Alle', addMember:'+ Mitglied hinzufügen', searchPh:'Nach Name oder ID suchen…',
    thRank:'Rang', thUsername:'Benutzername', thId:'ID', thPower:'Machtstufe', thCamp:'Basisstufe', thTotalPoints:'Gesamtpunkte',
    emptyMembersTitle:'Noch keine Mitglieder', emptyMembersDesc:'Mit "+ Mitglied hinzufügen" das erste anlegen.',
    memberAddTitle:'Mitglied hinzufügen', memberEditTitle:'Mitglied bearbeiten',
    lblUsername:'Benutzername', lblGameId:'ID-Nummer', lblRank:'Rang', lblPower:'Machtstufe', lblCamp:'Basisstufe', lblJoinedAt:'Beitrittsdatum', lblOld:'Altes Mitglied (OLD)',
    cancel:'Abbrechen', save:'Speichern', close:'Schließen',
    toastMemberSaved:'Mitglied gespeichert.', toastMemberDeleted:'Mitglied gelöscht.', confirmDeleteMember:'Dieses Mitglied wirklich löschen?',
    nameIdRequired:'Benutzername und ID sind erforderlich.',
    addWeek:'+ Woche hinzufügen', weekAddTitle:'Woche hinzufügen', lblWeekLabel:'Wochenbezeichnung', lblWeekDate:'Datum', weekNameRequired:'Wochenbezeichnung erforderlich.',
    toastWeekSaved:'Woche hinzugefügt.', toastWeekDeleted:'Woche gelöscht.', confirmDeleteWeek:'Diese Woche und alle Daten löschen?',
    emptyWeeksTitle:'Noch keine Woche', emptyWeeksDesc:'Mit "+ Woche hinzufügen" die erste anlegen.',
    legendJoined:'Teilgenommen', legendNotJoined:'Nicht teilgenommen', legendAttended:'Angemeldet & teilgenommen', legendRegNotAttend:'Angemeldet, gefehlt', legendNoReg:'Nicht angemeldet',
    thJoined:'Teilgenommen', thPointsCol:'Punkte', thGroup:'Gruppe', thAttended:'Teilgenommen', groupNone:'Nicht angemeldet', groupA:'Gruppe A', groupB:'Gruppe B',
    entryTitleSVS:'SVS-Eintrag', entryTitleGVG:'GVG-Eintrag', entryTitleSS:'SS-Eintrag', entryTitleKoD:'King of Desert-Eintrag',
    toastEntrySaved:'Gespeichert.', notRegistered:'—',
    boardEmptyTitle:'Noch keine Daten', boardEmptyDesc:'Die Bestenliste füllt sich mit Mitgliedern und Events.',
    searchMember:'Mitglied suchen…',
    statusYes:'Teilgenommen', statusNo:'Nicht teilgenommen', statusUnknown:'Keine Info', legendUnknown:'Keine Info',
    subOther:'Sonstige', addEvent:'+ Event hinzufügen', eventAddTitle:'Event hinzufügen', lblEventLabel:'Eventname', eventNameRequired:'Eventname erforderlich.',
    toastEventSaved:'Event hinzugefügt.', toastEventDeleted:'Event gelöscht.', confirmDeleteEvent:'Dieses Event und alle Daten löschen?',
    emptyEventsTitle:'Noch keine Events', emptyEventsDesc:'Mit "+ Event hinzufügen" das erste anlegen.',
    entryTitleOther:'Sonstiger Event-Eintrag', thStatus:'Status',
    lbRankCol:'Platz', lbMember:'Mitglied', lbGvgTotal:'GVG Gesamt', lbSvsTotal:'SVS Gesamt', lbSvsRatio:'SVS Teilnahme', lbSsRatio:'SS Teilnahme', lbKodRatio:'KoD Teilnahme', lbOtherTotal:'Sonstige Gesamt', lbOtherRatio:'Sonstige Teilnahme',
    exemptLabel:'Befreit', powerHistory:'Machtverlauf', restoreMember:'Wieder aktivieren',
    exportBackupLabel:'Sichern', importBackupLabel:'Importieren', backupSuccess:'Backup heruntergeladen.',
    importConfirm:'Diese Datei ersetzt die von allen gesehenen gemeinsamen Daten. Fortfahren?',
    importSuccess:'Daten importiert.', importFail:'Datei konnte nicht gelesen werden oder ist beschädigt.',
    subActiveMembers:'Aktive Mitglieder', subOldMembers:'Alte Mitglieder (OLD)',
    thDate:'Datum', thPowerVal:'Macht', thDelta:'Änderung', thExcused:'Entschuldigt',
    loginTitle:'Admin-Anmeldung', lblEmail:'E-Mail', lblPassword:'Passwort', loginBtn:'Anmelden', logoutBtn:'Abmelden',
    gateDesc:'Nur Administratorkonten haben Zugriff auf dieses Panel.',
    loginFailed:'Anmeldung fehlgeschlagen.', loginSuccess:'Angemeldet.', logoutSuccess:'Abgemeldet.',
    emailPasswordRequired:'Benutzername und Passwort sind erforderlich.', viewOnlyLabel:'Nur Ansicht',
    previousNames:'Frühere Benutzernamen',
    lblUserChanged:'Nutzerwechsel', userChangedBtn:'🔄 Nutzer gewechselt',
    confirmUserChanged:'Soll dieses Konto ab heute als von einem neuen Nutzer übernommen markiert werden? Event-Wochen vor diesem Datum gelten für dieses Mitglied automatisch als befreit.',
    userChangedStagedLabel:'Nutzerwechsel',
    subMigratedMembers:'Abgewanderte Mitglieder', lblMigratedTo:'Migriert zu Server',
    lblMigrated:'Zu einem anderen Server abgewandert', migratedTag:'Abgewandert',
    weekReport:'Wochenbericht', zoneGreen:'Grüne Zone', zoneYellow:'Gelbe Zone', zoneRed:'Rote Zone',
    weekEditTitle:'Woche bearbeiten', eventEditTitle:'Event bearbeiten',
    overallReportBtn:'📊 Gesamtbericht', overallReport:'Gesamtbericht', thWeeks:'Wochen' },
  es: { appName:'Panel EXC', tagline:'Miembros · Rango · Poder y Nivel de Campamento · Seguimiento de Eventos', refresh:'Actualizar', backToSite:'← Volver al Sitio',
    syncConnecting:'Conectando…', syncLive:'En vivo — todos lo ven', syncError:'Error de conexión',
    tabMembers:'Miembros', tabEvents:'Eventos', tabBoard:'Clasificación', tabMigration:'Migración',
    addProspect:'+ Añadir candidato', prospectAddTitle:'Añadir candidato', prospectEditTitle:'Editar candidato',
    lblColor:'Título', thColor:'Título', thServer:'Servidor', lblServer:'Servidor actual',
    colorGold:'Retador del Imperio', colorPurple:'Capitán de Frontera', colorBlue:'Buscador de Descubrimientos', colorGray:'Viajero', colorUnknown:'Desconocido',
    emptyMigrationTitle:'Aún no hay candidatos', emptyMigrationDesc:'Usa "+ Añadir candidato" para agregar el primer candidato de migración.',
    toastProspectSaved:'Candidato guardado.', toastProspectDeleted:'Candidato eliminado.', confirmDeleteProspect:'¿Seguro que quieres eliminar a este candidato?',
    approveProspectTitle:'Aprobar como miembro', confirmApproveProspect:'¿Seguro que quieres aprobar a este candidato como miembro? Se te llevará a la pantalla de añadir miembro para completar los datos que faltan.',
    leadsHeading:'📥 Solicitudes de Migración', thLeadContact:'Contacto', thLeadMessage:'Mensaje', thLeadDate:'Fecha',
    emptyLeadsDesc:'Las nuevas solicitudes del sitio principal aparecerán aquí.',
    processLeadTitle:'Procesar como Candidato', confirmDismissLead:'¿Seguro que quieres rechazar/eliminar esta solicitud?',
    toastLeadDismissed:'Solicitud eliminada.',
    statMigrationTotal:'Total de candidatos', migrationStatusCertain:'Seguro', migrationStatusUncertain:'Incierto',
    addPeriod:'+ Añadir periodo', periodAddTitle:'Añadir periodo', periodEditTitle:'Editar periodo', lblPeriodLabel:'Etiqueta del periodo',
    periodNameRequired:'La etiqueta del periodo es obligatoria.', confirmDeletePeriod:'¿Seguro que quieres eliminar este periodo? También se eliminarán todos los candidatos que contiene.',
    toastPeriodSaved:'Periodo guardado.', toastPeriodDeleted:'Periodo eliminado.',
    emptyPeriodsTitle:'Aún no hay periodos', emptyPeriodsDesc:'Usa "+ Añadir periodo" para crear el primer periodo de migración.',
    needPeriodFirst:'Crea primero un periodo de migración.',
    statTotal:'Miembros totales', filterAll:'Todos', addMember:'+ Añadir miembro', searchPh:'Buscar por nombre o ID…',
    thRank:'Rango', thUsername:'Nombre de usuario', thId:'ID', thPower:'Nivel de poder', thCamp:'Nivel de campamento', thTotalPoints:'Puntos totales',
    emptyMembersTitle:'Aún no hay miembros', emptyMembersDesc:'Usa "+ Añadir miembro" para agregar el primero.',
    memberAddTitle:'Añadir miembro', memberEditTitle:'Editar miembro',
    lblUsername:'Nombre de usuario', lblGameId:'Número de ID', lblRank:'Rango', lblPower:'Nivel de poder', lblCamp:'Nivel de campamento', lblJoinedAt:'Fecha de ingreso', lblOld:'Miembro antiguo (OLD)',
    cancel:'Cancelar', save:'Guardar', close:'Cerrar',
    toastMemberSaved:'Miembro guardado.', toastMemberDeleted:'Miembro eliminado.', confirmDeleteMember:'¿Seguro que quieres eliminar a este miembro?',
    nameIdRequired:'El nombre de usuario y el ID son obligatorios.',
    addWeek:'+ Añadir semana', weekAddTitle:'Añadir semana', lblWeekLabel:'Etiqueta de semana', lblWeekDate:'Fecha', weekNameRequired:'La etiqueta de semana es obligatoria.',
    toastWeekSaved:'Semana añadida.', toastWeekDeleted:'Semana eliminada.', confirmDeleteWeek:'¿Eliminar esta semana y todos sus datos?',
    emptyWeeksTitle:'Aún no hay semanas', emptyWeeksDesc:'Usa "+ Añadir semana" para crear la primera.',
    legendJoined:'Participó', legendNotJoined:'No participó', legendAttended:'Inscrito y participó', legendRegNotAttend:'Inscrito, ausente', legendNoReg:'No inscrito',
    thJoined:'Participó', thPointsCol:'Puntos', thGroup:'Grupo', thAttended:'Participó', groupNone:'No inscrito', groupA:'Grupo A', groupB:'Grupo B',
    entryTitleSVS:'Registro SVS', entryTitleGVG:'Registro GVG', entryTitleSS:'Registro SS', entryTitleKoD:'Registro King of Desert',
    toastEntrySaved:'Guardado.', notRegistered:'—',
    boardEmptyTitle:'Aún no hay datos', boardEmptyDesc:'La clasificación se completa a medida que agregas miembros y eventos.',
    searchMember:'Buscar miembro…',
    statusYes:'Participó', statusNo:'No participó', statusUnknown:'Sin información', legendUnknown:'Sin información',
    subOther:'Otro', addEvent:'+ Añadir evento', eventAddTitle:'Añadir evento', lblEventLabel:'Nombre del evento', eventNameRequired:'El nombre del evento es obligatorio.',
    toastEventSaved:'Evento añadido.', toastEventDeleted:'Evento eliminado.', confirmDeleteEvent:'¿Eliminar este evento y todos sus datos?',
    emptyEventsTitle:'Aún no hay eventos', emptyEventsDesc:'Usa "+ Añadir evento" para crear el primero.',
    entryTitleOther:'Registro de otro evento', thStatus:'Estado',
    lbRankCol:'Puesto', lbMember:'Miembro', lbGvgTotal:'Total GVG', lbSvsTotal:'Total SVS', lbSvsRatio:'Asistencia SVS', lbSsRatio:'Asistencia SS', lbKodRatio:'Asistencia KoD', lbOtherTotal:'Total Otro', lbOtherRatio:'Asistencia Otro',
    exemptLabel:'Exento', powerHistory:'Historial de poder', restoreMember:'Reactivar miembro',
    exportBackupLabel:'Respaldar', importBackupLabel:'Importar', backupSuccess:'Copia de seguridad descargada.',
    importConfirm:'Este archivo reemplazará los datos compartidos que todos ven. ¿Continuar?',
    importSuccess:'Datos importados.', importFail:'No se pudo leer el archivo o está dañado.',
    subActiveMembers:'Miembros activos', subOldMembers:'Miembros antiguos (OLD)',
    thDate:'Fecha', thPowerVal:'Poder', thDelta:'Cambio', thExcused:'Justificado',
    loginTitle:'Inicio de sesión de administrador', lblEmail:'Correo electrónico', lblPassword:'Contraseña', loginBtn:'Iniciar sesión', logoutBtn:'Cerrar sesión',
    gateDesc:'Solo las cuentas de administrador pueden acceder a este panel.',
    loginFailed:'Error al iniciar sesión.', loginSuccess:'Sesión iniciada.', logoutSuccess:'Sesión cerrada.',
    emailPasswordRequired:'Nombre de usuario y contraseña son obligatorios.', viewOnlyLabel:'Solo lectura',
    previousNames:'Nombres de usuario anteriores',
    lblUserChanged:'Cambio de Usuario', userChangedBtn:'🔄 Usuario Cambiado',
    confirmUserChanged:'¿Marcar esta cuenta como asumida por un nuevo usuario a partir de hoy? Las semanas de eventos anteriores a esta fecha se considerarán automáticamente exentas para este miembro.',
    userChangedStagedLabel:'Cambio de usuario',
    subMigratedMembers:'Miembros Migrados', lblMigratedTo:'Migró al Servidor',
    lblMigrated:'Migró a otro servidor', migratedTag:'Migró',
    weekReport:'Informe Semanal', zoneGreen:'Zona Verde', zoneYellow:'Zona Amarilla', zoneRed:'Zona Roja',
    weekEditTitle:'Editar semana', eventEditTitle:'Editar evento',
    overallReportBtn:'📊 Informe General', overallReport:'Informe General', thWeeks:'Semanas' },
  fr: { appName:'Panneau EXC', tagline:'Membres · Rang · Puissance et Niveau de Camp · Suivi des Événements', refresh:'Actualiser', backToSite:'← Retour au Site',
    syncConnecting:'Connexion…', syncLive:'En direct — visible par tous', syncError:'Erreur de connexion',
    tabMembers:'Membres', tabEvents:'Événements', tabBoard:'Classement', tabMigration:'Migration',
    addProspect:'+ Ajouter un candidat', prospectAddTitle:'Ajouter un candidat', prospectEditTitle:'Modifier le candidat',
    lblColor:'Titre', thColor:'Titre', thServer:'Serveur', lblServer:'Serveur actuel',
    colorGold:"Challenger de l'Empire", colorPurple:'Capitaine de Frontière', colorBlue:'Chercheur de Découvertes', colorGray:'Voyageur', colorUnknown:'Inconnu',
    emptyMigrationTitle:'Aucun candidat pour le moment', emptyMigrationDesc:'Utilisez "+ Ajouter un candidat" pour ajouter le premier candidat à la migration.',
    toastProspectSaved:'Candidat enregistré.', toastProspectDeleted:'Candidat supprimé.', confirmDeleteProspect:'Voulez-vous vraiment supprimer ce candidat ?',
    approveProspectTitle:'Approuver comme membre', confirmApproveProspect:'Voulez-vous vraiment approuver ce candidat comme membre ? Vous serez redirigé vers l\'écran d\'ajout de membre pour compléter les informations manquantes.',
    leadsHeading:'📥 Candidatures de Migration', thLeadContact:'Contact', thLeadMessage:'Message', thLeadDate:'Date',
    emptyLeadsDesc:'Les nouvelles candidatures du site principal apparaîtront ici.',
    processLeadTitle:'Traiter comme Candidat', confirmDismissLead:'Voulez-vous vraiment rejeter/supprimer cette demande ?',
    toastLeadDismissed:'Demande supprimée.',
    statMigrationTotal:'Total des candidats', migrationStatusCertain:'Certain', migrationStatusUncertain:'Incertain',
    addPeriod:'+ Ajouter une période', periodAddTitle:'Ajouter une période', periodEditTitle:'Modifier la période', lblPeriodLabel:'Libellé de la période',
    periodNameRequired:'Le libellé de la période est requis.', confirmDeletePeriod:'Voulez-vous vraiment supprimer cette période ? Tous les candidats qu\'elle contient seront également supprimés.',
    toastPeriodSaved:'Période enregistrée.', toastPeriodDeleted:'Période supprimée.',
    emptyPeriodsTitle:'Aucune période pour le moment', emptyPeriodsDesc:'Utilisez "+ Ajouter une période" pour créer la première période de migration.',
    needPeriodFirst:'Créez d\'abord une période de migration.',
    statTotal:'Membres au total', filterAll:'Tous', addMember:'+ Ajouter un membre', searchPh:'Rechercher par nom ou ID…',
    thRank:'Rang', thUsername:"Nom d'utilisateur", thId:'ID', thPower:'Niveau de puissance', thCamp:'Niveau de camp', thTotalPoints:'Points totaux',
    emptyMembersTitle:'Aucun membre pour le moment', emptyMembersDesc:'Utilisez "+ Ajouter un membre" pour ajouter le premier.',
    memberAddTitle:'Ajouter un membre', memberEditTitle:'Modifier le membre',
    lblUsername:"Nom d'utilisateur", lblGameId:"Numéro d'ID", lblRank:'Rang', lblPower:'Niveau de puissance', lblCamp:'Niveau de camp', lblJoinedAt:"Date d'adhésion", lblOld:'Ancien membre (OLD)',
    cancel:'Annuler', save:'Enregistrer', close:'Fermer',
    toastMemberSaved:'Membre enregistré.', toastMemberDeleted:'Membre supprimé.', confirmDeleteMember:'Voulez-vous vraiment supprimer ce membre ?',
    nameIdRequired:"Le nom d'utilisateur et l'ID sont obligatoires.",
    addWeek:'+ Ajouter une semaine', weekAddTitle:'Ajouter une semaine', lblWeekLabel:'Libellé de la semaine', lblWeekDate:'Date', weekNameRequired:'Le libellé de la semaine est requis.',
    toastWeekSaved:'Semaine ajoutée.', toastWeekDeleted:'Semaine supprimée.', confirmDeleteWeek:'Supprimer cette semaine et toutes ses données ?',
    emptyWeeksTitle:'Aucune semaine pour le moment', emptyWeeksDesc:'Utilisez "+ Ajouter une semaine" pour créer la première.',
    legendJoined:'A participé', legendNotJoined:"N'a pas participé", legendAttended:'Inscrit et présent', legendRegNotAttend:'Inscrit, absent', legendNoReg:'Non inscrit',
    thJoined:'A participé', thPointsCol:'Points', thGroup:'Groupe', thAttended:'Présent', groupNone:'Non inscrit', groupA:'Groupe A', groupB:'Groupe B',
    entryTitleSVS:'Saisie SVS', entryTitleGVG:'Saisie GVG', entryTitleSS:'Saisie SS', entryTitleKoD:'Saisie King of Desert',
    toastEntrySaved:'Enregistré.', notRegistered:'—',
    boardEmptyTitle:'Aucune donnée pour le moment', boardEmptyDesc:'Le classement se remplit au fur et à mesure que vous ajoutez membres et événements.',
    searchMember:'Rechercher un membre…',
    statusYes:'A participé', statusNo:"N'a pas participé", statusUnknown:'Pas d\'info', legendUnknown:'Pas d\'info',
    subOther:'Autre', addEvent:'+ Ajouter un événement', eventAddTitle:'Ajouter un événement', lblEventLabel:"Nom de l'événement", eventNameRequired:"Le nom de l'événement est requis.",
    toastEventSaved:'Événement ajouté.', toastEventDeleted:'Événement supprimé.', confirmDeleteEvent:'Supprimer cet événement et toutes ses données ?',
    emptyEventsTitle:'Aucun événement pour le moment', emptyEventsDesc:'Utilisez "+ Ajouter un événement" pour créer le premier.',
    entryTitleOther:'Saisie autre événement', thStatus:'Statut',
    lbRankCol:'Rang', lbMember:'Membre', lbGvgTotal:'Total GVG', lbSvsTotal:'Total SVS', lbSvsRatio:'Participation SVS', lbSsRatio:'Participation SS', lbKodRatio:'Participation KoD', lbOtherTotal:'Total Autre', lbOtherRatio:'Participation Autre',
    exemptLabel:'Exempté', powerHistory:'Historique de puissance', restoreMember:'Réactiver le membre',
    exportBackupLabel:'Sauvegarder', importBackupLabel:'Importer', backupSuccess:'Sauvegarde téléchargée.',
    importConfirm:'Ce fichier remplacera les données partagées visibles par tous. Continuer ?',
    importSuccess:'Données importées.', importFail:'Impossible de lire le fichier, il est peut-être corrompu.',
    subActiveMembers:'Membres actifs', subOldMembers:'Anciens membres (OLD)',
    thDate:'Date', thPowerVal:'Puissance', thDelta:'Évolution', thExcused:'Excusé',
    loginTitle:'Connexion administrateur', lblEmail:'E-mail', lblPassword:'Mot de passe', loginBtn:'Se connecter', logoutBtn:'Se déconnecter',
    gateDesc:'Seuls les comptes administrateurs peuvent accéder à ce panneau.',
    loginFailed:'Échec de la connexion.', loginSuccess:'Connecté.', logoutSuccess:'Déconnecté.',
    emailPasswordRequired:"Le nom d'utilisateur et le mot de passe sont requis.", viewOnlyLabel:'Lecture seule',
    previousNames:"Anciens noms d'utilisateur",
    lblUserChanged:"Changement d'utilisateur", userChangedBtn:'🔄 Utilisateur Changé',
    confirmUserChanged:"Marquer ce compte comme repris par un nouvel utilisateur à partir d'aujourd'hui ? Les semaines d'événements antérieures à cette date seront automatiquement considérées comme exemptées pour ce membre.",
    userChangedStagedLabel:"Changement d'utilisateur",
    subMigratedMembers:'Membres Migrés', lblMigratedTo:'Migré vers le Serveur',
    lblMigrated:'A migré vers un autre serveur', migratedTag:'A migré',
    weekReport:'Rapport Hebdomadaire', zoneGreen:'Zone Verte', zoneYellow:'Zone Jaune', zoneRed:'Zone Rouge',
    weekEditTitle:'Modifier la semaine', eventEditTitle:"Modifier l'événement",
    overallReportBtn:'📊 Rapport Global', overallReport:'Rapport Global', thWeeks:'Semaines' }
};

/**
 * Aktif dile göre çeviri döndürür; anahtar bulunamazsa Türkçe'ye, o da
 * yoksa anahtarın kendisine düşer.
 */
export function t(key) {
  return (DICT[state.currentLang] && DICT[state.currentLang][key]) || DICT[DEFAULT_LANGUAGE][key] || key;
}

/**
 * Üst bardaki dil seçici düğmelerini (TR/EN/DE/ES/FR) yeniden çizer.
 * Düğmelerin onclick'i global `setLang` fonksiyonunu çağırır — bu
 * fonksiyon app.js içinde tanımlanıp window'a bağlanır, çünkü dil
 * değişince tüm tabloların yeniden çizilmesi (renderAll) gerekir ve
 * ui.js domain render fonksiyonlarını bilmez.
 */
export function buildLangSwitch() {
  const box = document.getElementById("langSwitch");
  box.innerHTML = LANGS.map(
    (lang) => `<div class="lang-opt ${lang === state.currentLang ? "active" : ""}" onclick="setLang('${lang}')">${LANG_FLAG[lang]}</div>`
  ).join("");
}

/**
 * Sayfadaki tüm sabit (statik) metinleri aktif dile göre günceller.
 * Tablolardaki dinamik içerik burada değil, ilgili domain modüllerinin
 * render fonksiyonlarında güncellenir.
 */
export function applyStaticText() {
  document.getElementById("t_appName").textContent = t("appName");
  document.getElementById("t_tagline").textContent = t("tagline");
  document.getElementById("t_refresh").textContent = t("refresh");
  document.getElementById("t_backToSite").textContent = t("backToSite");
  document.getElementById("t_tabMembers").textContent = t("tabMembers");
  document.getElementById("t_tabEvents").textContent = t("tabEvents");
  document.getElementById("t_tabBoard").textContent = t("tabBoard");
  document.getElementById("t_filterAll").textContent = t("filterAll");
  document.getElementById("t_addMember").textContent = t("addMember");
  document.getElementById("memberSearch").placeholder = t("searchPh");
  document.getElementById("t_thRank").textContent = t("thRank");
  document.getElementById("t_thUsername").textContent = t("thUsername");
  document.getElementById("t_thId").textContent = t("thId");
  document.getElementById("t_thPower").textContent = t("thPower");
  document.getElementById("t_thCamp").textContent = t("thCamp");
  document.getElementById("t_emptyMembersTitle").textContent = t("emptyMembersTitle");
  document.getElementById("t_emptyMembersDesc").textContent = t("emptyMembersDesc");
  document.getElementById("t_lblUsername").textContent = t("lblUsername");
  document.getElementById("t_lblGameId").textContent = t("lblGameId");
  document.getElementById("t_lblRank").textContent = t("lblRank");
  document.getElementById("t_lblPower").textContent = t("lblPower");
  document.getElementById("t_lblCamp").textContent = t("lblCamp");
  document.getElementById("t_lblJoinedAt").textContent = t("lblJoinedAt");
  document.getElementById("t_lblOld").textContent = t("lblOld");
  document.getElementById("t_cancel1").textContent = t("cancel");
  document.getElementById("t_save1").textContent = t("save");
  document.getElementById("t_cancel2").textContent = t("cancel");
  document.getElementById("t_save2").textContent = t("save");
  document.getElementById("t_close1").textContent = t("close");
  document.getElementById("t_save3").textContent = t("save");
  document.getElementById("t_lblWeekLabel").textContent = t("lblWeekLabel");
  document.getElementById("t_lblWeekDate").textContent = t("lblWeekDate");
  document.getElementById("t_addWeek_svs").textContent = t("addWeek");
  document.getElementById("t_addWeek_gvg").textContent = t("addWeek");
  document.getElementById("t_addWeek_ss").textContent = t("addWeek");
  ["svs", "gvg", "ss", "kod", "other"].forEach((type) => {
    document.getElementById("t_overallReport_" + type).textContent = t("overallReportBtn");
  });
  document.getElementById("t_overallReportTitle").textContent = t("overallReport");
  document.getElementById("t_close5").textContent = t("close");
  document.getElementById("t_legendJoined").textContent = t("legendJoined");
  document.getElementById("t_legendNotJoined").textContent = t("legendNotJoined");
  document.getElementById("t_legendUnknown").textContent = t("legendUnknown");
  document.getElementById("t_legendAttended").textContent = t("legendAttended");
  document.getElementById("t_legendRegNotAttend").textContent = t("legendRegNotAttend");
  document.getElementById("t_legendNoReg").textContent = t("legendNoReg");
  document.getElementById("t_addWeek_kod").textContent = t("addWeek");
  document.getElementById("t_legendJoinedKod").textContent = t("legendJoined");
  document.getElementById("t_legendNotJoinedKod").textContent = t("legendNotJoined");
  document.getElementById("t_legendUnknownKod").textContent = t("legendUnknown");
  document.getElementById("t_subOther").textContent = t("subOther");
  document.getElementById("t_legendJoinedOther").textContent = t("legendJoined");
  document.getElementById("t_legendNotJoinedOther").textContent = t("legendNotJoined");
  document.getElementById("t_legendUnknownOther").textContent = t("legendUnknown");
  document.getElementById("t_addEvent_other").textContent = t("addEvent");
  ["1", "2", "3", "5"].forEach((suffix) => {
    document.getElementById("t_emptyWeeksTitle" + suffix).textContent = t("emptyWeeksTitle");
    document.getElementById("t_emptyWeeksDesc" + suffix).textContent = t("emptyWeeksDesc");
  });
  document.getElementById("t_emptyWeeksTitle4").textContent = t("emptyEventsTitle");
  document.getElementById("t_emptyWeeksDesc4").textContent = t("emptyEventsDesc");
  document.getElementById("entrySearch").placeholder = t("searchMember");
  document.getElementById("t_exportBackup").textContent = t("exportBackupLabel");
  document.getElementById("t_importBackup").textContent = t("importBackupLabel");
  document.getElementById("t_subActiveMembers").textContent = t("subActiveMembers");
  document.getElementById("t_subOldMembers").textContent = t("subOldMembers");
  document.getElementById("t_subMigratedMembers").textContent = t("subMigratedMembers");
  document.getElementById("t_lblMigratedTo").textContent = t("lblMigratedTo");
  document.getElementById("t_lblUserChanged").textContent = t("lblUserChanged");
  document.getElementById("t_userChangedBtn").textContent = t("userChangedBtn");
  document.getElementById("t_lblMigrated").textContent = t("lblMigrated");
  document.getElementById("t_thDate").textContent = t("thDate");
  document.getElementById("t_thPowerVal").textContent = t("thPowerVal");
  document.getElementById("t_thDelta").textContent = t("thDelta");
  document.getElementById("t_close2").textContent = t("close");
  document.getElementById("t_close3").textContent = t("close");
  document.getElementById("t_gateTitle").textContent = t("loginTitle");
  document.getElementById("t_gateDesc").textContent = t("gateDesc");
  document.getElementById("t_gateLblUsername").textContent = t("lblUsername");
  document.getElementById("t_gateLblPassword").textContent = t("lblPassword");
  document.getElementById("t_gateSubmit").textContent = t("loginBtn");
  document.getElementById("t_gateBackToSite").textContent = t("backToSite");
  document.getElementById("t_logoutBtn").textContent = t("logoutBtn");
  document.getElementById("t_tabMigration").textContent = t("tabMigration");
  document.getElementById("t_addProspect").textContent = t("addProspect");
  document.getElementById("t_addPeriod").textContent = t("addPeriod");
  document.getElementById("t_lblPeriodLabel").textContent = t("lblPeriodLabel");
  document.getElementById("t_lblPeriodDate").textContent = t("lblWeekDate");
  document.getElementById("t_cancel6").textContent = t("cancel");
  document.getElementById("t_save6").textContent = t("save");
  document.getElementById("t_emptyPeriodsTitle").textContent = t("emptyPeriodsTitle");
  document.getElementById("t_emptyPeriodsDesc").textContent = t("emptyPeriodsDesc");
  document.getElementById("t_thColor").textContent = t("thColor");
  document.getElementById("t_thUsername2").textContent = t("thUsername");
  document.getElementById("t_thId2").textContent = t("thId");
  document.getElementById("t_thPower2").textContent = t("thPower");
  document.getElementById("t_thServer").textContent = t("thServer");
  document.getElementById("t_emptyMigrationTitle").textContent = t("emptyMigrationTitle");
  document.getElementById("t_emptyMigrationDesc").textContent = t("emptyMigrationDesc");
  document.getElementById("t_lblProspectName").textContent = t("lblUsername");
  document.getElementById("t_lblProspectId").textContent = t("lblGameId");
  document.getElementById("t_lblProspectPower").textContent = t("lblPower");
  document.getElementById("t_lblServer").textContent = t("lblServer");
  document.getElementById("t_lblColor").textContent = t("lblColor");
  document.getElementById("t_lblMigrationStatus").textContent = t("thStatus");
  document.getElementById("t_thMigrationStatus").textContent = t("thStatus");
  document.getElementById("t_leadsHeading").textContent = t("leadsHeading");
  document.getElementById("t_thLeadName2").textContent = t("thUsername");
  document.getElementById("t_thLeadContact").textContent = t("thLeadContact");
  document.getElementById("t_thLeadId2").textContent = t("thId");
  document.getElementById("t_emptyLeadsDesc").textContent = t("emptyLeadsDesc");
  document.getElementById("t_thLeadServer2").textContent = t("thServer");
  document.getElementById("t_thLeadPower2").textContent = t("thPower");
  document.getElementById("t_thLeadMessage").textContent = t("thLeadMessage");
  document.getElementById("t_thLeadDate").textContent = t("thLeadDate");
  document.getElementById("t_statusCertainOpt").textContent = t("migrationStatusCertain");
  document.getElementById("t_statusUncertainOpt").textContent = t("migrationStatusUncertain");
  document.getElementById("t_cancel5").textContent = t("cancel");
  document.getElementById("t_save5").textContent = t("save");
  updateAdminUI();
  buildCampOptions();
  buildMigrationColorOptions();
  document.title = t("appName");
}

/**
 * Tarayıcıda daha önce kaydedilmiş dil tercihini `state.currentLang`'a
 * yükler. Dil tercihi kasıtlı olarak tarayıcıya özeldir (localStorage) —
 * Supabase'deki paylaşılan `settings` tablosunda TUTULMAZ, çünkü bu
 * herkesin dilini birbirine karıştırır (bkz. proje geçmişi).
 */
export function initLangFromStorage() {
  try {
    const savedLang = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (savedLang && LANGS.includes(savedLang)) state.currentLang = savedLang;
  } catch (error) {
    // localStorage kullanılamıyorsa (gizli sekme, kısıtlı ortam) sessizce varsayılan dile devam et.
  }
}

/** Seçilen dili tarayıcıya (sadece bu tarayıcıya) kalıcı olarak kaydeder. */
export function persistLanguage(lang) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch (error) {
    // Depolama kullanılamıyorsa tercih sadece bu oturum için geçerli olur.
  }
}

// =====================================================================
// GENEL DOM / BİÇİMLENDİRME YARDIMCILARI
// =====================================================================

/** Alt kısımda kısa süreliğine görünen bilgi/başarı/hata mesajı. */
export function showToast(message) {
  const toastEl = document.getElementById("toast");
  toastEl.textContent = message;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), TOAST_DISPLAY_DURATION_MS);
}

/** Kullanıcıdan gelen metni HTML içine güvenle basmak için kaçış (escape) uygular. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

/** Büyük sayıları K/M/B kısaltmalarıyla okunur hale getirir (ör. 1250000 -> "1.25M"). */
export function formatPower(value) {
  const number = Number(value) || 0;
  if (number >= 1e9) return (number / 1e9).toFixed(2).replace(/\.00$/, "") + "B";
  if (number >= 1e6) return (number / 1e6).toFixed(2).replace(/\.00$/, "") + "M";
  if (number >= 1e3) return (number / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(number);
}

/** "x/y (%z)" biçiminde katılım oranı metni üretir; payda sıfırsa "Kayıt Yok" döner. */
export function formatRatio(numerator, denominator) {
  if (!denominator) return t("notRegistered");
  const percentage = Math.round((numerator / denominator) * 100);
  return percentage + "% (" + numerator + "/" + denominator + ")";
}

/** Rütbe rozetinin renk sınıfını döndürür. */
export function rankClass(rank) {
  return { R5: "r5-c", R4: "r4-c", R3: "r3-c", R2: "r2-c", R1: "r1-c" }[rank] || "r1-c";
}

/** Rütbe rozetindeki şeflik (▲) sayısını döndürür. */
export function rankChevrons(rank) {
  return "▲".repeat(RANK_ORDER[rank] || 1);
}

/** Göç adayı renk rozetinin CSS sınıfını döndürür (mc-gold/mc-purple/mc-blue/mc-gray/mc-unknown). */
export function migrationColorClass(color) {
  return "mc-" + (MIGRATION_COLORS.includes(color) ? color : "unknown");
}

/** Göç adayı renginin çevrilmiş etiketini döndürür. */
export function migrationColorLabel(color) {
  return t({ gold: "colorGold", purple: "colorPurple", blue: "colorBlue", gray: "colorGray", unknown: "colorUnknown" }[color] || "colorUnknown");
}

/** Göç adayının "bize kesin mi belirsiz mi geleceği" durumunun hücre rengi sınıfını döndürür. */
export function migrationStatusClass(status) {
  return status === "certain" ? "pill-blue" : "pill-yellow";
}

/** Göç adayının durumunun çevrilmiş etiketini döndürür. */
export function migrationStatusLabel(status) {
  return t(status === "certain" ? "migrationStatusCertain" : "migrationStatusUncertain");
}

/** GVG haftalık puanına göre hücre rengi sınıfını döndürür (config.js'teki eşiklere göre). */
export function gvgColorClass(points) {
  const value = Number(points) || 0;
  if (value >= GVG_THRESHOLDS.green) return "pill-green";
  if (value >= GVG_THRESHOLDS.yellow) return "pill-yellow";
  return "pill-red";
}

/**
 * Bir üyenin, verilen haftada henüz loncaya katılmamış (veya hesabı henüz
 * devralmamış) olması nedeniyle "muaf" sayılıp sayılmayacağını hesaplar.
 * Eşik tarihi, `user_changed_at` doluysa (hesabı devralan yeni kullanıcı)
 * onu, yoksa `joined_at`'i esas alır — böylece hem yeni eklenen bir üye
 * hem de "Kullanıcı Değişti" ile işaretlenmiş bir üye, kendinden önceki
 * haftalardan otomatik muaf sayılır. Bu SADECE o hafta için hiç kayıt
 * girilmemişse bir varsayım olarak kullanılmalıdır — gerçek bir kayıt
 * varsa her zaman kayıttaki veri gösterilir (bkz. members/gvg/svs/ss
 * modüllerindeki "cellInfo" fonksiyonları).
 */
export function isExempt(member, week) {
  if (!week || !week.date || !member) return false;
  const threshold = member.userChangedAt || member.joinedAt;
  if (!threshold) return false;
  return week.date < threshold.slice(0, 10);
}

/** Bir katılım kaydının durumunu ('joined' | 'absent' | 'unknown') normalize eder. */
export function statusOf(entry) {
  if (!entry) return "unknown";
  if (entry.status) return entry.status;
  if (entry.joined === true) return "joined";
  if (entry.joined === false) return "absent";
  return "unknown";
}

/** {cls, text} biçimindeki hücre bilgisini tablo `<td>` hücresine dönüştürür. */
export function cellInfoHtml(info) {
  return `<td class="week-col"><span class="cell-pill ${info.cls}">${info.text}</span></td>`;
}

/** Bugünün tarihini "YYYY-MM-DD" biçiminde döndürür. */
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// =====================================================================
// HAFTALIK HÜCRE BİLGİSİ VE TOPLAM/ORAN HESAPLARI
// =====================================================================
// Bu fonksiyonlar hem etkinlik tablolarında (gvg.js/svs.js/ss.js) hem de
// üye kartındaki etkinlik özetinde (members.js) ve puan sıralamasında
// (dashboard.js) kullanılır. Birden fazla domain dosyası tarafından
// paylaşıldığı için burada (ui.js) tutulur — aksi halde members.js ile
// gvg.js/svs.js/ss.js/dashboard.js birbirini import etmeye çalışıp
// döngüsel bağımlılık oluştururdu. `store` (haftalar+kayıtlar) her zaman
// çağıran taraftan açıkça geçirilir, örtük bir global okuma yapılmaz.

/** SVS/Diğer türü bir hücrenin (üye × hafta) rengini ve metnini hesaplar. */
export function svsOtherCellInfo(store, member, week) {
  const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
  if (!entry) return isExempt(member, week) ? { cls: "pill-gray", text: t("exemptLabel") } : { cls: "pill-gray", text: t("notRegistered") };
  const status = statusOf(entry);
  if (status === "joined") return { cls: "pill-green", text: "✓ " + (Number(entry.points) || 0) };
  if (status === "unknown") return { cls: "pill-gray", text: t("notRegistered") };
  const excused = !!entry.excused;
  return { cls: excused ? "pill-yellow" : "pill-red", text: "✕" + (excused ? " (M)" : "") };
}

/** King of Desert türü bir hücrenin rengini/metnini hesaplar — svsOtherCellInfo ile aynı ama puan yok, sadece katıldı/katılmadı. */
export function attendanceCellInfo(store, member, week) {
  const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
  if (!entry) return isExempt(member, week) ? { cls: "pill-gray", text: t("exemptLabel") } : { cls: "pill-gray", text: t("notRegistered") };
  const status = statusOf(entry);
  if (status === "joined") return { cls: "pill-green", text: "✓" };
  if (status === "unknown") return { cls: "pill-gray", text: t("notRegistered") };
  const excused = !!entry.excused;
  return { cls: excused ? "pill-yellow" : "pill-red", text: "✕" + (excused ? " (M)" : "") };
}

/** GVG türü bir hücrenin (üye × hafta) rengini ve metnini hesaplar. */
// GVG'de "muaf" veya "kayıt yok" diye bir ara durum yoktur: bir hafta için hiç
// kayıt girilmemişse, o hafta hiç aktif olunmadığı/oyuna girilmediği kabul
// edilir ve 0 puan girilmiş gibi işlem görür (renk eşiği zaten 0'ı otomatik
// kırmızı yapar, ayrı bir kural gerekmez).
export function gvgCellInfo(store, member, week) {
  const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
  const points = entry ? (Number(entry.points) || 0) : 0;
  return { cls: gvgColorClass(points), text: String(points) };
}

/** SS türü bir hücrenin (üye × hafta) rengini ve metnini hesaplar. */
export function ssCellInfo(store, member, week) {
  const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
  if (!entry) return isExempt(member, week) ? { cls: "pill-gray", text: t("exemptLabel") } : { cls: "pill-gray", text: t("notRegistered") };
  if (!entry.group) return { cls: "pill-gray", text: t("notRegistered") };
  if (entry.attended) return { cls: "pill-green", text: entry.group };
  const excused = !!entry.excused;
  return { cls: excused ? "pill-yellow" : "pill-red", text: entry.group + (excused ? " (M)" : "") };
}

/** Bir üyenin belirli bir GVG deposundaki toplam puanını hesaplar. */
export function sumGvgPoints(store, memberId) {
  return store.entries.filter((e) => e.memberId === memberId).reduce((sum, e) => sum + (Number(e.points) || 0), 0);
}

/** Bir üyenin "katıldı" işaretli kayıtlarındaki toplam puanını hesaplar (SVS/Diğer). */
export function sumStatusPoints(store, memberId) {
  return store.entries.filter((e) => e.memberId === memberId && statusOf(e) === "joined").reduce((sum, e) => sum + (Number(e.points) || 0), 0);
}

/** SVS/Diğer türü bir üyenin katılım oranını (x/y) hesaplar; gerçek kaydı olan haftalar muaf sayılmaz. */
export function ratioStatus(store, member) {
  const applicableWeeks = store.weeks.filter((week) => {
    const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    return !!entry || !isExempt(member, week);
  });
  const denominator = applicableWeeks.length;
  const numerator = applicableWeeks.filter((week) => {
    const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    return statusOf(entry) === "joined";
  }).length;
  return { num: numerator, den: denominator };
}

/** SS türü bir üyenin katılım oranını (x/y) hesaplar; gerçek kaydı olan haftalar muaf sayılmaz. */
export function ratioSs(store, member) {
  const applicableWeeks = store.weeks.filter((week) => {
    const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    return !!entry || !isExempt(member, week);
  });
  const denominator = applicableWeeks.length;
  const numerator = applicableWeeks.filter((week) => {
    const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    return entry && entry.group && entry.attended;
  }).length;
  return { num: numerator, den: denominator };
}

// =====================================================================
// KAMP SEVİYESİ SEÇENEKLERİ
// =====================================================================

/** Üye formundaki "Kamp Seviyesi" açılır listesini (config.js'teki sabit listeden) doldurur. */
export function buildCampOptions() {
  const select = document.getElementById("fCamp");
  const currentValue = select.value;
  select.innerHTML = CAMP_LEVELS.map((level) => `<option value="${level}">${level}</option>`).join("");
  if (currentValue) select.value = currentValue;
}

/** Göç adayı formundaki "Göç Rengi" açılır listesini (Altın>Mor>Mavi>Gri sırasıyla) doldurur. */
export function buildMigrationColorOptions() {
  const select = document.getElementById("pColor");
  const currentValue = select.value;
  select.innerHTML = MIGRATION_COLORS.map((color) => `<option value="${color}">${migrationColorLabel(color)}</option>`).join("");
  if (currentValue) select.value = currentValue;
}

export { campLevelSortValue };

// =====================================================================
// ADMIN GÖRÜNÜRLÜĞÜ
// =====================================================================
// Gerçek yazma yetkisi Supabase RLS politikalarıyla (sql/auth_policies.sql)
// sağlanır; bu fonksiyon sadece arayüzdeki "admin-only" öğelerin
// görünürlüğünü `state.isAdmin`'e göre günceller. Kimlik doğrulama
// mantığının kendisi (giriş/çıkış, Supabase Auth çağrıları) auth.js'de.

/** Admin oturumuna göre üst bar ve "admin-only" sınıflı öğelerin görünürlüğünü günceller. */
export function updateAdminUI() {
  document.body.classList.toggle("is-admin", state.isAdmin);
  document.getElementById("logoutBtn").style.display = state.isAdmin ? "" : "none";
  const statusEl = document.getElementById("authStatus");
  if (statusEl) statusEl.textContent = state.isAdmin ? (state.currentAdminUsername || t("logoutBtn")) : t("viewOnlyLabel");
}
