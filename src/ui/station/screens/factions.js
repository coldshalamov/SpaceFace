// src/ui/station/screens/factions.js — "Standing & Relations" instrument.
// Central radial standing dial (color-coded meter, not a raw number) + a selectable
// faction rail + progressive-disclosure detail. Read-only: reflects state.factions[id].rep.
//
// Screen module shape (hosted by stationApp): create(ctx) -> { el, onShow, refresh, dispose }.
// Instrument grammar: one DISPLAY (selected power's name), colour by meaning, 12px floor,
// --sf-data-face on figures. Same tokens as mission log — not a second palette.
import { FACTION_META } from '../../../data/factions.js';
import { NEW_GAME } from '../../../data/newGameDefaults.js';
import { SECTORS } from '../../../data/sectors.js';
import { shouldHideOwnRepDelta } from '../../../story/endings/publicIdentity.js';
import {
  tierFor,
  FACTION_TIERS,
  FACTION_AGGRO_THRESHOLD,
  factionStandingGuidance,
} from '../../screens/factions.js';
import { escapeHtml } from '../../comms.js';
import { icon, factionIcon } from '../icons.js';

// Colour by MEANING. The tier WORD (Sworn Enemy … Hero) names the band; hue only says
// against you / at rest / a gain. Azure and per-faction brand tints were decoration.
const IDENTITY = 'var(--sf-calm)';
const ALIGN = 'var(--sf-you)';
const RIVAL = 'var(--sf-foe)';
const STYLE_ID = 'sf-factions-style';
const STATION_FACTION = new Map();
for (const sector of SECTORS) {
  for (const station of (sector.stations || [])) STATION_FACTION.set(station.id, station.factionId || sector.factionId || null);
}

const DIAL_MIN = -1000;
const DIAL_MAX = 1000;
const REP_SPAN = DIAL_MAX; // arc spans ±135° at ±1000

// J05: every row, relation node and network core previously drew `icon('factions')` — ONE generic
// shield repeated fourteen times, so the roster was a column of identical marks distinguishable
// only by their text label. `factionIcon` returns that power's own heraldry, and '' for an id it
// does not know, in which case we fall back to the generic mark rather than render nothing.
function crest(id, size) {
  return factionIcon(id, size) || icon('factions', size);
}

function tierIndex(rep) {
  const t = tierFor(rep);
  const i = FACTION_TIERS.indexOf(t);
  return i < 0 ? 4 : i;
}
export function standingColorAt(i) {
  if (i <= 3) return 'var(--sf-foe)';
  if (i === 4) return 'var(--sf-calm)';
  return 'var(--sf-you)';
}
export function standingColor(rep) { return standingColorAt(tierIndex(rep)); }

function reduceMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function repOf(state, id) {
  const live = state && state.factions && state.factions[id];
  if (live && Number.isFinite(Number(live.rep))) return Math.round(Number(live.rep));
  const seed = NEW_GAME.factionRep && NEW_GAME.factionRep[id];
  return Number.isFinite(Number(seed)) ? Math.round(Number(seed)) : 0;
}

function clampRep(r) { return Math.max(DIAL_MIN, Math.min(DIAL_MAX, Number(r) || 0)); }

// rotation(deg) for a needle drawn pointing UP: 0 at rep 0, ±135° at ±1000.
function repToRot(rep) { return (clampRep(rep) / REP_SPAN) * 135; }

