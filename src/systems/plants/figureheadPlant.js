// PL-225 The figurehead — "In the Cryo Drift, throw a Wasp against the passing ice barge and it
// sticks, frozen, riding the lane a full circuit. Decorate the barge; the crowd has opinions."
//
// In a Cryo Drift arena (run.arenaId cryo_*) the plant runs the passing ice barge: a plant-owned
// prop that rides the lane a full circuit while the round is live. A thrown-body collision kill
// of a Wasp that lands inside the barge's stick radius sticks the body to the hull: a frozen
// figurehead prop rides the barge for one full circuit, then thaws off. The crowd gives its
// opinion (audio beat + receipt), once per run.
//
// Invariants:
// - Deterministic: state.simTime only; the barge ride is a simTime phase, no Math.random.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - Barge and figureheads are plant-owned props (data.runtimeOwner 'plants'); bounded Maps.
// - The literal ice barge body is not an authored arena prop on any readable seam today; this
//   plant runs its own barge prop so the row's physics is real on the shared floor.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { killCauseFromPayload, KillCause } from '../../combat/killCausality.js';

export const PLANTS_FIGUREHEAD_EVENT = 'plants:figurehead';

export const FIGUREHEAD_TUNING = Object.freeze({
  plId: 'pl225',
  cryoArenaPrefix: 'cryo_',
  waspArchetypeId: 'wasp_swarmer',
  thrownCauses: Object.freeze([KillCause.SHIP_COLLISION, KillCause.TERRAIN_COLLISION]),
  bargeRadiusWu: 26,
  bargeHull: 640,
  bargeCircuitS: 40,           // "riding the lane a full circuit"
  bargeOrbitRadiusWu: 620,
  stickRadiusWu: 240,          // thrown against the barge: kill lands this close to the hull
  maxFigureheads: 1,
  bargeLampFlashS: 0.8,
  memoryCap: 4,
});

/** Pure: a thrown-body Wasp kill that qualifies for sticking. */
export function isStuckWaspKill(payload, tuning = FIGUREHEAD_TUNING) {
  if (!payload) return false;
  if (!tuning.thrownCauses.includes(killCauseFromPayload(payload))) return false;
  return payload.lootTableId === tuning.waspArchetypeId
    || payload.enemyTypeId === tuning.waspArchetypeId
    || payload.victimClass === tuning.waspArchetypeId;
}

/** Pure: barge position on its lane circuit at a sim time (starts at angle 0). */
export function bargePositionAt(nowS, tuning = FIGUREHEAD_TUNING) {
  const angle = (nowS / tuning.bargeCircuitS) * Math.PI * 2;
  return {
    x: Math.cos(angle) * tuning.bargeOrbitRadiusWu,
    z: Math.sin(angle) * tuning.bargeOrbitRadiusWu,
  };
}

