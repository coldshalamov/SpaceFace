import fs from 'node:fs';
import path from 'node:path';
import { REPORT_SCHEMA, VERDICT_SCHEMA } from './constants.mjs';
import { isSvgPayload } from './payload.mjs';

export const LIMITATIONS = Object.freeze([
  'Lab rendering is detached. These images are semantic projections of sim poses and package metadata, not GPU frames.',
  'Frame half-extents follow camera.js clampFocusToPlayerSafeRect (fov, zoom, 0.72, 16:9). A tilted frustum can show more ground than this safe rect.',
  'Pixel, exposure, anti-alias, and compositor differences are review items. They do not fail the build.',
  'Stations, gates, beacons, and landmarks are joined from authored sector anchors because the flight-lab bundle does not call world.enterSector.',
  'Asteroid rings use the production place id and size range at the authored field center. They are not a second scatter simulation.',
  'Live shield and shieldMax are on the lab checkpoint surface. While the current shield is above zero, the presented disc is the live shell radius (entity.radius) with coverage 0.22. A shield of 0 draws no disc.',
  'No WebGL context is created. runtimeFps is null. captureCostMs is witness wall time, not a frame-time measurement.',
  'Whole-ship LOD runtime demotion is off. Census LOD outline flags are review items, not drawn swaps.',
]);

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function payloadBytes(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const bytes = payload.bytes ?? payload.pixels ?? payload.image ?? null;
  if (bytes == null || typeof bytes === 'string') return null;
  if (typeof bytes.length === 'number') return bytes.length;
  return null;
}

/**
 * A semantic SVG diagram is not a captured frame.
 * gpuFrame is true only for a non-SVG payload marked as a real capture.
 * SVG bytes are recognized by an svg or xml marker, with or without a format tag.
 */
export function claimGpuFrame(witness) {
  if (!witness || typeof witness !== 'object') return false;
  if (witness.captureKind === 'semantic-projection' || witness.captureKind === 'svg' || witness.captureKind === 'semantic-svg') {
    return false;
  }
  if (witness.captureKind !== 'gpu-frame') return false;
  const payload = witness.frameCapture ?? witness.pixels ?? witness.frameBytes ?? null;
  if (payload == null || isSvgPayload(payload)) return false;
  if (typeof payload === 'string') return false;
  const size = payloadBytes(payload);
  return size != null && size > 0;
}

export function publishCapture(witness) {
  const gpuFrame = claimGpuFrame(witness);
  return {
    ...witness,
    gpuFrame,
    captureKind: gpuFrame ? 'gpu-frame' : 'semantic-projection',
  };
}

