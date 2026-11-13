// PL-115 Lit up — "In Lights Out, anything crossing the lane's amber lights shows for a second
// — thrown rocks, Quiet Ghosts. Fight on the lane; or lead them across the amber and see them
// first."
//
// The Lights Out course round (data/swarmCourse.js, round name 'Lights Out') is the arena-dims
// round. During that wave, while the round is live, the plant watches the freight lane corridor
// (the arena's lane/conveyor solid when one is on the floor, else the authored center corridor)
// and stamps a one-second lamp reveal on anything that crosses it: swarm hostiles and thrown
// bodies alike.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; no Math.random/Date.now.
// - Observes the Pit purely via bus events + polling; zero edits to swarm files. The reveal is
//   the documented presentation vocabulary (data.lampsFlashing + data.lampFlashUntil), read by
//   the renderer; no renderer edits here. The corridor prefers a real lane/conveyor solid at
//   runtime (authored:true); when none is on the floor the fallback center corridor is the
//   plant's own invention and honestly reads authored:false.
// - Bounded Maps capped by tuning.memoryCap; per-entity reveal cooldown; per-wave reveal budget.
// - Never writes state.run.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { SWARM_COURSE } from '../../data/swarmCourse.js';

export const PLANTS_LIT_UP_EVENT = 'plants:litUp';

export const LIT_UP_TUNING = Object.freeze({
  plId: 'pl115',
  lightsOutRoundName: 'Lights Out',
  revealS: 1,                  // "shows for a second"
  revealCooldownS: 3,          // one reveal per body per cooldown
  scanIntervalS: 0.25,         // throttled corridor scan
  laneHalfWidthWu: 90,         // amber band half-width around the lane line
  revealBudgetPerWave: 12,     // bounded emissions per wave
  maxSpeedForThrownWuS: 40,    // a body moving faster than this reads as thrown rock/debris
  memoryCap: 32,
});

/** Pure: which course round wave runs Lights Out (first match, else 0). */
export function lightsOutWaveFor(course = SWARM_COURSE, tuning = LIT_UP_TUNING) {
  for (const round of course || []) {
    if (round && round.name === tuning.lightsOutRoundName) return round.round;
  }
  return 0;
}

/**
 * Pure: the lane corridor for this floor. Prefers a real lane solid (data.kind 'conveyor'|'lane')
 * — that corridor is authored:true — falling back to the plant-invented center corridor along
 * +x, which honestly reads authored:false. Returns {x, z, dirX, dirZ, authored}.
 */
export function laneCorridorFrom(state, tuning = LIT_UP_TUNING) {
  const entities = state && state.entities;
  if (entities && typeof entities.values === 'function') {
    for (const e of entities.values()) {
      const d = e && e.data;
      if (!e || e.alive === false || !e.pos || !d) continue;
      if (d.kind !== 'conveyor' && d.kind !== 'lane') continue;
      const len = Math.hypot(d.laneDirX || 1, d.laneDirZ || 0) || 1;
      return { x: e.pos.x, z: e.pos.z, dirX: (d.laneDirX || 1) / len, dirZ: (d.laneDirZ || 0) / len, authored: true };
    }
  }
  return { x: 0, z: 0, dirX: 1, dirZ: 0, authored: false };
}

/** Pure: across-line distance from a point to the corridor center line. */
export function distanceToCorridor(pos, corridor) {
  if (!pos || !corridor || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return Infinity;
  const dx = pos.x - corridor.x;
  const dz = pos.z - corridor.z;
  return Math.abs(dx * -corridor.dirZ + dz * corridor.dirX);
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: does this entity read as something the amber lights would catch? */
export function isRevealCandidate(entity, tuning = LIT_UP_TUNING) {
  if (!entity || entity.alive === false || !entity.pos) return false;
  const d = entity.data || {};
  if (d.lootTableId || d.enemyTypeId) return true; // a swarm body (Wasp, Quiet Ghost, ...)
  const speed = Math.hypot(finite(entity.vel && entity.vel.x), finite(entity.vel && entity.vel.z));
  return (entity.type === 'debris' || entity.type === 'pickup') && speed >= tuning.maxSpeedForThrownWuS;
}

export const litUpPlant = {
  name: 'plants115',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    this._cooldowns = new Map(); // entity id -> simTime of last reveal
    this._revealsThisWave = 0;
    this._revealedWave = 0;
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:waveStarted', (p) => this._onWaveStarted(p));
    on('run:ended', () => this._reset('run_ended'));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    const run = s.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return;
    if (run.phase !== 'active') return;
    if (run.wave !== lightsOutWaveFor()) return;
    this._accum += finite(dt, 0);
    if (this._accum < LIT_UP_TUNING.scanIntervalS) return;
    this._accum = 0;
    this._scan(s, run);
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    if (this._cooldowns) this._cooldowns.clear();
    this._revealsThisWave = 0;
  },

  // ---- internals ----

  _onWaveStarted(payload) {
    const wave = finite(payload && payload.wave, 0);
    if (this._revealedWave !== wave) {
      this._revealsThisWave = 0;
      this._revealedWave = wave;
    }
    this._capCooldowns();
  },

  _reset(reason) {
    if (this._cooldowns) this._cooldowns.clear();
    this._revealsThisWave = 0;
  },

  _capCooldowns() {
    while (this._cooldowns.size >= LIT_UP_TUNING.memoryCap) {
      this._cooldowns.delete(this._cooldowns.keys().next().value);
    }
  },

  _scan(s, run) {
    if (this._revealsThisWave >= LIT_UP_TUNING.revealBudgetPerWave) return;
    const now = finite(s.simTime, 0);
    const corridor = laneCorridorFrom(s, LIT_UP_TUNING);
    const entities = s.entities;
    if (!entities || typeof entities.values !== 'function') return;
    const halfWidth = LIT_UP_TUNING.laneHalfWidthWu;
    for (const e of entities.values()) {
      if (this._revealsThisWave >= LIT_UP_TUNING.revealBudgetPerWave) return;
      if (!isRevealCandidate(e, LIT_UP_TUNING)) continue;
      const last = this._cooldowns.get(e.id);
      if (Number.isFinite(last) && now - last < LIT_UP_TUNING.revealCooldownS) continue;
      if (distanceToCorridor(e.pos, corridor) > halfWidth) continue;
      this._cooldowns.set(e.id, now);
      this._capCooldowns();
      this._revealsThisWave += 1;
      e.data = e.data || {};
      e.data.lampsFlashing = true;
      e.data.lampFlashUntil = now + LIT_UP_TUNING.revealS;
      this.bus.emit(PLANTS_LIT_UP_EVENT, {
        id: e.id,
        kind: (e.data.lootTableId || e.data.enemyTypeId) ? 'swarm_body' : 'thrown_body',
        wave: run.wave, t: now,
      });
    }
  },
};
