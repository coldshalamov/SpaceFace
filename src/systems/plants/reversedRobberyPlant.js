// PL-188 Reversed robbery — "A Reaver makes the gates with your Scrap. Line it in the gate mouth
// and it all falls out — yours, and two other pilots'. Kiln: *'Sponsors love a chase.'*
// Chase; or let it go and hear Kiln enjoy it."
//
// A thrown-body kill (the Line) on a Reaver that dies in a gate mouth spills the haul: three
// scrap pickups at the gate (yours and two other pilots'), Kiln's line, once per run.
//
// Invariants:
// - Deterministic: state.simTime only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - The spill is real floor pickups (the documented swarm pickup shape, wallet 'run'), so the
//   run wallet stays the only purse writer (collection pays, death does not).
// - Bounded Maps (memoryCap); one spill per run; the gate mouth is a real gate solid's position.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { killCauseFromPayload, KillCause } from '../../combat/killCausality.js';

export const PLANTS_REVERSED_ROBBERY_EVENT = 'plants:reversedRobbery';

export const REVERSED_ROBBERY_TUNING = Object.freeze({
  plId: 'pl188',
  reaverArchetypeId: 'reaver_pirate',
  thrownCauses: Object.freeze([KillCause.SHIP_COLLISION, KillCause.TERRAIN_COLLISION]),
  gateMouthRadiusWu: 260,      // the gate mouth the Reaver is lined into
  gateScanCap: 64,
  spillPickups: 3,             // yours, and two other pilots'
  scrapCredits: 35,            // per pickup, wallet 'run'
  pickupTtlS: 20,
  ejectSpeedWuS: 26,
  memoryCap: 8,
});

export const REVERSED_ROBBERY_KILN_LINE = 'Sponsors love a chase.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: does this kill receipt identify a Reaver? (Swarm bodies carry lootTableId/enemyTypeId.) */
export function isReaverKill(payload, tuning = REVERSED_ROBBERY_TUNING) {
  if (!payload) return false;
  return payload.lootTableId === tuning.reaverArchetypeId
    || payload.enemyTypeId === tuning.reaverArchetypeId
    || payload.victimClass === tuning.reaverArchetypeId;
}

/** Pure: is this kill thrown through the Line (collision family with an impact partner)? */
export function isThrownIntoGateKill(payload, tuning = REVERSED_ROBBERY_TUNING) {
  if (!payload) return false;
  // combat.js stamps cause 'massline_whip' verbatim (not a canonical KillCause), so read the
  // raw cause for the whip and the canonical family for collision kills.
  if (payload.cause === 'massline_whip') return true;
  const cause = killCauseFromPayload(payload);
  return tuning.thrownCauses.includes(cause) && payload.impactorId != null;
}

/** Pure: nearest alive gate solid within the mouth radius of a kill position. */
export function gateAt(candidates, pos, radiusWu, tuning = REVERSED_ROBBERY_TUNING) {
  if (!pos || !Array.isArray(candidates)) return null;
  let best = null;
  let bestSq = radiusWu * radiusWu;
  for (const e of candidates) {
    if (!e || e.alive === false || !e.pos) continue;
    if (!e.data || e.data.roomKind !== 'gate') continue; // room solids stamp roomKind
    const dx = e.pos.x - pos.x;
    const dz = e.pos.z - pos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq <= bestSq) {
      best = e;
      bestSq = distSq;
    }
  }
  return best;
}

