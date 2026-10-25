import test from 'node:test';
import assert from 'node:assert/strict';
import { massDeclarationForTarget, massDiscrepancy, normalizeMassScaleState } from '../src/systems/cargoCustody.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';

function fixture(declaredMassT = 20) {
  const target = { id: 2, alive: true, mass: 40, data: {
    missionId: 'audit', missionTag: 'audit', missionTargetSlot: 0,
  } };
  const mission = { id: 'audit', status: 'active', type: 'tow_recovery', sourceOfferId: 'offer',
    destStationId: 'station_helios', params: { massDeclaration: {
      version: 1, declaredMassT, targetSlot: 0, kind: 'weight_audit', issuer: 'Office', reference: '47-A',
    } } };
  const state = { mode: 'flight', tick: 30, simTime: 0.5, missions: { active: [mission] },
    entities: new Map([[target.id, target]]), player: { tether: { active: true, targetId: target.id } } };
  return { state, mission, target };
}

test('mass discrepancies reject non-finite masses and overflowed ratios', () => {
  for (const pair of [[Infinity, 40], [20, Infinity], [NaN, 40],
    [Number.MIN_VALUE, 40], [Number.MAX_VALUE, Number.MIN_VALUE]]) {
    assert.equal(massDiscrepancy(...pair), null, `${pair} cannot produce a finite slip`);
  }
  assert.deepEqual(massDiscrepancy(20, 40), {
    declaredMassT: 20, measuredMassT: 40, deltaMassT: 20, ratio: 2, discrepant: true,
  });
  assert.equal(massDiscrepancy(20, 20.5).discrepant, false, 'the existing tolerance stays intact');
});

test('restored slips derive discrepancy fields from the same finite masses as live readings', () => {
  const slip = { slipId: 'slip', kind: 'weight_audit', sourceOfferId: 'offer', targetSlot: 0,
    declaredMassT: 20, measuredMassT: 40, deltaMassT: 0, ratio: 1, discrepant: false };
  const restored = normalizeMassScaleState({ slips: { slip, bad: { ...slip, slipId: 'bad', measuredMassT: Infinity } } });
  assert.deepEqual(Object.keys(restored.slips), ['slip'], 'an invalid mass cannot survive normalization');
  for (const [key, value] of Object.entries(massDiscrepancy(20, 40))) {
    assert.equal(restored.slips.slip[key], value, `${key} is derived rather than trusted`);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), restored, 'serialization changes no numeric values');
});

test('a declaration belongs to a live target on an active tow mission', () => {
  const { state, mission, target } = fixture();
  assert.equal(massDeclarationForTarget(state, target).declaredMassT, 20);
  mission.status = 'completed';
  assert.equal(massDeclarationForTarget(state, target), null, 'a completed row cannot earn another reading');
  mission.status = 'active';
  target.alive = false;
  assert.equal(massDeclarationForTarget(state, target), null, 'a dead target has no live declaration');
  target.alive = true;
  mission.params.massDeclaration.declaredMassT = Infinity;
  assert.equal(massDeclarationForTarget(state, target), null, 'a non-finite declaration is invalid');
});

test('invalid arithmetic clears unfinished weighing without emitting or throwing', () => {
  const { state, target } = fixture(Number.MIN_VALUE);
  const events = [];
  const observer = Object.create(masslineTelemetry);
  observer.init({ state, bus: { on() {}, emit(name) { events.push(name); } } });
  const telemetry = {};
  assert.doesNotThrow(() => observer._stepMassWeighing(telemetry, 0.5, state, target, 0.5, 'loaded', 2));
  assert.equal(telemetry.massWeighing, undefined);
  assert.equal(observer._weigh, null);
  assert.deepEqual(events, []);
});
