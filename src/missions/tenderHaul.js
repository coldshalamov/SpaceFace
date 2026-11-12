// src/missions/tenderHaul.js — W-TENDER, "The Tender — Tethys to the Forge".
//
// The authored sibling of bulk_trade: one open iron-ore lot (440 u) posted through the Tethys
// junction rail for the Forge foundry desk, with a live intake window, a Concord weigh fork, and
// a settle that re-prices instead of voiding. This module carries the RUN, the way cinderRoute.js
// carries the Cinder squad and heistMissionRuntime.js carries the capsule run:
//
//   * an authorship guard — anything not exactly this authored version (ordinary contracts,
//     legacy saves, foreign type rows) keeps current behavior, false/null;
//   * the rival-queue spawn spec — two civilian haulers on loiter doctrine
//     (src/systems/driftAuctionRuntime.js:282-303 shape) holding the Customs Gate scan face on
//     authored dwells, with a mission-owned durable re-bind ledger per capitalBossSpawn.js: the
//     ledger lists each slot's live hull; spawn adopts live members first and never moves one;
//   * the drive adjudicator — close + sell-out grace + floor, with every settlement routed
//     through the owner's ordinary _completeMission/_failMission paths;
//   * the duty stamps at BOTH weigh moments (declaration at the Tally, intake at the Forge) —
//     the number is stamped once, at the weigh, into params; settle only ever charges it;
//   * receipt/ledger words and the fail-forward spot-sale post (a board row, never an accept).
//
// NO PAYMENT, CHARGE, CONFISCATION, OR HEAT WRITE LIVES HERE. The missions owner emits
// economy:grantCredits / economy:chargeCredits / faction:repDelta and settles the contract —
// per src/missions/AGENTS.md. heat.js owns any piracy consequences on its own; mission code
// never touches heat, including for the rival hulls.
//
// Determinism: every dwell, window, and floor is authored data (TENDER_HAUL_TUNING); all clocks
// read state.simTime / state.tick — no Math.random, no wall time, no Three.js.

import {
  TENDER_HAUL_TUNING,
  TENDER_HAUL_TYPE,
  TENDER_HAUL_SOURCE,
  TENDER_HAUL_TAG,
  TENDER_HAUL_FACTION_ID,
  TENDER_HAUL_GATE_FACTION_ID,
} from '../data/missionsData.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { setEntityDoctrine } from '../ai/doctrine.js';
import { makeEnemySpawnSpec } from '../systems/combat.js';
import { deferredEnterTick } from '../core/sectorEnterDefer.js';
import { forEachLivingWorldActor } from '../world/livingWorldViews.js';

export const TENDER_HAUL_VERSION = 1;
export const TENDER_RECORD_SCHEMA = 'spaceface.tenderHaul.v1';

// The fail-forward spot row's own source tag — a posted board row (never auto-accepted), carried
// through ensureBoard retention with the other posted authored work.
export const TENDER_SPOT_SOURCE = 'tenderSpotSale';

/** Authorship guard: only this exact authored version drives the tender run. */
export function authoredTenderHaul(m) {
  return !!m && m.type === TENDER_HAUL_TYPE
    && m.params && m.params.tenderHaulVersion === TENDER_HAUL_VERSION
    && m.params.tenderTag === TENDER_HAUL_TAG;
}

/** The mission-owned durable record (serialized wholesale inside the active entry, heist precedent). */
export function createTenderRecord({
  missionId,
  tick = 0,
  closeAtS = null,
  graceS = TENDER_HAUL_TUNING.graceS,
  floorUnits = TENDER_HAUL_TUNING.floorUnits,
  lotUnits = TENDER_HAUL_TUNING.lotUnits,
  manifestUnits = TENDER_HAUL_TUNING.manifestUnits,
} = {}) {
  return {
    schema: TENDER_RECORD_SCHEMA,
    missionId: missionId != null ? String(missionId) : null,
    createdTick: Math.max(0, Math.trunc(Number(tick) || 0)),
    closeAtS: Number.isFinite(Number(closeAtS)) ? Number(closeAtS) : null,
    graceS: Math.max(0, Number(graceS) || 0),
    floorUnits: Math.max(1, Math.trunc(Number(floorUnits) || 1)),
    lotUnits: Math.max(1, Math.trunc(Number(lotUnits) || 1)),
    manifestUnits: Math.max(0, Math.trunc(Number(manifestUnits) || 0)),
    // Runtime ledger: rival queue (durable re-bind), window/grace stamps, settlement.
    rivals: [],
    windowClosedAt_s: null,
    graceUntilS: null,
    deskContactAt_s: null,
    settledOutcome: null,
    // Contract ore the player BOUGHT at the desk market since accept. A desk sale first pays this
    // down before it counts, so ore bought from the Forge and sold straight back never fills the lot.
    deskBoughtUnits: 0,
  };
}

/**
 * Accept-time initialization. Stamps the intake window's close on the contract's own params so
 * the dossier pacing chip, the condition catalog, and the drive all read one number. The window
 * is the drive runtime's clock — the offer carries NO duration_s, so the shipped deadline branch
 * can never mint the red EXPIRED this contract forbids.
 */
