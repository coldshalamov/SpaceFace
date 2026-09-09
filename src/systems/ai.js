// AI system: per-NPC steering + FSM (idle/patrol -> pursue -> attack/strafe -> flee) that writes
// entity.data.intent = {moveX,moveZ,boost,fire,fireGroup,aimAngle} each tick (ARCHITECTURE §2.3 step 2).
// flight consumes movement (moveX/moveZ/boost/aimAngle); weapons consumes fire/fireGroup.
// Default hostility: team 1 (NPC) targets the player (team 0). Behaviour varies by
// entity.data.ai.archetype (swarmer/sniper/brawler/fleeing_trader/pirate/miniboss_capital).
// Deterministic: uses state.rng for any randomness (never Math.random in sim logic, §0.5).
import { wrapAngle } from '../core/rng.js';
import { makeEnemySpawnSpec } from './combat.js';
import {
  ensureActivityClassified,
  entityNeedsAiThink,
  getActivityOwnerEntities,
} from '../world/activityRuntime.js';

// FSM states.
const S = { IDLE: 'idle', PATROL: 'patrol', PURSUE: 'pursue', ATTACK: 'attack', STRAFE: 'strafe', FLEE: 'flee' };

// Per-archetype tuning. Distances in wu. `pref` is the preferred engagement range the FSM
// tries to hold; `attackR` is the max range at which it opens fire; `sensor` is acquisition range.
const ARCH = {
  swarmer: {
    sensor: 1400, attackR: 520, pref: 180, orbit: 1, boostChase: true,
    fleeFrac: 0, strafe: 0.9, aggressive: true,
  },
  sniper: {
    sensor: 1800, attackR: 1050, pref: 950, orbit: 0.2, boostChase: false,
    fleeFrac: 0.3, kite: true, strafe: 0.3, aggressive: true,
  },
  brawler: {
    sensor: 1500, attackR: 520, pref: 220, orbit: 0.7, boostChase: true,
    fleeFrac: 0, strafe: 0.7, aggressive: true,
  },
  fleeing_trader: {
    sensor: 1100, attackR: 280, pref: 1100, orbit: 0, boostChase: true,
    fleeFrac: 1.0, alwaysFlee: true, defensiveOnly: true, strafe: 0,
  },
  pirate: {
    sensor: 1600, attackR: 560, pref: 260, orbit: 0.6, boostChase: true,
    fleeFrac: 0.2, strafe: 0.7, aggressive: true,
  },
  miniboss_capital: {
    sensor: 2400, attackR: 1100, pref: 600, orbit: 0.15, boostChase: false,
    fleeFrac: 0, strafe: 0.2, aggressive: true,
  },
  default: {
    sensor: 1500, attackR: 560, pref: 280, orbit: 0.5, boostChase: true,
    fleeFrac: 0.25, strafe: 0.6, aggressive: true,
  },
};

const THREAT_DECAY = 0.98;          // per-second multiplicative decay of threat entries
const REPATH_LOSE_S = 3.0;          // target out of sensor for this long -> drop to patrol
const RETARGET_INTERVAL = 0.4;      // seconds between (expensive) target re-selection
const FIRE_CONE = 0.30;             // rad half-angle: only fire when aim is within this of target
const ATTACK_TELEGRAPH_S = 0.5;
const ALPHA_TELEGRAPH_S = 0.8;
const HEAVY_WEAPON_DPS = 40;
const AI_BARK_COOLDOWN_S = 4;
const SCATTER_S = 8;
const WEDGE_SLOT_ANGLE = 35 * Math.PI / 180;
const WEDGE_SLOT_DIST = 60;
const PIRATE_FLEE_JETTISON_CHANCE = 0.3;
const PIRATE_FLEE_CARGO = Object.freeze(['cmdty_stolen_goods', 'cmdty_munitions', 'cmdty_consumer_goods']);
const UNSAFE_PLAYER_SECURITY = 0.45;
const LANE_CONTEXT_INNER_R = 900;
const LANE_CONTEXT_OUTER_R = 2200;
const PLAYER_DANGER_CONTEXTS = new Set([
  'interdiction', 'spawn_request', 'bounty_hunter', 'mission', 'encounter', 'tutorial_pirate',
]);
const AI_BARKS = Object.freeze({
  attackRun: Object.freeze(['Coming around.', 'Weapons lining up.', 'Run starts now.']),
  alphaStrike: Object.freeze(['Charging heavy guns.', 'Hold for alpha.', 'Big guns hot.']),
  flee: Object.freeze(['Breaking off.', 'Dump it and burn.', 'I am out.']),
  formationBroken: Object.freeze(['Leader down.', 'Wing is scattered.', 'Break formation.']),
});

