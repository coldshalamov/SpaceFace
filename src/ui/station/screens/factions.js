// src/ui/station/screens/factions.js — "Standing & Relations" instrument.
// Central radial standing dial (color-coded meter, not a raw number) + a selectable
// faction rail + progressive-disclosure detail. Read-only: reflects state.factions[id].rep.
//
// Screen module shape (hosted by stationApp): create(ctx) -> { el, onShow, refresh, dispose }.
import { FACTION_META } from '../../../data/factions.js';
import { NEW_GAME } from '../../../data/newGameDefaults.js';
import { tierFor, FACTION_TIERS } from '../../screens/factions.js';
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
  return `<svg class="sx-dial-svg" viewBox="0 0 ${S} ${S}" role="img">${track}${segs}${ticks}${marker}</svg>`;
}

export function createFactionsScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'sx-fac';

  // faction list (real names from FACTION_META; rep from state)
  const factions = FACTION_META.map((m) => ({ id: m.id, name: m.name || m.id, meta: m }));
  let selectedId = factions[0] && factions[0].id;
  let lastRot = 0; // for smooth needle animation between selections

  el.innerHTML =
    `<nav class="sx-fac__rail" aria-label="Factions"></nav>` +
    `<section class="sx-fac__stage" aria-live="polite"></section>` +
    `<aside class="sx-fac__detail"></aside>`;

  const railEl = el.querySelector('.sx-fac__rail');
  const stageEl = el.querySelector('.sx-fac__stage');
  const detailEl = el.querySelector('.sx-fac__detail');

  function renderRail(state) {
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
          `<span class="sx-fac-row__tier" style="color:${col}">${escapeHtml(tier.name)}</span>` +
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
    const nextLine = next
      ? `<span class="sx-dial-next">${next.need} to <b>${escapeHtml(next.name)}</b></span>`
      : `<span class="sx-dial-next sx-dial-next--peak">Peak standing held</span>`;
    stageEl.innerHTML =
      `<div class="sx-dial" style="--tint:${tint};--standing:${col}">` +
        buildDialSvg() +
        `<div class="sx-dial-core">` +
          `<span class="sx-dial-tier" style="color:${col}">${escapeHtml(tier.name)}</span>` +
          `<span class="sx-dial-rep">${rep > 0 ? '+' : ''}${rep}</span>` +
          nextLine +
        `</div>` +
      `</div>` +
      `<h2 class="sx-dial-name">${escapeHtml(f.name)}</h2>` +
      `<p class="sx-dial-sub">Standing runs from <span style="color:${STANDING_RAMP[0]}">Sworn Enemy</span> to <span style="color:${STANDING_RAMP[8]}">Hero</span> · −1000 to +1000</p>`;

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
    const controls = meta.controls || (meta.control ? [meta.control] : []);
    const allies = meta.allies || (meta.relationships && meta.relationships.allies) || [];
    const rivals = meta.rivals || (meta.relationships && meta.relationships.rivals) || [];
    const nameOf = (id) => {
      const m = factions.find((x) => x.id === id || x.meta && x.meta.id === id);
      return m ? m.name : String(id).replace(/^faction_/, '');
    };
    const relBlock = (label, ids, cls) => {
      if (!ids || !ids.length) return '';
      return `<div class="sx-rel"><span class="sx-rel__k">${label}</span><span class="sx-rel__v">` +
        ids.map((id) => `<span class="sx-tag sx-tag--${cls}">${escapeHtml(nameOf(id))}</span>`).join('') +
        `</span></div>`;
    };

    detailEl.innerHTML =
      `<div class="sx-panel sx-panel--ladder">` +
        `<div class="sx-panel__head">${icon('spark', 15)}<span>Standing Ladder</span></div>` +
        `<ol class="sx-ladder">${ladder}</ol>` +
      `</div>` +
      `<div class="sx-panel sx-panel--rel">` +
        `<div class="sx-panel__head">${icon('info', 15)}<span>Relations</span></div>` +
        (controls.length ? `<div class="sx-rel"><span class="sx-rel__k">Controls</span><span class="sx-rel__v">${controls.map((c) => `<span class="sx-tag">${escapeHtml(String(c))}</span>`).join('')}</span></div>` : '') +
        relBlock('Allies', allies, 'good') +
        relBlock('Rivals', rivals, 'bad') +
        (!controls.length && !allies.length && !rivals.length
          ? `<p class="sx-muted">Relations intel unavailable at this berth. Run contracts to surface their web of alliances.</p>` : '') +
      `</div>`;
  }

  function refresh(c) {
    const state = (c || ctx).state || {};
    renderRail(state);
    renderStage(state, false);
    renderDetail(state);
  }

  railEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-fac]');
    if (!btn) return;
    const id = btn.getAttribute('data-fac');
    if (id === selectedId) return;
    selectedId = id;
    const state = (ctx && ctx.state) || {};
    renderRail(state);
    renderStage(state, true);
    renderDetail(state);
    if (ctx && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  });

  return {
    el,
    onShow(c) { refresh(c); },
    refresh,
    dispose() {},
  };
}
