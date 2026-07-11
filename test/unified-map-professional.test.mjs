import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MAP_FOCUS,
  MAP_SCREEN_ID,
  normalizeMapOpenIntent,
} from '../src/ui/mapAuthority.js';
import {
  galaxyMapScreen,
  clampMapLabelX,
  mapFocusButtonSelector,
  pickMapTargetAt,
  resolveGalaxyMapLayout,
} from '../src/ui/galaxyMap.js';
import { save } from '../src/save/saveSystem.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function overlaps(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

test('all public map callers cut over to the single galaxyMap authority', () => {
  const input = read('../src/ui/input.js');
  const pause = read('../src/ui/screens/pause.js');
  const missionLog = read('../src/ui/screens/missionLog.js');
  const stationHub = read('../src/ui/screens/stationHub.js');
  const uiRoot = read('../src/ui/uiRoot.js');

  for (const [name, source] of Object.entries({ input, pause, missionLog, stationHub, uiRoot })) {
    assert.match(source, /openGalaxyMap|mapHandoffAction|isMapScreenId/,
      `${name} must route through the map authority`);
    assert.doesNotMatch(source, /pushScreen\(\s*['"](?:localmap|starmap)['"]\s*\)/,
      `${name} must not expose a legacy map as a public primary route`);
  }
  assert.equal(MAP_SCREEN_ID, 'galaxyMap');
  assert.equal(normalizeMapOpenIntent({ screenId: 'localmap' }).focus, MAP_FOCUS.LOCAL);
  assert.equal(normalizeMapOpenIntent({ screenId: 'starmap' }).focus, MAP_FOCUS.GALAXY);
});

test('objective waypoint wins hit selection over collocated ambient contacts', () => {
  const targets = [
    { id: 'rock', kind: 'asteroid', sx: 200, sy: 160, radiusPx: 18 },
    { id: 'station', kind: 'station', sx: 201, sy: 160, radiusPx: 18 },
    {
      id: 'active-waypoint',
      kind: 'waypoint',
      objective: true,
      markerKind: 'mission-objective',
      sx: 204,
      sy: 160,
      radiusPx: 22,
    },
  ];
  assert.equal(pickMapTargetAt(targets, 200, 160)?.id, 'active-waypoint');
  assert.equal(pickMapTargetAt(targets.slice(0, 2), 200, 160)?.id, 'rock',
    'without an objective the nearest contact still wins');
});

test('supported viewports allocate non-overlapping map chrome and usable canvas', () => {
  for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768], [800, 600]]) {
    const layout = resolveGalaxyMapLayout(width, height);
    const regions = [layout.header, layout.layers, layout.viewport, layout.inspector];
    for (let i = 0; i < regions.length; i += 1) {
      assert.ok(regions[i].width > 0 && regions[i].height > 0,
        `${width}x${height} region ${i} must be usable`);
      for (let j = i + 1; j < regions.length; j += 1) {
        assert.equal(overlaps(regions[i], regions[j]), false,
          `${width}x${height} regions ${i}/${j} overlap`);
      }
    }
    assert.ok(layout.viewport.width >= 480 || layout.mode === 'narrow',
      `${width}x${height} keeps a readable navigation canvas`);
    assert.ok(layout.viewport.height >= 260,
      `${width}x${height} keeps enough vertical map context`);
  }
  const comms = read('../src/ui/comms.js');
  assert.match(comms, /body\.ui-modal-open \.sf-comm-backlog-btn[^}]*visibility:hidden/s,
    'the persistent comms/menu control must vacate modal map chrome');
});

test('gate and station labels clamp inside the canvas instead of clipping into inspector', () => {
  assert.equal(clampMapLabelX(132, 470, 480, 8), 340);
  assert.equal(clampMapLabelX(80, 40, 480, 8), 40);
  assert.equal(clampMapLabelX(80, -20, 480, 8), 8);
});

test('inspector target persists across scale changes and refreshes', () => {
  const selected = { id: 'station_helios', kind: 'station', name: 'Helios' };
  galaxyMapScreen._selectedTarget = selected;
  galaxyMapScreen._zoom = 1;
  galaxyMapScreen._targetZoom = 1;
  galaxyMapScreen._setScaleFocus(MAP_FOCUS.LOCAL, { draw: false });
  assert.strictEqual(galaxyMapScreen._selectedTarget, selected);
  galaxyMapScreen._setScaleFocus(MAP_FOCUS.GALAXY, { draw: false });
  assert.strictEqual(galaxyMapScreen._selectedTarget, selected);
});

test('save/load preserves objective marker identity and active local autopilot', () => {
  const original = {
    route: null,
    autoTravel: false,
    waypoint: {
      kind: 'story',
      missionId: 'story_47a',
      sectorId: 'sector_helios_prime',
      label: '47-A MASS SIGNAL',
      reason: 'Recover the sample.',
      mapLabel: '◆ 47-A SIGNAL',
      markerId: 'story:47a:sample',
      markerKind: 'mission-objective',
      pos: { x: 340, z: -220 },
    },
    autopilot: {
      active: true,
      target: { x: 340, z: -220 },
      targetEntityId: '44',
      label: '47-A MASS SIGNAL',
      arrivalRadius: 48,
      status: 'armed',
    },
  };
  const saveInstance = Object.create(save);
  saveInstance.state = { nav: structuredClone(original) };
  saveInstance.bus = { emit() {} };
  const serialized = saveInstance._serializeNav();
  saveInstance.state.nav = {};
  saveInstance._restoreNav(serialized);
  assert.deepEqual(saveInstance.state.nav, original);
});

test('gamepad map entry has a deterministic focused scale control', () => {
  assert.equal(
    mapFocusButtonSelector({ source: 'gamepad', focus: MAP_FOCUS.GALAXY }),
    '.gm-scale-btn[data-focus="galaxy"]',
  );
  assert.equal(
    mapFocusButtonSelector({ source: 'gamepad', focus: MAP_FOCUS.LOCAL }),
    '.gm-scale-btn[data-focus="local"]',
  );
  assert.equal(mapFocusButtonSelector({ source: 'keyboard', focus: MAP_FOCUS.LOCAL }), null,
    'keyboard map entry does not steal focus from map pan/search input');
  const galaxyMap = read('../src/ui/galaxyMap.js');
  assert.match(galaxyMap, /mapFocusButtonSelector\(intent\)[\s\S]*querySelector\(focusSelector\)[\s\S]*\.focus\(/,
    'the live onShow path must focus the resolved gamepad scale control');
});
