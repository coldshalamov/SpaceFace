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
import {
  modelTruthBoltRadius,
  modelTruthFlashOrigin,
  modelTruthMineSensorRadius,
  modelTruthShotOrigin,
} from '../data/modelTruth.js';
import { wrapAngle } from '../core/rng.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import {
  resolveWeaponImpulseForHit,
  recordImpulseProvenance,
  publishHitstunImpulse,
  signedHitSide,
} from '../combat/impulseKernel.js';
import { isHostileToPlayer } from './scanner.js';
import { combatFlag, massline2Flag } from '../data/featureFlags.js';
import {
  aimTrueProjectileVelocity, solveTetherLeadSolution, solutionToleranceRad, orbitalConstraintState,
  masslineOwnsGuns,
} from '../combat/tetherFireControl.js';
import { presentationAllowsPlayerFacingAction } from '../core/presentationAdmission.js';
import { queryCombatTableEntities, COMBAT_TABLE_FLAGS } from '../core/combatTable.js';
import { indexedShipLikeScan } from '../world/livingWorldViews.js';
import {
  attackSpecHasLiveHit,
  attackSpecNeedsRuntime,
  compileAttackSpec,
  mergeWeaponView,
} from '../combat/attackSpec.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../core/physicsAuthority.js';
import { clearEmergentRay, launchEmergent, setEmergentRay } from './emergentPrimitives.js';
import {
  fillInertialShuntImpulses,
  hullCarriesInertialShunt,
} from '../combat/inertialShunt.js';
import {
  GRAVITY_MARK_STATUS_ID,
  INERTIAL_SHUNT_TUNING,
  INERTIAL_SHUNT_WEAPON_ID,
  MOMENTUM_SINK_BUNGEE,
  MOMENTUM_SINK_STATUS_ID,
  MOMENTUM_SINK_WEAPON_ID,
} from '../data/combatDefs.js';
import { causalKindsFromSpec, collectAttackModifiers } from './adventureMigration.js';
import { compactLineageRecord, createLineage } from '../combat/attackLineage.js';
import { emitVolley } from '../combat/attackPropagation.js';
import { resolvePayload } from '../combat/attackPayload.js';
import { handlePayloadSectorTransition } from '../combat/industrialBeam.js';
import {
  armAttackContinue,
  collectAttackCandidates,
  resolveLiveAttackHit,
} from '../combat/attackHit.js';
import {
  collectOpticSpentIds,
  opticBeamBolt,
  opticBookFor,
  opticChildSpec,
  opticFamilyIdOf,
  opticRekindleDue,
  opticSpendLedger,
  settleOpticContact,
  tickOpticRekindle,
} from '../combat/opticField.js';
import { registerStuntImpulseObserver } from '../combat/stuntEvidence.js';
import { observeProjectileEmission, observeProjectileRedirect, prepareProjectileContact,
  observeProjectileDamage, observeProjectileDeath, sampleProjectileEvidence } from '../combat/stuntProjectileEvidence.js';
import {
  projectileContinuationPlan,
  projectileFlightPlan,
  reserveProjectileCapacity,
} from '../combat/projectileFlight.js';

const RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const NPC_FIRE_PLAYER_RADAR_RANGE = 4000;

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

// Enemy mount roles (authored in enemies.js as `occasional`/`defensiveOnly`, preserved by
// combat.resolveEnemyWeapon). `occasional` opens a deterministic sim-time window — a seeded
// phase per mount so twin racks don't volley in lockstep — and `defensiveOnly` answers only
// while a live target is inside this fraction of the mount's own envelope. Flag-less mounts
// and the player's battery never touch this gate.
const OCCASIONAL_PERIOD_S = 12;
const OCCASIONAL_WINDOW_S = 4;
const DEFENSIVE_ENVELOPE_FRAC = 0.8;
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

const CAUSAL_META_BY_SPEC = new WeakMap();
const FAMILY_FIELD = 'field';
const FAMILY_REACTION = 'reaction';

function causalMetaForSpec(spec) {
  if (!spec || typeof spec !== 'object') return null;
  let meta = CAUSAL_META_BY_SPEC.get(spec);
  if (meta) return meta;
  const tags = Object.freeze(causalKindsFromSpec(spec));
  let hasField = false;
  for (let i = 0; i < tags.length; i++) {
    if (tags[i] === 'ORBIT') {
      hasField = true;
      break;
    }
  }
  const payload = spec.payload;
  if (!hasField && Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i++) {
      const entry = payload[i];
      if (entry && entry.kind === 'status' && entry.statusId === GRAVITY_MARK_STATUS_ID) {
        hasField = true;
        break;
      }
    }
  }
  meta = { causalTags: tags, hasField };
  CAUSAL_META_BY_SPEC.set(spec, meta);
  return meta;
}

function stampHitCausal(payload, live, result) {
  if (!payload || !live) return;
  const meta = live.causalMeta || causalMetaForSpec(live.spec);
  if (meta && meta.causalTags) payload.causalTags = meta.causalTags;
  const hops = result && Array.isArray(result.hops) ? result.hops.length : 0;
  const runtime = (result && result.runtime) || live.runtime;
  const generation = runtime && Number.isInteger(runtime.generation) ? runtime.generation : 0;
  const bounced = !!(runtime && runtime.hasBounced)
    || !!(result && result.bounce && result.bounce.ok);
  if (hops > 0) {
    payload.hops = hops;
    payload.chain = true;
  }
  if (generation > 0) payload.generation = generation;
  if (bounced) payload.hasBounced = true;
  if (hops > 0 || generation > 0 || bounced) return;
  if (meta && meta.hasField) payload.family = FAMILY_FIELD;
  else if (meta && meta.causalTags && meta.causalTags.indexOf('STATUS') >= 0) {
    payload.family = FAMILY_REACTION;
  }
}

// Full-azimuth precision belongs only to a live G-mode hostile lock. Ordinary player aim,
// friendly selections, NPCs, missile locks and the non-G Massline gun contract keep their arcs.
function arcadeGunTarget(e, target, state) {
  return !!(e && target && target.alive !== false && target.pos && e.id === state.playerId
    && state.input?.autoFire && state.input.autoAim?.targetId === target.id
    && isHostileToPlayer(target, e.team, state));
}

