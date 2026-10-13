// Player-truth checks. Pure functions over a recorded trace, so they run in fixture tests
// without a browser (test/player-truth-checks.test.mjs). Every check returns a number, a
// threshold and the moments (wall time + screen box) that prove it. A check that could not
// measure returns UNKNOWN with the reason — never PASS.

import { PLAYER_TRUTH_CLASSES } from '../../src/testing/playerTruth/reader.js';
import { STALL_MIN_SIM_S, STALL_WINDOW_MS, formatInterruptDetail, isHudTop } from './playWatch.mjs';

export const E = Object.freeze({ id: 0, cls: 1, x: 2, z: 3, vx: 4, vz: 5, sx: 6, sy: 7, pr: 8, vis: 9, key: 10, type: 11 });
export const CLS = Object.freeze(Object.fromEntries(PLAYER_TRUTH_CLASSES.map((c, i) => [c, i])));
export const VIS = Object.freeze({ unknown: 0, hidden: 1, offscreen: 2, onscreen: 3, pooled: 4 });

/** Mode design numbers the checks grade against. Sources are named so a reviewer can argue them. */
export const MODE_DESIGN = Object.freeze({
  swarm: { completion: 'cohort', source: 'src/data/swarmMode.js rules 2–3: the finite cohort must arrive and resolve; no fixed time-to-death target' },
  gauntlet: { completion: 'cohort', ruleset: 'scored', source: 'src/systems/survivalWave.js _checkCleared and survivalWavePlanner.js: scheduled Gauntlet cohort resolves before native cleanup; no duration floor' },
  adventure: { minRoundSeconds: null, source: 'no rounds' },
  racing: { minRoundSeconds: null, source: 'no rounds' },
});

export const THRESHOLDS = Object.freeze({
  lodSwapsPer10s: 3, // any one entity: more than this many model/LOD swaps inside a 10 s window
  lodTotalPerSec: 1.0, // all entities together, per sim second
  playerBadFrac: 0.005, // share of play frames where the ship is missing / hidden / off-frame / placeholder
  playerMinTris: 300, // a hero ship below this is a box/card, not a ship
  popsPerMin: 6, // on-screen appear/vanish toggles of live bodies, per sim minute
  popFlapsPerEntity: 2,
  spawnSpeed: 8, // u/s — a passive body moving faster than this before any input is unexplained
  spawnRadius: 900, // only bodies the player can see or meet in the opening
  killsBeforeInput: 0,
  thrustDeltaSpeed: 3, // u/s gained after ~1 s of forward thrust
  yawDeltaRad: 0.2, // rad turned after ~0.8 s of yaw
  tumblePitch: 0.35, tumbleBank: 0.75, tumbleY: 4, tumbleAngVel: 2.5, tumbleSeconds: 0.5,
  readabilityMinSeparation: 1.0, readabilityMinSamples: 5,
  readabilityLowDeltaL: 8, // |ΔL| below this against the local backdrop ring is "barely differs"
  readabilityLowContrastFrac: 0.5, // more than half the samples of a measured class at that ΔL is a FAIL
  readabilityMarkerCredit: 1.5, // added when one class's rim matches the declared threat hue (0xff1a3a) and the other does not. L≥75 alone does not qualify.
  readabilityMarkerOn: 0.4, readabilityMarkerSplit: 0.35, // threat-hue rate, and how far apart the two rates must be
  frameP99RegressionRatio: 1.25, frameP99RegressionAbsMs: 100,
  longTaskRegressionRatio: 1.25, longTaskRegressionAbs: 30,
  // 1-minute load (mean of start and end) differing by more than this is host noise, not a frame-time FAIL.
  frameLoadNoiseFrac: 0.30, frameLoadEpsilon: 0.05,
  // Active flight whose sim advances less than this across the window is stalled, not slow.
  simStallWindowMs: STALL_WINDOW_MS, simStallMinAdvanceS: STALL_MIN_SIM_S,
  vfxCoverP95: 0.25, vfxPlayerOccludedFrac: 0.1, vfxThreatOccludedP95: 0.3, vfxPersistSeconds: 3, backdropThreatP95: 0.3, pinnedMoveFrac: 0.25, pinnedMinExpect: 40,
  longTaskMs: 250, frameP99Ms: 50,
});

const result = (id, title, status, value, threshold, detail, offenders = [], moments = []) => ({ id, title, status, value, threshold, detail, offenders, moments });
const fmt = (n, d = 2) => (n == null || !Number.isFinite(n) ? 'n/a' : Number(n.toFixed(d)).toString());

/** Samples during actual play: flight, no pausing screen, run active when the mode has rounds. */
export function playSamples(trace) {
  return trace.samples.filter((s) => s.mode === 'flight' && (!s.run || s.run.ph === 'active' || !trace.meta.rounds));
}

/** The run is in the flight phase the player is flying. Draft, wave intro, menu, and loading are not. */
export function flightPhaseSample(sample, trace) {
  if (!sample || sample.mode !== 'flight') return false;
  const phase = sample.run && sample.run.ph;
  if (phase && phase !== 'active') return false;
  if (trace && trace.meta && trace.meta.rounds && phase !== 'active') return false;
  return true;
}

/** A `#screens` overlay is up. `screens` is the container; `top` is the stack id when the reader did not record the container. */
export function screensOverlaySample(sample) {
  if (!sample) return false;
  if (sample.screens === true) return true;
  return sample.top != null && !isHudTop(sample.top);
}

/**
 * Per-pixel splits for backdrop and combat VFX.
 * A split taken while `#screens` is visible, or before the flight phase, is skipped and counted.
 * @returns {{ kept: object[], skipped: number }}
 */
export function pixelSplits(trace) {
  const samples = trace && Array.isArray(trace.samples) ? trace.samples : [];
  const kept = [];
  let skipped = 0;
  for (const s of samples) {
    if (!s || !s.px) continue;
    if (!flightPhaseSample(s, trace) || screensOverlaySample(s)) {
      skipped++;
      continue;
    }
    if (s.px.err) continue;
    kept.push(s);
  }
  return { kept, skipped };
}

function keyName(trace, k) { return k >= 0 ? (trace.keys[k] || String(k)) : null; }

// New captures append the actual drawn-content signature. Admission status alone can change
// while the same stand-in stays drawn; legacy captures cannot distinguish that and stay strict.
export function assetKeyParts(name) {
  const parts = String(name || '').split('|');
  if (parts.length < 4) return { id: parts[0] || '', model: '', lod: '', state: '', drawn: null };
  return { id: parts[0], model: parts[1], lod: parts[2], state: parts[3],
    drawn: parts[4]?.startsWith('draw:') ? parts[4].slice(5) : null };
}

export function visibleContentChanged(fromName, toName) {
  const from = assetKeyParts(fromName); const to = assetKeyParts(toName);
  return from.drawn != null && to.drawn != null ? from.drawn !== to.drawn : fromName !== toName;
}

export function isLoadingAssetState(state) {
  const s = String(state || '');
  return s === 'loading' || s.startsWith('awaiting') || s.startsWith('compiling');
}

export function swapIsLoading(fromName, toName) {
  return isLoadingAssetState(assetKeyParts(fromName).state) || isLoadingAssetState(assetKeyParts(toName).state);
}

// Reader life ids are id + 1e6·n for recycled slots; show the game's own entity id.
const bodyId = (id) => id % 1e6;

export function checkLodChurn(trace) {
  const T = THRESHOLDS; const samples = playSamples(trace);
  if (samples.length < 10) return result('lod_churn', 'LOD / model swap churn', 'UNKNOWN', null, T.lodSwapsPer10s, 'too few play frames sampled');
  const last = new Map(); const swaps = new Map(); let measured = 0; let unseen = 0;
  let lodN = 0; let loadN = 0; let stateN = 0;
  const playerSwaps = [];
  const tally = (fromName, toName) => { if (swapIsLoading(fromName, toName)) loadN++; else lodN++; };
  for (const s of samples) {
    if (s.p && s.p.meshId) {
      const pk = `${s.p.meshId}|${s.p.model}|${s.p.lod}|${s.p.state}${s.p.drawn != null ? `|draw:${s.p.drawn}` : ''}`;
      const prev = last.get('P');
      if (prev && prev.k !== pk && visibleContentChanged(prev.k, pk)) {
        const loading = swapIsLoading(prev.k, pk);
        tally(prev.k, pk);
        playerSwaps.push({ t: s.t, sim: s.sim, from: prev.k, to: pk, box: s.p.box, loading });
      } else if (prev && prev.k !== pk) stateN++;
      last.set('P', { k: pk });
    }
    for (const e of s.e) {
      const k = e[E.key]; if (k < 0) continue;
      measured++;
      const prev = last.get(e[E.id]);
      const on = e[E.vis] === VIS.onscreen;
      // Only a swap the player can see counts: a body re-keying off screen (or while hidden) is not churn on screen.
      if (prev && prev.k !== k) {
        if (on || prev.on) {
          const fromName = keyName(trace, prev.k); const toName = keyName(trace, k);
          if (!visibleContentChanged(fromName, toName)) {
            stateN++;
            last.set(e[E.id], { k, on });
            continue;
          }
          const loading = swapIsLoading(fromName, toName);
          tally(fromName, toName);
          const list = swaps.get(e[E.id]) || []; list.push({ sim: s.sim, t: s.t, from: prev.k, to: k, cls: e[E.cls], box: boxOf(e), on, loading });
          swaps.set(e[E.id], list);
        } else unseen++;
      }
      last.set(e[E.id], { k, on });
    }
  }
  if (!measured) return result('lod_churn', 'LOD / model swap churn', 'UNKNOWN', null, T.lodSwapsPer10s, 'no entity carried a per-entity mesh to read');
  const span = Math.max(1e-3, samples[samples.length - 1].sim - samples[0].sim);
  const worst = [];
  for (const [id, list] of swaps) {
    let best = 0; let at = list[0]; let j = 0;
    for (let i = 0; i < list.length; i++) { while (list[i].sim - list[j].sim > 10) j++; if (i - j + 1 > best) { best = i - j + 1; at = list[i]; } }
    worst.push({ id, per10: best, n: list.length, at });
  }
  worst.sort((a, b) => b.per10 - a.per10 || b.n - a.n);
  const total = lodN + loadN;
  const totalRate = total / span;
  const maxPer10 = worst.length ? worst[0].per10 : 0;
  const fail = maxPer10 > T.lodSwapsPer10s || totalRate > T.lodTotalPerSec;
  const splitOf = (list) => { const load = list.filter((x) => x.loading).length; return `${list.length - load} real LOD, ${load} loading-state`; };
  const offenders = worst.slice(0, 4).map((w) => ({
    line: `entity ${bodyId(w.id)} (${PLAYER_TRUTH_CLASSES[w.at.cls]}) ${w.per10} swaps in 10 s (${splitOf(swaps.get(w.id))}) — last ${shortKey(keyName(trace, w.at.from))} → ${shortKey(keyName(trace, w.at.to))} at sim ${fmt(w.at.sim, 1)} s`,
    t: w.at.t, sim: w.at.sim, box: w.at.on ? w.at.box : null,
  }));
  if (playerSwaps.length) offenders.unshift({ line: `player ship swapped model/LOD ${playerSwaps.length}× (${splitOf(playerSwaps)}; first sim ${fmt(playerSwaps[0].sim, 1)} s: ${playerSwaps[0].from} → ${playerSwaps[0].to})`, t: playerSwaps[0].t, sim: playerSwaps[0].sim, box: playerSwaps[0].box });
  return result('lod_churn', 'LOD / model swap churn', fail ? 'FAIL' : 'PASS',
    `max ${maxPer10}/10s per entity · ${fmt(totalRate)}/s total · ${lodN} real LOD · ${loadN} loading`, `≤${T.lodSwapsPer10s}/10s per entity · ≤${T.lodTotalPerSec}/s total`,
    `${lodN} real LOD/model swaps · ${loadN} visible loading-state swaps (awaiting/loading/compiling, still counted) over ${fmt(span, 1)} sim s across ${swaps.size} entities (${unseen} more off screen, not graded); ${stateN} metadata-only transitions with unchanged drawn contents (diagnostic)`, offenders, offenders.filter((o) => o.t != null).slice(0, 3));
}

