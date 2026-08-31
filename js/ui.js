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
  MIGRATION_COLOR_ORDER,
  ELEMENTS
} from "./config.js";

// ---------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------
const LANGUAGE_STORAGE_KEY = "exc-lang";
const THEME_STORAGE_KEY = "exc-theme"; // panel/index.html'deki FOUC-önleyici satır-içi script ile AYNI anahtar
const TOAST_DISPLAY_DURATION_MS = 2200;
const LANG_FLAG_LABELS = { tr: "TR", en: "EN", de: "DE", es: "ES", fr: "FR", vi: "VI" };

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
  siteLinks: { discordUrl: "", youtubeUrl: "", instagramUrl: "" }, // genel tanıtım sitesindeki Discord/YouTube/Instagram linkleri (bkz. siteLinks.js)
  news: [], // ana sayfadaki "Haberler" bölümünün içeriği (bkz. news.js)
  featuredVideos: [], // ana sayfadaki "YouTube Kanalımız" bölümünde dönen video vitrini (bkz. videos.js)
  activityLog: [], // "Aktivite" sekmesindeki admin aktivite kaydı (bkz. activity.js)
  panelMode: null, // null: seçim ekranı, "data": veri paneli, "site": site editörü — her yeni girişte null'a döner (bkz. auth.js)
  migrationView: "active", // "active" | "failed" — seçili göç döneminde hangi alt liste gösteriliyor (bkz. migration.js -> setMigrationView)
  migrationSortKey: "color",
  migrationSortDir: -1, // -1: varsayılan görünümde Altın üstte, Griye doğru azalan sıra
  migrationColorFilter: "ALL", // "ALL" | MIGRATION_COLORS içinden biri (bkz. migration.js -> setMigrationColorFilter)
  migrationStatusFilter: "ALL", // "ALL" | "certain" | "waitlist" | "uncertain" (bkz. migration.js -> setMigrationStatusFilter)
  currentTab: "members",
  currentSub: "svs",
  currentLang: DEFAULT_LANGUAGE,
  memberView: "active",
  rankFilter: "ALL",
  elementFilter: "ALL", // "ALL" | "water" | "fire" | "earth" | "electric" (bkz. members.js -> setElementFilter)
  sortKey: "rank",
  sortDir: -1, // -1: varsayılan görünümde R5 üstte, R1'e doğru azalan sıra
  oldFlag: false,
  migratedFlag: false,
  entryContext: null, // { type: 'svs'|'gvg'|'ss'|'other', weekId }
  boardSortKey: "gvgPts",
  boardSortDir: -1,
  boardSearch: "",
  overallReportType: null,
  overallReportSortKey: "rank",
  overallReportSortDir: -1,
  historyMemberId: null,
  isAdmin: false,
  isMember: false, // true: salt okunur "üye" rolü (bkz. sql/add_member_role.sql) — Üyeler/Etkinlikler/Puan Sıralaması görür, düzenleyemez, Göç/Aktivite/Site Editörü'nü hiç görmez
  currentAdminUsername: "", // auth.js buraya Supabase oturumundaki sahte email'i (bkz. ADMIN_LOGIN_DOMAIN) DEĞİL, kullanıcıya gösterilecek çıplak kullanıcı adını yazar
  currentTheme: "light" // "light" | "dark" — varsayılan açık; koyu mod tercihe bağlı (bkz. initThemeFromStorage/setTheme). panel/index.html'deki satır-içi script, JS modülleri yüklenmeden ÖNCE body sınıfını aynı localStorage anahtarına göre uygulayıp yanıp-sönmeyi (FOUC) önler.
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
    lblColor:'Unvan', thColor:'Unvan', thServer:'Sunucu', lblServer:'Mevcut Sunucu', lblProspectNote:'Tahmini Gidecek Lonca/Not', lblProspectScore:'Göç Puanı',
    colorGold:'İmparatorluk Rakibi', colorPurple:'Hudut Kaptanı', colorBlue:'Keşif Peşinde', colorGray:'Gezgin', colorUnknown:'Bilinmiyor',
    emptyMigrationTitle:'Henüz aday yok', emptyMigrationDesc:'"+ Aday Ekle" ile ilk göç adayını ekle.',
    toastProspectSaved:'Aday kaydedildi.', toastProspectDeleted:'Aday silindi.', confirmDeleteProspect:'Bu adayı silmek istediğinize emin misiniz?',
    approveProspectTitle:'Üye Olarak Onayla', confirmApproveProspect:'Bu adayı üye olarak onaylamak istediğinize emin misiniz? Eksik bilgileri dolduracağınız üye ekleme ekranına yönlendirileceksiniz.',
    leadsHeading:'📥 Göç Başvuruları', thLeadContact:'İletişim', thLeadMessage:'Mesaj', thLeadDate:'Tarih',
    emptyLeadsDesc:'Genel siteden gelen yeni başvurular burada görünecek.',
    siteLinksDesc:'Bu linkler genel tanıtım sitesinde (ana sayfa) kullanılır.',
    chooserTitle:'Ne yapmak istersiniz?', chooserDataTitle:'Veri Paneli', chooserDataDesc:'Üyeler, etkinlikler, göç ve puan sıralaması.',
    chooserSiteTitle:'Site Editörü', chooserSiteDesc:'Ana sayfa linkleri ve haberler.', backToChooser:'← Panel Seçimi', tabSiteLinks:'Site Linkleri',
    lblDiscordUrl:'Discord Davet Linki', lblYoutubeUrl:'YouTube Kanal Linki', lblInstagramUrl:'Instagram Linki',
    toastSiteLinksSaved:'Site linkleri kaydedildi.',
    tabNews:'Haberler', addNews:'+ Haber Ekle', newsAddTitle:'Haber Ekle', newsEditTitle:'Haberi Düzenle',
    lblNewsTitle:'Başlık', lblNewsBody:'İçerik', lblNewsDate:'Tarih', lblNewsImage:'Resim',
    newsTitleRequired:'Haber başlığı gerekli.', toastNewsSaved:'Haber kaydedildi.', toastNewsDeleted:'Haber silindi.',
    confirmDeleteNews:'Bu haberi silmek istediğinize emin misiniz?',
    emptyNewsTitle:'Henüz haber yok', emptyNewsDesc:'"+ Haber Ekle" ile ilk haberi ekle.',
    thNewsImage:'Resim', thNewsTitle:'Başlık', thNewsDate:'Tarih',
    tabVideos:'Videolar', addVideo:'+ Video Ekle', videoAddTitle:'Video Ekle', videoEditTitle:'Videoyu Düzenle',
    lblVideoUrl:'YouTube Video Linki', lblVideoTitle:'Başlık (opsiyonel)',
    invalidVideoUrl:'Geçerli bir YouTube video linki girin.', toastVideoSaved:'Video kaydedildi.', toastVideoDeleted:'Video silindi.',
    confirmDeleteVideo:'Bu videoyu silmek istediğinize emin misiniz?',
    emptyVideosTitle:'Henüz video yok', emptyVideosDesc:'"+ Video Ekle" ile ilk videoyu ekle.',
    thVideoThumb:'Görsel', thVideoTitle:'Başlık', moveUp:'Yukarı Taşı', moveDown:'Aşağı Taşı',
    processLeadTitle:'Aday Olarak İşle', confirmDismissLead:'Bu başvuruyu reddetmek/silmek istediğinize emin misiniz?',
    toastLeadDismissed:'Başvuru silindi.',
    statMigrationTotal:'Toplam Aday', migrationStatusCertain:'Kesin', migrationStatusWaitlist:'Yedek', migrationStatusUncertain:'Belirsiz',
    subMigrationActive:'Adaylar', subMigrationFailed:'Başarısız', statMigrationFailedTotal:'Toplam Başarısız',
    markFailedTitle:'Başarısız İşaretle (Kontenjan Yok)', confirmMarkFailed:'Bu adayı, yeterli kontenjan olmadığı için göç edemedi diye işaretlemek istiyor musunuz? Aday "Başarısız" sekmesine taşınacak.',
    toastProspectFailed:'Aday başarısız olarak işaretlendi.', restoreProspectTitle:'Aday Listesine Geri Al',
    copyToNextPeriodTitle:'Sonraki Döneme Kopyala', confirmCopyProspectToNext:'Bu adayı, yeniden değerlendirilmek üzere en yeni göç dönemine kopyalamak istiyor musunuz? "Belirsiz" durumuyla eklenecek — bu dönemdeki "Başarısız" kaydı silinmeyecek.',
    needNewerPeriodForCopy:'Kopyalamak için önce daha yeni bir göç dönemi oluşturun.', toastProspectCopiedToNext:'Aday yeni döneme kopyalandı.',
    emptyMigrationFailedTitle:'Henüz başarısız aday yok', emptyMigrationFailedDesc:'Kontenjan yetersizliği vb. nedenlerle göç edemeyen adaylar burada listelenir.',
    subMigrationConfirmed:'Onayda', statMigrationConfirmedTotal:'Toplam Onayda',
    markConfirmedTitle:'Onayda Olarak İşaretle', confirmMarkConfirmed:'Bu adayı doğrulandı ve göç edeceği kesinleşti olarak işaretlemek istediğinize emin misiniz? "Onayda" sekmesine taşınacak.',
    toastProspectConfirmed:'Aday onayda olarak işaretlendi.', unconfirmTitle:'Adaylar Listesine Geri Al',
    emptyMigrationConfirmedTitle:'Henüz onaylı aday yok', emptyMigrationConfirmedDesc:'Adaylar sekmesinden ➡️ ile bir adayı buraya taşıyabilirsiniz.',
    subMigrationFinalized:'Tamamlandı', statMigrationFinalizedTotal:'Toplam Tamamlandı',
    markFinalizedTitle:'Tamamlandı Olarak İşaretle', confirmMarkFinalized:'Bu adayın EXC\'ye katılacağı kesinleşti mi? "Tamamlandı" sekmesine taşınacak, oradan üye olarak eklenebilir.',
    toastProspectFinalized:'Aday tamamlandı olarak işaretlendi.', unfinalizeTitle:'Onayda Listesine Geri Al',
    emptyMigrationFinalizedTitle:'Henüz tamamlanan aday yok', emptyMigrationFinalizedDesc:'Onayda sekmesinden ➡️ ile bir adayı buraya taşıyabilirsiniz.',
    addPeriod:'+ Dönem Ekle', periodAddTitle:'Dönem Ekle', periodEditTitle:'Dönemi Düzenle', lblPeriodLabel:'Dönem Etiketi',
    lblPeriodStartDate:'Başlangıç Tarihi', lblPeriodEndDate:'Bitiş Tarihi', periodWord:'Dönem',
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
    invalidGameId:'ID Numarası sadece rakamlardan oluşmalı ve tam olarak 15 basamak olmalıdır.',
    invalidNumberField:'Bu alan sadece rakamlardan oluşmalıdır.',
    addWeek:'+ Hafta Ekle', weekAddTitle:'Hafta Ekle', lblWeekLabel:'Hafta Etiketi', lblWeekDate:'Tarih', weekNameRequired:'Hafta etiketi gerekli.',
    toastWeekSaved:'Hafta eklendi.', toastWeekDeleted:'Hafta silindi.', confirmDeleteWeek:'Bu haftayı ve tüm verilerini silmek istiyor musunuz?',
    emptyWeeksTitle:'Henüz hafta yok', emptyWeeksDesc:'"+ Hafta Ekle" ile ilk haftayı oluştur.',
    legendJoined:'Katıldı', legendNotJoined:'Katılmadı', legendAttended:'Kayıtlı ve Katıldı', legendRegNotAttend:'Kayıtlı, Katılmadı', legendNoReg:'Kayıt Yok',
    thJoined:'Katıldı', thPointsCol:'Puan', thGroup:'Grup', thAttended:'Katıldı mı', groupNone:'Kayıt Yok', groupA:'A Grubu', groupB:'B Grubu',
    entryTitleSVS:'SVS Girişi', entryTitleGVG:'GVG Girişi', entryTitleSS:'SS Girişi', entryTitleKoD:'King of Desert Girişi',
    toastEntrySaved:'Kayıt tamamlandı.', notRegistered:'—',
    aiFillBtn:'🤖 AI ile Doldur', aiFillWorking:'AI okuyor…', aiFillDone:'{n} üye için dolduruldu, kontrol edip kaydedin.', aiFillError:'AI okuma başarısız oldu.', aiFillNoMembers:'Listede üye yok.',
    boardEmptyTitle:'Henüz veri yok', boardEmptyDesc:'Üye ve etkinlik ekledikçe sıralama burada oluşur.',
    searchMember:'Üye ara…',
    statusYes:'Katıldı', statusNo:'Katılmadı', statusUnknown:'Bilgi Yok', legendUnknown:'Bilgi Yok',
    subOther:'Diğer', addEvent:'+ Etkinlik Ekle', eventAddTitle:'Etkinlik Ekle', lblEventLabel:'Etkinlik Adı', eventNameRequired:'Etkinlik adı gerekli.',
    toastEventSaved:'Etkinlik eklendi.', toastEventDeleted:'Etkinlik silindi.', confirmDeleteEvent:'Bu etkinliği ve tüm verilerini silmek istiyor musunuz?',
    emptyEventsTitle:'Henüz etkinlik yok', emptyEventsDesc:'"+ Etkinlik Ekle" ile ilk etkinliği oluştur.',
    entryTitleOther:'Diğer Etkinlik Girişi', thStatus:'Durum',
    lbRankCol:'Sıra', lbMember:'Üye', lbGvgTotal:'GVG Toplam', lbSvsTotal:'SVS Toplam', lbSvsRatio:'SVS Katılım', lbSsRatio:'SS Katılım', lbKodRatio:'KoD Katılım', lbOtherTotal:'Diğer Toplam', lbOtherRatio:'Diğer Katılım',
    lbParticipation:'Genel Katılım (Son 4 Hafta)', belowThresholdTitle:'Katılım %50\'nin altında',
    participationReportBtn:'📊 Katılım Raporu', participationReportTitle:'Katılım Raporu',
    groupAboveThreshold:'🟢 Eşik Üstü (≥ %50)', groupBelowThreshold:'🔴 Eşik Altı (< %50)', groupNoData:'⚪ Henüz Veri Yok',
    exemptLabel:'Muaf', powerHistory:'Güç Geçmişi', restoreMember:'Aktif Üyeye Al',
    exportBackupLabel:'Yedekle', importBackupLabel:'İçe Aktar', backupSuccess:'Yedek indirildi.',
    importConfirm:'Bu dosyadaki veriler herkesin gördüğü ortak veriyle değiştirilecek. Devam edilsin mi?',
    importSuccess:'Veriler içe aktarıldı.', importFail:'Dosya okunamadı veya bozuk.',
    subActiveMembers:'Aktif Üyeler', subOldMembers:'Eski Üyeler (OLD)',
    thDate:'Tarih', thPowerVal:'Güç', thDelta:'Fark', thExcused:'Mazeretli',
    loginTitle:'Yönetici Girişi', lblEmail:'E-posta', lblPassword:'Şifre', loginBtn:'Giriş Yap', logoutBtn:'Çıkış Yap',
    gateDesc:'Bu panele giriş yapmak için hesabınızla oturum açın.',
    loginFailed:'Giriş başarısız.', loginSuccess:'Giriş yapıldı.', logoutSuccess:'Çıkış yapıldı.',
    emailPasswordRequired:'Kullanıcı adı ve şifre gerekli.', viewOnlyLabel:'Salt okunur',
    previousNames:'Önceki Kullanıcı Adları',
    userChangedHistoryLabel:'🔄 Kullanıcı Değişti — Önceki Kullanıcı',
    lblUserChanged:'Kullanıcı Değişikliği', userChangedBtn:'🔄 Kullanıcı Değişti',
    confirmUserChanged:'Bu hesabı bugün itibariyle yeni bir kullanıcının devraldığını işaretlemek istiyor musunuz? Bu tarihten önceki etkinlik haftaları bu üye için otomatik olarak muaf sayılacak. Devam ederseniz kullanıcı adı alanı temizlenecek — yeni kullanıcının adını girip Kaydet\'e basmayı unutmayın (güç seviyesi değiştiyse onu da güncelleyebilirsiniz).',
    userChangedStagedLabel:'Kullanıcı değişikliği',
    subMigratedMembers:'Göç Edenler', lblMigratedTo:'Göç Ettiği Sunucu',
    lblMigrated:'Başka sunucuya göç etti', migratedTag:'Göç Etti', convertedTag:'✓ Üye Oldu',
    weekReport:'Hafta Raporu', zoneGreen:'Yeşil Bölge', zoneYellow:'Sarı Bölge', zoneRed:'Kırmızı Bölge',
    weekEditTitle:'Haftayı Düzenle', eventEditTitle:'Etkinliği Düzenle',
    overallReportBtn:'📊 Genel Rapor', overallReport:'Genel Rapor', thWeeks:'Haftalar',
    thTeam:'1. Takım', lblTeamPower:'1. Takım Gücü', lblTeamElement:'1. Takım Elementi',
    exportBtn:'⬇️ Dışa Aktar', exportSelectAll:'Tümünü Seç', exportSelectNone:'Tümünü Kaldır', exportNoSelection:'Lütfen en az bir seçenek işaretleyin.', thListView:'Liste',
    elementWater:'Su', elementFire:'Ateş', elementEarth:'Toprak', elementElectric:'Elektrik', elementNone:'Element Yok',
    tabActivity:'Aktivite', thWhen:'Tarih', thAdmin:'Admin', thAction:'İşlem', thEntity:'Üye',
    actionCreated:'Eklendi', actionUpdated:'Güncellendi', actionDeleted:'Silindi', actionRestored:'Geri Alındı',
    emptyActivityTitle:'Henüz aktivite yok', emptyActivityDesc:'Üye ekleme/düzenleme/silme işlemleri burada listelenecek.',
    switchToDark:'Koyu temaya geç', switchToLight:'Açık temaya geç' },
  en: { appName:'EXC Panel', tagline:'Members · Rank · Power & Camp Level · Event Tracking', refresh:'Refresh', backToSite:'← Back to Site',
    syncConnecting:'Connecting…', syncLive:'Live — everyone sees this', syncError:'Connection error',
    tabMembers:'Members', tabEvents:'Events', tabBoard:'Leaderboard', tabMigration:'Migration',
    addProspect:'+ Add Candidate', prospectAddTitle:'Add Candidate', prospectEditTitle:'Edit Candidate',
    lblColor:'Title', thColor:'Title', thServer:'Server', lblServer:'Current Server', lblProspectNote:'Predicted Destination Guild/Note', lblProspectScore:'Migration Score',
    colorGold:'Empire Challenger', colorPurple:'Frontier Captain', colorBlue:'Discovery Seeker', colorGray:'Voyager', colorUnknown:'Unknown',
    emptyMigrationTitle:'No candidates yet', emptyMigrationDesc:'Use "+ Add Candidate" to add the first migration candidate.',
    toastProspectSaved:'Candidate saved.', toastProspectDeleted:'Candidate deleted.', confirmDeleteProspect:'Are you sure you want to delete this candidate?',
    approveProspectTitle:'Approve as Member', confirmApproveProspect:'Are you sure you want to approve this candidate as a member? You will be taken to the add-member screen to fill in the missing details.',
    leadsHeading:'📥 Migration Applications', thLeadContact:'Contact', thLeadMessage:'Message', thLeadDate:'Date',
    emptyLeadsDesc:'New applications from the main site will appear here.',
    siteLinksDesc:'These links are used on the public landing page (home page).',
    chooserTitle:'What would you like to do?', chooserDataTitle:'Data Panel', chooserDataDesc:'Members, events, migration, and leaderboard.',
    chooserSiteTitle:'Site Editor', chooserSiteDesc:'Home page links and news.', backToChooser:'← Panel Selection', tabSiteLinks:'Site Links',
    lblDiscordUrl:'Discord Invite Link', lblYoutubeUrl:'YouTube Channel Link', lblInstagramUrl:'Instagram Link',
    toastSiteLinksSaved:'Site links saved.',
    tabNews:'News', addNews:'+ Add News', newsAddTitle:'Add News', newsEditTitle:'Edit News',
    lblNewsTitle:'Title', lblNewsBody:'Body', lblNewsDate:'Date', lblNewsImage:'Image',
    newsTitleRequired:'News title is required.', toastNewsSaved:'News saved.', toastNewsDeleted:'News deleted.',
    confirmDeleteNews:'Are you sure you want to delete this news item?',
    emptyNewsTitle:'No news yet', emptyNewsDesc:'Use "+ Add News" to add the first news item.',
    thNewsImage:'Image', thNewsTitle:'Title', thNewsDate:'Date',
    tabVideos:'Videos', addVideo:'+ Add Video', videoAddTitle:'Add Video', videoEditTitle:'Edit Video',
    lblVideoUrl:'YouTube Video Link', lblVideoTitle:'Title (optional)',
    invalidVideoUrl:'Enter a valid YouTube video link.', toastVideoSaved:'Video saved.', toastVideoDeleted:'Video deleted.',
    confirmDeleteVideo:'Are you sure you want to delete this video?',
    emptyVideosTitle:'No videos yet', emptyVideosDesc:'Use "+ Add Video" to add the first video.',
    thVideoThumb:'Image', thVideoTitle:'Title', moveUp:'Move Up', moveDown:'Move Down',
    processLeadTitle:'Process as Candidate', confirmDismissLead:'Are you sure you want to dismiss/delete this request?',
    toastLeadDismissed:'Request deleted.',
    statMigrationTotal:'Total Candidates', migrationStatusCertain:'Certain', migrationStatusWaitlist:'Waitlisted', migrationStatusUncertain:'Uncertain',
    subMigrationActive:'Candidates', subMigrationFailed:'Failed', statMigrationFailedTotal:'Total Failed',
    markFailedTitle:'Mark as Failed (No Slot Available)', confirmMarkFailed:'Mark this candidate as unable to migrate due to insufficient slots? They will move to the "Failed" tab.',
    toastProspectFailed:'Candidate marked as failed.', restoreProspectTitle:'Restore to Candidate List',
    copyToNextPeriodTitle:'Copy to Next Period', confirmCopyProspectToNext:'Copy this candidate to the newest migration period for re-evaluation? They will be added with "Uncertain" status — the "Failed" record in this period will not be deleted.',
    needNewerPeriodForCopy:'Create a newer migration period first before copying.', toastProspectCopiedToNext:'Candidate copied to the new period.',
    emptyMigrationFailedTitle:'No failed candidates yet', emptyMigrationFailedDesc:'Candidates who couldn\'t migrate (e.g. no available slot) are listed here.',
    subMigrationConfirmed:'Confirmed', statMigrationConfirmedTotal:'Total Confirmed',
    markConfirmedTitle:'Mark as Confirmed', confirmMarkConfirmed:'Are you sure you want to mark this candidate as verified and certain to migrate? They will move to the "Confirmed" tab.',
    toastProspectConfirmed:'Candidate marked as confirmed.', unconfirmTitle:'Send Back to Candidate List',
    emptyMigrationConfirmedTitle:'No confirmed candidates yet', emptyMigrationConfirmedDesc:'Use ➡️ on a candidate in the Candidates tab to move them here.',
    subMigrationFinalized:'Completed', statMigrationFinalizedTotal:'Total Completed',
    markFinalizedTitle:'Mark as Completed', confirmMarkFinalized:'Is it certain this candidate is joining EXC specifically? They will move to the "Completed" tab, from which they can be added as a member.',
    toastProspectFinalized:'Candidate marked as completed.', unfinalizeTitle:'Send Back to Confirmed List',
    emptyMigrationFinalizedTitle:'No completed candidates yet', emptyMigrationFinalizedDesc:'Use ➡️ on a candidate in the Confirmed tab to move them here.',
    addPeriod:'+ Add Period', periodAddTitle:'Add Period', periodEditTitle:'Edit Period', lblPeriodLabel:'Period Label',
    lblPeriodStartDate:'Start Date', lblPeriodEndDate:'End Date', periodWord:'Period',
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
    invalidGameId:'ID Number must contain only digits and be exactly 15 digits long.',
    invalidNumberField:'This field must contain only digits.',
    addWeek:'+ Add Week', weekAddTitle:'Add Week', lblWeekLabel:'Week Label', lblWeekDate:'Date', weekNameRequired:'Week label is required.',
    toastWeekSaved:'Week added.', toastWeekDeleted:'Week deleted.', confirmDeleteWeek:'Delete this week and all its data?',
    emptyWeeksTitle:'No weeks yet', emptyWeeksDesc:'Use "+ Add Week" to create the first one.',
    legendJoined:'Joined', legendNotJoined:'Not joined', legendAttended:'Registered & Attended', legendRegNotAttend:'Registered, Absent', legendNoReg:'Not Registered',
    thJoined:'Joined', thPointsCol:'Points', thGroup:'Group', thAttended:'Attended', groupNone:'Not registered', groupA:'Group A', groupB:'Group B',
    entryTitleSVS:'SVS Entry', entryTitleGVG:'GVG Entry', entryTitleSS:'SS Entry', entryTitleKoD:'King of Desert Entry',
    toastEntrySaved:'Saved.', notRegistered:'—',
    aiFillBtn:'🤖 Fill with AI', aiFillWorking:'Reading…', aiFillDone:'Filled {n} members — review and save.', aiFillError:'AI reading failed.', aiFillNoMembers:'No members in the list.',
    boardEmptyTitle:'No data yet', boardEmptyDesc:'The leaderboard fills in as you add members and events.',
    searchMember:'Search member…',
    statusYes:'Joined', statusNo:'Not joined', statusUnknown:'No info', legendUnknown:'No info',
    subOther:'Other', addEvent:'+ Add Event', eventAddTitle:'Add Event', lblEventLabel:'Event Name', eventNameRequired:'Event name is required.',
    toastEventSaved:'Event added.', toastEventDeleted:'Event deleted.', confirmDeleteEvent:'Delete this event and all its data?',
    emptyEventsTitle:'No events yet', emptyEventsDesc:'Use "+ Add Event" to create the first one.',
    entryTitleOther:'Other Event Entry', thStatus:'Status',
    lbRankCol:'Rank', lbMember:'Member', lbGvgTotal:'GVG Total', lbSvsTotal:'SVS Total', lbSvsRatio:'SVS Attendance', lbSsRatio:'SS Attendance', lbKodRatio:'KoD Attendance', lbOtherTotal:'Other Total', lbOtherRatio:'Other Attendance',
    lbParticipation:'Overall Participation (Last 4 Weeks)', belowThresholdTitle:'Participation below 50%',
    participationReportBtn:'📊 Participation Report', participationReportTitle:'Participation Report',
    groupAboveThreshold:'🟢 Above Threshold (≥ 50%)', groupBelowThreshold:'🔴 Below Threshold (< 50%)', groupNoData:'⚪ No Data Yet',
    exemptLabel:'Exempt', powerHistory:'Power History', restoreMember:'Restore to Active',
    exportBackupLabel:'Backup', importBackupLabel:'Import', backupSuccess:'Backup downloaded.',
    importConfirm:'This file will replace the shared data everyone sees. Continue?',
    importSuccess:'Data imported.', importFail:'Could not read the file, it may be corrupted.',
    subActiveMembers:'Active Members', subOldMembers:'Old Members (OLD)',
    thDate:'Date', thPowerVal:'Power', thDelta:'Change', thExcused:'Excused',
    loginTitle:'Admin Login', lblEmail:'Email', lblPassword:'Password', loginBtn:'Sign In', logoutBtn:'Sign Out',
    gateDesc:'Sign in with your account to access this panel.',
    loginFailed:'Sign-in failed.', loginSuccess:'Signed in.', logoutSuccess:'Signed out.',
    emailPasswordRequired:'Username and password are required.', viewOnlyLabel:'View only',
    previousNames:'Previous Usernames',
    userChangedHistoryLabel:'🔄 User Changed — Previous User',
    lblUserChanged:'User Change', userChangedBtn:'🔄 User Changed',
    confirmUserChanged:'Mark this account as taken over by a new user as of today? Event weeks before this date will automatically be treated as exempt for this member. If you continue, the username field will be cleared — don\'t forget to enter the new user\'s name before saving (update power level too if it changed).',
    userChangedStagedLabel:'User changed',
    subMigratedMembers:'Migrated Members', lblMigratedTo:'Migrated To Server',
    lblMigrated:'Migrated to another server', migratedTag:'Migrated', convertedTag:'✓ Became a Member',
    weekReport:'Week Report', zoneGreen:'Green Zone', zoneYellow:'Yellow Zone', zoneRed:'Red Zone',
    weekEditTitle:'Edit Week', eventEditTitle:'Edit Event',
    overallReportBtn:'📊 Overall Report', overallReport:'Overall Report', thWeeks:'Weeks',
    thTeam:'1st Team', lblTeamPower:'1st Team Power', lblTeamElement:'1st Team Element',
    exportBtn:'⬇️ Export', exportSelectAll:'Select All', exportSelectNone:'Deselect All', exportNoSelection:'Please check at least one option.', thListView:'List',
    elementWater:'Water', elementFire:'Fire', elementEarth:'Earth', elementElectric:'Electric', elementNone:'No Element',
    tabActivity:'Activity', thWhen:'Date', thAdmin:'Admin', thAction:'Action', thEntity:'Member',
    actionCreated:'Created', actionUpdated:'Updated', actionDeleted:'Deleted', actionRestored:'Restored',
    emptyActivityTitle:'No activity yet', emptyActivityDesc:'Member add/edit/delete actions will be listed here.',
    switchToDark:'Switch to dark theme', switchToLight:'Switch to light theme' },
  de: { appName:'EXC Panel', tagline:'Mitglieder · Rang · Machtstufe & Basisstufe · Event-Tracking', refresh:'Aktualisieren', backToSite:'← Zur Website',
    syncConnecting:'Verbinde…', syncLive:'Live — alle sehen dies', syncError:'Verbindungsfehler',
    tabMembers:'Mitglieder', tabEvents:'Events', tabBoard:'Bestenliste', tabMigration:'Migration',
    addProspect:'+ Kandidat hinzufügen', prospectAddTitle:'Kandidat hinzufügen', prospectEditTitle:'Kandidat bearbeiten',
    lblColor:'Titel', thColor:'Titel', thServer:'Server', lblServer:'Aktueller Server', lblProspectNote:'Voraussichtliche Zielgilde/Notiz', lblProspectScore:'Migrationspunkte',
    colorGold:'Reichsherausforderer', colorPurple:'Grenzkapitän', colorBlue:'Entdeckungssuchender', colorGray:'Reisender', colorUnknown:'Unbekannt',
    emptyMigrationTitle:'Noch keine Kandidaten', emptyMigrationDesc:'Mit "+ Kandidat hinzufügen" den ersten Migrationskandidaten hinzufügen.',
    toastProspectSaved:'Kandidat gespeichert.', toastProspectDeleted:'Kandidat gelöscht.', confirmDeleteProspect:'Diesen Kandidaten wirklich löschen?',
    approveProspectTitle:'Als Mitglied bestätigen', confirmApproveProspect:'Diesen Kandidaten wirklich als Mitglied bestätigen? Sie werden zum Formular für neue Mitglieder weitergeleitet, um die fehlenden Angaben zu ergänzen.',
    leadsHeading:'📥 Migrationsbewerbungen', thLeadContact:'Kontakt', thLeadMessage:'Nachricht', thLeadDate:'Datum',
    emptyLeadsDesc:'Neue Bewerbungen von der Hauptseite erscheinen hier.',
    siteLinksDesc:'Diese Links werden auf der öffentlichen Startseite verwendet.',
    chooserTitle:'Was möchten Sie tun?', chooserDataTitle:'Datenpanel', chooserDataDesc:'Mitglieder, Events, Migration und Bestenliste.',
    chooserSiteTitle:'Website-Editor', chooserSiteDesc:'Startseiten-Links und Neuigkeiten.', backToChooser:'← Panelauswahl', tabSiteLinks:'Website-Links',
    lblDiscordUrl:'Discord-Einladungslink', lblYoutubeUrl:'YouTube-Kanal-Link', lblInstagramUrl:'Instagram-Link',
    toastSiteLinksSaved:'Website-Links gespeichert.',
    tabNews:'Neuigkeiten', addNews:'+ Neuigkeit hinzufügen', newsAddTitle:'Neuigkeit hinzufügen', newsEditTitle:'Neuigkeit bearbeiten',
    lblNewsTitle:'Titel', lblNewsBody:'Inhalt', lblNewsDate:'Datum', lblNewsImage:'Bild',
    newsTitleRequired:'Ein Titel ist erforderlich.', toastNewsSaved:'Neuigkeit gespeichert.', toastNewsDeleted:'Neuigkeit gelöscht.',
    confirmDeleteNews:'Diese Neuigkeit wirklich löschen?',
    emptyNewsTitle:'Noch keine Neuigkeiten', emptyNewsDesc:'Mit "+ Neuigkeit hinzufügen" die erste anlegen.',
    thNewsImage:'Bild', thNewsTitle:'Titel', thNewsDate:'Datum',
    tabVideos:'Videos', addVideo:'+ Video hinzufügen', videoAddTitle:'Video hinzufügen', videoEditTitle:'Video bearbeiten',
    lblVideoUrl:'YouTube-Videolink', lblVideoTitle:'Titel (optional)',
    invalidVideoUrl:'Geben Sie einen gültigen YouTube-Videolink ein.', toastVideoSaved:'Video gespeichert.', toastVideoDeleted:'Video gelöscht.',
    confirmDeleteVideo:'Dieses Video wirklich löschen?',
    emptyVideosTitle:'Noch keine Videos', emptyVideosDesc:'Mit "+ Video hinzufügen" das erste hinzufügen.',
    thVideoThumb:'Bild', thVideoTitle:'Titel', moveUp:'Nach oben', moveDown:'Nach unten',
    processLeadTitle:'Als Kandidat bearbeiten', confirmDismissLead:'Diese Anfrage wirklich ablehnen/löschen?',
    toastLeadDismissed:'Anfrage gelöscht.',
    statMigrationTotal:'Kandidaten gesamt', migrationStatusCertain:'Sicher', migrationStatusWaitlist:'Warteliste', migrationStatusUncertain:'Unsicher',
    subMigrationActive:'Kandidaten', subMigrationFailed:'Gescheitert', statMigrationFailedTotal:'Gescheitert gesamt',
    markFailedTitle:'Als gescheitert markieren (kein Platz frei)', confirmMarkFailed:'Diesen Kandidaten als "konnte wegen Platzmangel nicht migrieren" markieren? Er wird in den Tab "Gescheitert" verschoben.',
    toastProspectFailed:'Kandidat als gescheitert markiert.', restoreProspectTitle:'Zurück zur Kandidatenliste',
    copyToNextPeriodTitle:'In nächsten Zeitraum kopieren', confirmCopyProspectToNext:'Diesen Kandidaten zur erneuten Bewertung in den neuesten Migrationszeitraum kopieren? Er wird mit Status "Unsicher" hinzugefügt — der "Gescheitert"-Eintrag in diesem Zeitraum wird nicht gelöscht.',
    needNewerPeriodForCopy:'Erstellen Sie zuerst einen neueren Migrationszeitraum, um zu kopieren.', toastProspectCopiedToNext:'Kandidat in den neuen Zeitraum kopiert.',
    emptyMigrationFailedTitle:'Noch keine gescheiterten Kandidaten', emptyMigrationFailedDesc:'Kandidaten, die nicht migrieren konnten (z. B. kein freier Platz), werden hier aufgelistet.',
    subMigrationConfirmed:'Bestätigt', statMigrationConfirmedTotal:'Bestätigt gesamt',
    markConfirmedTitle:'Als Bestätigt Markieren', confirmMarkConfirmed:'Diesen Kandidaten wirklich als bestätigt und sicher migrierend markieren? Er wird in den Tab "Bestätigt" verschoben.',
    toastProspectConfirmed:'Kandidat als bestätigt markiert.', unconfirmTitle:'Zurück zur Kandidatenliste (Bestätigung aufheben)',
    emptyMigrationConfirmedTitle:'Noch keine bestätigten Kandidaten', emptyMigrationConfirmedDesc:'Verwende ➡️ bei einem Kandidaten im Tab "Kandidaten", um ihn hierher zu verschieben.',
    subMigrationFinalized:'Abgeschlossen', statMigrationFinalizedTotal:'Abgeschlossen gesamt',
    markFinalizedTitle:'Als Abgeschlossen Markieren', confirmMarkFinalized:'Steht sicher fest, dass dieser Kandidat speziell EXC beitritt? Er wird in den Tab "Abgeschlossen" verschoben, von wo aus er als Mitglied hinzugefügt werden kann.',
    toastProspectFinalized:'Kandidat als abgeschlossen markiert.', unfinalizeTitle:'Zurück zur Bestätigt-Liste',
    emptyMigrationFinalizedTitle:'Noch keine abgeschlossenen Kandidaten', emptyMigrationFinalizedDesc:'Verwende ➡️ bei einem Kandidaten im Tab "Bestätigt", um ihn hierher zu verschieben.',
    addPeriod:'+ Zeitraum hinzufügen', periodAddTitle:'Zeitraum hinzufügen', periodEditTitle:'Zeitraum bearbeiten', lblPeriodLabel:'Zeitraumbezeichnung',
    lblPeriodStartDate:'Startdatum', lblPeriodEndDate:'Enddatum', periodWord:'Zeitraum',
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
    invalidGameId:'Die ID-Nummer darf nur aus Ziffern bestehen und muss genau 15 Ziffern lang sein.',
    invalidNumberField:'Dieses Feld darf nur Ziffern enthalten.',
    addWeek:'+ Woche hinzufügen', weekAddTitle:'Woche hinzufügen', lblWeekLabel:'Wochenbezeichnung', lblWeekDate:'Datum', weekNameRequired:'Wochenbezeichnung erforderlich.',
    toastWeekSaved:'Woche hinzugefügt.', toastWeekDeleted:'Woche gelöscht.', confirmDeleteWeek:'Diese Woche und alle Daten löschen?',
    emptyWeeksTitle:'Noch keine Woche', emptyWeeksDesc:'Mit "+ Woche hinzufügen" die erste anlegen.',
    legendJoined:'Teilgenommen', legendNotJoined:'Nicht teilgenommen', legendAttended:'Angemeldet & teilgenommen', legendRegNotAttend:'Angemeldet, gefehlt', legendNoReg:'Nicht angemeldet',
    thJoined:'Teilgenommen', thPointsCol:'Punkte', thGroup:'Gruppe', thAttended:'Teilgenommen', groupNone:'Nicht angemeldet', groupA:'Gruppe A', groupB:'Gruppe B',
    entryTitleSVS:'SVS-Eintrag', entryTitleGVG:'GVG-Eintrag', entryTitleSS:'SS-Eintrag', entryTitleKoD:'King of Desert-Eintrag',
    toastEntrySaved:'Gespeichert.', notRegistered:'—',
    aiFillBtn:'🤖 Mit KI ausfüllen', aiFillWorking:'Wird gelesen…', aiFillDone:'{n} Mitglieder ausgefüllt — bitte prüfen und speichern.', aiFillError:'KI-Auslesen fehlgeschlagen.', aiFillNoMembers:'Keine Mitglieder in der Liste.',
    boardEmptyTitle:'Noch keine Daten', boardEmptyDesc:'Die Bestenliste füllt sich mit Mitgliedern und Events.',
    searchMember:'Mitglied suchen…',
    statusYes:'Teilgenommen', statusNo:'Nicht teilgenommen', statusUnknown:'Keine Info', legendUnknown:'Keine Info',
    subOther:'Sonstige', addEvent:'+ Event hinzufügen', eventAddTitle:'Event hinzufügen', lblEventLabel:'Eventname', eventNameRequired:'Eventname erforderlich.',
    toastEventSaved:'Event hinzugefügt.', toastEventDeleted:'Event gelöscht.', confirmDeleteEvent:'Dieses Event und alle Daten löschen?',
    emptyEventsTitle:'Noch keine Events', emptyEventsDesc:'Mit "+ Event hinzufügen" das erste anlegen.',
    entryTitleOther:'Sonstiger Event-Eintrag', thStatus:'Status',
    lbRankCol:'Platz', lbMember:'Mitglied', lbGvgTotal:'GVG Gesamt', lbSvsTotal:'SVS Gesamt', lbSvsRatio:'SVS Teilnahme', lbSsRatio:'SS Teilnahme', lbKodRatio:'KoD Teilnahme', lbOtherTotal:'Sonstige Gesamt', lbOtherRatio:'Sonstige Teilnahme',
    lbParticipation:'Gesamtteilnahme (Letzte 4 Wochen)', belowThresholdTitle:'Teilnahme unter 50%',
    participationReportBtn:'📊 Teilnahmebericht', participationReportTitle:'Teilnahmebericht',
    groupAboveThreshold:'🟢 Über dem Schwellenwert (≥ 50%)', groupBelowThreshold:'🔴 Unter dem Schwellenwert (< 50%)', groupNoData:'⚪ Noch keine Daten',
    exemptLabel:'Befreit', powerHistory:'Machtverlauf', restoreMember:'Wieder aktivieren',
    exportBackupLabel:'Sichern', importBackupLabel:'Importieren', backupSuccess:'Backup heruntergeladen.',
    importConfirm:'Diese Datei ersetzt die von allen gesehenen gemeinsamen Daten. Fortfahren?',
    importSuccess:'Daten importiert.', importFail:'Datei konnte nicht gelesen werden oder ist beschädigt.',
    subActiveMembers:'Aktive Mitglieder', subOldMembers:'Alte Mitglieder (OLD)',
    thDate:'Datum', thPowerVal:'Macht', thDelta:'Änderung', thExcused:'Entschuldigt',
    loginTitle:'Admin-Anmeldung', lblEmail:'E-Mail', lblPassword:'Passwort', loginBtn:'Anmelden', logoutBtn:'Abmelden',
    gateDesc:'Melden Sie sich mit Ihrem Konto an, um auf dieses Panel zuzugreifen.',
    loginFailed:'Anmeldung fehlgeschlagen.', loginSuccess:'Angemeldet.', logoutSuccess:'Abgemeldet.',
    emailPasswordRequired:'Benutzername und Passwort sind erforderlich.', viewOnlyLabel:'Nur Ansicht',
    previousNames:'Frühere Benutzernamen',
    userChangedHistoryLabel:'🔄 Nutzer gewechselt — Vorheriger Nutzer',
    lblUserChanged:'Nutzerwechsel', userChangedBtn:'🔄 Nutzer gewechselt',
    confirmUserChanged:'Soll dieses Konto ab heute als von einem neuen Nutzer übernommen markiert werden? Event-Wochen vor diesem Datum gelten für dieses Mitglied automatisch als befreit. Wenn Sie fortfahren, wird das Benutzername-Feld geleert — vergessen Sie nicht, den Namen des neuen Nutzers einzugeben, bevor Sie speichern (aktualisieren Sie bei Bedarf auch die Machtstufe).',
    userChangedStagedLabel:'Nutzerwechsel',
    subMigratedMembers:'Abgewanderte Mitglieder', lblMigratedTo:'Migriert zu Server',
    lblMigrated:'Zu einem anderen Server abgewandert', migratedTag:'Abgewandert', convertedTag:'✓ Mitglied geworden',
    weekReport:'Wochenbericht', zoneGreen:'Grüne Zone', zoneYellow:'Gelbe Zone', zoneRed:'Rote Zone',
    weekEditTitle:'Woche bearbeiten', eventEditTitle:'Event bearbeiten',
    overallReportBtn:'📊 Gesamtbericht', overallReport:'Gesamtbericht', thWeeks:'Wochen',
    thTeam:'1. Team', lblTeamPower:'1. Team-Stärke', lblTeamElement:'1. Team-Element',
    exportBtn:'⬇️ Exportieren', exportSelectAll:'Alle auswählen', exportSelectNone:'Alle abwählen', exportNoSelection:'Bitte mindestens eine Option auswählen.', thListView:'Liste',
    elementWater:'Wasser', elementFire:'Feuer', elementEarth:'Erde', elementElectric:'Elektro', elementNone:'Kein Element',
    tabActivity:'Aktivität', thWhen:'Datum', thAdmin:'Admin', thAction:'Aktion', thEntity:'Mitglied',
    actionCreated:'Erstellt', actionUpdated:'Aktualisiert', actionDeleted:'Gelöscht', actionRestored:'Wiederhergestellt',
    emptyActivityTitle:'Noch keine Aktivität', emptyActivityDesc:'Mitglied hinzufügen/bearbeiten/löschen wird hier aufgelistet.',
    switchToDark:'Zum dunklen Thema wechseln', switchToLight:'Zum hellen Thema wechseln' },
  es: { appName:'Panel EXC', tagline:'Miembros · Rango · Poder y Nivel de Campamento · Seguimiento de Eventos', refresh:'Actualizar', backToSite:'← Volver al Sitio',
    syncConnecting:'Conectando…', syncLive:'En vivo — todos lo ven', syncError:'Error de conexión',
    tabMembers:'Miembros', tabEvents:'Eventos', tabBoard:'Clasificación', tabMigration:'Migración',
    addProspect:'+ Añadir candidato', prospectAddTitle:'Añadir candidato', prospectEditTitle:'Editar candidato',
    lblColor:'Título', thColor:'Título', thServer:'Servidor', lblServer:'Servidor actual', lblProspectNote:'Gremio de Destino Previsto/Nota', lblProspectScore:'Puntuación de Migración',
    colorGold:'Retador del Imperio', colorPurple:'Capitán de Frontera', colorBlue:'Buscador de Descubrimientos', colorGray:'Viajero', colorUnknown:'Desconocido',
    emptyMigrationTitle:'Aún no hay candidatos', emptyMigrationDesc:'Usa "+ Añadir candidato" para agregar el primer candidato de migración.',
    toastProspectSaved:'Candidato guardado.', toastProspectDeleted:'Candidato eliminado.', confirmDeleteProspect:'¿Seguro que quieres eliminar a este candidato?',
    approveProspectTitle:'Aprobar como miembro', confirmApproveProspect:'¿Seguro que quieres aprobar a este candidato como miembro? Se te llevará a la pantalla de añadir miembro para completar los datos que faltan.',
    leadsHeading:'📥 Solicitudes de Migración', thLeadContact:'Contacto', thLeadMessage:'Mensaje', thLeadDate:'Fecha',
    emptyLeadsDesc:'Las nuevas solicitudes del sitio principal aparecerán aquí.',
    siteLinksDesc:'Estos enlaces se usan en la página principal pública.',
    chooserTitle:'¿Qué te gustaría hacer?', chooserDataTitle:'Panel de Datos', chooserDataDesc:'Miembros, eventos, migración y clasificación.',
    chooserSiteTitle:'Editor del Sitio', chooserSiteDesc:'Enlaces y noticias de la página principal.', backToChooser:'← Selección de Panel', tabSiteLinks:'Enlaces del Sitio',
    lblDiscordUrl:'Enlace de invitación a Discord', lblYoutubeUrl:'Enlace del canal de YouTube', lblInstagramUrl:'Enlace de Instagram',
    toastSiteLinksSaved:'Enlaces del sitio guardados.',
    tabNews:'Noticias', addNews:'+ Añadir noticia', newsAddTitle:'Añadir noticia', newsEditTitle:'Editar noticia',
    lblNewsTitle:'Título', lblNewsBody:'Contenido', lblNewsDate:'Fecha', lblNewsImage:'Imagen',
    newsTitleRequired:'El título de la noticia es obligatorio.', toastNewsSaved:'Noticia guardada.', toastNewsDeleted:'Noticia eliminada.',
    confirmDeleteNews:'¿Seguro que quieres eliminar esta noticia?',
    emptyNewsTitle:'Aún no hay noticias', emptyNewsDesc:'Usa "+ Añadir noticia" para agregar la primera.',
    thNewsImage:'Imagen', thNewsTitle:'Título', thNewsDate:'Fecha',
    tabVideos:'Videos', addVideo:'+ Añadir video', videoAddTitle:'Añadir video', videoEditTitle:'Editar video',
    lblVideoUrl:'Enlace de video de YouTube', lblVideoTitle:'Título (opcional)',
    invalidVideoUrl:'Introduce un enlace de video de YouTube válido.', toastVideoSaved:'Video guardado.', toastVideoDeleted:'Video eliminado.',
    confirmDeleteVideo:'¿Seguro que quieres eliminar este video?',
    emptyVideosTitle:'Aún no hay videos', emptyVideosDesc:'Usa "+ Añadir video" para agregar el primero.',
    thVideoThumb:'Imagen', thVideoTitle:'Título', moveUp:'Subir', moveDown:'Bajar',
    processLeadTitle:'Procesar como Candidato', confirmDismissLead:'¿Seguro que quieres rechazar/eliminar esta solicitud?',
    toastLeadDismissed:'Solicitud eliminada.',
    statMigrationTotal:'Total de candidatos', migrationStatusCertain:'Seguro', migrationStatusWaitlist:'Lista de Espera', migrationStatusUncertain:'Incierto',
    subMigrationActive:'Candidatos', subMigrationFailed:'Fallidos', statMigrationFailedTotal:'Total Fallidos',
    markFailedTitle:'Marcar como Fallido (Sin Cupo)', confirmMarkFailed:'¿Marcar a este candidato como no pudo migrar por falta de cupo? Se moverá a la pestaña "Fallidos".',
    toastProspectFailed:'Candidato marcado como fallido.', restoreProspectTitle:'Restaurar a la Lista de Candidatos',
    copyToNextPeriodTitle:'Copiar al Siguiente Periodo', confirmCopyProspectToNext:'¿Copiar este candidato al periodo de migración más reciente para reevaluarlo? Se añadirá con estado "Incierto" — el registro "Fallido" de este periodo no se eliminará.',
    needNewerPeriodForCopy:'Crea primero un periodo de migración más reciente para poder copiar.', toastProspectCopiedToNext:'Candidato copiado al nuevo periodo.',
    emptyMigrationFailedTitle:'Aún no hay candidatos fallidos', emptyMigrationFailedDesc:'Los candidatos que no pudieron migrar (p. ej. sin cupo disponible) se listan aquí.',
    subMigrationConfirmed:'Confirmados', statMigrationConfirmedTotal:'Total Confirmados',
    markConfirmedTitle:'Marcar como Confirmado', confirmMarkConfirmed:'¿Seguro que quieres marcar este candidato como verificado y con migración segura? Se moverá a la pestaña "Confirmados".',
    toastProspectConfirmed:'Candidato marcado como confirmado.', unconfirmTitle:'Devolver a la Lista de Candidatos',
    emptyMigrationConfirmedTitle:'Aún no hay candidatos confirmados', emptyMigrationConfirmedDesc:'Usa ➡️ en un candidato de la pestaña Candidatos para moverlo aquí.',
    subMigrationFinalized:'Completados', statMigrationFinalizedTotal:'Total Completados',
    markFinalizedTitle:'Marcar como Completado', confirmMarkFinalized:'¿Es seguro que este candidato se unirá específicamente a EXC? Se moverá a la pestaña "Completados", desde donde se puede añadir como miembro.',
    toastProspectFinalized:'Candidato marcado como completado.', unfinalizeTitle:'Devolver a la Lista de Confirmados',
    emptyMigrationFinalizedTitle:'Aún no hay candidatos completados', emptyMigrationFinalizedDesc:'Usa ➡️ en un candidato de la pestaña Confirmados para moverlo aquí.',
    addPeriod:'+ Añadir periodo', periodAddTitle:'Añadir periodo', periodEditTitle:'Editar periodo', lblPeriodLabel:'Etiqueta del periodo',
    lblPeriodStartDate:'Fecha de Inicio', lblPeriodEndDate:'Fecha de Fin', periodWord:'Periodo',
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
    invalidGameId:'El número de ID debe contener solo dígitos y tener exactamente 15 dígitos.',
    invalidNumberField:'Este campo debe contener solo dígitos.',
    addWeek:'+ Añadir semana', weekAddTitle:'Añadir semana', lblWeekLabel:'Etiqueta de semana', lblWeekDate:'Fecha', weekNameRequired:'La etiqueta de semana es obligatoria.',
    toastWeekSaved:'Semana añadida.', toastWeekDeleted:'Semana eliminada.', confirmDeleteWeek:'¿Eliminar esta semana y todos sus datos?',
    emptyWeeksTitle:'Aún no hay semanas', emptyWeeksDesc:'Usa "+ Añadir semana" para crear la primera.',
    legendJoined:'Participó', legendNotJoined:'No participó', legendAttended:'Inscrito y participó', legendRegNotAttend:'Inscrito, ausente', legendNoReg:'No inscrito',
    thJoined:'Participó', thPointsCol:'Puntos', thGroup:'Grupo', thAttended:'Participó', groupNone:'No inscrito', groupA:'Grupo A', groupB:'Grupo B',
    entryTitleSVS:'Registro SVS', entryTitleGVG:'Registro GVG', entryTitleSS:'Registro SS', entryTitleKoD:'Registro King of Desert',
    toastEntrySaved:'Guardado.', notRegistered:'—',
    aiFillBtn:'🤖 Rellenar con IA', aiFillWorking:'Leyendo…', aiFillDone:'Se completaron {n} miembros — revisa y guarda.', aiFillError:'Error al leer con IA.', aiFillNoMembers:'No hay miembros en la lista.',
    boardEmptyTitle:'Aún no hay datos', boardEmptyDesc:'La clasificación se completa a medida que agregas miembros y eventos.',
    searchMember:'Buscar miembro…',
    statusYes:'Participó', statusNo:'No participó', statusUnknown:'Sin información', legendUnknown:'Sin información',
    subOther:'Otro', addEvent:'+ Añadir evento', eventAddTitle:'Añadir evento', lblEventLabel:'Nombre del evento', eventNameRequired:'El nombre del evento es obligatorio.',
    toastEventSaved:'Evento añadido.', toastEventDeleted:'Evento eliminado.', confirmDeleteEvent:'¿Eliminar este evento y todos sus datos?',
    emptyEventsTitle:'Aún no hay eventos', emptyEventsDesc:'Usa "+ Añadir evento" para crear el primero.',
    entryTitleOther:'Registro de otro evento', thStatus:'Estado',
    lbRankCol:'Puesto', lbMember:'Miembro', lbGvgTotal:'Total GVG', lbSvsTotal:'Total SVS', lbSvsRatio:'Asistencia SVS', lbSsRatio:'Asistencia SS', lbKodRatio:'Asistencia KoD', lbOtherTotal:'Total Otro', lbOtherRatio:'Asistencia Otro',
    lbParticipation:'Participación General (Últimas 4 Semanas)', belowThresholdTitle:'Participación por debajo del 50%',
    participationReportBtn:'📊 Informe de Participación', participationReportTitle:'Informe de Participación',
    groupAboveThreshold:'🟢 Por Encima del Umbral (≥ 50%)', groupBelowThreshold:'🔴 Por Debajo del Umbral (< 50%)', groupNoData:'⚪ Aún Sin Datos',
    exemptLabel:'Exento', powerHistory:'Historial de poder', restoreMember:'Reactivar miembro',
    exportBackupLabel:'Respaldar', importBackupLabel:'Importar', backupSuccess:'Copia de seguridad descargada.',
    importConfirm:'Este archivo reemplazará los datos compartidos que todos ven. ¿Continuar?',
    importSuccess:'Datos importados.', importFail:'No se pudo leer el archivo o está dañado.',
    subActiveMembers:'Miembros activos', subOldMembers:'Miembros antiguos (OLD)',
    thDate:'Fecha', thPowerVal:'Poder', thDelta:'Cambio', thExcused:'Justificado',
    loginTitle:'Inicio de sesión de administrador', lblEmail:'Correo electrónico', lblPassword:'Contraseña', loginBtn:'Iniciar sesión', logoutBtn:'Cerrar sesión',
    gateDesc:'Inicie sesión con su cuenta para acceder a este panel.',
    loginFailed:'Error al iniciar sesión.', loginSuccess:'Sesión iniciada.', logoutSuccess:'Sesión cerrada.',
    emailPasswordRequired:'Nombre de usuario y contraseña son obligatorios.', viewOnlyLabel:'Solo lectura',
    previousNames:'Nombres de usuario anteriores',
    userChangedHistoryLabel:'🔄 Usuario Cambiado — Usuario Anterior',
    lblUserChanged:'Cambio de Usuario', userChangedBtn:'🔄 Usuario Cambiado',
    confirmUserChanged:'¿Marcar esta cuenta como asumida por un nuevo usuario a partir de hoy? Las semanas de eventos anteriores a esta fecha se considerarán automáticamente exentas para este miembro. Si continúa, el campo de nombre de usuario se borrará — no olvide ingresar el nombre del nuevo usuario antes de guardar (actualice también el nivel de poder si cambió).',
    userChangedStagedLabel:'Cambio de usuario',
    subMigratedMembers:'Miembros Migrados', lblMigratedTo:'Migró al Servidor',
    lblMigrated:'Migró a otro servidor', migratedTag:'Migró', convertedTag:'✓ Se hizo Miembro',
    weekReport:'Informe Semanal', zoneGreen:'Zona Verde', zoneYellow:'Zona Amarilla', zoneRed:'Zona Roja',
    weekEditTitle:'Editar semana', eventEditTitle:'Editar evento',
    overallReportBtn:'📊 Informe General', overallReport:'Informe General', thWeeks:'Semanas',
    thTeam:'1er Equipo', lblTeamPower:'Poder del 1er Equipo', lblTeamElement:'Elemento del 1er Equipo',
    exportBtn:'⬇️ Exportar', exportSelectAll:'Seleccionar Todo', exportSelectNone:'Deseleccionar Todo', exportNoSelection:'Por favor selecciona al menos una opción.', thListView:'Lista',
    elementWater:'Agua', elementFire:'Fuego', elementEarth:'Tierra', elementElectric:'Eléctrico', elementNone:'Sin Elemento',
    tabActivity:'Actividad', thWhen:'Fecha', thAdmin:'Admin', thAction:'Acción', thEntity:'Miembro',
    actionCreated:'Creado', actionUpdated:'Actualizado', actionDeleted:'Eliminado', actionRestored:'Restaurado',
    emptyActivityTitle:'Aún no hay actividad', emptyActivityDesc:'Las acciones de agregar/editar/eliminar miembros se listarán aquí.',
    switchToDark:'Cambiar a tema oscuro', switchToLight:'Cambiar a tema claro' },
  fr: { appName:'Panneau EXC', tagline:'Membres · Rang · Puissance et Niveau de Camp · Suivi des Événements', refresh:'Actualiser', backToSite:'← Retour au Site',
    syncConnecting:'Connexion…', syncLive:'En direct — visible par tous', syncError:'Erreur de connexion',
    tabMembers:'Membres', tabEvents:'Événements', tabBoard:'Classement', tabMigration:'Migration',
    addProspect:'+ Ajouter un candidat', prospectAddTitle:'Ajouter un candidat', prospectEditTitle:'Modifier le candidat',
    lblColor:'Titre', thColor:'Titre', thServer:'Serveur', lblServer:'Serveur actuel', lblProspectNote:'Guilde de Destination Prévue/Note', lblProspectScore:'Score de Migration',
    colorGold:"Challenger de l'Empire", colorPurple:'Capitaine de Frontière', colorBlue:'Chercheur de Découvertes', colorGray:'Voyageur', colorUnknown:'Inconnu',
    emptyMigrationTitle:'Aucun candidat pour le moment', emptyMigrationDesc:'Utilisez "+ Ajouter un candidat" pour ajouter le premier candidat à la migration.',
    toastProspectSaved:'Candidat enregistré.', toastProspectDeleted:'Candidat supprimé.', confirmDeleteProspect:'Voulez-vous vraiment supprimer ce candidat ?',
    approveProspectTitle:'Approuver comme membre', confirmApproveProspect:'Voulez-vous vraiment approuver ce candidat comme membre ? Vous serez redirigé vers l\'écran d\'ajout de membre pour compléter les informations manquantes.',
    leadsHeading:'📥 Candidatures de Migration', thLeadContact:'Contact', thLeadMessage:'Message', thLeadDate:'Date',
    emptyLeadsDesc:'Les nouvelles candidatures du site principal apparaîtront ici.',
    siteLinksDesc:'Ces liens sont utilisés sur la page d\'accueil publique.',
    chooserTitle:'Que souhaitez-vous faire ?', chooserDataTitle:'Panneau de Données', chooserDataDesc:'Membres, événements, migration et classement.',
    chooserSiteTitle:'Éditeur du Site', chooserSiteDesc:"Liens et actualités de la page d'accueil.", backToChooser:'← Sélection du Panneau', tabSiteLinks:'Liens du Site',
    lblDiscordUrl:"Lien d'invitation Discord", lblYoutubeUrl:'Lien de la chaîne YouTube', lblInstagramUrl:'Lien Instagram',
    toastSiteLinksSaved:'Liens du site enregistrés.',
    tabNews:'Actualités', addNews:'+ Ajouter une actualité', newsAddTitle:'Ajouter une actualité', newsEditTitle:"Modifier l'actualité",
    lblNewsTitle:'Titre', lblNewsBody:'Contenu', lblNewsDate:'Date', lblNewsImage:'Image',
    newsTitleRequired:"Le titre de l'actualité est requis.", toastNewsSaved:'Actualité enregistrée.', toastNewsDeleted:'Actualité supprimée.',
    confirmDeleteNews:'Voulez-vous vraiment supprimer cette actualité ?',
    emptyNewsTitle:"Aucune actualité pour le moment", emptyNewsDesc:'Utilisez "+ Ajouter une actualité" pour ajouter la première.',
    thNewsImage:'Image', thNewsTitle:'Titre', thNewsDate:'Date',
    tabVideos:'Vidéos', addVideo:'+ Ajouter une vidéo', videoAddTitle:'Ajouter une vidéo', videoEditTitle:'Modifier la vidéo',
    lblVideoUrl:'Lien de la vidéo YouTube', lblVideoTitle:'Titre (facultatif)',
    invalidVideoUrl:'Entrez un lien de vidéo YouTube valide.', toastVideoSaved:'Vidéo enregistrée.', toastVideoDeleted:'Vidéo supprimée.',
    confirmDeleteVideo:'Voulez-vous vraiment supprimer cette vidéo ?',
    emptyVideosTitle:'Aucune vidéo pour le moment', emptyVideosDesc:'Utilisez "+ Ajouter une vidéo" pour ajouter la première.',
    thVideoThumb:'Image', thVideoTitle:'Titre', moveUp:'Monter', moveDown:'Descendre',
    processLeadTitle:'Traiter comme Candidat', confirmDismissLead:'Voulez-vous vraiment rejeter/supprimer cette demande ?',
    toastLeadDismissed:'Demande supprimée.',
    statMigrationTotal:'Total des candidats', migrationStatusCertain:'Certain', migrationStatusWaitlist:"Liste d'Attente", migrationStatusUncertain:'Incertain',
    subMigrationActive:'Candidats', subMigrationFailed:'Échoués', statMigrationFailedTotal:'Total Échoués',
    markFailedTitle:"Marquer comme échoué (pas de place disponible)", confirmMarkFailed:"Marquer ce candidat comme n'ayant pas pu migrer faute de place ? Il sera déplacé vers l'onglet « Échoués ».",
    toastProspectFailed:'Candidat marqué comme échoué.', restoreProspectTitle:'Restaurer dans la liste des candidats',
    copyToNextPeriodTitle:'Copier vers la période suivante', confirmCopyProspectToNext:"Copier ce candidat vers la période de migration la plus récente pour réévaluation ? Il sera ajouté avec le statut « Incertain » — l'enregistrement « Échoué » de cette période ne sera pas supprimé.",
    needNewerPeriodForCopy:"Créez d'abord une période de migration plus récente pour pouvoir copier.", toastProspectCopiedToNext:'Candidat copié vers la nouvelle période.',
    emptyMigrationFailedTitle:"Aucun candidat échoué pour l'instant", emptyMigrationFailedDesc:"Les candidats n'ayant pas pu migrer (ex. pas de place disponible) sont listés ici.",
    subMigrationConfirmed:'Confirmés', statMigrationConfirmedTotal:'Total Confirmés',
    markConfirmedTitle:'Marquer comme Confirmé', confirmMarkConfirmed:"Voulez-vous vraiment marquer ce candidat comme vérifié et certain de migrer ? Il sera déplacé vers l'onglet « Confirmés ».",
    toastProspectConfirmed:'Candidat marqué comme confirmé.', unconfirmTitle:'Renvoyer à la liste des candidats',
    emptyMigrationConfirmedTitle:"Aucun candidat confirmé pour l'instant", emptyMigrationConfirmedDesc:"Utilisez ➡️ sur un candidat dans l'onglet Candidats pour le déplacer ici.",
    subMigrationFinalized:'Terminé', statMigrationFinalizedTotal:'Total Terminé',
    markFinalizedTitle:'Marquer comme Terminé', confirmMarkFinalized:"Est-il certain que ce candidat rejoint spécifiquement EXC ? Il sera déplacé vers l'onglet « Terminé », d'où il pourra être ajouté comme membre.",
    toastProspectFinalized:'Candidat marqué comme terminé.', unfinalizeTitle:'Renvoyer à la liste des confirmés',
    emptyMigrationFinalizedTitle:"Aucun candidat terminé pour l'instant", emptyMigrationFinalizedDesc:"Utilisez ➡️ sur un candidat dans l'onglet Confirmés pour le déplacer ici.",
    addPeriod:'+ Ajouter une période', periodAddTitle:'Ajouter une période', periodEditTitle:'Modifier la période', lblPeriodLabel:'Libellé de la période',
    lblPeriodStartDate:'Date de Début', lblPeriodEndDate:'Date de Fin', periodWord:'Période',
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
    invalidGameId:"Le numéro d'ID doit contenir uniquement des chiffres et comporter exactement 15 chiffres.",
    invalidNumberField:'Ce champ ne doit contenir que des chiffres.',
    addWeek:'+ Ajouter une semaine', weekAddTitle:'Ajouter une semaine', lblWeekLabel:'Libellé de la semaine', lblWeekDate:'Date', weekNameRequired:'Le libellé de la semaine est requis.',
    toastWeekSaved:'Semaine ajoutée.', toastWeekDeleted:'Semaine supprimée.', confirmDeleteWeek:'Supprimer cette semaine et toutes ses données ?',
    emptyWeeksTitle:'Aucune semaine pour le moment', emptyWeeksDesc:'Utilisez "+ Ajouter une semaine" pour créer la première.',
    legendJoined:'A participé', legendNotJoined:"N'a pas participé", legendAttended:'Inscrit et présent', legendRegNotAttend:'Inscrit, absent', legendNoReg:'Non inscrit',
    thJoined:'A participé', thPointsCol:'Points', thGroup:'Groupe', thAttended:'Présent', groupNone:'Non inscrit', groupA:'Groupe A', groupB:'Groupe B',
    entryTitleSVS:'Saisie SVS', entryTitleGVG:'Saisie GVG', entryTitleSS:'Saisie SS', entryTitleKoD:'Saisie King of Desert',
    toastEntrySaved:'Enregistré.', notRegistered:'—',
    aiFillBtn:'🤖 Remplir avec l\'IA', aiFillWorking:'Lecture en cours…', aiFillDone:'{n} membres remplis — vérifiez et enregistrez.', aiFillError:'Échec de la lecture par l\'IA.', aiFillNoMembers:'Aucun membre dans la liste.',
    boardEmptyTitle:'Aucune donnée pour le moment', boardEmptyDesc:'Le classement se remplit au fur et à mesure que vous ajoutez membres et événements.',
    searchMember:'Rechercher un membre…',
    statusYes:'A participé', statusNo:"N'a pas participé", statusUnknown:'Pas d\'info', legendUnknown:'Pas d\'info',
    subOther:'Autre', addEvent:'+ Ajouter un événement', eventAddTitle:'Ajouter un événement', lblEventLabel:"Nom de l'événement", eventNameRequired:"Le nom de l'événement est requis.",
    toastEventSaved:'Événement ajouté.', toastEventDeleted:'Événement supprimé.', confirmDeleteEvent:'Supprimer cet événement et toutes ses données ?',
    emptyEventsTitle:'Aucun événement pour le moment', emptyEventsDesc:'Utilisez "+ Ajouter un événement" pour créer le premier.',
    entryTitleOther:'Saisie autre événement', thStatus:'Statut',
    lbRankCol:'Rang', lbMember:'Membre', lbGvgTotal:'Total GVG', lbSvsTotal:'Total SVS', lbSvsRatio:'Participation SVS', lbSsRatio:'Participation SS', lbKodRatio:'Participation KoD', lbOtherTotal:'Total Autre', lbOtherRatio:'Participation Autre',
    lbParticipation:'Participation Globale (4 Dernières Semaines)', belowThresholdTitle:'Participation inférieure à 50%',
    participationReportBtn:'📊 Rapport de Participation', participationReportTitle:'Rapport de Participation',
    groupAboveThreshold:'🟢 Au-dessus du Seuil (≥ 50%)', groupBelowThreshold:'🔴 En Dessous du Seuil (< 50%)', groupNoData:'⚪ Pas Encore de Données',
    exemptLabel:'Exempté', powerHistory:'Historique de puissance', restoreMember:'Réactiver le membre',
    exportBackupLabel:'Sauvegarder', importBackupLabel:'Importer', backupSuccess:'Sauvegarde téléchargée.',
    importConfirm:'Ce fichier remplacera les données partagées visibles par tous. Continuer ?',
    importSuccess:'Données importées.', importFail:'Impossible de lire le fichier, il est peut-être corrompu.',
    subActiveMembers:'Membres actifs', subOldMembers:'Anciens membres (OLD)',
    thDate:'Date', thPowerVal:'Puissance', thDelta:'Évolution', thExcused:'Excusé',
    loginTitle:'Connexion administrateur', lblEmail:'E-mail', lblPassword:'Mot de passe', loginBtn:'Se connecter', logoutBtn:'Se déconnecter',
    gateDesc:'Connectez-vous avec votre compte pour accéder à ce panneau.',
    loginFailed:'Échec de la connexion.', loginSuccess:'Connecté.', logoutSuccess:'Déconnecté.',
    emailPasswordRequired:"Le nom d'utilisateur et le mot de passe sont requis.", viewOnlyLabel:'Lecture seule',
    previousNames:"Anciens noms d'utilisateur",
    userChangedHistoryLabel:"🔄 Utilisateur Changé — Utilisateur Précédent",
    lblUserChanged:"Changement d'utilisateur", userChangedBtn:'🔄 Utilisateur Changé',
    confirmUserChanged:"Marquer ce compte comme repris par un nouvel utilisateur à partir d'aujourd'hui ? Les semaines d'événements antérieures à cette date seront automatiquement considérées comme exemptées pour ce membre. Si vous continuez, le champ du nom d'utilisateur sera vidé — n'oubliez pas de saisir le nom du nouvel utilisateur avant d'enregistrer (mettez aussi à jour le niveau de puissance si besoin).",
    userChangedStagedLabel:"Changement d'utilisateur",
    subMigratedMembers:'Membres Migrés', lblMigratedTo:'Migré vers le Serveur',
    lblMigrated:'A migré vers un autre serveur', migratedTag:'A migré', convertedTag:'✓ Devenu Membre',
    weekReport:'Rapport Hebdomadaire', zoneGreen:'Zone Verte', zoneYellow:'Zone Jaune', zoneRed:'Zone Rouge',
    weekEditTitle:'Modifier la semaine', eventEditTitle:"Modifier l'événement",
    overallReportBtn:'📊 Rapport Global', overallReport:'Rapport Global', thWeeks:'Semaines',
    thTeam:'1ère Équipe', lblTeamPower:'Puissance de la 1ère Équipe', lblTeamElement:'Élément de la 1ère Équipe',
    exportBtn:'⬇️ Exporter', exportSelectAll:'Tout Sélectionner', exportSelectNone:'Tout Désélectionner', exportNoSelection:'Veuillez cocher au moins une option.', thListView:'Liste',
    elementWater:'Eau', elementFire:'Feu', elementEarth:'Terre', elementElectric:'Électrique', elementNone:'Aucun Élément',
    tabActivity:'Activité', thWhen:'Date', thAdmin:'Admin', thAction:'Action', thEntity:'Membre',
    actionCreated:'Créé', actionUpdated:'Mis à jour', actionDeleted:'Supprimé', actionRestored:'Restauré',
    emptyActivityTitle:'Aucune activité pour le moment', emptyActivityDesc:'Les ajouts/modifications/suppressions de membres seront listés ici.',
    switchToDark:'Passer au thème sombre', switchToLight:'Passer au thème clair' },
  vi: { appName:'EXC Panel', tagline:'Thành viên · Cấp bậc · Sức mạnh & Cấp độ Trại · Theo dõi Sự kiện', refresh:'Làm mới', backToSite:'← Về Trang chủ',
    syncConnecting:'Đang kết nối…', syncLive:'Trực tiếp — mọi người đều thấy điều này', syncError:'Lỗi kết nối',
    tabMembers:'Thành viên', tabEvents:'Sự kiện', tabBoard:'Bảng xếp hạng', tabMigration:'Di chuyển',
    addProspect:'+ Thêm Ứng viên', prospectAddTitle:'Thêm Ứng viên', prospectEditTitle:'Sửa Ứng viên',
    lblColor:'Danh hiệu', thColor:'Danh hiệu', thServer:'Máy chủ', lblServer:'Máy chủ Hiện tại', lblProspectNote:'Bang hội Dự kiến Đến/Ghi chú', lblProspectScore:'Điểm Di chuyển',
    colorGold:'Người Thách thức Đế chế', colorPurple:'Đội trưởng Biên cương', colorBlue:'Người Tìm kiếm Khám phá', colorGray:'Người Lữ hành', colorUnknown:'Không rõ',
    emptyMigrationTitle:'Chưa có ứng viên nào', emptyMigrationDesc:'Dùng "+ Thêm Ứng viên" để thêm ứng viên di chuyển đầu tiên.',
    toastProspectSaved:'Đã lưu ứng viên.', toastProspectDeleted:'Đã xóa ứng viên.', confirmDeleteProspect:'Bạn có chắc muốn xóa ứng viên này không?',
    approveProspectTitle:'Duyệt thành Thành viên', confirmApproveProspect:'Bạn có chắc muốn duyệt ứng viên này thành thành viên không? Bạn sẽ được chuyển đến màn hình thêm thành viên để điền các thông tin còn thiếu.',
    leadsHeading:'📥 Đơn Đăng ký Di chuyển', thLeadContact:'Liên hệ', thLeadMessage:'Tin nhắn', thLeadDate:'Ngày',
    emptyLeadsDesc:'Các đơn đăng ký mới từ trang chủ sẽ xuất hiện ở đây.',
    siteLinksDesc:'Các liên kết này được sử dụng trên trang chủ công khai.',
    chooserTitle:'Bạn muốn làm gì?', chooserDataTitle:'Bảng Dữ liệu', chooserDataDesc:'Thành viên, sự kiện, di chuyển và bảng xếp hạng.',
    chooserSiteTitle:'Trình chỉnh sửa Trang', chooserSiteDesc:'Liên kết trang chủ và tin tức.', backToChooser:'← Chọn Bảng điều khiển', tabSiteLinks:'Liên kết Trang',
    lblDiscordUrl:'Liên kết Mời Discord', lblYoutubeUrl:'Liên kết Kênh YouTube', lblInstagramUrl:'Liên kết Instagram',
    toastSiteLinksSaved:'Đã lưu liên kết trang.',
    tabNews:'Tin tức', addNews:'+ Thêm Tin tức', newsAddTitle:'Thêm Tin tức', newsEditTitle:'Sửa Tin tức',
    lblNewsTitle:'Tiêu đề', lblNewsBody:'Nội dung', lblNewsDate:'Ngày', lblNewsImage:'Hình ảnh',
    newsTitleRequired:'Tiêu đề tin tức là bắt buộc.', toastNewsSaved:'Đã lưu tin tức.', toastNewsDeleted:'Đã xóa tin tức.',
    confirmDeleteNews:'Bạn có chắc muốn xóa tin tức này không?',
    emptyNewsTitle:'Chưa có tin tức nào', emptyNewsDesc:'Dùng "+ Thêm Tin tức" để thêm tin đầu tiên.',
    thNewsImage:'Hình ảnh', thNewsTitle:'Tiêu đề', thNewsDate:'Ngày',
    tabVideos:'Video', addVideo:'+ Thêm Video', videoAddTitle:'Thêm Video', videoEditTitle:'Sửa Video',
    lblVideoUrl:'Liên kết Video YouTube', lblVideoTitle:'Tiêu đề (tùy chọn)',
    invalidVideoUrl:'Nhập một liên kết video YouTube hợp lệ.', toastVideoSaved:'Đã lưu video.', toastVideoDeleted:'Đã xóa video.',
    confirmDeleteVideo:'Bạn có chắc muốn xóa video này không?',
    emptyVideosTitle:'Chưa có video nào', emptyVideosDesc:'Dùng "+ Thêm Video" để thêm video đầu tiên.',
    thVideoThumb:'Hình ảnh', thVideoTitle:'Tiêu đề', moveUp:'Di chuyển Lên', moveDown:'Di chuyển Xuống',
    processLeadTitle:'Xử lý thành Ứng viên', confirmDismissLead:'Bạn có chắc muốn từ chối/xóa yêu cầu này không?',
    toastLeadDismissed:'Đã xóa yêu cầu.',
    statMigrationTotal:'Tổng Ứng viên', migrationStatusCertain:'Chắc chắn', migrationStatusWaitlist:'Danh sách Chờ', migrationStatusUncertain:'Không chắc chắn',
    subMigrationActive:'Ứng viên', subMigrationFailed:'Thất bại', statMigrationFailedTotal:'Tổng Thất bại',
    markFailedTitle:'Đánh dấu Thất bại (Hết Chỗ)', confirmMarkFailed:'Đánh dấu ứng viên này là không thể di chuyển do hết chỗ? Họ sẽ được chuyển sang tab "Thất bại".',
    toastProspectFailed:'Đã đánh dấu ứng viên là thất bại.', restoreProspectTitle:'Khôi phục về Danh sách Ứng viên',
    copyToNextPeriodTitle:'Sao chép sang Đợt tiếp theo', confirmCopyProspectToNext:'Sao chép ứng viên này sang đợt di chuyển mới nhất để đánh giá lại? Họ sẽ được thêm với trạng thái "Chưa chắc chắn" — bản ghi "Thất bại" trong đợt này sẽ không bị xóa.',
    needNewerPeriodForCopy:'Vui lòng tạo một đợt di chuyển mới hơn trước khi sao chép.', toastProspectCopiedToNext:'Đã sao chép ứng viên sang đợt mới.',
    emptyMigrationFailedTitle:'Chưa có ứng viên thất bại nào', emptyMigrationFailedDesc:'Các ứng viên không thể di chuyển (vd. hết chỗ) được liệt kê ở đây.',
    subMigrationConfirmed:'Đã Xác nhận', statMigrationConfirmedTotal:'Tổng Đã Xác nhận',
    markConfirmedTitle:'Đánh dấu Đã Xác nhận', confirmMarkConfirmed:'Bạn có chắc muốn đánh dấu ứng viên này là đã xác minh và chắc chắn sẽ di chuyển không? Họ sẽ được chuyển sang tab "Đã Xác nhận".',
    toastProspectConfirmed:'Đã đánh dấu ứng viên là đã xác nhận.', unconfirmTitle:'Trả về Danh sách Ứng viên',
    emptyMigrationConfirmedTitle:'Chưa có ứng viên nào được xác nhận', emptyMigrationConfirmedDesc:'Dùng ➡️ trên một ứng viên ở tab Ứng viên để chuyển họ vào đây.',
    subMigrationFinalized:'Hoàn thành', statMigrationFinalizedTotal:'Tổng Hoàn thành',
    markFinalizedTitle:'Đánh dấu Hoàn thành', confirmMarkFinalized:'Bạn có chắc chắn ứng viên này sẽ gia nhập EXC không? Họ sẽ được chuyển sang tab "Hoàn thành", từ đó có thể được thêm làm thành viên.',
    toastProspectFinalized:'Đã đánh dấu ứng viên là hoàn thành.', unfinalizeTitle:'Trả về Danh sách Đã Xác nhận',
    emptyMigrationFinalizedTitle:'Chưa có ứng viên hoàn thành nào', emptyMigrationFinalizedDesc:'Dùng ➡️ trên một ứng viên ở tab Đã Xác nhận để chuyển họ vào đây.',
    addPeriod:'+ Thêm Đợt', periodAddTitle:'Thêm Đợt', periodEditTitle:'Sửa Đợt', lblPeriodLabel:'Tên Đợt',
    lblPeriodStartDate:'Ngày Bắt đầu', lblPeriodEndDate:'Ngày Kết thúc', periodWord:'Đợt',
    periodNameRequired:'Tên đợt là bắt buộc.', confirmDeletePeriod:'Bạn có chắc muốn xóa đợt này không? Tất cả ứng viên trong đó cũng sẽ bị xóa.',
    toastPeriodSaved:'Đã lưu đợt.', toastPeriodDeleted:'Đã xóa đợt.',
    emptyPeriodsTitle:'Chưa có đợt nào', emptyPeriodsDesc:'Dùng "+ Thêm Đợt" để tạo đợt di chuyển đầu tiên.',
    needPeriodFirst:'Hãy tạo một đợt di chuyển trước.',
    statTotal:'Tổng Thành viên', filterAll:'Tất cả', addMember:'+ Thêm Thành viên', searchPh:'Tìm theo tên hoặc ID…',
    thRank:'Cấp bậc', thUsername:'Tên người dùng', thId:'ID', thPower:'Sức mạnh', thCamp:'Cấp độ Trại', thTotalPoints:'Tổng Điểm',
    emptyMembersTitle:'Chưa có thành viên nào', emptyMembersDesc:'Dùng "+ Thêm Thành viên" để thêm người đầu tiên.',
    memberAddTitle:'Thêm Thành viên', memberEditTitle:'Sửa Thành viên',
    lblUsername:'Tên người dùng', lblGameId:'Số ID', lblRank:'Cấp bậc', lblPower:'Sức mạnh', lblCamp:'Cấp độ Trại', lblJoinedAt:'Ngày Gia nhập', lblOld:'Thành viên cũ (OLD)',
    cancel:'Hủy', save:'Lưu', close:'Đóng',
    toastMemberSaved:'Đã lưu thành viên.', toastMemberDeleted:'Đã xóa thành viên.', confirmDeleteMember:'Bạn có chắc muốn xóa thành viên này không?',
    nameIdRequired:'Tên người dùng và ID là bắt buộc.',
    invalidGameId:'Số ID chỉ được chứa chữ số và phải đúng 15 chữ số.',
    invalidNumberField:'Trường này chỉ được chứa chữ số.',
    addWeek:'+ Thêm Tuần', weekAddTitle:'Thêm Tuần', lblWeekLabel:'Tên Tuần', lblWeekDate:'Ngày', weekNameRequired:'Tên tuần là bắt buộc.',
    toastWeekSaved:'Đã thêm tuần.', toastWeekDeleted:'Đã xóa tuần.', confirmDeleteWeek:'Xóa tuần này và toàn bộ dữ liệu của nó?',
    emptyWeeksTitle:'Chưa có tuần nào', emptyWeeksDesc:'Dùng "+ Thêm Tuần" để tạo tuần đầu tiên.',
    legendJoined:'Đã tham gia', legendNotJoined:'Chưa tham gia', legendAttended:'Đã đăng ký & Tham dự', legendRegNotAttend:'Đã đăng ký, Vắng mặt', legendNoReg:'Chưa đăng ký',
    thJoined:'Đã tham gia', thPointsCol:'Điểm', thGroup:'Nhóm', thAttended:'Tham dự', groupNone:'Chưa đăng ký', groupA:'Nhóm A', groupB:'Nhóm B',
    entryTitleSVS:'Nhập liệu SVS', entryTitleGVG:'Nhập liệu GVG', entryTitleSS:'Nhập liệu SS', entryTitleKoD:'Nhập liệu King of Desert',
    toastEntrySaved:'Đã lưu.', notRegistered:'—',
    aiFillBtn:'🤖 Điền bằng AI', aiFillWorking:'Đang đọc…', aiFillDone:'Đã điền {n} thành viên — kiểm tra rồi lưu.', aiFillError:'AI đọc thất bại.', aiFillNoMembers:'Không có thành viên trong danh sách.',
    boardEmptyTitle:'Chưa có dữ liệu', boardEmptyDesc:'Bảng xếp hạng sẽ được điền khi bạn thêm thành viên và sự kiện.',
    searchMember:'Tìm thành viên…',
    statusYes:'Đã tham gia', statusNo:'Chưa tham gia', statusUnknown:'Không có thông tin', legendUnknown:'Không có thông tin',
    subOther:'Khác', addEvent:'+ Thêm Sự kiện', eventAddTitle:'Thêm Sự kiện', lblEventLabel:'Tên Sự kiện', eventNameRequired:'Tên sự kiện là bắt buộc.',
    toastEventSaved:'Đã thêm sự kiện.', toastEventDeleted:'Đã xóa sự kiện.', confirmDeleteEvent:'Xóa sự kiện này và toàn bộ dữ liệu của nó?',
    emptyEventsTitle:'Chưa có sự kiện nào', emptyEventsDesc:'Dùng "+ Thêm Sự kiện" để tạo sự kiện đầu tiên.',
    entryTitleOther:'Nhập liệu Sự kiện Khác', thStatus:'Trạng thái',
    lbRankCol:'Cấp bậc', lbMember:'Thành viên', lbGvgTotal:'Tổng GVG', lbSvsTotal:'Tổng SVS', lbSvsRatio:'Tỷ lệ Tham dự SVS', lbSsRatio:'Tỷ lệ Tham dự SS', lbKodRatio:'Tỷ lệ Tham dự KoD', lbOtherTotal:'Tổng Khác', lbOtherRatio:'Tỷ lệ Tham dự Khác',
    lbParticipation:'Tỷ lệ Tham gia Chung (4 Tuần gần nhất)', belowThresholdTitle:'Tỷ lệ tham gia dưới 50%',
    participationReportBtn:'📊 Báo cáo Tham gia', participationReportTitle:'Báo cáo Tham gia',
    groupAboveThreshold:'🟢 Trên Ngưỡng (≥ 50%)', groupBelowThreshold:'🔴 Dưới Ngưỡng (< 50%)', groupNoData:'⚪ Chưa có Dữ liệu',
    exemptLabel:'Miễn trừ', powerHistory:'Lịch sử Sức mạnh', restoreMember:'Khôi phục về Hoạt động',
    exportBackupLabel:'Sao lưu', importBackupLabel:'Nhập', backupSuccess:'Đã tải bản sao lưu.',
    importConfirm:'Tệp này sẽ thay thế dữ liệu chung mà mọi người thấy. Tiếp tục?',
    importSuccess:'Đã nhập dữ liệu.', importFail:'Không thể đọc tệp, có thể tệp bị hỏng.',
    subActiveMembers:'Thành viên Hoạt động', subOldMembers:'Thành viên Cũ (OLD)',
    thDate:'Ngày', thPowerVal:'Sức mạnh', thDelta:'Thay đổi', thExcused:'Được miễn',
    loginTitle:'Đăng nhập Quản trị', lblEmail:'Email', lblPassword:'Mật khẩu', loginBtn:'Đăng nhập', logoutBtn:'Đăng xuất',
    gateDesc:'Đăng nhập bằng tài khoản của bạn để truy cập bảng điều khiển này.',
    loginFailed:'Đăng nhập thất bại.', loginSuccess:'Đã đăng nhập.', logoutSuccess:'Đã đăng xuất.',
    emailPasswordRequired:'Tên người dùng và mật khẩu là bắt buộc.', viewOnlyLabel:'Chỉ xem',
    previousNames:'Tên người dùng Trước đây',
    userChangedHistoryLabel:'🔄 Đã Đổi Người dùng — Người dùng Trước',
    lblUserChanged:'Đổi Người dùng', userChangedBtn:'🔄 Đã Đổi Người dùng',
    confirmUserChanged:'Đánh dấu tài khoản này đã được một người dùng mới tiếp quản kể từ hôm nay? Các tuần sự kiện trước ngày này sẽ tự động được coi là miễn trừ đối với thành viên này. Nếu bạn tiếp tục, trường tên người dùng sẽ bị xóa — đừng quên nhập tên người dùng mới trước khi lưu (cập nhật cả sức mạnh nếu có thay đổi).',
    userChangedStagedLabel:'Đã đổi người dùng',
    subMigratedMembers:'Thành viên Đã Di chuyển', lblMigratedTo:'Di chuyển Đến Máy chủ',
    lblMigrated:'Đã di chuyển sang máy chủ khác', migratedTag:'Đã di chuyển', convertedTag:'✓ Đã trở thành Thành viên',
    weekReport:'Báo cáo Tuần', zoneGreen:'Vùng Xanh', zoneYellow:'Vùng Vàng', zoneRed:'Vùng Đỏ',
    weekEditTitle:'Sửa Tuần', eventEditTitle:'Sửa Sự kiện',
    overallReportBtn:'📊 Báo cáo Tổng quan', overallReport:'Báo cáo Tổng quan', thWeeks:'Các Tuần',
    thTeam:'Đội 1', lblTeamPower:'Sức mạnh Đội 1', lblTeamElement:'Nguyên tố Đội 1',
    exportBtn:'⬇️ Xuất Excel', exportSelectAll:'Chọn Tất cả', exportSelectNone:'Bỏ chọn Tất cả', exportNoSelection:'Vui lòng chọn ít nhất một mục.', thListView:'Danh sách',
    elementWater:'Thủy', elementFire:'Hỏa', elementEarth:'Thổ', elementElectric:'Điện', elementNone:'Không Nguyên tố',
    tabActivity:'Hoạt động', thWhen:'Ngày', thAdmin:'Quản trị viên', thAction:'Hành động', thEntity:'Thành viên',
    actionCreated:'Đã tạo', actionUpdated:'Đã cập nhật', actionDeleted:'Đã xóa', actionRestored:'Đã khôi phục',
    emptyActivityTitle:'Chưa có hoạt động nào', emptyActivityDesc:'Các hành động thêm/sửa/xóa thành viên sẽ được liệt kê ở đây.',
    switchToDark:'Chuyển sang giao diện tối', switchToLight:'Chuyển sang giao diện sáng' }
};

