// src/ui/station/dust/endingMeter.js — DUST P2b (design/program/dust/README.md packet P2).
//
// A read-only station component: the clerk's "Eligibility Assessment" — progress toward the
// ending gates named in src/story/endings/endingDefs.js. Before this, NO surface in the game
// showed progress toward an ending (2026-10-31 blind-spot audit, BS-2): the gates were real but
// invisible, so a pilot could not see whether 90,000 cr was almost enough or nowhere near.
//
// Contracts kept:
//   - READ-ONLY. Reads GameState through readLifeLedger (the canonical pure normalization the
//     endings system itself uses); writes nothing, emits nothing, subscribes to nothing.
//   - The gate NUMBERS are imported from endingDefs.js (ENDGAME_NET_WORTH_CR, ENDGAME_REP_MIN,
//     BRANCH_FACTION). Nothing here duplicates them; if the gates move, this meter moves.
//   - Tone: TONE_BIBLE §2 — deadpan clerk, understatement, every player-visible line ≤ 12 words.
//   - Style: STATION_STANDARD — label + right-aligned mono figure, thin bar per quantity,
//     hairline grouping, no new tokens.
import { el } from '../../kit/dom.js';
import {
  BRANCH_FACTION,
  ENDING_DEFS,
  ENDGAME_NET_WORTH_CR,
  ENDGAME_REP_MIN,
} from '../../../story/endings/endingDefs.js';
import { readLifeLedger } from '../../../story/endings/lifeLedger.js';
import { integerText } from '../../../story/endings/value.js';
import { FACTION_META } from '../../../data/factions.js';
import { shouldHideOwnRepDelta } from '../../../story/endings/publicIdentity.js';

const STYLE_ID = 'sf-dust-ending-meter';

// The branch doors the board endings actually key on (endingDefs BRANCH_FACTION: A→patrol/Concord,
// B→free/Frontier). Names come from FACTION_META; never a second copy of the faction table.
const BRANCH_LABELS = Object.freeze({
  traders: 'Meridian ledger',
  patrol: 'Concord patrol',
  free: 'Frontier charter',
});

function factionShort(factionId) {
  const meta = FACTION_META.find((f) => f && f.id === factionId);
  return (meta && (meta.short || meta.name)) || factionId;
}

/**
 * Pure row model over a live (or saved) state — no DOM, no writes. One row per gate the board
 * endings name: net worth, branch standing, branch filed. `met` follows the gate constant, not a
 * restatement of it. Rep stays readable unless the identity-erasure contract seals it.
 */
export function endingMeterModel(state) {
  const facts = readLifeLedger(state);
  const sealStanding = shouldHideOwnRepDelta(state);
  const netWorthMet = facts.netWorthCr >= ENDGAME_NET_WORTH_CR;
  const standingMet = facts.branchRep >= ENDGAME_REP_MIN;
  const rows = [
    {
      gate: 'net-worth', label: 'Net worth',
      figure: `${integerText(facts.netWorthCr)} / ${integerText(ENDGAME_NET_WORTH_CR)} cr`,
      value: Math.max(0, facts.netWorthCr), max: ENDGAME_NET_WORTH_CR, met: netWorthMet,
    },
    {
      gate: 'standing', label: 'Branch standing',
      figure: sealStanding ? 'sealed by request' : `${integerText(facts.branchRep)} / ${integerText(ENDGAME_REP_MIN)}`,
      value: sealStanding ? null : Math.max(0, facts.branchRep), max: ENDGAME_REP_MIN,
      met: standingMet, sealed: sealStanding,
    },
    {
      gate: 'branch', label: 'Branch filed',
      figure: facts.branch ? (BRANCH_LABELS[facts.branch] || factionShort(facts.branchFactionId)) : 'nothing yet',
      value: null, max: null, met: facts.branch != null,
    },
  ];
  return {
    schema: 'spaceface.dust.endingMeter.v1',
    title: 'Eligibility Assessment',
    note: 'Assessment is free. Dispositions are not.',
    footnote: 'Gates named by the disposition ledger. Counts, not promises.',
    rows,
    metCount: rows.filter((r) => r.met).length,
    boardEndings: ENDING_DEFS.filter((d) => d.boardEligible).map((d) => d.title),
  };
}

