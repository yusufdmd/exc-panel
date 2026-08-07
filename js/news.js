// =====================================================================
// EXC PANELİ — news.js
// =====================================================================
// "Haberler" sekmesi: genel tanıtım sitesindeki (kök index.html) haber
// akışını yönetir. Herkes okuyabilir (site üzerinde görünecekler için),
// sadece admin ekleyip/düzenleyip/silebilir (bkz. sql/add_news.sql).
// Resimler seçilince önce Supabase Storage'a yüklenir, dönen herkese
// açık URL veritabanı satırına yazılır.
// =====================================================================

import { createNews, updateNews, deleteNews as dbDeleteNews, uploadNewsImage } from "./database.js";
import { state, t, showToast, escapeHtml, todayStr, registerRenderer, renderAll } from "./ui.js";

/** Supabase'ten dönen ham haber satırını uygulamanın kullandığı şekle çevirir. */
export function mapNewsItem(row) {
  return { id: row.id, title: row.title, body: row.body, imageUrl: row.image_url, publishedAt: row.published_at };
}

export function renderNews() {
  const list = state.news;
  document.getElementById("newsEmpty").style.display = list.length ? "none" : "block";
  document.getElementById("newsRows").innerHTML = list.map((item) => `
    <tr>
      <td>${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;">` : "—"}</td>
      <td><span class="member-name">${escapeHtml(item.title)}</span></td>
      <td>${escapeHtml(item.publishedAt || "—")}</td>
      <td><div class="row-actions">
        <button class="icon-btn admin-only" onclick="openNewsModal('${item.id}')">✎</button>
        <button class="icon-btn danger admin-only" onclick="deleteNews('${item.id}')">✕</button>
      </div></td>
    </tr>
  `).join("");
}
registerRenderer(renderNews);

// =====================================================================
// HABER MODALI (EKLE/DÜZENLE)
// =====================================================================
export function openNewsModal(id) {
  document.getElementById("newsEditId").value = id || "";
  document.getElementById("nImageFile").value = "";
  if (id) {
    const item = state.news.find((n) => n.id === id);
    document.getElementById("newsModalTitle").textContent = t("newsEditTitle");
    document.getElementById("nTitle").value = item.title || "";
    document.getElementById("nBody").value = item.body || "";
    document.getElementById("nDate").value = item.publishedAt || todayStr();
    if (item.imageUrl) {
      document.getElementById("nImagePreview").src = item.imageUrl;
      document.getElementById("nImagePreviewWrap").style.display = "";
    } else {
      document.getElementById("nImagePreviewWrap").style.display = "none";
    }
  } else {
    document.getElementById("newsModalTitle").textContent = t("newsAddTitle");
    document.getElementById("nTitle").value = "";
    document.getElementById("nBody").value = "";
    document.getElementById("nDate").value = todayStr();
    document.getElementById("nImagePreviewWrap").style.display = "none";
  }
  document.getElementById("newsOverlay").classList.add("active");
}

export function closeNewsModal() {
  document.getElementById("newsOverlay").classList.remove("active");
}

// Resim seçilir seçilmez modalda küçük bir önizleme göster (henüz yüklenmedi, sadece yerel önizleme).
document.getElementById("nImageFile").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    document.getElementById("nImagePreview").src = loadEvent.target.result;
    document.getElementById("nImagePreviewWrap").style.display = "";
  };
  reader.readAsDataURL(file);
});

export async function saveNews() {
  const editId = document.getElementById("newsEditId").value;
  const title = document.getElementById("nTitle").value.trim();
  const body = document.getElementById("nBody").value.trim();
  const publishedAt = document.getElementById("nDate").value || todayStr();
  const file = document.getElementById("nImageFile").files[0];

  if (!title) {
    showToast(t("newsTitleRequired"));
    return;
  }

  try {
    let imageUrl = editId ? ((state.news.find((n) => n.id === editId) || {}).imageUrl || null) : null;
    if (file) {
      imageUrl = await uploadNewsImage(file);
    }
    const payload = { title, body: body || null, published_at: publishedAt, image_url: imageUrl };
    if (editId) {
      const row = await updateNews(editId, payload);
      const index = state.news.findIndex((n) => n.id === editId);
      if (index >= 0) state.news[index] = mapNewsItem(row);
    } else {
      const row = await createNews(payload);
      state.news.push(mapNewsItem(row));
    }
    closeNewsModal();
    renderAll();
    showToast(t("toastNewsSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

export async function deleteNews(id) {
  if (!confirm(t("confirmDeleteNews"))) return;
  try {
    await dbDeleteNews(id);
    state.news = state.news.filter((n) => n.id !== id);
    renderAll();
    showToast(t("toastNewsDeleted"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}
