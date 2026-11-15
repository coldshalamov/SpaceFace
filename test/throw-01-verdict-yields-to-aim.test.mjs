import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseVerdictYieldsToAim } from '../src/ui/masslineHud.js';

const mk = (simTime, selTarget) => ({ simTime, masslineReleaseVerdict: { targetId: 5, classification: 'messy', untilSimTime: 11.8 },
  masslineAcquisition: { selected: { targetId: selTarget, status: 'ready' } } });

test('THROW-01: the release grade gives way to the aim tag of a different ready target after 0.6 s', () => {
  assert.equal(releaseVerdictYieldsToAim(mk(10.3, 9)), false, 'still being read');
  assert.equal(releaseVerdictYieldsToAim(mk(10.8, 9)), true, 'read; the next target owns the tag');
  assert.equal(releaseVerdictYieldsToAim(mk(10.8, 5)), false, 'the same body keeps its grade');
  assert.equal(releaseVerdictYieldsToAim({ simTime: 10.8, masslineReleaseVerdict: null }), false);
});
