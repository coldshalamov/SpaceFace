// Player-truth checks. Pure functions over a recorded trace, so they run in fixture tests
// without a browser (test/player-truth-checks.test.mjs). Every check returns a number, a
// threshold and the moments (wall time + screen box) that prove it. A check that could not
// measure returns UNKNOWN with the reason — never PASS.

import { PLAYER_TRUTH_CLASSES } from '../../src/testing/playerTruth/reader.js';

export const E = Object.freeze({ id: 0, cls: 1, x: 2, z: 3, vx: 4, vz: 5, sx: 6, sy: 7, pr: 8, vis: 9, key: 10, type: 11 });
export const CLS = Object.freeze(Object.fromEntries(PLAYER_TRUTH_CLASSES.map((c, i) => [c, i])));
export const VIS = Object.freeze({ unknown: 0, hidden: 1, offscreen: 2, onscreen: 3, pooled: 4 });

/** Mode design numbers the checks grade against. Sources are named so a reviewer can argue them. */
export const MODE_DESIGN = Object.freeze({
  swarm: { minRoundSeconds: 20, source: 'SWARM_WAVE_DURATION_TICKS = 3600 (60 s wave), src/data/swarmMode.js; N = one third of the designed wave' },
  gauntlet: { minRoundSeconds: 20, source: 'Crucible gauntlet waves (build_map §12); N = 20 s, same floor as Swarm' },
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
  vfxCoverP95: 0.25, vfxPlayerOccludedFrac: 0.1, vfxThreatOccludedP95: 0.3, vfxPersistSeconds: 3,
  longTaskMs: 250, frameP99Ms: 50,
});

const result = (id, title, status, value, threshold, detail, offenders = [], moments = []) => ({ id, title, status, value, threshold, detail, offenders, moments });
const fmt = (n, d = 2) => (n == null || !Number.isFinite(n) ? 'n/a' : Number(n.toFixed(d)).toString());

/** Samples during actual play: flight, no pausing screen, run active when the mode has rounds. */
export function playSamples(trace) {
  return trace.samples.filter((s) => s.mode === 'flight' && (!s.run || s.run.ph === 'active' || !trace.meta.rounds));
}

function keyName(trace, k) { return k >= 0 ? (trace.keys[k] || String(k)) : null; }

