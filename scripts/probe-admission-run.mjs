// Throwaway: run combat capture with background-job admission probe enabled via --eval.
// Does not edit forbidden files. Dev server must already be on PORT (default 8123).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const evalPath = join(__dirname, 'probe-admission-enable-eval.js');
const outJson = join(root, '.devshots/gfx/admission-probe.json');
const outShot = join(root, '.devshots/gfx/admission-probe.jpg');
const analysisPath = join(root, '.devshots/gfx/admission-probe-analysis.json');

const evalJs = readFileSync(evalPath, 'utf8').trim();
// capture-gameplay wraps: return String(${EVAL_JS})
// so EVAL_JS must be a full expression (our file is an IIFE).

const args = [
  join(root, 'scripts/capture-gameplay.mjs'),
  '8123',
  '--scenario', 'combat-vfx',
  '--width', '1920',
  '--height', '1080',
  '--warmup', '6000',
  '--duration', '12000',
  '--debugPort', '9370',
  '--out', outJson,
  '--shotPath', outShot,
  '--eval', evalJs,
];

console.log('[probe-admission] launching capture-gameplay with backgroundJob tracking --eval');
const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});

const code = await new Promise((resolve) => child.on('exit', resolve));
if (code !== 0) {
  console.error(`[probe-admission] capture-gameplay exited ${code}`);
  process.exit(code || 1);
}

if (!existsSync(outJson)) {
  console.error('[probe-admission] missing output', outJson);
  process.exit(2);
}

const report = JSON.parse(readFileSync(outJson, 'utf8'));
const analysis = analyze(report);
writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
printReport(analysis);
console.log(`[probe-admission] wrote ${analysisPath}`);

