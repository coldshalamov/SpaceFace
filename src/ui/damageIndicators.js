// Player impact-direction markers.
//
// The previous implementation drew wide glowing arcs around the screen edge. That read like a
// cockpit visor, obscured the playfield, and conveyed every hit as the same red alarm. This pooled
// replacement is a compact non-diegetic gauge: the kit's damage wedge for direction + a shape-led
// S/A/H layer mark (ring / diamond / solid square; the letter is fine print, not the signal).
// Marks are drawn inline SVG in the kit's voice (currentColor over --impact-tone) — no bordered
// boxes, no mono letterplates.
// Exact attacker/weapon copy remains in the single anchored LAST IMPACT receipt (commandBar.js),
// while this surface answers the time-critical question: where did it come from, and which layer
// is failing? No damage numbers, speech, modal, or sim mutation lives here.

import { getFlashReduced, getMotionReduced } from './accessibility.js';

const STYLE_ID = 'sf-dmgind-style';
const MAX_MARKERS = 3;
const FADE_IN_S = 0.06;
const MERGE_ANGLE_RAD = 0.52;

const LAYER_CUES = Object.freeze({
  shield: Object.freeze({ glyph: 'S', tone: 'shield', ttl: 0.75 }),
  armor: Object.freeze({ glyph: 'A', tone: 'warning', ttl: 0.90 }),
  hull: Object.freeze({ glyph: 'H', tone: 'danger', ttl: 1.10 }),
});

// INF-049 — close-shave tick. Not damage: a neutral dash on the side the round crossed,
// brightness following proximity, gone in half a second. Muted audio or reduced motion
// still leaves this tick — a failed crack is quiet, never absent.

const NEAR_MISS_CUE = Object.freeze({
  layer: 'nearmiss',
  glyph: '\u2013',
  tone: 'quiet',
  severity: 'info',
  ttl: 0.55,
  maxDistanceWu: 36,
});

export function buildNearMissCue(payload = {}) {
  const distance = Number(payload.distance);
  if (!Number.isFinite(distance) || distance < 0) return null;
  const closeness = Math.max(0, Math.min(1, 1 - distance / NEAR_MISS_CUE.maxDistanceWu));
  return {
    ...NEAR_MISS_CUE,
    closeness,
    brightness: 0.35 + 0.65 * closeness,
    sourceKey: payload.projectileId == null ? 'nearmiss:unknown' : `nearmiss:${payload.projectileId}`,
  };
}

// Kit geometry, ported inline (assets/ui/kit/assets/svg/). The damage wedge is a 45° pie authored
// pointing "up"; objective.chevron (plates/) is the same voice at 24 units. Drawn marks replace the
// old border-trick chevron and boxed letters.
const WEDGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none" aria-hidden="true">'
  + '<path fill="currentColor" fill-opacity="0.85" d="M60,60 L60,6 A54,54 0 0,1 98,22 Z"/></svg>';

// One shared layer plate per marker; CSS reveals exactly the shape the cue names, so a pooled
// marker swaps meaning by class alone (no per-hit DOM mutation). Shapes: ring=shield,
// diamond=armor, solid square=hull, dash=near miss — meaning survives without the letter.
const LAYER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
  + '<circle class="sf-dmgind-shape sf-dmgind-shape-shield" cx="12" cy="12" r="6.4" stroke="currentColor" stroke-width="2.6"/>'
  + '<path class="sf-dmgind-shape sf-dmgind-shape-armor" stroke="currentColor" stroke-width="2.6" d="M12 3.9 L20.1 12 L12 20.1 L3.9 12 Z"/>'
  + '<rect class="sf-dmgind-shape sf-dmgind-shape-hull" x="4.9" y="4.9" width="14.2" height="14.2" fill="currentColor"/>'
  + '<rect class="sf-dmgind-shape sf-dmgind-shape-nearmiss" x="4" y="10.8" width="16" height="2.4" rx="1.2" fill="currentColor"/>'
  + '<circle class="sf-dmgind-ring" cx="12" cy="12" r="10.9" stroke="currentColor" stroke-width="1.5"/></svg>';