export function initializeTenderHaul(owner, m) {
  if (!authoredTenderHaul(m)) return false;
  const tuning = TENDER_HAUL_TUNING;
  if (!m.tender) {
    const acceptedAt = Number(m.acceptedAt_s) || 0;
    m.params.tenderCloseAt_s = acceptedAt + Math.max(0, Number(tuning.windowS) || 0);
    m.tender = createTenderRecord({
      missionId: m.id,
      tick: owner && owner.state ? owner.state.tick | 0 : 0,
      closeAtS: m.params.tenderCloseAt_s,
      graceS: m.params.graceS,
      floorUnits: m.params.floorUnits,
      lotUnits: m.params.qty,
      manifestUnits: m.params.manifestUnits,
    });
  }
  if (!Number.isFinite(Number(m.params.tenderCloseAt_s))) {
    m.params.tenderCloseAt_s = (Number(m.acceptedAt_s) || 0) + Math.max(0, Number(tuning.windowS) || 0);
    m.tender.closeAtS = m.params.tenderCloseAt_s;
  }
  return true;
}

// ── The rival queue: two rival haulers holding the scan face on their own clocks ─────────────
// Authored dwells, staggered: the first hauler holds from the moment the run spawns, the second
// starts its hold after the first's window has begun to run. The face frees as each completes and
// departs; queue seconds are window seconds. These are world hulls (not menu entries): civilians
// on loiter doctrine, hold-fire — shooting them is piracy, and heat.js convicts that on its own.
export const TENDER_RIVAL_QUEUE = Object.freeze([
  Object.freeze({
    slot: 0,
    name: 'FLAT RATE',
    scanLabel: 'FLAT RATE — TALLY RUN (HOLDING FOR COUNT)',
    dwellS: TENDER_HAUL_TUNING.rivalDwellS,
    startDelayS: 0,
  }),
  Object.freeze({
    slot: 1,
    name: 'COLDER LEDGER',
    scanLabel: 'COLDER LEDGER — TALLY RUN (QUEUED)',
    dwellS: TENDER_HAUL_TUNING.rivalDwellS,
    startDelayS: TENDER_HAUL_TUNING.rivalStaggerS,
  }),
]);

const RIVAL_ANCHOR_PINS = Object.freeze([
  Object.freeze({ x: -1100, z: -795 }), // the Tally's red-side scan gate pin (sectors.js, WF-03)
  Object.freeze({ x: -1033, z: -907 }), // the green-side pin — the queue runs between the two
]);

function rivalAnchorGlobal(slot) {
  const pin = RIVAL_ANCHOR_PINS[Math.max(0, Math.min(RIVAL_ANCHOR_PINS.length - 1, slot | 0))];
  return sectorLocalToGlobalForSector(pin, TENDER_HAUL_TUNING.gateSectorId);
}

/**
 * The durable queue slot a hull was filed under. `_stampMissionTargetIdentity` mints
 * `mission:<m.id>:<slot>` as the hull's identityKey, and world-record capture persists that key
 * (src/world/worldRecords.js:901-902) while it drops the runtime stamps (tenderRivalOf /
 * tenderRivalSlot / tallyDwellUntil are entity-data only) — so after a mid-run save/load this
 * identityKey is the ONE queue identity a rematerialized hull still carries. Same parse shape as
 * missionTargetSlotOf (src/systems/missionShared.js:1331), restricted to this queue's slots.
 */
function tenderRivalSlotOf(entity, m) {
  const data = entity && entity.data;
  if (!data) return null;
  const explicit = Number(data.tenderRivalSlot);
  if (Number.isInteger(explicit) && explicit >= 0) return explicit;
  const identity = typeof data.identityKey === 'string' ? data.identityKey : '';
  const prefix = `mission:${m && m.id != null ? m.id : ''}:`;
  if (!identity.startsWith(prefix)) return null;
  const tail = identity.slice(prefix.length);
  if (!/^\d+$/.test(tail)) return null;
  const slot = Number(tail);
  return Number.isSafeInteger(slot) && TENDER_RIVAL_QUEUE.some((spec) => spec.slot === slot)
    ? slot
    : null;
}

/**
 * True when the hull belongs to THIS run's rival queue: by the runtime stamp on a fresh spawn,
 * or — after a mid-run save/load — by the durable mission identity the world record kept
 * (data.missionTag + identityKey slot). The settled/release state never matches: release clears
 * both owner tags (releaseTenderRivalHull), so a standing-off hull stays lane life.
 */
export function isTenderRivalHull(entity, m) {
  if (!entity || !entity.data || !authoredTenderHaul(m)) return false;
  const data = entity.data;
  if (data.tenderRivalOf != null) return data.tenderRivalOf === String(m.id);
  const owner = data.missionId != null ? data.missionId : data.missionTag;
  if (owner == null || String(owner) !== String(m.id)) return false;
  return tenderRivalSlotOf(entity, m) != null;
}

