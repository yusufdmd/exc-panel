// =====================================================================
// EXC PANELİ — backup.js
// =====================================================================
// "Yedekle" (JSON indirme) ve "İçe Aktar" (JSON'dan tam veri değişimi)
// özellikleri. İçe aktarma, Supabase'deki TÜM paylaşılan veriyi siler ve
// dosyadaki verilerle yeniden oluşturur (üye ID'leri dahil her şey
// yeniden üretilir) — bu yüzden sonunda `reloadAllData()` ile app.js'in
// `loadAll`'ını çalıştırıp state'i taze ID'lerle senkronize eder.
// =====================================================================

import {
  createMember,
  deleteMember as dbDeleteMember,
  addPowerHistoryEntry,
  createWeek as dbCreateWeek,
  deleteWeek as dbDeleteWeek,
  upsertRecordsBulk
} from "./database.js";
import { state, t, showToast, todayStr, reloadAllData } from "./ui.js";

/** Mevcut tüm veriyi (üyeler + dört etkinlik türü) bir JSON dosyası olarak indirir. */
export function exportBackup() {
  const payload = { exportedAt: new Date().toISOString(), members: state.members, svs: state.svs, gvg: state.gvg, ss: state.ss, other: state.other };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "exc-paneli-yedek-" + todayStr() + ".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(t("backupSuccess"));
}

/** Bir etkinlik türünün haftalarını ve kayıtlarını, yeni üretilen üye/hafta ID eşlemesiyle yeniden oluşturur. */
async function importEventType(type, source, memberIdMap) {
  const weekIdMap = {};
  for (const week of source.weeks) {
    const row = await dbCreateWeek(type, { label: week.label, week_date: week.date || null });
    weekIdMap[week.id] = row.id;
  }
  const payloads = source.entries.map((entry) => {
    const memberId = memberIdMap[entry.memberId];
    const weekId = weekIdMap[entry.weekId];
    if (!memberId || !weekId) return null;
    if (type === "gvg") return { week_id: weekId, member_id: memberId, points: Number(entry.points) || 0 };
    if (type === "ss") return { week_id: weekId, member_id: memberId, group_name: entry.group || null, attended: !!entry.attended, excused: !!entry.excused };
    const status = entry.status || (entry.joined === true ? "joined" : entry.joined === false ? "absent" : "unknown");
    return { week_id: weekId, member_id: memberId, status, points: Number(entry.points) || 0, excused: !!entry.excused };
  }).filter(Boolean);
  if (payloads.length) await upsertRecordsBulk(type, payloads);
}

/** Seçilen JSON dosyasını okuyup, onay alındıktan sonra tüm paylaşılan veriyi bu dosyadakiyle değiştirir. */
export function importBackup(file) {
  if (!file) return;
  if (!confirm(t("importConfirm"))) {
    document.getElementById("importFile").value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      const newMembers = Array.isArray(data.members) ? data.members : [];
      const newSvs = data.svs && Array.isArray(data.svs.weeks) ? data.svs : { weeks: [], entries: [] };
      const newGvg = data.gvg && Array.isArray(data.gvg.weeks) ? data.gvg : { weeks: [], entries: [] };
      const newSs = data.ss && Array.isArray(data.ss.weeks) ? data.ss : { weeks: [], entries: [] };
      const newOther = data.other && Array.isArray(data.other.weeks) ? data.other : { weeks: [], entries: [] };

      // Mevcut paylaşılan veriyi temizle (kayıtlar/güç geçmişi veritabanı foreign key'leriyle otomatik silinir).
      await Promise.all(state.members.map((m) => dbDeleteMember(m.id)));
      await Promise.all([
        ...state.svs.weeks.map((w) => dbDeleteWeek("svs", w.id)),
        ...state.gvg.weeks.map((w) => dbDeleteWeek("gvg", w.id)),
        ...state.ss.weeks.map((w) => dbDeleteWeek("ss", w.id)),
        ...state.other.weeks.map((w) => dbDeleteWeek("other", w.id))
      ]);

      const memberIdMap = {};
      for (const member of newMembers) {
        const row = await createMember({
          name: member.name, game_id: member.gameId, rank: member.rank, power: Number(member.power) || 0,
          camp_level: member.campLevel, is_old: !!member.isOld, old_since: member.oldSince || null,
          joined_at: member.joinedAt || new Date().toISOString()
        });
        memberIdMap[member.id] = row.id;
        const history = Array.isArray(member.powerHistory) && member.powerHistory.length
          ? member.powerHistory
          : [{ date: (member.joinedAt || todayStr()).slice(0, 10), power: Number(member.power) || 0 }];
        for (const entry of history) {
          await addPowerHistoryEntry(row.id, entry.date, Number(entry.power) || 0);
        }
      }

      await importEventType("svs", newSvs, memberIdMap);
      await importEventType("gvg", newGvg, memberIdMap);
      await importEventType("ss", newSs, memberIdMap);
      await importEventType("other", newOther, memberIdMap);

      await reloadAllData();
      showToast(t("importSuccess"));
    } catch (error) {
      console.error(error);
      showToast(t("importFail"));
    }
    document.getElementById("importFile").value = "";
  };
  reader.onerror = () => {
    showToast(t("importFail"));
    document.getElementById("importFile").value = "";
  };
  reader.readAsText(file);
}
