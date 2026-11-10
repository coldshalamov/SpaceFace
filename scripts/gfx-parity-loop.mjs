// Modern-parity loop driver.
//
// One round = capture every scene at 1080p through the real player route, hand each frame plus its
// matched 2020s reference set to the independent codex reviewer, then aggregate into a single
// worklist ordered by (visible improvement / frame cost).
//
// The gate is DUAL. A round is only an improvement if BOTH hold:
//   quality: no axis regressed against the previous round, and the mean axis score rose
//   perf:    no scene's p95 frame time regressed beyond PERF_TOLERANCE_MS
// A quality gain paid for with frame time is not a gain — see
// design/graphics-sprints/MODERN_PARITY_LOOP.md §4.
//
// Run: node scripts/gfx-parity-loop.mjs --round 1 [--scenes deep-flight,asteroid-field] [--capture-only]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const argv = parseArgs(process.argv.slice(2));
const ROUND = String(argv.round || '1');
const PORT = Number(argv.port || 8123);
const CAPTURE_ONLY = !!argv['capture-only'];
const REVIEW_ONLY = !!argv['review-only'];
const PERF_TOLERANCE_MS = Number(argv.perfTolerance || 1.5);
// Worst-case tolerance is wider than the steady-state one: a single dropped frame is not a
// regression, a doubled worst frame is. Gating on p95 alone is not enough — a combat capture
// measured p95 250ms while its true worst frame was 1836ms, so p95 hid the defect almost perfectly.
//
// CAVEAT worth knowing before trusting a single failing round: `max` is itself noisy. An observed
// change measured max 33.30ms once and 17.00/17.20ms on two immediate re-runs of the identical
// build — one stray frame would have failed a change that is actually free. Re-run a tail failure
// before acting on it; ideally take the median of 3.
const PERF_TAIL_TOLERANCE_MS = Number(argv.perfTailTolerance || 8);
// Any authored-asset admission inside the measurement window voids the perf half of the round.
const ADMISSION_CONTAMINATION_MS = Number(argv.admissionContaminationMs || 5);
// Reviews are median-of-N by default. A single sample's variance is the same size as a one-band
// improvement at the low end of the scale, so a 1-sample round cannot distinguish a real gain from
// a re-roll. Drop to 1 only for a quick look you will not act on.
const REVIEW_SAMPLES = Math.max(1, Number(argv.samples || 3));
const WIDTH = Number(argv.width || 1920);
const HEIGHT = Number(argv.height || 1080);

// sceneType -> the capture scenario that actually produces that view. Kept explicit because the
// mapping is NOT the identity: 'dense' seeds rocks outside the frustum and is an entity-count
// stress test, so the visual asteroid-field view uses its own scenario.
const SCENES = [
  // deep-flight is scored on the STATIONARY scenario on purpose, and it is the canonical
  // cross-round comparison frame.
  //
  // `cruise` flies the ship, so where it ends up decides what is in frame, and composition dominates
  // the score: two consecutive rounds returned background 2 then 1 (all three samples agreeing each
  // time) purely because one run caught the ringed planet large and well-placed and the next did
  // not. That makes cruise unusable for comparing a score against a previous round — the same
  // non-comparability already known for perf A/B.
  //
  // Motion evidence (plume, speed cues, velocity motes, in-flight frame cost) is covered by the
  // boost-travel row below, which DOES fly. Only `vfx` genuinely needs motion.
  //
  // MEASURED, not assumed: scoring a MOTION frame does not rescue `vfx`. It was reasonable to suspect
  // that a parked ship at speed 0 structurally depresses `vfx` and `composition` — the plume and every
  // motion cue are absent by construction. So the same route was captured in motion (speed 43, visible
  // plume, towed payload) and scored against the SAME references: overall 2.13 vs idle's 2.25, and
  // `vfx` stayed at 2 with the plume plainly in frame. `geometry` actually dropped to 2.
  //
  // So idle is NOT unfairly penalising us here, and the low `vfx` score is a judgement about the
  // quality of the effects themselves, not about their absence. Keep idle as the canonical comparison
  // frame. (Recorded because the opposite is an intuitive and wrong assumption — it was written into
  // this file as a "lesson" for several minutes before the measurement came back and refuted it.)
  { scene: 'deep-flight', scenario: 'idle' },
  { scene: 'asteroid-field', scenario: 'asteroid-field' },
  { scene: 'combat', scenario: 'combat-vfx' },
  // 'cruise-boost', not 'boost': `boost` assigns state.input directly and therefore never moves the
  // ship, so every boost-travel frame it produced showed SPD 0 — no speed language at all in a scene
  // whose entire purpose is speed language.
  { scene: 'boost-travel', scenario: 'cruise-boost' },
  { scene: 'ui-overlay', scenario: 'ui-overlay' },
];
const selected = argv.scenes
  ? SCENES.filter((s) => String(argv.scenes).split(',').map((x) => x.trim()).includes(s.scene))
  : SCENES;
