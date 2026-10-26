import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { BARKS, SECTOR_GREETING_BARKS, sectorGreetingBarkFor } from '../src/data/barks.js';
import { hash32 } from '../src/core/rng.js';
import { createSimulation } from '../src/core/sim.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';

// V-01: the ambient pass-by hail was the only comms surface with zero sector
// knowledge — one faction-keyed pool spoke in all twenty-five sectors. A
// sector bank now answers the even-index share of hails; the faction pool
// keeps the rest.

const WORD_LIMIT = 12;

function wordCount(line) {
  return String(line).trim().split(/\s+/).filter((tok) => /[\p{L}\p{N}]/u.test(tok)).length;
}

test('every live sector has a non-empty greeting bank of short lines', () => {
  for (const sector of SECTORS) {
    const bank = SECTOR_GREETING_BARKS[sector.id];
    assert.ok(Array.isArray(bank) && bank.length >= 3, `${sector.id} bank non-empty`);
    for (const line of bank) {
      assert.equal(typeof line, 'string', `${sector.id} line is a string`);
      assert.ok(wordCount(line) <= WORD_LIMIT, `${sector.id} line within ${WORD_LIMIT} words: ${line}`);
    }
  }
});

test('sectorGreetingBarkFor answers the even-index share and nothing else', () => {
  const bank = SECTOR_GREETING_BARKS.sector_sedna_dark;
  assert.ok(bank.includes(sectorGreetingBarkFor('sector_sedna_dark', 0)));
  assert.ok(bank.includes(sectorGreetingBarkFor('sector_sedna_dark', 4)));
  assert.equal(sectorGreetingBarkFor('sector_sedna_dark', 1), null, 'odd index falls back to faction');
  assert.equal(sectorGreetingBarkFor('sector_sedna_dark', 7), null);
  assert.equal(sectorGreetingBarkFor('sector_nowhere', 0), null, 'unbanked sector stays silent');
  assert.equal(sectorGreetingBarkFor(null, 0), null);
});

test('_speak mixes a sector line into the patrol-greeting share on the live path', () => {
  const sim = createSimulation({ seed: 4242, systems: [barkDirector, voiceArbiter] });
  const { state } = sim;
  const director = sim.registry.get('barkDirector');
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_sedna_dark';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 220, hullMax: 220, radius: 10,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;

  // Find one hull id whose greeting index is even (sector share) and one odd
  // (faction share) under this seed — the same deterministic index _speak uses.
  const seed = state.meta && state.meta.seed;
  let evenId = null, oddId = null;
  for (let i = 1; (!evenId || !oddId) && i < 400; i++) {
    const id = `hail-${i}`;
    const idx = hash32(seed == null ? 0 : seed, 'barkDirector', String(id), 'patrol-greeting');
    if (idx % 2 === 0 && !evenId) evenId = id;
    if (idx % 2 === 1 && !oddId) oddId = id;
  }
  assert.ok(evenId && oddId, 'found hull ids on both sides of the mix');

  const voices = [];
  sim.bus.on('barkDirector:voice', (p) => voices.push(p));
  const sectorBank = SECTOR_GREETING_BARKS.sector_sedna_dark;

  const evenHull = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 200, z: 0 },
    hull: 90, hullMax: 90, radius: 8, data: {},
  });
  state.entities.delete(evenHull.id);
  evenHull.id = evenId;
  state.entities.set(evenId, evenHull); // the map keys by entity.id — keep the rename consistent
  assert.equal(director._speak(evenHull, 'patrol-greeting', 'pass-by'), true);
  assert.ok(sectorBank.includes(voices[0].text),
    `even-index hull speaks the sector bank, got: ${voices[0].text}`);

  // Let the ambient gap lapse so the second hail is not suppressed.
  state.simTime = (state.simTime || 0) + 120;
  const oddHull = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 260, z: 0 },
    hull: 90, hullMax: 90, radius: 8, data: {},
  });
  state.entities.delete(oddHull.id);
  oddHull.id = oddId;
  state.entities.set(oddId, oddHull);
  assert.equal(director._speak(oddHull, 'patrol-greeting', 'pass-by'), true);
  assert.ok(BARKS.faction_free['patrol-greeting'].includes(voices[1].text),
    `odd-index hull keeps the faction pool, got: ${voices[1].text}`);
  assert.ok(!sectorBank.includes(voices[1].text), 'the faction line is not a sector line');
});