function shortKey(k) { if (!k) return '?'; const [, model, lod, st] = k.split('|'); return `${(model || '').replace(/^GLTFKIT_/, '').slice(0, 28)}@${lod || '-'}${st && st !== 'authored' ? '/' + st : ''}`; }
function boxOf(e) { const r = Math.max(6, e[E.pr]); return [e[E.sx] - r, e[E.sy] - r, e[E.sx] + r, e[E.sy] + r]; }

export function playerBadReasons(p, T = THRESHOLDS) {
  const why = [];
  if (!p) return ['no player entity'];
  if (!p.mesh) why.push('no mesh');
  else {
    if (!p.vis) why.push('mesh hidden');
    else if (!p.onScreen) why.push('off frame');
    if (p.lod && p.lod !== 'lod0') why.push(`LOD ${p.lod}`);
    if (p.marker) why.push('resolving marker');
    if (p.state && p.state !== 'authored') why.push(`asset ${p.state}`);
    if (p.vis && p.tris < T.playerMinTris) why.push(`${p.tris} tris (placeholder)`);
  }
  return why;
}

export function checkPlayerShip(trace) {
  const T = THRESHOLDS; const samples = playSamples(trace).filter((s) => !s.p || s.p.alive);
  if (samples.length < 10) return result('player_ship', 'Player ship visible as hero model', 'UNKNOWN', null, `≤${T.playerBadFrac * 100}% frames`, 'too few play frames');
  const reasons = new Map(); let bad = 0; const moments = [];
  for (const s of samples) {
    const why = playerBadReasons(s.p);
    if (!why.length) continue;
    bad++;
    for (const w of why) {
      const k = w.replace(/^\d+ tris/, 'N tris');
      const r = reasons.get(k) || { n: 0, first: s, label: w }; r.n++; reasons.set(k, r);
    }
  }
  const frac = bad / samples.length;
  const offenders = [...reasons.values()].sort((a, b) => b.n - a.n).slice(0, 4).map((r) => ({
    line: `${r.label}: ${r.n} frames, first at sim ${fmt(r.first.sim, 1)} s`, t: r.first.t, sim: r.first.sim,
    box: r.first.p && r.first.p.box ? r.first.p.box : [r.first.vw / 2 - 40, r.first.vh / 2 - 40, r.first.vw / 2 + 40, r.first.vh / 2 + 40],
  }));
  for (const o of offenders.slice(0, 3)) moments.push(o);
  return result('player_ship', 'Player ship visible as hero model', frac > T.playerBadFrac ? 'FAIL' : 'PASS',
    `${fmt(frac * 100, 1)}% frames bad (${bad}/${samples.length})`, `≤${T.playerBadFrac * 100}%`,
    'missing / hidden / off-frame / non-lod0 / placeholder (<' + T.playerMinTris + ' tris) while alive in play', offenders, moments);
}

// Bodies that should only leave the screen by dying or flying off — a collected pickup or a spent
// shot leaving is normal.
const REMOVAL_CLASSES = new Set([CLS.enemy, CLS.asteroid, CLS.neutral, CLS.station]);

export function checkPopping(trace) {
  const T = THRESHOLDS; const samples = playSamples(trace);
  if (samples.length < 10) return result('popping', 'Pop-in / pop-out on screen', 'UNKNOWN', null, `≤${T.popsPerMin}/min`, 'too few play frames');
  // Combat kills and mining depletion are explicit deaths. Generic entity:destroyed also
  // serves shelving/cleanup, so it never excuses an unexplained on-screen removal.
  const deathReceipts = new Map();
  for (const ev of trace.events) {
    const detonation = ev.ev === 'environment-detonated' && ev.type === 'asteroid';
    const retirement = ev.ev === 'retired' && ev.reason === 'survival-room-wave-cleared'
      && ev.owner === 'survival-arena' && ev.type === 'station'
      && Number.isFinite(ev.pos?.x) && Number.isFinite(ev.pos?.z)
      && Number.isSafeInteger(ev.wave) && ev.wave > 0
      && typeof ev.roomSolidId === 'string' && ev.roomSolidId.startsWith(`survival-room-w${ev.wave}-`);
    if ((ev.ev !== 'killed' && ev.ev !== 'asteroid-destroyed' && !detonation && !retirement)
      || !Number.isFinite(ev.id)) continue;
    const list = deathReceipts.get(ev.id) || []; list.push(ev); deathReceipts.set(ev.id, list);
  }
  const inner = (e, s) => e[E.sx] > s.vw * 0.1 && e[E.sx] < s.vw * 0.9 && e[E.sy] > s.vh * 0.1 && e[E.sy] < s.vh * 0.9 && e[E.pr] >= 2;
  const previousRecorded = new Map(); let recorded = null;
  for (const sample of trace.samples) { previousRecorded.set(sample, recorded); recorded = sample; }
  let prev = null; const pops = []; const flaps = new Map(); let births = 0; let measured = 0;
  for (const s of samples) {
    const cur = new Map(s.e.map((e) => [e[E.id], e]));
    if (prev) {
      const renderPrevious = previousRecorded.get(s);
      const togglePreviousMap = renderPrevious === prev.s ? prev.map
        : new Map((renderPrevious?.e || []).map(e => [e[E.id], e]));
      for (const [id, e] of cur) {
        const p = prev.map.get(id);
        if (e[E.vis] === VIS.unknown || e[E.vis] === VIS.pooled) continue;
        measured++;
        if (!p) { if (e[E.vis] === VIS.onscreen && inner(e, s) && e[E.cls] !== CLS.projectile && e[E.cls] !== CLS.fx) births++; continue; }
        const renderedBefore = togglePreviousMap.get(id);
        const toggled = renderedBefore && ((renderedBefore[E.vis] === VIS.onscreen && e[E.vis] === VIS.hidden)
          || (renderedBefore[E.vis] === VIS.hidden && e[E.vis] === VIS.onscreen));
        if (toggled && inner(e, s)) {
          const loading = entityLoading(trace, e) || entityLoading(trace, renderedBefore);
          pops.push({ id, kind: e[E.vis] === VIS.onscreen ? 'appeared' : 'vanished', s, e, loading });
          flaps.set(id, (flaps.get(id) || 0) + 1);
        }
      }
      for (const [id, p] of prev.map) {
        const confirmedDeath = deathReceipts.get(id)?.some((ev) => ev.sim >= prev.s.sim - 1 / 60
          && ev.sim <= s.sim + 1 / 60);
        if (cur.has(id) || p[E.vis] !== VIS.onscreen || !inner(p, prev.s) || confirmedDeath || !REMOVAL_CLASSES.has(p[E.cls])) continue;
        pops.push({ id, kind: 'removed without death', s: prev.s, e: p, loading: entityLoading(trace, p) });
      }
    }
    prev = { s, map: cur };
  }
  if (!measured) return result('popping', 'Pop-in / pop-out on screen', 'UNKNOWN', null, `≤${T.popsPerMin}/min`, 'no per-entity mesh visibility to read');
  const span = Math.max(1e-3, samples[samples.length - 1].sim - samples[0].sim) / 60;
  const rate = pops.length / span;
  const maxFlap = Math.max(0, ...flaps.values());
  const loadPops = pops.filter((p) => p.loading).length;
  const realPops = pops.length - loadPops;
  const byId = new Map(); for (const p of pops) { const r = byId.get(p.id) || { n: 0, load: 0, p }; r.n++; if (p.loading) r.load++; byId.set(p.id, r); }
  const offenders = [...byId.values()].sort((a, b) => b.n - a.n).slice(0, 4).map((r) => ({
    line: `entity ${bodyId(r.p.id)} (${PLAYER_TRUTH_CLASSES[r.p.e[E.cls]]}) ${r.p.kind} on screen ${r.n}× (${r.n - r.load} visibility, ${r.load} loading-state) — first sim ${fmt(r.p.s.sim, 1)} s`, t: r.p.s.t, sim: r.p.s.sim, box: boxOf(r.p.e),
  }));
  return result('popping', 'Pop-in / pop-out on screen', rate > T.popsPerMin || maxFlap > T.popFlapsPerEntity ? 'FAIL' : 'PASS',
    `${fmt(rate, 1)}/min · worst entity ${maxFlap} toggle${maxFlap === 1 ? '' : 's'} · ${realPops} visibility · ${loadPops} loading`, `≤${T.popsPerMin}/min · ≤${T.popFlapsPerEntity} toggles`,
    `${realPops} visibility pops · ${loadPops} visible loading-state pops (awaiting/loading/compiling, still counted) inside the inner 80% of the view; ${births} non-projectile bodies born on screen (info)`, offenders, offenders.slice(0, 3));
}

function entityLoading(trace, e) {
  if (!e || e[E.key] < 0) return false;
  return isLoadingAssetState(assetKeyParts(keyName(trace, e[E.key])).state);
}

/** Rounds as the harness saw them: [{ wave, startSim, startT, endSim, endT, endPhase }]. */
function roundsOf(trace) { return trace.rounds || []; }
/** Flight input: a key press, or a mouse press on the game canvas (a click on a menu button is not flying). */
export function isFlightInput(ev) {
  return ev.ev === 'input' && (ev.kind === 'keydown' || (ev.kind === 'mousedown' && (ev.tgt == null || ev.tgt === 'CANVAS')));
}
function inputsBetween(trace, a, b) { return trace.events.filter((ev) => isFlightInput(ev) && ev.sim >= a && ev.sim <= b); }

