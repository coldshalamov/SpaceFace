import { CAMERA_ZOOM_MAX, CAMERA_ZOOM_MIN } from '../../../src/render/camera.js';
import { analyzeWitness, analyzeZoomTransition, highFails } from './detectors.mjs';
import { SHIPPING_CHASE_ZOOM, primaryView } from './witness.mjs';

const VIEW_SCOPED = new Set(['vfx-hides-contact', 'late-model-admission']);

export function dedupeIssues(issues) {
  const seen = new Set();
  const out = [];
  for (const row of issues) {
    let scope = '';
    if (row.kind === 'vfx-hides-contact') scope = row.qualityTier || '';
    if (row.kind === 'late-model-admission') scope = String(row.zoom ?? '');
    if (!VIEW_SCOPED.has(row.kind)) scope = '';
    const key = `${row.scenarioId}|${row.kind}|${(row.objectIds || []).join(',')}|${scope}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function analyzePack(pack) {
  if (pack && pack.lab && pack.lab.status === 'incomplete') {
    return [{
      schema: 'spaceface.sceneTruthIssue.v1', kind: 'lab-incomplete',
      confidence: 'incomplete', failBuild: false, scenarioId: pack.id,
      objectIds: [], expected: 'completed lab assertions and equivalence',
      observed: pack.lab.error || 'lab returned an incomplete arm',
      summary: `${pack.id} has diagnostic poses but its declared measurements are incomplete.`,
      command: `node tools/scene-truth/cli.mjs --only=${pack.id}`,
    }];
  }
  if (!pack || pack.ok !== true || (pack.lab && pack.lab.ok !== true)) {
    return [{
      schema: 'spaceface.sceneTruthIssue.v1',
      kind: 'lab-infra',
      confidence: 'high',
      failBuild: true,
      scenarioId: pack && pack.id,
      seed: null,
      tick: null,
      zoom: null,
      qualityTier: null,
      objectIds: [],
      expected: 'deterministic checkpoint surface',
      observed: (pack && pack.error) || 'no surface',
      summary: `${pack && pack.id} did not return a lab surface.`,
      command: `node tools/scene-truth/cli.mjs --only=${pack && pack.id}`,
    }];
  }
  const issues = [];
  const tiers = [...new Set(pack.views.map((view) => view.qualityTier))];
  for (const tier of tiers) {
    const view = primaryView(pack, tier, SHIPPING_CHASE_ZOOM);
    if (!view) continue;
    const prior = tier === 'medium' && pack.priorObjects
      ? { objects: pack.priorObjects, tick: pack.priorTick }
      : null;
    issues.push(...analyzeWitness(view, prior));
  }
  const close = pack.views.find((view) => view.qualityTier === 'medium' && view.zoom === CAMERA_ZOOM_MIN);
  const wide = pack.views.find((view) => view.qualityTier === 'medium' && view.zoom === CAMERA_ZOOM_MAX);
  if (close && wide) issues.push(...analyzeZoomTransition(close, wide));
  return dedupeIssues(issues);
}

export function packHighFails(pack) {
  return highFails(analyzePack(pack));
}
