// SWARM-06 — the Threat/affix/perk runtime (SWARM_ARCADE §6.4, §4.3).
//
// WHAT THIS IS
// ------------
// Three contracts land on live bodies, all gated on a live swarm-ruleset run:
//
//   * THREAT STAMPS. The door's Threat pick rides `run.telemetry.threats` (runSession stamps it
//     at begin, the wave planner already spent the pressure and purse halves). What remains is
//     per-body: Fast Lane scales every cohort hull's speed, Armoured Elites plates up the
//     champions. A body gets the stamp once — `data.swarmThreatStamped` — so a late
//     reinforcement reads the same wager the opening burst did.
//
//   * ELITE AFFIXES (§6.4). From Zone 3 — and any wave while a Threat is on — champions and
//     elite-role bodies carry one named trick, picked by a seeded hash of run seed + wave +
//     stamp ordinal so the same run meets the same tricked hulls every time:
//       shielded  — a bubble eats the first hits; pop it
//       splitter  — bursts into two wasps on death
//       volatile  — explodes on death; chain fuel, rewards throwing it into the pack
//       magnetic  — drags the run's credit chips off the field and eats them
//       commander — hardens the hulls flying near it
//       hasted    — runs a third faster than its kin
//     The scan runs on a cheap cadence; the kill/impact effects are receipt-driven.
//
//   * PERK EFFECTS. The two-slot loadout begin stamped on `run.telemetry.perks` gets its live
//     half here — the half only a tick can do. Bounty Hunter's pay scale sits inside
//     survivalRewards (the wallet's own seam); Gambler's shelf sits inside survivalDraft (the
//     shelf's own seam). What this file owns:
//       scavenger     — every 10th player kill requests a bonus chip through survivalRewards'
//                       own mint, so the chip pays the run wallet exactly like a cohort chip
//       overclock     — every player kill feeds the boost reserve
//       chain_reactor — a player kill at chain 25+ detonates the body like a volatile
//       ram_plate     — the player's hull hits like a plated module: contact damage
//
// Single-writer law holds: it never writes state.run (the blast and the chip request travel as
// intents), never writes Adventure credits, never touches the profile.

import { createRewardDeathLedger, runOwnsReward } from '../combat/rewardEligibility.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { validateRunState } from '../core/runState.js';
import { isSwarmRuleset } from './survivalSwarm.js';
import { makeEnemySpawnSpec } from './combat.js';
import { CREDIT_CHIP_KIND } from '../data/killRewards.js';
import { runHasPerk } from '../data/swarmPerks.js';
import {
  SWARM_AFFIX_BY_ID,
  swarmAffixFor,
  swarmAffixFromWave,
  swarmThreatEliteHullMult,
  swarmThreatSpeedMult,
} from '../data/swarmThreats.js';

/** How often the stamp scan runs. Spawns also arrive as receipts, so 12 ticks is slack, not lag. */
const SWARM_ELITE_SCAN_TICKS = 12;
/** Seeded-affix hash stride: FNV over seed + wave + stamp ordinal. */
const SWARM_AFFIX_SALT = 0x51e7a2;
/** Shielded: the bubble's hull. Small enough to pop fast, real enough to notice. */
const SWARM_AFFIX_BUBBLE = 70;
/** Hasted: §6.4 — a third faster than its kin. */
const SWARM_AFFIX_HASTE = 1.33;
/** Volatile / Chain Reactor: the blast's footprint and teeth. */
const SWARM_AFFIX_BLAST_RADIUS = 110;
const SWARM_AFFIX_BLAST_DAMAGE = 46;
const SWARM_AFFIX_BLAST_IMPULSE = 9;
/** Magnetic: how far a magnet elite reaches for chips, and the drag it puts on them. */
const SWARM_MAGNET_RADIUS = 170;
const SWARM_MAGNET_PULL = 46;
const SWARM_MAGNET_EAT_RADIUS = 14;
/** Commander: hardens nearby cohort hulls — a shield top-up the aura keeps fed. */
const SWARM_COMMANDER_RADIUS = 150;
const SWARM_COMMANDER_BONUS = 40;
const SWARM_COMMANDER_RATE = 14;
/** Splitter: the wasps it bursts into. */
const SWARM_SPLITTER_ENEMY = 'wasp_swarmer';
const SWARM_SPLITTER_COUNT = 2;
const SWARM_SPLITTER_EJECT = 16;
/** The spawn-budget requester id. Must carry the survival-wave prefix — the budget locks its
 * slots to the wave owner while a run is live. */
