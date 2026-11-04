// src/systems/special500Spectacle.js — the special-500 spectacle leg owner.
//
// The director (special500Director.js) emits one 'special500:spectacle' { id, sectorId }
// per spectacle-channel firing. This system resolves the id against the presentation
// registry (src/data/special500/spectacleLegs.js) and plays the row's authored steps off
// state.simTime, dispatching each beat through the EXISTING owner seams:
//   'presentation:vfxCue' — the vfx owner's cue admission (light point, thermal-mark ring);
//   'news:publish'        — the news wire (logged advisories);
//   'audio:cue'           — the audio owner's generic cue admission (existing recipes,
//                           transposed and spatialized at the anchor).
// No rendering happens here and no second pipeline exists: headless runtimes simply emit
// into the bus unconsumed, exactly like bombs.js/hullBurst.js cue emissions.
//
// Determinism: activations stamp startedAt from state.simTime at drain; loop rows replay
// on a pure simTime modulo; every offset is authored arithmetic. Runtime bookkeeping
// (pending receipts, per-state activations) is deliberately NOT on state — nothing here
// touches the save schema. An id the registry does not carry degrades to a log-free skip.

import { SPECTACLE_LEGS } from '../data/special500/spectacleLegs.js';
import { zonesForSector } from '../data/sectorZones.js';

// Receipts can arrive between update passes; they park here until the next update drains
// them into that pass's activations (the director's PENDING_RECEIPTS pattern). Bounded.
// Only the Echo Wreck is authored as an ongoing post-discovery sector loop.
const RESUMABLE_LOOP_IDS = Object.freeze(['SP3-127']);
const MAX_PENDING = 64;
const PENDING = [];

// state → { active: Map<entryId, activation> }. Activation: { startedAt, sectorId, done[] }
// where done[i] counts how many cycle passes of step i have already played.
const RUNTIME = new WeakMap();

function runtime(state) {
  let rt = RUNTIME.get(state);
  if (!rt) {
    rt = { active: new Map() };
    RUNTIME.set(state, rt);
  }
  return rt;
}

// Same live-world read the director uses: the catalog was authored against
// state.player.sectorId, the live sector is state.world.currentSectorId.
function currentSectorId(state) {
  const w = state && state.world;
  return (w && w.currentSectorId) || (state && state.player && state.player.sectorId) || null;
}

// Same two-gate read bombs.js/hullBurst.js apply to their tells: either accessibility
// flag drops the cue to the reduced variant downstream — inside the vfx owner, never here.
function reducedMotion(state) {
  const settings = state && state.settings;
  const v = settings && settings.video;
  const a = settings && settings.accessibility;
  return !!((v && (v.motionReduce || v.flashReduce)) || (a && a.flashReduce));
}

function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function offsetPos(anchor, bearingRad, offsetWu) {
  return {
    x: anchor.x + Math.cos(bearingRad) * offsetWu,
    z: anchor.z + Math.sin(bearingRad) * offsetWu,
  };
}

/**
 * Anchor resolution, in the row's authored order: a materialized POI, a live station,
 * then static zone data. A poi/station anchor that is not materialized returns null —
 * the step skips this pass rather than misplacing the moment; a zone anchor always
 * resolves from authored data.
 */
export function resolveSpectacleAnchor(state, row) {
  const a = (row && row.anchor) || {};
  const w = state && state.world;
  const active = (w && (w.activeSector || w.active)) || null;
  if (a.poiId) {
    const row0 = active && Array.isArray(active.pois)
      ? active.pois.find((r) => r && r.poiId === a.poiId) : null;
    if (row0 && row0.pos && Number.isFinite(row0.pos.x) && Number.isFinite(row0.pos.z)) {
      return { x: row0.pos.x, z: row0.pos.z };
    }
    return null;
  }
  if (a.stationId) {
    const row0 = active && Array.isArray(active.stations)
      ? active.stations.find((r) => r && (r.stationId === a.stationId || r.id === a.stationId)) : null;
    if (row0 && row0.pos && Number.isFinite(row0.pos.x) && Number.isFinite(row0.pos.z)) {
      return { x: row0.pos.x, z: row0.pos.z };
    }
    return null;
  }
  if (a.zoneId) {
    const zone = zonesForSector(a.sectorId || '').find((z) => z && z.id === a.zoneId);
    if (zone && zone.center && Number.isFinite(zone.center.x) && Number.isFinite(zone.center.z)) {
      return { x: zone.center.x, z: zone.center.z };
    }
  }
  return null;
}

