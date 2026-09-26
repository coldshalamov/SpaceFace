// Countermeasures / EW system (goal P1-7).
//
// Gives homing missiles real counterplay beyond pure dodging. Ships equipped with a countermeasure
// utility module (mod_chaff_dispenser_m / mod_decoy_buoy_s / mod_ecm_jammer_l) can deploy it on a
// cooldown:
//   CHAFF — breaks missile locks on the deploying ship (resets attackers' lockProgress) AND diverts
//           a fraction of in-flight missiles targeting the ship toward a decoy cloud (they fly
//           harmlessly toward the cloud origin until their TTL expires). The classic missile-defense.
//   DECOY — breaks locks partially AND, for the buoy's whole duration, re-baits ANY seeker that
//           crosses the buoy's water: the missile re-attacks the buoy point, not the ship. A bait
//           verb — you place it ahead of the fight, not behind you.
//   ECM   — jams homing guidance: any missile within the effect radius has its turnRate zeroed for
//           the effect duration (it flies straight, easy to dodge). Also partially breaks locks.
//
// POINT-DEFENSE SERVO (mod_pds_servo_s) rides the same system as the autonomous defensive verb:
// a fitted servo kills the nearest hostile projectile inside its ring on a cooldown — no keybind,
// no deploy; it is always on while fitted.
//
// Deploy trigger: the player presses the countermeasure keybind (default X, remappable); AI ships
// auto-deploy when a missile is locked onto them or within a close threshold. Effects are timed
// (durationS) and cooldown-gated (cooldownS) — NOT consumable ammo, keeping the equipment loop simple.
//
// Integration: reads e.data.fittings + MODULES to find the equipped countermeasure; reads/writes
// e.data.combat for the cooldown timer + active-effect state; diverts missiles by rewriting their
// data.targetId to a decoy; jams by zeroing data.turnRate (read by weapons._steerHoming). Pure sim
// state — the VFX (chaff puff / ECM shimmer) is emitted via bus events for the renderer to pick up.

import { MODULES } from '../data/modules.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';

const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));

// Find the equipped countermeasure module def + its config on a ship's fittings, or null.
function equippedCountermeasure(fittings) {
  if (!fittings) return null;
  for (const id of fittings) {
    if (!id) continue;
    const def = MODULE_BY_ID.get(id);
    const cm = def && def.mods && def.mods.countermeasure;
    if (cm) return { moduleId: id, def, cm };
  }
  return null;
}

// Find the equipped point-defense servo config on a ship's fittings, or null. Same pattern as the
// countermeasure block: the config object is read from the fitting at runtime, not folded into
// derived stats, so a deployed servo always matches the module the hull actually carries.
function equippedPointDefense(fittings) {
  if (!fittings) return null;
  for (const id of fittings) {
    if (!id) continue;
    const def = MODULE_BY_ID.get(id);
    const pds = def && def.mods && def.mods.pointDefense;
    if (pds) return { moduleId: id, def, cfg: pds };
  }
  return null;
}

const CM_KIND_WORD = Object.freeze({ chaff: 'Chaff deployed', ecm: 'ECM jamming active', decoy: 'Decoy buoy broadcasting' });
const CM_KIND_AUDIO = Object.freeze({ chaff: 'cm_chaff', ecm: 'cm_ecm', decoy: 'cm_chaff' });

// Per-ship countermeasure runtime state lives on e.data.cm (lazily initialized).
function ensureCm(e) {
  if (!e.data.cm) e.data.cm = { cooldownT: 0, effectT: 0, effect: null };
  return e.data.cm;
}

/** Bench A/B: production default ON. Quiet latch skips ship walks when no CM/PDS interest. */
let COUNTERMEASURES_QUIET_LATCH = true;
export function setCountermeasuresQuietLatchForBench(enabled) {
  COUNTERMEASURES_QUIET_LATCH = enabled !== false;
}
export function getCountermeasuresQuietLatchForBench() {
  return COUNTERMEASURES_QUIET_LATCH !== false;
}

/** Membership / fittings rescan while latched (0.5 s @ 60 Hz). */
const CM_QUIET_RESCAN_TICKS = 30;

function entityIndexVersion(state) {
  const index = state && state.entityIndex;
  return index && index.__spacefaceEntityIndexV1 && Number.isFinite(index.version)
    ? index.version
    : null;
}

