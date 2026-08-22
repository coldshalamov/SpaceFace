// Survival wave owner (PQ-133 / CRU-012 + CRU-013).
//
// Turns the pure plan from survivalWavePlanner into live hostiles, then reports when the wave is
// resolved. Two rules shape the whole file:
//
//   * Spawning goes through spawnBudget and makeEnemySpawnSpec only (see waveMaterialization.js).
//     A batch that the cap refuses is still DISPATCHED — waiting on bodies the cap will never
//     allow would strand the player in `active` forever with nothing to shoot.
//   * `run:waveCleared` is bookkeeping over THIS wave's own admitted ids, decremented by
//     entity:destroyed receipts. It is never "are there any hostiles left in the sector?" —
//     no phase is inferred from an entity scan (§27.3).
//
// Never writes state.run (runSession is the sole writer) and never touches campaign economy.

import { validateRunState } from '../core/runState.js';
import { WAVE_CLEARED_SEAM } from './survivalRun.js';
import {
  SURVIVAL_SPAWN_DISTANCE,
  levelForWave,
  materializeWaveBatch,
} from './waveMaterialization.js';

export const SURVIVAL_WAVE_OWNER_PREFIX = 'survival-wave:';

function liveSurvivalRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

export function waveOwnerId(wave) {
  return `${SURVIVAL_WAVE_OWNER_PREFIX}${Number.isInteger(wave) ? wave : 0}`;
}

export const survivalWave = {
  name: 'survivalWave',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this.ctx = ctx;
    this._unsubs = [];
    this._resetWave();
    this._owners = [];
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:wavePlanned', (p) => this._onWavePlanned(p)));
    this._unsubs.push(this.bus.on('run:waveStarted', (p) => this._onWaveStarted(p)));
    this._unsubs.push(this.bus.on('run:transitioned', (p) => this._onTransitioned(p)));
    this._unsubs.push(this.bus.on('run:ended', () => this._teardown()));
    this._unsubs.push(this.bus.on('entity:destroyed', (p) => this._onEntityDestroyed(p)));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._teardown();
  },

  update() {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    if (run.phase !== 'active') return;
    if (!this._active) return;

    this._cursor += 1;
    this._dispatchDue();
    this._checkCleared(run);
  },

  // ---- receipts -------------------------------------------------------------

  _onWavePlanned(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    const plan = payload && payload.plan;
    if (!plan || plan.ok === false || !Array.isArray(plan.schedule)) return;
    const wave = Number.isInteger(payload.wave) ? payload.wave : run.wave;
    this._resetWave();
    this._wave = wave;
    this._plan = plan;
    this._pending = plan.schedule.map((entry, index) => ({ entry, index }));
    const rules = plan.completionRules || {};
    const roles = Array.isArray(rules.blockingRoles) ? rules.blockingRoles : [];
    this._blockingRoles = new Set(roles);
  },

  _onWaveStarted(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'active') return;
    const wave = payload && Number.isInteger(payload.wave) ? payload.wave : run.wave;
    if (this._plan == null || this._wave !== wave) return;
    this._active = true;
    this._admittedTotal = 0;
    this._requestedTotal = 0;
    // Dispatch tick-0 batches on the same tick the wave goes active so the fight starts
    // immediately instead of one frame late.
    this._cursor = 0;
    this._dispatchDue();
    this._checkCleared(run);
  },

  _onTransitioned(payload) {
    const phase = payload && payload.phase;
    if (phase === 'active') return;
    // Leaving `active` stops dispatch. Live bodies keep their bound budget slots and release
    // themselves through entity:destroyed; this owner is not the entity lifecycle owner.
    this._active = false;
  },

  _onEntityDestroyed(payload) {
    const id = payload && payload.id;
    if (id == null || !this._cohort) return;
    this._cohort.delete(id);
  },

  // ---- dispatch -------------------------------------------------------------

  _dispatchDue() {
    if (!this._pending || this._pending.length === 0) return;
    const plan = this._plan;
    if (!plan) return;
    const run = liveSurvivalRun(this.state);
    const seed = run && Number.isInteger(run.seed) ? run.seed : 1;
    const level = levelForWave(this._wave);
    const ownerId = waveOwnerId(this._wave);
    if (!this._owners.includes(ownerId)) this._owners.push(ownerId);

    let write = 0;
    for (let i = 0; i < this._pending.length; i++) {
      const item = this._pending[i];
      const entry = item.entry;
      const atTick = Number.isInteger(entry.atTick) ? entry.atTick : 0;
      if (atTick > this._cursor) {
        this._pending[write++] = item;
        continue;
      }
      const receipt = materializeWaveBatch(this.ctx, {
        ownerId,
        enemyId: entry.enemyId,
        level,
        count: entry.count,
        gateGroup: entry.gateGroup,
        distance: SURVIVAL_SPAWN_DISTANCE,
        seed,
        wave: this._wave,
        packageIndex: Number.isInteger(entry.packageIndex) ? entry.packageIndex : 0,
        batchIndex: item.index,
        role: entry.role,
      });
      this._requestedTotal += receipt.requested;
      this._admittedTotal += receipt.admitted;
      for (const id of receipt.spawnedIds) this._cohort.set(id, entry.role);
      this._emit('run:waveMaterialized', {
        wave: this._wave,
        role: entry.role,
        enemyId: entry.enemyId,
        gateGroup: entry.gateGroup,
        atTick,
        requested: receipt.requested,
        admitted: receipt.admitted,
        rejected: receipt.rejected,
        tick: this._cursor,
      });
    }
    this._pending.length = write;
  },

  _checkCleared(run) {
    if (this._cleared) return;
    if (!this._active) return;
    if (this._pending && this._pending.length > 0) return;
    for (const role of this._cohort.values()) {
      if (this._blockingRoles.size === 0 || this._blockingRoles.has(role)) return;
    }
    this._cleared = true;
    this._active = false;
    this._emit(WAVE_CLEARED_SEAM, {
      wave: this._wave,
      requested: this._requestedTotal,
      admitted: this._admittedTotal,
      // A wave the cap starved completely resolves rather than deadlocking; the receipt says so
      // instead of leaving a silent empty wave that reads like a cleared one.
      starved: this._requestedTotal > 0 && this._admittedTotal === 0,
      tick: this._cursor,
      runWave: run && Number.isInteger(run.wave) ? run.wave : this._wave,
    });
  },

  // ---- lifecycle ------------------------------------------------------------

  _resetWave() {
    this._plan = null;
    this._wave = 0;
    this._pending = [];
    this._cohort = new Map();
    this._blockingRoles = new Set();
    this._cursor = -1;
    this._active = false;
    this._cleared = false;
    this._admittedTotal = 0;
    this._requestedTotal = 0;
  },

  _teardown() {
    this._resetWave();
    const budget = this.ctx && this.ctx.helpers && this.ctx.helpers.spawnBudget;
    if (budget && typeof budget.release === 'function') {
      for (const ownerId of this._owners || []) budget.release(ownerId);
    }
    this._owners = [];
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};
