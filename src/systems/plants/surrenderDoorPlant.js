// PL-330 The surrender door — "Outgunned past hope in the first minute, a side door opens — no
// taunt, no toll, an exit that never touches your record. Leave with your hull; or exit-camp for
// pity doors — the floor stops opening them for your hull."
//
// Inside a round's first minute (sim time since run:waveStarted), when your hull fraction reads
// desperate (<= desperateFraction), a side door opens near your hull: a plant-owned prop stamped
// SURRENDER — FREE, silent (no taunt voice, no toll, no cue). Stage at it for a held beat and you
// have left with your hull — the receipt is the record; the real exit stays the ordinary route,
// and the plant never touches run state. The door shuts after its beat. Hang around the shut
// door's spot hoping for pity doors without staging, and the loiter counts: past the camp limit
// the floor stops opening doors for your hull for the rest of the run.
//
// Invariants:
// - Deterministic: state.simTime / hash32 only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - The door is a plant-owned prop; despawned on ttl, round start, run end and destroy.
// - Bounded state; one door per round; per-run reset on run:ended.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { hash32 } from '../../core/rng.js';

export const PLANTS_SURRENDER_DOOR_EVENT = 'plants:surrenderDoor';

export const SURRENDER_DOOR_TUNING = Object.freeze({
  plId: 'pl330',
  firstMinuteS: 60,
  desperateFraction: 0.2,    // "outgunned past hope"
  doorTtlS: 25,
  stageRangeWu: 48,
  stageHoldS: 2,
  campRangeWu: 64,
  campLimitS: 15,            // loitering past this reads as exit-camping
  doorOffsetWu: 150,
  doorRadiusWu: 14,
  doorHull: 700,
  scanThrottleS: 0.5,
  memoryCap: 8,
});

/** Pure: does this hull, this early, read as outgunned past hope? */
export function desperate(hullFraction, roundAgeS, tuning = SURRENDER_DOOR_TUNING) {
  return hullFraction <= tuning.desperateFraction && roundAgeS >= 0 && roundAgeS <= tuning.firstMinuteS;
}

/** Pure: the floor's verdict on your door habits. */
export function campVerdict(loiterS, staged, tuning = SURRENDER_DOOR_TUNING) {
  if (staged) return 'left_with_hull';
  return loiterS >= tuning.campLimitS ? 'doors_closed' : 'watching';
}

/** Pure: where the side door opens — deterministic per run seed. */
export function doorOffsetFor(seed, tuning = SURRENDER_DOOR_TUNING) {
  const angle = (hash32(String(seed), tuning.plId, 'side') % 6283) / 1000;
  return { x: Math.cos(angle) * tuning.doorOffsetWu, z: Math.sin(angle) * tuning.doorOffsetWu };
}