function shipHasCountermeasureInterest(e) {
  if (!e || e.alive === false || e.type !== 'ship') return false;
  const data = e.data;
  if (!data) return false;
  const cm = data.cm;
  if (cm && ((cm.cooldownT > 0) || (cm.effectT > 0) || cm.effect)) return true;
  const pds = data.pds;
  if (pds && pds.cooldownT > 0) return true;
  const fittings = data.fittings;
  if (!fittings) return false;
  if (equippedCountermeasure(fittings)) return true;
  if (equippedPointDefense(fittings)) return true;
  return false;
}

function anyCountermeasureInterest(state) {
  const ships = countermeasureShipCandidates(state);
  for (let i = 0; i < ships.length; i++) {
    if (shipHasCountermeasureInterest(ships[i])) return true;
  }
  return false;
}

export const countermeasures = {
  name: 'countermeasures',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._projectileScratch = [];
    this._diag = {
      threatSpatialQueries: 0,
      effectSpatialQueries: 0,
      projectileCandidates: 0,
    };
  },

  newGame() { /* no global state — per-ship runtime state is transient */ },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    ensureCountermeasureRuntime(this);
    resetCountermeasureDiagnostics(this._diag);

    // Quiet Ceres / open flight: four full ships walks every tick even when nobody carries a
    // countermeasure or PDS. Latch when the roster has no CM/PDS interest; wake on deploy input,
    // entity-index membership, live cm/pds timers, or a 0.5 s rescan for mid-life fitting changes.
    const inpEarly = state.input;
    const deployEdge = !!(inpEarly && inpEarly.deployCountermeasure);
    if (COUNTERMEASURES_QUIET_LATCH !== false) {
      const membership = entityIndexVersion(state);
      const tick = state.tick | 0;
      let quiet = this._cmQuiet;
      if (quiet
        && !deployEdge
        && quiet.membership === membership
        && ((tick - (quiet.armedTick | 0)) < CM_QUIET_RESCAN_TICKS)) {
        state.countermeasureRuntime = state.countermeasureRuntime || {};
        state.countermeasureRuntime.diagnostics = this._diag;
        state.countermeasureRuntime.quietLatched = true;
        return;
      }
      if (!deployEdge && !anyCountermeasureInterest(state)) {
        this._cmQuiet = { membership, armedTick: tick };
        state.countermeasureRuntime = state.countermeasureRuntime || {};
        state.countermeasureRuntime.diagnostics = this._diag;
        state.countermeasureRuntime.quietLatched = true;
        return;
      }
      this._cmQuiet = null;
    }

    // 1. Tick cooldowns + active-effect timers on every ship, and expire finished effects. When an
    //    ECM effect expires, restore the turnRate on missiles it jammed (stored in _jammedTurnRate).
    for (const e of countermeasureShipCandidates(state)) {
      if (e.type !== 'ship' || !e.alive) continue;
      const cm = e.data && e.data.cm;
      if (!cm) continue;
      if (cm.cooldownT > 0) cm.cooldownT = Math.max(0, cm.cooldownT - dt);
      if (cm.effectT > 0) {
        cm.effectT = Math.max(0, cm.effectT - dt);
        if (cm.effectT <= 0) {
          // ECM effect ending: un-jam any missile this ship jammed (restore its real turnRate).
          if (cm.effect && cm.effect.cfg && cm.effect.cfg.kind === 'ecm') {
            const projectiles = (state.entityIndex && state.entityIndex.projectiles) || state.entityList;
            for (const p of projectiles) {
              if (p.type !== 'projectile' || !p.alive) continue;
              const d = p.data;
              if (d && d._jammedTurnRate != null && d._jammedBy === e.id) {
                d.turnRate = d._jammedTurnRate;
                delete d._jammedTurnRate; delete d._jammedBy;
              }
            }
          }
          cm.effect = null;
        }
      }
    }

    // 2. Player deploy: triggered by state.input (set by a keybind in input.js). We read a flag the
    //    input system sets rather than a raw key so it's rebindable + gamepad/touch-consistent.
    const inp = state.input;
    if (inp && inp.deployCountermeasure && state.mode === 'flight' && !(state.ui && state.ui.screenStack && state.ui.screenStack.length > 0)) {
      inp.deployCountermeasure = false; // consume the edge
      const player = state.entities.get(state.playerId);
      if (player) this._tryDeploy(player);
    }

    // 3. AI auto-deploy: ships with a countermeasure deploy when a missile is locked onto them or
    //    closing fast. Cheap check — only ships that HAVE a countermeasure run the threat scan.
    for (const e of countermeasureShipCandidates(state)) {
      if (e.type !== 'ship' || !e.alive || e.id === state.playerId) continue;
      const eq = equippedCountermeasure(e.data && e.data.fittings);
      if (!eq) continue;
      const cm = ensureCm(e);
      if (cm.cooldownT > 0) continue; // on cooldown, skip the scan
      if (this._missileThreat(e, state)) this._tryDeploy(e);
    }

    // 4. Apply active effects to in-flight missiles. Chaff: divert missiles whose target is the
    //    deploying ship to a decoy. ECM: zero their turnRate so they fly straight. Both are checked
    //    per active effect (a ship may have deployed recently and still be within the effect window).
    for (const e of countermeasureShipCandidates(state)) {
      if (e.type !== 'ship' || !e.alive) continue;
      const cm = e.data && e.data.cm;
      if (!cm || !cm.effect || cm.effectT <= 0) continue;
      const cfg = cm.effect.cfg;
      const r2 = cfg.radius * cfg.radius;
      const projectiles = projectilesNear(state, e.pos, cfg.radius, this._projectileScratch);
      if (projectiles === this._projectileScratch) this._diag.effectSpatialQueries++;
      this._diag.projectileCandidates += projectiles.length;
      for (const p of projectiles) {
        if (p.type !== 'projectile' || !p.alive) continue;
        const d = p.data;
        if (!d || d.kind !== 'missile') continue;
        // A decoy is a place, not a ship: its pull is measured from the buoy, not the broadcaster.
        const cx = cfg.kind === 'decoy' ? cm.effect.originX : e.pos.x;
        const cz = cfg.kind === 'decoy' ? cm.effect.originZ : e.pos.z;
        const dx = p.pos.x - cx, dz = p.pos.z - cz;
        if (dx * dx + dz * dz > r2) continue; // outside the effect radius
        if (cfg.kind === 'chaff') {
          // Divert missiles targeting THIS ship to the decoy cloud (a static point behind the ship).
          // Uses the deterministic sim RNG (state.rng) — the sim must be reproducible for replay
          // verification (sf-sim.mjs --hash --repeat must match across runs). state.rng is always
          // present in the sim; if absent (defensive), skip diversion rather than break determinism.
          const rng = state.rng;
          if (d.targetId === e.id && rng && rng() < cfg.divertPct) {
            d.targetId = cm.effect.decoyId;
            d.diverted = true;
            d.divertPos = {
              x: cm.effect.originX,
              z: cm.effect.originZ,
            };
          }
        } else if (cfg.kind === 'decoy') {
          // Bait verb: ANY seeker that crosses the buoy's water re-attacks the buoy — chaff only
          // pulls missiles already aimed at you, for a moment; the buoy keeps eating locks for
          // its whole duration. Already-hooked missiles are skipped, not re-rolled.
          const rng = state.rng;
          if (d.targetId !== cm.effect.decoyId && rng && rng() < cfg.divertPct) {
            d.targetId = cm.effect.decoyId;
            d.diverted = true;
            d.divertPos = {
              x: cm.effect.originX,
              z: cm.effect.originZ,
            };
          }
        } else if (cfg.kind === 'ecm') {
          // Jam guidance: zero the turnRate so the missile flies straight (weapons._steerHoming reads
          // data.turnRate each tick). Tag _jammedBy so the effect-expiry pass (step 1) restores it.
          if (d._jammedBy !== e.id) {
            if (d._jammedTurnRate == null) d._jammedTurnRate = d.turnRate || 0;
            d.turnRate = (d._jammedTurnRate || 0) * cfg.turnRateMult;
            d._jammedBy = e.id;
          }
        }
      }
    }
    // 5. Point-defense servos (mod_pds_servo_s): an autonomous intercept verb. Each armed servo
    //    watches its ring and kills the nearest hostile projectile inside it — missiles first,
    //    then the closest slug — on its cooldown. No lock/permission is asked; the module owns
    //    the trigger and the player owns the positioning. Scan only runs when the servo is ready,
    //    so an idle fleet with no servos pays nothing here.
    for (const e of countermeasureShipCandidates(state)) {
      if (e.type !== 'ship' || !e.alive) continue;
      const eq = equippedPointDefense(e.data && e.data.fittings);
      if (!eq) continue;
      const pds = e.data.pds || (e.data.pds = { cooldownT: 0 });
      if (pds.cooldownT > 0) {
        pds.cooldownT = Math.max(0, pds.cooldownT - dt);
        continue;
      }
      const cfg = eq.cfg;
      const radius = Math.max(1, Number(cfg.radius) || 0);
      if (!(radius > 0)) continue;
      const projectiles = projectilesNear(state, e.pos, radius, this._projectileScratch);
      if (projectiles === this._projectileScratch) this._diag.effectSpatialQueries++;
      this._diag.projectileCandidates += projectiles.length;
      const target = nearestInterceptableProjectile(projectiles, e, radius);
      if (!target) continue;
      target.alive = false;
      pds.cooldownT = Math.max(0.1, Number(cfg.cooldownS) || 1);
      this.bus.emit('pds:intercept', {
        schemaVersion: 1,
        shipId: e.id,
        projectileId: target.id,
        missile: !!(target.data && target.data.kind === 'missile'),
        radius,
        tick: state.tick,
      });
      this.bus.emit('presentation:vfxCue', {
        id: 'combat.pds.intercept', lane: 'combat', particles: 10, lights: 0,
        magnitude: 0.5, position: { x: target.pos.x, z: target.pos.z }, material: 'impulse',
        sourceId: e.id, targetId: null, flashReduced: false,
      });
    }
    state.countermeasureRuntime = state.countermeasureRuntime || {};
    state.countermeasureRuntime.diagnostics = this._diag;
    state.countermeasureRuntime.quietLatched = false;
  },

  // Attempt to deploy the countermeasure on ship e. No-op if no module equipped, on cooldown, or
  // docked. On success: breaks attacker locks, spawns the timed effect, starts the cooldown, emits
  // a bus event for VFX.
  _tryDeploy(e) {
    const eq = equippedCountermeasure(e.data && e.data.fittings);
    if (!eq) return false;
    const cm = ensureCm(e);
    if (cm.cooldownT > 0) return false; // not ready
    const cfg = eq.cm;

    // Break locks: any ship whose combat.lockTarget is THIS ship loses lockProgress (chaff fully,
    // ECM partially). This is the "missile can't maintain track through the cloud" effect.
    const breakPct = cfg.lockBreakPct != null ? cfg.lockBreakPct : 1.0;
    for (const other of countermeasureShipCandidates(this.state)) {
      if (other.type !== 'ship' || !other.alive || other.id === e.id) continue;
      const oc = other.data && other.data.combat;
      if (oc && oc.lockTarget === e.id) {
        oc.lockProgress = Math.max(0, (oc.lockProgress || 0) * (1 - breakPct));
        if (oc.lockProgress <= 0) oc.lockTarget = null;
      }
    }

    // Spawn the timed effect. Chaff and the decoy buoy create a point seekers divert to (not a
    // live entity — weapons._steerHoming homes on divertPos); the decoy's point is the buoy and
    // it keeps re-baiting for its whole duration. ECM just marks the effect active (the per-tick
    // loop jams missiles in radius).
    const hasDecoyPoint = cfg.kind === 'chaff' || cfg.kind === 'decoy';
    const decoyId = hasDecoyPoint ? ('cm_decoy_' + e.id + '_' + Math.floor(this.state.simTime * 1000)) : null;
    const decoy = hasDecoyPoint ? chaffDecoyPoint(e) : null;
    cm.effect = {
      cfg,
      decoyId,
      originX: decoy ? decoy.x : e.pos.x,
      originZ: decoy ? decoy.z : e.pos.z,
    };
    cm.effectT = cfg.durationS;
    cm.cooldownT = cfg.cooldownS;

    // Emit for VFX (chaff puff / ECM shimmer) + audio + a HUD cue.
    this._cmQuiet = null;
    this.bus.emit('countermeasure:deployed', {
      shipId: e.id, kind: cfg.kind, x: e.pos.x, z: e.pos.z,
      radius: cfg.radius, durationS: cfg.durationS, decoyId,
    });
    this.bus.emit('audio:cue', { id: CM_KIND_AUDIO[cfg.kind] || 'cm_chaff' });
    if (e.id === this.state.playerId) {
      this.bus.emit('toast', { text: CM_KIND_WORD[cfg.kind] || 'Countermeasure deployed', kind: 'info', ttl: 2 });
    }
    return true;
  },

  // Cheap threat check for AI auto-deploy: is any live missile targeting this ship, or is any ship
  // building a lock on it? Returns true if a countermeasure is warranted.
  _missileThreat(e, state) {
    const projectiles = projectilesNear(state, e.pos, 900, this._projectileScratch);
    if (projectiles === this._projectileScratch) this._diag.threatSpatialQueries++;
    this._diag.projectileCandidates += projectiles.length;
    for (const p of projectiles) {
      if (p.type !== 'projectile' || !p.alive) continue;
      const d = p.data;
      if (d && d.kind === 'missile' && d.targetId === e.id) {
        // Close enough to matter? Deploy if within 2× a rough missile travel band.
        const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
        if (dx * dx + dz * dz < 900 * 900) return true;
      }
    }
    // Someone locking onto this ship?
    for (const other of countermeasureShipCandidates(state)) {
      if (other.type !== 'ship' || !other.alive || other.id === e.id) continue;
      const oc = other.data && other.data.combat;
      if (oc && oc.lockTarget === e.id && (oc.lockProgress || 0) > 0.5) return true;
    }
    return false;
  },
};