export const ai = {
  name: 'ai',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._targetScratch = [];
    this._formations = new Map();
    const state = ctx.state, bus = ctx.bus;

    // Threat tables live on state.combat (already allocated in gameState). Map<targetId, Map<attackerId, threat>>.
    if (!state.combat) state.combat = {};
    if (!(state.combat.threatTables instanceof Map)) state.combat.threatTables = new Map();
    this._threat = state.combat.threatTables;

    // Aggro on damage: the victim accrues threat against its attacker (§ AGGRO/THREAT).
    bus.on('combat:damage', (p) => {
      if (!p || p.targetId == null || p.attackerId == null) return;
      if (p.attackerId === p.targetId) return;
      this._addThreat(p.targetId, p.attackerId, Math.max(1, p.amount || 1));
    });

    // Clean up threat + target references when an entity leaves the world.
    const onGone = (p) => {
      if (!p || p.id == null) return;
      this._threat.delete(p.id);
      for (const tbl of this._threat.values()) tbl.delete(p.id);
    };
    bus.on('entity:destroyed', onGone);
    bus.on('entity:killed', (p) => { if (p) onGone({ id: p.id }); });
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    ensureActivityClassified(state);
    const list = getActivityOwnerEntities(state, 'ai');
    const player = state.entities.get(state.playerId) || null;
    this._updateFormationRuntime(state, list);

    // Decay threat once per tick (framerate-independent).
    const decay = Math.pow(THREAT_DECAY, dt);
    for (const tbl of this._threat.values()) {
      for (const [k, v] of tbl) {
        const nv = v * decay;
        if (nv < 0.5) tbl.delete(k); else tbl.set(k, nv);
      }
    }

    // Process pending reinforcements
    const pending = state.combat.pendingReinforcements;
    if (pending && pending.length > 0) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const r = pending[i];
        if (state.simTime >= r.spawnAt) {
          pending.splice(i, 1);
          try {
            const spec = makeEnemySpawnSpec(r.typeId, r.level, r.pos);
            spec.data = spec.data || {};
            spec.data.reinforcements = null; // reinforcements don't call their own reinforcements
            this.helpers.spawnEntity(spec);
            this.bus.emit('toast', { text: 'Reinforcements have arrived!', kind: 'danger', ttl: 2 });
          } catch (err) {
            console.warn('[ai] failed to spawn reinforcement:', err);
          }
        }
      }
    }

    for (const e of list) {
      if (e.type !== 'ship' || !e.alive) continue;
      if (e.id === state.playerId) continue;
      const data = e.data || (e.data = {});
      if (!data.ai && e.ai && typeof e.ai === 'object') data.ai = e.ai;
      if (!data.ai) continue;          // only entities the spawner tagged as AI ships
      // Passive freighters (ambient traffic, V2 §28b) drive themselves via data.intent from the
      // traffic system — skip the combat FSM so they never acquire/attack/strafe. They can still be
      // attacked (piracy -> heat), they just don't initiate.
      if (data.ai.passive) continue;
      if (entityNeedsAiThink(e, state) === false) continue;
      this._think(e, data, state, player, dt);
    }
  },

  // ---- core per-NPC tick -------------------------------------------------

  _think(e, data, state, player, dt) {
    const ai = data.ai;
    const arch = ARCH[ai.archetype] || ARCH[data.archetype] || ARCH.default;
    const now = simTime(state);

    // Per-NPC bookkeeping (lazily initialised; survives across ticks on data.ai).
    if (ai.fsm == null) ai.fsm = S.IDLE;
    if (ai._t == null) ai._t = 0;                 // time accumulator (for retarget cadence)
    if (ai._lostT == null) ai._lostT = 0;         // time since target last seen
    if (ai._retarget == null) ai._retarget = 0;
    if (ai._wanderAng == null) ai._wanderAng = e.rot;
    if (ai.home == null) ai.home = { x: e.pos.x, z: e.pos.z };
    ai._t += dt;

    if (data.morale === 'scattered') {
      if (ai._moraleUntil != null && now < ai._moraleUntil) {
        const intent = this._ensureIntent(data);
        intent.boost = true;
        intent.fire = false;
        intent.fireGroup = null;
        this._steerScatter(e, ai, intent);
        return;
      }
      delete data.morale;
      delete ai._moraleUntil;
      delete ai._scatterFrom;
      delete ai.formationSlot;
      delete ai.formationRole;
      delete ai.formationLeaderId;
      delete ai.formationSlotIndex;
      delete ai._attackTelegraph;
    }

    // --- acquire / refresh target ---
    ai._retarget -= dt;
    let target = data.combat && data.combat.targetId != null
      ? state.entities.get(data.combat.targetId) : null;
    if (!target || !target.alive) target = null;
    if (ai._retarget <= 0 || !target) {
      ai._retarget = RETARGET_INTERVAL;
      target = this._selectTarget(e, data, state, player, arch);
      if (!data.combat) data.combat = { targetId: null, lockTarget: null, lockProgress: 0 };
      data.combat.targetId = target ? target.id : null;
    }

    // Distance/relative bookkeeping to the current target.
    let dist = Infinity, toAng = e.rot, predAng = e.rot, dx = 0, dz = 0;
    if (target) {
      dx = target.pos.x - e.pos.x; dz = target.pos.z - e.pos.z;
      dist = Math.hypot(dx, dz) || 0.0001;
      toAng = Math.atan2(dz, dx);
      predAng = this._leadAngle(e, target, this._projSpeed(data));
      if (dist <= arch.sensor) ai._lostT = 0; else ai._lostT += dt;
    } else {
      ai._lostT += dt;
    }

    // --- FSM transitions ---
    const hullFrac = e.hullMax > 0 ? e.hull / e.hullMax : 1;
    this._checkReinforcements(e, data, state);
    const fleeFrac = arch.alwaysFlee ? 1.0 : (arch.fleeFrac || 0);
    const wantFlee = arch.alwaysFlee || (fleeFrac > 0 && hullFrac < fleeFrac && target != null);

    let next = ai.fsm;
    if (wantFlee) {
      next = S.FLEE;
    } else if (!target || ai._lostT > REPATH_LOSE_S) {
      next = S.PATROL;
    } else if (dist > arch.attackR) {
      next = S.PURSUE;
    } else {
      // within firing range: brawlers/swarmers/pirates circle-strafe; snipers hold/kite.
      next = arch.strafe > 0.45 ? S.STRAFE : S.ATTACK;
    }
    next = this._resolveAttackTelegraph(e, data, ai, state, target, next);
    if (next !== ai.fsm) {
      const from = ai.fsm; ai.fsm = next;
      this.bus.emit('ai:stateChange', { npcId: e.id, from, to: next });
      if (next === S.FLEE) {
        delete ai._attackTelegraph;
        this.bus.emit('ai:flee', { entityId: e.id });
        this._emitAiBark(state, e, 'flee');
        this._maybeJettisonFleeCargo(e, data, state);
      }
    }

    // --- produce intent for this state ---
    const intent = this._ensureIntent(data);
    intent.boost = false;
    intent.fire = false;
    intent.fireGroup = null;
    intent.aimAngle = target ? predAng : e.rot;
    const effectiveFsm = this._effectiveFsm(ai, state);
    const telegraphHoldingFire = this._telegraphHoldingFire(ai, state);

    switch (effectiveFsm) {
      case S.PATROL:
      case S.IDLE:
        if (!this._steerFormationSlot(e, ai, intent)) this._steerPatrol(e, ai, intent, state, dt);
        break;
      case S.PURSUE:
        this._steerToward(e, intent, toAng, 1, dist, e.pos, dx, dz);
        intent.boost = !!arch.boostChase && dist > arch.pref * 2;
        break;
      case S.ATTACK:
        this._steerHold(e, intent, target, arch, dist, dx, dz, predAng);
        if (!telegraphHoldingFire) this._maybeFire(e, data, intent, predAng, dist, arch);
        break;
      case S.STRAFE:
        this._steerStrafe(e, ai, intent, arch, dist, dx, dz, predAng, state);
        if (!telegraphHoldingFire) this._maybeFire(e, data, intent, predAng, dist, arch);
        break;
      case S.FLEE:
        this._steerFlee(e, intent, dx, dz);
        // Face directly away so forward thrust (full power, not the halved reverse) opens the gap.
        if (target) intent.aimAngle = Math.atan2(-dz, -dx);
        intent.boost = true;
        // Trader/PD types only shoot when truly cornered (very close).
        if (!telegraphHoldingFire && (!arch.defensiveOnly || dist < 160)) this._maybeFire(e, data, intent, predAng, dist, arch);
        break;
    }
  },

  // ---- readability runtime: telegraphs / formations / barks --------------

  _resolveAttackTelegraph(e, data, ai, state, target, next) {
    if (!isAttackState(next) || !target || !this._hasUsableWeapons(data)) {
      delete ai._attackTelegraph;
      return next;
    }
    if (isAttackState(ai.fsm)) {
      delete ai._attackTelegraph;
      return next;
    }
    const now = simTime(state);
    const pending = ai._attackTelegraph;
    if (!pending || pending.targetId !== target.id || pending.state !== next) {
      const kind = this._telegraphKind(data);
      const duration = kind === 'alphaStrike' ? ALPHA_TELEGRAPH_S : ATTACK_TELEGRAPH_S;
      ai._attackTelegraph = {
        state: next,
        targetId: target.id,
        kind,
        until: now + duration,
      };
      this.bus.emit('ai:telegraph', { entityId: e.id, kind });
      this._emitAiBark(state, e, kind);
      return ai.fsm;
    }
    if (now < pending.until) return ai.fsm;
    const resolved = pending.state;
    delete ai._attackTelegraph;
    return resolved;
  },

  _effectiveFsm(ai, state) {
    const pending = ai._attackTelegraph;
    if (pending && simTime(state) < pending.until) return pending.state;
    return ai.fsm;
  },

  _telegraphHoldingFire(ai, state) {
    const pending = ai._attackTelegraph;
    return !!(pending && simTime(state) < pending.until);
  },

  _hasUsableWeapons(data) {
    return !!(data && Array.isArray(data.weapons) && data.weapons.length > 0);
  },

  _telegraphKind(data) {
    for (const w of (data && data.weapons) || []) {
      const dps = weaponDps(w);
      if (dps > HEAVY_WEAPON_DPS) return 'alphaStrike';
    }
    return 'attackRun';
  },

  _updateFormationRuntime(state, source) {
    if (!this._formations) this._formations = new Map();
    const now = simTime(state);
    const groups = new Map();
    for (const e of source || []) {
      if (!e || e.type !== 'ship' || !e.alive || e.id === state.playerId) continue;
      const data = e.data || {}, ai = data.ai || e.ai;
      if (!ai || ai.passive || ai._formationBroken) continue;
      const groupId = formationGroupId(ai);
      if (!groupId) continue;
      let list = groups.get(groupId);
      if (!list) { list = []; groups.set(groupId, list); }
      list.push(e);
    }

    for (const [groupId, rec] of this._formations) {
      if (!rec || rec.disabled || !rec.leaderId) continue;
      const leader = state.entities && state.entities.get ? state.entities.get(rec.leaderId) : null;
      if (!leader || !leader.alive) {
        const members = groups.get(groupId) || [];
        this._breakFormation(groupId, rec, members, state, now);
      } else {
        rec.lastLeaderPos = { x: leader.pos.x, z: leader.pos.z };
      }
    }

    for (const [groupId, members] of groups) {
      if (members.length < 3) continue;
      let rec = this._formations.get(groupId);
      if (rec && rec.disabled) continue;
      if (!rec) {
        const leader = chooseFormationLeader(members);
        rec = {
          leaderId: leader.id,
          leaderName: shipNameFor(leader),
          lastLeaderPos: { x: leader.pos.x, z: leader.pos.z },
          disabled: false,
        };
        this._formations.set(groupId, rec);
      }
      const leader = state.entities && state.entities.get ? state.entities.get(rec.leaderId) : null;
      if (!leader || !leader.alive) continue;
      rec.lastLeaderPos = { x: leader.pos.x, z: leader.pos.z };
      this._assignFormationSlots(groupId, rec, leader, members);
    }
  },

  _assignFormationSlots(groupId, rec, leader, members) {
    const ordered = members.slice().sort((a, b) => {
      if (a.id === rec.leaderId) return -1;
      if (b.id === rec.leaderId) return 1;
      return compareIds(a.id, b.id);
    });
    for (let i = 0; i < ordered.length; i++) {
      const e = ordered[i];
      const ai = e.data && e.data.ai;
      if (!ai) continue;
      ai.formationGroupId = groupId;
      ai.formationLeaderId = rec.leaderId;
      ai.formationRole = i === 0 ? 'leader' : 'wingman';
      ai.formationSlotIndex = i;
      if (i === 0) {
        delete ai.formationSlot;
        continue;
      }
      ai.formationSlot = wedgeSlotFor(leader, i);
    }
  },

  _breakFormation(groupId, rec, members, state, now) {
    rec.disabled = true;
    this.bus.emit('ai:formationBroken', { groupId });
    const scatterFrom = rec.lastLeaderPos || { x: 0, z: 0 };
    const speaker = members.find((e) => e && e.id !== rec.leaderId) || { id: rec.leaderId, data: { name: rec.leaderName } };
    this._emitAiBark(state, speaker, 'formationBroken');
    for (const e of members) {
      if (!e || e.id === rec.leaderId) continue;
      const data = e.data || (e.data = {});
      const ai = data.ai || (data.ai = {});
      data.morale = 'scattered';
      ai._moraleUntil = now + SCATTER_S;
      ai._scatterFrom = { x: scatterFrom.x, z: scatterFrom.z };
      ai._formationBroken = true;
      delete ai._attackTelegraph;
      delete ai.formationSlot;
      delete ai.formationRole;
      delete ai.formationLeaderId;
      delete ai.formationSlotIndex;
    }
  },

  _steerFormationSlot(e, ai, intent) {
    if (!ai || ai.formationRole !== 'wingman' || !ai.formationSlot) return false;
    const dx = ai.formationSlot.x - e.pos.x;
    const dz = ai.formationSlot.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 14) {
      intent.moveX = 0;
      intent.moveZ = 0;
      return true;
    }
    intent.aimAngle = Math.atan2(dz, dx);
    this._drive(e, intent, dx, dz, clamp(dist / WEDGE_SLOT_DIST, 0.25, 1));
    return true;
  },

  _steerScatter(e, ai, intent) {
    const from = ai && ai._scatterFrom;
    let dx = from ? e.pos.x - from.x : Math.cos(e.rot || 0);
    let dz = from ? e.pos.z - from.z : Math.sin(e.rot || 0);
    if (Math.hypot(dx, dz) < 0.001) {
      dx = Math.cos((e.rot || 0) + Math.PI);
      dz = Math.sin((e.rot || 0) + Math.PI);
    }
    intent.aimAngle = Math.atan2(dz, dx);
    this._drive(e, intent, dx, dz, 1);
  },

  _emitAiBark(state, e, kind) {
    if (!state.combat) state.combat = {};
    const now = simTime(state);
    const last = state.combat.lastAiBarkAt;
    if (Number.isFinite(last) && now - last < AI_BARK_COOLDOWN_S) return false;
    const variants = AI_BARKS[kind] || AI_BARKS.attackRun;
    const idx = Math.min(variants.length - 1, Math.floor(rng(state) * variants.length));
    state.combat.lastAiBarkAt = now;
    this.bus.emit('comms:popup', {
      id: `ai.${kind}.${e && e.id != null ? e.id : 'group'}.${Math.round(now * 1000)}`,
      category: 'ambient',
      sender: shipNameFor(e),
      text: variants[idx],
      ttl: 2.8,
    });
    return true;
  },

  _maybeJettisonFleeCargo(e, data, state) {
    const ai = data && data.ai;
    if (!ai || ai.archetype !== 'pirate') return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    if (rng(state) >= PIRATE_FLEE_JETTISON_CHANCE) return;
    const ids = cargoIdsForPanic(data);
    const count = 1 + Math.floor(rng(state) * 2);
    for (let i = 0; i < count; i++) {
      const commodityId = ids[Math.floor(rng(state) * ids.length)] || PIRATE_FLEE_CARGO[0];
      const amount = 1 + Math.floor(rng(state) * 3);
      const ang = rng(state) * Math.PI * 2;
      const r = 8 + rng(state) * 8;
      const sp = 14 + rng(state) * 18;
      this.helpers.spawnEntity({
        type: 'pickup',
        pos: { x: e.pos.x + Math.cos(ang) * r, z: e.pos.z + Math.sin(ang) * r },
        vel: { x: Math.cos(ang) * sp, z: Math.sin(ang) * sp },
        radius: 2.0,
        data: { kind: 'cargo', commodityId, amount, despawnAt: simTime(state) + 60 },
      });
    }
  },

  // ---- target selection (aggro/threat) -----------------------------------

  _selectTarget(e, data, state, player, arch) {
    const tbl = this._threat.get(e.id);
    let best = null, bestScore = -Infinity;
    const sensor2 = arch.sensor * arch.sensor;

    const consider = (cand) => {
      if (!cand || !cand.alive || cand.type !== 'ship' || cand === e) return;
      if (!this._isHostile(e, cand)) return;
      const dx = cand.pos.x - e.pos.x, dz = cand.pos.z - e.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > sensor2) return;
      const dist = Math.sqrt(d2);
      const threat = tbl ? (tbl.get(cand.id) || 0) : 0;
      const isPlayer = cand.id === state.playerId;
      if (isPlayer && !this._canAcquirePlayer(data, state, cand, threat)) return;
      let score = threat + 50 / (1 + dist / 100);
      if (isPlayer && threat > 0) score += Math.min(40, threat);
      if (score > bestScore) { bestScore = score; best = cand; }
    };

    // Fast path: most NPCs only care about the player; still scan neighbours for threat sources.
    consider(player);
    if (this.helpers && this.helpers.queryRadius) {
      const near = this.helpers.queryRadius(e.pos, arch.sensor, this._targetScratch || (this._targetScratch = []));
      for (const c of near) consider(c);
    }
    return best;
  },

  _canAcquirePlayer(data, state, player, threat) {
    if (threat > 0) return true;
    const ai = data && data.ai || {};
    if (ai.lawful) return true;
    if (ai.forcePlayerTarget || ai.huntPlayer) return true;
    if (data && data.encounter) return true;
    const context = String(ai.spawnContext || ai.context || '');
    if (PLAYER_DANGER_CONTEXTS.has(context)) return true;
    const security = finiteNumber(ai.sectorSecurity, currentSectorSecurity(state));
    const tier = finiteNumber(ai.sectorTier, currentSectorTier(state));
    // Low-sec/tiered sectors unlock ambient danger pockets; they do not make every spawned pirate
    // immediately hunt a neutral player anywhere in the sector, especially near stations.
    return (security <= UNSAFE_PLAYER_SECURITY || tier >= 2) && playerIsInLaneDanger(state, player);
  },

  // team 0 = player side, team 1 = hostile NPCs (default hostility). Also honour explicit
  // ai.hostileTeams / lawful patrol flag if the spawner set them.
  _isHostile(e, other) {
    if (other.team === e.team) return false;
    const ai = e.data && e.data.ai;
    if (ai && Array.isArray(ai.hostileTeams)) return ai.hostileTeams.includes(other.team);
    // Lawful patrols are only hostile to wanted players. Derive "wanted" LIVE from the heat system
    // (V2 §20b) so a player who cools off stops being hunted — the old ai.playerWanted field was
    // never written anywhere (dead infrastructure), so reading it live is both the fix and the feature.
    if (ai && ai.lawful && other.team === 0) {
      const h = this.state.player && this.state.player.heat;
      return typeof h === 'number' ? h >= 0.15 : false;
    }
    return true;
  },

  // ---- steering primitives (write ship-relative moveX/moveZ) --------------

  // Map a world-space desired heading + a "throttle" into the flight intent. flight.applyIntent
  // turns the ship toward aimAngle and reads moveZ(forward)/moveX(strafe) relative to e.rot, so we
  // project the desired world direction onto the ship's current forward/right axes.
  _drive(e, intent, dirX, dirZ, throttle) {
    const len = Math.hypot(dirX, dirZ) || 1;
    const ux = dirX / len, uz = dirZ / len;
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    const fwd = (cf * ux + sf * uz);             // component along forward axis
    const rt = (-sf * ux + cf * uz);             // component along right axis
    intent.moveZ = clamp(fwd * throttle, -1, 1);
    intent.moveX = clamp(rt * throttle, -1, 1);
  },

  _steerToward(e, intent, toAng, throttle, dist, pos, dx, dz) {
    this._drive(e, intent, dx, dz, throttle);
  },

  // Hold preferred range: advance if too far, back off if too close, else mostly stand.
  _steerHold(e, intent, target, arch, dist, dx, dz, predAng) {
    const pref = arch.pref;
    if (dist > pref * 1.15) {
      this._drive(e, intent, dx, dz, 1);
    } else if (arch.kite && dist < pref * 0.85) {
      this._drive(e, intent, -dx, -dz, 1);       // snipers back away to keep range
    } else {
      // creep / strafe a little to stay a moving target
      this._drive(e, intent, -dz, dx, arch.strafe * 0.4);
    }
  },

  // Circle-strafe: blend tangential motion (perpendicular to target) with a radial term that
  // pulls toward the preferred orbit radius. Produces the classic "dogfight" arc.
  _steerStrafe(e, ai, intent, arch, dist, dx, dz, predAng, state) {
    if (ai._orbitDir == null) ai._orbitDir = (state.rng() < 0.5) ? 1 : -1;
    const tx = -dz * ai._orbitDir, tz = dx * ai._orbitDir;     // tangent (perpendicular)
    // radial correction: +out if too close, +in if too far, relative to pref range.
    const err = (dist - arch.pref) / Math.max(60, arch.pref);
    const rx = dx * clamp(err, -1, 1), rz = dz * clamp(err, -1, 1);
    const mixX = tx * 1.0 + rx * 1.2;
    const mixZ = tz * 1.0 + rz * 1.2;
    this._drive(e, intent, mixX, mixZ, 1);
  },

  _steerFlee(e, intent, dx, dz) {
    this._drive(e, intent, -dx, -dz, 1);          // straight away from the threat
  },

  // Patrol: lazy wander around home anchor; deterministic via state.rng.
  _steerPatrol(e, ai, intent, state, dt) {
    if (state.rng() < dt * 0.5) ai._wanderAng = wrapAngle(ai._wanderAng + (state.rng() - 0.5) * 1.4);
    let gx = Math.cos(ai._wanderAng), gz = Math.sin(ai._wanderAng);
    // leash back toward home if we drifted far
    const hx = ai.home.x - e.pos.x, hz = ai.home.z - e.pos.z;
    const hd = Math.hypot(hx, hz);
    if (hd > 700) { gx = hx / hd; gz = hz / hd; ai._wanderAng = Math.atan2(gz, gx); }
    intent.aimAngle = Math.atan2(gz, gx);
    this._drive(e, intent, gx, gz, 0.35);
  },

  // ---- firing decision ----------------------------------------------------

  _maybeFire(e, data, intent, predAng, dist, arch) {
    if (dist > arch.attackR) return;
    // flee'd-out / low-hull non-trader ships stop firing under ~25% hull (per spec).
    const hullFrac = e.hullMax > 0 ? e.hull / e.hullMax : 1;
    if (!arch.alwaysFlee && hullFrac < 0.25) return;
    // only pull the trigger when actually pointed at the lead point (avoids wild misses).
    const off = Math.abs(wrapAngle(predAng - e.rot));
    if (off > FIRE_CONE) return;
    intent.fire = true;
    intent.fireGroup = 1;                          // group 1 = primary guns (weapons reads this)
  },

  // ---- helpers ------------------------------------------------------------

  _ensureIntent(data) {
    if (!data.intent) data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 };
    return data.intent;
  },

  // Representative projectile speed for lead prediction: use the NPC's first runtime weapon if the
  // ships module has populated data.weapons; else a sane default.
  _projSpeed(data) {
    const w = data.weapons && data.weapons[0];
    if (w && isFinite(w.projSpeed) && w.projSpeed > 0) return w.projSpeed;
    return 360;
  },

  _addThreat(targetId, attackerId, amount) {
    let tbl = this._threat.get(targetId);
    if (!tbl) { tbl = new Map(); this._threat.set(targetId, tbl); }
    tbl.set(attackerId, (tbl.get(attackerId) || 0) + amount);
  },

  _checkReinforcements(e, data, state) {
    const ai = data.ai;
    if (ai._calledReinforcements) return; // already called once

    // Look up enemy type definition to check for reinforcement config
    const lootTableId = data.lootTableId;
    if (!lootTableId) return;

    const hullFrac = e.hullMax > 0 ? e.hull / e.hullMax : 1;
    const reinforcements = data.reinforcements;
    if (!reinforcements) return;

    const threshold = reinforcements.hullThreshold || 0.3;
    if (hullFrac >= threshold) return;

    // Flag so we only call once
    ai._calledReinforcements = true;

    // Determine count using deterministic RNG
    const [minCount, maxCount] = reinforcements.count || [1, 2];
    const count = minCount + Math.floor(state.rng() * (maxCount - minCount + 1));

    // Emit alert to the player
    this.bus.emit('alert', { key: 'reinforcements', sev: 'danger', text: 'ENEMY CALLING REINFORCEMENTS', ttl: 3 });
    this.bus.emit('toast', { text: 'Hostile is calling for backup!', kind: 'danger', ttl: 3 });
    this.bus.emit('audio:cue', { id: 'ui_alert' });

    // Queue reinforcement spawns with a brief delay using the event bus
    const spawnPos = { x: e.pos.x, z: e.pos.z };
    const level = data.level || 1;
    const typeId = reinforcements.type || 'wasp_swarmer';

    // Store pending reinforcements on state for the update loop to process
    if (!state.combat.pendingReinforcements) state.combat.pendingReinforcements = [];
    for (let i = 0; i < count; i++) {
      const angle = state.rng() * Math.PI * 2;
      const dist = 180 + state.rng() * 120; // spawn 180-300 units away
      state.combat.pendingReinforcements.push({
        typeId,
        level,
        pos: { x: spawnPos.x + Math.cos(angle) * dist, z: spawnPos.z + Math.sin(angle) * dist },
        spawnAt: state.simTime + 1.5 + state.rng() * 1.0, // 1.5-2.5s delay
        callerId: e.id,
      });
    }
  },

  // Iterative intercept solve (§ LEAD/INTERCEPT). Returns the world angle to aim at so a projectile
  // of speed `p` fired now hits the moving target. Falls back to direct aim if uncatchable.
  _leadAngle(shooter, target, p) {
    const rx = target.pos.x - shooter.pos.x, rz = target.pos.z - shooter.pos.z;
    const rvx = target.vel.x - shooter.vel.x, rvz = target.vel.z - shooter.vel.z;
    if (!isFinite(p) || p <= 0) return Math.atan2(rz, rx);
    const a = rvx * rvx + rvz * rvz - p * p;
    const b = 2 * (rx * rvx + rz * rvz);
    const c = rx * rx + rz * rz;
    let t = 0;
    if (Math.abs(a) < 1e-6) {
      if (Math.abs(b) > 1e-6) t = -c / b;
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
        t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
        if (!isFinite(t)) t = 0;
      }
    }
    if (t <= 0) return Math.atan2(rz, rx);         // can't catch: aim straight at it
    const aimX = rx + rvx * t, aimZ = rz + rvz * t;
    return Math.atan2(aimZ, aimX);
  },
};

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function simTime(state) {
  return Number.isFinite(state && state.simTime) ? state.simTime : 0;
}

