// src/ui/station/screens/factions.js — "Standing & Relations" instrument.
// Central radial standing dial (color-coded meter, not a raw number) + a selectable
// faction rail + progressive-disclosure detail. Read-only: reflects state.factions[id].rep.
//
// Screen module shape (hosted by stationApp): create(ctx) -> { el, onShow, refresh, dispose }.
import { FACTION_META } from '../../../data/factions.js';
import { NEW_GAME } from '../../../data/newGameDefaults.js';
import { SECTORS } from '../../../data/sectors.js';
import {
  tierFor,
  FACTION_TIERS,
  FACTION_AGGRO_THRESHOLD,
  factionStandingGuidance,
} from '../../screens/factions.js';
import { escapeHtml } from '../../comms.js';
import { icon } from '../icons.js';

// Standing colour ramp — meaningful, ordered crimson→gold. Index-aligned to FACTION_TIERS
// (9 tiers, Sworn Enemy … Hero). This is the STANDING colour (how they feel about you).
const STANDING_RAMP = [
  '#b3243f', // Sworn Enemy
  '#d8433f', // Hated
  '#ee6a3d', // Hostile
  '#e0a24e', // Disliked (amber)
  '#8ba0bd', // Neutral (cool grey-blue)
  '#4aa8ff', // Accepted (azure)
  '#35c2a6', // Trusted (teal)
  '#3fd07f', // Allied (green)
  '#ffcf5a', // Hero (gold)
];

// Faction identity tint (WHO they are) — distinct from standing colour. Keyed by id.
const FACTION_TINT = {
  faction_scn: '#5b8dd6',
  faction_mts: '#d8b25a',
  faction_dmc: '#d17a4b',
  faction_reach: '#c1543f',
  faction_quiet: '#9b8bd0',
  faction_vael: '#cf5d86',
  faction_free: '#46b4a4',
  faction_choir: '#78c6d8',
};
const DEFAULT_TINT = '#4aa8ff';
const STATION_FACTION = new Map();
for (const sector of SECTORS) {
  for (const station of (sector.stations || [])) STATION_FACTION.set(station.id, station.factionId || sector.factionId || null);
}

const DIAL_MIN = -1000;
const DIAL_MAX = 1000;
const REP_SPAN = DIAL_MAX; // arc spans ±135° at ±1000

function tintFor(id) { return FACTION_TINT[id] || DEFAULT_TINT; }

function tierIndex(rep) {
  const t = tierFor(rep);
  const i = FACTION_TIERS.indexOf(t);
  return i < 0 ? 4 : i;
}
function standingColor(rep) { return STANDING_RAMP[tierIndex(rep)] || STANDING_RAMP[4]; }

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
    segs += `<path class="sx-dial-seg" d="${arcSeg(cx, cy, R, rot0, rot1)}" stroke="${STANDING_RAMP[i]}"/>`;
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
  return `<svg class="sx-dial-svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="Standing threshold instrument"><title>Standing threshold instrument</title>${track}${segs}${ticks}${marker}</svg>`;
}

