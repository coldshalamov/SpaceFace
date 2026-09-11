// src/audio/sampleLibrary.js — the PQ-158.00 sample-library runtime.
//
// The designed sample library (authored offline by assets/audio/generate-samples.mjs, WAV files
// under assets/audio/<family>/) becomes the BODY of the sound; the synth recipe stays as the
// live layer that keeps pitch/mass coupling and endless variation. A cue whose binding resolves
// and whose buffer is resident plays as a sample+synth HYBRID: the sample layer carries the
// designed body at `share` of the peak, the synth layer keeps playing at the remainder, and a
// not-yet-resident sample degrades to the full synth voice with no gap and no pop.
//
// Residency is gated like other assets: tier 0 (core) is prefetched once the AudioContext exists
// and is pinned; action/context tiers decode on first use under a byte budget with LRU eviction
// of unpinned buffers. Decode is promise-based `decodeAudioData` (browser decodes off the main
// thread) behind a small concurrency cap; NOTHING here runs per frame — the runtime is entirely
// event/promise driven, so idle frames do zero sample work (stats.workOps is the frame-sleep
// counter: it may only move on cue-triggered work, never on _frame ticks).

import { SAMPLE_BINDINGS } from '../data/audioRecipes.js';

export const SAMPLE_TIER = Object.freeze({ CORE: 0, ACTION: 1, CONTEXT: 2 });

