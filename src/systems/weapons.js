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

const RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;

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
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;

    // Beams are transient per-tick rays; combat normally rebuilds state.combat.beams but may be a
    // stub this wave, so we clear it ourselves to keep it from growing unbounded.
    if (state.combat) {
      if (!Array.isArray(state.combat.beams)) state.combat.beams = [];
      else state.combat.beams.length = 0;
    }
    this._beamFiringPrev = this._beamFiring;
    this._beamFiring = new Set();

    // 1) cool/recharge every weapon instance + steer in-flight homing projectiles.
    this._tickWeapons(dt, state);
    this._steerHoming(dt, state);

    // 2) fire — player first, then NPC ships.
    const player = this.helpers.getEntity(state.playerId);
    if (player && player.alive && !player.flags.docked) {
      // Manual fire (LMB/Space) always wins; it aims at the mouse. Otherwise, if auto-fire is on,
      // find the nearest aggressive enemy and fire at it (so the player can fly while guns auto-engage).
      let firing = !!state.input.fire;
      let autoTgt = null;
      if (!firing && state.input.autoFire) {
        autoTgt = this._autoFireTarget(player, state);
        firing = !!autoTgt;
      }
      // aimAngle for gimbal/turret: mouse aim for manual, lead-angle for auto-fire, else nose.
      const aimAngle = firing ? (autoTgt ? this._leadAngle(player, autoTgt, this._playerProjSpeed(player))
                                         : (state.input.aimAngle || player.rot))
                              : (state.input.aimAngle || player.rot);
      this._serviceShip(player, firing, /*isPlayer*/ true, dt, state, aimAngle, autoTgt);
    }
    for (const e of state.entityList) {
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
  },

  // --- per-instance timers (cooldown, heat dissipation, lock decay) ---
  _tickWeapons(dt, state) {
    for (const e of state.entityList) {
      if (e.type !== 'ship' || !e.alive) continue;
      const ws = e.data && e.data.weapons;
      if (!ws) continue;
      for (const w of ws) {
        const def = this._byId.get(w.defId) || {};
        if (w._cooldown > 0) w._cooldown = Math.max(0, w._cooldown - dt);
        const dissip = def.heatDissip != null ? def.heatDissip : (w.heatDissip || 0);
        if (w._heat > 0 && dissip > 0) w._heat = Math.max(0, w._heat - dissip * dt);
      }
      // Missile lock build/decay lives on the ship's combat block.
      this._tickLock(e, dt);
    }
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
    for (const p of state.entityList) {
      if (p.type !== 'projectile' || !p.alive) continue;
      const d = p.data;
      if (!d || d.kind !== 'missile') continue;
      if (!d.armed) { d.armed = true; }
      const tgt = d.targetId != null ? this.helpers.getEntity(d.targetId) : null;
      const turnRate = d.turnRate || 0;
      const speedMax = d.projSpeed || Math.hypot(p.vel.x, p.vel.z) || 1;
      let cur = Math.atan2(p.vel.z, p.vel.x);
      if (tgt && tgt.alive && turnRate > 0) {
        const desired = Math.atan2(tgt.pos.z - p.pos.z, tgt.pos.x - p.pos.x);
        const diff = wrapAngle(desired - cur);
        const step = Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
        cur = wrapAngle(cur + step);
      }
      // ramp speed up to the weapon's max projectile speed
      let sp = Math.hypot(p.vel.x, p.vel.z);
      const accel = d.projAccel || 0;
      if (accel > 0) sp = Math.min(speedMax, sp + accel * dt);
      else sp = speedMax;
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
        const dissip = def.heatDissip != null ? def.heatDissip : (w.heatDissip || 0);
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
    if (state.combat && Array.isArray(state.combat.beams)) {
      state.combat.beams.push({
        ownerId: e.id, factionId: e.factionId,
        from: { x: origin.x, z: origin.z }, to,
        dmgType: w.damageType || def.damageType || 'energy',
        dpsThisTick: (w.dmg != null ? w.dmg : def.dmg || 0) * dt,
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

    const heatPerShot = w.heat != null ? w.heat : (def.heatPerShot != null ? def.heatPerShot : 0);
    const heatMax = w.heatMax != null ? w.heatMax : (def.heatMax != null ? def.heatMax : Infinity);
    if ((w._heat || 0) >= heatMax) return capLeft;            // overheated
    if ((w._heat || 0) + heatPerShot > heatMax) return capLeft; // this shot would overheat → lock out

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
      const aim = this._leadAngle(e, tgt, w.projSpeed != null ? w.projSpeed : def.projSpeed || 1);
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
    if (heatPerShot) w._heat = (w._heat || 0) + heatPerShot;
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
    // inherit a portion of shooter velocity (momentum)
    const vel = {
      x: cf * launchSpeed + e.vel.x * 0.5,
      z: sf * launchSpeed + e.vel.z * 0.5,
    };

    // time-to-live: bullets = range / speed; missiles use the slower launch speed so they live
    // long enough to track (and at least a small floor).
    const refSpeed = isMissile && projSpeedMin != null ? projSpeedMin : projSpeed;
    const ttl = Math.max(0.25, range / Math.max(1, refSpeed));

    const data = {
      damage: (w.dmg != null ? w.dmg : def.dmg) || 0,
      damageType: w.damageType || def.damageType || 'kinetic',
      ownerId: e.id,
      weaponId: w.defId,
      kind: isMissile ? 'missile' : 'bullet',
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
  _leadAngle(shooter, tgt, projSpeed) {
    const px = tgt.pos.x - shooter.pos.x, pz = tgt.pos.z - shooter.pos.z;
    const rvx = tgt.vel.x - shooter.vel.x, rvz = tgt.vel.z - shooter.vel.z;
    let t = 0;
    for (let i = 0; i < 2; i++) {
      const aimx = px + rvx * t, aimz = pz + rvz * t;
      const dist = Math.hypot(aimx, aimz);
      t = dist / Math.max(1, projSpeed);
    }
    const aimx = px + rvx * t, aimz = pz + rvz * t;
    return Math.atan2(aimz, aimx);
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
  _autoFireTarget(player, state) {
    let best = null, bestD2 = Infinity;
    const px = player.pos.x, pz = player.pos.z;
    for (const e of state.entityList) {
      if (e.type !== 'ship' || !e.alive || e.id === player.id) continue;
      if (e.team === player.team) continue;              // friendly — never auto-target allies
      if (!this._isAggressive(e, player, state)) continue;
      const dx = e.pos.x - px, dz = e.pos.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
  },

  // An NPC counts as aggressive if it has AI in an attacking state, OR it is the player's current
  // selected/locked target, OR it recently damaged the player. Passive traders/patrols are skipped.
  _isAggressive(e, player, state) {
    const ai = e.data && e.data.ai;
    if (ai) {
      // Passive freighters (ambient traffic, V2 §28b) are NEVER auto-targeted — they're scenery +
      // economy movers, not threats. Attacking one is a deliberate player choice (piracy -> heat),
      // never an auto-fire accident.
      if (ai.passive) return false;
      const fsm = ai.fsm;
      if (fsm === 'attack' || fsm === 'strafe' || fsm === 'pursue') return true;
      // lawful patrols only count if the player is wanted (they'd attack); otherwise leave them be
      if (ai.lawful && !ai.playerWanted) return false;
      // a fleeing trader isn't a threat, but if it's shooting back (cornered) we may engage it
    }
    const combat = e.data && e.data.combat;
    if (combat && combat.targetId === player.id) return true;
    // threat table: has this entity accrued threat from the player (i.e. it's been in a fight with us)?
    const tbl = state.combat && state.combat.threatTables && state.combat.threatTables.get(e.id);
    if (tbl && (tbl.get(player.id) || 0) > 0) return true;
    return false;
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
