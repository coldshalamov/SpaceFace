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
// A refused press is never a silent drop: _tryDeploy emits countermeasure:denied {kind, reason,
// readyIn} on every denied branch and, for the player, raises the one-voice alert + shared deny
// cue (the same channels the weapons/mining vents use). Presentation reads live readiness via
// countermeasureReadiness() — the sim stays the single writer.
//
// Integration: reads e.data.fittings + MODULES to find the equipped countermeasure; reads/writes
// e.data.combat for the cooldown timer + active-effect state; diverts missiles by rewriting their
// data.targetId to a decoy; jams by zeroing data.turnRate (read by weapons._steerHoming). Pure sim
// state — the VFX (chaff puff / ECM shimmer) is emitted via bus events for the renderer to pick up.

import { MODULES } from '../data/modules.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { entityIndexVersion, entityIndexLaneVersion } from '../world/livingWorldViews.js';
import { suppressDefeatedLock, targetIdentityGeneration } from '../ai/perception.js';

/** A broken lock cannot be rebuilt on the same contact until this observation window passes. */
export const LOCK_REACQUIRE_S = 1.2;

export function suppressBrokenLock(combat, targetId, simTime, holdS = LOCK_REACQUIRE_S) {
  if (!combat) return combat;
  combat.lockTarget = null;
  combat.lockProgress = 0;
  combat.lockGeneration = (combat.lockGeneration | 0) + 1;
  combat.lockSuppressTargetId = targetId;
  combat.lockSuppressUntil = (Number(simTime) || 0) + holdS;
  return combat;
}

/** True only for the contact whose guidance was just broken. A different target is a new observation. */
export function lockLineageSuppressed(combat, targetId, simTime) {
  if (!combat || targetId == null) return false;
  return combat.lockSuppressTargetId === targetId
    && (Number(simTime) || 0) < (Number(combat.lockSuppressUntil) || 0);
}

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

