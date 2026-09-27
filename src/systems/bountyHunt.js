// BP-13/B16 Bounty Hunter Neutrality.
//
// Keeps contract hunters scanner-neutral while they chase an NPC quarry, then flips the same hunter
// hostile only when contractTargetId is the player. No scanner/combat/director edits.
import {
  BOUNTY_HUNTER_NEUTRAL_CONTEXT,
  BOUNTY_HUNTER_PLAYER_CONTEXT,
  QUARRY_TUNING as QT,
  makeBountyHunterSpec,
  makeBountyQuarrySpec,
  quarryHash01,
  quarryManifestForContract,
  quarryNameForContract,
} from '../data/bountyHunters.js';
import {
  hunterTrickById,
  hunterTrickForContract,
} from '../data/hunterTricks.js';
import { mineLayerWakePoint } from '../ai/mineLayerVerb.js';
import { chaffDecoyPoint } from './countermeasures.js';
import { entityIndexVersion, indexedShipLikeScan } from '../world/livingWorldViews.js';

/** Bench A/B: production default ON. Quiet latch skips bountyHunt shipLike census
 * when no live bounty hunters remain. Soft-GPU fps not claimed. Fresh law/wanted-
 * adjacent residual after #148 salvage (not salvage/sanctuary/cones/catch-nets). */
let BOUNTY_HUNT_EMPTY_QUIET_LATCH = true;
export function setBountyHuntEmptyQuietLatchForBench(enabled) {
  BOUNTY_HUNT_EMPTY_QUIET_LATCH = enabled !== false;
}
export function getBountyHuntEmptyQuietLatchForBench() {
  return BOUNTY_HUNT_EMPTY_QUIET_LATCH !== false;
}

/** Membership rescan while latched (0.5 s @ 60 Hz). */
const BOUNTY_HUNT_EMPTY_QUIET_RESCAN_TICKS = 30;

function publishBountyHuntQuiet(state, latched) {
  if (!state) return;
  const rt = state.bountyHuntRuntime || (state.bountyHuntRuntime = {});
  rt.emptyQuietLatched = !!latched;
}


export {
  BOUNTY_HUNTER_NEUTRAL_CONTEXT,
  makeBountyHunterSpec,
  makeBountyQuarrySpec,
} from '../data/bountyHunters.js';
export {
  HUNTER_TRICKS,
  HUNTER_TRICK_IDS,
  hunterTrickById,
  hunterTrickForContract,
} from '../data/hunterTricks.js';

const STATE_VERSION = 1;

