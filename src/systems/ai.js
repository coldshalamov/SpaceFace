// AI system: per-NPC steering + FSM (idle/patrol -> pursue -> attack/strafe -> flee) that writes
// entity.data.intent = {moveX,moveZ,boost,fire,fireGroup,aimAngle} each tick (ARCHITECTURE §2.3 step 2).
// flight consumes movement (moveX/moveZ/boost/aimAngle); weapons consumes fire/fireGroup.
// Default hostility: team 1 (NPC) targets the player (team 0). Behaviour varies by
// entity.data.ai.archetype (swarmer/sniper/brawler/fleeing_trader/pirate/miniboss_capital).
// Deterministic: uses state.rng for any randomness (never Math.random in sim logic, §0.5).
import { wrapAngle } from '../core/rng.js';
import { makeEnemySpawnSpec } from './combat.js';

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

export const ai = {
  name: 'ai',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
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
    const list = (state.entityIndex && state.entityIndex.aiShips) || state.entityList;
    const player = state.entities.get(state.playerId) || null;

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
      const data = e.data;
      if (!data || !data.ai) continue;          // only entities the spawner tagged as AI ships
      // Passive freighters (ambient traffic, V2 §28b) drive themselves via data.intent from the
      // traffic system — skip the combat FSM so they never acquire/attack/strafe. They can still be
      // attacked (piracy -> heat), they just don't initiate.
      if (data.ai.passive) continue;
      this._think(e, data, state, player, dt);
    }
  },

  // ---- core per-NPC tick -------------------------------------------------

  _think(e, data, state, player, dt) {
    const ai = data.ai;
    const arch = ARCH[ai.archetype] || ARCH[data.archetype] || ARCH.default;

    // Per-NPC bookkeeping (lazily initialised; survives across ticks on data.ai).
    if (ai.fsm == null) ai.fsm = S.IDLE;
    if (ai._t == null) ai._t = 0;                 // time accumulator (for retarget cadence)
    if (ai._lostT == null) ai._lostT = 0;         // time since target last seen
    if (ai._retarget == null) ai._retarget = 0;
    if (ai._wanderAng == null) ai._wanderAng = e.rot;
    if (ai.home == null) ai.home = { x: e.pos.x, z: e.pos.z };
    ai._t += dt;

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
    if (next !== ai.fsm) {
      const from = ai.fsm; ai.fsm = next;
      this.bus.emit('ai:stateChange', { npcId: e.id, from, to: next });
    }

    // --- produce intent for this state ---
    const intent = this._ensureIntent(data);
    intent.boost = false;
    intent.fire = false;
    intent.fireGroup = null;
    intent.aimAngle = target ? predAng : e.rot;

    switch (ai.fsm) {
      case S.PATROL:
      case S.IDLE:
        this._steerPatrol(e, ai, intent, state, dt);
        break;
      case S.PURSUE:
        this._steerToward(e, intent, toAng, 1, dist, e.pos, dx, dz);
        intent.boost = !!arch.boostChase && dist > arch.pref * 2;
        break;
      case S.ATTACK:
        this._steerHold(e, intent, target, arch, dist, dx, dz, predAng);
        this._maybeFire(e, data, intent, predAng, dist, arch);
        break;
      case S.STRAFE:
        this._steerStrafe(e, ai, intent, arch, dist, dx, dz, predAng, state);
        this._maybeFire(e, data, intent, predAng, dist, arch);
        break;
      case S.FLEE:
        this._steerFlee(e, intent, dx, dz);
        // Face directly away so forward thrust (full power, not the halved reverse) opens the gap.
        if (target) intent.aimAngle = Math.atan2(-dz, -dx);
        intent.boost = true;
        // Trader/PD types only shoot when truly cornered (very close).
        if (!arch.defensiveOnly || dist < 160) this._maybeFire(e, data, intent, predAng, dist, arch);
        break;
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
      let score = threat + 50 / (1 + dist / 100);
      if (cand.id === state.playerId) score += 20;     // bias toward the player (§ AGGRO TARGET SELECT)
      if (score > bestScore) { bestScore = score; best = cand; }
    };

    // Fast path: most NPCs only care about the player; still scan neighbours for threat sources.
    consider(player);
    if (this.helpers && this.helpers.queryRadius) {
      const near = this.helpers.queryRadius(e.pos, arch.sensor);
      for (const c of near) consider(c);
    }
    return best;
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