const SWARM_ELITE_OWNER = 'survival-wave:swarmElites';
/** Chain Reactor: the chain a kill has to land past before the body cooks off (§4.3). */
const SWARM_CHAIN_REACTOR_MIN = 25;
/** Scavenger: every Nth player kill drops a bonus chip. */
const SWARM_SCAVENGER_EVERY = 10;
/** The bonus chip's purse — small enough to be a trickle, real enough to chase. */
const SWARM_SCAVENGER_CREDITS = 25;
/** Overclock: boost reserve a kill feeds. */
const SWARM_OVERCLOCK_ENERGY = 14;
/** Ram Plate: contact damage the player's hull deals, scaled from the measured impact. */
const SWARM_RAM_PLATE_DAMAGE = 34;
const SWARM_RAM_PLATE_MIN_DP = 220;
/** One ram per pair per window — a grinding contact pays once a beat, not every tick. */
const SWARM_RAM_PLATE_COOLDOWN_TICKS = 30;

function liveSwarmRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive' || run.phase === 'ended') return null;
  if (!isSwarmRuleset(run.ruleset)) return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

function entityData(e) {
  return e && typeof e === 'object' && e.data && typeof e.data === 'object' ? e.data : null;
}

function simTickOf(state) {
  return Number.isFinite(state && state.tick) ? state.tick : 0;
}

/**
 * The seeded affix pick for one body. hash(seed ^ wave ^ ordinal): the same run stamps the
 * same hulls the same way, every replay.
 */
function affixHash(seed, wave, ordinal) {
  let h = (seed >>> 0) ^ SWARM_AFFIX_SALT;
  h = Math.imul(h ^ (wave >>> 0), 0x01000193) >>> 0;
  h = Math.imul(h ^ (ordinal >>> 0), 0x01000193) >>> 0;
  return h >>> 0;
}

