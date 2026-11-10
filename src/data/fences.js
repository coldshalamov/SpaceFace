// fences.js - THE WORLD REMEMBERS (U-B): fences with faces.
//
// WANTED is a career with people in it. The deniable job (C11) is no longer an anonymous crate:
// six outlaw-friendly berths each have an AUTHORED fence - a named person with a quirk that shapes
// the jobs they post, a ledger of what the pilot did with their work, and a voice in their
// faction's register. The cast is STABLE: a fence can be burned for a long while (trust -3, the
// existing deniable burn window) but is never deleted, and trust forgives slowly with board time.
//
// This file is PURE: the roster, the pure shape/price/odds rules, and READ-ONLY views of the
// durable ledger. The only writer is the fence desk (systems/fenceDesk.js, installed by the
// encounter director); the only readers are economyContracts (offer shape), the bar contact
// (ui/station/fenceContact.js) and the desk itself.
//
// Ledger: `state.encounterDirector.stats.fences = { byId: { [fenceId]: row } }` - lazy. A run that
// never meets a fence serializes byte-identically to before (the key is absent, not empty).
// Picked by hash32, never RNG: portrait slots and every roll here are pure in (seed, ids, epoch).
import { hash32 } from '../core/rng.js';
import { localPortraitForContact } from './localPortraits.js';
import { DENIABLE_PAY_SCALE, deniableAmbushChance } from './economyContractTemplates.js';
import { boldAmbushChance } from './deniableAftermath.js';

// ── trust ────────────────────────────────────────────────────────────────────────────────────
export const FENCE_TRUST_MIN = -3;
export const FENCE_TRUST_MAX = 3;
/** Trust moves by the EXISTING deniable receipts - the aftermath is not re-implemented here. */
export const FENCE_TRUST_DELTA = Object.freeze({ thanked: 1, lost: -1, burned: -3, routeLost: -1 });
/** A sour fence warms one step per this many board epochs of silence (never past 0). */
export const FENCE_FORGIVE_EPOCHS = 24;
/** trust >= 1: a bigger haul over a longer leg at better pay. */
export const FENCE_BIG_TRUST = 1;
/** trust >= 2: the fence's ROUTE (three linked legs, one-time reward). */
export const FENCE_ROUTE_TRUST = 2;
export const FENCE_BIG_PAY_BONUS = 0.3;       // added to the pay scale at trust >= 1
export const FENCE_BIG_QTY_MULT = 1.5;
export const FENCE_ROUTE_LEGS = 3;
export const FENCE_ROUTE_LEG_PAY_SCALE = 1.6; // per leg, on the lawful quote
export const FENCE_ROUTE_PENDING_EPOCHS = 12; // an unaccepted next leg lapses (no penalty)
export const FENCE_ROUTE_LEG_WINDOW = 6;      // board epochs a posted next leg stays on the board
export const FENCE_TIP_HEAT_LEVEL = 4;        // heat level at which a cold fence may sell you
export const FENCE_ROUTE_CAUSE_TAG = 'fence_route';
/**
 * Base price of a survivor pod sold to a fence who buys them (`quirk.wantsPods`).
 * Equal to the lawful mayday salvage fee (survivorPod `CAUSAL_RESCUE_SALVAGE_FEE_CR`):
 * the same money, a different conscience, before that fence's pay scale.
 */
export const FENCE_RANSOM_FEE_CR = 420;
/** Spoken when a wantsPods fence has no authored `lines.ransom`. */
export const FENCE_RANSOM_FALLBACK_LINE = 'A live pod. I buy those. The note stays, the pay is yours.';

export const clampTrust = (value) => {
  const n = Math.round(Number(value) || 0);
  return n < FENCE_TRUST_MIN ? FENCE_TRUST_MIN : n > FENCE_TRUST_MAX ? FENCE_TRUST_MAX : n;
};

