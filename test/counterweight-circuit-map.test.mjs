import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { buildLocalModel, buildSystemModel, galaxyMapScreen, resolveCourseTarget } from '../src/ui/galaxyMap.js';
import { venueAnchorGlobal } from '../src/features/counterweightCircuit/physical.js';

test('discovered circuit is a real local and system chart destination', () => {
  const state = createGameState(4242), anchor = venueAnchorGlobal();
  state.world.currentSectorId = 'sector_pallas_drift';
  const player = { id: 1, type: 'ship', alive: true, pos: { x: anchor.x, z: anchor.z }, vel: { x: 0, z: 0 }, data: {} };
  state.playerId = 1; state.entities.set(1, player); state.entityList = [player];
  state.world.counterweightCircuit = { discovered: false };
  assert.equal(buildLocalModel(state).circuitSites.length, 0);
  state.world.counterweightCircuit.discovered = true;
  const local = buildLocalModel(state), system = buildSystemModel(state, 'sector_pallas_drift');
  const site = local.circuitSites[0], point = system.points.find(p => p.id === site.id);
  assert.equal(site.name, 'Counterweight Circuit');
  assert.deepEqual({ x: point.x, z: point.z }, { x: anchor.x, z: anchor.z });
  assert.deepEqual(point.drawPos, site.drawPos);
  assert.deepEqual(resolveCourseTarget(site).pos, { x: anchor.x, z: anchor.z });
  assert.equal(buildSystemModel(state, 'sector_helios_prime').points.some(p => p.id === site.id), false);

  const gradient = { addColorStop() {} }, text = [];
  const g = new Proxy({ globalAlpha: 1, measureText: t => ({ width: String(t).length * 7 }),
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    fillText: t => text.push(String(t)), strokeText() {} }, { get: (o, k) => k in o ? o[k] : () => {} });
  const chart = Object.create(galaxyMapScreen);
  Object.assign(chart, { _ctx: { state }, _selectedTarget: null, _clickTargets: [], _pointer: null, _hoverTarget: null,
    _line: null, _hold: null, _lock: null, _scanRings: [], _iris: null, _lastReadingRect: null, _previewPts: [],
    _reduceMotion: true, _animT: 0, _canvas: { setAttribute() {} },
    _layers: { route: true, mission: true, holdings: false, faction: false, discovery: true },
    _cams: { local: { cx: anchor.x, cy: anchor.z, zoom: 1 } }, _localModelForState: () => local,
    _clearField: () => ({ x: 0, y: 0, width: 1000, height: 800 }),
    _drawSensorLattice() {}, _drawLocalPreview() {}, _drawEdgeScale() {},
    _placeLabels: candidates => candidates.map(c => ({ ...c, visible: true })) });
  chart._drawLocal(g, state, 1000, 800);
  assert.ok(chart._clickTargets.some(target => target.id === site.id), 'the actual local draw produces a selectable POI');
  assert.ok(text.includes('Counterweight Circuit'), 'the local draw names the destination');
});