export const bountyHunt = {
  name: 'bountyHunt',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._subs = [];
    this._huntersQuiet = null;
    this._hunterWakeSeq = 0;
    ensureState(this.state);
    this._listen('entity:killed', (p) => this._onEntityKilled(p));
    this._listen('entity:spawned', (p) => this._onEntitySpawned(p));
    this._listen('combat:damage', (p) => this._onDamage(p));
  },

  /** External wake when a hunter role is stamped without a fresh spawn index bump. */
  noteHunterWake() {
    this._hunterWakeSeq = (this._hunterWakeSeq | 0) + 1;
    this._huntersQuiet = null;
  },

  _onEntitySpawned(payload) {
    const entity = payload && payload.entity;
    if (!isBountyHunter(entity)) return;
    this.noteHunterWake();
  },

  // Shooting the victim voids their gratitude. The save still records, but the
  // quarry limps clear without paying the hand that also shot them.
  // INF-U15: shooting the HUNTER is the opposite — harrying damage accrues as an
  // assist, and a quarry that escapes a harried hunter pays for the help.
  _onDamage(payload) {
    const state = this.state;
    if (!payload || !state || payload.attackerId !== state.playerId) return;
    const targetId = payload.targetId ?? payload.id ?? payload.victimId;
    if (targetId == null) return;
    const target = state.entities && state.entities.get ? state.entities.get(targetId) : null;
    if (!target || target.alive === false) return;
    if (isBountyHunter(target)) {
      const hh = target.data.bountyHunt || (target.data.bountyHunt = { role: 'hunter' });
      const contractId = hh.contractId || target.data.contractId || null;
      if (hh.assistContractId !== contractId) {
        hh.assistContractId = contractId;
        hh.playerAssistDmg = 0;
      }
      const applied = Number(payload.applied);
      const amount = Number(payload.amount);
      const dmg = (Number.isFinite(applied) && applied > 0 ? applied : 0)
        || (Number.isFinite(amount) && amount > 0 ? amount : 0);
      if (dmg > 0) hh.playerAssistDmg = (hh.playerAssistDmg || 0) + dmg;
      return;
    }
    if (!isBountyQuarry(target)) return;
    const hunt = target.data.bountyHunt || (target.data.bountyHunt = { role: 'quarry' });
    if (hunt.done || hunt.gratitudeVoid === true) return;
    hunt.gratitudeVoid = true;
    emit(this.bus, 'toast', {
      text: `${hunt.name || 'The quarry'} saw that — friendly fire voids any gratitude.`,
      kind: 'warn', ttl: 4,
    });
  },

  newGame() {
    if (this.state) this.state.bountyHunt = freshState();
    this._huntersQuiet = null;
    this._hunterWakeSeq = 0;
    publishBountyHuntQuiet(this.state, false);
  },

  update(_dt, state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    this.state = state;
    ensureState(state);
    // Staged chases run BEFORE the quiet latch: an empty sky is exactly when a
    // chase may stage, and the spawn bumps membership so the latch re-arms after.
    this._stageChase(state);
    // Quiet open flight: no live bounty hunters still paid a full shipLike
    // census (isBountyHunter / normalize / trick) every tick. Latch when the
    // census stays empty; wake on membership, hunter spawn/tag, or 0.5 s rescan.
    // Soft-GPU fps not claimed. Fresh bounty residual after #148 salvage.
    if (BOUNTY_HUNT_EMPTY_QUIET_LATCH !== false) {
      const membership = entityIndexVersion(state);
      const tick = state.tick | 0;
      const wakeSeq = this._hunterWakeSeq | 0;
      const quiet = this._huntersQuiet;
      if (quiet
        && membership != null
        && quiet.membership === membership
        && quiet.wakeSeq === wakeSeq
        && ((tick - (quiet.armedTick | 0)) < BOUNTY_HUNT_EMPTY_QUIET_RESCAN_TICKS)) {
        publishBountyHuntQuiet(state, true);
        return;
      }
    } else if (this._huntersQuiet) {
      this._huntersQuiet = null;
      publishBountyHuntQuiet(state, false);
    }

    let anyHunter = false;
    const hunterByTarget = new Map();
    const quarries = [];
    for (const entity of indexedShipLikeScan(state)) {
      if (isBountyHunter(entity)) {
        anyHunter = true;
        normalizeHunter(entity, state);
        tickHunterTrick(entity, state, this);
        const targetId = entity.data && entity.data.contractTargetId;
        if (targetId != null && !hunterByTarget.has(targetId)) hunterByTarget.set(targetId, entity);
      } else if (isBountyQuarry(entity)) {
        quarries.push(entity);
      }
    }
    let anyQuarryActive = false;
    for (const quarry of quarries) {
      if (this._tickQuarry(state, quarry, hunterByTarget)) anyQuarryActive = true;
    }
    if (BOUNTY_HUNT_EMPTY_QUIET_LATCH !== false) {
      if (!anyHunter && !anyQuarryActive) {
        const membership = entityIndexVersion(state);
        if (membership != null) {
          this._huntersQuiet = {
            membership,
            wakeSeq: this._hunterWakeSeq | 0,
            armedTick: state.tick | 0,
          };
          publishBountyHuntQuiet(state, true);
        }
      } else {
        this._huntersQuiet = null;
        publishBountyHuntQuiet(state, false);
      }
    }
  },

  // Stage one hunter-vs-quarry chase crossing the player's view. Free flight only:
  // curated scenarios (47a goldens, authored scenes) never stage — the salvor gate.
  // One staged pair at a time, seeded geometry, no shared-rng draws.
  _stageChase(state) {
    const own = ensureState(state);
    const now = finite(state && state.simTime, 0);
    if (own.nextStageAt == null) own.nextStageAt = now + QT.firstStageDelayS;
    if (now < own.nextStageAt) return;
    if (own.activeStaged && now - own.activeStaged.stagedAt < QT.contractTimeoutS) {
      own.nextStageAt = now + QT.contractTimeoutS;
      return;
    }
    own.activeStaged = null;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') {
      own.nextStageAt = now + QT.stageCooldownMinS;
      return;
    }
    if (isScenarioGated(state)) {
      own.nextStageAt = now + QT.stageCooldownMinS;
      return;
    }
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || player.alive === false || !player.pos) {
      own.nextStageAt = now + QT.stageCooldownMinS;
      return;
    }
    const ships = (state.entityIndex && state.entityIndex.ships) || state.entityList || [];
    if (ships.length >= QT.stageShipCap) {
      own.nextStageAt = now + QT.stageCooldownMinS;
      return;
    }
    const seed = (state.meta && state.meta.seed) || 1;
    const serial = (own.stageSerial | 0) + 1;
    own.stageSerial = serial;
    const contractId = `bounty:staged:${serial}`;
    const ang = quarryHash01(seed, contractId, 'stage-angle') * Math.PI * 2;
    const qx = player.pos.x + Math.cos(ang) * QT.stageRange;
    const qz = player.pos.z + Math.sin(ang) * QT.stageRange;
    // The pair crosses the view: the quarry runs on the tangent, the hunter trails it.
    const fx = -Math.sin(ang), fz = Math.cos(ang);
    const quarrySpec = makeBountyQuarrySpec({ contractId, pos: { x: qx, z: qz } });
    const hunterSpec = makeBountyHunterSpec({
      contractId,
      pos: { x: qx - fx * QT.stageTrailGap, z: qz - fz * QT.stageTrailGap },
    });
    const quarry = spawnEntity({
      ...quarrySpec,
      vel: { x: fx * 60, z: fz * 60 },
      data: { ...quarrySpec.data, name: quarryNameForContract(contractId, seed) },
    });
    const hunter = spawnEntity({
      ...hunterSpec,
      vel: { x: fx * 70, z: fz * 70 },
      data: {
        ...hunterSpec.data,
        contractTargetId: quarry && quarry.id != null ? quarry.id : null,
      },
    });
    if (!quarry || !hunter || quarry.id == null || hunter.id == null) {
      own.nextStageAt = now + QT.stageCooldownMinS;
      return;
    }
    hunter.data.contractTargetId = quarry.id;
    hunter.data.bountyHunt.targetId = quarry.id;
    own.activeStaged = { contractId, stagedAt: now };
    own.nextStageAt = now + QT.stageCooldownMinS
      + quarryHash01(seed, contractId, 'stage-gap') * QT.stageCooldownSpanS;
    this.noteHunterWake();
    emit(this.bus, 'bountyHunt:staged', {
      contractId, quarryId: quarry.id, hunterId: hunter.id,
      name: quarry.data && quarry.data.name, at: now,
    });
  },

  // One quarry tick. Returns true while the chase is still live (latch input).
  _tickQuarry(state, quarry, hunterByTarget) {
    const data = quarry.data || (quarry.data = {});
    const hunt = data.bountyHunt || (data.bountyHunt = { role: 'quarry' });
    if (hunt.done) return false;
    const contractId = hunt.contractId || data.contractId || `bounty:${quarry.id}`;
    hunt.contractId = contractId;
    const seed = (state.meta && state.meta.seed) || 1;
    if (!hunt.name) hunt.name = data.name || quarryNameForContract(contractId, seed);
    const hunter = liveHunterFor(state, hunterByTarget.get(quarry.id));
    if (!hunter) {
      standDownQuarry(quarry);
      return false;
    }
    const now = finite(state && state.simTime, 0);
    const refuge = nearestRefugeStation(state, quarry.pos, QT.refugeScan);
    if (refuge && refuge.pos && distance2(quarry.pos, refuge.pos) < QT.refugeRange * QT.refugeRange) {
      escapeQuarryToRefuge(state, this.bus, quarry, hunter, refuge, contractId, now, this.helpers);
      return false;
    }
    if (!hunt.surrendered && Number.isFinite(quarry.hull) && quarry.hullMax > 0
      && (quarry.hull / quarry.hullMax) < QT.surrenderHullFrac) {
      surrenderQuarry(state, this.helpers, this.bus, quarry, hunter, contractId, now);
    }
    if (!hunt.surrendered) steerQuarryFromHunter(quarry, hunter, refuge);
    const hunterDist = Math.hypot(hunter.pos.x - quarry.pos.x, hunter.pos.z - quarry.pos.z);
    if (!hunt.squawked && hunterDist < QT.distressRange) {
      hunt.squawked = true;
      const text = `${hunt.name} squawks distress — a contract hunter is running them down!`;
      sayQuarry(this.helpers, quarry, text, 'bounty_quarry_distress');
      emit(this.bus, 'toast', { text: 'DISTRESS: ' + text, kind: 'warn', ttl: 5 });
      emit(this.bus, 'bountyHunt:quarryDistress', {
        contractId, quarryId: quarry.id, hunterId: hunter.id, at: now,
      });
    }
    if (!hunt.dumped && hunterDist < QT.dumpRange) {
      hunt.dumped = true;
      dumpQuarryManifest(state, this.helpers, this.bus, quarry, contractId, seed, now);
    }
    return true;
  },

  destroy() {
    for (const off of this._subs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._subs = [];
  },

  _listen(evt, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(evt, fn);
    if (typeof off === 'function') this._subs.push(off);
  },

  _onEntityKilled(payload) {
    if (!payload || payload.id == null || !this.state) return;
    const state = this.state;
    const killed = state.entities && state.entities.get && state.entities.get(payload.id);
    const killedRole = killed && killed.data && killed.data.bountyHunt && killed.data.bountyHunt.role;
    const byPlayer = payload.killerId === state.playerId;

    if (killedRole === 'hunter') {
      recordOutcome(state, this.bus, killed.data.bountyHunt.contractId, byPlayer ? 'player_defended_quarry' : 'hunter_killed', payload);
      settleHunterDown(state, this.bus, killed, byPlayer);
      return;
    }

    const contractId = contractIdForQuarryKill(state, payload.id);
    if (contractId) {
      settleQuarryDown(state, this.bus, killed, contractId, payload.id, byPlayer);
    }
  },
};

