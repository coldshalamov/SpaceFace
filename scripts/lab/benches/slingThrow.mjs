// Sling-throw bench (#5): latch a payload through the REAL input path, spin it with the shipped
// orbit assist (W+D, optional boost), then press the throw (actions.throwArm, the RMB lane) at
// every 2nd tick across ~1.5 revolutions — one fresh world per press. Each press is followed
// until the payload passes its target. Measures where the throw went against the aim, the exit
// speed against the speed the swing had, and how wide the press window that still hits is.
import { createLabWorld, playerFlightProfile, SIM_DT } from '../labWorld.mjs';
import { stats, r4 } from '../labMetrics.mjs';
import { V4, mulberry32 } from './tetherSpin.mjs';
import * as orbitAssistModule from '../../../src/core/flight/orbitAssist.js';
import * as throwModule from '../../../src/systems/masslineThrow.js';
// Lab seams exist only on lab/tuning-phase1; on a production checkout every run is "shipped".
const setOrbitAssistLab = orbitAssistModule.setOrbitAssistLab || (() => {});
const setMasslineThrowLab = throwModule.setMasslineThrowLab || (() => {});

const HZ = Math.round(1 / SIM_DT);
const s2t = (s) => Math.round(s * HZ);
const MS_PER_TICK = 1000 / HZ;
// The orbit assist config PR #227 ships (line lock 1.25, governor 0.95, align 0.55 = master).
export const TETHER_227 = V4({ lineLockMargin: 1.25, lockGovernorMargin: 0.95 });

// target: { dist, radius, vel?, kind: 'rock'|'payload' }   payload: { mass, radius, dist }
export const SCENARIOS = {
  'light-300': { desc: '20-mass payload on 70 wu, static rock r22 at 300 wu', payload: { mass: 20, radius: 4, dist: 70 }, target: { dist: 300, radius: 22 } },
  'light-150': { desc: '20-mass payload, static rock at 150 wu', payload: { mass: 20, radius: 4, dist: 70 }, target: { dist: 150, radius: 22 } },
  'pair-300': { desc: '60-mass payload (pair swings about a shared centre), rock at 300', payload: { mass: 60, radius: 5, dist: 70 }, target: { dist: 300, radius: 22 } },
  'pair-150': { desc: '60-mass payload, rock at 150', payload: { mass: 60, radius: 5, dist: 70 }, target: { dist: 150, radius: 22 } },
  'light-300-small': { desc: '20-mass payload, small r10 drifting target at 300 (moving 40 wu/s across)', payload: { mass: 20, radius: 4, dist: 70 }, target: { dist: 300, radius: 10, vel: { x: 0, z: 40 }, kind: 'payload' } },
  'light-300-boost': { desc: '20-mass payload, Shift held through the spin, rock at 300', payload: { mass: 20, radius: 4, dist: 70 }, target: { dist: 300, radius: 22 }, boost: true },
  'pair-300-long': { desc: '60-mass payload on a 120 wu line, rock at 300', payload: { mass: 60, radius: 5, dist: 120 }, target: { dist: 300, radius: 22 } },
};
export const DEFAULT_SCENARIOS = Object.keys(SCENARIOS);
export const VARIANTS = { baseline: {} };

const PRESS_FROM_S = 5.0;
const PRESS_SPAN_TICKS = 120; // 2 s of press offsets
const PRESS_STEP = 2;

