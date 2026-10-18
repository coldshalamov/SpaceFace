import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { installReactiveEntity, reactiveMatter } from '../src/systems/reactiveMatter.js';

const SEED = 4242;

function boot(polymers) {
  const sim = createSimulation({ seed: SEED, systems: [reactiveMatter] });
  sim.state.mode = 'flight';
  sim.state.timeScale = 1;
  sim.state.run = { kind: 'adventure' };
  sim.state.world.currentSectorId = 'sector_adhesive_trial';
  const player = sim.spawn({
    type: 'ship', isPlayer: true, mass: 16, radius: 3,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, collides: true,
    physicsBody: { shape: 'ball', mass: 16, radius: 3, dynamic: true },
    data: {},
  });
  sim.state.playerId = player.id;
  sim.state.player.cargo.items.cmdty_polymers = polymers;
  const toasts = [];
  sim.bus.on('toast', (payload) => toasts.push(payload));
  return { sim, state: sim.state, player, toasts };
}

function lay(state, helpers, spec) {
  return installReactiveEntity(state, spec, helpers);
}

function bump(sim, player, target, closing) {
  sim.bus.emit('physics:impact', {
    aId: player.id,
    bId: target.id,
    normal: { x: 1, z: 0 },
    preSolveClosingSpeed: closing,
    tick: sim.state.tick | 0,
  });
}

function coatOf(state, key) {
  const row = state.reactiveMatterWorld?.adhesive?.coatings?.get(key);
  return row ? row.integrity : 0;
}

function liveBridge(state, a, b) {
  const bridges = state.reactiveMatterWorld?.adhesive?.bridges;
  if (!bridges) return null;
  for (const bridge of bridges.values()) {
    if (!bridge.alive) continue;
    if ((bridge.aId === a && bridge.bId === b) || (bridge.aId === b && bridge.bId === a)) return bridge;
  }
  return null;
}

function impulseX(entity) {
  const command = consumePhysicsCommand(entity);
  if (!command) return 0;
  let sum = 0;
  for (const row of command.impulses) sum += row.x;
  return sum;
}

function assertPlain(text) {
  assert.equal(typeof text, 'string', text);
  assert.ok(text.length > 8, text);
  assert.equal(/[a-z]+_[a-z0-9_]+/.test(text), false, text);
  assert.equal(/[a-z][A-Z]/.test(text), false, text);
}

function polymers(state) {
  return state.player.cargo.items.cmdty_polymers || 0;
}

test('a gentle spray coats a hull and a miss leaves it bare', () => {
  const f = boot(3);
  const near = lay(f.state, f.sim.helpers, { key: 'near-hull', modelId: 'inert_puck', x: 4, z: 0 });
  const far = lay(f.state, f.sim.helpers, { key: 'far-hull', modelId: 'inert_puck', x: 80, z: 0 });
  const struck = lay(f.state, f.sim.helpers, { key: 'struck-hull', modelId: 'inert_puck', x: 2, z: 0 });
  bump(f.sim, f.player, near, 6);
  bump(f.sim, f.player, far, 6);
  bump(f.sim, f.player, struck, 48);
  f.sim.runTicks(1);
  assert.ok(coatOf(f.state, 'near-hull') > 0.9, 'gentle spray should leave a film');
  assert.equal(coatOf(f.state, 'far-hull'), 0);
  assert.equal(coatOf(f.state, 'struck-hull'), 0);
  assert.equal(polymers(f.state), 2);
  assert.equal(near.data.status, undefined);
  assert.equal(far.data.status, undefined);
  assert.equal(struck.data.status, undefined);
  const took = f.toasts.filter((row) => /spray took/i.test(row.text));
  assert.equal(took.length, 1);
  assertPlain(took[0].text);
  f.sim.dispose();

  const empty = boot(0);
  const bare = lay(empty.state, empty.sim.helpers, { key: 'bare-hull', modelId: 'inert_puck', x: 3, z: 0 });
  bump(empty.sim, empty.player, bare, 6);
  empty.sim.runTicks(1);
  assert.equal(coatOf(empty.state, 'bare-hull'), 0);
  assert.equal(polymers(empty.state), 0);
  assert.equal(empty.toasts.length, 0);
  empty.sim.dispose();
});

