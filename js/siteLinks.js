// =====================================================================
// EXC PANELİ — siteLinks.js
// =====================================================================
// Genel tanıtım sitesindeki (kök index.html) Discord/YouTube/Instagram
// linklerini panelden düzenlemeyi sağlar. Veri tek satırlık site_links
// tablosunda tutulur — herkes okuyabilir (site üzerinde görünecekler
// için), sadece admin güncelleyebilir (bkz. sql/add_site_links.sql).
// =====================================================================

import { getSiteLinks, updateSiteLinks } from "./database.js";
import { state, t, showToast } from "./ui.js";

/** Supabase'ten dönen ham satırı uygulamanın kullandığı şekle çevirir. */
export function mapSiteLinks(row) {
  return {
    discordUrl: (row && row.discord_url) || "",
    youtubeUrl: (row && row.youtube_url) || "",
    instagramUrl: (row && row.instagram_url) || ""
  };
}

export function openSiteLinksModal() {
  document.getElementById("slDiscord").value = state.siteLinks.discordUrl || "";
  document.getElementById("slYoutube").value = state.siteLinks.youtubeUrl || "";
  document.getElementById("slInstagram").value = state.siteLinks.instagramUrl || "";
  document.getElementById("siteLinksOverlay").classList.add("active");
}

export function closeSiteLinksModal() {
  document.getElementById("siteLinksOverlay").classList.remove("active");
}

export async function saveSiteLinks() {
  const discordUrl = document.getElementById("slDiscord").value.trim();
  const youtubeUrl = document.getElementById("slYoutube").value.trim();
  const instagramUrl = document.getElementById("slInstagram").value.trim();
  try {
    const row = await updateSiteLinks({
      discord_url: discordUrl || null,
      youtube_url: youtubeUrl || null,
      instagram_url: instagramUrl || null
    });
    state.siteLinks = mapSiteLinks(row);
    closeSiteLinksModal();
    showToast(t("toastSiteLinksSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}
