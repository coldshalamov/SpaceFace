// INF-053 — a destroyed target, a lost track, and an intentional change are three different
// announcements. Only entity:killed may say DESTROYED; leaving scanner range says LOCK LOST in
// the info voice; Tab/intentional picks keep their own "Target: X" receipt. Drives the real
// exported functions from uiRoot.js headlessly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { destroyedLockToast, targetNearestHostileToPlayer } from '../src/ui/uiRoot.js';

function busOf() {
  const toasts = [];
  return {
    toasts,
    emit(name, payload) { if (name === 'toast') toasts.push(payload); },
    on() { return () => {}; },
  };
}

function shipLike(id, pos, extra = {}) {
  return { id, type: 'ship', team: 1, alive: true, pos, vel: { x: 0, z: 0 }, data: { encounter: true, ...extra } };
}

function stateWith(player, entities) {
  const map = new Map(entities.map((e) => [e.id, e]));
  return {
    playerId: player.id,
    entities: map,
    entityList: entities,
    player,
  };
}

test('only the locked subject may print DESTROYED, and the label is the target voice', () => {
  const player = { id: 'p', team: 0, pos: { x: 0, z: 0 }, targetId: 'raider' };
  const raider = shipLike('raider', { x: 500, z: 0 }, { name: 'Reaver' });
  const state = stateWith(player, [player, raider]);

  const toast = destroyedLockToast(state, { id: 'raider', killerId: 'p' });
  assert.ok(toast, 'the lock subject dying yields a toast');
  assert.match(toast.text, /DESTROYED/);
  assert.match(toast.text, /Reaver/);
  assert.equal(toast.kind, 'good', 'a real kill is the celebrated voice');

  assert.equal(destroyedLockToast(state, { id: 'other', killerId: 'p' }), null,
    'an unrelated kill never touches the lock voice');
  assert.equal(destroyedLockToast(state, null), null);
  const idle = stateWith({ id: 'p', team: 0, pos: { x: 0, z: 0 }, targetId: null }, [player]);
  assert.equal(destroyedLockToast(idle, { id: 'p' }), null, 'no lock, no DESTROYED');
});

test('a hostile that leaves scanner range announces LOCK LOST, then the refresh re-acquires', () => {
  const player = { id: 'p', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, targetId: 'far' };
  const far = shipLike('far', { x: 6000, z: 0 }, { name: 'Sprinter' }); // beyond 5200 scanner range
  const near = shipLike('near', { x: 800, z: 0 }, { name: 'Lurker' });
  const state = stateWith(player, [player, far, near]);
  const bus = busOf();

  targetNearestHostileToPlayer(state, bus, { quiet: true });

  assert.equal(bus.toasts.length, 1, 'exactly one receipt for the lost track');
  assert.match(bus.toasts[0].text, /LOCK LOST · Sprinter/);
  assert.equal(bus.toasts[0].kind, 'info', 'a lost track is never celebrated');
  assert.equal(state.player.targetId, 'near', 'the refresh still re-acquires the next hostile');
});

test('a dead or despawned lock is silent here — its story belongs to entity:killed', () => {
  const player = { id: 'p', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, targetId: 'corpse' };
  const corpse = { ...shipLike('corpse', { x: 6000, z: 0 }), alive: false, name: 'Hulk' };
  const near = shipLike('near', { x: 800, z: 0 }, { name: 'Lurker' });
  const bus = busOf();

  const deadState = stateWith(player, [player, corpse, near]);
  targetNearestHostileToPlayer(deadState, bus, { quiet: true });
  assert.equal(bus.toasts.length, 0, 'a corpse lock prints no LOCK LOST');
  assert.equal(deadState.player.targetId, 'near');

  const goneState = stateWith(
    { ...player, targetId: 'despawned' },
    [player, near],
  );
  targetNearestHostileToPlayer(goneState, bus, { quiet: true });
  assert.equal(bus.toasts.length, 0, 'a despawned lock (sector hop, cleanup) prints nothing');
  assert.equal(goneState.player.targetId, 'near');
});

test('a legal lock and a deliberate non-hostile pick are untouched by the quiet refresh', () => {
  const bus = busOf();
  const player = { id: 'p', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const raider = shipLike('raider', { x: 900, z: 0 }, { name: 'Reaver' });

  const locked = stateWith({ ...player, targetId: 'raider' }, [player, raider]);
  targetNearestHostileToPlayer(locked, bus, { quiet: true });
  assert.equal(bus.toasts.length, 0, 'a healthy lock says nothing');
  assert.equal(locked.player.targetId, 'raider');

  const station = { id: 'dock', type: 'station', team: 0, alive: true, pos: { x: 300, z: 0 }, data: {} };
  const picked = stateWith({ ...player, targetId: 'dock' }, [player, station, raider]);
  targetNearestHostileToPlayer(picked, bus, { quiet: true });
  assert.equal(bus.toasts.length, 0, 'a deliberate pick is preserved silently');
  assert.equal(picked.player.targetId, 'dock');
});
