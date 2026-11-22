// What a worked rock amounts to, in a player's words. One wording for the belt view's rock card,
// the list of claims, and the line the rover board says on the way out. No DOM here: this turns
// the sim's report (src/systems/siteReport.js) into labelled sentences and nothing else.
import { NEIGHBOUR_RULES, classifySiteSpecialization } from '../../data/sites.js';
import { commodityDisplayName } from '../commodityNames.js';
import { asteroidSiteReadMethods, findAsteroidSiteFromState } from '../../systems/asteroidSiteReadModel.js';
import { seatingGrade } from '../../systems/siteReport.js';

const TRADE_WORD = Object.freeze({
  extraction: 'mining', smelting: 'smelting', fabrication: 'fabricating',
  powerhouse: 'power', bastion: 'guard', outpost: 'claim',
});

const rate = (n) => {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return v >= 10 ? String(Math.round(v)) : String(v);
};
const pct = (n) => `${Math.round((Number(n) || 0) * 100)}%`;
const goodName = (goodId) => String(commodityDisplayName(goodId) || 'goods').toLowerCase();

function joinWords(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function flowLine(rows) {
  return `${joinWords(rows.slice(0, 3).map((r) => `${rate(r.perMin)} ${goodName(r.goodId)}`))} a minute`;
}

const MAX_LIFT = pct(NEIGHBOUR_RULES.liftPerTrade);

/**
 * @param report  buildRockReport() output
 * @param opts.nameOf  (asteroidId) => the rock's name
 * @returns Array<{ id, label, value, tone }>
 */
export function rockReportLines(report, { nameOf = () => 'a rock', raidPressure = 0 } = {}) {
  if (!report) return [];
  const lines = [];
  const add = (id, label, value, tone = '') => lines.push({ id, label, value, tone });

  add('makes', 'Makes', report.makes.length ? flowLine(report.makes) : 'Nothing yet', report.makes.length ? 'good' : 'muted');
  if (report.wants.length) add('wants', 'Needs', flowLine(report.wants), 'warn');

  const mw = Math.round(Number(report.netMw) || 0);
  add('power', 'Power', mw > 0 ? `${mw} MW spare` : (mw < 0 ? `Short ${-mw} MW` : 'Even'), mw < 0 ? 'bad' : (mw > 0 ? 'good' : ''));

  const seat = report.seating || {};
  add('dug', 'Dug', seat.grade
    ? `grade ${seat.grade}. Its machines touch ${pct(seat.share)} of the rock they could`
    : 'No machine here reads the rock yet', seat.grade === 'A' ? 'good' : (seat.grade === 'D' ? 'warn' : ''));

  const lift = report.lift || { rows: [], linked: 0 };
  if (lift.rows.length) {
    add('neighbours', 'Neighbours', joinWords(lift.rows.map((r) => (
      `+${pct(r.lift)} from ${nameOf(r.asteroidId)} (${TRADE_WORD[r.roleId] || 'works'}${r.grade ? `, grade ${r.grade}` : ''})`
    ))), 'good');
  } else if (lift.linked > 0) {
    add('neighbours', 'Neighbours', `Its lines join rocks of its own trade. Another trade adds up to ${MAX_LIFT}`, 'muted');
  } else {
    add('neighbours', 'Neighbours', `No line to another rock. One of another trade adds up to ${MAX_LIFT}`, 'muted');
  }

  // Guard matters once raiders test the belt (a second claim brings them).
  if (raidPressure > 0) {
    const guard = Math.round(Number(report.defended) || 0);
    add('guard', 'Guard', guard > 0
      ? `${guard} of the ${Math.round(raidPressure)} this belt needs between all its rocks`
      : 'None. Raiders go for the worst-guarded rock first', guard > 0 ? '' : 'warn');
  }

  const limit = report.limit;
  if (limit) {
    const why = limit.kind === 'power' ? 'Short of power'
      : limit.kind === 'input' ? `Waiting on ${goodName(limit.goodId)}`
        : limit.kind === 'export' ? 'Its stores are full'
          : limit.kind === 'lane' ? 'A machine has no cargo lane' : null;
    if (why) add('limit', 'Held back', why, 'warn');
  }
  return lines;
}

/** One sentence for a list row or a parting line: "Mining, grade B. Makes 2.4 iron ore a minute." */
export function rockReportSentence(report) {
  if (!report) return '';
  const roleId = report.role && report.role.id;
  const trade = TRADE_WORD[roleId] || 'claim';
  // A rock with a Core and nothing else has no trade yet.
  const head = (!roleId || roleId === 'outpost')
    ? 'A bare claim.'
    : `${trade.charAt(0).toUpperCase()}${trade.slice(1)}${report.seating && report.seating.grade ? `, grade ${report.seating.grade}` : ''}.`;
  const makes = report.makes.length ? ` Makes ${flowLine(report.makes)}.` : ' Makes nothing yet.';
  const lift = report.lift && report.lift.mult > 1 ? ` Neighbours add ${pct(report.lift.mult - 1)}.` : '';
  return `${head}${makes}${lift}`;
}

// The cockpit's line for a rock the pilot owns: "Your claim: mining, grade B · 3 machines · 1 line out".
// The grade needs the rock's interior, so it is worked out once per change to the claim and kept.
const claimCache = new Map();
const CLAIM_CACHE_MAX = 64;
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function claimedRockLine(entity, state) {
  if (!entity || entity.type !== 'asteroid' || !state || !state.sites || !state.sites.byId) return null;
  const byData = entity.data && entity.data.siteId ? state.sites.byId[entity.data.siteId] : null;
  const site = byData || findAsteroidSiteFromState(state, entity.id);
  if (!site || !site.anchored || !Array.isArray(site.machines)) return null;
  const key = [
    (site.cleared || []).length, (site.drillRubble || []).length, (site.drillFill || []).length,
    site.machines.map((m) => `${m.defId}@${m.col},${m.row}:${m.mode || ''}`).join('|'),
  ].join('#');
  let hit = claimCache.get(site.id);
  if (!hit || hit.key !== key) {
    let grade = null;
    try {
      const view = Object.create(asteroidSiteReadMethods);
      view.state = state;
      view._rt = new Map();
      grade = seatingGrade(view._seatingShareOf(site));
    } catch (_) { grade = null; }
    hit = { key, grade };
    if (claimCache.size >= CLAIM_CACHE_MAX) claimCache.delete(claimCache.keys().next().value);
    claimCache.set(site.id, hit);
  }
  const roleId = classifySiteSpecialization(site).id;
  const out = (Array.isArray(site.links) ? site.links : []).filter((l) => l && l.active !== false).length;
  const head = roleId === 'outpost'
    ? 'Your claim'
    : `Your claim: ${TRADE_WORD[roleId] || 'works'}${hit.grade ? `, grade ${hit.grade}` : ''}`;
  const parts = [head, count(site.machines.length, 'machine')];
  if (out) parts.push(`${count(out, 'line')} out`);
  return parts.join(' · ');
}
