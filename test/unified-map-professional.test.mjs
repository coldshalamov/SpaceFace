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
  layoutMapLabels,
  mapFocusButtonSelector,
  mapLabelPriority,
  pickMapTargetAt,
  resolveGalaxyMapLayout,
} from '../src/ui/galaxyMap.js';
import { placeRadarObjectiveLabel } from '../src/ui/radar.js';
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

test('crowded Helios labels resolve by semantic priority without overlap or input-order drift', () => {
  const crowded = [
    { id: 'rock-a', kind: 'asteroid', text: 'Basalt rock', x: 244, y: 162, width: 72, height: 15, anchorRadius: 3 },
    { id: 'ship-courier', kind: 'ship', text: 'Courier', x: 247, y: 158, width: 54, height: 15, anchorRadius: 5 },
    { id: 'ship-hostile', kind: 'ship', hostile: true, text: 'Raider', x: 252, y: 166, width: 48, height: 15, anchorRadius: 5 },
    { id: 'zone-dock', kind: 'zone', text: 'Helios approach', x: 236, y: 152, width: 104, height: 15, anchorRadius: 4 },
    { id: 'station-helios', kind: 'station', text: 'Helios Exchange', x: 242, y: 160, width: 112, height: 26, anchorRadius: 7 },
    { id: 'gate-ceres', kind: 'gate', text: 'Ceres Gate', x: 250, y: 160, width: 80, height: 15, anchorRadius: 8 },
    { id: 'objective', kind: 'objective', objective: true, text: 'GOAL · RECOVER SAMPLE', x: 246, y: 161, width: 142, height: 17, anchorRadius: 16 },
  ];
  for (const viewport of [{ width: 720, height: 520 }, { width: 480, height: 320 }]) {
    const placements = layoutMapLabels(crowded, viewport, {
      reserved: [{ x: 8, y: 8, width: 130, height: 24 }],
    });
    const reversed = layoutMapLabels(crowded.slice().reverse(), viewport, {
      reserved: [{ x: 8, y: 8, width: 130, height: 24 }],
    });
    assert.deepEqual(placements, reversed, `${viewport.width}px layout ignores source order`);
    assert.equal(placements.find((entry) => entry.id === 'objective')?.visible, true,
      'the active objective label is never suppressed');
    assert.equal(placements.find((entry) => entry.id === 'rock-a')?.visible, false,
      'ordinary rocks stay compact under crowding');
    assert.equal(placements.find((entry) => entry.id === 'ship-courier')?.visible, false,
      'ordinary contacts stay as glyphs under crowding');
    assert.equal(placements.find((entry) => entry.id === 'station-helios')?.visible, true,
      'the primary station remains named');
    assert.equal(placements.find((entry) => entry.id === 'gate-ceres')?.visible, true,
      'the gate remains named and secondary to the objective');
    const visible = placements.filter((entry) => entry.visible);
    for (let i = 0; i < visible.length; i += 1) {
      assert.ok(visible[i].x >= 0 && visible[i].y >= 0);
      assert.ok(visible[i].x + visible[i].width <= viewport.width);
      assert.ok(visible[i].y + visible[i].height <= viewport.height);
      for (let j = i + 1; j < visible.length; j += 1) {
        assert.equal(overlaps(visible[i], visible[j]), false,
          `${viewport.width}px labels ${visible[i].id}/${visible[j].id} do not overlap`);
      }
    }
  }
  assert.ok(mapLabelPriority({ kind: 'objective', objective: true }) > mapLabelPriority({ kind: 'gate' }));
  assert.ok(mapLabelPriority({ kind: 'gate' }) > mapLabelPriority({ kind: 'station' }));
  assert.ok(mapLabelPriority({ kind: 'station' }) > mapLabelPriority({ kind: 'asteroid' }));
});

test('label anchors quantize tiny movement and radar goal plates stay inside supported canvases', () => {
  const base = [
    { id: 'objective', kind: 'objective', objective: true, text: 'GOAL · SAMPLE', x: 240.1, y: 160.1, width: 96, height: 17, anchorRadius: 16 },
    { id: 'station', kind: 'station', text: 'Helios', x: 260.1, y: 160.1, width: 54, height: 15, anchorRadius: 7 },
  ];
  const shifted = base.map((candidate) => ({ ...candidate, x: candidate.x + 0.4, y: candidate.y + 0.4 }));
  assert.deepEqual(
    layoutMapLabels(base, { width: 480, height: 320 }),
    layoutMapLabels(shifted, { width: 480, height: 320 }),
    'sub-pixel camera drift cannot flip label sides frame-to-frame',
  );

  for (const size of [180, 260]) {
    for (const [x, y] of [[6, size / 2], [size - 6, size / 2], [size / 2, 6], [size / 2, size - 6]]) {
      const plate = placeRadarObjectiveLabel(92, x, y, size, size / 2, size / 2 - 8);
      assert.ok(plate.x >= 0 && plate.y >= 0);
      assert.ok(plate.x + plate.width <= size && plate.y + plate.height <= size,
        `${size}px radar keeps objective label inside its canvas`);
    }
  }
});

test('a goal label whose default offset is occupied takes the least-colliding offset, not the first', () => {
  // Objective anchored at (240, 240); a reserved band covers every candidate offset EXCEPT the
  // far-below slot (top = 240 + 19 + 17 + 3 = 279). The fallback used to pin the first (right)
  // rect straight into the band; it must now route to the one free offset and stay visible.
  const placements = layoutMapLabels(
    [{ id: 'goal', kind: 'objective', objective: true, text: 'GOAL · SAMPLE', x: 240, y: 240, width: 96, height: 17, anchorRadius: 16 }],
    { width: 480, height: 360 },
    { reserved: [{ x: 0, y: 0, width: 480, height: 270 }] },
  );
  const goal = placements.find((entry) => entry.id === 'goal');
  assert.equal(goal.visible, true, 'the goal label is never suppressed');
  assert.equal(goal.y, 279, 'the goal label takes the only free offset (far below)');
  assert.equal(overlaps(goal, { x: 0, y: 0, width: 480, height: 270 }), false,
    'the goal label clears the occupied band instead of overlapping it');
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
  assert.deepEqual(saveInstance.state.nav, {
    ...original,
    autopilot: { ...original.autopilot, targetEntityId: null },
  });
  assert.deepEqual(saveInstance.state.nav.autopilot.target, original.autopilot.target,
    'legacy numeric entity handles clear while the durable coordinate fallback survives');
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
    'keyboard map entry does not claim a scale chip (onShow parks on dialog root instead)');
  const galaxyMap = read('../src/ui/galaxyMap.js');
  assert.match(galaxyMap, /mapFocusButtonSelector\(intent\)[\s\S]*querySelector\(focusSelector\)[\s\S]*\.focus\(/,
    'the live onShow path must focus the resolved gamepad scale control');
  // Regression: search must not be the first Tab stop / focus fallback, or M types into the box.
  assert.match(galaxyMap, /gm-search-input[^>]*tabindex="-1"/,
    'search is programmatic-only (Press /); never the autoFocus first-operable fallback');
  assert.match(galaxyMap, /_root\.focus/,
    'keyboard/pointer open parks focus on the dialog root so M/N still close the map');
});
