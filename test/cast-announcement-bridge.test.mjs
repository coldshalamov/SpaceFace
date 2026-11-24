// The Swarm round card and the minimap's "Incoming" line are absent for every player on the
// default worker route when the cast announcement dies at the bridge. The composed cast carries
// groups[i].cast[j] — a depth-5 subtree — and the bridge's generic projection refuses anything
// at EVENT_BRIDGE_DEPTH, dropping the WHOLE event. The adapter projects the card's bounded
// display fields explicitly. This pins the worker-route contract end to end: the real emitter
// shape in, the wire shape out, the card model over the wire shape, and the depth fact that
// makes the adapter load-bearing.
// Run:
//   node --test test/cast-announcement-bridge.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { swarmCastFor } from '../src/data/swarmCourseCast.js';
import { buildCastAnnouncementModel } from '../src/ui/survivalHud.js';
import {
  projectBridgeEvent,
  flattenEventPayload,
} from '../scripts/lib/simEventBridge.mjs';

// Exactly the emit at src/systems/survivalWave.js:455 — same fields, same nesting.
function castAnnouncedPayload(wave) {
  const castRow = swarmCastFor(wave);
  assert.ok(castRow && castRow.plan, `swarmCastFor(${wave}) returns a composed plan`);
  return {
    wave,
    recipeId: castRow.plan.id,
    line: castRow.plan.line,
    answer: castRow.answer || null,
    jobs: castRow.plan.jobs,
    groups: castRow.plan.groups.map((g) => ({
      id: g.id, jobs: g.jobs, formation: g.formation,
      cast: g.cast.map((c) => ({ enemyId: c.enemyId, count: c.count })),
    })),
    tick: 0,
  };
}

test('the cast announcement crosses the worker bridge and still builds a round card', () => {
  for (const wave of [1, 2, 6]) {
    const wire = projectBridgeEvent('encounter:castAnnounced', castAnnouncedPayload(wave));
    assert.equal(wire.dropped, false, `wave ${wave}: the bridge must not drop the announcement`);
    assert.equal(wire.reason, 'adapter');

    // The two live readers get their fields: the card model (survivalHud) and the minimap line
    // (radar reads p.jobs and nothing else).
    const card = buildCastAnnouncementModel(wire.flat);
    assert.ok(card, `wave ${wave}: the card model accepts the wire shape`);
    assert.ok(Array.isArray(card.jobs) && card.jobs.length > 0, `wave ${wave}: the card names its jobs`);
    assert.ok(typeof card.line === 'string' && card.line.length > 0, `wave ${wave}: the card keeps its plain-words line`);
    assert.equal(typeof wire.flat.answer, 'string', `wave ${wave}: the answer crosses as a string`);
    assert.ok(Array.isArray(wire.flat.jobs) && wire.flat.jobs.every((j) => typeof j === 'string'),
      `wave ${wave}: the minimap's jobs are strings`);
    const firstGroup = wire.flat.groups[0];
    assert.ok(firstGroup && Array.isArray(firstGroup.cast) && firstGroup.cast.length > 0
      && typeof firstGroup.cast[0].enemyId === 'string' && Number.isInteger(firstGroup.cast[0].count),
      `wave ${wave}: a group's cast rows survive with enemyId and count`);
  }
});

test('without the adapter the composed cast is unflattenable at depth — the drop the adapter exists to fix', () => {
  // A known depth-exceeded shape returns the flattener's rejection sentinel; the composed cast
  // must return the SAME sentinel, pinning that the generic path can never carry it.
  const rejected = flattenEventPayload({ deep: { a: { b: { c: { d: {} } } } } });
  assert.notEqual(rejected, undefined, 'sanity: the depth-exceeded control is rejected');
  const payload = castAnnouncedPayload(2);
  assert.equal(flattenEventPayload(payload), rejected,
    'groups[i].cast[j] sits past EVENT_BRIDGE_DEPTH — the whole event is dropped without the adapter');
});