async function onePress(sc, seed, pressT, params) {
  const world = await createLabWorld({ seed, settings: { controlScheme: 'pilot', orbitAssistStrength: 'standard',
    masslineReleaseAssist: params.assist || 'snap' } });
  setOrbitAssistLab(params.orbitLab || TETHER_227);
  setMasslineThrowLab(params.throwLab || {});
  try {
    const rng = mulberry32(seed * 7919 + 17);
    const jitter = (rng() - 0.5) * 0.2;
    const ang = Math.PI / 2 + (rng() - 0.5) * 0.6;
    world.spawnPlayer({ pos: { x: 0, z: 0 }, rot: jitter });
    const pl = sc.payload;
    const rock = world.spawnRock({ pos: { x: Math.cos(ang) * pl.dist, z: Math.sin(ang) * pl.dist }, mass: pl.mass, radius: pl.radius });
    const tg = sc.target;
    const tgt = tg.kind === 'payload'
      ? world.spawnRock({ pos: { x: tg.dist, z: -120 }, mass: 5000, radius: tg.radius, vel: tg.vel || null })
      : world.spawnAsteroid({ pos: { x: tg.dist, z: 0 }, radius: tg.radius });
    await world.prepare();
    const st = world.state;
    // Aim the throw with the cursor (the pointer lane): selecting the target before the latch would
    // let the latch itself pick the target when it is in tether range.
    const inputSys = world.inputSys;
    const orig = inputSys.update.bind(inputSys);
    let held = false;
    inputSys.update = (dt, s) => { const r = orig(dt, s); if (s.input && s.input.actions) s.input.actions.throwArm = held; return r; };
    let cut = null; let pre = null; let latched = false; let solAtPress = null; let minMiss = Infinity; let onTicks = []; let peak = 0;
    const endT = pressT + s2t(4);
    for (let t = 0; t < endT; t++) {
      const rk = st.entities.get(rock.id);
      const codes = [];
      if (t >= 2 && t < 5) { codes.push('Space'); world.aim.x = rk.pos.x; world.aim.z = rk.pos.z; }
      else { const tt = st.entities.get(tgt.id); world.aim.x = tt.pos.x; world.aim.z = tt.pos.z; }
      if (t >= 20 && cut == null) { codes.push('KeyW', 'KeyD'); if (sc.boost && t >= s2t(1)) codes.push('ShiftLeft'); }
      held = t >= pressT && t < pressT + 3;
      world.keys(codes, { pointer: true });
      const rv = { x: rk.vel.x, z: rk.vel.z };
      world.step();
      const th = st.player.tether; const lt = st.massline2 && st.massline2.throw;
      const r2 = st.entities.get(rock.id); const t2 = st.entities.get(tgt.id);
      if (th && th.active && th.targetId === rock.id) latched = true;
      if (!cut && th && th.active && t >= pressT - PRESS_SPAN_TICKS && t < pressT) peak = Math.max(peak, Math.hypot(r2.vel.x, r2.vel.z));
      if (!cut && lt && lt.solution && lt.solution.onSolution) onTicks.push(t);
      if (t === pressT && lt && lt.solution) solAtPress = { on: !!lt.solution.onSolution, enterS: lt.solution.window ? lt.solution.window.enterS : null, reliable: !!(lt.solution.window && lt.solution.window.reliable) };
      if (!cut && latched && th && !th.active) {
        const v = Math.hypot(r2.vel.x, r2.vel.z);
        const toT = Math.atan2(t2.pos.z - r2.pos.z, t2.pos.x - r2.pos.x);
        const lastThrow = lt && lt.lastThrow;
        const pred = lastThrow && lastThrow.prediction;
        cut = { t, delay: t - pressT, mode: lastThrow ? lastThrow.mode : 'other', v, vPre: Math.hypot(rv.x, rv.z),
          hdg: Math.atan2(r2.vel.z, r2.vel.x), bearing: toT, range: Math.hypot(t2.pos.x - r2.pos.x, t2.pos.z - r2.pos.z),
          predAngle: pred && Number.isFinite(pred.interceptAngle) ? pred.interceptAngle : null };
        pre = { x: r2.pos.x, z: r2.pos.z };
      }
      if (cut) {
        const miss = Math.hypot(t2.pos.x - r2.pos.x, t2.pos.z - r2.pos.z) - tg.radius - pl.radius;
        minMiss = Math.min(minMiss, miss);
        if (miss < 0.5) break;
      }
    }
    const val = st.massline2 && st.massline2.throw && st.massline2.throw.lastReleaseValidation;
    const latchedOk = latched;
    const firstOn = onTicks.find((x) => x >= pressT);
    const actualEnter = firstOn != null ? firstOn - pressT : null;
    return { pressT, latched: latchedOk, cut: cut ? { ...cut, hit: minMiss < 0.5, miss: r4(minMiss) } : null, solAtPress, peak, onTicks, actualEnter,
      divergence: val && Number.isFinite(val.divergenceRad) ? val.divergenceRad : null };
  } finally {
    world.dispose();
    setOrbitAssistLab({});
    setMasslineThrowLab({});
  }
}