function rng(state) {
  return state && typeof state.rng === 'function' ? state.rng() : 0;
}

function isAttackState(state) {
  return state === S.ATTACK || state === S.STRAFE;
}

function weaponDps(w) {
  if (!w) return 0;
  if (Number.isFinite(w.dps)) return w.dps;
  const dmg = Number.isFinite(w.dmg) ? w.dmg : 0;
  const rof = Number.isFinite(w.rof) ? w.rof : 0;
  return dmg * rof;
}

function formationGroupId(ai) {
  if (!ai) return null;
  return ai.squadId || ai.wingId || ai.groupId || ai.patrolGroupId || null;
}

function chooseFormationLeader(members) {
  const sorted = members.slice().sort((a, b) => {
    const ar = roleRank(a), br = roleRank(b);
    if (ar !== br) return ar - br;
    return compareIds(a.id, b.id);
  });
  return sorted[0];
}

function roleRank(e) {
  const ai = e && e.data && e.data.ai;
  const role = String((ai && (ai.preferredRole || ai.role)) || '').toLowerCase();
  return role === 'leader' ? 0 : 1;
}

function wedgeSlotFor(leader, index) {
  const pairIndex = index - 1;
  const rank = Math.floor(pairIndex / 2) + 1;
  const side = pairIndex % 2 === 0 ? -1 : 1;
  const angle = (leader.rot || 0) + Math.PI + side * WEDGE_SLOT_ANGLE;
  const dist = WEDGE_SLOT_DIST * rank;
  return {
    x: leader.pos.x + Math.cos(angle) * dist,
    z: leader.pos.z + Math.sin(angle) * dist,
  };
}