// ── the roster ───────────────────────────────────────────────────────────────────────────────
// quirk:
//   payScale / deadlineMult / cargo / lawfulDestOnly / noSetup  shape the deniable job
//   fixer                                                       sells a heat scrub at the bar
// route: three stations (each one hop from the last), the cargo, and the one-time reward in the
// fence's currency - credits | module | rep.
const FENCE_LIST = [
  {
    id: 'fence_oriel_pask',
    name: 'Oriel Pask',
    stationId: 'station_smuggler',
    factionId: 'faction_quiet',
    title: 'Fixer',
    quirk: { id: 'fixer', summary: 'Scrubs a record for a price. Posts the standard crate.', fixer: true },
    route: {
      cargo: 'cmdty_electronics',
      legs: ['station_ceres', 'station_hyperion_cut', 'station_beltout'],
      reward: { kind: 'rep', amount: 8, label: 'a quiet word with the Quiet' },
    },
    lines: {
      first: 'Hot, are we. Sit. The Den keeps a drawer for people like you and a ledger for what it costs.',
      trusted: 'You again, and still breathing. Good. I scrub, I do not judge, and for you the price has a little give.',
      burned: 'Somebody was waiting at that drop. The Den notices who walks away from a set-up. Not today.',
      lost: 'Your cargo went down with the crate and my name went down with it. We both pay for that.',
      thanks: 'Clean drop. Nobody asked, nobody owed. That is the whole trade.',
      unknown: 'I do not know you. I never knew you. Somebody will be along to ask about the heat on that hull.',
    },
  },
  {
    id: 'fence_cutter_ruan',
    name: 'Cutter Ruan',
    stationId: 'station_sker',
    factionId: 'faction_reach',
    title: 'Powder broker',
    quirk: {
      id: 'volatile', summary: 'Moves volatile cargo. Pays rich, gives you almost no time.',
      payScale: 2.4, deadlineMult: 0.6,
      cargo: ['cmdty_volatiles', 'cmdty_fuel_cells', 'cmdty_gas_hydrogen'],
    },
    route: {
      cargo: 'cmdty_volatiles',
      legs: ['station_rhea_cinder', 'station_haumea_rift', 'station_rhea_cinder'],
      reward: { kind: 'credits', amount: 5200, label: 'the whole powder pot' },
    },
    lines: {
      first: 'Fresh meat with a warrant! Ha. I got a crate that goes off if you look at it wrong. Pays like a crown.',
      trusted: 'There he is, the one who does not blow up. Come, I saved you the loud freight.',
      burned: 'You flew out of my trap like it was a door. I will remember the door. Go find someone else to scare.',
      lost: 'You dropped my powder. The powder dropped itself on my reputation. That costs, friend.',
      thanks: 'On the clock and still in one piece. I like that. I like that a lot.',
      unknown: 'Never seen you before. Sorry. Reach does not know you, and Reach likes bounties.',
    },
  },
  {
    id: 'fence_ilsa_greve',
    name: 'Ilsa Greve',
    stationId: 'station_kepler_scar',
    factionId: 'faction_reach',
    title: 'Note buyer',
    quirk: {
      id: 'ransom', summary: 'Buys the ransom notes off captured crews. Pays the most, asks the worst.',
      payScale: 2.6, wantsPods: true,
    },
    route: {
      cargo: 'cmdty_luxury_goods',
      legs: ['station_sker', 'station_veil', 'station_triton'],
      reward: { kind: 'credits', amount: 6400, label: 'the ransom share' },
    },
    lines: {
      first: 'Wanted. Good, wanted travels light. I buy ransom notes, dear, and I pay better than the families do.',
      trusted: 'My favorite carrier. Keep the notes dry and the survivors quiet and we will both eat well.',
      burned: 'You walked out of my little welcome. Careful. People who do that tend to meet the survivors.',
      lost: 'You lost a crate of paper worth a ship. Paper has a long memory, dear. So do I.',
      thanks: 'Delivered, and no fuss. The Scar likes a quiet courier.',
      unknown: 'I have no idea who you are, and a pilot that hot is worth a phone call. Mind how you dock.',
      ransom: 'A pod, and still breathing. The families pay late, dear. I pay now, and the Scar keeps them quiet.',
    },
  },
  {
    id: 'fence_hesper_quill',
    name: 'Hesper Quill',
    stationId: 'station_nyx_march',
    factionId: 'faction_quiet',
    title: 'Pharmacist',
    quirk: {
      id: 'mercy', summary: 'Only moves medical and food. Pays less, and never sets you up.',
      payScale: 1.4, cargo: ['cmdty_medical', 'cmdty_food'], noSetup: true,
    },
    route: {
      cargo: 'cmdty_medical',
      legs: ['station_hyperion_cut', 'station_ceres', 'station_tethys'],
      reward: { kind: 'rep', amount: 10, label: 'a debt the Quiet will honor' },
    },
    lines: {
      first: 'Warrant or no warrant, a clinic still needs its crates. I pay less. I also do not sell my carriers.',
      trusted: 'You keep the shelves full. The Nyx March remembers who does that, and so do I.',
      burned: 'If somebody waited at that drop, it was not me. Prove it to yourself, then come back.',
      lost: 'The medicine did not arrive. Someone is going without. I will not say who.',
      thanks: 'Every crate counts. Thank you, truly. The Quiet keeps a short list of people like you.',
      unknown: 'I do not know you, I am sorry. At that heat I cannot be the last place the law checked.',
    },
  },
  {
    id: 'fence_teodor_lisk',
    name: 'Teodor Lisk',
    stationId: 'station_io_merc',
    factionId: 'faction_quiet',
    title: 'Corridor man',
    quirk: {
      id: 'corridor', summary: 'Runs lawful-side drops through the customs cones. Fair pay, tight lanes.',
      payScale: 1.8, lawfulDestOnly: true,
    },
    route: {
      cargo: 'cmdty_comp_circuitry',
      legs: ['station_nereid', 'station_tethys', 'station_dione'],
      reward: { kind: 'credits', amount: 4800, label: 'the corridor fee' },
    },
    lines: {
      first: 'You are loud, but so is a gate. I run crates through the customs cones on the lawful side. Interested?',
      trusted: 'The cutters know your hull and still wave you through. Funny how that works. Sit.',
      burned: 'A drop with a welcome party. I do not run corridors for people who leave a mess. Not yet.',
      lost: 'You lost the crate in the cone. The cutters logged the loss and I logged you.',
      thanks: 'Through the cone and out the other side. The Outpost likes a pilot who knows the lane.',
      unknown: 'I have not met you. The customs wing would like to, I hear. Move along, friend.',
    },
  },
  {
    id: 'fence_pyrrha_rivet',
    name: 'Pyrrha Rivet',
    stationId: 'station_proteus',
    factionId: 'faction_quiet',
    title: 'Tinker',
    quirk: {
      id: 'tinker', summary: 'Patchwork tinker. Pays thin in credits, fat in parts.',
      payScale: 1.5,
    },
    route: {
      cargo: 'cmdty_salvage_electronics',
      legs: ['station_veil', 'station_reach', 'station_nereid'],
      reward: { kind: 'module', defId: 'mod_quiet_mask_s', label: 'a quiet mask, welded in orange' },
    },
    lines: {
      first: 'A hull with a warrant and a good heart. I patch, I swap, I pay in parts. What are you hauling?',
      trusted: 'Look at you, back with your seams intact. The good bins are open to you, love.',
      burned: 'You got out of my set-up clean. Fine, fine. Rivet does not forget a weld that held.',
      lost: 'You lost my crate. Do you know how long the parts took to find? Neither do I. That is the problem.',
      thanks: 'It arrived in one piece. Nobody ever does that. You get the good solder.',
      unknown: 'I never saw you. At that heat I never see anyone. Go on, shoo, before the bins get nervous.',
    },
  },
];