export function bountyHunterOutcomeForContract(state, contractId) {
  const own = state && state.bountyHunt;
  const rec = own && own.outcomes && own.outcomes[contractId];
  return rec ? clonePlain(rec) : null;
}

export function bountyHunterTrickStateFor(state, hunterId) {
  const entity = state && state.entities && state.entities.get && state.entities.get(hunterId);
  const rt = entity && entity.data && entity.data.bountyHunt && entity.data.bountyHunt.trickState;
  return rt ? clonePlain(rt) : null;
}

function normalizeHunter(entity, state) {
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  const hunt = data.bountyHunt || (data.bountyHunt = { role: 'hunter' });
  const playerId = state.playerId;
  const targetId = data.contractTargetId;
  const targetsPlayer = targetId != null && targetId === playerId;
  ensureHunterTrick(entity, state);

  hunt.role = 'hunter';
  hunt.contractId = hunt.contractId || data.contractId || `bounty:${entity.id}`;
  hunt.targetId = targetId;
  hunt.pursuing = false;

  ai.passive = false;
  ai.archetype = ai.archetype || 'hunter';
  if (targetsPlayer) {
    ai.spawnContext = BOUNTY_HUNTER_PLAYER_CONTEXT;
    ai.forcePlayerTarget = true;
    ai.hostileTeams = [0];
    hunt.pursuing = true;
    data.intent = { ...(data.intent || {}), targetId: playerId, mode: 'bounty_player' };
    return;
  }

  ai.spawnContext = BOUNTY_HUNTER_NEUTRAL_CONTEXT;
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  ai.hostileTeams = [];
  const quarry = targetId != null && state.entities && state.entities.get && state.entities.get(targetId);
  if (quarry && quarry.alive !== false) {
    hunt.pursuing = true;
    data.intent = { ...(data.intent || {}), targetId: quarry.id, mode: 'bounty_quarry' };
  }
}

