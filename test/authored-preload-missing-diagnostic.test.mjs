import assert from 'node:assert/strict';
import test from 'node:test';

import { missingAuthoredPreloadEntries } from '../src/render/partsLibrary.js';

// The AUTHORED_LIBRARY_UNAVAILABLE gate must say which records failed — a bare "incomplete"
// leaves a launch failure undiagnosable. These checks pin the three reportable shapes:
// missing entirely, arrived-but-not-resident, and nothing missing.
test('missing entries name the slot, file, and absent vs not-resident state', () => {
  const library = new Map([
    ['hull', [
      { url: 'parts/wholeships/kestrel.glb' }, // no residency record -> counts as resident
      { url: 'parts/wholeships/wasp.glb', residency: { state: 'decoding', key: 'k' } },
    ]],
    ['engine', [{ url: 'parts/engines/ion_s.glb' }]],
  ]);
  const plan = {
    hull: ['wholeships/kestrel.glb', 'wholeships/wasp.glb', 'wholeships/missing.glb'],
    engine: ['engines/ion_s.glb'],
    cockpit: ['cockpits/none.glb'],
  };
  assert.deepEqual(missingAuthoredPreloadEntries(library, plan), [
    'hull:wholeships/wasp.glb (not resident)',
    'hull:wholeships/missing.glb',
    'cockpit:cockpits/none.glb',
  ]);
});

test('a satisfied plan reports no missing entries', () => {
  const library = new Map([
    ['hull', [{ url: 'parts/wholeships/kestrel.glb', residency: { state: 'resident' } }]],
  ]);
  assert.deepEqual(missingAuthoredPreloadEntries(library, { hull: ['wholeships/kestrel.glb'] }), []);
  assert.deepEqual(missingAuthoredPreloadEntries(null, { hull: ['x.glb'] }), ['hull:x.glb']);
  assert.deepEqual(missingAuthoredPreloadEntries(library, {}), []);
});

test('the missing list is bounded so long plans stay loggable', () => {
  const plan = { hull: Array.from({ length: 20 }, (_, i) => `h${i}.glb`) };
  const missing = missingAuthoredPreloadEntries(new Map(), plan);
  assert.equal(missing.length, 13); // 12 named + ellipsis marker
  assert.equal(missing[12], '…');
});
