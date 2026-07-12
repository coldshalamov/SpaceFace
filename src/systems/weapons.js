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
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { isHostileToPlayer, SCANNER_CONTACT_RANGE } from './scanner.js';
import { combatFlag } from '../data/featureFlags.js';

const RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const AUTO_FIRE_QUERY_RADIUS_PAD = 128;

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
// The forced vent is a live-play feel layer. It is gated to browser sessions (window present) so the
// headless deterministic 47a replay — which records a specific combat encounter and would be
// invalidated by the vent's firing lockout — stays byte-for-byte stable. This mirrors the existing
// `typeof document` DOM-guards in input.js / flightV3.js: sim-authoritative math is identical in both
// contexts. Player-facing presentation is browser-only, while live NPCs share the thermal lockout.
const WEAPON_VENT_ENABLED = typeof window !== 'undefined';

const DEG2 = WEAPONS; // keep import referenced even if tree-shaken oddly (no-op)

export const weapons = {
  name: 'weapons',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;

    // Catalog lookup by weapon def id (instance fields win, def fills the gaps).
    this._byId = new Map(WEAPONS.map((w) => [w.id, w]));

    // Own deterministic stream so firing never disturbs the core sim PRNG (§0.5).
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    this._rng = this.helpers.mulberry32(this.helpers.hash32(seed, 'weapons'));

    // Track which beam owners were firing last tick so we can emit combat:beamStop on release.
    this._beamFiring = new Set();
    this._beamFiringPrev = new Set();
    this._autoFireScratch = [];
    this._autoLeadVel = new Map();
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

      // Manual fire (LMB/Space) only — auto-target supplies aim, never holds the trigger.
      // Cruise charge/cruise forces firing=false but still services the ship so beams release and
      // cooldowns/heat tick down (spec2/02 §1).
      let firing = false;
      let autoTgt = null;
      if (!playerFireBlocked) {
        firing = !!state.input.fire;
        if (state.input.actions?.tetherFire) firing = false;
      }
      if (state.input.autoFire) {
        autoTgt = this._selectedAutoFireTarget(player, state) ?? this._autoFireTarget(player, state);
      }
      let aimTgt = autoTgt;
      if (autoTgt) {
        // Velocity smoothing for lead: raw per-tick vel from oscillating/tethered targets makes the
        // 2-iter lead solver spray shots L/R. Blend gives "average flight direction" so bullets
        // cluster where a human would hold lead. Purely for prediction; does not affect sim state.
        const id = String(autoTgt.id);
        const raw = autoTgt.vel || { x: 0, z: 0 };
        if (!this._autoLeadVel) this._autoLeadVel = new Map();
        let sv = this._autoLeadVel.get(id);
        const a = 0.28;
        if (!sv) sv = { x: raw.x, z: raw.z };
        else sv = { x: sv.x * (1 - a) + raw.x * a, z: sv.z * (1 - a) + raw.z * a };
        this._autoLeadVel.set(id, sv);
        aimTgt = { pos: autoTgt.pos, vel: sv, radius: autoTgt.radius };
      }
      const aimAngle = aimTgt
        ? this._leadAngle(player, aimTgt, this._playerProjSpeed(player))
        : (state.input.aimAngle || player.rot);
      this._serviceShip(player, firing, /*isPlayer*/ true, dt, state, aimAngle, autoTgt);
    }
    const ships = (state.entityIndex && state.entityIndex.ships) || state.entityList;
    for (const e of ships) {
      if (e.type !== 'ship' || !e.alive || e.id === state.playerId) continue;
      const intent = e.data && e.data.intent;
      const firing = !!(intent && intent.fire);
      // NPC aim = its intent aimAngle (already a lead/intercept angle from ai.js). fall back to nose.
      const aimAngle = (intent && intent.aimAngle != null) ? intent.aimAngle : e.rot;
      this._serviceShip(e, firing, false, dt, state, aimAngle, null);
    }

    // 3) beam release → combat:beamStop for owners who stopped firing a continuous weapon.
    for (const ownerId of this._beamFiringPrev) {
      if (!this._beamFiring.has(ownerId)) this.bus.emit('combat:beamStop', { ownerId });
    }
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

  // Forced heat vent: the instant any weapon pegs heatMax, lock every weapon out for
  // WEAPON_VENT_S seconds and dump heat fast so the guns visibly cool, then come back online. This
  // is the "2-second vent" rhythm beat. Live NPCs obey the same timer; player-only receipts drive HUD.
  _tickVent(e, dt, state) {
    if (!WEAPON_VENT_ENABLED) return;
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
    if (!WEAPON_VENT_ENABLED || !e) return false;
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

  // --- fire all weapons on a ship if it is firing this tick ---
  // aimAngle: the world angle to gimbal/turret toward (player mouse aim, NPC lead, or auto-fire lead).
  // forceTarget: an explicit target entity (auto-fire / missile-lock); null = use ship's selected target.
  _serviceShip(e, firing, isPlayer, dt, state, aimAngle, forceTarget) {
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
      if (continuous) {
        capLeft = this._serviceBeam(e, w, def, firing, capLeft, dt, state, aimAngle);
      } else if (firing) {
        capLeft = this._serviceProjectileWeapon(e, w, def, isPlayer, capLeft, dt, state, aimAngle, forceTarget);
      }
    }
    // write the drained capacitor back (cap pool is ours to spend; regen is combat's, §0.6 note)
    if (typeof e.cap === 'number') e.cap = capLeft;
  },

  // Continuous beam: drain cap/heat while firing, push a transient ray, emit combat:fire/beamStop.
  // Damage application is combat's responsibility (we only mark the ray + spend resources).
  _serviceBeam(e, w, def, firing, capLeft, dt, state, aimAngle) {
    const energyCost = w.energyCost != null ? w.energyCost : def.energyCost || 0; // cap/s
    const heatPerSec = w.heatPerSec != null ? w.heatPerSec : def.heatPerSec || 0;
    const heatMax = w.heatMax != null ? w.heatMax : def.heatMax || Infinity;
    const range = w.range != null ? w.range : def.range || 0;
    const overheated = (w._heat || 0) >= heatMax;
    const canFire = firing && !overheated && capLeft >= energyCost * dt;
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
    const dir = this._hardpointDir(e, w, aimAngle || e.rot, 0);
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
        damagePacket: weaponDamagePacket(w, def, damage, damageType),
      });
    }
    this._beamFiring.add(e.id);
    this.bus.emit('combat:fire', {
      ownerId: e.id, weaponId: w.defId, hardpointIdx: w.slotIndex,
      origin, dir,
    });
    return capLeft;
  },

  // Projectile weapon: gate on cooldown/cap/heat (+lock/+arc), spawn a projectile, emit combat:fire.
  _serviceProjectileWeapon(e, w, def, isPlayer, capLeft, dt, state, aimAngle, forceTarget) {
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
      let tForLead = tgt;
      if (forceTarget && forceTarget.id != null && String(forceTarget.id) === String(tgt.id) && this._autoLeadVel) {
        const sv = this._autoLeadVel.get(String(tgt.id));
        if (sv) tForLead = { pos: tgt.pos, vel: sv, radius: tgt.radius };
      }
      const aim = this._leadAngle(e, tForLead, w.projSpeed != null ? w.projSpeed : def.projSpeed || 1);
      const arc = w.gimbalArc != null ? w.gimbalArc : (def.turretArcDeg ? def.turretArcDeg * RAD : Math.PI);
      // turret arc is measured about the hull centre; outside it the mount can't bear.
      if (Math.abs(wrapAngle(aim - e.rot)) > arc / 2) return capLeft;
      dir = aim;
    } else {
      // FIXED mount: base direction = nose + hardpoint facing offset, then gimbal-assist toward the
      // aim direction within the mount's gimbal arc. Spread is layered on last. This is the
      // Freelancer feel — front guns track the cursor up to a cone, then fire straight.
      dir = this._hardpointDir(e, w, aimAngle != null ? aimAngle : e.rot, def.spreadDeg != null ? def.spreadDeg : 0);
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
      : projectileVelocityForAimedBullet(cf, sf, launchSpeed, e.vel);

    // time-to-live is a backup cleanup only; physics enforces maxDistance spatially before hit
    // resolution, so inherited ship speed cannot turn a stray shot into a far-off friendly-fire hit.
    const worldSpeed = Math.hypot(vel.x, vel.z);
    const ttl = Math.max(0.25, range / Math.max(1, worldSpeed));

    const damage = (w.dmg != null ? w.dmg : def.dmg) || 0;
    const damageType = w.damageType || def.damageType || 'kinetic';
    const data = {
      damage,
      damageType,
      damagePacket: weaponDamagePacket(w, def, damage, damageType),
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
      if (def.splashDmg != null) data.splashDmg = def.splashDmg;
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

  // --- helpers ---

  // Current target for a ship: explicit combat.targetId, else player's selected target.
  _resolveTarget(e) {
    const combat = e.data && e.data.combat;
    let id = combat && combat.targetId != null ? combat.targetId : null;
    if (id == null && e.id === this.state.playerId) id = this.state.player.targetId;
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

  // Auto-fire target: the nearest ship that is ACTIVELY hostile toward the player — either on a
  // hostile team and in an attack FSM state, or currently targeting/attacking the player. This
  // implements "fire only at aggressive enemies while I fly" (Phase 2). Returns null if none.
  _selectedAutoFireTarget(player, state) {
    const id = state && state.player && state.player.targetId;
    if (id == null) return null;
    const e = state.entities && state.entities.get ? state.entities.get(id) : null;
    if (!e || !e.alive || (e.type !== 'ship' && e.type !== 'drone') || e.id === player.id) return null;
    if (!isHostileToPlayer(e, player.team, state)) return null;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    const scanR = SCANNER_CONTACT_RANGE + (e.radius || 0);
    if (d2 > scanR * scanR) return null;
    return e;
  },

  _autoFireTarget(player, state) {
    ensureWeaponRuntime(this);
    let best = null, bestD2 = Infinity;
    const px = player.pos.x, pz = player.pos.z;
    const maxRange = playerAutoFireRange(this, player);
    const ships = shipsNearPlayer(state, player, maxRange + AUTO_FIRE_QUERY_RADIUS_PAD, this._autoFireScratch);
    if (ships === this._autoFireScratch) this._diag.autoFireSpatialQueries++;
    this._diag.autoFireCandidates += ships.length;
    for (const e of ships) {
      if (e.type !== 'ship' || !e.alive || e.id === player.id) continue;
      if (e.team === player.team) continue;              // friendly — never auto-target allies
      if (!this._isAggressive(e, player, state)) continue;
      const dx = e.pos.x - px, dz = e.pos.z - pz;
      const d2 = dx * dx + dz * dz;
      const inRange = maxRange <= 0 || d2 <= (maxRange + (e.radius || 0)) * (maxRange + (e.radius || 0));
      if (!inRange) continue;
      if (d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
  },

  // An NPC counts as aggressive if it has AI in an attacking state, OR it is the player's current
  // selected/locked target, OR it recently damaged the player. Passive traders/patrols are skipped.
  _isAggressive(e, player, state) {
    if (!isHostileToPlayer(e, player.team, state)) return false;
    const ai = e.data && e.data.ai;
    if (ai) {
      // Passive freighters (ambient traffic, V2 §28b) are NEVER auto-targeted — they're scenery +
      // economy movers, not threats. Attacking one is a deliberate player choice (piracy -> heat),
      // never an auto-fire accident.
      if (ai.passive) return false;
      const fsm = ai.fsm;
      if (fsm === 'attack' || fsm === 'strafe' || fsm === 'pursue') return true;
      // isHostileToPlayer already gates lawful patrols on canonical WANTED heat.
      if (ai.lawful) return true;
      // a fleeing trader isn't a threat, but if it's shooting back (cornered) we may engage it
    }
    const combat = e.data && e.data.combat;
    if (combat && combat.targetId === player.id) return true;
    // threat table: has this entity accrued threat from the player (i.e. it's been in a fight with us)?
    const tbl = state.combat && state.combat.threatTables && state.combat.threatTables.get(e.id);
    if (tbl && (tbl.get(player.id) || 0) > 0) return true;
    return true;
  },

  // Representative projectile speed of the player's primary weapon, for auto-fire lead prediction.
  _playerProjSpeed(player) {
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

// Iterative lead/intercept solver (2 passes), extracted so BOTH the sim fire path (weapons._leadAngle)
// and the player HUD lead pip (src/ai/gunnery.js) share ONE ballistic model. Pure; no RNG, no state.
// Returns the world-space angle to aim so a shot at `projSpeed` intercepts `tgt` given both velocities.
export function solveLeadAngle(shooter, tgt, projSpeed) {
  const sp = (shooter && shooter.pos) || { x: 0, z: 0 };
  const sv = (shooter && shooter.vel) || { x: 0, z: 0 };
  const tp = (tgt && tgt.pos) || { x: 0, z: 0 };
  const tv = (tgt && tgt.vel) || { x: 0, z: 0 };
  const px = tp.x - sp.x, pz = tp.z - sp.z;
  const rvx = tv.x - sv.x, rvz = tv.z - sv.z;
  let t = 0;
  const ps = Math.max(1, Number.isFinite(projSpeed) ? projSpeed : 1);
  for (let i = 0; i < 2; i++) {
    const aimx = px + rvx * t, aimz = pz + rvz * t;
    const dist = Math.hypot(aimx, aimz);
    t = dist / ps;
  }
  const aimx = px + rvx * t, aimz = pz + rvz * t;
  return Math.atan2(aimz, aimx);
}

function shipsNearPlayer(state, player, radius, out) {
  return queryNearbyEntities(state, player.pos, radius, out,
    (state.entityIndex && state.entityIndex.ships) || state.entityList);
}

function playerAutoFireRange(host, player) {
  const ws = player && player.data && player.data.weapons;
  if (!ws || !ws.length) return 0;
  let range = 0;
  const byId = host && host._byId;
  for (const w of ws) {
    const def = byId && byId.get ? byId.get(w.defId) : null;
    const r = w.range != null ? w.range : (def && def.range);
    if (Number.isFinite(r) && r > range) range = r;
  }
  return range;
}

function npcFireTargetVisibleOnPlayerRadar(e, state) {
  const combat = e && e.data && e.data.combat;
  if (!state || !combat || combat.targetId !== state.playerId) return true;
  const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos || !e.pos) return true;
  const range = (state.ui && Number.isFinite(state.ui.radarRange)) ? state.ui.radarRange : 4000;
  const pad = (player.radius || 0) + (e.radius || 0);
  const dx = e.pos.x - player.pos.x;
  const dz = e.pos.z - player.pos.z;
  return dx * dx + dz * dz <= (range + pad) * (range + pad);
}

function projectileVelocityForAimedBullet(cf, sf, launchSpeed, shooterVel) {
  const sx = Number.isFinite(shooterVel && shooterVel.x) ? shooterVel.x : 0;
  const sz = Number.isFinite(shooterVel && shooterVel.z) ? shooterVel.z : 0;
  const along = sx * cf + sz * sf;
  const shooterSpeed2 = sx * sx + sz * sz;
  const lateral2 = Math.max(0, shooterSpeed2 - along * along);
  const launch2 = launchSpeed * launchSpeed;
  if (!(launch2 > lateral2)) {
    return { x: cf * launchSpeed, z: sf * launchSpeed };
  }
  const worldSpeed = along + Math.sqrt(launch2 - lateral2);
  if (!(worldSpeed > 0)) {
    return { x: cf * launchSpeed, z: sf * launchSpeed };
  }
  return { x: cf * worldSpeed, z: sf * worldSpeed };
}

function ensureWeaponRuntime(host) {
  if (!host._autoFireScratch) host._autoFireScratch = [];
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

function weaponDamagePacket(w, def, damage, damageType, pos = null) {
  return scalarHitToDamagePacket({
    damage,
    damageType,
    pos,
    penetration: w.armorPierce != null ? w.armorPierce : def.armorPierce,
    // Subsystem-targeting / shield-bypass verbs (EMP disable, spec §9). Authored on the weapon def;
    // 0/null for normal hull weapons.
    subsystemShare: w.subsystemShare != null ? w.subsystemShare : def.subsystemShare,
    shieldBypass: w.shieldBypass != null ? w.shieldBypass : def.shieldBypass,
    source: {
      kind: 'weapon',
      weaponId: w.defId || def.id || null,
    },
  });
}