export function checkLodChurn(trace) {
  const T = THRESHOLDS; const samples = playSamples(trace);
  if (samples.length < 10) return result('lod_churn', 'LOD / model swap churn', 'UNKNOWN', null, T.lodSwapsPer10s, 'too few play frames sampled');
  const last = new Map(); const swaps = new Map(); let total = 0; let measured = 0;
  const playerSwaps = [];
  for (const s of samples) {
    if (s.p && s.p.meshId) {
      const pk = `${s.p.meshId}|${s.p.model}|${s.p.lod}|${s.p.state}`;
      const prev = last.get('P');
      if (prev && prev.k !== pk) playerSwaps.push({ t: s.t, sim: s.sim, from: prev.k, to: pk, box: s.p.box });
      last.set('P', { k: pk });
    }
    for (const e of s.e) {
      const k = e[E.key]; if (k < 0) continue;
      measured++;
      const prev = last.get(e[E.id]);
      if (prev && prev.k !== k) {
        total++;
        const list = swaps.get(e[E.id]) || []; list.push({ sim: s.sim, t: s.t, from: prev.k, to: k, cls: e[E.cls], box: boxOf(e), on: e[E.vis] === VIS.onscreen });
        swaps.set(e[E.id], list);
      }
      last.set(e[E.id], { k });
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
  const totalRate = (total + playerSwaps.length) / span;
  const maxPer10 = worst.length ? worst[0].per10 : 0;
  const fail = maxPer10 > T.lodSwapsPer10s || totalRate > T.lodTotalPerSec;
  const offenders = worst.slice(0, 4).map((w) => ({
    line: `entity ${w.id} (${PLAYER_TRUTH_CLASSES[w.at.cls]}) ${w.per10} swaps in 10 s (${w.n} total) — last ${shortKey(keyName(trace, w.at.from))} → ${shortKey(keyName(trace, w.at.to))} at sim ${fmt(w.at.sim, 1)} s`,
    t: w.at.t, sim: w.at.sim, box: w.at.on ? w.at.box : null,
  }));
  if (playerSwaps.length) offenders.unshift({ line: `player ship swapped model/LOD ${playerSwaps.length}× (first sim ${fmt(playerSwaps[0].sim, 1)} s: ${playerSwaps[0].from} → ${playerSwaps[0].to})`, t: playerSwaps[0].t, sim: playerSwaps[0].sim, box: playerSwaps[0].box });
  return result('lod_churn', 'LOD / model swap churn', fail ? 'FAIL' : 'PASS',
    `max ${maxPer10}/10s per entity · ${fmt(totalRate)}/s total`, `≤${T.lodSwapsPer10s}/10s per entity · ≤${T.lodTotalPerSec}/s total`,
    `${total + playerSwaps.length} swaps over ${fmt(span, 1)} sim s across ${swaps.size} entities`, offenders, offenders.filter((o) => o.t != null).slice(0, 3));
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
  const killedIds = new Set(trace.events.filter((ev) => ev.ev === 'killed').map((ev) => ev.id));
  const inner = (e, s) => e[E.sx] > s.vw * 0.1 && e[E.sx] < s.vw * 0.9 && e[E.sy] > s.vh * 0.1 && e[E.sy] < s.vh * 0.9 && e[E.pr] >= 2;
  let prev = null; const pops = []; const flaps = new Map(); let births = 0; let measured = 0;
  for (const s of samples) {
    const cur = new Map(s.e.map((e) => [e[E.id], e]));
    if (prev) {
      for (const [id, e] of cur) {
        const p = prev.map.get(id);
        if (e[E.vis] === VIS.unknown || e[E.vis] === VIS.pooled) continue;
        measured++;
        if (!p) { if (e[E.vis] === VIS.onscreen && inner(e, s) && e[E.cls] !== CLS.projectile && e[E.cls] !== CLS.fx) births++; continue; }
        const toggled = (p[E.vis] === VIS.onscreen && e[E.vis] === VIS.hidden) || (p[E.vis] === VIS.hidden && e[E.vis] === VIS.onscreen);
        if (toggled && inner(e, s)) {
          pops.push({ id, kind: e[E.vis] === VIS.onscreen ? 'appeared' : 'vanished', s, e });
          flaps.set(id, (flaps.get(id) || 0) + 1);
        }
      }
      for (const [id, p] of prev.map) {
        if (cur.has(id) || p[E.vis] !== VIS.onscreen || !inner(p, prev.s) || killedIds.has(id) || !REMOVAL_CLASSES.has(p[E.cls])) continue;
        pops.push({ id, kind: 'removed without death', s: prev.s, e: p });
      }
    }
    prev = { s, map: cur };
  }
  if (!measured) return result('popping', 'Pop-in / pop-out on screen', 'UNKNOWN', null, `≤${T.popsPerMin}/min`, 'no per-entity mesh visibility to read');
  const span = Math.max(1e-3, samples[samples.length - 1].sim - samples[0].sim) / 60;
  const rate = pops.length / span;
  const maxFlap = Math.max(0, ...flaps.values());
  const byId = new Map(); for (const p of pops) { const r = byId.get(p.id) || { n: 0, p }; r.n++; byId.set(p.id, r); }
  const offenders = [...byId.values()].sort((a, b) => b.n - a.n).slice(0, 4).map((r) => ({
    line: `entity ${r.p.id} (${PLAYER_TRUTH_CLASSES[r.p.e[E.cls]]}) ${r.p.kind} on screen ${r.n}× — first sim ${fmt(r.p.s.sim, 1)} s`, t: r.p.s.t, sim: r.p.s.sim, box: boxOf(r.p.e),
  }));
  return result('popping', 'Pop-in / pop-out on screen', rate > T.popsPerMin || maxFlap > T.popFlapsPerEntity ? 'FAIL' : 'PASS',
    `${fmt(rate, 1)}/min · worst entity ${maxFlap} toggles`, `≤${T.popsPerMin}/min · ≤${T.popFlapsPerEntity} toggles`,
    `${pops.length} pops inside the inner 80% of the view; ${births} non-projectile bodies born on screen (info)`, offenders, offenders.slice(0, 3));
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
  const starts = rounds.length ? rounds.map((r) => ({ label: `round ${r.wave}`, sim: r.startSim })) : (trace.meta.playStartSim != null ? [{ label: 'spawn', sim: trace.meta.playStartSim }] : []);
  if (!starts.length) return result('spawn_motion', 'Unexplained motion at spawn', 'UNKNOWN', null, `0 bodies >${T.spawnSpeed} u/s`, 'no spawn moment recorded');
  const offenders = []; let count = 0;
  for (const st of starts) {
    const s = trace.samples.find((x) => x.sim >= st.sim && x.mode === 'flight');
    if (!s || !s.p) continue;
    const firstIn = inputsBetween(trace, st.sim, st.sim + 1e9)[0];
    if (firstIn && firstIn.sim < s.sim) continue;
    for (const e of s.e) {
      if (!(e[E.cls] === CLS.asteroid || e[E.cls] === CLS.pickup || e[E.cls] === CLS.other)) continue;
      const d = Math.hypot(e[E.x] - s.p.x, e[E.z] - s.p.z); if (d > T.spawnRadius) continue;
      const sp = Math.hypot(e[E.vx], e[E.vz]);
      if (sp > T.spawnSpeed) {
        count++;
        offenders.push({ sp, line: `${st.label}: ${PLAYER_TRUTH_CLASSES[e[E.cls]]} ${e[E.id]} moving ${fmt(sp, 1)} u/s ${fmt(d, 0)} u from the player before any input`, t: s.t, sim: s.sim, box: e[E.vis] === VIS.onscreen || e[E.vis] === VIS.pooled ? boxOf(e) : null });
      }
    }
  }
  offenders.sort((a, b) => b.sp - a.sp);
  return result('spawn_motion', 'Unexplained motion at spawn', count > 0 ? 'FAIL' : 'PASS', `${count} bodies`, `0 passive bodies >${T.spawnSpeed} u/s within ${T.spawnRadius} u`,
    `${starts.length} spawn moment(s) checked`, offenders.slice(0, 4), offenders.filter((o) => o.box).slice(0, 2));
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
  if (!design.minRoundSeconds) return result('round_resolution', 'Round resolves by play', 'N/A', null, null, 'mode has no rounds');
  const done = rounds.filter((r) => r.endSim != null && (r.endPhase === 'cleanup' || r.endPhase === 'draft' || r.endPhase === 'victory'));
  if (!done.length) return result('round_resolution', 'Round resolves by play', 'UNKNOWN', null, `≥${design.minRoundSeconds} s and player input`, rounds.length ? 'no round was won inside the run' : 'no round started');
  const offenders = []; let minDur = Infinity; let fail = false;
  for (const r of done) {
    const dur = r.endSim - r.startSim; minDur = Math.min(minDur, dur);
    const inputs = inputsBetween(trace, r.startSim, r.endSim).length;
    const why = [];
    if (dur < design.minRoundSeconds) why.push(`won in ${fmt(dur, 1)} s < ${design.minRoundSeconds} s`);
    if (!inputs) why.push('won with zero player input');
    if (why.length) { fail = true; offenders.push({ line: `round ${r.wave}: ${why.join('; ')}`, t: r.endT, sim: r.endSim, box: null }); }
  }
  return result('round_resolution', 'Round resolves by play', fail ? 'FAIL' : 'PASS', `shortest ${fmt(minDur, 1)} s`, `≥${design.minRoundSeconds} s and ≥1 input (${design.source})`,
    `${done.length} round(s) resolved`, offenders, offenders.slice(0, 2));
}

export function checkPlayerControl(trace) {
  const T = THRESHOLDS; const probes = trace.probes || [];
  if (!probes.length) return result('player_control', 'Ship answers input', 'UNKNOWN', null, `thrust Δv≥${T.thrustDeltaSpeed} u/s · yaw Δ≥${T.yawDeltaRad} rad`, 'no control probe ran');
  const offenders = []; let worst = null;
  for (const pr of probes) {
    const a = nearestSample(trace, pr.startSim); const b = nearestSample(trace, pr.endSim);
    if (!a || !b || !a.p || !b.p) { offenders.push({ line: `${pr.label}: no player sample`, t: pr.startT, sim: pr.startSim, box: null, bad: true }); continue; }
    if (pr.kind === 'thrust') {
      const dv = Math.hypot(b.p.vx, b.p.vz) - Math.hypot(a.p.vx, a.p.vz);
      const moved = Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z);
      pr.value = dv;
      if (dv < T.thrustDeltaSpeed && moved < 3) offenders.push({ line: `${pr.label}: held W ${fmt(pr.endSim - pr.startSim, 1)} s → Δspeed ${fmt(dv, 1)} u/s, moved ${fmt(moved, 1)} u`, t: b.t, sim: b.sim, box: b.p.box, bad: true });
    } else if (pr.kind === 'yaw') {
      let d = b.p.rot - a.p.rot; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      pr.value = d;
      if (Math.abs(d) < T.yawDeltaRad) offenders.push({ line: `${pr.label}: held ${pr.key} ${fmt(pr.endSim - pr.startSim, 1)} s → turned ${fmt(d, 2)} rad`, t: b.t, sim: b.sim, box: b.p.box, bad: true });
    }
    worst = worst || pr;
  }
  const bad = offenders.filter((o) => o.bad).length;
  return result('player_control', 'Ship answers input', bad ? 'FAIL' : 'PASS', `${bad}/${probes.length} probes dead`, `thrust Δv≥${T.thrustDeltaSpeed} u/s · yaw Δ≥${T.yawDeltaRad} rad`,
    probes.map((p) => `${p.label} ${fmt(p.value, 2)}`).join(' · '), offenders, offenders.slice(0, 2));
}

function nearestSample(trace, sim) {
  let best = null; let bd = Infinity;
  for (const s of trace.samples) { const d = Math.abs(s.sim - sim); if (d < bd) { bd = d; best = s; } }
  return bd < 1 ? best : null;
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
    if (Math.abs(p.angVel) > T.tumbleAngVel && !inIntervals(yawHeld, s.sim)) why.push(`spin ${fmt(p.angVel, 1)} rad/s uncommanded`);
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

export function checkReadability(trace) {
  const T = THRESHOLDS; const r = trace.readability;
  if (!r || !r.classes) return result('readability', 'Enemy / asteroid / projectile readable', 'UNKNOWN', null, `separation ≥${T.readabilityMinSeparation}`, 'no frame analysis');
  const pairs = (r.pairs || []).filter((p) => p.nA >= T.readabilityMinSamples && p.nB >= T.readabilityMinSamples);
  const counts = Object.entries(r.classes).map(([k, v]) => `${k} ${v.n}`).join(', ');
  if (!pairs.length) return result('readability', 'Enemy / asteroid / projectile readable', 'UNKNOWN', null, `separation ≥${T.readabilityMinSeparation}`, `not enough on-screen samples per class (${counts}; need ${T.readabilityMinSamples})`);
  const bad = pairs.filter((p) => p.sep < T.readabilityMinSeparation).sort((a, b) => a.sep - b.sep);
  const lowContrast = Object.entries(r.classes).filter(([k, v]) => (k === 'enemy' || k === 'projectile') && v.n >= T.readabilityMinSamples && v.lowContrastFrac > 0.5);
  const offenders = [
    ...bad.map((p) => ({ line: `${p.a} vs ${p.b}: separation ${fmt(p.sep)} (colour Δ ${fmt(p.dColor, 1)}, size ratio ${fmt(p.sizeRatio, 2)}) over ${p.nA}/${p.nB} samples`, t: p.exampleT, sim: null, box: p.exampleBox })),
    ...lowContrast.map(([k, v]) => ({ line: `${k}: ${fmt(v.lowContrastFrac * 100, 0)}% of samples barely differ from the background (ΔL < 8)`, t: v.exampleT, sim: null, box: v.exampleBox })),
  ];
  const minSep = Math.min(...pairs.map((p) => p.sep));
  return result('readability', 'Enemy / asteroid / projectile readable', offenders.length ? 'FAIL' : 'PASS', `min separation ${fmt(minSep)}`, `≥${T.readabilityMinSeparation} per class pair; ≤50% low-contrast`,
    `samples: ${counts}`, offenders.slice(0, 4), offenders.filter((o) => o.box).slice(0, 2));
}

export function checkVfx(trace) {
  const T = THRESHOLDS; const scans = playSamples(trace).filter((s) => s.vfx && !s.vfx.err);
  if (scans.length < 5) return result('vfx_coverage', 'VFX coverage / occlusion', 'UNKNOWN', null, `p95 ≤${T.vfxCoverP95}`, 'too few VFX scans');
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
    `${scans.length} scans of additive/transparent layers (bounding-sphere footprint on a 48×27 grid; ${unb} screen-sized batches excluded)`,
    offenders.slice(0, 5), offenders.filter((o) => o.box).slice(0, 2));
}

export function checkLoadout(trace) {
  const L = trace.loadout;
  if (!L) return result('loadout', 'Loadout readable and relevant', trace.meta.hasLoadout ? 'UNKNOWN' : 'N/A', null, '0 irrelevant · 0 undescribed · 0 silent swaps', trace.meta.hasLoadout ? 'loadout screen not audited' : 'mode has no preparation loadout');
  const offenders = [];
  for (const it of L.irrelevant || []) offenders.push({ line: `irrelevant to ${trace.meta.mode}: ${it.name} (${it.category}) — ${it.reason}`, t: L.shotT, box: it.box });
  for (const it of L.undescribed || []) offenders.push({ line: `no description: ${it.name}`, t: L.shotT, box: it.box });
  for (const sw of L.silentSwaps || []) offenders.push({ line: `silent replace: installing ${sw.bought} removed ${sw.removed.join(', ')}; screen said "${(sw.said || '').slice(0, 80)}"`, t: sw.t, box: null });
  const n = (L.irrelevant || []).length + (L.undescribed || []).length + (L.silentSwaps || []).length;
  const status = n ? 'FAIL' : (L.swapProbe === 'not-run' ? 'UNKNOWN' : 'PASS');
  return result('loadout', 'Loadout readable and relevant', status,
    `${(L.irrelevant || []).length} irrelevant · ${(L.undescribed || []).length} undescribed · ${(L.silentSwaps || []).length} silent swaps`, '0 · 0 · 0',
    `${L.items.length} offers read; swap probe: ${L.swapProbe}`, offenders.slice(0, 6), offenders.filter((o) => o.t != null).slice(0, 1));
}

export function checkFrameTime(trace) {
  const T = THRESHOLDS; const samples = playSamples(trace).filter((s) => s.dt > 0);
  if (samples.length < 10) return result('frame_time', 'Frame time / long tasks', 'UNKNOWN', null, null, 'too few frames');
  const dts = samples.map((s) => s.dt).sort((a, b) => a - b);
  const p50 = dts[Math.floor(dts.length * 0.5)]; const p99 = dts[Math.floor(dts.length * 0.99)];
  const t0 = samples[0].t; const t1 = samples[samples.length - 1].t;
  const longs = (trace.longTasks || []).filter((l) => l.t >= t0 && l.t <= t1 && l.d >= T.longTaskMs).sort((a, b) => b.d - a.d);
  const worstFrames = samples.slice().sort((a, b) => b.dt - a.dt).slice(0, 3);
  const offenders = [
    ...longs.slice(0, 3).map((l) => ({ line: `long task ${fmt(l.d, 0)} ms at sim ${fmt(l.sim, 1)} s (frame ${l.f})`, t: l.t, sim: l.sim, box: null })),
    ...worstFrames.map((s) => ({ line: `frame ${s.f}: ${fmt(s.dt, 0)} ms at sim ${fmt(s.sim, 1)} s (${s.e.length} entities${s.info ? `, ${s.info.calls} draws` : ''})`, t: s.t, sim: s.sim, box: null })),
  ];
  const value = `p50 ${fmt(p50, 0)} ms · p99 ${fmt(p99, 0)} ms · ${longs.length} long tasks ≥${T.longTaskMs} ms`;
  if (trace.meta.softwareGl) return result('frame_time', 'Frame time / long tasks', 'UNKNOWN', value, `p99 ≤${T.frameP99Ms} ms · 0 long tasks ≥${T.longTaskMs} ms`, 'software GL (SwiftShader): frame time is not the player\'s — rerun headed on a GPU to grade', offenders.slice(0, 4), []);
  return result('frame_time', 'Frame time / long tasks', p99 > T.frameP99Ms || longs.length ? 'FAIL' : 'PASS', value, `p99 ≤${T.frameP99Ms} ms · 0 long tasks ≥${T.longTaskMs} ms`, `${samples.length} play frames`, offenders.slice(0, 4), offenders.filter((o) => o.t != null).slice(0, 2));
}

export function checkRoute(trace) {
  const r = trace.route || { steps: [] };
  const failed = r.steps.find((s) => !s.ok);
  const reached = r.steps.filter((s) => s.ok).map((s) => s.name).join(' → ');
  return result('route', 'Public route plays end to end', failed ? 'FAIL' : (r.steps.length ? 'PASS' : 'UNKNOWN'), reached || 'none', 'every step through public controls',
    failed ? `stalled at ${failed.name}: ${failed.detail || ''}` : `${r.steps.length} steps`, failed ? [{ line: `${failed.name}: ${failed.detail || 'failed'}`, t: failed.t, box: null }] : [], failed && failed.t ? [{ line: failed.name, t: failed.t, box: null }] : []);
}

export const ALL_CHECKS = [checkRoute, checkRoundResolution, checkKillsBeforeInput, checkRewardBeforeInput, checkSpawnMotion, checkPlayerControl, checkTumble,
  checkPlayerShip, checkLodChurn, checkPopping, checkReadability, checkVfx, checkLoadout, checkFrameTime];

export function runChecks(trace) { return ALL_CHECKS.map((fn) => fn(trace)); }

/** Verdict over a check list: any FAIL fails; otherwise UNKNOWN beats PASS. */
export function overall(results) {
  if (results.some((r) => r.status === 'FAIL')) return 'FAIL';
  if (results.some((r) => r.status === 'UNKNOWN')) return 'INCOMPLETE';
  return 'PASS';
}
