// Lamina — active-hull integrity and shield-envelope instrument.
// Presentation only: the caller owns time. No event subscriptions, rAF, timers, layout reads,
// random numbers, network requests, or simulation writes. All SVG geometry is authored here.
import { SHIP_SILHOUETTES } from '../../data/shipSilhouettes.js';
import { SPEED_FIGURES } from './velocityRail.js';
import { mountHullIntegrityStyles } from './hullIntegrityStyles.js';

export const INTEGRITY_LAMINAE = 16;
export const INTEGRITY_TRAIL_SECONDS = 0.78;
const TRAIL_HOLD = 0.10;
const CACHE = new WeakMap();
let serial = 0;
const clamp = n => n < 0 ? 0 : n > 1 ? 1 : n;
const quantize = n => Math.round(n * 1024) / 1024;
const finitePositive = n => Number.isFinite(n) && n > 0;
const LEFT_ENVELOPE = 'M67 25C49 30 31 50 21 79L26 114Q28 123 36 127L58 140';
const RIGHT_ENVELOPE = 'M73 25C91 30 109 50 119 79L114 114Q112 123 104 127L82 140';

export function integrityHullId(id) {
  return Object.hasOwn(SHIP_SILHOUETTES, id) ? id : 'ship_kestrel';
}

/** A displayed zero always means zero, and 100 always means full. */
export function integrityPercent(fraction, available = true) {
  if (!available || !Number.isFinite(fraction)) return '—';
  if (fraction <= 0) return '0';
  if (fraction >= 1) return '100';
  return String(Math.max(1, Math.min(99, Math.round(fraction * 100))));
}

export function createIntegrityState() {
  return { ready:false, owner:null, defId:null, hMax:NaN, sMax:NaN,
    hull:0, shield:0, hullAvailable:false, shieldAvailable:false, shieldFitted:false,
    hullTrail:0, shieldTrail:0, hStart:0, sStart:0,
    hAge:INTEGRITY_TRAIL_SECONDS, sAge:INTEGRITY_TRAIL_SECONDS,
    hImpact:0, sImpact:0, repair:0, recharge:0,
    hullState:'unavailable', shieldState:'unavailable', motion:false, flashes:false };
}

function trail(start, target, age) {
  if (age >= INTEGRITY_TRAIL_SECONDS || start <= target) return target;
  const t = clamp((age - TRAIL_HOLD) / (INTEGRITY_TRAIL_SECONDS - TRAIL_HOLD));
  return target + (start - target) * (1 - t) ** 3;
}

/** Mutates this presentation model, never `entity`. The same model object survives every frame. */
export function stepIntegrity(m, entity, dt = 0, reducedMotion = false, reducedFlash = false) {
  const hMax = entity?.hullMax, sMax = entity?.shieldMax;
  const ha = finitePositive(hMax) && Number.isFinite(entity?.hull);
  const sa = finitePositive(sMax) && Number.isFinite(entity?.shield);
  const hf = ha ? clamp(entity.hull / hMax) : 0;
  const sf = sa ? clamp(entity.shield / sMax) : 0;
  const owner = entity?.id ?? null;
  const defId = entity?.data?.defId || entity?.data?.shipId || 'ship_kestrel';
  const seconds = Number.isFinite(dt) && dt > 0 ? dt : 0;
  // Long/hidden-frame gaps settle instead of replaying a stale hit. Respawn and capacity changes
  // rebase the instrument, rather than pretending a new ship was repaired or damaged.
  const reset = !m.ready || m.owner !== owner || m.defId !== defId ||
    !Object.is(m.hMax, hMax) || !Object.is(m.sMax, sMax) ||
    m.hullAvailable !== ha || m.shieldAvailable !== sa || (m.hull === 0 && hf > 0);
  const snap = reset || reducedMotion || seconds > 0.25;
  m.hAge = Math.min(INTEGRITY_TRAIL_SECONDS, m.hAge + seconds);
  m.sAge = Math.min(INTEGRITY_TRAIL_SECONDS, m.sAge + seconds);
  m.hImpact = Math.max(0, m.hImpact - seconds);
  m.sImpact = Math.max(0, m.sImpact - seconds);
  m.repair = Math.max(0, m.repair - seconds);
  m.recharge = Math.max(0, m.recharge - seconds);
  if (!reset) {
    if (hf < m.hull) { m.hStart = Math.max(m.hullTrail, m.hull); m.hAge = 0; m.hImpact = .42; m.repair = 0; }
    if (sf < m.shield) { m.sStart = Math.max(m.shieldTrail, m.shield); m.sAge = 0; m.sImpact = .42; m.recharge = 0; }
    if (hf > m.hull) { m.hStart = hf; m.hAge = INTEGRITY_TRAIL_SECONDS; m.repair = .72; }
    if (sf > m.shield) { m.sStart = sf; m.sAge = INTEGRITY_TRAIL_SECONDS; m.recharge = .72; }
  }
  if (reset || seconds > .25) { m.repair = 0; m.recharge = 0; }
  if (snap) {
    m.hStart = hf; m.sStart = sf; m.hAge = m.sAge = INTEGRITY_TRAIL_SECONDS;
    m.hImpact = m.sImpact = 0;
  }
  m.hull = hf; m.shield = sf; m.hullAvailable = ha; m.shieldAvailable = sa;
  m.shieldFitted = finitePositive(sMax);
  m.hullTrail = trail(m.hStart, hf, m.hAge);
  m.shieldTrail = trail(m.sStart, sf, m.sAge);
  m.hullState = !ha ? 'unavailable' : hf === 0 ? 'destroyed' : hf < .25 ? 'critical' : hf < .55 ? 'damaged' : 'stable';
  m.shieldState = sMax === 0 ? 'absent' : !sa ? 'unavailable' : sf === 0 ? 'offline' : m.recharge > 0 && sf < 1 ? 'charging' : sf === 1 ? 'full' : 'online';
  m.owner = owner; m.defId = defId; m.hMax = hMax; m.sMax = sMax; m.ready = true;
  m.motion = !reducedMotion && seconds <= .25;
  m.flashes = m.motion && !reducedFlash;
  return m;
}