// Mirrors assets/audio/generate-samples.mjs SAMPLES[] (the generator's --check mode and
// test/pq-158-00-sample-library.test.mjs keep the three from drifting).
export const SAMPLE_MANIFEST = Object.freeze(new Map([
  ['wpn_pulse', { file: 'assets/audio/wpn/wpn_pulse.wav', tier: 0, loop: false, seconds: 0.34 }],
  ['wpn_cannon', { file: 'assets/audio/wpn/wpn_cannon.wav', tier: 0, loop: false, seconds: 0.5 }],
  ['wpn_rail', { file: 'assets/audio/wpn/wpn_rail.wav', tier: 1, loop: false, seconds: 0.9 }],
  ['wpn_missile_loop', { file: 'assets/audio/wpn/wpn_missile_loop.wav', tier: 1, loop: true, seconds: 2.4 }],
  ['wpn_beam_loop', { file: 'assets/audio/wpn/wpn_beam_loop.wav', tier: 1, loop: true, seconds: 2.0 }],
  ['near_miss', { file: 'assets/audio/wpn/near_miss.wav', tier: 1, loop: false, seconds: 0.4 }],
  ['doctrine_flyby', { file: 'assets/audio/doctrine/doctrine_flyby.wav', tier: 1, loop: false, seconds: 0.5 }],
  ['doctrine_spool', { file: 'assets/audio/doctrine/doctrine_spool.wav', tier: 1, loop: false, seconds: 0.55 }],
  ['doctrine_charge', { file: 'assets/audio/doctrine/doctrine_charge.wav', tier: 1, loop: false, seconds: 0.65 }],
  ['doctrine_broadside', { file: 'assets/audio/doctrine/doctrine_broadside.wav', tier: 1, loop: false, seconds: 1.5 }],
  ['doctrine_escort', { file: 'assets/audio/doctrine/doctrine_escort.wav', tier: 1, loop: false, seconds: 0.6 }],
  ['doctrine_growl', { file: 'assets/audio/doctrine/doctrine_growl.wav', tier: 1, loop: false, seconds: 0.85 }],
  ['impact_hull', { file: 'assets/audio/impact/impact_hull.wav', tier: 0, loop: false, seconds: 0.55 }],
  ['impact_rock', { file: 'assets/audio/impact/impact_rock.wav', tier: 0, loop: false, seconds: 0.6 }],
  ['impact_armor', { file: 'assets/audio/impact/impact_armor.wav', tier: 1, loop: false, seconds: 0.5 }],
  ['impact_kiss', { file: 'assets/audio/impact/impact_kiss.wav', tier: 1, loop: false, seconds: 0.45 }],
  ['impact_slam', { file: 'assets/audio/impact/impact_slam.wav', tier: 1, loop: false, seconds: 1.1 }],
  ['exp_small', { file: 'assets/audio/explosion/exp_small.wav', tier: 0, loop: false, seconds: 0.9 }],
  ['exp_large', { file: 'assets/audio/explosion/exp_large.wav', tier: 0, loop: false, seconds: 1.7 }],
  ['exp_capital', { file: 'assets/audio/explosion/exp_capital.wav', tier: 1, loop: false, seconds: 2.6 }],
  ['vector_mine', { file: 'assets/audio/explosion/vector_mine.wav', tier: 1, loop: false, seconds: 0.7 }],
  ['shield_break', { file: 'assets/audio/explosion/shield_break.wav', tier: 0, loop: false, seconds: 0.7 }],
  ['shield_blowout', { file: 'assets/audio/explosion/shield_blowout.wav', tier: 1, loop: false, seconds: 0.6 }],
  ['player_death', { file: 'assets/audio/explosion/player_death.wav', tier: 1, loop: false, seconds: 2.4 }],
  ['mine_beam_loop', { file: 'assets/audio/mining/mine_beam_loop.wav', tier: 1, loop: true, seconds: 2.0 }],
  ['mine_impact', { file: 'assets/audio/mining/mine_impact.wav', tier: 1, loop: false, seconds: 0.4 }],
  ['mine_scan', { file: 'assets/audio/mining/mine_scan.wav', tier: 1, loop: false, seconds: 0.6 }],
  ['mine_seam', { file: 'assets/audio/mining/mine_seam.wav', tier: 1, loop: false, seconds: 0.8 }],
  ['mine_fracture', { file: 'assets/audio/mining/mine_fracture.wav', tier: 1, loop: false, seconds: 1.2 }],
  ['mine_core', { file: 'assets/audio/mining/mine_core.wav', tier: 1, loop: false, seconds: 1.1 }],
  ['mine_drill', { file: 'assets/audio/mining/mine_drill.wav', tier: 1, loop: false, seconds: 0.7 }],
  ['mine_vent', { file: 'assets/audio/mining/mine_vent.wav', tier: 1, loop: false, seconds: 1.1 }],
  ['mine_abort', { file: 'assets/audio/mining/mine_abort.wav', tier: 1, loop: false, seconds: 0.55 }],
  ['mine_gas', { file: 'assets/audio/mining/mine_gas.wav', tier: 1, loop: false, seconds: 1.8 }],
  ['mine_gravel', { file: 'assets/audio/mining/mine_gravel.wav', tier: 1, loop: false, seconds: 0.6 }],
  ['ui_click', { file: 'assets/audio/ui/ui_click.wav', tier: 0, loop: false, seconds: 0.14 }],
  ['ui_confirm', { file: 'assets/audio/ui/ui_confirm.wav', tier: 0, loop: false, seconds: 0.5 }],
  ['ui_deny', { file: 'assets/audio/ui/ui_deny.wav', tier: 1, loop: false, seconds: 0.45 }],
  ['ui_open', { file: 'assets/audio/ui/ui_open.wav', tier: 1, loop: false, seconds: 0.4 }],
  ['ui_alert', { file: 'assets/audio/ui/ui_alert.wav', tier: 1, loop: false, seconds: 1.0 }],
  ['ui_lock', { file: 'assets/audio/ui/ui_lock.wav', tier: 1, loop: false, seconds: 0.3 }],
  ['ui_mission', { file: 'assets/audio/ui/ui_mission.wav', tier: 1, loop: false, seconds: 0.7 }],
  ['ui_loot', { file: 'assets/audio/ui/ui_loot.wav', tier: 0, loop: false, seconds: 0.35 }],
  ['ui_dock', { file: 'assets/audio/ui/ui_dock.wav', tier: 0, loop: false, seconds: 1.0 }],
  ['ui_undock', { file: 'assets/audio/ui/ui_undock.wav', tier: 1, loop: false, seconds: 0.8 }],
  ['ui_respawn', { file: 'assets/audio/ui/ui_respawn.wav', tier: 1, loop: false, seconds: 1.0 }],
  ['ui_detent', { file: 'assets/audio/ui/ui_detent.wav', tier: 1, loop: false, seconds: 0.16 }],
  ['engine_thrust_loop', { file: 'assets/audio/engine/engine_thrust_loop.wav', tier: 0, loop: true, seconds: 3.0 }],
  ['boost_whoosh', { file: 'assets/audio/engine/boost_whoosh.wav', tier: 1, loop: false, seconds: 0.7 }],
  ['dash_punch', { file: 'assets/audio/engine/dash_punch.wav', tier: 1, loop: false, seconds: 0.4 }],
  ['jump_charge', { file: 'assets/audio/engine/jump_charge.wav', tier: 1, loop: false, seconds: 1.7 }],
  ['jump_arrive', { file: 'assets/audio/engine/jump_arrive.wav', tier: 1, loop: false, seconds: 1.0 }],
  ['travel_lock', { file: 'assets/audio/engine/travel_lock.wav', tier: 1, loop: false, seconds: 0.5 }],
  ['travel_gate', { file: 'assets/audio/engine/travel_gate.wav', tier: 1, loop: false, seconds: 1.5 }],
  ['travel_commit', { file: 'assets/audio/engine/travel_commit.wav', tier: 1, loop: false, seconds: 1.0 }],
  ['travel_arrival', { file: 'assets/audio/engine/travel_arrival.wav', tier: 1, loop: false, seconds: 1.2 }],
  ['travel_fail', { file: 'assets/audio/engine/travel_fail.wav', tier: 1, loop: false, seconds: 0.9 }],
  ['travel_interdict', { file: 'assets/audio/engine/travel_interdict.wav', tier: 1, loop: false, seconds: 0.8 }],
  ['squelch_story', { file: 'assets/audio/comms/squelch_story.wav', tier: 1, loop: false, seconds: 0.9 }],
  ['squelch_ambient', { file: 'assets/audio/comms/squelch_ambient.wav', tier: 1, loop: false, seconds: 0.15 }],
  ['squelch_danger', { file: 'assets/audio/comms/squelch_danger.wav', tier: 1, loop: false, seconds: 0.9 }],
  ['massline_throw', { file: 'assets/audio/massline/massline_throw.wav', tier: 1, loop: false, seconds: 0.5 }],
  ['massline_sling', { file: 'assets/audio/massline/massline_sling.wav', tier: 1, loop: false, seconds: 0.9 }],
  ['massline_tumble', { file: 'assets/audio/massline/massline_tumble.wav', tier: 1, loop: false, seconds: 0.9 }],
  ['massline_bt', { file: 'assets/audio/massline/massline_bt.wav', tier: 1, loop: false, seconds: 0.6 }],
  ['massline_cloak', { file: 'assets/audio/massline/massline_cloak.wav', tier: 1, loop: false, seconds: 0.9 }],
  ['tether_latch', { file: 'assets/audio/massline/tether_latch.wav', tier: 1, loop: false, seconds: 0.3 }],
  ['tether_snap', { file: 'assets/audio/massline/tether_snap.wav', tier: 1, loop: false, seconds: 0.5 }],
  ['tether_strain', { file: 'assets/audio/massline/tether_strain.wav', tier: 1, loop: false, seconds: 0.6 }],
  ['kill_confirm_chime', { file: 'assets/audio/combat/kill_confirm_chime.wav', tier: 1, loop: false, seconds: 0.5 }],
  ['subsystem_pop', { file: 'assets/audio/combat/subsystem_pop.wav', tier: 1, loop: false, seconds: 0.5 }],
  ['cm_chaff', { file: 'assets/audio/combat/cm_chaff.wav', tier: 1, loop: false, seconds: 0.5 }],
  ['cm_ecm', { file: 'assets/audio/combat/cm_ecm.wav', tier: 1, loop: false, seconds: 0.9 }],
  ['rcs_disrupt', { file: 'assets/audio/combat/rcs_disrupt.wav', tier: 1, loop: false, seconds: 0.5 }],
  ['escalation_sub', { file: 'assets/audio/combat/escalation_sub.wav', tier: 1, loop: false, seconds: 0.7 }],
  ['wanted_alert', { file: 'assets/audio/ui/wanted_alert.wav', tier: 1, loop: false, seconds: 1.3 }],
  ['wanted_clear', { file: 'assets/audio/ui/wanted_clear.wav', tier: 1, loop: false, seconds: 0.8 }],
  ['station_hum_loop', { file: 'assets/audio/station/station_hum_loop.wav', tier: 2, loop: true, seconds: 4.0 }],
  ['station_tick', { file: 'assets/audio/station/station_tick.wav', tier: 2, loop: false, seconds: 0.3 }],
  ['traffic_blip', { file: 'assets/audio/station/traffic_blip.wav', tier: 2, loop: false, seconds: 0.5 }],
  ['rock_groan', { file: 'assets/audio/world/rock_groan.wav', tier: 2, loop: false, seconds: 2.8 }],
  ['rock_calve', { file: 'assets/audio/world/rock_calve.wav', tier: 2, loop: false, seconds: 1.2 }],
  ['ambient_swell', { file: 'assets/audio/world/ambient_swell.wav', tier: 2, loop: false, seconds: 2.2 }],
  ['fringe_tick', { file: 'assets/audio/world/fringe_tick.wav', tier: 2, loop: false, seconds: 0.2 }],
  ['ore_tick', { file: 'assets/audio/mining/ore_tick.wav', tier: 1, loop: false, seconds: 0.25 }],
  ['hopper_thock', { file: 'assets/audio/mining/hopper_thock.wav', tier: 1, loop: false, seconds: 0.3 }],
]));

