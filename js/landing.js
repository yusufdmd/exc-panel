// =====================================================================
// EXCELLENCE — landing.js
// =====================================================================
// Genel tanıtım sitesinin (kök index.html) mantığı: gerçek/canlı üye
// sayısını gösterir ve "Göçe Katıl" formunu göç başvuruları tablosuna
// (migration_leads) gönderir. Bu dosya paneldeki (panel/js/app.js ve
// aşağısı) hiçbir modülü import ETMEZ — sadece paylaşılan database.js'i
// kullanır, tamamen bağımsız çalışır.
// =====================================================================

import { getMembers, createMigrationLead } from "./database.js";

/** Canlı üye sayısını Supabase'ten çekip istatistik kutusuna yazar. */
async function loadStats() {
  const countEl = document.getElementById("memberCount");
  if (!countEl) return;
  try {
    const members = await getMembers();
    countEl.textContent = members.length;
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
  const contact = document.getElementById("leadContact").value.trim();
  const serverRaw = document.getElementById("leadServer").value.trim();
  const powerRaw = document.getElementById("leadPower").value.trim();
  const message = document.getElementById("leadMessage").value.trim();

  if (!name) {
    setFormMessage("Lütfen kullanıcı adınızı girin.", true);
    return;
  }

  const submitBtn = document.getElementById("leadSubmitBtn");
  submitBtn.disabled = true;
  setFormMessage("Gönderiliyor…", false);
  try {
    await createMigrationLead({
      name,
      contact: contact || null,
      current_server: serverRaw === "" ? null : (Number(serverRaw) || null),
      power: Number(powerRaw) || 0,
      message: message || null
    });
    document.getElementById("leadForm").reset();
    setFormMessage("Başvurunuz alındı! En kısa sürede sizinle iletişime geçeceğiz.", false);
  } catch (error) {
    console.error("[Excellence] Göç başvurusu gönderilemedi:", error);
    setFormMessage("Bir hata oluştu, lütfen tekrar deneyin.", true);
  } finally {
    submitBtn.disabled = false;
  }
}

document.getElementById("leadForm").addEventListener("submit", submitLead);
document.getElementById("navToggle").addEventListener("click", () => {
  document.getElementById("navLinks").classList.toggle("open");
});

loadStats();
