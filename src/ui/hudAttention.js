// Flight-HUD attention contracts (design/HUD_FLIGHT_ATTENTION.md).
// Pure presentation rules used by hud.js, toasts.js, and onboarding. Tests drive these
// functions directly — do not re-implement them in a check.

import { isVoiceOwnedAlertToast } from './alerts.js';

export const RECEIPT_MAX = 2;
export const VITAL_NUMERIC_LOW = 0.5;
export const SHIP_GLYPH_BOX = Object.freeze({ width: 62, height: 74 });

const TARGET_RECEIPT = /^\s*target\s*:/i;
const CONTROL_LAUNDRY = /\s+•\s+/;
const BIND_WALL = /\b(thrusts?|steer|mouse aims|lmb fire|left stick flies)\b/i;
const COMBAT_KEEP = /\b(cr|credit|cargo|rep|save|saved|cannot|insufficient|no wingmen)\b/i;

export function vitalNumericVisible(frac) {
  const n = Number(frac);
  if (!Number.isFinite(n)) return false;
  return n >= 0 && n < VITAL_NUMERIC_LOW;
}

export function shipGlyphBox() {
  return { width: SHIP_GLYPH_BOX.width, height: SHIP_GLYPH_BOX.height };
}

export function formatDestinationLine({
  action = '',
  distanceText = '',
  etaText = '',
  bearing = '',
} = {}) {
  const bits = [action, distanceText, etaText, bearing]
    .map((part) => String(part || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return bits.join(' · ');
}

export function admitReceipt({
  text = '',
  kind = 'info',
  _fromVoice = false,
  combat = false,
} = {}) {
  const line = String(text || '').trim();
  if (!line) return { admit: false, reason: 'empty' };
  if (_fromVoice) return { admit: false, reason: 'voice-mirror' };
  if (isVoiceOwnedAlertToast(line)) return { admit: false, reason: 'danger-floor' };
  if (TARGET_RECEIPT.test(line)) return { admit: false, reason: 'target-card' };
  if (CONTROL_LAUNDRY.test(line) || BIND_WALL.test(line)) {
    return { admit: false, reason: 'key-laundry' };
  }
  const k = String(kind || 'info');
  if (k === 'danger') return { admit: false, reason: 'danger-floor' };
  if (combat && k !== 'error' && !COMBAT_KEEP.test(line)) {
    return { admit: false, reason: 'combat-quiet' };
  }
  return { admit: true, reason: 'receipt' };
}

export function hudJobFromState(state = {}, tether = null) {
  const player = state.entities && state.playerId != null
    ? state.entities.get && state.entities.get(state.playerId)
    : null;
  const hullFrac = player && player.hullMax ? player.hull / player.hullMax : 1;
  if (Number.isFinite(hullFrac) && hullFrac < 0.25) return 'hurt';
  if (tether && tether.active) return 'latch';
  const targetId = state.player && state.player.targetId;
  if (targetId != null) {
    const target = state.entities && state.entities.get && state.entities.get(targetId);
    if (target && target.alive !== false && player && target.team != null && target.team !== player.team) {
      return 'fight';
    }
  }
  return 'cruise';
}

export function contactRosterExpanded({
  pinned = false,
  nearbyHostile = false,
  revealActive = false,
  selected = false,
} = {}) {
  return !!(pinned || nearbyHostile || revealActive || selected);
}

export function formatRosterCount(contacts = []) {
  let hostile = 0;
  for (const contact of contacts) {
    if (contact && contact.hostile) hostile += 1;
  }
  const total = contacts.length;
  if (!total) return '';
  if (hostile) return `${hostile} HOSTILE · ${total}`;
  return `${total}`;
}

export function masslineInstrumentVisible(tether) {
  return !!(tether && tether.active);
}

export function masslineInstrumentReadout(tether) {
  if (!masslineInstrumentVisible(tether)) return null;
  const strain = Number.isFinite(tether.strain) ? Math.max(0, tether.strain) : 0;
  const load = Number.isFinite(tether.load)
    ? Math.max(0, Math.min(1, tether.load))
    : Math.min(1, strain);
  const length = Number.isFinite(tether.restLength)
    ? tether.restLength
    : (Number.isFinite(tether.length) ? tether.length : 0);
  const phase = String(tether.phase || 'slack');
  return {
    load,
    length,
    phase,
    releaseOpen: phase === 'loaded' || load >= 0.5,
  };
}

export function shouldShowFirstUseHint(hints, verbId) {
  if (!verbId) return false;
  return !(hints && hints[verbId]);
}

export function markFirstUseHint(hints, verbId) {
  const next = hints && typeof hints === 'object' ? hints : {};
  if (verbId) next[verbId] = true;
  return next;
}

export const FIRST_USE_LINE = Object.freeze({
  firstCombat: 'Return fire.',
  firstShieldDrop: 'Break contact.',
  firstStation: 'Dock.',
  firstGate: 'Plot a jump.',
  firstCargoFull: 'Sell cargo.',
  firstHub: 'Use the left rail. Departure Check owns undock.',
  firstDrill: 'Mine the veins.',
  firstOutfit: 'Fit the module.',
  firstTech: 'Research unlocked gear.',
  firstAutomation: 'Drones work the field.',
  firstClaim: 'Build on the claim.',
  firstCraft: 'Queue the job.',
  masslineThrow: 'Latch, then cut.',
  masslineHitchhiking: 'Ride, then cut.',
  masslineSelfSling: 'Cut to sling.',
  masslineJettisonImpulse: 'Dump aft to push.',
  masslineBulletTime: 'Hold to stretch time.',
  masslineCloak: 'Coast to stay hidden.',
  bombPropulsion: 'Drop aft, then detonate.',
});

export function firstUseLine(verbId) {
  return FIRST_USE_LINE[verbId] || '';
}

export function firstUseAttachKind(verbId) {
  const key = String(verbId || '');
  if (key === 'firstStation' || key === 'firstHub' || key === 'firstGate') return 'station';
  if (key === 'firstDrill') return 'rock';
  if (key.startsWith('massline') || key === 'firstCombat') return 'latch';
  return 'player';
}

export function resolveFirstUseEntityId(state, payload = {}) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.entityId != null) return payload.entityId;
  // Live combat:damage is { targetId: player, attackerId: foe }. Prefer the foe.
  if (payload.attackerId != null) return payload.attackerId;
  if (payload.sourceId != null) return payload.sourceId;
  if (payload.targetId != null) return payload.targetId;
  if (payload.asteroidId != null) return payload.asteroidId;
  if (payload.gateId != null) return payload.gateId;
  const stationId = payload.stationId;
  if (!stationId || !state) return null;
  const index = state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    const indexed = index.byStationId && index.byStationId.get(stationId);
    if (indexed && indexed.alive !== false) return indexed.id;
  }
  for (const entity of state.entityList || []) {
    if (entity && entity.alive !== false && entity.data && entity.data.stationId === stationId) {
      return entity.id;
    }
  }
  return null;
}

export function receiptLaneRect(layout) {
  if (!layout || !layout.action || !layout.viewport) return null;
  const action = layout.action;
  const width = Math.min(action.width, 360);
  const height = 44;
  // The command-deck readout band (.sf-cluster: bottom:92px + ~55px tall) sits directly above the
  // action row. A lane anchored to action.y lands inside that band, which is where receipts and
  // the speed/weapon readouts used to fight for hover. Anchor the stack ABOVE the band instead —
  // appliers pin `bottom: bottomInset` and cards flow upward.
  // 155 = cluster bottom offset (92) + measured band height (~55) + 8px gap.
  const bottomInset = 155;
  return {
    x: action.x + (action.width - width) / 2,
    y: Math.max(layout.viewport.y + 8, action.y - height - 8 - 59),
    width,
    height,
    bottomInset,
  };
}

export function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function receiptOverlapsReserved(layout) {
  const lane = receiptLaneRect(layout);
  if (!lane) return false;
  const reserved = [layout.objective, layout.vitals, layout.rightDock].filter(Boolean);
  return reserved.some((anchor) => rectsOverlap(lane, anchor));
}
