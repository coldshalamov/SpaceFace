// SFQ-B112 — a player-caused distress names the real stand-down, and does not
// promise one when the pilot is already wanted. NPC distress stays the cause line.
import test from 'node:test';
import assert from 'node:assert/strict';

import { authorityIncidentReadout, firstLawOptionLine } from '../src/ui/sectorLawPresenter.js';

function state(heat) {
  return {
    mode: 'flight',
    simTime: 20,
    playerId: 'player',
    meta: { seed: 4242 },
    player: { heat, cargo: { items: {} } },
    ui: { docked: false },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    entities: new Map(),
  };
}

const distress = {
  id: 'law:4242',
  stationId: 'station_helios',
  factionId: 'faction_scn',
  attackerId: 'player',
  victimId: 'civ',
  cause: 'player_assault',
  status: 'distress',
  dispatchAt: 26,
  responderIds: [],
};

test('seed 4242: an un-wanted pilot can read the stand-down before patrol arrives', () => {
  const view = authorityIncidentReadout(distress, state(0), 20);
  assert.match(view.detail, /Patrol assault inside protected jurisdiction/);
  assert.match(view.detail, /Leave the station ring and hold fire/);
  assert.match(view.detail, /patrol stands down/);
  assert.match(view.statusText, /ETA/);
});

test('seed 4242: a wanted pilot is not told that leaving stands the patrol down', () => {
  const view = authorityIncidentReadout(distress, state(0.2), 20);
  assert.match(view.detail, /already wanted/);
  assert.match(view.detail, /does not stand this patrol down/);
  assert.doesNotMatch(view.detail, /patrol stands down/);
  const piracy = authorityIncidentReadout({ ...distress, cause: 'player_piracy' }, state(0.2), 20);
  assert.match(piracy.detail, /already wanted/);
});

test('seed 4242: NPC distress and a live intercept do not grow an option sentence', () => {
  const s = state(0);
  s.entities.set('raider-7', { id: 'raider-7', type: 'ship', data: { callsign: 'CUTLASS-7' } });
  const npc = authorityIncidentReadout({
    ...distress,
    attackerId: 'raider-7',
    cause: 'hostile_fire',
  }, s, 20);
  assert.match(npc.detail, /Hostile fire/i);
  assert.equal(firstLawOptionLine({ cause: 'hostile_fire', status: 'distress' }, s), '');
  assert.doesNotMatch(npc.detail, /Leave the station ring/);
  const responding = authorityIncidentReadout({
    ...distress,
    status: 'responding',
    responderIds: ['p1'],
  }, state(0), 24);
  assert.equal(responding.detail, 'Patrol assault inside protected jurisdiction');
});
