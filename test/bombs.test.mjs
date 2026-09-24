// Drift-bomb bay seams (src/systems/bombs.js, design/ORDNANCE_BOMBS_SPEC.md).
// House pattern per test/AGENTS.md: seeded state, sim clock only, no wall sleeps, public
// behavior asserted through events and the routed ports (never internal mirrors).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { BOMB_DEFS, BOMB_DRIFT } from '../src/data/bombs.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { bombs } from '../src/systems/bombs.js';

const DT = 1 / 60;

function bootBombs({ playerVel = { x: 0, z: 0 }, selectedId = 'bomb_frag' } = {}) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, mass: 32, radius: 6, rot: 0,
    pos: { x: 0, z: 0 }, vel: { ...playerVel },
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const routed = [];
  const impulses = [];
  const dropped = [];
  const armed = [];
  const detonated = [];
  const fieldEnded = [];
  const cycles = [];
  const released = [];
  bus.on('bombs:dropped', (p) => dropped.push(p));
  bus.on('bombs:armed', (p) => armed.push(p));
  bus.on('bombs:detonated', (p) => detonated.push(p));
  bus.on('bombs:fieldEnded', (p) => fieldEnded.push(p));
  bus.on('bombs:cycle', (p) => cycles.push(p));
  bus.on('bombs:released', (p) => released.push(p));
  let nextId = 50;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, hull: 1, hullMax: 1, ...spec };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    routeCombatDamage(req) { routed.push(req); return { ok: true }; },
    combatPhysics: {
      applyImpulse(req) { impulses.push(req); return true; },
    },
  };
  const system = Object.create(bombs);
  system.init({ state, bus, helpers });
  // The rack model (PQ-205.03): a selected payload must be loaded in a socket — the fixture
  // loads it like a dock-side fit so `selectedId` means "the bay carries this".
  if (selectedId) {
    const rt = state.bombs, def = BOMB_DEFS[selectedId];
    if (def && !rt.rack.cells.some((c) => c && c.id === selectedId && c.count > 0)) {
      const free = rt.rack.cells.findIndex((c) => !c || !c.count);
      if (free >= 0) rt.rack.cells[free] = { id: selectedId, count: def.magazine };
      else { rt.rack.cells.push({ id: selectedId, count: def.magazine }); rt.rack.sockets = rt.rack.cells.length; }
    }
    rt.selectedId = selectedId;
  }
  return {
    state, bus, system, routed, impulses, dropped, armed, detonated, fieldEnded, cycles, released,
    player, spawnRaw: helpers.spawnEntity,
    spawnShip(id, x, z, { team = 1, mass = 32, radius = 0 } = {}) {
      const ship = {
        id, type: 'ship', alive: true, team, mass, radius,
        pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
      };
      state.entities.set(id, ship);
      state.entityList.push(ship);
      return ship;
    },
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        state.simTime += DT;
        state.tick += 1;
        system.update(DT, state);
      }
    },
    press(action) {
      state.input.actions = state.input.actions || {};
      state.input.actions[action] = true;
    },
  };
}

 test('a dropped bomb inherits the full ship velocity and falls behind under low drag', () => {
  const t = bootBombs({ playerVel: { x: 60, z: 0 } });
  try {
    t.press('dropBomb');
    t.tick(1);
    assert.equal(t.dropped.length, 1);
    const drop = t.dropped[0];
    assert.equal(drop.vel.x, 60);
    assert.equal(drop.vel.z, 0);
    const bomb = t.state.entities.get(drop.bombId);
    assert.ok(bomb, 'bomb entity exists');
    // Released BEHIND the hull along the flight path.
    assert.ok(bomb.pos.x < 0 && bomb.pos.x > -20, `spawned behind hull, got ${bomb.pos.x}`);

    // One full second of drift: speed decays by exactly e^(-drag) — the authored low-drag law,
    // slow enough that a coasting ship keeps pace and a thrusting ship walks away.
    t.tick(59);
    const speed = Math.hypot(bomb.vel.x, bomb.vel.z);
    const expected = 60 * Math.exp(-BOMB_DRIFT.dragPerS);
    assert.ok(Math.abs(speed - expected) < 1.5, `speed ${speed} ≈ ${expected}`);
    // It kept travelling forward the whole time (floats on, never stops).
    assert.ok(bomb.pos.x > 30, `drifted forward, got ${bomb.pos.x}`);
    // But a thrusting ship at constant 60 is now well ahead of it.
    assert.ok(60 * 1 > bomb.pos.x + 13);
  } finally {
    t.bus.clear();
  }
});

 test('the fuze arms on sim time and detonates on a hostile through the damage router', () => {
  const t = bootBombs();
  try {
    const victim = t.spawnShip(2, -13 + 30, 0); // 30 WU ahead of the resting bomb
    t.press('dropBomb');
    t.tick(1);
    const bombId = t.dropped[0].bombId;

    t.tick(28); // ~0.48s: still unarmed
    assert.equal(t.armed.length, 0);
    t.tick(3); // crosses armS = 0.5s
    assert.equal(t.armed.length, 1);

    assert.equal(t.detonated.length, 0, 'arming commits a visible warning, never an instant hidden blast');
    t.tick(Math.ceil(BOMB_DRIFT.warningS / DT)); // warning finishes
    assert.equal(t.detonated.length, 1);
    const det = t.detonated[0];
    assert.equal(det.payloadId, 'bomb_frag');
    assert.equal(det.trigger, 'proximity');
    assert.ok(det.hits.includes(2), 'the hostile is hit');
    assert.ok(det.hits.includes(1), 'the dropper is inside their own blast: friendly fire on');
    assert.equal(t.state.entities.get(bombId).alive, false);

    const req = t.routed.find((r) => r.targetId === 2);
    assert.ok(req, 'victim routed through the one damage router');
    assert.equal(req.attackerId, 1);
    assert.equal(req.origin.kind, 'bomb');
    assert.equal(req.origin.payloadId, 'bomb_frag');
    // Explosive channel split (65/35) with linear falloff at distance 30 of radius 96.
    const falloff = 1 - 30 / 96;
    assert.ok(Math.abs(req.packet.channels.kinetic - 30 * falloff * 0.65) < 1e-6);
    assert.ok(Math.abs(req.packet.channels.thermal - 30 * falloff * 0.35) < 1e-6);
    assert.equal(victim.alive, true); // damage routed, never written directly
  } finally {
    t.bus.clear();
  }
});

 test('friendly hulls and the owner never trip the fuze; a lonely bomb pops on its fuze', () => {
  const t = bootBombs();
  try {
    t.spawnShip(2, -10, 0, { team: 0 }); // wingman parked on the bomb
    t.press('dropBomb');
    t.tick(1);
    const bombId = t.dropped[0].bombId;
    t.tick(365); // well past fuzeS = 6 (a few spare ticks for accumulated-float slack)
    assert.equal(t.detonated.length, 1);
    assert.equal(t.detonated[0].trigger, 'fuze');
    assert.equal(t.state.entities.get(bombId).alive, false);
    // The wingman at 3 WU (falloff ~0.97) is still hit by the blast itself: friendly fire on
    // applies to the BLAST; only the fuze scan is hostile-only.
    assert.ok(t.routed.some((r) => r.targetId === 2));
  } finally {
    t.bus.clear();
  }
});

 test('the concussion drum shoves through the physics authority and routes no damage', () => {
  const t = bootBombs({ selectedId: 'bomb_concussion' });
  try {
    t.spawnShip(2, -13 + 30, 0, { mass: 32 });
    t.press('dropBomb');
    t.tick(1);
    t.tick(42); // arm + visible warning
    assert.equal(t.detonated.length, 1);
    assert.equal(t.detonated[0].payloadId, 'bomb_concussion');
    assert.equal(t.routed.length, 0, 'a pure-shove payload never routes damage');
    const imp = t.impulses.find((i) => i.entityId === 2);
    assert.ok(imp, 'victim shoved through the physics authority');
    // Away from the blast, linear falloff: 1800 * (1 - 30/130) = ~1384 impulse.
    assert.ok(imp.impulse.x > 1300 && imp.impulse.x < 1400, `outward impulse, got ${imp.impulse.x}`);
  } finally {
    t.bus.clear();
  }
});

 test('the neutron slug opens a moving pull field, crushes, and collapses', () => {
  const t = bootBombs({ selectedId: 'bomb_singularity' });
  try {
    const victim = t.spawnShip(2, -13 + 30, 0, { mass: 32 });
    t.press('dropBomb');
    t.tick(1);
    t.tick(42); // arm + visible warning
    const bombId = t.dropped[0].bombId;
    const bomb = t.state.entities.get(bombId);

    // Opens with NO instant blast: the pull is the payload.
    assert.equal(t.routed.length, 0);
    assert.equal(bomb.alive, true, 'field bomb persists through its phase');
    assert.equal(t.detonated[0].trigger, 'proximity');

    // Per-tick pull through the physics authority membrane, mass-coupled (heavy shrug):
    // accel = 300 * falloff(30/150) * couple(12/32); impulse = accel * mass * dt.
    t.tick(1); // first field tick queues the first pull
    const cmd = consumePhysicsCommand(victim);
    assert.ok(cmd && cmd.impulses.length === 1, 'one queued pull impulse this tick');
    const pull = cmd.impulses[0];
    const accel = 300 * (1 - 30 / 150) * (12 / 32);
    const expected = accel * 32 * DT;
    assert.ok(pull.x < 0, 'pull points from victim toward the slug');
    assert.ok(Math.abs(Math.abs(pull.x) - expected) < 2, `pull magnitude ${Math.abs(pull.x)} ≈ ${expected}`);

    // Crush ticks inside the inner band every 30 ticks.
    t.tick(29); // reaches detonation tick + 30
    const crush = t.routed.find((r) => r.targetId === 2 && r.packet.source && r.packet.source.phase === 'crush');
    assert.ok(crush, 'crush tick routed');
    assert.ok(Math.abs(crush.packet.channels.plasma - 6) < 1e-6);

    // The field ends on its authored clock with a collapse: outward snap + closing damage.
    t.tick(140); // total field ~2.8s from detonation
    assert.equal(t.fieldEnded.length, 1);
    assert.equal(t.fieldEnded[0].trigger, 'collapse');
    const collapse = t.detonated.find((d) => d.trigger === 'collapse');
    assert.ok(collapse, 'collapse publishes a causal detonated receipt');
    assert.equal(bomb.alive, false);
    assert.ok(t.impulses.some((i) => i.entityId === 2 && i.impulse.x > 0), 'collapse shoves outward');
    // The closing damage rides the slug's plasma channel (not crush — different source phase).
    assert.ok(t.routed.some((r) => r.targetId === 2 && !(r.packet.source && r.packet.source.phase)
      && r.packet.channels.plasma > 0), 'collapse routes its closing damage');
  } finally {
    t.bus.clear();
  }
});

 test('the tarburst sticks status_goo on the burst and re-applies it inside the volume', () => {
  const t = bootBombs({ selectedId: 'bomb_goo' });
  try {
    t.spawnShip(2, -13 + 30, 0);
    t.press('dropBomb');
    t.tick(1);
    t.tick(42);
    assert.equal(t.detonated[0].payloadId, 'bomb_goo');

    const burst = t.routed.find((r) => r.targetId === 2);
    assert.ok(burst, 'burst routes to the victim');
    assert.deepEqual(burst.packet.statuses, [{ id: 'status_goo', stacks: 2 }]);
    assert.ok(burst.packet.channels.kinetic > 0, 'the splat stings once');

    t.tick(30); // field re-apply cadence
    const reapply = t.routed.find((r) => r.targetId === 2 && r.packet.source && r.packet.source.phase === 'tar');
    assert.ok(reapply, 'tar volume re-applies the status');
    assert.deepEqual(reapply.packet.statuses, [{ id: 'status_goo', stacks: 1 }]);
    assert.equal(reapply.packet.channels.kinetic, 0, 'the volume re-tags, it does not re-sting');

    t.tick(300); // outlast field duration (5s)
    assert.equal(t.fieldEnded.length, 1);
    assert.equal(t.fieldEnded[0].trigger, 'expired');
  } finally {
    t.bus.clear();
  }
});

 test('the bay cycles payloads on the cycle verb and wraps', () => {
  const t = bootBombs();
  try {
    // PQ-205.03: the cycle walks only loaded rack sockets — the starter rack carries
    // frag + concussion, so cycling alternates the two fitted payloads and wraps.
    const fitted = t.state.bombs.rack.cells.filter((c) => c && c.count > 0).map((c) => c.id);
    assert.deepEqual(fitted, ['bomb_frag', 'bomb_concussion']);
    for (let i = 0; i < fitted.length * 2; i++) {
      t.press('cycleBomb');
      t.tick(1);
    }
    assert.equal(t.cycles.length, fitted.length * 2);
    assert.ok(t.cycles.every((c) => fitted.includes(c.payloadId)), 'cycle never leaves the fitted rack');
    assert.equal(t.cycles[fitted.length - 1].payloadId, fitted[0], 'wraps to the first fitted payload');
    assert.equal(t.state.bombs.selectedId, fitted[0]);
  } finally {
    t.bus.clear();
  }
});

 test('the bay respects its payload cooldown, and a full bay preserves deployed traps', () => {
  const t = bootBombs();
  try {
    t.press('dropBomb');
    t.tick(1);

    t.press('dropBomb');
    t.tick(30); // 0.5s: still inside frag's 1.2s cooldown
    assert.equal(t.dropped.length, 1, 'cooldown gates the second drop');

    // Cap mechanism: fill the bay with synthetic live bombs (on short-fuze payloads the fuze
    // normally bounds concurrency first — the cap is the safety bound), then drop for real.
    const synthetic = [];
    for (let i = 0; i < BOMB_DRIFT.maxActive - 1; i++) {
      synthetic.push(t.spawnRaw({
        type: 'bomb',
        pos: { x: -40 - i * 5, z: 0 },
        vel: { x: 0, z: 0 },
        rot: 0, radius: 1.4, mass: 2, collides: false, team: 0, ownerId: 1,
        data: {
          kind: 'bomb', bombId: 'bomb_frag', ownerId: 1, phase: 'drift', armed: true,
          armedAt: 0, detonateAt: Infinity, spawnedAt: -1000 - i, triggered: false, spinRadS: 1,
        },
      }));
    }
    const cooldownS = BOMB_DEFS.bomb_frag.cooldownS;
    t.tick(Math.ceil((cooldownS + 0.1) / DT));
    t.press('dropBomb');
    t.tick(1);
    assert.equal(t.dropped.length, 1, 'full bay rejects the release even after cooldown');
    const oldest = synthetic[synthetic.length - 1]; // most negative spawnedAt
    assert.equal(oldest.alive, true, 'the oldest deployed trap remains alive at the cap');
    const live = t.state.entityList.filter((e) => e.alive && e.type === 'bomb').length;
    assert.equal(live, BOMB_DRIFT.maxActive, 'the bay holds at most maxActive live bombs');
  } finally {
    t.bus.clear();
  }
});

 test('sector exit releases every live bomb', () => {
  const t = bootBombs();
  try {
    t.press('dropBomb');
    t.tick(1);
    assert.equal(t.dropped.length, 1);
    t.bus.emit('sector:exit', {});
    assert.equal(t.released.length, 1);
    assert.equal(t.state.entities.get(t.dropped[0].bombId).alive, false);
  } finally {
    t.bus.clear();
  }
});