export function checkSpawnMotion(trace) {
  const T = THRESHOLDS; const rounds = roundsOf(trace);
  const starts = rounds.length ? rounds.map((r) => ({ label: `round ${r.wave}`, wave: r.wave, sim: r.startSim })) : (trace.meta.playStartSim != null ? [{ label: 'spawn', sim: trace.meta.playStartSim }] : []);
  if (!starts.length) return result('spawn_motion', 'Unexplained motion at spawn', 'UNKNOWN', null, `0 bodies >${T.spawnSpeed} u/s`, 'no spawn moment recorded');
  const hasRunMetadata = trace.samples.some((s) => s.run?.w != null && s.run?.ph != null);
  const offenders = []; let count = 0; let checked = 0; let missing = 0;
  for (const st of starts) {
    // Actor polls can notice the round several physics ticks after it opens. The continuous
    // reader already recorded the actual first active frame; later contacts are not spawn motion.
    const nonRound = rounds.length === 0;
    const index = trace.samples.findIndex((x) => x.mode === 'flight' && (nonRound
      || (st.wave != null && hasRunMetadata ? x.run?.w === st.wave && x.run.ph === 'active' : x.sim >= st.sim)));
    const s = trace.samples[index];
    if (!s || !s.p) { missing++; continue; }
    const previous = trace.samples[index - 1];
    if (nonRound && s.sim !== 0 && (!previous || previous.mode === 'flight')) { missing++; continue; }
    const inputStart = st.wave != null && hasRunMetadata
      ? Math.min(st.sim, previous?.sim ?? s.sim) : nonRound ? s.sim : st.sim;
    const firstIn = inputsBetween(trace, inputStart, Math.max(st.sim, s.sim) + 1e9)[0];
    if (firstIn && firstIn.sim < s.sim) continue;
    checked++;
    // Crucible retains displaced cover and cleanup aftermath as the next round's terrain.
    // These exact lives already belonged to the prior round; their motion is not a new spawn. New
    // occupants use distinct reader life ids, and preparation-only bodies still grade below.
    const carriedLives = new Map();
    if (st.wave != null && hasRunMetadata) {
      for (let i = 0; i < index; i++) {
        const prior = trace.samples[i];
        if (prior.mode !== 'flight' || !['active', 'cleanup', 'draft', 'refit'].includes(prior.run?.ph)
          || !(prior.run.w < st.wave)) continue;
        for (const e of prior.e || []) carriedLives.set(e[E.id], e[E.cls]);
      }
    }
    // The actor can announce opening several ticks late. Record each initial passive life's
    // first observed state through that announcement, rather than regrade post-solve drift.
    // Include the announcement's first sample: reader sim stamps are rounded to milliseconds.
    const announced = nonRound ? trace.samples.findIndex((x, i) => i >= index && x.sim >= st.sim) : index;
    const cohort = nonRound ? trace.samples.slice(index, announced < 0 ? trace.samples.length : announced + 1) : [s];
    const seen = new Set(); let prev = previous; let incomplete = nonRound && announced < 0;
    for (const frame of cohort) {
      if (nonRound && (frame.mode !== 'flight' || !frame.p
        || (Number.isSafeInteger(prev?.f) && Number.isSafeInteger(frame.f) && frame.f !== prev.f + 1))) {
        incomplete = true; break;
      }
      prev = frame;
      if (firstIn && firstIn.sim < frame.sim) break;
      for (const e of frame.e) {
        if (!(e[E.cls] === CLS.asteroid || e[E.cls] === CLS.pickup || e[E.cls] === CLS.other)) continue;
        if (carriedLives.get(e[E.id]) === e[E.cls]) continue;
        if (seen.has(e[E.id])) continue;
        seen.add(e[E.id]);
        const d = Math.hypot(e[E.x] - frame.p.x, e[E.z] - frame.p.z); if (d > T.spawnRadius) continue;
        const sp = Math.hypot(e[E.vx], e[E.vz]);
        if (sp > T.spawnSpeed) {
          count++;
          offenders.push({ sp, line: `${st.label}: ${PLAYER_TRUTH_CLASSES[e[E.cls]]} ${e[E.id]} moving ${fmt(sp, 1)} u/s ${fmt(d, 0)} u from the player before any input`, t: frame.t, sim: frame.sim, box: e[E.vis] === VIS.onscreen || e[E.vis] === VIS.pooled ? boxOf(e) : null });
        }
      }
    }
    if (incomplete) missing++;
  }
  offenders.sort((a, b) => b.sp - a.sp);
  return result('spawn_motion', 'Unexplained motion at spawn', count > 0 ? 'FAIL' : missing ? 'UNKNOWN' : 'PASS', `${count} bodies`, `0 passive bodies >${T.spawnSpeed} u/s within ${T.spawnRadius} u`,
    `${checked} spawn moment(s) checked${missing ? `; ${missing} opening frame(s) missing` : ''}`, offenders.slice(0, 4), offenders.filter((o) => o.box).slice(0, 2));
}

export function checkKillsBeforeInput(trace) {
  const rounds = roundsOf(trace);
  if (!rounds.length) return result('kills_before_input', 'Kills before the player acts', 'N/A', null, 0, 'mode has no rounds');
  const offenders = []; let n = 0;
  for (const r of rounds) {
    const end = r.endSim != null ? r.endSim : Infinity;
    const first = inputsBetween(trace, r.startSim, end)[0];
    const cutoff = first ? first.sim : end;
    const kills = trace.events.filter((ev) => ev.ev === 'killed' && ev.sim >= r.startSim && ev.sim <= cutoff && !ev.byPlayer && ev.type !== 'asteroid' && ev.type !== 'projectile');
    n += kills.length;
    if (kills.length) {
      const by = {}; for (const k of kills) { const w = k.killerType || (k.killerId == null ? 'no killer' : 'entity ' + k.killerId); by[w] = (by[w] || 0) + 1; }
      offenders.push({ line: `round ${r.wave}: ${kills.length} ${kills.length === 1 ? 'kill' : 'kills'} in the first ${fmt(cutoff - r.startSim, 1)} s before input — by ${Object.entries(by).map(([k, v]) => `${k}×${v}`).join(', ')}`, t: kills[0].t, sim: kills[0].sim, box: null });
    }
  }
  const hostileKills = trace.events.filter((ev) => ev.ev === 'killed' && ev.hostile && rounds.some((r) => ev.sim >= r.startSim && ev.sim <= (r.endSim != null ? r.endSim : Infinity)));
  const passive = hostileKills.filter((ev) => !ev.byPlayer).length;
  const info = `non-player kills between round start and first flight input · whole run: ${hostileKills.length} hostile deaths, ${passive} not credited to the player (info)`;
  return result('kills_before_input', 'Kills before the player acts', n > THRESHOLDS.killsBeforeInput ? 'FAIL' : 'PASS', `${n} kills`, '0', info, offenders, offenders.slice(0, 2));
}

/** Score the HUD credits to the player before the player has touched the controls. */
export function checkRewardBeforeInput(trace) {
  const rounds = roundsOf(trace);
  if (!rounds.length) return result('reward_before_input', 'Score before the player acts', 'N/A', null, 0, 'mode has no rounds');
  const offenders = []; let total = 0; let measured = false;
  for (const r of rounds) {
    const end = r.endSim != null ? r.endSim : Infinity;
    const first = inputsBetween(trace, r.startSim, end)[0];
    const cutoff = first ? first.sim : end;
    const win = trace.samples.filter((s) => s.run && s.run.sc != null && s.sim >= r.startSim && s.sim <= cutoff);
    if (win.length < 2) continue;
    measured = true;
    const gain = win[win.length - 1].run.sc - win[0].run.sc;
    if (gain > 0) {
      total += gain;
      const at = win.find((s) => s.run.sc > win[0].run.sc) || win[win.length - 1];
      offenders.push({ line: `round ${r.wave}: +${gain} score in the first ${fmt(cutoff - r.startSim, 1)} s with zero flight input (first credit at sim ${fmt(at.sim, 1)} s)`, t: at.t, sim: at.sim, box: null });
    }
  }
  if (!measured) return result('reward_before_input', 'Score before the player acts', 'UNKNOWN', null, 0, 'no run score sampled before the first input');
  return result('reward_before_input', 'Score before the player acts', total > 0 ? 'FAIL' : 'PASS', `+${total} score`, '0',
    'HUD score credited between round start and the first flight input — the player is rewarded for doing nothing', offenders, offenders.slice(0, 2));
}

export function checkRoundResolution(trace) {
  const rounds = roundsOf(trace); const design = MODE_DESIGN[trace.meta.mode] || {};
  const cohort = design.completion === 'cohort';
  if (!design.minRoundSeconds && !cohort) return result('round_resolution', 'Round resolves by play', 'N/A', null, null, 'mode has no rounds');
  const threshold = cohort ? `finite quota materialized and resolved, and ≥1 input (${design.source})`
    : `≥${design.minRoundSeconds} s and ≥1 input (${design.source})`;
  const done = rounds.filter((r) => r.endSim != null && ['cleanup', 'draft', 'refit', 'victory'].includes(r.endPhase));
  if (!done.length) {
    const lost = rounds.filter((r) => r.endSim != null && r.endPhase === 'ended');
    const why = lost.length ? `no round was won; ${lost.map((r) => `round ${r.wave} ended (run over) after ${fmt(r.endSim - r.startSim, 1)} s`).join('; ')}` : rounds.length ? 'no round was won inside the run' : 'no round started';
    return result('round_resolution', 'Round resolves by play', 'UNKNOWN', null, threshold, why);
  }
  const offenders = []; let minDur = Infinity; let fail = false; let unknown = 0;
  for (const r of done) {
    const dur = r.endSim - r.startSim; minDur = Math.min(minDur, dur);
    const inputs = inputsBetween(trace, r.startSim, r.endSim).length;
    const why = [];
    if (cohort) {
      const next = rounds.find((other) => other.startSim > r.startSim);
      const sameRound = trace.samples.filter((s) => s.run?.w === r.wave && s.sim >= r.startSim
        && (!next || s.sim < next.startSim));
      // Cleanup may be sampled before the death receipt updates its census. Grade the
      // settled armory/cleanup record for this cohort, never the next round's counters.
      const terminal = sameRound.filter((s) => ['cleanup', 'draft', 'refit', 'victory'].includes(s.run.ph)).at(-1);
      const census = terminal?.run;
      let missing = false;
      if (!census || ![census.bud, census.sp, census.res].every(Number.isInteger)) missing = true;
      else {
        const quota = Math.max(census.bud, ...sameRound.map((s) => Number.isInteger(s.run.bud) ? s.run.bud : 0));
        if (quota <= 0 || census.bud !== quota || census.sp !== quota || census.res !== quota) {
          why.push(`finite cohort incomplete: quota ${quota}, materialized ${census.sp}, resolved ${census.res}`);
        }
      }
      if (design.ruleset) {
        // Native Gauntlet is the scored survival arc. Its preparation or another mode's
        // counters cannot supply the played wave's active-to-clear receipt.
        const active = sameRound.find(s => s.run.ph === 'active' && s.run.bud > 0)?.run;
        for (const record of [active, census]) {
          if (!record || typeof record.kind !== 'string' || typeof record.rs !== 'string') missing = true;
          else if (record.kind !== 'survival' || record.rs !== design.ruleset) {
            why.push(`native clear has ${record.kind}/${record.rs}, expected survival/${design.ruleset}`);
          }
        }
      }
      if (missing) unknown++;
    } else if (dur < design.minRoundSeconds) why.push(`won in ${fmt(dur, 1)} s < ${design.minRoundSeconds} s`);
    if (!inputs) why.push('won with zero player input');
    if (why.length) { fail = true; offenders.push({ line: `round ${r.wave}: ${why.join('; ')}`, t: r.endT, sim: r.endSim, box: null }); }
  }
  return result('round_resolution', 'Round resolves by play', fail ? 'FAIL' : unknown ? 'UNKNOWN' : 'PASS', `shortest ${fmt(minDur, 1)} s`, threshold,
    `${done.length} round(s) resolved${unknown ? `; ${unknown} without required native cohort evidence` : ''}`, offenders, offenders.slice(0, 2));
}

export function checkPlayerControl(trace) {
  const T = THRESHOLDS; const probes = trace.probes || [];
  if (!probes.length) return result('player_control', 'Ship answers input', 'UNKNOWN', null, `thrust Δv≥${T.thrustDeltaSpeed} u/s · yaw Δ≥${T.yawDeltaRad} rad`, 'no control probe ran');
  const offenders = []; let worst = null;
  for (const pr of probes) {
    const d = probeDead(trace, pr);
    if (d.dead) offenders.push({ line: `${pr.label}: ${d.why}`, t: d.b ? d.b.t : pr.startT, sim: d.b ? d.b.sim : pr.startSim, box: d.b ? d.b.p.box : null, bad: true });
    worst = worst || pr;
  }
  for (const sp of pinnedSpans(trace, playSamples(trace).filter((x) => x.p && x.p.alive))) {
    offenders.push({ line: `pinned ${fmt(sp.start, 1)}–${fmt(sp.end, 1)} s: velocity says ${fmt(sp.expect, 0)} u of travel, ship moved ${fmt(sp.path, 0)} u${heldBy(trace, sp.s)}`, t: sp.s.t, sim: sp.s.sim, box: sp.s.p.box, bad: true, pinned: true });
  }
  const bad = offenders.filter((o) => o.bad).length; const pins = offenders.filter((o) => o.pinned).length;
  return result('player_control', 'Ship answers input', bad ? 'FAIL' : 'PASS', `${bad - pins}/${probes.length} probes dead · ${pins} pinned spans`, `thrust Δv≥${T.thrustDeltaSpeed} u/s and moves ≥${Math.round(T.pinnedMoveFrac * 100)}% of its velocity · yaw Δ≥${T.yawDeltaRad} rad`,
    probes.map((p) => `${p.label} ${fmt(p.value, 2)}`).join(' · '), offenders, offenders.slice(0, 2));
}