// Default decoded-audio residency: generous enough that the whole library (86 files,
// ~5 MiB encoded / ~10 MiB decoded at runtime sample rates) stays resident in a normal session —
// the gate exists for bounded memory, not for austerity. Unit tests force it lower to prove eviction.
export const DEFAULT_SAMPLE_BYTE_BUDGET = 24 * 1024 * 1024;
export const SAMPLE_DECODE_CONCURRENCY = 3;

/** Resolve a recipe id to its sample binding, or null. Pure. */
export function resolveSampleBinding(recipeId) {
  const binding = SAMPLE_BINDINGS[recipeId];
  if (!binding) return null;
  const sampleId = typeof binding === 'string' ? binding : binding.id;
  const entry = SAMPLE_MANIFEST.get(sampleId);
  if (!entry) return null;
  const opts = typeof binding === 'string' ? {} : binding;
  return {
    sampleId,
    file: entry.file,
    tier: entry.tier,
    loop: !!entry.loop,
    share: opts.share == null ? 0.62 : opts.share,
    gain: opts.gain == null ? 1 : opts.gain,
    rate: opts.rate == null ? 1 : opts.rate,
  };
}

/** Pure measure: how many live RECIPES resolve to a sample-backed cue. */
export function countSampleBackedRecipes(recipes) {
  let count = 0;
  for (const recipe of recipes) {
    if (resolveSampleBinding(recipe.id)) count++;
  }
  return count;
}

