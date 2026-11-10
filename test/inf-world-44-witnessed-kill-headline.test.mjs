import test from 'node:test';
import assert from 'node:assert/strict';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { tickerEventRef } from '../src/ui/marketNews.js';
import { infStoryScenario, STORY_SECTOR } from './helpers/infStoryScenario.mjs';

function scene({ witnessed = true, hostile = true, targeted = true } = {}) {
  const h = infStoryScenario([lawSecurity, aftermathWrecks], { news: true });
  const hauler = h.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: witnessed ? 120 : 600, z: 0 }, radius: 8,
    hull: 80, hullMax: 80,
    data: { callsign: 'Sable Mercy', worldRecordId: 'world:sable-mercy', shipClass: 'hauler', ai: { archetype: 'fleeing_trader' } },
  });
  const pirate = h.sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 80, z: 0 }, radius: 8,
    hull: 0, hullMax: 80,
    data: { worldRecordId: 'world:red-latch-raider', shipClass: 'raider',
      combat: { targetId: targeted ? hauler.id : null }, ai: { archetype: 'corsair_raider' } },
  });
  const truths = [];
  h.bus.on('law:killedAdjudicated', (p) => truths.push(p));
  const kill = {
    id: pirate.id, killerId: h.state.playerId, type: 'ship', pos: { ...pirate.pos },
    victimClass: 'raider', factionId: 'faction_reach', factionLawful: false, targetHostileToPlayer: hostile,
  };
  return { ...h, pirate, truths, kill };
}

test('WORLD-44 [4242] a lawful witnessed raider kill cites the saved hull once', () => {
  const h = scene();
  try {
    h.bus.emit('entity:killed', h.kill);
    h.bus.emit('entity:killed', h.kill);
    assert.equal(h.truths[0].outcome, 'lawful');
    assert.equal(h.truths[0].witnessed, true);
    assert.equal(h.wire.getLog().length, 1, 'generic wreck news does not duplicate rescue news');
    assert.equal(h.headlines.length, 1);
    const line = h.wire.getLog()[0];
    assert.equal(line.text, 'Raider destroyed at Helios Prime; Sable Mercy saved. Source: 1 eyewitness report.');
    assert.equal(tickerEventRef(line).source, 'law:killedAdjudicated');
    assert.equal(line.sourceRef, `pirate-kill:${STORY_SECTOR}:world:red-latch-raider:6000`);
    assert.deepEqual(line.witnessStableIds, ['world:sable-mercy']);
    assert.equal(h.state.aftermathWrecks.bySector[STORY_SECTOR].length, 1, 'physical aftermath remains durable');
    const truth = h.truths[0];
    h.bus.emit('game:newGame', {});
    assert.equal(h.wire.getLog().length, 0);
    h.bus.emit('law:killedAdjudicated', truth);
    assert.equal(h.wire.getLog().length, 1, 'a fresh game does not inherit another timeline\'s suppression');
  } finally { h.dispose(); }
});

test('WORLD-44 [4242] LAW-08: no witness means no public headline, while the wreck remains', () => {
  const h = scene({ witnessed: false });
  try {
    h.bus.emit('entity:killed', h.kill);
    assert.equal(h.truths[0].outcome, 'unwitnessed');
    assert.equal(h.truths[0].witnessCount, 0);
    assert.equal(h.wire.getLog().length, 0);
    assert.equal(h.headlines.length, 0);
    assert.equal(h.state.aftermathWrecks.bySector[STORY_SECTOR].length, 1);
  } finally { h.dispose(); }
});

test('WORLD-44 [4242] an unlawful kill or unrelated bystander cannot become a rescue', () => {
  for (const options of [{ hostile: false }, { targeted: false }]) {
    const h = scene(options);
    try {
      h.bus.emit('entity:killed', h.kill);
      assert.equal(h.wire.getLog().length, 0);
      assert.equal(h.truths[0].savedHull, undefined);
    } finally { h.dispose(); }
  }
});
