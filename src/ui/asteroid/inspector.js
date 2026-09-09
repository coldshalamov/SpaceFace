// Cursor lens — design law §6.4. The hover/aim readout that REPLACES the deleted context bay
// (law §10). A compact card that rides beside the pointer: a colour, a name, a number, two or
// three stamps. Never prose, never a panel.
//
// PQ-130.06 rewrote this module. What it used to be — a right-hand "contextual inspector" whose
// every card read like a sentence ("Iron contacts: 3 · Dense matrix: 2 · Estimated output:
// 4.6/min") — is exactly the thing law §10 orders deleted, not restyled. The DATA those cards
// gathered was sound, so it survives here as plumbing; their voice does not. The lens speaks in
// swatch + numeral + enumerated chip, and it vanishes when the pointer leaves.
//
// Hard rules this file enforces (law §6.4 / §2.5):
//   - at most TWO text lines ever (row 1 and, for machines/ghosts, one body line). Chips are
//     stamps, not lines.
//   - chip text comes ONLY from LENS_CHIPS. The UI never invents a chip word.
//   - no tutorial copy. It prints once elsewhere (the announcer), never here.
//   - the card is pointer-transparent, so it can never steal the hover that created it.
import { SITE_MACHINE_BY_ID } from '../../data/sites.js';
import { COMMODITIES } from '../../data/commodities.js';
import { MATERIALS, ORE_TINTS } from './asteroidRenderer2d.js';
import { drillTierReqForOre } from '../../systems/drill.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

export function commodityName(id) {
  const c = COMMODITY_BY_ID.get(id);
  return (c && c.name) || String(id || '').replace(/^cmdty_/, '').replace(/_/g, ' ');
}

/**
 * Law §3.3: sentence case everywhere on this screen. The commodity table is authored in title
 * case ("Iron Ore", "Raw Diamond") for the market UI, so the lens lowers everything after the
 * first word. Acronyms and anything carrying a digit are left alone (MK2, 2u).
 */
export function sentenceCase(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return '';
  const words = s.split(/\s+/);
  return words
    .map((w, i) => {
      if (i === 0) return w.charAt(0).toUpperCase() + w.slice(1);
      if (/\d/.test(w) || (w.length > 1 && w === w.toUpperCase())) return w;
      return w.charAt(0).toLowerCase() + w.slice(1);
    })
    .join(' ');
}

/** Display label for a survey formation material key ('vein:cmdty_ore_iron', 'gas', ...). */
export function formationLabel(material) {
  const key = String(material || '');
  if (key.startsWith('vein:')) return `${commodityName(key.slice(5))} vein cluster`;
  if (key === 'gas') return 'sealed gas pocket cluster';
  if (key === 'basalt') return 'basalt formation';
  if (key === 'matrix') return 'silicate matrix formation';
  return 'geological formation';
}

/**
 * Claim-survey sentences (PQ-024). NOT LENS COPY — law §6.4 bans prose beside the cursor.
 *
 * BE HONEST ABOUT THIS ONE: deleting the context bay left it with **no runtime consumer**. Its only
 * caller today is test/pq024-survey-claim.test.mjs, which pins the one-voice volatile-assay warning
 * as a PQ-024 acceptance contract — so it stays, unchanged, rather than being quietly reworded
 * where nobody can see it. The §6.6 `Site` drawer (PQ-130.07/.10) is where it becomes visible text
 * again; if that drawer ships with different copy, retire this function with it.
 */
export function surveySentences(survey) {
  if (!survey) return [];
  if (survey.state === 'cold') {
    if (!survey.material) return [{ text: 'No formation assay yet — pulse the survey scanner.', kind: '' }];
    return [
      { text: `Survey: ${formationLabel(survey.material)} detected — ${survey.revealed}/${survey.cells} cells assayed.`, kind: '' },
      { text: 'Assay is volatile: leaving this rock discards it. Stake a machine to commit the survey.', kind: 'warn' },
    ];
  }
  if (survey.state === 'committed') {
    return [
      { text: `Survey record: ${formationLabel(survey.material)} — ${survey.cells} cells committed to the claim.`, kind: 'good' },
      { text: 'Awaiting first real output — the exterior relay comes online when the site produces.', kind: '' },
    ];
  }
  if (survey.state === 'producing') {
    const receipt = survey.receipt;
    return [
      { text: `Survey record: ${formationLabel(survey.material)} — ${survey.cells} cells committed.`, kind: 'good' },
      {
        text: `Producing since first real output${receipt ? ` (${receipt.positiveQuantity} ${commodityName(receipt.outputId)})` : ''} — exterior relay online.`,
        kind: 'good',
      },
    ];
  }
  return [];
}

