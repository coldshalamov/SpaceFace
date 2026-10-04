// NXI-040 — exiting one of two overlapping tar fields sheds only that field's contribution.
//
// Before the fix, `_endField` retired the bomb and emitted `bombs:fieldEnded` but never shed
// the `status_goo` record the field kept re-feeding every 30 ticks. The debuff (mass×1.8 per
// stack, movement×0.72, corrosive DoT) then rode its full 240-tick refresh tail — a viscous
// status persisting for seconds after the cloud was gone. A blanket delete would be just as
// wrong: the record is keyed by status id, so killing it whenever ANY field ends would erase
// a second live goo source's contribution. `_endField` now runs `_shedGooFieldStatus`: for
// every covered target, the record is cleared only when no other live goo field still covers
// it — the same coverage law the live tick uses to split the brake.
//
// This test drives the real owner path: live drops -> proximity fuzes -> two overlapping
// fields -> the real combat kernel's status store -> one field shot down while the other is
// still live, then the survivor expiring on its authored clock.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { bombs } from '../src/systems/bombs.js';
import { BOMB_DEFS } from '../src/data/bombs.js';

const DT = 1 / 60;
const GOO = BOMB_DEFS.bomb_goo; // radius 110, field 5 s, re-apply every 30 ticks

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 0;
  state.tick = 0;
  const bus = createBus();
  const helpers = {};
  let kernel = null;
  const combatFacade = { ensureKernel: () => kernel };
  const registry = { get: (name) => (name === 'combat' ? combatFacade : null) };
  const coreSystem = Object.create(core);
  coreSystem.init({ state, bus, helpers, registry });
  kernel = createCombatKernel({ state, bus, helpers, registry });
  helpers.routeCombatDamage = (req) => kernel.routeDamage(req);
  const player = helpers.spawnEntity({
    type: 'ship', team: 0, mass: 32, radius: 6, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 100000, hullMax: 100000,
  });
  state.playerId = player.id;
  const system = Object.create(bombs);
  system.init({ state, bus, helpers, registry });
  // Load the tarburst like a dock-side fit so drops consume a real rack cell. Extending the
  // cell list requires the matching sockets bump or the next ensureRuntime trims it to stock.
  const rt = state.bombs;
  const free = rt.rack.cells.findIndex((c) => !c || !c.count);
  if (free >= 0) rt.rack.cells[free] = { id: 'bomb_goo', count: GOO.magazine };
  else { rt.rack.cells.push({ id: 'bomb_goo', count: GOO.magazine }); rt.rack.sockets = rt.rack.cells.length; }
  rt.selectedId = 'bomb_goo';
  const fieldEnded = [];
  bus.on('bombs:fieldEnded', (p) => fieldEnded.push(p));
  return {
    state, bus, helpers, player, system, kernel, fieldEnded,
    spawnShip(x, z, opts = {}) {
      return helpers.spawnEntity({
        type: 'ship', team: 1, mass: 32, radius: 1, rot: 0,
        pos: { x, z }, vel: { x: 0, z: 0 }, hull: 100000, hullMax: 100000, ...opts,
      });
    },
    // The status store advances inside the kernel's pre-physics pass — same tick order the
    // registered combat system uses in production.
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        state.tick += 1;
        state.simTime += DT;
        kernel.prePhysics(DT);
        system.update(DT, state);
        kernel.postPhysics();
      }
    },
    gooOf(ent) {
      return state.combat.entities[String(ent.id)]?.statuses?.status_goo || null;
    },
  };
}

function applyStatus(t, target, statusId, stacks) {
  t.kernel.routeDamage({
    attackerId: t.player.id, targetId: target.id,
    packet: {
      channels: { kinetic: 0, thermal: 0, ion: 0, plasma: 0, phase: 0 },
      statuses: [{ id: statusId, stacks }], penetration: 0, heat: 0,
      flags: { ignoreFriendlyFire: true, allowAnyTarget: true },
    },
    origin: { kind: 'test', id: 'fixture' },
  });
}