/**
 * True when a durable world record was minted for this run's rival queue (the
 * `mission:<m.id>:<slot>` identity filed under the gate sector). The record-only settlement case:
 * the player settles at the desk while the Gate sector is demoted, so the hulls exist only as
 * records — those records must be released with the run, not read as dead marks.
 */
export function isTenderRivalRecord(rec, m) {
  if (!rec || !authoredTenderHaul(m)) return false;
  const identity = typeof rec.identityKey === 'string' ? rec.identityKey : '';
  const prefix = `mission:${m.id}:`;
  if (!identity.startsWith(prefix)) return false;
  const tail = identity.slice(prefix.length);
  if (!/^\d+$/.test(tail)) return false;
  const slot = Number(tail);
  return Number.isSafeInteger(slot) && TENDER_RIVAL_QUEUE.some((spec) => spec.slot === slot);
}

/**
 * Durable re-bind ledger per capitalBossSpawn: the ledger lives on the mission (`m.tender.rivals`),
 * keyed by DURABLE SLOT. A slot issues ONCE — a filled slot is a tombstone, so a reload, a retry,
 * or a killed hull never mints a second hauler (a hull the player shot stays dead: the face freed
 * for good, and heat.js owns the piracy, not the mission). Live hulls stamped for this queue
 * re-point their ledger row's runtime id the way world rematerialization re-binds a capital cast.
 * A live actor is never moved and never double-spawned.
 */
export function spawnTenderRivals(owner, m) {
  if (!authoredTenderHaul(m) || !m.tender) return 0;
  const helpers = owner.helpers || {};
  const state = owner.state;
  if (!state || !state.entities) return 0;
  const now = state.simTime || 0;
  const ledger = m.tender.rivals || (m.tender.rivals = []);
  const rowFor = (slot) => ledger.find((row) => row && row.slot === slot) || null;

  // Re-bind: a live hull stamped for this queue re-points its ledger row (durable slot, runtime
  // id). A hull rematerialized from its world record lost the runtime stamps (capture keeps the
  // durable identityKey, not tenderRivalOf), so the durable identity re-binds too — and re-stamps
  // what no record carries: the queue's runtime stamps and the authored tally-run face.
  forEachLivingWorldActor(state, (entity) => {
    if (!entity || entity.alive === false || !isTenderRivalHull(entity, m)) return;
    const data = entity.data;
    const slot = tenderRivalSlotOf(entity, m);
    if (slot == null) return;
    const row = rowFor(slot);
    if (row && row.departed) return; // a settled slot stays lane life — never re-claimed
    data.tenderRivalOf = String(m.id);
    data.tenderRivalSlot = slot;
    if (row && Number.isFinite(row.dwellUntil)) data.tallyDwellUntil = row.dwellUntil;
    const spec = TENDER_RIVAL_QUEUE.find((queueSpec) => queueSpec.slot === slot) || null;
    if (spec) {
      if (data.name !== spec.name) data.name = spec.name;
      if (data.scanLabel !== spec.scanLabel) data.scanLabel = spec.scanLabel;
    }
    if (!row) {
      ledger.push({
        slot,
        id: entity.id,
        dwellUntil: Number(data.tallyDwellUntil)
          || (spec ? now + spec.startDelayS + spec.dwellS : null),
        departed: false,
        issued: true,
      });
      return;
    }
    if (row.id !== entity.id) row.id = entity.id;
  });

  // Issue once per slot. A departed-or-dead slot keeps its tombstone row and never respawns.
  const vacant = TENDER_RIVAL_QUEUE.filter((spec) => !rowFor(spec.slot));
  if (!vacant.length) return 0;
  const budget = helpers.spawnBudget;
  const requester = `mission:${m.id}`;
  const grant = budget && typeof budget.request === 'function'
    ? budget.request(vacant.length, requester)
    : vacant.length;
  if (grant <= 0) return 0;
  let spawned = 0;
  for (const spec of TENDER_RIVAL_QUEUE) {
    if (rowFor(spec.slot) || spawned >= grant) continue;
    if (typeof helpers.spawnEntity !== 'function') break;
    const anchor = rivalAnchorGlobal(spec.slot);
    const pos = {
      x: anchor.x + Math.cos(spec.slot * 2.4) * 26,
      z: anchor.z + Math.sin(spec.slot * 2.4) * 26,
    };
    const dwellUntil = now + spec.startDelayS + spec.dwellS;
    const entitySpec = makeEnemySpawnSpec(TENDER_HAUL_TUNING.rivalArchetype, 1, pos, {
      startedTick: deferredEnterTick(state),
    });
    entitySpec.team = 2;                      // world civilian team (drift auction rivals)
    entitySpec.factionId = TENDER_HAUL_GATE_FACTION_ID;
    entitySpec.data = entitySpec.data || {};
    // The context the game reads is ai.spawnContext (src/systems/scanner.js:2209,
    // src/systems/lawSecurity.js:874) — the drift-auction precedent routes its 'civilian' stamp
    // through the wrapper to ai.spawnContext (src/systems/encounterDirector.js:2206), and world
    // capture persists the ai record whole (src/world/worldRecords.js:912). A spec-level
    // `context` key lands on the entity top level (makeEntity copies spec keys) where nothing
    // reads it.
    entitySpec.data.ai = entitySpec.data.ai || {};
    entitySpec.data.ai.spawnContext = 'civilian';
    entitySpec.data.missionTag = m.id;        // the durable adopt identity
    entitySpec.data.tenderRivalOf = String(m.id);
    entitySpec.data.tenderRivalSlot = spec.slot;
    entitySpec.data.tallyDwellUntil = dwellUntil;
    entitySpec.data.name = spec.name;
    entitySpec.data.scanLabel = spec.scanLabel;
    // Loiter doctrine, driftAuctionRuntime.js:282-303: they hold the face until their own
    // dwell elapses, fire at no one, and belong to the lane, not to the player.
    setEntityDoctrine(entitySpec, {
      activity: { kind: 'loiter', anchor: { x: anchor.x, z: anchor.z }, preferredRange: 120 },
      roe: 'hold_fire',
    });
    let ent = null;
    try {
      ent = helpers.spawnEntity(entitySpec);
    } catch (error) {
      if (budget && typeof budget.releaseSome === 'function') {
        budget.releaseSome(requester, grant - spawned);
      }
      throw error;
    }
    if (!ent) continue;
    if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
    if (typeof owner._stampMissionTargetIdentity === 'function') {
      owner._stampMissionTargetIdentity(ent, m, spec.slot);
    }
    ledger.push({
      slot: spec.slot,
      id: ent.id,
      dwellUntil,
      departed: false,
      issued: true,
    });
    spawned += 1;
  }
  if (budget && typeof budget.releaseSome === 'function' && spawned < grant) {
    budget.releaseSome(requester, grant - spawned);
  }
  return spawned;
}