export function placementReason(check) {
  const reasons = {
    'not-hollow': 'The cell must be hollow. Bore it out first.',
    occupied: 'A machine already occupies this cell.',
    'rover-here': 'The rover is parked there — move it first.',
    'rover-not-adjacent': 'Manual install: drive the rover next to the cell (a staked claim unlocks remote construction).',
    'needs-gas-contact': 'A Gas Tap must sit beside at least one sealed gas pocket.',
    unique: 'Only one Massline Core per asteroid.',
    materials: 'Missing materials.',
    'no-session': 'No bore link. Tether and drill into the rock first.',
    'out-of-bounds': 'Outside the survey grid.',
    'core-locked': 'The Core does not dismantle.',
    'survey-stale': 'Survey readings no longer match this rock — the assayed formation changed. Pulse the survey scanner again before anchoring.',
  };
  let text = reasons[check.reason] || 'Placement blocked.';
  if (check.reason === 'materials' && check.missing) {
    const parts = Object.keys(check.missing).sort().map((g) => `${check.missing[g]} ${commodityName(g)}`);
    text = `Missing: ${parts.join(', ')}. Site stores and ship hold are both checked.`;
  }
  return text;
}

/**
 * The refusal bank, in LENS voice. `placementReason` above is the announcer's full sentence (screen
 * readers and the ledger get the whole reason); the card gets at most five words on one line.
 */
const GHOST_BLOCK = {
  'not-hollow': 'Bore it out first',
  occupied: 'A machine sits here',
  'rover-here': 'The rover is parked here',
  'rover-not-adjacent': 'Drive the rover alongside',
  'needs-gas-contact': 'Needs a sealed pocket',
  unique: 'One Core per asteroid',
  materials: 'Missing materials',
  'no-session': 'No bore link',
  'out-of-bounds': 'Outside the grid',
  'core-locked': 'The Core does not dismantle',
  'survey-stale': 'Survey no longer matches',
};

// ------------------------------------------------------------------ the chip bank (law §6.4)
//
// "Chips come from an enumerated bank — the UI never invents text." Five tile chips are named in
// the law verbatim; `seat` and `blocked` are the placement-ghost pair the same section implies
// ("valid cells glow mint, invalid faces show the why-glyph"). Nothing else may be added without
// amending this table. `tone` is meaning, per law §3.2: gold = goal/attention, coral =
// hazard/locked, mint = valid/running.
export const LENS_CHIPS = Object.freeze({
  bore: { icon: 'bore', word: 'Bore', tone: 'gold' },        // + " 2u"
  farm: { icon: 'farm', word: 'Farm', tone: 'mint' },
  hazard: { icon: 'hazard', word: 'Hazard', tone: 'coral' },
  locked: { icon: 'locked', word: 'Locked', tone: 'coral' }, // + " Mk2"
  splits: { icon: 'splits', word: 'Splits seam', tone: 'gold' },
  seat: { icon: 'seat', word: 'Valid seat', tone: 'mint' },
  blocked: { icon: 'hazard', word: 'Blocked', tone: 'coral' },
});

/** Build one chip row entry. `suffix` is numerals only ("2u", "Mk2") — never new words. */
export function lensChip(id, suffix = '') {
  const row = LENS_CHIPS[id];
  if (!row) return null;
  return { id, icon: row.icon, tone: row.tone, text: suffix ? `${row.word} ${suffix}` : row.word };
}