const TAKEN_FACES = new Set();

// Slots 4..11: the id `contact_<stationId>_<slot>` is what localPortraitForContact reads, and the
// 8-face smuggler pool wraps, so eight probes reach every face (4..7 alone never reach them all).
function pickFaceSlot(fence) {
  const start = hash32(fence.id, 'fence-face') % 8;
  for (let k = 0; k < 8; k++) {
    const slot = 4 + ((start + k) % 8);
    const face = localPortraitForContact({ id: `contact_${fence.stationId}_${slot}`, role: 'smuggler' });
    if (!TAKEN_FACES.has(face)) { TAKEN_FACES.add(face); return slot; }
  }
  return 4 + start;
}

export const FENCES = Object.freeze(FENCE_LIST.map((fence) => Object.freeze({
  ...fence,
  quirk: Object.freeze({ ...fence.quirk }),
  route: Object.freeze({ ...fence.route, legs: Object.freeze([...fence.route.legs]), reward: Object.freeze({ ...fence.route.reward }) }),
  lines: Object.freeze({ ...fence.lines }),
  // The face: a smuggler-role local. The slot starts at a hash32 pick (never RNG) and probes on to
  // the first face no earlier fence wears, so the six always read as six people.
  portraitSlot: pickFaceSlot(fence),
})));