// lampCascade expands once per row into primitive beats; cached by row identity so the
// per-tick loop never re-derives it.
const EXPANDED = new Map();
function stepsFor(row) {
  let steps = EXPANDED.get(row);
  if (steps) return steps;
  steps = [];
  for (const step of row.steps || []) {
    if (step.template !== 'lampCascade') { steps.push(step); continue; }
    const p = step.params || {};
    const count = clampNum(p.count, 2, 6, 2) | 0;
    const length = clampNum(p.lengthWu, 4, 400, 40);
    const gap = clampNum(p.stepS, 0.2, 4, 1);
    for (let i = 0; i < count; i++) {
      steps.push({
        template: 'lightFlash',
        atS: step.atS + i * gap,
        params: { offsetWu: -length / 2 + (length / (count - 1)) * i, magnitude: 1 },
      });
    }
  }
  steps.sort((a, b) => a.atS - b.atS);
  EXPANDED.set(row, Object.freeze(steps));
  return steps;
}

/** One beat through one owner seam. `cycle` disambiguates recurring wire receipts. */
function emitStep(bus, state, entryId, step, anchor, bearingRad, cycle) {
  const p = step.params || {};
  if (step.template === 'trafficAdvisory') {
    bus.emit('news:publish', {
      text: p.text,
      kind: p.kind || 'incidents',
      source: p.source || 'watch-relay',
      sourceRef: `special500:${entryId}`,
      eventId: `special500:${entryId}:${cycle}`,
    });
    return;
  }
  const pos = offsetPos(anchor, bearingRad, p.offsetWu || 0);
  if (step.template === 'bellVoice') {
    // One diegetic note from an EXISTING audio recipe through the audio owner's generic
    // cue admission (_onCue resolves the id against AUDIO_RECIPE_BY_ID and plays it with
    // gain/rate/position). The note comes from the anchor's direction in space; the mix,
    // mute and caption rules stay the audio owner's — no second audio graph here.
    bus.emit('audio:cue', {
      id: p.recipe,
      gain: clampNum(p.gain, 0.05, 1, 0.8),
      rate: clampNum(p.rate, 0.5, 2, 1),
      position: pos,
      ...(p.duck === true ? {
        duck: true,
        duckSeconds: clampNum(p.duckSeconds, 0, 600, 60),
      } : {}),
    });
    return;
  }
  if (step.template === 'echoRing') {
    // The fields system's thermal-mark contract exactly: bloom-independent coloured ring,
    // particles 0, lights 0. The vfx owner renders this shape identically under reduced
    // motion — there is no flash to reduce.
    bus.emit('presentation:vfxCue', {
      id: 'thermal.mark',
      kind: 'thermalMark',
      particles: 0,
      lights: 0,
      position: pos,
      radius: clampNum(p.radiusWu, 1.5, 160, 60),
      color: p.color,
      life: clampNum(p.lifeS, 0.15, 4, 2),
    });
    return;
  }
  if (step.template === 'lightFlash') {
    bus.emit('presentation:vfxCue', {
      id: 'special500.light',
      lane: 'special500',
      particles: 0,
      lights: 1,
      position: pos,
      magnitude: clampNum(p.magnitude, 0.1, 6, 1),
      material: 'special500',
      flashReduced: reducedMotion(state),
    });
  }
}