// Machine status → lamp tone + the single body line. Enumerated, ≤ 5 words, no trailing period:
// a period makes it a sentence and law §6.4 wants a cause, not prose.
const STATUS_ROW = {
  running: { tone: 'mint', body: '' },
  building: { tone: 'mint', body: 'Assembling' },
  throttled: { tone: 'gold', body: 'Throttled — paint more cable' },
  starved: { tone: 'gold', body: 'Starved — feed the mill' },
  limited: { tone: 'gold', body: 'Lane throughput capped' },
  backlogged: { tone: 'gold', body: 'Lane full — clear the port' },
  stalled: { tone: 'coral', body: 'Stalled' },
  'fleet-full': { tone: 'mint', body: 'Fleet at target' },
  'no-power': { tone: 'coral', body: 'No power — paint a cable' },
  'no-pods': { tone: 'gold', body: 'No couriers — berth a pod' },
  'no-network': { tone: 'coral', body: 'No lane — paint a lane' },
  'no-geology': { tone: 'coral', body: 'No contacts — keep a face' },
  staged: { tone: 'mint', body: 'Cargo staged' },
  idle: { tone: 'idle', body: 'Idle' },
};

export function machineStatusRow(status) {
  const state = (status && status.state) || 'idle';
  const row = STATUS_ROW[state] || STATUS_ROW.idle;
  if (state === 'starved' && status && typeof status.limit === 'string' && status.limit.startsWith('input:')) {
    return { tone: row.tone, body: sentenceCase(`Starved — no ${commodityName(status.limit.slice(6))}`) };
  }
  return { ...row };
}

// ------------------------------------------------------------------ board colour sampling
//
// The swatch samples the SAME tables the board draws from (asteroidRenderer2d MATERIALS/ORE_TINTS
// are law §3.5 values, and asteroidRenderer3d reads them too), so the lens can never name a colour
// the rock does not have.
export function swatchPaint({ material, ore, type }) {
  if (type === 'empty') {
    return { fill: MATERIALS.cavity.deep, edge: MATERIALS.cavity.rimLit };
  }
  if (material === 'gas' || type === 'gas') {
    const m = MATERIALS.gas;
    return { fill: `radial-gradient(circle at 38% 34%, ${m.glow} 0%, ${m.base} 62%)`, edge: m.murk };
  }
  if (ore) {
    const t = ORE_TINTS[ore] || ORE_TINTS.cmdty_silicate;
    return { fill: `linear-gradient(145deg, ${t.glint || t.vein} 0%, ${t.vein} 58%)`, edge: t.vein };
  }
  if (material === 'basalt' || type === 'rock') {
    const m = MATERIALS.basalt;
    return { fill: `linear-gradient(145deg, ${m.facet} 0%, ${m.base} 55%, ${m.crack} 100%)`, edge: m.dark };
  }
  const m = MATERIALS.matrix;
  return { fill: `linear-gradient(145deg, ${m.band} 0%, ${m.base} 55%, ${m.fleck} 100%)`, edge: m.dark };
}

export function materialLabel({ material, ore, type }) {
  if (type === 'empty') return 'Bored tunnel';
  if (ore) return sentenceCase(commodityName(ore));
  if (material === 'gas' || type === 'gas') return MATERIALS.gas.name;
  if (material === 'basalt' || type === 'rock') return MATERIALS.basalt.name;
  return MATERIALS.matrix.name;
}

// ------------------------------------------------------------------ seam articulation probe
//
// "Splits seam" is the lens's own consequence preview: cutting THIS cell breaks its body in two.
// The renderer owns seam identity and its count (canvas.__ast3d.cellAppearance().seam), but it only
// draws a split for the RIG's aim, and it does not publish a body's cell list. So the boolean is
// computed here against the live field with the renderer's exact body definition — 4-connected,
// same ore, `type === 'vein' && tile.ore` — and nothing else. If the body cannot be resolved the
// chip is omitted; a wrong consequence chip is worse than a missing one.
const SPLIT_PROBE_LIMIT = 400;

