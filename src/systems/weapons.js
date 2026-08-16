// Weapons system (ARCHITECTURE §2.3 step 4 — runs after ai/flight, before physics.integrate).
// Per tick: cool down + dissipate heat on every weapon instance, steer in-flight homing
// projectiles, build/decay missile locks, then fire — for the player (state.input.fire / group 1)
// and for each NPC ship whose ai-written intent.fire is set. Each firing weapon is gated on
// cooldown + capacitor + heat (+ lock for missiles, +arc for turrets), spends cap, adds heat,
// and spawns a projectile entity via helpers.spawnEntity. Continuous (beam) weapons drain cap/heat
// while firing and push a transient ray into state.combat.beams; their DAMAGE is combat's job,
// not ours. We emit ONLY combat:fire (+ combat:beamStop on release). Damage application and
// projectile:hit/combat:damage are owned by physics + combat.
import { WEAPONS } from '../data/weapons.js';
import { wrapAngle } from '../core/rng.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import {
  resolveWeaponImpulseForHit,
  readRecentImpulseProvenance,
  readRecentImpulseProvenanceHistory,
  recordImpulseProvenance,
} from '../combat/impulseKernel.js';
import { writePhysicsControl } from '../core/physicsAuthority.js';
import { isHostileToPlayer } from './scanner.js';
import { combatFlag, massline2Flag } from '../data/featureFlags.js';
import {
  aimTrueProjectileVelocity, solveTetherLeadSolution, solutionToleranceRad, orbitalConstraintState,
  masslineOwnsGuns,
} from '../combat/tetherFireControl.js';
import { presentationAllowsPlayerFacingAction } from '../core/presentationAdmission.js';
import { selectedMountedHeavyPart } from '../combat/heavyParts.js';

const RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const NPC_FIRE_PLAYER_RADAR_RANGE = 4000;

// SF-10 RCS disruptor. A hit leaves the PQ-009 provenance tag 'rcs_disruptor_spike'; weapons latches
// a suppression window off it only while that tag is fresh (RCS_TRIGGER_MAXAGE_TICKS), so a later hit
// from another weapon cannot silently extend the disable. The override copies the tumbleStates
// pattern — a last-writer force/torque-0 control command — but delivers NO entry spin, so a disrupted
// hull DRIFTS straight (its identity) instead of tumbling (the concussion cannon's throw payoff).
const RCS_TRIGGER_MAXAGE_TICKS = 8;
const RCS_DISRUPT_CONTROL = Object.freeze({
  mode: 'rcs_disrupted',
  force: Object.freeze({ x: 0, y: 0, z: 0 }),
  torque: Object.freeze({ x: 0, y: 0, z: 0 }),
  source: 'rcs_disruptor',
});

// A data-authored impulse weapon may reserve a short post-hit drift beat for NPCs. The fresh
// provenance receipt selects the weapon def; no weapon-id branch or serialized status is needed.
const NPC_COUNTERTHRUST_TRIGGER_MAXAGE_TICKS = 8;
const NPC_COUNTERTHRUST_RECOVERY_CONTROL = Object.freeze({
  mode: 'concussion_recovery',
  force: Object.freeze({ x: 0, y: 0, z: 0 }),
  torque: Object.freeze({ x: 0, y: 0, z: 0 }),
  source: 'weapon_impulse_recovery',
});

// MissileV2 (BP-02, flag `combat.missileV2` — OFF in the golden): a missile burns fuel for a fixed
// window, then the motor dies and it coasts ballistically ("break-and-coast"). While the motor burns,
// its seeker only tracks a target that stays within its forward cone/range — juke behind the missile
// and it loses the solution (real counterplay). All geometric/kinematic; draws no RNG.
const MISSILE_FUEL_S = 6.0;              // motor burn window
const MISSILE_SEEKER_CONE = 100 * RAD;   // seeker half-cone off the missile's heading
const MISSILE_SEEKER_RANGE = 2000;       // wu — beyond this the seeker can't hold the solution
const MISSILE_COAST_DRAG = 16;           // wu/s^2 gentle speed bleed after burnout

// Forced heat vent (Micro-Loops — "a red-bar gauge that forces a 2-second vent when it pegs").
// When the player's guns peg heatMax they lock out for WEAPON_VENT_S seconds while heat is dumped,
// turning sustained fire into a vent-and-resume rhythm. In a live browser, NPC mounts obey the same
// lockout for combat fairness; only the local player emits HUD/audio receipts. The headless 47-A
// replay remains unchanged behind the established browser-session guard.
// Player-facing weapon recharge pacing — cap/heat recover ~15% faster than the baseline authored
// rates so burst-and-recharge stays tactical without long dead-air waits.
const WEAPON_RECHARGE_MULT = 1.15;
const WEAPON_VENT_S = 2 / WEAPON_RECHARGE_MULT;
const WEAPON_VENT_DUMP = 1.6 * WEAPON_RECHARGE_MULT;
// Forced heat vent is AUTHORITATIVE combat behavior (lockout + heat dump). Gate on runtime features
// / process combat flags — never `typeof window` (N1: Node/browser must not diverge by host).
// legacy47a keeps weaponHeatVent false so 47-A goldens stay stable; production enables it.
function isWeaponVentEnabled(state) {
  const features = state && state.runtime && state.runtime.features;
  return !!combatFlag('weaponHeatVent', features);
}

const DEG2 = WEAPONS; // keep import referenced even if tree-shaken oddly (no-op)

// The hostile ship/drone the player's Massline currently owns the guns for, or null. One rule,
// shared with combat/autoTargetMode via masslineOwnsGuns, so the fire path, the missile lock and the
// reticle lead cannot end up pointing at three different ships. Module-level (not a method) so the
// solution helpers stay callable against a minimal { helpers } host.
function masslineGunTarget(helpers, player, state) {
  const tether = state.player && state.player.tether;
  if (!tether || tether.targetId == null || !helpers) return null;
  const target = helpers.getEntity(tether.targetId);
  if (!target) return null;
  return masslineOwnsGuns(tether, target, isHostileToPlayer(target, player.team, state))
    ? target
    : null;
}