function ensureStyle() {
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // STATION_STANDARD: hairline panel, 13px labels, mono right-aligned figures, a quiet bar per
  // quantity; amber only says a gate is met. All color through the shared --dp tokens.
  style.textContent = ''
    + '.dust-em{border:1px solid color-mix(in srgb,var(--dp-ink,#e8e4d8) 18%,transparent);'
    + 'border-radius:6px;padding:10px 12px;margin-top:10px;max-width:34ch}'
    + '.dust-em__head{margin:0;font:600 14px/1.3 var(--dp-face-ui,inherit);letter-spacing:.04em;'
    + 'text-transform:uppercase;color:var(--dp-ink,#e8e4d8)}'
    + '.dust-em__note{margin:2px 0 8px;font:400 13px/1.4 var(--dp-face-ui,inherit);'
    + 'color:var(--dp-ink-dim,#b7b4a6)}'
    + '.dust-em__rows{list-style:none;margin:0;padding:0;display:grid;gap:8px}'
    + '.dust-em__row{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:baseline}'
    + '.dust-em__label{font:400 13px/1.3 var(--dp-face-ui,inherit);'
    + 'color:var(--dp-ink-dim,#b7b4a6)}'
    + '.dust-em__fig{font:500 14px/1.3 var(--dp-face-num,monospace);font-variant-numeric:tabular-nums;'
    + 'text-align:right;color:var(--dp-ink,#e8e4d8)}'
    + '.dust-em__row[data-met="true"] .dust-em__fig{color:var(--dp-amber,#f2b950)}'
    + '.dust-em__bar{grid-column:1/-1;height:3px;border-radius:2px;'
    + 'background:color-mix(in srgb,var(--dp-ink,#e8e4d8) 16%,transparent);overflow:hidden}'
    + '.dust-em__fill{height:100%;background:color-mix(in srgb,var(--dp-ink,#e8e4d8) 55%,transparent)}'
    + '.dust-em__row[data-met="true"] .dust-em__fill{background:var(--dp-amber,#f2b950)}'
    + '.dust-em__foot{margin:8px 0 0;font:400 13px/1.4 var(--dp-face-ui,inherit);'
    + 'color:var(--dp-ink-dim,#b7b4a6)}';
  document.head.appendChild(style);
}

/**
 * The rendered assessment. `el()` kit DOM (same builder every station screen uses), one bar row
 * per gate, no interactive state. Safe to mount in any station panel host.
 */
export function createEndingMeter(state) {
  const model = endingMeterModel(state);
  ensureStyle();
  const section = el('section', 'dust-em');
  section.setAttribute('aria-label', 'Ending eligibility assessment');
  section.append(el('h3', 'dust-em__head', model.title));
  section.append(el('p', 'dust-em__note', model.note));
  const list = el('ul', 'dust-em__rows');
  for (const row of model.rows) {
    const li = el('li', 'dust-em__row');
    li.dataset.gate = row.gate;
    li.setAttribute('data-met', String(row.met === true));
    li.append(el('span', 'dust-em__label', row.label));
    li.append(el('span', 'dust-em__fig', row.figure));
    if (row.value != null && row.max != null && row.max > 0) {
      const bar = el('div', 'dust-em__bar');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', `${row.label}: ${row.figure}`);
      bar.setAttribute('aria-valuenow', String(Math.min(row.value, row.max)));
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(row.max));
      const fill = el('div', 'dust-em__fill');
      const pct = Math.max(0, Math.min(1, row.value / row.max)) * 100;
      fill.style.width = `${pct}%`;
      bar.append(fill);
      li.append(bar);
    }
    list.append(li);
  }
  section.append(list);
  section.append(el('p', 'dust-em__foot', model.footnote));
  return section;
}

export default createEndingMeter;
