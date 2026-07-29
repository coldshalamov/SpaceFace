// Player impact-direction markers.
//
// The previous implementation drew wide glowing arcs around the screen edge. That read like a
// cockpit visor, obscured the playfield, and conveyed every hit as the same red alarm. This pooled
// replacement is a compact non-diegetic gauge: direction chevron + redundant S/A/H layer shape.
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
  position:absolute; left:0; top:0; width:44px; height:28px;
  display:none; align-items:center; justify-content:center; gap:7px;
  pointer-events:none; opacity:0; will-change:transform,opacity;
}
.sf-dmgind-marker__chevron {
  width:13px; height:13px; flex:0 0 auto;
  border-top:3px solid var(--impact-tone);
  border-right:3px solid var(--impact-tone);
  transform:rotate(45deg);
  transform-origin:center;
}
.sf-dmgind-marker__layer {
  display:flex; align-items:center; justify-content:center;
  width:20px; height:20px; box-sizing:border-box;
  border:2px solid var(--impact-tone);
  background:rgba(5,9,18,.88);
  color:var(--impact-tone);
  font:700 11px/1 var(--mono, monospace);
  letter-spacing:0;
}
.sf-dmgind-marker.layer-shield { --impact-tone:var(--sf-shield, #39d0ff); }
.sf-dmgind-marker.layer-armor { --impact-tone:var(--sf-warn, #ffb35c); }
.sf-dmgind-marker.layer-hull { --impact-tone:var(--sf-danger, #ff5c5c); }
.sf-dmgind-marker.layer-shield .sf-dmgind-marker__layer { border-radius:50%; }
.sf-dmgind-marker.layer-armor .sf-dmgind-marker__layer {
  width:18px; height:18px; transform:rotate(45deg);
}
.sf-dmgind-marker.layer-armor .sf-dmgind-marker__layer > span { transform:rotate(-45deg); }
.sf-dmgind-marker.layer-hull .sf-dmgind-marker__layer { border-radius:2px; }
.sf-dmgind-marker.severity-critical .sf-dmgind-marker__layer {
  outline:2px solid var(--impact-tone); outline-offset:2px;
}
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

  const markers = [];
  for (let index = 0; index < MAX_MARKERS; index++) {
    const element = document.createElement('div');
    element.className = 'sf-dmgind-marker';
    element.setAttribute('aria-hidden', 'true');
    const chevron = document.createElement('div');
    chevron.className = 'sf-dmgind-marker__chevron';
    const layer = document.createElement('div');
    layer.className = 'sf-dmgind-marker__layer';
    const glyph = document.createElement('span');
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
      const projected = worldToScreen(marker.sourcePoint);
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
      const nextOpacity = String(fadeIn * fadeOut);
      if (marker._sfOpacity !== nextOpacity) {
        marker._sfOpacity = nextOpacity;
        marker.element.style.opacity = nextOpacity;
      }
      const nextTransform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      if (marker._sfHudTransform !== nextTransform) {
        marker._sfHudTransform = nextTransform;
        marker.element.style.transform = nextTransform;
      }
      const nextChevron = `rotate(${screenAngle + Math.PI * 0.25}rad)`;
      if (marker._sfChevron !== nextChevron) {
        marker._sfChevron = nextChevron;
        marker.chevron.style.transform = nextChevron;
      }
    }
  }

  return {
    el: root,
    onDamage,
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