function analyze(report) {
  const perf = report.perf || {};
  const bg = perf.backgroundJobs || {};
  const probe = perf.admissionProbe || null;
  const phaseAdmission = perf.phases && perf.phases.admission;

  const jobs = Array.isArray(bg.records) ? bg.records.slice() : [];
  const upgradeJobs = probe && Array.isArray(probe.upgradeJobs) ? probe.upgradeJobs : [];
  const slices = probe && Array.isArray(probe.slices) ? probe.slices : [];
  const frames = probe && Array.isArray(probe.frames) ? probe.frames : [];

  // Join background jobs <-> upgrade diagnostics by backgroundJobId or sourceSequence.
  const upgradesByBgId = new Map();
  const upgradesBySeq = new Map();
  for (const u of upgradeJobs) {
    if (u.backgroundJobId != null) upgradesByBgId.set(u.backgroundJobId, u);
    if (u.sequence != null) upgradesBySeq.set(u.sequence, u);
  }

  const enrichedJobs = jobs.map((j) => {
    const u = (j.backgroundJobId != null && upgradesByBgId.get(j.backgroundJobId))
      || (j.sourceSequence != null && upgradesBySeq.get(j.sourceSequence))
      || null;
    return {
      backgroundJobId: j.backgroundJobId,
      kind: j.kind,
      sourceSequence: j.sourceSequence,
      durationMs: j.durationMs,
      terminal: j.terminal,
      originDisplayFrameId: j.origin && j.origin.displayFrameId,
      originRenderFrameId: j.origin && j.origin.renderFrameId,
      originSimTick: j.origin && j.origin.simTick,
      endDisplayFrameId: j.endOrigin && j.endOrigin.displayFrameId,
      entityType: u && u.entityType,
      entityId: u && u.entityId,
      key: u && u.key,
      assetUrls: u && u.assetUrls,
      estimatedBytes: u && u.estimatedBytes,
      cacheStatus: u && u.cacheStatus,
      upgradeDurationMs: u && u.durationMs,
      upgradeStatus: u && u.status,
    };
  });

  // Worst attributed admission frame (from beginFrame samples).
  const worstFrame = frames.slice().sort((a, b) => b.admissionMs - a.admissionMs)[0] || null;

  // Slices attributed near the worst frame (same displayFrameId, or largest raw slices).
  const slicesOnWorst = worstFrame
    ? slices.filter((s) => s.displayFrameId === worstFrame.displayFrameId
      || s.displayFrameId === worstFrame.displayFrameId - 1)
    : [];
  const topSlices = slices.slice().sort((a, b) => b.ms - a.ms).slice(0, 20);

  // Jobs active / ending around worst frame, or top duration jobs overall.
  let jobsOnWorst = [];
  if (worstFrame) {
    const fid = worstFrame.displayFrameId;
    jobsOnWorst = enrichedJobs.filter((j) => {
      const start = j.originDisplayFrameId;
      const end = j.endDisplayFrameId;
      if (start == null) return false;
      // Job started on this frame, or spanned across it.
      if (start === fid || start === fid - 1) return true;
      if (end != null && start <= fid && end >= fid) return true;
      return false;
    });
  }
  const topJobs = enrichedJobs.slice().sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));

  // Per-frame job counts by origin displayFrameId.
  const byOriginFrame = new Map();
  for (const j of enrichedJobs) {
    const fid = j.originDisplayFrameId;
    if (fid == null) continue;
    if (!byOriginFrame.has(fid)) byOriginFrame.set(fid, []);
    byOriginFrame.get(fid).push(j);
  }
  let densestFrame = null;
  for (const [fid, list] of byOriginFrame) {
    const sum = list.reduce((a, j) => a + (j.durationMs || 0), 0);
    if (!densestFrame || list.length > densestFrame.count
      || (list.length === densestFrame.count && sum > densestFrame.sumDurationMs)) {
      densestFrame = { displayFrameId: fid, count: list.length, sumDurationMs: sum, jobs: list };
    }
  }

  // ONE vs MANY from admission SLICE evidence (main-thread blocking), not wall-clock job time.
  const largestSlice = topSlices[0] || null;
  const sliceSumOnWorst = slicesOnWorst.reduce((a, s) => a + s.ms, 0);
  const oneObject = largestSlice && (
    (worstFrame && largestSlice.ms >= worstFrame.admissionMs * 0.7)
    || largestSlice.ms >= 100
  );
  const manyOnWorst = slicesOnWorst.length >= 3
    && largestSlice
    && worstFrame
    && largestSlice.ms < worstFrame.admissionMs * 0.5;

  let verdict = 'INCONCLUSIVE';
  if (oneObject && !manyOnWorst) verdict = 'ONE';
  else if (manyOnWorst || (slicesOnWorst.length > 1 && largestSlice && worstFrame
    && largestSlice.ms < worstFrame.admissionMs * 0.6)) verdict = 'MANY';
  else if (largestSlice && worstFrame && largestSlice.ms >= worstFrame.admissionMs * 0.7) verdict = 'ONE';
  else if (topJobs[0] && topJobs[0].durationMs >= 150 && (topJobs[1] == null || topJobs[0].durationMs > 2 * (topJobs[1].durationMs || 0))) {
    // Strong single wall-clock job; composition is serial (concurrency=1).
    verdict = 'ONE';
  }

  return {
    schema: 'spaceface.admissionProbeAnalysis.v1',
    capture: {
      out: outJson,
      samples: report.samples,
      frameMax: report.frameMs && report.frameMs.max,
      frameP95: report.frameMs && report.frameMs.p95,
      admissionPhase: phaseAdmission || null,
      backgroundJobsEnabled: bg.enabled === true,
      backgroundJobRecordCount: jobs.length,
      probePresent: !!probe,
    },
    enableMechanism: {
      flag: 'state.perfRuntime.setBackgroundJobTrackingEnabled(true)',
      api: 'src/core/perfRuntime.js → setBackgroundJobTrackingEnabled / isBackgroundJobTrackingEnabled',
      default: false,
      env: 'none (runtime API only; not env-gated)',
      callers: [
        'src/render/partsLibrary.js beginUpgradeDiagnostic → beginBackgroundJob("authored-upgrade")',
        'scripts/probe-performance-profile.mjs enables for profile windows',
      ],
      reportField: 'perf.backgroundJobs (schema spaceface.performanceBackgroundJobs.v1)',
    },
    worstFrame,
    slicesOnWorst: slicesOnWorst.sort((a, b) => b.ms - a.ms),
    topSlices,
    jobsOnWorst: jobsOnWorst.sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0)),
    topJobs: topJobs.slice(0, 15),
    densestOriginFrame: densestFrame,
    allEnrichedJobs: enrichedJobs,
    verdict,
    largestSlice,
    sliceSumOnWorst,
  };
}

