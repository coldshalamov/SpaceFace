// stationBroadcast.js — BP-11 packet A5 "Station Broadcasts" (ENRICH — see
// design/revamp/detail/A_sector_station.md packet A5).
//
// Stations feel awake: a refinery vents, a research dish sweeps, a smuggler cache pings low and
// furtive — type-appropriate ambient flavor in the faction's voice, WITHOUT ever talking over the
// mission. Doctrine pillar: world-was-here + one-voice.
//
// This is a SYSTEMS-only entry that is NOT in UPDATE_ORDER's gameplay path: it is cosmetic-only
// and fully `typeof window`-guarded. The evaluation timer is a window.setInterval — headless sim
// never installs it, so the module is a strict silent no-op in every deterministic harness
// (golden telemetry untouched). Nothing here writes sim state.
//
// One-voice contract (THE packet failureMode — chatter):
//   * Routes through ctx.helpers.voice.say({channel:'ambient', priority: AMBIENT_PRIORITY}).
//     voiceArbiter has no 'ambient' channel default (unknown channels fall back to info=10), so
//     the explicit numeric priority 1 makes ambient STRICTLY lowest: it can never preempt any
//     floor holder (arbiter preempts only on strictly-higher priority), and every other channel
//     preempts it. voiceArbiter.js is noTouch — the override is the sanctioned `say` parameter.
//   * Emitter-side yield: skips entirely while the arbiter has ANY active/queued voice (read-only
//     peek via ctx.registry.get('voiceArbiter').queue), so ambient lines don't even queue behind
//     mission comms.
//   * Combat-silenced: any `combat:damage` involving the player opens a silence window
//     (COMBAT_SILENCE_S) — never emits during a fight, stays quiet just after one.
//   * Rate cap ≤1 line / CADENCE_S (~20 s), timed on state.simTime.
//   * No station within NEAR_RANGE → strict no-op. state.mode !== 'flight' → strict no-op.
//
// rng (packet contract): Math.random is allowed ONLY for cosmetic line variety and ONLY inside a
// `typeof window` guard — headless callers (the check) always get lines[0], and no broadcast ever
// affects sim state.
//
// Visual tic handoff: the cosmetic VFX tic (vent flare / dish sweep) belongs to the render layer,
// and src/render/** + vfx.js are graphics/perf-lane-owned (AGENTS §10; release.__building/ active).
// This module emits the additive seam `station:broadcastTic` {stationId, stationTypeId, tic, pos}
// alongside each spoken line (same gates → significance-gated: zero draw cost in a fight). The
// render lane subscribes and draws the tic; until then the line alone carries the read.
//
// noTouch honored: world.js / voiceArbiter.js / combat.js / render root are never edited.

/** Explicit numeric priority for ambient lines — strictly below every CHANNEL_PRIORITY default. */
export const AMBIENT_PRIORITY = 1;
/** Min gap between ambient lines (seconds, state.simTime). */
export const CADENCE_S = 20;
/** Silence window after any player-involved combat:damage (seconds). */
export const COMBAT_SILENCE_S = 12;
/** A station must be within this range of the player to count as "visible" (world units). */
export const NEAR_RANGE = 700;
/** Wall-clock evaluation cadence for the cosmetic timer (ms) — gates re-check on each fire. */
const TICK_MS = 5000;
const LINE_TTL_S = 6;

/** stationTypeId → { tic, lines[] }. Type-appropriate flavor; faction character rides on the
 *  say() factionId attribution. Pure data, headless-testable. */
export const STATION_BROADCASTS = {
  trade_hub: {
    tic: 'gantry_cycle',
    lines: [
      'Dock control: keep the approach lanes clear — outbound convoy in the pattern.',
      'Berth advisory: transfer gantries cycling on ring two.',
    ],
  },
  refinery: {
    tic: 'vent_flare',
    lines: [
      'Refinery control: venting slag pressure — stand clear of the flare stacks.',
      'Ore intake: hopper doors cycling. Watch the tailings drift.',
    ],
  },
  mining: {
    tic: 'charge_flash',
    lines: [
      'Claim office: survey charges scheduled on the north seam.',
      'Belt crew rotation in progress — tugs crossing the approach.',
    ],
  },
  fab: {
    tic: 'weld_bloom',
    lines: [
      'Foundry deck: casting run in progress. Expect thermal bloom.',
      'Assembly control: module cradle rotating on the outer frame.',
    ],
  },
  military: {
    tic: 'beacon_strobe',
    lines: [
      'Perimeter watch: transponders on, weapons cold inside the ring.',
      'Patrol wing cycling through the launch cage — hold your vector.',
    ],
  },
  blackmarket: {
    tic: 'low_ping',
    lines: [
      'No manifests. No questions. Keep your lights low.',
      'Berth is open. Coin first. You were never here.',
    ],
  },
  research: {
    tic: 'dish_sweep',
    lines: [
      'Array sweep in progress — mind the dish arc.',
      'Telemetry burst scheduled. Expect sensor wash on the low band.',
    ],
  },
};

