import test from 'node:test';
import assert from 'node:assert/strict';
import { aceMemory } from '../src/systems/aceMemory.js';
import { tickerEventRef } from '../src/ui/marketNews.js';
import { infStoryScenario, STORY_SECTOR } from './helpers/infStoryScenario.mjs';

test('STORY-10 [4242] ace:defeated makes one cited headline naming the ace and venue', () => {
  const h = infStoryScenario([aceMemory], { news: true });
  try {
    const payload = { aceId: 'ace_yara_no_cut', sectorId: STORY_SECTOR, t: h.state.simTime };
    h.bus.emit('ace:defeated', payload);
    h.bus.emit('ace:defeated', { ...payload, t: 101 });
    h.bus.emit('namedAce:defeated', { ...payload, t: 102 });
    assert.equal(h.wire.getLog().length, 1);
    assert.equal(h.headlines.length, 1);
    const line = h.wire.getLog()[0];
    assert.equal(line.text, "Yara No-Cut defeated at Helios Prime; Red Latch Crew loses its captain. Source: ship's combat log.");
    assert.equal(tickerEventRef(line).source, 'aceMemory');
    assert.equal(line.sourceRef, 'ace:defeated:ace_yara_no_cut:100');
    assert.equal(h.state.aceMemory.ace_yara_no_cut.defeated, true);
    assert.equal(h.state.aceMemory.ace_yara_no_cut.defeatedAt, 100, 'replays preserve the cited defeat time');
    const owner = h.sim.registry.get('aceMemory');
    owner.deserialize(JSON.parse(JSON.stringify(owner.serialize())));
    h.bus.emit('namedAce:defeated', payload);
    assert.equal(h.wire.getLog().length, 1, 'restored defeats cannot publish twice');
    h.bus.emit('namedAce:defeated', { ...payload, aceId: 'ace_toll_saint_venn' });
    assert.equal(h.wire.getLog().length, 2, 'a different defeat has its own headline');
  } finally { h.dispose(); }
});
