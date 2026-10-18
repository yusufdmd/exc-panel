// =====================================================================
// EXC PANELİ — api/_lib/botMessages.js
// =====================================================================
// api/discord-interactions.js'in kullanıcıya gösterdiği mesajların TR/EN
// metinleri. Panelin kendi çok dilli sistemi (js/ui.js -> DICT, 6 dil)
// buraya taşınmadı - üyelerin panelde kendi hesabı yok ki bir "seçtiği
// dil" olsun, ama Discord her komut çağrısında kullanıcının KENDİ Discord
// istemci dilini (`interaction.locale`) bize zaten veriyor, o yüzden
// gerçek sinyal bu. Sadece TR/EN var (6 dilin tamamını burada da tutmak
// orantısız olurdu) - Türkçe dışındaki HER Discord dili İngilizce'ye
// düşer (zaten lonca içi ortak dil, bkz. cron-reminder.js'teki NOT).
// =====================================================================

const MESSAGES = {
  tr: {
    incomplete: "⚠️ İstek eksik görünüyor, lütfen tekrar dener misin?",
    processing: "⏳ Görsel okunuyor, birazdan sonucu paylaşacağım...",
    downloadFailed: "⚠️ Görsel indirilemedi, lütfen tekrar dener misin?",
    unmatched: "😕 Görselde senin verini net olarak bulamadım. Görseli kontrol edip tekrar dener misin, ya da bir yöneticiyle iletişime geç.",
    unexpectedError: "⚠️ Beklenmeyen bir hata oluştu, lütfen tekrar dener misin? Sorun devam ederse bir yöneticiye bildir.",
    notLinked: "Discord hesabın henüz profiline kayıtlı değil. Bir yöneticiyle iletişime geçip bağlatabilirsin.",
    notActive: "Profilin aktif üye listesinde görünmüyor, bu yüzden katılım bildiremezsin. Yanlış olduğunu düşünüyorsan bir yöneticiyle konuş.",
    joined: "katıldın",
    notJoined: "katılmadın",
    noGroup: "grup yok",
    recorded: (label) => `✅ ${label} için kaydın alındı`,
    pendingApproval: "Bir yöneticinin onayını bekliyor."
  },
  en: {
    incomplete: "⚠️ Your request looks incomplete, could you try again?",
    processing: "⏳ Reading your screenshot, I'll share the result shortly...",
    downloadFailed: "⚠️ Couldn't download the screenshot, could you try again?",
    unmatched: "😕 I couldn't clearly find your data in the screenshot. Double-check it and try again, or reach out to a manager.",
    unexpectedError: "⚠️ Something unexpected went wrong, could you try again? If it keeps happening, let a manager know.",
    notLinked: "Your Discord account isn't linked to a profile yet. Reach out to a manager to get it linked.",
    notActive: "Your profile isn't on the active member list, so you can't report participation. If that's wrong, talk to a manager.",
    joined: "joined",
    notJoined: "didn't join",
    noGroup: "no group",
    recorded: (label) => `✅ Your ${label} record was received`,
    pendingApproval: "Waiting for a manager's approval."
  }
};

/** Discord'un `interaction.locale`/`interaction.guild_locale` alanından TR/EN seçer, başka her şey EN'e düşer. */
function langFor(interaction) {
  const locale = (interaction && (interaction.locale || interaction.guild_locale)) || "";
  return locale.toLowerCase().startsWith("tr") ? "tr" : "en";
}

function messagesFor(interaction) {
  return MESSAGES[langFor(interaction)];
}

module.exports = { messagesFor, langFor };