export const swarmElites = {
  name: 'swarmElites',
  id: 'swarmElites',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this._unsubs = [];
    this._reset();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('entity:spawned', (p) => this._onSpawned(p)));
    this._unsubs.push(this.bus.on('entity:killed', (p) => this._onKilled(p)));
    this._unsubs.push(this.bus.on('physics:impact', (p) => this._onImpact(p)));
    this._unsubs.push(this.bus.on('swarm:chain', (p) => this._onChain(p)));
    this._unsubs.push(this.bus.on('swarm:chainBroken', () => { this._chain = 0; }));
    this._unsubs.push(this.bus.on('run:started', () => this._reset()));
    this._unsubs.push(this.bus.on('run:ended', () => this._reset()));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._reset();
  },

  /**
   * The per-tick half: stamp what arrived, drag chips under magnets, feed commander shields.
   * The scan is cheap — a bounded cadence over a bounded room, never a per-entity allocs pass.
   */
  update(dt) {
    const st = this.state;
    const run = liveSwarmRun(st);
    if (!run) return;
    // Active and cleanup both host live bodies; draft/refit pause the fight and pause us too.
    if (run.phase !== 'active' && run.phase !== 'cleanup') return;
    const step = Math.max(0, Number(dt) || 0);
    this._scanIn -= 1;
    if (this._scanIn <= 0) {
      this._scanIn = SWARM_ELITE_SCAN_TICKS;
      this._stampPass(st, run);
    }
    this._auraPass(st, run, step);
  },

  _reset() {
    this._scanIn = 0;
    this._affixOrdinal = 0;
    this._chain = 0;
    this._scavengerKills = 0;
    this._ramAt = new Map();
    if (this._deathLedger) this._deathLedger.clear();
    else this._deathLedger = createRewardDeathLedger();
  },

  /** Live readout for tests: affix count by id on live cohort bodies. */
  affixCensus() {
    const out = {};
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.forEach !== 'function') return out;
    entities.forEach((e) => {
      const data = entityData(e);
      if (e && e.alive !== false && data && typeof data.swarmAffix === 'string') {
        out[data.swarmAffix] = (out[data.swarmAffix] || 0) + 1;
      }
    });
    return out;
  },

  // ---- stamping -------------------------------------------------------------

  _onSpawned(payload) {
    const run = liveSwarmRun(this.state);
    if (!run) return;
    const entity = payload && (payload.entity !== undefined ? payload.entity : null);
    const target = entity && typeof entity === 'object'
      ? entity
      : (payload && payload.id != null && this.state.entities && typeof this.state.entities.get === 'function'
        ? this.state.entities.get(payload.id)
        : null);
    if (target) this._stampBody(this.state, run, target);
  },

  /**
   * One pass over the room: threat stamps first (they govern whether affixes may ride at all),
   * then the seeded affix on every elite/champion body due one.
   */
  _stampPass(state, run) {
    const entities = state && state.entities;
    if (!entities || typeof entities.forEach !== 'function') return;
    const threats = run.telemetry && Array.isArray(run.telemetry.threats) ? run.telemetry.threats : [];
    const speedMult = swarmThreatSpeedMult(threats);
    const eliteHullMult = swarmThreatEliteHullMult(threats);
    const affixFloor = swarmAffixFromWave(threats);
    entities.forEach((e) => {
      if (!e || e.alive === false) return;
      const data = entityData(e);
      if (!data || data.runCohort !== 'survival') return;
      // Fast Lane / Armoured Elites — once per body, whichever wave let it in.
      if (data.swarmThreatStamped !== true && threats.length > 0) {
        data.swarmThreatStamped = true;
        if (speedMult !== 1) {
          if (Number.isFinite(e.maxSpeed)) e.maxSpeed *= speedMult;
          if (Number.isFinite(e.combatSpeed)) e.combatSpeed *= speedMult;
          if (Number.isFinite(e.thrust)) e.thrust *= speedMult;
          if (data.derived && data.derived.propulsion && Number.isFinite(data.derived.propulsion.combatSpeed)) {
            data.derived.propulsion = {
              ...data.derived.propulsion,
              combatSpeed: data.derived.propulsion.combatSpeed * speedMult,
            };
          }
        }
        const plated = data.swarmChampion === true || data.runRole === 'elite';
        if (eliteHullMult !== 1 && plated && Number.isFinite(e.hullMax)) {
          e.hullMax = Math.round(e.hullMax * eliteHullMult);
          if (Number.isFinite(e.hull)) e.hull = Math.min(e.hullMax, Math.round(e.hull * eliteHullMult));
          if (Number.isFinite(e.armorMax)) {
            e.armorMax = Math.round(e.armorMax * eliteHullMult);
            if (Number.isFinite(e.armorHp)) e.armorHp = Math.min(e.armorMax, Math.round(e.armorHp * eliteHullMult));
          }
        }
      }
      this._stampAffix(state, run, e, affixFloor);
    });
  },

  _stampBody(state, run, e) {
    const data = entityData(e);
    if (!data || data.runCohort !== 'survival') return;
    const threats = run.telemetry && Array.isArray(run.telemetry.threats) ? run.telemetry.threats : [];
    this._stampAffix(state, run, e, swarmAffixFromWave(threats));
  },

  /**
   * An elite is a champion or an elite-role body past the affix floor wave. The hash keeps the
   * pick off the spawn path — a body the wave carried in from the last round reads the same
   * ordinal order it would have had, and two waves' stamps can never collide.
   */
  _stampAffix(state, run, e, affixFloor) {
    const data = entityData(e);
    if (!data || data.swarmAffix != null || data.swarmAffixChecked === true) return;
    const wave = Number.isInteger(data.runWave) ? data.runWave : (Number.isInteger(run.wave) ? run.wave : 0);
    data.swarmAffixChecked = true;
    if (wave < affixFloor) return;
    if (data.swarmChampion !== true && data.runRole !== 'elite') return;
    const ordinal = this._affixOrdinal++;
    const affix = swarmAffixFor(affixHash(Number.isInteger(run.seed) ? run.seed : 1, wave, ordinal));
    if (!affix || !SWARM_AFFIX_BY_ID[affix]) return;
    data.swarmAffix = affix;
    data.swarmAffixWave = wave;
    if (affix === 'shielded') {
      const bubble = Math.max(Number.isFinite(e.shieldMax) ? e.shieldMax : 0, SWARM_AFFIX_BUBBLE);
      e.shieldMax = bubble;
      e.shield = bubble;
    }
    if (affix === 'hasted') {
      if (Number.isFinite(e.maxSpeed)) e.maxSpeed *= SWARM_AFFIX_HASTE;
      if (Number.isFinite(e.combatSpeed)) e.combatSpeed *= SWARM_AFFIX_HASTE;
      if (Number.isFinite(e.thrust)) e.thrust *= SWARM_AFFIX_HASTE;
    }
    this._emit('swarm:affix', {
      id: e.id,
      affix,
      name: SWARM_AFFIX_BY_ID[affix].name,
      wave,
      pos: e.pos ? { x: e.pos.x, z: e.pos.z } : null,
    });
  },

  // ---- kills -----------------------------------------------------------------

  _onChain(payload) {
    this._chain = Number.isFinite(payload && payload.chain) ? payload.chain : this._chain;
  },

  _onKilled(payload) {
    const run = liveSwarmRun(this.state);
    if (!run) return;
    const id = payload && payload.id;
    if (id == null) return;
    const victim = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(id)
      : null;
    if (!runOwnsReward(victim)) return;
    const data = entityData(victim);
    const killerId = payload.killerId ?? (payload.provenance && payload.provenance.actorId);
    const playerKill = this.state.playerId != null && killerId === this.state.playerId;
    const player = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(this.state.playerId)
      : null;

    if (playerKill && this._deathLedger && !this._deathLedger.claim(victim)) return;

    // Chain Reactor — a kill past the mark detonates the body it fell (§4.3).
    if (playerKill && runHasPerk(run, 'chain_reactor') && this._chain >= SWARM_CHAIN_REACTOR_MIN) {
      this._blast(victim, this.state.playerId, 'chain_reactor');
    }
    // Scavenger — every Nth player kill drops a bonus chip through the run wallet's own mint.
    if (playerKill && runHasPerk(run, 'scavenger')) {
      this._scavengerKills += 1;
      if (this._scavengerKills % SWARM_SCAVENGER_EVERY === 0) {
        const pos = victim && victim.pos ? { x: victim.pos.x, z: victim.pos.z } : null;
        if (pos) {
          this._emit('swarm:bonusChip', {
            pos,
            credits: SWARM_SCAVENGER_CREDITS,
            reason: `swarm:perk:scavenger:${this._scavengerKills}`,
            wave: run.wave,
          });
        }
      }
    }
    // Overclock — every player kill feeds the boost reserve (§4.3).
    if (playerKill && runHasPerk(run, 'overclock') && player && player.boost
      && Number.isFinite(player.boost.energy) && Number.isFinite(player.boost.max)) {
      player.boost.energy = Math.min(player.boost.max, player.boost.energy + SWARM_OVERCLOCK_ENERGY);
    }

    const affix = data && data.swarmAffix;
    if (affix === 'volatile') {
      // A volatile killed BY its own blast chain attributes through the killer that started it —
      // a body a thrown rock popped still belongs to the throw (the receipt's own provenance).
      this._blast(victim, playerKill ? this.state.playerId : (killerId != null ? killerId : id), 'volatile');
    }
    if (affix === 'splitter') this._split(victim, run);
  },

  /**
   * The burst a volatile (or a chain-reactor kill) becomes: shared blast law — falloff by
   * distance, the damage router every other explosion uses, and the player's credit when the
   * player started it. Team-agnostic: the room's own hulls take it too — that is the throw the
   * affix is selling.
   */
  _blast(victim, attackerId, source) {
    if (!victim || !victim.pos) return;
    const helpers = this.helpers;
    const route = helpers && typeof helpers.routeCombatDamage === 'function'
      ? helpers.routeCombatDamage.bind(helpers)
      : null;
    if (!route) return;
    const entities = this.state.entities;
    if (!entities || typeof entities.forEach !== 'function') return;
    const ox = victim.pos.x, oz = victim.pos.z;
    const hits = [];
    entities.forEach((e) => {
      if (!e || e === victim || e.alive === false || !e.pos) return;
      if (e.type !== 'ship' && e.type !== 'asteroid') return;
      const dx = e.pos.x - ox, dz = e.pos.z - oz;
      const dist = Math.hypot(dx, dz);
      if (dist > SWARM_AFFIX_BLAST_RADIUS + (Number.isFinite(e.radius) ? e.radius : 0)) return;
      hits.push({ e, dist });
    });
    for (const { e, dist } of hits) {
      const falloff = Math.max(0.25, 1 - dist / (SWARM_AFFIX_BLAST_RADIUS + 1));
      const packet = scalarHitToDamagePacket({
        damage: Math.max(1, Math.round(SWARM_AFFIX_BLAST_DAMAGE * falloff)),
        damageType: 'explosive',
        pos: { x: ox, z: oz },
        source: { kind: source, chargeId: source },
      });
      packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
      route({
        attackerId,
        targetId: e.id,
        packet,
        origin: { kind: source, id: victim.id },
      });
      if (SWARM_AFFIX_BLAST_IMPULSE > 0) {
        const physics = helpers.combatPhysics;
        if (physics && typeof physics.applyImpulse === 'function') {
          const dx = e.pos.x - ox, dz = e.pos.z - oz;
          const len = Math.hypot(dx, dz) || 1;
          physics.applyImpulse({
            entityId: e.id,
            impulse: {
              x: (dx / len) * SWARM_AFFIX_BLAST_IMPULSE * falloff,
              z: (dz / len) * SWARM_AFFIX_BLAST_IMPULSE * falloff,
            },
            point: null,
            reason: source,
            tick: simTickOf(this.state),
            provenance: { actorId: attackerId, tag: 'swarm_affix_blast' },
          });
        }
      }
    }
    if (hits.length > 0 || source === 'volatile') {
      this._emit('charge:detonated', {
        pos: { x: ox, z: oz },
        radius: SWARM_AFFIX_BLAST_RADIUS,
        hits: hits.map((h) => h.e.id),
        shoves: [],
        trigger: source,
        hostId: victim.id,
      });
      this._emit('audio:cue', { id: 'sfx_explosion_small', position: { x: ox, z: oz }, gain: 0.6 });
    }
  },

  /**
   * Splitter's two wasps — through the wave's own budget requester so the split can never
   * silently overflow the cap, and stamped with the same cohort marks an ordinary stream body
   * carries so the run's reward and census seams count it.
   */
  _split(victim, run) {
    const helpers = this.helpers;
    if (!helpers || typeof helpers.spawnEntity !== 'function') return;
    if (!victim || !victim.pos) return;
    const budget = helpers.spawnBudget;
    const granted = budget && typeof budget.request === 'function'
      ? budget.request(SWARM_SPLITTER_COUNT, SWARM_ELITE_OWNER)
      : 0;
    if (granted <= 0) return;
    const wave = Number.isInteger(victim.data && victim.data.runWave)
      ? victim.data.runWave : (Number.isInteger(run.wave) ? run.wave : 0);
    let admitted = 0;
    for (let i = 0; i < granted; i++) {
      const angle = (i === 0 ? 0.6 : -0.6);
      const pos = {
        x: victim.pos.x + Math.cos(angle) * SWARM_SPLITTER_EJECT,
        z: victim.pos.z + Math.sin(angle) * SWARM_SPLITTER_EJECT,
      };
      const spec = makeEnemySpawnSpec(SWARM_SPLITTER_ENEMY, 1, pos);
      if (!spec) continue;
      spec.data = spec.data || {};
      spec.data.ai = spec.data.ai || {};
      spec.data.ai.spawnContext = 'encounter';
      spec.data.ai.forcePlayerTarget = true;
      spec.data.ai.huntPlayer = true;
      spec.data.ai.moraleImmune = true;
      spec.data.ai.surrenderImmune = true;
      spec.data.ai.activity = { ...spec.data.ai.activity, kind: 'attack_run', reason: 'survival_pursuit', targetId: this.state.playerId ?? null };
      spec.data.combat = { ...spec.data.combat, targetId: this.state.playerId ?? null };
      spec.data.runCohort = 'survival';
      spec.data.runWave = wave;
      spec.data.runRole = 'fodder';
      spec.data.swarmSplit = true;
      const spawned = helpers.spawnEntity(spec);
      const sid = spawned && typeof spawned === 'object' ? spawned.id : spawned;
      if (sid == null) continue;
      if (budget && typeof budget.bindEntity === 'function' && !budget.bindEntity(sid, SWARM_ELITE_OWNER)) {
        continue;
      }
      admitted += 1;
    }
    if (admitted < granted && budget && typeof budget.releaseSome === 'function') {
      budget.releaseSome(SWARM_ELITE_OWNER, granted - admitted);
    }
  },

  /**
   * Ram Plate — the player's hull hits like the plated module (§4.3). The receipt's own dp
   * scales the hit; a per-pair beat keeps a grinding contact honest instead of per-tick.
   */
  _onImpact(payload) {
    const run = liveSwarmRun(this.state);
    if (!run || !runHasPerk(run, 'ram_plate')) return;
    if (!payload || payload.playerInvolved !== true) return;
    const playerId = this.state.playerId;
    if (playerId == null) return;
    const otherId = payload.aId === playerId ? payload.bId : (payload.bId === playerId ? payload.aId : null);
    if (otherId == null) return;
    const other = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(otherId)
      : null;
    if (!runOwnsReward(other)) return;
    const dp = Number(payload.dp) || 0;
    if (dp < SWARM_RAM_PLATE_MIN_DP) return;
    const tick = simTickOf(this.state);
    const last = this._ramAt.get(otherId);
    if (last != null && tick - last < SWARM_RAM_PLATE_COOLDOWN_TICKS) return;
    this._ramAt.set(otherId, tick);
    if (this._ramAt.size > 64) this._ramAt.clear();
    const helpers = this.helpers;
    const route = helpers && typeof helpers.routeCombatDamage === 'function'
      ? helpers.routeCombatDamage.bind(helpers)
      : null;
    if (!route) return;
    const damage = Math.max(4, Math.round(SWARM_RAM_PLATE_DAMAGE * Math.min(2.5, dp / SWARM_RAM_PLATE_MIN_DP)));
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'collision',
      pos: payload.pos ? { x: payload.pos.x, z: payload.pos.z } : null,
      source: { kind: 'ram_plate', chargeId: 'ram_plate' },
    });
    packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
    route({
      attackerId: playerId,
      targetId: otherId,
      packet,
      origin: { kind: 'ram_plate', id: playerId },
    });
  },

  // ---- continuous auras --------------------------------------------------------

  /**
   * Magnetic drags the run's credit chips toward the marked hull and eats them on contact; the
   * stolen receipt goes through survivalRewards' own void seam so a swept clear can never pay
   * the chip back. Commander tops up the shields of the cohort hulls flying near it — the
   * hardening a strong account picked a Threat to earn.
   */
  _auraPass(state, run, dt) {
    const entities = state.entities;
    if (!entities || typeof entities.forEach !== 'function') return;
    let hasAura = false;
    entities.forEach((e) => {
      if (hasAura) return;
      const data = entityData(e);
      if (e && e.alive !== false && data && (data.swarmAffix === 'magnetic' || data.swarmAffix === 'commander')) {
        hasAura = true;
      }
    });
    if (!hasAura) return;
    entities.forEach((e) => {
      if (!e || e.alive === false || !e.pos) return;
      const data = entityData(e);
      if (!data) return;
      if (data.swarmAffix === 'magnetic') {
        entities.forEach((pickup) => {
          if (!pickup || pickup.alive === false || pickup.type !== 'pickup' || !pickup.pos) return;
          const pd = pickup.data || {};
          if (pd.wallet !== 'run' && pd.kind !== CREDIT_CHIP_KIND && pd.swarmRepair !== true) return;
          const dx = e.pos.x - pickup.pos.x, dz = e.pos.z - pickup.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > SWARM_MAGNET_RADIUS) return;
          if (dist <= SWARM_MAGNET_EAT_RADIUS) {
            pickup.alive = false;
            // The chip dies with its entitlement: survivalRewards voids it by body id so the
            // round-clear sweep cannot resurrect the payment. That is the steal being real.
            this._emit('swarm:chipStolen', { pickupId: pickup.id, pos: { x: pickup.pos.x, z: pickup.pos.z } });
            return;
          }
          const pull = (SWARM_MAGNET_PULL * dt) / Math.max(1, dist);
          pickup.pos.x += dx * pull * Math.min(1, dist / 4);
          pickup.pos.z += dz * pull * Math.min(1, dist / 4);
        });
        return;
      }
      if (data.swarmAffix === 'commander') {
        entities.forEach((ally) => {
          if (!ally || ally === e || ally.alive === false || !ally.pos) return;
          const ad = entityData(ally);
          if (!ad || ad.runCohort !== 'survival' || ad.swarmChampion === true) return;
          const dx = ally.pos.x - e.pos.x, dz = ally.pos.z - e.pos.z;
          if (Math.hypot(dx, dz) > SWARM_COMMANDER_RADIUS) return;
          const baseMax = Number.isFinite(ally.shieldMax) ? ally.shieldMax : 0;
          const cap = baseMax + SWARM_COMMANDER_BONUS;
          const cur = Number.isFinite(ally.shield) ? ally.shield : 0;
          if (cur < cap) {
            ally.shield = Math.min(cap, cur + SWARM_COMMANDER_RATE * dt);
            ad.swarmCommanderShield = true;
          }
        });
      }
    });
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};

export default swarmElites;
