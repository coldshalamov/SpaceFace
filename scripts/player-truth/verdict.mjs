// Short verdict: header, one line per check, worst offenders. Readable in under a minute.

const ICON = { PASS: 'PASS', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN', 'N/A': 'n/a', ENVIRONMENT: 'ENVIRONMENT', ADVISORY: 'ADVISORY' };

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
  L.push(`- Browser: ${meta.headed ? 'headed' : 'headless'} Chromium ${meta.browserVersion} · ${meta.resolution} · ${meta.when}`);
  if (meta.performanceContext) {
    const context = meta.performanceContext, observer = context.observer || {};
    L.push(`- Performance context: ${context.quietHost ? 'marked quiet host' : 'unmarked/contended development host'} · ${context.authority} · observer: ${observer.pixelSplitPasses ?? '?'} render/readback passes every ${observer.pixelSplitEveryFrames ?? '?'} frames; screenshots every ${observer.screenshotEveryMs ?? '?'} ms, included in measured wall time`);
  }
  L.push(`- Run: ${meta.wallSeconds} s wall, ${meta.simSeconds} s of play sim time, ${meta.frames} frames sampled, ${meta.shots} screenshots · player script: ${meta.script}`);
  if (meta.stopReason) L.push(`- Stopped: ${meta.stopReason}`);
  if (meta.environmentRetry) L.push(`- Environment retry: ${meta.environmentRetry}`);
  if (meta.sessionSignals && meta.sessionSignals.length) L.push(`- Session signals ignored (Chrome left running): ${meta.sessionSignals.join(', ')}`);
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
  if (meta.environmentRetry) log(`  environment retry: ${meta.environmentRetry}`);
  if (meta.sessionSignals && meta.sessionSignals.length) log(`  session signals ignored, chrome left running: ${meta.sessionSignals.join(', ')}`);
  for (const r of results) if (r.status === 'ADVISORY') log(`  advisory ${r.id}: ${r.detail}`);
  for (const r of results) log(`  ${String(r.status).padEnd(12)} ${r.id.padEnd(19)} ${r.value == null ? '' : r.value}`);
  for (const [k, v] of Object.entries(paths || {})) log(`  ${k}: ${v}`);
}
