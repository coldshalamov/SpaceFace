// THE GRANDEE (363) — the lanes' one famous ship makes a rare announced run: an Atlas-class
// celebrity with her standing escort, announced on the wire, hailing you in her own voice,
// gone by the season's turn. Killing her is the "oh fuck, I did that" outcome the vision asks
// the world to answer honestly.
//
// Focused contract (deterministic, sim-time only):
//   1. fire fields the famous hull (complete ship spec — NOT an enemy archetype), her escort
//     pair, her identity stamps, and the inbound wire;
//   2. the crossing closes into a holding: formation targets clear, the hold is spoken once,
//     and the transit resolves with its receipt and cleared-the-pocket wire;
//   3. fire drawn on her flips the receipt to the harried variant and warns once;
//   4. her death resolves grandee_lost with the standing hit and the memorial wire;
//   5. her pass-by hail speaks in the grandee register exactly once per contact, and the
//     tourist hail still works after the shared-hail refactor.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { trafficRoleHail } from '../src/data/barks.js';

const OBSERVED = Object.freeze([
  'encounter:telegraph',
  'encounter:spawned',
  'encounter:resolved',
  'encounter:receipt',
  'encounter:voice',
  'faction:repDelta',
  'news:publish',
  'npc:hailed',
]);

const SECTOR = 'sector_helios_prime';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [encounterDirector, barkDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  sim.state.story.beatIndex = 7;
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector'), barks: sim.registry.get('barkDirector') };
}

function record(t, names = OBSERVED) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

function fire(t, suffix) {
  const result = t.director.requestAuthoredEncounter({
    shapeId: 'the_grandee_transit',
    encounterId: `grandee:${suffix}`,
    sectorId: SECTOR,
    anchor: { x: 0, z: 0 },
    force: true,
  });
  assert.equal(result.ok, true, `fire ${suffix}: ${JSON.stringify(result)}`);
  return result.encounterId;
}

const liveOf = (t, id) => t.state.encounterDirector.live[id];
const countOf = (rows, name, match) => rows.filter(
  (r) => r.name === name && (!match || JSON.stringify(r.payload).includes(match)),
).length;

test('grandee: fire fields the famous hull, her escorts, and the inbound wire', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'cast');

  const live = liveOf(t, id);
  assert.ok(live, 'the transit owns a live record');
  assert.equal(t.director.aliveCount(live, 'squad'), 1, 'exactly one Grandee');
  assert.equal(t.director.aliveCount(live, 'escort'), 2, 'the standing escort pair');

  const grandee = t.director.entsOf(live, 'squad')[0];
  assert.equal(grandee.data.defId, 'ship_atlas', 'she is the biggest civilian hull the kit owns');
  assert.equal(grandee.data.name, 'The Grandee of Helion');
  assert.equal(grandee.data.callsign, 'GRANDEE-1');
  assert.equal(grandee.data.laneGrandee, true, 'the hail routing flag rides her');
  assert.equal(grandee.data.bountyCr, 0, 'she is not a bounty');
  assert.ok(grandee.data.ai.targetId != null, 'the crossing is committed: she burns at her pathfinder');

  assert.equal(countOf(rows, 'news:publish', 'THE GRANDEE IS RUNNING'), 1, 'the run makes the wire');
  assert.equal(countOf(rows, 'encounter:voice', 'she does not corner'), 1, 'lane control announces her');
});

test('grandee: the crossing holds, speaks once, and clears on the wire', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'transit');
  const live = liveOf(t, id);
  const grandee = t.director.entsOf(live, 'squad')[0];

  // The pathfinder closes the crossing manually: without the NPC-movement systems registered,
  // approach is this test's hand, not the sim's — the runtime only owns the decision.
  const escorts = t.director.entsOf(live, 'escort');
  escorts[0].pos.x = grandee.pos.x + 40;
  escorts[0].pos.z = grandee.pos.z;

  for (let i = 0; i < 60 * 10; i++) t.sim.step(); // 10 s
  assert.equal(live.data.grandee.phase, 'holding', 'a closed gap becomes a hold');
  assert.equal(grandee.data.ai.targetId, null, 'she coasts: the drive answers at the hold');
  for (const esc of t.director.entsOf(live, 'escort')) {
    assert.equal(esc.data.ai.targetId, null, 'the escort pair stands down to formation');
  }

  for (let i = 0; i < 60 * 50 && liveOf(t, id); i++) t.sim.step(); // through the hold
  const resolved = rows.filter((r) => r.name === 'encounter:resolved'
    && r.payload.outcome === 'transit_over');
  assert.equal(resolved.length, 1, 'the clean transit resolves once');
  assert.equal(countOf(rows, 'encounter:voice', 'gone till the season turns'), 1, 'the hold is spoken once');
  assert.equal(countOf(rows, 'news:publish', 'CLEARED THE POCKET'), 1, 'the departure makes the wire');
  const receipt = rows.find((r) => r.name === 'encounter:receipt' && r.payload.outcome === 'transit_over');
  assert.ok(receipt && receipt.payload.text.includes('CLEARED'), 'the receipt speaks');
  assert.ok(grandee.data.despawnAt != null, 'the cast burns out on the ordinary despawn path');
  assert.equal(liveOf(t, id), undefined, 'no live record leaks');
});

