// =====================================================================
// EXCELLENCE — landing.js
// =====================================================================
// Genel tanıtım sitesinin (kök index.html) mantığı: canlı AKTİF üye
// SAYISINI gösterir (panelin "Toplam Üye" istatistiğiyle aynı kural —
// OLD ve göç eden üyeler hariç), "Göçe Katıl" formunu göç başvuruları
// tablosuna (migration_leads) gönderir, ve bu sayfaya özel bir dil
// seçici (TR/EN/DE/ES/FR) sağlar.
//
// ÖNEMLİ: üye/etkinlik/göç verilerinin TAMAMI artık sadece admin girişiyle
// okunabilir (bkz. sql/auth_policies.sql) — bu sayfa üye LİSTESİNE değil,
// sadece dar kapsamlı bir RPC ile hesaplanan SAYIYA erişir
// (getActiveMemberCount), isim/ID/güç gibi hiçbir ayrıntı çekmez.
//
// Panelden (panel/js/app.js ve aşağısı) TAMAMEN BAĞIMSIZDIR — sadece
// paylaşılan database.js'i kullanır, kendi state/i18n mekanizması
// vardır ve panelinkiyle KARIŞTIRILMAZ (ikisi de varsayılan olarak
// İngilizce açılır ama tercihler ayrı localStorage anahtarlarında
// tutulur, biri diğerini etkilemez).
// =====================================================================

import { getActiveMemberCount, getSiteLinks, getNews, getFeaturedVideos, createMigrationLead } from "./database.js";
import { CAMP_LEVELS, ELEMENTS } from "./config.js";

/** Kullanıcıdan gelen metni (haber başlığı/içeriği) HTML içine güvenle basmak için kaçış uygular. */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

const LANGUAGE_STORAGE_KEY = "exc-landing-lang";
const DEFAULT_LANGUAGE = "en";
const LANGS = ["en", "tr", "de", "es", "fr", "vi"];
const LANG_LABEL = { en: "EN", tr: "TR", de: "DE", es: "ES", fr: "FR", vi: "VI" };