export const FENCE_BY_ID = new Map(FENCES.map((fence) => [fence.id, fence]));
export const FENCE_BY_STATION = new Map(FENCES.map((fence) => [fence.stationId, fence]));

export function fenceForStation(stationId) {
  return stationId ? FENCE_BY_STATION.get(stationId) || null : null;
}

export function fenceContactId(fence) {
  return `contact_${fence.stationId}_${fence.portraitSlot}`;
}

// ── the ledger (read-only here; the fence desk is the one writer) ────────────────────────────
function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function sanitizeFenceRoute(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const status = raw.status === 'running' || raw.status === 'pending' ? raw.status : null;
  if (!status) return null;
  const leg = Math.min(FENCE_ROUTE_LEGS, Math.max(1, Math.floor(finite(raw.leg, 1))));
  return {
    status,
    leg,
    missionId: text(raw.missionId),
    destStationId: text(raw.destStationId),
    pendingStationId: text(raw.pendingStationId),
    sinceEpoch: Math.floor(finite(raw.sinceEpoch)),
  };
}

export function sanitizeFenceRow(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const ask = src.lastAsk && typeof src.lastAsk === 'object' ? src.lastAsk : null;
  return {
    met: src.met === true,
    trust: clampTrust(src.trust),
    jobsDone: Math.max(0, Math.floor(finite(src.jobsDone))),
    jobsLost: Math.max(0, Math.floor(finite(src.jobsLost))),
    burnedUntilEpoch: Math.floor(finite(src.burnedUntilEpoch)),
    lastOutcome: text(src.lastOutcome),
    lastChangeEpoch: Math.floor(finite(src.lastChangeEpoch)),
    lastTipEpoch: src.lastTipEpoch == null ? null : Math.floor(finite(src.lastTipEpoch)),
    routeDone: src.routeDone === true,
    route: sanitizeFenceRoute(src.route),
    lastAsk: ask ? { kind: text(ask.kind), ok: ask.ok === true, reason: text(ask.reason) } : null,
  };
}

/** The whole ledger, sanitized; null when it is absent or unusable. Never the stored objects. */
export function sanitizeFenceLedger(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const byId = raw.byId && typeof raw.byId === 'object' && !Array.isArray(raw.byId) ? raw.byId : null;
  if (!byId) return null;
  const out = {};
  for (const id of Object.keys(byId).sort()) {
    if (FENCE_BY_ID.has(id)) out[id] = sanitizeFenceRow(byId[id]);
  }
  return Object.keys(out).length ? { byId: out } : null;
}

