// PL-327 The open door — "On the last round before a boss, one random door stands open and paid,
// a chalk arrow beside it. Use the gift; or wait for two — the arrow moves on, and the door shuts."
//
// The between-round window whose next wave is a boss (the ladder's own pure `isSwarmBossWave` —
// src/data/swarmMode.js:825) opens exactly one door: a plant-owned prop by the gate solid picked
// deterministically from the floor's gates (hash32 over the run seed and the window ordinal),
// open and paid, with a chalk-arrow prop beside it. Fly into the door and you have used the gift.
// Hover near it hoping a second will open and the patience runs out; reach the window's end
// without using the door and it shuts — and the arrow moves on: the NEXT boss-eve window opens
// nothing. A used gift costs nothing and never touches state.run.
//
// Invariants:
// - Deterministic: state.simTime / hash32 only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - Door and arrow are plant-owned props; despawned on round start, run end and destroy.
// - Bounded state; one door per window; per-run reset on run:ended.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { isSwarmBossWave } from '../../data/swarmMode.js';
import { hash32 } from '../../core/rng.js';

export const PLANTS_OPEN_DOOR_EVENT = 'plants:openDoor';

export const OPEN_DOOR_TUNING = Object.freeze({
  plId: 'pl327',
  betweenRoundPhases: Object.freeze(['cleanup', 'refit', 'draft']),
  doorTtlS: 22,
  useRangeWu: 55,
  patienceS: 10,             // "wait for two" — hovering this long counts the wish
  doorOffsetWu: 60,
  arrowOffsetWu: 30,         // the chalk sits between you and the door
  doorRadiusWu: 14,
  doorHull: 800,
  arrowRadiusWu: 5,
  arrowHull: 80,
  scanCap: 16,
  memoryCap: 8,
});

/** Pure: pick which gate gets the door — deterministic per seed and window ordinal. */
export function pickGateIndex(seed, ordinal, gateCount) {
  if (!Number.isFinite(gateCount) || gateCount <= 0) return -1;
  return hash32(String(seed), 'pl327', ordinal) % gateCount;
}

/** Pure: the window's verdict. */
export function doorVerdict(used, tuning = OPEN_DOOR_TUNING) {
  return used ? 'gift_used' : 'door_shut';
}

