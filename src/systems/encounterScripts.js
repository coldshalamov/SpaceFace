// src/systems/encounterScripts.js — per-shape PHASE SCRIPTS for the campaign director.
//
// Each script runs one encounter shape through its life: telegraph → offer/approach → conflict or
// resolution → outcome → receipt. Scripts never touch other systems' owned state — every
// consequence goes through the director's intent helpers (economy:chargeCredits / grantCredits,
// faction:repDelta, contraband:bribe, patrol:proximity → economy.runScan, sectorsim:impulse,
// economy:applyTradePressure, mission/comms hooks). Scripts receive `d` (the director facade,
// see encounterDirector.js) and the `live` encounter record; they may only write live.* fields and
// the ai/data fields of entities THIS encounter spawned.
//
// Determinism: no Math.random, no wall clock. All rolls come from d.stream(live, label) — a
// mulberry32 stream keyed on (world seed, encounterId, label). Timers key off state.simTime.
//
// Hostility levers (verified against the live tree — do not "improve"):
//   * ai.passive=true  → invisible to tactical AI rostering (aiPorts.js:254) AND non-hostile both
//     ways (aiPorts.js:797, scanner.js:275). This is the sanctioned "menace that holds fire" state.
//   * flipping passive→false with spawnContext 'encounter'/'bounty_hunter' makes the squad live.
//   * lawful patrols (ai.lawful) NEVER attack a clean player — the isPlayerWanted gate is the
//     architecture; scripts must never bypass it.
//   * passive ships are unrostered, so the director may steer them by writing data.intent
//     (the claim-beacon pattern, beacons.js:147) — used for convoy/trader route life.

import { ENCOUNTERS, NAMED_CAPTAINS, CONVOY_CARGO, WHISPER_LINES, FACTION_LABELS, tollAmountFor, barkText } from '../data/encounters.js';
import { aceById } from '../data/namedAces.js';
import { reachCultureDoctrineById } from '../data/pirateDoctrines.js';
import { massline2Flag } from '../data/featureFlags.js';
import {
  uniqueWreckCassandraHardliners,
  uniqueWreckHeldMass,
  uniqueWreckNestbreakerAdmirers,
  uniqueWreckPingElite,
  uniqueWreckSilverDraftCleaner,
} from './uniqueWreckEncounterScripts.js';
import { markEntityGhost } from './scanner.js';
import { mines as minesSystem, MINE_TELEGRAPH_CUE } from './mines.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from '../ai/doctrine.js';
import { isPdScreenActor } from '../ai/pdScreen.js';
import { buildEncounterCausality } from '../world/encounterCausality.js';

// ── shared tuning ─────────────────────────────────────────────────────────────────────────────────
const TOLL_PAY_DIST = 520;        // brake inside this of the toll leader to hand over the toll
const TOLL_PAY_SPEED = 8;         // "cut thrust" threshold (wu/s)
const TOLL_PAY_HOLD_TICKS = 3;    // seconds of holding still that count as deliberate payment
const TOLL_ESCAPE_R = 2600;       // beyond this from the squad, a runner has escaped
const SCAN_RANGE = 700;           // patrol scan holds while the player is inside this
const SCAN_BREAK_TICKS = 2;       // seconds outside range that count as running the scan
const AMBUSH_SPRING_R = 900;      // ambushers spring when prey is inside this
const ESCAPE_R = 2600;            // generic combat-escape distance
const CONVOY_ARRIVE_R = 240;      // convoy centroid inside this of the endpoint = arrived
const CONVOY_NOTICE_R = 1200;     // player inside this of a hauler marks the convoy "witnessed"
const TRADE_PRESSURE_CAP = 12;    // hard cap on units of market pressure per arrival (bounded valve)
const PREDATION_MIN_RESPONSE_S = 1;
const FREIGHT_POD_LIMIT = 3;
const FREIGHT_POD_TTL_S = 90;
const FREIGHT_CUSTODY_WINDOW_S = 80;
const FREIGHT_RAIDER_CONTACT_PAD = 1;
const FREIGHT_RAIDER_ESCAPE_R = 600;
const FREIGHT_RAIDER_ESCAPE_S = 20;
const FREIGHT_CARRIER_INSTANCE = Symbol('freightCarrierInstance');
const FREIGHT_RAIDER_INSTANCE = Symbol('freightRaiderInstance');
const FREIGHT_POD_INSTANCE = Symbol('freightPodInstance');
const DIST_TELL_R = 1500;         // scan-pulse inside this of a distress site reads the signal
const CLAIM_TELEGRAPH_S = 3;      // arrival breath: read formation/motive before weapons open
const CLAIM_RETREAT_R = 2400;     // leaving the defended site is a deliberate retreat
const CLAIM_RETREAT_HOLD_S = 12;  // brief overshoots do not forfeit the defense
const MINEFIELD_WAKE_COUNT = 3;   // mines seeded on minefield_wake spring
const MINEFIELD_WAKE_SPACING = 70;

/**
 * W03: seed physical mines behind the jackal on minefield_wake spring.
 * Prefer the registered mines system helper; fall back to bus placeRequest.
 */
function seedMinefieldWake(d, live, state, player) {
  if (!live || !state || !player || !player.pos) return;
  let jackal = null;
  for (const id of live.ids || []) {
    const e = state.entities && state.entities.get && state.entities.get(id);
    if (!e || !e.alive) continue;
    const role = String((e.data && e.data.lootTableId) || '');
    if (role === 'mine_layer_jackal') { jackal = e; break; }
  }
  if (!jackal) {
    // Fall back to first squad ship as the layer.
    const firstId = live.ids && live.ids[0];
    jackal = firstId != null && state.entities ? state.entities.get(firstId) : null;
  }
  if (!jackal || !jackal.pos) return;

  const place = (opts) => {
    const helpers = d.helpers || (state && state._helpers) || null;
    if (helpers && typeof helpers.placeMine === 'function') return helpers.placeMine(opts);
    if (minesSystem && minesSystem.state === state && typeof minesSystem.placeMine === 'function') {
      return minesSystem.placeMine(opts);
    }
    if (typeof d.emit === 'function') d.emit('mines:placeRequest', opts);
    return null;
  };

  // Wake geometry: lay mines along the vector from jackal toward player (player's approach wake).
  const dx = (player.pos.x || 0) - (jackal.pos.x || 0);
  const dz = (player.pos.z || 0) - (jackal.pos.z || 0);
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  // Perpendicular for a short fence.
  const px = -uz;
  const pz = ux;
  live.data.minesSeeded = live.data.minesSeeded || [];
  for (let i = 0; i < MINEFIELD_WAKE_COUNT; i++) {
    const along = 80 + i * MINEFIELD_WAKE_SPACING;
    const side = ((i % 2) === 0 ? -1 : 1) * 28;
    const pos = {
      x: jackal.pos.x + ux * along + px * side,
      z: jackal.pos.z + uz * along + pz * side,
    };
    const mine = place({
      ownerId: jackal.id,
      pos,
      team: jackal.team,
      factionId: jackal.factionId || null,
      telegraph: i === 0,
    });
    if (mine && mine.id != null) live.data.minesSeeded.push(mine.id);
  }
  if (d.emit) {
    d.emit('ai:telegraph', {
      entityId: jackal.id,
      kind: MINE_TELEGRAPH_CUE,
      cue: MINE_TELEGRAPH_CUE,
      shapeId: live.shapeId,
      count: (live.data.minesSeeded || []).length,
    });
  }
}

// ── tiny vector helpers (no allocation in hot paths — these run at 1 Hz on a handful of ships) ───
function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

/** Steer an unrostered (passive) ship toward a point by writing its flight intent — the sanctioned
 *  claim-beacon pattern. No-op within `slow` so arrivals settle instead of orbiting. */