function printReport(a) {
  console.log('\n========== ADMISSION PROBE REPORT ==========');
  console.log(`backgroundJobs.enabled: ${a.capture.backgroundJobsEnabled}`);
  console.log(`job records: ${a.capture.backgroundJobRecordCount}`);
  console.log(`probe present: ${a.capture.probePresent}`);
  console.log(`frame max/p95: ${a.capture.frameMax} / ${a.capture.frameP95}`);
  if (a.capture.admissionPhase) {
    console.log(`admission phase p50/p95/max: ${a.capture.admissionPhase.p50} / ${a.capture.admissionPhase.p95} / ${a.capture.admissionPhase.max}`);
  }
  if (a.worstFrame) {
    console.log(`\nWorst admission frame: displayFrameId=${a.worstFrame.displayFrameId} admissionMs=${a.worstFrame.admissionMs.toFixed(2)}`);
    console.log(`  slices on/near frame: ${a.slicesOnWorst.length}  sum=${a.sliceSumOnWorst.toFixed(2)}ms`);
    for (const s of a.slicesOnWorst.slice(0, 10)) {
      console.log(`    slice ${s.ms.toFixed(2)}ms  displayFrameId=${s.displayFrameId} simTick=${s.simTick}`);
    }
  } else {
    console.log('\nNo per-frame admission samples (probe beginFrame wrap may have missed).');
  }
  console.log('\nTop admission slices (all):');
  for (const s of a.topSlices.slice(0, 10)) {
    console.log(`  ${s.ms.toFixed(2)}ms  displayFrameId=${s.displayFrameId} simTick=${s.simTick}`);
  }
  console.log('\nJobs on/near worst frame:');
  for (const j of a.jobsOnWorst.slice(0, 12)) {
    console.log(`  #${j.backgroundJobId} ${j.kind} seq=${j.sourceSequence} dur=${j.durationMs?.toFixed?.(2) ?? j.durationMs}ms type=${j.entityType} id=${j.entityId} key=${j.key} cache=${j.cacheStatus}`);
    if (j.assetUrls && j.assetUrls.length) console.log(`     assets: ${j.assetUrls.slice(0, 4).join(', ')}`);
  }
  console.log('\nTop jobs by wall duration:');
  for (const j of a.topJobs.slice(0, 10)) {
    console.log(`  #${j.backgroundJobId} ${j.kind} seq=${j.sourceSequence} dur=${j.durationMs?.toFixed?.(2) ?? j.durationMs}ms type=${j.entityType} id=${j.entityId} key=${j.key}`);
    if (j.assetUrls && j.assetUrls.length) console.log(`     assets: ${j.assetUrls.slice(0, 4).join(', ')}`);
  }
  if (a.densestOriginFrame) {
    console.log(`\nDensest origin frame: displayFrameId=${a.densestOriginFrame.displayFrameId} count=${a.densestOriginFrame.count} sumWall=${a.densestOriginFrame.sumDurationMs?.toFixed?.(1)}`);
  }
  console.log(`\nLargest single slice: ${a.largestSlice ? a.largestSlice.ms.toFixed(2) + 'ms' : 'n/a'}`);
  console.log(`VERDICT (ONE vs MANY): ${a.verdict}`);
  console.log('============================================\n');
}