// A finite stock (live block, else the fitting) is a magazine. Unset stays the cooldown
// dispenser — not an empty tube. Callers must not raise this number on a refusal.
function liveCountermeasureStock(cm, cfg) {
  if (cm && Number.isFinite(cm.stock)) return cm.stock;
  if (cfg && Number.isFinite(cfg.stock)) {
    cm.stock = cfg.stock;
    return cm.stock;
  }
  return null;
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

/** Membership lanes for the quiet latch — the CM/PDS interest census reads ships only. */
const COUNTERMEASURES_QUIET_LANES = ['shipLike'];

function publishCmQuiet(state, latched) {
  if (!state) return;
  const rt = state.countermeasureRuntime || (state.countermeasureRuntime = {});
  rt.quietLatched = !!latched;
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
    this._cmQuiet = null;
    this._subs = [];
    this._projectileScratch = [];
    this._diag = {
      threatSpatialQueries: 0,
      effectSpatialQueries: 0,
      projectileCandidates: 0,
    };
    // Same wake contract as the sibling latches: entity-index version is monotonic, but a run
    // boundary still gets an explicit drop so a stale armed record can never straddle a game.
    if (this.bus && typeof this.bus.on === 'function') {
      const wake = () => {
        this._cmQuiet = null;
        publishCmQuiet(this.state, false);
      };
      this._subs.push(this.bus.on('game:new', wake));
      this._subs.push(this.bus.on('game:newGame', wake));
      this._subs.push(this.bus.on('save:loaded', wake));
    }
  },

  newGame() {
    this._cmQuiet = null;
    publishCmQuiet(this.state, false);
  },

  destroy() {
    for (const off of this._subs || []) { if (typeof off === 'function') off(); }
    this._subs = [];
  },

  update(dt, state) {
    if (state.mode !== 'flight') {
      publishCmQuiet(state, false);
      return;
    }
    ensureCountermeasureRuntime(this);
    resetCountermeasureDiagnostics(this._diag);

    // Quiet Ceres / open flight: four full ships walks every tick even when nobody carries a
    // countermeasure or PDS. Latch when the roster has no CM/PDS interest; wake on deploy input,
    // entity-index membership, live cm/pds timers, or a 0.5 s rescan for mid-life fitting changes.
    const inpEarly = state.input;
    const deployEdge = !!(inpEarly && inpEarly.deployCountermeasure);
    if (COUNTERMEASURES_QUIET_LATCH !== false) {
      const laneVersion = entityIndexLaneVersion(state, COUNTERMEASURES_QUIET_LANES);
      const membership = laneVersion === -1 ? entityIndexVersion(state) : laneVersion;
      const tick = state.tick | 0;
      let quiet = this._cmQuiet;
      const sinceArm = tick - (quiet ? (quiet.armedTick | 0) : tick);
      if (quiet
        && membership != null
        && !deployEdge
        && quiet.membership === membership
        && sinceArm >= 0 && sinceArm < CM_QUIET_RESCAN_TICKS) {
        state.countermeasureRuntime = state.countermeasureRuntime || {};
        state.countermeasureRuntime.diagnostics = this._diag;
        state.countermeasureRuntime.quietLatched = true;
        return;
      }
      if (!deployEdge && membership != null && !anyCountermeasureInterest(state)) {
        this._cmQuiet = { membership, armedTick: tick };
        state.countermeasureRuntime = state.countermeasureRuntime || {};
        state.countermeasureRuntime.diagnostics = this._diag;
        state.countermeasureRuntime.quietLatched = true;
        return;
      }
      this._cmQuiet = null;
    } else if (this._cmQuiet) {
      this._cmQuiet = null;
      publishCmQuiet(state, false);
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
        if (cfg.kind === 'chaff' || cfg.kind === 'decoy') {
          // Chaff answers the defeated lineage: a second shooter's missile keeps its own solution.
          // A decoy buoy is placed bait — it re-baits ANY seeker that crosses its water, lock or no.
          const rng = state.rng;
          const bites = cfg.kind === 'decoy' ? true : missileMatchesLineage(d, cm.effect.lineage, p);
          if (bites && rng && rng() < cfg.divertPct) {
            d.targetId = cm.effect.decoyId;
            d.diverted = true;
            d.guidanceBroken = true;
            d.divertPos = {
              x: cm.effect.originX,
              z: cm.effect.originZ,
            };
          }
        } else if (cfg.kind === 'ecm') {
          // Jam only the defeated lineage. Other seekers in the radius keep turning.
          if (!missileMatchesLineage(d, cm.effect.lineage, p)) continue;
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
      // The receipt owns the missile's own point (and motion) — the target is about to be
      // retired, so listeners must never have to reach back through the entity index.
      const interceptPos = { x: target.pos.x, z: target.pos.z };
      const tv = target.vel;
      const interceptDir = tv && Number.isFinite(tv.x) && Number.isFinite(tv.z)
        ? { x: tv.x, z: tv.z } : undefined;
      target.alive = false;
      pds.cooldownT = Math.max(0.1, Number(cfg.cooldownS) || 1);
      this.bus.emit('pds:intercept', {
        schemaVersion: 1,
        shipId: e.id,
        projectileId: target.id,
        missile: !!(target.data && target.data.kind === 'missile'),
        radius,
        tick: state.tick,
        pos: interceptPos,
        dir: interceptDir,
      });
    }
    state.countermeasureRuntime = state.countermeasureRuntime || {};
    state.countermeasureRuntime.diagnostics = this._diag;
    state.countermeasureRuntime.quietLatched = false;
  },

  // Attempt to deploy the countermeasure on ship e. Emits countermeasure:denied and returns false
  // if no module equipped or on cooldown (never a silent drop). On success: breaks attacker locks,
  // spawns the timed effect, starts the cooldown, emits a bus event for VFX.
  _tryDeploy(e) {
    const eq = equippedCountermeasure(e.data && e.data.fittings);
    if (!eq) {
      this._denyDeploy(e, null, 'no_module', 0);
      return false;
    }
    const cm = ensureCm(e);
    const cfg = eq.cm;
    const stock = liveCountermeasureStock(cm, cfg);
    // Empty is its own refusal: no success cue, no buoy, and the count stays empty.
    if (stock != null && !(stock >= 1)) {
      this._denyDeploy(e, cfg.kind, 'empty', 0);
      return false;
    }
    if (cm.cooldownT > 0) {
      this._denyDeploy(e, cfg.kind, 'cooldown', cm.cooldownT);
      return false; // not ready
    }
    // Chaff and ECM answer an incoming lock or missile. A decoy buoy is bait you place
    // before anyone has a lock, so that case is not this refusal.
    if (cfg.kind !== 'decoy') {
      ensureCountermeasureRuntime(this);
      if (!this._missileThreat(e, this.state)) {
        this._denyDeploy(e, cfg.kind, 'no_lock', 0);
        return false;
      }
    }

    if (stock != null) cm.stock = stock - 1;

    // One deploy breaks one eligible lineage. A building lock with nothing in the air,
    // and every other shooter who already has a missile, keep their solutions.
    const breakPct = cfg.lockBreakPct != null ? cfg.lockBreakPct : 1.0;
    const brokenLineage = breakOneLockLineage(this.state, e, breakPct);
    const brokenLockShipId = brokenLineage ? brokenLineage.shooterId : null;

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
      lineage: brokenLineage,
    };
    cm.effectT = cfg.durationS;
    cm.cooldownT = cfg.cooldownS;

    // Emit for VFX (chaff puff / ECM shimmer) + audio + a HUD cue.
    this._cmQuiet = null;
    this.bus.emit('countermeasure:deployed', {
      shipId: e.id, kind: cfg.kind, x: e.pos.x, z: e.pos.z,
      radius: cfg.radius, durationS: cfg.durationS, decoyId,
      brokenLockShipId,
    });
    this.bus.emit('audio:cue', { id: CM_KIND_AUDIO[cfg.kind] || 'cm_chaff' });
    if (e.id === this.state.playerId) {
      this.bus.emit('toast', { text: CM_KIND_WORD[cfg.kind] || 'Countermeasure deployed', kind: 'info', ttl: 2 });
    }
    return true;
  },

  // A refused deploy is a beat the player must hear, never a silent `return false`: the sim event
  // names the reason (cooldown, empty, no_lock, or no_module) for any listener, and the
  // player additionally gets the one-voice alert + shared deny cue — the same channels the
  // weapons vent / mining vent refusals use. AI auto-deploy gates on fittings + cooldown before
  // calling _tryDeploy, so in practice only the player lands in the denied branches.
  _denyDeploy(e, kind, reason, readyIn) {
    this.bus.emit('countermeasure:denied', {
      schemaVersion: 1,
      shipId: e.id,
      kind: kind || null,
      reason,
      readyIn: Math.max(0, Number(readyIn) || 0),
      tick: this.state.tick,
    });
    if (e.id !== this.state.playerId) return;
    const ready = Math.ceil(Math.max(0, Number(readyIn) || 0));
    const text = reason === 'cooldown'
      ? `COUNTERMEASURE RECHARGING ${ready}s`
      : reason === 'empty'
        ? 'COUNTERMEASURES EMPTY'
        : reason === 'no_lock'
          ? 'NO INCOMING LOCK'
          : 'NO COUNTERMEASURE FITTED';
    this.bus.emit('alert', {
      key: 'cm-denied',
      sev: 'warn',
      text,
      ttl: 1.6,
    });
    this.bus.emit('audio:cue', { id: 'ui_deny' });
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

function inboundMissiles(state, targetId) {
  const owned = new Set();
  const loose = [];
  const list = (state.entityIndex && state.entityIndex.projectiles) || state.entityList || [];
  for (const p of list) {
    if (!p || p.type !== 'projectile' || !p.alive) continue;
    const d = p.data;
    if (!d || d.kind !== 'missile' || d.targetId !== targetId) continue;
    const owner = d.ownerId != null ? d.ownerId : p.ownerId;
    if (owner != null) owned.add(owner);
    else loose.push(p);
  }
  return { owned, loose };
}

function lockObservationCurrent(shooter, target) {
  const contacts = shooter && shooter.data && shooter.data.perceptionContacts;
  if (!Array.isArray(contacts)) return true;
  let contact = null;
  for (const row of contacts) {
    if (row && row.id === target.id && row.kind !== 'lock') { contact = row; break; }
  }
  if (!contact) return false;
  if (contact.visible === false) return false;
  if (Number.isFinite(contact.ageTicks) && contact.ageTicks > 0) return false;
  if (contact.targetGeneration != null && contact.targetGeneration !== targetIdentityGeneration(target)) return false;
  return true;
}

/** Highest lock progress, then lowest shooter id. A live missile is required. */
export function selectLockLineage(state, deployer) {
  if (!state || !deployer) return null;
  const inbound = inboundMissiles(state, deployer.id);
  if (inbound.owned.size === 0 && inbound.loose.length === 0) return null;
  let best = null;
  for (const other of countermeasureShipCandidates(state)) {
    if (!other || other.type !== 'ship' || !other.alive || other.id === deployer.id) continue;
    const ownsRound = inbound.owned.has(other.id);
    if (!ownsRound && inbound.loose.length === 0) continue;
    const oc = other.data && other.data.combat;
    if (!oc || oc.lockTarget !== deployer.id || !((oc.lockProgress || 0) > 0)) continue;
    if (!lockObservationCurrent(other, deployer)) continue;
    const lineage = {
      shooterId: other.id,
      targetId: deployer.id,
      generation: oc.lockGeneration | 0,
      targetGeneration: oc.lockTargetGeneration != null
        ? oc.lockTargetGeneration
        : targetIdentityGeneration(deployer),
      progress: oc.lockProgress || 0,
      missileId: ownsRound ? null : inbound.loose[0].id,
    };
    if (!best
      || lineage.progress > best.progress
      || (lineage.progress === best.progress && String(lineage.shooterId) < String(best.shooterId))) {
      best = lineage;
    }
  }
  if (best) return best;
  const loose = inbound.loose.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  if (!loose) return null;
  const data = loose.data || {};
  return {
    shooterId: data.ownerId != null ? data.ownerId : loose.id,
    targetId: deployer.id,
    generation: data.lockGeneration | 0,
    targetGeneration: data.targetGeneration != null ? data.targetGeneration : targetIdentityGeneration(deployer),
    progress: 1,
    missileId: loose.id,
  };
}

export function missileMatchesLineage(data, lineage, projectile) {
  if (!data || !lineage || data.kind !== 'missile') return false;
  if (data.targetId !== lineage.targetId) return false;
  const owner = data.ownerId != null ? data.ownerId : (projectile && projectile.ownerId != null ? projectile.ownerId : null);
  const claimedLoose = lineage.missileId != null && projectile && projectile.id === lineage.missileId;
  if (!claimedLoose && (owner == null || owner !== lineage.shooterId)) return false;
  if (data.lockGeneration != null && (data.lockGeneration | 0) !== (lineage.generation | 0)) return false;
  if (data.targetGeneration != null && lineage.targetGeneration != null
    && data.targetGeneration !== lineage.targetGeneration) return false;
  return true;
}

function breakOneLockLineage(state, deployer, breakPct) {
  const lineage = selectLockLineage(state, deployer);
  if (!lineage) return null;
  for (const other of countermeasureShipCandidates(state)) {
    if (!other || other.id !== lineage.shooterId) continue;
    const oc = other.data && other.data.combat;
    if (!oc || oc.lockTarget !== deployer.id) return null;
    oc.lockBroken = {
      shooterId: other.id,
      targetId: deployer.id,
      generation: lineage.generation,
      targetGeneration: lineage.targetGeneration,
    };
    oc.lockTargetGeneration = lineage.targetGeneration;
    const nextProgress = Math.max(0, (oc.lockProgress || 0) * (1 - breakPct));
    if (nextProgress <= 0) {
      suppressBrokenLock(oc, deployer.id, state && state.simTime);
      oc.lockTargetGeneration = lineage.targetGeneration;
    } else {
      oc.lockProgress = nextProgress;
    }
    if (Array.isArray(other.data.perceptionContacts)) {
      other.data.perceptionContacts = suppressDefeatedLock(other.data.perceptionContacts, lineage);
    }
    return lineage;
  }
  return lineage;
}

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

/**
 * Read-only presentation seam (the countermeasure must not be a silent keypress): the live
 * readiness of the countermeasure fitted on `entity` — runtime timers plus the module config
 * they tick against — or null when nothing is fitted. UI reads this each overlay tick; the sim
 * stays the single writer of e.data.cm.
 */
export function countermeasureReadiness(entity) {
  const data = entity && entity.data;
  const eq = equippedCountermeasure(data && data.fittings);
  if (!eq) return null;
  const cm = data.cm;
  return {
    kind: eq.cm.kind,
    cooldownT: cm ? Math.max(0, Number(cm.cooldownT) || 0) : 0,
    cooldownS: Number(eq.cm.cooldownS) || 0,
    effectT: cm ? Math.max(0, Number(cm.effectT) || 0) : 0,
    durationS: Number(eq.cm.durationS) || 0,
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