export function seamSplits(field, cols, rows, col, row) {
  if (!field || !field[col] || !field[col][row]) return false;
  const oreOf = (c, r) => {
    const t = field[c] && field[c][r];
    return t && t.type === 'vein' && t.ore ? t.ore : null;
  };
  const ore = oreOf(col, row);
  if (!ore) return false;
  const key = (c, r) => r * cols + c;
  const body = new Set();
  const stack = [[col, row]];
  body.add(key(col, row));
  while (stack.length) {
    const [c, r] = stack.pop();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const k = key(nc, nr);
      if (body.has(k) || oreOf(nc, nr) !== ore) continue;
      body.add(k);
      if (body.size > SPLIT_PROBE_LIMIT) return false; // pathological body: say nothing
      stack.push([nc, nr]);
    }
  }
  if (body.size < 3) return false;
  const rest = new Set(body);
  rest.delete(key(col, row));
  const done = new Set();
  let parts = 0;
  for (const start of rest) {
    if (done.has(start)) continue;
    parts++;
    if (parts >= 2) return true;
    done.add(start);
    const stk = [start];
    while (stk.length) {
      const cur = stk.pop();
      const c = cur % cols;
      const r = (cur - c) / cols;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        const k = key(nc, nr);
        if (!rest.has(k) || done.has(k)) continue;
        done.add(k);
        stk.push(k);
      }
    }
  }
  return false;
}

// ------------------------------------------------------------------ models
//
// Pure: DOM in, no; facts in, a model out. Each returns the §6.4 anatomy —
//   { swatch, lamp, name, numerals, hp, chips[], body, ring }
// with `body` empty for tiles (a tile is a colour, a number and stamps — nothing to explain).

/**
 * `formation` is siteSys.surveyCellRole(): null, or this cell's role in the claim assay. It becomes
 * a ring on the swatch and NOTHING ELSE — mint when the record is durable (a Core committed it),
 * gold when the assay is still volatile and wants one. Two rings, zero words: the fact is worth
 * seeing on a hovered cell, and law §6.4 has no line to spend explaining it.
 */
export function tileLensModel({
  tile, appearance, telemetry, drillTier = 1, splits = false, formation = null, cutPreview = null,
}) {
  if (!tile) return null;
  const claim = !formation ? null
    : (formation.state === 'committed' || formation.state === 'producing' ? 'mint' : 'gold');
  const type = tile.type;
  const material = (appearance && appearance.material) || null;
  const ore = tile.ore || (appearance && appearance.ore) || null;
  const seam = (appearance && appearance.seam) || null;
  const chips = [];
  const numerals = [];

  if (type === 'empty') {
    return {
      kind: 'tile',
      swatch: swatchPaint({ material, ore: null, type }),
      lamp: null,
      name: tile.structure ? 'Machine housing' : 'Bored tunnel',
      numerals: '',
      claim,
      hp: null,
      chips,
      body: '',
      ring: null,
    };
  }

  const yieldU = Math.max(0, Math.trunc(Number(tile.yieldU) || 0));
  if (seam && seam.count > 1) numerals.push(`${seam.count} cells`);
  if (yieldU > 0) numerals.push(seam && seam.count > 1 ? `${yieldU}u/cell` : `${yieldU}u`);

  if (type === 'gas') {
    chips.push(lensChip('hazard'));
    chips.push(lensChip('farm'));           // a Gas Tap beside it turns the hazard into fuel
  } else if (type === 'vein' && ore) {
    const req = Math.max(1, Math.trunc(Number(tile.tierReq) || drillTierReqForOre(ore) || 1));
    if (req > drillTier) chips.push(lensChip('locked', `Mk${req}`));
    else if (yieldU > 0) chips.push(lensChip('bore', `${yieldU}u`));
    chips.push(lensChip('farm'));
    if (splits) chips.push(lensChip('splits'));
  } else {
    chips.push(lensChip('farm'));           // matrix and basalt are extractor feedstock
  }

  const progress = telemetry ? Math.max(0, Math.min(1, Number(telemetry.progress) || 0)) : 0;
  let body = '';
  if (cutPreview && (cutPreview.contactsLost > 0 || cutPreview.rateLost > 0)) {
    const bits = [];
    if (cutPreview.contactsLost > 0) bits.push(`Cuts ${cutPreview.contactsLost} contact${cutPreview.contactsLost === 1 ? '' : 's'}`);
    if (cutPreview.rateLost > 0) bits.push(`−${cutPreview.rateLost}/min`);
    body = bits.join(' · ');
  }
  return {
    kind: 'tile',
    swatch: swatchPaint({ material, ore, type }),
    lamp: null,
    name: materialLabel({ material, ore, type }),
    numerals: numerals.join(' · '),
    claim,
    hp: progress > 0.005 ? 1 - progress : null,
    chips: chips.filter(Boolean),
    body,
    ring: null,
  };
}

