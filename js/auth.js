// =====================================================================
// EXC PANELİ — auth.js
// =====================================================================
// Yönetici girişi/çıkışı ve oturum durumu bu dosyada yönetilir.
//
// Herkes veriyi görebilir (okuma politikaları herkese açık); sadece
// giriş yapmış bir yönetici veri ekleyip/düzenleyip/silebilir. Gerçek
// yetkilendirme veritabanı seviyesinde (sql/auth_policies.sql'deki RLS
// politikaları) sağlanır — bu dosya sadece Supabase Auth ile oturum
// açıp kapatmaktan ve arayüzün admin durumunu yansıtmasından sorumludur.
//
// Kullanıcı adı <-> email dönüşümü: Supabase Auth teknik olarak bir
// email adresi bekler, ama yönetici arayüzde sadece bir "kullanıcı adı"
// görür/yazar. "kullaniciadi" girildiğinde arka planda
// "kullaniciadi@<ADMIN_LOGIN_DOMAIN>" adresine çevrilir. Gerçek bir
// domain olması gerekmez, hiçbir e-posta gönderilmez — yönetici
// hesapları Supabase Dashboard'da "Auto Confirm User" işaretlenerek
// oluşturulur (bkz. README.md).
// =====================================================================

import { supabase } from "./supabase.js";
import { ADMIN_LOGIN_DOMAIN } from "./config.js";
import { state, t, showToast, updateAdminUI } from "./ui.js";

/** Yönetici arayüzünde yazılan kullanıcı adını Supabase Auth'un beklediği sahte email'e çevirir. */
function usernameToAuthEmail(username) {
  return username.trim().toLowerCase().replace(/\s+/g, "") + "@" + ADMIN_LOGIN_DOMAIN;
}

/** Supabase oturumundaki sahte email'i, arayüzde gösterilecek çıplak kullanıcı adına çevirir. */
function authEmailToUsername(email) {
  if (!email) return "";
  const domainSuffix = "@" + ADMIN_LOGIN_DOMAIN;
  return email.endsWith(domainSuffix) ? email.slice(0, -domainSuffix.length) : email;
}

/**
 * Supabase'ten gelen oturum bilgisini paylaşılan state'e yazar ve
 * arayüzü günceller. `onAuthStateChange` (her giriş/çıkışta) ve
 * `getSession` (sayfa ilk açıldığında) aynı mantığı kullanır.
 */
function applySession(session) {
  state.isAdmin = !!session;
  state.currentAdminUsername = session && session.user ? authEmailToUsername(session.user.email || "") : "";
  updateAdminUI();
}

supabase.auth.onAuthStateChange((event, session) => {
  applySession(session);
});

supabase.auth.getSession().then(({ data }) => {
  applySession(data && data.session);
});

/** Giriş modalını temiz alanlarla açar. */
export function openLoginModal() {
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginOverlay").classList.add("active");
}

/** Giriş modalını kapatır. */
export function closeLoginModal() {
  document.getElementById("loginOverlay").classList.remove("active");
}

/** Giriş formundaki kullanıcı adı/şifre ile Supabase Auth oturumu açmayı dener. */
export async function doLogin() {
  const username = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!username || !password) {
    showToast(t("emailPasswordRequired"));
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToAuthEmail(username),
    password
  });
  if (error) {
    showToast(t("loginFailed"));
    return;
  }
  closeLoginModal();
  showToast(t("loginSuccess"));
}

/** Aktif yönetici oturumunu kapatır. */
export async function doLogout() {
  await supabase.auth.signOut();
  showToast(t("logoutSuccess"));
}
