// player-truth (seed 4242, Crucible swarm): every kill emitted barkDirector:silence, so the room's
// aftermath hush dropped on the first kill while 3-57 hostile shots still landed inside its breath.
// The voice floor stays per kill; the hush event waits until no hostile still presses the player.
import test from 'node:test';
import assert from 'node:assert/strict';
import { barkDirector, AFTERMATH_CONTACT_WU } from '../src/systems/barkDirector.js';

function world() {
  const player = { id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, data: {} };
  const raider = (id, x) => ({ id, type: 'ship', team: 1, faction: 'pirate', alive: true, pos: { x, z: 0 },
    data: { combat: { targetId: 1 }, ai: { fsm: 'attack' }, intent: { fire: true } } });
  const entityList = [player, raider(10, 200), raider(11, 300)];
  const entities = new Map(entityList.map((e) => [e.id, e]));
  const state = { simTime: 50, playerId: 1, entities, entityList, world: { currentSectorId: 'sector_helios_prime' } };
  const emitted = [];
  const dir = Object.create(barkDirector);
  dir.state = state;
  dir._emit = (name, payload) => emitted.push({ name, payload });
  return { state, dir, emitted, entities };
}

test('a kill while a second raider still attacks holds the hush; the last kill releases it', () => {
  const { state, dir, emitted, entities } = world();
  entities.get(10).alive = false;
  dir._enterPostCombatSilence({ entityId: 10 });
  assert.equal(emitted.length, 0, 'raider 11 is still shooting: no aftermath hush yet');
  assert.ok(state.barkDirector.postCombatSilenceUntil > 50, 'the kill confirmation still gets its voice floor');
  state.simTime = 56;
  entities.get(11).alive = false;
  dir._enterPostCombatSilence({ entityId: 11 });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].name, 'barkDirector:silence');
  assert.equal(emitted[0].payload.t, 56);
});

test('a hostile outside contact reach does not hold the hush', () => {
  const { dir, emitted, entities } = world();
  entities.get(10).alive = false;
  entities.get(11).pos.x = AFTERMATH_CONTACT_WU + 50;
  dir._enterPostCombatSilence({ entityId: 10 });
  assert.equal(emitted.length, 1);
});