function hullGeometry(id, prefix) {
  const body = SHIP_SILHOUETTES[integrityHullId(id)];
  let live = '', echo = '';
  for (let i = 0; i < INTEGRITY_LAMINAE; i++) {
    const x = 45.3 - i * 2.85, end = x + 2.48;
    // Split facets leave a genuine central spar, not a waterline or a deformed clipped image.
    const d = `M${x.toFixed(2)} 0H${end.toFixed(2)}V12.1L${(x + .36).toFixed(2)} 13.15Z` +
      `M${x.toFixed(2)} 14.85L${end.toFixed(2)} 15.9V28H${x.toFixed(2)}Z`;
    live += `<path class="sf-integrity__lamina" d="${d}" opacity="0"/>`;
    echo += `<path class="sf-integrity__loss" d="${d}" opacity="0"/>`;
  }
  return `<defs><g id="${prefix}-shape">${body}</g>` +
    `<clipPath id="${prefix}-clip" clipPathUnits="userSpaceOnUse">${body}</clipPath></defs>` +
    // An explicit matrix projects the 48x28 source nose-UP. No CSS transform-origin ambiguity.
    '<g class="sf-integrity__projection" transform="matrix(0 -2.08 2.08 0 40.88 134)">' +
      `<use class="sf-integrity__shadow" href="#${prefix}-shape" transform="translate(-.65 .65)"/>` +
      `<use class="sf-integrity__body" href="#${prefix}-shape"/>` +
      `<g clip-path="url(#${prefix}-clip)">` +
        `<path class="sf-integrity__damage-hatch" d="${Array.from({length:18}, (_,i)=>`M${i*3-20} 0l28 28`).join('')}"/>` +
        `<g class="sf-integrity__losses">${echo}</g><g class="sf-integrity__laminae">${live}</g>` +
        '<path class="sf-integrity__spar" d="M4 13.6H40.5L44 14l-3.5.4H4Z"/>' +
        '<path class="sf-integrity__structure" d="M9 6l11 8-11 8M26 5l8 9-8 9M37 10l5 4-5 4"/>' +
        '<path class="sf-integrity__repair" d="M5 14H44" pathLength="1" stroke-dasharray=".16 1" stroke-dashoffset="0" opacity="0"/>' +
      '</g>' +
      `<use class="sf-integrity__outline" href="#${prefix}-shape"/>` +
      `<use class="sf-integrity__impact" href="#${prefix}-shape" opacity="0"/>` +
    '</g>';
}

