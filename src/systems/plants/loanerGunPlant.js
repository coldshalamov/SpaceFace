// PL-324 The loaner gun — "Before round five with a drained wallet, a wall mount grows a gun
// stenciled LOANER — no charge. Bring it to round ten and the loan is settled in the ledger.
// Return it by ten; or keep it past ten — loaners stop spawning for your runs, a month of floors."
//
// In a between-round window before round five (run:transitioned into cleanup/draft/refit with
// run.wave < 5) with a drained wallet (run.credits below the cheapest fortify piece), a wall mount
// prop grows beside the gate: a LOANER stencil, no charge. Take it by flying to the mount in the
// window — the loan is on the ledger from that wave. Bring your hull back to a return mount by
// round ten and the loan settles (one voice line). Still holding it past round ten and the ledger
// defaults you: no loaner mounts grow for the rest of the run, and the default receipt is the
// record a ledger owner would need to stretch it to "a month of floors".
//
// Invariants:
// - Deterministic: state.simTime / hash32 only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
//   Purchases are never minted or refused here — the plant only adds its own prop and receipts.
// - The mount is a plant-owned prop; despawned on round start, run end and destroy.
// - Bounded state; one mount per window; per-run reset on run:ended.

import { isSwarmRuleset } from '../survivalSwarm.js';

export const PLANTS_LOANER_GUN_EVENT = 'plants:loanerGun';

export const LOANER_GUN_TUNING = Object.freeze({
  plId: 'pl324',
  betweenRoundPhases: Object.freeze(['cleanup', 'refit', 'draft']),
  preWave: 5,                 // "before round five"
  walletDrainedBelow: 100,    // below the cheapest wall piece, the wallet is drained
  settleByWave: 10,           // "return it by ten"
  takeRangeWu: 50,
  mountTtlS: 240,
  mountOffsetWu: 44,          // a crack off the gate post
  mountRadiusWu: 12,
  mountHull: 600,
  scanCap: 64,
  voiceLine: 'Ledger says square. Rare.',
  voiceId: 'plants:pl324:settled',
  memoryCap: 8,
});

/** Pure: is this window still inside the loan's return term? */
export function loanerDeadlineOk(wave, tuning = LOANER_GUN_TUNING) {
  const w = Number.isFinite(wave) ? wave : 0;
  return w > 0 && w <= tuning.settleByWave;
}

/** Pure: does this wallet read as drained for loaner purposes? */
export function walletDrained(credits, tuning = LOANER_GUN_TUNING) {
  return Number.isFinite(credits) && credits < tuning.walletDrainedBelow;
}

/** Pure: the ledger's verdict for a run. */
export function loanVerdict({ taken = false, settled = false, defaulted = false } = {}) {
  if (defaulted) return 'defaulted';
  if (settled) return 'settled';
  if (taken) return 'held';
  return 'no_loan';
}