function projectilesNear(state, pos, radius, out) {
  return queryNearbyEntities(state, pos, radius, out,
    (state.entityIndex && state.entityIndex.projectiles) || state.entityList);
}

// The servo's shot choice, deterministic by construction: nearest missile wins outright, else
// nearest hostile projectile inside the ring, ties broken by scan order (the spatial index's
// stable order). Own-side rounds and the servo owner's own shots are never intercepted. The
// radius check is restated here so the choice stays correct even on a fallback (unhashed) scan.
function nearestInterceptableProjectile(projectiles, ship, radius) {
  let bestMissile = null;
  let bestMissileD2 = Infinity;
  let bestOther = null;
  let bestOtherD2 = Infinity;
  const r2 = radius * radius;
  for (const p of projectiles) {
    if (p.type !== 'projectile' || !p.alive) continue;
    if (p.ownerId != null && p.ownerId === ship.id) continue;
    if (p.team != null && ship.team != null && p.team === ship.team) continue;
    const dx = p.pos.x - ship.pos.x, dz = p.pos.z - ship.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    if (p.data && p.data.kind === 'missile') {
      if (d2 < bestMissileD2) {
        bestMissile = p;
        bestMissileD2 = d2;
      }
    } else if (d2 < bestOtherD2) {
      bestOther = p;
      bestOtherD2 = d2;
    }
  }
  return bestMissile || bestOther;
}

