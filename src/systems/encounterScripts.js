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

import { NAMED_CAPTAINS, CONVOY_CARGO, WHISPER_LINES, FACTION_LABELS, tollAmountFor, barkText } from '../data/encounters.js';
import { REACH_CULTURE_ACES } from '../data/namedAces.js';
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
const DIST_TELL_R = 1500;         // scan-pulse inside this of a distress site reads the signal
const CLAIM_TELEGRAPH_S = 3;      // arrival breath: read formation/motive before weapons open
const CLAIM_RETREAT_R = 2400;     // leaving the defended site is a deliberate retreat
const CLAIM_RETREAT_HOLD_S = 12;  // brief overshoots do not forfeit the defense

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

  const ships = live.plan.ships.map((sh, i) => {
    const out = { ...sh, passive: true };
    if (sh.role !== 'escort') {
      out.team = 2;                                     // true civilians; killing them is piracy (heat)
      out.scanLabel = `Hauler — ${cargo.label}`;
      out.pos = { x: start.x + (rng() - 0.5) * 120 - i * 40, z: start.z + (rng() - 0.5) * 120 };
    } else {
      out.pos = { x: start.x + (rng() - 0.5) * 200, z: start.z + (rng() - 0.5) * 200 };
    }
    return out;
  });
  const ids = d.spawnShips(live, ships);
  if (!ids.length) return d.abort(live, 'no_budget');

  live.phase = 'transit';
  live.deadlineAt = d.now() + (live.shape.transitS || 200);
  live.data.end = end;
  live.data.destId = dest ? dest.id : null;
  live.data.destName = dest ? (dest.name || 'the exchange') : 'the far lane';
  live.data.cargoId = cargo.commodityId;
  live.data.perHauler = perHauler;
  live.data.robbed = false;
  live.data.guardKills = 0;
  live.data.noticed = false;
  live.vars.cargo = cargo.label;
  live.vars.dest = live.data.destName;
  live.vars.faction = FACTION_LABELS[live.factionId] || 'Meridian';
  d.say(live, isConvoy ? 'news' : 'info', live.shape.bark, live.vars, { primary: true });
}

function convoyTick(d, live, state, now, isConvoy) {
  const p = d.player();
  const haulers = d.entsOf(live, 'hauler');
  if (!haulers.length) {
    // All cargo dead: robbed if the player did it, lost either way. No delivery, no pressure.
    const outcome = live.data.robbed ? 'robbed' : 'lost';
    d.despawnAll(live, 8);
    return d.resolve(live, outcome, { vars: live.vars, speak: live.data.noticed || live.data.robbed });
  }
  const end = live.data.end;
  for (const e of d.entsOf(live)) steerToward(e, end.x, end.z, 120);  // passive ships fly the route
  if (p && !live.data.noticed) {
    for (const h of haulers) {
      if (dist2(p.pos.x, p.pos.z, h.pos.x, h.pos.z) <= CONVOY_NOTICE_R * CONVOY_NOTICE_R) { live.data.noticed = true; break; }
    }
  }
  const lead = haulers[0];
  const arrived = dist2(lead.pos.x, lead.pos.z, end.x, end.z) <= CONVOY_ARRIVE_R * CONVOY_ARRIVE_R || now >= live.deadlineAt;
  if (!arrived) return;

  // Arrival: surviving cargo applies bounded supply pressure at the destination market.
  const units = Math.min(TRADE_PRESSURE_CAP, haulers.length * (live.data.perHauler | 0));
  if (live.data.destId && units > 0) d.tradePressure(live.data.destId, live.data.cargoId, units);
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

const convoy = {
  fire(d, live, state) { convoyFire(d, live, state, true); },
  tick(d, live, state, now) { convoyTick(d, live, state, now, true); },
  event(d, live, state, name, p) {
    if (name === 'squadKill') {
      const role = p && p.role;
      if (role !== 'escort' && p.byPlayer) {
        live.data.robbed = true;
        d.setPassive(live, false, 'escort');            // escorts go weapons-free (lawful gate applies)
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
    d.say(live, 'info', 'patrol_beat_hail', null, { primary: true });
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
    const cultureAce = live.data && REACH_CULTURE_ACES[live.data.aceId] || null;
    const culture = cultureAce && reachCultureDoctrineById(cultureAce.cultureId);
    const cultureProfile = culture && culture.factionPresenceDoctrine || null;
    let cap;
    if (cultureAce && cultureProfile) {
      cap = {
        ...cultureAce,
        archetype: cultureAce.returnArchetype,
        combatDoctrineId: cultureProfile.combatDoctrineId,
        levelBonus: 2,
        bountyCr: 500,
        escort: {
          archetypes: [cultureAce.escortArchetype],
          size: [1, 1],
          doctrine: 'scavenger',
          formation: cultureProfile.liveFormation,
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
      namedAceId: cultureAce && cultureAce.id,
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
        namedAceId: cultureAce && cultureAce.id,
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
    if (cultureAce && culture) {
      d.say(
        live,
        'alert',
        `${cap.name}, ${culture.label}: This lane answers to ${cap.crew}.`,
        live.vars,
        { primary: true, literal: true },
      );
      d.emit('namedAce:appeared', {
        aceId: cultureAce.id,
        aceName: cultureAce.name,
        cultureId: culture.id,
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
