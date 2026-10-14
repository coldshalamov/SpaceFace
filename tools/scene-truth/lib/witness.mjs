import { ENEMY_TYPES } from '../../../src/data/enemies.js';
import { runLabScenarioInternal } from '../../../src/testing/lab/runScenario.js';
import { bindEntity } from './bindVisual.mjs';
import { WITNESS_SCHEMA } from './constants.mjs';
import { claimGpuFrame } from './atlas.mjs';
import {
  SHIPPING_CHASE_ZOOM,
  frameHalfExtents,
  legalQualityTiers,
  legalZooms,
  projectScreen,
} from './frame.mjs';

const ENEMY = new Map(ENEMY_TYPES.map((enemy) => [enemy.id, enemy]));

function defIdFor(profile, surfaceDefId) {
  if (surfaceDefId) return surfaceDefId;
  if (!profile) return null;
  if (profile === 'ship.starter' || profile === 'ship.kestrel') return 'ship_kestrel';
  if (profile.startsWith('ship_')) return profile;
  const enemy = ENEMY.get(profile);
  return enemy ? enemy.shipId : null;
}

export function entitiesFromSurface(surface, entry) {
  const declared = new Map((entry.doc.entities || []).map((row) => [row.alias, row]));
  const playerId = surface.playerId;
  return (surface.entities || []).filter(Boolean).map((row) => {
    const alias = row.data && row.data.scenarioAlias;
    const spec = alias ? declared.get(alias) : null;
    const profile = spec ? spec.profile : null;
    const enemy = profile ? ENEMY.get(profile) : null;
    const isPlayer = !!(spec && spec.isPlayer) || row.id === playerId;
    return {
      id: row.id,
      type: row.type,
      alive: row.alive !== false,
      isPlayer,
      radius: row.radius,
      hull: row.hull,
      hullMax: row.hullMax,
      shield: row.shield,
      shieldMax: row.shieldMax,
      pos: row.pos || { x: 0, z: 0 },
      rot: row.rot || 0,
      data: {
        scenarioAlias: alias || null,
        scenarioRole: (row.data && row.data.scenarioRole) || (spec && spec.role) || null,
        defId: defIdFor(profile, row.data && row.data.defId),
        labProfile: enemy ? profile : null,
        silhouette: enemy && enemy.silhouette ? enemy.silhouette : null,
      },
    };
  });
}

export function authoredEntities(entry) {
  return (entry.props || []).map((prop) => ({
    authored: true,
    authoredId: prop.authoredId,
    objectId: `prop:${prop.authoredId}`,
    id: `prop:${prop.authoredId}`,
    type: prop.type,
    alive: true,
    isPlayer: false,
    required: prop.required !== false,
    collidable: prop.collidable !== false,
    radius: prop.radius,
    hull: null,
    hullMax: null,
    pos: prop.pos,
    rot: 0,
    role: prop.role,
    data: { ...(prop.data || {}), scenarioAlias: prop.authoredId, scenarioRole: prop.role },
  }));
}

export function bindScene(surface, entry) {
  const sim = surface ? entitiesFromSurface(surface, entry) : [];
  return [...sim, ...authoredEntities(entry)].map((entity) => bindEntity(entity));
}

function scaleEffects(object, burst) {
  const effects = (object.effects || []).map((effect) => ({
    ...effect,
    coverage: effect.baseCoverage * burst,
  }));
  return { ...object, effects };
}

export function projectWitness({ entry, surface, objects, zoom, tier, tick, focus }) {
  const frame = frameHalfExtents(zoom);
  const projected = objects.map((object) => {
    const scaled = scaleEffects(object, tier.burst);
    return {
      ...scaled,
      screen: projectScreen(scaled, focus, frame),
    };
  });
  return {
    schema: WITNESS_SCHEMA,
    scenarioId: entry.id,
    labScenarioId: entry.doc.id,
    seed: surface ? surface.seed : entry.doc.seed,
    tick,
    zoom,
    qualityTier: tier.id,
    particleQuality: tier.particleQuality,
    burst: tier.burst,
    focus,
    frame,
    playerRequired: true,
    captureKind: 'semantic-projection',
    gpuFrame: claimGpuFrame({ captureKind: 'semantic-projection' }),
    objects: projected,
  };
}