const DICT = {
  en: {
    navHome: "Home", navAbout: "About", navMigrate: "Join Migration", navMedia: "YouTube", navDiscord: "Discord", navPanel: "Panel",
    ctaDiscordJoin: "Join Discord",
    heroSlogan: "We Don't Compete•We Dominate",
    heroDesc: "Excellence is Server 76's leading Palmon Survival guild. A community built on strategy, dedication, and brotherhood — a family that plays together and grows together.",
    statMembers: "Members", statServer: "Server", statGame: "Game", statCommunity: "Community", statLiveValue: "Live",
    aboutTag: "About Us", aboutTitle: "Who We Are", aboutDesc: "Excellence isn't strength alone — it's a community that moves as one.",
    aboutCard1Title: "Strategy & Dedication", aboutCard1Desc: "We move with a plan in every event, every migration window — we win by thinking, not by chance.",
    aboutCard2Title: "Brotherhood", aboutCard2Desc: "Everyone who joins becomes part of the family. We support each other and grow together.",
    aboutCard3Title: "Dominance", aboutCard3Desc: "A guild that makes its name known on Server 76 and reaches its goals — we don't compete, we dominate.",
    migrateTag: "Coming From Another Server?",
    migrateDesc: "Want to join Excellence in the upcoming migration window? Fill out the form below and our leadership team will reach out.",
    fieldName: "Username", fieldGameId: "ID Number", fieldContact: "Contact (Discord, etc.)", fieldServer: "Current Server", fieldPower: "Total Power Level",
    fieldCamp: "Camp Level", fieldTeamPower: "1st Team Power", fieldTeamElement: "1st Team Element",
    elementWater: "Water", elementFire: "Fire", elementEarth: "Earth", elementElectric: "Electric",
    fieldMessage: "Message (optional)", fieldMessagePh: "Tell us a bit about yourself…",
    submitBtn: "Submit Application",
    msgFillRequired: "Please fill in all required fields.", msgInvalidGameId: "Please enter a valid ID number.", msgInvalidNumber: "Power fields must be a whole number (no dots or decimals).", msgSending: "Sending…",
    msgSuccess: "Your application has been received! We'll be in touch soon.", msgError: "Something went wrong, please try again.",
    newsTag: "News", newsSectionTitle: "Latest News",
    mediaTag: "Media", mediaTitle: "Our YouTube Channel", mediaDesc: "Check out our channel for event recaps, guides, and more.", mediaBtn: "Go to Channel",
    switchToDark: "Switch to dark theme", switchToLight: "Switch to light theme"
  },
  tr: {
    navHome: "Ana Sayfa", navAbout: "Hakkımızda", navMigrate: "Göçe Katıl", navMedia: "YouTube", navDiscord: "Discord", navPanel: "Panel",
    ctaDiscordJoin: "Discord'a Katıl",
    heroSlogan: "Biz Rekabet Etmeyiz•Biz Hükmederiz",
    heroDesc: "Excellence, Server 76'nın önde gelen Palmon Survival loncasıdır. Strateji, kararlılık ve kardeşlik üzerine kurulu bir topluluğuz — birlikte oynayan, birlikte büyüyen bir aileyiz.",
    statMembers: "Üye", statServer: "Sunucu", statGame: "Oyun", statCommunity: "Topluluk", statLiveValue: "Canlı",
    aboutTag: "Hakkımızda", aboutTitle: "Kim Olduğumuz", aboutDesc: "Excellence, tek başına güç değil, birlikte hareket eden bir topluluktur.",
    aboutCard1Title: "Strateji & Kararlılık", aboutCard1Desc: "Her etkinlikte, her göç döneminde planlı hareket ederiz — rastgele değil, düşünerek kazanırız.",
    aboutCard2Title: "Kardeşlik", aboutCard2Desc: "Yeni katılan herkes ailenin bir parçası olur. Birbirimize destek oluruz, birlikte büyürüz.",
    aboutCard3Title: "Hükmetme", aboutCard3Desc: "Server 76'da adımızı duyuran, hedeflerine ulaşan bir lonca — rekabet etmeyiz, hükmederiz.",
    migrateTag: "Başka Sunucudan mısınız?",
    migrateDesc: "Önümüzdeki göç döneminde Excellence'a katılmak ister misiniz? Aşağıdaki formu doldurun, liderlik ekibimiz sizinle iletişime geçsin.",
    fieldName: "Kullanıcı Adı", fieldGameId: "ID Numarası", fieldContact: "İletişim (Discord vb.)", fieldServer: "Mevcut Sunucu", fieldPower: "Toplam Güç Seviyesi",
    fieldCamp: "Kamp Seviyesi", fieldTeamPower: "1. Takım Gücü", fieldTeamElement: "1. Takım Elementi",
    elementWater: "Su", elementFire: "Ateş", elementEarth: "Toprak", elementElectric: "Elektrik",
    fieldMessage: "Mesaj (opsiyonel)", fieldMessagePh: "Kendinizden kısaca bahsedin…",
    submitBtn: "Başvuruyu Gönder",
    msgFillRequired: "Lütfen tüm zorunlu alanları doldurun.", msgInvalidGameId: "Lütfen geçerli bir ID numarası yazın.", msgInvalidNumber: "Güç alanları sadece rakamlardan oluşmalı (nokta/virgül olmadan).", msgSending: "Gönderiliyor…",
    msgSuccess: "Başvurunuz alındı! En kısa sürede sizinle iletişime geçeceğiz.", msgError: "Bir hata oluştu, lütfen tekrar deneyin.",
    newsTag: "Haberler", newsSectionTitle: "Son Haberler",
    mediaTag: "Medya", mediaTitle: "YouTube Kanalımız", mediaDesc: "Etkinlik özetleri, rehberler ve daha fazlası için kanalımıza göz atın.", mediaBtn: "Kanala Git",
    switchToDark: "Koyu temaya geç", switchToLight: "Açık temaya geç"
  },
  de: {
    navHome: "Startseite", navAbout: "Über uns", navMigrate: "Migration beitreten", navMedia: "YouTube", navDiscord: "Discord", navPanel: "Panel",
    ctaDiscordJoin: "Discord beitreten",
    heroSlogan: "Wir konkurrieren nicht•Wir dominieren",
    heroDesc: "Excellence ist die führende Palmon-Survival-Gilde von Server 76. Eine Gemeinschaft, die auf Strategie, Hingabe und Brüderlichkeit aufgebaut ist — eine Familie, die gemeinsam spielt und wächst.",
    statMembers: "Mitglieder", statServer: "Server", statGame: "Spiel", statCommunity: "Gemeinschaft", statLiveValue: "Live",
    aboutTag: "Über uns", aboutTitle: "Wer wir sind", aboutDesc: "Excellence ist nicht nur Stärke — es ist eine Gemeinschaft, die als eins agiert.",
    aboutCard1Title: "Strategie & Hingabe", aboutCard1Desc: "Wir handeln bei jedem Event, in jedem Migrationsfenster planvoll — wir gewinnen durch Nachdenken, nicht durch Zufall.",
    aboutCard2Title: "Brüderlichkeit", aboutCard2Desc: "Jeder, der beitritt, wird Teil der Familie. Wir unterstützen uns gegenseitig und wachsen gemeinsam.",
    aboutCard3Title: "Dominanz", aboutCard3Desc: "Eine Gilde, die auf Server 76 ihren Namen macht und ihre Ziele erreicht — wir konkurrieren nicht, wir dominieren.",
    migrateTag: "Kommst du von einem anderen Server?",
    migrateDesc: "Möchtest du Excellence im nächsten Migrationsfenster beitreten? Fülle das untenstehende Formular aus, unser Führungsteam meldet sich bei dir.",
    fieldName: "Benutzername", fieldGameId: "ID-Nummer", fieldContact: "Kontakt (Discord usw.)", fieldServer: "Aktueller Server", fieldPower: "Gesamte Machtstufe",
    fieldCamp: "Basisstufe", fieldTeamPower: "1. Team-Stärke", fieldTeamElement: "1. Team-Element",
    elementWater: "Wasser", elementFire: "Feuer", elementEarth: "Erde", elementElectric: "Elektro",
    fieldMessage: "Nachricht (optional)", fieldMessagePh: "Erzähl uns kurz etwas über dich…",
    submitBtn: "Bewerbung Senden",
    msgFillRequired: "Bitte fülle alle Pflichtfelder aus.", msgInvalidGameId: "Bitte gib eine gültige ID-Nummer ein.", msgInvalidNumber: "Machtfelder dürfen nur aus Ziffern bestehen (kein Punkt/Komma).", msgSending: "Wird gesendet…",
    msgSuccess: "Deine Bewerbung ist eingegangen! Wir melden uns bald bei dir.", msgError: "Etwas ist schiefgelaufen, bitte versuche es erneut.",
    newsTag: "Neuigkeiten", newsSectionTitle: "Aktuelle Neuigkeiten",
    mediaTag: "Medien", mediaTitle: "Unser YouTube-Kanal", mediaDesc: "Schau auf unserem Kanal vorbei für Event-Zusammenfassungen, Guides und mehr.", mediaBtn: "Zum Kanal",
    switchToDark: "Zum dunklen Thema wechseln", switchToLight: "Zum hellen Thema wechseln"
  },
  es: {
    navHome: "Inicio", navAbout: "Nosotros", navMigrate: "Únete a la Migración", navMedia: "YouTube", navDiscord: "Discord", navPanel: "Panel",
    ctaDiscordJoin: "Unirse a Discord",
    heroSlogan: "No Competimos•Dominamos",
    heroDesc: "Excellence es el gremio líder de Palmon Survival en el Servidor 76. Una comunidad basada en estrategia, dedicación y hermandad — una familia que juega y crece junta.",
    statMembers: "Miembros", statServer: "Servidor", statGame: "Juego", statCommunity: "Comunidad", statLiveValue: "En Vivo",
    aboutTag: "Sobre Nosotros", aboutTitle: "Quiénes Somos", aboutDesc: "Excellence no es solo fuerza — es una comunidad que actúa como una sola.",
    aboutCard1Title: "Estrategia y Dedicación", aboutCard1Desc: "Actuamos con un plan en cada evento, en cada ventana de migración — ganamos pensando, no por casualidad.",
    aboutCard2Title: "Hermandad", aboutCard2Desc: "Todo el que se une se convierte en parte de la familia. Nos apoyamos mutuamente y crecemos juntos.",
    aboutCard3Title: "Dominio", aboutCard3Desc: "Un gremio que se hace notar en el Servidor 76 y alcanza sus metas — no competimos, dominamos.",
    migrateTag: "¿Vienes de Otro Servidor?",
    migrateDesc: "¿Quieres unirte a Excellence en la próxima ventana de migración? Completa el formulario a continuación y nuestro equipo de liderazgo se pondrá en contacto.",
    fieldName: "Nombre de Usuario", fieldGameId: "Número de ID", fieldContact: "Contacto (Discord, etc.)", fieldServer: "Servidor Actual", fieldPower: "Nivel de Poder Total",
    fieldCamp: "Nivel de campamento", fieldTeamPower: "Poder del 1er Equipo", fieldTeamElement: "Elemento del 1er Equipo",
    elementWater: "Agua", elementFire: "Fuego", elementEarth: "Tierra", elementElectric: "Eléctrico",
    fieldMessage: "Mensaje (opcional)", fieldMessagePh: "Cuéntanos un poco sobre ti…",
    submitBtn: "Enviar Solicitud",
    msgFillRequired: "Por favor, completa todos los campos obligatorios.", msgInvalidGameId: "Por favor, introduce un número de ID válido.", msgInvalidNumber: "Los campos de poder deben ser un número entero (sin puntos ni decimales).", msgSending: "Enviando…",
    msgSuccess: "¡Tu solicitud ha sido recibida! Nos pondremos en contacto pronto.", msgError: "Algo salió mal, por favor inténtalo de nuevo.",
    newsTag: "Noticias", newsSectionTitle: "Últimas Noticias",
    mediaTag: "Medios", mediaTitle: "Nuestro Canal de YouTube", mediaDesc: "Visita nuestro canal para ver resúmenes de eventos, guías y más.", mediaBtn: "Ir al Canal",
    switchToDark: "Cambiar a tema oscuro", switchToLight: "Cambiar a tema claro"
  },
  fr: {
    navHome: "Accueil", navAbout: "À propos", navMigrate: "Rejoindre la Migration", navMedia: "YouTube", navDiscord: "Discord", navPanel: "Panel",
    ctaDiscordJoin: "Rejoindre Discord",
    heroSlogan: "Nous Ne Rivalisons Pas•Nous Dominons",
    heroDesc: "Excellence est la guilde phare de Palmon Survival sur le Serveur 76. Une communauté fondée sur la stratégie, le dévouement et la fraternité — une famille qui joue et grandit ensemble.",
    statMembers: "Membres", statServer: "Serveur", statGame: "Jeu", statCommunity: "Communauté", statLiveValue: "En Direct",
    aboutTag: "À Propos de Nous", aboutTitle: "Qui Nous Sommes", aboutDesc: "Excellence, ce n'est pas seulement la force — c'est une communauté qui agit comme une seule entité.",
    aboutCard1Title: "Stratégie & Dévouement", aboutCard1Desc: "Nous agissons avec un plan à chaque événement, chaque fenêtre de migration — nous gagnons en réfléchissant, pas par hasard.",
    aboutCard2Title: "Fraternité", aboutCard2Desc: "Tous ceux qui nous rejoignent deviennent membres de la famille. Nous nous soutenons mutuellement et grandissons ensemble.",
    aboutCard3Title: "Domination", aboutCard3Desc: "Une guilde qui se fait connaître sur le Serveur 76 et atteint ses objectifs — nous ne rivalisons pas, nous dominons.",
    migrateTag: "Vous Venez d'un Autre Serveur ?",
    migrateDesc: "Vous voulez rejoindre Excellence lors de la prochaine fenêtre de migration ? Remplissez le formulaire ci-dessous, notre équipe de direction vous contactera.",
    fieldName: "Nom d'Utilisateur", fieldGameId: "Numéro d'ID", fieldContact: "Contact (Discord, etc.)", fieldServer: "Serveur Actuel", fieldPower: "Niveau de Puissance Total",
    fieldCamp: "Niveau de camp", fieldTeamPower: "Puissance de la 1ère Équipe", fieldTeamElement: "Élément de la 1ère Équipe",
    elementWater: "Eau", elementFire: "Feu", elementEarth: "Terre", elementElectric: "Électrique",
    fieldMessage: "Message (optionnel)", fieldMessagePh: "Parlez-nous un peu de vous…",
    submitBtn: "Envoyer la Candidature",
    msgFillRequired: "Veuillez remplir tous les champs obligatoires.", msgInvalidGameId: "Veuillez saisir un numéro d'ID valide.", msgInvalidNumber: "Les champs de puissance doivent être un nombre entier (sans point ni décimale).", msgSending: "Envoi en cours…",
    msgSuccess: "Votre candidature a été reçue ! Nous vous contacterons bientôt.", msgError: "Une erreur s'est produite, veuillez réessayer.",
    newsTag: "Actualités", newsSectionTitle: "Dernières Actualités",
    mediaTag: "Médias", mediaTitle: "Notre Chaîne YouTube", mediaDesc: "Découvrez notre chaîne pour des récapitulatifs d'événements, des guides et plus encore.", mediaBtn: "Aller à la Chaîne",
    switchToDark: "Passer au thème sombre", switchToLight: "Passer au thème clair"
  },
  vi: {
    navHome: "Trang chủ", navAbout: "Giới thiệu", navMigrate: "Tham gia Di chuyển", navMedia: "YouTube", navDiscord: "Discord", navPanel: "Bảng điều khiển",
    ctaDiscordJoin: "Tham gia Discord",
    heroSlogan: "Chúng Tôi Không Cạnh Tranh•Chúng Tôi Thống Trị",
    heroDesc: "Excellence là bang hội Palmon Survival hàng đầu của Server 76. Một cộng đồng được xây dựng trên chiến lược, sự tận tâm và tình huynh đệ — một gia đình cùng chơi và cùng phát triển.",
    statMembers: "Thành viên", statServer: "Máy chủ", statGame: "Trò chơi", statCommunity: "Cộng đồng", statLiveValue: "Trực tiếp",
    aboutTag: "Giới thiệu", aboutTitle: "Chúng Tôi Là Ai", aboutDesc: "Excellence không chỉ là sức mạnh — đó là một cộng đồng hành động như một.",
    aboutCard1Title: "Chiến lược & Tận tâm", aboutCard1Desc: "Chúng tôi hành động có kế hoạch trong mọi sự kiện, mọi đợt di chuyển — chúng tôi thắng nhờ suy nghĩ, không phải may rủi.",
    aboutCard2Title: "Tình Huynh Đệ", aboutCard2Desc: "Mọi người khi gia nhập đều trở thành một phần của gia đình. Chúng tôi hỗ trợ lẫn nhau và cùng nhau phát triển.",
    aboutCard3Title: "Thống Trị", aboutCard3Desc: "Một bang hội khẳng định tên tuổi trên Server 76 và đạt được mục tiêu của mình — chúng tôi không cạnh tranh, chúng tôi thống trị.",
    migrateTag: "Đến Từ Máy Chủ Khác?",
    migrateDesc: "Muốn gia nhập Excellence trong đợt di chuyển sắp tới? Điền vào biểu mẫu bên dưới, đội ngũ lãnh đạo của chúng tôi sẽ liên hệ với bạn.",
    fieldName: "Tên người dùng", fieldGameId: "Số ID", fieldContact: "Liên hệ (Discord, v.v.)", fieldServer: "Máy chủ Hiện tại", fieldPower: "Tổng Sức mạnh",
    fieldCamp: "Cấp độ Trại", fieldTeamPower: "Sức mạnh Đội 1", fieldTeamElement: "Nguyên tố Đội 1",
    elementWater: "Thủy", elementFire: "Hỏa", elementEarth: "Thổ", elementElectric: "Điện",
    fieldMessage: "Tin nhắn (tùy chọn)", fieldMessagePh: "Hãy cho chúng tôi biết đôi điều về bạn…",
    submitBtn: "Gửi Đơn Đăng ký",
    msgFillRequired: "Vui lòng điền vào tất cả các trường bắt buộc.", msgInvalidGameId: "Vui lòng nhập số ID hợp lệ.", msgInvalidNumber: "Các trường sức mạnh chỉ được chứa chữ số (không dấu chấm/thập phân).", msgSending: "Đang gửi…",
    msgSuccess: "Đơn đăng ký của bạn đã được tiếp nhận! Chúng tôi sẽ sớm liên hệ với bạn.", msgError: "Đã có lỗi xảy ra, vui lòng thử lại.",
    newsTag: "Tin tức", newsSectionTitle: "Tin tức Mới nhất",
    mediaTag: "Phương tiện", mediaTitle: "Kênh YouTube Của Chúng Tôi", mediaDesc: "Ghé thăm kênh của chúng tôi để xem tóm tắt sự kiện, hướng dẫn và nhiều hơn nữa.", mediaBtn: "Đến Kênh",
    switchToDark: "Chuyển sang giao diện tối", switchToLight: "Chuyển sang giao diện sáng"
  }
};

