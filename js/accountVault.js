// =====================================================================
// EXC PANELİ — accountVault.js
// =====================================================================
// "Hesap Kasası" — oyun hesabı devir/sahiplik süreci için tutulan hassas
// bilgiler (oyun hesabı e-postası/şifresi, kurtarma e-postası/şifresi).
// SADECE ADMİN görebilir — bkz. sql/add_account_vault.sql (RLS) ve
// app.js -> renderPanelMode (viewer için sekme hiç gösterilmez, zaten
// loadAll de bu veriyi viewer oturumunda hiç çekmez).
//
// Şifre alanları veritabanına HİÇBİR ZAMAN düz metin yazılmaz — kaydetmeden
// önce api/account-vault-crypto.js'e (sadece admin, sunucu tarafı bir
// anahtarla) şifreletilir. Görüntülemek için de aynı şekilde tek tek,
// istek üzerine ("👁 Göster") çözülür — sayfa her açıldığında toplu
// çözülmez, gereksiz yere düz metin olarak belleğe/DOM'a taşınmasın diye.
// =====================================================================

import { supabase } from "./supabase.js";
import {
  createAccountVaultEntry, updateAccountVaultEntry,
  deleteAccountVaultEntry as dbDeleteAccountVaultEntry, logActivity
} from "./database.js";
import { state, t, escapeHtml, showToast, registerRenderer, renderAll } from "./ui.js";

/** Supabase'ten dönen ham satırı uygulamanın kullandığı şekle çevirir. Şifre alanları hâlâ şifreli (base64) haldedir. */
export function mapAccountVaultEntry(row) {
  return {
    id: row.id, memberId: row.member_id || "", gameId: row.game_id || "", name: row.name || "",
    gameEmail: row.game_email || "", gamePasswordEnc: row.game_password_enc || "",
    hasEmailAccess: !!row.has_email_access, recoveryEmail: row.recovery_email || "",
    recoveryEmailPasswordEnc: row.recovery_email_password_enc || "", note: row.note || "",
    createdBy: row.created_by || "", createdAt: row.created_at, updatedBy: row.updated_by || "", updatedAt: row.updated_at
  };
}

/** Geçerli oturumun access token'ını döndürür (api/account-vault-crypto.js çağrıları için). */
async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data && data.session ? data.session.access_token : "";
}

/** api/account-vault-crypto.js'e bir grup değer gönderip şifreler/çözer. Boş/null değerler olduğu gibi (null) kalır. */
async function cryptoRequest(action, values) {
  const token = await getAccessToken();
  const res = await fetch("/api/account-vault-crypto", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ action, values })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
  return payload.values;
}

// Hangi satır/alanın o an düz metin olarak açık gösterildiğini tutar (ör. "id:game" / "id:recovery").
// Bilerek state'in DIŞINDA, modül-seviyesinde tutulur — her yeniden çizimde (ör. 12sn'lik yoklama)
// sıfırlanması güvenlik açısından İYİDİR, admin "Göster"i tekrar tıklamak zorunda kalır.
const revealed = {};

function revealKey(id, field) {
  return `${id}:${field}`;
}

export async function toggleAccountVaultReveal(id, field) {
  const key = revealKey(id, field);
  if (revealed[key] != null) {
    delete revealed[key];
    renderAccountVault();
    return;
  }
  const entry = state.accountVault.find((e) => e.id === id);
  if (!entry) return;
  const encValue = field === "game" ? entry.gamePasswordEnc : entry.recoveryEmailPasswordEnc;
  if (!encValue) return;
  try {
    const [plain] = await cryptoRequest("decrypt", [encValue]);
    revealed[key] = plain || "";
    renderAccountVault();
  } catch (error) {
    console.error(error);
    showToast(t("avDecryptError"));
  }
}

function passwordCellHtml(id, field, hasValue) {
  if (!hasValue) return "—";
  const key = revealKey(id, field);
  const isRevealed = revealed[key] != null;
  const text = isRevealed ? escapeHtml(revealed[key] || "") : "••••••••";
  return `<span style="font-family:monospace;">${text}</span> <button type="button" class="icon-btn" style="width:22px;height:22px;" onclick="toggleAccountVaultReveal('${id}','${field}')" title="${isRevealed ? t("avHide") : t("avShow")}">${isRevealed ? "🙈" : "👁"}</button>`;
}