/**
 * Aktif dile göre çeviri döndürür; anahtar bulunamazsa Türkçe'ye, o da
 * yoksa anahtarın kendisine düşer.
 */
export function t(key) {
  return (DICT[state.currentLang] && DICT[state.currentLang][key]) || DICT[DEFAULT_LANGUAGE][key] || key;
}

/**
 * Bir göç dönemi etiketini ("Dönem 4", "Period 4" vb.) o dönem HANGİ dilde
 * oluşturulmuş olursa olsun, geçerli dile çevirir. Depoda sadece tek bir
 * (oluşturulduğu andaki dildeki) metin tutulur — bu yüzden "periodWord"in
 * TÜM dillerdeki karşılıklarını dener, "<kelime> <sayı>" kalıbına uyan
 * etiketleri o anki dile çevirip gösterir. Admin'in serbestçe yazdığı,
 * bu kalıba uymayan özel etiketler DOKUNULMADAN olduğu gibi gösterilir.
 */
export function migrationPeriodDisplayLabel(label) {
  if (!label) return label;
  for (const lang of LANGUAGES) {
    const word = DICT[lang].periodWord;
    if (label.startsWith(word + " ")) {
      const rest = label.slice(word.length + 1).trim();
      if (/^\d+$/.test(rest)) return t("periodWord") + " " + rest;
    }
  }
  return label;
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
  document.getElementById("t_thTeam").textContent = t("thTeam");
  document.getElementById("t_emptyMembersTitle").textContent = t("emptyMembersTitle");
  document.getElementById("t_emptyMembersDesc").textContent = t("emptyMembersDesc");
  document.getElementById("t_lblUsername").textContent = t("lblUsername");
  document.getElementById("t_lblGameId").textContent = t("lblGameId");
  document.getElementById("t_lblRank").textContent = t("lblRank");
  document.getElementById("t_lblPower").textContent = t("lblPower");
  document.getElementById("t_lblCamp").textContent = t("lblCamp");
  document.getElementById("t_lblTeamPower").textContent = t("lblTeamPower");
  document.getElementById("t_lblTeamElement").textContent = t("lblTeamElement");
  document.getElementById("t_lblJoinedAt").textContent = t("lblJoinedAt");
  document.getElementById("t_thJoinedAt").textContent = t("lblJoinedAt");
  document.getElementById("t_lblOld").textContent = t("lblOld");
  document.getElementById("t_cancel1").textContent = t("cancel");
  document.getElementById("t_save1").textContent = t("save");
  document.getElementById("t_cancel2").textContent = t("cancel");
  document.getElementById("t_save2").textContent = t("save");
  document.getElementById("t_close1").textContent = t("close");
  document.getElementById("t_save3").textContent = t("save");
  document.getElementById("t_aiFillBtn").textContent = t("aiFillBtn");
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
  document.getElementById("boardSearch").placeholder = t("searchMember");
  document.getElementById("t_participationReportBtn").textContent = t("participationReportBtn");
  document.getElementById("t_participationReportTitle").textContent = t("participationReportTitle");
  document.getElementById("t_close8").textContent = t("close");
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
  document.getElementById("t_tabActivity").textContent = t("tabActivity");
  document.getElementById("t_thWhen").textContent = t("thWhen");
  document.getElementById("t_thAdmin").textContent = t("thAdmin");
  document.getElementById("t_thAction").textContent = t("thAction");
  document.getElementById("t_thEntity").textContent = t("thEntity");
  document.getElementById("t_emptyActivityTitle").textContent = t("emptyActivityTitle");
  document.getElementById("t_emptyActivityDesc").textContent = t("emptyActivityDesc");
  document.getElementById("t_addProspect").textContent = t("addProspect");
  document.getElementById("t_addPeriod").textContent = t("addPeriod");
  document.getElementById("t_lblPeriodLabel").textContent = t("lblPeriodLabel");
  document.getElementById("t_lblPeriodDate").textContent = t("lblPeriodStartDate");
  document.getElementById("t_lblPeriodEndDate").textContent = t("lblPeriodEndDate");
  document.getElementById("t_cancel6").textContent = t("cancel");
  document.getElementById("t_save6").textContent = t("save");
  document.getElementById("t_emptyPeriodsTitle").textContent = t("emptyPeriodsTitle");
  document.getElementById("t_emptyPeriodsDesc").textContent = t("emptyPeriodsDesc");
  document.getElementById("t_thColor").textContent = t("thColor");
  document.getElementById("t_thUsername2").textContent = t("thUsername");
  document.getElementById("t_thId2").textContent = t("thId");
  document.getElementById("t_thPower2").textContent = t("thPower");
  document.getElementById("t_thCamp2").textContent = t("thCamp");
  document.getElementById("t_thTeam2").textContent = t("thTeam");
  document.getElementById("t_thServer").textContent = t("thServer");
  document.getElementById("t_emptyMigrationTitle").textContent = t("emptyMigrationTitle");
  document.getElementById("t_emptyMigrationDesc").textContent = t("emptyMigrationDesc");
  document.getElementById("t_subMigrationActive").textContent = t("subMigrationActive");
  document.getElementById("t_subMigrationConfirmed").textContent = t("subMigrationConfirmed");
  document.getElementById("t_subMigrationFinalized").textContent = t("subMigrationFinalized");
  document.getElementById("t_subMigrationFailed").textContent = t("subMigrationFailed");
  document.getElementById("t_lblProspectName").textContent = t("lblUsername");
  document.getElementById("t_lblProspectId").textContent = t("lblGameId");
  document.getElementById("t_lblProspectPower").textContent = t("lblPower");
  document.getElementById("t_lblServer").textContent = t("lblServer");
  document.getElementById("t_lblColor").textContent = t("lblColor");
  document.getElementById("t_lblProspectCamp").textContent = t("lblCamp");
  document.getElementById("t_lblProspectTeamPower").textContent = t("lblTeamPower");
  document.getElementById("t_lblProspectTeamElement").textContent = t("lblTeamElement");
  document.getElementById("t_lblMigrationStatus").textContent = t("thStatus");
  document.getElementById("t_thMigrationStatus").textContent = t("thStatus");
  document.getElementById("t_leadsHeading").textContent = t("leadsHeading");
  document.getElementById("t_thLeadName2").textContent = t("thUsername");
  document.getElementById("t_thLeadContact").textContent = t("thLeadContact");
  document.getElementById("t_thLeadId2").textContent = t("thId");
  document.getElementById("t_emptyLeadsDesc").textContent = t("emptyLeadsDesc");
  document.getElementById("t_siteLinksDesc").textContent = t("siteLinksDesc");
  document.getElementById("t_lblDiscordUrl").textContent = t("lblDiscordUrl");
  document.getElementById("t_lblYoutubeUrl").textContent = t("lblYoutubeUrl");
  document.getElementById("t_lblInstagramUrl").textContent = t("lblInstagramUrl");
  document.getElementById("t_save7").textContent = t("save");
  document.getElementById("t_tabSiteLinks").textContent = t("tabSiteLinks");
  document.getElementById("t_chooserTitle").textContent = t("chooserTitle");
  document.getElementById("t_chooserDataTitle").textContent = t("chooserDataTitle");
  document.getElementById("t_chooserDataDesc").textContent = t("chooserDataDesc");
  document.getElementById("t_chooserSiteTitle").textContent = t("chooserSiteTitle");
  document.getElementById("t_chooserSiteDesc").textContent = t("chooserSiteDesc");
  document.getElementById("t_backToChooser").textContent = t("backToChooser");
  document.getElementById("t_tabNews").textContent = t("tabNews");
  document.getElementById("t_addNews").textContent = t("addNews");
  document.getElementById("t_thNewsImage").textContent = t("thNewsImage");
  document.getElementById("t_thNewsTitle").textContent = t("thNewsTitle");
  document.getElementById("t_thNewsDate").textContent = t("thNewsDate");
  document.getElementById("t_emptyNewsTitle").textContent = t("emptyNewsTitle");
  document.getElementById("t_emptyNewsDesc").textContent = t("emptyNewsDesc");
  document.getElementById("t_lblNewsTitle").textContent = t("lblNewsTitle");
  document.getElementById("t_lblNewsBody").textContent = t("lblNewsBody");
  document.getElementById("t_lblNewsDate").textContent = t("lblNewsDate");
  document.getElementById("t_lblNewsImage").textContent = t("lblNewsImage");
  document.getElementById("t_cancel8").textContent = t("cancel");
  document.getElementById("t_save8").textContent = t("save");
  document.getElementById("t_tabVideos").textContent = t("tabVideos");
  document.getElementById("t_addVideo").textContent = t("addVideo");
  document.getElementById("t_thVideoThumb").textContent = t("thVideoThumb");
  document.getElementById("t_thVideoTitle").textContent = t("thVideoTitle");
  document.getElementById("t_emptyVideosTitle").textContent = t("emptyVideosTitle");
  document.getElementById("t_emptyVideosDesc").textContent = t("emptyVideosDesc");
  document.getElementById("t_lblVideoUrl").textContent = t("lblVideoUrl");
  document.getElementById("t_lblVideoTitle").textContent = t("lblVideoTitle");
  document.getElementById("t_cancel9").textContent = t("cancel");
  document.getElementById("t_save9").textContent = t("save");
  document.getElementById("t_thLeadServer2").textContent = t("thServer");
  document.getElementById("t_thLeadPower2").textContent = t("thPower");
  document.getElementById("t_thLeadMessage").textContent = t("thLeadMessage");
  document.getElementById("t_thLeadDate").textContent = t("thLeadDate");
  document.getElementById("t_lblProspectNote").textContent = t("lblProspectNote");
  document.getElementById("t_lblProspectScore").textContent = t("lblProspectScore");
  document.getElementById("t_statusCertainOpt").textContent = t("migrationStatusCertain");
  document.getElementById("t_statusWaitlistOpt").textContent = t("migrationStatusWaitlist");
  document.getElementById("t_statusUncertainOpt").textContent = t("migrationStatusUncertain");
  document.getElementById("t_cancel5").textContent = t("cancel");
  document.getElementById("t_save5").textContent = t("save");
  document.getElementById("t_exportSelectAll").textContent = t("exportSelectAll");
  document.getElementById("t_exportSelectNone").textContent = t("exportSelectNone");
  document.getElementById("t_cancelExport").textContent = t("cancel");
  document.getElementById("t_confirmExport").textContent = t("exportBtn");
  document.getElementById("t_exportMembers").textContent = t("exportBtn");
  document.getElementById("t_exportMigration").textContent = t("exportBtn");
  document.getElementById("t_export_svs").textContent = t("exportBtn");
  document.getElementById("t_export_gvg").textContent = t("exportBtn");
  document.getElementById("t_export_ss").textContent = t("exportBtn");
  document.getElementById("t_export_kod").textContent = t("exportBtn");
  document.getElementById("t_export_other").textContent = t("exportBtn");
  updateAdminUI();
  buildCampOptions();
  buildMigrationColorOptions();
  buildProspectCampOptions();
  buildProspectElementPicker();
  document.title = t("appName");
  updateThemeToggleUI();
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

/**
 * Tarayıcıda kayıtlı tema tercihini `state.currentTheme`'e yükler
 * (varsayılan "light"). Sayfa gövdesindeki `light-theme` sınıfı zaten
 * panel/index.html'in en başındaki satır-içi script tarafından JS
 * modülleri yüklenmeden ÖNCE uygulanmış olur — burada sadece uygulama
 * durumunu (state) o kararla eşitliyoruz, sınıfı tekrar değiştirmiyoruz.
 */
export function initThemeFromStorage() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    state.currentTheme = saved === "dark" ? "dark" : "light";
  } catch (error) {
    state.currentTheme = "light";
  }
}