/**
 * Residency-gated sample store. All I/O is promise-driven; there is no per-frame polling.
 * `acquire(id)` returns the resident AudioBuffer or null (and schedules the fetch+decode that
 * will make the NEXT cue hybrid). `prefetchTier(0)` warms the core tier after the context exists.
 */
export function createSampleRuntime(options = {}) {
  const fetchImpl = options.fetchImpl
    || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const byteBudget = options.byteBudget == null ? DEFAULT_SAMPLE_BYTE_BUDGET : options.byteBudget;
  const maxInFlight = options.maxInFlight == null ? SAMPLE_DECODE_CONCURRENCY : options.maxInFlight;
  const ctxRef = { ctx: options.ctx || null };

  const resident = new Map(); // id -> AudioBuffer (insertion order = LRU order)
  const pending = new Map();  // id -> Promise
  const pinned = new Set();   // tier-0 ids: never evicted
  let residentBytes = 0;
  let inFlight = 0;
  const queue = [];
  const stats = {
    requests: 0, hits: 0, misses: 0, fetches: 0, decodes: 0,
    decodeFailures: 0, evictions: 0, workOps: 0,
    get residentCount() { return resident.size; },
    get residentBytes() { return residentBytes; },
  };

  function bufferBytes(buffer) {
    if (!buffer) return 0;
    const channels = buffer.numberOfChannels || 1;
    return Math.max(1, Math.round(buffer.length * channels * 4));
  }

  function evictLRU() {
    while (residentBytes > byteBudget) {
      let evicted = false;
      for (const id of resident.keys()) {
        if (pinned.has(id)) continue;
        const buf = resident.get(id);
        resident.delete(id);
        residentBytes -= bufferBytes(buf);
        stats.evictions++;
        stats.workOps++;
        evicted = true;
        break; // restart scan from oldest after each eviction
      }
      if (!evicted) break; // everything resident is pinned
    }
  }

  function pump() {
    while (inFlight < maxInFlight && queue.length) {
      const id = queue.shift();
      if (resident.has(id) || pending.has(id)) continue;
      const entry = SAMPLE_MANIFEST.get(id);
      if (!entry || !fetchImpl || !ctxRef.ctx) continue;
      const run = (async () => {
        stats.fetches++;
        stats.workOps++;
        const response = await fetchImpl(entry.file);
        if (!response || !response.ok) throw new Error(`sample fetch failed: ${entry.file}`);
        const arrayBuffer = await response.arrayBuffer();
        stats.decodes++;
        stats.workOps++;
        // decodeAudioData decodes off the main thread in Chromium/Electron.
        const buffer = await ctxRef.ctx.decodeAudioData(arrayBuffer);
        return buffer;
      })();
      pending.set(id, run);
      inFlight++;
      run.then((buffer) => {
        resident.delete(id);
        resident.set(id, buffer);
        residentBytes += bufferBytes(buffer);
        pinned.add(id); // re-pin if tier 0 (also refreshes LRU position)
        if (SAMPLE_MANIFEST.get(id)?.tier !== SAMPLE_TIER.CORE) pinned.delete(id);
        evictLRU();
      }).catch(() => {
        stats.decodeFailures++;
      }).finally(() => {
        pending.delete(id);
        inFlight--;
        pump();
      });
    }
  }

  return {
    stats,
    setContext(ctx) { ctxRef.ctx = ctx; },
    prefetchTier(tier) {
      if (!ctxRef.ctx) return;
      for (const [id, entry] of SAMPLE_MANIFEST) {
        if (entry.tier === tier && !resident.has(id)) queue.push(id);
      }
      pump();
    },
    /** Resident buffer or null; a miss schedules the async fetch+decode for next time. */
    acquire(id) {
      stats.requests++;
      const buf = resident.get(id);
      if (buf) {
        // LRU touch
        resident.delete(id);
        resident.set(id, buf);
        stats.hits++;
        return buf;
      }
      stats.misses++;
      if (SAMPLE_MANIFEST.has(id) && !pending.has(id)) {
        queue.push(id);
        pump();
      }
      return null;
    },
    dispose() {
      queue.length = 0;
      resident.clear();
      pinned.clear();
      residentBytes = 0;
    },
  };
}

