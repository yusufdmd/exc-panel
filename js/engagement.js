// =====================================================================
// EXC PANELİ — engagement.js
// =====================================================================
// "EXC Engagement Challenge" — GVG/SVS/SS/King of Desert'te katılım
// başına 1 puan veren, admin'in elle başlattığı/sıfırladığı ayrı bir
// DÖNEMSEL yarışma sıralaması. Ham haftalık veriye (GVG puanı, SVS/KoD
// durumu, SS grup+katıldı) hiç dokunmaz — sadece dönem başlangıç
// tarihinden itibaren olan haftaları filtreleyip katılım puanına çevirir.
// Aynı üyenin/haftanın tüm geçmişi ilgili etkinlik sekmesinde olduğu gibi
// görünmeye devam eder; bu sadece ayrı bir "görünüm/hesaplama"dır.
//
// Katılım kuralları (bkz. "EXC Engagement Challenge" duyurusu):
//   - SVS / King of Desert: durum "Katıldı" ise 1 puan.
//   - SS (SandStorm): bir gruba atanmış VE fiilen katılmışsa 1 puan
//     (seçilip gelmeyenin puanı olmaz, hiç seçilmeyen de puan almaz).
//   - GVG: puan, "9 sandık" karşılığı olan mevcut Yeşil Bölge eşiğine
//     (bkz. config.js -> GVG_THRESHOLDS.green) ulaşmışsa 1 puan.
// =====================================================================

import { startNewEngagementPeriod as dbStartNewEngagementPeriod } from "./database.js";
import { state, t, escapeHtml, rankClass, isExempt, showToast, todayStr, RANK_ORDER, registerRenderer } from "./ui.js";
import { activeMembers } from "./members.js";
import { GVG_THRESHOLDS } from "./config.js";

/** Bir etkinlik türü deposundaki, dönem başlangıcından itibaren (dahil) olan haftalar. */
function periodWeeks(store) {
  const start = state.engagementPeriodStart;
  if (!start) return [];
  return store.weeks.filter((w) => w.date && w.date >= start);
}

/** Verilen haftalar içinde, üyenin muaf olmadığı ve `isPoint` şartını sağladığı hafta sayısını döndürür. */
function countPoints(store, member, weeks, isPoint) {
  let count = 0;
  weeks.forEach((week) => {
    if (isExempt(member, week)) return;
    const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    if (isPoint(entry)) count++;
  });
  return count;
}

function computeEngagementRow(member) {
  const svsPoints = countPoints(state.svs, member, periodWeeks(state.svs), (e) => !!e && e.status === "joined");
  const ssPoints = countPoints(state.ss, member, periodWeeks(state.ss), (e) => !!e && !!e.group && !!e.attended);
  const kodPoints = countPoints(state.kod, member, periodWeeks(state.kod), (e) => !!e && e.status === "joined");
  const gvgPoints = countPoints(state.gvg, member, periodWeeks(state.gvg), (e) => !!e && (Number(e.points) || 0) >= GVG_THRESHOLDS.green);
  return { member, svsPoints, ssPoints, kodPoints, gvgPoints, total: svsPoints + ssPoints + kodPoints + gvgPoints };
}

function hasAnyPeriodWeek() {
  return [state.svs, state.ss, state.kod, state.gvg].some((store) => periodWeeks(store).length > 0);
}

export function setEngagementSort(key) {
  if (state.engagementSortKey === key) {
    state.engagementSortDir *= -1;
  } else {
    state.engagementSortKey = key;
    state.engagementSortDir = key === "name" ? 1 : -1;
  }
  renderEngagement();
}

export function renderEngagement() {
  const wrap = document.getElementById("engagementWrap");
  if (!wrap) return;

  const periodLabel = document.getElementById("engagementPeriodLabel");
  if (periodLabel) periodLabel.textContent = t("engagementPeriodLabel").replace("{date}", state.engagementPeriodStart || "—");

  if (!hasAnyPeriodWeek()) {
    wrap.innerHTML = `<div class="empty-state"><h3>${t("emptyEngagementTitle")}</h3><p>${t("emptyEngagementDesc")}</p></div>`;
    return;
  }

  const searchEl = document.getElementById("engagementSearch");
  const query = (searchEl ? searchEl.value : "").toLowerCase().trim();
  const rows = activeMembers()
    .filter((m) => !query || m.name.toLowerCase().includes(query) || String(m.gameId || "").toLowerCase().includes(query))
    .map(computeEngagementRow);

  const key = state.engagementSortKey;
  const dir = state.engagementSortDir;
  rows.sort((a, b) => {
    let valueA;
    let valueB;
    if (key === "name") {
      valueA = a.member.name.toLowerCase();
      valueB = b.member.name.toLowerCase();
    } else if (key === "rank") {
      valueA = RANK_ORDER[a.member.rank];
      valueB = RANK_ORDER[b.member.rank];
    } else {
      valueA = a[key];
      valueB = b[key];
    }
    if (valueA < valueB) return -1 * dir;
    if (valueA > valueB) return 1 * dir;
    return 0;
  });

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="sticky-col" onclick="setEngagementSort('rank')">${t("thRank")}</th>
          <th class="sticky-col" style="left:70px;" onclick="setEngagementSort('name')">${t("lbMember")}</th>
          <th onclick="setEngagementSort('svsPoints')">SVS</th>
          <th onclick="setEngagementSort('ssPoints')">SS</th>
          <th onclick="setEngagementSort('kodPoints')">King of Desert</th>
          <th onclick="setEngagementSort('gvgPoints')">GVG</th>
          <th onclick="setEngagementSort('total')">${t("thEngagementTotal")}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td class="sticky-col"><span class="rank-badge ${rankClass(row.member.rank)}" style="font-size:11px;padding:2px 8px;">${row.member.rank}</span></td>
            <td class="sticky-col member-name" style="left:70px;">${escapeHtml(row.member.name)}</td>
            <td class="num-cell">${row.svsPoints}</td>
            <td class="num-cell">${row.ssPoints}</td>
            <td class="num-cell">${row.kodPoints}</td>
            <td class="num-cell">${row.gvgPoints}</td>
            <td class="num-cell" style="color:var(--cyan-ink); font-weight:700;">${row.total}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/** Admin — "🔄 Yeni Dönem Başlat": dönem başlangıcını bugüne çeker (ham etkinlik verisine dokunmaz, sadece bu hesaplamanın başlangıç noktasını değiştirir). */
export async function startNewEngagementPeriod() {
  if (!confirm(t("confirmStartNewEngagementPeriod"))) return;
  try {
    const today = todayStr();
    await dbStartNewEngagementPeriod(today);
    state.engagementPeriodStart = today;
    renderEngagement();
    showToast(t("toastEngagementPeriodStarted"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

registerRenderer(renderEngagement);