function steerToward(e, tx, tz, slow) {
  if (!e || !e.pos) return;
  const dx = tx - e.pos.x, dz = tz - e.pos.z;
  const d2 = dx * dx + dz * dz;
  const stop = (slow || 90);
  const data = e.data || (e.data = {});
  const intent = data.intent || (data.intent = {});
  if (d2 <= stop * stop) { intent.moveZ = 0; intent.moveX = 0; intent.fire = false; return; }
  const len = Math.sqrt(d2) || 1;
  const ux = dx / len, uz = dz / len;
  const cf = Math.cos(e.rot || 0), sf = Math.sin(e.rot || 0);
  intent.moveZ = clamp1(cf * ux + sf * uz);
  intent.moveX = clamp1(-sf * ux + cf * uz);
  intent.aimAngle = Math.atan2(dz, dx);
  intent.fire = false;
}
function clamp1(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

// Physical cloak and smuggling utilities compose at the scan-initiation seam. A patrol outside
// the live detection ring cannot see the ship well enough to hail/scan it; once inside the ring,
// economy.runScan retains full authority over scannerCloak/hidden-hold dice. Fixed jump-gate
// sensors do not use this encounter seam and therefore remain unavoidable.
export function patrolCanInitiateScan(state, observer, player) {
  if (!massline2Flag('cloak')) return true;
  const runtime = state && state.massline2 && state.massline2.cloak;
  if (!runtime || !runtime.active || !(runtime.radius > 0)) return true;
  if (!observer || !observer.pos || !player || !player.pos) return true;
  return dist2(observer.pos.x, observer.pos.z, player.pos.x, player.pos.z)
    <= runtime.radius * runtime.radius;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A. PIRATE TOLL — scan, price, choice. Pay / Refuse / Run, physical verbs included.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const toll = {
  fire(d, live, state) {
    const cargoValue = d.cargoValue();
    const amount = tollAmountFor(cargoValue);
    live.vars.amount = amount;
    // The squad cuts the lane ahead of the player, between them and open space — zone-motivated
    // (proximity gate guarantees we're on the lane), positioned at fire time for readability.
    const p = d.player(); if (!p) return d.abort(live, 'no_player');
    const rng = d.stream(live, 'pos');
    const zc = live.anchor || p.pos;
    let dirX = zc.x - p.pos.x, dirZ = zc.z - p.pos.z;
    const dl = Math.hypot(dirX, dirZ);
    if (dl < 1) { const a = rng() * Math.PI * 2; dirX = Math.cos(a); dirZ = Math.sin(a); } else { dirX /= dl; dirZ /= dl; }
    const ships = live.plan.ships.map((sh, i) => ({
      ...sh,
      passive: true,                                    // demand phase: menace, hold fire
      pos: { x: p.pos.x + dirX * 620 + (rng() - 0.5) * 180, z: p.pos.z + dirZ * 620 + (rng() - 0.5) * 180 },
    }));
    const ids = d.spawnShips(live, ships);
    if (!ids.length) return d.abort(live, 'no_budget');
    live.phase = 'offer';
    live.deadlineAt = d.now() + (live.shape.offerS || 14);
    live.data.payHold = 0;
    d.say(live, 'bark', 'toll_demand', live.vars, { primary: true });
    d.offerChoices(live, ['pay', 'refuse', 'run'], 'refuse', live.deadlineAt);
  },

  tick(d, live, state, now) {
    const p = d.player(); if (!p) return d.abort(live, 'no_player');
    if (live.phase === 'offer') {
      const leader = d.entsOf(live)[0];
      if (!leader) return d.abort(live, 'squad_gone');
      const dd2 = dist2(p.pos.x, p.pos.z, leader.pos.x, leader.pos.z);
      // Physical PAY: cut thrust and hold near the leader — a deliberate, readable handover.
      const speed = p.vel ? Math.hypot(p.vel.x || 0, p.vel.z || 0) : 0;
      if (dd2 <= TOLL_PAY_DIST * TOLL_PAY_DIST && speed <= TOLL_PAY_SPEED) {
        if (++live.data.payHold >= TOLL_PAY_HOLD_TICKS) return toll.choose(d, live, state, 'pay');
      } else live.data.payHold = 0;
      // Physical RUN: put real distance on them before the deadline.
      if (dd2 >= TOLL_ESCAPE_R * TOLL_ESCAPE_R) return toll.choose(d, live, state, 'run');
      if (now >= live.deadlineAt) return toll.choose(d, live, state, 'timeout');
      return;
    }
    if (live.phase === 'conflict') {
      if (d.aliveCount(live) === 0) {
        d.dangerImpulse(live, 'toll_cleared', -0.02);
        return d.resolve(live, 'cleared');
      }
      if (d.minDist2ToSquad(live, p) >= ESCAPE_R * ESCAPE_R) {
        // Escaped a refused toll: the lane keeps its pirates. Local pressure partially refunds.
        d.refundPressure(live, 0.35);
        return d.resolve(live, 'escaped');
      }
    }
  },

  choose(d, live, state, choiceId) {
    if (live.phase !== 'offer') return;
    if (choiceId === 'pay') {
      const amount = live.vars.amount | 0;
      if ((state.player.credits | 0) < amount) {
        d.say(live, 'bark', 'toll_broke_ack');
        return toll.choose(d, live, state, 'refuse');
      }
      d.charge(amount, 'toll:reach');
      d.rep('faction_reach', 1, 'toll_paid');           // pirates respect a payer, slightly
      d.dangerImpulse(live, 'toll_paid', -0.01);        // paid lanes run a touch cooler
      d.say(live, 'bark', 'toll_paid_ack');
      settleTollMotive(d, live, 'parley_resolved', true);
      d.despawnAll(live, 22);                            // they peel off with the take
      return d.resolve(live, 'paid', { vars: live.vars });
    }
    if (choiceId === 'run') {
      d.say(live, 'bark', 'toll_flee_ack');
      settleTollMotive(d, live, 'target_departed', true);
      d.despawnAll(live, 18);
      return d.resolve(live, 'escaped', { vars: live.vars });
    }
    // refuse (also the deterministic timeout default, and the response to opening fire)
    d.say(live, 'bark', 'toll_refused_ack');
    live.phase = 'conflict';
    const trigger = choiceId === 'timeout' ? 'ignored_demand'
      : choiceId === 'attack' ? 'player_attack'
        : 'explicit_refusal';
    settleTollMotive(d, live, trigger, false);
    d.setPassive(live, false);
  },

  event(d, live, state, name, p) {
    if (name === 'playerHitSquad' && live.phase === 'offer') toll.choose(d, live, state, 'attack');
  },
};

function settleTollMotive(d, live, trigger, satisfied) {
  for (const entity of d.entsOf(live)) {
    const data = entity.data || (entity.data = {});
    const ai = data.ai || (data.ai = {});
    ai.motive = 'cargo_extortion';
    ai.engagementTrigger = trigger;
    ai.motiveSatisfied = satisfied === true;
    if (satisfied) {
      ai.passive = true;
      ai.forcePlayerTarget = false;
      ai.huntPlayer = false;
      const intent = data.intent || (data.intent = {});
      intent.fire = false;
      intent.fireGroup = null;
      const combat = data.combat || (data.combat = {});
      combat.targetId = null;
      combat.lockTarget = null;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// B. PATROL SCAN — lawful friction. Submit / Bribe / Dump / Run. Clean players are never attacked.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const patrolScan = {
  fire(d, live, state) {
    const p = d.player(); if (!p) return d.abort(live, 'no_player');
    const rng = d.stream(live, 'pos');
    const zc = live.anchor || p.pos;
    let dirX = zc.x - p.pos.x, dirZ = zc.z - p.pos.z;
    const dl = Math.hypot(dirX, dirZ);
    if (dl < 1) { const a = rng() * Math.PI * 2; dirX = Math.cos(a); dirZ = Math.sin(a); } else { dirX /= dl; dirZ /= dl; }
    // Lawful wing, rostered (official doctrine flies itself); the lawful/WANTED gate is their leash.
    const ships = live.plan.ships.map((sh) => ({
      ...sh,
      pos: { x: p.pos.x + dirX * 560 + (rng() - 0.5) * 140, z: p.pos.z + dirZ * 560 + (rng() - 0.5) * 140 },
    }));
    const ids = d.spawnShips(live, ships);
    if (!ids.length) return d.abort(live, 'no_budget');
    // Resolve before the hail/choice surface: an outside-ring patrol cannot see the cloaked ship
    // well enough to initiate the encounter, not merely fail the final cargo scan ten seconds
    // later. The submit-time guard below remains necessary if the player cloaks during a hail.
    const leader = d.entsOf(live)[0];
    if (!patrolCanInitiateScan(state, leader, p)) {
      d.despawnAll(live, 16);
      return d.resolve(live, 'cloak_evaded', { speak: false });
    }
    live.phase = 'offer';
    live.deadlineAt = d.now() + (live.shape.scanS || 10);
    live.data.breakTicks = 0;
    live.data.scan = null;
    d.say(live, 'bark', 'patrol_scan_hail', null, { primary: true });
    const opts = ['submit', 'run'];
    if (d.hasContraband()) { opts.splice(1, 0, 'bribe', 'dump'); }
    d.offerChoices(live, opts, 'submit', live.deadlineAt);
  },

  tick(d, live, state, now) {
    if (live.phase !== 'offer') return;
    const p = d.player(); if (!p) return d.abort(live, 'no_player');
    if (d.aliveCount(live) === 0) return d.abort(live, 'squad_gone');
    const near2 = d.minDist2ToSquad(live, p);
    if (near2 > SCAN_RANGE * SCAN_RANGE) {
      if (++live.data.breakTicks >= SCAN_BREAK_TICKS) return patrolScan.choose(d, live, state, 'run');
    } else live.data.breakTicks = 0;
    if (now >= live.deadlineAt) return patrolScan.choose(d, live, state, 'submit');
  },

  choose(d, live, state, choiceId) {
    if (live.phase !== 'offer') return;
    if (choiceId === 'run') {
      // No attack on a clean (or even suspected) runner — no scan, no proof. The consequence is a
      // transponder flag: a small rep nick. WANTED heat only ever comes from heat's own inputs.
      d.rep('faction_scn', -3, 'scan_refused');
      d.say(live, 'bark', 'patrol_scan_refused');
      d.despawnAll(live, 40);
      return d.resolve(live, 'ran');
    }
    if (choiceId === 'dump') {
      if (!d.hasContraband()) return;                   // nothing to dump → ignore
      const dumped = d.dumpContraband();
      live.vars.units = dumped;
      d.say(live, 'info', 'CARGO JETTISONED.', null, { literal: true });
      return;                                           // scan continues — and now reads clean
    }
    if (choiceId === 'bribe') {
      const fine = d.fineEstimate();
      if (fine <= 0) return;
      const cost = Math.round(fine * 0.3);
      if ((state.player.credits | 0) < cost) return;    // cannot afford → choice unavailable
      d.emit('contraband:bribe', { fine });             // economy charges 30% (single writer)
      d.rep('faction_scn', -2, 'bribe');
      d.despawnAll(live, 40);
      return d.resolve(live, 'bribed');
    }
    // submit — run the real customs machinery (economy owns fines/confiscation/rep/heat)
    const leader = d.entsOf(live)[0];
    const player = d.player();
    if (!patrolCanInitiateScan(state, leader, player)) {
      d.despawnAll(live, 16);
      return d.resolve(live, 'cloak_evaded', { speak: false });
    }
    d.emit('patrol:proximity', {
      patrolId: leader ? leader.id : null,
      factionId: live.factionId || 'faction_scn',
      security: d.sectorSecurity(),
    });
    // economy.runScan is synchronous: contraband:scanned (if caught) has already routed back into
    // live.data.scan by the time we get here.
    const scan = live.data.scan;
    d.despawnAll(live, 40);
    if (scan && scan.found) {
      live.vars.fine = scan.fine | 0;
      d.say(live, 'bark', 'patrol_scan_caught');
      return d.resolve(live, 'fined', { vars: live.vars });
    }
    d.rep('faction_scn', 1, 'scan_clean');
    d.say(live, 'bark', 'patrol_scan_clear');
    return d.resolve(live, 'clean');
  },

  event(d, live, state, name, p) {
    if (name === 'contrabandScanned') live.data.scan = p;   // routed only while this scan is live
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// C. AMBUSH SNARE — telegraphed trap; snares cruise (one snare max), springs on proximity.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const ambush = {
  fire(d, live, state) {
    if (live.data && live.data.ceresActivityAmbush === true) {
      const ids = d.adoptCeresActivityAmbush(live, 'offer');
      if (!ids.length) return d.abort(live, 'adopted_squad_missing');
      live.phase = 'offer';
      live.data.springAt = d.now() + 4;
      live.data.snared = false;
      live.deadlineAt = d.now() + 300;
      d.setPassive(live, true);
      d.say(live, 'bark', 'ambush_tele', null, { primary: true });
      return;
    }
    const ships = live.plan.ships.map((sh) => ({ ...sh, passive: true }));
    const ids = d.spawnShips(live, ships);
    if (!ids.length) return d.abort(live, 'no_budget');
    // W05 shape 327: ghost_on_the_bearing spawns quiet_ghost actors as scanner ghosts
    // (isGhost / ghostConfidence / revealStage on entity.data — sim-truth path A).
    if (live.shapeId === 'ghost_on_the_bearing' && state.entities && typeof state.entities.get === 'function') {
      for (const id of ids) {
        const ent = state.entities.get(id);
        if (!ent || !ent.alive) continue;
        const roleId = String((ent.data && (ent.data.lootTableId || ent.data.enemyTypeId)) || '');
        const arch = String((ent.data && ent.data.ai && ent.data.ai.archetype) || '');
        if (roleId === 'quiet_ghost' || roleId === 'lancer_sniper' || arch === 'sniper') {
          markEntityGhost(ent, { spawnedAt: d.now(), revealStage: 0 });
        }
      }
    }
    live.phase = 'offer';                               // "offer" = the telegraph window
    live.data.springAt = d.now() + 4;
    live.data.snared = false;
    live.deadlineAt = d.now() + 300;
    d.say(live, 'bark', 'ambush_tele', null, { primary: true });
    // Cruise interdiction: one snare per shape instance, warned ≥1 s ahead — a vector break or
    // manual cruise-drop inside the warning defeats it (the counterplay IS the design).
    const cruise = state.player && state.player.cruise;
    if (cruise && cruise.phase === 'cruising' && d.playerNearZone(live, 500)) {
      d.say(live, 'alert', 'snare_warn');
      live.data.snareAt = d.now() + 2;
    }
  },

  tick(d, live, state, now) {
    const p = d.player(); if (!p) return d.abort(live, 'no_player');
    if (live.data.snareAt && now >= live.data.snareAt && !live.data.snared) {
      live.data.snared = true;                          // one snare max, ever
      const cruise = state.player && state.player.cruise;
      if (cruise && cruise.phase === 'cruising') {
        d.emit('cruise:snareRequest', { sourceId: live.id });
        d.emit('interdiction:triggered', { sectorId: live.sectorId });
      }
      live.data.snareAt = 0;
    }
    if (live.phase === 'offer') {
      const springNow = now >= live.data.springAt && d.minDist2ToSquad(live, p) <= AMBUSH_SPRING_R * AMBUSH_SPRING_R;
      if (springNow) {
        d.setPassive(live, false);
        live.phase = 'conflict';
        d.say(live, 'alert', 'ambush_spring');
        // W03 shape 325: mine_layer_jackal seeds wake mines on spring (telegraph cue wake_mines).
        if (live.shapeId === 'minefield_wake') seedMinefieldWake(d, live, state, p);
        return;
      }
      if (now >= live.deadlineAt) { d.despawnAll(live, 10); return d.resolve(live, 'escaped', { speak: false }); }
      return;
    }
    if (live.phase === 'conflict') {
      if (d.aliveCount(live) === 0) {
        d.dangerImpulse(live, 'ambush_cleared', -0.02);
        return d.resolve(live, 'cleared');
      }
      if (d.minDist2ToSquad(live, p) >= ESCAPE_R * ESCAPE_R) return d.resolve(live, 'escaped');
    }
  },

  event(d, live, state, name) {
    if (name === 'playerHitSquad' && live.phase === 'offer') {
      d.setPassive(live, false);
      live.phase = 'conflict';
      d.say(live, 'alert', 'ambush_spring');
    }
  },

  resume(d, live, state, phase) {
    if (!(live.data && live.data.ceresActivityAmbush === true)) return false;
    const normalizedPhase = phase === 'conflict' ? 'conflict' : 'offer';
    const ids = d.adoptCeresActivityAmbush(live, normalizedPhase);
    if (!ids.length) return d.abort(live, 'adopted_squad_missing');
    live.phase = normalizedPhase;
    live.data.springAt = d.now();
    live.data.snared = false;
    live.deadlineAt = d.now() + 300;
    d.setPassive(live, normalizedPhase !== 'conflict');
    return true;
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// D. DISTRESS — 60/40 genuine/bait preserved. Assist / scan-first / ignore, all flown, not clicked.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const distress = {
  fire(d, live, state) {
    const genuine = live.plan.variantKind === 'distress_genuine';
    const ships = live.plan.ships.map((sh) => {
      const out = { ...sh };
      if (genuine && sh.role === 'victim') {
        out.team = 2;                                   // a true civilian — never a valid NPC target
        out.hullFrac = 0.35;                            // visibly holed: the story is on the hull
        out.scanLabel = 'Stricken Hauler';
      } else {
        out.passive = true;                             // harriers idle at the wreck / bait plays dead
        if (!genuine) out.scanLabel = 'Distress Beacon';
      }
      return out;
    });
    const ids = d.spawnShips(live, ships);
    if (!ids.length) return d.abort(live, 'no_budget');
    live.phase = 'offer';
    live.deadlineAt = d.now() + (live.shape.windowS || 240);
    live.data.onScene = false;
    live.data.toldTell = false;
    d.say(live, 'bark', 'distress_call', null, { primary: true });
    d.offerChoices(live, ['assist', 'scan', 'ignore'], 'ignore', live.deadlineAt);
  },

  tick(d, live, state, now) {
    const p = d.player(); if (!p) return d.abort(live, 'no_player');
    const genuine = live.plan.variantKind === 'distress_genuine';
    const anchor = live.anchor || p.pos;
    const pd2 = dist2(p.pos.x, p.pos.z, anchor.x, anchor.z);

    if (live.phase === 'offer') {
      const springR = genuine ? (live.shape.approachR || 900) : (live.shape.springR || 650);
      if (pd2 <= springR * springR) {
        live.data.onScene = true;
        live.phase = 'conflict';
        d.setPassive(live, false, genuine ? 'threat' : null);   // genuine: harriers turn; bait: trap springs
        if (!genuine) d.say(live, 'alert', 'distress_bait_spring');
        return;
      }
      if (now >= live.deadlineAt) {                     // ignored: the signal fades. No punishment.
        d.despawnAll(live, 10);
        return d.resolve(live, 'ignored', { speak: false });
      }
      return;
    }

    if (live.phase === 'conflict') {
      if (genuine) {
        const victim = d.entsOf(live, 'victim')[0];
        if (!victim || victim.alive === false) return d.resolve(live, 'lost');
        if (d.aliveCount(live, 'threat') === 0) {
          d.grant(live.shape.rescuePay || 120, 'rescue:distress');
          d.emit('distress:rescued', { factionId: 'faction_free', encounterId: live.id });
          d.emit('comms:log', { from: 'STRICKEN HAULER', text: barkText('distress_rescued_ack', null, live.id), kind: 'encounter' });
          d.despawnAll(live, 30, 'victim');             // she limps off to a dock, alive
          live.vars.faction = 'Frontier';
          live.vars.pay = live.shape.rescuePay || 120;
          return d.resolve(live, 'rescued', { vars: live.vars });
        }
      } else {
        if (d.aliveCount(live) === 0) {
          d.dangerImpulse(live, 'bait_broken', -0.015);
          return d.resolve(live, 'bait_broken');
        }
        if (d.minDist2ToSquad(live, p) >= ESCAPE_R * ESCAPE_R) return d.resolve(live, 'escaped');
      }
    }
  },

  choose(d, live, state, choiceId) {
    // 'assist' and 'ignore' are flown, not clicked; 'scan' is the C-key pulse (routed as an event).
    if (choiceId === 'ignore' && live.phase === 'offer') {
      d.despawnAll(live, 10);
      d.resolve(live, 'ignored', { speak: false });
    }
  },

  event(d, live, state, name) {
    if (name !== 'scanPulse' || live.data.toldTell || live.phase !== 'offer') return;
    const p = d.player(); if (!p) return;
    const anchor = live.anchor || p.pos;
    if (dist2(p.pos.x, p.pos.z, anchor.x, anchor.z) > DIST_TELL_R * DIST_TELL_R) return;
    live.data.toldTell = true;                          // scan-first: one read, imperfect on purpose
    const genuine = live.plan.variantKind === 'distress_genuine';
    const tellRoll = d.stream(live, 'tell')();
    const showsTell = !genuine && tellRoll < 0.7;       // 30% of baits scan clean — trust stays a read
    d.say(live, 'info', showsTell ? 'scan_tell_bait' : 'scan_tell_genuine');
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// E. CONVOY / TRADER RUN — cargo with somewhere to be. Scannable, guardable, robbable; arrival
//    applies BOUNDED market pressure through the economy's own valve.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
function convoyFire(d, live, state, isConvoy) {
  const rng = d.stream(live, 'route');
  const cargo = CONVOY_CARGO[Math.floor(rng() * CONVOY_CARGO.length) % CONVOY_CARGO.length];
  const stations = d.stationsInSector();
  const dest = stations.length ? stations[Math.floor(rng() * stations.length) % stations.length] : null;
  const zc = live.anchor || { x: 0, z: 0 };
  const zr = live.zoneRadius || 800;
  // Route: enter at the lane's edge, run to the destination station (or straight across the lane).
  const ang = rng() * Math.PI * 2;
  const start = { x: zc.x + Math.cos(ang) * zr, z: zc.z + Math.sin(ang) * zr };
  const end = dest && dest.pos ? { x: dest.pos.x, z: dest.pos.z } : { x: zc.x - Math.cos(ang) * zr * 1.6, z: zc.z - Math.sin(ang) * zr * 1.6 };
  const band = live.shape.unitsPerHauler || [4, 8];
  const perHauler = Math.round(band[0] + rng() * Math.max(0, band[1] - band[0]));
  const routeDx = end.x - start.x;
  const routeDz = end.z - start.z;
  const routeLen = Math.hypot(routeDx, routeDz) || 1;
  const routeX = routeDx / routeLen;
  const routeZ = routeDz / routeLen;
  const sideX = -routeZ;
  const sideZ = routeX;

  const ships = live.plan.ships.map((sh, i) => {
    const out = { ...sh, passive: true };
    if (sh.role === 'hauler') {
      out.team = 2;                                     // true civilians; killing them is piracy (heat)
      out.scanLabel = `Hauler — ${cargo.label}`;
      out.pos = { x: start.x + (rng() - 0.5) * 120 - i * 40, z: start.z + (rng() - 0.5) * 120 };
    } else if (sh.role === 'raider') {
      out.pos = { ...start }; // resolved carrier-relative below once the full composition is known
    } else {
      out.pos = { x: start.x + (rng() - 0.5) * 200, z: start.z + (rng() - 0.5) * 200 };
    }
    return out;
  });
  const carrierStart = ships.find((ship) => ship.role === 'hauler')?.pos || start;
  const curtainAngles = [-0.87, -0.29, 0.29, 0.87];
  let curtainIndex = 0;
  for (const ship of ships) {
    if (ship.role !== 'raider') continue;
    // Keep the threat readable in the same camera bubble as its prey. Four points across a rear arc
    // remain 125–135 WU from the carrier and at least ~70 WU apart without consuming another RNG.
    const angle = curtainAngles[curtainIndex % curtainAngles.length];
    const radius = 125 + (curtainIndex % 2) * 10;
    const trail = Math.cos(angle) * radius;
    const side = Math.sin(angle) * radius;
    ship.pos = {
      x: carrierStart.x - routeX * trail + sideX * side,
      z: carrierStart.z - routeZ * trail + sideZ * side,
    };
    curtainIndex++;
  }
  const ids = d.spawnShips(live, ships);
  if (!ids.length) return d.abort(live, 'no_budget');

  live.phase = 'transit';
  live.deadlineAt = d.now() + (live.shape.transitS || 200);
  live.data.end = end;
  live.data.destId = dest ? dest.id : null;
  live.data.destName = dest ? (dest.name || 'the exchange') : 'the far lane';
  live.data.cargoId = cargo.commodityId;
  live.data.perHauler = perHauler;
  live.data.initialHaulerCount = d.aliveCount(live, 'hauler');
  live.data.initialCargoUnits = live.data.initialHaulerCount * perHauler;
  live.data.freightManifest = {
    manifestId: `fm_encounter_${live.id}`,
    freighterKey: `encounter:${live.id}`,
    role: 'hauler',
    lines: live.data.initialCargoUnits > 0
      ? [{ commodityId: cargo.commodityId, qty: live.data.initialCargoUnits }]
      : [],
    totalQty: live.data.initialCargoUnits,
  };
  live.data.robbed = false;
  live.data.lossKillerId = null;
  live.data.guardKills = 0;
  live.data.noticed = false;
  live.vars.cargo = cargo.label;
  live.vars.dest = live.data.destName;
  live.vars.faction = FACTION_LABELS[live.factionId] || 'Meridian';
  if (live.plan.predation && live.plan.predation.enabled === true) {
    attachConvoyCargoManifests(d, live, cargo.commodityId, perHauler);
    if (!initializeConvoyPredation(d, live, state)) return d.abort(live, 'predation_composition');
  }
  d.say(live, isConvoy ? 'news' : 'info', live.shape.bark, live.vars, { primary: true });
}

function adoptCeresLivingChain(d, live, state, context) {
  const hauler = context?.hauler;
  const patrol = context?.patrol;
  const station = context?.station;
  const payload = context?.payload;
  const manifest = hauler?.data?.cargoManifest;
  const commodityId = manifest?.lines?.[0]?.commodityId;
  const lineQty = Array.isArray(manifest?.lines)
    ? manifest.lines.reduce((sum, line) => sum + Math.max(0, Math.floor(Number(line?.qty) || 0)), 0)
    : 0;
  if (!hauler || !patrol || !station || !payload || !manifest
    || manifest.manifestId !== payload.manifestId
    || manifest.totalQty !== payload.qty
    || !Array.isArray(manifest.lines) || manifest.lines.length === 0
    || typeof commodityId !== 'string' || !commodityId
    || manifest.lines.some((line) => line?.commodityId !== commodityId)
    || lineQty !== payload.qty) return false;

  const targetData = hauler.data || (hauler.data = {});
  const targetAi = targetData.ai || (targetData.ai = {});
  targetAi.encounterId = live.id;
  targetAi.encounterKind = live.shapeId;
  targetAi.encounterRole = 'hauler';
  targetAi.sectorId = live.sectorId;
  targetAi.zoneId = live.zoneId;
  targetAi.zoneName = live.zoneName;
  targetData.bountyCr = 0;
  targetData.loot = null;
  targetData.freightRewardOwner = 'manifest_custody';
  live.ids.push(hauler.id);
  live.roles[hauler.id] = 'hauler';

  const pirateIds = d.spawnShips(live, live.plan.ships);
  if (pirateIds.length !== 1) return false;
  live.phase = 'transit';
  live.deadlineAt = d.now() + 120;
  live.data.end = { x: station.pos.x, z: station.pos.z };
  live.data.destId = 'station_ceres';
  live.data.destName = 'Ceres Refinery';
  live.data.cargoId = commodityId;
  live.data.perHauler = payload.qty;
  live.data.initialHaulerCount = 1;
  live.data.initialCargoUnits = payload.qty;
  live.data.freightManifest = {
    manifestId: manifest.manifestId,
    freighterKey: manifest.freighterKey,
    role: manifest.role,
    lines: manifest.lines.map((line) => ({ ...line })),
    totalQty: manifest.totalQty,
  };
  live.data.patrolEntityId = patrol.id;
  live.data.patrolWorldRecordId = patrol.data?.worldRecordId || null;
  live.data.robbed = false;
  live.data.lossKillerId = null;
  live.data.guardKills = 0;
  live.data.noticed = true;
  live.vars.cargo = 'refinery ore';
  live.vars.dest = live.data.destName;
  live.vars.faction = 'Crimson Reach';
  if (!initializeConvoyPredation(d, live, state)) return false;
  d.say(live, 'alert', 'ORE ALERT: raider cutting across the refinery handoff.', null, {
    primary: true,
    literal: true,
  });
  return true;
}

function attachConvoyCargoManifests(d, live, commodityId, perHauler) {
  const haulers = d.entsOf(live, 'hauler').slice().sort(compareEntityIds);
  for (let i = 0; i < haulers.length; i++) {
    const entity = haulers[i];
    const aggregate = live.data.freightManifest;
    const manifestId = haulers.length === 1
      ? aggregate.manifestId
      : `${aggregate.manifestId}:carrier:${i}`;
    entity.data = entity.data || {};
    // This authored manifest is the only physical cargo reward owner for the civilian hull. Keep
    // lootTableId as its render/archetype identity, but suppress the generic combat bounty/roll.
    entity.data.bountyCr = 0;
    entity.data.loot = null;
    entity.data.freightRewardOwner = 'manifest_custody';
    entity.data.cargoManifest = {
      manifestId,
      freighterKey: haulers.length === 1
        ? aggregate.freighterKey
        : `${aggregate.freighterKey}:carrier:${i}`,
      role: 'hauler',
      lines: perHauler > 0 ? [{ commodityId, qty: perHauler }] : [],
      totalQty: Math.max(0, perHauler | 0),
    };
  }
}

function initializeConvoyPredation(d, live, state) {
  const config = live.plan.predation;
  const carriers = d.entsOf(live, config.carrierRole || 'hauler').slice().sort(compareEntityIds);
  const raiders = d.entsOf(live, config.raiderRole || 'raider').slice().sort(compareEntityIds);
  if (!carriers.length || !raiders.length) return false;

  for (let i = 0; i < carriers.length; i++) {
    const carrier = carriers[i];
    const data = carrier.data || (carrier.data = {});
    data.predationEncounterId = live.id;
    data.predationRole = 'manifest_carrier';
    data.predationIdentityKey = `${live.id}:hauler:${i}`;
    data.freightCustody = {
      status: 'carrier',
      carrierId: carrier.id,
      carrierIdentityKey: data.predationIdentityKey,
      encounterId: live.id,
      manifestId: data.cargoManifest && data.cargoManifest.manifestId || null,
    };
  }
  for (let i = 0; i < raiders.length; i++) {
    const raider = raiders[i];
    const data = raider.data || (raider.data = {});
    const ai = data.ai || (data.ai = {});
    data.predationEncounterId = live.id;
    data.predationRole = 'raider';
    data.predationIdentityKey = `${live.id}:raider:${i}`;
    ai.predationStatus = 'standby';
    ai.passive = true;
    delete ai.predationTargetId;
    delete ai.predationTargetIdentityKey;
  }

  const target = carriers[0];
  // The authored anchor is a point-defense controller. Giving it the carrier as an ATTACK_RUN
  // target makes the PD policy treat that same carrier as its protected charge and correctly
  // refuse to fire. Keep the screen as the readable curtain and select the first stable offensive
  // hull for the bounded theft relation. A malformed all-screen roster fails closed.
  const raider = raiders.find((candidate) => !isPdScreenActor(candidate));
  if (!raider) return false;
  Object.defineProperty(target, FREIGHT_CARRIER_INSTANCE, {
    value: target.data.predationIdentityKey,
    configurable: true,
  });
  target.data.freightCustodyCarrierIdentityKey = target.data.predationIdentityKey;
  Object.defineProperty(raider, FREIGHT_RAIDER_INSTANCE, {
    value: raider.data.predationIdentityKey,
    configurable: true,
  });
  raider.data.freightCustodyRaiderIdentityKey = raider.data.predationIdentityKey;
  const ai = raider.data.ai;
  const responseWindowS = Math.max(
    PREDATION_MIN_RESPONSE_S,
    Number(config.responseWindowS) || PREDATION_MIN_RESPONSE_S,
  );
  const objectiveS = Math.max(responseWindowS, Number(config.objectiveS) || 90);
  const leashRadius = Math.max(400, Number(config.leashRadius) || 2600);
  const startedTick = Number.isInteger(state.tick) ? state.tick : Math.round(d.now() * 60);
  const deadlineTick = startedTick + Math.ceil(objectiveS * 60);

  ai.motive = String(config.motive || 'cargo_raid');
  ai.engagementTrigger = String(config.engagementTrigger || 'manifest_predation');
  if (typeof config.attackerDoctrineId === 'string' && config.attackerDoctrineId.length > 0) {
    ai.combatDoctrineId = config.attackerDoctrineId;
  }
  ai.approachTelegraph = String(config.approachTelegraph || 'pirate_approach');
  ai.noFireResponseWindowS = responseWindowS;
  ai.predationStatus = 'telegraph';
  ai.predationTargetId = target.id;
  ai.predationTargetIdentityKey = target.data.predationIdentityKey;
  ai.predationLeashRadius = leashRadius;
  ai.motiveSatisfied = false;
  ai.pirateDisengaged = false;
  ai.predationObjective = {
    kind: 'interdict_manifest',
    encounterId: live.id,
    targetId: target.id,
    targetIdentityKey: target.data.predationIdentityKey,
    manifestId: target.data.cargoManifest.manifestId,
    startedTick,
    deadlineTick,
    leashRadius,
  };
  setEntityDoctrine(raider, {
    activity: {
      kind: ActivityKind.HAIL_HOLD,
      reason: `${live.shapeId}:predation_telegraph`,
      anchor: raider.pos,
      leashRadius,
      startedTick,
      deadlineTick,
      targetId: target.id,
      routeId: live.zoneId,
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });

  live.data.predationStatus = 'telegraph';
  live.data.predationRaiderId = raider.id;
  live.data.predationRaiderIdentityKey = raider.data.predationIdentityKey;
  live.data.predationTargetId = target.id;
  live.data.predationTargetIdentityKey = target.data.predationIdentityKey;
  live.data.predationStartedTick = startedTick;
  live.data.predationNoFireUntil = d.now() + responseWindowS;
  live.data.predationDeadlineAt = Math.min(live.deadlineAt, d.now() + objectiveS);
  live.data.predationAwaySince = null;
  live.data.predationEndReason = null;
  d.emit('encounter:predationTelegraph', {
    encounterId: live.id,
    raiderId: raider.id,
    raiderIdentityKey: raider.data.predationIdentityKey,
    targetId: target.id,
    targetIdentityKey: target.data.predationIdentityKey,
    manifestId: target.data.cargoManifest.manifestId,
    motive: ai.motive,
    approachTelegraph: ai.approachTelegraph,
    responseWindowS,
    noFireUntil: live.data.predationNoFireUntil,
    deadlineAt: live.data.predationDeadlineAt,
    sectorId: live.sectorId,
    zoneId: live.zoneId,
  });
  d.emit('ai:telegraph', {
    entityId: raider.id,
    targetId: target.id,
    encounterId: live.id,
    doctrineId: ai.combatDoctrineId,
    kind: ai.approachTelegraph,
    durationTicks: Math.max(30, Math.ceil(responseWindowS * 60)),
    tick: startedTick,
  });
  return true;
}

function tickConvoyPredation(d, live, state, now) {
  if (!live.plan.predation || !['telegraph', 'active'].includes(live.data.predationStatus)) return;
  const raider = state.entities && state.entities.get(live.data.predationRaiderId);
  const target = state.entities && state.entities.get(live.data.predationTargetId);
  const targetIdentity = live.data.predationTargetIdentityKey;
  if (!raider || raider.alive === false || raider.data?.predationIdentityKey !== live.data.predationRaiderIdentityKey) {
    clearConvoyPredation(d, live, 'raider_lost');
    return;
  }
  if (!target || target.alive === false || target.data?.predationIdentityKey !== targetIdentity) {
    clearConvoyPredation(d, live, 'target_lost');
    return;
  }
  if (convoyTargetDisabled(state, target)) {
    clearConvoyPredation(d, live, 'target_disabled');
    return;
  }
  if (!manifestStillInCarrierCustody(target)) {
    clearConvoyPredation(d, live, 'custody_changed');
    return;
  }
  if (now >= live.data.predationDeadlineAt) {
    clearConvoyPredation(d, live, 'objective_timeout');
    return;
  }

  const config = live.plan.predation;
  const leash = Math.max(400, Number(config.leashRadius) || 2600);
  const separation2 = dist2(raider.pos.x, raider.pos.z, target.pos.x, target.pos.z);
  if (separation2 > leash * leash) {
    if (live.data.predationAwaySince == null) live.data.predationAwaySince = now;
    if (now - live.data.predationAwaySince >= Math.max(1, Number(config.escapeHoldS) || 3)) {
      clearConvoyPredation(d, live, 'target_escaped');
    }
    return;
  }
  live.data.predationAwaySince = null;

  if (live.data.predationStatus === 'telegraph' && now >= live.data.predationNoFireUntil) {
    const ai = raider.data.ai;
    ai.passive = false;
    ai.predationStatus = 'active';
    setEntityDoctrine(raider, {
      activity: {
        kind: ActivityKind.ATTACK_RUN,
        reason: `${live.shapeId}:manifest_predation`,
        anchor: live.anchor,
        leashRadius: leash,
        startedTick: live.data.predationStartedTick,
        deadlineTick: ai.predationObjective.deadlineTick,
        targetId: target.id,
        routeId: live.zoneId,
        encounterId: live.id,
      },
      roe: RulesOfEngagement.WEAPONS_FREE,
    });
    live.data.predationStatus = 'active';
    d.emit('encounter:predationEngaged', {
      encounterId: live.id,
      raiderId: raider.id,
      targetId: target.id,
      manifestId: target.data.cargoManifest.manifestId,
      t: now,
    });
  }
}

function clearConvoyPredation(d, live, reason) {
  if (!live || !live.data || !['telegraph', 'active'].includes(live.data.predationStatus)) return false;
  const raiderId = live.data.predationRaiderId;
  const targetId = live.data.predationTargetId;
  d.clearPredation(live, reason);
  d.emit('encounter:predationCleared', {
    encounterId: live.id,
    raiderId,
    targetId,
    reason,
    t: d.now(),
  });
  return true;
}

function convoyTargetDisabled(state, target) {
  if (!target || target.disabled === true) return true;
  const runtime = state.combat && state.combat.entities && state.combat.entities[String(target.id)];
  return !!(runtime && runtime.capabilities && runtime.capabilities.drive === false);
}

function manifestStillInCarrierCustody(target) {
  const data = target && target.data;
  const manifest = data && data.cargoManifest;
  if (!manifest || !Array.isArray(manifest.lines)
    || !manifest.lines.some((line) => line && Number(line.qty) > 0)) return false;
  const custody = data.freightCustody;
  return !custody || (custody.status === 'carrier'
    && custody.carrierId === target.id
    && custody.carrierIdentityKey === data.predationIdentityKey);
}

function compareEntityIds(a, b) {
  const an = Number(a && a.id);
  const bn = Number(b && b.id);
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  return String(a && a.id).localeCompare(String(b && b.id));
}

function selectedFreightCarrier(live, state, allowDead = false) {
  if (!live || !live.data || !state || !state.entities) return null;
  const id = live.data.predationTargetId;
  const identity = live.data.predationTargetIdentityKey;
  const entity = id == null ? null : state.entities.get(id);
  if (!entity || (!allowDead && entity.alive === false) || live.roles[id] !== 'hauler') return null;
  const data = entity.data || {};
  if (!identity || data.predationIdentityKey !== identity
    || data.freightCustodyCarrierIdentityKey !== identity
    || entity[FREIGHT_CARRIER_INSTANCE] !== identity) return null;
  return entity;
}

function selectedFreightRaider(live, state, allowDead = false) {
  if (!live || !live.data || !state || !state.entities) return null;
  const id = live.data.predationRaiderId;
  const identity = live.data.predationRaiderIdentityKey;
  const entity = id == null ? null : state.entities.get(id);
  if (!entity || (!allowDead && entity.alive === false) || live.roles[id] !== 'raider') return null;
  const data = entity.data || {};
  if (!identity || data.freightCustodyRaiderIdentityKey !== identity
    || entity[FREIGHT_RAIDER_INSTANCE] !== identity) return null;
  return entity;
}

function authoredManifestLine(carrier) {
  const manifest = carrier && carrier.data && carrier.data.cargoManifest;
  if (!manifest || typeof manifest.manifestId !== 'string' || !manifest.manifestId
    || typeof manifest.freighterKey !== 'string' || !manifest.freighterKey
    || !Array.isArray(manifest.lines)) return null;
  const lines = manifest.lines.filter((line) => (
    line && typeof line.commodityId === 'string' && line.commodityId && Number(line.qty) > 0
  ));
  if (!lines.length || lines.some((line) => line.commodityId !== lines[0].commodityId)) return null;
  const qty = lines.reduce((sum, line) => sum + Math.max(0, Math.floor(Number(line.qty) || 0)), 0);
  if (qty <= 0) return null;
  return { manifest, commodityId: lines[0].commodityId, qty };
}

function ensureFreightCargoCustody(d, live, state, carrier) {
  const existing = live.data.freightCargoCustody;
  if (existing) {
    return existing.carrierId === carrier.id
      && existing.carrierIdentityKey === carrier.data.predationIdentityKey
      && existing.manifestId === carrier.data.cargoManifest?.manifestId
      ? existing
      : null;
  }
  const source = authoredManifestLine(carrier);
  if (!source) return null;
  const carrierIdentityKey = carrier.data.predationIdentityKey;
  const custodyId = `${source.manifest.manifestId}:custody:${carrierIdentityKey}`;
  const now = d.now();
  const civilianOwner = carrier.team === 2
    && carrier.data.predationRole === 'manifest_carrier'
    && carrier.data.freightCustody?.status === 'carrier';
  const record = {
    version: 1,
    custodyId,
    receiptId: `${custodyId}:receipt`,
    encounterId: live.id,
    carrierId: carrier.id,
    carrierIdentityKey,
    raiderId: live.data.predationRaiderId,
    raiderIdentityKey: live.data.predationRaiderIdentityKey,
    manifestId: source.manifest.manifestId,
    freighterKey: source.manifest.freighterKey,
    commodityId: source.commodityId,
    legalOwnerKind: civilianOwner ? 'civilian' : 'other',
    legalOwnerStableId: civilianOwner ? source.manifest.freighterKey : null,
    legalOwnerFactionId: civilianOwner && typeof carrier.factionId === 'string'
      ? carrier.factionId
      : null,
    lawTheftReportId: null,
    lawTheftCausalTick: null,
    lawTheftIncidentReceiptId: null,
    initialQty: source.qty,
    carrierQty: source.qty,
    playerCollectedQty: 0,
    raiderSecuredQty: 0,
    stationRecoveredQty: 0,
    deliveredQty: 0,
    lostQty: 0,
    pods: [],
    nextPodIndex: 0,
    respillSeq: 0,
    disableSpilled: false,
    deathSpilled: false,
    spillWindowClosed: false,
    carrierDead: false,
    carrierAbandoned: false,
    carrierRecovered: false,
    carrierArrived: false,
    carrierDestructionPending: false,
    raiderDead: false,
    raiderEscaped: false,
    raiderRecoveryClosed: false,
    carrierPersistenceOwned: false,
    raiderPersistenceOwned: false,
    terminal: false,
    receiptEmitted: false,
    lossAccountedQty: 0,
    startedAt: now,
    deadlineAt: now + FREIGHT_CUSTODY_WINDOW_S,
    escapeStartedAt: null,
    escapeDeadlineAt: null,
    escapeRadius: FREIGHT_RAIDER_ESCAPE_R,
    escapeOrigin: null,
    escapeTarget: null,
    transitionSeq: 0,
  };
  record.carrierPersistenceOwned = claimFreightCustodyPersistence(carrier, record, 'carrier');
  live.data.freightCargoCustody = record;
  return record;
}

function splitFreightQty(qty, slots) {
  const count = Math.max(0, Math.min(slots | 0, qty | 0));
  if (!count) return [];
  const base = Math.floor(qty / count);
  const extra = qty % count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

function updateCarrierManifest(record, carrier) {
  const manifest = carrier && carrier.data && carrier.data.cargoManifest;
  if (!manifest || manifest.manifestId !== record.manifestId || manifest.freighterKey !== record.freighterKey) return false;
  let assigned = false;
  for (const line of manifest.lines || []) {
    if (!line || line.commodityId !== record.commodityId) continue;
    line.qty = assigned ? 0 : record.carrierQty;
    assigned = true;
  }
  if (!assigned && record.carrierQty > 0) return false;
  manifest.totalQty = record.carrierQty;
  const custody = carrier.data.freightCustody;
  if (custody && custody.manifestId === record.manifestId
    && custody.carrierIdentityKey === record.carrierIdentityKey) {
    custody.status = record.carrierQty > 0 ? 'carrier' : 'spilled';
    custody.carrierId = carrier.id;
  }
  return true;
}

function claimFreightCustodyPersistence(entity, record, role) {
  if (!entity || !record) return false;
  const alreadyPersistent = entity.flags && entity.flags.persistent === true;
  // surrenderRecovery is registered first in production and may be the owner that made this
  // disabled carrier persistent. Adopt that exact owned flag before installing our handoff marker;
  // an unrelated pre-persistent actor (including a C annotation with ownedPersistent=false) stays
  // externally owned and must not have its persistence cleared by freight custody later.
  const adoptsCivilianRecoveryPersistence = alreadyPersistent
    && activeCivilianRecoveryOwnsPersistence(entity);
  entity.flags = entity.flags || {};
  entity.flags.persistent = true;
  const data = entity.data || (entity.data = {});
  data.freightCustodyPersistence = { custodyId: record.custodyId, role };
  return !alreadyPersistent || adoptsCivilianRecoveryPersistence;
}

function activeCivilianRecoveryOwnsPersistence(entity) {
  const annotation = entity && entity.data && entity.data.surrenderRecovery;
  return !!(annotation && annotation.recoveryKind === 'civilian_disabled'
    && annotation.ownedPersistent === true
    && annotation.phase !== 'lost' && annotation.phase !== 'recovered');
}

function releaseFreightCustodyPersistence(entity, record, owned) {
  if (!entity || !record) return false;
  const data = entity.data || {};
  const marker = data.freightCustodyPersistence;
  if (marker && marker.custodyId === record.custodyId) delete data.freightCustodyPersistence;
  if (!owned || activeCivilianRecoveryOwnsPersistence(entity) || !entity.flags) return false;
  delete entity.flags.persistent;
  return true;
}

function releaseFreightCustodyActors(live, state, record) {
  if (!record || !state || !state.entities) return;
  const carrier = selectedFreightCarrier(live, state, true);
  const raider = selectedFreightRaider(live, state, true);
  releaseFreightCustodyPersistence(carrier, record, record.carrierPersistenceOwned);
  releaseFreightCustodyPersistence(raider, record, record.raiderPersistenceOwned);
  record.carrierPersistenceOwned = false;
  record.raiderPersistenceOwned = false;
}

function liveFreightPodQty(record) {
  return record.pods.reduce((sum, pod) => sum + (pod.status === 'live' ? pod.qty : 0), 0);
}

function freightCustodySnapshot(record, reason, now) {
  const livePodQty = liveFreightPodQty(record);
  const accountedQty = record.carrierQty + livePodQty + record.playerCollectedQty
    + record.raiderSecuredQty + record.stationRecoveredQty + record.deliveredQty + record.lostQty;
  return {
    receiptId: record.receiptId,
    custodyId: record.custodyId,
    encounterId: record.encounterId,
    carrierId: record.carrierId,
    carrierIdentityKey: record.carrierIdentityKey,
    raiderId: record.raiderId,
    manifestId: record.manifestId,
    freighterKey: record.freighterKey,
    commodityId: record.commodityId,
    legalOwnerKind: record.legalOwnerKind,
    legalOwnerStableId: record.legalOwnerStableId,
    lawTheftIncidentReceiptId: record.lawTheftIncidentReceiptId,
    initialQty: record.initialQty,
    carrierRemainingQty: record.carrierQty,
    livePodQty,
    playerCollectedQty: record.playerCollectedQty,
    raiderSecuredQty: record.raiderSecuredQty,
    stationRecoveredQty: record.stationRecoveredQty,
    deliveredQty: record.deliveredQty,
    lostQty: record.lostQty,
    accountedQty,
    podCount: record.pods.length,
    livePodCount: record.pods.filter((pod) => pod.status === 'live').length,
    terminal: record.terminal,
    reason,
    transitionSeq: record.transitionSeq,
    t: now,
  };
}

function publishFreightCustody(d, live, record, reason, carrier = null) {
  record.transitionSeq += 1;
  if (typeof d.persistOpenFreightCustody === 'function') d.persistOpenFreightCustody(live, record);
  const snapshot = freightCustodySnapshot(record, reason, d.now());
  d.emit('freight:custodyChanged', snapshot);
  d.emit('freight:manifestRemaining', {
    encounterId: live.id,
    custodyId: record.custodyId,
    carrierId: record.carrierId,
    carrierIdentityKey: record.carrierIdentityKey,
    manifestId: record.manifestId,
    freighterKey: record.freighterKey,
    commodityId: record.commodityId,
    remainingQty: record.carrierQty,
    manifest: carrier && carrier.data && carrier.data.cargoManifest
      ? {
          manifestId: record.manifestId,
          freighterKey: record.freighterKey,
          role: carrier.data.cargoManifest.role,
          lines: carrier.data.cargoManifest.lines.map((line) => ({ ...line })),
          totalQty: carrier.data.cargoManifest.totalQty,
        }
      : null,
    reason,
    t: d.now(),
  });
  return snapshot;
}

function accountFreightDiversion(d, live, record) {
  if (!record || record.lossAccountedQty > 0) return false;
  const divertedQty = record.playerCollectedQty + record.raiderSecuredQty + record.lostQty;
  if (divertedQty <= 0) return false;
  const manifest = {
    manifestId: record.manifestId,
    freighterKey: record.freighterKey,
    role: 'hauler',
    lines: [{ commodityId: record.commodityId, qty: divertedQty }],
    totalQty: divertedQty,
  };
  if (!d.freightLoss(live, {
    manifest,
    freighterKey: record.freighterKey,
    stationId: live.data.destId,
    killerId: live.data.lossKillerId,
  })) return false;
  record.lossAccountedQty = divertedQty;
  return true;
}

function finishFreightCustody(d, live, record, outcome) {
  if (!record || record.terminal) return false;
  record.terminal = true;
  record.outcome = outcome;
  record.resolvedAt = d.now();
  if (typeof d.clearOpenFreightCustody === 'function') d.clearOpenFreightCustody(record.custodyId);
  releaseFreightCustodyActors(live, d.state, record);
  accountFreightDiversion(d, live, record);
  const snapshot = publishFreightCustody(d, live, record, outcome);
  if (!record.receiptEmitted) {
    record.receiptEmitted = true;
    d.emit('freight:custodyReceipt', { ...snapshot, outcome });
  }
  return true;
}

function spawnFreightCargo(d, live, state, carrier, cause) {
  if (!live.plan.predation || live.plan.predation.enabled !== true) return false;
  const record = ensureFreightCargoCustody(d, live, state, carrier);
  if (!record || record.terminal || record.carrierQty <= 0) return false;
  if (cause === 'drive_disabled') {
    if (record.disableSpilled) return false;
    record.disableSpilled = true; // reserve before spawning; duplicate bus events cannot re-enter
  } else if (cause === 'carrier_destroyed') {
    if (record.deathSpilled) return false;
    record.deathSpilled = true;
    record.carrierDead = true;
  } else {
    return false;
  }

  const available = Math.max(0, FREIGHT_POD_LIMIT - record.pods.length);
  const requested = cause === 'drive_disabled'
    ? Math.max(1, Math.floor(record.carrierQty / 2))
    : record.carrierQty;
  const chunks = splitFreightQty(requested, cause === 'drive_disabled' ? Math.min(1, available) : available);
  const rng = d.stream(live, `freight-cargo:${cause}`);
  let spawnedQty = 0;
  for (const qty of chunks) {
    const podIndex = record.nextPodIndex++;
    const podIdentity = `${record.custodyId}:pod:${podIndex}`;
    const angle = rng() * Math.PI * 2;
    const radius = (carrier.radius || 8) + 5 + rng() * 5;
    const speed = 7 + rng() * 7;
    const pod = d.spawnFreightPickup(live, {
      commodityId: record.commodityId,
      qty,
      ttlS: FREIGHT_POD_TTL_S,
      pos: {
        x: carrier.pos.x + Math.cos(angle) * radius,
        z: carrier.pos.z + Math.sin(angle) * radius,
      },
      vel: {
        x: (carrier.vel && carrier.vel.x || 0) + Math.cos(angle) * speed,
        z: (carrier.vel && carrier.vel.z || 0) + Math.sin(angle) * speed,
      },
      custody: {
        status: 'live',
        podIdentity,
        custodyId: record.custodyId,
        encounterId: live.id,
        manifestId: record.manifestId,
        freighterKey: record.freighterKey,
        carrierIdentityKey: record.carrierIdentityKey,
        commodityId: record.commodityId,
        podIndex,
        cause,
        legalOwnerStableId: record.legalOwnerStableId,
        custodySourceKind: record.legalOwnerKind === 'civilian' ? 'lawful_carrier' : 'other_carrier',
        sourceCustodianStableId: record.carrierIdentityKey,
      },
    });
    if (!pod) continue;
    Object.defineProperty(pod, FREIGHT_POD_INSTANCE, { value: podIdentity, configurable: true });
    record.pods.push({
      podIdentity,
      entityId: pod.id,
      podIndex,
      instanceSeq: 0,
      qty,
      status: 'live',
      cause,
      custodySourceKind: record.legalOwnerKind === 'civilian' ? 'lawful_carrier' : 'other_carrier',
      sourceCustodianStableId: record.carrierIdentityKey,
    });
    spawnedQty += qty;
  }
  if (spawnedQty <= 0) return false;
  record.carrierQty -= spawnedQty;
  updateCarrierManifest(record, carrier);
  clearConvoyPredation(d, live, cause === 'carrier_destroyed' ? 'target_destroyed' : 'target_disabled');
  publishFreightCustody(d, live, record, cause, carrier);
  d.emit('freight:cargoSpilled', {
    encounterId: live.id,
    custodyId: record.custodyId,
    manifestId: record.manifestId,
    carrierId: record.carrierId,
    cause,
    qty: spawnedQty,
    podCount: record.pods.length,
    t: d.now(),
  });
  return true;
}

function podEntityForRecord(state, record, pod) {
  const entity = state.entities && state.entities.get(pod.entityId);
  const annotation = entity && entity.data && entity.data.freightCustodyPod;
  return entity && entity.alive !== false && entity.type === 'pickup'
    && entity[FREIGHT_POD_INSTANCE] === pod.podIdentity
    && annotation && annotation.podIdentity === pod.podIdentity
    && annotation.custodyId === record.custodyId
    && annotation.legalOwnerStableId === record.legalOwnerStableId
    && annotation.custodySourceKind === pod.custodySourceKind
    && annotation.sourceCustodianStableId === pod.sourceCustodianStableId
    && Math.floor(Number(annotation.qty) || 0) === pod.qty
    && Math.floor(Number(entity.data.amount) || 0) === pod.qty
    ? entity
    : null;
}

function settleFreightPod(d, live, state, record, pod, status, reason) {
  if (!pod || pod.status !== 'live') return false;
  const entity = podEntityForRecord(state, record, pod);
  if (!entity) return false;
  pod.status = status;
  if (status === 'player_collected') {
    record.playerCollectedQty += pod.qty;
    if (typeof d.reportFreightTheft === 'function') d.reportFreightTheft(live, record, pod, entity);
  }
  else if (status === 'raider_secured') {
    record.raiderSecuredQty += pod.qty;
    const raider = selectedFreightRaider(live, state);
    if (raider) {
      record.raiderId = raider.id;
      record.raiderPersistenceOwned = claimFreightCustodyPersistence(raider, record, 'secured_raider')
        || record.raiderPersistenceOwned;
    }
  }
  else record.lostQty += pod.qty;
  const annotation = entity.data.freightCustodyPod;
  annotation.status = status;
  entity.collides = false;
  if (entity.flags) delete entity.flags.persistent;
  if (status !== 'player_collected') d.retireFreightPickup(entity, status);
  publishFreightCustody(d, live, record, reason);
  return true;
}

function collectFreightPod(d, live, state, payload) {
  const record = live.data.freightCargoCustody;
  if (!record || record.terminal || !payload || payload.pickupId == null) return false;
  const pod = record.pods.find((candidate) => candidate.entityId === payload.pickupId);
  if (!pod || pod.status !== 'live' || payload.kind !== 'cargo'
    || payload.commodityId !== record.commodityId || Math.floor(Number(payload.amount) || 0) !== pod.qty) return false;
  if (payload.collectorId === state.playerId) {
    const accepted = Number(payload.acceptedAmount);
    const rejected = Number(payload.rejectedAmount);
    if (!Number.isFinite(accepted) || !Number.isFinite(rejected)
      || Math.floor(accepted) !== accepted || Math.floor(rejected) !== rejected
      || accepted < 0 || rejected < 0 || accepted + rejected !== pod.qty) return false;
    if (accepted <= 0) return false;
    if (rejected > 0) {
      const entity = podEntityForRecord(state, record, pod);
      if (!entity) return false;
      record.playerCollectedQty += accepted;
      pod.qty = rejected;
      entity.data.freightCustodyPod.qty = rejected;
      if (typeof d.resizeFreightPickup === 'function') {
        d.resizeFreightPickup(entity, record.commodityId, rejected);
      } else {
        entity.data.amount = rejected;
      }
      if (typeof d.reportFreightTheft === 'function') d.reportFreightTheft(live, record, pod, entity);
      publishFreightCustody(d, live, record, 'player_partially_collected');
      return true;
    }
    return settleFreightPod(d, live, state, record, pod, 'player_collected', 'player_collected');
  }
  const raider = selectedFreightRaider(live, state);
  if (raider && payload.collectorId === raider.id) {
    payload.acceptedAmount = pod.qty;
    payload.rejectedAmount = 0;
    return settleFreightPod(d, live, state, record, pod, 'raider_secured', 'raider_secured');
  }
  // Physics asks every overlapping ship through the same synchronous acceptance payload. Only the
  // exact stable raider may take manifest custody; other NPC overlaps reject the pickup so the
  // selected hull can still make real contact on a later physics step.
  payload.acceptedAmount = 0;
  payload.rejectedAmount = pod.qty;
  payload.acceptanceRetryAt = d.now() + 0.25;
  return false;
}

function freightRaiderTethered(state, entityId) {
  const playerEntity = state.entities && state.entities.get(state.playerId);
  const playerTether = state.player && state.player.tether || playerEntity && playerEntity.tether;
  if (playerTether && playerTether.active === true && playerTether.targetId === entityId) return true;
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!attachments || typeof attachments !== 'object') return false;
  return Object.values(attachments).some((attachment) => (
    attachment && attachment.state === 'active'
      && (attachment.ownerId === entityId || attachment.targetId === entityId)
  ));
}

function freightRaiderIneligibleReason(state, raider) {
  if (!raider) return 'identity_lost';
  if (raider.alive === false) return 'destroyed';
  if (raider.disabled === true) return 'drive_disabled';
  const runtime = state.combat && state.combat.entities && state.combat.entities[String(raider.id)];
  const drive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
  if (runtime && runtime.capabilities && runtime.capabilities.drive === false
    || drive && drive.effectiveDisabled === true) return 'drive_disabled';
  if (freightRaiderTethered(state, raider.id)) return 'tethered';
  return null;
}

function respillFreightFromRaider(d, live, state, record, raider, reason) {
  if (!record || record.terminal || record.raiderSecuredQty <= 0) return false;
  const secured = record.pods
    .filter((pod) => pod.status === 'raider_secured')
    .sort((a, b) => a.podIndex - b.podIndex);
  if (!secured.length) return false;
  const liveCount = record.pods.filter((pod) => pod.status === 'live').length;
  const slots = Math.max(0, FREIGHT_POD_LIMIT - liveCount);
  if (slots <= 0) return false;
  const sourcePos = raider && raider.pos || record.raiderLastPos || live.anchor || { x: 0, z: 0 };
  const sourceVel = raider && raider.vel || { x: 0, z: 0 };
  const respillSeq = record.respillSeq++;
  const rng = d.stream(live, `freight-cargo:raider-respill:${respillSeq}:${reason}`);
  let respilledQty = 0;
  let respilledCount = 0;
  for (const podRecord of secured.slice(0, slots)) {
    const instanceSeq = Math.max(0, Number(podRecord.instanceSeq) || 0) + 1;
    const podIdentity = `${record.custodyId}:pod:${podRecord.podIndex}:instance:${instanceSeq}`;
    const angle = rng() * Math.PI * 2;
    const radius = (raider && raider.radius || 8) + 5 + rng() * 5;
    const speed = 7 + rng() * 7;
    const entity = d.spawnFreightPickup(live, {
      commodityId: record.commodityId,
      qty: podRecord.qty,
      ttlS: FREIGHT_POD_TTL_S,
      pos: {
        x: sourcePos.x + Math.cos(angle) * radius,
        z: sourcePos.z + Math.sin(angle) * radius,
      },
      vel: {
        x: (sourceVel.x || 0) + Math.cos(angle) * speed,
        z: (sourceVel.z || 0) + Math.sin(angle) * speed,
      },
      custody: {
        status: 'live',
        podIdentity,
        custodyId: record.custodyId,
        encounterId: live.id,
        manifestId: record.manifestId,
        freighterKey: record.freighterKey,
        carrierIdentityKey: record.carrierIdentityKey,
        commodityId: record.commodityId,
        podIndex: podRecord.podIndex,
        cause: reason,
        legalOwnerStableId: record.legalOwnerStableId,
        custodySourceKind: 'hostile_raider',
        sourceCustodianStableId: record.raiderIdentityKey,
      },
    });
    if (!entity) continue;
    Object.defineProperty(entity, FREIGHT_POD_INSTANCE, { value: podIdentity, configurable: true });
    podRecord.entityId = entity.id;
    podRecord.podIdentity = podIdentity;
    podRecord.instanceSeq = instanceSeq;
    podRecord.status = 'live';
    podRecord.cause = reason;
    podRecord.custodySourceKind = 'hostile_raider';
    podRecord.sourceCustodianStableId = record.raiderIdentityKey;
    record.raiderSecuredQty -= podRecord.qty;
    respilledQty += podRecord.qty;
    respilledCount++;
  }
  if (respilledQty <= 0) return false;
  record.raiderSecuredQty = Math.max(0, record.raiderSecuredQty);
  if (record.raiderSecuredQty === 0) {
    releaseFreightCustodyPersistence(raider, record, record.raiderPersistenceOwned);
    record.raiderPersistenceOwned = false;
  }
  record.escapeStartedAt = null;
  record.escapeDeadlineAt = null;
  record.escapeOrigin = null;
  record.escapeTarget = null;
  if (reason === 'raider_escape_stalled' || reason === 'custody_timeout_respill') {
    record.raiderRecoveryClosed = true;
  }
  if (raider && raider.alive !== false && raider.data) {
    const ai = raider.data.ai || (raider.data.ai = {});
    ai.passive = true;
    ai.predationStatus = 'cargo_respilled';
    setEntityDoctrine(raider, {
      activity: {
        kind: ActivityKind.DISENGAGE,
        reason: `${live.shapeId}:freight_${reason}`,
        anchor: sourcePos,
        leashRadius: Math.max(700, Number(live.plan.predation && live.plan.predation.leashRadius) || 2600),
        startedTick: state.tick | 0,
        targetId: null,
        encounterId: live.id,
      },
      roe: RulesOfEngagement.HOLD_FIRE,
    });
  }
  publishFreightCustody(d, live, record, reason);
  d.emit('freight:cargoSpilled', {
    encounterId: live.id,
    custodyId: record.custodyId,
    manifestId: record.manifestId,
    carrierId: record.carrierId,
    raiderId: record.raiderId,
    cause: reason,
    qty: respilledQty,
    podCount: liveCount + respilledCount,
    t: d.now(),
  });
  return true;
}

function beginFreightRaiderEscape(d, live, state, record, raider) {
  if (record.escapeStartedAt != null) return;
  const rng = d.stream(live, 'freight-raider-escape');
  let dx = raider.pos.x - (live.anchor && live.anchor.x || 0);
  let dz = raider.pos.z - (live.anchor && live.anchor.z || 0);
  let len = Math.hypot(dx, dz);
  if (!(len > 0.001)) {
    const angle = rng() * Math.PI * 2;
    dx = Math.cos(angle); dz = Math.sin(angle); len = 1;
  }
  const escapeRadius = FREIGHT_RAIDER_ESCAPE_R;
  record.escapeStartedAt = d.now();
  record.escapeDeadlineAt = d.now() + FREIGHT_RAIDER_ESCAPE_S;
  record.escapeRadius = escapeRadius;
  record.escapeOrigin = { x: raider.pos.x, z: raider.pos.z };
  record.escapeTarget = {
    x: raider.pos.x + dx / len * escapeRadius * 1.25,
    z: raider.pos.z + dz / len * escapeRadius * 1.25,
  };
  const ai = raider.data.ai || (raider.data.ai = {});
  ai.passive = false;
  ai.motiveSatisfied = false;
  ai.pirateDisengaged = false;
  ai.predationStatus = 'cargo_escape';
  setEntityDoctrine(raider, {
    activity: {
      kind: ActivityKind.FLEE,
      reason: `${live.shapeId}:freight_custody_escape`,
      anchor: record.escapeTarget,
      leashRadius: escapeRadius * 1.5,
      startedTick: state.tick | 0,
      deadlineTick: (state.tick | 0) + Math.ceil(FREIGHT_RAIDER_ESCAPE_S * 60),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
  publishFreightCustody(d, live, record, 'raider_escape_started');
}

function tickFreightCargoCustody(d, live, state, now) {
  const record = live.data.freightCargoCustody;
  if (!record || record.terminal) return;

  for (const pod of record.pods) {
    if (pod.status !== 'live') continue;
    const entity = podEntityForRecord(state, record, pod);
    if (!entity) {
      pod.status = 'lost';
      record.lostQty += pod.qty;
      publishFreightCustody(d, live, record, 'pod_lost');
    }
  }

  let livePods = record.pods
    .filter((pod) => pod.status === 'live')
    .map((pod) => ({ pod, entity: podEntityForRecord(state, record, pod) }))
    .filter((entry) => entry.entity);
  const raider = selectedFreightRaider(live, state, true);
  if (raider) {
    record.raiderLastPos = { x: raider.pos.x, z: raider.pos.z };
    record.raiderLastVel = { x: raider.vel && raider.vel.x || 0, z: raider.vel && raider.vel.z || 0 };
  }
  const raiderIneligible = record.raiderEscaped ? null : freightRaiderIneligibleReason(state, raider);
  if (raiderIneligible === 'destroyed' || raiderIneligible === 'identity_lost') record.raiderDead = true;
  if (raiderIneligible && record.raiderSecuredQty > 0 && !record.raiderEscaped) {
    respillFreightFromRaider(d, live, state, record, raider, `raider_${raiderIneligible}`);
    livePods = record.pods
      .filter((pod) => pod.status === 'live')
      .map((pod) => ({ pod, entity: podEntityForRecord(state, record, pod) }))
      .filter((entry) => entry.entity);
  }
  const operationalRaider = !raiderIneligible && !record.raiderEscaped && !record.raiderRecoveryClosed
    ? raider
    : null;

  if (livePods.length && operationalRaider) {
    const ai = operationalRaider.data.ai || (operationalRaider.data.ai = {});
    ai.passive = false;
    ai.motiveSatisfied = false;
    ai.pirateDisengaged = false;
    ai.predationStatus = 'cargo_recovery';
    livePods.sort((a, b) => {
      const ad = dist2(operationalRaider.pos.x, operationalRaider.pos.z, a.entity.pos.x, a.entity.pos.z);
      const bd = dist2(operationalRaider.pos.x, operationalRaider.pos.z, b.entity.pos.x, b.entity.pos.z);
      return ad - bd || a.pod.podIndex - b.pod.podIndex;
    });
    const nearest = livePods[0];
    const contactRange = Math.max(
      1,
      (Number(operationalRaider.radius) || 0) + (Number(nearest.entity.radius) || 0)
        - FREIGHT_RAIDER_CONTACT_PAD,
    );
    setEntityDoctrine(operationalRaider, {
      activity: {
        kind: ActivityKind.TRANSIT,
        reason: `${live.shapeId}:freight_pod_recovery`,
        anchor: nearest.entity.pos,
        leashRadius: Math.max(700, Number(live.plan.predation && live.plan.predation.leashRadius) || 2600),
        preferredRange: contactRange,
        startedTick: state.tick | 0,
        targetId: nearest.entity.id,
        encounterId: live.id,
      },
      roe: RulesOfEngagement.HOLD_FIRE,
    });
  }

  const remainingLivePods = record.pods.some((pod) => pod.status === 'live');
  if (!remainingLivePods && record.raiderSecuredQty > 0 && operationalRaider) {
    beginFreightRaiderEscape(d, live, state, record, operationalRaider);
    const escapeRadius = Math.max(1, Number(record.escapeRadius) || FREIGHT_RAIDER_ESCAPE_R);
    const escapedLeash = dist2(
      operationalRaider.pos.x,
      operationalRaider.pos.z,
      record.escapeOrigin.x,
      record.escapeOrigin.z,
    ) >= escapeRadius * escapeRadius;
    if (!record.raiderEscaped && escapedLeash) {
      record.raiderEscaped = true;
      releaseFreightCustodyPersistence(operationalRaider, record, record.raiderPersistenceOwned);
      record.raiderPersistenceOwned = false;
      operationalRaider.data.despawnAt = now + 0.5;
      d.emit('freight:raiderEscaped', {
        encounterId: live.id,
        custodyId: record.custodyId,
        raiderId: operationalRaider.id,
        qty: record.raiderSecuredQty,
        reason: 'leash',
        t: now,
      });
      if (record.carrierDead || record.carrierRecovered || record.carrierQty <= 0) {
        finishFreightCustody(d, live, record,
          record.playerCollectedQty > 0 || record.stationRecoveredQty > 0 ? 'split_custody' : 'raider_escaped');
      } else {
        publishFreightCustody(d, live, record, 'raider_escaped');
      }
      return;
    }
    if (!record.raiderEscaped && now >= record.escapeDeadlineAt) {
      respillFreightFromRaider(d, live, state, record, operationalRaider, 'raider_escape_stalled');
      return;
    }
  }

  if (!remainingLivePods && record.raiderSecuredQty === 0
    && (record.carrierDead || record.carrierRecovered || record.carrierAbandoned || record.carrierArrived)) {
    finishFreightCustody(d, live, record,
      record.playerCollectedQty > 0 ? 'player_recovered' : (record.carrierRecovered ? 'lawful_recovery' : 'lost'));
    return;
  }

  if (now >= record.deadlineAt && !record.spillWindowClosed) {
    if (record.raiderSecuredQty > 0 && !record.raiderEscaped) {
      respillFreightFromRaider(d, live, state, record, operationalRaider || raider, 'custody_timeout_respill');
    }
    for (const pod of record.pods) {
      if (pod.status !== 'live') continue;
      const entity = podEntityForRecord(state, record, pod);
      pod.status = 'lost';
      record.lostQty += pod.qty;
      if (entity) d.retireFreightPickup(entity, 'custody_timeout');
    }
    const carrier = selectedFreightCarrier(live, state, true);
    const carrierCannotContinue = record.carrierDead || record.carrierAbandoned
      || !carrier || carrier.alive === false || convoyTargetDisabled(state, carrier);
    if (carrierCannotContinue && record.carrierQty > 0) {
      record.lostQty += record.carrierQty;
      record.carrierQty = 0;
      record.carrierAbandoned = true;
      if (carrier) updateCarrierManifest(record, carrier);
    }
    record.spillWindowClosed = true;
    if (!carrierCannotContinue && record.carrierQty > 0) {
      publishFreightCustody(d, live, record, 'custody_window_closed', carrier);
      return;
    }
    finishFreightCustody(d, live, record,
      record.raiderSecuredQty > 0 ? 'raider_secured' : (record.playerCollectedQty > 0 ? 'partial_recovery' : 'timed_out'));
  }
}

function closeFreightCargoCustody(d, live, state, reason) {
  const record = live.data.freightCargoCustody;
  if (!record || record.terminal) return false;
  for (const pod of record.pods) {
    if (pod.status !== 'live') continue;
    const entity = podEntityForRecord(state, record, pod);
    pod.status = 'lost';
    record.lostQty += pod.qty;
    if (entity) d.retireFreightPickup(entity, reason);
  }
  if (record.carrierDead && record.carrierQty > 0) {
    record.lostQty += record.carrierQty;
    record.carrierQty = 0;
  }
  return finishFreightCustody(d, live, record, reason);
}

function restoreFreightCargoCustody(d, state, envelope) {
  if (!d || !state || !state.entities || !envelope || !envelope.live || !envelope.record) return null;
  const savedLive = envelope.live;
  const savedRecord = envelope.record;
  const shape = ENCOUNTERS[savedLive.shapeId];
  if (!shape || (savedLive.script !== 'convoy' && savedLive.script !== 'traderRun')) return null;
  const entities = Array.from(state.entities.values()).filter((entity) => entity && entity.alive !== false);
  const carrierMatches = entities.filter((entity) => {
    const data = entity.data || {};
    const manifest = data.cargoManifest;
    return entity.type === 'ship' && entity.team === 2
      && data.freightCustodyCarrierIdentityKey === savedRecord.carrierIdentityKey
      && manifest && manifest.manifestId === savedRecord.manifestId
      && manifest.freighterKey === savedRecord.freighterKey;
  });
  const carrierRequired = savedRecord.carrierQty > 0 && !savedRecord.carrierDead
    && !savedRecord.carrierRecovered && !savedRecord.carrierArrived && !savedRecord.carrierAbandoned;
  if (carrierMatches.length > 1 || (carrierRequired && carrierMatches.length !== 1)) return null;
  const carrier = carrierMatches[0] || null;

  const raiderMatches = entities.filter((entity) => (
    entity.type === 'ship'
    && entity.data && entity.data.freightCustodyRaiderIdentityKey === savedRecord.raiderIdentityKey
  ));
  const raiderRequired = savedRecord.raiderSecuredQty > 0 && !savedRecord.raiderEscaped;
  if (raiderMatches.length > 1 || (raiderRequired && raiderMatches.length !== 1)) return null;
  const raider = raiderMatches[0] || null;

  const podEntities = new Map();
  for (const pod of savedRecord.pods) {
    if (pod.status !== 'live') continue;
    const matches = entities.filter((entity) => {
      const annotation = entity.data && entity.data.freightCustodyPod;
      return entity.type === 'pickup' && annotation
        && annotation.podIdentity === pod.podIdentity
        && annotation.custodyId === savedRecord.custodyId
        && Math.floor(Number(annotation.qty) || 0) === pod.qty
        && Math.floor(Number(entity.data.amount) || 0) === pod.qty;
    });
    if (matches.length !== 1) return null;
    podEntities.set(pod.podIdentity, matches[0]);
  }

  const record = {
    ...savedRecord,
    pods: savedRecord.pods.map((pod) => ({ ...pod })),
    escapeOrigin: savedRecord.escapeOrigin ? { ...savedRecord.escapeOrigin } : null,
    escapeTarget: savedRecord.escapeTarget ? { ...savedRecord.escapeTarget } : null,
    raiderLastPos: savedRecord.raiderLastPos ? { ...savedRecord.raiderLastPos } : null,
    raiderLastVel: savedRecord.raiderLastVel ? { ...savedRecord.raiderLastVel } : null,
    terminal: false,
    receiptEmitted: false,
  };
  const plan = {
    encounterId: envelope.encounterId,
    squadId: savedLive.squadId,
    sectorId: savedLive.sectorId,
    zoneId: savedLive.zoneId,
    zoneName: savedLive.zoneName,
    factionId: savedLive.factionId,
    variantKind: savedLive.plan.variantKind,
    predation: { ...savedLive.plan.predation },
  };
  const aggregateManifest = savedLive.data.freightManifest
    ? {
        ...savedLive.data.freightManifest,
        lines: savedLive.data.freightManifest.lines.map((line) => ({ ...line })),
      }
    : {
        manifestId: record.manifestId,
        freighterKey: record.freighterKey,
        role: 'hauler',
        lines: [{ commodityId: record.commodityId, qty: record.initialQty }],
        totalQty: record.initialQty,
      };
  const live = {
    id: envelope.encounterId,
    shapeId: savedLive.shapeId,
    script: savedLive.script,
    shape,
    plan,
    tier: shape.tier,
    deck: shape.deck,
    sectorId: savedLive.sectorId,
    zoneId: savedLive.zoneId,
    zoneName: savedLive.zoneName,
    factionId: savedLive.factionId,
    squadId: savedLive.squadId,
    anchor: savedLive.anchor ? { ...savedLive.anchor } : null,
    zoneRadius: savedLive.zoneRadius,
    phase: savedLive.phase || 'transit',
    startedAt: savedLive.startedAt,
    deadlineAt: savedLive.deadlineAt,
    ids: [],
    roles: {},
    vars: { ...savedLive.vars },
    data: {
      ...savedLive.data,
      end: savedLive.data.end ? { ...savedLive.data.end } : null,
      freightManifest: aggregateManifest,
      freightCargoCustody: record,
      predationTargetId: carrier && carrier.id,
      predationTargetIdentityKey: record.carrierIdentityKey,
      predationRaiderId: raider && raider.id,
      predationRaiderIdentityKey: record.raiderIdentityKey,
    },
    outcome: null,
    primarySaid: true,
    lastBarkAt: -1e9,
  };
  live.causality = buildEncounterCausality({
    seed: state.meta && state.meta.seed,
    encounterId: live.id,
    shapeId: live.shapeId,
    variantKind: plan.variantKind,
    sectorId: live.sectorId,
    zoneId: live.zoneId,
    zoneName: live.zoneName,
    factionId: live.factionId,
    doctrineId: plan.predation.attackerDoctrineId,
    script: live.script,
  });

  if (carrier) {
    if (savedLive.data.ceresLivingChain === true && typeof d.preserveWorldActor === 'function') {
      d.preserveWorldActor(live, carrier);
    }
    const data = carrier.data || (carrier.data = {});
    const carrierAi = data.ai || (data.ai = {});
    if (savedLive.data.ceresLivingChain === true) {
      carrierAi.encounterId = live.id;
      carrierAi.encounterKind = live.shapeId;
      carrierAi.encounterRole = 'hauler';
      carrierAi.sectorId = live.sectorId;
      carrierAi.zoneId = live.zoneId;
      carrierAi.zoneName = live.zoneName;
      data.bountyCr = 0;
      data.loot = null;
      data.freightRewardOwner = 'manifest_custody';
    }
    data.predationEncounterId = live.id;
    data.predationRole = 'manifest_carrier';
    data.predationIdentityKey = record.carrierIdentityKey;
    data.freightCustodyCarrierIdentityKey = record.carrierIdentityKey;
    data.freightCustody = data.freightCustody || {};
    Object.assign(data.freightCustody, {
      status: record.carrierQty > 0 ? 'carrier' : (record.carrierArrived ? 'delivered' : 'spilled'),
      carrierId: carrier.id,
      carrierIdentityKey: record.carrierIdentityKey,
      encounterId: live.id,
      manifestId: record.manifestId,
    });
    Object.defineProperty(carrier, FREIGHT_CARRIER_INSTANCE, {
      value: record.carrierIdentityKey,
      configurable: true,
    });
    claimFreightCustodyPersistence(carrier, record, 'carrier');
    record.carrierId = carrier.id;
    updateCarrierManifest(record, carrier);
    live.ids.push(carrier.id);
    live.roles[carrier.id] = 'hauler';
  } else {
    record.carrierId = null;
  }

  if (raider) {
    const data = raider.data || (raider.data = {});
    const ai = data.ai || (data.ai = {});
    data.predationEncounterId = live.id;
    data.predationRole = 'raider';
    data.predationIdentityKey = record.raiderIdentityKey;
    data.freightCustodyRaiderIdentityKey = record.raiderIdentityKey;
    Object.defineProperty(raider, FREIGHT_RAIDER_INSTANCE, {
      value: record.raiderIdentityKey,
      configurable: true,
    });
    if (record.raiderSecuredQty > 0 && !record.raiderEscaped) {
      claimFreightCustodyPersistence(raider, record, 'secured_raider');
      ai.passive = false;
      ai.motiveSatisfied = false;
      ai.pirateDisengaged = false;
      ai.predationStatus = record.escapeStartedAt != null ? 'cargo_escape' : 'cargo_recovery';
      if (record.escapeStartedAt != null && record.escapeTarget) {
        const remainingS = Math.max(1, (record.escapeDeadlineAt || d.now() + 1) - d.now());
        setEntityDoctrine(raider, {
          activity: {
            kind: ActivityKind.FLEE,
            reason: `${live.shapeId}:freight_custody_escape`,
            anchor: record.escapeTarget,
            leashRadius: Math.max(1, record.escapeRadius) * 1.5,
            startedTick: state.tick | 0,
            deadlineTick: (state.tick | 0) + Math.ceil(remainingS * 60),
            encounterId: live.id,
          },
          roe: RulesOfEngagement.HOLD_FIRE,
        });
      }
    }
    record.raiderId = raider.id;
    record.raiderLastPos = { x: raider.pos.x, z: raider.pos.z };
    record.raiderLastVel = { x: raider.vel && raider.vel.x || 0, z: raider.vel && raider.vel.z || 0 };
    live.ids.push(raider.id);
    live.roles[raider.id] = 'raider';
  } else {
    record.raiderId = null;
  }

  for (const pod of record.pods) {
    if (pod.status !== 'live') continue;
    const entity = podEntities.get(pod.podIdentity);
    Object.defineProperty(entity, FREIGHT_POD_INSTANCE, { value: pod.podIdentity, configurable: true });
    entity.flags = entity.flags || {};
    entity.flags.persistent = true;
    Object.assign(entity.data.freightCustodyPod, {
      status: 'live',
      qty: pod.qty,
      legalOwnerStableId: record.legalOwnerStableId,
      custodySourceKind: pod.custodySourceKind,
      sourceCustodianStableId: pod.sourceCustodianStableId,
    });
    if (typeof d.resizeFreightPickup === 'function') d.resizeFreightPickup(entity, record.commodityId, pod.qty);
    pod.entityId = entity.id;
    live.ids.push(entity.id);
    live.roles[entity.id] = 'freight_pod';
  }

  const dir = state.encounterDirector;
  if (!dir || !dir.live || dir.live[live.id]) return null;
  dir.live[live.id] = live;
  if (typeof d.persistOpenFreightCustody === 'function') d.persistOpenFreightCustody(live, record);
  return live;
}

function convoyTick(d, live, state, now, isConvoy) {
  if (live.data.ceresLivingChain === true) {
    return tickCeresLivingChain(d, live, state, now);
  }
  const p = d.player();
  const haulers = d.entsOf(live, 'hauler');
  tickConvoyPredation(d, live, state, now);
  tickFreightCargoCustody(d, live, state, now);
  const custody = live.data.freightCargoCustody;
  if (live.data.freightCarrierRecovered === true) {
    if (custody && !custody.terminal) return;
    d.despawnAll(live, 6);
    return d.resolve(live, 'recovered', { vars: live.vars, speak: false });
  }
  if (custody && custody.terminal && custody.carrierAbandoned) {
    d.despawnAll(live, 8);
    return d.resolve(live, live.data.robbed ? 'robbed' : 'lost', {
      vars: live.vars,
      speak: live.data.noticed || live.data.robbed,
    });
  }
  if (custody && custody.terminal && custody.carrierArrived) {
    d.despawnAll(live, 8);
    return d.resolve(live, live.data.robbed ? 'robbed' : 'arrived', {
      vars: live.vars,
      speak: isConvoy ? true : live.data.noticed,
      channel: 'news',
    });
  }
  if (!haulers.length) {
    // All cargo dead: the initial manifest is retained even though its carriers are gone. Route
    // scarcity through the economy owner exactly once, then resolve as robbed/lost.
    const outcome = live.data.robbed ? 'robbed' : 'lost';
    if (custody) {
      if (!custody.terminal) return;
    } else {
      d.freightLoss(live, {
        manifest: live.data.freightManifest,
        stationId: live.data.destId,
        killerId: live.data.lossKillerId,
      });
    }
    d.despawnAll(live, 8);
    return d.resolve(live, outcome, { vars: live.vars, speak: live.data.noticed || live.data.robbed });
  }
  const end = live.data.end;
  if (!end) return;
  // Only route-owned passive hulls receive director intent. The selected raider is rostered and
  // tacticalAI remains the sole writer of its movement/fire decisions.
  for (const e of [...haulers, ...d.entsOf(live, 'escort')]) {
    if (!convoyTargetDisabled(state, e)) steerToward(e, end.x, end.z, 120);
  }
  if (p && !live.data.noticed) {
    for (const h of haulers) {
      if (dist2(p.pos.x, p.pos.z, h.pos.x, h.pos.z) <= CONVOY_NOTICE_R * CONVOY_NOTICE_R) { live.data.noticed = true; break; }
    }
  }
  const lead = haulers[0];
  const arrivedByPosition = dist2(lead.pos.x, lead.pos.z, end.x, end.z) <= CONVOY_ARRIVE_R * CONVOY_ARRIVE_R;
  if (!arrivedByPosition) return;

  if (custody && custody.carrierArrived) return;

  // Arrival: surviving cargo applies bounded supply pressure at the destination market.
  clearConvoyPredation(d, live, 'carrier_arrived');
  const arrivingQty = custody ? custody.carrierQty : haulers.length * (live.data.perHauler | 0);
  const units = Math.min(TRADE_PRESSURE_CAP, arrivingQty);
  if (live.data.destId && units > 0) d.tradePressure(live.data.destId, live.data.cargoId, units);
  if (custody && !custody.terminal) {
    custody.deliveredQty += custody.carrierQty;
    custody.carrierQty = 0;
    custody.carrierArrived = true;
    live.data.freightCarrierArrived = true;
    updateCarrierManifest(custody, lead);
    releaseFreightCustodyPersistence(lead, custody, custody.carrierPersistenceOwned);
    custody.carrierPersistenceOwned = false;
    lead.data = lead.data || {};
    lead.data.despawnAt = now + 6;
    publishFreightCustody(d, live, custody, 'carrier_arrived', lead);
    const livePodsRemain = custody.pods.some((pod) => pod.status === 'live');
    const raiderChoiceRemains = custody.raiderSecuredQty > 0 && !custody.raiderEscaped;
    if (livePodsRemain || raiderChoiceRemains) return;
    finishFreightCustody(d, live, custody, 'carrier_arrived');
  }
  d.despawnAll(live, 6);                                // docked — off the board
  if (isConvoy && live.data.guardKills > 0) {
    d.grant(live.shape.guardPay || 200, 'convoy:guard');
    d.rep('faction_mts', 5, 'convoy_guard');
    live.vars.pay = live.shape.guardPay || 200;
    return d.resolve(live, 'guarded', { vars: live.vars });
  }
  return d.resolve(live, 'arrived', {
    vars: live.vars,
    speak: isConvoy ? true : live.data.noticed,          // convoys make the ticker; lone haulers only if seen
    channel: 'news',
  });
}

function tickCeresLivingChain(d, live, state, now) {
  tickConvoyPredation(d, live, state, now);
  tickFreightCargoCustody(d, live, state, now);
  const custody = live.data.freightCargoCustody;
  if (custody?.terminal) {
    d.despawnAll(live, 8, 'raider');
    return d.resolve(live, custody.outcome || 'intervened', {
      vars: live.vars,
      channel: 'news',
      speak: true,
    });
  }

  const hauler = selectedFreightCarrier(live, state, true);
  if (!hauler || hauler.alive === false) {
    if (custody && !custody.terminal) return;
    d.despawnAll(live, 8, 'raider');
    return d.resolve(live, 'lost', { vars: live.vars, channel: 'news', speak: true });
  }

  // Traffic remains the movement and refinery-settlement owner. Its real sink clears the manifest;
  // that physical arrival, rather than director steering or a timer, closes the chain.
  if (!manifestStillInCarrierCustody(hauler) && !custody) {
    clearConvoyPredation(d, live, 'carrier_arrived');
    d.despawnAll(live, 8, 'raider');
    return d.resolve(live, live.data.guardKills > 0 ? 'guarded' : 'arrived', {
      vars: live.vars,
      channel: 'news',
      speak: true,
    });
  }
  if (now >= live.deadlineAt) {
    clearConvoyPredation(d, live, 'objective_timeout');
    d.despawnAll(live, 8, 'raider');
    return d.resolve(live, 'escaped', { vars: live.vars, speak: false });
  }
}

const convoy = {
  restoreCustody(d, state, envelope) { return restoreFreightCargoCustody(d, state, envelope); },
  adoptLivingChain(d, live, state, context) { return adoptCeresLivingChain(d, live, state, context); },
  fire(d, live, state) { convoyFire(d, live, state, true); },
  tick(d, live, state, now) { convoyTick(d, live, state, now, true); },
  event(d, live, state, name, p) {
    if (name === 'subsystemDisabled') {
      if (!p || p.subsystemId !== 'subsystem_drive') return;
      if (p.targetId === live.data.predationTargetId) {
        const carrier = selectedFreightCarrier(live, state);
        if (carrier) spawnFreightCargo(d, live, state, carrier, 'drive_disabled');
      } else {
        const record = live.data.freightCargoCustody;
        if (record && p.targetId === record.raiderId) {
          const raider = selectedFreightRaider(live, state, true);
          respillFreightFromRaider(d, live, state, record, raider, 'raider_drive_disabled');
        }
      }
      return;
    }
    if (name === 'pickupCollected') {
      collectFreightPod(d, live, state, p);
      return;
    }
    if (name === 'freightRecovered') {
      const record = live.data.freightCargoCustody;
      const manifestId = p && p.manifestId;
      const matches = manifestId && (manifestId === (record && record.manifestId)
        || manifestId === selectedFreightCarrier(live, state)?.data?.cargoManifest?.manifestId);
      if (!matches || p.entityId !== live.data.predationTargetId) return;
      live.data.freightCarrierRecovered = true;
      clearConvoyPredation(d, live, 'lawful_recovery');
      if (record && !record.terminal) {
        record.carrierRecovered = true;
        record.stationRecoveredQty += record.carrierQty;
        record.carrierQty = 0;
        publishFreightCustody(d, live, record, 'lawful_recovery');
        if (!record.pods.some((pod) => pod.status === 'live')
          && (record.raiderSecuredQty === 0 || record.raiderEscaped || record.raiderDead)) {
          finishFreightCustody(d, live, record,
            record.raiderSecuredQty > 0 || record.playerCollectedQty > 0 ? 'split_custody' : 'lawful_recovery');
        }
      }
      return;
    }
    if (name === 'freightRecoveryAbandoned') {
      const record = live.data.freightCargoCustody;
      if (!record || !p || p.manifestId !== record.manifestId) return;
      if (p.outcome === 'drive_restored') {
        record.driveRestored = true;
        publishFreightCustody(d, live, record, 'recovery_drive_restored');
        return;
      }
      if (p.outcome === 'destroyed') {
        // surrenderRecovery is registered before the director in production and therefore reports
        // abandonment before this same entity:killed reaches squadKill. Keep the carrier remainder
        // in carrier custody for that synchronous kill continuation to spill physically.
        record.carrierDestructionPending = true;
        publishFreightCustody(d, live, record, 'recovery_destroyed_pending_spill');
        return;
      }
      const carrier = selectedFreightCarrier(live, state, true);
      record.carrierAbandoned = true;
      if (record.carrierQty > 0) {
        record.lostQty += record.carrierQty;
        record.carrierQty = 0;
        if (carrier) updateCarrierManifest(record, carrier);
      }
      publishFreightCustody(d, live, record, `recovery_${p.outcome || 'abandoned'}`);
      if (!record.pods.some((pod) => pod.status === 'live')
        && (record.raiderSecuredQty === 0 || record.raiderEscaped || record.raiderDead)) {
        finishFreightCustody(d, live, record, 'recovery_abandoned');
      }
      return;
    }
    if (name === 'entityGone') {
      const record = live.data.freightCargoCustody;
      if (!record || record.terminal || !p) return;
      const pod = record.pods.find((candidate) => candidate.entityId === p.id && candidate.status === 'live');
      if (pod) {
        pod.status = 'lost';
        record.lostQty += pod.qty;
        publishFreightCustody(d, live, record, 'pod_destroyed');
      } else if (p.id === record.raiderId) {
        record.raiderDead = true;
        respillFreightFromRaider(d, live, state, record, selectedFreightRaider(live, state, true) || p,
          'raider_destroyed');
        publishFreightCustody(d, live, record, 'raider_destroyed');
      }
      return;
    }
    if (name === 'lifecycle') {
      const reason = p && p.reason || 'lifecycle';
      if (reason === 'save_restoring' || reason === 'save_loaded') return;
      closeFreightCargoCustody(d, live, state, reason);
      return;
    }
    if (name === 'squadKill') {
      const role = p && p.role;
      if (role === 'hauler') {
        if (p.id === live.data.predationTargetId) {
          const carrier = selectedFreightCarrier(live, state, true);
          if (carrier) {
            spawnFreightCargo(d, live, state, carrier, 'carrier_destroyed');
            const record = live.data.freightCargoCustody;
            if (record) record.carrierDestructionPending = false;
          }
        }
        if (p.id === live.data.predationTargetId) clearConvoyPredation(d, live, 'target_destroyed');
        if (p.byPlayer) {
          live.data.robbed = true;
          if (p.killerId != null) live.data.lossKillerId = p.killerId;
          d.setPassive(live, false, 'escort');          // escorts go weapons-free (lawful gate applies)
        } else if (!live.data.robbed && p && p.killerId != null) live.data.lossKillerId = p.killerId;
      }
      if (role === 'raider') {
        const record = live.data.freightCargoCustody;
        if (record && p.id === record.raiderId) {
          record.raiderDead = true;
          respillFreightFromRaider(d, live, state, record, selectedFreightRaider(live, state, true),
            'raider_destroyed');
          publishFreightCustody(d, live, record, 'raider_destroyed');
        }
        if (p.id === live.data.predationRaiderId) clearConvoyPredation(d, live, 'raider_destroyed');
        if (p.byPlayer) live.data.guardKills += 1;
      }
    }
    if (name === 'guardKill') live.data.guardKills += 1; // player killed an attacker near the convoy
  },
};

const traderRun = {
  fire(d, live, state) { convoyFire(d, live, state, false); },
  tick(d, live, state, now) { convoyTick(d, live, state, now, false); },
  event(d, live, state, name, p) { convoy.event(d, live, state, name, p); },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// F. PATROL BEAT — law walking its corridor. Ambient presence; resolves quietly.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const patrolBeat = {
  fire(d, live, state) {
    const ids = d.spawnShips(live, live.plan.ships);    // rostered, lawful, official doctrine
    if (!ids.length) return d.abort(live, 'no_budget');
    live.phase = 'window';
    live.deadlineAt = d.now() + (live.shape.beatS || 120);
    d.say(live, 'info', live.shape.bark || 'patrol_beat_hail', null, { primary: true });
  },
  tick(d, live, state, now) {
    if (d.aliveCount(live) === 0) return d.resolve(live, 'completed', { speak: false });
    if (now >= live.deadlineAt) {
      d.despawnAll(live, 20);
      return d.resolve(live, 'completed', { speak: false });
    }
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// G. SALVAGE SIGNAL — a faint transponder; rides the REAL salvage system (no parallel loop).
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const salvageSignal = {
  fire(d, live, state) {
    // Prefer pointing at a real, un-offered communicator the salvage system already placed.
    const pts = (state.salvage && state.salvage.points) || [];
    const target = pts.find((pt) => pt.sectorId === live.sectorId && pt.isCommunicator && !pt.offered);
    if (target) {
      live.data.pointId = target.id;
      live.anchor = { x: target.pos.x, z: target.pos.z };
    } else {
      // Every communicator is spent: drop one director-owned debris cache on the same entity
      // contract (salvagePool/salvageTimeLeft) so tether/beam/scanner all just work.
      const rng = d.stream(live, 'cache');
      const zc = live.anchor || { x: 0, z: 0 };
      const a = rng() * Math.PI * 2, r = 120 + rng() * 260;
      const ent = d.spawnWreck(live, {
        pos: { x: zc.x + Math.cos(a) * r, z: zc.z + Math.sin(a) * r },
        pool: { ...(live.shape.cachePool || { cmdty_scrap_metal: 3 }) },
        scanLabel: 'Salvage Cache',
      });
      if (!ent) return d.abort(live, 'no_spawn');
      live.data.cacheId = ent.id;
    }
    live.phase = 'window';
    live.deadlineAt = d.now() + (live.shape.windowS || 300);
    d.say(live, 'info', 'salvage_ping', null, { primary: true });
  },
  tick(d, live, state, now) {
    if (now >= live.deadlineAt) return d.resolve(live, 'faded', { speak: false });
  },
  event(d, live, state, name, p) {
    if (name === 'communicatorFound' && live.data.pointId && p && p.salvagePointId === live.data.pointId) {
      d.resolve(live, 'recovered');                     // mission:offered already emitted by salvage
    }
    if (name === 'cacheGone' && live.data.cacheId && p && p.id === live.data.cacheId) {
      d.resolve(live, 'stripped');
    }
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// H. ANOMALY WHISPER — CHN UNKNOWN says one strange thing, once. That's the whole event.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const whisper = {
  fire(d, live) {
    const rng = d.stream(live, 'line');
    const line = WHISPER_LINES[Math.floor(rng() * WHISPER_LINES.length) % WHISPER_LINES.length];
    d.say(live, 'info', line, null, { primary: true, literal: true, kind: 'anomaly' });
    d.resolve(live, 'spoken', { speak: false });
  },
  tick() {},
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// I. NAMED HUNTER — a persistent captain with a staged entrance, a grudge, and a permanent death.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const namedHunter = {
  fire(d, live, state) {
    const named = d.namedState();
    const rng = d.stream(live, 'captain');
    const authoredAce = live.data && aceById(live.data.aceId) || null;
    const culture = authoredAce && reachCultureDoctrineById(authoredAce.cultureId);
    const cultureProfile = culture && culture.factionPresenceDoctrine || null;
    let cap;
    if (authoredAce) {
      cap = {
        ...authoredAce,
        archetype: authoredAce.returnArchetype,
        combatDoctrineId: cultureProfile && cultureProfile.combatDoctrineId,
        levelBonus: 2,
        bountyCr: 500,
        escort: {
          archetypes: [authoredAce.escortArchetype],
          size: [1, 1],
          doctrine: 'scavenger',
          formation: cultureProfile ? cultureProfile.liveFormation : 'wedge',
        },
      };
    } else {
      const pool = NAMED_CAPTAINS.filter((c) => { const n = named[c.id]; return !n || n.alive !== false; });
      if (!pool.length) return d.abort(live, 'all_dead');
      cap = pool[Math.floor(rng() * pool.length) % pool.length];
    }
    const rec = named[cap.id] || (named[cap.id] = { alive: true, tier: 0, escapes: 0, kills: 0, lastSeenSector: null });
    const tier = rec.tier | 0;
    live.data.captainId = cap.id;
    if (culture) live.data.cultureId = culture.id;
    live.vars.name = cap.name;

    const p = d.player(); if (!p) return d.abort(live, 'no_player');
    const zc = live.anchor || p.pos;
    let dirX = zc.x - p.pos.x, dirZ = zc.z - p.pos.z;
    const dl = Math.hypot(dirX, dirZ);
    if (dl < 1) { const a = rng() * Math.PI * 2; dirX = Math.cos(a); dirZ = Math.sin(a); } else { dirX /= dl; dirZ /= dl; }
    const base = { x: p.pos.x + dirX * 1400, z: p.pos.z + dirZ * 1400 };

    const band = live.plan.levelBand || [3, 6];
    const ships = [{
      archetype: cap.archetype,
      combatDoctrineId: cap.combatDoctrineId,
      level: band[1] + (cap.levelBonus || 2),
      pos: base,
      factionId: live.factionId,
      context: 'encounter',
      doctrine: 'scavenger',
      formation: cultureProfile ? cultureProfile.liveFormation : 'wedge',
      factionPresenceDoctrine: cultureProfile,
      cultureId: culture && culture.id,
      namedAceId: authoredAce && authoredAce.id,
      role: 'boss',
      passive: true,                                    // the entrance: silhouette first, guns later
      bossName: cap.name,
      bountyCr: (cap.bountyCr || 400) + tier * 100,
    }];
    // Escalation is COMPOSITION: +1 escort per grudge tier, never +HP%.
    const esc = cap.escort || { archetypes: ['reaver_pirate'], size: [1, 1] };
    const escCount = Math.min(4, (esc.size ? esc.size[0] : 1) + tier);
    for (let i = 0; i < escCount; i++) {
      ships.push({
        archetype: esc.archetypes[Math.floor(rng() * esc.archetypes.length) % esc.archetypes.length],
        level: Math.round(band[0] + (band[1] - band[0]) * (0.5 + rng() * 0.5)),
        pos: { x: base.x + (rng() - 0.5) * 260, z: base.z + (rng() - 0.5) * 260 },
        factionId: live.factionId,
        context: 'encounter',
        doctrine: esc.doctrine || 'scavenger',
        formation: esc.formation || 'wedge',
        factionPresenceDoctrine: cultureProfile,
        cultureId: culture && culture.id,
        namedAceId: authoredAce && authoredAce.id,
        role: 'escort',
        passive: true,
      });
    }
    const ids = d.spawnShips(live, ships);
    if (!ids.length) return d.abort(live, 'no_budget');
    live.phase = 'offer';
    live.data.engageAt = d.now() + (live.shape.entranceS || 8);
    live.data.engaged = false;
    live.deadlineAt = d.now() + 300;
    if (authoredAce) {
      d.say(
        live,
        'alert',
        culture
          ? `${cap.name}, ${culture.label}: This lane answers to ${cap.crew}.`
          : (cap.signatureBark || `${cap.name}: this lane has your name on it.`),
        live.vars,
        { primary: true, literal: true },
      );
      d.emit('namedAce:appeared', {
        aceId: authoredAce.id,
        aceName: authoredAce.name,
        cultureId: culture && culture.id,
        encounterId: live.id,
        sectorId: live.sectorId,
        zoneId: live.zoneId,
        spawnedIds: ids.slice(),
        signatureSpoken: true,
        t: d.now(),
      });
    } else {
      d.say(live, 'alert', cap.bark || 'miniboss_taunt', live.vars, { primary: true });
    }
  },

  tick(d, live, state, now) {
    const p = d.player(); if (!p) return namedHunter._depart(d, live, false);
    if (live.phase === 'offer' && now >= live.data.engageAt) {
      d.setPassive(live, false);
      live.phase = 'conflict';
      live.data.engaged = true;
    }
    if (live.phase === 'conflict') {
      const boss = d.entsOf(live, 'boss')[0];
      if (!boss || boss.alive === false) return;        // kill event will resolve
      if (d.minDist2ToSquad(live, p) >= ESCAPE_R * ESCAPE_R * 2) return namedHunter._depart(d, live, true);
    }
    if (now >= live.deadlineAt) return namedHunter._depart(d, live, live.data.engaged);
  },

  event(d, live, state, name, p) {
    if (name === 'squadKill' && p && p.role === 'boss') {
      const named = d.namedState();
      const rec = named[live.data.captainId];
      if (rec) { rec.alive = false; rec.lastSeenSector = live.sectorId; }
      d.dangerImpulse(live, 'hunter_down', -0.03);
      d.despawnAll(live, 20, 'escort');                 // the wing scatters without its captain
      d.resolve(live, 'killed', { vars: live.vars });
    }
  },

  // The captain leaves alive. If the player actually engaged, the grudge deepens.
  _depart(d, live, engaged) {
    const named = d.namedState();
    const rec = named[live.data.captainId];
    if (rec && rec.alive !== false) {
      rec.lastSeenSector = live.sectorId;
      if (engaged) { rec.escapes = (rec.escapes | 0) + 1; rec.tier = Math.min(3, (rec.tier | 0) + 1); }
    }
    d.despawnAll(live, 12);
    d.resolve(live, engaged ? 'escaped' : 'unmet', { vars: live.vars, speak: !!engaged });
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// J. BOUNTY HUNTER — only exists while state.player.bounty stands. Consequence made flesh.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const bountyHunter = {
  fire(d, live, state) {
    const p = d.player(); if (!p) return d.abort(live, 'no_player');
    const rng = d.stream(live, 'pos');
    const a = rng() * Math.PI * 2;
    const ships = live.plan.ships.map((sh, i) => ({
      ...sh,
      pos: { x: p.pos.x + Math.cos(a) * 1000 + (rng() - 0.5) * 200, z: p.pos.z + Math.sin(a) * 1000 + (rng() - 0.5) * 200 },
    }));
    const ids = d.spawnShips(live, ships);
    if (!ids.length) return d.abort(live, 'no_budget');
    live.phase = 'conflict';
    live.deadlineAt = d.now() + 240;
    d.say(live, 'alert', 'bounty_notice', null, { primary: true });
  },
  tick(d, live, state, now) {
    const p = d.player(); if (!p) return d.abort(live, 'no_player');
    if (d.aliveCount(live) === 0) return d.resolve(live, 'cleared');
    if (d.minDist2ToSquad(live, p) >= ESCAPE_R * ESCAPE_R || now >= live.deadlineAt) {
      d.despawnAll(live, 15);
      return d.resolve(live, 'escaped');
    }
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// K. CLAIM THREAT — scavengers ping a claim you own here. Defend it or let them nose around.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const claimThreat = {
  fire(d, live, state) {
    const body = (state.claims && state.claims.bodies || []).find((entry) => (
      entry && entry.id === (live.data && live.data.claimId) && entry.sectorId === live.sectorId
    ));
    if (!body) return d.abort(live, 'no_claim');
    const rng = d.stream(live, 'claim');
    live.anchor = { x: body.x || 0, z: body.z || 0 };
    const ships = live.plan.ships.map((sh) => ({
      ...sh,
      passive: true,
      pos: sh.pos || { x: live.anchor.x + (rng() - 0.5) * 900, z: live.anchor.z + (rng() - 0.5) * 900 },
    }));
    const ids = d.spawnShips(live, ships);
    if (!ids.length) return d.abort(live, 'no_budget');
    live.phase = 'staging';
    live.data.initialCount = ids.length;
    live.data.telegraphEndsAt = d.now() + CLAIM_TELEGRAPH_S;
    live.data.awaySince = null;
    live.deadlineAt = d.now() + 180;
    d.say(live, 'alert', 'claim_defense_arrival', {
      claim: body.name || 'your claim',
      count: ids.length,
    }, { primary: true });
  },
  tick(d, live, state, now) {
    const p = d.player();
    if (!p) {
      if (live.data.missingPlayerSince == null) live.data.missingPlayerSince = now;
      if (now - live.data.missingPlayerSince >= 10) return d.abort(live, 'no_player');
      return;
    }
    live.data.missingPlayerSince = null;
    if (p.alive === false) return d.resolve(live, 'destroyed');
    if (live.phase === 'staging') {
      if (now < live.data.telegraphEndsAt) return;
      d.setPassive(live, false);
      live.phase = 'conflict';
      return;
    }
    const alive = d.aliveCount(live);
    if (alive === 0) return d.resolve(live, 'defended');
    const killed = Math.max(0, (live.data.initialCount || live.ids.length) - alive);
    const dx = p.pos.x - live.anchor.x;
    const dz = p.pos.z - live.anchor.z;
    if (dx * dx + dz * dz > CLAIM_RETREAT_R * CLAIM_RETREAT_R) {
      if (live.data.awaySince == null) live.data.awaySince = now;
      if (now - live.data.awaySince >= CLAIM_RETREAT_HOLD_S) {
        d.despawnAll(live, 12);
        return d.resolve(live, 'retreated');
      }
    } else {
      live.data.awaySince = null;
    }
    if (now >= live.deadlineAt) {
      d.despawnAll(live, 12);
      return d.resolve(live, killed > 0 ? 'partial' : 'timeout');
    }
  },
};

/** Script registry, keyed by the `script` field on encounter shapes. */
export const ENCOUNTER_SCRIPTS = Object.freeze({
  toll,
  patrolScan,
  ambush,
  distress,
  convoy,
  traderRun,
  patrolBeat,
  salvageSignal,
  whisper,
  namedHunter,
  bountyHunter,
  claimThreat,
  uniqueWreckHeldMass,
  uniqueWreckPingElite,
  uniqueWreckSilverDraftCleaner,
  uniqueWreckCassandraHardliners,
  uniqueWreckNestbreakerAdmirers,
});
