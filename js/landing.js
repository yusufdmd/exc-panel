// =====================================================================
// EXCELLENCE — landing.js
// =====================================================================
// Genel tanıtım sitesinin (kök index.html) mantığı: canlı AKTİF üye
// sayısını gösterir (panelin "Toplam Üye" istatistiğiyle aynı kural —
// OLD ve göç eden üyeler hariç), "Göçe Katıl" formunu göç başvuruları
// tablosuna (migration_leads) gönderir, ve bu sayfaya özel bir dil
// seçici (TR/EN/DE/ES/FR) sağlar.
//
// Panelden (panel/js/app.js ve aşağısı) TAMAMEN BAĞIMSIZDIR — sadece
// paylaşılan database.js'i kullanır, kendi state/i18n mekanizması
// vardır ve panelinkiyle KARIŞTIRILMAZ (panel varsayılan olarak
// Türkçe açılır, bu sayfa ise ilk ziyaretçiler için İngilizce açılır —
// bu kasıtlı bir fark, bu yüzden localStorage anahtarları da ayrıdır).
// =====================================================================

import { getMembers, createMigrationLead } from "./database.js";

const LANGUAGE_STORAGE_KEY = "exc-landing-lang";
const DEFAULT_LANGUAGE = "en";
const LANGS = ["en", "tr", "de", "es", "fr"];
const LANG_LABEL = { en: "EN", tr: "TR", de: "DE", es: "ES", fr: "FR" };

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
    fieldName: "Username", fieldGameId: "ID Number", fieldContact: "Contact (Discord, etc.)", fieldServer: "Current Server", fieldPower: "Power Level",
    fieldMessage: "Message (optional)", fieldMessagePh: "Tell us a bit about yourself…",
    submitBtn: "Submit Application",
    msgNameRequired: "Please enter your username.", msgSending: "Sending…",
    msgSuccess: "Your application has been received! We'll be in touch soon.", msgError: "Something went wrong, please try again.",
    mediaTag: "Media", mediaTitle: "Our YouTube Channel", mediaDesc: "Check out our channel for event recaps, guides, and more.", mediaBtn: "Go to Channel"
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
    fieldName: "Kullanıcı Adı", fieldGameId: "ID Numarası", fieldContact: "İletişim (Discord vb.)", fieldServer: "Mevcut Sunucu", fieldPower: "Güç Seviyesi",
    fieldMessage: "Mesaj (opsiyonel)", fieldMessagePh: "Kendinizden kısaca bahsedin…",
    submitBtn: "Başvuruyu Gönder",
    msgNameRequired: "Lütfen kullanıcı adınızı girin.", msgSending: "Gönderiliyor…",
    msgSuccess: "Başvurunuz alındı! En kısa sürede sizinle iletişime geçeceğiz.", msgError: "Bir hata oluştu, lütfen tekrar deneyin.",
    mediaTag: "Medya", mediaTitle: "YouTube Kanalımız", mediaDesc: "Etkinlik özetleri, rehberler ve daha fazlası için kanalımıza göz atın.", mediaBtn: "Kanala Git"
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
    fieldName: "Benutzername", fieldGameId: "ID-Nummer", fieldContact: "Kontakt (Discord usw.)", fieldServer: "Aktueller Server", fieldPower: "Machtstufe",
    fieldMessage: "Nachricht (optional)", fieldMessagePh: "Erzähl uns kurz etwas über dich…",
    submitBtn: "Bewerbung Senden",
    msgNameRequired: "Bitte gib deinen Benutzernamen ein.", msgSending: "Wird gesendet…",
    msgSuccess: "Deine Bewerbung ist eingegangen! Wir melden uns bald bei dir.", msgError: "Etwas ist schiefgelaufen, bitte versuche es erneut.",
    mediaTag: "Medien", mediaTitle: "Unser YouTube-Kanal", mediaDesc: "Schau auf unserem Kanal vorbei für Event-Zusammenfassungen, Guides und mehr.", mediaBtn: "Zum Kanal"
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
    fieldName: "Nombre de Usuario", fieldGameId: "Número de ID", fieldContact: "Contacto (Discord, etc.)", fieldServer: "Servidor Actual", fieldPower: "Nivel de Poder",
    fieldMessage: "Mensaje (opcional)", fieldMessagePh: "Cuéntanos un poco sobre ti…",
    submitBtn: "Enviar Solicitud",
    msgNameRequired: "Por favor, introduce tu nombre de usuario.", msgSending: "Enviando…",
    msgSuccess: "¡Tu solicitud ha sido recibida! Nos pondremos en contacto pronto.", msgError: "Algo salió mal, por favor inténtalo de nuevo.",
    mediaTag: "Medios", mediaTitle: "Nuestro Canal de YouTube", mediaDesc: "Visita nuestro canal para ver resúmenes de eventos, guías y más.", mediaBtn: "Ir al Canal"
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
    fieldName: "Nom d'Utilisateur", fieldGameId: "Numéro d'ID", fieldContact: "Contact (Discord, etc.)", fieldServer: "Serveur Actuel", fieldPower: "Niveau de Puissance",
    fieldMessage: "Message (optionnel)", fieldMessagePh: "Parlez-nous un peu de vous…",
    submitBtn: "Envoyer la Candidature",
    msgNameRequired: "Veuillez saisir votre nom d'utilisateur.", msgSending: "Envoi en cours…",
    msgSuccess: "Votre candidature a été reçue ! Nous vous contacterons bientôt.", msgError: "Une erreur s'est produite, veuillez réessayer.",
    mediaTag: "Médias", mediaTitle: "Notre Chaîne YouTube", mediaDesc: "Découvrez notre chaîne pour des récapitulatifs d'événements, des guides et plus encore.", mediaBtn: "Aller à la Chaîne"
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

function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  currentLang = lang;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch (error) {
    // localStorage kullanılamıyorsa (gizli sekme vb.) sessizce sadece bu oturum için geçerli olur.
  }
  buildLangSwitch();
  applyI18n();
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
    const members = await getMembers();
    const activeCount = members.filter((m) => !m.is_old && !m.is_migrated).length;
    countEl.textContent = activeCount;
  } catch (error) {
    console.error("[Excellence] Üye sayısı alınamadı:", error);
    countEl.textContent = "—";
  }
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
  const message = document.getElementById("leadMessage").value.trim();

  if (!name) {
    setFormMessage(t("msgNameRequired"), true);
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
      message: message || null
    });
    document.getElementById("leadForm").reset();
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
loadStats();