/** A thrust/yaw probe is dead when the ship does not answer it on screen. A thrust probe needs real
 * displacement, not just a velocity number: a body whose velocity reads 140 u/s while its position
 * stays put is pinned, and the player sees a ship that cannot move. */
export function probeDead(trace, pr) {
  const T = THRESHOLDS;
  const a = nearestSample(trace, pr.startSim); const b = nearestSample(trace, pr.endSim);
  if (!a || !b || !a.p || !b.p) return { dead: true, why: 'no player sample' };
  if (pr.kind === 'thrust') {
    const dv = Math.hypot(b.p.vx, b.p.vz) - Math.hypot(a.p.vx, a.p.vz);
    const moved = Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z);
    const win = trace.samples.filter((s) => s.p && s.sim >= pr.startSim && s.sim <= pr.endSim);
    let expect = 0; for (let i = 1; i < win.length; i++) expect += Math.hypot(win[i].p.vx, win[i].p.vz) * Math.max(0, win[i].sim - win[i - 1].sim);
    pr.value = dv; pr.moved = moved; pr.expect = expect;
    const held = fmt(pr.endSim - pr.startSim, 1);
    if (dv < T.thrustDeltaSpeed && moved < 3) return { dead: true, a, b, why: `held W ${held} s → Δspeed ${fmt(dv, 1)} u/s, moved ${fmt(moved, 1)} u` };
    if (expect > 20 && moved < T.pinnedMoveFrac * expect) return { dead: true, a, b, why: `held W ${held} s → velocity reads ${fmt(Math.max(Math.hypot(b.p.vx, b.p.vz), dv), 0)} u/s but the ship moved ${fmt(moved, 1)} u of ${fmt(expect, 0)} u (pinned)` };
    return { dead: false, a, b };
  }
  let d = b.p.rot - a.p.rot; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  pr.value = d;
  return Math.abs(d) < T.yawDeltaRad ? { dead: true, a, b, why: `held ${pr.key} ${fmt(pr.endSim - pr.startSim, 1)} s → turned ${fmt(d, 2)} rad` } : { dead: false, a, b };
}

/** The nearest solid body (not a projectile, pickup or VFX) to the player in one sample: a pinned ship
 * sitting on top of one names what is holding it. */
export function nearestBody(trace, s) {
  if (!s || !s.p || !Array.isArray(s.e)) return null;
  let best = null;
  for (const e of s.e) {
    const key = (trace.keys && trace.keys[e[E.type]]) || '';
    if (!key || /^(projectile|pickup|vfx|player)/.test(key) || e[E.id] === s.p.id) continue;
    const d = Math.hypot(e[E.x] - s.p.x, e[E.z] - s.p.z);
    if (!best || d < best.d) best = { d, key, id: e[E.id] };
  }
  return best;
}

function heldBy(trace, s) {
  const b = nearestBody(trace, s);
  return b && b.d < 60 ? ` — ship sits ${fmt(b.d, 0)} u from ${b.key.replace(/:$/, '')} #${b.id}` : '';
}

/** Stretches of ≥1 s where the reported speed says the ship is flying but its position does not change. */
export function pinnedSpans(trace, samples) {
  const T = THRESHOLDS; const spans = []; let i = 0;
  while (i < samples.length) {
    let j = i; let expect = 0;
    while (j + 1 < samples.length && samples[j + 1].sim - samples[i].sim <= 1.0) { j++; expect += Math.hypot(samples[j].p.vx, samples[j].p.vz) * Math.max(0, samples[j].sim - samples[j - 1].sim); }
    const dur = samples[j].sim - samples[i].sim;
    if (dur >= 0.8 && expect >= T.pinnedMinExpect) {
      let path = 0; for (let k = i + 1; k <= j; k++) path += Math.hypot(samples[k].p.x - samples[k - 1].p.x, samples[k].p.z - samples[k - 1].p.z);
      if (path < T.pinnedMoveFrac * expect) {
        const last = spans[spans.length - 1];
        if (last && samples[i].sim - last.end < 0.3) { last.end = samples[j].sim; last.expect += expect; last.path += path; }
        else spans.push({ start: samples[i].sim, end: samples[j].sim, expect, path, s: samples[i] });
      }
    }
    i = j > i ? i + Math.max(1, Math.floor((j - i) / 2)) : i + 1;
  }
  return spans;
}

function nearestSample(trace, sim) {
  let best = null; let bd = Infinity;
  for (const s of trace.samples) { const d = Math.abs(s.sim - sim); if (d < bd) { bd = d; best = s; } }
  return bd < 1 ? best : null;
}

function commandedOrbitYaw(sample) {
  const p = sample.p; const intent = p.angularIntent;
  if (!intent || intent.version !== 1 || intent.source !== 'player-flight-v3' || intent.active !== true
    || intent.playerId !== p.id || !Number.isSafeInteger(p.occupantGeneration)
    || intent.occupantGeneration !== p.occupantGeneration
    || !Number.isSafeInteger(sample.tick) || intent.tick !== sample.tick
    // The reader rounds sample.sim to milliseconds but preserves the raw intent clock.
    // Compare their recorded precision; exact tick/life guards above still own freshness.
    || !Number.isFinite(intent.sim) || !Number.isFinite(sample.sim)
    || +intent.sim.toFixed(3) !== +sample.sim.toFixed(3)
    || !(Number.isFinite(intent.dt) && intent.dt > 0) || !Number.isFinite(intent.angularAcceleration)) return false;
  const ownsYaw = intent.kind === 'swing-carry' && intent.reason === 'swing-carry'
    || intent.kind === 'orbit-assist' && (intent.reason === 'engaged' || intent.reason === 'line-slack');
  const rate = intent.targetYawRate;
  return ownsYaw && Number.isFinite(rate) && Math.abs(rate) > THRESHOLDS.tumbleAngVel
    && rate * p.angVel > 0 && Math.abs(p.angVel - rate) <= THRESHOLDS.tumbleAngVel;
}

export function checkTumble(trace) {
  const T = THRESHOLDS; const samples = playSamples(trace).filter((s) => s.p && s.p.alive);
  if (samples.length < 10) return result('tumble', 'Ship stays in the play plane', 'UNKNOWN', null, null, 'too few play frames');
  const yawHeld = heldIntervals(trace, new Set(['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight']));
  let run = null; let worst = null; let total = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]; const p = s.p;
    const why = [];
    if (Math.abs(p.pitch) > T.tumblePitch) why.push(`pitch ${fmt(p.pitch, 2)}`);
    if (Math.abs(p.bank) > T.tumbleBank) why.push(`bank ${fmt(p.bank, 2)}`);
    if (Math.abs(p.y) > T.tumbleY) why.push(`y ${fmt(p.y, 1)}`);
    if (Math.abs(p.angVel) > T.tumbleAngVel && !inIntervals(yawHeld, s.sim)
      && !commandedOrbitYaw(s)) why.push(`spin ${fmt(p.angVel, 1)} rad/s uncommanded`);
    if (why.length) { if (!run) run = { start: s, why }; run.end = s; } else if (run) { close(); }
  }
  if (run) close();
  function close() { const d = run.end.sim - run.start.sim; total += d; if (!worst || d > worst.d) worst = { ...run, d }; run = null; }
  const fail = worst && worst.d >= T.tumbleSeconds;
  const offenders = worst ? [{ line: `${worst.why.join(', ')} for ${fmt(worst.d, 1)} s from sim ${fmt(worst.start.sim, 1)} s`, t: worst.start.t, sim: worst.start.sim, box: worst.start.p.box }] : [];
  return result('tumble', 'Ship stays in the play plane', fail ? 'FAIL' : 'PASS', `longest ${fmt(worst ? worst.d : 0, 1)} s`, `<${T.tumbleSeconds} s out of plane / uncommanded spin`,
    `${fmt(total, 1)} s total; limits pitch ${T.tumblePitch}, bank ${T.tumbleBank} rad, |y| ${T.tumbleY}, spin ${T.tumbleAngVel} rad/s`, offenders, fail ? offenders : []);
}

function heldIntervals(trace, codes) {
  const out = []; const down = new Map();
  for (const ev of trace.events) {
    if (ev.ev !== 'input' || !codes.has(ev.code)) continue;
    if (ev.kind === 'keydown' && !down.has(ev.code)) down.set(ev.code, ev.sim);
    else if (ev.kind === 'keyup' && down.has(ev.code)) { out.push([down.get(ev.code), ev.sim + 0.5]); down.delete(ev.code); }
  }
  for (const [, a] of down) out.push([a, Infinity]);
  return out;
}
const inIntervals = (iv, x) => iv.some(([a, b]) => x >= a && x <= b);

const READABILITY_CLASSES = ['enemy', 'asteroid', 'projectile'];

function readabilityThreshold() {
  const T = THRESHOLDS;
  return `separation ≥${T.readabilityMinSeparation} (colour, silhouette, +${T.readabilityMarkerCredit} when one rim matches threat hue 0xff1a3a and the other does not); ≤${T.readabilityLowContrastFrac * 100}% of samples with ΔL<${T.readabilityLowDeltaL} vs backdrop`;
}