if (!selected.length) { console.error(`[loop] no scenes matched --scenes=${argv.scenes}`); process.exit(2); }

const ROUND_DIR = `.devshots/gfx/rounds/${ROUND}`;
mkdirSync(ROUND_DIR, { recursive: true });

const captured = [];
if (!REVIEW_ONLY) {
  console.log(`[loop] round ${ROUND} — capturing ${selected.length} scenes at ${WIDTH}x${HEIGHT}`);
  let debugPort = 9400;
  for (const s of selected) {
    const shot = `${ROUND_DIR}/${s.scene}.jpg`;
    const report = `${ROUND_DIR}/${s.scene}.json`;
    try {
      execFileSync('node', ['scripts/capture-gameplay.mjs', String(PORT),
        '--scenario', s.scenario, '--width', String(WIDTH), '--height', String(HEIGHT),
        '--warmup', String(argv.warmup || 6000), '--duration', String(argv.duration || 10000),
        '--debugPort', String(debugPort++), '--out', report, '--shotPath', shot,
      ], { stdio: ['ignore', 'inherit', 'inherit'], timeout: 300000 });
    } catch {
      // capture-gameplay exits non-zero purely on the perf verdict; the artefacts are still valid.
    }
    if (!existsSync(shot)) { console.error(`[loop] FAILED to capture ${s.scene}`); continue; }
    captured.push({ ...s, shot, report });
  }
}
if (CAPTURE_ONLY) { console.log(`[loop] capture-only: artefacts in ${ROUND_DIR}`); process.exit(0); }

const list = captured.length ? captured : selected.map((s) => ({
  ...s, shot: `${ROUND_DIR}/${s.scene}.jpg`, report: `${ROUND_DIR}/${s.scene}.json`,
}));

const reviews = [];
for (const s of list) {
  if (!existsSync(s.shot)) { console.warn(`[loop] skip ${s.scene}: no frame`); continue; }
  const out = `${ROUND_DIR}/review-${s.scene}.json`;
  console.log(`\n[loop] reviewing ${s.scene}...`);
  try {
    execFileSync('node', ['scripts/gfx-review-frame.mjs', '--scene', s.scene, '--shot', s.shot,
      '--perf', s.report, '--out', out, '--packet', `${ROUND_DIR}/packet-${s.scene}`,
      '--samples', String(REVIEW_SAMPLES),
    ], { stdio: ['ignore', 'inherit', 'inherit'], timeout: 600000 * REVIEW_SAMPLES });
  } catch {
    // gfx-review-frame exits 1 on a FAIL verdict, which is the normal case early on.
  }
  if (existsSync(out)) reviews.push({ ...s, review: JSON.parse(readFileSync(out, 'utf8')) });
  else console.error(`[loop] no scorecard for ${s.scene}`);
}

if (!reviews.length) { console.error('[loop] no scorecards produced'); process.exit(1); }

