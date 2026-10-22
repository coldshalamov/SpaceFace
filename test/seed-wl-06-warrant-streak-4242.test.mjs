// SEED-WL-06 — a hunter who has already lost the pilot twice says so on the hail.
// firstContact is the live upkeep path. Tipped and grievance hails keep their own lines. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createWarrantHunterWaves } from '../src/systems/warrantHunterWaves.js';
import { warrantHunterById } from '../src/data/warrantHunters.js';

const HUNTER_ID = 'wh_ines_garrow';

function hail(rec, entryExtra = {}) {
  const hunterEnt = { id: 9, alive: true, pos: { x: 80, y: 0, z: 0 }, data: { ai: {} } };
  const state = {
    meta: { seed: 4242 },
    tick: 4,
    simTime: 12,
    playerId: 1,
    player: { bounty: 0, heat: 0 },
    lawSecurity: {
      warrantHunters: {
        schemaVersion: 1,
        arrivalCount: 1,
        lastWaveArrival: 1,
        lastWaveT: 0,
        bolder: 0,
        hunters: {
          [HUNTER_ID]: {
            encounters: 2,
            timesEscapedYou: 0,
            timesYouEscaped: 0,
            timesDisabled: 0,
            lastSectorId: 'sector_helios_prime',
            lastOutcome: null,
            recoverUntilT: 0,
            grievance: null,
            ...rec,
          },
        },
      },
    },
    entities: new Map([
      [1, { id: 1, alive: true, pos: { x: 0, y: 0, z: 0 } }],
      [9, hunterEnt],
    ]),
    world: { currentSectorId: 'sector_helios_prime' },
    ui: {},
  };
  const hails = [];
  const bus = {
    emit(name, payload) { hails.push({ name, payload }); },
    on() { return () => {}; },
  };
  const waves = createWarrantHunterWaves({
    state,
    bus,
    helpers: { voice: { say() { return true; } } },
  });
  waves._view().live.set(9, {
    entity: hunterEnt,
    hunterId: HUNTER_ID,
    role: 'boss',
    waveId: 'w-4242',
    targetId: 1,
    hailed: false,
    ...entryExtra,
  });
  waves.update(1 / 60, state);
  waves.destroy();
  return hails.filter((row) => row.name === 'warrant:hail').map((row) => row.payload);
}

test('seed 4242: two getaways name the streak; a tip and a grievance keep their own hail', () => {
  const hunter = warrantHunterById(HUNTER_ID);
  const streak = hail({ timesYouEscaped: 3 });
  assert.equal(streak.length, 1);
  assert.equal(streak[0].kind, 'streak');
  assert.equal(streak[0].text, 'Ines Garrow: 3 times you got away. The warrant still has your name.');

  const disabled = hail({ timesDisabled: 2, lastOutcome: 'disabled' });
  assert.equal(disabled[0].kind, 'streak');
  assert.equal(disabled[0].text, 'Ines Garrow: 2 times you got away. The warrant still has your name.');

  const once = hail({ timesYouEscaped: 1 });
  assert.equal(once[0].kind, 'first');
  assert.ok(hunter.voice.first.includes(once[0].text));

  const tipped = hail({ timesYouEscaped: 4 }, { tippedBy: 'fence_unknown' });
  assert.equal(tipped[0].kind, 'tipped');
  assert.match(tipped[0].text, /a friend of yours/);
  assert.equal(tipped[0].text.includes('times you got away'), false);

  const grudge = hail(
    { timesYouEscaped: 4, grievance: 'rammed' },
    { returning: true },
  );
  assert.equal(grudge[0].kind, 'grievance');
  assert.equal(grudge[0].text, hunter.voice.grievance.rammed);
});
