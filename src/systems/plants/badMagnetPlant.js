// PL-137 Bad magnet — "A Magnet drop pulls every piece of Scrap on the floor to you — plus the
// nearest live barrel. Kiln: *'Tidy. Careful.'*" — Bank it all; or steer, quickly.
//
// The scrap vacuum itself is already owned: the swarm magnet drop opens mining's pull window
// (state.swarmDropMagnetUntil, written by swarmDrops). This plant adds the row's third fact:
// the pull also catches the nearest live barrel. No live-barrel body exists on the floor today
// (the red-barrels row is OPEN), so with none present the row stays honestly silent — no Kiln
// line, no receipt, no cue. When a barrel body exists and a magnet is collected, the nearest
// one gets the pull receipt (once per drop collected); the barrel's velocity belongs to its
// owner, so this is a receipt + lamp stamp, never a motion write.
//
// Invariants:
// - Deterministic: state.simTime only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - One pull receipt per magnet drop collected; bounded Maps (memoryCap).

import { isSwarmRuleset } from '../survivalSwarm.js';

export const PLANTS_BAD_MAGNET_EVENT = 'plants:badMagnet';

export const BAD_MAGNET_TUNING = Object.freeze({
  plId: 'pl137',
  magnetDropId: 'magnet',       // src/data/swarmDrops.js SWARM_DROP rows
  barrelRangeWu: 1200,          // "nearest live barrel" search radius around the player
  barrelScanCap: 96,            // bounded entity scan
  pullReceiptTtlS: 4,
  memoryCap: 16,                // handled drop ids
});

export const BAD_MAGNET_KILN_LINE = 'Tidy. Careful.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: does this entity read as a live floor barrel? (Red barrels are the hazard owner's body.) */
export function isLiveBarrel(entity) {
  if (!entity || entity.alive === false || !entity.pos) return false;
  const d = entity.data || {};
  return d.kind === 'barrel' || d.barrel === true || entity.type === 'barrel';
}

/** Pure: nearest live barrel to a position within range, scanning a bounded list. */
export function nearestBarrel(candidates, pos, rangeWu = BAD_MAGNET_TUNING.barrelRangeWu) {
  if (!pos || !Array.isArray(candidates)) return null;
  let best = null;
  let bestSq = rangeWu * rangeWu;
  for (const e of candidates) {
    if (!isLiveBarrel(e)) continue;
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

export const badMagnetPlant = {
  name: 'plants137',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._handledDrops = new Map(); // drop id -> true (bounded)
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('swarm:dropCollected', (p) => this._onDropCollected(p));
    on('run:ended', () => this._reset());
    on('save:loaded', () => this._reset());
  },

  update() { /* event-driven; no polling needed */ },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    if (this._handledDrops) this._handledDrops.clear();
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

  _reset() {
    if (this._handledDrops) this._handledDrops.clear();
  },

  _onDropCollected(payload) {
    const run = this._liveRun();
    if (!run) return;
    if (!payload || payload.dropId !== BAD_MAGNET_TUNING.magnetDropId) return;
    // One pull per magnet drop collected (keyed by the drop's own id, not the run).
    const key = `${run.seed}:${payload.id != null ? payload.id : 'drop'}`;
    if (this._handledDrops.has(key)) return;
    // The nearest live barrel joins the pull. No barrel body on the floor -> the row is silent.
    const player = this._player();
    const origin = (player && player.pos) || null;
    let barrel = null;
    if (origin) {
      const entities = this.state.entities;
      if (entities && typeof entities.values === 'function') {
        const candidates = [];
        let scanned = 0;
        for (const e of entities.values()) {
          if (scanned >= BAD_MAGNET_TUNING.barrelScanCap) break;
          scanned += 1;
          if (!isLiveBarrel(e)) continue;
          candidates.push(e);
          if (candidates.length >= 8) break;
        }
        barrel = nearestBarrel(candidates, origin, BAD_MAGNET_TUNING.barrelRangeWu);
      }
    }
    if (!barrel) return; // honestly inert until a barrel body exists
    this._handledDrops.set(key, true);
    while (this._handledDrops.size >= BAD_MAGNET_TUNING.memoryCap) {
      this._handledDrops.delete(this._handledDrops.keys().next().value);
    }
    const now = this._now();
    this.bus.emit('voice:say', {
      channel: 'comms', id: 'plants:pl137:kiln', text: BAD_MAGNET_KILN_LINE, ttl: 5,
    });
    barrel.data = barrel.data || {};
    barrel.data.lampsFlashing = true;
    barrel.data.lampFlashUntil = now + BAD_MAGNET_TUNING.pullReceiptTtlS;
    this.bus.emit('audio:cue', { id: 'confirm', position: origin, gain: 0.6, rate: 1 });
    this.bus.emit(PLANTS_BAD_MAGNET_EVENT, {
      kind: 'barrel_pulled',
      barrelId: barrel.id,
      playerPos: origin ? { x: origin.x, z: origin.z } : null,
      t: now, wave: run.wave,
    });
  },
};
