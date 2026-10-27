// stationBroadcast.js — BP-11 packet A5 "Station Broadcasts" (ENRICH — see
// design/revamp/detail/A_sector_station.md packet A5).
//
// Stations feel awake: a refinery vents, a research dish sweeps, a smuggler cache pings low and
// furtive — type-appropriate ambient flavor in the faction's voice, WITHOUT ever talking over the
// mission. Doctrine pillar: world-was-here + one-voice.
//
// This is a SYSTEMS-only entry that is NOT in UPDATE_ORDER's gameplay path: it is cosmetic-only
// Browser-main uses window.setInterval; the production worker uses the existing economy:tick
// cadence. Ordinary headless sims install neither (golden telemetry untouched). The worker
// is identified by its existing mobileSeams lane marker, not by the absence of a DOM alone.
// Nothing here writes sim state.
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
// rng (packet contract): line variety is drawn from a DERIVED seeded stream —
// hash32(runSeed, stationId, cadenceBucket) — never Math.random, and never from the shared
// state.rng() stream. The earlier contract allowed Math.random inside a `typeof window` guard so that
// headless callers always read lines[0]; the acceptance check drives _tick() directly, so that guard
// was load-bearing for the check while leaving the BROWSER unreproducible — two captures of the same
// seed at the same station could speak different lines, which is the one property visual and route
// evidence depends on. The derived stream is reproducible for both callers. hash32 rather than
// state.rng() specifically because drawing from the shared stream would advance it and move the
// replay hash for a cosmetic voice line. No broadcast writes sim state.
//
// Visual tic handoff: the cosmetic VFX tic (vent flare / dish sweep) belongs to the render layer,
// and src/render/** + vfx.js are graphics/perf-lane-owned (AGENTS §10; release.__building/ active).
// This module emits the additive seam `station:broadcastTic` {stationId, stationTypeId, tic, pos}
// alongside each spoken line (same gates → significance-gated: zero draw cost in a fight). The
// render lane subscribes and draws the tic; until then the line alone carries the read.
//
// noTouch honored: world.js / voiceArbiter.js / combat.js / render root are never edited.

import { hash32 } from '../core/rng.js';
import { ilexGreenhouseBroadcast } from '../data/ilexGreenhouse.js';

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
 *  say() factionId attribution. Pure data, headless-testable.
 *  Lines with {callsign} or {role} name a live in-sector traffic hull. They are skipped when
 *  no such hull is present — the desk never invents a name and never addresses the player. */
export const STATION_BROADCASTS = {
  trade_hub: {
    tic: 'gantry_cycle',
    lines: [
      'Dock control: keep the approach lanes clear — outbound convoy in the pattern.',
      'Berth advisory: transfer gantries cycling on ring two.',
      'Dock control: {callsign} is in the pattern. Gantries hold for that hull.',
      'Berth advisory: {role} on the outbound ring. Transfer waits on that hull.',
    ],
  },
  refinery: {
    tic: 'vent_flare',
    lines: [
      'Refinery control: venting slag pressure — stand clear of the flare stacks.',
      'Ore intake: hopper doors cycling. Watch the tailings drift.',
      'Refinery control: {callsign} is clear of the flare stack.',
      'Ore intake: {role} crossing the tailings. Hopper doors stay on their cycle.',
    ],
  },
  mining: {
    tic: 'charge_flash',
    lines: [
      'Claim office: survey charges scheduled on the north seam.',
      'Belt crew rotation in progress — tugs crossing the approach.',
      'Claim office: {callsign} is on the north seam. Charges wait.',
      'Belt crew: {role} crossing the approach. Tugs keep their own lane.',
    ],
  },
  fab: {
    tic: 'weld_bloom',
    lines: [
      'Foundry deck: casting run in progress. Expect thermal bloom.',
      'Assembly control: module cradle rotating on the outer frame.',
      'Foundry deck: {callsign} is off the cradle. Casting run continues.',
      'Assembly control: {role} holding outside the frame.',
    ],
  },
  military: {
    tic: 'beacon_strobe',
    lines: [
      'Perimeter watch: transponders on, weapons cold inside the ring.',
      'Patrol wing cycling through the launch cage — hold your vector.',
      'Perimeter watch: {callsign} reads cold inside the ring.',
      'Patrol wing: {role} cycling the launch cage. Vectors hold.',
    ],
  },
  blackmarket: {
    tic: 'low_ping',
    lines: [
      'No manifests. No questions. Keep your lights low.',
      'Berth is open. Coin first. You were never here.',
      '{callsign} is on the pad. Lights stay low.',
      '{role} paid. No manifest.',
    ],
  },
  research: {
    tic: 'dish_sweep',
    lines: [
      'Array sweep in progress — mind the dish arc.',
      'Telemetry burst scheduled. Expect sensor wash on the low band.',
      'Array sweep: {callsign} is outside the dish arc.',
      'Telemetry: {role} on the low band. Sensor wash is scheduled.',
    ],
  },
};

function textField(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed || '';
}

function hullCallsign(entity) {
  return textField(entity && entity.data && entity.data.callsign);
}

