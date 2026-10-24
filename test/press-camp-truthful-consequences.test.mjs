import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { runtime } from '../src/data/encounters/358-the-press-camp.js';
function setup() {
  const sim = createSimulation({
    seed: 47,
    systems: [spawnBudget, encounterDirector, combat, aiPorts]
  });
  const s = sim.state;
  s.mode = 'flight';
  s.world.currentSectorId = 'sector_ceres_belt';
  s.playerId = sim.spawn({
    type: 'ship',
    team: 0,
    pos: {
      x: 9800,
      z: 9800
    },
    hull: 200,
    radius: 6
  }).id;
  const d = sim.registry.get('encounterDirector');
  assert.equal(d.requestAuthoredEncounter({
    shapeId: 'press_camp_raid',
    encounterId: 'camp_test',
    sectorId: 'sector_ceres_belt',
    anchor: {
      x: 9200,
      z: 9200
    },
    zoneType: 'ambush_lane',
    zoneRadius: 500,
    force: true
  }).ok, true);
  const live = s.encounterDirector.live.camp_test;
  const base = s.entities.get(live.data.baseId),
    captive = s.entities.get(live.data.captiveId),
    guards = d.entsOf(live, 'raider');
  const grants = [],
    reps = [],
    outcomes = [];
  const originalGrant = d.grant.bind(d),
    originalRep = d.rep.bind(d);
  d.grant = (...args) => {
    grants.push(args);
    return originalGrant(...args);
  };
  d.rep = (...args) => {
    reps.push(args);
    return originalRep(...args);
  };
  sim.bus.on('encounter:resolved', p => outcomes.push(p.outcome));
  const tick = () => runtime.tick(d, live, s, s.simTime);
  return {
    sim,
    s,
    d,
    live,
    base,
    captive,
    guards,
    grants,
    reps,
    outcomes,
    tick
  };
}
function freed(h) {
  return h.captive.data.ai.forceFlee === true;
}
for (const kind of ['missing', 'replaced_alive', 'replaced_dead']) test('missing or recycled base is not a destroyed camp: ' + kind, () => {
  const h = setup();
  try {
    h.s.entities.delete(h.base.id);
    if (kind !== 'missing') h.s.entities.set(h.base.id, {
      ...h.base,
      occupantGeneration: h.base.occupantGeneration + 1,
      alive: kind === 'replaced_alive'
    });
    h.tick();
    assert.equal(h.grants.length, 0);
    assert.equal(h.reps.length, 0);
    assert.equal(freed(h), false);
    assert.deepEqual(h.outcomes, ['contact_lost']);
  } finally {
    h.sim.dispose();
  }
});
for (const replace of [false, true]) test('actual killed and reaped base preserves one reward, replacement=' + replace, () => {
  const h = setup();
  try {
    h.sim.registry.get('combat').kill(h.base, h.s.playerId);
    h.s.entities.delete(h.base.id);
    if (replace) h.s.entities.set(h.base.id, {
      ...h.base,
      occupantGeneration: h.base.occupantGeneration + 1,
      alive: true
    });
    h.tick();
    h.tick();
    assert.deepEqual(h.grants, [[120, 'press_camp:base_burned']]);
    assert.equal(h.reps.length, 2);
    assert.equal(freed(h), true);
    assert.deepEqual(h.outcomes, ['base_destroyed']);
    if (replace) assert.equal(h.s.entities.get(h.base.id).alive, true);
  } finally {
    h.sim.dispose();
  }
});
for (const kind of ['absent', 'dead', 'replaced', 'captured', 'player', 'foreign_ai', 'foreign_activity', 'foreign_intent', 'foreign_body']) test('does not free a foreign or unavailable captive: ' + kind, () => {
  const h = setup();
  try {
    let subject = h.captive;
    if (kind === 'absent') h.s.entities.delete(subject.id);
    if (kind === 'dead') subject.alive = false;
    if (kind === 'replaced') {
      subject = {
        ...subject,
        occupantGeneration: subject.occupantGeneration + 1,
        data: {
          ...subject.data,
          ai: {
            ...subject.data.ai
          }
        }
      };
      h.s.entities.set(subject.id, subject);
    }
    if (kind === 'captured') {
      subject.data.vesselId = 'captured_camp_mule';
      h.s.player.ownedShips.push({
        vesselId: subject.data.vesselId
      });
      subject.flags.persistent = true;
    }
    if (kind === 'player') h.s.playerId = subject.id;
    if (kind === 'foreign_ai') subject.data.ai = {
      ...subject.data.ai
    };
    if (kind === 'foreign_activity') subject.data.ai.activity = {
      ...subject.data.ai.activity,
      reason: 'foreign_owner'
    };
    if (kind === 'foreign_intent') subject.data.intent = {
      thrust: 0.7,
      owner: 'foreign'
    };
    if (kind === 'foreign_body') subject.physicsBody = {
      ...subject.physicsBody
    };
    const before = JSON.stringify(subject.data);
    h.sim.registry.get('combat').kill(h.base, h.s.playerId);
    h.tick();
    assert.ok(JSON.stringify(subject.data) === before, 'captive data must be unchanged');
    assert.deepEqual(h.reps, [['faction_reach', -3, 'press_camp_burned']]);
  } finally {
    h.sim.dispose();
  }
});
for (const seam of ['comms', 'grant', 'rep', 'resolve']) test('synchronous ' + seam + ' callback cannot settle twice', () => {
  const h = setup();
  try {
    let once = false;
    const reenter = () => {
      if (!once) {
        once = true;
        h.tick();
      }
    };
    if (seam === 'comms') h.sim.bus.on('comms:log', reenter);else if (seam === 'resolve') h.sim.bus.on('encounter:resolved', reenter);else {
      const original = h.d[seam].bind(h.d);
      h.d[seam] = (...args) => {
        reenter();
        return original(...args);
      };
    }
    h.sim.registry.get('combat').kill(h.base, h.s.playerId);
    h.tick();
    assert.equal(h.grants.length, 1);
    assert.equal(h.reps.length, 2);
    assert.deepEqual(h.outcomes, ['base_destroyed']);
  } finally {
    h.sim.dispose();
  }
});
test('real defeated garrison frees original captive, preserves camp and three authored loot pods', () => {
  const h = setup();
  try {
    for (const guard of h.guards) {
      h.sim.registry.get('combat').kill(guard, h.s.playerId);
      h.s.entities.delete(guard.id);
    }
    h.tick();
    assert.equal(freed(h), true);
    assert.equal(h.base.alive, true);
    assert.equal(h.grants.length, 0);
    assert.deepEqual(h.outcomes, ['garrison_broken']);
    assert.equal(h.live.data.pods.length, 3);
  } finally {
    h.sim.dispose();
  }
});
test('missing guard does not imply defeated garrison', () => {
  const h = setup();
  try {
    for (const guard of h.guards) h.s.entities.delete(guard.id);
    h.tick();
    assert.equal(freed(h), false);
    assert.equal(h.grants.length, 0);
    assert.deepEqual(h.outcomes, ['contact_lost']);
  } finally {
    h.sim.dispose();
  }
});
for (const kind of ['restoring', 'stale_live']) test('cleanup cannot manufacture camp outcome: ' + kind, () => {
  const h = setup();
  try {
    if (kind === 'restoring') h.d._saveRestoring = true;else delete h.s.encounterDirector.live[h.live.id];
    h.s.entities.delete(h.base.id);
    h.tick();
    assert.equal(h.grants.length, 0);
    assert.equal(h.reps.length, 0);
    assert.equal(freed(h), false);
    assert.equal(h.outcomes.length, 0);
  } finally {
    h.sim.dispose();
  }
});
test('timeout cannot later claim a destruction reward', () => {
  const h = setup();
  try {
    h.s.simTime = h.live.deadlineAt;
    h.tick();
    h.sim.registry.get('combat').kill(h.base, h.s.playerId);
    h.tick();
    assert.equal(h.grants.length, 0);
    assert.deepEqual(h.outcomes, ['raid_over']);
    assert.equal(h.base.alive, false);
  } finally {
    h.sim.dispose();
  }
});
for (const boundary of ['save:restoring', 'save:loaded', 'sector:exit']) test('real lifecycle ' + boundary + ' prevents stale settlement', () => {
  const h = setup();
  try {
    h.sim.bus.emit(boundary, {
      sectorId: 'sector_ceres_belt'
    });
    h.s.entities.delete(h.base.id);
    h.tick();
    assert.equal(h.grants.length, 0);
    assert.equal(h.reps.length, 0);
    assert.equal(freed(h), false);
  } finally {
    h.sim.dispose();
  }
});
test('continuous sector crossing retains authentic camp outcome', () => {
  const h = setup();
  try {
    h.sim.bus.emit('sector:exit', {
      sectorId: 'sector_ceres_belt',
      continuous: true
    });
    h.sim.bus.emit('sector:enter', {
      sectorId: 'sector_ceres_belt',
      continuous: true
    });
    h.base.alive = false;
    h.tick();
    assert.deepEqual(h.grants, [[120, 'press_camp:base_burned']]);
    assert.equal(freed(h), true);
  } finally {
    h.sim.dispose();
  }
});