export function shipConditionMarkup(defId = 'ship_kestrel', namespace) {
  mountHullIntegrityStyles();
  const key = String(namespace || `sf-integrity-${++serial}`).replace(/[^a-zA-Z0-9_-]/g, '');
  const id = key || `sf-integrity-${++serial}`;
  return `<svg class="sf-integrity__art" viewBox="0 0 272 174" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" data-integrity-prefix="${id}" data-integrity-hull="${integrityHullId(defId)}">` +
    `<defs><linearGradient id="${id}-facet" x1="0" y1="0" x2="0" y2="1"><stop class="sf-integrity__gradient-edge" offset="0"/><stop class="sf-integrity__gradient-core" offset=".49"/><stop class="sf-integrity__gradient-edge" offset="1"/></linearGradient></defs>` +
    '<path class="sf-integrity__datum" d="M70 27v9M70 137v10M12 81h8M120 81h7M31 36l4 4M105 36l-4 4M19 112l4-1M117 111l4 1M55 143l2-4M83 139l2 4"/>' +
    `<path class="sf-integrity__envelope-track" d="${LEFT_ENVELOPE} ${RIGHT_ENVELOPE}"/>` +
    [LEFT_ENVELOPE, RIGHT_ENVELOPE].map(d=>`<path class="sf-integrity__envelope-echo" d="${d}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>`).join('') +
    [LEFT_ENVELOPE, RIGHT_ENVELOPE].map(d=>`<path class="sf-integrity__envelope" d="${d}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>`).join('') +
    `<g class="sf-integrity__geometry" style="--si-facet:url(#${id}-facet)">${hullGeometry(defId, id)}</g>` +
    '<path class="sf-integrity__shield-break" d="m20 86 5-6m90 0 5 6M21 92l5-6m88 0 5 6"/>' +
    '<path class="sf-integrity__signal-mark" d="M237 13h9l-6 7h-9Zm12 0h9l-6 7h-9Z"/>' +
    '</svg>' +
    '<span class="sf-integrity__heading" aria-hidden="true">INTEGRITY</span>' +
    '<span class="sf-integrity__identity" aria-hidden="true">KESTREL</span>' +
    '<div class="sf-integrity__hull-readout" role="img" aria-label="Hull telemetry unavailable">' +
      '<span class="sf-integrity__label" aria-hidden="true">HULL</span>' +
      '<svg class="sf-integrity__figures" viewBox="0 0 138 64" aria-hidden="true" focusable="false">' +
        `<path fill-rule="evenodd" d="${SPEED_FIGURES['—']}" transform="translate(96 0)"/><path fill-rule="evenodd" display="none"/><path fill-rule="evenodd" display="none"/>` +
      '</svg><span class="sf-integrity__percent" aria-hidden="true">%</span>' +
      '<span class="sf-integrity__hull-state" aria-hidden="true">NO DATA</span>' +
    '</div>' +
    '<div class="sf-integrity__shield-readout" role="img" aria-label="Shield telemetry unavailable">' +
      '<span class="sf-integrity__shield-label" aria-hidden="true">SHIELD</span>' +
      '<span class="sf-integrity__shield-value" aria-hidden="true">—</span>' +
      '<svg class="sf-integrity__shield-rail" viewBox="0 0 120 4" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
        '<path class="sf-integrity__rail-bed" d="M0 2H120"/><path class="sf-integrity__rail-fill" d="M0 2H120" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>' +
        '<path class="sf-integrity__rail-cuts" d="M24 0v4M48 0v4M72 0v4M96 0v4"/>' +
      '</svg><span class="sf-integrity__shield-state" aria-hidden="true">NO DATA</span>' +
    '</div>';
}

function attr(el, name, value) {
  if (!el) return;
  const text = String(value);
  if (el.getAttribute(name) !== text) el.setAttribute(name, text);
}
function text(el, value) { if (el && el.textContent !== value) el.textContent = value; }
function remove(el, name) { if (el?.getAttribute(name) != null) el.removeAttribute(name); }
function opacity(el, value) { attr(el, 'opacity', quantize(value)); }
function wireGeometry(c) {
  c.cells = c.host.querySelectorAll('.sf-integrity__lamina');
  c.losses = c.host.querySelectorAll('.sf-integrity__loss');
  c.impact = c.host.querySelector('.sf-integrity__impact');
  c.repair = c.host.querySelector('.sf-integrity__repair');
}
function mount(host) {
  host.classList.add('sf-integrity');
  attr(host, 'role', 'group'); attr(host, 'aria-label', 'Ship condition');
  const q = s => host.querySelector(s);
  const art = q('.sf-integrity__art');
  if (!art) return null;
  const c = { host, m:createIntegrityState(), art, prefix:art.getAttribute('data-integrity-prefix'),
    geometry:q('.sf-integrity__geometry'), identity:q('.sf-integrity__identity'), shape:art.getAttribute('data-integrity-hull'),
    hullMeter:q('.sf-integrity__hull-readout'), shieldMeter:q('.sf-integrity__shield-readout'),
    digits:host.querySelectorAll('.sf-integrity__figures path'), number:null,
    hullState:q('.sf-integrity__hull-state'), shieldState:q('.sf-integrity__shield-state'),
    shieldValue:q('.sf-integrity__shield-value'), shieldRail:q('.sf-integrity__rail-fill'),
    envelope:host.querySelectorAll('.sf-integrity__envelope'), echoes:host.querySelectorAll('.sf-integrity__envelope-echo') };
  wireGeometry(c); CACHE.set(host, c); return c;
}
function figures(c, value) {
  if (value === c.number) return;
  c.number = value;
  for (let i = 0; i < c.digits.length; i++) {
    const digit = value[i];
    if (!digit) { attr(c.digits[i], 'display', 'none'); continue; }
    remove(c.digits[i], 'display');
    attr(c.digits[i], 'd', SPEED_FIGURES[digit]);
    attr(c.digits[i], 'transform', `translate(${(3 - value.length + i) * 48} 0)`);
  }
}
function meter(el, label, fraction, maximum, raw, available, absent = false) {
  const percent = integrityPercent(fraction, available);
  if (available) {
    attr(el, 'role', 'meter'); attr(el, 'aria-label', label);
    attr(el, 'aria-valuemin', 0); attr(el, 'aria-valuemax', maximum);
    attr(el, 'aria-valuenow', Math.max(0, Math.min(maximum, raw)));
    attr(el, 'aria-valuetext', `${percent} percent; ${Math.max(0, Math.min(maximum, Math.round(raw)))} of ${maximum}`);
  } else {
    attr(el, 'role', 'img'); attr(el, 'aria-label', `${label} ${absent ? 'not fitted' : 'telemetry unavailable'}`);
    for (const key of ['aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext']) remove(el, key);
  }
}
const HULL_WORDS = { stable:'STABLE', damaged:'DAMAGED', critical:'CRITICAL', destroyed:'DESTROYED', unavailable:'NO DATA' };
const SHIELD_WORDS = { full:'FULL', online:'ONLINE', charging:'RECHARGING', offline:'OFFLINE', absent:'NOT FITTED', unavailable:'NO DATA' };