const wrap = (a) => { let x = a % (2 * Math.PI); if (x <= -Math.PI) x += 2 * Math.PI; if (x > Math.PI) x -= 2 * Math.PI; return x; };

export async function runScenario(id, { seed = 1, params = {} } = {}) {
  const sc = SCENARIOS[id];
  if (!sc) throw new Error(`unknown sling scenario ${id}`);
  const from = s2t(PRESS_FROM_S);
  const presses = [];
  for (let p = from; p < from + PRESS_SPAN_TICKS; p += PRESS_STEP) presses.push(await onePress(sc, seed, p, params));
  return summarize(id, sc, seed, presses);
}

function summarize(id, sc, seed, presses) {
  const cuts = presses.filter((p) => p.cut);
  const hits = cuts.filter((p) => p.cut.hit);
  const snaps = cuts.filter((p) => p.cut.mode === 'snap');
  // Revolution period from the on-solution windows the swing passed through (onTicks of the
  // last press = the longest un-cut swing). Windows = runs of consecutive on-solution ticks.
  const longest = presses[presses.length - 1];
  const wins = runs(longest.onTicks);
  const starts = wins.map((w) => w[0]);
  const periodT = starts.length >= 2 ? (starts[starts.length - 1] - starts[0]) / (starts.length - 1) : null;
  const revs = periodT ? PRESS_SPAN_TICKS / periodT : null;
  // Hit windows in press time (runs of hitting presses on the 2-tick grid).
  const hitRuns = runs(hits.map((p) => p.pressT), PRESS_STEP);
  const hitWindowMs = hitRuns.map((r) => (r[r.length - 1] - r[0] + PRESS_STEP) * MS_PER_TICK);
  const onWindowMs = wins.map((w) => w.length * MS_PER_TICK);
  const exitEff = cuts.map((p) => p.cut.v / Math.max(1e-6, p.cut.vPre));
  const phaseEff = cuts.map((p) => p.cut.v / Math.max(1e-6, p.peak));
  const headErr = snaps.map((p) => Math.abs(wrap(p.cut.hdg - (p.cut.predAngle ?? p.cut.bearing))) * 180 / Math.PI);
  // Early/late tolerance: press offset (ms) of each hitting press relative to the on-solution
  // window it hit in (negative = pressed early and queued).
  const offsets = [];
  for (const h of hits) {
    const w = wins.find((ww) => h.cut.t >= ww[0] - 1 && h.cut.t <= ww[ww.length - 1] + 1);
    if (w) offsets.push((h.pressT - w[0]) * MS_PER_TICK);
  }
  return {
    scenario: id, seed, presses: presses.length, cuts: cuts.length, latchFails: presses.filter((p) => !p.latched).length,
    periodS: periodT ? r4(periodT / HZ) : null,
    hitPct: r4(100 * hits.length / Math.max(1, cuts.length)),
    // Hit window per revolution (ms of press time that still hits).
    hitMsPerRev: revs ? r4(hits.length * PRESS_STEP * MS_PER_TICK / revs) : null,
    hitWindowMs: stats(hitWindowMs), onWindowMs: stats(onWindowMs),
    earliestMs: offsets.length ? r4(Math.min(...offsets)) : null, latestMs: offsets.length ? r4(Math.max(...offsets)) : null,
    snapN: snaps.length, snapHitPct: snaps.length ? r4(100 * snaps.filter((p) => p.cut.hit).length / snaps.length) : null,
    snapManualHits: cuts.filter((p) => p.cut.mode !== 'snap' && p.cut.hit).length,
    queuedN: cuts.filter((p) => p.cut.delay > 0).length,
    queuedMissN: cuts.filter((p) => p.cut.delay > 0 && !p.cut.hit).length,
    exitEff: stats(exitEff), phaseEff: stats(phaseEff), exitSpeed: stats(cuts.map((p) => p.cut.v)),
    hitSpeed: stats(hits.map((p) => p.cut.v)), peakSpeed: stats(presses.map((p) => p.peak)),
    headErrDeg: stats(headErr),
    divergenceDeg: stats(cuts.map((p) => (p.divergence == null ? null : Math.abs(p.divergence) * 180 / Math.PI))),
    rangeAtCut: stats(cuts.map((p) => p.cut.range)),
    unreliableAtPressPct: r4(100 * presses.filter((p) => p.solAtPress && !p.solAtPress.reliable).length / presses.length),
    // [pressT, cut delay, mode, hit, miss, exit v, forecast enter ticks at press, actual enter ticks]
    pressLog: presses.map((p) => [p.pressT, p.cut ? p.cut.delay : null, p.cut ? p.cut.mode : null, p.cut ? +p.cut.hit : null, p.cut ? r4(p.cut.miss) : null, p.cut ? r4(p.cut.v) : null,
      p.solAtPress && p.solAtPress.enterS != null ? Math.round(p.solAtPress.enterS * HZ) : null, p.actualEnter]),
    forecastErrTicks: stats(presses.filter((p) => p.solAtPress && p.solAtPress.enterS != null && p.actualEnter != null && p.solAtPress.enterS <= 0.25)
      .map((p) => p.actualEnter - Math.round(p.solAtPress.enterS * HZ))),
  };
}

