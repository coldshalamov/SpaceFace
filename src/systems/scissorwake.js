import { SCISSORWAKE as C } from '../data/scissorwake.js';
import { getCombatKernel } from '../combat/kernel.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';

const owners = new WeakMap();

// Read-only facts from the tactical/cut owners. A restored hull earns a fresh cue;
// renderer poses never create a crossing or advance the doctrine.
export function scissorwakePresentation(state, entity) {
  const owner = owners.get(state), cue = owner?._presentation.get(entity?.id);
  if (!cue || state.entities.get(entity.id) !== entity || !entity.alive
    || cue.entity !== entity || cue.life !== entity.occupantGeneration || cue.tick > state.tick
    || state.mode !== 'flight') return null;
  const commit = entity.data?._cutterCommit;
  const currentCommit = commit?.sourceLife === entity.occupantGeneration ? commit : null;
  const physics = owner.ctx.registry?.get('physics'), native = physics?._sg02;
  const record = native?.records.get(entity.id), age = state.tick - native?._simTick;
  return { phase: cue.phase, phaseStartTick: cue.phaseStartTick, tick: state.tick,
    committedTick: currentCommit?.committedTick ?? null,
    attackId: currentCommit?.attackId ?? entity.data?.scissorwakeLastResolvedAttack ?? null,
    outcome: entity.data?.scissorwakeOutcome ?? null,
    recoveryUntilTick: entity.data?._cutterRecoverUntil ?? null,
    ownerLife: entity.occupantGeneration,
    nativeBodyReady: !physics?._nativeRestorePending && !physics?._nativeRestoreDeferred
      && record?.entity === entity && !!record.body && physicsBodyNativeReady(entity)
      && record._postStepReadTick === native.tick && Number.isInteger(native._simTick) && age >= 0 && age <= 2
      && record.proxyId === entity.physicsBody?.collisionProxyManifest?.id
      && record.revision === entity.physicsBody?.revision };
}

export const scissorwakeEncounter = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + C.encounterSeconds;
    const ids = d.spawnShips(live, live.plan.ships);
    const cutter = ids.map(id => state.entities.get(id)).find(e => e?.data?.lootTableId === C.enemyId);
    if (!cutter) return d.abort(live, 'no_cutter_budget');
    live.data.scissorwake = { cutterId: cutter.id, cutterLife: cutter.occupantGeneration, startedAt: d.now(), escortsReleased: false };
    for (const id of ids) {
      const e = state.entities.get(id);
      if (e && e !== cutter) e.data.ai.passive = true;
    }
    live.phase = 'conflict';
    d.say(live, 'alert', 'SCISSORWAKE: move the cable or throw the cutter. The crossing locks before the pass.', null, { literal: true, primary: true });
  },
  tick(d, live, state) {
    const row = live.data.scissorwake;
    if (!row) return;
    const cutter = state.entities.get(row.cutterId);
    const current = !!cutter && cutter.alive !== false && cutter.occupantGeneration === row.cutterLife;
    if (!row.escortsReleased && (!current || cutter.data.scissorwakeOutcome || d.now() - row.startedAt >= 12)) {
      row.escortsReleased = true;
      for (const id of live.ids) {
        const e = state.entities.get(id);
        if (e?.data?.ai) e.data.ai.passive = false;
      }
    }
    if (d.aliveCount(live) === 0) return d.resolve(live, 'cleared', { speak: false });
    if (d.now() >= live.deadlineAt) {
      d.despawnAll(live, 8);
      return d.resolve(live, 'escaped', { speak: false });
    }
  },
});

// Owns the bounded first introduction and factual cue copy; the tactical/cut owners own motion
// and detach. Requests honor the existing director's pacing, gates and shared spawn budget.
export const scissorwake = {
  name: 'scissorwake',
  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this._nextRequest = 0;
    this._presentation = new Map(); owners.set(ctx.state, this);
    this.newGame();
    this._newRun = ctx.bus.on('game:new', () => this.newGame());
    this._unsub = ctx.bus.on('ai:telegraph', p => {
      if (p?.doctrineId !== C.doctrineId) return;
      const e = this.state.entities.get(p.entityId);
      if (!e?.alive || e.data?.lootTableId !== C.enemyId) return;
      this._recordPhase(e, p);
      ctx.bus.emit('toast', { text: 'CUTTER OPENING — move the line or move the cutter.', kind: 'warn', ttl: 2.1 });
    });
    this._phaseSub = ctx.bus.on('ai:doctrinePhase', p => {
      const e = this.state.entities.get(p?.entityId);
      if (p?.doctrineId === C.doctrineId && e?.alive && e.data?.lootTableId === C.enemyId) this._recordPhase(e, p);
    });
  },
  _recordPhase(entity, payload) {
    if (!Number.isSafeInteger(payload.tick) || payload.tick < 0 || payload.tick > this.state.tick) return;
    const previous = this._presentation.get(entity.id);
    if (previous?.entity === entity && previous.life === entity.occupantGeneration && previous.tick > payload.tick) return;
    this._presentation.set(entity.id, { entity, life: entity.occupantGeneration, phase: payload.phase,
      phaseStartTick: previous?.entity === entity && previous.life === entity.occupantGeneration && previous.phase === payload.phase
        ? previous.phaseStartTick : payload.tick, tick: payload.tick });
  },
  newGame() { this._row = { introduced: false, lineUse: 0 }; this._nextRequest = 0; this._presentation?.clear(); },
  destroy() { this._unsub?.(); this._phaseSub?.(); this._newRun?.(); owners.delete(this.state); this._presentation.clear(); },
  serialize() { return { ...this._row }; },
  deserialize(row) {
    this._row = { introduced: row?.introduced === true, lineUse: Math.max(0, Math.min(C.lineUseSeconds, Number(row?.lineUse) || 0)) };
    this._nextRequest = 0;
    this._presentation.clear();
  },
  update(dt, state) {
    if (this._row.introduced || state.mode !== 'flight' || (state.run?.kind === 'survival' && state.run.phase !== 'inactive') || state.ui?.docked) return;
    const player = state.entities.get(state.playerId);
    if (!player?.alive) return;
    const kernel = getCombatKernel(this.ctx);
    const lined = kernel?.attachments?.listForEntity(player.id)?.some(a => a.state === 'active');
    if (lined) this._row.lineUse = Math.min(C.lineUseSeconds, this._row.lineUse + dt);
    if (this._row.lineUse < C.lineUseSeconds || state.simTime < C.earliestSeconds || state.simTime < this._nextRequest) return;
    this._nextRequest = state.simTime + 3;
    const director = this.ctx.registry?.get('encounterDirector');
    const result = director?.requestAuthoredEncounter({ shapeId: C.encounterId,
      encounterId: 'scissorwake:first-crossing', sectorId: state.world?.currentSectorId,
      anchor: { x: player.pos.x + 520, z: player.pos.z + 140 }, respectPacing: true });
    if (result?.ok) this._row.introduced = true;
  },
};