export const reversedRobberyPlant = {
  modes: ['swarm'],
  name: 'plants188',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._spilledRuns = new Map(); // run seed -> true (memoryCap bounded)
    this._kilnSaidThisRun = false;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('entity:killed', (p) => this._onKilled(p));
    on('run:ended', () => this._reset('run_ended'));
    on('save:loaded', () => this._reset('save_loaded'));
  },

  update() { /* event-driven */ },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    if (this._spilledRuns) this._spilledRuns.clear();
    this._kilnSaidThisRun = false;
  },

  // ---- internals ----

  _liveRun() {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return null;
    if (run.phase !== 'active') return null;
    return run;
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _reset(reason) {
    if (this._spilledRuns) this._spilledRuns.clear();
    this._kilnSaidThisRun = false;
  },

  _collectGates() {
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return [];
    const gates = [];
    let scanned = 0;
    for (const e of entities.values()) {
      if (scanned >= REVERSED_ROBBERY_TUNING.gateScanCap) break;
      scanned += 1;
      if (e && e.alive !== false && e.data && e.data.roomKind === 'gate') gates.push(e);
      if (gates.length >= 8) break;
    }
    return gates;
  },

  _spawnSpill(at) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return 0;
    const now = this._now();
    let spawnedCount = 0;
    for (let i = 0; i < REVERSED_ROBBERY_TUNING.spillPickups; i += 1) {
      const angle = (i / REVERSED_ROBBERY_TUNING.spillPickups) * Math.PI * 2;
      const spawned = spawnEntity({
        type: 'pickup',
        pos: { x: at.x + Math.cos(angle) * 8, z: at.z + Math.sin(angle) * 8 },
        vel: { x: Math.cos(angle) * REVERSED_ROBBERY_TUNING.ejectSpeedWuS, z: Math.sin(angle) * REVERSED_ROBBERY_TUNING.ejectSpeedWuS },
        radius: 5,
        mass: 0.1,
        collides: true,
        data: {
          kind: 'scrap',
          amount: 1,
          credits: REVERSED_ROBBERY_TUNING.scrapCredits,
          wallet: 'run',
          despawnAt: now + REVERSED_ROBBERY_TUNING.pickupTtlS,
          plants: { [REVERSED_ROBBERY_TUNING.plId]: { role: 'spilled_haul', pilot: i === 0 ? 'yours' : `pilot_${i}` } },
        },
      });
      const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
      if (id != null) spawnedCount += 1;
    }
    return spawnedCount;
  },

  _onKilled(payload) {
    const run = this._liveRun();
    if (!run || !payload) return;
    if (!isReaverKill(payload, REVERSED_ROBBERY_TUNING)) return;
    if (!isThrownIntoGateKill(payload, REVERSED_ROBBERY_TUNING)) return;
    const key = `${run.seed}`;
    if (this._spilledRuns.has(key)) return; // once per run
    const pos = payload.pos && Number.isFinite(payload.pos.x) ? payload.pos : null;
    if (!pos) return;
    const gate = gateAt(this._collectGates(), pos, REVERSED_ROBBERY_TUNING.gateMouthRadiusWu, REVERSED_ROBBERY_TUNING);
    if (!gate) return; // not in a gate mouth
    this._spilledRuns.set(key, true);
    while (this._spilledRuns.size >= REVERSED_ROBBERY_TUNING.memoryCap) {
      this._spilledRuns.delete(this._spilledRuns.keys().next().value);
    }
    const spawnedCount = this._spawnSpill({ x: gate.pos.x, z: gate.pos.z });
    if (!this._kilnSaidThisRun) {
      this._kilnSaidThisRun = true;
      this.bus.emit('voice:say', {
        channel: 'comms', id: 'plants:pl188:kiln', text: REVERSED_ROBBERY_KILN_LINE, ttl: 6,
      });
    }
    this.bus.emit('audio:cue', { id: 'confirm', position: { x: gate.pos.x, z: gate.pos.z }, gain: 0.8, rate: 1 });
    this.bus.emit(PLANTS_REVERSED_ROBBERY_EVENT, {
      kind: 'haul_spilled',
      reaverId: payload.id,
      gateId: gate.id,
      spawnedPickups: spawnedCount,
      scrapCreditsEach: REVERSED_ROBBERY_TUNING.scrapCredits,
      t: this._now(), wave: run.wave,
    });
  },
};
