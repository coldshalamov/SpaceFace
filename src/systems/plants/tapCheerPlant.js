// PL-328 The Tap cheer — "Let a stranger share your Tap's output mid-round and the stands chant;
// the Tap runs one surge longer than it should. Share the tap; or hog every tap — taps on your
// runs run dry a beat early."
//
// Your Tap is your own placed fortify piece: an entity of type 'beacon' stamped
// data.swarmFortify (src/systems/swarmFortify.js:68) with ownerId === playerId. Mid-round, while
// any other fighter's hull shares the piece's output radius (effect.range, else the field
// radius) for a held beat, the stands chant once per piece per round: a chant cue at the piece,
// and the surge — the piece's own lamps run one surge longer than they should (a lampFlashUntil
// stamp on the device body; the piece's real cycle belongs to its owner, never written here).
// Hog every socket — own two or more pieces through a whole round with nobody sharing — and the
// floor starts shorting you: after two hogged rounds, every purchase you make for the rest of the
// run lands a dry-beat deny and receipt. The dryness is a floor mood, not a swarm write.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
//   The surge is a lamp stamp + receipt on the swarm-owned device body (badMagnet precedent).
// - Bounded Maps (share seconds, cheered set) with memoryCap; per-run reset on run:ended.

import { isSwarmRuleset } from '../survivalSwarm.js';

export const PLANTS_TAP_CHEER_EVENT = 'plants:tapCheer';

export const TAP_CHEER_TUNING = Object.freeze({
  plId: 'pl328',
  shareHoldS: 2.0,
  scanThrottleS: 0.5,
  surgeLampS: 3.0,           // "one surge longer than it should"
  defaultShareRadiusWu: 200,
  hogDevices: 2,             // owning this many with zero shares reads as hogging
  hogRoundsForDry: 2,
  strangerScanCap: 48,
  deviceScanCap: 12,
  chantGain: 0.55,
  memoryCap: 16,
});

/** Pure: the radius at which a stranger counts as sharing a device's output. */
export function deviceShareRadius(device, tuning = TAP_CHEER_TUNING) {
  const d = device && device.data;
  const fortify = d && d.swarmFortify;
  if (!fortify) return 0;
  if (fortify.effect && Number.isFinite(fortify.effect.range)) return fortify.effect.range;
  if (fortify.field && Number.isFinite(fortify.field.radius)) return fortify.field.radius;
  return tuning.defaultShareRadiusWu;
}

/** Pure: the floor's dryness verdict for a hogged record. */
export function hogVerdict(hogRounds, dry, tuning = TAP_CHEER_TUNING) {
  if (dry) return 'dry';
  return hogRounds >= tuning.hogRoundsForDry ? 'going_dry' : 'wet';
}