export const openDoorPlant = {
  modes: ['swarm'],
  name: 'plants327',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._resetRun();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:transitioned', (p) => this._onTransitioned(p));
    on('run:waveStarted', () => this._closeWindow());
    on('run:ended', () => this._reset());
  },

  update(dt) {
    const run = this._liveRun();
    if (!run || this._doorId == null) return;
    const now = this._now();
    if (now >= this._expiresAt) return this._closeWindow();
    const player = this._player();
    if (!player || !player.pos) return;
    const dx = player.pos.x - this._doorPos.x;
    const dz = player.pos.z - this._doorPos.z;
    const distSq = dx * dx + dz * dz;
    if (!this._used && distSq <= OPEN_DOOR_TUNING.useRangeWu * OPEN_DOOR_TUNING.useRangeWu) {
      this._used = true;
      const door = this._entity(this._doorId);
      if (door) {
        door.data.lampsFlashing = true;
        door.data.lampFlashUntil = now + 1.2;
      }
      this.bus.emit('audio:cue', { id: 'confirm', position: { x: this._doorPos.x, z: this._doorPos.z }, gain: 0.5, rate: 1.3 });
      this.bus.emit(PLANTS_OPEN_DOOR_EVENT, {
        kind: 'gift_used', doorId: this._doorId, paid: 0, t: now,
      });
    }
    if (!this._patienceSpent && distSq <= OPEN_DOOR_TUNING.useRangeWu * OPEN_DOOR_TUNING.useRangeWu * 4) {
      this._nearTime += finite(dt, 0);
      if (!this._used && this._nearTime >= OPEN_DOOR_TUNING.patienceS) {
        this._patienceSpent = true;
        this.bus.emit(PLANTS_OPEN_DOOR_EVENT, {
          kind: 'waiting_for_two', doorId: this._doorId, t: now,
        });
      }
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._closeWindow();
    this._reset();
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
    this._doorId = null;
    this._arrowId = null;
    this._doorPos = null;
    this._expiresAt = 0;
    this._used = false;
    this._nearTime = 0;
    this._patienceSpent = false;
    this._windowOrdinal = 0;
    this._arrowMovedOn = false;
    this._movedOnReported = false;
  },

  _reset() {
    this._resetRun();
  },

  _closeWindow() {
    const wasOpen = this._doorId != null;
    if (this._doorId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._doorId);
    }
    if (this._arrowId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._arrowId);
    }
    this._doorId = null;
    this._arrowId = null;
    if (!wasOpen) return;
    if (!this._used) {
      // The arrow moves on, and the door shuts: the next boss-eve window opens nothing.
      this._arrowMovedOn = true;
      this.bus.emit(PLANTS_OPEN_DOOR_EVENT, {
        kind: doorVerdict(false), waitedForTwo: this._patienceSpent, t: this._now(),
      });
    }
  },

  _onTransitioned(payload) {
    const run = this._liveRun();
    if (!run) return;
    const phase = payload && payload.phase;
    if (!OPEN_DOOR_TUNING.betweenRoundPhases.includes(phase)) return this._closeWindow();
    if (this._arrowMovedOn) {
      if (!this._movedOnReported) {
        this._movedOnReported = true;
        this.bus.emit(PLANTS_OPEN_DOOR_EVENT, {
          kind: 'arrow_moved_on', t: this._now(),
        });
      }
      return;
    }
    if (!isSwarmBossWave(run.wave + 1)) return; // only the last round before a boss
    if (this._doorId != null) return; // one door per window
    const gates = this._findGates();
    if (gates.length === 0) return;
    const gate = gates[pickGateIndex(run.seed, this._windowOrdinal, gates.length)];
    if (!gate || !gate.pos) return;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const doorPos = {
      x: gate.pos.x + OPEN_DOOR_TUNING.doorOffsetWu,
      z: gate.pos.z + OPEN_DOOR_TUNING.doorOffsetWu,
    };
    const door = spawnEntity({
      type: 'debris',
      pos: doorPos,
      vel: { x: 0, z: 0 },
      radius: OPEN_DOOR_TUNING.doorRadiusWu,
      hull: OPEN_DOOR_TUNING.doorHull,
      collides: true,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: 'the open door',
        swarmFloorPad: { label: 'OPEN — PAID' },
        plants: { [OPEN_DOOR_TUNING.plId]: { role: 'open_door' } },
      },
    });
    const doorId = door && typeof door === 'object' ? door.id : door;
    if (doorId == null) return;
    const arrow = spawnEntity({
      type: 'debris',
      pos: {
        x: gate.pos.x + OPEN_DOOR_TUNING.arrowOffsetWu,
        z: gate.pos.z + OPEN_DOOR_TUNING.arrowOffsetWu,
      },
      vel: { x: 0, z: 0 },
      radius: OPEN_DOOR_TUNING.arrowRadiusWu,
      hull: OPEN_DOOR_TUNING.arrowHull,
      collides: false,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: 'chalk arrow',
        swarmFloorPad: { label: 'CHALK ARROW' },
        plants: { [OPEN_DOOR_TUNING.plId]: { role: 'chalk_arrow' } },
      },
    });
    const arrowId = arrow && typeof arrow === 'object' ? arrow.id : arrow;
    this._doorId = doorId;
    this._arrowId = arrowId != null ? arrowId : null;
    this._doorPos = doorPos;
    this._expiresAt = this._now() + OPEN_DOOR_TUNING.doorTtlS;
    this._used = false;
    this._nearTime = 0;
    this._patienceSpent = false;
    this._windowOrdinal += 1;
    this.bus.emit(PLANTS_OPEN_DOOR_EVENT, {
      kind: 'door_open', doorId, arrowId: this._arrowId, gateId: gate.id, paid: 0, t: this._now(),
    });
  },

  _findGates() {
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return [];
    const gates = [];
    let scanned = 0;
    for (const e of entities.values()) {
      if (scanned >= OPEN_DOOR_TUNING.scanCap * 4 || gates.length >= OPEN_DOOR_TUNING.scanCap) break;
      scanned += 1;
      const d = e && e.data;
      if (!e || e.alive === false || !e.pos || !d) continue;
      if (d.roomKind !== 'gate') continue;
      gates.push(e);
    }
    return gates;
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