/** One fence's row (defaults when never met) - a copy, safe to read and discard. */
export function fenceRowOf(state, fenceId) {
  const dir = state && state.encounterDirector;
  const stored = dir && dir.stats && dir.stats.fences && dir.stats.fences.byId;
  return sanitizeFenceRow(stored && stored[fenceId]);
}

export function fenceTrustAt(state, stationId) {
  const fence = fenceForStation(stationId);
  return fence ? fenceRowOf(state, fence.id).trust : 0;
}

// ── pure rules ───────────────────────────────────────────────────────────────────────────────
/** Heat-level odds, lowered by trust. Negative trust never RAISES them: a sour fence is already
 *  priced by the burn window and the emboldened bonus (deniableAftermath). */
export function fenceAmbushBase(level, trust) {
  return deniableAmbushChance(level, clampTrust(trust));
}

/** The final printed/rolled chance for a fence's job: trust-lowered base + emboldened bonus,
 *  capped at 1. A fence whose quirk is `noSetup` never sets the pilot up at all. */
export function fenceAmbushChance(state, stationId, level, bonus = 0) {
  const fence = fenceForStation(stationId);
  if (fence && fence.quirk.noSetup) return 0;
  return boldAmbushChance(fenceAmbushBase(level, fence ? fenceRowOf(state, fence.id).trust : 0), bonus);
}

/** What the fence's job looks like at this trust: pay, size, timer, cargo, destination rule. */
export function fenceDealShape(fence, trust) {
  const q = fence ? fence.quirk : {};
  const big = clampTrust(trust) >= FENCE_BIG_TRUST;
  return {
    payScale: (q.payScale || DENIABLE_PAY_SCALE) + (big ? FENCE_BIG_PAY_BONUS : 0),
    qtyMult: big ? FENCE_BIG_QTY_MULT : 1,
    deadlineMult: q.deadlineMult || 1,
    cargoPool: Array.isArray(q.cargo) && q.cargo.length ? q.cargo : null,
    lawfulDestOnly: !!q.lawfulDestOnly,
    longLeg: big,
    noSetup: !!q.noSetup,
  };
}

/** True when the fence's route should be the next thing it posts. */
export function fenceRouteReady(row) {
  return !!row && row.trust >= FENCE_ROUTE_TRUST && !row.routeDone && !row.route;
}

/** The scrub price: one heat level costs 250 cr, a trusted fence gives 10% per trust point back. */
export function fenceScrubCostCr(level, trust) {
  const lv = Math.max(1, Math.min(5, Math.floor(Number(level) || 1)));
  const discount = 1 - 0.1 * Math.max(0, clampTrust(trust));
  return Math.max(50, Math.round(250 * lv * discount));
}

/** Which of the fence's lines the current ledger earns. Pure; the bar and the desk share it. */
export function fenceSituation(row, epoch) {
  if (!row || !row.met) return 'first';
  if (row.trust <= -3 || epoch < row.burnedUntilEpoch) return 'burned';
  if (row.lastOutcome === 'lost' && row.trust <= 0) return 'lost';
  if (row.lastOutcome === 'thanked' && row.trust >= 1) return 'thanks';
  if (row.trust >= 1) return 'trusted';
  return 'first';
}

export function fenceLine(fence, situation) {
  return (fence && fence.lines && fence.lines[situation]) || (fence && fence.lines.first) || '';
}

/** The line spoken when a wantsPods fence buys a pod. Authored `lines.ransom`, else the generic. */
export function fenceRansomLine(fence) {
  const authored = fence && fence.lines && fence.lines.ransom;
  return authored || FENCE_RANSOM_FALLBACK_LINE;
}

/** Deterministic tip-off roll: pure in (seed, fence, epoch). Colder fences sell you more often. */
export function fenceTipRoll(seed, fenceId, epoch, trust) {
  const chance = Math.min(1, 0.5 + 0.25 * Math.max(0, -clampTrust(trust)));
  const roll = (hash32(seed || 0, fenceId, epoch, 'fence-tip') % 1e6) / 1e6;
  return roll < chance;
}