export const weapons = {
  name: 'weapons',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;

    // Catalog lookup by weapon def id (instance fields win, def fills the gaps).
    this._byId = new Map(WEAPONS.map((w) => [w.id, w]));

    // Own deterministic stream so firing never disturbs the core sim PRNG (§0.5).
    // H9: track seed0 + draw count on state so lab checkpoints cover this stream.
    this._bindWeaponsRng(null);

    // Track individual beam mounts so presentation can update one persistent beam per hardpoint.
    this._beamFiring = new Set();
    this._beamFiringPrev = new Set();
    this._beamActiveMeta = new Map();
    // SF-10 RCS-disruptor suppression windows, keyed by target entity. Transient (never serialized):
    // a WeakMap keyed on the live entity graph, so reloads bring fresh entities and an empty map.
    this._rcsDisrupt = new WeakMap();
    // The Concussion counterthrust delay follows the same transient/save-safe ownership model.
    this._npcCounterthrustRecovery = new WeakMap();
    this._diag = {
      autoFireSpatialQueries: 0,
      autoFireCandidates: 0,
    };
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    ensureWeaponRuntime(this);
    resetWeaponDiagnostics(this._diag);

    // Beams are transient per-tick rays; combat normally rebuilds state.combat.beams but may be a
    // stub this wave, so we clear it ourselves to keep it from growing unbounded.
    if (state.combat) {
      if (!Array.isArray(state.combat.beams)) state.combat.beams = [];
      else state.combat.beams.length = 0;
    }
    this._beamFiringPrev.clear();
    for (const ownerId of this._beamFiring) this._beamFiringPrev.add(ownerId);
    this._beamFiring.clear();

    // 1) cool/recharge every weapon instance + steer in-flight homing projectiles.
    this._tickWeapons(dt, state);
    this._steerHoming(dt, state);

    // 2) fire — player first, then NPC ships.
    const player = this.helpers.getEntity(state.playerId);
    if (player && player.alive && !player.flags.docked) {
      // Cruise charge/cruise blocks the player's own weapons (spec2/02 §1). NPC weapons keep firing.
      const cruise = state.player && state.player.cruise;
      const playerFireBlocked = cruise && (cruise.phase === 'charging' || cruise.phase === 'cruising');

      // Manual fire (LMB/Space) and the independent weapon cursor are the only default player
      // trigger/aim inputs. PQ-007 retired G's persistent locked-target aim; an old snapshot with
      // `input.autoFire=true` is deliberately inert here.
      // Cruise charge/cruise forces firing=false but still services the ship so beams release and
      // cooldowns/heat tick down (spec2/02 §1).
      let firing = false;
      let forcedTarget = null;
      if (!playerFireBlocked) {
        firing = !!state.input.fire;
        if (state.input.actions?.tetherFire) firing = false;
      }
      // Massline tether-lock fire control (§3.1, flag massline2.fireControl — OFF in the node
      // golden): a line on a hostile IS the firing solution. The constrained-motion solver owns
      // the aim (no G toggle needed, selection stays free for throw aims), and held fire only
      // releases rounds on solution frames (gate applied per-mount in _serviceProjectileWeapon),
      // so sustained LMB reads as the guns tracking rather than spraying.
      let tetherGate = null;
      if (massline2Flag('fireControl')) {
        tetherGate = this._tetherFireSolution(player, state);
        if (tetherGate) {
          forcedTarget = tetherGate.target;
        }
      }
      // Plan 14 component selection resolves to a live physical child. Massline fire-control still
      // wins while it owns the guns; otherwise every mount solves against the selected body.
      if (!forcedTarget) forcedTarget = selectedMountedHeavyPart(state, this.helpers);
      // MIXED BATTERY (auto-aim path). state.input.aimAngle can carry exactly one lead solution and
      // it is the PRIMARY mount's — so pulse/autocannon/railgun all gimbaled to the pulse's 320
      // intercept and two thirds of the battery knowingly fired short. Handing the auto-target down
      // as the forced target makes each mount re-solve at its own projectile speed
      // (_serviceProjectileWeapon below), and lets hitscan beams drop the lead entirely.
      // `input.autoAim` is written ONLY by combat/autoTargetMode.tickAutoTarget, so a cursor aim the
      // player set by hand is never re-led behind their back.
      if (!forcedTarget) {
        const autoAim = state.input && state.input.autoAim;
        if (autoAim && autoAim.targetId != null) {
          const autoTarget = this.helpers.getEntity(autoAim.targetId);
          if (autoTarget && autoTarget.alive && autoTarget.pos) forcedTarget = autoTarget;
        }
      }
      const aimAngle = tetherGate
        ? tetherGate.angle
        : (state.input.aimAngle || player.rot);
      // Transient mirror of WHAT THE GUNS ARE ACTUALLY SHOOTING AT, written by the system that owns
      // firing (single-owner rule: HUD reads, we write). It differs from state.player.targetId
      // exactly when the Massline has claimed the guns, which is precisely the case a target panel
      // must not describe wrongly. Never serialized — recomputed every tick, and written only under
      // the same flag as the rule it reports, so the key never appears in the 47-A snapshot hash.
      if (massline2Flag('fireControl')) {
        state.player.gunTargetId = forcedTarget && forcedTarget.id != null
          ? forcedTarget.id
          : (state.player.targetId != null ? state.player.targetId : null);
      }
      this._serviceShip(player, firing, /*isPlayer*/ true, dt, state, aimAngle, forcedTarget, tetherGate);
    } else if (state.player && state.player.gunTargetId != null) {
      state.player.gunTargetId = null;
    }
    const ships = (state.entityIndex && state.entityIndex.ships) || state.entityList;
    for (const e of ships) {
      if (e.type !== 'ship' || !e.alive || e.id === state.playerId) continue;
      const intent = e.data && e.data.intent;
      const firing = !!(intent && intent.fire)
        && presentationAllowsPlayerFacingAction(e, state);
      // NPC aim = its intent aimAngle (already a lead/intercept angle from ai.js). fall back to nose.
      const aimAngle = (intent && intent.aimAngle != null) ? intent.aimAngle : e.rot;
      this._serviceShip(e, firing, false, dt, state, aimAngle, null);
    }

    // 3) beam release → one precise stop receipt for each mount that stopped firing.
    this._emitStoppedBeams();
    // 4) physics-weapon consequences (SF-10): tick deployed vector mines (arm → proximity → radial
    // impulse), the Concussion post-hit drift beat, and RCS-disruptor turn-suppression windows. All
    // are strict no-ops in the node golden — they gate on weaponImpulseConsequences, which the 47a
    // scenario pins OFF — so they
    // cannot perturb the frozen sim hash. weapons is the last control-writer before physics, so the
    // disruptor's control override is the authoritative command for the tick.
    this._tickVectorMines(dt, state);
    this._tickNpcCounterthrustRecovery(state);
    this._tickRcsDisruption(state);
    state.weaponRuntime = state.weaponRuntime || {};
    state.weaponRuntime.diagnostics = this._diag;
  },

  // --- per-instance timers (cooldown, heat dissipation, lock decay) ---
  _tickWeapons(dt, state) {
    const ships = (state.entityIndex && (state.entityIndex.weaponShips || state.entityIndex.ships)) || state.entityList;
    for (const e of ships) {
      if (e.type !== 'ship' || !e.alive) continue;
      const ws = e.data && e.data.weapons;
      if (!ws) continue;
      for (const w of ws) {
        const def = this._byId.get(w.defId) || {};
        if (w._cooldown > 0) w._cooldown = Math.max(0, w._cooldown - dt);
        const dissip = (def.heatDissip != null ? def.heatDissip : (w.heatDissip || 0)) * WEAPON_RECHARGE_MULT;
        if (w._heat > 0 && dissip > 0) w._heat = Math.max(0, w._heat - dissip * dt);
      }
      // Forced-vent lockout (player only) — see WEAPON_VENT_S. Runs after the normal cooldown so a
      // freshly-pegged gun trips the vent this tick.
      this._tickVent(e, dt, state);
      // Missile lock build/decay lives on the ship's combat block.
      this._tickLock(e, dt);
    }
  },

  /**
   * H9: rebind weapons RNG from state.weaponsEntropy after save/load restore.
   * Call after loadEnvelope has written weaponsEntropy onto state.
   */
  restoreEntropyFromState() {
    const ent = this.state && this.state.weaponsEntropy;
    if (!ent || !Number.isFinite(ent.seed0)) return;
    this._bindWeaponsRng({ seed0: ent.seed0 >>> 0, draws: ent.draws | 0 });
  },

  _bindWeaponsRng(continuation) {
    const seed = (this.state && this.state.meta && this.state.meta.seed) || 1;
    const seed0 = continuation && Number.isFinite(continuation.seed0)
      ? (continuation.seed0 >>> 0)
      : (this.helpers.hash32(seed, 'weapons') >>> 0);
    const targetDraws = continuation && Number.isFinite(continuation.draws)
      ? (continuation.draws | 0)
      : 0;
    const base = this.helpers.mulberry32(seed0);
    let draws = 0;
    while (draws < targetDraws) {
      base();
      draws += 1;
    }
    this._rngSeed0 = seed0;
    this._rng = () => {
      draws += 1;
      const v = base();
      if (this.state) {
        this.state.weaponsEntropy = { seed0, draws, stream: 'weapons' };
      }
      return v;
    };
    if (this.state) {
      this.state.weaponsEntropy = { seed0, draws, stream: 'weapons' };
    }
  },

  // Forced heat vent: the instant any weapon pegs heatMax, lock every weapon out for
  // WEAPON_VENT_S seconds and dump heat fast so the guns visibly cool, then come back online. This
  // is the "2-second vent" rhythm beat. Live NPCs obey the same timer; player-only receipts drive HUD.
  _tickVent(e, dt, state) {
    if (!isWeaponVentEnabled(state || this.state)) return;
    const ws = e.data && e.data.weapons;
    if (!ws || !ws.length) return;
    const data = e.data;
    const now = state.simTime || 0;
    const wasVenting = now < (data.weaponVentUntil || 0);
    if (!wasVenting) {
      let pegged = null;
      for (const w of ws) {
        const def = this._byId.get(w.defId) || {};
        const heatMax = w.heatMax != null ? w.heatMax : def.heatMax;
        if (Number.isFinite(heatMax) && heatMax > 0 && (w._heat || 0) >= heatMax) { pegged = w; break; }
      }
      if (pegged) {
        this._beginVent(e, state, pegged);
      }
    }
    const venting = now < (data.weaponVentUntil || 0);
    if (venting) {
      for (const w of ws) {
        const def = this._byId.get(w.defId) || {};
        const heatMax = w.heatMax != null ? w.heatMax : def.heatMax;
        if ((w._heat || 0) > 0 && Number.isFinite(heatMax) && heatMax > 0) {
          w._heat = Math.max(0, w._heat - (heatMax / WEAPON_VENT_S) * WEAPON_VENT_DUMP * dt);
        }
      }
    } else if (data._weaponVenting && e.id === this.state.playerId) {
      this.bus.emit('weapons:vent', {
        ownerId: e.id,
        phase: 'end',
        endedAt: now,
      });
    }
    data._weaponVenting = venting;
  },

  _beginVent(e, state, weapon = null) {
    if (!isWeaponVentEnabled(state || this.state) || !e) return false;
    const now = state.simTime || 0;
    if (now < (e.data.weaponVentUntil || 0)) return false;
    const def = weapon && this._byId.get(weapon.defId) || {};
    const heatMax = weapon
      ? (weapon.heatMax != null ? weapon.heatMax : def.heatMax)
      : null;
    e.data.weaponVentUntil = now + WEAPON_VENT_S;
    e.data._weaponVenting = true;
    if (e.id === this.state.playerId) {
      this.bus.emit('weapons:vent', {
        ownerId: e.id,
        weaponId: weapon && weapon.defId || null,
        phase: 'start',
        startedAt: now,
        until: e.data.weaponVentUntil,
        heat: weapon && Number(weapon._heat) || 0,
        heatMax: Number.isFinite(heatMax) ? heatMax : null,
      });
    }
    return true;
  },

  _tickLock(e, dt) {
    const ws = e.data && e.data.weapons;
    const combat = e.data && e.data.combat;
    if (!ws || !combat) return;
    // Does this ship carry any lock-requiring weapon?
    let needsLock = false, lockTimeS = 1.2;
    for (const w of ws) {
      if (w.heavyPartDestroyed === true) continue;
      const def = this._byId.get(w.defId) || {};
      const tracking = w.tracking || def.tracking;
      if (tracking === 'homing') {
        needsLock = true;
        const lt = w.lockTimeS != null ? w.lockTimeS : def.lockTimeS;
        if (lt != null) lockTimeS = Math.min(lockTimeS, lt);
      }
    }
    if (!needsLock) { combat.lockProgress = 0; combat.lockTarget = null; return; }
    const tgt = this._resolveTarget(e);
    if (tgt && this._inLockCone(e, tgt)) {
      combat.lockTarget = tgt.id;
      combat.lockProgress = Math.min(1, (combat.lockProgress || 0) + dt / Math.max(0.05, lockTimeS));
    } else {
      // lock decays when target leaves the cone / is gone
      combat.lockProgress = Math.max(0, (combat.lockProgress || 0) - dt / Math.max(0.05, lockTimeS));
      if (combat.lockProgress <= 0) combat.lockTarget = null;
    }
  },

  _inLockCone(shooter, tgt) {
    const dx = tgt.pos.x - shooter.pos.x, dz = tgt.pos.z - shooter.pos.z;
    const ang = Math.atan2(dz, dx);
    return Math.abs(wrapAngle(ang - shooter.rot)) <= 25 * RAD; // lockConeDeg default 25°
  },

  // --- homing projectile steering (physics.integrate only does pos += vel*dt) ---
  _steerHoming(dt, state) {
    const missileV2 = combatFlag('missileV2');
    const projectiles = (state.entityIndex && state.entityIndex.projectiles) || state.entityList;
    for (const p of projectiles) {
      if (p.type !== 'projectile' || !p.alive) continue;
      const d = p.data;
      if (!d || d.kind !== 'missile') continue;
      if (!d.armed) { d.armed = true; }
      const tgt = d.targetId != null ? this.helpers.getEntity(d.targetId) : null;
      const turnRate = d.turnRate || 0;
      const speedMax = d.projSpeed || Math.hypot(p.vel.x, p.vel.z) || 1;
      let cur = Math.atan2(p.vel.z, p.vel.x);

      // Base guidance condition (legacy behavior when the flag is off — byte-identical to before).
      let guiding = !!(tgt && tgt.alive && turnRate > 0);
      let motorOn = true;
      if (missileV2) {
        // Fuel: burn for MISSILE_FUEL_S, then the motor dies and the missile coasts (no guidance).
        d.fuelS = (d.fuelS || 0) + dt;
        motorOn = d.fuelS < MISSILE_FUEL_S;
        if (!motorOn) {
          guiding = false;
        } else if (guiding) {
          // Seeker line-of-sight: hold the solution only while the target stays in the forward cone
          // and within seeker range. Break line of sight (juke behind it) and it flies straight.
          const toT = Math.atan2(tgt.pos.z - p.pos.z, tgt.pos.x - p.pos.x);
          const off = Math.abs(wrapAngle(toT - cur));
          const dx = tgt.pos.x - p.pos.x, dz = tgt.pos.z - p.pos.z;
          const inRange = (dx * dx + dz * dz) <= MISSILE_SEEKER_RANGE * MISSILE_SEEKER_RANGE;
          if (off > MISSILE_SEEKER_CONE || !inRange) guiding = false;
        }
      }

      if (guiding) {
        const desired = Math.atan2(tgt.pos.z - p.pos.z, tgt.pos.x - p.pos.x);
        const diff = wrapAngle(desired - cur);
        const step = Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
        cur = wrapAngle(cur + step);
      }
      // ramp speed up to the weapon's max projectile speed while the motor burns; after burnout
      // (missileV2 only) bleed speed gently so the coast reads as a spent, ballistic round.
      let sp = Math.hypot(p.vel.x, p.vel.z);
      if (missileV2 && !motorOn) {
        sp = Math.max(0, sp - MISSILE_COAST_DRAG * dt);
      } else {
        const accel = d.projAccel || 0;
        if (accel > 0) sp = Math.min(speedMax, sp + accel * dt);
        else sp = speedMax;
      }
      p.vel.x = Math.cos(cur) * sp;
      p.vel.z = Math.sin(cur) * sp;
      p.rot = cur;
    }
  },

  // Massline fire control solution for the local player (flag-gated by the caller). Returns
  // { target, targetId, angle, tolRad, constrained } when the player's tether is on a live
  // hostile ship/drone, else null. Pure read — never writes state.player.targetId, so Tab
  // selection stays free for throw aiming while the guns own the tethered hostile.
  //
  // GATE: geometry, not rope tension. This used to require phase ∈ {capture, loaded, overload} and
  // bail otherwise — but a TIGHT ORBIT sits inside rest length, so it reports `slack`, so the
  // circular solver written for exactly that case was switched off precisely when the player was
  // performing the signature Massline move. A linear lead against a body on an arc misses
  // systematically, always to the outside. orbitalConstraintState() asks the real question (is it
  // going AROUND me, fast enough for the arc to bend inside a bullet's flight?), and a negative
  // answer now yields a LINEAR solution rather than null — so a straight tow still keeps the guns
  // on the hostile you are holding instead of handing them back to whatever ship is nearest.
  _tetherFireSolution(player, state, projSpeed = null) {
    const target = masslineGunTarget(this.helpers, player, state);
    if (!target) return null;
    const tetherPhase = (state.player && state.player.tether && state.player.tether.phase) || 'slack';
    const orbit = orbitalConstraintState(player, target);
    const speed = Number.isFinite(projSpeed) && projSpeed > 0
      ? projSpeed : this._playerProjectileSpeed(player);
    const sol = solveTetherLeadSolution(player, target, speed, { taut: orbit.constrained });
    const dist = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
    return {
      target,
      targetId: target.id,
      angle: sol.angle,
      tolRad: solutionToleranceRad(target.radius, dist),
      constrained: sol.constrained,
      omega: orbit.omega,
      // Reported for receipts only — nothing branches on the rope's tension phase any more.
      taut: tetherPhase === 'capture' || tetherPhase === 'loaded' || tetherPhase === 'overload',
    };
  },

  // --- fire all weapons on a ship if it is firing this tick ---
  // aimAngle: the world angle to gimbal/turret toward (player mouse aim or NPC lead).
  // forceTarget: an explicit target entity (Massline tether / missile-lock); null = selected target.
  // fireGate: massline tether-lock solution (player only, flag-gated) — fixed mounts withhold
  // off-solution rounds; turrets aim the constrained solution instead of the linear lead.
  _serviceShip(e, firing, isPlayer, dt, state, aimAngle, forceTarget, fireGate = null) {
    const ws = e.data && e.data.weapons;
    if (!ws || !ws.length) return;
    if (firing && !isPlayer && !npcFireTargetVisibleOnPlayerRadar(e, state)) firing = false;
    // Forced heat vent (player): while venting, all weapons are locked out — projectiles gate on
    // `firing`, and beams see canFire=false and cool. weaponVentUntil is only ever set for the player.
    if (firing && (state.simTime || 0) < (e.data.weaponVentUntil || 0)) firing = false;
    const cap = typeof e.cap === 'number' ? e.cap : (e.data.derived && e.data.derived.cap) || 0;
    let capLeft = cap;
    if (aimAngle == null) aimAngle = e.rot;
    for (const w of ws) {
      const def = this._byId.get(w.defId) || {};
      const continuous = w.continuous != null ? w.continuous : def.continuous;
      // DEPLOY verb (SF-10 vector mine): a third fire path alongside projectile + beam. It lobs a
      // deployable that later detonates into a radial impulse; the weapon spends cap/heat here.
      const deploy = (w.tracking || def.tracking) === 'deploy';
      if (continuous) {
        capLeft = this._serviceBeam(e, w, def, firing, capLeft, dt, state, aimAngle, forceTarget, fireGate);
      } else if (deploy) {
        if (firing) capLeft = this._serviceDeployWeapon(e, w, def, isPlayer, capLeft, state, aimAngle);
      } else if (firing) {
        capLeft = this._serviceProjectileWeapon(e, w, def, isPlayer, capLeft, dt, state, aimAngle, forceTarget, fireGate);
      }
    }
    // write the drained capacitor back (cap pool is ours to spend; regen is combat's, §0.6 note)
    if (typeof e.cap === 'number') e.cap = capLeft;
  },

  // Continuous beam: drain cap/heat while firing, push a transient ray, emit combat:fire/beamStop.
  // Damage application is combat's responsibility (we only mark the ray + spend resources).
  _serviceBeam(e, w, def, firing, capLeft, dt, state, aimAngle, forceTarget = null, fireGate = null) {
    const energyCost = w.energyCost != null ? w.energyCost : def.energyCost || 0; // cap/s
    const heatPerSec = w.heatPerSec != null ? w.heatPerSec : def.heatPerSec || 0;
    const heatMax = w.heatMax != null ? w.heatMax : def.heatMax || Infinity;
    const range = w.range != null ? w.range : def.range || 0;
    const overheated = (w._heat || 0) >= heatMax;
    let beamAim = aimAngle;
    let solutionBlocked = false;
    if (!fireGate && forceTarget && forceTarget.pos) {
      // Hitscan has no travel time. A mixed battery may have computed the ship-level aim angle for
      // a slow projectile; carrying that lead into a beam knowingly fires ahead of the target.
      beamAim = Math.atan2(forceTarget.pos.z - e.pos.z, forceTarget.pos.x - e.pos.x);
    } else if (fireGate && fireGate.target && fireGate.target.pos) {
      beamAim = Math.atan2(fireGate.target.pos.z - e.pos.z, fireGate.target.pos.x - e.pos.x);
      const bareDir = this._hardpointDir(e, w, beamAim, 0);
      solutionBlocked = Math.abs(wrapAngle(bareDir - beamAim)) > fireGate.tolRad;
    }
    const canFire = firing && !solutionBlocked && !overheated && capLeft >= energyCost * dt;
    if (!canFire) {
      // cool while not firing
      if (!firing) {
        const dissip = (def.heatDissip != null ? def.heatDissip : (w.heatDissip || 0)) * WEAPON_RECHARGE_MULT;
        if (w._heat > 0 && dissip > 0) w._heat = Math.max(0, w._heat - dissip * dt);
      }
      return capLeft;
    }
    capLeft -= energyCost * dt;
    w._heat = (w._heat || 0) + heatPerSec * dt;
    if (w._heat >= heatMax) w._heat = heatMax;

    // A continuous beam still originates from its hardpoint facing and gimbal-assists toward aim.
    const dir = this._hardpointDir(e, w, beamAim != null ? beamAim : e.rot, 0);
    const origin = this._muzzle(e, w, dir);
    const to = { x: origin.x + Math.cos(dir) * range, z: origin.z + Math.sin(dir) * range };
    const damage = (w.dmg != null ? w.dmg : def.dmg || 0) * dt;
    const damageType = w.damageType || def.damageType || 'energy';
    if (state.combat && Array.isArray(state.combat.beams)) {
      state.combat.beams.push({
        ownerId: e.id, factionId: e.factionId, weaponId: w.defId,
        from: { x: origin.x, z: origin.z }, to,
        dmgType: damageType,
        dpsThisTick: damage,
        damagePacket: buildWeaponDamagePacket(w, def, damage, damageType),
      });
    }
    const beamKey = `${String(e.id)}:${Number.isFinite(w.slotIndex) ? w.slotIndex : 0}`;
    const phase = this._beamFiringPrev.has(beamKey) ? 'update' : 'begin';
    this._beamFiring.add(beamKey);
    let beamMeta = this._beamActiveMeta.get(beamKey);
    if (!beamMeta) {
      beamMeta = {
        beamKey,
        ownerId: e.id,
        weaponId: w.defId,
        hardpointIdx: w.slotIndex,
      };
      this._beamActiveMeta.set(beamKey, beamMeta);
    }
    this.bus.emit('combat:fire', {
      ownerId: e.id, weaponId: w.defId, hardpointIdx: w.slotIndex,
      origin, from: origin, to, dir, range, damageType,
      beamKey, continuous: true, phase,
    });
    return capLeft;
  },

  _emitStoppedBeams() {
    for (const beamKey of this._beamFiringPrev) {
      if (this._beamFiring.has(beamKey)) continue;
      const meta = this._beamActiveMeta.get(beamKey);
      if (meta) {
        let ownerStillFiring = false;
        for (const activeKey of this._beamFiring) {
          const active = this._beamActiveMeta.get(activeKey);
          if (active && active.ownerId === meta.ownerId) {
            ownerStillFiring = true;
            break;
          }
        }
        this.bus.emit('combat:beamStop', { ...meta, continuous: true, phase: 'end', ownerStillFiring });
        this._beamActiveMeta.delete(beamKey);
      }
    }
  },

  // Projectile weapon: gate on cooldown/cap/heat (+lock/+arc), spawn a projectile, emit combat:fire.
  _serviceProjectileWeapon(e, w, def, isPlayer, capLeft, dt, state, aimAngle, forceTarget, fireGate = null) {
    if ((w._cooldown || 0) > 0) return capLeft;

    const energyCost = w.energyCost != null ? w.energyCost : def.energyCost || 0;
    if (capLeft < energyCost) return capLeft;

    // Prefer instance heat when authored (ships.makeWeaponRuntime copies heatPerShot → heat).
    // Treat heatMax as inactive when there is no positive heat cost so default heatMax:100 on
    // non-heat weapons cannot invent a false lockout path.
    const heatPerShot = (() => {
      if (w.heat != null && Number.isFinite(w.heat) && w.heat > 0) return w.heat;
      if (def.heatPerShot != null && Number.isFinite(def.heatPerShot)) return def.heatPerShot;
      return 0;
    })();
    const heatMaxRaw = w.heatMax != null ? w.heatMax : (def.heatMax != null ? def.heatMax : Infinity);
    const heatMax = heatPerShot > 0 && Number.isFinite(heatMaxRaw) && heatMaxRaw > 0 ? heatMaxRaw : Infinity;
    if ((w._heat || 0) >= heatMax) return capLeft;            // overheated

    const tracking = w.tracking || def.tracking || 'fixed';
    const isMissile = tracking === 'homing';
    const isTurret = (w.facing === 'turret') || (tracking === 'auto_turret');
    const mountProjSpeed = w.projSpeed != null ? w.projSpeed : def.projSpeed || 1;
    // A mixed battery may carry shells, bolts, and plasma at different speeds. Re-solve for this
    // mount instead of reusing the representative primary-gun angle; otherwise every non-primary
    // round is knowingly released on the wrong intercept.
    let mountGate = null;
    if (fireGate && fireGate.target) {
      // Carry the ship-level geometry verdict, not a hard-coded `true`. Hard-coding it made every
      // mount solve a circle even on frames where the ship-level gate had already decided the pair
      // was NOT arcing (a straight tow), so the withhold gate and the round it released disagreed.
      mountGate = solveTetherLeadSolution(e, fireGate.target, mountProjSpeed, {
        taut: !!fireGate.constrained,
      });
      mountGate.targetId = fireGate.targetId;
      mountGate.tolRad = fireGate.tolRad;
    }

    // Targeting: missiles/turrets need a target (the forced auto-fire target, else the ship's selected).
    let tgt = (isMissile || isTurret) ? (forceTarget || this._resolveTarget(e)) : null;
    // Player turret with no selected target: synthesize a point-target along the aim direction at
    // weapon range so manual LMB still fires the turret toward the cursor (a fixed gun would gimbal
    // there; a turret should too). Missiles still require a real lockable target.
    if (!tgt && isTurret && isPlayer && !isMissile) {
      const r = (w.range != null ? w.range : def.range || 600);
      tgt = { pos: { x: e.pos.x + Math.cos(aimAngle) * r, z: e.pos.z + Math.sin(aimAngle) * r }, vel: { x: 0, z: 0 } };
    }

    let dir;
    if (isMissile) {
      // Missiles require a lock before launch.
      const combat = e.data && e.data.combat;
      const locked = combat && combat.lockTarget != null && (combat.lockProgress || 0) >= 1;
      if (!tgt || !locked) return capLeft;
      dir = Math.atan2(tgt.pos.z - e.pos.z, tgt.pos.x - e.pos.x);
    } else if (isTurret) {
      if (!tgt) return capLeft;
      // Tether-lock (massline2.fireControl): the constrained solution replaces the linear lead
      // when the turret is engaging the tethered hostile — one solver everywhere it matters.
      const aim = (mountGate && tgt && tgt.id != null && String(tgt.id) === String(mountGate.targetId))
        ? mountGate.angle
        : this._leadAngle(e, tgt, w.projSpeed != null ? w.projSpeed : def.projSpeed || 1);
      const arc = w.gimbalArc != null ? w.gimbalArc : (def.turretArcDeg ? def.turretArcDeg * RAD : Math.PI);
      // turret arc is measured about the hull centre; outside it the mount can't bear.
      if (Math.abs(wrapAngle(aim - e.rot)) > arc / 2) return capLeft;
      dir = aim;
    } else {
      // Tether-lock solution gate (massline2.fireControl, player only): withhold the round unless
      // the barrel — after gimbal clamp, before spread — can actually lie on the solution this
      // frame. Cooldown/cap are NOT spent on withheld frames, so held fire "tracks" and every
      // released round is a hit candidate. Tolerance is the target-size-honest solution window
      // widened to at least the mount's own spread (a gate tighter than the spread would starve
      // fire without improving hits).
      if (mountGate) {
        const spreadRad = (def.spreadDeg != null ? def.spreadDeg : 0) * RAD;
        const gateTol = Math.max(mountGate.tolRad, spreadRad + 0.5 * RAD);
        const bareDir = this._hardpointDir(e, w, mountGate.angle, 0);
        if (Math.abs(wrapAngle(bareDir - mountGate.angle)) > gateTol) return capLeft;
      }
      // FIXED mount: base direction = nose + hardpoint facing offset, then gimbal-assist toward the
      // aim direction within the mount's gimbal arc. Spread is layered on last. This is the
      // Freelancer feel — front guns track the cursor up to a cone, then fire straight.
      let fixedAim = mountGate ? mountGate.angle : (aimAngle != null ? aimAngle : e.rot);
      if (!mountGate && forceTarget && forceTarget.pos) {
        fixedAim = this._leadAngle(e, forceTarget, mountProjSpeed);
      }
      dir = this._hardpointDir(e, w, fixedAim, def.spreadDeg != null ? def.spreadDeg : 0);
    }

    // --- commit: spend cap + heat, set cooldown ---
    capLeft -= energyCost;
    if (heatPerShot) {
      // The final accepted shot visibly pegs the gauge and explicitly starts the vent. The old
      // pre-fire `nextHeat > max` rejection silently ate trigger pulls just below the threshold,
      // while pre-service cooling could keep the separate vent detector from ever seeing 100%.
      w._heat = Math.min(heatMax, (w._heat || 0) + heatPerShot);
      if (w._heat >= heatMax) this._beginVent(e, state, w);
    }
    const rof = w.rof != null ? w.rof : def.rof || 0;
    w._cooldown = rof > 0 ? 1 / rof : 0.1;

    // consume missile lock so each missile needs a fresh lock
    if (isMissile && e.data.combat) { e.data.combat.lockProgress = 0; }

    this._spawnProjectile(e, w, def, dir, tgt, isMissile, state);

    const origin = this._muzzle(e, w, dir);
    this.bus.emit('combat:fire', {
      ownerId: e.id, weaponId: w.defId, hardpointIdx: w.slotIndex, origin, dir,
    });
    return capLeft;
  },

  _spawnProjectile(e, w, def, dir, tgt, isMissile, state) {
    const projSpeed = w.projSpeed != null ? w.projSpeed : def.projSpeed || 300;
    const projSpeedMin = w.projSpeedMin != null ? w.projSpeedMin : def.projSpeedMin;
    const range = w.range != null ? w.range : def.range || 600;
    const cf = Math.cos(dir), sf = Math.sin(dir);
    const r = e.radius || 1;

    // launch speed: missiles start slow and accelerate to projSpeed; bullets launch at projSpeed
    const launchSpeed = isMissile && projSpeedMin != null ? projSpeedMin : projSpeed;
    const muzzle = this._muzzle(e, w, dir);
    // Bullets compensate lateral shooter velocity so the aimed line remains the collision line.
    // Missiles keep full inertial launch; their guidance owns the post-launch correction.
    // BP-02 momentum inheritance (flag `combat.momentumInherit`, OFF everywhere this wave): when on,
    // bullets INHERIT the shooter's full velocity too — weighty strafing runs at the cost of aim-true
    // fire. A deliberate feel inversion kept behind a default-off flag so the golden (and normal play)
    // are unchanged; enable it only for playtesting.
    const vel = (isMissile || combatFlag('momentumInherit'))
      ? { x: cf * launchSpeed + e.vel.x, z: sf * launchSpeed + e.vel.z }
      : aimTrueProjectileVelocity(dir, launchSpeed, e.vel);

    // time-to-live is a backup cleanup only; physics enforces maxDistance spatially before hit
    // resolution, so inherited ship speed cannot turn a stray shot into a far-off friendly-fire hit.
    const worldSpeed = Math.hypot(vel.x, vel.z);
    const ttl = Math.max(0.25, range / Math.max(1, worldSpeed));

    const damage = (w.dmg != null ? w.dmg : def.dmg) || 0;
    const damageType = w.damageType || def.damageType || 'kinetic';
    const data = {
      damage,
      damageType,
      damagePacket: buildWeaponDamagePacket(w, def, damage, damageType),
      ownerId: e.id,
      weaponId: w.defId,
      kind: isMissile ? 'missile' : 'bullet',
      spawnPos: { x: muzzle.x, z: muzzle.z },
      maxDistance: range,
    };
    if (isMissile) {
      data.targetId = tgt ? tgt.id : null;
      data.turnRate = w.turnRate != null ? w.turnRate : def.turnRate || 0;
      data.projSpeed = projSpeed;
      // accelerate from launch speed to projSpeed over the projectile's flight
      data.projAccel = projSpeedMin != null ? Math.max(40, (projSpeed - projSpeedMin)) : 0;
      data.armed = true;
      if (def.splashRadius != null) data.splashRadius = def.splashRadius;
      const splashDmg = Number.isFinite(w.splashDmg) ? w.splashDmg : def.splashDmg;
      if (splashDmg != null) data.splashDmg = splashDmg;
    }

    this.helpers.spawnEntity({
      type: 'projectile',
      pos: muzzle,
      vel,
      rot: dir,
      radius: 0.7,
      mass: 0.1,
      team: e.team,
      ownerId: e.id,
      factionId: e.factionId,
      ttl,
      collides: true,
      data,
    });
  },

  // --- SF-10 DEPLOY verb: vector mine ------------------------------------------------------------
  // Fire a vector mine: gate on cooldown/cap/heat + the per-owner active-mine cap, spend cap/heat,
  // and lob a deployable that later detonates into a radial impulse. Deploy is meaningful only when
  // weapon impulse consequences are live (browser); the 47a golden pins the flag OFF, so a deploy
  // weapon can never spawn a mine there even if one were somehow fitted — keeping the sim hash frozen.
  _serviceDeployWeapon(e, w, def, isPlayer, capLeft, state, aimAngle) {
    void aimAngle;
    if (!combatFlag('weaponImpulseConsequences')) return capLeft;
    if ((w._cooldown || 0) > 0) return capLeft;
    const energyCost = w.energyCost != null ? w.energyCost : def.energyCost || 0;
    if (capLeft < energyCost) return capLeft;
    const heatPerShot = (w.heat != null && Number.isFinite(w.heat) && w.heat > 0) ? w.heat
      : (Number.isFinite(def.heatPerShot) ? def.heatPerShot : 0);
    const heatMaxRaw = w.heatMax != null ? w.heatMax : (def.heatMax != null ? def.heatMax : Infinity);
    const heatMax = heatPerShot > 0 && Number.isFinite(heatMaxRaw) && heatMaxRaw > 0 ? heatMaxRaw : Infinity;
    if ((w._heat || 0) >= heatMax) return capLeft;
    // Active-mine cap: refuse to deploy past mineMaxActive (the oldest is NOT auto-culled — the pilot
    // must let mines resolve, so placement stays deliberate rather than a spammed field).
    const maxActive = Math.max(1, def.mineMaxActive || 3);
    if (this._countOwnerVectorMines(state, e.id) >= maxActive) {
      if (isPlayer && this.bus) this.bus.emit('toast', { text: 'Mine bank full', kind: 'warn', ttl: 1.5 });
      return capLeft;
    }

    capLeft -= energyCost;
    if (heatPerShot) {
      w._heat = Math.min(heatMax, (w._heat || 0) + heatPerShot);
      if (w._heat >= heatMax) this._beginVent(e, state, w);
    }
    const rof = w.rof != null ? w.rof : def.rof || 0;
    w._cooldown = rof > 0 ? 1 / rof : 2;
    this._spawnVectorMine(e, w, def, state);
    return capLeft;
  },

  // Drop a stationary vector mine BEHIND the ship's heading (STEP 9 "deploy behind"). It sits where
  // dropped — the arm delay lets the deployer clear the blast — then arms and waits for a proximity
  // trigger. collides:false, so like an impulse charge it is a logical trigger volume, not a physics
  // body; its position is authored at spawn and never re-integrated (no motion writes at all).
  _spawnVectorMine(e, w, def, state) {
    const dir = (e.rot || 0) + Math.PI;
    const standoff = (e.radius || 6) + 6;
    const pos = { x: e.pos.x + Math.cos(dir) * standoff, z: e.pos.z + Math.sin(dir) * standoff };
    const now = state.simTime || 0;
    const mine = this.helpers.spawnEntity({
      type: 'vectormine',
      pos, vel: { x: 0, z: 0 }, rot: dir,
      radius: 1.6, mass: 0.6, collides: false,
      team: e.team, ownerId: e.id, factionId: e.factionId,
      data: {
        kind: 'vector_mine', weaponId: w.defId, ownerId: e.id,
        armAt: now + (def.mineArmS != null ? def.mineArmS : 1.4),
        dieAt: now + (def.mineLifeS != null ? def.mineLifeS : 30),
        triggerRadius: def.mineTriggerRadius != null ? def.mineTriggerRadius : 60,
        blastRadius: def.mineBlastRadius != null ? def.mineBlastRadius : 150,
        impulse: w.impulsePerHit != null ? w.impulsePerHit : (def.impulsePerHit || 600),
        provenance: def.impulseProvenance || 'vector_mine_pulse',
        armed: false, spawnedAt: now,
      },
    });
    if (this.bus) {
      this.bus.emit('combat:fire', { ownerId: e.id, weaponId: w.defId, hardpointIdx: w.slotIndex, origin: pos, dir, deploy: true });
      this.bus.emit('weapons:mineDeployed', { ownerId: e.id, mineId: mine && mine.id, weaponId: w.defId, pos });
    }
    return mine;
  },

  _countOwnerVectorMines(state, ownerId) {
    let n = 0;
    const list = state.entityList || [];
    for (const ent of list) {
      if (ent.type === 'vectormine' && ent.alive && ent.data && ent.data.ownerId === ownerId) n++;
    }
    return n;
  },

  // Per-tick vector-mine lifecycle: expire → arm → proximity trigger. Strict no-op in the golden
  // (flag pinned OFF). Proximity is a linear scan of the ship index, NOT a broadphase/spatial-hash
  // query (perf-budget constraint), and touches only mine.data — no entity motion is written here.
  _tickVectorMines(_dt, state) {
    if (!combatFlag('weaponImpulseConsequences')) return;
    const list = state.entityList;
    if (!list) return;
    const now = state.simTime || 0;
    const ships = (state.entityIndex && state.entityIndex.ships) || list;
    for (const mine of list) {
      if (mine.type !== 'vectormine' || !mine.alive) continue;
      const d = mine.data;
      if (!d) { mine.alive = false; continue; }
      if (now >= d.dieAt) {
        mine.alive = false;
        if (this.bus) this.bus.emit('weapons:mineExpired', { mineId: mine.id, ownerId: d.ownerId, pos: { x: mine.pos.x, z: mine.pos.z } });
        continue;
      }
      if (!d.armed) {
        if (now >= d.armAt) {
          d.armed = true;
          if (this.bus) this.bus.emit('weapons:mineArmed', { mineId: mine.id, ownerId: d.ownerId, pos: { x: mine.pos.x, z: mine.pos.z } });
        }
        continue;
      }
      const trigR = d.triggerRadius;
      let triggered = false;
      for (const s of ships) {
        if (!s.alive || (s.type !== 'ship' && s.type !== 'drone')) continue;
        const dx = s.pos.x - mine.pos.x, dz = s.pos.z - mine.pos.z;
        const rr = trigR + (s.radius || 0);
        if (dx * dx + dz * dz <= rr * rr) { triggered = true; break; }
      }
      if (triggered) this._detonateVectorMine(mine, d, state);
    }
  },

  // Detonation: a mass-scaled radial impulse to every ship/drone in the blast — INCLUDING the owner
  // (blast-yourself mobility). Zero hull damage (design Q9): no routeDamage, only the physics-authority
  // impulse request. Provenance is recorded so a mine-thrown ship that meets terrain is attributed to
  // the mine owner through the existing collision-consequence path. Rejected requests are skipped.
  _detonateVectorMine(mine, d, state) {
    const physics = this.helpers && this.helpers.combatPhysics;
    const pos = { x: mine.pos.x, z: mine.pos.z };
    const blastR = d.blastRadius;
    const hits = [];
    const ships = (state.entityIndex && state.entityIndex.ships) || state.entityList || [];
    for (const s of ships) {
      if (!s.alive || (s.type !== 'ship' && s.type !== 'drone')) continue;
      const dx = s.pos.x - pos.x, dz = s.pos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > blastR) continue;
      const falloff = Math.max(0, 1 - dist / blastR);
      if (falloff <= 0) continue;
      let dirX = 0, dirZ = 1;
      if (dist > 1e-4) { dirX = dx / dist; dirZ = dz / dist; }
      const mag = d.impulse * falloff;
      if (physics && typeof physics.applyImpulse === 'function') {
        const provenance = { actorId: d.ownerId == null ? null : d.ownerId, weaponId: d.weaponId, tag: d.provenance, appliedTick: state.tick };
        const accepted = physics.applyImpulse({
          entityId: s.id, impulse: { x: dirX * mag, z: dirZ * mag }, point: null,
          reason: 'vector_mine', tick: state.tick, provenance,
        });
        if (accepted !== false) recordImpulseProvenance(s, { ...provenance, magnitude: mag });
      }
      hits.push(s.id);
    }
    mine.alive = false;
    if (this.bus) {
      this.bus.emit('weapons:mineDetonated', {
        schemaVersion: 1, tick: state.tick, mineId: mine.id, ownerId: d.ownerId, weaponId: d.weaponId,
        pos, blastRadius: blastR, hits,
      });
      // Directional impulse ring + scatter — NOT a generic explosion ball (graphics-checkpoint reject
      // list). flashReduced:false lets vfxAccessibility resolve the reduced-flash variant downstream.
      this.bus.emit('presentation:vfxCue', {
        id: 'combat.vectorMine.detonate', lane: 'combat', particles: 30, lights: 1,
        magnitude: Math.max(0.6, blastR / 150), position: pos, material: 'impulse',
        sourceId: d.ownerId, targetId: null, flashReduced: false,
      });
      this.bus.emit('audio:cue', { id: 'sfx_vector_mine', position: pos, gain: 0.6 });
    }
  },

  // --- SF-10 Concussion cannon: bounded NPC counterthrust recovery ------------------------------
  // A direct impulse hit already writes velocity/torque through physics authority. This post-AI
  // control override only prevents an NPC from cancelling that displacement on the following tick;
  // it never touches velocity and never applies to the player. The window is authored on the weapon
  // def and anchored to appliedTick, so rereading the same provenance cannot extend it indefinitely.
  _tickNpcCounterthrustRecovery(state) {
    if (!combatFlag('weaponImpulseConsequences')) return;
    const ships = (state.entityIndex && state.entityIndex.ships) || state.entityList;
    if (!ships) return;
    const tick = state.tick || 0;
    if (!this._npcCounterthrustRecovery) this._npcCounterthrustRecovery = new WeakMap();
    for (const s of ships) {
      if (!s || s.type !== 'ship' || !s.alive || s.id === state.playerId) continue;
      const history = readRecentImpulseProvenanceHistory(s, tick, NPC_COUNTERTHRUST_TRIGGER_MAXAGE_TICKS);
      let maxUntil = -1;
      for (const prov of history) {
        const def = this._byId.get(prov.weaponId);
        const delayS = def && def.npcCounterthrustDelayS;
        if (Number.isFinite(delayS) && delayS > 0 && prov.tag === def.impulseProvenance) {
          const windowTicks = Math.max(1, Math.round(delayS * 60));
          maxUntil = Math.max(maxUntil, prov.appliedTick + windowTicks);
        }
      }
      const cur = this._npcCounterthrustRecovery.get(s);
      if (maxUntil >= tick && (!cur || maxUntil > cur.until)) {
        this._npcCounterthrustRecovery.set(s, { until: maxUntil });
      }
      const latch = this._npcCounterthrustRecovery.get(s);
      if (!latch) continue;
      if (tick > latch.until) { this._npcCounterthrustRecovery.delete(s); continue; }
      writePhysicsControl(s, NPC_COUNTERTHRUST_RECOVERY_CONTROL);
    }
  },

  // --- SF-10 RCS disruptor: bounded turn-authority suppression -----------------------------------
  // weapons runs last before physics, so writing a force/torque-0 control here overwrites the AI's
  // queued command for the window (the tumbleStates pattern). The window is TRIGGERED off the PQ-009
  // provenance an RCS-disruptor hit leaves ('rcs_disruptor_spike') and then LATCHED, so a subsequent
  // hit from another weapon cannot cut it short. Strict no-op in the golden (flag pinned OFF); the
  // local player is never a target. Reads provenance with the default (non-destructive) max age so it
  // never evicts the record collisionConsequences also depends on.
  _tickRcsDisruption(state) {
    if (!combatFlag('weaponImpulseConsequences')) return;
    const ships = (state.entityIndex && state.entityIndex.ships) || state.entityList;
    if (!ships) return;
    const tick = state.tick || 0;
    if (!this._rcsDisrupt) this._rcsDisrupt = new WeakMap();
    for (const s of ships) {
      if (!s || s.type !== 'ship' || !s.alive || s.id === state.playerId) continue;
      const prov = readRecentImpulseProvenance(s, tick);
      if (prov && prov.tag === 'rcs_disruptor_spike' && (tick - prov.appliedTick) <= RCS_TRIGGER_MAXAGE_TICKS) {
        const def = this._byId.get(prov.weaponId);
        const windowTicks = Math.max(1, Math.round((def && def.rcsDisruptS != null ? def.rcsDisruptS : 1.6) * 60));
        const until = prov.appliedTick + windowTicks;
        const cur = this._rcsDisrupt.get(s);
        if (!cur || until > cur.until) {
          this._rcsDisrupt.set(s, { until });
          if (!cur && this.bus) {
            // Sparking + attitude-drift tell — distinct id from the massline tumble cue.
            this.bus.emit('presentation:vfxCue', {
              id: 'ship.rcsDisrupt', lane: 'combat', position: { x: s.pos.x, z: s.pos.z },
              particles: 14, lights: 1, magnitude: 1, material: 'ion', targetId: s.id, flashReduced: false,
            });
            this.bus.emit('audio:cue', { id: 'sfx_rcs_disrupt', position: { x: s.pos.x, z: s.pos.z }, gain: 0.5 });
          }
        }
      }
      const latch = this._rcsDisrupt.get(s);
      if (!latch) continue;
      if (tick > latch.until) { this._rcsDisrupt.delete(s); continue; }
      // Attitude drift for the window: no thrust, no steering, NO entry spin (the concussion cannon
      // owns spin). The hull coasts on residual velocity and its guns cannot bear as it slides off
      // their gimbal arc — "can't hold a firing line, slides into your tether arc".
      writePhysicsControl(s, RCS_DISRUPT_CONTROL);
    }
  },

  // --- helpers ---

  // Current target for a ship: explicit combat.targetId, else the player's gun target.
  //
  // For the player the gun target is NOT simply state.player.targetId — a line on a hostile claims
  // the guns (masslineOwnsGuns). Resolving it here is what keeps the missile LOCK (_tickLock) on the
  // same ship the missile will actually launch at: the launch path uses `forceTarget` — the tethered
  // hostile — while the lock used to build on the selection, so the player locked one ship and fired
  // at another. state.player.targetId itself is left alone; it is the player's selection and it also
  // aims Massline throws.
  _resolveTarget(e) {
    const combat = e.data && e.data.combat;
    let id = combat && combat.targetId != null ? combat.targetId : null;
    if (id == null && e.id === this.state.playerId) {
      const tethered = massline2Flag('fireControl') ? masslineGunTarget(this.helpers, e, this.state) : null;
      id = tethered ? tethered.id : this.state.player.targetId;
    }
    if (id == null) return null;
    const t = this.helpers.getEntity(id);
    return t && t.alive ? t : null;
  },

  // Iterative lead/intercept (2 passes); falls back to aim-direct if the shot can't catch up.
  // Delegates to the module-level `solveLeadAngle` so the exact same solver feeds the player HUD lead
  // pip (via src/ai/gunnery.js) — one solver, never two (a second would drift from the sim and lie).
  _leadAngle(shooter, tgt, projSpeed) {
    return solveLeadAngle(shooter, tgt, projSpeed);
  },

  // Approx gaussian spread (sum of two uniforms) in radians, from our own deterministic stream.
  _spread(spreadDeg) {
    if (!spreadDeg) return 0;
    const g = (this._rng() + this._rng() - 1); // ~[-1,1], triangular
    return g * spreadDeg * RAD;
  },

  // ---- Phase 2: hardpoint facing + gimbal + muzzle offsets --------------------------------

  // World-space fire direction for a FIXED hardpoint: base = nose + the mount's facing offset,
  // then blend toward the requested aim angle, clamped to the mount's gimbal arc. A touch of
  // deterministic spread is layered on last. Result is the actual projectile heading.
  _hardpointDir(e, w, aimAngle, spreadDeg) {
    const facingAngle = w.facingAngle || 0;
    const base = e.rot + facingAngle;            // where the gun physically points
    const arc = (w.gimbalArc != null ? w.gimbalArc : 0);
    let dir = base;
    if (arc > 0) {
      const diff = wrapAngle(aimAngle - base);   // signed shortest delta toward the aim
      const clamp = Math.max(-arc, Math.min(arc, diff));
      dir = base + clamp;                        // gimbal-assist toward aim, locked to the cone
    }
    if (spreadDeg) dir += this._spread(spreadDeg);
    return dir;
  },

  // Muzzle world position for a hardpoint: the ship centre + the facing's hull offset (rotated by
  // the hull yaw) + a small radial push along the fire dir so shots visibly clear the hull.
  _muzzle(e, w, dir) {
    const r = e.radius || 1;
    const off = (w.muzzleOffset || [0.8, 0]);
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    // offset is in ship-local axes: off[0] = forward(+x), off[1] = right(+z).
    // forward axis = (cf,sf); right axis = (-sf,cf). Rotate the local offset into world XZ.
    const wx = off[0] * cf + off[1] * (-sf);
    const wz = off[0] * sf + off[1] * cf;
    const px = e.pos.x + wx * r + Math.cos(dir) * r * 0.35;
    const pz = e.pos.z + wz * r + Math.sin(dir) * r * 0.35;
    return { x: px, z: pz };
  },

  // Representative projectile speed of the player's primary weapon. Massline tether fire control
  // uses this when a caller does not provide an explicit speed for its constrained lead solution.
  _playerProjectileSpeed(player) {
    const ws = player.data && player.data.weapons;
    if (ws) {
      for (const w of ws) {
        const def = this._byId.get(w.defId);
        const sp = w.projSpeed != null ? w.projSpeed : (def && def.projSpeed);
        if (sp && sp > 0) return sp;
      }
    }
    return 360;
  },

};

