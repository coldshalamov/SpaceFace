import { formatHarnessOverhead } from './checks.mjs';
// Short verdict: header, one line per check, worst offenders. Readable in under a minute.

const ICON = { PASS: 'PASS', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN', 'N/A': 'n/a', ENVIRONMENT: 'ENVIRONMENT', ADVISORY: 'ADVISORY' };

/**
 * One line for the opening effect-family warm (#434): whether it ran or was skipped on this GPU and
 * why. A KHR_parallel_shader_compile GPU skips it ('parallel-compile-cook'), so a real-GPU A/B there
 * shows no regression rather than the warm's benefit. null when the run recorded nothing.
 */
export function openingEffectWarmLine(warm) {
  if (!warm) return null;
  const gpu = `KHR_parallel_shader_compile ${warm.khr === true ? 'yes' : warm.khr === false ? 'no' : '?'}${warm.software ? ' · software GPU' : ''}`;
  if (!warm.present) return `not run (no receipt) · ${gpu}`;
  const n = (list) => Array.isArray(list) ? list.length : 0;
  const ran = warm.reason !== 'parallel-compile-cook';
  return `${ran ? 'ran' : 'skipped'} · reason ${warm.reason ?? '?'} · ${gpu}${ran ? ` · ${n(warm.touched)} touched, ${n(warm.timedOut)} timed out, ${n(warm.skipped)} skipped, ${warm.failed ?? 0} failed, ${warm.sweeps ?? '?'} sweeps` : ''}`;
}

export function renderVerdict({ meta, results, overall, paths }) {
  const L = [];
  L.push(`# Player-truth verdict: ${overall} — ${meta.label}`);
  L.push('');
  L.push(`- Mode: ${meta.mode}${meta.arena ? ` · arena ${meta.arena}` : ''} · seed ${meta.seedSet === false && meta.runSeed != null ? `${meta.runSeed} (requested ${meta.seed}; field not settable on this route)` : meta.runSeed != null ? meta.runSeed : meta.seed} · build ${meta.commit}${meta.dirty ? ' (dirty)' : ''}`);
  if (meta.startCommit) {
    const paths = (list) => list == null ? 'status unavailable' : list.length ? list.join(', ') : 'no dirty source paths';
    L.push(`- Source at start: ${meta.startCommit} · ${paths(meta.startDirtySourcePaths)}`);
    L.push(`- Source at end: ${meta.endCommit} · ${paths(meta.endDirtySourcePaths)}`);
  }
  L.push(`- Renderer: ${meta.renderer}${meta.softwareGl ? ' — SOFTWARE GL (SwiftShader): absolute frame times are software-renderer evidence, graded only against --baseline' : ''}`);
  const warmLine = openingEffectWarmLine(meta.openingEffectWarm);
  if (warmLine) L.push(`- Opening effect warm: ${warmLine}`);
  L.push(`- Browser: ${meta.headed ? 'headed' : 'headless'} Chromium ${meta.browserVersion} · ${meta.resolution} · ${meta.when}`);
  if (meta.performanceContext) {
    const context = meta.performanceContext, observer = context.observer || {};
    L.push(`- Performance context: ${context.quietHost ? 'marked quiet host' : 'unmarked/contended development host'} · ${context.authority} · observer: ${observer.pixelSplitPasses ?? '?'} render/readback passes every ${observer.pixelSplitEveryFrames ?? '?'} frames; screenshots every ${observer.screenshotEveryMs ?? '?'} ms, included in measured wall time`);
  }
  L.push(`- Run: ${meta.wallSeconds} s wall, ${meta.simSeconds} s of play sim time, ${meta.frames} frames sampled, ${meta.shots} screenshots · player script: ${meta.script}`);
  if (meta.stopReason) L.push(`- Stopped: ${meta.stopReason}`);
  if (meta.gradedRun === 'retry') {
    L.push('- Graded run: this verdict is the retry. The first run is not graded.');
    if (meta.firstStopReason) L.push(`- First run stopped: ${meta.firstStopReason}`);
  }
  if (meta.environmentRetry) L.push(`- Environment retry: ${meta.environmentRetry}`);
  if (meta.sessionSignals && meta.sessionSignals.length) L.push(`- Session signals ignored (Chrome left running): ${meta.sessionSignals.join(', ')}`);
  if (meta.harnessFreezes && meta.harnessFreezes.length) {
    const bits = meta.harnessFreezes.map((freeze) => {
      const lagS = Math.round(Number(freeze.lagMs) / 1000);
      const start = Number.isFinite(Number(freeze.startWall)) ? new Date(Number(freeze.startWall)).toISOString() : '?';
      const end = Number.isFinite(Number(freeze.endWall)) ? new Date(Number(freeze.endWall)).toISOString() : '?';
      return `${lagS} s (${start} → ${end})`;
    });
    L.push(`- Harness clock freezes (≥20 s): ${bits.join('; ')}`);
  }
  if (meta.hostPressureError) L.push(`- Host pressure: dmesg unavailable: ${meta.hostPressureError}`);
  else if (meta.hostPressure && meta.hostPressure.length) {
    L.push(`- Host pressure (dmesg, run window): ${meta.hostPressure.length} line(s)`);
    const seen = new Set();
    for (const line of meta.hostPressure) {
      if (seen.has(line)) continue;
      seen.add(line);
      L.push(`  - ${line}`);
      if (seen.size >= 4) break;
    }
  }
  if (overall === 'INCOMPLETE') {
    const unknown = results.filter((r) => r.status === 'UNKNOWN');
    L.push('');
    L.push('Incomplete because:');
    for (const r of unknown) L.push(`- ${r.id} — ${r.detail}`);
  }
  if (overall === 'ENVIRONMENT') {
    const env = results.find((r) => r.status === 'ENVIRONMENT');
    L.push('');
    L.push(`HARNESS ENVIRONMENT (not a gameplay FAIL): ${env ? env.detail : 'served assets or the route load did not match HEAD'}`);
  }
  const advisory = results.filter((r) => r.status === 'ADVISORY');
  if (advisory.length) {
    L.push('');
    L.push('Advisory (not a FAIL):');
    for (const r of advisory) L.push(`- ${r.id} — ${r.detail}`);
  }
  const frameRow = results.find((r) => r.id === 'frame_time');
  const harness = frameRow && (frameRow.harness_overhead || (frameRow.frame && frameRow.frame.harness_overhead));
  if (harness) {
    const raw = frameRow.frame && frameRow.frame.raw;
    L.push(`- Harness overhead (reader tasks excluded from frame_time): ${formatHarnessOverhead(harness)}${raw ? ` · harness-inclusive p99 ${Math.round(raw.p99)} ms, ${raw.longTasks} long tasks` : ''}`);
  }
  L.push('');
  L.push('| Check | Result | Measured | Threshold |');
  L.push('|---|---|---|---|');
  for (const r of results) L.push(`| ${r.id} | **${ICON[r.status] || r.status}** | ${cell(r.value)} | ${cell(r.threshold)} |`);
  L.push('');
  const bad = results.filter((r) => r.status === 'FAIL' || r.status === 'UNKNOWN' || r.status === 'ENVIRONMENT');
  if (bad.length) {
    L.push('## Worst offenders');
    for (const r of bad) {
      L.push(`- **${r.id}** (${r.status}) — ${r.detail}`);
      for (const o of (r.offenders || []).slice(0, 3)) L.push(`  - ${o.line}`);
    }
    L.push('');
  }
  if (paths) {
    L.push('## Files');
    for (const [k, v] of Object.entries(paths)) L.push(`- ${k}: \`${v}\``);
  }
  return L.join('\n') + '\n';
}

const cell = (v) => (v == null ? '—' : String(v).replace(/\|/g, '/'));

export function printSummary({ meta, results, overall, paths }, log = console.log) {
  log(`player-truth ${overall} · ${meta.label} · ${meta.renderer}${meta.softwareGl ? ' (software GL)' : ''}`);
  if (overall === 'INCOMPLETE') {
    const unknown = results.filter((r) => r.status === 'UNKNOWN');
    log(`  incomplete because: ${unknown.map((r) => r.id).join(', ') || 'no UNKNOWN check'}`);
    for (const r of unknown) log(`    ${r.id}: ${r.detail}`);
  }
  if (overall === 'ENVIRONMENT') log('  harness environment — not a gameplay FAIL');
  if (meta.gradedRun === 'retry') {
    log('  graded run: retry, the first run is not graded');
    if (meta.firstStopReason) log(`  first run stopped: ${meta.firstStopReason}`);
  }
  if (meta.environmentRetry) log(`  environment retry: ${meta.environmentRetry}`);
  if (meta.sessionSignals && meta.sessionSignals.length) log(`  session signals ignored, chrome left running: ${meta.sessionSignals.join(', ')}`);
  if (meta.harnessFreezes && meta.harnessFreezes.length) log(`  harness clock freezes: ${meta.harnessFreezes.length}`);
  if (meta.hostPressure && meta.hostPressure.length) log(`  host pressure dmesg lines: ${meta.hostPressure.length}`);
  for (const r of results) if (r.status === 'ADVISORY') log(`  advisory ${r.id}: ${r.detail}`);
  for (const r of results) log(`  ${String(r.status).padEnd(12)} ${r.id.padEnd(19)} ${r.value == null ? '' : r.value}`);
  for (const [k, v] of Object.entries(paths || {})) log(`  ${k}: ${v}`);
}
