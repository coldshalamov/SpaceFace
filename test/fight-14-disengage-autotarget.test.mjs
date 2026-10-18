// FIGHT-14: A pirate that has disengaged drops out of auto-target, so letting it go is a real choice.
// On seed 4242, a hull in the disengage state leaves the auto-target candidate set while a fighting hull stays.
// Manual locks remain allowed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { targetNearestHostileToPlayer } from '../src/ui/uiRoot.js';
import { isPirateDisengaged } from '../src/systems/pirateDisengage.js';

function shipLike(id, pos, { disengaged = false, fsm = 'combat' } = {}) {
  return {
    id,
    type: 'ship',
    team: 1,
    alive: true,
    pos,
    vel: { x: 0, z: 0 },
    data: {
      encounter: true,
      ai: {
        pirateDisengaged: disengaged,
        fsm,
      },
      pirateDisengage: disengaged ? { phase: fsm } : null,
    },
  };
}

function createWorld(hostiles, { targetId = null, objectSelection = null, seed = 4242 } = {}) {
  const player = { id: 'player_1', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, targetId };
  const entities = [player, ...hostiles];
  const busEvents = [];
  const bus = {
    emit: (evt, payload) => busEvents.push({ evt, payload }),
    on: () => () => {},
  };
  return {
    state: {
      seed,
      playerId: 'player_1',
      simTime: 10,
      entities: new Map(entities.map((e) => [e.id, e])),
      entityList: entities,
      player,
      ui: {
        objectSelection,
      },
      input: {
        aimIntentActive: false,
        aimWorld: { x: 0, z: 0 },
        autoFire: false,
      },
    },
    bus,
    busEvents,
  };
}

test('isPirateDisengaged accurately detects disengaged or fleeing entities', () => {
  const normal = shipLike('s1', { x: 100, z: 0 });
  const fleeing = shipLike('s2', { x: 100, z: 0 }, { disengaged: true, fsm: 'flee' });
  const surrendering = shipLike('s3', { x: 100, z: 0 }, { disengaged: true, fsm: 'surrender' });

  assert.equal(isPirateDisengaged(normal), false);
  assert.equal(isPirateDisengaged(fleeing), true);
  assert.equal(isPirateDisengaged(surrendering), true);
});

test('seed 4242: disengaged pirate leaves auto-target candidate set while active combatant stays', () => {
  // Disengaged pirate is closer (100 wu) than fighting combatant (250 wu)
  const fleeingPirate = shipLike('fleeing_raider', { x: 100, z: 0 }, { disengaged: true, fsm: 'flee' });
  const activePirate = shipLike('active_gunship', { x: 250, z: 0 }, { disengaged: false, fsm: 'combat' });

  const { state, bus } = createWorld([fleeingPirate, activePirate], { seed: 4242 });

  targetNearestHostileToPlayer(state, bus, { quiet: true });

  // Auto-target must skip the disengaged pirate and acquire the active combatant
  assert.equal(state.player.targetId, 'active_gunship', 'auto-target skipped closer disengaged hull and acquired active combatant');
});

test('auto-targeted hull that disengages drops out of auto-target on next refresh', () => {
  const pirateA = shipLike('pirate_a', { x: 150, z: 0 }, { disengaged: false });
  const pirateB = shipLike('pirate_b', { x: 300, z: 0 }, { disengaged: false });

  const { state, bus, busEvents } = createWorld([pirateA, pirateB], { targetId: 'pirate_a', seed: 4242 });

  // Verify it starts locked on pirate_a
  targetNearestHostileToPlayer(state, bus, { quiet: true });
  assert.equal(state.player.targetId, 'pirate_a');

  // pirate_a disengages
  pirateA.data.ai.pirateDisengaged = true;
  pirateA.data.ai.fsm = 'flee';
  pirateA.data.pirateDisengage = { phase: 'flee' };

  // Next quiet refresh (runs every 0.12s during flight)
  state.simTime += 0.12;
  targetNearestHostileToPlayer(state, bus, { quiet: true });

  // pirate_a should drop, LOCK LOST should be emitted, and auto-target switches to pirate_b
  assert.equal(state.player.targetId, 'pirate_b', 'disengaged pirate dropped and switched to remaining fighting hostile');
  const lockLostToast = busEvents.find((e) => e.evt === 'toast' && e.payload.text?.includes('LOCK LOST'));
  assert.ok(lockLostToast, 'LOCK LOST toast emitted when disengaged contact drops');
});

test('manual lock on disengaged pirate is NOT blocked', () => {
  const fleeingPirate = shipLike('fleeing_raider', { x: 100, z: 0 }, { disengaged: true, fsm: 'flee' });

  // Player clicked/selected the disengaged pirate explicitly
  const { state, bus } = createWorld([fleeingPirate], {
    targetId: 'fleeing_raider',
    objectSelection: { targetId: 'fleeing_raider', entity: fleeingPirate },
    seed: 4242,
  });

  // Quiet refresh should NOT clear or override explicit manual selection
  targetNearestHostileToPlayer(state, bus, { quiet: true });
  assert.equal(state.player.targetId, 'fleeing_raider', 'explicit manual lock is preserved');
});
