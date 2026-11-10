// PQ-205.01 — victim-attached burn/goo last as long as the status bag, scale with stacks,
// and keep a readable mark under reduced flash/motion.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectStatusAttachedVictims,
  planStatusAttachedEmit,
  statusAttachedAccessibility,
  statusRemainingSeconds,
} from '../src/render/statusAttachedVfx.js';

function victimState(overrides = {}) {
  const entity = {
    id: 3, alive: true, type: 'ship', pos: { x: 8, z: 2 }, radius: 6,
  };
  const entities = new Map([[3, entity]]);
  return {
    tick: 4,
    playerId: 1,
    entities,
    combat: {
      entities: {
        3: {
          statuses: {
            status_burning: { id: 'status_burning', stacks: 2, expiresTick: 124 },
            status_goo: { id: 'status_goo', stacks: 1, expiresTick: 244 },
          },
        },
      },
    },
    settings: { video: {}, accessibility: {} },
    ...overrides,
  };
}

test('attached victims come from the live status bag and die with expiresTick', () => {
  const state = victimState();
  const rows = collectStatusAttachedVictims(state);
  assert.equal(rows.length, 2);
  const burn = rows.find((r) => r.statusId === 'status_burning');
  assert.equal(burn.remainingS, statusRemainingSeconds(state.combat.entities[3].statuses.status_burning, 4));
  assert.equal(burn.remainingS, 2);
  state.tick = 124;
  assert.equal(collectStatusAttachedVictims(state).some((r) => r.statusId === 'status_burning'), false);
  assert.equal(collectStatusAttachedVictims(state).length, 1);
});

test('sprite life never outruns the remaining status duration', () => {
  const state = victimState();
  const burn = collectStatusAttachedVictims(state).find((r) => r.kind === 'burn');
  const plan = planStatusAttachedEmit(burn, 0.08, {}, 0);
  assert.equal(plan.emit, true);
  for (const sprite of plan.sprites) {
    assert.ok(sprite.life <= burn.remainingS + 1e-9, 'burn cannot outlive the status owner');
  }
  const short = { ...burn, remainingS: 0.05 };
  const clipped = planStatusAttachedEmit(short, 0.08, {}, 0);
  assert.equal(clipped.emit, true);
  assert.ok(clipped.sprites.every((s) => s.life <= 0.05));
  const gone = planStatusAttachedEmit({ ...burn, remainingS: 0 }, 0.08, {}, 0);
  assert.equal(gone.emit, false);
});

test('goo residue scales with actual stacks', () => {
  const state = victimState();
  const goo = collectStatusAttachedVictims(state).find((r) => r.kind === 'goo');
  const thin = planStatusAttachedEmit(goo, 0.12, {}, 0);
  const thick = planStatusAttachedEmit({ ...goo, stacks: 3 }, 0.12, {}, 0);
  assert.equal(thin.stacks, 1);
  assert.equal(thick.stacks, 3);
  assert.ok(thick.sprites.length > thin.sprites.length || thick.sprites[0].size0 > thin.sprites[0].size0);
  assert.ok(thick.sprites[0].opacity0 > thin.sprites[0].opacity0);
});

test('reduced motion drops travelling accents; reduced flash keeps a dimmer hull mark', () => {
  const state = victimState();
  const burn = collectStatusAttachedVictims(state).find((r) => r.kind === 'burn');
  const full = planStatusAttachedEmit(burn, 0.08, {}, 0);
  const motion = planStatusAttachedEmit(burn, 0.08, { motionReduce: true }, 0);
  const flash = planStatusAttachedEmit(burn, 0.08, { flashReduce: true }, 0);
  assert.ok(full.sprites.some((s) => s.vx !== 0 || s.vz !== 0), 'full motion travels');
  assert.ok(motion.sprites.every((s) => s.vx === 0 && s.vz === 0), 'reduced motion holds the mark');
  assert.ok(flash.sprites.length >= 1, 'reduced flash still shows the burn');
  assert.ok(flash.sprites[0].opacity0 < full.sprites[0].opacity0);
  const flags = statusAttachedAccessibility({ video: { motionReduce: true, flashReduce: true } });
  assert.equal(flags.motionReduce, true);
  assert.equal(flags.flashReduce, true);
});