export function checkReadability(trace) {
  const T = THRESHOLDS; const r = trace.readability;
  if (!r || !r.classes) return result('readability', 'Enemy / asteroid / projectile readable', 'UNKNOWN', null, `separation ≥${T.readabilityMinSeparation}`, 'no frame analysis');
  const pairs = (r.pairs || []).filter((p) => p.nA >= T.readabilityMinSamples && p.nB >= T.readabilityMinSamples);
  const counts = Object.entries(r.classes).map(([k, v]) => `${k} ${v.n}`).join(', ');
  const measurementNote = r.measurementNote ? `; ${r.measurementNote}` : '';
  const unsupported = Object.entries(r.classes).filter(([, v]) => v.n > 0 && v.contrast?.status === 'unmeasured');
  const unsupportedClasses = new Set(unsupported.map(([k]) => k));
  const contrastNote = unsupported.length ? `; hull contrast UNKNOWN: ${unsupported.map(([k, v]) => `${k}: ${v.contrast.reason || 'silhouette pixel ownership unavailable'}`).join('; ')}; radius-square contrast and affected class separation remain diagnostic` : '';
  // A class the capture threw out is unmeasured. The classes that remain cannot PASS in its place.
  const rejected = (r.captureCoherence && r.captureCoherence.rejected) || {};
  const captureUnmeasured = (r.captureCoherence && r.captureCoherence.unboundedShots > 0)
    || ['enemy', 'asteroid', 'projectile'].some((k) => {
      const reasons = rejected[k];
      const dropped = reasons && Object.values(reasons).some((n) => n > 0);
      const kept = r.classes[k] ? r.classes[k].n : 0;
      return dropped && kept < T.readabilityMinSamples;
    });
  // No pair qualifies (e.g. 8 low-contrast asteroids, 0 enemies): a measured combat
  // class still passes or fails on its own backdrop contrast. UNKNOWN only when no
  // combat class reached the sample floor.
  if (!pairs.length) {
    const measured = ['enemy', 'asteroid', 'projectile']
      .filter((k) => r.classes[k] && r.classes[k].n >= T.readabilityMinSamples);
    if (!measured.length) return result('readability', 'Enemy / asteroid / projectile readable', 'UNKNOWN', null, `separation ≥${T.readabilityMinSeparation}`, `not enough on-screen samples per class (${counts}; need ${T.readabilityMinSamples})${measurementNote}${contrastNote}`);
    const flat = measured
      .filter((k) => !unsupportedClasses.has(k) && (r.classes[k].lowContrastFrac || 0) > T.readabilityLowContrastFrac)
      .map((k) => ({ line: `${k}: ${fmt((r.classes[k].lowContrastFrac || 0) * 100, 0)}% of samples barely differ from the background (ΔL < ${T.readabilityLowDeltaL})`, t: r.classes[k].exampleT, sim: null, box: r.classes[k].exampleBox }));
    const single = measured.map((k) => `${k} ${fmt((r.classes[k].lowContrastFrac || 0) * 100, 0)}% low-contrast${unsupportedClasses.has(k) ? ' (radius-square diagnostic)' : ''}`).join(' · ');
    const thin = ['enemy', 'asteroid', 'projectile'].filter((k) => !measured.includes(k));
    const thinNote = thin.length ? `; not graded (under ${T.readabilityMinSamples}): ${thin.join(', ')}` : '';
    return result('readability', 'Enemy / asteroid / projectile readable', flat.length ? 'FAIL' : (captureUnmeasured || unsupported.length) ? 'UNKNOWN' : 'PASS', single, `separation ≥${T.readabilityMinSeparation}; ≤${T.readabilityLowContrastFrac * 100}% low-contrast per measured class`,
      `samples: ${counts}${measurementNote}${thinNote}${contrastNote}`, flat.slice(0, 4), flat.filter((o) => o.box).slice(0, 2));
  }
  const supportedPairs = pairs.filter((p) => !unsupportedClasses.has(p.a) && !unsupportedClasses.has(p.b));
  const bad = supportedPairs.filter((p) => p.sep < T.readabilityMinSeparation).sort((a, b) => a.sep - b.sep);
  const lowContrast = Object.entries(r.classes).filter(([k, v]) => !unsupportedClasses.has(k) && (k === 'enemy' || k === 'projectile') && v.n >= T.readabilityMinSamples && v.lowContrastFrac > 0.5);
  const bodies = (r.census || []).filter(c => ['station', 'neutral', 'other'].includes(c.cls));
  const bodyUnknown = bodies.filter(c => c.occlusion
    ? c.occlusion.unknown > 0 || c.occlusion.n < T.readabilityMinSamples
    : c.n >= T.readabilityMinSamples && c.overPlayerFrac > 0);
  const offenders = [
    ...bad.map((p) => ({ line: `${p.a} vs ${p.b}: separation ${fmt(p.sep)} (colour Δ ${fmt(p.dColor, 1)}, size ratio ${fmt(p.sizeRatio, 2)}) over ${p.nA}/${p.nB} samples`, t: p.exampleT, sim: null, box: p.exampleBox })),
    ...lowContrast.map(([k, v]) => ({ line: `${k}: ${fmt(v.lowContrastFrac * 100, 0)}% of samples barely differ from the background (ΔL < 8)`, t: v.exampleT, sim: null, box: v.exampleBox })),
    // The same 20%-of-five-samples rule now names actual opaque cover, not empty radius-box corners.
    ...bodies.filter(c => c.occlusion && c.occlusion.n >= T.readabilityMinSamples
      && c.occlusion.covered / (c.occlusion.n + c.occlusion.unknown) >= 0.2)
      .map(c => ({ line: `${c.name || c.cls} (${c.cls}, ${c.look}, r ${fmt(c.meanRadiusPx, 0)} px) sits over the player ship in ${fmt(c.occlusion.covered / (c.occlusion.n + c.occlusion.unknown) * 100, 0)}% of ${c.occlusion.n + c.occlusion.unknown} native opaque-mask samples — actual body pixels cover the ship`,
        t: c.occlusion.exampleT, sim: null, box: c.occlusion.exampleBox })),
  ];
  const minSep = supportedPairs.length ? Math.min(...supportedPairs.map((p) => p.sep)) : null;
  const unknownNote = bodyUnknown.length ? `; opaque body/player coverage UNKNOWN for ${bodyUnknown.map(c => `${c.name || c.cls}: ${c.occlusion ? `${c.occlusion.n} measured/${c.occlusion.unknown} unknown (${Object.keys(c.occlusion.reasons || {}).join(', ') || 'insufficient samples'})` : 'radius overlap has no native mask'}`).join('; ')}` : '';
  return result('readability', 'Enemy / asteroid / projectile readable', offenders.length ? 'FAIL' : (bodyUnknown.length || captureUnmeasured || unsupported.length) ? 'UNKNOWN' : 'PASS', `min separation ${fmt(minSep)}`, `≥${T.readabilityMinSeparation} per class pair; ≤50% low-contrast`,
    `samples: ${counts}${measurementNote}${unknownNote}${contrastNote}`, offenders.slice(0, 4), offenders.filter((o) => o.box).slice(0, 2));
}

/** Combat VFX graded per pixel when the reader's offscreen split ran (backdrop layers excluded). */
function checkVfxPixels(trace, px) {
  const T = THRESHOLDS; const q = (xs) => { const a = xs.filter((x) => x != null).sort((m, n) => m - n); return a.length ? a[Math.floor(a.length * 0.95)] : null; };
  const p95 = q(px.map((s) => s.px.c)) || 0;
  const pS = px.filter((s) => s.px.cp != null); const pOccFrac = pS.length ? pS.filter((s) => s.px.cp >= 0.5).length / pS.length : null;
  const tP95 = q(px.map((s) => s.px.ct));
  let persist = 0; let runStart = null;
  for (const s of px) { if (s.px.c > T.vfxCoverP95) { if (runStart == null) runStart = s.sim; persist = Math.max(persist, s.sim - runStart); } else runStart = null; }
  const maxS = px.reduce((a, b) => (b.px.c > a.px.c ? b : a));
  const occ = pS.find((s) => s.px.cp >= 0.5);
  const fail = p95 > T.vfxCoverP95 || (pOccFrac != null && pOccFrac > T.vfxPlayerOccludedFrac) || (tP95 != null && tP95 > T.vfxThreatOccludedP95) || persist > T.vfxPersistSeconds;
  const offenders = [];
  if (occ) offenders.push({ line: `player ship ≥50% under combat VFX pixels in ${fmt(pOccFrac * 100, 0)}% of splits (first sim ${fmt(occ.sim, 1)} s)`, t: occ.t, sim: occ.sim, box: occ.p && occ.p.box });
  offenders.push({ line: `peak combat-VFX pixels ${fmt(maxS.px.c * 100, 0)}% of screen at sim ${fmt(maxS.sim, 1)} s (${maxS.px.nC} combat layers lit)`, t: maxS.t, sim: maxS.sim, box: null });
  return result('vfx_coverage', 'Combat VFX coverage / occlusion', fail ? 'FAIL' : 'PASS',
    `p95 ${fmt(p95 * 100, 0)}% screen · player hidden ${pOccFrac == null ? 'n/a' : fmt(pOccFrac * 100, 0) + '%'} · threats hidden p95 ${tP95 == null ? 'n/a' : fmt(tP95 * 100, 0) + '%'} · ${fmt(persist, 1)} s persist`,
    `≤${T.vfxCoverP95 * 100}% · ≤${T.vfxPlayerOccludedFrac * 100}% · ≤${T.vfxThreatOccludedP95 * 100}% · ≤${T.vfxPersistSeconds} s`,
    `${px.length} per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom reader target; backdrop layers graded separately)`,
    offenders, offenders.filter((o) => o.box).slice(0, 2));
}

/** Backdrop (deep field, nebula, stars, planets) drawn over the play: reported apart from combat VFX. */
export function checkBackdrop(trace) {
  const T = THRESHOLDS; const { kept: px, skipped } = pixelSplits(trace);
  const skipNote = `skipped ${skipped}`;
  if (px.length < 5) return result('backdrop_coverage', 'Backdrop stays behind the play', 'UNKNOWN', null, `threats over bright backdrop p95 ≤${T.backdropThreatP95 * 100}%`, `no per-pixel splits sampled · ${skipNote}`);
  const a = px.map((s) => s.px.bt).filter((x) => x != null).sort((m, n) => m - n); const tP95 = a.length ? a[Math.floor(a.length * 0.95)] : null;
  const covs = px.map((s) => s.px.b).sort((m, n) => m - n); const p50 = covs[Math.floor(covs.length / 2)]; const p95 = covs[Math.floor(covs.length * 0.95)];
  const worst = px.reduce((m, s) => ((s.px.bt || 0) > (m.px.bt || 0) ? s : m));
  const fail = tP95 != null && tP95 > T.backdropThreatP95;
  const offenders = fail ? [{ line: `${fmt(worst.px.bt * 100, 0)}% of on-screen threats sit on bright backdrop pixels at sim ${fmt(worst.sim, 1)} s (backdrop lights ${fmt(worst.px.b * 100, 0)}% of the screen)`, t: worst.t, sim: worst.sim, box: null }] : [];
  return result('backdrop_coverage', 'Backdrop stays behind the play', fail ? 'FAIL' : 'PASS',
    `backdrop lights median ${fmt(p50 * 100, 0)}% / p95 ${fmt(p95 * 100, 0)}% of screen · threats on bright backdrop p95 ${tP95 == null ? 'n/a' : fmt(tP95 * 100, 0) + '%'}`,
    `threats on bright backdrop p95 ≤${T.backdropThreatP95 * 100}%`, `${px.length} per-pixel splits with backdrop layers hidden vs shown · ${skipNote}`, offenders, offenders);
}