// point on the dial circle for a given needle rotation (up = -Y).
function pointAt(cx, cy, r, rotDeg) {
  const rad = (rotDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function arcSeg(cx, cy, r, rot0, rot1) {
  const a = pointAt(cx, cy, r, rot0);
  const b = pointAt(cx, cy, r, rot1);
  const large = Math.abs(rot1 - rot0) > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function nextTierInfo(rep) {
  const r = clampRep(rep);
  for (const t of FACTION_TIERS) {
    if (r < t.min) return { name: t.name, need: t.min - r, at: t.min };
  }
  return null; // already Hero
}

function signed(value) {
  const n = Math.round(Number(value) || 0);
  return `${n > 0 ? '+' : ''}${n}`;
}

function liveFaction(state, id) {
  return (state && state.factions && state.factions[id]) || null;
}

function relationEntries(meta) {
  return Object.entries((meta && meta.relations) || {})
    .map(([id, weight]) => ({ id, weight: Number(weight) || 0 }))
    .filter((entry) => Math.abs(entry.weight) >= 0.19)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 7);
}

// Build the static dial svg (arc segments + ticks + track). Needle + labels are separate.
function buildDialSvg() {
  const S = 260, cx = 130, cy = 138, R = 104;
  const mins = FACTION_TIERS.map((t) => t.min).concat([DIAL_MAX]);
  let segs = '';
  for (let i = 0; i < FACTION_TIERS.length; i++) {
    const rot0 = repToRot(mins[i]);
    const rot1 = repToRot(mins[i + 1]);
    segs += `<path class="sx-dial-seg" style="stroke:${standingColorAt(i)}" d="${arcSeg(cx, cy, R, rot0, rot1)}"/>`;
  }
  // faint full track under the coloured arc
  const track = `<path class="sx-dial-track" d="${arcSeg(cx, cy, R, -135, 135)}"/>`;
  // tick marks at each tier boundary
  let ticks = '';
  for (let i = 1; i < FACTION_TIERS.length; i++) {
    const rot = repToRot(FACTION_TIERS[i].min);
    const a = pointAt(cx, cy, R + 6, rot);
    const b = pointAt(cx, cy, R + 12, rot);
    ticks += `<line class="sx-dial-tick" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
  }
  // marker rides ON the arc at the current value (rotated group), leaving the centre readout
  // clean. Drawn at top (cx, cy-R) and rotated by the rep angle via CSS transform.
  const my = (cy - R).toFixed(1);
  const marker =
    `<g class="sx-dial-marker" style="transform-origin:${cx}px ${cy}px">` +
    `<circle cx="${cx}" cy="${my}" r="11" class="sx-dial-marker-halo"/>` +
    `<circle cx="${cx}" cy="${my}" r="6.5" class="sx-dial-marker-dot"/>` +
    `</g>`;
  return `<svg class="sx-dial-svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="Standing threshold instrument">${track}${segs}${ticks}${marker}</svg>`;
}

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = FACTIONS_CSS;
  document.head.appendChild(s);
}

// Named FACTIONS_CSS, not CSS: selectFaction below calls the global CSS.escape, and a module
// binding named CSS shadows it — every node/tab click threw "CSS.escape is not a function".
const FACTIONS_CSS = `
.sx-fac { font-family: var(--sf-body-face); font-size: 14px; color: var(--sf-paper); }
.sx-fac .sf-fig, .sx-fac .sx-dial-rep, .sx-fac .sx-ladder__min {
  font-family: var(--sf-data-face); font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: 0;
}
.sx-fac .sx-fac-row { color: var(--sf-paper); background: transparent; border-left: var(--sf-rail-w) solid transparent; }
.sx-fac .sx-fac-row.is-active {
  border-left-color: var(--sf-you);
  background: color-mix(in srgb, var(--sf-you) 8%, transparent);
}
.sx-fac .sx-fac-row__crest { color: var(--sf-calm); }
.sx-fac .sx-fac-row__name { color: var(--sf-paper); font-family: var(--sf-body-face); font-size: 13px; letter-spacing: 0; }
.sx-fac .sx-fac-row__bar { background: var(--sf-edge); }
.sx-fac .sx-fac-row__tier {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase;
}
.sx-fac .sx-fac-standing {
  position: absolute; z-index: 4; left: 0; top: 0; bottom: 0; width: 430px;
  display: grid; grid-template-columns: 190px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 122px;
  align-items: center; padding: var(--sp-3) var(--sp-4) 0; overflow: hidden;
  min-width: 0; min-height: 0; border: 0; border-radius: 0;
  background: color-mix(in srgb, var(--sf-surface) 88%, transparent); box-shadow: none;
}
.sx-fac .sx-fac-standing::before { content: none; }
.sx-fac .sx-fac-ident h2 {
  font-family: var(--sf-display-face); font-weight: 700; font-size: 28px; line-height: 1.1;
  letter-spacing: 0; text-transform: none; color: var(--sf-paper); margin: var(--sp-2) 0 var(--sp-1);
}
.sx-fac .sx-fac-ident__flag {
  color: var(--sf-calm); font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase;
}
.sx-fac .sx-fac-ident p { margin: 0; color: var(--sf-calm); font-family: var(--sf-body-face); font-size: 13px; line-height: 1.35; }
.sx-fac .sx-dial-tier {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 15px; letter-spacing: 0; text-transform: uppercase;
}
.sx-fac .sx-dial-rep, .sx-fac .sx-dial--compact .sx-dial-rep { font-size: 20px; color: var(--sf-paper); }
.sx-fac .sx-dial-next, .sx-fac .sx-dial--compact .sx-dial-next {
  color: var(--sf-goal); font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase; text-align: center;
}
.sx-fac .sx-dial-marker { transition: transform var(--sf-t-settle) var(--sf-ease); }
.sx-fac .sx-dial-marker-dot, .sx-fac .sx-dial-marker-halo { fill: var(--standing); }
.sx-fac .sx-dial-track { stroke: var(--sf-edge); }
.sx-fac .sx-fac-decisions { border-top-color: var(--sf-edge); background: color-mix(in srgb, var(--sf-surface) 92%, transparent); }
.sx-fac .sx-fac-decisions > div { border-right-color: var(--sf-edge); }
.sx-fac .sx-fac-decisions span {
  color: var(--sf-calm); font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase;
}
.sx-fac .sx-fac-decisions b { color: var(--sf-paper); font-family: var(--sf-body-face); font-weight: 600; font-size: 13px; }
.sx-fac .sx-fac-decisions em { color: var(--sf-calm); font-family: var(--sf-body-face); font-size: 13px; font-style: normal; }
.sx-fac .sx-fac-network { background: color-mix(in srgb, var(--sf-surface) 80%, transparent); box-shadow: none; animation: none; }
.sx-fac .sx-fac-network > svg line { animation: none !important; filter: none; stroke: var(--relation); }
.sx-fac .sx-fac-network > header span {
  color: color-mix(in srgb, var(--sf-calm) 78%, var(--sf-paper));
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase;
}
.sx-fac .sx-fac-network > header b {
  color: color-mix(in srgb, var(--sf-calm) 78%, var(--sf-paper));
  font-family: var(--sf-body-face); font-weight: 400; font-size: 13px;
}
.sx-fac .sx-fac-network__core {
  border-color: var(--sf-edge); background: color-mix(in srgb, var(--sf-surface) 94%, transparent);
  box-shadow: none; border-radius: 0;
}
.sx-fac .sx-fac-network__core b { color: var(--sf-paper); font-family: var(--sf-subhead-face); font-weight: 600; font-size: 13px; }
.sx-fac .sx-fac-network__core em {
  color: var(--sf-calm); font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); font-style: normal;
}
.sx-fac .sx-fac-node {
  border-color: var(--sf-edge); border-left: var(--sf-rail-w) solid var(--relation);
  background: color-mix(in srgb, var(--sf-surface) 90%, transparent); box-shadow: none; border-radius: 0;
}
.sx-fac .sx-fac-node:hover {
  z-index: 4; border-color: var(--relation);
  background: color-mix(in srgb, var(--sf-surface) 80%, transparent);
  transform: translate(-50%, -50%);
}
.sx-fac .sx-fac-node__mark { color: var(--sf-calm); }
.sx-fac .sx-fac-node__copy b { color: var(--sf-paper); font-family: var(--sf-body-face); font-weight: 500; font-size: 13px; }
.sx-fac .sx-fac-node__copy em {
  color: var(--relation); font-family: var(--sf-data-face); font-weight: 500; font-size: 12px;
  font-style: normal; letter-spacing: 0;
}
.sx-fac .sx-fac-network > footer { color: var(--sf-calm); font-family: var(--sf-body-face); font-size: 13px; }
.sx-fac .sx-fac-network > footer i.is-aligned { color: var(--sf-you); }
.sx-fac .sx-fac-network > footer i.is-rival { color: var(--sf-foe); }
.sx-fac .sx-fac-network__empty { color: var(--sf-calm); font-family: var(--sf-body-face); font-size: 13px; }
.sx-fac .sx-fac-ladder__head > span, .sx-fac .sx-fac-intent span {
  color: var(--sf-calm); font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase;
}
.sx-fac .sx-fac-ladder__head > b, .sx-fac .sx-fac-intent b {
  color: var(--sf-paper); font-family: var(--sf-body-face); font-weight: 500; font-size: 13px;
}
.sx-fac .sx-fac-intent em { color: var(--sf-calm); font-family: var(--sf-body-face); font-size: 13px; font-style: normal; }
.sx-fac .sx-ladder__name {
  color: var(--sf-calm); font-family: var(--sf-subhead-face); font-weight: 500; font-size: 12px;
  letter-spacing: var(--sf-track-micro);
}
.sx-fac .sx-ladder__min { font-size: 13px; color: var(--sf-calm); }
.sx-fac .sx-ladder__step.is-current {
  background: color-mix(in srgb, var(--standing, var(--sf-calm)) 12%, transparent);
  box-shadow: none; border-bottom: var(--sf-rail-w) solid var(--standing, var(--sf-you));
}
/* Fourteen powers cannot fit one 176px card row at dock width — the strip used to overflow-x with
   its scrollbar invisible under the rail's edge fade, so the last power rendered as a sheared
   sliver. Wrapping the strip into a second row keeps every card whole at every dock width; the
   field below absorbs the taller rail because its row is content-sized now. */
.sx-fac { grid-template-rows: auto minmax(0, 1fr) auto; }
.sx-fac .sx-fac__rail {
  flex-flow: row wrap;
  overflow-y: hidden;
  align-content: start;
  /* The shared rail theming drew its "bottom edge" hairline 68px down; with two card rows that
     line crosses the second row, so the rail keeps only the vertical head separator (edge token). */
  background: linear-gradient(90deg, transparent 0 180px, var(--sf-edge, #2c343f) 180px 181px, transparent 181px);
  -webkit-mask-image: none;
  mask-image: none;
}
.sx-fac .sx-fac-row { flex: 0 1 176px; min-width: 158px; }
@media (max-width: 1220px) {
  .sx-fac .sx-fac-standing { grid-template-columns: 160px minmax(0, 1fr); padding-inline: var(--sp-3); width: 380px; }
}
@media (max-width: 1180px) {
  .sx-fac .sx-fac-standing { width: 380px; }
}
@media (prefers-reduced-motion: reduce) {
  .sx-fac, .sx-fac * { animation: none !important; transition: none !important; }
}
@media (forced-colors: active) {
  .sx-fac, .sx-fac .sx-fac-standing, .sx-fac .sx-fac-network, .sx-fac .sx-fac-node, .sx-fac .sx-fac-row {
    background: Canvas; color: CanvasText; border-color: CanvasText;
  }
  .sx-fac .sx-fac-row.is-active, .sx-fac .sx-ladder__step.is-current {
    border-left-color: CanvasText; border-bottom-color: CanvasText;
  }
}
`;

export function createFactionsScreen(ctx) {
  injectStyle();
  const el = document.createElement('div');
  el.className = 'sx-fac';

  // faction list (real names from FACTION_META; rep from state)
  const factions = FACTION_META.map((m) => ({ id: m.id, name: m.name || m.id, meta: m }));
  let selectedId = factions[0] && factions[0].id;
  let picked = false;
  let lastRot = 0; // for smooth needle animation between selections

  el.innerHTML =
    `<nav class="sx-fac__rail sf-apron" aria-label="Factions"></nav>` +
    `<section class="sx-fac__stage sf-stage" aria-live="polite"></section>` +
    `<aside class="sx-fac__detail"></aside>`;

  const railEl = el.querySelector('.sx-fac__rail');
  const stageEl = el.querySelector('.sx-fac__stage');
  const detailEl = el.querySelector('.sx-fac__detail');
  railEl.setAttribute('role', 'tablist');

  function renderRail(state) {
    const authorityId = STATION_FACTION.get(state && state.ui && state.ui.dockedStationId);
    railEl.innerHTML = factions.map((f) => {
      const rep = repOf(state, f.id);
      const tier = tierFor(rep);
      const col = standingColor(rep);
      const tint = IDENTITY;
      const frac = (clampRep(rep) - DIAL_MIN) / (DIAL_MAX - DIAL_MIN);
      const active = f.id === selectedId ? ' is-active' : '';
      return (
        `<button type="button" class="sx-fac-row${active}" data-fac="${escapeHtml(f.id)}" role="tab" aria-selected="${f.id === selectedId}">` +
          `<span class="sx-fac-row__crest" style="--tint:${tint}">${crest(f.id, 18)}</span>` +
          `<span class="sx-fac-row__body">` +
            `<span class="sx-fac-row__name">${escapeHtml(f.name)}</span>` +
            `<span class="sx-fac-row__bar"><span class="sx-fac-row__mid"></span><span class="sx-fac-row__fill" style="width:${(frac * 100).toFixed(1)}%;background:${col}"></span></span>` +
          `</span>` +
          `<span class="sx-fac-row__tier" style="color:${col}">${f.id === authorityId ? 'AUTHORITY · ' : ''}${escapeHtml(tier.name)}</span>` +
        `</button>`
      );
    }).join('');
  }

  function renderStage(state, animate) {
    const f = factions.find((x) => x.id === selectedId) || factions[0];
    const rep = repOf(state, f.id);
    const tier = tierFor(rep);
    const col = standingColor(rep);
    const tint = IDENTITY;
    const next = nextTierInfo(rep);
    const live = liveFaction(state, f.id);
    const guidance = factionStandingGuidance(rep, f.meta || {}, live && live.lastDelta, {
      hideLastDelta: shouldHideOwnRepDelta(state),
    });
    const relations = relationEntries(f.meta);
    const positions = relations.map((relation, index) => {
      const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / Math.max(1, relations.length));
      return {
        ...relation,
        x: 50 + Math.cos(angle) * 34,
        y: 50 + Math.sin(angle) * 34,
      };
    });
    const lines = positions.map((relation) => {
      const relationColor = relation.weight > 0 ? ALIGN : RIVAL;
      return `<line x1="50" y1="50" x2="${relation.x.toFixed(2)}" y2="${relation.y.toFixed(2)}" ` +
        `style="--relation:${relationColor};--weight:${Math.abs(relation.weight).toFixed(2)}"/>`;
    }).join('');
    const nodes = positions.map((relation) => {
      const related = factions.find((candidate) => candidate.id === relation.id);
      const relatedRep = repOf(state, relation.id);
      const relationColor = relation.weight > 0 ? ALIGN : RIVAL;
      return `<button type="button" class="sx-fac-node" data-fac="${escapeHtml(relation.id)}" ` +
        `style="--x:${relation.x.toFixed(2)}%;--y:${relation.y.toFixed(2)}%;--relation:${relationColor};--identity:${IDENTITY}" ` +
        `aria-label="Inspect ${escapeHtml(related ? related.name : relation.id)}, ${relation.weight > 0 ? 'aligned' : 'rival'} relation ${Math.abs(relation.weight).toFixed(2)}">` +
          `<span class="sx-fac-node__mark">${crest(relation.id, 15)}</span>` +
          `<span class="sx-fac-node__copy"><b>${escapeHtml(related ? related.name : relation.id)}</b>` +
          `<em>${relation.weight > 0 ? 'ALIGN' : 'RIVAL'} ${Math.abs(relation.weight).toFixed(2)} · ${signed(relatedRep)}</em></span>` +
        `</button>`;
    }).join('');
    const authorityId = STATION_FACTION.get(state && state.ui && state.ui.dockedStationId);
    const controls = (f.meta && f.meta.controls) || [];
    stageEl.innerHTML =
      `<div class="sx-fac-overview" style="--tint:${tint};--standing:${col}">` +
        `<section class="sx-fac-standing" aria-label="Standing with ${escapeHtml(f.name)}">` +
          `<div class="sx-dial sx-dial--compact">` +
            buildDialSvg() +
            `<div class="sx-dial-core">` +
              `<span class="sx-dial-tier" style="color:${col}">${escapeHtml(tier.name)}</span>` +
              `<span class="sx-dial-rep sf-fig">${signed(rep)}</span>` +
              `<span class="sx-dial-next">${next ? `${next.need} TO ${escapeHtml(next.name)}` : 'PEAK HELD'}</span>` +
            `</div>` +
          `</div>` +
          `<div class="sx-fac-ident sf-crest">` +
            `<span class="sx-fac-ident__flag">${f.id === authorityId ? 'CURRENT STATION AUTHORITY' : 'EXTERNAL POWER'}</span>` +
            `<h2>${escapeHtml(f.name)}</h2>` +
            `<p>${controls.length ? escapeHtml(controls.slice(0, 3).join(' · ')) : 'No confirmed jurisdiction at this berth'}</p>` +
          `</div>` +
          `<div class="sx-fac-decisions">` +
            `<div><span>NOW</span><b class="sf-fig" style="color:${col}">${escapeHtml(tier.name)} ${signed(rep)}</b><em>${escapeHtml(guidance.last)}</em></div>` +
            `<div><span>NEXT</span><b class="sf-fig">${next ? escapeHtml(`${next.need} reputation`) : 'Standing cap'}</b><em>${escapeHtml(guidance.next)}</em></div>` +
            `<div><span>HOSTILITY BUFFER</span><b class="sf-fig">${Math.max(0, rep - FACTION_AGGRO_THRESHOLD)} rep</b><em>${escapeHtml(guidance.risk)}</em></div>` +
          `</div>` +
        `</section>` +
        `<section class="sx-fac-network" aria-label="Relationship field for ${escapeHtml(f.name)}">` +
          `<header><span>RELATION FIELD</span><b>Select a connected power to follow the consequence web</b></header>` +
          (relations.length
            ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>` +
              `<div class="sx-fac-network__core"><span style="--identity:${tint}">${crest(f.id, 25)}</span><b>${escapeHtml(f.meta.short || f.name)}</b><em>SELECTED</em></div>${nodes}`
            : `<div class="sx-fac-network__empty">NO MATERIAL RELATIONS RECORDED</div>`) +
          `<footer><span><i class="is-aligned"></i> aligned spillover</span><span><i class="is-rival"></i> rival spillover</span></footer>` +
        `</section>` +
      `</div>`;

    // animate the marker from its previous rotation to the new value along the arc
    const marker = stageEl.querySelector('.sx-dial-marker');
    const target = repToRot(rep);
    const motion = animate && !reduceMotion();
    if (marker) {
      const start = motion ? lastRot : target;
      marker.style.transition = 'none';
      marker.style.transform = `rotate(${start}deg)`;
      void marker.getBoundingClientRect();
      if (motion) {
        requestAnimationFrame(() => {
          marker.style.transition = '';
          marker.style.transform = `rotate(${target}deg)`;
        });
      } else {
        marker.style.transform = `rotate(${target}deg)`;
      }
    }
    lastRot = target;
  }

  function renderDetail(state) {
    const f = factions.find((x) => x.id === selectedId) || factions[0];
    const rep = repOf(state, f.id);
    const curIdx = tierIndex(rep);
    const ladder = FACTION_TIERS.map((t, i) => {
      const on = i <= curIdx ? ' is-reached' : '';
      const here = i === curIdx ? ' is-current' : '';
      return (
        `<li class="sx-ladder__step${on}${here}">` +
          `<span class="sx-ladder__dot" style="background:${i <= curIdx ? standingColorAt(i) : 'transparent'};border-color:${standingColorAt(i)}"></span>` +
          `<span class="sx-ladder__name">${escapeHtml(t.name)}</span>` +
          `<span class="sx-ladder__min sf-fig">${t.min > 0 ? '+' : ''}${t.min}</span>` +
        `</li>`
      );
    }).join('');
    const meta = f.meta || {};
    const guidance = factionStandingGuidance(rep, meta, liveFaction(state, f.id) && liveFaction(state, f.id).lastDelta, {
      hideLastDelta: shouldHideOwnRepDelta(state),
    });
    const relations = relationEntries(meta);

    detailEl.innerHTML =
      `<div class="sx-fac-ladder" style="--standing:${standingColor(rep)}">` +
        `<div class="sx-fac-ladder__head">${icon('spark', 15)}<span>Standing ladder</span><b>Each threshold changes access and contract consequence</b></div>` +
        `<ol class="sx-ladder">${ladder}</ol>` +
      `</div>` +
      `<div class="sx-fac-intent">` +
        `<span>NEXT MOVE</span><b>${escapeHtml(guidance.plan)}</b>` +
        `<em>${relations.length} consequential relation${relations.length === 1 ? '' : 's'} mapped</em>` +
      `</div>`;
  }

  function refresh(c) {
    const state = (c || ctx).state || {};
    renderRail(state);
    renderStage(state, false);
    renderDetail(state);
  }

  function selectFaction(id) {
    if (!factions.some((f) => f.id === id) || id === selectedId) return;
    selectedId = id;
    picked = true;
    const state = (ctx && ctx.state) || {};
    renderRail(state);
    renderStage(state, true);
    renderDetail(state);
    const active = railEl.querySelector(`[data-fac="${CSS.escape(id)}"]`);
    if (active && active.scrollIntoView) active.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
    if (ctx && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  }

  function onFactionClick(ev) {
    const btn = ev.target.closest('[data-fac]');
    if (!btn) return;
    selectFaction(btn.getAttribute('data-fac'));
  }
  railEl.addEventListener('click', onFactionClick);
  stageEl.addEventListener('click', onFactionClick);

  const onRepChanged = (payload = {}) => {
    if (!payload.factionId || payload.factionId === selectedId) refresh(ctx);
    else renderRail((ctx && ctx.state) || {});
  };
  if (ctx.bus && ctx.bus.on) ctx.bus.on('faction:repChanged', onRepChanged);

  return {
    el,
    onShow(c) {
      const state = (c || ctx).state || {};
      if (!picked) {
        const authorityId = STATION_FACTION.get(state && state.ui && state.ui.dockedStationId);
        if (authorityId && factions.some((f) => f.id === authorityId)) selectedId = authorityId;
        picked = true;
      }
      refresh(c);
    },
    refresh,
    dispose() {
      if (ctx.bus && ctx.bus.off) ctx.bus.off('faction:repChanged', onRepChanged);
    },
  };
}