function hullRole(entity) {
  const data = entity && entity.data;
  if (!data) return '';
  return textField(data.trafficLabel) || textField(data.trafficRole) || textField(data.role);
}

function hullInSector(state, entity) {
  const here = state && state.world && state.world.currentSectorId;
  const home = entity && (entity.homeSectorId || (entity.data && entity.data.homeSectorId));
  if (here && home && here !== home) return false;
  return true;
}

/** Live traffic hulls in the current sector, excluding the player. Sorted by id. */
export function liveTrafficHulls(state) {
  const out = [];
  const entities = state && state.entities;
  if (!entities || typeof entities.values !== 'function') return out;
  for (const entity of entities.values()) {
    if (!entity || entity.alive === false) continue;
    if (state.playerId != null && entity.id === state.playerId) continue;
    if (entity.type && entity.type !== 'ship') continue;
    if (!hullInSector(state, entity)) continue;
    if (!hullCallsign(entity) && !hullRole(entity)) continue;
    out.push(entity);
  }
  out.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return out;
}

function fillBroadcastLine(line, hull) {
  if (typeof line !== 'string' || !line) return null;
  const needsCallsign = line.includes('{callsign}');
  const needsRole = line.includes('{role}');
  if (!needsCallsign && !needsRole) return line;
  if (!hull) return null;
  const callsign = hullCallsign(hull);
  const role = hullRole(hull);
  if (needsCallsign && !callsign) return null;
  if (needsRole && !role) return null;
  return line.replaceAll('{callsign}', callsign).replaceAll('{role}', role);
}

function pickBroadcastLine(lines, roll, hull) {
  if (!lines || !lines.length) return null;
  const start = Math.min(lines.length - 1, Math.floor(roll * lines.length));
  for (let step = 0; step < lines.length; step++) {
    const filled = fillBroadcastLine(lines[(start + step) % lines.length], hull);
    if (filled) return filled;
  }
  return null;
}

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
    // Dockless station bodies run no broadcast desk.
    if (e.data && e.data.dockless === true) continue;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= bestD2) { bestD2 = d2; best = e; }
  }
  return best;
}

/** True while the staged first-hour tutorial owns the voice channel (spec2/00 one-voice). */
export function isOnboardingActive(state) {
  const ob = state && state.onboarding;
  return !!(ob && ob.active && !ob.finished);
}