// ---- aggregate ------------------------------------------------------------------------------
const COST_WEIGHT = { free: 1, cheap: 2, moderate: 5, expensive: 12 };
const worklist = [];
for (const r of reviews) {
  for (const a of r.review.axes || []) {
    // Value = how far below parity the axis is, divided by what the fix costs.
    worklist.push({
      scene: r.scene, axis: a.axis, score: a.score, cost: a.cost,
      value: Number(((5 - a.score) / (COST_WEIGHT[a.cost] || 5)).toFixed(3)),
      technique: a.technique, fix: a.fix, gap: a.gap, evidence: a.evidence,
    });
  }
}
worklist.sort((a, b) => b.value - a.value || a.score - b.score);

const perScene = reviews.map((r) => {
  const axes = r.review.axes || [];
  const mean = axes.length ? axes.reduce((s, a) => s + a.score, 0) / axes.length : 0;
  // Read perf from the capture report directly: it carries p99/max and the phase breakdown that the
  // reviewer's summary does not.
  let report = null;
  try { report = JSON.parse(readFileSync(r.report, 'utf8')); } catch { /* perf half goes void below */ }
  const ft = (report && report.frameMs) || {};
  // frameMs carries last/avg/min/max/p95 but no p99; perf.frameCallback does carry p99. Prefer the
  // real percentile when it exists rather than silently gating on a field that is always undefined.
  const cb = (report && report.perf && report.perf.frameCallback) || {};
  const admission = (report && report.perf && report.perf.phases && report.perf.phases.admission) || null;
  // A run whose measurement window contained authored-asset admission is NOT measuring rendering
  // cost — a single non-preemptible buildComposedShip has been observed at 1836ms. Treat that the
  // same way a SwiftShader run is treated: the perf half of the gate is void, not passed.
  const admissionMax = admission && Number.isFinite(admission.max) ? admission.max : 0;
  const contaminated = admissionMax > ADMISSION_CONTAMINATION_MS;
  const gpu = (report && report.capture && report.capture.gpu) || '';
  const softwareGl = /swiftshader|llvmpipe|software|basic render/i.test(gpu);
  return {
    scene: r.scene, verdict: r.review.verdict, readsAsIntentional: r.review.readsAsIntentional,
    meanScore: Number(mean.toFixed(2)),
    axes: Object.fromEntries(axes.map((a) => [a.axis, a.score])),
    p95: ft.p95, p99: Number.isFinite(ft.p99) ? ft.p99 : cb.p99, max: ft.max, avg: ft.avg,
    callbackP99: cb.p99, callbackMax: cb.max,
    calls: report && report.render && report.render.calls,
    triangles: report && report.render && report.render.triangles,
    admissionMax,
    perfValid: !contaminated && !softwareGl,
    perfVoidReason: softwareGl ? `software GL (${gpu})` : (contaminated ? `admission max ${admissionMax.toFixed(1)}ms in window` : null),
    summary: r.review.overallSummary,
  };
});

const summary = {
  round: ROUND,
  generatedAt: new Date().toISOString(),
  overallMean: Number((perScene.reduce((s, p) => s + p.meanScore, 0) / perScene.length).toFixed(2)),
  allPass: perScene.every((p) => p.verdict === 'PASS'),
  scenes: perScene,
  worklist: worklist.slice(0, 25),
};
writeFileSync(`${ROUND_DIR}/SUMMARY.json`, JSON.stringify(summary, null, 2));