export const tapCheerPlant = {
  name: 'plants328',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    this._resetRun();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:waveStarted', () => this._onRoundStart());
    on('run:waveCleared', () => this._onRoundCleared());
    on('run:purchaseResolved', (p) => this._onPurchase(p));
    on('run:ended', () => this._reset());
  },

  update() {
    const run = this._liveRun();
    if (!run || run.phase !== 'active') return;
    const now = this._now();
    if (now < this._nextScanAt) return;
    this._nextScanAt = now + TAP_CHEER_TUNING.scanThrottleS;
    const devices = this._playerDevices();
    this._ownedNow = devices.length;
    const strangers = this._strangerBodies();
    for (const device of devices) {
      if (device.id == null || this._cheered.has(device.id)) continue;
      const radius = deviceShareRadius(device);
      if (!(radius > 0)) continue;
      let shared = false;
      for (const body of strangers) {
        const dx = body.pos.x - device.pos.x;
        const dz = body.pos.z - device.pos.z;
        if (dx * dx + dz * dz <= radius * radius) {
          shared = true;
          break;
        }
      }
      if (!shared) continue;
      const held = (this._shareTime.get(device.id) || 0) + TAP_CHEER_TUNING.scanThrottleS;
      this._shareTime.set(device.id, held);
      while (this._shareTime.size >= TAP_CHEER_TUNING.memoryCap) {
        this._shareTime.delete(this._shareTime.keys().next().value);
      }
      if (held >= TAP_CHEER_TUNING.shareHoldS) {
        this._cheered.add(device.id);
        this._sharesThisRound += 1;
        // The surge: the piece's lamps run one surge longer than they should.
        device.data = device.data || {};
        device.data.lampsFlashing = true;
        device.data.lampFlashUntil = now + TAP_CHEER_TUNING.surgeLampS;
        this.bus.emit('audio:cue', {
          id: 'confirm', position: { x: device.pos.x, z: device.pos.z }, gain: TAP_CHEER_TUNING.chantGain, rate: 1.25,
        });
        this.bus.emit(PLANTS_TAP_CHEER_EVENT, {
          kind: 'stands_chant', deviceId: device.id, deviceKind: device.data.swarmFortify.deviceId, t: now,
        });
        this.bus.emit(PLANTS_TAP_CHEER_EVENT, {
          kind: 'surge_extended', deviceId: device.id, extraS: TAP_CHEER_TUNING.surgeLampS, t: now,
        });
      }
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._resetRun();
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

  _resetRun() {
    this._shareTime = new Map(); // deviceId -> held seconds (bounded)
    this._cheered = new Set();   // device ids cheered this round
    this._ownedNow = 0;
    this._sharesThisRound = 0;
    this._hogRounds = 0;
    this._tapsDry = false;
    this._nextScanAt = 0;
  },

  _reset() {
    this._resetRun();
  },

  _onRoundStart() {
    if (!this._liveRun()) return;
    this._cheered.clear();
    this._sharesThisRound = 0;
    this._nextScanAt = 0;
  },

  _onRoundCleared() {
    const run = this._liveRun();
    if (!run) return;
    if (this._ownedNow >= TAP_CHEER_TUNING.hogDevices && this._sharesThisRound === 0) {
      // Hog every tap and the floor remembers.
      this._hogRounds += 1;
      this.bus.emit(PLANTS_TAP_CHEER_EVENT, {
        kind: 'taps_hogged', devices: this._ownedNow, rounds: this._hogRounds, t: this._now(),
      });
      if (hogVerdict(this._hogRounds, this._tapsDry) === 'going_dry') {
        this._tapsDry = true;
        this.bus.emit(PLANTS_TAP_CHEER_EVENT, {
          kind: 'taps_dry', rounds: this._hogRounds, t: this._now(),
        });
      }
    }
  },

  _onPurchase(receipt) {
    const run = this._liveRun();
    if (!run) return;
    if (!receipt || receipt.accepted !== true) return;
    if (!this._tapsDry) return;
    // Taps on your runs run dry a beat early: the floor's mood, delivered at the till.
    this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.4, rate: 0.9 });
    this.bus.emit(PLANTS_TAP_CHEER_EVENT, {
      kind: 'dry_beat', requestId: receipt.requestId, credits: receipt.credits, t: this._now(),
    });
  },

  _playerDevices() {
    const entities = this.state && this.state.entities;
    const out = [];
    if (!entities || typeof entities.values !== 'function') return out;
    let scanned = 0;
    for (const e of entities.values()) {
      if (scanned >= TAP_CHEER_TUNING.deviceScanCap * 8 || out.length >= TAP_CHEER_TUNING.deviceScanCap) break;
      scanned += 1;
      if (!e || e.alive === false || e.type !== 'beacon' || !e.pos) continue;
      const d = e.data;
      if (!d || !d.swarmFortify || e.ownerId !== this.state.playerId) continue;
      out.push(e);
    }
    return out;
  },

  _strangerBodies() {
    const entities = this.state && this.state.entities;
    const out = [];
    if (!entities || typeof entities.values !== 'function') return out;
    let scanned = 0;
    for (const e of entities.values()) {
      if (scanned >= TAP_CHEER_TUNING.strangerScanCap * 4 || out.length >= TAP_CHEER_TUNING.strangerScanCap) break;
      scanned += 1;
      if (!e || e.alive === false || e.type !== 'ship' || !e.pos) continue;
      if (e.id === this.state.playerId) continue; // a stranger is anybody else out there
      out.push(e);
    }
    return out;
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
