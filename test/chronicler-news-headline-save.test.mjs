// A news headline becomes a chronicler fact (normalize.js 'news:headline', stage 'story'), so a save that
// carries one must load back. persistence.js validates every saved fact against EVENT_STAGES and a detail-key
// whitelist; a recordable event missing from either made `Continue` throw "reading 'includes'" on any run that
// had seen a headline, including a fresh New Game (the opening news line is one).
// Run: node --test test/chronicler-news-headline-save.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { chronicler } from '../src/systems/chronicler.js';
import { FACT_EVENTS } from '../src/chronicler/schema.js';

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [chronicler] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_ceres_belt';
  return { sim, state: sim.state, bus: sim.bus, chron: sim.registry.get('chronicler') };
}
const facts = (state) => state.chronicler.stories.flatMap((s) => s.nodes);

test('a recorded news headline survives serialize/deserialize', () => {
  const t = boot();
  t.bus.emit('news:headline', { headline: 'AFTERMATH REPORTED IN THE TALLY: SHIP WRECKAGE NOW DRIFTING ON THE LANE.', kind: 'aftermath', markerId: 'aft_demo' });
  t.sim.step();
  const before = facts(t.state).filter((f) => f.event === 'news:headline');
  assert.equal(before.length, 1, 'the headline was recorded as a fact');
  const snapshot = JSON.parse(JSON.stringify(t.chron.serialize()));
  assert.doesNotThrow(() => t.chron.deserialize(snapshot), 'the saved headline validates on load');
  const after = facts(t.state).filter((f) => f.event === 'news:headline');
  assert.equal(after.length, 1);
  assert.equal(after[0].details.note, before[0].details.note);
});

test('every event the chronicler can record has a stage table entry, so no saved fact can throw on load', async () => {
  const src = await (await import('node:fs/promises')).readFile(new URL('../src/chronicler/persistence.js', import.meta.url), 'utf8');
  const table = src.slice(src.indexOf('const EVENT_STAGES'), src.indexOf('function check('));
  for (const event of FACT_EVENTS) assert.ok(table.includes(`'${event}'`), `EVENT_STAGES is missing ${event}`);
});