// ---- dual gate vs the previous round --------------------------------------------------------
const prevRound = argv.compareTo || String(Number(ROUND) - 1);
const prevPath = `.devshots/gfx/rounds/${prevRound}/SUMMARY.json`;
let gate = null;
if (existsSync(prevPath)) {
  const prev = JSON.parse(readFileSync(prevPath, 'utf8'));
  const prevByScene = new Map(prev.scenes.map((s) => [s.scene, s]));
  const regressions = [];
  const qualityWarnings = [];
  const perfRegressions = [];
  const perfVoid = [];
  for (const s of perScene) {
    const p = prevByScene.get(s.scene);
    if (!p) continue;
    // Reviewer scores are a SINGLE LLM sample per axis and carry real variance: an observed round
    // moved composition 1->2 and ui_integration 3->2 on a change that only added a background body.
    // Failing on any one-point dip therefore manufactures regressions. A single 1-point dip is a
    // warning; a 2+ point dip, or two axes dipping at once, is treated as a real regression.
    const dips = [];
    for (const [axis, score] of Object.entries(s.axes)) {
      if (p.axes[axis] == null || score >= p.axes[axis]) continue;
      const drop = p.axes[axis] - score;
      const row = `${s.scene}/${axis}: ${p.axes[axis]} -> ${score}`;
      if (drop >= 2) regressions.push(row); else dips.push(row);
    }
    if (dips.length >= 2) regressions.push(...dips);
    else qualityWarnings.push(...dips);
    // Perf can only pass or be void — never pass by default on an uninterpretable run.
    if (!s.perfValid || p.perfValid === false) {
      perfVoid.push(`${s.scene}: ${s.perfVoidReason || 'previous round perf was void'}`);
      continue;
    }
    if (Number.isFinite(s.p95) && Number.isFinite(p.p95) && s.p95 > p.p95 + PERF_TOLERANCE_MS) {
      perfRegressions.push(`${s.scene}: p95 ${p.p95.toFixed(2)} -> ${s.p95.toFixed(2)}ms`);
    }
    // The tail is what the player actually feels. Check it explicitly.
    for (const key of ['p99', 'max']) {
      if (Number.isFinite(s[key]) && Number.isFinite(p[key]) && s[key] > p[key] + PERF_TAIL_TOLERANCE_MS) {
        perfRegressions.push(`${s.scene}: ${key} ${p[key].toFixed(2)} -> ${s[key].toFixed(2)}ms`);
      }
    }
  }
  gate = {
    comparedTo: prevRound,
    qualityDelta: Number((summary.overallMean - prev.overallMean).toFixed(2)),
    qualityRegressions: regressions,
    qualityWarnings,
    perfRegressions,
    perfVoid,
    pass: regressions.length === 0 && perfRegressions.length === 0 && perfVoid.length === 0
      && summary.overallMean > prev.overallMean,
  };
  summary.gate = gate;
  writeFileSync(`${ROUND_DIR}/SUMMARY.json`, JSON.stringify(summary, null, 2));
}

console.log(`\n================ ROUND ${ROUND} ================`);
for (const s of perScene) {
  console.log(`${s.verdict === 'PASS' ? 'PASS' : 'FAIL'}  ${s.scene.padEnd(16)} mean ${s.meanScore.toFixed(2)}/5  p95 ${fmt(s.p95)}  p99 ${fmt(s.p99)}  max ${fmt(s.max)}ms  calls ${s.calls}${s.perfValid ? '' : `  [PERF VOID: ${s.perfVoidReason}]`}`);
}
console.log(`overall mean ${summary.overallMean}/5`);
if (gate) {
  console.log(`\ngate vs round ${gate.comparedTo}: ${gate.pass ? 'PASS' : 'FAIL'} (quality ${gate.qualityDelta >= 0 ? '+' : ''}${gate.qualityDelta})`);
  for (const r of gate.qualityRegressions) console.log(`  QUALITY REGRESSION ${r}`);
  for (const r of gate.qualityWarnings) console.log(`  quality dip (within reviewer variance) ${r}`);
  for (const r of gate.perfRegressions) console.log(`  PERF REGRESSION    ${r}`);
  for (const r of gate.perfVoid) console.log(`  PERF VOID          ${r}`);
}
console.log('\n---- next work, best visible-gain-per-frame-cost first ----');
for (const w of worklist.slice(0, 8)) {
  console.log(`  ${w.value.toFixed(2)}  ${w.scene}/${w.axis} (${w.score}/5, ${w.cost}) — ${w.technique}`);
}
console.log(`\n[loop] summary: ${ROUND_DIR}/SUMMARY.json`);
process.exit(summary.allPass ? 0 : 1);

function fmt(v) { return Number.isFinite(v) ? v.toFixed(1) : '?'; }

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; } else out[key] = true;
  }
  return out;
}
