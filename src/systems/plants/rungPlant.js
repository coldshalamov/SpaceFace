// PL-189 Rung — "Put an enemy through the gong and the crowd is louder than Kiln. Aim for it."
//
// A collision-family kill (a thrown body) that lands in the gong — the Foundry's hanging plate,
// convention-flagged `data.plantsGong` by the hazard body owner — rings it: the gong's lamps
// flash, the crowd roars over Kiln for a beat, once per round.
//
// Invariants:
// - Deterministic: state.simTime only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - The gong body itself is the hazard owner's (PL-67's hanging plate); this plant only reads
//   the convention flag and answers the hit. Nothing authors that flag today (PL-67 is OPEN),
//   so until the body exists the row is honestly INERT: no narration, no Kiln line, no crowd
//   audio, no receipts.
// - Bounded Maps (memoryCap); once per round; the roar is audio + event, no Kiln line spent.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { killCauseFromPayload, KillCause } from '../../combat/killCausality.js';

export const PLANTS_RUNG_EVENT = 'plants:rung';

export const RUNG_TUNING = Object.freeze({
  plId: 'pl189',
  gongFlag: 'plantsGong',      // data key the hanging-plate body owner sets
  gongRadiusWu: 180,           // "through the gong": kill lands inside the plate's ring
  gongScanCap: 64,
  thrownCauses: Object.freeze([KillCause.SHIP_COLLISION, KillCause.TERRAIN_COLLISION]),
  roarS: 3,
  memoryCap: 8,
});

/** Pure: a collision-family kill (the thrown body) landing within radius of a gong position. */
export function isRungKill(payload, gongPos, radiusWu = RUNG_TUNING.gongRadiusWu, tuning = RUNG_TUNING) {
  if (!payload || !payload.pos || !gongPos) return false;
  if (!tuning.thrownCauses.includes(killCauseFromPayload(payload))) return false;
  const dx = payload.pos.x - gongPos.x;
  const dz = payload.pos.z - gongPos.z;
  return dx * dx + dz * dz <= radiusWu * radiusWu;
}

export const rungPlant = {
  modes: ['swarm'],
  name: 'plants189',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    this._rungWave = 0;
    this._roarUntil = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('entity:killed', (p) => this._onKilled(p));
    on('run:waveStarted', () => { this._roarUntil = 0; });
    on('run:ended', () => this._reset());
  },

  update() { /* event-driven */ },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._rungWave = 0;
    this._roarUntil = 0;
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

  _reset() {
    this._rungWave = 0;
    this._roarUntil = 0;
  },

  _findGong() {
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return null;
    let scanned = 0;
    for (const e of entities.values()) {
      if (scanned >= RUNG_TUNING.gongScanCap) return null;
      scanned += 1;
      if (!e || e.alive === false || !e.pos || !e.data) continue;
      if (e.data[RUNG_TUNING.gongFlag] !== true && e.data.kind !== 'gong') continue;
      return e;
    }
    return null;
  },

  _onKilled(payload) {
    const run = this._liveRun();
    if (!run || !payload) return;
    if (this._rungWave === run.wave) return; // once per round
    const gong = this._findGong();
    if (!gong) return;
    if (!isRungKill(payload, gong.pos, RUNG_TUNING.gongRadiusWu, RUNG_TUNING)) return;
    const now = this._now();
    this._rungWave = run.wave;
    this._roarUntil = now + RUNG_TUNING.roarS;
    gong.data = gong.data || {};
    gong.data.lampsFlashing = true;
    gong.data.lampFlashUntil = now + 1.2;
    this.bus.emit('audio:cue', {
      id: 'confirm', position: { x: gong.pos.x, z: gong.pos.z }, gain: 1.2, rate: 0.8,
    });
    this.bus.emit(PLANTS_RUNG_EVENT, {
      kind: 'crowd_roar',
      gongId: gong.id,
      victimId: payload.id,
      roarS: RUNG_TUNING.roarS,
      t: now, wave: run.wave,
    });
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