void DEG2;
void TWO_PI;

// Exact lead/intercept solver for the shipped aim-true projectile model. Flight time is solved in
// the shooter's inertial frame, where projectile speed relative to the shooter is `projSpeed`, but
// the returned angle points at the target's WORLD future position because spawned bullets travel on
// that world-space line (aimTrueProjectileVelocity). Returning the relative-frame angle here made a
// strafing player's rounds lead in the opposite direction and miss moving targets by whole hulls.
export function solveLeadAngle(shooter, tgt, projSpeed) {
  const sp = (shooter && shooter.pos) || { x: 0, z: 0 };
  const sv = (shooter && shooter.vel) || { x: 0, z: 0 };
  const tp = (tgt && tgt.pos) || { x: 0, z: 0 };
  const tv = (tgt && tgt.vel) || { x: 0, z: 0 };
  const px = tp.x - sp.x, pz = tp.z - sp.z;
  if (!Number.isFinite(projSpeed)) return Math.atan2(pz, px);
  const rvx = tv.x - sv.x, rvz = tv.z - sv.z;
  const ps = Math.max(1, Number.isFinite(projSpeed) ? projSpeed : 1);
  const a = rvx * rvx + rvz * rvz - ps * ps;
  const b = 2 * (px * rvx + pz * rvz);
  const c = px * px + pz * pz;
  let t = 0;
  if (c > 1e-9) {
    if (Math.abs(a) < 1e-9) {
      const linearT = Math.abs(b) > 1e-9 ? -c / b : -1;
      if (linearT > 0) t = linearT;
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const root = Math.sqrt(disc);
        const t0 = (-b - root) / (2 * a);
        const t1 = (-b + root) / (2 * a);
        if (t0 > 0 && t1 > 0) t = Math.min(t0, t1);
        else if (t0 > 0) t = t0;
        else if (t1 > 0) t = t1;
      }
    }
  }
  const aimx = px + tv.x * t;
  const aimz = pz + tv.z * t;
  return Math.atan2(aimz, aimx);
}