function pct(value, max) {
  return max > 0 ? Math.max(0, Math.min(100, Math.round((Number(value) || 0) / max * 100))) : 0;
}

export function buildDamageIndicatorCue(payload = {}) {
  // `applied` is the live combat payload; `amount` remains supported for older emitters and
  // lightweight UI probes that predate the layered damage receipt.
  const applied = Math.max(0, Number(payload.applied ?? payload.amount) || 0);
  const routed = Math.max(0, Number(payload.shieldDamage) || 0)
    + Math.max(0, Number(payload.armorDamage) || 0)
    + Math.max(0, Number(payload.hullDamage) || 0);
  if (!(applied > 0 || routed > 0 || payload.brokeShield)) return null;

  const layer = LAYER_CUES[payload.dominantLayer]
    ? payload.dominantLayer
    : payload.hullHit ? 'hull' : payload.armorHit ? 'armor' : 'shield';
  const def = LAYER_CUES[layer];
  const after = payload.after || {};
  const remainingPct = layer === 'shield'
    ? pct(after.shield, after.shieldMax)
    : layer === 'armor'
      ? pct(after.armor, after.armorMax)
      : pct(after.hull, after.hullMax);
  const severity = layer === 'hull' && remainingPct <= 25
    ? 'critical'
    : layer === 'hull' || payload.brokeShield || (layer === 'armor' && remainingPct <= 40)
      ? 'warning'
      : 'hit';

  return {
    layer,
    glyph: def.glyph,
    tone: def.tone,
    severity,
    ttl: def.ttl,
    sourceKey: payload.attackerId == null ? 'environment' : `actor:${payload.attackerId}`,
    remainingPct,
  };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.sf-dmgind-root {
  position:absolute; inset:0; z-index:14; pointer-events:none; overflow:hidden;
}
.sf-dmgind-marker {
  --impact-tone:var(--sf-danger, #ff5c5c);
  position:absolute; left:0; top:0;
  display:none; align-items:center; justify-content:center; gap:7px;
  pointer-events:none; opacity:0; will-change:transform,opacity;
}
/* Direction: the kit damage wedge, rotated onto the attacker by tick(). */
.sf-dmgind-marker__chevron {
  width:14px; height:14px; flex:0 0 auto;
  color:var(--impact-tone);
}
.sf-dmgind-marker__chevron > svg { width:100%; height:100%; display:block; }
/* Layer: drawn shape carries the signal; the letter is fine print in the game's face. */
.sf-dmgind-marker__layer {
  display:flex; align-items:center; gap:4px;
  color:var(--impact-tone);
}
.sf-dmgind-marker__layer > svg { width:22px; height:22px; display:block; }
.sf-dmgind-shape { display:none; }
.sf-dmgind-marker.layer-shield .sf-dmgind-shape-shield { display:block; }
.sf-dmgind-marker.layer-armor .sf-dmgind-shape-armor { display:block; }
.sf-dmgind-marker.layer-hull .sf-dmgind-shape-hull { display:block; }
.sf-dmgind-marker.layer-nearmiss .sf-dmgind-shape-nearmiss { display:block; }
.sf-dmgind-marker.layer-nearmiss .sf-dmgind-marker__letter { display:none; }
.sf-dmgind-marker__letter {
  font-family:var(--dp-face-label, "Archivo");
  font-size:12px; font-weight:600; line-height:1; letter-spacing:.08em;
}
.sf-dmgind-marker.layer-nearmiss { --impact-tone:var(--sf-quiet, #9fb4c8); }
.sf-dmgind-marker.layer-shield { --impact-tone:var(--sf-shield, #39d0ff); }
.sf-dmgind-marker.layer-armor { --impact-tone:var(--sf-warn, #ffb35c); }
.sf-dmgind-marker.layer-hull { --impact-tone:var(--sf-danger, #ff5c5c); }
/* Critical hull: a drawn alert ring around the shape, not an outline around a letterbox. */
.sf-dmgind-ring { opacity:0; }
.sf-dmgind-marker.severity-critical .sf-dmgind-ring { opacity:1; }
  `;
  document.head.appendChild(style);
}

function angularDistance(a, b) {
  let distance = Math.abs(a - b);
  if (distance > Math.PI) distance = Math.PI * 2 - distance;
  return distance;
}

function angleToSource(playerPos, sourcePos) {
  const dx = (Number(sourcePos && sourcePos.x) || 0) - (Number(playerPos && playerPos.x) || 0);
  const dz = (Number(sourcePos && sourcePos.z) || 0) - (Number(playerPos && playerPos.z) || 0);
  return Math.atan2(-dz, dx);
}

export function createDamageIndicators() {
  injectStyle();

  const root = document.createElement('div');
  root.className = 'sf-dmgind-root';
  root.setAttribute('aria-hidden', 'true');

  // Retained worldToScreen scratch — projection results are consumed synchronously.
  const _diScreen = { x: 0, y: 0, onScreen: false };
  const markers = [];
  for (let index = 0; index < MAX_MARKERS; index++) {
    const element = document.createElement('div');
    element.className = 'sf-dmgind-marker';
    element.setAttribute('aria-hidden', 'true');
    const chevron = document.createElement('div');
    chevron.className = 'sf-dmgind-marker__chevron';
    chevron.innerHTML = WEDGE_SVG;
    const layer = document.createElement('div');
    layer.className = 'sf-dmgind-marker__layer';
    layer.innerHTML = LAYER_SVG;
    const glyph = document.createElement('span');
    glyph.className = 'sf-dmgind-marker__letter';
    layer.appendChild(glyph);
    element.appendChild(chevron);
    element.appendChild(layer);
    element.style.display = 'none';
    root.appendChild(element);
    markers.push({
      element,
      chevron,
      glyph,
      cue: null,
      angle: 0,
      age: Infinity,
      sourcePoint: { x: 0, y: 0, z: 0 },
    });
  }

  let activeCount = 0;

  function retire(marker) {
    if (!marker || marker.age === Infinity) return;
    marker.element.style.display = 'none';
    marker.element.style.opacity = '0';
    marker._sfDisplay = 'none';
    marker._sfOpacity = '0';
    marker._sfHudTransform = '';
    marker._sfChevron = '';
    marker.cue = null;
    marker.age = Infinity;
    if (activeCount > 0) activeCount--;
  }

  function onDamage(payload) {
    if (!payload) return false;
    const isPlayer = payload.isPlayer || (payload.targetId != null && payload.targetId === this._playerId);
    if (!isPlayer) return false;
    const cue = buildDamageIndicatorCue(payload);
    if (!cue) return false;
    const player = this._player && this._player();
    if (!player || !player.pos) return false;
    const sourcePos = payload.attackerPos || payload.sourcePos || payload.hitPoint || payload.pos;
    if (!sourcePos) return false;
    const angle = angleToSource(player.pos, sourcePos);

    let selected = null;
    let oldest = markers[0];
    for (const marker of markers) {
      if (marker.age < Infinity
        && marker.cue
        && marker.cue.sourceKey === cue.sourceKey
        && marker.cue.layer === cue.layer
        && angularDistance(marker.angle, angle) <= MERGE_ANGLE_RAD) {
        selected = marker;
        break;
      }
      if (marker.age > oldest.age) oldest = marker;
    }
    if (!selected) selected = oldest;
    if (selected.age === Infinity) activeCount++;
    selected.cue = cue;
    selected.angle = angle;
    selected.age = 0;
    selected.glyph.textContent = cue.glyph;
    selected.element.className = `sf-dmgind-marker layer-${cue.layer} severity-${cue.severity}`;
    return true;
  }

  function place(marker, cue, angle, isNew) {
    if (isNew) activeCount++;
    marker.cue = cue;
    marker.angle = angle;
    marker.age = 0;
    marker.glyph.textContent = cue.glyph;
    marker.element.className = `sf-dmgind-marker layer-${cue.layer} severity-${cue.severity}`;
  }

  function onNearMiss(payload) {
    // A close shave, not a hit: yields to real damage (free slot only, same projectile
    // refreshes), sits on the side the round crossed, brightness follows proximity.
    if (!payload) return false;
    if (payload.targetId != null && payload.targetId !== this._playerId) return false;
    const cue = buildNearMissCue(payload);
    if (!cue) return false;
    const player = this._player && this._player();
    if (!player || !player.pos || !payload.pos) return false;
    const angle = angleToSource(player.pos, payload.pos);
    for (const marker of markers) {
      if (marker.age < Infinity && marker.cue && marker.cue.sourceKey === cue.sourceKey) {
        place(marker, cue, angle, false);
        return true;
      }
    }
    const free = markers.find((marker) => marker.age === Infinity);
    if (!free) return false;
    place(free, cue, angle, true);
    return true;
  }

  function tick(dt, helpers) {
    if (activeCount <= 0) return;
    const player = this._player && this._player();
    const worldToScreen = helpers && helpers.worldToScreen;
    if (!player || !player.pos || typeof worldToScreen !== 'function') {
      for (const marker of markers) retire(marker);
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const extentX = width * 0.36;
    const extentY = height * 0.36;
    const reduced = getFlashReduced() || getMotionReduced();

    for (const marker of markers) {
      if (marker.age === Infinity || !marker.cue) continue;
      marker.age += Math.max(0, Number(dt) || 0);
      if (marker.age >= marker.cue.ttl) {
        retire(marker);
        continue;
      }

      marker.sourcePoint.x = player.pos.x + Math.cos(marker.angle) * 600;
      marker.sourcePoint.z = player.pos.z - Math.sin(marker.angle) * 600;
      const projected = worldToScreen(marker.sourcePoint, _diScreen);
      let dx = (Number(projected && projected.x) || width * 0.5) - width * 0.5;
      let dy = (Number(projected && projected.y) || height * 0.5) - height * 0.5;
      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;
      const x = width * 0.5 + dx * extentX;
      const y = height * 0.5 + dy * extentY;
      const screenAngle = Math.atan2(dy, dx);
      const fadeIn = reduced ? 1 : Math.min(1, marker.age / FADE_IN_S);
      const fadeOut = Math.max(0, 1 - marker.age / marker.cue.ttl);

      if (marker._sfDisplay !== 'flex') {
        marker._sfDisplay = 'flex';
        marker.element.style.display = 'flex';
      }
      const brightness = marker.cue.brightness == null ? 1 : marker.cue.brightness;
      const nextOpacity = String(fadeIn * fadeOut * brightness);
      if (marker._sfOpacity !== nextOpacity) {
        marker._sfOpacity = nextOpacity;
        marker.element.style.opacity = nextOpacity;
      }
      const nextTransform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      if (marker._sfHudTransform !== nextTransform) {
        marker._sfHudTransform = nextTransform;
        marker.element.style.transform = nextTransform;
      }
      // The kit wedge is authored pointing up; screen angle 0 is right, so swing the extra 90°.
      const nextChevron = `rotate(${screenAngle + Math.PI * 0.5}rad)`;
      if (marker._sfChevron !== nextChevron) {
        marker._sfChevron = nextChevron;
        marker.chevron.style.transform = nextChevron;
      }
    }
  }

  return {
    el: root,
    onDamage,
    onNearMiss,
    tick,
    _activeCount() { return activeCount; },
    _player: null,
    _playerId: null,
    bind(getPlayer, playerId) {
      this._player = getPlayer;
      this._playerId = playerId;
      return this;
    },
  };
}
