// Countermeasures / EW system (goal P1-7).
//
// Gives homing missiles real counterplay beyond pure dodging. Ships equipped with a countermeasure
// utility module (mod_chaff_dispenser_m / mod_ecm_jammer_l) can deploy it on a cooldown:
//   CHAFF — breaks missile locks on the deploying ship (resets attackers' lockProgress) AND diverts
//           a fraction of in-flight missiles targeting the ship toward a decoy cloud (they fly
//           harmlessly toward the cloud origin until their TTL expires). The classic missile-defense.
//   ECM   — jams homing guidance: any missile within the effect radius has its turnRate zeroed for
//           the effect duration (it flies straight, easy to dodge). Also partially breaks locks.
//
// Deploy trigger: the player presses the countermeasure keybind (default C, remappable); AI ships
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

// Per-ship countermeasure runtime state lives on e.data.cm (lazily initialized).
function ensureCm(e) {
  if (!e.data.cm) e.data.cm = { cooldownT: 0, effectT: 0, effect: null };
  return e.data.cm;
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
        const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
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
    state.countermeasureRuntime = state.countermeasureRuntime || {};
    state.countermeasureRuntime.diagnostics = this._diag;
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

    // Spawn the timed effect. Chaff creates a decoy entity id (a static point missiles divert to);
    // ECM just marks the effect active (the per-tick loop jams missiles in radius).
    const decoyId = cfg.kind === 'chaff' ? ('cm_decoy_' + e.id + '_' + Math.floor(this.state.simTime * 1000)) : null;
    cm.effect = { cfg, decoyId, originX: e.pos.x, originZ: e.pos.z };
    cm.effectT = cfg.durationS;
    cm.cooldownT = cfg.cooldownS;

    // Emit for VFX (chaff puff / ECM shimmer) + audio + a HUD cue.
    this.bus.emit('countermeasure:deployed', {
      shipId: e.id, kind: cfg.kind, x: e.pos.x, z: e.pos.z,
      radius: cfg.radius, durationS: cfg.durationS, decoyId,
    });
    this.bus.emit('audio:cue', { id: cfg.kind === 'chaff' ? 'cm_chaff' : 'cm_ecm' });
    if (e.id === this.state.playerId) {
      this.bus.emit('toast', { text: cfg.kind === 'chaff' ? 'Chaff deployed' : 'ECM jamming active', kind: 'info', ttl: 2 });
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
