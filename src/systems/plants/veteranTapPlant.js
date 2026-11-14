// PL-321 The veteran's tap — "Between rounds, a scarred drone taps your shoulder-lamp twice and
// points at a door you have not bought — then at your scrounge pile. Take the hint; or ignore it
// twice — the drone picks somebody else to help."
//
// The between-round window opens on `run:transitioned` into cleanup/draft/refit (run:waveCleared
// only ever emits while the round is still active, so the transition receipt is the real
// between-rounds seam). The plant parks a scarred drone prop near you, taps your shoulder-lamp
// twice (two cue ticks at your position, the drone's own lamps pulsing with each), then points:
// its floor-pad label names the nearest gate solid (SEAM NOTE, honest: gate solids carry only
// roomKind/roomSolidId — survivalArena.js:2303 — and no fortify-to-gate mapping is readable
// from this plant's permitted seams, so "unbought" stays the row's intent, not a checkable
// filter), and its pointing receipt carries the nearest scrounge pile (a loose floor pickup).
// Take the hint by flying to the pointed door while the window is open. Ignore the pointing
// through two windows and the drone retires for the run — somebody else gets the help.
//
// Invariants:
// - Deterministic: state.simTime / state.tick / hash32 only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - The drone is a plant-owned prop (data.runtimeOwner 'plants'), despawned on round start,
//   run end and destroy.
// - Bounded state; one drone per between-round window; two taps per window; voice once per run.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { hash32 } from '../../core/rng.js';

export const PLANTS_VETERAN_TAP_EVENT = 'plants:veteranTap';

export const VETERAN_TAP_TUNING = Object.freeze({
  plId: 'pl321',
  betweenRoundPhases: Object.freeze(['cleanup', 'refit', 'draft']),
  taps: 2,
  firstTapDelayS: 0.4,
  tapGapS: 0.35,
  pointDelayS: 1.2,          // after the taps, the point lands
  hintRangeWu: 130,          // "take the hint" = you went and looked
  droneTtlS: 240,            // despawn deadline even if the round never starts
  pileRangeWu: 900,          // scrounge pile = nearest loose floor pickup within this
  scanCap: 64,
  droneRadiusWu: 10,
  droneHull: 200,
  tapCueGain: 0.45,
  tapCueRate: 2.2,
  voiceLine: 'There. That one. Go on.',
  voiceId: 'plants:pl321:point',
  memoryCap: 8,
});

/** Pure: after two ignored windows the veteran helps somebody else. */
export function veteranVerdict(ignoredWindows) {
  return ignoredWindows >= 2 ? 'picked_somebody_else' : 'helping';
}