function ensureHunterTrick(entity, state) {
  const data = entity.data || (entity.data = {});
  const hunt = data.bountyHunt || (data.bountyHunt = { role: 'hunter' });
  const contractId = hunt.contractId || data.contractId || `bounty:${entity.id}`;
  const explicit = hunt.trickId || data.hunterTrick || data.trick || null;
  const seed = state && state.meta && state.meta.seed || 1;
  const trick = hunterTrickById(explicit) || hunterTrickForContract(contractId, seed);
  hunt.trickId = trick.id;
  if (!hunt.trickState || hunt.trickState.trickId !== trick.id) {
    hunt.trickState = {
      trickId: trick.id,
      phase: 'idle',
      counterWindowS: trick.counterWindowS,
      telegraphedAt: null,
      activatesAt: null,
      activatedAt: null,
      readyAt: 0,
      activationCount: 0,
      lastVerb: null,
    };
  }
  return { trick, rt: hunt.trickState };
}

function tickHunterTrick(entity, state, host) {
  const data = entity.data || {};
  const hunt = data.bountyHunt;
  if (!hunt || hunt.role !== 'hunter' || !hunt.pursuing) return;
  const { trick, rt } = ensureHunterTrick(entity, state);
  const now = finite(state && state.simTime, 0);

  // A wake-mine trail keeps seeding after activation, on the mine-layer cadence.
  if ((rt.mineDropsLeft || 0) > 0 && now + 1e-6 >= finite(rt.nextMineAt, now)) {
    if (dropTrickMine(entity, host)) rt.mineDropsLeft -= 1;
    rt.nextMineAt = now + finite(rt.mineCadenceS, 0.7);
  }

  if (rt.phase === 'cooldown' && now >= finite(rt.readyAt, 0)) {
    rt.phase = 'idle';
  }

  if (rt.phase === 'telegraphing') {
    if (now + 1e-6 < finite(rt.activatesAt, now)) return;
    if (trick.interruptsOnDamage && telegraphInterrupted(entity, rt)) {
      fizzleHunterTrick(entity, state, trick, rt, host.bus);
      return;
    }
    activateHunterTrick(entity, state, trick, rt, host);
    return;
  }

  if (rt.phase !== 'idle') return;
  if (now < finite(rt.readyAt, 0)) return;
  startHunterTrickTelegraph(entity, state, trick, rt, host.bus, host.helpers);
}

// Damage during the telegraph fizzles tricks whose telegraph says so (the jump spool's
// "interrupt before the flash" is a real counter, not flavor text).
function telegraphInterrupted(entity, rt) {
  return finite(entity.hull, 0) < finite(rt.telegraphHull, 0)
    || finite(entity.shield, 0) < finite(rt.telegraphShield, 0);
}

function fizzleHunterTrick(entity, state, trick, rt, bus) {
  const now = finite(state && state.simTime, 0);
  rt.phase = 'cooldown';
  rt.activatedAt = null;
  rt.readyAt = now + trick.cooldownS * 0.5;
  emit(bus, 'bountyHunt:trickFizzled', {
    entityId: entity.id,
    contractId: contractIdForHunter(entity),
    trickId: trick.id,
    reason: 'damage_interrupt',
    at: now,
  });
}

function startHunterTrickTelegraph(entity, state, trick, rt, bus, helpers) {
  const now = finite(state && state.simTime, 0);
  rt.phase = 'telegraphing';
  rt.counterWindowS = trick.counterWindowS;
  rt.telegraphedAt = now;
  rt.activatesAt = now + trick.counterWindowS;
  rt.activatedAt = null;
  rt.telegraphHull = finite(entity.hull, 0);
  rt.telegraphShield = finite(entity.shield, 0);
  rt.lastVerb = clonePlain(trick.verb);
  const payload = {
    entityId: entity.id,
    contractId: contractIdForHunter(entity),
    trickId: trick.id,
    telegraph: trick.telegraph,
    at: now,
    activatesAt: rt.activatesAt,
    counterWindowS: trick.counterWindowS,
    verb: clonePlain(trick.verb),
  };
  emit(bus, 'bountyHunt:trickTelegraph', payload);
  const voice = helpers && helpers.voice;
  if (voice && typeof voice.say === 'function') {
    voice.say({
      channel: 'bark',
      kind: 'bounty_hunter_trick',
      factionId: entity.factionId || null,
      text: trick.telegraph,
    });
  }
}