function contactCount(geo) {
  if (!geo) return 0;
  return Object.values(geo.ores || {}).reduce((a, b) => a + b, 0)
    + (geo.matrix || 0) + (geo.basalt || 0) + (geo.gas || 0);
}

export function machineLensModel(pm) {
  if (!pm) return null;
  const def = SITE_MACHINE_BY_ID.get(pm.defId);
  const status = machineStatusRow(pm.status);
  // Two short numerals at most: the machine card also carries a cause line, and the head must not
  // have to ellipsize either of them inside the 260px cap.
  const numerals = [];
  const cap = pm.capability;
  if (cap && cap.outputsPerMin) {
    const scale = cap.powerDraw > 0 ? Math.max(0, Math.min(1, pm.powerRatio == null ? 1 : pm.powerRatio)) : 1;
    const goods = Object.keys(cap.outputsPerMin).sort();
    if (goods.length) numerals.push(`${(cap.outputsPerMin[goods[0]] * scale).toFixed(1)}/min`);
  }
  if (!numerals.length && cap && cap.powerGen > 0) numerals.push(`${cap.powerGen.toFixed(0)} MW`);
  // A cause line forces the head onto one row, and the NAME is the identity — it never shrinks.
  // So a machine that has something to say gives up its second numeral rather than its name.
  const numeralBudget = status.body ? 1 : 2;
  if (numerals.length < numeralBudget && pm.geo && def && def.usesGeology) {
    numerals.push(`${contactCount(pm.geo)} contacts`);
  }
  return {
    kind: 'machine',
    swatch: null,
    lamp: status.tone,
    name: sentenceCase(def ? def.name : pm.defId),
    numerals: numerals.join(' · '),
    hp: null,
    chips: [],
    body: status.body,
    ring: (def && def.usesGeology && pm.geo) ? pm.geo.cells : null,
  };
}

/**
 * The placement ghost. NOTE what is deliberately absent: cost. Law §6.3 puts the cost chip on the
 * palette key that is unaffordable; repeating "4 Regocrete + 1 Control Unit" beside the cursor is
 * the context bay's prose sneaking back in. The lens answers the placement question instead — does
 * this seat work, and what does it touch.
 */
export function ghostLensModel(defId, check) {
  const def = SITE_MACHINE_BY_ID.get(defId);
  const ok = !!(check && check.ok);
  const profile = check && check.profile;
  return {
    kind: 'ghost',
    swatch: null,
    lamp: ok ? 'mint' : 'coral',
    name: sentenceCase(def ? def.name : defId),
    numerals: profile ? `${contactCount(profile)} contacts` : '',
    hp: null,
    chips: [lensChip(ok ? 'seat' : 'blocked')].filter(Boolean),
    body: ok ? '' : (GHOST_BLOCK[check && check.reason] || 'Placement blocked'),
    ring: (check && check.profile) ? check.profile.cells : null,
  };
}

// ------------------------------------------------------------------ the card
const SVG_NS = 'http://www.w3.org/2000/svg';

// 16-unit currentColor line icons. SVG, not glyphs: a font glyph is a lottery across platforms and
// a background-image is stripped by forced-colors (see the frontend icon ruling).
const ICON_PATHS = {
  bore: ['M8 1.5v6.5', 'M5 5.5 8 8.5l3-3', 'M2.5 12.5h11'],
  farm: ['M13.2 8a5.2 5.2 0 1 1-1.9-4', 'M13.4 1.6v3.2h-3.2'],
  hazard: ['M8 2.2 14.2 13H1.8z', 'M8 6.2v3.1', 'M8 11.3h.01'],
  locked: ['M4.6 7.2V5.4a3.4 3.4 0 0 1 6.8 0v1.8', 'M3.4 7.2h9.2v6.2H3.4z'],
  splits: ['M8 1.6v3.6', 'M8 5.2 4.4 9v5.2', 'M8 5.2 11.6 9v5.2'],
  seat: ['M2.6 8.6 6.4 12.4l7-8.8'],
};

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of ICON_PATHS[name] || ICON_PATHS.seat) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

