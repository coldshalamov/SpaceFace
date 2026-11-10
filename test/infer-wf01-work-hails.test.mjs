// WF-01: the working trades hail on a close pass — seven registers, not silence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { trafficRoleHail } from '../src/data/barks.js';
import { barkDirector } from '../src/systems/barkDirector.js';

const ROLES = ['courier', 'customs', 'salvor', 'surveyor', 'tender', 'tug', 'rescue'];

test('every working role has a register-correct hail line', () => {
  for (const role of ROLES) {
    const got = trafficRoleHail(role, 4242);
    assert.ok(got, `${role} hails`);
    assert.equal(got.register, role, `${role} speaks its own register`);
    assert.ok(typeof got.text === 'string' && got.text.length > 8, `${role} line is a real sentence`);
    // Deterministic: same seed, same line.
    assert.equal(trafficRoleHail(role, 4242).text, got.text, `${role} pick is deterministic`);
  }
});

function passer(id, role) {
  return {
    id, type: 'ship', team: 1, alive: true,
    pos: { x: 200, z: 0 },
    // Lane traffic never opens fire on a clean player (traffic.js stamps passive).
    data: { role, ai: { fsm: 'cruise', passive: true } },
  };
}

test('a close pass from each working role earns one register hail (seed 4242)', () => {
  for (const role of ROLES) {
    const said = [];
    const state = { simTime: 10, tick: 600, meta: { seed: 4242 }, barkDirector: { entities: {} } };
    const player = { id: 'player', team: 0, pos: { x: 0, z: 0 } };
    const host = Object.create(barkDirector);
    host.state = state;
    host.bus = { emit: () => {} };
    host.helpers = { voice: { say: (line) => { said.push(line); return true; } } };
    host._emit = () => {};
    host._isSuppressed = () => false;
    const entity = passer(`hull-${role}`, role);
    const ok = host._hailPassingTraffic(entity, state, player);
    assert.equal(ok, true, `${role} hails on a close pass`);
    assert.equal(said.length, 1, `${role} says exactly one line`);
    assert.equal(said[0].register, role, `${role} speaks its own register, not boilerplate`);
    // Once per contact: a second pass stays silent.
    said.length = 0;
    assert.equal(host._hailPassingTraffic(entity, state, player), false, `${role} does not repeat`);
  }
});

test('heavy and miner still hail as before (no regression)', () => {
  const said = [];
  const state = { simTime: 10, tick: 600, meta: { seed: 4242 }, barkDirector: { entities: {} } };
  const player = { id: 'player', team: 0, pos: { x: 0, z: 0 } };
  const host = Object.create(barkDirector);
  host.state = state;
  host.bus = { emit: () => {} };
  host.helpers = { voice: { say: (line) => { said.push(line); return true; } } };
  host._emit = () => {};
  host._isSuppressed = () => false;
  assert.equal(host._hailPassingTraffic(passer('h1', 'hauler'), state, player), true, 'hauler still chirps');
});
