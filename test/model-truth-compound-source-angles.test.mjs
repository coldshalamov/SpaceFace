import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authoredCompoundMeasurement, authoredCompoundCoverage } from '../scripts/lib/modelTruthAuthoredCompound.mjs';
import { liveSolidGlbCatalog } from '../src/render/partsLibrary.js';

function row(angle = {}) {
  return { id: 'angle-compatibility', fit: 'authored-origin', placeScale: 1, assetId: 'angle-test',
    colliderKind: 'compound', colliderId: 'angle-test', referenceState: 'fixed-service',
    compoundBoxesWU: [{ id: 'arm', center: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 1, z: 1 }, ...angle }] };
}
function certificate(angle = {}) {
  return { schema: 'spaceface.authoredCompound.v1', assetId: 'angle-test',
    collision: { boxes: [{ name: 'arm', centerWU: [0, 0, 0], sizeWU: [2, 1, 1], ...angle }] } };
}

test('actual released receiver certificate matches the live native27 compound including both angled fixed arms', () => {
  const descriptor = liveSolidGlbCatalog().find(row => row.id === 'traffic:stormshift_receiver');
  assert.ok(descriptor); assert.equal(descriptor.fit, 'authored-origin');
  const bytes = readFileSync(new URL('../assets/ships/release/parts/wholeships/ship_stormshift_receiver_v01.glb', import.meta.url));
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const source = doc.asset.extras.authoredCompound;
  assert.deepEqual(source.collision.boxes.filter(box => box.angleY).map(box => box.angleY), [-.2, .43]);
  const measurement = authoredCompoundMeasurement(descriptor);
  assert.equal(measurement.compoundBoxesWU.length, 27);
  assert.equal(authoredCompoundCoverage([], measurement, source).sourceCompoundParity, true);
});

test('source planar radians agree with explicit native degrees while degrees and legacy zero retain precedence', () => {
  const measurement = authoredCompoundMeasurement(row({ angleDeg: -.2 * 180 / Math.PI }));
  assert.equal(authoredCompoundCoverage([], measurement, certificate({ angleY: -.2 })).sourceCompoundParity, true);
  const degrees = authoredCompoundMeasurement(row({ angleDeg: 45, angleY: NaN }));
  assert.equal(authoredCompoundCoverage([], degrees, certificate({ angleDeg: 45, angleY: 0 })).sourceCompoundParity, true);
  assert.equal(authoredCompoundCoverage([], authoredCompoundMeasurement(row()), certificate()).sourceCompoundParity, true);
});

test('malformed source radians and inconsistent native/source arm angles fail closed', () => {
  const measurement = authoredCompoundMeasurement(row({ angleDeg: 0 }));
  for (const angleY of [NaN, Infinity, -Infinity, '0.2', null]) {
    assert.throws(() => authoredCompoundMeasurement(row({ angleY })), /invalid native compound/);
    assert.throws(() => authoredCompoundCoverage([], measurement, certificate({ angleY })), /disagrees/);
  }
  assert.throws(() => authoredCompoundCoverage([], measurement, certificate({ angleY: .2 })), /disagrees/);
  assert.throws(() => authoredCompoundMeasurement(row({ angleDeg: 0, rotationY: .2 })), /invalid native compound/);
});
