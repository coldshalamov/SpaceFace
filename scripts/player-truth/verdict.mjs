// Short verdict: header, one line per check, worst offenders. Readable in under a minute.

const ICON = { PASS: 'PASS', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN', 'N/A': 'n/a' };

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
  L.push(`- Renderer: ${meta.renderer}${meta.softwareGl ? ' — SOFTWARE GL (SwiftShader): slow, frame times not representative' : ''}`);
  L.push(`- Browser: ${meta.headed ? 'headed' : 'headless'} Chromium ${meta.browserVersion} · ${meta.resolution} · ${meta.when}`);
  L.push(`- Run: ${meta.wallSeconds} s wall, ${meta.simSeconds} s of play sim time, ${meta.frames} frames sampled, ${meta.shots} screenshots · player script: ${meta.script}`);
  if (meta.stopReason) L.push(`- Stopped: ${meta.stopReason}`);
  L.push('');
  L.push('| Check | Result | Measured | Threshold |');
  L.push('|---|---|---|---|');
  for (const r of results) L.push(`| ${r.id} | **${ICON[r.status] || r.status}** | ${cell(r.value)} | ${cell(r.threshold)} |`);
  L.push('');
  const bad = results.filter((r) => r.status === 'FAIL' || r.status === 'UNKNOWN');
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
  for (const r of results) log(`  ${String(r.status).padEnd(7)} ${r.id.padEnd(19)} ${r.value == null ? '' : r.value}`);
  for (const [k, v] of Object.entries(paths || {})) log(`  ${k}: ${v}`);
}