export function checkVfx(trace) {
  const { kept: px, skipped } = pixelSplits(trace);
  const skipNote = `skipped ${skipped}`;
  if (px.length >= 5) {
    const row = checkVfxPixels(trace, px);
    row.detail = `${row.detail} · ${skipNote}`;
    return row;
  }
  const T = THRESHOLDS;
  const scans = (trace.samples || []).filter((s) => flightPhaseSample(s, trace) && !screensOverlaySample(s) && s.vfx && !s.vfx.err);
  if (scans.length < 5) return result('vfx_coverage', 'VFX coverage / occlusion', 'UNKNOWN', null, `p95 ≤${T.vfxCoverP95}`, `too few VFX scans · ${skipNote}`);
  const covs = scans.map((s) => s.vfx.cov).sort((a, b) => a - b);
  const p95 = covs[Math.floor(covs.length * 0.95)] || 0;
  const pScans = scans.filter((s) => s.vfx.pOcc != null);
  const pOccFrac = pScans.length ? pScans.filter((s) => s.vfx.pOcc >= 0.5).length / pScans.length : null;
  const tScans = scans.filter((s) => s.vfx.tOcc != null).map((s) => s.vfx.tOcc).sort((a, b) => a - b);
  const tP95 = tScans.length ? tScans[Math.floor(tScans.length * 0.95)] : null;
  let persist = 0; let runStart = null; let worstAt = scans[0];
  for (const s of scans) {
    if (s.vfx.cov > T.vfxCoverP95) { if (runStart == null) runStart = s.sim; if (s.sim - runStart > persist) { persist = s.sim - runStart; worstAt = s; } } else runStart = null;
  }
  const names = new Map();
  for (const s of scans) for (const [name, owner, frac] of s.vfx.top || []) { const k = name + (owner != null ? ` (entity ${owner})` : ''); const r = names.get(k) || { sum: 0, n: 0, max: 0 }; r.sum += frac; r.n++; r.max = Math.max(r.max, frac); names.set(k, r); }
  const topNames = [...names.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, 3);
  const maxScan = scans.reduce((a, b) => (b.vfx.cov > a.vfx.cov ? b : a));
  const occScan = pScans.find((s) => s.vfx.pOcc >= 0.5);
  const fail = p95 > T.vfxCoverP95 || (pOccFrac != null && pOccFrac > T.vfxPlayerOccludedFrac) || (tP95 != null && tP95 > T.vfxThreatOccludedP95) || persist > T.vfxPersistSeconds;
  const offenders = [];
  if (occScan) offenders.push({ line: `player ship ≥50% under additive VFX in ${fmt(pOccFrac * 100, 0)}% of scans (first sim ${fmt(occScan.sim, 1)} s; top: ${(occScan.vfx.top[0] || [])[0] || '?'})`, t: occScan.t, sim: occScan.sim, box: occScan.p && occScan.p.box });
  offenders.push({ line: `peak coverage ${fmt(maxScan.vfx.cov * 100, 0)}% at sim ${fmt(maxScan.sim, 1)} s (overdraw ${fmt(maxScan.vfx.od, 1)}×)`, t: maxScan.t, sim: maxScan.sim, box: (maxScan.vfx.top[0] || [])[3] || null });
  for (const [k, v] of topNames) offenders.push({ line: `layer "${k}": mean ${fmt(v.sum / scans.length * 100, 1)}% of screen, max ${fmt(v.max * 100, 0)}%`, t: null, sim: null, box: null });
  const unb = Math.max(...scans.map((s) => s.vfx.unb || 0));
  return result('vfx_coverage', 'VFX coverage / occlusion', fail ? 'FAIL' : 'PASS',
    `p95 ${fmt(p95 * 100, 0)}% screen · player hidden ${pOccFrac == null ? 'n/a' : fmt(pOccFrac * 100, 0) + '%'} · threats hidden p95 ${tP95 == null ? 'n/a' : fmt(tP95 * 100, 0) + '%'} · ${fmt(persist, 1)} s persist`,
    `≤${T.vfxCoverP95 * 100}% · ≤${T.vfxPlayerOccludedFrac * 100}% · ≤${T.vfxThreatOccludedP95 * 100}% · ≤${T.vfxPersistSeconds} s`,
    `${scans.length} scans of additive/transparent layers (bounding-sphere footprint on a 48×27 grid; ${unb} screen-sized batches excluded) · ${skipNote}`,
    offenders.slice(0, 5), offenders.filter((o) => o.box).slice(0, 2));
}