export function sceneSvg(witness) {
  const frame = witness.frame;
  const pad = 8;
  const minX = -frame.halfH - pad;
  const minY = -frame.halfV - pad;
  const width = frame.halfH * 2 + pad * 2;
  const height = frame.halfV * 2 + pad * 2;
  const colors = {
    ship: '#d7ecff',
    station: '#e7c27a',
    asteroid: '#b9a48a',
    payload: '#f0d2a0',
    prop: '#c9b6e8',
  };
  const body = (witness.objects || []).map((object) => {
    if (!object.screen) return '';
    const color = colors[object.type] || '#cccccc';
    const dash = object.screen.onScreen ? '' : ' stroke-dasharray="2 2"';
    const drawn = Number.isFinite(object.presentedRadius) && object.presentedRadius > 0
      ? object.presentedRadius
      : (Number.isFinite(object.colliderRadius) && object.colliderRadius > 0 ? object.colliderRadius : 0.4);
    const shieldEffect = (object.effects || []).find((effect) => effect && effect.kind === 'shield');
    const shieldDrawn = shieldEffect ? Number(shieldEffect.radius) : NaN;
    const shieldGeometry = Number(object.shieldGeometryRadius);
    const shieldRadius = Number.isFinite(shieldDrawn) && shieldDrawn > 0
      ? shieldDrawn
      : (Number.isFinite(shieldGeometry) && shieldGeometry > 0 ? shieldGeometry : 0);
    const shieldCircle = shieldRadius > 0
      ? `<circle class="shield" cx="${object.screen.x}" cy="${object.screen.z}" r="${shieldRadius}" fill="none" stroke="#7ee0ff" stroke-opacity="0.9"/>`
      : '';
    return `<g>${shieldCircle}<circle cx="${object.screen.x}" cy="${object.screen.z}" r="${Math.max(drawn, 0.4)}" fill="${color}" fill-opacity="0.35" stroke="${color}"${dash}/><text x="${object.screen.x}" y="${object.screen.z - Math.max(drawn, 1) - 1}" font-size="3" fill="#d5dbe6">${esc(object.alias || object.objectId)}</text></g>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}">
  <desc>Semantic projection. Not a GPU frame. Seed ${esc(witness.seed)} tick ${esc(witness.tick)} zoom ${esc(witness.zoom)} tier ${esc(witness.qualityTier)}.</desc>
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#10141c"/>
  <rect x="${-frame.halfH}" y="${-frame.halfV}" width="${frame.halfH * 2}" height="${frame.halfV * 2}" fill="none" stroke="#6d8299"/>
  <text x="${minX + 2}" y="${minY + 6}" font-size="4" fill="#f2d48a">SEMANTIC PROJECTION — not a GPU frame</text>
  ${body}
</svg>
`;
}

export function writeAtlas(outDir, report) {
  const published = {
    ...report,
    packs: (report.packs || []).map((pack) => ({
      ...pack,
      views: (pack.views || []).map((view) => publishCapture(view)),
    })),
  };
  fs.mkdirSync(outDir, { recursive: true });
  const captureDir = path.join(outDir, 'captures');
  fs.mkdirSync(captureDir, { recursive: true });
  const links = [];
  for (const pack of published.packs || []) {
    if (!pack.views) continue;
    const dir = path.join(captureDir, pack.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const view of pack.views) {
      if (view.qualityTier !== 'medium') continue;
      const name = `z${view.zoom}.svg`;
      fs.writeFileSync(path.join(dir, name), sceneSvg(view));
      links.push({
        scenarioId: pack.id,
        zoom: view.zoom,
        file: `captures/${pack.id}/${name}`,
        gpuFrame: false,
        captureKind: 'semantic-svg',
      });
    }
  }
  const issues = report.issues || [];
  const csv = [
    ['scenarioId', 'tick', 'seed', 'zoom', 'qualityTier', 'kind', 'confidence', 'failBuild', 'objectIds', 'summary'].join(','),
    ...issues.map((row) => [
      row.scenarioId, row.tick, row.seed, row.zoom, row.qualityTier, row.kind, row.confidence, row.failBuild,
      (row.objectIds || []).join('|'), row.summary,
    ].map(csvCell).join(',')),
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'issues.csv'), `${csv}\n`);
  fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(published, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'verdict.json'), `${JSON.stringify(published.verdict, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'report.md'), markdown(published, links));
  fs.writeFileSync(path.join(outDir, 'index.html'), html(published, links));
  return { outDir, files: ['index.html', 'report.md', 'issues.csv', 'report.json', 'verdict.json'] };
}

function markdown(report, links) {
  const lines = [];
  lines.push('# Scene Truth atlas');
  lines.push('');
  lines.push(`Verdict: **${report.verdict.status}**. Live rendering: **unmeasured**.`);
  for (const row of report.verdict.missingMeasurements || []) lines.push(`- ${row.scenarioId || 'catalog'}: ${row.reason}`);
  lines.push('');
  lines.push('This gallery is semantic 3D scene integrity. It is not the UI screenshot matrix.');
  lines.push('');
  lines.push('## Limitations');
  for (const line of LIMITATIONS) lines.push(`- ${line}`);
  lines.push('');
  lines.push('## Command');
  lines.push('');
  lines.push('```');
  lines.push(report.command);
  lines.push('```');
  lines.push('');
  lines.push(`Commit ${report.commit}. Scenarios ${report.scenarioCount}. High fails ${report.verdict.highFailCount}. Reviews ${report.verdict.reviewCount}.`);
  lines.push(`Sim wall ${Math.round(report.simCostMs)} ms. Atlas wall included in captureCostMs ${Math.round(report.captureCostMs)} ms. runtimeFps: null.`);
  lines.push('');
  lines.push('## Scenarios');
  lines.push('');
  lines.push('| id | source | objects | lab | high fails |');
  lines.push('|---|---|---:|---|---:|');
  for (const row of report.scenarioRows || []) {
    lines.push(`| ${row.id} | ${row.source} | ${row.objectCount} | ${row.labStatus} | ${row.highFails} |`);
  }
  lines.push('');
  lines.push('## Issues');
  lines.push('');
  if (!issuesOf(report).length) lines.push('No high-confidence scene defects on the live witnesses.');
  for (const row of issuesOf(report)) {
    lines.push(`- **${row.confidence} ${row.kind}** \`${row.scenarioId}\` tick ${row.tick} zoom ${row.zoom} tier ${row.qualityTier} objects ${(row.objectIds || []).join(', ')}`);
    lines.push(`  - expected: ${row.expected}`);
    lines.push(`  - observed: ${row.observed}`);
    lines.push(`  - ${row.summary}`);
    lines.push(`  - \`${row.command}\``);
  }
  lines.push('');
  lines.push('## Captures');
  lines.push('');
  for (const link of links) {
    lines.push(`- [${link.scenarioId} zoom ${link.zoom}](${link.file}) — semantic SVG, not a GPU frame`);
  }
  lines.push('');
  lines.push('## Critique');
  lines.push('');
  lines.push(report.critique && report.critique.summary ? report.critique.summary : '');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function issuesOf(report) {
  return report.issues || [];
}

function html(report, links) {
  const cards = links.map((link) => (
    `<figure><img src="${esc(link.file)}" alt="Semantic SVG of ${esc(link.scenarioId)} zoom ${esc(link.zoom)}, not a GPU frame"/><figcaption>${esc(link.scenarioId)} zoom ${esc(link.zoom)} — semantic SVG, not a GPU frame</figcaption></figure>`
  )).join('');
  const rows = issuesOf(report).map((row) => (
    `<tr class="${row.failBuild ? 'fail' : 'review'}"><td>${esc(row.confidence)}</td><td>${esc(row.kind)}</td><td>${esc(row.scenarioId)}</td><td>${esc(row.tick)}</td><td>${esc(row.zoom)}</td><td>${esc(row.qualityTier)}</td><td>${esc((row.objectIds || []).join(', '))}</td><td>${esc(row.summary)}</td></tr>`
  )).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Scene Truth atlas</title>
<style>
  body { margin: 24px; background: #12151b; color: #e6e1d6; font: 15px/1.45 Georgia, serif; }
  h1, h2 { font-weight: normal; }
  a { color: #f0d48a; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border-bottom: 1px solid #2c313a; padding: 6px 8px; text-align: left; vertical-align: top; }
  .fail { color: #ffb4a8; }
  .review { color: #ead9a2; }
  figure { display: inline-block; width: 280px; margin: 8px; background: #1b2028; }
  img { width: 280px; height: 180px; object-fit: contain; background: #10141c; }
  figcaption { padding: 6px 8px; font: 12px/1.3 ui-monospace, monospace; }
  .banner { padding: 8px 10px; border: 1px solid #8a6a2f; color: #f0d48a; }
</style>
</head>
<body>
<h1>Scene Truth atlas</h1>
<p class="banner">Semantic scene integrity. Not a UI screenshot diff. ${esc(report.verdict.status)}. runtimeFps is null.</p>
<p>Commit ${esc(report.commit)}. Command <code>${esc(report.command)}</code></p>
<h2>Limitations</h2>
<ul>${LIMITATIONS.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
<h2>Issues</h2>
<table>
<thead><tr><th>confidence</th><th>kind</th><th>scenario</th><th>tick</th><th>zoom</th><th>tier</th><th>objects</th><th>summary</th></tr></thead>
<tbody>${rows || '<tr><td colspan="8">No high-confidence scene defects on the live witnesses.</td></tr>'}</tbody>
</table>
<h2>Captures</h2>
${cards}
</body>
</html>
`;
}

export function buildVerdict({ commit, scenarioCount, scenarioRows = [], issues, reviews, critique, faults, benign }) {
  const high = (issues || []).filter((row) => row.failBuild === true);
  const faultMisses = (faults || []).filter((row) => !row.detected);
  const benignHits = (benign || []).filter((row) => row.highCount > 0);
  const failed = high.length > 0 || faultMisses.length > 0 || benignHits.length > 0 || critique.ok !== true;
  const missingMeasurements = scenarioRows
    .filter((row) => row.labOk !== true || row.labStatus === 'incomplete')
    .map((row) => ({ scenarioId: row.id, reason: `lab ${row.labStatus || 'unmeasured'}` }));
  if (scenarioRows.length < scenarioCount) missingMeasurements.push({
    scenarioId: null, reason: `${scenarioCount - scenarioRows.length} selected scenarios were not run`,
  });
  const ok = missingMeasurements.length === 0 && high.length === 0
    && faultMisses.length === 0
    && benignHits.length === 0
    && critique.ok === true;
  return {
    schema: VERDICT_SCHEMA,
    ok,
    status: failed ? 'scene-defects' : missingMeasurements.length ? 'incomplete' : 'semantic-pass',
    commit,
    scenarioCount,
    measuredScenarioCount: scenarioRows.filter((row) => row.labOk === true && row.labStatus !== 'incomplete').length,
    missingMeasurements,
    renderingStatus: 'unmeasured',
    highFailCount: high.length,
    reviewCount: (reviews || []).length + (issues || []).filter((row) => row.confidence === 'review').length,
    faultCount: (faults || []).length,
    faultDetected: (faults || []).filter((row) => row.detected).length,
    benignCount: (benign || []).length,
    benignAllowed: (benign || []).filter((row) => row.highCount === 0).length,
    critiqueOk: critique.ok === true,
    runtimeFps: null,
    pixelDriftFailsBuild: false,
  };
}

export { REPORT_SCHEMA };