function countermeasureShipCandidates(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ships) return index.ships;
  return (state && state.entityList) || [];
}

function resetCountermeasureDiagnostics(diag) {
  if (!diag) return;
  diag.threatSpatialQueries = 0;
  diag.effectSpatialQueries = 0;
  diag.projectileCandidates = 0;
}

// One chaff cloud per deploy: behind and to starboard of the hull so inbound seekers turn off
// the ship's centerline instead of flying through it toward a point sitting on the nose.
const CHAFF_DECOY_BACK = 70;
const CHAFF_DECOY_SIDE = 90;

export function chaffDecoyPoint(e) {
  const rot = Number.isFinite(e && e.rot) ? e.rot : 0;
  const px = e && e.pos && Number.isFinite(e.pos.x) ? e.pos.x : 0;
  const pz = e && e.pos && Number.isFinite(e.pos.z) ? e.pos.z : 0;
  const back = rot + Math.PI;
  const side = rot + Math.PI * 0.5;
  return {
    x: px + Math.cos(back) * CHAFF_DECOY_BACK + Math.cos(side) * CHAFF_DECOY_SIDE,
    z: pz + Math.sin(back) * CHAFF_DECOY_BACK + Math.sin(side) * CHAFF_DECOY_SIDE,
  };
}

function ensureCountermeasureRuntime(host) {
  if (!host._projectileScratch) host._projectileScratch = [];
  if (!host._diag) {
    host._diag = {
      threatSpatialQueries: 0,
      effectSpatialQueries: 0,
      projectileCandidates: 0,
    };
  }
}