test('one of two overlapping tar fields ending sheds only that field’s contribution', () => {
  const t = boot();
  try {
    const bombA = t.system.drop(t.player, 'bomb_goo', t.state);
    assert.ok(bombA, 'first goo bomb dropped');
    t.player.pos.x = 60;
    t.tick(160); // 2.67s — past the 2.5s payload cooldown; bomb A sits armed in drift
    const bombB = t.system.drop(t.player, 'bomb_goo', t.state);
    assert.ok(bombB, 'second goo bomb dropped after cooldown');
    assert.ok(bombA.pos.x !== bombB.pos.x, 'the two clouds are offset, not coincident');

    // Overlap victim: within both field radii and both proximity fuzes.
    const midX = (bombA.pos.x + bombB.pos.x) / 2;
    const insideBoth = t.spawnShip(midX, 0);
    // Second-source-only victim: inside B's radius, outside A's.
    const onlyB = t.spawnShip(bombB.pos.x + GOO.radius - 15, 0);
    assert.ok(Math.abs(onlyB.pos.x - bombA.pos.x) > GOO.radius, 'onlyB is outside cloud A');
    // A far control that will carry goo from a different cause — never inside either cloud.
    const outsider = t.spawnShip(bombA.pos.x - 4 * GOO.radius, 0);

    // The hostile in both trigger discs proximity-fires both bombs once armed.
    t.tick(30);
    assert.equal(bombA.data.phase, 'field', 'cloud A opened on the proximity fuze');
    t.tick(40); // arm + warning + detonation for B
    assert.equal(bombB.data.phase, 'field', 'cloud B opened on the proximity fuze');

    // Both targets are tarred while both clouds live.
    t.tick(35); // at least one 30-tick field re-apply has landed
    assert.ok(t.gooOf(insideBoth)?.stacks > 0, 'overlap victim carries status_goo');
    assert.ok(t.gooOf(onlyB)?.stacks > 0, 'B-only victim carries status_goo');

    // Neighbor-status pin: an unrelated debuff and an off-cloud goo record must survive
    // the shed — the fix may only remove what the dying field maintained.
    applyStatus(t, insideBoth, 'status_ionized', 1);
    applyStatus(t, outsider, 'status_goo', 2);
    t.tick(2);
    assert.ok(t.state.combat.entities[String(insideBoth.id)].statuses.status_ionized,
      'ionized control landed');
    assert.ok(t.gooOf(outsider)?.stacks > 0, 'outsider carries its own goo record');

    // EXIT ONE OF TWO: shoot cloud A down while cloud B still covers the overlap victim.
    assert.equal(t.system.retire(bombA, 'shot_down', t.state), true);
    assert.equal(t.fieldEnded.length, 1);
    assert.ok(t.gooOf(insideBoth)?.stacks > 0,
      'surviving cloud B still feeds the overlap victim — A’s exit did not erase it');
    assert.ok(t.gooOf(onlyB)?.stacks > 0, 'B-only victim untouched by A’s exit');
    assert.ok(t.gooOf(outsider)?.stacks > 0, 'off-cloud goo record was never the field’s to shed');

    // The remaining cloud keeps working like a normal single field until its clock ends.
    t.tick(30);
    assert.ok(t.gooOf(insideBoth)?.stacks > 0, 'B still re-applies inside its volume');
    // Refresh the unrelated debuff through the wait so it is still live when B expires —
    // the shed must then pick status_goo out of a bag that contains a second status.
    for (let i = 0; i < 400 && t.fieldEnded.length < 2; i++) {
      applyStatus(t, insideBoth, 'status_ionized', 1);
      t.tick(1);
    }
    assert.equal(t.fieldEnded.length, 2, 'cloud B expired on its authored clock');
    assert.equal(t.fieldEnded[1].trigger, 'expired');

    // With no live source left, the viscous status sheds instead of riding its refresh tail.
    assert.equal(t.gooOf(insideBoth), null,
      'the last field gone, the overlap victim stops being tarred NOW — not 240 ticks later');
    assert.equal(t.gooOf(onlyB), null, 'B-only victim sheds too');
    assert.ok(t.state.combat.entities[String(insideBoth.id)].statuses.status_ionized,
      'the shed removed only status_goo, never the whole status bag');
    assert.ok(t.gooOf(outsider)?.stacks > 0,
      'a goo record no live field ever maintained is left alone');

    // The debuff's physical teeth release with the record on the next status pass.
    t.tick(2);
    const response = t.state.combat.entities[String(insideBoth.id)].physicsResponse;
    assert.ok(!response || response.massScale === 1,
      `mass response released, got ${response && response.massScale}`);
  } finally {
    t.system.destroy();
    t.bus.clear();
  }
});

test('a single tar field ending still drops the status immediately — the lone-source neighbor', () => {
  const t = boot();
  try {
    const bomb = t.system.drop(t.player, 'bomb_goo', t.state);
    assert.ok(bomb);
    const victim = t.spawnShip(bomb.pos.x + 30, 0); // inside radius + proximity fuze
    t.tick(45); // arm, proximity warning, detonation, first re-apply
    assert.equal(bomb.data.phase, 'field');
    assert.ok(t.gooOf(victim)?.stacks > 0, 'victim tarred by the single cloud');
    for (let i = 0; i < 400 && t.fieldEnded.length < 1; i++) t.tick(1);
    assert.equal(t.fieldEnded.length, 1);
    assert.equal(t.gooOf(victim), null, 'the only source gone, the status sheds at once');
  } finally {
    t.system.destroy();
    t.bus.clear();
  }
});