export const loanerGunPlant = {
  name: 'plants324',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._resetRun();
    this._defaulted = false;
    this._stoppedReported = false;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:transitioned', (p) => this._onTransitioned(p));
    on('run:waveStarted', (p) => this._onWaveStarted(p));
    on('run:ended', () => this._reset());
  },

  update() {
    const run = this._liveRun();
    if (!run) return;
    const now = this._now();
    if (this._mountId == null) return;
    if (now >= this._expiresAt) return this._despawn();
    const player = this._player();
    const mount = this._entity(this._mountId);
    if (!player || !player.pos) return;
    if (!mount || mount.alive === false) return this._despawn();
    const dx = player.pos.x - this._mountPos.x;
    const dz = player.pos.z - this._mountPos.z;
    if (dx * dx + dz * dz > LOANER_GUN_TUNING.takeRangeWu * LOANER_GUN_TUNING.takeRangeWu) return;
    if (!this._loanTaken) {
      this._loanTaken = true;
      this._takenWave = run.wave + 1; // you carry it into the next round
      this._despawn();
      this.bus.emit('audio:cue', { id: 'confirm', position: { x: this._mountPos.x, z: this._mountPos.z }, gain: 0.5, rate: 1.2 });
      this.bus.emit(PLANTS_LOANER_GUN_EVENT, {
        kind: 'loan_taken', takenWave: this._takenWave, charge: 0, t: now,
      });
    } else if (!this._settled) {
      this._settled = true;
      this._despawn();
      this.bus.emit('voice:say', {
        channel: 'comms',
        id: LOANER_GUN_TUNING.voiceId,
        text: LOANER_GUN_TUNING.voiceLine,
        ttl: 4,
      });
      this.bus.emit(PLANTS_LOANER_GUN_EVENT, {
        kind: 'loan_settled', heldThroughWave: run.wave, t: now,
      });
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._despawn();
    this._defaulted = false;
    this._stoppedReported = false;
  },

  // ---- internals ----

  _liveRun() {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return null;
    if (run.phase === 'inactive' || run.phase === 'ended' || run.phase === 'victory') return null;
    return run;
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _player() {
    const s = this.state;
    return s && s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
  },

  _entity(id) {
    const s = this.state;
    if (id == null || !s || !s.entities || typeof s.entities.get !== 'function') return null;
    return s.entities.get(id) || null;
  },

  _resetRun() {
    this._mountId = null;
    this._mountPos = null;
    this._expiresAt = 0;
    this._loanTaken = false;
    this._takenWave = null;
    this._settled = false;
  },

  _reset() {
    this._resetRun();
    this._defaulted = false;
    this._stoppedReported = false;
  },

  _despawn() {
    if (this._mountId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._mountId);
    }
    this._mountId = null;
  },

  _onWaveStarted(payload) {
    const run = this._liveRun();
    this._despawn();
    if (!run) return;
    const wave = payload && Number.isFinite(payload.wave) ? payload.wave : run.wave;
    if (this._loanTaken && !this._settled && !loanerDeadlineOk(wave)) {
      // Kept it past ten: the ledger defaults you.
      this._defaulted = true;
      this.bus.emit(PLANTS_LOANER_GUN_EVENT, {
        kind: 'loan_defaulted',
        takenWave: this._takenWave,
        keptPastWave: wave,
        stopsFor: 'run',
        note: 'a month of floors rides on the default receipt',
        t: this._now(),
      });
    }
  },

  _onTransitioned(payload) {
    const run = this._liveRun();
    if (!run) return;
    const phase = payload && payload.phase;
    if (!LOANER_GUN_TUNING.betweenRoundPhases.includes(phase)) return this._despawn();
    if (this._defaulted) {
      if (!this._stoppedReported) {
        this._stoppedReported = true;
        this.bus.emit(PLANTS_LOANER_GUN_EVENT, {
          kind: 'loaners_stopped', defaulted: true, t: this._now(),
        });
      }
      return;
    }
    if (this._mountId != null) return; // one mount per window
    const wantOffer = !this._loanTaken && run.wave < LOANER_GUN_TUNING.preWave
      && walletDrained(run.credits);
    const wantReturn = this._loanTaken && !this._settled
      && loanerDeadlineOk(run.wave + 1);
    if (!wantOffer && !wantReturn) return;
    const gate = this._findGate();
    if (!gate || !gate.pos) return;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const spawned = spawnEntity({
      type: 'debris',
      pos: { x: gate.pos.x + LOANER_GUN_TUNING.mountOffsetWu, z: gate.pos.z + LOANER_GUN_TUNING.mountOffsetWu },
      vel: { x: 0, z: 0 },
      radius: LOANER_GUN_TUNING.mountRadiusWu,
      hull: LOANER_GUN_TUNING.mountHull,
      collides: true,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: wantOffer ? 'the loaner mount' : 'the loaner return',
        swarmFloorPad: { label: wantOffer ? 'LOANER — NO CHARGE' : 'LOANER RETURN' },
        plants: { [LOANER_GUN_TUNING.plId]: { role: wantOffer ? 'loaner_mount' : 'return_mount' } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._mountId = id;
    this._mountPos = { x: gate.pos.x + LOANER_GUN_TUNING.mountOffsetWu, z: gate.pos.z + LOANER_GUN_TUNING.mountOffsetWu };
    this._expiresAt = this._now() + LOANER_GUN_TUNING.mountTtlS;
    this.bus.emit(PLANTS_LOANER_GUN_EVENT, {
      kind: wantOffer ? 'loaner_offered' : 'return_window',
      mountId: id,
      gateId: gate.id,
      credits: run.credits,
      t: this._now(),
    });
  },

  _findGate() {
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return null;
    let scanned = 0;
    for (const e of entities.values()) {
      if (scanned >= LOANER_GUN_TUNING.scanCap) return null;
      scanned += 1;
      const d = e && e.data;
      if (!e || e.alive === false || !e.pos || !d) continue;
      if (d.roomKind !== 'gate') continue;
      return e;
    }
    return null;
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