test('grandee: fire drawn on her flips the receipt to the harried variant', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'harried');
  const live = liveOf(t, id);
  const grandee = t.director.entsOf(live, 'squad')[0];

  grandee.hull = grandee.hull - 40;
  for (let i = 0; i < 60 * 2; i++) t.sim.step();
  assert.equal(live.data.grandee.hitSeen, true, 'the escort answers the first shot');
  assert.equal(countOf(rows, 'encounter:voice', 'harassing a civilian run'), 1, 'the warning is said once');

  const escorts = t.director.entsOf(live, 'escort');
  escorts[0].pos.x = grandee.pos.x + 30;
  escorts[0].pos.z = grandee.pos.z;
  for (let i = 0; i < 60 * 130 && liveOf(t, id); i++) t.sim.step();

  const resolved = rows.filter((r) => r.name === 'encounter:resolved'
    && r.payload.outcome === 'transit_harried');
  assert.equal(resolved.length, 1, 'the harried transit resolves with its own outcome');
  const receipt = rows.find((r) => r.name === 'encounter:receipt' && r.payload.outcome === 'transit_harried');
  assert.ok(receipt && receipt.payload.text.includes('ANGRY'), 'the harried receipt speaks');
});

test('grandee: her death resolves grandee_lost with the standing hit and the memorial wire', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'lost');

  const grandee = t.director.entsOf(liveOf(t, id), 'squad')[0];
  grandee.alive = false;
  for (let i = 0; i < 60 * 3 && liveOf(t, id); i++) t.sim.step();

  const resolved = rows.filter((r) => r.name === 'encounter:resolved'
    && r.payload.outcome === 'grandee_lost');
  assert.equal(resolved.length, 1, 'the loss resolves once');
  const reps = rows.filter((r) => r.name === 'faction:repDelta' && r.payload.reason === 'grandee_lost');
  assert.equal(reps.length, 1, 'the standing hit lands once');
  assert.equal(reps[0].payload.delta, -8);
  assert.equal(countOf(rows, 'news:publish', 'THE GRANDEE IS GONE'), 1, 'the pocket remembers on the wire');
  assert.equal(liveOf(t, id), undefined, 'no live record leaks');
});

test('grandee: her pass-by hail speaks once in her own register; the tourist hail still works', () => {
  const t = boot();
  const rows = record(t, ['barkDirector:voice', 'npc:hailed']);
  const said = [];
  t.barks.helpers = { voice: { say: (o) => { said.push(o); return true; } } };

  const result = t.barks._speakGrandeeHail({
    id: 'ent_grandee_1', type: 'ship', team: 2, alive: true,
    pos: { x: 0, z: 0 }, data: { laneGrandee: true, ai: {} },
  });
  assert.equal(result, true, 'the grandee hail speaks');
  assert.equal(said.length, 1);
  assert.equal(said[0].register, 'grandee', 'she sounds famous, not freighter');
  assert.equal(t.barks._speakGrandeeHail({ id: 'ent_grandee_1', data: { laneGrandee: true, ai: {} } }), false,
    'once per contact');
  assert.equal(countOf(rows, 'barkDirector:voice', 'grandee'), 1);
  assert.equal(countOf(rows, 'npc:hailed'), 1);

  // Fresh boot: the ambient-gap law suppresses a second pass-by hail inside one window —
  // that gating is pre-existing behavior shared by every register, not part of this contract.
  const t2 = boot();
  const said2 = [];
  t2.barks.helpers = { voice: { say: (o) => { said2.push(o); return true; } } };
  const tourist = t2.barks._speakTouristHail({
    id: 'ent_tourist_1', type: 'ship', team: 2, alive: true,
    pos: { x: 0, z: 0 }, data: { trafficRole: 'tourist', ai: {} },
  });
  assert.equal(tourist, true, 'the tourist hail still speaks after the shared-hail refactor');
  assert.equal(said2[0].register, 'tourist');

  const pick = trafficRoleHail('grandee', 3);
  assert.ok(pick && pick.register === 'grandee' && pick.text, 'the grandee register resolves');
});
