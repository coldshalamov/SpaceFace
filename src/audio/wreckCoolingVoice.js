// inf-wreck-cooling-voice — WF-13: a fresh wreck sounds its cooling.
//
// The battlefield picture already tells the aftermath truthfully: a sim-stamped fresh kill burns
// and smokes at its breach for WRECK_BURN_S, then gutters out and cools by WRECK_COOL_S
// (render/vfx/wreckAftermathState.js reads the sim's own kill-time stamps). The ear never heard
// any of it — the fight ended and the hulks you made burned in total silence. This planner is
// the decision layer for the sound of that cooling: hot metal ticking as it contracts and the
// hull frame groaning as it settles, positioned on the hulk and fading with the same clock the
// fire reads.
//
//   burn phase   the flame is live: the frame flexes under heat — measured knocks and a low
//                settle groan every several seconds.
//   cool phase   the flame is out: the metal contracts fastest right after, so the ticking is
//                densest at the start of cooling and thins out, brighter and sparser, until the
//                last ember dies at WRECK_COOL_S.
//   cold         silent. An unstamped wreck (authored set dressing) is cold from the start —
//                only the sim's own dead sound, exactly the visual law.
//
// Pure: no AudioContext, no THREE, no Math.random. Variation is a stable hash of (wreck id,
// voice ordinal), so a repeated watch never loops one tick and a replay hears the same cooling.
// Clocks are sim seconds, so a paused or slowed world cools on its own clock. Bounded: the
// nearest WRECK_COOL_VOICE_CAP hot hulks inside WRECK_COOL_HEARING_WU speak; the rest of a
// wreck field waits its turn. The caller writes into a pooled row array — no per-frame objects.

import { hash32 } from '../core/rng.js';
import { WRECK_BURN_S, WRECK_COOL_S, resolveWreckAgeS } from '../render/vfx/wreckAftermathState.js';

/** Hearing radius for the cooling voice — inside the positional far cull, so distance carries the rest. */
export const WRECK_COOL_HEARING_WU = 560;
/** Hot hulks voiced at once (nearest first). A wreck field is not a wall of ticks. */
export const WRECK_COOL_VOICE_CAP = 2;
/** Per-wreck clocks kept at most (pruned when unseen). */
export const WRECK_COOL_TRACK_CAP = 16;
/** Planner cadence in sim seconds: ticks land on a 0.1 s grid, which ambience never hears. */
export const WRECK_COOL_SCAN_S = 0.1;
/** A tracked wreck that goes unseen this long forgets its clocks. */
export const WRECK_COOL_FORGET_S = 4;

export const WRECK_COOL_RECIPES = Object.freeze({
  tick: 'sfx_ambient_wreck_tick',
  knock: 'sfx_ambient_wreck_knock',
  groan: 'sfx_ambient_wreck_groan',
});

// Cadence law (sim seconds between voices before jitter).
const BURN_TICK_GAP_S = 1.25;
const COOL_TICK_GAP_HOT_S = 0.6;
const COOL_TICK_GAP_COLD_S = 4.8;
const BURN_GROAN_GAP_S = 6.5;
const COOL_GROAN_GAP_S = 11;
/** Below this heat the frame has settled; only ticks remain. */
const GROAN_HEAT_FLOOR = 0.45;
/** Faintest heat that still speaks (the last few ticks before the cold husk). */
const HEAT_FLOOR = 0.02;

const TICK_GAIN = 0.5;
const KNOCK_GAIN = 0.55;
const GROAN_GAIN = 0.42;

