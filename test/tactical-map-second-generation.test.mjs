import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MAP_LEGEND_ORDER,
  TACTICAL_MAP_PALETTE,
  TACTICAL_SYMBOLS,
  contrastRatio,
  objectiveCorridorMode,
  planObjectiveCue,
  planUnresolvedObjectiveCue,
  projectRadarPoint,
  symbolDescriptor,
  tacticalRadarMetrics,
} from '../src/ui/map/tacticalMapGrammar.js';
import { mapParityLegendModel } from '../src/ui/map/mapParityBridge.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('primary tactical identities use unique shapes, redundant channels, and executable contrast', () => {
  const required = ['player', 'objective', 'hostile', 'station', 'gate'];
  const shapes = new Set();
  for (const kind of required) {
    const descriptor = symbolDescriptor(kind);
    assert.ok(descriptor.shape && descriptor.channel, `${kind} needs shape and redundant channel`);
    assert.equal(shapes.has(descriptor.shape), false, `${kind} shape must be unique`);
    shapes.add(descriptor.shape);
    assert.ok(
      contrastRatio(descriptor.colour, TACTICAL_MAP_PALETTE.ground) >= 3,
      `${kind} must preserve >=3:1 non-text contrast`,
    );
  }
  assert.equal(TACTICAL_SYMBOLS.player.shape, 'asymmetric-hull');
  assert.equal(TACTICAL_SYMBOLS.objective.shape, 'open-corner-bracket');
  assert.match(TACTICAL_SYMBOLS.objective.channel, /route corridor/);
});

test('radar projection matches the chase view, rejects corrupt coordinates, and keeps large rim glyphs inside', () => {
  const metrics = tacticalRadarMetrics(false);
  const east = projectRadarPoint({ x: 0, z: 0 }, { x: 1000, z: 0 }, 2000, metrics);
  const north = projectRadarPoint({ x: 0, z: 0 }, { x: 0, z: 1000 }, 2000, metrics);
  assert.equal(east.offRange, false);
  assert.equal(east.x, 57.5, 'world +X reads left');
  assert.equal(east.y, metrics.center);
  assert.equal(north.x, metrics.center);
  assert.equal(north.y, 57.5, 'world +Z reads up');

  const farEast = projectRadarPoint({ x: 0, z: 0 }, { x: 9000, z: 0 }, 2000, metrics);
  assert.equal(farEast.offRange, true);
  assert.ok(Math.abs(farEast.x - (metrics.center - metrics.radius)) < 1e-9);
  assert.ok(Math.abs(farEast.y - metrics.center) < 1e-9);

  const objective = planObjectiveCue({
    playerPos: { x: 0, z: 0 },
    waypointPos: { x: 9000, z: 0 },
    range: 2000,
  });
  assert.equal(objective.offRange, true);
  assert.ok(objective.x >= 15, `west-rim objective centre must leave bracket clearance (${objective.x})`);
  assert.ok(objective.x < farEast.x + 16, 'objective remains visually attached to the range rim');

  assert.equal(projectRadarPoint({ x: NaN, z: 0 }, { x: 1, z: 1 }, 100, metrics), null);
  assert.equal(projectRadarPoint({ x: 0, z: 0 }, { x: Infinity, z: 1 }, 100, metrics), null);
  assert.equal(projectRadarPoint({ x: 0, z: 0 }, { x: 1, z: 1 }, 0, metrics), null);
});

test('objective guidance degrades gracefully under threat and general contact density', () => {
  assert.equal(objectiveCorridorMode({ markerDistancePx: 20 }), 'none');
  assert.equal(objectiveCorridorMode({ markerDistancePx: 80, hostileCount: 2, contactCount: 8 }), 'full');
  assert.equal(objectiveCorridorMode({ markerDistancePx: 80, hostileCount: 5, contactCount: 8 }), 'reduced');
  assert.equal(objectiveCorridorMode({ markerDistancePx: 80, hostileCount: 1, contactCount: 18 }), 'reduced');
  assert.equal(objectiveCorridorMode({ markerDistancePx: 80, hostileCount: 8 }), 'terminal');
  assert.equal(objectiveCorridorMode({ markerDistancePx: 80, hostileCount: 1, contactCount: 30 }), 'terminal');
  assert.equal(
    objectiveCorridorMode({ markerDistancePx: 80, hostileCount: 12, contactCount: 40, expanded: true }),
    'full',
  );

  const cue = planObjectiveCue({
    playerPos: { x: 0, z: 0 },
    waypointPos: { x: 4000, z: 0 },
    range: 2000,
    hostileCount: 10,
    expanded: false,
    label: 'Recover the mass sample',
  });
  assert.equal(cue.offRange, true);
  assert.equal(cue.corridorMode, 'terminal');
  assert.equal(cue.label, 'RECOVER THE MASS SAMPL');
  assert.ok(cue.start.x > cue.end.x, 'corridor follows mirrored east bearing');

  const unresolved = planUnresolvedObjectiveCue({ label: 'Ceres transfer' });
  assert.equal(unresolved.resolved, false);
  assert.equal(unresolved.corridorMode, 'none');
  assert.equal(unresolved.x, unresolved.metrics.center);
  assert.equal(unresolved.label, 'CERES TRANSFER');
});