function accountVaultSearchValue() {
  const el = document.getElementById("accountVaultSearch");
  return (el && el.value || "").toLowerCase().trim();
}

export function renderAccountVault() {
  const rowsEl = document.getElementById("accountVaultRows");
  if (!rowsEl) return;
  const query = accountVaultSearchValue();
  let list = state.accountVault || [];
  if (query) {
    list = list.filter((e) =>
      (e.name || "").toLowerCase().includes(query) ||
      String(e.gameId || "").toLowerCase().includes(query) ||
      (e.gameEmail || "").toLowerCase().includes(query) ||
      (e.recoveryEmail || "").toLowerCase().includes(query)
    );
  }
  document.getElementById("accountVaultEmpty").style.display = list.length ? "none" : "block";
  document.getElementById("accountVaultTableWrap").style.display = list.length ? "" : "none";
  rowsEl.innerHTML = list.map((entry) => `
    <tr>
      <td><span class="member-name">${escapeHtml(entry.name || "—")}</span>${entry.memberId ? "" : ` <span class="old-tag">${t("avStandaloneTag")}</span>`}</td>
      <td class="member-id">${escapeHtml(entry.gameId || "—")}</td>
      <td>${escapeHtml(entry.gameEmail || "—")}</td>
      <td>${passwordCellHtml(entry.id, "game", !!entry.gamePasswordEnc)}</td>
      <td style="text-align:center;">${entry.hasEmailAccess ? "✅" : "—"}</td>
      <td>${escapeHtml(entry.recoveryEmail || "—")}</td>
      <td>${passwordCellHtml(entry.id, "recovery", !!entry.recoveryEmailPasswordEnc)}</td>
      <td class="cell-clip" title="${t("clickToExpand")}" onclick="this.classList.toggle('expanded')">${escapeHtml(entry.note || "—")}</td>
      <td><div class="row-actions">
        <button class="icon-btn" onclick="openAccountVaultModal('${entry.id}')">✎</button>
        <button class="icon-btn danger" onclick="deleteAccountVaultEntry('${entry.id}')">✕</button>
      </div></td>
    </tr>
  `).join("");
}
registerRenderer(renderAccountVault);

/** Üye seçim listesini (opsiyonel) doldurur — aktif/eski/göç etmiş fark etmeksizin TÜM üyeler, isme göre sıralı. */
function buildAccountVaultMemberOptions(selectedMemberId) {
  const select = document.getElementById("avMember");
  if (!select) return;
  const members = [...(state.members || [])].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  select.innerHTML = `<option value="">${t("avNoMemberOption")}</option>` +
    members.map((m) => `<option value="${m.id}" ${m.id === selectedMemberId ? "selected" : ""}>${escapeHtml(m.name)} (${escapeHtml(String(m.gameId || "—"))})</option>`).join("");
}

export function openAccountVaultModal(id) {
  buildAccountVaultMemberOptions(id ? null : null);
  document.getElementById("avEditId").value = id || "";
  document.getElementById("avGamePassword").value = "";
  document.getElementById("avRecoveryPassword").value = "";
  if (id) {
    const entry = state.accountVault.find((e) => e.id === id);
    if (!entry) return;
    document.getElementById("accountVaultModalTitle").textContent = t("avEditTitle");
    buildAccountVaultMemberOptions(entry.memberId || "");
    document.getElementById("avName").value = entry.name || "";
    document.getElementById("avGameId").value = entry.gameId || "";
    document.getElementById("avGameEmail").value = entry.gameEmail || "";
    document.getElementById("avGamePassword").placeholder = entry.gamePasswordEnc ? t("avPasswordKeepHint") : t("avPasswordPlaceholder");
    document.getElementById("avHasEmailAccess").checked = !!entry.hasEmailAccess;
    document.getElementById("avRecoveryEmail").value = entry.recoveryEmail || "";
    document.getElementById("avRecoveryPassword").placeholder = entry.recoveryEmailPasswordEnc ? t("avPasswordKeepHint") : t("avPasswordPlaceholder");
    document.getElementById("avNote").value = entry.note || "";
  } else {
    document.getElementById("accountVaultModalTitle").textContent = t("avAddTitle");
    ["avName", "avGameId", "avGameEmail", "avRecoveryEmail", "avNote"].forEach((fieldId) => { document.getElementById(fieldId).value = ""; });
    document.getElementById("avGamePassword").placeholder = t("avPasswordPlaceholder");
    document.getElementById("avRecoveryPassword").placeholder = t("avPasswordPlaceholder");
    document.getElementById("avHasEmailAccess").checked = false;
  }
  document.getElementById("accountVaultOverlay").classList.add("active");
}