/**
 * Stamp rival departures on the ledger: once a hull's authored dwell has elapsed it is OFF the
 * scan face — the face frees as each completes and departs. Departure is ledger truth only; the
 * hull itself stays a live loitering civilian (no despawn mid-lane).
 */
export function settleRivalDwells(m, now) {
  if (!m || !m.tender || !Array.isArray(m.tender.rivals)) return false;
  let changed = false;
  for (const row of m.tender.rivals) {
    if (!row || row.departed) continue;
    if (Number.isFinite(row.dwellUntil) && now >= row.dwellUntil) {
      row.departed = true;
      changed = true;
    }
  }
  return changed;
}

/**
 * Settlement hands a rival hull back to the lane: the run is over, so the hull is no longer
 * contract-owned. Unpins and unstamps it the way _handoffFleeingTarget hands back a fleeing mark
 * (src/systems/missionStoryOps.js), retires the queue's tally-run scan label to a standing-off
 * line, and stamps the ledger row departed. No despawn here — the hull stays a live loitering
 * civilian; the caller releases its spawn-budget bind and the world record's mission claim.
 * Returns true when a live hull was released.
 */
export function releaseTenderRivalHull(entity, m) {
  if (!entity || entity.alive === false) return false;
  const data = entity.data || (entity.data = {});
  data.missionPinned = false;
  if (entity.flags) entity.flags.missionPinned = false;
  if (data.flags) data.flags.missionPinned = false;
  data.missionTag = null;
  data.missionId = null;
  data.tenderRivalOf = null;
  data.scanLabel = `${data.name || 'Rival hauler'} — TALLY RUN SETTLED — STANDING OFF`;
  if (m && m.tender && Array.isArray(m.tender.rivals)) {
    const row = m.tender.rivals.find((r) => r && r.id === entity.id);
    if (row) row.departed = true;
  }
  return true;
}

/** True when no queued rival still holds the scan face (the player's slot is open). */
export function tenderScanFaceClear(m, state, now) {
  if (!m || !m.tender || !Array.isArray(m.tender.rivals)) return true;
  const entities = state && state.entities;
  for (const row of m.tender.rivals) {
    if (!row || row.departed) continue;
    if (Number.isFinite(row.dwellUntil) && now < row.dwellUntil) {
      const entity = row.id != null && entities && entities.get ? entities.get(row.id) : null;
      if (entity && entity.alive !== false) return false;
    }
  }
  return true;
}

/**
 * The queue state while the scan face is held: the hauler on the face now (the live queued rival
 * whose authored dwell ends soonest), how many more wait behind it, and how long until the
 * player's slot opens — the LAST holding dwell, because the face clears only when every queued
 * rival has departed (tenderScanFaceClear). Null when the face is clear. Read-only.
 */
