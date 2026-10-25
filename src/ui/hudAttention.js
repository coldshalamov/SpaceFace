// Flight-HUD attention contracts (design/HUD_FLIGHT_ATTENTION.md).
// Pure presentation rules used by hud.js, toasts.js, and onboarding. Tests drive these
// functions directly — do not re-implement them in a check.

import { isVoiceOwnedAlertToast } from './alerts.js';
import { getPromptDevice } from './bindings.js';
import { controlPrompt } from './controlPrompts.js';

export const RECEIPT_MAX = 2;
export const VITAL_NUMERIC_LOW = 0.5;
export const SHIP_GLYPH_BOX = Object.freeze({ width: 62, height: 74 });

const TARGET_RECEIPT = /^\s*target\s*:/i;
const CONTROL_LAUNDRY = /\s+•\s+/;
const BIND_WALL = /\b(thrusts?|steer|mouse aims|lmb fire|left stick flies)\b/i;
const COMBAT_KEEP = /\b(cr|credit|cargo|rep|save|saved|cannot|insufficient|no wingmen|wanted)\b/i;
const RADIO_CHATTER = /^["'“‘]|(\b(chatter|radio|hail|routine transponder|incident logged|clause \w+ observed|witness the|the pattern sings|meridian floor:|saw that|caught that|clause satisfied)\b)/i;

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

const FIGHT_CAPTION = /^(taking fire|hull hit|shield hit|shoved\b|you shoved|you docked|docked at)\b/i;

/** Wave G3 — a shield hit, a hull hit, a shove, and a dock are not sentences. */
export function isFightCaptionSentence(text) {
  return FIGHT_CAPTION.test(String(text || '').trim());
}

export function toastTextForFightEvent(eventName) {
  if (eventName === 'combat:damage' || eventName === 'combat:shove' || eventName === 'dock:docked') return null;
  return undefined;
}

export function admitReceipt({
  text = '',
  kind = 'info',
  channel = '',
  _fromVoice = false,
  combat = false,
} = {}) {
  const line = String(text || '').trim();
  if (!line) return { admit: false, reason: 'empty' };
  if (isFightCaptionSentence(line)) return { admit: false, reason: 'fight-caption' };
  if (_fromVoice) return { admit: false, reason: 'voice-mirror' };
  if (channel === 'bark' || channel === 'chatter' || channel === 'news') {
    return { admit: false, reason: 'chatter' };
  }
  if (isVoiceOwnedAlertToast(line)) return { admit: false, reason: 'danger-floor' };
  if (TARGET_RECEIPT.test(line)) return { admit: false, reason: 'target-card' };
  if (CONTROL_LAUNDRY.test(line) || BIND_WALL.test(line)) {
    return { admit: false, reason: 'key-laundry' };
  }
  if (RADIO_CHATTER.test(line)) {
    return { admit: false, reason: 'radio-chatter' };
  }
  const k = String(kind || 'info');
  if (k === 'stunt') return { admit: true, reason: 'stunt' };
  if (k === 'danger') return { admit: false, reason: 'danger-floor' };
  if (k === 'bark' || k === 'chatter') return { admit: false, reason: 'chatter' };
  // The deliberate-release read (channel 'massline') is instant skill feedback for the throw the
  // player just made, usually in a fight - like a stunt name it must not be quieted by combat.
  if (combat && k !== 'error' && channel !== 'stunt' && channel !== 'capitalBoss' && channel !== 'massline'
    && !COMBAT_KEEP.test(line)) {
    return { admit: false, reason: 'combat-quiet' };
  }
  // D240: the flight glass's never tier — legends, authority receipts, jurisdiction notes and
  // debug stat strings belong to docked screens, not the in-flight deck.
  if (flightGlassNever(k, line)) return { admit: false, reason: 'tier-never' };
  return { admit: true, reason: 'receipt' };
}

// ── Glass in three tiers (row 494 / D240) ────────────────────────────────────
// ALWAYS: hull/shield arc at the ship + cooldown pips. WHEN IT MATTERS: one aimed-target line.
// NEVER in flight: colour legends, authority receipts, jurisdiction notes, debug stat strings.
const FLIGHT_NEVER_KINDS = new Set(['legend', 'authority', 'jurisdiction', 'debug']);
// Debug stat strings look like `Reach·Fighter·L1 … VULN E— K—` — compact class-name
// fields joined by UNspaced middots ending in an L<level> marker. A receipt with spaced
// ` · ` separators ("Refit complete · L2 engine fitted", payout tallies) must admit, so
// the stat arm requires the compact token shape, not a level marker anywhere in prose.
const FLIGHT_DEBUG_STAT = /(?:^|\s)\S*[·•]\S*[·•]L\d|VULN|[A-Z]—/;

/** True while `kind`/`text` names a surface the flight glass never shows. */
export function flightGlassNever(kind, text) {
  if (FLIGHT_NEVER_KINDS.has(String(kind || ''))) return true;
  const line = String(text || '');
  return line.length > 0 && FLIGHT_DEBUG_STAT.test(line);
}

// ── Glass that breathes (row 474 / RC-GLASS) ─────────────────────────────────
/** Hull fractions at which danger-quiet dims non-critical instruments, and releases. */
export const DANGER_QUIET_ARM = 0.20;
export const DANGER_QUIET_RELEASE = 0.30;
/** Fuel fraction at which the BINGO line speaks (deeper than FUEL LOW). */
export const BINGO_FUEL_FRAC = 0.06;

/**
 * Danger-quiet is hysteretic, same envelope as the low-hull alert: arm at ≤20% hull, stay quiet
 * until the hull climbs back to 30%. `armed` is the caller's latched flag; returns the next flag.
 */
export function dangerQuietArmed(hullFrac, armed) {
  const f = Number(hullFrac);
  if (!(f > 0)) return false;
  return f < (armed ? DANGER_QUIET_RELEASE : DANGER_QUIET_ARM);
}

/** The three glass presets — which instrument ids stay bright; everything else dims. */
export const GLASS_PRESETS = Object.freeze({
  clean: Object.freeze({ id: 'clean', lit: Object.freeze(['hull', 'shield']) }),
  hauler: Object.freeze({ id: 'hauler', lit: Object.freeze(['hull', 'shield', 'cargo', 'fuel', 'massline']) }),
  fighter: Object.freeze({ id: 'fighter', lit: Object.freeze(['hull', 'shield', 'ordnance', 'speed', 'target']) }),
});

export function glassPresetFor(id) {
  return GLASS_PRESETS[id] || GLASS_PRESETS.clean;
}

/** The bingo-fuel line: 'BINGO FUEL — 4%' when the tank is under the reserve, else ''. */
export function bingoFuelLine(fuelFrac) {
  const f = Number(fuelFrac);
  if (!(f > 0) || f > BINGO_FUEL_FRAC) return '';
  return `BINGO FUEL — ${Math.max(0, Math.round(f * 100))}%`;
}

/** The sortie tally read on dock: kills · rocks cracked · credits earned this outing. */
export function sortieTallyLine({ kills = 0, rocks = 0, credits = 0 } = {}) {
  const parts = [];
  if (kills > 0) parts.push(`${kills} kill${kills === 1 ? '' : 's'}`);
  if (rocks > 0) parts.push(`${rocks} rock${rocks === 1 ? '' : 's'}`);
  if (credits > 0) parts.push(`${credits} cr`);
  return parts.length ? `SORTIE — ${parts.join(' · ')}` : '';
}

/** Tether load + strain for the hull-adjacent ring read (massline mirror, read-only). */
export function tetherRingRead(tether) {
  if (!tether || typeof tether !== 'object') return null;
  const load = Math.max(0, Math.min(1, Number(tether.load) || 0));
  const strain = Math.max(0, Math.min(1, Number(tether.strain) || 0));
  if (!Number.isFinite(load) && !Number.isFinite(strain)) return null;
  return Object.freeze({ load, strain, hot: load >= 0.5 || strain >= 0.5 });
}

/** The release-read receipt line: tonnage and strain the moment the Line lets go. */
export function releaseReadReceipt({ tonnageU = 0, load = 0, strain = 0 } = {}) {
  const t = Math.max(0, Math.round(Number(tonnageU) || 0));
  const l = Math.max(0, Math.min(1, Number(load) || 0));
  const s = Math.max(0, Math.min(1, Number(strain) || 0));
  if (!t && !l && !s) return '';
  // A plain sentence, not a stat string: the flight glass never tier (D240) drops compact debug
  // fields, and the receipt lane reads in sentence case.
  const read = [t ? `${t} t` : '', `load ${Math.round(l * 100)}%`, `strain ${Math.round(s * 100)}%`].filter(Boolean);
  return `Line released: ${read.join(', ')}`;
}

/** VERB-05 — one receipt, the trick's name. Amendments are a different event and stay quiet. */
export function stuntTrickReceiptLine(trick) {
  if (!trick || trick.amendment) return '';
  const name = trick.name || trick.trickId || '';
  return String(name).trim();
}

/** Admit each episode once. `seen` is a Set of episode keys owned by the receipt binder. */
export function stuntDetectionReceipt(seen, trick) {
  const text = stuntTrickReceiptLine(trick);
  if (!text || !seen || typeof seen.add !== 'function') return null;
  const key = trick.episodeId != null ? `e:${trick.episodeId}` : `n:${text}`;
  if (seen.has(key)) return null;
  seen.add(key);
  if (seen.size > 64) seen.delete(seen.values().next().value);
  return { text, kind: 'stunt', channel: 'stunt' };
}

// ── Opening one-instruction rule ─────────────────────────────────────────────
// The first two minutes of a new game allow exactly one instruction on screen at a time — the
// current objective. Physical events are not sentences: while an objective is pending, the
// event caption, the comms log line, and the sector-law paragraph retire until the player has
// done the thing. Presenters consult openingInstructionSolo; the objective itself never asks,
// and danger keeps its own floor (an alarm is not an instruction).
export const OPENING_INSTRUCTION_WINDOW_S = 120;

// True while the sim clock sits inside the first OPENING_INSTRUCTION_WINDOW_S seconds of a new
// game. onboarding.startedAt anchors the clock when present (a Continue mid-window keeps the
// remainder); a fresh boot without it counts from simTime 0. A clock behind the anchor — a
// rewound save — never opens the window.
export function openingWindowActive(state) {
  const now = Number(state && state.simTime);
  if (!Number.isFinite(now)) return false;
  const startedAt = Number(state && state.onboarding && state.onboarding.startedAt);
  const elapsed = now - (Number.isFinite(startedAt) ? startedAt : 0);
  return elapsed >= 0 && elapsed < OPENING_INSTRUCTION_WINDOW_S;
}

// An instruction is pending while the staged rail is running or while a nav waypoint carries
// the current objective (story hook, tracked delivery, player-set course).
export function openingObjectivePending(state) {
  const ob = state && state.onboarding;
  if (ob && ob.active && !ob.finished) return true;
  const wp = state && state.nav && state.nav.waypoint;
  return !!(wp && String(wp.reason || wp.label || '').trim());
}

// True while the opening permits exactly one on-screen instruction: inside the window AND an
// objective pending. Secondary text surfaces retire for as long as this holds.
export function openingInstructionSolo(state) {
  return openingWindowActive(state) && openingObjectivePending(state);
}

export function hudJobFromState(state = {}, tether = null) {
  // The flight HUD already calls this every slow frame. That is the first-flight
  // moment this module can see — onboarding.js is not a mount point.
  if (state && state.mode === 'flight') syncTutorialFlightCard(state);
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

const TUTORIAL_FLIGHT_CARD_ID = 'sf-tutorial-flight-card';

function tutorialFlightHintsOff(state) {
  const gameplay = state && state.settings && state.settings.gameplay;
  return !!(gameplay && gameplay.tutorialHints === false);
}

/** True on the first free flight of a new game, before the card has been spent. */
export function tutorialFlightMoment(state) {
  if (!state || state.mode !== 'flight') return false;
  if (state.ui && state.ui.docked) return false;
  if (state.player && state.player.flags && state.player.flags.docked) return false;
  if (state.physicsVenueSession) return false;
  if (state.run && state.run.kind === 'survival' && state.run.phase && state.run.phase !== 'inactive') return false;
  if (tutorialFlightHintsOff(state)) return false;
  const ob = state.onboarding;
  if (!ob || ob.active !== true || ob.finished === true) return false;
  if (ob.pace && ob.pace.flownBefore === true) return false;
  return shouldShowFirstUseHint(state.player && state.player.hints, 'firstFlight');
}

export function tutorialFlightCardText(state) {
  return controlPrompt('tutorialFlight', getPromptDevice(), state);
}

function ensureTutorialFlightCardStyle(doc) {
  if (!doc || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  if (doc.getElementById('sf-tutorial-flight-card-style')) return;
  const style = doc.createElement('style');
  if (!style) return;
  style.id = 'sf-tutorial-flight-card-style';
  if (style.setAttribute) style.setAttribute('id', 'sf-tutorial-flight-card-style');
  style.textContent = '.sf-tutorial-flight-card{position:absolute;left:50%;top:18%;transform:translateX(-50%);max-width:min(42rem,86vw);pointer-events:none;z-index:30;text-align:center;line-height:1.35;}';
  const parent = doc.head || doc.body || doc.documentElement;
  if (parent && parent.appendChild) parent.appendChild(style);
}

/**
 * Mount CONTROL_PROMPTS.tutorialFlight once per profile. The flight HUD's slow
 * tick is the caller. A keys wall (bullet-separated bind list) is refused.
 */
export function syncTutorialFlightCard(state, doc) {
  const documentRef = doc || (typeof document !== 'undefined' ? document : null);
  if (!documentRef || typeof documentRef.getElementById !== 'function') return null;
  const existing = documentRef.getElementById(TUTORIAL_FLIGHT_CARD_ID);
  const inFlight = !!(state && state.mode === 'flight'
    && !(state.ui && state.ui.docked)
    && !(state.player && state.player.flags && state.player.flags.docked));
  if (existing && !inFlight) {
    existing.hidden = true;
    return null;
  }
  if (existing && inFlight && existing.hidden !== true) {
    const live = tutorialFlightCardText(state);
    if (live && !live.includes(' • ') && existing.textContent !== live) existing.textContent = live;
  }
  if (!tutorialFlightMoment(state)) return existing && existing.hidden !== true ? existing : null;
  const root = documentRef.getElementById('hud');
  if (!root || typeof documentRef.createElement !== 'function') return null;
  const text = tutorialFlightCardText(state);
  if (!text || text.includes(' • ')) return null;
  ensureTutorialFlightCardStyle(documentRef);
  let card = existing;
  if (!card) {
    card = documentRef.createElement('div');
    card.id = TUTORIAL_FLIGHT_CARD_ID;
    if (card.setAttribute) card.setAttribute('id', TUTORIAL_FLIGHT_CARD_ID);
    card.className = 'sf-tutorial-flight-card';
    if (card.setAttribute) card.setAttribute('role', 'status');
    if (root.appendChild) root.appendChild(card);
  }
  card.hidden = false;
  card.textContent = text;
  if (state.player) state.player.hints = markFirstUseHint(state.player.hints, 'firstFlight');
  return card;
}

/** The first wanted mark, once per profile. Empty on later heat. Never the surrender line. */
export function noteFirstWantedMark(state, wantedNow) {
  if (!state || !state.player || wantedNow !== true) return '';
  if (tutorialFlightHintsOff(state)) return '';
  if (!shouldShowFirstUseHint(state.player.hints, 'firstWanted')) return '';
  state.player.hints = markFirstUseHint(state.player.hints, 'firstWanted');
  return firstUseLine('firstWanted');
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
  return `${total} CONTACT${total === 1 ? '' : 'S'}`;
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
  // The shield visibly regrows; the hull does not. The first bite that reaches the hull
  // names the survival rule once — plate stays hurt until a repair berth welds it.
  firstHullBite: 'The shield grows back. Hull does not — a berth repairs it.',
  firstOwnedGoods: 'Someone owns that lot. Lift it in sight, you\'re wanted.',
  // X-01: the salvage bay loop already pays; the first fill and the first cash-in say so once.
  firstSalvageBay: 'Salvage is in the bay. Dock to cash it.',
  firstSalvageCashIn: 'Bay paid out. Fight, fill, dock.',
  firstStation: 'Dock.',
  firstGate: 'Plot a jump.',
  firstCargoFull: 'Sell cargo.',
  // SEED-ST-12 — the mark itself, not TEACH-10's surrender line.
  firstWanted: 'WANTED. It clears over time outside the search, or with distance.',
  firstFrontier: 'The rim keeps no records. Chart it yourself.',
  firstHub: "Pick a service above. Undock when you're ready.",
  firstDrill: 'Bore beside useful seams. Keep the faces.',
  firstOutfit: 'Fit the module.',
  firstTech: 'Research unlocked gear.',
  firstAutomation: 'Drones work the field.',
  firstClaim: 'Build on the claim.',
  firstCraft: 'Queue the job.',
  masslineThrow: 'Latch, then cut.',
  masslineHitchhiking: 'Ride, then cut.',
  masslineSelfSling: 'Cut to sling.',
  masslineJettisonImpulse: 'Dump aft to push.',
  // TEACH-03 — the cadence winch is taught by the first swing that could actually pump,
  // not by a straight tow that would lie about the gesture.
  masslineCadenceWinch: 'Swing carries — reel under BOOST to pump.',
  // TEACH-05 — the mass seed's first deploy names the warning-then-collapse rule it lives
  // by; the lesson belongs at the deploy, never at the collapse.
  massSeedDeploy: 'Anchor seed out — it warns, then it folds.',
  masslineBulletTime: 'Hold to stretch time.',
  masslineCloak: 'Coast to stay hidden.',
  // FB-013 — the four silent heads announce themselves once, on the head's first defining
  // event (tractor capture, coupler lock, sweep cut, whip snap). Same ≤12-word drill budget.
  masslineTractor: 'Line holds. Pull it in.',
  masslineCoupler: 'Coupler locked. You tow as one hull.',
  masslineSweep: 'Blade across their line.',
  masslineWhip: 'Let the stretch go.',
  bombPropulsion: 'Drop aft, then detonate.',
  firstBombDrop: 'Bomb away. Clear the blast.',
  firstWellDrop: 'Well deployed. Pull the scrap.',
  firstRepulsorDrop: 'Repulsor out. Everything near just got shoved.',
  firstConeOn: 'Cone on. The lane ahead is yours.',
});

export function firstUseLine(verbId) {
  return FIRST_USE_LINE[verbId] || '';
}

// Rescue-opening verb lines (PQ-163.00). The rescue rail teaches its three verbs by doing, one
// line each, through the single tutorial voice — never as text walls and never as mentor dialogue.
// Copy lives here (presentation owner); the rail in src/onboarding/rescueOpening.js owns order,
// gating, and completion. Each line names ONE verb and stays on the ≤12-word drill budget.
export const RESCUE_BEAT_LINES = Object.freeze({
  swing: 'Swing the rock through the wreck.',
  shove: 'Put the scout into the asteroid.',
  grab: 'Grab the pod. Run for the beacon.',
});

export function rescueBeatLine(verbId) {
  return RESCUE_BEAT_LINES[verbId] || '';
}

// Range pointer copy (PQ-163.01 — "The Range is the door"). After the first latch, onboarding points
// at the Range (F4). SWING, DO NOT PULL is the first drill rung. Under the ≤12-word budget.
export const RANGE_POINTER_LINE = 'Range (F4)';

export function rangePointerLine() {
  return RANGE_POINTER_LINE;
}

// Missing-three verb lines (PQ-163.02). Boost, the stroke, the well, the repulsor, and the
// clearing cone are taught by doing, one line each, then silence. Copy lives here;
// order/gating live in src/onboarding/missingThree.js. Lines name the tool, never the key —
// bindings are rebindable.
export const MISSING_THREE_BEAT_LINES = Object.freeze({
  boost: 'Boost. Keep the speed.',
  stroke: 'Draw a line. Fly it.',
  well: 'Drop a well. Pull the scrap.',
  repulsor: 'Drop the plow. Shove the scrap.',
  cone: 'Cone on. Clear a lane.',
});

export function missingThreeBeatLine(verbId) {
  return MISSING_THREE_BEAT_LINES[verbId] || '';
}

// Verb-shelf lines (FB-002 / FB-116). The verbs with no staged beat still get spoken — once each,
// in the player's own device vocabulary, on the moment the verb matters. Copy lives here; trigger
// specs live in src/onboarding/verbSpeech.js; systems/onboarding.js owns the moments. Each line
// embeds the LIVE binding label (keyboard code, pad chord, or nothing on touch) so a rebind can
// never strand the words. ≤12-word drill budget, binding excluded.
export const SHELF_VERB_LINES = Object.freeze({
  travelBurn: 'The burn keeps the speed',
  chargeThrow: 'A charge is racked',
  bulletTime: 'The clock widens',
  cloak: 'The shroud is fitted',
  deployBeacon: 'The beacon marks the spot',
  toggleSkimCollector: 'The scoop harvests a band',
  jettisonLot: 'The lot goes out the back',
});

export function shelfVerbLine(verbId, bindingLabel) {
  const what = SHELF_VERB_LINES[verbId];
  if (!what) return '';
  const key = String(bindingLabel || '').trim();
  // A binding that is itself punctuation (Period → '.') must not print a double full stop.
  if (!key) return `${what}.`;
  return /[.!?]$/.test(key) ? `${what} — ${key}` : `${what} — ${key}.`;
}

export function firstUseAttachKind(verbId) {
  const key = String(verbId || '');
  if (key === 'firstStation' || key === 'firstHub' || key === 'firstGate') return 'station';
  if (key === 'firstOwnedGoods') return 'rock';
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
    const stations = index.stations;
    if (Array.isArray(stations)) {
      for (const entity of stations) {
        if (entity && entity.alive !== false && entity.data && entity.data.stationId === stationId) {
          return entity.id;
        }
      }
    }
    return null;
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
  const width = Math.min(action.width, 320);
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

/**
 * Wave G12 — dock prompt, speed readout, and weapon name each own a box.
 * The three boxes are disjoint at the 1280×720 floor and at 1920×1080.
 */
export function flightInstrumentRects(width, height) {
  const w = Math.max(320, Number(width) || 1280);
  const h = Math.max(240, Number(height) || 720);
  const speedW = Math.min(220, Math.floor(w * 0.18));
  const weaponW = Math.min(180, Math.floor(w * 0.16));
  const gap = 24;
  const pair = speedW + gap + weaponW;
  const left = Math.round((w - pair) / 2);
  const bandY = h - 96;
  return {
    speedReadout: { x: left, y: bandY, width: speedW, height: 52 },
    weaponName: { x: left + speedW + gap, y: bandY + 10, width: weaponW, height: 28 },
    dockPrompt: { x: Math.round(w / 2 - 140), y: 156, width: 280, height: 32 },
  };
}

export function flightReadoutsDisjoint(width, height) {
  const boxes = flightInstrumentRects(width, height);
  return !rectsOverlap(boxes.speedReadout, boxes.weaponName)
    && !rectsOverlap(boxes.speedReadout, boxes.dockPrompt)
    && !rectsOverlap(boxes.weaponName, boxes.dockPrompt);
}

/**
 * Wave G13 — a HUD string is not a caption on the player's hull.
 * The Massline bracket is the one exempt mark. A string parented to the player
 * billboard, or sitting inside one hull-length of the player screen point, is pushed clear.
 */
export function placeHudString(point, playerPoint, hullLengthPx, { exempt = false } = {}) {
  const x = Number(point && point.x) || 0;
  const y = Number(point && point.y) || 0;
  if (exempt) return { x, y };
  const px = Number(playerPoint && playerPoint.x) || 0;
  const py = Number(playerPoint && playerPoint.y) || 0;
  const min = Math.max(8, Number(hullLengthPx) || 0);
  const dx = x - px;
  const dy = y - py;
  const dist = Math.hypot(dx, dy);
  if (dist >= min) return { x, y };
  if (dist < 0.001) return { x: px, y: py - min };
  const scale = min / dist;
  return { x: px + dx * scale, y: py + dy * scale };
}

export function hudStringCoversHull({
  parentBillboard = '',
  x = 0,
  y = 0,
  playerX = 0,
  playerY = 0,
  hullLengthPx = 0,
  exempt = false,
} = {}) {
  if (exempt) return false;
  if (parentBillboard === 'player') return true;
  const min = Math.max(8, Number(hullLengthPx) || 0);
  return Math.hypot(x - playerX, y - playerY) < min;
}