function activateHunterTrick(entity, state, trick, rt, host) {
  const now = finite(state && state.simTime, 0);
  const payload = {
    entityId: entity.id,
    contractId: contractIdForHunter(entity),
    trickId: trick.id,
    at: now,
    verb: clonePlain(trick.verb),
  };
  applyHunterTrick(entity, state, trick, payload, rt, host);
  rt.phase = 'cooldown';
  rt.activatedAt = now;
  rt.readyAt = now + trick.cooldownS;
  rt.activationCount = (rt.activationCount || 0) + 1;
  rt.lastVerb = clonePlain(trick.verb);
  emit(host.bus, 'bountyHunt:trickActivated', payload);
}

function applyHunterTrick(entity, state, trick, payload) {
  const data = entity.data || (entity.data = {});
  const intent = data.intent || (data.intent = {});
  intent.trickVerb = trick.verb.kind;
  intent.trickId = trick.id;
  intent.trickActivatedAt = payload.at;

  switch (trick.id) {
    case 'emergency-jump-spool':
      applyEmergencyJump(entity, state, payload);
      break;
    case 'tether-cutter':
      intent.tetherCut = true;
      break;
    case 'mine-dropper':
      intent.fire = true;
      intent.weaponId = 'mine_dropper';
      break;
    case 'phase-jammer':
      // ECM effect loop reads cfg.radius for the jam ring and cfg.turnRateMult for the
      // steering write — a cfg without them jams with NaN radius/turnRate. Module tune:
      // mod_ecm_jammer_l (520/0.0); the trick only shortens the window via effectT.
      data.cm = { ...(data.cm || {}), effectT: 1.4, effect: { cfg: { kind: 'ecm', radius: 520, turnRateMult: 0 } } };
      break;
    case 'shield-turtle':
      entity.shield = Math.min(finite(entity.shieldMax, 0), finite(entity.shield, 0) + Math.max(10, finite(entity.shieldMax, 0) * 0.35));
      break;
    case 'ram-plate':
      intent.ramPlate = true;
      break;
    case 'decoy-clone':
      intent.decoyClone = true;
      break;
    default:
      break;
  }
}

function applyEmergencyJump(entity, state, payload) {
  const target = targetForHunter(entity, state);
  let dx = Math.cos(entity.rot || 0);
  let dz = Math.sin(entity.rot || 0);
  if (target && target.pos) {
    dx = entity.pos.x - target.pos.x;
    dz = entity.pos.z - target.pos.z;
  }
  const len = Math.hypot(dx, dz) || 1;
  const dist = 420;
  const before = { x: entity.pos.x, z: entity.pos.z };
  entity.pos.x += (dx / len) * dist;
  entity.pos.z += (dz / len) * dist;
  entity.vel.x = 0;
  entity.vel.z = 0;
  payload.from = roundPos(before);
  payload.to = roundPos(entity.pos);
}

function isBountyHunter(entity) {
  const data = entity && entity.data;
  return !!(data && data.bountyHunt && data.bountyHunt.role === 'hunter');
}

function isBountyQuarry(entity) {
  const data = entity && entity.data;
  return !!(data && data.bountyHunt && data.bountyHunt.role === 'quarry');
}

// Curated-scenario gate (salvor pattern): scenario contracts never get staged chases,
// so goldens and authored scenes read zero bounty staging.
function isScenarioGated(state) {
  const scenario = state && state.scenario;
  return !!((scenario && scenario.active)
    || (scenario && typeof scenario.scenarioId === 'string' && scenario.scenarioId));
}

function liveHunterFor(state, hunter) {
  if (!hunter || hunter.alive === false) return null;
  const fresh = state.entities && state.entities.get ? state.entities.get(hunter.id) : hunter;
  if (!fresh || fresh.alive === false || !isBountyHunter(fresh)) return null;
  return fresh;
}

// The chase is over for this hull: stop our steering and hand the ship back to its AI.
function standDownQuarry(quarry) {
  const data = quarry.data || (quarry.data = {});
  const hunt = data.bountyHunt || (data.bountyHunt = { role: 'quarry' });
  hunt.done = true;
  const ai = data.ai || (data.ai = {});
  ai.passive = true;
  const intent = data.intent;
  if (intent && typeof intent.mode === 'string' && intent.mode.indexOf('bounty_quarry') === 0) {
    intent.mode = 'resume';
    intent.moveX = 0;
    intent.moveZ = 0;
  }
}

// Flee toward refuge when one exists, else directly away from the hunter. Panic-weaves
// inside jink range so the run reads as evasion rather than a straight-line tow.
function steerQuarryFromHunter(quarry, hunter, refuge) {
  const data = quarry.data || (quarry.data = {});
  const ai = data.ai || (data.ai = {});
  ai.passive = false;
  let dx, dz;
  if (refuge && refuge.pos) {
    dx = refuge.pos.x - quarry.pos.x;
    dz = refuge.pos.z - quarry.pos.z;
  } else {
    dx = quarry.pos.x - hunter.pos.x;
    dz = quarry.pos.z - hunter.pos.z;
  }
  const hunterDist = Math.hypot(hunter.pos.x - quarry.pos.x, hunter.pos.z - quarry.pos.z);
  if (hunterDist < QT.jinkRange && hunterDist > 1) {
    // Blend in a perpendicular jink, handedness fixed per contract so it never shivers.
    const hunt = data.bountyHunt || {};
    const side = hunt.jinkSide === -1 ? -1 : 1;
    if (hunt.jinkSide == null) hunt.jinkSide = side;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len * side, pz = dx / len * side;
    dx = dx + px * len * 0.9;
    dz = dz + pz * len * 0.9;
  }
  const intent = data.intent || (data.intent = {});
  const len = Math.hypot(dx, dz) || 1;
  intent.moveZ = 1;
  intent.moveX = 0;
  intent.aimAngle = Math.atan2(dz / len, dx / len);
  intent.mode = 'bounty_quarry_flee';
  intent.boost = hunterDist < QT.dumpRange;
}