export function tenderScanFaceHolder(m, state, now) {
  if (!m || !m.tender || !Array.isArray(m.tender.rivals)) return null;
  const entities = state && state.entities;
  let onFace = null;
  let holding = 0;
  let slotOpensInS = 0;
  for (const row of m.tender.rivals) {
    if (!row || row.departed) continue;
    if (!Number.isFinite(row.dwellUntil) || now >= row.dwellUntil) continue;
    const entity = row.id != null && entities && entities.get ? entities.get(row.id) : null;
    if (!entity || entity.alive === false) continue;
    const remainingS = row.dwellUntil - now;
    holding += 1;
    slotOpensInS = Math.max(slotOpensInS, remainingS);
    if (!onFace || remainingS < onFace.remainingS) {
      onFace = { name: (entity.data && entity.data.name) || 'A rival hauler', remainingS };
    }
  }
  if (!onFace) return null;
  return { name: onFace.name, queuedBehind: Math.max(0, holding - 1), slotOpensInS };
}

// ── The hold: what is aboard, what is manifest-covered, what the weigh stamps ────────────────

function tenderUnitsAboard(state) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  if (!items || typeof items !== 'object') return 0;
  let total = 0;
  for (const id of Object.keys(items)) total += Math.max(0, Math.floor(Number(items[id]) || 0));
  return total;
}

/**
 * Hold facts at a weigh. The contract ore is manifest-covered up to the lot; everything else
 * aboard — the silicate a cut rock leaves, any other stack — plus contract ore beyond the lot is
 * unmanifested mass, weighed at the duty rate.
 */
export function tenderWeighFacts(state, m) {
  const params = (m && m.params) || {};
  const manifestUnits = Math.max(0, Math.trunc(Number(params.manifestUnits) || 0));
  const lotUnits = Math.max(0, Math.trunc(Number(params.qty) || 0));
  const aboardUnits = tenderUnitsAboard(state);
  const contractUnits = tenderContractUnitsAboard(state, m);
  const unmanifestedUnits = Math.max(0, aboardUnits - contractUnits)
    + Math.max(0, contractUnits - lotUnits);
  const dutyPerUnitCr = Math.max(0, Number(params.dutyPerUnitCr) || 0);
  return {
    aboardUnits,
    manifestUnits,
    unmanifestedUnits,
    dutyPerUnitCr,
    dutyCr: unmanifestedUnits * dutyPerUnitCr,
  };
}

/** Units of the contract ore still in the hold (the spot row's market). */
export function tenderContractUnitsAboard(state, m) {
  const cmdtyId = m && m.params && m.params.cmdtyId;
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  return cmdtyId && items ? Math.max(0, Math.floor(Number(items[cmdtyId]) || 0)) : 0;
}

// ── The two weigh moments ─────────────────────────────────────────────────────────────────────
// Duty is stamped at the weigh, into params — settle never re-reads the hold, so the receipt
// remembers whether the pilot queued, ran, or dumped. The Tally weigh stamps once. The Forge
// intake then weighs whatever is aboard ABOVE what the Tally declared, on its own intake stamp,
// so a declaration with an empty hold never exempts mass loaded afterwards. Concord moves only
// through the secondary faction:repDelta channel; the mission never writes heat.

function tenderWeighAlreadyStamped(m) {
  return !!(m.params && m.params.weighDeclared === true);
}

/** True once the Forge intake itself has weighed this run (either as the first weigh or after a Tally declaration). */
function tenderIntakeStamped(params) {
  if (!params) return false;
  if (params.weighDeclared === true && params.weighAtDesk === true) return true;
  return params.intakeWeighAt_s != null && Number.isFinite(Number(params.intakeWeighAt_s));
}

/** Unmanifested units the Tally declaration covered (0 when there was no Tally declaration). */
function tenderDeclaredOverU(m) {
  const params = m && m.params;
  if (!params || params.weighDeclared !== true || params.weighAtDesk !== false) return 0;
  return Math.max(0, Math.trunc(Number(params.weighOverU) || 0));
}

/** Unmanifested units aboard that no Tally declaration covers — what the Forge intake weighs. */
export function tenderUndeclaredIntakeUnits(state, m) {
  if (!m || !m.params) return 0;
  return Math.max(0, tenderWeighFacts(state, m).unmanifestedUnits - tenderDeclaredOverU(m));
}

function stampTenderWeigh(owner, m, atDesk) {
  if (tenderWeighAlreadyStamped(m)) return null;
  const facts = tenderWeighFacts(owner.state, m);
  const params = m.params || (m.params = {});
  params.weighDeclared = true;
  params.weighAtDesk = atDesk === true;
  params.weighAt_s = Number(owner.state.simTime) || 0;
  params.weighOverU = facts.unmanifestedUnits;
  params.weighDutyCr = facts.dutyCr;
  return facts;
}

/** The Tally weigh: the player docked the Customs Gate and declared. +10% paperwork, +1 Concord. */
export function onGraderDeclared(owner, m) {
  if (!authoredTenderHaul(m)) return false;
  const facts = stampTenderWeigh(owner, m, false);
  if (!facts) return false;
  if (facts.unmanifestedUnits > 0) {
    owner.bus.emit('toast', {
      text: `Declared at the Tally: ${facts.unmanifestedUnits}u over the manifest stamps `
        + `${facts.dutyCr.toLocaleString('en-US')} cr duty on the receipt.`,
      kind: 'info', ttl: 5,
    });
  } else {
    owner.bus.emit('toast', {
      text: 'Declared at the Tally: manifest clean — the receipt stays clean.',
      kind: 'info', ttl: 4,
    });
  }
  owner.bus.emit('faction:repDelta', {
    factionId: TENDER_HAUL_GATE_FACTION_ID,
    delta: 1,
    reason: 'tender_declared:tally',
  });
  return true;
}