/** Pure: nearest scrounge pile (a loose floor pickup) to a position within range. */
export function nearestPile(candidates, pos, rangeWu = VETERAN_TAP_TUNING.pileRangeWu) {
  if (!pos || !Array.isArray(candidates)) return null;
  let best = null;
  let bestSq = rangeWu * rangeWu;
  for (const e of candidates) {
    if (!e || e.alive === false || e.type !== 'pickup' || !e.pos) continue;
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

/** Pure: which side of you the drone parks on (deterministic per run seed). */
export function droneSideFor(seed, tuning = VETERAN_TAP_TUNING) {
  const angle = (hash32(String(seed), tuning.plId, 'side') % 6283) / 1000;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

export const veteranTapPlant = {
  name: 'plants321',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._resetRun();
    this._retired = false;
    this._retiredReported = false;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:transitioned', (p) => this._onTransitioned(p));
    on('run:waveStarted', () => this._closeWindow());
    on('run:ended', () => this._reset());
  },

  update() {
    const run = this._liveRun();
    if (!run || this._droneId == null) return;
    const now = this._now();
    if (now >= this._expiresAt) return this._despawn('ttl');
    const drone = this._entity(this._droneId);
    if (!drone || drone.alive === false) return this._despawn('gone');
    // The two lamp taps, on schedule, each with a tick cue at your shoulder.
    while (this._nextTap < this._tapTimes.length && this._tapTimes[this._nextTap] <= now) {
      this._nextTap += 1;
      drone.data = drone.data || {};
      drone.data.lampsFlashing = true;
      drone.data.lampFlashUntil = now + 0.25;
      const player = this._player();
      this.bus.emit('audio:cue', {
        id: 'confirm',
        position: player && player.pos ? { x: player.pos.x, z: player.pos.z } : null,
        gain: VETERAN_TAP_TUNING.tapCueGain,
        rate: VETERAN_TAP_TUNING.tapCueRate,
      });
    }
    // The point: label names the unbought door, one voice line per run, receipt carries the pile.
    if (!this._pointed && this._pointAt <= now) {
      this._pointed = true;
      if (this._gatePos) {
        drone.data = drone.data || {};
        drone.data.swarmFloorPad = { label: 'GO LOOK — UNBOUGHT' };
        drone.data.lampsFlashing = true;
        drone.data.lampFlashUntil = now + 0.8;
        if (!this._voiceUsed) {
          this._voiceUsed = true;
          this.bus.emit('voice:say', {
            channel: 'comms',
            id: VETERAN_TAP_TUNING.voiceId,
            text: VETERAN_TAP_TUNING.voiceLine,
            ttl: 4,
          });
        }
        this.bus.emit(PLANTS_VETERAN_TAP_EVENT, {
          kind: 'pointing',
          droneId: this._droneId,
          gateId: this._gateId,
          gatePos: this._gatePos ? { x: this._gatePos.x, z: this._gatePos.z } : null,
          pilePos: this._pilePos,
          t: now,
        });
      }
    }
    // Taking the hint: you flew to the pointed door while the window is open.
    if (!this._hintTaken && this._gatePos) {
      const player = this._player();
      if (player && player.pos) {
        const dx = player.pos.x - this._gatePos.x;
        const dz = player.pos.z - this._gatePos.z;
        if (dx * dx + dz * dz <= VETERAN_TAP_TUNING.hintRangeWu * VETERAN_TAP_TUNING.hintRangeWu) {
          this._hintTaken = true;
          this._windowsIgnored = 0;
          drone.data.lampsFlashing = true;
          drone.data.lampFlashUntil = now + 1.2;
          this.bus.emit('audio:cue', { id: 'confirm', position: { x: this._gatePos.x, z: this._gatePos.z }, gain: 0.5, rate: 1.3 });
          this.bus.emit(PLANTS_VETERAN_TAP_EVENT, { kind: 'hint_taken', gateId: this._gateId, t: now });
        }
      }
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._despawn('destroy');
    this._retired = false;
    this._retiredReported = false;
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
    this._droneId = null;
    this._gateId = null;
    this._gatePos = null;
    this._pilePos = null;
    this._tapTimes = [];
    this._nextTap = 0;
    this._pointAt = 0;
    this._pointed = false;
    this._hintTaken = false;
    this._expiresAt = 0;
    this._voiceUsed = false;
    this._windowsIgnored = 0;
  },

  _reset() {
    this._despawn(); // run end despawns the owned prop (header contract), like round start and destroy
    this._resetRun();
    this._retired = false;
    this._retiredReported = false;
  },

  _despawn() {
    if (this._droneId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._droneId);
    }
    this._droneId = null;
  },

  _closeWindow() {
    if (this._droneId == null && !this._windowWasOpen) return;
    this._windowWasOpen = false;
    if (!this._hintTaken && this._droneId != null) {
      this._windowsIgnored += 1;
      if (this._windowsIgnored >= 2) {
        this._retired = true; // the drone picks somebody else to help
        this.bus.emit(PLANTS_VETERAN_TAP_EVENT, {
          kind: 'picked_somebody_else', ignoredWindows: this._windowsIgnored, t: this._now(),
        });
      }
    }
    this._despawn();
  },

  _onTransitioned(payload) {
    const run = this._liveRun();
    if (!run) return;
    const phase = payload && payload.phase;
    if (!VETERAN_TAP_TUNING.betweenRoundPhases.includes(phase)) return this._closeWindow();
    if (this._retired) {
      if (!this._retiredReported) {
        this._retiredReported = true;
        this.bus.emit(PLANTS_VETERAN_TAP_EVENT, {
          kind: 'picked_somebody_else', retired: true, t: this._now(),
        });
      }
      return;
    }
    if (this._droneId != null) return; // one drone per window
    const player = this._player();
    if (!player || !player.pos) return;
    const gate = this._findGate(player.pos);
    const pile = this._findPile(player.pos);
    if (!gate && !pile) return; // honestly inert: nothing to point at
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const side = droneSideFor(run.seed);
    const spawned = spawnEntity({
      type: 'debris',
      pos: { x: player.pos.x + side.x * 70, z: player.pos.z + side.z * 70 },
      vel: { x: 0, z: 0 },
      radius: VETERAN_TAP_TUNING.droneRadiusWu,
      hull: VETERAN_TAP_TUNING.droneHull,
      collides: true,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: 'the veteran drone',
        swarmFloorPad: { label: 'THE VETERAN' },
        plants: { [VETERAN_TAP_TUNING.plId]: { role: 'veteran_drone' } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    const now = this._now();
    this._droneId = id;
    this._gateId = gate ? gate.id : null;
    this._gatePos = gate && gate.pos ? { x: gate.pos.x, z: gate.pos.z } : null;
    this._pilePos = pile && pile.pos ? { x: pile.pos.x, z: pile.pos.z } : null;
    this._tapTimes = [
      now + VETERAN_TAP_TUNING.firstTapDelayS,
      now + VETERAN_TAP_TUNING.firstTapDelayS + VETERAN_TAP_TUNING.tapGapS,
    ];
    this._nextTap = 0;
    this._pointAt = now + VETERAN_TAP_TUNING.pointDelayS;
    this._pointed = false;
    this._hintTaken = false;
    this._expiresAt = now + VETERAN_TAP_TUNING.droneTtlS;
    this._windowWasOpen = true;
    this.bus.emit(PLANTS_VETERAN_TAP_EVENT, {
      kind: 'tapping', droneId: id, gateId: this._gateId, t: now,
    });
  },

  /** The nearest gate solid to the pilot within the scan cap (min distance, not first found). */
  _findGate(playerPos) {
    if (!playerPos) return null;
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return null;
    let best = null;
    let bestSq = Infinity;
    let scanned = 0;
    for (const e of entities.values()) {
      if (scanned >= VETERAN_TAP_TUNING.scanCap) break;
      scanned += 1;
      const d = e && e.data;
      if (!e || e.alive === false || !e.pos || !d) continue;
      if (d.roomKind !== 'gate') continue; // room solids stamp roomKind (survivalArena.js:2236)
      const dx = e.pos.x - playerPos.x;
      const dz = e.pos.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestSq) { best = e; bestSq = distSq; }
    }
    return best;
  },

  _findPile(pos) {
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return null;
    const candidates = [];
    let scanned = 0;
    for (const e of entities.values()) {
      if (scanned >= VETERAN_TAP_TUNING.scanCap * 2) break;
      scanned += 1;
      if (!e || e.type !== 'pickup' || e.alive === false) continue;
      candidates.push(e);
      if (candidates.length >= 8) break;
    }
    const pile = nearestPile(candidates, pos);
    return pile;
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
