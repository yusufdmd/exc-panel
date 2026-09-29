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

// =====================================================================
// ŞİFRE DEĞİŞTİRME — herhangi bir admin/üye, panelden çıkmadan kendi
// şifresini değiştirebilir (bkz. panel/index.html -> changePasswordOverlay).
// Supabase'in updateUser çağrısı zaten SADECE o an oturumu kimin açtıysa
// onun şifresini değiştirir — başka bir hesabı hedeflemek teknik olarak
// mümkün değil (Supabase bunu sunucu tarafında, jetonun sahibine göre
// zorunlu kılar). Buna ek olarak, burada BİLEREK mevcut şifre de istenip
// (signInWithPassword ile) doğrulanıyor — aksi halde biri kilitlenmemiş/
// açık kalmış bir oturumu (ör. paylaşılan bir bilgisayarda) bulup mevcut
// şifreyi hiç bilmeden yeni bir şifre koyup asıl sahibini dışarıda
// bırakabilirdi (bkz. 2026-09-29 olayı — bir hesabın ele geçirilmesi/
// kilitlenmesi riskini büyüten tam da bu tür bir şeydi).
//
// SADECE ADMİN: "exc" (viewer) TÜM lonca üyelerinin paylaştığı TEK bir
// giriş — bu hesap kendi şifresini değiştirebilseydi, o şifreyi bilen
// HERHANGİ BİR üye, aynı şifreyi bilen diğer HERKESİ tek taraflı olarak
// (kazayla ya da bilerek) dışarıda bırakabilirdi. Admin hesapları tek
// kişiye ait olduğu için onlarda sorun yok, ama paylaşılan hesap için bu
// özellik tamamen kapatılıyor — hem butonun görünürlüğünde (updateAdminUI)
// hem de burada (fonksiyonun kendisinde, biri doğrudan konsoldan
// çağırmaya kalkarsa diye) çift kontrol var.
// =====================================================================

const MIN_NEW_PASSWORD_LENGTH = 8;

export function openChangePasswordModal() {
  if (!state.isAdmin) return;
  document.getElementById("cpCurrentPassword").value = "";
  document.getElementById("cpNewPassword").value = "";
  document.getElementById("cpConfirmPassword").value = "";
  document.getElementById("changePasswordOverlay").classList.add("active");
}

export function closeChangePasswordModal() {
  // Şifre alanlarını DOM'da bırakmamak için kapanışta da temizleniyor.
  document.getElementById("cpCurrentPassword").value = "";
  document.getElementById("cpNewPassword").value = "";
  document.getElementById("cpConfirmPassword").value = "";
  document.getElementById("changePasswordOverlay").classList.remove("active");
}

export async function submitChangePassword() {
  if (!state.isAdmin) return; // paylaşılan "exc" (viewer) girişi kendi şifresini değiştiremez — yukarıdaki açıklamaya bkz.
  const currentPassword = document.getElementById("cpCurrentPassword").value;
  const newPassword = document.getElementById("cpNewPassword").value;
  const confirmPassword = document.getElementById("cpConfirmPassword").value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    showToast(t("emailPasswordRequired"));
    return;
  }
  if (newPassword !== confirmPassword) {
    showToast(t("msgPasswordsDontMatch"));
    return;
  }
  if (newPassword.length < MIN_NEW_PASSWORD_LENGTH) {
    showToast(t("msgPasswordTooShort"));
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData && sessionData.session && sessionData.session.user ? sessionData.session.user.email : "";
  if (!email) {
    showToast(t("loginFailed"));
    return;
  }

  // Mevcut şifreyi, oturumu bozmadan doğrulamanın yolu: aynı hesapla
  // tekrar signInWithPassword denemek. Yanlışsa hata döner, oturum
  // etkilenmez; doğruysa zaten hâlâ aynı oturumdayız.
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (verifyError) {
    showToast(t("msgCurrentPasswordWrong"));
    return;
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    showToast(t("loginFailed"));
    return;
  }

  closeChangePasswordModal();
  showToast(t("toastPasswordChanged"));
}
