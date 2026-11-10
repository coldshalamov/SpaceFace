import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { countermeasures } from '../src/systems/countermeasures.js';
import { weapons } from '../src/systems/weapons.js';

function encounter() {
  const target = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 },
    data: { fittings: ['mod_ecm_jammer_l'], combat: {} } };
  const missile = { id: 20, type: 'projectile', alive: true, team: 1, ownerId: 2,
    pos: { x: 200, z: -60 }, vel: { x: -80, z: 0 }, data: {
      kind: 'missile', ownerId: 2, targetId: 1, turnRate: 3.5, projSpeed: 80 } };
  const state = { mode: 'flight', playerId: 1, tick: 120, simTime: 2, rng: () => 0,
    runtime: { features: { massline2: { enabled: true, cloak: true } } },
    massline2: { cloak: { active: true, radius: 20 } }, input: {},
    entities: new Map([[1, target], [20, missile]]), entityList: [target, missile] };
  const bus = createBus();
  const helpers = { getEntity: (id) => state.entities.get(id) };
  const cm = Object.create(countermeasures);
  cm.init({ state, bus, helpers });
  const guns = Object.create(weapons);
  guns.helpers = helpers;
  guns.bus = bus;
  return { state, target, missile, cm, guns };
}

test('cloak fading cannot restore steering while ECM still holds the missile', () => {
  const h = encounter();
  h.guns._steerHoming(1 / 60, h.state);
  assert.equal(h.cm._tryDeploy(h.target), true);
  h.cm.update(1 / 60, h.state);
  assert.equal(h.missile.data.turnRate, 0);
  h.guns._steerHoming(1 / 60, h.state);
  assert.equal(h.missile.data.turnRate, 0, 'cloak cannot overwrite the active jam');
  h.state.massline2.cloak.active = false;
  h.guns._steerHoming(1 / 60, h.state);
  assert.equal(h.missile.data.turnRate, 0, 'revealing the target cannot bypass ECM');
  h.cm.update(5, h.state);
  h.guns._steerHoming(1 / 60, h.state);
  assert.equal(h.missile.data.turnRate, 3.5, 'the authored seeker returns after both effects end');
  h.cm.destroy();
});

test('cloaking an already jammed target keeps its authored steering for later recovery', () => {
  const h = encounter();
  h.state.massline2.cloak.active = false;
  assert.equal(h.cm._tryDeploy(h.target), true);
  h.cm.update(1 / 60, h.state);
  h.state.massline2.cloak.active = true;
  h.guns._steerHoming(1 / 60, h.state);
  h.state.massline2.cloak.active = false;
  h.cm.update(5, h.state);
  h.guns._steerHoming(1 / 60, h.state);
  assert.equal(h.missile.data.turnRate, 3.5, 'cloak must not remember ECM zero as the authored seeker');
  h.cm.destroy();
});

test('a full cloak diversion keeps residual steering after ECM expires', () => {
  const h = encounter();
  assert.equal(h.cm._tryDeploy(h.target), true);
  h.cm.update(1 / 60, h.state);
  h.guns._steerHoming(1.2, h.state);
  assert.equal(h.missile.data.diverted, true);
  assert.equal(h.missile.data.turnRate, 0);
  const staleFix = { ...h.missile.data.divertPos };
  h.state.massline2.cloak.active = false;
  h.cm.update(5, h.state);
  h.guns._steerHoming(1 / 60, h.state);
  assert.equal(h.missile.data.turnRate, 3.5 * 0.25,
    'ECM release cannot upgrade the permanently stale cloak fix to full seeker authority');
  assert.deepEqual(h.missile.data.divertPos, staleFix);
  assert.equal(h.missile.data.diverted, true);
  h.guns._steerHoming(1 / 60, h.state);
  assert.equal(h.missile.data.turnRate, 3.5 * 0.25);
  h.cm.destroy();
});