function compareIds(a, b) {
  const an = Number(a), bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  return String(a).localeCompare(String(b));
}

function currentSector(state) {
  const world = state && state.world;
  const id = world && world.currentSectorId;
  return id && world && world.sectors ? world.sectors[id] : null;
}

function currentSectorSecurity(state) {
  const sector = currentSector(state);
  return Number.isFinite(sector && sector.security) ? sector.security : 1;
}

function currentSectorTier(state) {
  const sector = currentSector(state);
  return Number.isFinite(sector && sector.tier) ? sector.tier : 0;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function playerIsInLaneDanger(state, player) {
  const active = state && state.world && state.world.activeSector;
  const gates = active && Array.isArray(active.gates) ? active.gates : [];
  const hazards = active && Array.isArray(active.hazards) ? active.hazards : [];
  if (!player || !player.pos) return false;
  const inner2 = LANE_CONTEXT_INNER_R * LANE_CONTEXT_INNER_R;
  const outer2 = LANE_CONTEXT_OUTER_R * LANE_CONTEXT_OUTER_R;
  for (const gate of gates) {
    if (!gate || !gate.pos) continue;
    const dx = player.pos.x - gate.pos.x;
    const dz = player.pos.z - gate.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= inner2 && d2 <= outer2) return true;
  }
  for (const hazard of hazards) {
    if (!hazard || !hazard.center || !Number.isFinite(hazard.radius)) continue;
    const dx = player.pos.x - hazard.center.x;
    const dz = player.pos.z - hazard.center.z;
    const r = Math.max(0, hazard.radius);
    if (dx * dx + dz * dz <= r * r) return true;
  }
  return false;
}

function shipNameFor(e) {
  const data = e && e.data || {};
  return e && (e.name || data.name || data.shipName || data.callsign || data.callSign || data.defId || data.shipClass) || 'Unknown Contact';
}

function cargoIdsForPanic(data) {
  const out = [];
  collectLootCargo(out, data && data.loot && data.loot.guaranteed);
  collectLootCargo(out, data && data.loot && data.loot.drops);
  return out.length ? out : PIRATE_FLEE_CARGO;
}

function collectLootCargo(out, entries) {
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    if (entry && typeof entry.id === 'string' && entry.id.startsWith('cmdty_')) out.push(entry.id);
  }
}