/** Nearest live station entity within `range` of the player, or null. Read-only over state. */
export function nearestVisibleStation(state, range = NEAR_RANGE) {
  if (!state) return null;
  const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos) return null;
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  let best = null;
  let bestD2 = range * range;
  for (const e of list) {
    if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= bestD2) { bestD2 = d2; best = e; }
  }
  return best;
}

export const stationBroadcast = {
  name: 'stationBroadcast',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    this._lastSayAt = -Infinity;     // state.simTime of the last ambient line (rate cap)
    this._lastCombatAt = -Infinity;  // state.simTime of the last player-involved combat:damage
    this._onDamage = (p) => {
      const state = this._state;
      if (!state || !p) return;
      if (p.targetId === state.playerId || p.attackerId === state.playerId) {
        this._lastCombatAt = state.simTime || 0;
      }
    };
    if (this._bus && this._bus.on) this._bus.on('combat:damage', this._onDamage);
    // Cosmetic-only timer: never installed headless — the whole system is silent without window.
    this._timer = null;
    if (typeof window !== 'undefined') {
      this._timer = window.setInterval(() => this._tick(), TICK_MS);
    }
  },

  newGame() {
    this._lastSayAt = -Infinity;
    this._lastCombatAt = -Infinity;
  },

  /** True while the arbiter has ANY active or queued voice — ambient yields to all of it. */
  _voiceFloorBusy() {
    const registry = this._ctx && this._ctx.registry;
    const arb = registry && registry.get ? registry.get('voiceArbiter') : null;
    const q = arb && arb.queue;
    if (!q) return false;
    if (q.active) return true;
    const pending = q.pending;
    return Array.isArray(pending) ? pending.length > 0 : false;
  },

  // One evaluation pass. All gates re-checked every fire; every early return is a strict no-op
  // (no state writes, no voice, no events). Exposed for the headless acceptance check, which
  // drives it directly — in play only the window interval calls it.
  _tick() {
    const state = this._state;
    if (!state || state.mode !== 'flight') return;
    const now = state.simTime || 0;

    if ((now - this._lastCombatAt) < COMBAT_SILENCE_S) return;   // in/just-after combat → silent
    if (this._voiceFloorBusy()) return;                          // anything speaking/queued → yield
    if ((now - this._lastSayAt) < CADENCE_S) return;             // rate cap ≤1 / ~20 s

    const station = nearestVisibleStation(state, NEAR_RANGE);
    if (!station) return;                                        // no visible station → no-op
    const data = station.data || {};
    const def = STATION_BROADCASTS[data.stationTypeId];
    if (!def || !def.lines.length) return;

    // Cosmetic line variety only — Math.random stays inside the window guard (headless → lines[0]).
    const roll = typeof window !== 'undefined' ? Math.random() : 0;
    const text = def.lines[Math.min(def.lines.length - 1, Math.floor(roll * def.lines.length))];

    const helpers = (this._ctx && this._ctx.helpers) || {};
    if (!helpers.voice || typeof helpers.voice.say !== 'function') return;
    helpers.voice.say({
      channel: 'ambient', text, kind: 'stationBroadcast',
      factionId: data.factionId || null, priority: AMBIENT_PRIORITY, ttl: LINE_TTL_S,
    });
    this._lastSayAt = now;

    // Additive VFX seam for the graphics lane (render half handed off — see header).
    if (this._bus && this._bus.emit) {
      this._bus.emit('station:broadcastTic', {
        stationId: data.stationId || null, stationTypeId: data.stationTypeId,
        tic: def.tic, pos: station.pos ? { x: station.pos.x, z: station.pos.z } : null,
      });
    }
  },

  destroy() {
    if (this._timer != null && typeof window !== 'undefined') window.clearInterval(this._timer);
    this._timer = null;
    if (this._bus && this._bus.off && this._onDamage) this._bus.off('combat:damage', this._onDamage);
    this._onDamage = null;
  },
};

export default stationBroadcast;