export const stationBroadcast = {
  name: 'stationBroadcast',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    // Only a presentation latch. Continue may recap the restored facts once locally; nothing
    // is persisted, queued globally, or inferred from an event arriving before its domain view.
    this._ilexBroadcastId = null;
    this._ilexPending = null;
    this._ilexVoiceId = null;
    this._ilexAttempt = this._ilexAttempt || 0;
    this._restoring = false;
    this._onSurface = (p) => {
      const pending = this._ilexPending;
      if (this._restoring || !pending || p?.id !== pending.voiceId
        || p.text !== pending.text || p.channel !== 'ambient') return;
      this._lastSayAt = Math.max(this._lastSayAt, this._state?.simTime || 0);
      this._ilexBroadcastId = pending.factId;
      this._ilexPending = null;
    };
    this._bus?.on?.('voice:surface', this._onSurface);
    this._onRestoring = () => {
      this._restoring = true;
      this._cancelIlex();
    };
    this._onLoaded = () => { this.newGame(); };
    this._onRestoreError = () => { if (this._restoring) this.newGame(); };
    this._bus?.on?.('save:restoring', this._onRestoring);
    this._bus?.on?.('save:loaded', this._onLoaded);
    this._bus?.on?.('save:error', this._onRestoreError);
    this._bus?.on?.('game:newGame', this._onLoaded);
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
    // Exactly one clock. The worker already owns the voice arbiter and bridges its receipts;
    // window-only polling left this entire owner silent on the default worker route.
    this._onEconomyTick = null;
    if (typeof window === 'undefined' && ctx?.helpers?.mobileSeams?.lane === 'worker'
      && this._state?.runtime?.profileId === 'production') {
      this._onEconomyTick = () => this._tick();
      this._bus?.on?.('economy:tick', this._onEconomyTick);
    }
    // Ordinary headless simulations still install neither clock.
    this._timer = null;
    if (typeof window !== 'undefined' && ctx?.simLane !== 'worker') {
      this._timer = window.setInterval(() => this._tick(), TICK_MS);
    }
  },

  _cancelIlex() {
    // Drop the pending receipt before cancellation can synchronously flush the arbiter.
    this._ilexPending = null;
    if (this._ilexVoiceId) this._ctx.helpers?.voice?.cancel?.(this._ilexVoiceId);
    this._ilexVoiceId = null;
  },

  newGame() {
    this._cancelIlex();
    this._ilexBroadcastId = null;
    this._restoring = false;
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
  // drives it directly — in play the selected browser/worker cadence calls it.
  _tick() {
    const state = this._state;
    if (!state || this._restoring || state.mode !== 'flight') return;
    // One-voice: yield the channel entirely while the first-hour tutorial is active.
    // Cosmetic only — no sim writes; speech resumes after tutorial completion.
    if (isOnboardingActive(state)) return;
    const now = state.simTime || 0;

    if ((now - this._lastCombatAt) < COMBAT_SILENCE_S) return;   // in/just-after combat → silent
    if (this._voiceFloorBusy()) return;                          // anything speaking/queued → yield
    if ((now - this._lastSayAt) < CADENCE_S) return;             // rate cap ≤1 / ~20 s

    const station = nearestVisibleStation(state, NEAR_RANGE);
    if (!station) return;                                        // no visible station → no-op
    const data = station.data || {};
    const latchLine = latchNineGuidanceLine(state, station);
    if (latchLine) {
      const said = this._ctx.helpers?.voice?.say({ id: 'latch-nine:guidance', channel: 'ambient', priority: AMBIENT_PRIORITY, text: latchLine, ttl: LINE_TTL_S });
      if (said !== false) this._lastSayAt = now;
      return;
    }
    // The existing bounded greenhouse projection is also available on the worker facade.
    // Read it at the cadence, so away-from-Ceres harvests and cold Continue need no event replay.
    const greenhouse = ilexGreenhouseBroadcast(state, data.stationId);
    if (greenhouse && greenhouse.id !== this._ilexBroadcastId) {
      const say = this._ctx.helpers?.voice?.say;
      if (typeof say !== 'function') return;
      this._cancelIlex();
      const voiceId = `${greenhouse.id}:${++this._ilexAttempt}`;
      this._ilexVoiceId = voiceId;
      // Install before say(): a same-floor refresh can synchronously emit voice:surface.
      this._ilexPending = { voiceId, factId: greenhouse.id, text: greenhouse.text };
      const accepted = this._ctx.helpers.voice.say({
        id: voiceId, channel: 'ambient', priority: AMBIENT_PRIORITY,
        text: greenhouse.text, kind: 'stationBroadcast', stationId: data.stationId,
        factionId: data.factionId || null, ttl: LINE_TTL_S,
        valid: () => {
          if (this._restoring || state.mode !== 'flight' || isOnboardingActive(state)
            || (state.simTime || 0) - this._lastCombatAt < COMBAT_SILENCE_S) return false;
          const near = nearestVisibleStation(state, NEAR_RANGE);
          return near?.id === station.id
            && ilexGreenhouseBroadcast(state, near.data?.stationId)?.id === greenhouse.id;
        },
      });
      // Acceptance is not delivery. Expired/preempted queued lines can retry after the
      // ordinary cadence; only our matching surface receipt suppresses the local recap.
      this._lastSayAt = now;
      if (accepted === false) this._cancelIlex();
      return;
    }
    const def = STATION_BROADCASTS[data.stationTypeId];
    if (!def || !def.lines.length) return;

    // Line variety comes from a DERIVED seeded stream rather than Math.random behind a
    // `typeof window` guard. To be precise about the severity: the evaluation timer is already
    // window-gated (see header), so headless harnesses never reach this line and no golden was ever
    // at risk. What the old form did cost is reproducibility of the thing that DOES run it — the
    // browser. Two captures of the same seed at the same station could speak different lines, which
    // is the one property visual/route evidence depends on. It was also the only real Math.random
    // left in a src/systems sim path; every other hit in that sweep is a comment asserting there
    // isn't one.
    //
    // Deliberately hash32 rather than state.rng(): drawing from the shared stream would ADVANCE it,
    // shifting every later consumer that tick and moving the replay hash for a cosmetic voice line.
    // Keying on the run seed, the station and a cadence bucket keeps the choice stable for a given
    // broadcast, varied across stations and over time, and invisible to the shared stream — the same
    // idiom src/systems/missions.js uses for board offers.
    const seedBase = (state.meta && state.meta.seed) || 0;
    const bucket = Math.floor(now / Math.max(1, CADENCE_S));
    const roll = (hash32(seedBase, String(data.stationId || station.id || 'station'), bucket) >>> 0) / 4294967296;
    const hulls = liveTrafficHulls(state);
    const hull = hulls.length
      ? hulls[hash32(seedBase, 'broadcast-hull', bucket) % hulls.length]
      : null;
    const text = pickBroadcastLine(def.lines, roll, hull);
    if (!text) return;

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
    this._cancelIlex();
    this._bus?.off?.('voice:surface', this._onSurface);
    if (this._onEconomyTick) this._bus?.off?.('economy:tick', this._onEconomyTick);
    this._onEconomyTick = null;
    if (this._timer != null && typeof window !== 'undefined') window.clearInterval(this._timer);
    this._timer = null;
    if (this._bus && this._bus.off && this._onDamage) this._bus.off('combat:damage', this._onDamage);
    this._onDamage = null;
    this._bus?.off?.('save:restoring', this._onRestoring);
    this._bus?.off?.('save:loaded', this._onLoaded);
    this._bus?.off?.('save:error', this._onRestoreError);
    this._bus?.off?.('game:newGame', this._onLoaded);
    this._restoring = true;
  },
};

export default stationBroadcast;
import { latchNineGuidanceLine } from '../data/latchNineGuidance.js';