test('the full chart teaches the exact vocabulary and brackets the actual live objective', () => {
  const legend = mapParityLegendModel();
  assert.deepEqual(legend.map((entry) => entry.id), MAP_LEGEND_ORDER);
  for (const entry of legend) {
    const canonical = symbolDescriptor(entry.id);
    assert.equal(entry.shape, canonical.shape);
    assert.equal(entry.colour, canonical.colour);
    assert.match(entry.svg, /<svg/);
  }

  const bridge = read('../src/ui/map/mapParityBridge.js');
  assert.match(bridge, /const rootStates = new WeakMap\(\)/);
  assert.doesNotMatch(bridge, /let installed = false/,
    'one process-global installed bit would strand a remounted chart');
  assert.match(bridge, /gm-parity-overlay__objective/,
    'parity must reach the chart marker itself, not stop at a legend');
  assert.match(bridge, /screenModule\._clickTargets/,
    'the overlay must consume the chart authority instead of reimplementing projection');
  assert.match(bridge, /import\('\.\.\/galaxyMap\.js'\)/);
  assert.match(bridge, /requestAnimationFrame\(draw\)/);
  assert.match(bridge, /visibilityOwner\.style\.display === 'none'/,
    'the overlay loop must sleep with the cached chart screen');
  assert.doesNotMatch(bridge, /if \(!root \|\| rootStates\.has\(root\)\)/,
    'same-root innerHTML remounts must be able to reinstall a removed key/overlay');
});

test('the public radar is a native crisp renderer, not a blurred legacy canvas copy', () => {
  const radar = read('../src/ui/radar.js');

  assert.doesNotMatch(radar, /createRadar as createBaseRadar|radarBase\.js/);
  assert.doesNotMatch(radar, /shadowBlur\s*=/, 'semantic radar must contain no canvas bloom');
  assert.doesNotMatch(radar, /g\.drawImage\(sourceCanvas/, 'no copied fuzzy compositor layer');
  assert.match(radar, /drawHostileGlyph/);
  assert.match(radar, /drawStationGlyph/);
  assert.match(radar, /drawGateGlyph/);
  assert.match(radar, /drawPlayerHull/);
  assert.match(radar, /drawObjectiveCorridor/);
  assert.match(radar, /planUnresolvedObjectiveCue/);
  assert.match(radar, /nearbyAsteroidCandidates/);
  assert.match(radar, /solveIntercept/);
  assert.match(radar, /drawTrail/);
  assert.match(radar, /MAX_TRAIL_UPDATES/);
  assert.match(radar, /index\.radarContacts/);
  assert.match(radar, /index\.radarAsteroids/);
  assert.match(radar, /prefersReducedMotion\(\)/);
  assert.match(radar, /`◆ AMBER DIAMOND · \$\{wpLabel\}`/);

  const textSizes = [...radar.matchAll(/(?:font-size:|\.font\s*=\s*['"`][^'"`]*?)(\d+(?:\.\d+)?)px/g)]
    .map((match) => Number(match[1]));
  assert.ok(textSizes.length > 0);
  assert.ok(textSizes.every((size) => size >= 12), `radar text below 12px: ${textSizes}`);
});

test('every pushed menu, map, log, and future screen freezes through ScreenManager itself', () => {
  const manager = read('../src/ui/screenManager.js');
  assert.match(manager, /const wantPause = state\.ui\.docked === true \|\| stack\.length > 0/);
  assert.match(manager, /timeEffects\.set\('ui:pausing-screen', PAUSE_REQUEST\)/);
  assert.match(manager, /bus\.emit\('sim:pause'/);
  assert.match(manager, /bus\.emit\('sim:resume'/);
  assert.match(manager, /document\.body\.classList\.remove\('ui-live-screen'\)/);
  assert.match(manager, /function isLiveOverlay\(\) \{\s*return false;/);
  assert.doesNotMatch(manager, /const liveOverlay =/);

  const inventory = /const PAUSING_SCREENS = new Set\(\[([\s\S]*?)\]\);/.exec(manager);
  assert.ok(inventory);
  for (const id of [
    'galaxyMap', 'starmap', 'localmap', 'missionLog', 'techTree', 'automation',
    'pause', 'settings', 'station', 'ship', 'range', 'footprint', 'drill',
  ]) {
    assert.match(inventory[1], new RegExp(`['"]${id}['"]`), `${id} must remain auditable`);
  }
});

test('changed map UI obeys the repository-wide 12px text floor', () => {
  for (const path of [
    '../src/ui/radar.js',
    '../src/ui/map/tacticalMapGrammar.js',
    '../src/ui/map/mapParityBridge.js',
  ]) {
    const source = read(path);
    const sizes = [
      ...[...source.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1])),
      ...[...source.matchAll(/\.font\s*=\s*['"`][^'"`]*?(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1])),
    ];
    assert.ok(sizes.every((size) => size === 0 || size >= 12), `${path}: ${sizes}`);
  }
});
