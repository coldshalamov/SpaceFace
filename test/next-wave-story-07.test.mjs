// STORY-07: the hauler origin opens through the shared origin door.
// The old hauler-only accept and decline events are gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HAULER_CAREER_ID } from '../src/careers/origins/haulerOriginData.js';
import { createHaulerOriginSystem } from '../src/careers/origins/haulerOriginSystem.js';
import { makeBus, makeHaulerState } from './hauler-origin-fixtures.mjs';

const OTHER_CAREER = 'hunter';

function offeredHauler() {
  const state = makeHaulerState({ simTime: 100 });
  const bus = makeBus();
  const sys = createHaulerOriginSystem();
  sys.init({ state, bus, helpers: {} });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(sys.getView().status, 'offered');
  return { state, bus, sys };
}

test('the shared origin door accepts and declines the hauler, and ignores another career', () => {
  assert.notEqual(OTHER_CAREER, HAULER_CAREER_ID);
  const prompt = { source: 'missionLog' };

  const accepted = offeredHauler();
  accepted.bus.emit('career:origin:accept', { ...prompt, careerId: OTHER_CAREER });
  assert.equal(accepted.sys.getView().status, 'offered');
  accepted.bus.emit('career:origin:accept', { ...prompt, careerId: HAULER_CAREER_ID });
  assert.equal(accepted.sys.getView().status, 'active');

  const declined = offeredHauler();
  declined.bus.emit('career:origin:decline', { ...prompt, careerId: OTHER_CAREER });
  assert.equal(declined.sys.getView().status, 'offered');
  declined.bus.emit('career:origin:decline', { ...prompt, careerId: HAULER_CAREER_ID });
  assert.equal(declined.sys.getView().status, 'declined');

  const src = readFileSync(new URL('../src/careers/origins/haulerOriginSystem.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /career:hauler:accept/);
  assert.doesNotMatch(src, /career:hauler:decline/);
  assert.match(src, /career:origin:accept/);
  assert.match(src, /career:origin:decline/);
});
