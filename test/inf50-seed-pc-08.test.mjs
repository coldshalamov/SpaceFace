// SEED-PC-08 — Share heat on Twelve Degrees opens only with the heat lure fitted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileVignette } from '../src/systems/vignetteInterpreter.js';
import * as twelve from '../src/data/encounters/386-the-twelve-degrees.js';

function world({ fittings = [], cargo = {} } = {}) {
  const state = {
    encounterDirector: { stats: {} },
    playerId: 1,
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: { fittings } }]]),
    player: { credits: 0, cargo: { items: { ...cargo }, usedVolume: 0, capVolume: 10 } },
  };
  const calls = { offers: [], grants: [], charges: [], resolved: [] };
  let now = 100;
  let nextId = 10;
  const live = {
    id: 'test:hardware', shapeId: 'trade', vars: {}, ids: [], roles: {},
    anchor: { x: 0, z: 0 }, phase: 'telegraph', data: {},
    shape: { choices: [], timeoutChoice: 'c', title: 'TWELVE' },
  };
  const d = {
    now: () => now,
    player: () => ({ pos: { x: 0, z: 0 } }),
    say() {},
    offerChoices(_l, ids) { calls.offers.push(ids.slice()); },
    spawnShips(row, ships) {
      return ships.map((ship) => {
        const entityId = nextId++;
        state.entities.set(entityId, { id: entityId, type: 'ship', alive: true, pos: { ...ship.pos }, rot: 0, data: {} });
        row.ids.push(entityId);
        row.roles[entityId] = ship.role;
        return entityId;
      });
    },
    spawnProp() { return { id: nextId++, data: {} }; },
    entsOf: (row) => row.ids.map((id) => state.entities.get(id)).filter((entity) => entity && entity.type === 'ship'),
    grant(amount, reason) { calls.grants.push({ amount, reason }); },
    charge(amount, reason) { calls.charges.push({ amount, reason }); },
    rep() {},
    resolve(row, outcome) { calls.resolved.push(outcome); row.phase = 'done'; },
    abort(row, reason) { calls.resolved.push(`abort:${reason}`); row.phase = 'done'; },
  };
  const drive = (runtime, choiceId) => {
    runtime.fire(d, live, state);
    let steps = 0;
    while (live.phase !== 'offer' && live.phase !== 'done' && steps++ < 80) {
      now = live.deadlineAt + 0.01;
      runtime.tick(d, live, state, now);
    }
    if (choiceId) runtime.choose(d, live, state, choiceId);
  };
  return { state, calls, live, drive };
}

test('the generated share-heat choice stays shut without the heat lure', () => {
  const source = readFileSync(new URL('../src/data/encounters/386-the-twelve-degrees.js', import.meta.url), 'utf8');
  const generator = readFileSync(new URL('../scripts/build-lived-vignettes.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('"module": "mod_heat_lure_s"'), true);
  assert.equal(generator.includes("twelve_degrees"), true);
  assert.equal(generator.includes('mod_heat_lure_s'), true);

  const shut = world();
  const creditsBefore = shut.state.player.credits;
  const cargoBefore = JSON.stringify(shut.state.player.cargo);
  shut.drive(twelve.runtime, 'a');
  assert.equal(shut.live.phase, 'offer');
  assert.equal(shut.calls.offers.at(-1).includes('a'), false);
  assert.equal(shut.calls.offers.at(-1).includes('c'), true);
  assert.deepEqual(shut.calls.resolved, []);
  assert.equal(shut.state.player.credits, creditsBefore);
  assert.equal(JSON.stringify(shut.state.player.cargo), cargoBefore);

  const open = world({ fittings: ['mod_heat_lure_s'] });
  open.drive(twelve.runtime, 'a');
  assert.equal(open.calls.offers.at(-1).includes('a'), true);
  assert.deepEqual(open.calls.resolved, ['a']);
});

test('a commodity gate hides the choice until the hold has it', () => {
  const spec = {
    id: 'unit_hardware',
    title: 'UNIT',
    factionId: 'faction_free',
    start: 'offer',
    choices: [
      { id: 'a', label: 'Hand over ice', playerLine: 'Ice.', requires: { commodity: 'cmdty_ice_water', qty: 1 } },
      { id: 'c', label: 'Leave', playerLine: 'Leaving.' },
    ],
    timeoutChoice: 'c',
    phases: [
      { id: 'offer', verb: 'offer', windowS: 10, motion: 'hold', onChoice: { a: 'done_a', c: 'done_c' } },
      { id: 'done_a', verb: 'resolve', outcome: 'a' },
      { id: 'done_c', verb: 'resolve', outcome: 'c' },
    ],
  };
  const runtime = compileVignette(spec);
  const shut = world();
  shut.drive(runtime, 'a');
  assert.equal(shut.calls.offers.at(-1).includes('a'), false);
  assert.deepEqual(shut.calls.resolved, []);
  const open = world({ cargo: { cmdty_ice_water: 1 } });
  open.drive(runtime, 'a');
  assert.equal(open.calls.offers.at(-1).includes('a'), true);
  assert.deepEqual(open.calls.resolved, ['a']);
  assert.equal(open.state.player.cargo.items.cmdty_ice_water, 1);
});