let currentLang = DEFAULT_LANGUAGE;

function t(key) {
  return (DICT[currentLang] && DICT[currentLang][key]) || DICT[DEFAULT_LANGUAGE][key] || key;
}

/** Sayfadaki data-i18n / data-i18n-placeholder işaretli tüm öğeleri günceller. */
function applyI18n() {
  document.documentElement.lang = currentLang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

function buildLangSwitch() {
  const box = document.getElementById("langSwitch");
  box.innerHTML = LANGS.map(
    (lang) => `<div class="lang-opt ${lang === currentLang ? "active" : ""}" data-lang="${lang}">${LANG_LABEL[lang]}</div>`
  ).join("");
  box.querySelectorAll(".lang-opt").forEach((el) => {
    el.addEventListener("click", () => setLang(el.dataset.lang));
  });
}

// =====================================================================
// Bölüm URL'leri (#goc, #hakkimizda vb.) artık seçili dile göre değişir —
// eskiden dilden bağımsız hep Türkçe kalıyorlardı. Her bölüm için sabit
// bir anahtar (home/about/migration/media) var; GÖRÜNEN slug ise dile
// göre burada belirlenir. HTML'deki <section data-section-key="..."> ve
// <a data-section-link="..."> işaretli öğelerin id/href'i dil her
// değiştiğinde applyLocalizedSectionUrls() ile güncellenir.
// =====================================================================
const SECTION_SLUGS = {
  tr: { home: "anasayfa", about: "hakkimizda", migration: "goc", media: "medya" },
  en: { home: "home", about: "about", migration: "migration", media: "media" },
  de: { home: "start", about: "ueber-uns", migration: "migration", media: "medien" },
  es: { home: "inicio", about: "nosotros", migration: "migracion", media: "medios" },
  fr: { home: "accueil", about: "a-propos", migration: "migration", media: "medias" },
  vi: { home: "trang-chu", about: "gioi-thieu", migration: "di-chuyen", media: "truyen-thong" }
};

/** Verilen slug'ın (başındaki # olmadan) TÜM dillerdeki karşılıklarına bakıp hangi bölüm anahtarına ait olduğunu bulur. */
function sectionKeyFromSlug(slug) {
  if (!slug) return null;
  for (const lang of Object.keys(SECTION_SLUGS)) {
    const key = Object.keys(SECTION_SLUGS[lang]).find((k) => SECTION_SLUGS[lang][k] === slug);
    if (key) return key;
  }
  return null;
}

// =====================================================================
// "Kamp Seviyesi" seçimi + "1. Takım Elementi" seçici (panel/js/ui.js'teki
// buildProspectCampOptions/buildProspectElementPicker ile aynı fikir, ama bu
// sayfa panelden TAMAMEN BAĞIMSIZ olduğu için (bkz. dosya başı) burada ayrıca,
// kendi küçük i18n sözlüğüyle tanımlanır — panelin admin-only ui.js'ini
// buraya import etmek gereksiz bağımlılık/yan etki getirirdi.
// =====================================================================
const ELEMENT_STYLE = {
  water: { bg: "#1E6FB8", glyph: '<path d="M12 3.5c-2.6 4-4.6 7.1-4.6 9.9a4.6 4.6 0 0 0 9.2 0c0-2.8-2-5.9-4.6-9.9z"/>' },
  fire: { bg: "#C23B3B", glyph: '<path d="M12 2.5c.8 2.6 2.9 3.6 2.9 6.3 0 .9-.3 1.7-.8 2.3.6-.2 1.2-.6 1.5-1.2.8 1.1 1.1 2.2 1.1 3.1a4.7 4.7 0 0 1-9.4 0c0-2.3 1.5-3.9 2.6-5.1-.1.8.1 1.5.5 2C9.2 8.1 10.3 5.7 12 2.5z"/>' },
  earth: { bg: "#B5822A", glyph: '<path d="M12 3 5.5 16.5h4.2L12 11l2.3 5.5h4.2L12 3z"/>' },
  electric: { bg: "#7A3BC2", glyph: '<path d="M13.2 2.5 6.8 13h3.6l-.9 8.5 7.2-10.8h-3.7l.9-8.2z"/>' }
};
let leadTeamElement = "";

function elementBadge(element, size) {
  const style = ELEMENT_STYLE[element];
  if (!style) return "";
  const px = size || 22;
  return `<span class="element-badge" style="--el-bg:${style.bg}; width:${px}px; height:${px}px;">
    <svg viewBox="0 0 24 24" width="${Math.round(px * 0.56)}" height="${Math.round(px * 0.56)}" fill="#fff">${style.glyph}</svg>
  </span>`;
}

/** Başvuru formundaki "Kamp Seviyesi" açılır listesini doldurur, mevcut seçimi korur. */
function buildLeadCampOptions() {
  const select = document.getElementById("leadCamp");
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">—</option>` + CAMP_LEVELS.map((level) => `<option value="${level}">${level}</option>`).join("");
  select.value = current;
}

/** Başvuru formundaki "1. Takım Elementi" seçici rozetlerini (yeniden) çizer — dil değişince de çağrılır (tooltip metni için). */
function buildLeadElementPicker() {
  const container = document.getElementById("leadElementPicker");
  if (!container) return;
  container.innerHTML = ELEMENTS.map((el) =>
    `<div class="element-opt ${leadTeamElement === el ? "active" : ""}" data-el="${el}" title="${t("element" + el.charAt(0).toUpperCase() + el.slice(1))}">${elementBadge(el, 32)}</div>`
  ).join("");
  container.querySelectorAll(".element-opt").forEach((el) => {
    el.addEventListener("click", () => setLeadTeamElement(el.dataset.el));
  });
}

function setLeadTeamElement(element) {
  leadTeamElement = leadTeamElement === element ? "" : element; // aynı elemente tekrar tıklayınca seçim kaldırılır
  document.getElementById("leadTeamElement").value = leadTeamElement;
  document.querySelectorAll("#leadElementPicker .element-opt").forEach((el) => {
    el.classList.toggle("active", el.dataset.el === leadTeamElement);
  });
}

/** Bölüm id'lerini ve onlara giden bağlantıların href'ini o anki dile göre günceller. */
function applyLocalizedSectionUrls() {
  document.querySelectorAll("[data-section-key]").forEach((el) => {
    const slug = SECTION_SLUGS[currentLang][el.dataset.sectionKey];
    if (slug) el.id = slug;
  });
  document.querySelectorAll("[data-section-link]").forEach((a) => {
    const slug = SECTION_SLUGS[currentLang][a.dataset.sectionLink];
    if (slug) a.setAttribute("href", "#" + slug);
  });
}

function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  // id'ler az sonra yeni dile göre yeniden atanacağı için, adres çubuğundaki
  // MEVCUT hash'in hangi bölüme ait olduğunu id'ler değişmeden ÖNCE not ediyoruz —
  // aksi halde eski hash yeni dilde hiçbir elemente denk gelmez.
  const activeKey = sectionKeyFromSlug(location.hash.replace(/^#/, ""));
  currentLang = lang;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch (error) {
    // localStorage kullanılamıyorsa (gizli sekme vb.) sessizce sadece bu oturum için geçerli olur.
  }
  buildLangSwitch();
  applyI18n();
  buildLeadElementPicker();
  applyLocalizedSectionUrls();
  if (activeKey) history.replaceState(null, "", "#" + SECTION_SLUGS[currentLang][activeKey]);
}

function initLang() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && LANGS.includes(saved)) currentLang = saved;
  } catch (error) {
    // yoksay, varsayılan (İngilizce) ile devam
  }
  buildLangSwitch();
  applyI18n();
  buildLeadCampOptions();
  buildLeadElementPicker();

  // Sayfa bir bölüm bağlantısıyla (ör. birinin paylaştığı eski #goc linki) açıldıysa,
  // id'leri güncellemeden ÖNCE hangi bölüme ait olduğunu (dili fark etmeksizin) buluyoruz.
  const initialKey = sectionKeyFromSlug(location.hash.replace(/^#/, ""));
  applyLocalizedSectionUrls();
  if (initialKey) {
    const el = document.getElementById(SECTION_SLUGS[currentLang][initialKey]);
    if (el) el.scrollIntoView({ block: "start" });
    history.replaceState(null, "", "#" + SECTION_SLUGS[currentLang][initialKey]);
  }
}

// =====================================================================
// Açık/koyu tema — panelinkiyle aynı anahtar/mantık, ama bu sayfaya özel
// AYRI bir localStorage anahtarıyla (panelin tercihini karıştırmasın diye).
// Varsayılan KOYU kalır (bu sayfa kasıtlı olarak atmosferik/koyu bir
// "vitrin"); açık tema sadece kullanıcı tercih ederse açılır. index.html'in
// en başındaki satır-içi script, body sınıfını bu modüller yüklenmeden
// ÖNCE aynı anahtara göre uygulayıp yanıp-sönmeyi (FOUC) önler — burada
// sadece o kararla state'i eşitleyip ikon/başlığı güncelliyoruz.
// =====================================================================
const THEME_STORAGE_KEY = "exc-landing-theme";
let currentTheme = "dark";

function updateThemeToggleUI() {
  const sun = document.getElementById("themeIconSun");
  const moon = document.getElementById("themeIconMoon");
  const btn = document.getElementById("themeToggle");
  if (!sun || !moon) return;
  const isLight = currentTheme === "light";
  sun.style.display = isLight ? "" : "none";
  moon.style.display = isLight ? "none" : "";
  if (btn) btn.title = isLight ? t("switchToDark") : t("switchToLight");
}

function setTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("light-theme", currentTheme === "light");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
  } catch (error) {
    // localStorage kullanılamıyorsa tercih sadece bu oturum için geçerli olur.
  }
  updateThemeToggleUI();
}