/** Açık/koyu temayı değiştirir, body sınıfını günceller ve tercihi kaydeder. */
export function setTheme(theme) {
  state.currentTheme = theme === "dark" ? "dark" : "light";
  document.body.classList.toggle("light-theme", state.currentTheme === "light");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, state.currentTheme);
  } catch (error) {
    // Depolama kullanılamıyorsa tercih sadece bu oturum için geçerli olur.
  }
  updateThemeToggleUI();
}

export function toggleTheme() {
  setTheme(state.currentTheme === "dark" ? "light" : "dark");
}

/** Tema düğmesindeki ikonu ve başlığı geçerli temaya göre günceller. */
export function updateThemeToggleUI() {
  const sun = document.getElementById("themeIconSun");
  const moon = document.getElementById("themeIconMoon");
  const btn = document.getElementById("themeToggle");
  if (!sun || !moon) return;
  const isLight = state.currentTheme === "light";
  sun.style.display = isLight ? "" : "none";
  moon.style.display = isLight ? "none" : "";
  if (btn) btn.title = t(isLight ? "switchToDark" : "switchToLight");
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

/** Göç adayının "bize kesin mi belirsiz mi geleceği, ya da yedek mi" durumunun hücre rengi sınıfını döndürür. */
export function migrationStatusClass(status) {
  if (status === "certain") return "pill-blue";
  if (status === "waitlist") return "pill-gray";
  return "pill-yellow";
}

/** Göç adayının durumunun çevrilmiş etiketini döndürür. */
export function migrationStatusLabel(status) {
  if (status === "certain") return t("migrationStatusCertain");
  if (status === "waitlist") return t("migrationStatusWaitlist");
  return t("migrationStatusUncertain");
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

/**
 * Bir metnin sadece rakamlardan oluşup oluşmadığını kontrol eder (harf, boşluk,
 * eksi işareti, ondalık nokta, "e" bilimsel gösterimi — hiçbiri kabul edilmez).
 * `exactLength` verilirse basamak sayısı da tam olarak eşleşmelidir (üye ID'si
 * için 15 basamak kuralı gibi). Boş metin için false döner — çağıran taraf,
 * alanın opsiyonel olduğu durumlarda boşluğu ayrıca kontrol etmelidir.
 */
export function isDigitsOnly(value, exactLength) {
  if (!/^\d+$/.test(value)) return false;
  if (exactLength && value.length !== exactLength) return false;
  return true;
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
// Bir hafta için hiç kayıt girilmemişse ve üye o hafta henüz katılmamışsa
// (bkz. isExempt) muaf sayılır (diğer etkinlik türleriyle aynı kural).
// Katılmış olup kayıt girilmemişse 0 puan girilmiş gibi işlem görür.
export function gvgCellInfo(store, member, week) {
  const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
  if (!entry && isExempt(member, week)) return { cls: "pill-gray", text: t("exemptLabel") };
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

/**
 * SS türü bir üyenin katılım oranını (x/y) hesaplar. Sadece gerçekten bir
 * gruba ATANMIŞ (kayıt yapılmış) haftalar orana dahil edilir — "Kayıt Yok"
 * haftaları (hiç gruba atanmamış) ne payda ne pay olarak sayılır, çünkü o
 * hafta üye için hiç bir katılım fırsatı/kararı yoktu.
 */
export function ratioSs(store, member) {
  const registeredWeeks = store.weeks.filter((week) => {
    const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    return !!(entry && entry.group);
  });
  const denominator = registeredWeeks.length;
  const numerator = registeredWeeks.filter((week) => {
    const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    return !!entry.attended;
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

/** Göç adayı formundaki "Kamp Seviyesi" açılır listesini doldurur — üye formundakinden ayrı çünkü aday için bu bilgi henüz bilinmeyebilir (boş seçenek içerir). */
export function buildProspectCampOptions() {
  const select = document.getElementById("pCamp");
  const currentValue = select.value;
  select.innerHTML = `<option value="">—</option>` + CAMP_LEVELS.map((level) => `<option value="${level}">${level}</option>`).join("");
  if (currentValue) select.value = currentValue;
}

export { campLevelSortValue };

// =====================================================================
// 1. TAKIM ELEMENTİ ROZETLERİ
// =====================================================================
// Palmon Survival'daki dört elementin (su/ateş/toprak/elektrik) oyun içi
// ikonlarını birebir KOPYALAMAYAN, aynı fikri (damla/alev/dağ/şimşek + renk)
// taşıyan özgün SVG rozetler. Hem üye tablosunda hem de üye formundaki
// element seçicide (bkz. buildElementPicker) kullanılır.
const ELEMENT_STYLE = {
  water: { bg: "#1E6FB8", glyph: '<path d="M12 3.5c-2.6 4-4.6 7.1-4.6 9.9a4.6 4.6 0 0 0 9.2 0c0-2.8-2-5.9-4.6-9.9z"/>' },
  fire: { bg: "#C23B3B", glyph: '<path d="M12 2.5c.8 2.6 2.9 3.6 2.9 6.3 0 .9-.3 1.7-.8 2.3.6-.2 1.2-.6 1.5-1.2.8 1.1 1.1 2.2 1.1 3.1a4.7 4.7 0 0 1-9.4 0c0-2.3 1.5-3.9 2.6-5.1-.1.8.1 1.5.5 2C9.2 8.1 10.3 5.7 12 2.5z"/>' },
  earth: { bg: "#B5822A", glyph: '<path d="M12 3 5.5 16.5h4.2L12 11l2.3 5.5h4.2L12 3z"/>' },
  electric: { bg: "#7A3BC2", glyph: '<path d="M13.2 2.5 6.8 13h3.6l-.9 8.5 7.2-10.8h-3.7l.9-8.2z"/>' }
};

/** Bir elementin çevrilmiş adını döndürür ("water" -> t("elementWater") gibi). */
export function elementLabel(element) {
  return t("element" + element.charAt(0).toUpperCase() + element.slice(1));
}

/** Bir üyenin 1. takım elementi için dairesel bir SVG rozet üretir. Element yoksa boş döner. */
export function elementBadge(element, size) {
  const style = ELEMENT_STYLE[element];
  if (!style) return "";
  const px = size || 22;
  return `<span class="element-badge" style="--el-bg:${style.bg}; width:${px}px; height:${px}px;" title="${elementLabel(element)}">
    <svg viewBox="0 0 24 24" width="${Math.round(px * 0.56)}" height="${Math.round(px * 0.56)}" fill="#fff">${style.glyph}</svg>
  </span>`;
}

/** Üye formundaki element seçici butonlarını (4 sabit element) doldurur; tıklanınca setTeamElement (members.js) çağrılır. */
export function buildElementPicker() {
  const container = document.getElementById("elementPicker");
  if (!container) return;
  container.innerHTML = ELEMENTS.map((el) =>
    `<div class="element-opt" data-el="${el}" onclick="setTeamElement('${el}')" title="${elementLabel(el)}">${elementBadge(el, 32)}</div>`
  ).join("");
}

/** Element seçicide hangi butonun aktif (seçili) göründüğünü günceller. */
export function setElementPickerActive(element) {
  document.querySelectorAll("#elementPicker .element-opt").forEach((el) => {
    el.classList.toggle("active", el.dataset.el === element);
  });
}

/** Göç adayı formundaki element seçici butonlarını doldurur; tıklanınca setProspectTeamElement (migration.js) çağrılır. */
export function buildProspectElementPicker() {
  const container = document.getElementById("pElementPicker");
  if (!container) return;
  container.innerHTML = ELEMENTS.map((el) =>
    `<div class="element-opt" data-el="${el}" onclick="setProspectTeamElement('${el}')" title="${elementLabel(el)}">${elementBadge(el, 32)}</div>`
  ).join("");
}

/** Aday element seçicide hangi butonun aktif göründüğünü günceller. */
export function setProspectElementPickerActive(element) {
  document.querySelectorAll("#pElementPicker .element-opt").forEach((el) => {
    el.classList.toggle("active", el.dataset.el === element);
  });
}

/** "1. Takım" tablo başlığındaki element filtre rozetlerini state.elementFilter'a göre (yeniden) çizer. */
export function renderElementFilter() {
  const container = document.getElementById("elementFilterRow");
  if (!container) return;
  container.innerHTML = ELEMENTS.map((el) =>
    `<div class="element-opt ${state.elementFilter === el ? "active" : ""}" data-el="${el}" onclick="event.stopPropagation(); setElementFilter('${el}')" title="${elementLabel(el)}">${elementBadge(el, 16)}</div>`
  ).join("");
}

export { ELEMENTS };

// =====================================================================
// ADMIN GÖRÜNÜRLÜĞÜ
// =====================================================================
// Gerçek yazma yetkisi Supabase RLS politikalarıyla (sql/auth_policies.sql)
// sağlanır; bu fonksiyon sadece arayüzdeki "admin-only" öğelerin
// görünürlüğünü `state.isAdmin`'e göre günceller. Kimlik doğrulama
// mantığının kendisi (giriş/çıkış, Supabase Auth çağrıları) auth.js'de.

/** Admin/üye oturumuna göre üst bar ve "admin-only" sınıflı öğelerin görünürlüğünü günceller. */
export function updateAdminUI() {
  const loggedIn = state.isAdmin || state.isMember;
  document.body.classList.toggle("is-admin", state.isAdmin);
  document.getElementById("logoutBtn").style.display = loggedIn ? "" : "none";
  const statusEl = document.getElementById("authStatus");
  if (!statusEl) return;
  if (state.isAdmin) statusEl.textContent = state.currentAdminUsername || t("logoutBtn");
  else if (state.isMember) statusEl.textContent = (state.currentAdminUsername ? state.currentAdminUsername + " · " : "") + t("viewOnlyLabel");
  else statusEl.textContent = t("viewOnlyLabel");
}