function nearestRefugeStation(state, pos, range) {
  if (!pos) return null;
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  let best = null;
  let bestD2 = range * range;
  for (const e of list) {
    if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
    const d2 = distance2(pos, e.pos);
    if (d2 < bestD2) { bestD2 = d2; best = e; }
  }
  return best;
}

function distance2(a, b) {
  const dx = (a && a.x || 0) - (b && b.x || 0);
  const dz = (a && a.z || 0) - (b && b.z || 0);
  return dx * dx + dz * dz;
}

// The quarry made it under the station's guns: the contract goes cold and the
// hunter breaks off rather than starting a war with the dock authority.
// INF-U15: if the player harried the hunter (tracked assist damage) without
// shooting the quarry, the escape pays gratitude — through the same writers.
function escapeQuarryToRefuge(state, bus, quarry, hunter, refuge, contractId, now, helpers) {
  const data = quarry.data || (quarry.data = {});
  const hunt = data.bountyHunt || (data.bountyHunt = { role: 'quarry' });
  hunt.done = true;
  hunt.escaped = true;
  standDownQuarry(quarry);
  const hdata = hunter.data || (hunter.data = {});
  hdata.contractTargetId = null;
  const hh = hdata.bountyHunt || (hdata.bountyHunt = { role: 'hunter' });
  hh.pursuing = false;
  const stationName = (refuge.data && (refuge.data.stationName || refuge.data.stationId)) || 'the station';
  recordOutcome(state, bus, contractId, 'quarry_escaped', { id: quarry.id, killerId: null });
  emit(bus, 'toast', {
    text: `${hunt.name || 'The quarry'} reached ${stationName} — the contract went cold.`,
    kind: 'info', ttl: 4,
  });
  emit(bus, 'bountyHunt:quarryEscaped', {
    contractId, quarryId: quarry.id, hunterId: hunter.id,
    stationId: (refuge.data && refuge.data.stationId) || null, at: now,
  });
  settleEscapeAssist(state, bus, helpers, quarry, hunter, contractId, now);
}

// INF-U15 v1: the harry-and-escape payoff. A surrendered quarry that escapes
// still pays the escape rate — the posted bounty was for a kill, and the
// hunter is alive. v2: the interference is two-sided — the quarry's people
// remember the help and the hunter's guild remembers the cost, out loud.
function settleEscapeAssist(state, bus, helpers, quarry, hunter, contractId, now) {
  const hunt = (quarry && quarry.data && quarry.data.bountyHunt) || {};
  if (hunt.gratitudeVoid === true) return null;
  const hh = (hunter && hunter.data && hunter.data.bountyHunt) || {};
  const assist = hh.assistContractId === contractId ? (hh.playerAssistDmg || 0) : 0;
  if (!(assist >= QT.escapeAssistDmg)) return null;
  const paid = QT.escapeGratitudeCr;
  emit(bus, 'economy:grantCredits', { amount: paid, reason: 'bounty_escape_gratitude', contractId });
  if (quarry.factionId) {
    emit(bus, 'faction:repDelta', {
      factionId: quarry.factionId, delta: QT.escapeGratitudeRep,
      reason: 'bounty_bought_escape', contractId,
    });
  }
  if (hunter && hunter.factionId) {
    emit(bus, 'faction:repDelta', {
      factionId: hunter.factionId, delta: QT.escapeGuildCostRep,
      reason: 'bounty_cost_contract', contractId,
    });
  }
  emit(bus, 'toast', {
    text: `${hunt.name || 'The quarry'} wires ${paid} cr — you bought their escape.`,
    kind: 'good', ttl: 5,
  });
  const voice = helpers && helpers.voice;
  if (voice && typeof voice.say === 'function') {
    voice.say({
      channel: 'bark',
      kind: 'bounty_hunter_spurned',
      factionId: (hunter && hunter.factionId) || null,
      text: 'You cost me that contract. The guild keeps a list, and so do I.',
    });
  }
  emit(bus, 'bountyHunt:escapeAssisted', {
    contractId, quarryId: quarry.id, hunterId: hunter && hunter.id,
    assist: Math.round(assist), paid, at: now,
  });
  return paid;
}