export const special500Spectacle = {
  name: 'special500Spectacle',

  init(ctx) {
    for (const off of this.off || []) { if (typeof off === 'function') off(); }
    PENDING.length = 0; // a registry rebuild must not deliver stale parked firings twice
    this.bus = ctx.bus;
    const clearLifetime = () => {
      PENDING.length = 0;
      if (ctx.state) RUNTIME.delete(ctx.state);
    };
    this.off = [
      this.bus.on('save:restoring', clearLifetime),
      this.bus.on('game:new', clearLifetime),
      this.bus.on('special500:spectacle', (payload) => {
        if (PENDING.length < MAX_PENDING) PENDING.push(payload);
      }),
    ];
  },

  update(dt, state) {
    if (!state || !this.bus) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const rt = runtime(state);
    // Drain this pass's firings into per-state activations. A duplicate firing replaces
    // the activation — one delivery per director firing is the contract, and the
    // director's fired-flag gate makes duplicates impossible on the ordinary route.
    while (PENDING.length) {
      const payload = PENDING.shift();
      const row = payload && SPECTACLE_LEGS[payload.id];
      if (!row) continue; // unknown id: log-free skip (the registry is the whole story)
      rt.active.set(payload.id, {
        startedAt: now,
        sectorId: payload.sectorId || null,
        done: stepsFor(row).map(() => 0),
      });
    }
    const sector = currentSectorId(state);
    // A loop is an ongoing place presentation after its one-time director firing. Recreate
    // it from the durable firing time on sector return or Continue, without replaying the
    // director, story, rewards, or beats that elapsed while this sector was absent.
    for (const id of RESUMABLE_LOOP_IDS) {
      const row = SPECTACLE_LEGS[id];
      if (!(row?.loopS > 0) || row.anchor?.sectorId !== sector || rt.active.has(id)) continue;
      const fired = state.story?.flags?.[`special500.${id}`];
      if (!Number.isFinite(fired) || fired > now) continue;
      const elapsed = now - fired;
      rt.active.set(id, { startedAt: fired, sectorId: sector,
        done: stepsFor(row).map(step => Math.max(0, Math.floor((elapsed - step.atS) / row.loopS) + 1)) });
    }
    if (!rt.active.size) return;

    for (const [id, act] of rt.active) {
      const row = SPECTACLE_LEGS[id];
      if (!row) { rt.active.delete(id); continue; }
      // The moment belongs to where it fired: leaving the sector ends it (a loop row
      // without a known sector does not survive the pass either).
      if (row.loopS > 0) {
        if (!act.sectorId || !sector || sector !== act.sectorId) { rt.active.delete(id); continue; }
      } else if (act.sectorId && sector && sector !== act.sectorId) {
        rt.active.delete(id); continue;
      }
      const anchor = resolveSpectacleAnchor(state, row);
      const elapsed = Math.max(0, now - act.startedAt);
      const steps = stepsFor(row);
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        // Cycles of this step due by now: 1 for a play-once row past its beat; for a loop
        // row, the cycle count inside the simTime modulo. A pass that skips whole cycles
        // (hitch, catch-up) plays the beat once, never stacked. A beat with no anchor is
        // consumed as a skip — the moment needs its place, it does not play late.
        const due = row.loopS > 0
          ? Math.floor((elapsed - step.atS) / row.loopS) + 1
          : (elapsed >= step.atS ? 1 : 0);
        if (due <= act.done[i]) continue;
        act.done[i] = due;
        if (anchor) emitStep(this.bus, state, id, step, anchor, row.bearingRad || 0, due);
      }
      // Retire play-once activations: everything played, or the window is long dead.
      if (row.loopS <= 0) {
        const allDone = act.done.every((n) => n >= 1);
        if (allDone || elapsed > row.spanS + 60) rt.active.delete(id);
      }
    }
  },
};