/**
 * Attach the sample body of a hybrid voice. The sample plays through its own gain into the
 * voice's master gain (so panner/bus routing, release, and GC are identical to the synth layers),
 * and registers itself as a synthetic sub-voice so releaseVoice() ramps looping samples out with
 * the rest of the voice. One-shots stop themselves at buffer end; the voice stopAt is extended so
 * _gcVoices disposes the whole group after the tail.
 */
export function attachSampleLayer(ctx, buffer, binding, voice, t0, opts = {}) {
  if (!ctx || !buffer || !binding || !voice || !voice.gain) return null;
  if (typeof ctx.createBufferSource !== 'function' || typeof ctx.createGain !== 'function') return null;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const rate = Math.max(0.25, (opts.rate || 1) * (binding.rate || 1));
  src.playbackRate.value = rate;
  if (opts.detune && src.detune) {
    try { src.detune.value = opts.detune; } catch (_) { /* no detune support */ }
  }
  const isLoop = !!(opts.loop && binding.loop);
  if (isLoop) src.loop = true;

  const gain = ctx.createGain();
  gain.gain.value = Math.max(0.0001, (opts.peak == null ? 1 : opts.peak) * binding.gain);
  src.connect(gain);
  gain.connect(voice.gain);

  try { src.start(t0); } catch (_) { try { gain.disconnect(); } catch (__) {} return null; }

  const end = isLoop ? Infinity : t0 + buffer.duration / rate + 0.02;
  const subVoice = {
    gain,
    tail: { stopAt: end, releaseDur: 0.12 },
    sources: [src],
    extra: [],
    nodes: [src, gain],
    sampleLayer: true,
  };
  voice.subVoices.push(subVoice);
  if (voice.nodes) voice.nodes.push(src, gain);
  if (!isLoop) {
    try { src.stop(end); } catch (_) {}
    if (voice.stopAt !== Infinity && end > voice.stopAt) voice.stopAt = end;
  }
  return subVoice;
}