test('a light pair holds a modest pull and a heavier pair snaps at that same pull', () => {
  function pair(modelId, keyA, keyB, xB, pull) {
    const f = boot(2);
    const a = lay(f.state, f.sim.helpers, { key: keyA, modelId, x: 0, z: 0 });
    const b = lay(f.state, f.sim.helpers, { key: keyB, modelId, x: xB, z: 0 });
    bump(f.sim, f.player, a, 6);
    bump(f.sim, f.player, b, 6);
    f.sim.runTicks(1);
    assert.ok(liveBridge(f.state, keyA, keyB), `${modelId} should bridge while the pull is quiet`);
    const bridged = f.toasts.filter((row) => /bridged/i.test(row.text));
    assert.equal(bridged.length, 1);
    assertPlain(bridged[0].text);
    a.vel.x = -pull / 2;
    b.vel.x = pull / 2;
    f.sim.runTicks(1);
    return { f, a, b };
  }

  const light = pair('inert_puck', 'light-a', 'light-b', 4, 12);
  assert.ok(liveBridge(light.f.state, 'light-a', 'light-b'), 'light hulls should stay bridged');
  const ax = impulseX(light.a);
  const bx = impulseX(light.b);
  assert.ok(ax > 1, ax);
  assert.ok(bx < -1, bx);
  assert.ok(Math.abs(ax + bx) < 1e-4, `${ax} + ${bx}`);
  light.f.sim.dispose();

  const heavy = pair('cryo_gate', 'heavy-a', 'heavy-b', 20, 12);
  assert.equal(liveBridge(heavy.f.state, 'heavy-a', 'heavy-b'), null);
  assert.equal(impulseX(heavy.a), 0);
  assert.equal(impulseX(heavy.b), 0);
  const snapped = heavy.f.toasts.filter((row) => /snapped/i.test(row.text));
  assert.equal(snapped.length, 1);
  assertPlain(snapped[0].text);
  heavy.f.sim.dispose();

  const hard = pair('inert_puck', 'hard-a', 'hard-b', 4, 80);
  assert.equal(liveBridge(hard.f.state, 'hard-a', 'hard-b'), null);
  assert.ok(hard.f.toasts.some((row) => /snapped/i.test(row.text)));
  hard.f.sim.dispose();
});

test('the coating wears until a pull that held now snaps, and a lone film wears off', () => {
  const f = boot(2);
  const a = lay(f.state, f.sim.helpers, { key: 'wear-a', modelId: 'inert_puck', x: 0, z: 0 });
  const b = lay(f.state, f.sim.helpers, { key: 'wear-b', modelId: 'inert_puck', x: 4, z: 0 });
  bump(f.sim, f.player, a, 6);
  bump(f.sim, f.player, b, 6);
  f.sim.runTicks(1);
  const fresh = Math.min(coatOf(f.state, 'wear-a'), coatOf(f.state, 'wear-b'));
  assert.ok(fresh > 0.9);
  a.vel.x = -6;
  b.vel.x = 6;
  f.sim.runTicks(1);
  assert.ok(liveBridge(f.state, 'wear-a', 'wear-b'), 'the fresh film should still hold this pull');
  let ticks = 0;
  while (liveBridge(f.state, 'wear-a', 'wear-b') && ticks < 2400) {
    f.sim.runTicks(1);
    ticks += 1;
  }
  assert.ok(ticks > 30, ticks);
  assert.equal(liveBridge(f.state, 'wear-a', 'wear-b'), null);
  const later = Math.min(coatOf(f.state, 'wear-a'), coatOf(f.state, 'wear-b'));
  assert.ok(later < fresh - 0.2, `film ${fresh} thinned to ${later}`);
  assert.ok(f.toasts.some((row) => /snapped/i.test(row.text)));
  f.sim.dispose();

  const lone = boot(1);
  lay(lone.state, lone.sim.helpers, { key: 'lone-hull', modelId: 'inert_puck', x: 3, z: 0 });
  const hull = lone.state.entityList.find((entity) => entity.data?.reactiveMatter?.key === 'lone-hull');
  bump(lone.sim, lone.player, hull, 6);
  lone.sim.runTicks(1);
  assert.ok(coatOf(lone.state, 'lone-hull') > 0.9);
  let wore = 0;
  while (coatOf(lone.state, 'lone-hull') > 0 && wore < 2400) {
    lone.sim.runTicks(1);
    wore += 1;
  }
  assert.equal(coatOf(lone.state, 'lone-hull'), 0);
  const gone = lone.toasts.filter((row) => /worn off/i.test(row.text));
  assert.equal(gone.length, 1);
  assertPlain(gone[0].text);
  lone.sim.dispose();
});
