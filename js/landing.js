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
    newsTag: "News", newsSectionTitle: "Latest News",
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
    newsTag: "Haberler", newsSectionTitle: "Son Haberler",
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
    newsTag: "Neuigkeiten", newsSectionTitle: "Aktuelle Neuigkeiten",
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
    newsTag: "Noticias", newsSectionTitle: "Últimas Noticias",
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
    newsTag: "Actualités", newsSectionTitle: "Dernières Actualités",
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
loadSiteLinks();
loadNews();
loadFeaturedVideos();