function runs(ticks, step = 1) {
  const out = []; let cur = null;
  for (const t of [...ticks].sort((a, b) => a - b)) {
    if (cur && t - cur[cur.length - 1] <= step) cur.push(t); else { cur = [t]; out.push(cur); }
  }
  return out;
}

export function summarizeRuns(results) {
  const groups = new Map();
  for (const r of results) { const k = `${r.variant}|${r.scenario}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? r4(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const out = [];
  for (const [k, rs] of groups) {
    const [variant, scenario] = k.split('|');
    out.push({ variant, scenario, seeds: rs.length,
      period: mean(rs.map((r) => r.periodS)), hitPct: mean(rs.map((r) => r.hitPct)), hitMsPerRev: mean(rs.map((r) => r.hitMsPerRev)),
      onMs: mean(rs.map((r) => r.onWindowMs.mean)), early: mean(rs.map((r) => r.earliestMs)), late: mean(rs.map((r) => r.latestMs)),
      snapHit: mean(rs.map((r) => r.snapHitPct)), snapN: rs.reduce((a, r) => a + r.snapN, 0),
      queuedMiss: rs.reduce((a, r) => a + r.queuedMissN, 0), queued: rs.reduce((a, r) => a + r.queuedN, 0),
      exitEff: mean(rs.map((r) => r.exitEff.min)), phaseEff: mean(rs.map((r) => r.phaseEff.mean)), hitSpeed: mean(rs.map((r) => r.hitSpeed.mean)),
      peak: mean(rs.map((r) => r.peakSpeed.mean)), headErr: rs.reduce((m, r) => Math.max(m, r.headErrDeg.max || 0), 0),
      unreliable: mean(rs.map((r) => r.unreliableAtPressPct)) });
  }
  return out;
}

export const COLUMNS = [
  { label: 'variant', key: 'variant' }, { label: 'scenario', key: 'scenario' }, { label: 'T s', key: 'period' },
  { label: 'hit%', key: 'hitPct' }, { label: 'hit ms/rev', key: 'hitMsPerRev' }, { label: 'on ms', key: 'onMs' },
  { label: 'early ms', key: 'early' }, { label: 'late ms', key: 'late' }, { label: 'snap hit%', key: 'snapHit' }, { label: 'snapN', key: 'snapN' },
  { label: 'queued', key: 'queued' }, { label: 'queuedMiss', key: 'queuedMiss' }, { label: 'exitEff min', key: 'exitEff' },
  { label: 'v hit', key: 'hitSpeed' }, { label: 'v peak', key: 'peak' }, { label: 'headErr° max', key: 'headErr' }, { label: 'unrel%', key: 'unreliable' },
];
