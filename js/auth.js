// =====================================================================
// EXC PANELİ — auth.js
// =====================================================================
// Giriş/çıkış ve oturum durumu bu dosyada yönetilir. İki rol vardır
// (bkz. sql/add_member_role.sql -> current_user_role()):
//   - admin:  her şeyi görür ve düzenler.
//   - viewer: sadece Üyeler/Etkinlikler/Puan Sıralaması'nı GÖRÜR (salt
//     okunur) — Göç, Aktivite ve Site Editörü'nü hiç göremez. Bu tek bir
//     paylaşılan giriş (tüm lonca üyeleri aynı hesabı kullanır).
// Gerçek yetkilendirme veritabanı seviyesinde (RLS) sağlanır — bu dosya
// sadece Supabase Auth ile oturum açıp kapatmaktan ve arayüzün rolü
// yansıtmasından sorumludur.
//
// Kullanıcı adı <-> email dönüşümü: Supabase Auth teknik olarak bir
// email adresi bekler, ama arayüzde sadece bir "kullanıcı adı" görülür/
// yazılır. "kullaniciadi" girildiğinde arka planda
// "kullaniciadi@<ADMIN_LOGIN_DOMAIN>" adresine çevrilir. Gerçek bir
// domain olması gerekmez, hiçbir e-posta gönderilmez — hem admin hem
// üye hesapları Supabase Dashboard'da "Auto Confirm User" işaretlenerek
// oluşturulur (bkz. README.md).
// =====================================================================

import { supabase } from "./supabase.js";
import { ADMIN_LOGIN_DOMAIN } from "./config.js";
import { state, t, showToast, updateAdminUI, reloadAllData } from "./ui.js";
import { getCurrentUserRole } from "./database.js";

// Panel, oturum doğrulanana kadar (admin ya da üye) hiçbir veri yüklemez/
// göstermez (bkz. updateGateVisibility) — gerçek erişim sınırı RLS'te,
// bu sadece bir arayüz kapısıdır.
let panelUnlocked = false;

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
 * `getSession` (sayfa ilk açıldığında) aynı mantığı kullanır. Oturum varsa
 * veritabanından rol (admin/viewer) sorgulanır — state.isAdmin ve
 * state.isMember birbirini dışlar (bkz. sql/add_member_role.sql).
 */
async function applySession(session) {
  const loggedIn = !!session;
  state.currentAdminUsername = loggedIn && session.user ? authEmailToUsername(session.user.email || "") : "";
  if (loggedIn) {
    const role = await getCurrentUserRole();
    state.isAdmin = role === "admin";
    state.isMember = !state.isAdmin;
  } else {
    state.isAdmin = false;
    state.isMember = false;
  }
  updateAdminUI();
  updateGateVisibility();
}

/** Giriş kapısını (authGate) ve panelin kendisini (panelWrap) admin/üye durumuna göre gösterir/gizler. */
function updateGateVisibility() {
  const gate = document.getElementById("authGate");
  const wrap = document.getElementById("panelWrap");
  if (!gate || !wrap) return; // bu dosya panel dışında bir sayfaya yüklenmiş olabilir (şu an olmuyor, ileride önlem)
  const loggedIn = state.isAdmin || state.isMember;
  if (loggedIn) {
    gate.style.display = "none";
    wrap.style.display = "";
    if (!panelUnlocked) {
      panelUnlocked = true;
      // Admin her yeni girişte "Veri Paneli / Site Editörü" seçim ekranından başlar;
      // üye rolü bu seçimi hiç görmez, doğrudan salt okunur veri görünümüne girer.
      state.panelMode = state.isMember ? "data" : null;
      reloadAllData();
    }
  } else {
    gate.style.display = "";
    wrap.style.display = "none";
    panelUnlocked = false; // bir sonraki girişte veriyi yeniden çeksin
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  applySession(session);
});

supabase.auth.getSession().then(({ data }) => {
  applySession(data && data.session);
});

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
  document.getElementById("loginPassword").value = "";
  showToast(t("loginSuccess"));
}

/** Aktif yönetici oturumunu kapatır. */
export async function doLogout() {
  await supabase.auth.signOut();
  showToast(t("logoutSuccess"));
}