export function closeAccountVaultModal() {
  document.getElementById("accountVaultOverlay").classList.remove("active");
}

/** Üye seçilince isim/ID alanlarını otomatik doldurur (yine de elle değiştirilebilir). */
export function applyAccountVaultMemberSelection() {
  const memberId = document.getElementById("avMember").value;
  if (!memberId) return;
  const member = (state.members || []).find((m) => m.id === memberId);
  if (!member) return;
  document.getElementById("avName").value = member.name || "";
  document.getElementById("avGameId").value = member.gameId || "";
}

export async function saveAccountVault() {
  const editId = document.getElementById("avEditId").value;
  const memberId = document.getElementById("avMember").value || null;
  const name = document.getElementById("avName").value.trim();
  const gameId = document.getElementById("avGameId").value.trim();
  const gameEmail = document.getElementById("avGameEmail").value.trim();
  const gamePasswordRaw = document.getElementById("avGamePassword").value;
  const hasEmailAccess = document.getElementById("avHasEmailAccess").checked;
  const recoveryEmail = document.getElementById("avRecoveryEmail").value.trim();
  const recoveryPasswordRaw = document.getElementById("avRecoveryPassword").value;
  const note = document.getElementById("avNote").value.trim();

  if (!name) {
    showToast(t("avNameRequired"));
    return;
  }

  try {
    // Sadece alana YENİ bir değer yazılmışsa şifreleyip gönderiyoruz — boş
    // bırakılırsa mevcut (zaten şifreli) değer olduğu gibi kalır.
    const [gamePasswordEnc, recoveryPasswordEnc] = await cryptoRequest("encrypt", [gamePasswordRaw, recoveryPasswordRaw]);

    const payload = {
      member_id: memberId, name, game_id: gameId || null, game_email: gameEmail || null,
      has_email_access: hasEmailAccess, recovery_email: recoveryEmail || null, note: note || null,
      updated_by: state.currentAdminUsername || null
    };
    if (gamePasswordRaw) payload.game_password_enc = gamePasswordEnc;
    if (recoveryPasswordRaw) payload.recovery_email_password_enc = recoveryPasswordEnc;

    if (editId) {
      const row = await updateAccountVaultEntry(editId, payload);
      const index = state.accountVault.findIndex((e) => e.id === editId);
      if (index >= 0) state.accountVault[index] = mapAccountVaultEntry(row);
      await logActivity("updated", "account_vault", editId, { name }, state.currentAdminUsername);
    } else {
      const row = await createAccountVaultEntry({ ...payload, created_by: state.currentAdminUsername || null });
      state.accountVault.push(mapAccountVaultEntry(row));
      await logActivity("created", "account_vault", row.id, { name }, state.currentAdminUsername);
    }
    closeAccountVaultModal();
    renderAll();
    showToast(t("toastAccountVaultSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

export async function deleteAccountVaultEntry(id) {
  if (!confirm(t("confirmDeleteAccountVault"))) return;
  const target = state.accountVault.find((e) => e.id === id);
  try {
    await dbDeleteAccountVaultEntry(id);
    state.accountVault = state.accountVault.filter((e) => e.id !== id);
    delete revealed[revealKey(id, "game")];
    delete revealed[revealKey(id, "recovery")];
    await logActivity("deleted", "account_vault", id, { name: (target && target.name) || "İsimsiz" }, state.currentAdminUsername);
    renderAll();
    showToast(t("toastAccountVaultDeleted"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}