/**
 * The intake weigh: the Forge flagged unmanifested mass no Tally declaration covers. Same duty
 * rate, −2 Concord. With no prior weigh the intake's stamp is the receipt's stamp; after a Tally
 * declaration the intake stamps only the excess, on its own fields, and the Tally stamp stays.
 */
export function onFlaggedAtIntake(owner, m) {
  if (!authoredTenderHaul(m)) return false;
  const params = m.params || (m.params = {});
  if (tenderIntakeStamped(params)) return false; // the intake weighs once
  const facts = tenderWeighFacts(owner.state, m);
  const declaredOverU = tenderDeclaredOverU(m);
  const overU = Math.max(0, facts.unmanifestedUnits - declaredOverU);
  if (overU <= 0) return false;
  const dutyCr = overU * facts.dutyPerUnitCr;
  const now = Number(owner.state.simTime) || 0;
  const afterTally = tenderWeighAlreadyStamped(m);
  if (!afterTally) {
    params.weighDeclared = true;
    params.weighAtDesk = true;
    params.weighAt_s = now;
    params.weighOverU = overU;
    params.weighDutyCr = dutyCr;
  } else {
    params.intakeWeighAt_s = now;
    params.intakeWeighOverU = overU;
    params.intakeWeighDutyCr = dutyCr;
  }
  owner.bus.emit('toast', {
    text: `Flagged at intake: the Forge weighed ${overU}u ${afterTally ? 'beyond the Tally declaration' : 'over the manifest'} — `
      + `${dutyCr.toLocaleString('en-US')} cr duty stamps and Concord marks the receipt −2.`,
    kind: 'warn', ttl: 5,
  });
  owner.bus.emit('faction:repDelta', {
    factionId: TENDER_HAUL_GATE_FACTION_ID,
    delta: -2,
    reason: 'tender_flagged:intake',
  });
  return true;
}

/** True once either weigh has stamped (declaration at the Tally or the intake flag). */
export function tenderWeighStamped(m) {
  return tenderWeighAlreadyStamped(m);
}

// ── The drive adjudicator: close + sell-out grace + floor ─────────────────────────────────────
//
// Window settlement, per the authored contract (three honest ends, all legible; no red EXPIRED):
//   * the window OPEN  — the ordinary desk sale completes the run at honored premiums;
//   * the window CLOSE — a flight tick past the close arms the 90 s sell-out grace. A short hold
//     (desk count + aboard ore under the floor) with no desk contact fails now: the desk refused
//     the short lot. A lot still coming (or a desk contact) waits inside the grace;
//   * the GRACE END    — settle what sold: at or above the floor the contract completes at base
//     (premium unmet), scaled to the count the desk finished; under it the run fails forward
//     with a spot row posted on the Forge desk board (carriage back to the Tethys rail), so what
//     remains aboard still has a market.
// All settlement routes through the owner's ordinary paths — this module never pays or fails.
export function driveTender(owner, m, index) {
  if (!authoredTenderHaul(m) || !m.tender || m.tender.settledOutcome) return false;
  const state = owner.state;
  const now = Number(state.simTime) || 0;
  const closeAt = Number(m.tender.closeAtS);
  if (!Number.isFinite(closeAt)) return false;

  settleRivalDwells(m, now);

  // Window open: nothing to adjudicate. The desk sale path (_onTrade) completes the run.
  if (now < closeAt) return false;

  // First flight tick past the close: arm the sell-out grace, or refuse the short lot now.
  if (!Number.isFinite(m.tender.windowClosedAt_s)) {
    m.tender.windowClosedAt_s = now;
    m.tender.graceUntilS = closeAt + Math.max(0, Number(m.tender.graceS) || 0);
    const aboard = tenderContractUnitsAboard(state, m);
    const sold = Math.max(0, Math.floor(Number(m.objectiveProgress) || 0));
    const floor = Math.max(1, Math.trunc(Number(m.tender.floorUnits) || 1));
    const lot = Math.max(1, Math.trunc(Number(m.tender.lotUnits) || floor));
    const deskContact = Number.isFinite(m.tender.deskContactAt_s);
    if (!deskContact && (sold + aboard) < floor) {
      // No desk contact and the hold cannot reach the floor: the desk refuses the short lot now.
      m.tender.settledOutcome = 'failed';
      // The spot row gives what REMAINS of the lot a market: over an empty hold its reason is
      // already gone (tenderSpotRowRetained drops the row at the first refresh), so neither the
      // post nor its "what your hold still carries" toast fires.
      if (aboard > 0) postTenderSpotSale(owner, m);
      owner._failMission(m, index, 'tender_floor');
      return true;
    }
    // The grace is a clock the pilot must be able to beat: name its length and where to be.
    const graceS = Math.max(0, Math.round(Number(m.tender.graceS) || 0));
    owner.bus.emit('toast', {
      text: `The intake window has closed — ${graceS} s to sell the rest out at the desk; `
        + 'late lots settle at base terms when the grace ends.',
      kind: 'info', ttl: 4,
    });
    return false;
  }

  // Inside the grace: the desk keeps counting while the player sells (the dock freezes the sim,
  // so the grace elapses only in flight — the sell-out is a docked act, not an airborne one).
  if (now < Number(m.tender.graceUntilS)) return false;

  return settleTenderPastGrace(owner, m, index);
}