function npcFireTargetVisibleOnPlayerRadar(e, state) {
  const combat = e && e.data && e.data.combat;
  if (!state || !combat || combat.targetId !== state.playerId) return true;
  const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos || !e.pos) return true;
  // Player sensor fittings extend observation, not the early-flight hostile engagement ring.
  const range = NPC_FIRE_PLAYER_RADAR_RANGE;
  const pad = (player.radius || 0) + (e.radius || 0);
  const dx = e.pos.x - player.pos.x;
  const dz = e.pos.z - player.pos.z;
  return dx * dx + dz * dz <= (range + pad) * (range + pad);
}

function ensureWeaponRuntime(host) {
  if (!host._diag) {
    host._diag = {
      autoFireSpatialQueries: 0,
      autoFireCandidates: 0,
    };
  }
}

function resetWeaponDiagnostics(diag) {
  if (!diag) return;
  diag.autoFireSpatialQueries = 0;
  diag.autoFireCandidates = 0;
}

export function buildWeaponDamagePacket(w, def, damage, damageType, pos = null) {
  const applicationEnabled = combatFlag('weaponImpulseConsequences');
  const authoredStatuses = Array.isArray(w && w.statuses)
    ? w.statuses
    : (Array.isArray(def && def.statuses) ? def.statuses : []);
  const effective = {
    dmg: w.dmg != null ? w.dmg : def.dmg,
    impulsePerHit: w.impulsePerHit != null ? w.impulsePerHit : def.impulsePerHit,
    tumbleTorque: w.tumbleTorque != null ? w.tumbleTorque : def.tumbleTorque,
    impulseProvenance: w.impulseProvenance || def.impulseProvenance,
  };
  const impulseIdentity = applicationEnabled ? resolveWeaponImpulseForHit(effective, damage) : null;
  const packet = scalarHitToDamagePacket({
    damage,
    damageType,
    pos,
    penetration: w.armorPierce != null ? w.armorPierce : def.armorPierce,
    // Subsystem-targeting / shield-bypass verbs (EMP disable, spec §9). Authored on the weapon def;
    // 0/null for normal hull weapons.
    subsystemShare: w.subsystemShare != null ? w.subsystemShare : def.subsystemShare,
    shieldBypass: w.shieldBypass != null ? w.shieldBypass : def.shieldBypass,
    // Status applications are authored on the fitted weapon definition and cloned into every
    // projectile/beam packet. The damage router remains the sole status scheduler.
    statuses: authoredStatuses.map((status) => ({ ...status })),
    impulse: impulseIdentity ? { magnitude: impulseIdentity.magnitude } : null,
    tumbleTorque: impulseIdentity ? impulseIdentity.tumbleTorque : 0,
    source: {
      kind: 'weapon',
      weaponId: w.defId || def.id || null,
      impulseProvenance: impulseIdentity && impulseIdentity.provenance || null,
    },
  });
  // Keep the flag-OFF projectile/save shape identical to the pre-PQ-009 packet. The impulse data is
  // application state, so it must not hitch a ride in the frozen 47-A entity graph either.
  if (!applicationEnabled) {
    delete packet.tumbleTorque;
    delete packet.source.impulseProvenance;
  }
  return packet;
}