export const weapons = {
  name: 'weapons',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._weaponsUnsubs=[];
    const on=(event,fn)=>{const off=ctx.bus.on(event,fn);this._weaponsUnsubs.push(typeof off==='function'?off:()=>ctx.bus.off?.(event,fn));};
    this._weaponsUnsubs.push(registerStuntImpulseObserver(ctx.state,event=>observeProjectileRedirect(this.state,event)));
    on('combat:damage',payload=>observeProjectileDamage(this.state,payload,this.bus));
    on('entity:killed',payload=>observeProjectileDeath(this.state,payload,this.bus));

    // Catalog lookup by weapon def id (instance fields win, def fills the gaps).
    this._byId = new Map(WEAPONS.map((w) => [w.id, w]));

    // Own deterministic stream so firing never disturbs the core sim PRNG (§0.5).
    // H9: track seed0 + draw count on state so lab checkpoints cover this stream.
    this._bindWeaponsRng(null);

    // Track individual beam mounts so presentation can update one persistent beam per hardpoint.
    this._beamFiring = new Set();
    this._beamFiringPrev = new Set();
    this._beamActiveMeta = new Map();
    this._opticBeamSeq = 0;
    this._diag = {
      autoFireSpatialQueries: 0,
      autoFireCandidates: 0,
    };
    this._attackSpecCache = new Map();
    this._attackMetrics = emptyAttackMetrics();
    this._attackLive = new Map();
    this._attackQueryScratch = [];
    this._momentumSinkImpulse = { x: 0, y: 0, z: 0 };
    this._shuntImpulseA = { x: 0, y: 0, z: 0 };
    this._shuntImpulseB = { x: 0, y: 0, z: 0 };
    this._shuntTorque = { x: 0, y: 0, z: 0 };
    this._shuntCooldown = new Map();
    this._entityGetter = (id) => {
      if (id == null) return null;
      if (this.helpers && typeof this.helpers.getEntity === 'function') return this.helpers.getEntity(id);
      const state = this.state;
      return state && state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(id)
        : null;
    };

    on('debug:refillPlayer', () => refillLabPlayerHeat(this.state));
    // §24: combat's beam sweep found an optic surface as the first body on a weapon ray —
    // the optic owner settles the contact here and marks req.handled so the beam stops.
    on('optic:beamContact', (req) => handleOpticBeamContact(this, req));
    on('projectile:hit', (payload) => {
      if (handleOpticProjectileHit(this, payload)) {
        prepareProjectileContact(this.state, payload);
        return;
      }
      prepareProjectileContact(this.state,payload);
      const planted = tryPlantMomentumSinkFromHit(this.state, payload, this._entityGetter);
      if (planted && this.bus) {
        this.bus.emit('weapons:momentumSinkPlanted', {
          ownerId: payload && payload.ownerId,
          targetId: payload && payload.targetId,
          weaponId: MOMENTUM_SINK_WEAPON_ID,
        });
      }
      this._onAttackHit(payload);
    });
    on('physics:impact', (payload) => {
      const applied = applyInertialShuntFromImpact(
        this.state,
        payload,
        this._entityGetter,
        this._shuntImpulseA,
        this._shuntImpulseB,
        this._shuntTorque,
        this._shuntCooldown,
        this.bus,
      );
      if (applied && this.bus) {
        this.bus.emit('weapons:inertialShunt', applied);
      }
    });
    on('sector:enter', () => {
      handlePayloadSectorTransition(this.state, this.helpers);
      clearAllMomentumSinkPlants(this.state);
      if (this._shuntCooldown) this._shuntCooldown.clear();
      if (this._opticFamilies) this._opticFamilies.clear();
      // sector:enter fires after materialization, so cells the durable ledger restored dark
      // are live entities here — pick their ids up for the rekindle watch.
      this._opticSpent = collectOpticSpentIds(this.state);
    });
    this._playerIncomingLock = false;
    this._opticSpent = new Set();
    on('game:new', () => { this._playerIncomingLock = false; this._opticSpent = collectOpticSpentIds(this.state); });
    on('game:started', () => { this._playerIncomingLock = false; this._opticSpent = collectOpticSpentIds(this.state); });
    on('save:loaded', () => { this._playerIncomingLock = false; this._opticSpent = collectOpticSpentIds(this.state); });
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    sampleProjectileEvidence(state,this.bus);
    ensureWeaponRuntime(this);
    pruneAttackLive(this, state);
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
    serviceOpticRekindle(this, state);

    // 2) fire — player first, then NPC ships.
    const player = this.helpers.getEntity(state.playerId);
    if (player && player.alive && !player.flags.docked) {
      // Cruise charge/cruise blocks the player's own weapons (spec2/02 §1). NPC weapons keep firing.
      const cruise = state.player && state.player.cruise;
      const playerFireBlocked = cruise && (cruise.phase === 'charging' || cruise.phase === 'cruising');

      // LMB is still the trigger. G supplies a transient hostile lock and per-mount lead,
      // independently of the steering ribbon; the mode does not fire without a trigger.
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
        : (Number.isFinite(state.input.aimAngle) ? state.input.aimAngle : player.rot);
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
    const ships = (state.entityIndex && (state.entityIndex.weaponShips || state.entityIndex.ships))
      || state.entityList;
    for (const e of ships) {
      if (e.type !== 'ship' || !e.alive || e.id === state.playerId) continue;
      const intent = e.data && e.data.intent;
      const firing = !!(intent && intent.fire)
        && presentationAllowsPlayerFacingAction(e, state);
      if (e.physicsSleeping === true && !firing) continue;
      // NPC aim = its intent aimAngle (already a lead/intercept angle from ai.js). fall back to nose.
      const aimAngle = (intent && intent.aimAngle != null) ? intent.aimAngle : e.rot;
      this._serviceShip(e, firing, false, dt, state, aimAngle, null);
    }

    // 3) beam release → one precise stop receipt for each mount that stopped firing.
    this._emitStoppedBeams();
    // 4) physics-weapon consequences (SF-10): tick deployed vector mines (arm → proximity → radial
    // impulse). Helm-loss and RCS disruption are owned by tumbleStates so there is one control
    // writer. Strict no-op in the node golden — they gate on weaponImpulseConsequences, which the
    // 47a scenario pins OFF — so they cannot perturb the frozen sim hash.
    this._tickVectorMines(dt, state);
    state.weaponRuntime = state.weaponRuntime || {};
    state.weaponRuntime.diagnostics = this._diag;
    state.weaponRuntime.attack = this._attackMetrics;
  },

  // --- per-instance timers (cooldown, heat dissipation, lock decay) ---
  _tickWeapons(dt, state) {
    const ships = (state.entityIndex && (state.entityIndex.weaponShips || state.entityIndex.ships)) || state.entityList;
    for (const e of ships) {
      if (e.type !== 'ship' || !e.alive) continue;
      if (e.physicsSleeping === true && !npcWeaponsNeedTick(e, state)) continue;
      const ws = e.data && e.data.weapons;
      if (ws) {
        for (const w of ws) {
          const def = this._byId.get(w.defId) || {};
          if (w._cooldown > 0) w._cooldown = Math.max(0, w._cooldown - dt);
          const baseDissip = w.heatDissip != null ? w.heatDissip : (def.heatDissip || 0);
          const dissip = baseDissip * WEAPON_RECHARGE_MULT;
          if (w._heat > 0 && dissip > 0) w._heat = Math.max(0, w._heat - dissip * dt);
        }
        // Forced-vent lockout (player only) — see WEAPON_VENT_S. Runs after the normal cooldown so a
        // freshly-pegged gun trips the vent this tick.
        this._tickVent(e, dt, state);
        // Missile lock build/decay lives on the ship's combat block.
        this._tickLock(e, dt, state);
      }
      tickMomentumSinkPlant(state, e, this._momentumSinkImpulse, this._entityGetter);
    }
    this._publishIncomingLock(state);
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

  _tickLock(e, dt, state) {
    // A caller that forgets `state` must not produce a permanently-frozen occasional window —
    // fall back to the system's bound state rather than evaluating simTime as 0.
    state = state || this.state;
    const ws = e.data && e.data.weapons;
    const combat = e.data && e.data.combat;
    if (!ws || !combat) return;
    // Does this ship carry any lock-requiring weapon that is open this tick? An `occasional`
    // rack is ignored while its window is closed so the incoming-lock warning re-arms per
    // actual launch window instead of crying wolf between volleys.
    let needsLock = false, lockTimeS = Infinity;
    for (const w of ws) {
      const def = this._byId.get(w.defId) || {};
      const tracking = w.tracking || def.tracking;
      if (tracking === 'homing' && this._mountRoleOpen(e, w, def, state)) {
        needsLock = true;
        const lt = w.lockTimeS != null ? w.lockTimeS : def.lockTimeS;
        if (lt != null) lockTimeS = Math.min(lockTimeS, lt);
      }
    }
    // Fastest open mount governs the warn/launch cadence; the 1.2 s floor is only the default
    // for racks that author no time — starting there silently ignored slower authored locks.
    if (!Number.isFinite(lockTimeS)) lockTimeS = 1.2;
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

  /**
   * Incoming missile lock on the player. World jump interdiction and the MISSILE LOCK alert
   * both listen to `combat:lockChanged`; nothing used to emit it, so both stayed dead.
   */
  _publishIncomingLock(state) {
    const playerId = state && state.playerId;
    let locked = false;
    let shooterId = null;
    if (playerId != null) {
      const ships = (state.entityIndex && (state.entityIndex.weaponShips || state.entityIndex.ships))
        || state.entityList;
      for (const e of ships) {
        if (!e || !e.alive || e.type !== 'ship' || e.id === playerId) continue;
        const combat = e.data && e.data.combat;
        if (!combat) continue;
        if (combat.lockTarget === playerId && (combat.lockProgress || 0) >= 1) {
          locked = true;
          shooterId = e.id;
          break;
        }
      }
    }
    if (locked === this._playerIncomingLock) return;
    this._playerIncomingLock = locked;
    if (this.bus) {
      this.bus.emit('combat:lockChanged', {
        locked,
        targetId: playerId,
        shooterId,
      });
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
      const decoy = missileDecoyAim(d);
      const tgt = decoy ? null : (d.targetId != null ? this.helpers.getEntity(d.targetId) : null);
      const aim = decoy || (tgt && tgt.pos);
      const turnRate = d.turnRate || 0;
      const speedMax = d.projSpeed || Math.hypot(p.vel.x, p.vel.z) || 1;
      let cur = Math.atan2(p.vel.z, p.vel.x);

      // Base guidance: a live target, or a chaff decoy point written by countermeasures. The decoy
      // is not a real entity — looking it up used to drop guidance and fly the round straight into
      // the ship it was already tracking.
      let guiding = !!(aim && turnRate > 0 && (decoy || (tgt && tgt.alive)));
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
          const toT = Math.atan2(aim.z - p.pos.z, aim.x - p.pos.x);
          const off = Math.abs(wrapAngle(toT - cur));
          const dx = aim.x - p.pos.x, dz = aim.z - p.pos.z;
          const inRange = (dx * dx + dz * dz) <= MISSILE_SEEKER_RANGE * MISSILE_SEEKER_RANGE;
          if (off > MISSILE_SEEKER_CONE || !inRange) guiding = false;
        }
      }

      if (guiding) {
        const desired = Math.atan2(aim.z - p.pos.z, aim.x - p.pos.x);
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

  // Mount-role permission for the authored enemy flags. An `occasional` mount only fires while
  // its deterministic window is open — a hash-seeded phase per mount so a count:2 rack doesn't
  // volley in lockstep — and a `defensiveOnly` mount only answers while a live target is inside
  // its own close envelope (a fraction of the mount's range, so a ship kited at beam range stops
  // cycling flak it could never land). Flag-less mounts and the player's battery return early and
  // keep legacy behavior; cooldown/heat still tick while closed so the first open tick is ready.
  _mountRoleOpen(e, w, def, state, forceTarget = null, fireGate = null) {
    if (w.occasional !== true && w.defensiveOnly !== true) return true;
    if (w.occasional === true) {
      if (!Number.isFinite(w._occPhase)) {
        const h = this.helpers.hash32(0, String(e.id), String(w.defId || w.id || ''), String(w.slotIndex | 0));
        w._occPhase = (h % (OCCASIONAL_PERIOD_S * 1000)) / 1000;
      }
      const t = ((state && state.simTime) || 0) + w._occPhase;
      if (((t % OCCASIONAL_PERIOD_S) + OCCASIONAL_PERIOD_S) % OCCASIONAL_PERIOD_S >= OCCASIONAL_WINDOW_S) return false;
    }
    if (w.defensiveOnly === true) {
      const tgt = (fireGate && fireGate.target) || forceTarget || this._resolveTarget(e);
      if (!tgt || !tgt.pos || tgt.alive === false) return false;
      const range = (w.range != null ? w.range : def.range) || 0;
      if (!(range > 0)) return false;
      const envelope = range * DEFENSIVE_ENVELOPE_FRAC;
      const dx = tgt.pos.x - e.pos.x, dz = tgt.pos.z - e.pos.z;
      if (dx * dx + dz * dz > envelope * envelope) return false;
    }
    return true;
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
      if (!this._mountRoleOpen(e, w, def, state, forceTarget, fireGate)) {
        // A sustained emergent ray opened by this mount would leak into world.ray forever if the
        // role gate simply skips its service — _serviceEmergent's !firing branch is the only
        // clearer. No authored flagged mount is emergent today; this is insurance against one.
        if (def.emergentPrimitive) clearEmergentRay(state, e.id);
        continue;
      }
      if (def.emergentPrimitive) {
        capLeft = this._serviceEmergent(e, w, def, firing, capLeft, state, aimAngle);
        continue;
      }
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

  // Emergent primitives spend no capacitor and no heat, so they cannot vent-lock or starve
  // the ship's baseline guns. Cycle rate is the only spacing, and it lives on this mount.
  _serviceEmergent(e, w, def, firing, capLeft, state, aimAngle) {
    const aim = Number.isFinite(aimAngle) ? aimAngle : e.rot;
    const sustained = !!(def.continuous || def.emergentPrimitive === 'thermal');
    if (!firing) {
      if (sustained) clearEmergentRay(state, e.id);
      return capLeft;
    }
    if (sustained) {
      setEmergentRay(state, e, def, aim);
      return capLeft;
    }
    if ((w._cooldown || 0) > 0) return capLeft;
    const rof = w.rof != null ? w.rof : def.rof || 0;
    w._cooldown = rof > 0 ? 1 / rof : 0.2;
    launchEmergent(state, e, def, aim);
    const origin = this._muzzle ? this._muzzle(e, w, aim) : { x: e.pos.x, z: e.pos.z };
    this.bus.emit('combat:fire', {
      ownerId: e.id, weaponId: w.defId, hardpointIdx: w.slotIndex, origin, dir: aim,
    });
    return capLeft;
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
    const arcadeTarget = fireGate?.target || forceTarget;
    const arcadeAim = arcadeGunTarget(e, arcadeTarget, state);
    const pilotAim = e.id === state.playerId && state.settings?.gameplay?.controlScheme === 'pilot';
    let solutionBlocked = false;
    if (!fireGate && forceTarget && forceTarget.pos) {
      // Hitscan has no travel time. A mixed battery may have computed the ship-level aim angle for
      // a slow projectile; carrying that lead into a beam knowingly fires ahead of the target.
      beamAim = Math.atan2(forceTarget.pos.z - e.pos.z, forceTarget.pos.x - e.pos.x);
    } else if (fireGate && fireGate.target && fireGate.target.pos) {
      beamAim = Math.atan2(fireGate.target.pos.z - e.pos.z, fireGate.target.pos.x - e.pos.x);
      const bareDir = this._hardpointDir(e, w, beamAim, 0);
      solutionBlocked = !arcadeAim && !pilotAim && Math.abs(wrapAngle(bareDir - beamAim)) > fireGate.tolRad;
    }
    if (arcadeAim) beamAim = this._arcadeMountAngle(e, w, arcadeTarget, 0);
    const canFire = firing && !solutionBlocked && !overheated && capLeft >= energyCost * dt;
    if (!canFire) {
      // Heat already dissipates once in `_tickWeapons`. A second idle pass made beams cool twice
      // as fast as projectile mounts.
      return capLeft;
    }
    capLeft -= energyCost * dt;
    w._heat = (w._heat || 0) + heatPerSec * dt;
    if (w._heat >= heatMax) w._heat = heatMax;

    // A continuous beam still originates from its hardpoint facing and gimbal-assists toward aim.
    const dir = arcadeAim || pilotAim ? beamAim : this._hardpointDir(e, w, beamAim != null ? beamAim : e.rot, 0);
    const origin = this._muzzle(e, w, dir);
    const to = { x: origin.x + Math.cos(dir) * range, z: origin.z + Math.sin(dir) * range };
    const damage = (w.dmg != null ? w.dmg : def.dmg || 0) * dt;
    const damageType = w.damageType || def.damageType || 'energy';
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
        // §24: one mount-hold is ONE optic "shot" — a diamond throws its ring on the first
        // contact tick and every later tick of the same burst meets the spent/dark cell
        // (and the family book's visited mark). A fresh burst draws a fresh family.
        opticFamilyId: `optic:beam:${beamKey}:${(this._opticBeamSeq = (this._opticBeamSeq || 0) + 1)}`,
      };
      this._beamActiveMeta.set(beamKey, beamMeta);
    }
    if (state.combat && Array.isArray(state.combat.beams)) {
      state.combat.beams.push({
        ownerId: e.id, factionId: e.factionId, weaponId: w.defId,
        from: { x: origin.x, z: origin.z }, to,
        dmgType: damageType,
        dpsThisTick: damage,
        damagePacket: buildWeaponDamagePacket(w, def, damage, damageType),
        beamKey,
        opticFamilyId: beamMeta.opticFamilyId,
      });
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
    const pilotAim = isPlayer && state.settings?.gameplay?.controlScheme === 'pilot';
    if ((w._cooldown || 0) > 0) return capLeft;
    if (this._releaseMomentumSinkIfReady(e, w, def, state)) return capLeft;

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

    const arcadeTarget = fireGate?.target || forceTarget;
    const arcadeAim = isPlayer && !isMissile && arcadeGunTarget(e, arcadeTarget, state);
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
      if (!arcadeAim && Math.abs(wrapAngle(aim - e.rot)) > arc / 2) return capLeft;
      dir = arcadeAim && !mountGate ? this._arcadeMountAngle(e, w, arcadeTarget, mountProjSpeed) : aim;
    } else {
      // Tether-lock solution gate (massline2.fireControl, player only): withhold the round unless
      // the barrel — after gimbal clamp, before spread — can actually lie on the solution this
      // frame. Cooldown/cap are NOT spent on withheld frames, so held fire "tracks" and every
      // released round is a hit candidate. Tolerance is the target-size-honest solution window
      // widened to at least the mount's own spread (a gate tighter than the spread would starve
      // fire without improving hits).
      if (mountGate && !arcadeAim && !pilotAim) {
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
      // G trades manual barrel alignment for independent dodging. Use the same physical shot
      // model, but no cone clamp or random aim error on this explicit hostile solution.
      dir = arcadeAim
        ? (mountGate ? fixedAim : this._arcadeMountAngle(e, w, arcadeTarget, mountProjSpeed))
        // Pilot means keyboard flight plus independent mouse fire. Keep the physical muzzle,
        // projectile travel and spread; only the obsolete nose-cone restriction is removed.
        : pilotAim ? fixedAim + (def.spreadDeg ? this._spread(def.spreadDeg) : 0)
          : this._hardpointDir(e, w, fixedAim, def.spreadDeg != null ? def.spreadDeg : 0);
    }

    const spec = this._attackSpecFor(w, def, state, e);
    const heatScale = spec && spec.costs && Number.isFinite(spec.costs.heatScale) ? spec.costs.heatScale : 1;
    const heatCost = heatPerShot * heatScale;

    // --- commit: spend cap + heat, set cooldown ---
    capLeft -= energyCost;
    if (heatCost) {
      // The final accepted shot visibly pegs the gauge and explicitly starts the vent. The old
      // pre-fire `nextHeat > max` rejection silently ate trigger pulls just below the threshold,
      // while pre-service cooling could keep the separate vent detector from ever seeing 100%.
      w._heat = Math.min(heatMax, (w._heat || 0) + heatCost);
      if (w._heat >= heatMax) this._beginVent(e, state, w);
    }
    const rof = w.rof != null ? w.rof : def.rof || 0;
    w._cooldown = rof > 0 ? 1 / rof : 0.1;

    // consume missile lock so each missile needs a fresh lock
    if (isMissile && e.data.combat) { e.data.combat.lockProgress = 0; }

    this._emitProjectileVolley(e, w, def, dir, tgt, isMissile, state, spec);

    const origin = this._muzzle(e, w, dir);
    this.bus.emit('combat:fire', {
      ownerId: e.id, weaponId: w.defId, hardpointIdx: w.slotIndex, origin, dir,
    });
    return capLeft;
  },

  _releaseMomentumSinkIfReady(e, w, def, state) {
    if (!isMomentumSinkWeapon(w, def)) return false;
    const plant = e && e.data && e.data.momentumSinkPlant;
    if (!plant || !plant.active) return false;
    if (!(plant.storedReceding > MOMENTUM_SINK_BUNGEE.deadbandSpeed)) return false;
    const stored = plant.storedReceding;
    if (!queueMomentumSinkRelease(e, plant, this._momentumSinkImpulse, state)) return false;
    const rof = w.rof != null ? w.rof : def.rof || 0;
    w._cooldown = rof > 0 ? 1 / rof : 0.1;
    if (this.bus) {
      this.bus.emit('weapons:momentumSinkReleased', {
        ownerId: e.id,
        weaponId: MOMENTUM_SINK_WEAPON_ID,
        storedReceding: stored,
      });
    }
    return true;
  },

  _attackSpecFor(w, def, state, entity) {
    if (!this._attackSpecCache) this._attackSpecCache = new Map();
    if (!this._attackMetrics) this._attackMetrics = emptyAttackMetrics();
    const modifiers = collectAttackModifiers(state, entity, def || w);
    const key = `${def && def.id || w.defId}|${modifiers.map((row) => `${row[0]}:${row[1]}`).join(',')}`;
    let compiled = this._attackSpecCache.get(key);
    if (compiled) {
      this._attackMetrics.cacheHits += 1;
      return compiled.spec;
    }
    compiled = compileAttackSpec({ weapon: mergeWeaponView(w, def), modifiers });
    this._attackSpecCache.set(key, compiled);
    this._attackMetrics.specsCompiled += 1;
    return compiled && compiled.spec;
  },

  _emitProjectileVolley(e, w, def, dir, tgt, isMissile, state, spec) {
    if (!spec || !attackSpecNeedsRuntime(spec)) {
      this._spawnProjectile(e, w, def, dir, tgt, isMissile, state,
        spec && attackSpecHasLiveHit(spec) ? { spec } : undefined);
      return;
    }
    if (!this._attackMetrics) this._attackMetrics = emptyAttackMetrics();
    const tick = state && Number.isInteger(state.tick) ? state.tick : 0;
    const lineage = createLineage({
      spec,
      sourceEntityId: e.id,
      sourceWeaponSlot: Number.isInteger(w.slotIndex) ? w.slotIndex : 0,
      createdTick: tick,
    });
    const volley = emitVolley(spec, lineage);
    const payloadScale = spec.costs && Number.isFinite(spec.costs.payloadScale) ? spec.costs.payloadScale : 1;
    const record = compactLineageRecord(lineage);
    this._attackMetrics.volleys += 1;
    this._attackMetrics.rootsEmitted += volley.emitted.length;
    this._attackMetrics.rootsSuppressed += volley.suppressed.length;
    for (const root of volley.emitted) {
      this._spawnProjectile(e, w, def, dir + root.offsetRad, tgt, isMissile, state, {
        payloadScale,
        attackRuntime: record,
        spec,
        liveRuntime: lineage,
      });
    }
  },

  _spawnProjectile(e, w, def, dir, tgt, isMissile, state, opts) {
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

    // Engagement range stays on maxDistance for AI, locks, and the targeting computer.
    // The body itself keeps a long flight budget so a shot can leave the frame, hit,
    // or bounce, and come back. The clock and the live cap are what retire it.
    const worldSpeed = Math.hypot(vel.x, vel.z);
    const flight = projectileFlightPlan(range, worldSpeed);
    const ttl = flight.ttl;

    const payloadScale = opts && Number.isFinite(opts.payloadScale) ? opts.payloadScale : 1;
    const damage = ((w.dmg != null ? w.dmg : def.dmg) || 0) * payloadScale;
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
      flightDistance: flight.flightDistance,
    };
    if (opts && opts.attackRuntime) data.attackRuntime = opts.attackRuntime;
    if (opts && opts.spec) {
      const resolved = resolvePayload(opts.spec, {
        generation: opts.liveRuntime && Number.isInteger(opts.liveRuntime.generation)
          ? opts.liveRuntime.generation : 0,
        hasBounced: !!(opts.liveRuntime && opts.liveRuntime.hasBounced),
      });
      if (resolved.statuses && resolved.statuses.length) {
        const packet = data.damagePacket;
        if (!Array.isArray(packet.statuses)) packet.statuses = [];
        for (let i = 0; i < resolved.statuses.length; i++) {
          const status = resolved.statuses[i];
          packet.statuses.push({ id: status.id, stacks: status.stacks });
        }
      }
    }
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

    reserveProjectileCapacity(state, 1);
    const spawned = this.helpers.spawnEntity({
      type: 'projectile',
      pos: muzzle,
      vel,
      rot: dir,
      radius: modelTruthBoltRadius(e),
      mass: 0.1,
      team: e.team,
      ownerId: e.id,
      factionId: e.factionId,
      ttl,
      collides: true,
      data,
    });
    if(spawned)observeProjectileEmission(state,spawned,e);
    if (spawned && opts && opts.spec) {
      if (!this._attackLive) this._attackLive = new Map();
      const meta = causalMetaForSpec(opts.spec);
      if (opts.liveRuntime) {
        this._attackLive.set(spawned.id, {
          spec: opts.spec,
          runtime: opts.liveRuntime,
          causalMeta: meta,
        });
        if ((opts.spec.trajectory && opts.spec.trajectory.bounces > 0)
          || (opts.spec.propagation && opts.spec.propagation.pierce > 0)) {
          armAttackContinue(spawned);
        }
      } else if (attackSpecHasLiveHit(opts.spec)) {
        this._attackLive.set(spawned.id, {
          spec: opts.spec,
          runtime: null,
          causalMeta: meta,
        });
      }
    }
  },

  _onAttackHit(payload) {
    if (!this._attackLive || this._attackLive.size === 0) return;
    const state = this.state;
    if (!state || !payload) return;
    const projectile = findLiveAttackProjectile(state, this._attackLive, payload);
    if (!projectile) return;
    const live = this._attackLive.get(projectile.id);
    if (!live) return;
    if (!live.runtime) {
      stampHitCausal(payload, live, null);
      this._attackLive.delete(projectile.id);
      return;
    }
    const target = payload.targetId != null && this.helpers && this.helpers.getEntity
      ? this.helpers.getEntity(payload.targetId)
      : (state.entities && state.entities.get && state.entities.get(payload.targetId));
    const scratch = this._attackQueryScratch || (this._attackQueryScratch = []);
    const tick = state && Number.isInteger(state.tick) ? state.tick : 0;
    const chain = live.spec && live.spec.propagation && live.spec.propagation.chain;
    const range = chain && Number.isFinite(chain.range) ? chain.range : 0;
    const steer = live.spec && live.spec.trajectory && live.spec.trajectory.afterBounceSteer;
    const steerRange = projectile.data && Number.isFinite(projectile.data.maxDistance)
      ? projectile.data.maxDistance
      : 600;
    const hostiles = steer
      ? collectAttackCandidates(state, projectile.pos, steerRange, scratch, projectile.ownerId, projectile.team)
      : null;
    const result = resolveLiveAttackHit({
      state,
      spec: live.spec,
      runtime: live.runtime,
      projectile,
      target,
      payload,
      tick,
      tetherAnchorId: tetherAnchorIdOf(state),
      hostiles,
      candidates: range > 0
        ? (origin) => collectAttackCandidates(state, origin, range, scratch, projectile.ownerId, projectile.team)
        : [],
      applyHopDamage: (hop) => applyAttackHopDamage(this, projectile, live.spec, hop),
    });
    if (result.children && result.children.length) {
      spawnSplitChildren(this, projectile, live.spec, result.children, payload);
    }
    if (result.pierce && result.pierce.applyPayload === false) {
      suppressHitPayload(payload);
    } else if (result.payload && Number.isFinite(result.payload.scale) && result.payload.scale !== 1) {
      scaleHitPayload(payload, result.payload.scale);
    }
    if (result.consume) this._attackLive.delete(projectile.id);
    stampHitCausal(payload, live, result);
  },

  destroy() {
    for(const off of this._weaponsUnsubs||[])off();
    this._weaponsUnsubs=[];
    this._playerIncomingLock = false;
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
    if (this._countOwnerVectorMines(state, e.id, def.deployKind || 'vector_mine') >= maxActive) {
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

  // Drop a stationary deployable BEHIND the ship's heading (STEP 9 "deploy behind"). It sits where
  // dropped — the arm delay lets the deployer clear it — then arms and waits. collides:false, so
  // like an impulse charge it is a logical trigger volume, not a physics body; its position is
  // authored at spawn and never re-integrated (no motion writes at all).
  //
  // Two payloads share this spawn path: the vector mine (one radial shove on proximity) and the
  // gravity wellhead (a sustained inward pull for its whole life, `_tickGravityWell`). The def's
  // deployKind picks the data block; the tick loop branches on data.kind.
  _spawnVectorMine(e, w, def, state) {
    const dir = (e.rot || 0) + Math.PI;
    const standoff = (e.radius || 6) + 6;
    const pos = { x: e.pos.x + Math.cos(dir) * standoff, z: e.pos.z + Math.sin(dir) * standoff };
    const now = state.simTime || 0;
    const isWell = def.deployKind === 'gravity_well';
    const mine = this.helpers.spawnEntity({
      type: 'vectormine',
      pos, vel: { x: 0, z: 0 }, rot: dir,
      // This stationary proximity sensor must not enter Rapier as a solid ball. collides:false
      // alone only disables the legacy collision path; an overlapping hull would be ejected.
      radius: modelTruthMineSensorRadius(e), mass: 0.6, collides: false, physicsBody: false,
      team: e.team, ownerId: e.id, factionId: e.factionId,
      data: isWell ? {
        kind: 'gravity_well', weaponId: w.defId, ownerId: e.id,
        armAt: now + (def.mineArmS != null ? def.mineArmS : 1.2),
        dieAt: now + (def.mineLifeS != null ? def.mineLifeS : 6),
        blastRadius: def.mineBlastRadius != null ? def.mineBlastRadius : 300,
        pull: def.mineWellPull != null ? def.mineWellPull : 60,
        provenance: def.impulseProvenance || 'gravity_well_pull',
        armed: false, spawnedAt: now,
      } : {
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
      if (isWell) {
        this.bus.emit('presentation:vfxCue', {
          id: 'combat.gravityWell.deploy', lane: 'field', particles: 18, lights: 1,
          magnitude: 1.2, position: pos, material: 'impulse',
          sourceId: e.id, targetId: null, flashReduced: false,
        });
      }
    }
    return mine;
  },

  _countOwnerVectorMines(state, ownerId, kind = 'vector_mine') {
    let n = 0;
    const list = liveVectorMineList(state);
    for (const ent of list) {
      if (ent.type === 'vectormine' && ent.alive && ent.data && ent.data.ownerId === ownerId
        && (ent.data.kind || 'vector_mine') === kind) n++;
    }
    return n;
  },

  // Per-tick vector-mine lifecycle: expire → arm → proximity trigger. Strict no-op in the golden
  // (flag pinned OFF). Proximity is a linear scan of the ship index, NOT a broadphase/spatial-hash
  // query (perf-budget constraint), and touches only mine.data — no entity motion is written here.
  _tickVectorMines(dt, state) {
    if (!combatFlag('weaponImpulseConsequences')) return;
    const list = liveVectorMineList(state);
    if (!list.length) return;
    const now = state.simTime || 0;
    const ships = (state.entityIndex && state.entityIndex.ships) || state.entityList || list;
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
      // A gravity well does not detonate: once armed it drags until it dies. The pull is a
      // mass-scaled impulse toward the well each tick (uniform acceleration with linear falloff —
      // gravity does not check team tags, the owner included), routed through physics authority
      // with provenance so a well-thrown hull meeting terrain is attributed to the owner.
      if (d.kind === 'gravity_well') {
        this._tickGravityWell(mine, d, state, dt);
        continue;
      }
      const trigR = d.triggerRadius;
      let triggered = false;
      const table = state.combatTable;
      if (table && table.count > 0) {
        const mx = mine.pos.x;
        const mz = mine.pos.z;
        const n = table.count;
        const shipFlag = COMBAT_TABLE_FLAGS.SHIP;
        for (let i = 0; i < n; i++) {
          if ((table.flags[i] & shipFlag) === 0) continue;
          const rr = trigR + (table.radius[i] || 0);
          const dx = table.x[i] - mx;
          const dz = table.z[i] - mz;
          if (dx * dx + dz * dz <= rr * rr) { triggered = true; break; }
        }
      } else {
        for (const s of ships) {
          if (!s.alive || (s.type !== 'ship' && s.type !== 'drone')) continue;
          const dx = s.pos.x - mine.pos.x, dz = s.pos.z - mine.pos.z;
          const rr = trigR + (s.radius || 0);
          if (dx * dx + dz * dz <= rr * rr) { triggered = true; break; }
        }
      }
      if (triggered) this._detonateVectorMine(mine, d, state);
    }
  },

  // Sustained pull for one armed gravity well. Uniform acceleration (pull × linear falloff) so
  // the well bends light hulls and heavies alike — a well is terrain you place, not a damage
  // source; the fight is repositioned and finished with whatever else the fit carries.
  _tickGravityWell(mine, d, state, dt) {
    const physics = this.helpers && this.helpers.combatPhysics;
    if (!physics || typeof physics.applyImpulse !== 'function') return;
    const pull = Math.max(0, Number(d.pull) || 0);
    const radius = Math.max(1, Number(d.blastRadius) || 1);
    if (!(pull > 0) || !(dt > 0)) return;
    const pos = { x: mine.pos.x, z: mine.pos.z };
    const ships = (state.entityIndex && state.entityIndex.ships) || state.entityList || [];
    const step = Math.min(dt, 1 / 30); // clamp catch-up so a hitch frame cannot fling hulls
    for (const s of ships) {
      if (!s.alive || (s.type !== 'ship' && s.type !== 'drone')) continue;
      const dx = pos.x - s.pos.x, dz = pos.z - s.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > radius || dist < 1e-4) continue;
      const accel = pull * (1 - dist / radius);
      const mass = Math.max(0.1, Number(s.physicsBody && s.physicsBody.mass) || Number(s.mass) || 1);
      const mag = accel * mass * step;
      const provenance = { actorId: d.ownerId == null ? null : d.ownerId, weaponId: d.weaponId, tag: d.provenance, appliedTick: state.tick };
      const accepted = physics.applyImpulse({
        entityId: s.id, impulse: { x: (dx / dist) * mag, z: (dz / dist) * mag }, point: null,
        reason: 'gravity_well', tick: state.tick, provenance,
      });
      if (accepted !== false) {
        recordImpulseProvenance(s, { ...provenance, magnitude: mag });
      }
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
    const table = state.combatTable;
    const ships = (table && table.count > 0 && state.entities && typeof state.entities.get === 'function')
      ? queryCombatTableEntities(
        state, pos.x, pos.z, blastR,
        this._mineBlastQuery || (this._mineBlastQuery = []),
        COMBAT_TABLE_FLAGS.SHIP,
      )
      : ((state.entityIndex && state.entityIndex.ships) || state.entityList || []);
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
        if (accepted !== false) {
          recordImpulseProvenance(s, { ...provenance, magnitude: mag });
          if (combatFlag('weaponImpulseConsequences')) {
            const victimMass = Math.max(0.1, Number(s.mass) || 1);
            const owner = this.helpers && typeof this.helpers.getEntity === 'function'
              ? this.helpers.getEntity(d.ownerId)
              : null;
            publishHitstunImpulse(this.bus, {
              source: 'weapon',
              victimId: s.id,
              attackerId: d.ownerId == null ? null : d.ownerId,
              attackerMass: owner && Number.isFinite(owner.mass) && owner.mass > 0 ? owner.mass : 1,
              victimMass,
              deltaV: mag / victimMass,
              dirX,
              dirZ,
              hitSide: signedHitSide(s, { x: dirX * mag, z: dirZ * mag }, null, s.id),
              provenance,
              tick: state.tick,
            });
          }
        }
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

  // The hull centre is NOT the launch point. Resolve each battery member at its own speed
  // and real muzzle; fixed iteration count also accounts for the radial muzzle offset changing
  // with aim. speed=0 is hitscan and intentionally carries no projectile lead.
  _arcadeMountAngle(e, w, target, speed) {
    let angle = speed > 0 ? this._leadAngle(e, target, speed)
      : Math.atan2(target.pos.z - e.pos.z, target.pos.x - e.pos.x);
    for (let i = 0; i < 3; i++) {
      const origin = this._muzzle(e, w, angle);
      angle = speed > 0 ? this._leadAngle({ pos: origin, vel: e.vel }, target, speed)
        : Math.atan2(target.pos.z - origin.z, target.pos.x - origin.x);
    }
    return angle;
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

  // The round leaves the weapon socket. Aim, spread, and lead change the heading only.
  _muzzle(e, w, _dir) {
    const origin = modelTruthShotOrigin(e, w);
    if (origin) return { x: origin.x, z: origin.z, y: origin.y || 0 };
    return {
      x: e.pos.x,
      z: e.pos.z,
      y: 0,
    };
  },

  flashOrigin(e, w) {
    const origin = modelTruthFlashOrigin(e, w) || this._muzzle(e, w, e.rot || 0);
    return { x: origin.x, z: origin.z, y: origin.y };
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

function isLiveLabSession(state) {
  const run = state && state.run;
  return !!(run && run.kind === 'lab' && run.phase !== 'inactive');
}

function refillLabPlayerHeat(state) {
  if (!isLiveLabSession(state)) return;
  if (!state || state.playerId == null || !state.entities || typeof state.entities.get !== 'function') {
    return;
  }
  const player = state.entities.get(state.playerId);
  if (!player) return;
  const mounts = player.data && player.data.weapons;
  if (!Array.isArray(mounts)) return;
  for (let i = 0; i < mounts.length; i++) {
    const mount = mounts[i];
    if (mount) mount._heat = 0;
  }
}

function liveVectorMineList(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.vectorMines)) return index.vectorMines;
  return (state && state.entityList) || [];
}

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

function missileDecoyAim(d) {
  if (!d || d.diverted !== true || !d.divertPos) return null;
  const x = d.divertPos.x;
  const z = d.divertPos.z;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return d.divertPos;
}

function npcWeaponsNeedTick(e, state) {
  const data = e && e.data;
  const plant = data && data.momentumSinkPlant;
  if (plant && plant.active) return true;
  if (data && data.weaponVentUntil && (state && state.simTime || 0) < data.weaponVentUntil) return true;
  const ws = data && data.weapons;
  if (!ws) return false;
  for (const w of ws) {
    if ((w._cooldown || 0) > 0 || (w._heat || 0) > 0) return true;
  }
  return false;
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

function findLiveAttackProjectile(state, live, payload) {
  let best = null;
  let bestD = Infinity;
  const px = payload && payload.pos ? payload.pos.x : 0;
  const pz = payload && payload.pos ? payload.pos.z : 0;
  for (const [id, rec] of live) {
    void rec;
    const entity = state.entities && state.entities.get && state.entities.get(id);
    if (!entity) {
      live.delete(id);
      continue;
    }
    if (payload.ownerId != null && entity.ownerId !== payload.ownerId) continue;
    const dx = (entity.pos && entity.pos.x || 0) - px;
    const dz = (entity.pos && entity.pos.z || 0) - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = entity;
    }
  }
  return best;
}

function handleOpticProjectileHit(host, payload) {
  const state = host && host.state;
  if (!state || !payload || payload.projectileId == null || payload.targetId == null) return false;
  const entities = state.entities;
  if (!entities || typeof entities.get !== 'function') return false;
  const projectile = entities.get(payload.projectileId);
  const target = entities.get(payload.targetId);
  if (!projectile || projectile.type !== 'projectile' || !target) return false;
  if (!host._opticFamilies) host._opticFamilies = new Map();
  const book = opticBookFor(host._opticFamilies, opticFamilyIdOf(projectile));
  const bus = host.bus;
  const plan = settleOpticContact(projectile, target, payload, book, {
    simTime: Number.isFinite(state.simTime) ? state.simTime : 0,
    ledger: opticSpendLedger(state),
    emit: bus ? (name, event) => bus.emit(name, event) : null,
  });
  if (!plan) return false;
  // A discharged prism joins the rekindle watch — the quiet clock is what it needs, not ticks.
  if (plan.spentAt != null) {
    if (!host._opticSpent) host._opticSpent = new Set();
    host._opticSpent.add(target.id);
  }
  // Zero the hit before combat's projectile:hit listener (registered after weapons) routes damage.
  suppressHitPayload(payload);
  // Prism/absorb consume the bolt: drop traited live state so splinters never inherit a parent
  // AttackSpec resolve. Reflect keeps the same body — leave _attackLive for a later non-optic hit.
  if (plan.kind !== 'reflect' && host._attackLive) host._attackLive.delete(projectile.id);
  if (plan.kind === 'prism' && host.helpers && typeof host.helpers.spawnEntity === 'function') {
    const rays = plan.rays || [];
    for (let i = 0; i < rays.length; i++) {
      reserveProjectileCapacity(host.state, 1);
      host.helpers.spawnEntity(opticChildSpec(projectile, rays[i]));
    }
  }
  if (host.bus) {
    const pos = payload.pos && Number.isFinite(payload.pos.x)
      ? { x: payload.pos.x, z: payload.pos.z }
      : (target.pos ? { x: target.pos.x, z: target.pos.z } : null);
    host.bus.emit('optic:contact', {
      kind: plan.kind,
      reason: plan.reason,
      materialId: plan.materialId,
      projectileId: projectile.id,
      targetId: target.id,
      ownerId: projectile.ownerId == null ? null : projectile.ownerId,
      pos,
      rays: plan.rays ? plan.rays.length : 0,
      // Set when this contact discharged (or re-discharged) the prism — the cell reads
      // 'spent' until its quiet stretch completes.
      spent: plan.spentAt != null,
    });
  }
  return true;
}

/**
 * §24 "Beams and missiles": a continuous beam has no projectile body, so combat's beam sweep
 * (which owns "the first body on the ray") hands the contact here as an 'optic:beamContact'
 * request. The beam arrives as a bolt-shaped shim (opticBeamBolt) carrying the mount's burst
 * family — the same settle rules apply: live diamond throws the ring once and spends, stone,
 * spent and metal eat the ray (a beam never reflects — there is no body to send back). Sets
 * req.handled so combat knows the surface consumed the beam.
 */
function handleOpticBeamContact(host, req) {
  const state = host && host.state;
  const beam = req && req.beam;
  if (!state || !beam || req.targetId == null) return;
  const entities = state.entities;
  if (!entities || typeof entities.get !== 'function') return;
  const target = entities.get(req.targetId);
  if (!target || target.alive === false) return;
  const owner = beam.ownerId != null ? entities.get(beam.ownerId) : null;
  const pseudo = opticBeamBolt(beam, { pos: req.pos }, owner);
  if (!host._opticFamilies) host._opticFamilies = new Map();
  const book = opticBookFor(host._opticFamilies, opticFamilyIdOf(pseudo));
  const bus = host.bus;
  const plan = settleOpticContact(pseudo, target, {
    pos: req.pos,
    normal: req.normal,
  }, book, {
    simTime: Number.isFinite(state.simTime) ? state.simTime : 0,
    ledger: opticSpendLedger(state),
    emit: bus ? (name, event) => bus.emit(name, event) : null,
  });
  if (!plan) return;
  req.handled = true;
  // A discharged prism joins the rekindle watch — same as the bolt path.
  if (plan.spentAt != null) {
    if (!host._opticSpent) host._opticSpent = new Set();
    host._opticSpent.add(target.id);
  }
  if (plan.kind === 'prism' && host.helpers && typeof host.helpers.spawnEntity === 'function') {
    const rays = plan.rays || [];
    for (let i = 0; i < rays.length; i++) {
      reserveProjectileCapacity(host.state, 1);
      host.helpers.spawnEntity(opticChildSpec(pseudo, rays[i]));
    }
  }
  if (host.bus) {
    host.bus.emit('optic:contact', {
      kind: plan.kind,
      reason: plan.reason,
      materialId: plan.materialId,
      projectileId: pseudo.id,
      targetId: target.id,
      ownerId: pseudo.ownerId == null ? null : pseudo.ownerId,
      pos: req.pos ? { x: req.pos.x, z: req.pos.z } : (target.pos ? { x: target.pos.x, z: target.pos.z } : null),
      rays: plan.rays ? plan.rays.length : 0,
      spent: plan.spentAt != null,
      via: 'beam',
    });
  }
}

/**
 * Rekindle watch — a discharged prism heals after OPTIC_SPEND_QUIET sim-seconds untouched.
 * The watch is a Set of entity ids (bounded by cells actually burned), so the common frame
 * costs one size check, not an entity scan. Stale ids (despawned, healed by a contact) drop
 * out as they are met.
 */
function serviceOpticRekindle(host, state) {
  const watch = host._opticSpent;
  if (!watch || !watch.size) return;
  const now = Number.isFinite(state && state.simTime) ? state.simTime : 0;
  const entities = state && state.entities;
  const due = [];
  for (const id of watch) {
    const entity = entities && typeof entities.get === 'function' ? entities.get(id) : null;
    if (!entity || entity.alive === false || !entity.data || entity.data.opticMaterial !== 'spent') {
      watch.delete(id);
      continue;
    }
    if (opticRekindleDue(entity, now)) due.push(entity);
  }
  if (!due.length) return;
  const emit = host.bus ? (name, payload) => host.bus.emit(name, payload) : null;
  const rekindled = tickOpticRekindle(due, now, state.world && state.world.opticSpent, emit);
  for (const record of rekindled) if (record.targetId != null) watch.delete(record.targetId);
}

function suppressHitPayload(payload) {
  if (!payload) return;
  payload.damage = 0;
  payload.damagePacket = null;
  payload.packet = null;
  payload.statuses = [];
  payload.heat = 0;
  payload.impulse = null;
}

function scalePacketChannels(packet, scale) {
  if (!packet || !(scale > 0) || scale === 1) return packet;
  const next = { ...packet, channels: packet.channels ? { ...packet.channels } : {} };
  const keys = Object.keys(next.channels);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    next.channels[key] = (Number(next.channels[key]) || 0) * scale;
  }
  return next;
}

function scaleHitPayload(payload, scale) {
  if (!payload || !(scale > 0) || scale === 1) return;
  payload.damage = (Number(payload.damage) || 0) * scale;
  if (payload.damagePacket) payload.damagePacket = scalePacketChannels(payload.damagePacket, scale);
  if (payload.packet) payload.packet = scalePacketChannels(payload.packet, scale);
}

function cloneProjectileDataScaled(data, scale) {
  const next = { ...(data || {}) };
  next.damage = (Number(next.damage) || 0) * scale;
  if (next.damagePacket) next.damagePacket = scalePacketChannels(next.damagePacket, scale);
  return next;
}

function splitFanRad(index, count) {
  if (count <= 1) return 0;
  const spreadDeg = 12;
  const denom = Math.max(1, count - 1);
  const offsetDeg = (index - (count - 1) / 2) * (spreadDeg / denom);
  return offsetDeg * RAD;
}

function nudgeSpawnedAlongVelocity(body) {
  if (!body || !body.pos || !body.vel) return;
  const speed = Math.hypot(body.vel.x || 0, body.vel.z || 0);
  if (!(speed > 0)) return;
  const pad = (body.radius || 0.7) + 0.05;
  body.pos.x += (body.vel.x / speed) * pad;
  body.pos.z += (body.vel.z / speed) * pad;
}

function spawnSplitChildren(host, parent, spec, children, payload) {
  const helpers = host && host.helpers;
  if (!helpers || typeof helpers.spawnEntity !== 'function' || !Array.isArray(children)) return;
  const vx = parent.vel && parent.vel.x || 0;
  const vz = parent.vel && parent.vel.z || 0;
  const speed = Math.hypot(vx, vz) || 1;
  const heading = Math.atan2(vz, vx);
  const count = children.length;
  const pos = (payload && payload.pos) || parent.pos || { x: 0, z: 0 };
  if (!host._attackLive) host._attackLive = new Map();
  for (let i = 0; i < count; i++) {
    const child = children[i];
    const scale = Number.isFinite(child.payloadScale) ? child.payloadScale : 0.55;
    const dir = heading + splitFanRad(i, count);
    const vel = { x: Math.cos(dir) * speed, z: Math.sin(dir) * speed };
    const continued = projectileContinuationPlan(parent.data, pos, speed);
    const data = cloneProjectileDataScaled(parent.data, scale);
    data.spawnPos = continued.spawnPos;
    data.flightDistance = continued.flightDistance;
    reserveProjectileCapacity(host.state, 1);
    const spawned = helpers.spawnEntity({
      type: 'projectile',
      pos: { x: pos.x, z: pos.z },
      vel,
      rot: dir,
      radius: parent.radius || 0.7,
      mass: parent.mass || 0.1,
      team: parent.team,
      ownerId: parent.ownerId,
      factionId: parent.factionId,
      ttl: continued.ttl,
      collides: true,
      data,
    });
    if (!spawned) continue;
    nudgeSpawnedAlongVelocity(spawned);
    host._attackLive.set(spawned.id, {
      spec,
      runtime: child.runtime,
      causalMeta: causalMetaForSpec(spec),
    });
    const remaining = child.runtime && child.runtime.remaining;
    if (remaining && (remaining.bounces > 0 || remaining.pierces > 0)) {
      armAttackContinue(spawned);
    }
  }
}

function tetherAnchorIdOf(state) {
  const tether = state && state.player && state.player.tether;
  return tether && tether.targetId != null ? tether.targetId : null;
}

function applyAttackHopDamage(host, projectile, spec, hop) {
  const helpers = host && host.helpers;
  if (!helpers || typeof helpers.routeCombatDamage !== 'function') return;
  const scale = hop && hop.resolved && Number.isFinite(hop.resolved.scale) ? hop.resolved.scale : 1;
  const base = projectile && projectile.data && projectile.data.damagePacket;
  const packet = base
    ? { ...base, channels: base.channels ? { ...base.channels } : {} }
    : { statuses: [], channels: {} };
  if (scale !== 1 && packet.channels) {
    const keys = Object.keys(packet.channels);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      packet.channels[key] = (Number(packet.channels[key]) || 0) * scale;
    }
  }
  const statuses = hop && hop.resolved && Array.isArray(hop.resolved.statuses)
    ? hop.resolved.statuses.map((status) => ({ id: status.id, stacks: status.stacks }))
    : [];
  packet.statuses = statuses;
  helpers.routeCombatDamage({
    attackerId: projectile.ownerId,
    targetId: hop.target.id,
    packet,
    origin: { kind: 'weapon', id: projectile.data && projectile.data.weaponId },
  });
  void spec;
}

function emptyAttackMetrics() {
  return {
    specsCompiled: 0,
    cacheHits: 0,
    volleys: 0,
    rootsEmitted: 0,
    rootsSuppressed: 0,
  };
}

function ensureWeaponRuntime(host) {
  if (!host._diag) {
    host._diag = {
      autoFireSpatialQueries: 0,
      autoFireCandidates: 0,
    };
  }
  if (!host._attackSpecCache) host._attackSpecCache = new Map();
  if (!host._attackMetrics) host._attackMetrics = emptyAttackMetrics();
  if (!host._attackLive) host._attackLive = new Map();
  if (!host._attackQueryScratch) host._attackQueryScratch = [];
}

function pruneAttackLive(host, state) {
  const live = host && host._attackLive;
  if (!live || live.size === 0) return;
  const entities = state && state.entities;
  for (const id of live.keys()) {
    const projectile = entities && typeof entities.get === 'function' ? entities.get(id) : null;
    if (!projectile || projectile.alive === false || projectile.type !== 'projectile') live.delete(id);
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

export const MOMENTUM_SINK_PLANT_PHASE = Object.freeze({
  idle: 0,
  planted: 1,
  tension: 2,
  released: 3,
});

export function createMomentumSinkPlantScratch() {
  return {
    active: false,
    phase: MOMENTUM_SINK_PLANT_PHASE.idle,
    anchorId: null,
    plantedTick: 0,
    expiresTick: 0,
    anchorX: 0,
    anchorZ: 0,
    frameVx: 0,
    frameVz: 0,
    awayX: 1,
    awayZ: 0,
    storedReceding: 0,
    cruiseSpeed: 0,
  };
}

export function isMomentumSinkAnchor(entity, planter) {
  if (!entity || entity.alive === false) return false;
  const type = entity.type;
  if (type === 'asteroid' || type === 'planet' || type === 'station') return true;
  if (entity.flags && (entity.flags.static === true || entity.flags.anchor === true)) return true;
  if (entity.physicsBody && entity.physicsBody.dynamic === false) return true;
  const mass = authoredMass(entity);
  if (type === 'ship' || type === 'drone') {
    const planterMass = planter ? authoredMass(planter) : 1;
    return mass >= Math.max(MOMENTUM_SINK_BUNGEE.minAnchorMass, planterMass * MOMENTUM_SINK_BUNGEE.capitalAnchorMassMult);
  }
  return mass >= MOMENTUM_SINK_BUNGEE.minAnchorMass;
}

export function ensureMomentumSinkPlant(planter) {
  if (!planter || !planter.data) return null;
  let plant = planter.data.momentumSinkPlant;
  if (!plant) {
    plant = createMomentumSinkPlantScratch();
    planter.data.momentumSinkPlant = plant;
  }
  return plant;
}

export function plantMomentumSinkBungee(plant, planter, anchor, tick) {
  if (!plant || !planter || !anchor) return false;
  if (!isMomentumSinkAnchor(anchor, planter)) return false;
  const pos = planter.pos;
  const apos = anchor.pos;
  if (!pos || !apos) return false;

  let awayX = pos.x - apos.x;
  let awayZ = pos.z - apos.z;
  let length = Math.hypot(awayX, awayZ);
  if (!(length > 1e-6)) {
    const vel = planter.vel;
    awayX = vel && Number.isFinite(vel.x) ? vel.x : 1;
    awayZ = vel && Number.isFinite(vel.z) ? vel.z : 0;
    length = Math.hypot(awayX, awayZ);
    if (!(length > 1e-6)) {
      awayX = 1;
      awayZ = 0;
      length = 1;
    }
  }
  awayX /= length;
  awayZ /= length;

  const frame = anchor.vel;
  plant.active = true;
  plant.phase = MOMENTUM_SINK_PLANT_PHASE.planted;
  plant.anchorId = anchor.id;
  plant.plantedTick = tick | 0;
  plant.expiresTick = (tick | 0) + MOMENTUM_SINK_BUNGEE.durationTicks;
  plant.anchorX = apos.x;
  plant.anchorZ = apos.z;
  plant.frameVx = frame && Number.isFinite(frame.x) ? frame.x : 0;
  plant.frameVz = frame && Number.isFinite(frame.z) ? frame.z : 0;
  plant.awayX = awayX;
  plant.awayZ = awayZ;
  plant.storedReceding = 0;
  plant.cruiseSpeed = cruiseSpeedFor(planter);
  return true;
}

export function tensionMomentumSinkBungee(plant, planter, anchor) {
  if (!plant || !plant.active || !planter || !planter.pos) return false;

  const aposX = anchor && anchor.pos ? anchor.pos.x : plant.anchorX;
  const aposZ = anchor && anchor.pos ? anchor.pos.z : plant.anchorZ;
  let awayX = planter.pos.x - aposX;
  let awayZ = planter.pos.z - aposZ;
  const length = Math.hypot(awayX, awayZ);
  if (length > 1e-6) {
    awayX /= length;
    awayZ /= length;
    plant.awayX = awayX;
    plant.awayZ = awayZ;
  } else {
    awayX = plant.awayX;
    awayZ = plant.awayZ;
  }

  if (anchor && anchor.pos) {
    plant.anchorX = anchor.pos.x;
    plant.anchorZ = anchor.pos.z;
  }
  if (anchor && anchor.vel) {
    if (Number.isFinite(anchor.vel.x)) plant.frameVx = anchor.vel.x;
    if (Number.isFinite(anchor.vel.z)) plant.frameVz = anchor.vel.z;
  }

  const vel = planter.vel;
  const relVx = (vel && Number.isFinite(vel.x) ? vel.x : 0) - plant.frameVx;
  const relVz = (vel && Number.isFinite(vel.z) ? vel.z : 0) - plant.frameVz;
  const receding = relVx * awayX + relVz * awayZ;
  if (receding > MOMENTUM_SINK_BUNGEE.deadbandSpeed) {
    plant.phase = MOMENTUM_SINK_PLANT_PHASE.tension;
    if (receding > plant.storedReceding) plant.storedReceding = receding;
    return true;
  }
  return plant.phase === MOMENTUM_SINK_PLANT_PHASE.tension;
}

export function fillMomentumSinkReleaseImpulse(out, plant, planter) {
  if (!out) return false;
  out.x = 0;
  out.y = 0;
  out.z = 0;
  if (!plant || !plant.active || !planter) return false;

  const peak = plant.storedReceding;
  if (!(peak > MOMENTUM_SINK_BUNGEE.deadbandSpeed)) return false;
  const awayLen = Math.hypot(plant.awayX, plant.awayZ);
  if (!(awayLen > 1e-8)) return false;
  const awayX = plant.awayX / awayLen;
  const awayZ = plant.awayZ / awayLen;

  const vel = planter.vel;
  const relVx = (vel && Number.isFinite(vel.x) ? vel.x : 0) - plant.frameVx;
  const relVz = (vel && Number.isFinite(vel.z) ? vel.z : 0) - plant.frameVz;
  const receding = relVx * awayX + relVz * awayZ;
  const earned = Math.max(peak, receding > 0 ? receding : 0);
  if (!(earned > MOMENTUM_SINK_BUNGEE.deadbandSpeed)) return false;

  const desiredToward = MOMENTUM_SINK_BUNGEE.releaseSpeedMult
    * MOMENTUM_SINK_BUNGEE.releaseSpeedMargin
    * earned;
  const deltaVAway = (-desiredToward) - receding;
  const mass = authoredMass(planter);
  out.x = awayX * mass * deltaVAway;
  out.z = awayZ * mass * deltaVAway;
  return Number.isFinite(out.x) && Number.isFinite(out.z);
}

export function releaseMomentumSinkBungee(out, plant, planter) {
  if (!fillMomentumSinkReleaseImpulse(out, plant, planter)) return false;
  plant.phase = MOMENTUM_SINK_PLANT_PHASE.released;
  plant.active = false;
  return true;
}

export function tryPlantMomentumSinkFromHit(state, payload, getEntity) {
  if (!state || !payload || !hitIsMomentumSink(payload)) return false;
  const getter = resolveEntityGetter(state, getEntity);
  const planter = getter(payload.ownerId);
  const anchor = getter(payload.targetId);
  if (!planter || planter.alive === false) return false;
  const plant = ensureMomentumSinkPlant(planter);
  if (!plant) return false;
  return plantMomentumSinkBungee(plant, planter, anchor, state.tick || 0);
}

export function tickMomentumSinkPlant(state, planter, scratchImpulse, getEntity) {
  const plant = planter && planter.data && planter.data.momentumSinkPlant;
  if (!plant || !plant.active) return false;
  const tick = state && Number.isInteger(state.tick) ? state.tick : 0;
  const getter = resolveEntityGetter(state, getEntity);
  const anchor = plant.anchorId != null ? getter(plant.anchorId) : null;
  if (!anchor || anchor.alive === false) {
    if (queueMomentumSinkRelease(planter, plant, scratchImpulse, state)) return true;
    clearMomentumSinkPlant(plant);
    return false;
  }
  tensionMomentumSinkBungee(plant, planter, anchor);
  if (tick >= plant.expiresTick) {
    if (queueMomentumSinkRelease(planter, plant, scratchImpulse, state)) return true;
    clearMomentumSinkPlant(plant);
  }
  return false;
}

export function clearMomentumSinkPlant(plant) {
  if (!plant) return;
  plant.active = false;
  plant.phase = MOMENTUM_SINK_PLANT_PHASE.idle;
  plant.anchorId = null;
  plant.storedReceding = 0;
}

export function clearAllMomentumSinkPlants(state) {
  for (const entity of indexedShipLikeScan(state)) {
    const plant = entity && entity.data && entity.data.momentumSinkPlant;
    if (plant) clearMomentumSinkPlant(plant);
  }
}

function queueMomentumSinkRelease(planter, plant, scratchImpulse, state) {
  if (!fillMomentumSinkReleaseImpulse(scratchImpulse, plant, planter)) return false;
  queuePhysicsImpulse(planter, scratchImpulse);
  recordImpulseProvenance(planter, {
    actorId: planter.id,
    weaponId: MOMENTUM_SINK_WEAPON_ID,
    tag: 'momentum_sink_release',
    appliedTick: state && state.tick || 0,
    magnitude: Math.hypot(scratchImpulse.x, scratchImpulse.z),
  });
  plant.phase = MOMENTUM_SINK_PLANT_PHASE.released;
  plant.active = false;
  return true;
}

function isMomentumSinkWeapon(w, def) {
  const id = (w && w.defId) || (def && def.id);
  return id === MOMENTUM_SINK_WEAPON_ID;
}

function hitIsMomentumSink(payload) {
  if (!payload) return false;
  if (payload.weaponId === MOMENTUM_SINK_WEAPON_ID) return true;
  const packet = payload.damagePacket || payload.packet;
  const statuses = packet && packet.statuses;
  if (!Array.isArray(statuses)) return false;
  for (let i = 0; i < statuses.length; i++) {
    if (statuses[i] && statuses[i].id === MOMENTUM_SINK_STATUS_ID) return true;
  }
  return false;
}

function resolveEntityGetter(state, getEntity) {
  if (typeof getEntity === 'function') return getEntity;
  return (id) => (state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(id)
    : null);
}

function cruiseSpeedFor(entity) {
  const derived = entity && entity.data && entity.data.derived;
  return positiveNumber(
    derived && derived.combatSpeed,
    positiveNumber(entity && entity.combatSpeed, positiveNumber(entity && entity.maxSpeed, 105)),
  );
}

function authoredMass(entity) {
  return positiveNumber(
    entity && entity.physicsBody && entity.physicsBody.mass,
    positiveNumber(entity && entity.mass, 1),
  );
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

const SHUNT_BODY_TYPES = new Set(['ship', 'drone']);
const INERTIAL_SHUNT_LIVE_TUNING = Object.freeze({
  minClosingSpeed: INERTIAL_SHUNT_TUNING.minClosingSpeed,
  dumpVsLight: INERTIAL_SHUNT_TUNING.liveDumpVsLight,
  refMass: INERTIAL_SHUNT_TUNING.refMass,
  cooldownTicks: INERTIAL_SHUNT_TUNING.cooldownTicks,
});

function shuntPairKey(aId, bId) {
  return String(aId) < String(bId) ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function finiteShunt(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function orientShuntNormal(payload, shunter, target, shunterIsA) {
  const rawNx = finiteShunt(payload && payload.normal && payload.normal.x);
  const rawNz = finiteShunt(payload && payload.normal && payload.normal.z);
  let length = Math.hypot(rawNx, rawNz);
  if (length > 1e-6) {
    const orientation = shunterIsA === false ? -1 : 1;
    return { x: orientation * rawNx / length, z: orientation * rawNz / length };
  }
  const dx = finiteShunt(target && target.pos && target.pos.x) - finiteShunt(shunter && shunter.pos && shunter.pos.x);
  const dz = finiteShunt(target && target.pos && target.pos.z) - finiteShunt(shunter && shunter.pos && shunter.pos.z);
  length = Math.hypot(dx, dz);
  if (!(length > 1e-6)) return null;
  return { x: dx / length, z: dz / length };
}

/**
 * Live ram-plate path. Relative closing is the ram floor. The dump is the shunter's own
 * speed along the contact normal, fully redirected, equal-and-opposite. That is a momentum
 * swap with the light, not a thruster and not a reverse-throw into an oncoming hull.
 */
export function applyInertialShuntFromImpact(
  state,
  payload,
  getEntity,
  shunterOut,
  targetOut,
  torqueOut,
  cooldown,
  bus,
) {
  if (!payload || !getEntity || !shunterOut || !targetOut) return null;
  const getter = resolveEntityGetter(state, getEntity);
  const a = getter(payload.aId);
  const b = getter(payload.bId);
  if (!a || !b || a === b || a.alive === false || b.alive === false) return null;
  if (!SHUNT_BODY_TYPES.has(a.type) || !SHUNT_BODY_TYPES.has(b.type)) return null;

  let shunter = null;
  let target = null;
  if (hullCarriesInertialShunt(a) && !hullCarriesInertialShunt(b)) {
    shunter = a;
    target = b;
  } else if (hullCarriesInertialShunt(b) && !hullCarriesInertialShunt(a)) {
    shunter = b;
    target = a;
  } else if (hullCarriesInertialShunt(a) && hullCarriesInertialShunt(b)) {
    const playerId = state && state.playerId;
    shunter = a.id === playerId ? a : b;
    target = shunter === a ? b : a;
  } else {
    return null;
  }

  const tick = Number.isInteger(payload.tick)
    ? payload.tick
    : (state && Number.isInteger(state.tick) ? state.tick : 0);
  const key = shuntPairKey(a.id, b.id);
  if (cooldown && typeof cooldown.get === 'function') {
    const until = cooldown.get(key);
    if (Number.isInteger(until) && tick < until) return null;
    if (Number.isInteger(until)) cooldown.delete(key);
  }

  const axis = orientShuntNormal(payload, shunter, target, shunter === a);
  if (!axis) return null;
  const relativeClosing = Number.isFinite(payload.preSolveClosingSpeed)
    ? Math.max(0, payload.preSolveClosingSpeed)
    : Math.max(
      0,
      (finiteShunt(shunter.vel && shunter.vel.x) - finiteShunt(target.vel && target.vel.x)) * axis.x
      + (finiteShunt(shunter.vel && shunter.vel.z) - finiteShunt(target.vel && target.vel.z)) * axis.z,
    );
  if (!(relativeClosing >= INERTIAL_SHUNT_LIVE_TUNING.minClosingSpeed)) return null;

  const shunterAlong = Math.max(
    0,
    finiteShunt(shunter.vel && shunter.vel.x) * axis.x
    + finiteShunt(shunter.vel && shunter.vel.z) * axis.z,
  );
  const contact = {
    normal: axis,
    closingSpeed: shunterAlong,
    shunterIsA: true,
  };
  if (!fillInertialShuntImpulses(shunterOut, targetOut, shunter, target, INERTIAL_SHUNT_LIVE_TUNING, contact)) {
    return null;
  }

  queuePhysicsImpulse(shunter, shunterOut);
  queuePhysicsImpulse(target, targetOut);
  const mT = authoredMass(target);
  const mS = authoredMass(shunter);
  const couple = Math.max(0.08, Math.min(1, INERTIAL_SHUNT_LIVE_TUNING.refMass / Math.max(mT, INERTIAL_SHUNT_LIVE_TUNING.refMass)));
  if (torqueOut) {
    torqueOut.x = 0;
    torqueOut.y = finiteShunt(INERTIAL_SHUNT_TUNING.tumbleTorque) * couple;
    torqueOut.z = 0;
    queuePhysicsTorqueImpulse(target, torqueOut);
  }
  const transferred = Math.hypot(targetOut.x, targetOut.z);
  const residual = Math.hypot(shunterOut.x + targetOut.x, shunterOut.z + targetOut.z);
  const targetDeltaV = transferred / mT;
  const shunterDeltaV = Math.hypot(shunterOut.x, shunterOut.z) / mS;
  const provenance = {
    actorId: shunter.id,
    weaponId: INERTIAL_SHUNT_WEAPON_ID,
    tag: 'inertial_shunt',
    appliedTick: tick,
    magnitude: transferred,
  };
  recordImpulseProvenance(shunter, provenance);
  recordImpulseProvenance(target, provenance);
  if (bus && typeof bus.emit === 'function') {
    publishHitstunImpulse(bus, {
      source: 'weapon',
      victimId: target.id,
      attackerId: shunter.id,
      attackerMass: mS,
      victimMass: mT,
      deltaV: targetDeltaV,
      dirX: axis.x,
      dirZ: axis.z,
      hitSide: signedHitSide(target, targetOut, null, target.id),
      provenance,
      tick,
    });
    const pos = payload.pos || target.pos || shunter.pos;
    bus.emit('presentation:vfxCue', {
      id: 'combat.inertialShunt.contact',
      lane: 'combat',
      particles: 14,
      lights: 1,
      magnitude: Math.min(1.6, targetDeltaV / INERTIAL_SHUNT_TUNING.screenDepthWu),
      position: pos,
      direction: { x: axis.x, z: axis.z },
      material: 'impulse',
      sourceId: shunter.id,
      targetId: target.id,
      flashReduced: false,
    });
  }
  if (cooldown && typeof cooldown.set === 'function') {
    const hold = Number.isInteger(INERTIAL_SHUNT_LIVE_TUNING.cooldownTicks)
      ? INERTIAL_SHUNT_LIVE_TUNING.cooldownTicks
      : 45;
    cooldown.set(key, tick + hold);
  }
  return {
    shunterId: shunter.id,
    targetId: target.id,
    targetDeltaV,
    shunterDeltaV,
    momentumTransferred: transferred,
    momentumResidual: residual,
    axisX: axis.x,
    axisZ: axis.z,
    tumbled: !!(torqueOut && torqueOut.y > 0),
  };
}