/**
 * The card itself. `host` must be a positioned element (the stage) — the lens is absolutely placed
 * inside it rather than fixed to the viewport, so a transformed screen stack cannot shift it.
 *
 * Returns { root, render(model), showAt(clientX, clientY), hide(), visible, destroy }.
 */
export function createCursorLens(host) {
  const root = document.createElement('div');
  root.className = 'aw-lens';
  root.hidden = true;
  // Never interactive: with a 150ms delay the card can land exactly where the pointer is heading,
  // and an intercepting card would fire the canvas mouseleave that hides it — a flicker loop.
  root.setAttribute('aria-hidden', 'true');

  const head = document.createElement('div');
  head.className = 'aw-lens-head';
  const mark = document.createElement('span');
  mark.className = 'aw-lens-swatch';
  const nameEl = document.createElement('span');
  nameEl.className = 'aw-lens-name';
  const numEl = document.createElement('span');
  numEl.className = 'aw-lens-num';
  head.append(mark, nameEl, numEl);

  const hpEl = document.createElement('span');
  hpEl.className = 'aw-lens-hp';
  const hpFill = document.createElement('i');
  hpEl.appendChild(hpFill);

  const chipRow = document.createElement('div');
  chipRow.className = 'aw-lens-chips';

  const bodyEl = document.createElement('div');
  bodyEl.className = 'aw-lens-body';

  const ringEl = document.createElement('div');
  ringEl.className = 'aw-lens-ring';

  root.append(head, chipRow, bodyEl, ringEl);
  host.appendChild(root);

  let visible = false;
  let signature = '';

  function ringSignature(cells) {
    if (!Array.isArray(cells) || !cells.length) return '';
    return cells.map((c) => `${c.col},${c.row},${c.kind},${c.ore || ''}`).join(';');
  }

  function paintRing(cells) {
    ringEl.replaceChildren();
    if (!Array.isArray(cells) || !cells.length) { ringEl.hidden = true; return; }
    let minC = Infinity; let maxC = -Infinity; let minR = Infinity; let maxR = -Infinity;
    for (const c of cells) {
      minC = Math.min(minC, c.col); maxC = Math.max(maxC, c.col);
      minR = Math.min(minR, c.row); maxR = Math.max(maxR, c.row);
    }
    const centerC = (minC + maxC) / 2;
    const centerR = (minR + maxR) / 2;
    const byPos = new Map();
    for (const c of cells) {
      const dc = Math.round(c.col - centerC);
      const dr = Math.round(c.row - centerR);
      if (dc < -1 || dc > 1 || dr < -1 || dr > 1) continue;
      byPos.set((dr + 1) * 3 + (dc + 1), c);
    }
    // No label: law §6.4 wants the schematic "small, no prose", and a caption would be a third
    // text line. The 3×3 shape is self-describing beside a machine.
    ringEl.setAttribute('role', 'presentation');
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('span');
      if (i === 4) {
        cell.className = 'aw-lens-ring-cell center';
      } else {
        const c = byPos.get(i);
        const kind = c ? c.kind : 'empty';
        cell.className = 'aw-lens-ring-cell';
        if (kind === 'empty') cell.classList.add('hollow');
        else if (kind === 'ore') cell.style.background = (ORE_TINTS[c.ore] || {}).vein || MATERIALS.matrix.base;
        else if (kind === 'gas') cell.style.background = MATERIALS.gas.glow;
        else if (kind === 'matrix') cell.style.background = MATERIALS.matrix.base;
        else cell.style.background = MATERIALS.basalt.base;
      }
      ringEl.appendChild(cell);
    }
    ringEl.hidden = false;
  }

  function render(model) {
    if (!model) { hide(); return false; }
    const chips = (model.chips || []).filter(Boolean).slice(0, 5);
    const sig = [
      model.kind, model.name, model.numerals, model.lamp || '',
      model.hp == null ? '' : model.hp.toFixed(2), model.claim || '',
      chips.map((c) => c.id + c.text + c.tone).join('|'),
      model.body || '', ringSignature(model.ring),
      model.swatch ? model.swatch.fill : '',
    ].join('~');
    if (sig === signature) return true;
    signature = sig;

    if (model.swatch) {
      mark.className = `aw-lens-swatch${model.claim ? ` claim-${model.claim}` : ''}`;
      mark.style.background = model.swatch.fill;
      mark.style.boxShadow = `inset 0 0 0 1px ${model.swatch.edge}`;
      mark.hidden = false;
    } else if (model.lamp) {
      mark.className = `aw-lens-swatch lamp ${model.lamp}`;
      mark.style.background = '';
      mark.style.boxShadow = '';
      mark.hidden = false;
    } else {
      mark.hidden = true;
    }

    nameEl.textContent = model.name || '';
    numEl.textContent = model.numerals || '';
    numEl.hidden = !model.numerals;

    if (model.hp == null) {
      if (hpEl.parentNode) hpEl.remove();
    } else {
      hpFill.style.width = `${Math.round(model.hp * 100)}%`;
      hpFill.className = model.hp < 0.34 ? 'low' : '';
      if (!hpEl.parentNode) head.appendChild(hpEl);
    }

    chipRow.replaceChildren();
    for (const chip of chips) {
      const el = document.createElement('span');
      el.className = `aw-lens-chip ${chip.tone}`;
      el.appendChild(icon(chip.icon));
      const t = document.createElement('span');
      t.textContent = chip.text;
      el.appendChild(t);
      chipRow.appendChild(el);
    }
    chipRow.hidden = !chips.length;

    // Law §6.4: at most ONE body line, and never tutorial copy. The banks above are the only
    // source, so this is a belt-and-braces trim rather than a formatter.
    bodyEl.textContent = model.body || '';
    bodyEl.hidden = !model.body;
    // The head may wrap so a two-word material name is never ellipsized inside the 260px cap —
    // but only when it is the card's ONLY text. A body line below it would make three.
    head.classList.toggle('nowrap', !!model.body);

    paintRing(model.ring);
    return true;
  }

  /**
   * Place the card. `clientX/clientY` is the cursor; `avoid` is the SUBJECT's box in client space
   * ({ left, top, right, bottom }) when the caller knows it.
   *
   * Law §6.4 gives two rules that fight each other on a 120px board cell: "offset +18/+18 from the
   * cursor" and "never covers the cell it describes". A cursor in the middle of a work-zoom cell
   * puts +18 squarely on top of the thing being named. So the offset is the FLOOR and the subject's
   * own box is the keep-out: the card takes whichever is further out, and flips to the other side
   * of both at a screen edge.
   */
  function showAt(clientX, clientY, avoid = null) {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // Measure before placing: offsetWidth is 0 while hidden, and a card placed from a stale
    // measurement flashes in the wrong corner for a frame.
    if (root.hidden) {
      root.style.visibility = 'hidden';
      root.hidden = false;
    }
    const w = root.offsetWidth;
    const h = root.offsetHeight;
    const px = clientX - r.left;
    const py = clientY - r.top;
    const keep = avoid ? {
      left: avoid.left - r.left, right: avoid.right - r.left,
      top: avoid.top - r.top, bottom: avoid.bottom - r.top,
    } : null;

    let x = px + 18;
    if (keep) x = Math.max(x, keep.right + 8);
    if (x + w > r.width - 8) {
      x = px - 18 - w;
      if (keep) x = Math.min(x, keep.left - 8 - w);
    }
    let y = py + 18;
    if (keep) y = Math.max(y, keep.bottom + 8);
    if (y + h > r.height - 8) {
      y = py - 18 - h;
      if (keep) y = Math.min(y, keep.top - 8 - h);
    }
    root.style.left = `${Math.max(8, Math.min(x, r.width - w - 8))}px`;
    root.style.top = `${Math.max(8, Math.min(y, r.height - h - 8))}px`;
    root.style.visibility = '';
    visible = true;
  }

  function hide() {
    if (!root.hidden) {
      root.hidden = true;
      root.style.visibility = '';
    }
    visible = false;
  }

  return {
    root,
    render,
    showAt,
    hide,
    get visible() { return visible; },
    destroy() { root.remove(); },
  };
}
