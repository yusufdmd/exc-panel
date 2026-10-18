// =====================================================================
// EXC PANELİ — api/_lib/botMessages.js
// =====================================================================
// api/discord-interactions.js'in kullanıcıya gösterdiği mesajların
// çevirileri. Üyelerin panelde kendi hesabı yok ki bir "seçtiği dil"
// olsun, ama Discord her komut çağrısında kullanıcının KENDİ Discord
// istemci dilini (`interaction.locale`) bize zaten veriyor, o yüzden
// gerçek sinyal bu. Panelin kendi çok dilli sistemiyle (js/ui.js -> DICT)
// AYNI 6 dil desteklenir (TR/EN/DE/ES/FR/VI) - buradaki anahtarlar panelin
// DICT'inde yok (bunlar panelde değil Discord'da görünen, yeni mesaj
// türleri), o yüzden ayrı tutulur. Bu 6'nın dışındaki her Discord dili
// İngilizce'ye düşer (zaten lonca içi ortak dil, bkz. cron-reminder.js).
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
    joined: "katıldın", notJoined: "katılmadın", noGroup: "grup yok",
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
    joined: "joined", notJoined: "didn't join", noGroup: "no group",
    recorded: (label) => `✅ Your ${label} record was received`,
    pendingApproval: "Waiting for a manager's approval."
  },
  de: {
    incomplete: "⚠️ Deine Anfrage scheint unvollständig zu sein, kannst du es noch einmal versuchen?",
    processing: "⏳ Screenshot wird gelesen, ich teile das Ergebnis gleich mit...",
    downloadFailed: "⚠️ Der Screenshot konnte nicht heruntergeladen werden, kannst du es noch einmal versuchen?",
    unmatched: "😕 Ich konnte deine Daten im Screenshot nicht eindeutig finden. Überprüfe ihn und versuche es erneut, oder wende dich an einen Manager.",
    unexpectedError: "⚠️ Etwas ist schiefgelaufen, kannst du es noch einmal versuchen? Falls es weiter passiert, sag einem Manager Bescheid.",
    notLinked: "Dein Discord-Konto ist noch nicht mit einem Profil verknüpft. Wende dich an einen Manager, um es zu verknüpfen.",
    notActive: "Dein Profil steht nicht auf der Liste der aktiven Mitglieder, daher kannst du keine Teilnahme melden. Falls das falsch ist, sprich mit einem Manager.",
    joined: "teilgenommen", notJoined: "nicht teilgenommen", noGroup: "keine Gruppe",
    recorded: (label) => `✅ Dein ${label}-Eintrag wurde erfasst`,
    pendingApproval: "Wartet auf die Genehmigung eines Managers."
  },
  es: {
    incomplete: "⚠️ Tu solicitud parece incompleta, ¿puedes intentarlo de nuevo?",
    processing: "⏳ Leyendo tu captura de pantalla, compartiré el resultado en breve...",
    downloadFailed: "⚠️ No se pudo descargar la captura de pantalla, ¿puedes intentarlo de nuevo?",
    unmatched: "😕 No pude encontrar claramente tus datos en la captura. Revísala e inténtalo de nuevo, o contacta a un administrador.",
    unexpectedError: "⚠️ Ocurrió un error inesperado, ¿puedes intentarlo de nuevo? Si sigue pasando, avisa a un administrador.",
    notLinked: "Tu cuenta de Discord aún no está vinculada a un perfil. Contacta a un administrador para vincularla.",
    notActive: "Tu perfil no está en la lista de miembros activos, por lo que no puedes reportar participación. Si esto es un error, habla con un administrador.",
    joined: "participaste", notJoined: "no participaste", noGroup: "sin grupo",
    recorded: (label) => `✅ Tu registro de ${label} fue recibido`,
    pendingApproval: "Esperando la aprobación de un administrador."
  },
  fr: {
    incomplete: "⚠️ Ta demande semble incomplète, peux-tu réessayer ?",
    processing: "⏳ Lecture de ta capture d'écran, je partage le résultat sous peu...",
    downloadFailed: "⚠️ Impossible de télécharger la capture d'écran, peux-tu réessayer ?",
    unmatched: "😕 Je n'ai pas réussi à trouver clairement tes données dans la capture d'écran. Vérifie-la et réessaie, ou contacte un responsable.",
    unexpectedError: "⚠️ Une erreur inattendue s'est produite, peux-tu réessayer ? Si le problème persiste, préviens un responsable.",
    notLinked: "Ton compte Discord n'est pas encore lié à un profil. Contacte un responsable pour le lier.",
    notActive: "Ton profil n'apparaît pas dans la liste des membres actifs, tu ne peux donc pas signaler ta participation. Si c'est une erreur, parles-en à un responsable.",
    joined: "participé", notJoined: "pas participé", noGroup: "pas de groupe",
    recorded: (label) => `✅ Ton enregistrement ${label} a été reçu`,
    pendingApproval: "En attente de l'approbation d'un responsable."
  },
  vi: {
    incomplete: "⚠️ Yêu cầu của bạn có vẻ chưa đầy đủ, bạn có thể thử lại không?",
    processing: "⏳ Đang đọc ảnh chụp màn hình, mình sẽ chia sẻ kết quả ngay sau đây...",
    downloadFailed: "⚠️ Không thể tải ảnh chụp màn hình xuống, bạn có thể thử lại không?",
    unmatched: "😕 Mình không tìm thấy rõ dữ liệu của bạn trong ảnh. Hãy kiểm tra lại và thử lại, hoặc liên hệ quản trị viên.",
    unexpectedError: "⚠️ Đã xảy ra lỗi không mong muốn, bạn có thể thử lại không? Nếu vẫn tiếp tục, hãy báo cho quản trị viên.",
    notLinked: "Tài khoản Discord của bạn chưa được liên kết với hồ sơ nào. Hãy liên hệ quản trị viên để liên kết.",
    notActive: "Hồ sơ của bạn không có trong danh sách thành viên hoạt động, vì vậy bạn không thể báo cáo tham gia. Nếu điều này sai, hãy nói chuyện với quản trị viên.",
    joined: "đã tham gia", notJoined: "chưa tham gia", noGroup: "không có nhóm",
    recorded: (label) => `✅ Đã ghi nhận ${label} của bạn`,
    pendingApproval: "Đang chờ quản trị viên phê duyệt."
  }
};

// Discord locale kodları (ör. "es-ES"/"es-419", "en-US"/"en-GB") - sadece
// baştaki dil kısmını alıp eşliyoruz, bölge farkını yok sayıyoruz.
function langFor(interaction) {
  const locale = ((interaction && (interaction.locale || interaction.guild_locale)) || "").toLowerCase();
  const base = locale.split("-")[0];
  return MESSAGES[base] ? base : "en";
}

function messagesFor(interaction) {
  return MESSAGES[langFor(interaction)];
}

module.exports = { messagesFor, langFor };