// Out of hull, out of options: the quarry cuts engines and posts its own bounty on
// the hunter. The hunter's AI does not take surrenders — the PLAYER is the out.
function surrenderQuarry(state, helpers, bus, quarry, hunter, contractId, now) {
  const data = quarry.data || (quarry.data = {});
  const hunt = data.bountyHunt || (data.bountyHunt = { role: 'quarry' });
  hunt.surrendered = true;
  const intent = data.intent || (data.intent = {});
  intent.moveX = 0;
  intent.moveZ = 0;
  intent.boost = false;
  intent.mode = 'bounty_quarry_surrendered';
  sayQuarry(helpers, quarry,
    `${hunt.name || 'Quarry'} cuts engines — "${QT.surrenderBountyCr} credits to whoever kills this hunter!"`,
    'bounty_quarry_surrender');
  emit(bus, 'toast', {
    text: `SURRENDER: ${hunt.name || 'The quarry'} posts ${QT.surrenderBountyCr} cr for the hunter's head.`,
    kind: 'warn', ttl: 6,
  });
  emit(bus, 'bountyHunt:quarrySurrendered', {
    contractId, quarryId: quarry.id, hunterId: hunter.id,
    payoff: QT.surrenderBountyCr, at: now,
  });
}

function sayQuarry(helpers, quarry, text, kind) {
  const voice = helpers && helpers.voice;
  if (voice && typeof voice.say === 'function') {
    voice.say({
      channel: 'bark',
      kind,
      factionId: (quarry && quarry.factionId) || null,
      text,
    });
  }
}

// The manifest becomes physical pods with outward velocity — scoopable by whoever
// gets there first. Greed versus mercy is the player's second approach.
function dumpQuarryManifest(state, helpers, bus, quarry, contractId, seed, now) {
  const spawnEntity = helpers && helpers.spawnEntity;
  const manifest = quarryManifestForContract(contractId, seed);
  const base = quarryHash01(seed, contractId, 'dump-angle') * Math.PI * 2;
  let dropped = 0;
  manifest.forEach((lot, i) => {
    if (!lot || !lot.commodityId || !(lot.amount > 0)) return;
    const ang = base + (i / Math.max(1, manifest.length)) * Math.PI * 2;
    const speed = 26 + i * 6;
    const pod = typeof spawnEntity === 'function' ? spawnEntity({
      type: 'pickup',
      pos: { x: quarry.pos.x + Math.cos(ang) * 14, z: quarry.pos.z + Math.sin(ang) * 14 },
      vel: {
        x: (quarry.vel && quarry.vel.x || 0) * 0.4 + Math.cos(ang) * speed,
        z: (quarry.vel && quarry.vel.z || 0) * 0.4 + Math.sin(ang) * speed,
      },
      radius: 3, mass: 0.1, collides: true,
      data: {
        kind: 'cargo', commodityId: lot.commodityId, amount: lot.amount,
        despawnAt: now + QT.dumpPodTtlS,
        quarryDump: contractId,
      },
    }) : null;
    if (pod) dropped += 1;
  });
  const data = quarry.data || (quarry.data = {});
  const hunt = data.bountyHunt || (data.bountyHunt = { role: 'quarry' });
  sayQuarry(helpers, quarry, `${hunt.name || 'Quarry'} is dumping cargo — lightening the hull!`, 'bounty_quarry_dump');
  emit(bus, 'toast', { text: 'Cargo in the water — the quarry is dumping its hold!', kind: 'warn', ttl: 4 });
  emit(bus, 'bountyHunt:quarryDump', { contractId, quarryId: quarry.id, lots: dropped, at: now });
}

// A dead hunter frees its quarry. Killed by the player, the quarry pays gratitude
// (the surrendered payoff when one was posted) through the canonical writers.
function settleHunterDown(state, bus, hunter, byPlayer) {
  clearStagedFlag(state, hunter && hunter.data && (hunter.data.bountyHunt.contractId || hunter.data.contractId));
  const targetId = hunter && hunter.data && hunter.data.contractTargetId;
  const quarry = targetId != null && state.entities && state.entities.get
    ? state.entities.get(targetId) : null;
  if (!quarry || quarry.alive === false || !isBountyQuarry(quarry)) return;
  const qhunt = quarry.data.bountyHunt || {};
  const contractId = qhunt.contractId || hunter.data.bountyHunt.contractId;
  standDownQuarry(quarry);
  if (!byPlayer) return;
  if (qhunt.gratitudeVoid === true) {
    emit(bus, 'toast', {
      text: `${qhunt.name || 'The quarry'} limps clear — no thanks for the one who shot them too.`,
      kind: 'info', ttl: 4,
    });
    emit(bus, 'bountyHunt:quarrySaved', {
      contractId, quarryId: quarry.id, hunterId: hunter.id, paid: 0, at: finite(state.simTime, 0),
    });
    return;
  }
  const payoff = qhunt.surrendered ? QT.surrenderBountyCr : QT.gratitudeCr;
  emit(bus, 'economy:grantCredits', { amount: payoff, reason: 'bounty_quarry_gratitude', contractId });
  if (quarry.factionId) {
    emit(bus, 'faction:repDelta', {
      factionId: quarry.factionId, delta: QT.gratitudeRep,
      reason: 'bounty_quarry_saved', contractId,
    });
  }
  emit(bus, 'toast', {
    text: `${qhunt.name || 'The quarry'} transfers ${payoff} cr — gratitude for the save.`,
    kind: 'good', ttl: 5,
  });
  emit(bus, 'bountyHunt:quarrySaved', {
    contractId, quarryId: quarry.id, hunterId: hunter.id, paid: payoff, at: finite(state.simTime, 0),
  });
}