/** Feed from the existing HUD frame. Returns the retained model for diagnostics; no per-frame subtree replacement. */
export function updateShipCondition(host, entity, dt = 0, reducedMotion = false, reducedFlash = false) {
  if (!host) return null;
  const c = CACHE.get(host) || mount(host);
  if (!c) return null;
  const m = stepIntegrity(c.m, entity, dt, reducedMotion, reducedFlash);
  const shape = integrityHullId(m.defId);
  if (c.shape !== shape) {
    // Only a hull change reparses geometry. Health, shield and digits retain their node identities.
    if (c.shape !== null) { c.geometry.innerHTML = hullGeometry(shape, c.prefix); wireGeometry(c); }
    c.shape = shape;
  }
  const known = Object.hasOwn(SHIP_SILHOUETTES, m.defId);
  text(c.identity, known ? shape.slice(5).toUpperCase() : 'UNLISTED');
  attr(host, 'data-hull', m.hullState); attr(host, 'data-shield', m.shieldState);
  attr(host, 'data-hull-id', shape); attr(host, 'data-unknown-hull', !known);
  attr(host, 'data-motion', m.motion); attr(host, 'data-flashes', m.flashes);
  figures(c, integrityPercent(m.hull, m.hullAvailable));
  text(c.hullState, m.repair > 0 && m.hullState === 'stable' && m.hull < 1 ? 'REPAIRING' : HULL_WORDS[m.hullState]);
  text(c.shieldState, SHIELD_WORDS[m.shieldState]);
  text(c.shieldValue, m.shieldAvailable ? integrityPercent(m.shield) + '%' : '—');
  const h = m.hull * INTEGRITY_LAMINAE, ht = m.hullTrail * INTEGRITY_LAMINAE;
  for (let i = 0; i < c.cells.length; i++) {
    opacity(c.cells[i], clamp(h - i));
    opacity(c.losses[i], Math.max(0, clamp(ht - i) - clamp(h - i)));
  }
  const offset = quantize(1 - m.shield);
  for (const node of c.envelope) attr(node, 'stroke-dashoffset', offset);
  attr(c.shieldRail, 'stroke-dashoffset', offset);
  for (const node of c.echoes) {
    attr(node, 'stroke-dashoffset', quantize(1 - m.shieldTrail));
    opacity(node, m.shieldTrail > m.shield ? .6 : 0);
  }
  opacity(c.impact, m.flashes ? .56 * (m.hImpact / .42) ** 2 : 0);
  opacity(c.repair, m.motion && m.repair > 0 ? .8 * m.repair / .72 : 0);
  attr(c.repair, 'stroke-dashoffset', quantize(-(1 - m.repair / .72)));
  meter(c.hullMeter, 'Hull', m.hull, m.hMax, entity?.hull, m.hullAvailable);
  meter(c.shieldMeter, 'Shield', m.shield, m.sMax, entity?.shield, m.shieldAvailable, m.shieldState === 'absent');
  return m;
}