function unit(h) {
  return (h >>> 0) / 4294967296;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/**
 * 0..1 heat of a wreck `ageS` seconds after death (-1 = unstamped → 0). Full through the burn,
 * then an eased fall to cold by WRECK_COOL_S — the same window the fire and smoke read.
 */
export function wreckCoolHeat(ageS) {
  if (!Number.isFinite(ageS) || ageS < 0) return 0;
  if (ageS >= WRECK_COOL_S) return 0;
  if (ageS < WRECK_BURN_S) return 1;
  const u = (ageS - WRECK_BURN_S) / (WRECK_COOL_S - WRECK_BURN_S);
  return Math.pow(1 - u, 1.4);
}

/** Pitch scale from hull size: a big frame rings lower than a fighter's shard. */
export function wreckCoolSizeRate(radius) {
  const r = Number.isFinite(radius) && radius > 0 ? radius : 8;
  return clamp(Math.sqrt(8 / r), 0.62, 1.3);
}

/** Seconds until the next tick for a wreck in this phase/heat, jittered by its own stream. */
export function wreckTickGap(ageS, heat, jitter01) {
  const base = ageS < WRECK_BURN_S
    ? BURN_TICK_GAP_S
    : COOL_TICK_GAP_HOT_S + (COOL_TICK_GAP_COLD_S - COOL_TICK_GAP_HOT_S) * (1 - heat);
  return base * (0.7 + 0.6 * jitter01);
}

/** Seconds until the next settle groan; Infinity once the frame has settled. */
export function wreckGroanGap(ageS, heat, jitter01) {
  if (heat < GROAN_HEAT_FLOOR) return Infinity;
  const base = ageS < WRECK_BURN_S ? BURN_GROAN_GAP_S : COOL_GROAN_GAP_S;
  return base * (0.75 + 0.5 * jitter01);
}

export function createWreckCoolingMemory() {
  return { clocks: new Map(), lastScanS: -Infinity, lastNowS: -Infinity, near: [], nearD2: [] };
}

function wreckKey(entity) {
  return String(entity.id);
}

function writeRow(out, count, recipeId, entity, gain, rate, first) {
  let row = out[count];
  if (!row) {
    row = { recipeId: '', wreckId: null, position: { x: 0, z: 0 }, gain: 0, rate: 1, first: false };
    out[count] = row;
  }
  row.recipeId = recipeId;
  row.wreckId = entity.id;
  row.position.x = entity.pos.x;
  row.position.z = entity.pos.z;
  row.gain = gain;
  row.rate = rate;
  row.first = first;
  return count + 1;
}

/**
 * One planner pass. `wrecks` is the indexed wreck lane (or any iterable of wreck entities),
 * `listener` the player position, `nowS` the presented sim time. Writes the voices due now into
 * `out` (pooled rows) and returns how many. Each row: { recipeId, wreckId, position, gain, rate,
 * first } — `first` marks the first voice a wreck has spoken this cooling (the caption moment).
 */
export function planWreckCooling(wrecks, listener, nowS, memory, out) {
  if (!memory || !out || !listener) return 0;
  const now = Number(nowS);
  if (!Number.isFinite(now) || !Number.isFinite(listener.x) || !Number.isFinite(listener.z)) return 0;
  // A clock that ran backwards (save restore, new run) is a new timeline: forget the old one.
  if (now < memory.lastNowS) {
    memory.clocks.clear();
    memory.lastScanS = -Infinity;
  }
  memory.lastNowS = now;
  if (now - memory.lastScanS < WRECK_COOL_SCAN_S) return 0;
  memory.lastScanS = now;

  // Nearest hot hulks inside earshot (insertion into a tiny fixed-size list, no sort, no alloc).
  const near = memory.near;
  const nearD2 = memory.nearD2;
  near.length = 0;
  nearD2.length = 0;
  const hearing2 = WRECK_COOL_HEARING_WU * WRECK_COOL_HEARING_WU;
  if (wrecks) {
    for (const e of wrecks) {
      if (!e || e.alive === false || e.type !== 'wreck' || !e.pos || e.id == null) continue;
      const dx = e.pos.x - listener.x;
      const dz = e.pos.z - listener.z;
      const d2 = dx * dx + dz * dz;
      if (!(d2 <= hearing2)) continue;
      const ageS = resolveWreckAgeS(e.data, now);
      if (wreckCoolHeat(ageS) < HEAT_FLOOR) continue;
      let slot = near.length;
      if (slot >= WRECK_COOL_VOICE_CAP) {
        if (d2 >= nearD2[WRECK_COOL_VOICE_CAP - 1]) continue;
        slot = WRECK_COOL_VOICE_CAP - 1;
      } else {
        near.push(e);
        nearD2.push(d2);
      }
      while (slot > 0 && nearD2[slot - 1] > d2) {
        near[slot] = near[slot - 1];
        nearD2[slot] = nearD2[slot - 1];
        slot -= 1;
      }
      near[slot] = e;
      nearD2[slot] = d2;
    }
  }

  let count = 0;
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    const key = wreckKey(e);
    const ageS = resolveWreckAgeS(e.data, now);
    const heat = wreckCoolHeat(ageS);
    let clock = memory.clocks.get(key);
    if (!clock) {
      // A newly heard hulk starts mid-stream on its own phase so two wrecks never tick in unison.
      const lead = unit(hash32('wreck-cool-lead', key));
      clock = {
        nextTickS: now + 0.15 + 0.75 * lead,
        nextGroanS: now + 1.2 + wreckGroanGap(ageS, heat, lead) * 0.5,
        n: 0,
        spoke: false,
        seenS: now,
      };
      memory.clocks.set(key, clock);
    }
    clock.seenS = now;
    const sizeRate = wreckCoolSizeRate(e.radius);
    if (now >= clock.nextTickS) {
      const roll = unit(hash32('wreck-cool-tick', key, clock.n));
      const pitch = unit(hash32('wreck-cool-pitch', key, clock.n));
      // Small contractions ring brighter as the metal cools; the hot frame knocks duller.
      const ping = roll < 0.35 + 0.5 * (1 - heat);
      const recipeId = ping ? WRECK_COOL_RECIPES.tick : WRECK_COOL_RECIPES.knock;
      const gain = (ping ? TICK_GAIN : KNOCK_GAIN) * (0.35 + 0.65 * heat);
      const rate = sizeRate * (0.88 + 0.24 * pitch);
      count = writeRow(out, count, recipeId, e, gain, rate, !clock.spoke);
      clock.spoke = true;
      clock.n += 1;
      clock.nextTickS = now + wreckTickGap(ageS, heat, unit(hash32('wreck-cool-gap', key, clock.n)));
    }
    if (now >= clock.nextGroanS) {
      const gap = wreckGroanGap(ageS, heat, unit(hash32('wreck-cool-groan', key, clock.n)));
      if (Number.isFinite(gap)) {
        const pitch = unit(hash32('wreck-cool-groan-pitch', key, clock.n));
        count = writeRow(out, count, WRECK_COOL_RECIPES.groan, e,
          GROAN_GAIN * heat, sizeRate * (0.9 + 0.18 * pitch), !clock.spoke);
        clock.spoke = true;
        clock.n += 1;
        clock.nextGroanS = now + gap;
      } else {
        clock.nextGroanS = Infinity;
      }
    }
  }

  // Forget hulks out of earshot or cold for a while; hard-cap the book.
  if (memory.clocks.size) {
    for (const [key, clock] of memory.clocks) {
      if (now - clock.seenS > WRECK_COOL_FORGET_S) memory.clocks.delete(key);
    }
    while (memory.clocks.size > WRECK_COOL_TRACK_CAP) {
      memory.clocks.delete(memory.clocks.keys().next().value);
    }
  }
  return count;
}