export const figureheadPlant = {
  name: 'plants225',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._bargeId = null;
    this._bargeOutAt = 0;
    this._figureheadIds = [];
    this._stuckThisRun = new Map(); // run seed -> true (memoryCap bounded)
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:waveStarted', () => this._onRoundStarted());
    on('run:waveCleared', () => this._onRoundOver());
    on('run:ended', () => this._reset('run_ended'));
    on('entity:killed', (p) => this._onKilled(p));
  },

  update() {
    const s = this.state;
    if (!s) return;
    const now = finite(s.simTime, 0);
    if (this._bargeId == null) return;
    const barge = this._entity(this._bargeId);
    if (!barge || barge.alive === false) { this._bargeId = null; return; }
    const at = bargePositionAt(now - this._bargeOutAt, FIGUREHEAD_TUNING);
    barge.pos.x = at.x;
    barge.pos.z = at.z;
    // Frozen cargo rides with the barge: one full circuit, then it thaws off and despawns.
    const kept = [];
    for (const row of this._figureheadIds) {
      if (now < row.thawAt) {
        const fig = this._entity(row.id);
        if (fig && fig.alive !== false) {
          fig.pos.x = at.x + row.offsetX;
          fig.pos.z = at.z + row.offsetZ;
        }
        kept.push(row);
        continue;
      }
      if (this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(row.id);
      }
      this.bus.emit(PLANTS_FIGUREHEAD_EVENT, { kind: 'thawed_off', figureheadId: row.id, t: now });
    }
    this._figureheadIds = kept;
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._despawnAll('destroy');
    if (this._stuckThisRun) this._stuckThisRun.clear();
  },

  // ---- internals ----

  _liveRun() {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return null;
    if (run.phase !== 'active' && run.phase !== 'wave_intro') return null;
    return run;
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _entity(id) {
    const s = this.state;
    if (id == null || !s || !s.entities || typeof s.entities.get !== 'function') return null;
    return s.entities.get(id) || null;
  },

  _despawnAll(reason) {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      if (this._bargeId != null) this.helpers.removeEntity(this._bargeId);
      for (const row of this._figureheadIds) this.helpers.removeEntity(row.id);
    }
    this._bargeId = null;
    this._figureheadIds = [];
  },

  _reset(reason) {
    this._despawnAll(reason);
    if (this._stuckThisRun) this._stuckThisRun.clear();
  },

  _onRoundStarted() {
    const run = this._liveRun();
    if (!run) return;
    if (!isCryoArena(run.arenaId, FIGUREHEAD_TUNING)) return;
    if (this._bargeId != null) return;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const spawned = spawnEntity({
      type: 'debris',
      pos: bargePositionAt(0, FIGUREHEAD_TUNING),
      vel: { x: 0, z: 0 },
      radius: FIGUREHEAD_TUNING.bargeRadiusWu,
      hull: FIGUREHEAD_TUNING.bargeHull,
      collides: true,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: 'ice barge',
        swarmFloorPad: { label: 'ICE BARGE' },
        plants: { [FIGUREHEAD_TUNING.plId]: { role: 'barge' } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._bargeId = id;
    this._bargeOutAt = this._now();
    this.bus.emit(PLANTS_FIGUREHEAD_EVENT, { kind: 'barge_out', bargeId: id, t: this._now() });
  },

  _onRoundOver() {
    this._despawnAll('round_over');
  },

  _onKilled(payload) {
    const run = this._liveRun();
    if (!run || !payload) return;
    if (!isCryoArena(run.arenaId, FIGUREHEAD_TUNING)) return;
    if (this._bargeId == null || this._figureheadIds.length >= FIGUREHEAD_TUNING.maxFigureheads) return;
    const key = `${run.seed}`;
    if (this._stuckThisRun.has(key)) return; // the crowd remembers one decoration per run
    if (!isStuckWaspKill(payload, FIGUREHEAD_TUNING)) return;
    const barge = this._entity(this._bargeId);
    if (!barge || !payload.pos) return;
    const dx = payload.pos.x - barge.pos.x;
    const dz = payload.pos.z - barge.pos.z;
    if (dx * dx + dz * dz > FIGUREHEAD_TUNING.stickRadiusWu * FIGUREHEAD_TUNING.stickRadiusWu) return;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    this._stuckThisRun.set(key, true);
    while (this._stuckThisRun.size >= FIGUREHEAD_TUNING.memoryCap) {
      this._stuckThisRun.delete(this._stuckThisRun.keys().next().value);
    }
    const now = this._now();
    const spawned = spawnEntity({
      type: 'debris',
      pos: { x: payload.pos.x, z: payload.pos.z },
      vel: { x: 0, z: 0 },
      radius: 12,
      hull: 200,
      collides: false,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: 'figurehead — frozen',
        lampsFlashing: false,
        plants: { [FIGUREHEAD_TUNING.plId]: { role: 'figurehead', waspId: payload.id } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._figureheadIds.push({
      id,
      offsetX: payload.pos.x - barge.pos.x,
      offsetZ: payload.pos.z - barge.pos.z,
      thawAt: now + FIGUREHEAD_TUNING.bargeCircuitS, // a full circuit, then it thaws off
    });
    barge.data = barge.data || {};
    barge.data.lampsFlashing = true;
    barge.data.lampFlashUntil = now + FIGUREHEAD_TUNING.bargeLampFlashS;
    this.bus.emit('audio:cue', { id: 'confirm', position: { x: barge.pos.x, z: barge.pos.z }, gain: 0.9, rate: 0.85 });
    this.bus.emit(PLANTS_FIGUREHEAD_EVENT, {
      kind: 'stuck', figureheadId: id, bargeId: this._bargeId, waspId: payload.id,
      rideS: FIGUREHEAD_TUNING.bargeCircuitS, t: now, wave: run.wave,
    });
  },
};

/** Pure: is this run a Cryo Drift floor? */
export function isCryoArena(arenaId, tuning = FIGUREHEAD_TUNING) {
  return typeof arenaId === 'string' && arenaId.startsWith(tuning.cryoArenaPrefix);
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