export function checkLoadout(trace) {
  const L = trace.loadout;
  if (!L) return result('loadout', 'Loadout readable and relevant', trace.meta.hasLoadout ? 'UNKNOWN' : 'N/A', null, '0 irrelevant · 0 undescribed · 0 silent swaps', trace.meta.hasLoadout ? 'loadout screen not audited' : 'mode has no preparation loadout');
  const offers = L.items || [];
  const fitted = L.fitted || [];
  const offenders = [];
  const clipQuote = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const mismatched = new Set();
  for (const it of [...offers, ...fitted, ...(L.undescribed || [])]) {
    if (!it || it.explanationSurface !== 'reading-mismatch' || mismatched.has(it.name)) continue;
    mismatched.add(it.name);
    offenders.push({ line: `reading panel does not match lit row ${it.name}: panel "${clipQuote(it.panel)}" vs blurb "${clipQuote(it.expected)}"`, t: L.shotT, box: it.box });
  }
  for (const it of L.irrelevant || []) offenders.push({ line: `irrelevant to ${trace.meta.mode}: ${it.name} (${it.category}) — ${it.reason}`, t: L.shotT, box: it.box });
  for (const it of L.undescribed || []) {
    if (it.explanationSurface === 'reading-mismatch') continue;
    const surface = it.explanationSurface && it.explanationSurface !== 'card' ? ` (${it.explanationSurface})` : '';
    offenders.push({ line: `no description: ${it.name}${surface}`, t: L.shotT, box: it.box });
  }
  for (const sw of L.silentSwaps || []) offenders.push({ line: `silent replace: installing ${sw.bought} removed ${sw.removed.join(', ')}; screen said "${(sw.said || '').slice(0, 80)}"`, t: sw.t, box: null });
  const quote = String(L.offerQuote || L.doorQuote || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (L.offerSource === 'harness-miss') offenders.push({ line: `harness failed to read the screen: "${quote}"`, t: L.shotT, box: null });
  const fittedClaimed = Number(L.fittedClaimed) || 0;
  if (L.fittedRead === false) {
    offenders.push({ line: `harness failed to read fitted items${L.fittedError ? `: ${String(L.fittedError).slice(0, 140)}` : ''}`, t: L.shotT, box: null });
  } else if (fittedClaimed > 0 && fitted.length === 0 && offers.length === 0 && L.offerSource !== 'harness-miss' && L.offerSource !== 'cards' && L.offerSource !== 'door-only') {
    offenders.push({ line: `preparation says ${fittedClaimed} fitted but names none and explains none: "${quote}"`, t: L.shotT, box: null });
  }
  // Gauntlet's door-only preparation has no item shelf by design: the door sentence is the
  // whole claim and the harness cannot verify it against cards. Grading it FAIL would fail
  // every Gauntlet gate by construction, so the fit-count rule above exempts door-only.
  let source = `${offers.length} offers read`;
  if (L.offerSource === 'game-empty') source = `game offered nothing: "${quote}"`;
  else if (L.offerSource === 'harness-miss') source = `harness failed to read the screen: "${quote}"`;
  else if (L.offerSource === 'door-only') source = `preparation lists no item shelf: "${quote}"`;
  const fittedNote = `${fitted.length} fitted${L.fittedRead === false ? ' (fit list not read)' : ''}`;
  const surfaces = [...new Set([...offers, ...fitted].map((it) => it && it.explanationSurface).filter((s) => s && s !== 'card'))];
  const surfaceLabel = (s) => (s === 'row-on-select' ? 'row-on-select (inferred)' : s);
  const surfaceNote = surfaces.length ? `; explanation surface: ${surfaces.map(surfaceLabel).join(', ')}` : '';
  const detail = `${source}; ${fittedNote}; swap probe: ${L.swapProbe}${surfaceNote}`;
  const status = offenders.length ? 'FAIL' : (L.swapProbe === 'not-run' ? 'UNKNOWN' : 'PASS');
  const counts = `${(L.irrelevant || []).length} irrelevant · ${(L.undescribed || []).length} undescribed · ${(L.silentSwaps || []).length} silent swaps`;
  // The measured column is what the gate prints. A bare count hid "the game offered nothing".
  let value = counts;
  if (L.offerSource === 'game-empty') value = `game offered nothing${quote ? ` ("${quote}")` : ''} · ${counts}`;
  else if (L.offerSource === 'harness-miss') value = `harness failed to read the screen${quote ? ` ("${quote}")` : ''} · ${counts}`;
  else if (L.offerSource === 'door-only') value = `no item shelf${quote ? ` ("${quote}")` : ''} · ${counts}`;
  if (surfaces.includes('row-on-select')) value = `${value} · row-on-select (inferred)`;
  return result('loadout', 'Loadout readable and relevant', status,
    value, '0 · 0 · 0',
    detail, offenders.slice(0, 6), offenders.filter((o) => o.t != null).slice(0, 1));
}

function frameStats(trace) {
  const T = THRESHOLDS;
  const samples = playSamples(trace).filter((s) => s.dt > 0);
  if (samples.length < 10) return null;
  const dts = samples.map((s) => s.dt).sort((a, b) => a - b);
  const p50 = dts[Math.floor(dts.length * 0.5)];
  const p99 = dts[Math.floor(dts.length * 0.99)];
  const t0 = samples[0].t; const t1 = samples[samples.length - 1].t;
  const longs = (trace.longTasks || []).filter((l) => l.t >= t0 && l.t <= t1 && l.d >= T.longTaskMs).sort((a, b) => b.d - a.d);
  const worstFrames = samples.slice().sort((a, b) => b.dt - a.dt).slice(0, 3);
  const offenders = [
    ...longs.slice(0, 3).map((l) => ({ line: `long task ${fmt(l.d, 0)} ms at sim ${fmt(l.sim, 1)} s (frame ${l.f})`, t: l.t, sim: l.sim, box: null })),
    ...worstFrames.map((s) => ({ line: `frame ${s.f}: ${fmt(s.dt, 0)} ms at sim ${fmt(s.sim, 1)} s (${s.e.length} entities${s.info ? `, ${s.info.calls} draws` : ''})`, t: s.t, sim: s.sim, box: null })),
  ];
  return { p50, p99, longTasks: longs.length, samples: samples.length, offenders };
}

/** Mean of the 1-minute loads recorded at the start and end of a run. Null when either sample is missing. */
export function meanLoad1m(loadavg) {
  if (!loadavg || !Array.isArray(loadavg.start) || !Array.isArray(loadavg.end)) return null;
  const a = Number(loadavg.start[0]); const b = Number(loadavg.end[0]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (a + b) / 2;
}

/** Relative |head − base| / max(head, base, epsilon). A missing load is not noise: do not call the regrade advisory. */
export function frameLoadNoise(headLoad, baseLoad) {
  const T = THRESHOLDS;
  const head = meanLoad1m(headLoad); const base = meanLoad1m(baseLoad);
  if (head == null || base == null) return { noisy: false, head, base, rel: null };
  const rel = Math.abs(head - base) / Math.max(head, base, T.frameLoadEpsilon);
  return { noisy: rel > T.frameLoadNoiseFrac, head, base, rel };
}

/** Software-GL numbers are evidence. PASS/FAIL is only a regression against a baseline that itself measured frame time.
 *  When the two runs' 1-minute loads differ by more than ~30%, the regrade is ADVISORY instead of FAIL. */
export function gradeSoftwareFrameTime(stats, baseline, load = null) {
  const T = THRESHOLDS;
  const value = `software-renderer evidence · p50 ${fmt(stats.p50, 0)} ms · p99 ${fmt(stats.p99, 0)} ms · ${stats.longTasks} long tasks ≥${T.longTaskMs} ms`;
  const frame = { p50: stats.p50, p99: stats.p99, longTasks: stats.longTasks, softwareGl: true, samples: stats.samples };
  const policy = `p99 ≤${Math.round(T.frameP99RegressionRatio * 100)}% and ≤+${T.frameP99RegressionAbsMs} ms · long tasks ≤${Math.round(T.longTaskRegressionRatio * 100)}% and ≤+${T.longTaskRegressionAbs}`;
  const bare = !baseline;
  const unmeasured = !bare && (baseline.p99 == null || baseline.longTasks == null || !Number.isFinite(Number(baseline.p99)) || !Number.isFinite(Number(baseline.longTasks)));
  if (bare || unmeasured) {
    const who = bare ? null : (baseline.commit || '?');
    return {
      status: 'UNKNOWN', value, frame,
      threshold: bare ? `no regression vs --baseline (${policy})` : `no regression vs ${who} (${policy})`,
      detail: bare ? 'software-renderer evidence only; no --baseline to grade regression' : `software-renderer evidence only; baseline ${who} produced no frame-time measurement`,
    };
  }
  const p99 = Number(stats.p99); const lt = Number(stats.longTasks);
  const baseP99 = Number(baseline.p99); const baseLt = Number(baseline.longTasks);
  const p99Cap = Math.max(baseP99 * T.frameP99RegressionRatio, baseP99 + T.frameP99RegressionAbsMs);
  const ltCap = Math.max(baseLt * T.longTaskRegressionRatio, baseLt + T.longTaskRegressionAbs);
  const fail = p99 > p99Cap || lt > ltCap;
  const commit = baseline.commit || 'baseline';
  const noise = frameLoadNoise(load && load.head, load && load.base);
  const loadNote = noise.head != null && noise.base != null
    ? ` · load 1m mean head ${fmt(noise.head, 2)} vs baseline ${fmt(noise.base, 2)} (rel ${fmt(noise.rel * 100, 0)}%)`
    : '';
  if (noise.noisy) {
    frame.load = { head1m: +noise.head.toFixed(3), base1m: +noise.base.toFixed(3), rel: +noise.rel.toFixed(3), advisory: true };
    return {
      status: 'ADVISORY', value, frame,
      threshold: `no regression vs ${commit}: p99 ≤${fmt(p99Cap, 0)} ms · long tasks ≤${fmt(ltCap, 0)} · advisory when 1m load differs by >${Math.round(T.frameLoadNoiseFrac * 100)}%`,
      detail: `${stats.samples} play frames · baseline p99 ${fmt(baseP99, 0)} ms · ${baseLt} long tasks${loadNote} — advisory, numbers would ${fail ? 'FAIL' : 'PASS'}; not a FAIL`,
    };
  }
  if (noise.head != null && noise.base != null) frame.load = { head1m: +noise.head.toFixed(3), base1m: +noise.base.toFixed(3), rel: +noise.rel.toFixed(3), advisory: false };
  return {
    status: fail ? 'FAIL' : 'PASS', value, frame,
    threshold: `no regression vs ${commit}: p99 ≤${fmt(p99Cap, 0)} ms · long tasks ≤${fmt(ltCap, 0)}`,
    detail: `${stats.samples} play frames · baseline p99 ${fmt(baseP99, 0)} ms · ${baseLt} long tasks${loadNote}`,
  };
}

/** Rewrite a recorded software-GL frame_time result once the baseline verdict exists. Returns true when it changed the result. */
export function regradeSoftwareFrameTime(results, baselineFrame, { commit, baselineMissing = false, headLoad = null, baseLoad = null } = {}) {
  const row = results.find((x) => x.id === 'frame_time');
  if (!row || !row.frame || !row.frame.softwareGl) return false;
  const baseline = baselineMissing || !baselineFrame
    ? { commit: commit || '?', p99: null, longTasks: null }
    : { ...baselineFrame, commit: commit || baselineFrame.commit || '?' };
  const graded = gradeSoftwareFrameTime(row.frame, baseline, { head: headLoad, base: baseLoad });
  row.status = graded.status;
  row.value = graded.value;
  row.threshold = graded.threshold;
  row.detail = graded.detail;
  row.frame = graded.frame;
  return true;
}

export function checkFrameTime(trace) {
  const T = THRESHOLDS;
  const stats = frameStats(trace);
  if (!stats) return result('frame_time', 'Frame time / long tasks', 'UNKNOWN', null, null, 'too few frames');
  if (trace.meta.softwareGl) {
    const graded = gradeSoftwareFrameTime(stats, trace.meta.frameBaseline || null);
    const row = result('frame_time', 'Frame time / long tasks', graded.status, graded.value, graded.threshold, graded.detail, stats.offenders.slice(0, 4), graded.status === 'FAIL' ? stats.offenders.filter((o) => o.t != null).slice(0, 2) : []);
    row.frame = graded.frame;
    return row;
  }
  const value = `p50 ${fmt(stats.p50, 0)} ms · p99 ${fmt(stats.p99, 0)} ms · ${stats.longTasks} long tasks ≥${T.longTaskMs} ms`;
  if (trace.meta.performanceContext?.contended === true) return result('frame_time', 'Frame time / long tasks', 'UNKNOWN', value,
    `p99 ≤${T.frameP99Ms} ms · 0 long tasks ≥${T.longTaskMs} ms`,
    `${stats.samples} play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.`,
    stats.offenders.slice(0, 4), stats.offenders.filter((o) => o.t != null).slice(0, 2));
  const row = result('frame_time', 'Frame time / long tasks', stats.p99 > T.frameP99Ms || stats.longTasks ? 'FAIL' : 'PASS', value, `p99 ≤${T.frameP99Ms} ms · 0 long tasks ≥${T.longTaskMs} ms`, `${stats.samples} play frames`, stats.offenders.slice(0, 4), stats.offenders.filter((o) => o.t != null).slice(0, 2));
  row.frame = { p50: stats.p50, p99: stats.p99, longTasks: stats.longTasks, softwareGl: false, samples: stats.samples };
  return row;
}

export function checkRoute(trace) {
  const quote = trace.meta && trace.meta.environmentQuote;
  if (quote) {
    return result('route', 'Public route plays end to end', 'ENVIRONMENT', 'HARNESS ENVIRONMENT', 'served assets match HEAD, and the route loads',
      `route load failed: "${quote}"`, [{ line: quote, t: null, box: null }], []);
  }
  const r = trace.route || { steps: [] };
  const failed = r.steps.find((s) => !s.ok);
  const reached = r.steps.filter((s) => s.ok).map((s) => s.name).join(' → ');
  return result('route', 'Public route plays end to end', failed ? 'FAIL' : (r.steps.length ? 'PASS' : 'UNKNOWN'), reached || 'none', 'every step through public controls',
    failed ? `stalled at ${failed.name}: ${failed.detail || ''}` : `${r.steps.length} steps`, failed ? [{ line: `${failed.name}: ${failed.detail || 'failed'}`, t: failed.t, box: null }] : [], failed && failed.t ? [{ line: failed.name, t: failed.t, box: null }] : []);
}

export const ALL_CHECKS = [checkRoute, checkRoundResolution, checkKillsBeforeInput, checkRewardBeforeInput, checkSpawnMotion, checkPlayerControl, checkTumble,
  checkPlayerShip, checkLodChurn, checkPopping, checkReadability, checkVfx, checkLoadout, checkFrameTime];

/** Round transitions: after every round start past the first, the ship is whole, answers input and stays in plane. */
export function checkRoundTransitions(trace) {
  const T = THRESHOLDS; const rounds = roundsOf(trace);
  if (!trace.meta.rounds) return result('round_transitions', 'Every round starts playable', 'N/A', null, null, 'mode has no rounds');
  const later = rounds.slice(1);
  if (!later.length) return result('round_transitions', 'Every round starts playable', 'UNKNOWN', null, 'ship whole · probes answer · in plane, first 8 s of each round', 'no round after round 1 was reached');
  const offenders = []; const parts = [];
  for (const r of later) {
    const win = trace.samples.filter((s) => s.sim >= r.startSim && s.sim <= r.startSim + 8 && s.p);
    const bad = win.filter((s) => playerBadReasons(s.p).length);
    const tumble = win.filter((s) => Math.abs(s.p.pitch) > T.tumblePitch || Math.abs(s.p.bank) > T.tumbleBank || Math.abs(s.p.y) > T.tumbleY);
    const probes = (trace.probes || []).filter((pr) => pr.label && pr.label.startsWith(`round ${r.wave} `));
    const dead = probes.filter((pr) => probeDead(trace, pr).dead);
    const pins = pinnedSpans(trace, win.filter((x) => x.p.alive));
    const hull = win[0] && win[0].p.hullMax ? Math.round(100 * win[0].p.hull / win[0].p.hullMax) : null;
    parts.push(`round ${r.wave}: ${win.length} frames, hull ${hull == null ? '?' : hull + '%'}, ${bad.length} bad ship, ${tumble.length} out of plane, ${dead.length}/${probes.length} dead probes, ${pins.length} pinned`);
    const why = [];
    if (!win.length) why.push('no player frames in the first 8 s');
    if (bad.length / Math.max(1, win.length) > T.playerBadFrac) why.push(`ship bad in ${bad.length}/${win.length} frames (${playerBadReasons(bad[0].p).join(', ')})`);
    if (tumble.length >= 3) why.push(`out of plane in ${tumble.length} frames`);
    if (!probes.length) why.push('no control probe ran');
    else if (dead.length) why.push(`${dead.length}/${probes.length} control probes dead (${dead.map((pr) => probeDead(trace, pr).why).join('; ')})`);
    if (pins.length) why.push(`pinned ${fmt(pins[0].start, 1)}–${fmt(pins[0].end, 1)} s (velocity ${fmt(pins[0].expect, 0)} u, moved ${fmt(pins[0].path, 0)} u${heldBy(trace, pins[0].s)})`);
    if (why.length) { const s0 = bad[0] || tumble[0] || win[0]; offenders.push({ line: `round ${r.wave} start (hull ${hull == null ? '?' : hull + '%'}): ${why.join('; ')}`, t: s0 ? s0.t : r.startT, sim: s0 ? s0.sim : r.startSim, box: s0 && s0.p ? s0.p.box : null }); }
  }
  return result('round_transitions', 'Every round starts playable', offenders.length ? 'FAIL' : 'PASS', `${offenders.length}/${later.length} round starts broken`, 'ship whole · probes answer · in plane, first 8 s of each round',
    parts.join(' · '), offenders, offenders.slice(0, 2));
}

/** Gate pass reached the required round. */
export function checkRoundsReached(trace) {
  const need = trace.meta.requireRounds;
  if (!need) return result('rounds_reached', 'Run reaches the gate round', 'N/A', null, null, 'not a gate active pass');
  const got = Math.max(0, ...roundsOf(trace).map((r) => r.wave || 0));
  return result('rounds_reached', 'Run reaches the gate round', got >= need ? 'PASS' : 'FAIL', `round ${got}`, `≥ round ${need}`,
    `stopped: ${trace.meta.stopReason || 'n/a'}`, got >= need ? [] : [{ line: `scripted fighter stopped at round ${got}: ${trace.meta.stopReason || ''}`, t: null, sim: null, box: null }]);
}

/** Sim froze while the run still said the phase was active. Loading and the boot overlay are not a stall. */
export function checkSimStalled(trace) {
  const threshold = `≥${STALL_MIN_SIM_S} s sim per ${Math.round(STALL_WINDOW_MS / 1000)} s wall while phase is active and not loading`;
  const watch = trace.playWatch;
  const missing = !watch || !watch.watched;
  if (missing) {
    const started = trace.meta && trace.meta.playStartSim != null;
    return result('sim_stalled', 'Sim kept moving', started ? 'UNKNOWN' : 'N/A', null, threshold, started ? 'play was not watched' : 'play did not start');
  }
  const stall = (watch.interrupts || []).find((item) => item.kind === 'stall');
  if (stall) {
    const line = formatInterruptDetail(stall);
    const moment = stall.t != null ? [{ line, t: stall.t, sim: stall.sim ?? null, box: null }] : [];
    return result('sim_stalled', 'Sim kept moving', 'FAIL', `${Number(stall.simAdvanced).toFixed(2)} s / ${(stall.wallMs / 1000).toFixed(0)} s wall`, threshold, line, [{ line, t: stall.t ?? null, sim: stall.sim ?? null, box: null }], moment);
  }
  const adv = watch.simAdvanced;
  const wall = watch.wallMs;
  const value = adv == null ? 'no active span' : `+${adv} s / ${wall == null ? '?' : (wall / 1000).toFixed(0)} s wall`;
  return result('sim_stalled', 'Sim kept moving', 'PASS', value, threshold, 'sim advanced through the watched active span');
}

/** A screen covered the flight HUD during active play. The script does not open screens while the phase is active. */
export function checkPlayInterrupted(trace) {
  const threshold = 'flight HUD only during active play; a screen the script did not open fails';
  const watch = trace.playWatch;
  const missing = !watch || !watch.watched;
  if (missing) {
    const started = trace.meta && trace.meta.playStartSim != null;
    return result('play_interrupted', 'Play stays on the flight HUD', started ? 'UNKNOWN' : 'N/A', null, threshold, started ? 'play was not watched' : 'play did not start');
  }
  const screen = (watch.interrupts || []).find((item) => item.kind === 'screen');
  if (screen) {
    const line = formatInterruptDetail(screen);
    const moment = screen.t != null ? [{ line, t: screen.t, sim: screen.sim ?? null, box: null }] : [];
    return result('play_interrupted', 'Play stays on the flight HUD', 'FAIL', screen.top || 'screen', threshold, line, [{ line, t: screen.t ?? null, sim: screen.sim ?? null, box: null }], moment);
  }
  return result('play_interrupted', 'Play stays on the flight HUD', 'PASS', 'HUD held', threshold, 'no non-HUD screen during active play');
}

/** How far from the viewport edge a G4 chip center may sit and still be an edge mark, not a second radar. */
export const EDGE_MARKER_INSET = 48;
/** Off-screen samples with no marker before the check admits it never saw one. */
export const OFFSCREEN_MARKER_MIN_SAMPLES = 5;

/** Quadrant of an off-frame screen point. Same rule as `offscreenShooterMarker` in src/ui/threatHalo.js. */
export function edgeMarkerSide(sx, sy, vw, vh) {
  const w = Math.max(1, Number(vw) || 1); const h = Math.max(1, Number(vh) || 1);
  const cx = w * 0.5; const cy = h * 0.5;
  const dx = sx - cx; const dy = sy - cy;
  const nx = Math.abs(dx) / cx; const ny = Math.abs(dy) / cy;
  return nx >= ny ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
}

function markerInset(m, vw, vh) {
  return Math.min(m.x, m.y, vw - m.x, vh - m.y);
}

/** Outside on exactly one axis: a bearing beside the frame, not a behind-camera point the HUD un-mirrors. */
function oneAxisOutside(sx, sy, vw, vh) {
  const outX = sx < 0 || sx > vw;
  const outY = sy < 0 || sy > vh;
  return outX !== outY;
}

/**
 * Build-map G4, as the player sees it. The driver stamps `edgeMarkers` from the visible
 * `.sf-threat-halo__slot--arc` chips. This does not edit the HUD.
 * A marker in the middle of the frame fails. A marker for an in-frame shooter fails.
 * One off-screen hostile and one marker must agree on the side when the hostile is outside on one axis.
 * Off-screen hostiles with no marker stay UNKNOWN: the halo only marks shooters inside its range,
 * and the trace does not carry that. No off-screen hostile is N/A.
 */
export function checkOffscreenMarker(trace) {
  const title = 'Off-screen shooter has an edge marker';
  const threshold = 'one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile';
  const started = trace.meta && trace.meta.playStartSim != null;
  const samples = playSamples(trace).filter((s) => Array.isArray(s.edgeMarkers));
  if (!samples.length) {
    return result('offscreen_marker', title, started ? 'UNKNOWN' : 'N/A', null, threshold, started ? 'edge markers were not read' : 'play did not start');
  }
  const offenders = [];
  let offscreenSamples = 0; let markedOffscreen = 0;
  for (const s of samples) {
    const vw = s.vw || 960; const vh = s.vh || 540;
    const enemies = (s.e || []).filter((e) => e[E.cls] === CLS.enemy);
    // The halo projects shooter centers. VIS.onscreen instead means a rendered hull's
    // bounds overlap the frame, including a center beyond the rim with a visible sliver.
    const off = enemies.filter((e) => e[E.vis] === VIS.offscreen
      || Number.isFinite(e[E.sx]) && Number.isFinite(e[E.sy])
        && (e[E.sx] < 0 || e[E.sx] > vw || e[E.sy] < 0 || e[E.sy] > vh));
    const on = enemies.filter((e) => e[E.vis] === VIS.onscreen && !off.includes(e));
    const markers = s.edgeMarkers.filter((m) => m && Number.isFinite(m.x) && Number.isFinite(m.y));
    const bound = markers.filter((m) => Object.hasOwn(m, 'shooter'));
    const boundOff = bound.filter((m) => m.shooter?.alive && m.shooter.onScreen === false);
    if (off.length || boundOff.length) offscreenSamples++;
    if (boundOff.length || off.length && markers.length) markedOffscreen++;
    for (const m of markers) {
      if (markerInset(m, vw, vh) > EDGE_MARKER_INSET) {
        offenders.push({ line: `edge marker at (${Math.round(m.x)}, ${Math.round(m.y)}) is not on the screen edge`, t: s.t ?? null, sim: s.sim ?? null, box: null });
      }
      if (Object.hasOwn(m, 'shooter')) {
        if (!m.shooter?.alive || m.shooter.onScreen) {
          offenders.push({ line: !m.shooter?.alive ? 'edge marker has no living shooter'
            : `edge marker for in-frame shooter ${m.shooter.id}`, t: s.t ?? null, sim: s.sim ?? null, box: null });
        } else if (!m.shooter.behind && oneAxisOutside(m.shooter.x, m.shooter.y, vw, vh)) {
          const want = edgeMarkerSide(m.shooter.x, m.shooter.y, vw, vh);
          if (m.edge !== want) offenders.push({ line: `off-screen hostile on the ${want} has an edge marker on the ${m.edge || 'unmarked side'}`, t: s.t ?? null, sim: s.sim ?? null, box: null });
        }
      }
    }
    if (!bound.length && markers.length && enemies.length && off.length === 0 && on.length === enemies.length) {
      offenders.push({ line: `edge marker while every hostile is in frame (${on.length} on screen)`, t: s.t ?? null, sim: s.sim ?? null, box: null });
    }
    if (!bound.length && off.length === 1 && markers.length === 1 && oneAxisOutside(off[0][E.sx], off[0][E.sy], vw, vh)) {
      const want = edgeMarkerSide(off[0][E.sx], off[0][E.sy], vw, vh);
      const got = markers[0].edge;
      if (got !== want) {
        offenders.push({ line: `off-screen hostile on the ${want} has an edge marker on the ${got || 'unmarked side'}`, t: s.t ?? null, sim: s.sim ?? null, box: null });
      }
    }
  }
  if (offenders.length) {
    return result('offscreen_marker', title, 'FAIL', offenders[0].line, threshold, `${offenders.length} edge-marker miss${offenders.length === 1 ? '' : 'es'}`, offenders.slice(0, 8));
  }
  if (!offscreenSamples) {
    return result('offscreen_marker', title, 'N/A', 'no off-screen hostile', threshold, 'no off-screen hostile in the frames where markers were read');
  }
  if (!markedOffscreen) {
    const thin = offscreenSamples < OFFSCREEN_MARKER_MIN_SAMPLES;
    return result('offscreen_marker', title, 'UNKNOWN', `0 markers / ${offscreenSamples} off-screen samples`, threshold,
      thin
        ? 'too few off-screen samples to grade the edge marker'
        : `${offscreenSamples} samples had an off-screen hostile and no edge marker. The HUD marks shooters inside the threat halo, which this read cannot see, so this is not a FAIL.`);
  }
  return result('offscreen_marker', title, 'PASS', `${markedOffscreen} samples with an off-screen hostile and an edge marker`, threshold, 'markers sat on the screen edge beside an off-screen hostile');
}

ALL_CHECKS.splice(ALL_CHECKS.indexOf(checkVfx) + 1, 0, checkBackdrop);
/**
 * Crucible modes (Swarm / Gauntlet) must play in the Crucible, not in the Adventure world:
 * no Adventure objective / tutorial text or live onboarding in any play frame, and (Swarm)
 * an armory that actually offers equipment. The worker-lane regression showed all three.
 */
export function checkCrucibleRealm(trace) {
  const mode = trace.meta.mode;
  if (mode !== 'swarm' && mode !== 'gauntlet') return result('crucible_realm', 'Crucible plays in the Crucible', 'N/A', null, '0 Adventure frames · armory > 0 offers', 'not a Crucible mode');
  const frames = trace.realm || [];
  const offenders = [];
  const leaks = frames.filter((f) => (f.advText && f.advText.length) || f.onboarding);
  for (const f of leaks.slice(0, 4)) offenders.push({ line: `Adventure in a ${mode} frame (${f.file ? f.file.split('/').pop() : '?'}, sector ${f.sector}): ${f.onboarding ? 'onboarding live; ' : ''}${(f.advText || []).join(' | ')}`, t: f.t, box: null });
  const offers = trace.loadout ? (trace.loadout.items || []).length : null;
  if (mode === 'swarm' && trace.meta.hasLoadout && offers === 0) offenders.push({ line: 'armory offered no equipment ("No equipment matches this search")', t: trace.loadout.shotT, box: null });
  const status = offenders.length ? 'FAIL' : (frames.length ? 'PASS' : 'UNKNOWN');
  return result('crucible_realm', 'Crucible plays in the Crucible', status,
    `${leaks.length}/${frames.length} Adventure frames · armory ${offers == null ? 'n/a' : offers + ' offers'}`, '0 Adventure frames · armory > 0 offers',
    `sectors seen: ${[...new Set(frames.map((f) => f.sector))].join(', ') || 'n/a'}`, offenders, offenders.filter((o) => o.t != null).slice(0, 1));
}

ALL_CHECKS.push(checkRoundTransitions, checkRoundsReached, checkCrucibleRealm, checkSimStalled, checkPlayInterrupted, checkOffscreenMarker);

/** In gate mode "not measured" cannot pass a gameplay PR: UNKNOWN on these checks is a FAIL. */
export const GATE_STRICT = Object.freeze(['crucible_realm', 'player_control', 'tumble', 'player_ship', 'round_resolution', 'round_transitions']);
const GATE_STRICT_IDLE = Object.freeze(['player_ship', 'tumble']);

export function runChecks(trace) {
  const results = ALL_CHECKS.map((fn) => fn(trace));
  const gate = trace.meta.gate;
  if (!gate) return results;
  const strict = gate === 'idle' ? GATE_STRICT_IDLE : GATE_STRICT;
  for (const r of results) if (r.status === 'UNKNOWN' && strict.includes(r.id)) { r.status = 'FAIL'; r.detail = `not measured — gate counts UNKNOWN as FAIL (${r.detail})`; }
  return results;
}

/** Verdict over one run. ENVIRONMENT outranks a gameplay FAIL inside that run: the run was not the code under test.
 *  ADVISORY (load-noise frame time) is neither a FAIL nor an INCOMPLETE cause. Across arenas, gateExitCode prefers FAIL. */
export function overall(results) {
  if (results.some((r) => r.status === 'ENVIRONMENT')) return 'ENVIRONMENT';
  if (results.some((r) => r.status === 'FAIL')) return 'FAIL';
  if (results.some((r) => r.status === 'UNKNOWN')) return 'INCOMPLETE';
  return 'PASS';
}

/** The UNKNOWN checks that make an overall INCOMPLETE. Empty when the verdict is not INCOMPLETE. */
export function incompleteCauses(results) {
  if (overall(results) !== 'INCOMPLETE') return [];
  return results.filter((r) => r.status === 'UNKNOWN');
}