function focusOf(objects) {
  const player = objects.find((object) => object.isPlayer && object.alive !== false)
    || objects.find((object) => object.isPlayer);
  if (!player) return { x: 0, z: 0 };
  return { x: player.pos.x, z: player.pos.z };
}

function surfaceAt(checkpoint) {
  return checkpoint && checkpoint.deterministicCovered && checkpoint.deterministicCovered.surface
    ? checkpoint.deterministicCovered.surface
    : null;
}

export function viewsFor(entry, finalSurface, tick) {
  const objects = bindScene(finalSurface, entry);
  const focus = focusOf(objects);
  const views = [];
  for (const zoom of legalZooms()) {
    for (const tier of legalQualityTiers()) {
      views.push(projectWitness({
        entry,
        surface: finalSurface,
        objects,
        zoom,
        tier,
        tick,
        focus,
      }));
    }
  }
  return { objects, focus, views };
}

/**
 * Run one catalog entry on the authoritative lab runtime and project it
 * through the shipping camera zooms and quality tiers.
 */
export async function witnessScenario(entry) {
  const started = performance.now();
  const lab = await runLabScenarioInternal(entry.doc, { retainCheckpointSurfaces: true });
  const finalSurface = surfaceAt(lab && lab.checkpoints && lab.checkpoints.final);
  const mids = (lab && lab.checkpoints && lab.checkpoints.mid) || [];
  const priorCheckpoint = mids.find((row) => surfaceAt(row)) || null;
  const priorSurface = surfaceAt(priorCheckpoint);
  if (!finalSurface) {
    return {
      ok: false,
      id: entry.id,
      elapsedMs: performance.now() - started,
      error: (lab && lab.error) || 'lab run returned no deterministic surface',
      lab: labSummary(lab),
      views: [],
      issues: [],
    };
  }
  const projected = viewsFor(entry, finalSurface, finalSurface.tick);
  const priorObjects = priorSurface ? bindScene(priorSurface, entry) : null;
  return {
    ok: lab.ok === true && lab.status !== 'incomplete',
    id: entry.id,
    covers: entry.covers,
    source: entry.source,
    sourcePath: entry.sourcePath,
    elapsedMs: performance.now() - started,
    lab: labSummary(lab),
    tick: finalSurface.tick,
    priorTick: priorSurface ? priorSurface.tick : null,
    focus: projected.focus,
    objectCount: projected.objects.length,
    views: projected.views,
    priorObjects,
    renderingDetached: true,
    error: lab.ok === true ? null : lab.error || `lab status: ${lab.status}`,
  };
}

export function labSummary(lab) {
  if (!lab) return null;
  return {
    ok: lab.ok === true,
    status: lab.status || null,
    exitClass: lab.exitClass ?? null,
    evidenceClass: lab.evidenceClass || null,
    executionEvidenceClass: lab.executionEvidenceClass || null,
    ticks: lab.ticks ?? null,
    seed: lab.seed ?? null,
    scenarioId: lab.scenarioId || null,
    renderingDetached: !!(lab.rendering && lab.rendering.detached),
    error: lab.error || null,
  };
}

export function primaryView(pack, tierId = 'medium', zoom = SHIPPING_CHASE_ZOOM) {
  return (pack.views || []).find((view) => view.qualityTier === tierId && view.zoom === zoom)
    || (pack.views || []).find((view) => view.qualityTier === tierId)
    || (pack.views || [])[0]
    || null;
}

export { SHIPPING_CHASE_ZOOM };
