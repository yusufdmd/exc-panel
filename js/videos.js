// =====================================================================
// EXC PANELİ — videos.js
// =====================================================================
// "Videolar" sekmesi: genel tanıtım sitesindeki (kök index.html) YouTube
// bölümünde dönen video vitrinini yönetir. Herkes okuyabilir (site
// üzerinde görünecekler için), sadece admin ekleyip/düzenleyip/
// silebilir/sıralayabilir (bkz. sql/add_featured_videos.sql). Görsel
// için ayrı bir yükleme yok — YouTube'un kendi thumbnail URL'i kullanılır.
// =====================================================================

import { createFeaturedVideo, updateFeaturedVideo, deleteFeaturedVideo as dbDeleteVideo, logActivity } from "./database.js";
import { state, t, showToast, escapeHtml, registerRenderer, renderAll } from "./ui.js";

/** "https://youtu.be/ID", "...watch?v=ID", "...embed/ID", "...shorts/ID" gibi yaygın biçimlerden 11 karakterlik video ID'sini çıkarır. */
export function extractYoutubeId(url) {
  const match = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

/** Supabase'ten dönen ham video satırını uygulamanın kullandığı şekle çevirir. */
export function mapVideoItem(row) {
  return { id: row.id, url: row.url, title: row.title, sortOrder: Number(row.sort_order) || 0 };
}

export function renderVideos() {
  const list = [...state.featuredVideos].sort((a, b) => a.sortOrder - b.sortOrder);
  document.getElementById("videosEmpty").style.display = list.length ? "none" : "block";
  document.getElementById("videoRows").innerHTML = list.map((item, index) => {
    const videoId = extractYoutubeId(item.url);
    const thumb = videoId ? `https://img.youtube.com/vi/${videoId}/default.jpg` : "";
    return `
    <tr>
      <td>${thumb ? `<img src="${escapeHtml(thumb)}" style="width:64px;height:48px;object-fit:cover;border-radius:6px;">` : "—"}</td>
      <td><span class="member-name">${escapeHtml(item.title || item.url)}</span></td>
      <td><div class="row-actions">
        <button class="icon-btn admin-only" onclick="moveVideo('${item.id}', -1)" ${index === 0 ? "disabled" : ""} title="${t("moveUp")}">▲</button>
        <button class="icon-btn admin-only" onclick="moveVideo('${item.id}', 1)" ${index === list.length - 1 ? "disabled" : ""} title="${t("moveDown")}">▼</button>
        <button class="icon-btn admin-only" onclick="openVideoModal('${item.id}')">✎</button>
        <button class="icon-btn danger admin-only" onclick="deleteVideo('${item.id}')">✕</button>
      </div></td>
    </tr>
  `;
  }).join("");
}
registerRenderer(renderVideos);

// =====================================================================
// VİDEO MODALI (EKLE/DÜZENLE)
// =====================================================================
export function openVideoModal(id) {
  document.getElementById("videoEditId").value = id || "";
  if (id) {
    const item = state.featuredVideos.find((v) => v.id === id);
    document.getElementById("videoModalTitle").textContent = t("videoEditTitle");
    document.getElementById("vUrl").value = item.url || "";
    document.getElementById("vTitle").value = item.title || "";
  } else {
    document.getElementById("videoModalTitle").textContent = t("videoAddTitle");
    document.getElementById("vUrl").value = "";
    document.getElementById("vTitle").value = "";
  }
  document.getElementById("videoOverlay").classList.add("active");
}

export function closeVideoModal() {
  document.getElementById("videoOverlay").classList.remove("active");
}

export async function saveVideo() {
  const editId = document.getElementById("videoEditId").value;
  const url = document.getElementById("vUrl").value.trim();
  const title = document.getElementById("vTitle").value.trim();

  if (!url || !extractYoutubeId(url)) {
    showToast(t("invalidVideoUrl"));
    return;
  }

  try {
    if (editId) {
      const payload = { url, title: title || null };
      const row = await updateFeaturedVideo(editId, payload);
      const index = state.featuredVideos.findIndex((v) => v.id === editId);
      if (index >= 0) state.featuredVideos[index] = mapVideoItem(row);
    } else {
      const maxOrder = state.featuredVideos.reduce((max, v) => Math.max(max, v.sortOrder), -1);
      const payload = { url, title: title || null, sort_order: maxOrder + 1 };
      const row = await createFeaturedVideo(payload);
      state.featuredVideos.push(mapVideoItem(row));
    }
    closeVideoModal();
    renderAll();
    showToast(t("toastVideoSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/** Bir videoyu (app-shape), `createFeaturedVideo`'ya doğrudan geri verilebilecek veritabanı satırı şekline çevirir. */
function videoToDbSnapshot(item) {
  return { id: item.id, url: item.url, title: item.title || null, sort_order: item.sortOrder };
}

export async function deleteVideo(id) {
  if (!confirm(t("confirmDeleteVideo"))) return;
  const target = state.featuredVideos.find((v) => v.id === id);
  try {
    await dbDeleteVideo(id);
    state.featuredVideos = state.featuredVideos.filter((v) => v.id !== id);
    await logActivity("deleted", "featured_video", id, { name: (target && (target.title || target.url)) || "İsimsiz", snapshot: target ? videoToDbSnapshot(target) : null }, state.currentAdminUsername);
    renderAll();
    showToast(t("toastVideoDeleted"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/** Bir videoyu bir öncekiyle/sonrakiyle sıra numarasını takas ederek yukarı/aşağı taşır. */
export async function moveVideo(id, direction) {
  const list = [...state.featuredVideos].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = list.findIndex((v) => v.id === id);
  const swapIndex = index + direction;
  if (index < 0 || swapIndex < 0 || swapIndex >= list.length) return;

  const a = list[index];
  const b = list[swapIndex];
  try {
    const [rowA, rowB] = await Promise.all([
      updateFeaturedVideo(a.id, { sort_order: b.sortOrder }),
      updateFeaturedVideo(b.id, { sort_order: a.sortOrder })
    ]);
    const stateIndexA = state.featuredVideos.findIndex((v) => v.id === a.id);
    const stateIndexB = state.featuredVideos.findIndex((v) => v.id === b.id);
    if (stateIndexA >= 0) state.featuredVideos[stateIndexA] = mapVideoItem(rowA);
    if (stateIndexB >= 0) state.featuredVideos[stateIndexB] = mapVideoItem(rowB);
    renderAll();
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}