/** Grace-end settlement: what sold decides. Base terms scale to the desk's finished count. */
export function settleTenderPastGrace(owner, m, index) {
  if (!authoredTenderHaul(m) || !m.tender) return false;
  const lot = Math.max(1, Math.trunc(Number(m.tender.lotUnits) || 1));
  const floor = Math.max(1, Math.trunc(Number(m.tender.floorUnits) || 1));
  const sold = Math.min(lot, Math.max(0, Math.floor(Number(m.objectiveProgress) || 0)));
  m.tender.settledOutcome = sold >= floor ? 'completed' : 'failed';
  m.params = m.params || {};
  m.params.tenderSettledLate = true;
  if (sold >= floor) {
    m.reward_cr = Math.max(0, Math.round((Number(m.reward_cr) || 0) * sold / lot));
    owner._completeMission(m, index);
    return true;
  }
  // The spot row gives what REMAINS of the lot a market: over an empty hold its reason is already
  // gone (tenderSpotRowRetained drops the row at the first refresh), so neither the post nor its
  // "what your hold still carries" toast fires — the same guard the refuse-now path uses.
  if (tenderContractUnitsAboard(owner.state, m) > 0) postTenderSpotSale(owner, m);
  // Not the refuse-now floor fail: the desk never finished the count before the grace ran out —
  // the hold may carry the full lot unsold. Its own reason, its own words (missionFailReasons).
  owner._failMission(m, index, 'tender_unsold');
  return true;
}

// ── The fail-forward spot row ─────────────────────────────────────────────────────────────────
// A plain row posted on the Forge desk's own board (postBoardOffer — post-only, never
// auto-accepted): carriage from the Forge back to the Tethys rail for whatever remains aboard,
// whose real market is the Tethys one. No cmdtyId: the hold gate has nothing to demand and the
// ore sale stays an ordinary market act. The row's nav and objective lines are its own
// (missionNavReason / objectiveText read params.tenderSpotForMissionId).

export function buildTenderSpotSaleOffer(owner, m) {
  const tuning = TENDER_HAUL_TUNING;
  const aboard = tenderContractUnitsAboard(owner.state, m);
  const aboardLine = aboard > 0
    ? `${aboard}u still in your hold`
    : 'nothing left of the lot';
  // The lead clause names why the row exists — the same fact the fail reason names. The grace-end
  // settle stamps tenderSettledLate BEFORE posting, so a full-but-unsold hold never reads as a
  // refused short lot beside its own 'Nnu still in your hold' line.
  const lead = m.params && m.params.tenderSettledLate === true
    ? 'The desk never finished the count and posts spot carriage to the Tethys rail'
    : 'The desk refused the short lot and posts spot carriage to the Tethys rail';
  return {
    id: `tender_spot_${m.id}`,
    type: 'cargo_delivery',
    source: TENDER_SPOT_SOURCE,
    stationId: tuning.deskStationId,
    factionId: TENDER_HAUL_FACTION_ID,
    reward_cr: 60,
    collateral_cr: 0,
    riskTier: 0,
    destStationId: tuning.railStationId,
    destSectorId: tuning.railSectorId,
    distance: tuning.distance,
    time_limit_s: 1800,
    duration_s: 1800,
    params: { fValue: 1, taskTime: 20, tenderSpotForMissionId: m.id },
    title: 'Spot intake — carriage back to the rail',
    brief: `${lead}: ${aboardLine}, and the rail market buys it at the street.`,
    summary: 'Fail-forward: the run settles short, the spot row gives what remains a market.',
    expiresAtEpoch: null,
    storyTag: null,
    epochPosted: owner._epoch ? owner._epoch() : 0,
    cause: { tag: 'w-tender-spot-sale', fingerprint: `tender-spot:${m.id}` },
  };
}

/** Post the fail-forward row through the missions-owned post-only seam. */
export function postTenderSpotSale(owner, m) {
  if (!owner || typeof owner.postBoardOffer !== 'function') return false;
  const offer = buildTenderSpotSaleOffer(owner, m);
  const posted = owner.postBoardOffer(offer);
  if (posted && posted.ok) {
    owner.bus.emit('toast', {
      text: 'The Forge desk posts a spot row on its board — carriage back to the Tethys rail, where what your hold still carries has a market.',
      kind: 'info', ttl: 5,
    });
  }
  return !!(posted && posted.ok);
}