// A dead quarry pays the hunter's cut when the player helped — and records an
// execution when the hunter killed a surrendered mark.
function settleQuarryDown(state, bus, killed, contractId, quarryId, byPlayer) {
  clearStagedFlag(state, contractId);
  const qhunt = (killed && killed.data && killed.data.bountyHunt) || {};
  if (byPlayer) {
    recordOutcome(state, bus, contractId, 'player_helped_hunter', { id: quarryId, killerId: state.playerId });
    releaseHunterFor(state, quarryId);
    const hunterFaction = hunterFactionForQuarry(state, quarryId);
    emit(bus, 'economy:grantCredits', { amount: QT.hunterCutCr, reason: 'bounty_collectors_cut', contractId });
    if (hunterFaction) {
      emit(bus, 'faction:repDelta', {
        factionId: hunterFaction, delta: QT.cutRep, reason: 'bounty_helped_hunter', contractId,
      });
    }
    emit(bus, 'toast', {
      text: `The guild pays a ${QT.hunterCutCr} cr collector's cut for the assist.`,
      kind: 'good', ttl: 4,
    });
    emit(bus, 'bountyHunt:cutPaid', { contractId, quarryId, paid: QT.hunterCutCr, at: finite(state.simTime, 0) });
    return;
  }
  if (qhunt.surrendered === true) {
    recordOutcome(state, bus, contractId, 'quarry_executed_surrendered', { id: quarryId, killerId: null });
    const hunterFaction = hunterFactionForQuarry(state, quarryId);
    if (hunterFaction) {
      emit(bus, 'faction:repDelta', {
        factionId: hunterFaction, delta: QT.executionRep,
        reason: 'bounty_executed_surrendered', contractId,
      });
    }
    emit(bus, 'toast', {
      text: 'The hunter executed a surrendered mark. The guild will hear of it.',
      kind: 'warn', ttl: 5,
    });
    releaseHunterFor(state, quarryId);
    return;
  }
  recordOutcome(state, bus, contractId, 'quarry_killed', { id: quarryId, killerId: null });
  releaseHunterFor(state, quarryId);
}

function releaseHunterFor(state, quarryId) {
  for (const entity of indexedShipLikeScan(state)) {
    const data = entity && entity.data;
    if (!data || !data.bountyHunt || data.bountyHunt.role !== 'hunter') continue;
    if (data.contractTargetId !== quarryId) continue;
    data.contractTargetId = null;
    data.bountyHunt.pursuing = false;
  }
}

function hunterFactionForQuarry(state, quarryId) {
  for (const entity of indexedShipLikeScan(state)) {
    const data = entity && entity.data;
    if (!data || !data.bountyHunt || data.bountyHunt.role !== 'hunter') continue;
    if (data.contractTargetId !== quarryId) continue;
    return entity.factionId || null;
  }
  return null;
}

function clearStagedFlag(state, contractId) {
  const own = state && state.bountyHunt;
  if (own && own.activeStaged && (!contractId || own.activeStaged.contractId === contractId)) {
    own.activeStaged = null;
  }
}

function contractIdForQuarryKill(state, quarryId) {
  for (const entity of indexedShipLikeScan(state)) {
    const data = entity && entity.data;
    if (!data || !data.bountyHunt || data.bountyHunt.role !== 'hunter') continue;
    if (data.contractTargetId === quarryId) return data.bountyHunt.contractId || data.contractId;
  }
  return null;
}

function targetForHunter(entity, state) {
  const targetId = entity && entity.data && entity.data.contractTargetId;
  return targetId != null && state && state.entities && state.entities.get && state.entities.get(targetId);
}

function contractIdForHunter(entity) {
  const data = entity && entity.data || {};
  const hunt = data.bountyHunt || {};
  return hunt.contractId || data.contractId || `bounty:${entity && entity.id}`;
}

function recordOutcome(state, bus, contractId, outcome, payload) {
  if (!contractId) return;
  const own = ensureState(state);
  if (own.outcomes[contractId]) return;
  const rec = {
    contractId,
    outcome,
    at: state.simTime || 0,
    entityId: payload.id,
    killerId: payload.killerId == null ? null : payload.killerId,
  };
  own.outcomes[contractId] = rec;
  emit(bus, 'bountyHunt:outcome', clonePlain(rec));
}

function freshState() {
  return {
    schemaVersion: STATE_VERSION,
    outcomes: {},
    stageSerial: 0,
    nextStageAt: null,
    activeStaged: null,
  };
}

function ensureState(state) {
  if (!state.bountyHunt || typeof state.bountyHunt !== 'object') state.bountyHunt = freshState();
  if (!state.bountyHunt.outcomes || typeof state.bountyHunt.outcomes !== 'object') state.bountyHunt.outcomes = {};
  if (!Number.isInteger(state.bountyHunt.stageSerial)) state.bountyHunt.stageSerial = 0;
  if (state.bountyHunt.nextStageAt != null && !Number.isFinite(state.bountyHunt.nextStageAt)) {
    state.bountyHunt.nextStageAt = null;
  }
  state.bountyHunt.schemaVersion = STATE_VERSION;
  return state.bountyHunt;
}

function emit(bus, evt, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(evt, payload);
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function roundPos(pos) {
  return {
    x: Math.round(finite(pos && pos.x, 0) * 1000) / 1000,
    z: Math.round(finite(pos && pos.z, 0) * 1000) / 1000,
  };
}

export default bountyHunt;