function toggleTheme() {
  setTheme(currentTheme === "light" ? "dark" : "light");
}

function initTheme() {
  try {
    currentTheme = localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch (error) {
    currentTheme = "dark";
  }
  updateThemeToggleUI();
}

/**
 * Canlı AKTİF üye sayısını Supabase'ten çekip istatistik kutusuna yazar.
 * Panelin "Toplam Üye" istatistiğiyle (bkz. panel/js/members.js -> activeMembers)
 * AYNI kuralı uygular: OLD işaretli veya başka sunucuya göç etmiş üyeler sayılmaz.
 */
async function loadStats() {
  const countEl = document.getElementById("memberCount");
  if (!countEl) return;
  try {
    const count = await getActiveMemberCount();
    countEl.textContent = count;
  } catch (error) {
    console.error("[Excellence] Üye sayısı alınamadı:", error);
    countEl.textContent = "—";
  }
}

/** "Haberler" bölümünü doldurur; hiç haber yoksa bölümü tamamen gizler. */
async function loadNews() {
  const section = document.getElementById("haberler");
  const grid = document.getElementById("newsGrid");
  if (!section || !grid) return;
  try {
    const items = await getNews();
    if (!items.length) {
      section.style.display = "none";
      return;
    }
    grid.innerHTML = items.slice(0, 6).map((item) => `
      <div class="news-card">
        ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : ""}
        <div class="news-card-body">
          <div class="news-date">${escapeHtml(item.published_at || "")}</div>
          <h3>${escapeHtml(item.title)}</h3>
          ${item.body ? `<p>${escapeHtml(item.body)}</p>` : ""}
        </div>
      </div>
    `).join("");
    section.style.display = "";
  } catch (error) {
    console.error("[Excellence] Haberler alınamadı:", error);
    section.style.display = "none";
  }
}

// =====================================================================
// Video vitrini — YouTube bölümünde, panelden ("Videolar") eklenen
// video linklerinin thumbnail'lerini sırayla döndürür. Görsel için
// YouTube'un kendi öngörülebilir thumbnail URL'i kullanılır, ayrı bir
// API çağrısı gerekmez. Hiç video eklenmemişse bölüm eski ▶️ ikonuyla
// (mediaIconFallback) görünmeye devam eder.
// =====================================================================
const VIDEO_ROTATE_INTERVAL_MS = 6000;
const VIDEO_HOVER_PREVIEW_DELAY_MS = 400; // hızlıca üzerinden geçilirse önizleme başlamasın diye küçük bir gecikme
let videoRotatorItems = [];
let videoRotatorIndex = 0;
let videoRotatorTimer = null;
let videoHoverTimer = null;
let videoPreviewActive = false;

/** "https://youtu.be/ID", "...watch?v=ID", "...embed/ID", "...shorts/ID" gibi yaygın biçimlerden 11 karakterlik video ID'sini çıkarır. */
function extractYoutubeId(url) {
  const match = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

/**
 * YouTube'un "maxresdefault" (1280x720) görseli her videoda yüklenmemiş
 * olabilir — öyle bir durumda 120x90'lık gri bir yer tutucu döner. Önce
 * onu dener, yer tutucuya denk gelirse "hqdefault" (480x360) görseline
 * düşer. Sonuç, tekrar denemeye gerek kalmasın diye item üzerinde önbelleğe alınır.
 */
function resolveVideoThumb(item) {
  return new Promise((resolve) => {
    const maxres = `https://img.youtube.com/vi/${item.videoId}/maxresdefault.jpg`;
    const hq = `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`;
    const probe = new Image();
    probe.onload = () => {
      item.thumb = (probe.naturalWidth === 120 && probe.naturalHeight === 90) ? hq : maxres;
      resolve();
    };
    probe.onerror = () => { item.thumb = hq; resolve(); };
    probe.src = maxres;
  });
}

function showVideoSlide(index, immediate) {
  const item = videoRotatorItems[index];
  if (!item) return;
  videoRotatorIndex = index;
  stopVideoPreview();
  const img = document.getElementById("videoSlideImg");
  const link = document.getElementById("videoSlideLink");
  const titleEl = document.getElementById("videoSlideTitle");
  const apply = () => {
    img.src = item.thumb;
    img.alt = item.title || "";
    link.href = item.url;
    img.classList.remove("fading");
    if (titleEl) titleEl.textContent = item.title || "";
  };
  if (immediate) {
    apply();
  } else {
    img.classList.add("fading");
    setTimeout(apply, 200);
  }
  document.querySelectorAll("#videoDots .video-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });
}

function restartVideoRotatorTimer() {
  clearInterval(videoRotatorTimer);
  if (videoRotatorItems.length > 1) {
    videoRotatorTimer = setInterval(() => {
      showVideoSlide((videoRotatorIndex + 1) % videoRotatorItems.length);
    }, VIDEO_ROTATE_INTERVAL_MS);
  }
}

function goToVideoSlide(index) {
  showVideoSlide(index);
  restartVideoRotatorTimer();
}

/** Fare, aktif video görselinin üzerine gelince YouTube'un sessiz/otomatik oynatan gömülü oynatıcısıyla kısa bir önizleme başlatır. */
function startVideoPreview() {
  const item = videoRotatorItems[videoRotatorIndex];
  const link = document.getElementById("videoSlideLink");
  if (!item || !link || videoPreviewActive) return;
  videoPreviewActive = true;
  clearInterval(videoRotatorTimer); // önizleme sürerken vitrin bir sonraki videoya kaymasın
  const iframe = document.createElement("iframe");
  iframe.className = "video-preview-frame";
  iframe.src = `https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&loop=1&playlist=${item.videoId}`;
  iframe.title = item.title || "";
  iframe.allow = "autoplay; encrypted-media";
  iframe.setAttribute("frameborder", "0");
  link.appendChild(iframe);
}

function stopVideoPreview() {
  clearTimeout(videoHoverTimer);
  if (!videoPreviewActive) return;
  videoPreviewActive = false;
  const frame = document.querySelector(".video-preview-frame");
  if (frame) frame.remove();
  restartVideoRotatorTimer();
}

/** Video vitrinini doldurur; hiç video yoksa eski sabit ▶️ ikonuna geri döner. */
async function loadFeaturedVideos() {
  const rotator = document.getElementById("videoRotator");
  const fallbackIcon = document.getElementById("mediaIconFallback");
  if (!rotator) return;
  try {
    const rows = await getFeaturedVideos();
    videoRotatorItems = rows
      .map((row) => {
        const id = extractYoutubeId(row.url);
        return id ? { url: row.url, title: row.title, videoId: id, thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg` } : null;
      })
      .filter(Boolean);

    if (!videoRotatorItems.length) {
      rotator.style.display = "none";
      if (fallbackIcon) fallbackIcon.style.display = "";
      return;
    }

    // Kaliteli (maxresdefault) görselleri, ilk gösterimde titreşim olmasın diye önceden çözer.
    await Promise.all(videoRotatorItems.map(resolveVideoThumb));

    if (fallbackIcon) fallbackIcon.style.display = "none";
    rotator.style.display = "";
    document.getElementById("videoDots").innerHTML = videoRotatorItems.map((_, i) =>
      `<button class="video-dot${i === 0 ? " active" : ""}" aria-label="${i + 1}"></button>`
    ).join("");
    document.querySelectorAll("#videoDots .video-dot").forEach((dot, i) => {
      dot.addEventListener("click", () => goToVideoSlide(i));
    });
    const link = document.getElementById("videoSlideLink");
    link.addEventListener("mouseenter", () => {
      clearTimeout(videoHoverTimer);
      videoHoverTimer = setTimeout(startVideoPreview, VIDEO_HOVER_PREVIEW_DELAY_MS);
    });
    link.addEventListener("mouseleave", stopVideoPreview);
    showVideoSlide(0, true);
    restartVideoRotatorTimer();
  } catch (error) {
    console.error("[Excellence] Videolar alınamadı:", error);
    rotator.style.display = "none";
    if (fallbackIcon) fallbackIcon.style.display = "";
  }
}

/**
 * Discord/YouTube/Instagram bağlantılarını Supabase'ten (herkese açık,
 * dar kapsamlı site_links tablosu) çekip sayfadaki ilgili `data-link`
 * işaretli tüm öğelere uygular — admin panelinden ("Site Linkleri")
 * güncellenene kadar bu düğmeler işlevsiz (#) kalır.
 */
async function loadSiteLinks() {
  try {
    const links = await getSiteLinks();
    const apply = (key, url) => {
      if (!url) return;
      document.querySelectorAll(`[data-link="${key}"]`).forEach((el) => { el.href = url; });
    };
    apply("discord", links.discord_url);
    apply("youtube", links.youtube_url);
    apply("instagram", links.instagram_url);
  } catch (error) {
    console.error("[Excellence] Site linkleri alınamadı:", error);
  }
}

/** Sadece rakamlardan oluştuğunu (nokta/ondalık/eksi yok), istenirse tam uzunlukta olduğunu doğrular (bkz. panel/js/ui.js -> isDigitsOnly, aynı kural). */
function isDigitsOnly(value, exactLength) {
  if (!/^\d+$/.test(value)) return false;
  if (exactLength && value.length !== exactLength) return false;
  return true;
}

function setFormMessage(text, isError) {
  const el = document.getElementById("leadFormMessage");
  el.textContent = text;
  el.style.color = isError ? "var(--danger)" : "var(--success)";
}

async function submitLead(event) {
  event.preventDefault();
  const name = document.getElementById("leadName").value.trim();
  const gameId = document.getElementById("leadGameId").value.trim();
  const contact = document.getElementById("leadContact").value.trim();
  const serverRaw = document.getElementById("leadServer").value.trim();
  const powerRaw = document.getElementById("leadPower").value.trim();
  const campLevel = document.getElementById("leadCamp").value || null;
  const teamPowerRaw = document.getElementById("leadTeamPower").value.trim();
  const teamElement = document.getElementById("leadTeamElement").value || null;
  const message = document.getElementById("leadMessage").value.trim();

  // Mesaj hariç HER alan zorunlu — form artık kendi tarayıcı doğrulamasını
  // (novalidate) kullanmıyor, çünkü o zaman hata sayfanın seçili dilinde
  // değil tarayıcının kendi dilinde görünürdü.
  if (!name || !gameId || !contact || !serverRaw || !powerRaw || !campLevel || !teamPowerRaw || !teamElement) {
    setFormMessage(t("msgFillRequired"), true);
    return;
  }
  if (!isDigitsOnly(gameId, 15)) {
    setFormMessage(t("msgInvalidGameId"), true);
    return;
  }
  if (!isDigitsOnly(powerRaw) || !isDigitsOnly(teamPowerRaw)) {
    setFormMessage(t("msgInvalidNumber"), true);
    return;
  }

  const submitBtn = document.getElementById("leadSubmitBtn");
  submitBtn.disabled = true;
  setFormMessage(t("msgSending"), false);
  try {
    await createMigrationLead({
      name,
      game_id: gameId || null,
      contact: contact || null,
      current_server: serverRaw === "" ? null : (Number(serverRaw) || null),
      power: Number(powerRaw) || 0,
      camp_level: campLevel,
      team_power: teamPowerRaw === "" ? null : (Number(teamPowerRaw) || 0),
      team_element: teamElement,
      message: message || null
    });
    // Başvuru zaten kaydedildi — Discord bildirimi en iyi çaba (best-effort):
    // başarısız olsa bile (webhook henüz kurulmamış, Discord geçici hata vb.)
    // başvuran için bunun bir önemi yok, o yüzden ayrı try/catch'te sessizce yutuyoruz.
    try {
      await fetch("/api/notify-migration-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, gameId, contact, server: serverRaw, power: powerRaw,
          campLevel, teamPower: teamPowerRaw, teamElement, message
        })
      });
    } catch (notifyError) {
      console.error("[Excellence] Göç bildirimi gönderilemedi:", notifyError);
    }
    document.getElementById("leadForm").reset();
    setLeadTeamElement(leadTeamElement); // seçili elementi de sıfırla (form.reset() hidden input'u ve rozet vurgusunu temizlemez)
    setFormMessage(t("msgSuccess"), false);
  } catch (error) {
    console.error("[Excellence] Göç başvurusu gönderilemedi:", error);
    setFormMessage(t("msgError"), true);
  } finally {
    submitBtn.disabled = false;
  }
}

document.getElementById("leadForm").addEventListener("submit", submitLead);
document.getElementById("navToggle").addEventListener("click", () => {
  document.getElementById("navLinks").classList.toggle("open");
});

initLang();
initTheme();
loadStats();
loadSiteLinks();
loadNews();
loadFeaturedVideos();

window.toggleTheme = toggleTheme; // #themeToggle butonunun satır-içi onclick'i için (bkz. index.html)