/**
 * The spot row's board-retention guard (the mega-heist retention's shape, missionBoardOps): the
 * row is residue for one specific hold, so it drops at the next epoch refresh once its reason is
 * gone — none of the lot's commodity remains aboard (the ore found its market elsewhere) — or
 * once its own authored time_limit_s has lapsed. One tender run exists per save (the durable
 * ledger blocks the repost), so the hold count of the lot's commodity is the contract ore; the
 * settled run's record is gone from `active`, so no mission id survives to ask. Epochs are
 * simTime / refreshSec (missionBoardOps._epoch), so the lapse is epoch arithmetic.
 */
export function tenderSpotRowRetained(state, offer, epoch) {
  if (!offer || offer.source !== TENDER_SPOT_SOURCE) return false;
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  const aboard = items
    ? Math.max(0, Math.floor(Number(items[TENDER_HAUL_TUNING.cmdtyId]) || 0))
    : 0;
  if (aboard <= 0) return false;
  const cfg = state && state.missions && state.missions.config;
  const refreshSec = Math.max(1, Number(cfg && cfg.refreshSec) || 600);
  const postedEpoch = Math.max(0, Math.trunc(Number(offer.epochPosted) || 0));
  const limitEpochs = Math.ceil(Math.max(0, Number(offer.time_limit_s) || 0) / refreshSec);
  return Math.trunc(Number(epoch) || 0) <= postedEpoch + limitEpochs;
}

// ── Receipt words ─────────────────────────────────────────────────────────────────────────────

/**
 * The tender's own receipt lines. The bend prints as the tender's own line —
 * 'Desk buy −4.2% on your 440 u' — from the priceImpactPct the trade payload stamped, and only on
 * a sale that beat the close: a late settle prints no bend and names no spare seconds (the owner's
 * contract, missions.missionPaydayLine). When a stamped-late settle ever carries a bend, it names
 * the desk's settled count, never the untouched lot. One middot per line, always (the flight-HUD
 * receipt filter drops denser strings).
 */
export function tenderPaydayLine(m, rewardCr) {
  const cr = Math.max(0, Math.round(Number(rewardCr) || 0));
  if (cr <= 0 || !m) return null;
  const params = m.params || {};
  const lot = Math.max(0, Math.trunc(Number(params.qty) || 0));
  const impact = Number(params.deskBuyImpactPct);
  const spareS = Number(params.windowSpareS);
  const soldBeforeClose = params.tenderSoldBeforeClose === true;
  const parts = [];
  if (soldBeforeClose && Number.isFinite(impact) && impact < 0 && lot > 0) {
    const units = params.tenderSettledLate === true
      ? Math.max(0, Math.trunc(Number(m.objectiveProgress) || 0))
      : lot;
    if (units > 0) parts.push(`Desk buy ${impact.toFixed(1)}% on your ${units.toLocaleString('en-US')} u`);
  }
  if (soldBeforeClose && Number.isFinite(spareS) && spareS >= 0) {
    parts.push(`${Math.max(0, Math.round(spareS))} s to spare`);
  }
  if (!parts.length) return null;
  return `PAYDAY ${cr.toLocaleString('en-US')} cr — ${parts.join(' · ')}.`;
}

/**
 * The durable settlement ledger entry (promoted past the 10-deep receipt ring's eviction). The
 * desk count is the owner's own counter (objectiveProgress) — the same number on the on-time sale
 * and on the grace-end settle. The weigh totals add the intake's stamp to the Tally's.
 */
export function tenderLedgerEntry(m, outcome, reason) {
  const params = (m && m.params) || {};
  const intakeOverU = Math.max(0, Math.trunc(Number(params.intakeWeighOverU) || 0));
  const intakeDutyCr = Math.max(0, Math.round(Number(params.intakeWeighDutyCr) || 0));
  return {
    missionId: m && m.id != null ? String(m.id) : null,
    outcome: outcome || 'settled',
    reason: reason || null,
    deskCountUnits: Math.max(0, Math.trunc(Number(m && m.objectiveProgress) || 0)),
    weighOverU: Math.max(0, Math.trunc(Number(params.weighOverU) || 0)) + intakeOverU,
    weighDutyCr: Math.max(0, Math.round(Number(params.weighDutyCr) || 0)) + intakeDutyCr,
    declaredAtTally: params.weighDeclared === true && params.weighAtDesk === false,
    flaggedAtIntake: tenderIntakeStamped(params),
    soldBeforeClose: params.tenderSoldBeforeClose === true,
    settledLate: params.tenderSettledLate === true,
  };
}

// ── Accessibility ─────────────────────────────────────────────────────────────────────────────
// The house two-gate read (bombs.js / special500 spectacleLegs): either accessibility flag drops
// the tender's own cue to the reduced variant downstream. The cue emitter attaches this to the
// payload; the vfx owner renders the reduced variant (src/render/vfx.js:4669).

export function flashReducedCue(state) {
  const settings = state && state.settings;
  const v = settings && settings.video;
  const a = settings && settings.accessibility;
  return !!((v && (v.motionReduce || v.flashReduce)) || (a && a.flashReduce));
}