export const surrenderDoorPlant = {
  modes: ['swarm'],
  name: 'plants330',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._resetRun();
    this._camped = false;
    this._closedReported = false;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:waveStarted', (p) => this._onWaveStarted(p));
    on('run:ended', () => this._reset());
  },

  update() {
    const run = this._liveRun();
    if (!run) return;
    const now = this._now();
    if (now < this._nextScanAt) return;
    this._nextScanAt = now + SURRENDER_DOOR_TUNING.scanThrottleS;
    const player = this._player();
    if (!player || !player.pos) return;
    if (this._doorId != null) {
      const door = this._entity(this._doorId);
      if (!door || door.alive === false || now >= this._expiresAt) {
        this._shutDoor('ttl');
      } else {
        const dx = player.pos.x - this._doorPos.x;
        const dz = player.pos.z - this._doorPos.z;
        if (dx * dx + dz * dz <= SURRENDER_DOOR_TUNING.stageRangeWu * SURRENDER_DOOR_TUNING.stageRangeWu) {
          this._stageTime += SURRENDER_DOOR_TUNING.scanThrottleS;
          if (!this._staged && this._stageTime >= SURRENDER_DOOR_TUNING.stageHoldS) {
            this._staged = true;
            this.bus.emit('audio:cue', { id: 'confirm', position: { x: this._doorPos.x, z: this._doorPos.z }, gain: 0.45, rate: 1.1 });
            this.bus.emit(PLANTS_SURRENDER_DOOR_EVENT, {
              kind: 'surrender_staged', doorId: this._doorId, record: 'untouched', t: now,
            });
          }
        }
        return;
      }
    }
    if (this._camped) return; // the floor stopped opening them for your hull
    // Loitering where the last door stood, without staging: exit-camping.
    if (this._lastDoorPos && !this._staged) {
      const dx = player.pos.x - this._lastDoorPos.x;
      const dz = player.pos.z - this._lastDoorPos.z;
      if (dx * dx + dz * dz <= SURRENDER_DOOR_TUNING.campRangeWu * SURRENDER_DOOR_TUNING.campRangeWu) {
        this._loiterTime += SURRENDER_DOOR_TUNING.scanThrottleS;
        if (campVerdict(this._loiterTime, this._staged) === 'doors_closed') {
          this._camped = true;
          this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.4, rate: 0.9 });
          this.bus.emit(PLANTS_SURRENDER_DOOR_EVENT, {
            kind: 'doors_closed_for_you', loiterS: this._loiterTime, t: now,
          });
          return;
        }
      }
    }
    if (this._doorOpenedThisRound || run.phase !== 'active') return;
    const max = Number.isFinite(player.hullMax) && player.hullMax > 0 ? player.hullMax : 0;
    const hull = Number.isFinite(player.hull) ? player.hull : max;
    const roundAge = now - this._roundStartSim;
    if (max <= 0 || !desperate(hull / max, roundAge)) return;
    this._openDoor(player, run);
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._shutDoor('destroy');
    this._camped = false;
    this._closedReported = false;
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
    this._roundStartSim = 0;
    this._doorId = null;
    this._doorPos = null;
    this._lastDoorPos = null;
    this._expiresAt = 0;
    this._doorOpenedThisRound = false;
    this._staged = false;
    this._stageTime = 0;
    this._loiterTime = 0;
    this._nextScanAt = 0;
  },

  _reset() {
    this._resetRun();
    this._camped = false;
    this._closedReported = false;
  },

  _shutDoor() {
    if (this._doorId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._doorId);
    }
    if (this._doorPos) this._lastDoorPos = this._doorPos;
    this._doorId = null;
    this._stageTime = 0;
    this._staged = false;
  },

  _onWaveStarted(payload) {
    const run = this._liveRun();
    this._shutDoor();
    if (!run) return;
    this._roundStartSim = this._now();
    this._doorOpenedThisRound = false;
  },

  _openDoor(player, run) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const offset = doorOffsetFor(run.seed);
    const doorPos = { x: player.pos.x + offset.x, z: player.pos.z + offset.z };
    const spawned = spawnEntity({
      type: 'debris',
      pos: doorPos,
      vel: { x: 0, z: 0 },
      radius: SURRENDER_DOOR_TUNING.doorRadiusWu,
      hull: SURRENDER_DOOR_TUNING.doorHull,
      collides: true,
      // No taunt, no toll: silent, free, and it never touches the run's record.
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: 'the surrender door',
        swarmFloorPad: { label: 'SURRENDER — FREE' },
        plants: { [SURRENDER_DOOR_TUNING.plId]: { role: 'surrender_door' } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._doorId = id;
    this._doorPos = doorPos;
    this._expiresAt = this._now() + SURRENDER_DOOR_TUNING.doorTtlS;
    this._doorOpenedThisRound = true;
    this._staged = false;
    this._stageTime = 0;
    this.bus.emit(PLANTS_SURRENDER_DOOR_EVENT, {
      kind: 'door_open', doorId: id, pos: { x: doorPos.x, z: doorPos.z }, toll: 0, wave: run.wave, t: this._now(),
    });
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
