// PL-164 The gate gawker — "Between rounds one gate stays open a crack, and a Wasp watches you
// shop, bobbing. Shop; or bob back — it bobs more."
//
// The between-round window opens on `run:transitioned` into cleanup/draft/refit (run:waveCleared
// only ever emits while the round is still active, so the transition receipt is the real
// between-rounds seam). The plant parks a gawker prop a crack open next to the first gate solid
// on the floor (room solids carry `data.roomKind:'gate'` — survivalArena.js:2210). It bobs on a
// steady cadence. Every accepted purchase receipt (run:purchaseResolved, `accepted:true` —
// runSession.js:334) while it watches makes it bob more.
//
// Invariants:
// - Deterministic: state.simTime only; the bob is a simTime phase, no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - The gawker is a plant-owned prop (data.runtimeOwner 'plants'), despawned when the round starts.
// - Bounded state; one gawker per between-round window; bob boosts capped.

import { isSwarmRuleset } from '../survivalSwarm.js';

export const PLANTS_GATE_GAWKER_EVENT = 'plants:gateGawker';

export const GATE_GAWKER_TUNING = Object.freeze({
  plId: 'pl164',
  betweenRoundPhases: Object.freeze(['cleanup', 'refit', 'draft']),
  gateScanCap: 64,             // bounded scan for a gate solid
  gawkerRadiusWu: 12,
  gawkerHull: 320,
  bobPeriodS: 2.2,
  bobAmplitudeWu: 9,
  bobBoostPerPurchase: 1,      // "it bobs more"
  maxBobBoost: 4,
  boostDecayS: 12,             // excitement settles between purchases
  ttlS: 240,                   // despawn deadline even if the round never starts
  memoryCap: 4,
});

/** Pure: an accepted purchase receipt? (runSession receipt(accepted, reason, credits, total).) */
export function isAcceptedPurchase(receipt) {
  return !!(receipt && receipt.accepted === true);
}

/** Pure: the gawker's bob offset at a sim time (deterministic phase). */
export function bobOffsetS(nowS, boost, tuning = GATE_GAWKER_TUNING) {
  const period = tuning.bobPeriodS / (1 + Math.max(0, Math.min(boost, tuning.maxBobBoost)) * 0.5);
  return Math.sin((nowS / period) * Math.PI * 2) * tuning.bobAmplitudeWu;
}

export const gateGawkerPlant = {
  modes: ['swarm'],
  name: 'plants164',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._gawkerId = null;
    this._gatePos = null;
    this._gateNormalX = 0;
    this._gateNormalZ = 1;
    this._expiresAt = 0;
    this._bobBoost = 0;
    this._lastBoostAt = 0;
    this._lastPhase = -1;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:transitioned', (p) => this._onTransitioned(p));
    on('run:waveStarted', () => this._despawn('round_started'));
    on('run:ended', () => this._despawn('run_ended'));
    on('run:purchaseResolved', (p) => this._onPurchase(p));
  },

  update(dt) {
    const s = this.state;
    if (!s || this._gawkerId == null) return;
    const now = finite(s.simTime, 0);
    if (now >= this._expiresAt) return this._despawn('ttl');
    // Settle the boost slowly; the gawker calms down if you stop feeding it.
    if (this._bobBoost > 0 && now - this._lastBoostAt >= GATE_GAWKER_TUNING.boostDecayS) {
      this._bobBoost -= 1;
      this._lastBoostAt = now;
    }
    const gawker = this._entity(this._gawkerId);
    if (!gawker || gawker.alive === false) return this._despawn('gone');
    const offset = bobOffsetS(now, this._bobBoost, GATE_GAWKER_TUNING);
    gawker.pos.x = this._gatePos.x + this._gateNormalX * (26 + offset);
    gawker.pos.z = this._gatePos.z + this._gateNormalZ * (26 + offset);
    const phase = bobPhase(now, GATE_GAWKER_TUNING);
    if (phase !== this._lastPhase) {
      this._lastPhase = phase;
      gawker.data.lampsFlashing = true;
      gawker.data.lampFlashUntil = now + 0.3;
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._despawn('destroy');
    this._bobBoost = 0;
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

  _entity(id) {
    const s = this.state;
    if (id == null || !s || !s.entities || typeof s.entities.get !== 'function') return null;
    return s.entities.get(id) || null;
  },

  _despawn(reason) {
    if (this._gawkerId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._gawkerId);
    }
    this._gawkerId = null;
    this._gatePos = null;
    this._bobBoost = 0;
    this._lastPhase = -1;
  },

  _onTransitioned(payload) {
    const run = this._liveRun();
    if (!run) return;
    const phase = payload && payload.phase;
    if (!GATE_GAWKER_TUNING.betweenRoundPhases.includes(phase)) return this._despawn('round_started');
    if (this._gawkerId != null) return; // one gawker per window
    const gate = this._findGate();
    if (!gate) return;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const spawned = spawnEntity({
      type: 'debris',
      pos: { x: gate.pos.x + 26, z: gate.pos.z + 26 },
      vel: { x: 0, z: 0 },
      radius: GATE_GAWKER_TUNING.gawkerRadiusWu,
      hull: GATE_GAWKER_TUNING.gawkerHull,
      collides: true,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: 'the gawker',
        swarmFloorPad: { label: 'A WASP WATCHES' },
        plants: { [GATE_GAWKER_TUNING.plId]: { role: 'gawker' } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._gawkerId = id;
    this._gatePos = { x: gate.pos.x, z: gate.pos.z };
    this._expiresAt = this._now() + GATE_GAWKER_TUNING.ttlS;
    this._bobBoost = 0;
    this._lastPhase = -1;
    this.bus.emit(PLANTS_GATE_GAWKER_EVENT, { kind: 'watching', gawkerId: id, gateId: gate.id, t: this._now() });
  },

  _findGate() {
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return null;
    let scanned = 0;
    for (const e of entities.values()) {
      if (scanned >= GATE_GAWKER_TUNING.gateScanCap) return null;
      scanned += 1;
      const d = e && e.data;
      if (!e || e.alive === false || !e.pos || !d) continue;
      if (d.roomKind !== 'gate') continue; // room solids stamp roomKind (survivalArena.js:2210)
      return e;
    }
    return null;
  },

  _onPurchase(receipt) {
    if (this._gawkerId == null) return;
    const run = this._liveRun();
    if (!run) return;
    if (!GATE_GAWKER_TUNING.betweenRoundPhases.includes(run.phase)) return;
    if (!isAcceptedPurchase(receipt)) return;
    const now = this._now();
    if (this._bobBoost < GATE_GAWKER_TUNING.maxBobBoost) {
      this._bobBoost += GATE_GAWKER_TUNING.bobBoostPerPurchase;
    }
    this._lastBoostAt = now;
    this.bus.emit('audio:cue', { id: 'ui_click', position: this._gatePos, gain: 0.4, rate: 1.2 });
    this.bus.emit(PLANTS_GATE_GAWKER_EVENT, {
      kind: 'bob_more', gawkerId: this._gawkerId, bobBoost: this._bobBoost, t: now,
    });
  },
};

function bobPhase(nowS, tuning) {
  return Math.floor((nowS / tuning.bobPeriodS) * 2) % 2; // lamp pulse beat per half bob
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