export function createFactionsScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'sx-fac';

  // faction list (real names from FACTION_META; rep from state)
  const factions = FACTION_META.map((m) => ({ id: m.id, name: m.name || m.id, meta: m }));
  let selectedId = factions[0] && factions[0].id;
  let picked = false;
  let lastRot = 0; // for smooth needle animation between selections

  el.innerHTML =
    `<nav class="sx-fac__rail" aria-label="Factions"></nav>` +
    `<section class="sx-fac__stage" aria-live="polite"></section>` +
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
      const tint = tintFor(f.id);
      const frac = (clampRep(rep) - DIAL_MIN) / (DIAL_MAX - DIAL_MIN);
      const active = f.id === selectedId ? ' is-active' : '';
      return (
        `<button type="button" class="sx-fac-row${active}" data-fac="${escapeHtml(f.id)}" role="tab" aria-selected="${f.id === selectedId}">` +
          `<span class="sx-fac-row__crest" style="--tint:${tint}">${icon('factions', 18)}</span>` +
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
    const tint = tintFor(f.id);
    const next = nextTierInfo(rep);
    const live = liveFaction(state, f.id);
    const guidance = factionStandingGuidance(rep, f.meta || {}, live && live.lastDelta);
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
      const relationColor = relation.weight > 0 ? '#56c7a5' : '#d76550';
      return `<line x1="50" y1="50" x2="${relation.x.toFixed(2)}" y2="${relation.y.toFixed(2)}" ` +
        `style="--relation:${relationColor};--weight:${Math.abs(relation.weight).toFixed(2)}"/>`;
    }).join('');
    const nodes = positions.map((relation) => {
      const related = factions.find((candidate) => candidate.id === relation.id);
      const relatedRep = repOf(state, relation.id);
      const relationColor = relation.weight > 0 ? '#56c7a5' : '#d76550';
      return `<button type="button" class="sx-fac-node" data-fac="${escapeHtml(relation.id)}" ` +
        `style="--x:${relation.x.toFixed(2)}%;--y:${relation.y.toFixed(2)}%;--relation:${relationColor};--identity:${tintFor(relation.id)}" ` +
        `aria-label="Inspect ${escapeHtml(related ? related.name : relation.id)}, ${relation.weight > 0 ? 'aligned' : 'rival'} relation ${Math.abs(relation.weight).toFixed(2)}">` +
          `<span class="sx-fac-node__mark">${icon('factions', 15)}</span>` +
          `<span class="sx-fac-node__copy"><b>${escapeHtml(related ? related.name : relation.id)}</b>` +
          `<em>${relation.weight > 0 ? 'ALIGN' : 'RIVAL'} ${Math.abs(relation.weight).toFixed(2)} · ${signed(relatedRep)}</em></span>` +
        `</button>`;
    }).join('');
    const authorityId = STATION_FACTION.get(state && state.ui && state.ui.dockedStationId);
    const controls = (f.meta && f.meta.controls) || [];
    stageEl.innerHTML =
      `<div class="sx-fac-overview" style="--tint:${tint};--standing:${col}">` +
        `<section class="sx-fac-pulse" aria-label="Standing with ${escapeHtml(f.name)}">` +
          `<div class="sx-dial sx-dial--compact">` +
            buildDialSvg() +
            `<div class="sx-dial-core">` +
              `<span class="sx-dial-tier" style="color:${col}">${escapeHtml(tier.name)}</span>` +
              `<span class="sx-dial-rep">${signed(rep)}</span>` +
              `<span class="sx-dial-next">${next ? `${next.need} TO ${escapeHtml(next.name)}` : 'PEAK HELD'}</span>` +
            `</div>` +
          `</div>` +
          `<div class="sx-fac-ident">` +
            `<span class="sx-fac-ident__flag">${f.id === authorityId ? 'CURRENT STATION AUTHORITY' : 'EXTERNAL POWER'}</span>` +
            `<h2>${escapeHtml(f.name)}</h2>` +
            `<p>${controls.length ? escapeHtml(controls.slice(0, 3).join(' · ')) : 'No confirmed jurisdiction at this berth'}</p>` +
          `</div>` +
          `<div class="sx-fac-decisions">` +
            `<div><span>NOW</span><b style="color:${col}">${escapeHtml(tier.name)} ${signed(rep)}</b><em>${escapeHtml(guidance.last)}</em></div>` +
            `<div><span>NEXT</span><b>${next ? escapeHtml(`${next.need} reputation`) : 'Standing cap'}</b><em>${escapeHtml(guidance.next)}</em></div>` +
            `<div><span>HOSTILITY BUFFER</span><b>${Math.max(0, rep - FACTION_AGGRO_THRESHOLD)} rep</b><em>${escapeHtml(guidance.risk)}</em></div>` +
          `</div>` +
        `</section>` +
        `<section class="sx-fac-network" aria-label="Relationship field for ${escapeHtml(f.name)}">` +
          `<header><span>RELATION FIELD</span><b>Select a connected power to follow the consequence web</b></header>` +
          (relations.length
            ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>` +
              `<div class="sx-fac-network__core"><span style="--identity:${tint}">${icon('factions', 25)}</span><b>${escapeHtml(f.meta.short || f.name)}</b><em>SELECTED</em></div>${nodes}`
            : `<div class="sx-fac-network__empty">NO MATERIAL RELATIONS RECORDED</div>`) +
          `<footer><span><i class="is-aligned"></i> aligned spillover</span><span><i class="is-rival"></i> rival spillover</span></footer>` +
        `</section>` +
      `</div>`;

    // animate the marker from its previous rotation to the new value along the arc
    const marker = stageEl.querySelector('.sx-dial-marker');
    const target = repToRot(rep);
    if (marker) {
      const start = animate ? lastRot : target;
      marker.style.transition = 'none';
      marker.style.transform = `rotate(${start}deg)`;
      void marker.getBoundingClientRect(); // force reflow, then transition to target
      requestAnimationFrame(() => {
        marker.style.transition = '';
        marker.style.transform = `rotate(${target}deg)`;
      });
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
          `<span class="sx-ladder__dot" style="background:${i <= curIdx ? STANDING_RAMP[i] : 'transparent'};border-color:${STANDING_RAMP[i]}"></span>` +
          `<span class="sx-ladder__name">${escapeHtml(t.name)}</span>` +
          `<span class="sx-ladder__min">${t.min > 0 ? '+' : ''}${t.min}</span>` +
        `</li>`
      );
    }).join('');
    const meta = f.meta || {};
    const guidance = factionStandingGuidance(rep, meta, liveFaction(state, f.id) && liveFaction(state, f.id).lastDelta);
    const relations = relationEntries(meta);

    detailEl.innerHTML =
      `<div class="sx-fac-ladder">` +
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
    if (active && active.scrollIntoView) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
