// special500DeathBell.js — SP3-136 "The Bell Tolls for You" (special-500 Phase 2, batch 19,
// counter family).
//
// The real event is the `player:death` receipt the combat owner's defeat path and the world's
// radiation fallback already emit (the same receipt special500ReadEverything reads). On that
// receipt this system does one thing: a single bell toll, spatialized to the NEAREST STATION
// — not to the victim — through the audio owner's generic cue admission (the same seam the
// spectacle registry's bellVoice template uses), once per save:
//
//   death_bell_tolled   simTime — plain-named story flag, written only here, latched before
//                       the emit; a save that already carries it stays quiet (a stale save's
//                       deaths earn no second bell).
//
// The duck is not ours to write: the audio owner's own player-death profile already drains
// the world out slowly on the same receipt (audioSystem.js "Breathless moment" death depth),
// so the toll joins the existing death hush — closure, never a penalty read. The
// "nearest station" needs no new reader: the cue's position field carries the direction and
// the comms log carries the sentence.
//
// Determinism: the nearest-station pick reads the live active-station rows against the
// victim's last position the receipt carries; ties break alphabetically by id. A
// missing station list, a dead world, or a state without story degrades to a no-op bell-less
// death — never a crash.

import { isRunSealed } from '../core/runSeal.js';

export const DEATH_BELL_RECIPE = 'sfx_eighth_bell_toll';

/** Pure nearest-station pick: the station row closest to a point, ties broken by id. */
export function nearestStation(state, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  const active = state && state.world && (state.world.activeSector || state.world.active);
  const rows = (active && active.stations) || [];
  let best = null;
  let bestD = Infinity;
  for (const row of rows) {
    if (!row || !row.pos || !Number.isFinite(row.pos.x) || !Number.isFinite(row.pos.z)) continue;
    const id = typeof row.stationId === 'string' ? row.stationId
      : typeof row.id === 'string' ? row.id : null;
    if (!id) continue;
    const d = Math.hypot(row.pos.x - point.x, row.pos.z - point.z);
    if (d < bestD || (d === bestD && best && id < best.id)) { best = { id, pos: row.pos }; bestD = d; }
  }
  return best;
}

function flagsOf(state) {
  if (!state.story) state.story = { flags: {} };
  if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
  return state.story.flags;
}

export function createSpecial500DeathBell() {
  return {
    name: 'special500DeathBell',

    init(ctx) {
      for (const off of this.off || []) { if (typeof off === 'function') off(); }
      this.state = ctx.state;
      this.bus = ctx.bus || null;
      this.off = this.bus ? [this.bus.on('player:death', (p) => this._onDeath(p || {}))] : [];
    },

    destroy() {
      for (const off of this.off || []) { try { off(); } catch (e) { /* shutdown */ } }
      this.off = [];
      this.state = null;
      this.bus = null;
    },

    _onDeath(payload) {
      const state = this.state;
      const bus = this.bus;
      if (!state || !bus || isRunSealed(state)) return;
      const flags = flagsOf(state);
      if (flags.death_bell_tolled != null) return; // once per save, ever
      // The victim's last position, from the receipt when the combat owner carries it.
      const player = state.entities && state.entities.get(state.playerId);
      const point = payload.pos && Number.isFinite(payload.pos.x) && Number.isFinite(payload.pos.z)
        ? payload.pos : (player && player.pos);
      const station = nearestStation(state, point);
      if (!station) return; // nowhere for the bell to hang: the death stays a death
      flags.death_bell_tolled = Number(state.simTime) || 0;
      // This receipt reaches the existing main-side death presentation owner. It is an
      // occurrence, never a second death or a fabricated gameplay success.
      bus.emit('special500:deathBell', { stationId: station.id, at: flags.death_bell_tolled });
      bus.emit('audio:cue', {
        id: DEATH_BELL_RECIPE,
        gain: 0.9,
        position: { x: station.pos.x, z: station.pos.z },
      });
      bus.emit('comms:log', {
        from: 'Nowhere in particular',
        text: 'Your hull comes apart the way every hull you have watched come apart does — '
          + 'and the nearest station answers through the death hush: a single '
          + 'bell, tolling once, from its direction. Not from you. '
          + 'Somebody was keeping time.',
        kind: 'special500',
      });
    },
  };
}

export const special500DeathBell = createSpecial500DeathBell();
