// W2-F regression: the Massline throw destination must survive the auto-target quiet refresh.
//
// THE DEFECT THIS PINS. `state.player.targetId` is two things at once: the gun/panel selection AND
// the aim point `masslineThrow._resolveThrowAim` throws the payload at. Auto-target republishes a
// quiet refresh every AUTO_TARGET_REFRESH_S (0.12s, src/combat/autoTargetMode.js:187-190). That
// refresh only ever protected a selection that was *itself* a valid scanner hostile lock, so the
// natural throw destination — the freighter, station or rock you deliberately clicked in the
// contact overview — was overwritten within 0.12s. With a hostile on the line it was overwritten by
// the tethered body itself, and `_resolveThrowAim` refuses the body already on the line
// (`selectedId !== payload.id`), so the throw silently degraded to a synthetic radius-2 cursor
// point. You grab a rock, you pick the ship you mean to hit, and an eighth of a second later the
// game has re-aimed you at your own catch.
//
// These are behavioural assertions: they drive the real uiRoot scan and the real masslineThrow
// system against real state and assert the outcome. No source-string scanning.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { targetNearestHostileToPlayer } from '../src/ui/uiRoot.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { resolvePlayerGunTarget } from '../src/combat/autoTargetMode.js';
import { SCANNER_CONTACT_RANGE } from '../src/systems/scanner.js';
import { applyFeatureConfigToMaps, PRODUCTION_FEATURES } from '../src/data/featureFlags.js';

applyFeatureConfigToMaps(PRODUCTION_FEATURES);

const PLAYER_ID = 8;

test('a deliberate non-hostile pick survives the 0.12s quiet refresh and stays the throw aim', () => {
  const h = createHarness();
  const held = makeHostile(200, { x: 0, z: 140 }, { x: 90, z: 0 });      // on the line
  const freighter = makeTrader(300, { x: 900, z: 0 }, { x: -12, z: 0 }); // the destination
  h.add(held, freighter);
  h.latch(held.id);
  h.state.player.targetId = freighter.id;   // clicked in the contact overview (src/ui/hud.js:3180)

  // Before: the throw is already aimed at the freighter.
  assert.equal(h.throwAim().aimTargetId, freighter.id,
    'precondition: the selected freighter is the throw destination');

  // The quiet refresh fires whether or not the player did anything.
  targetNearestHostileToPlayer(h.state, null, { quiet: true });

  assert.equal(h.state.player.targetId, freighter.id,
    'the quiet refresh must not spend an explicit non-hostile selection on the body already on the line');

  const aim = h.throwAim();
  assert.equal(aim.aimTargetId, freighter.id,
    'masslineThrow must still accept the selection as the throw destination after the refresh');
  assert.equal(aim.aimSynthetic, false,
    'a real destination must not degrade to the synthetic radius-2 cursor point');
});

test('the refresh survives repetition — six ticks of auto-target do not erode the destination', () => {
  const h = createHarness();
  const held = makeHostile(200, { x: 0, z: 140 }, { x: 90, z: 0 });
  const rock = makeAsteroid(400, { x: -600, z: 300 });
  h.add(held, rock);
  h.latch(held.id);
  h.state.player.targetId = rock.id;

  for (let i = 0; i < 6; i += 1) targetNearestHostileToPlayer(h.state, null, { quiet: true });

  assert.equal(h.state.player.targetId, rock.id, 'six refreshes must be as harmless as one');
  assert.equal(h.throwAim().aimTargetId, rock.id, 'the rock is still the throw destination');
});

test('the guns stay reconciled with the tether even while the selection is elsewhere', () => {
  // Lane 3s reconciliation must NOT be undone by the fix above: the gun target is derived from the
  // tether, not from state.player.targetId, so preserving the selection costs the guns nothing.
  const h = createHarness();
  const near = makeHostile(100, { x: 60, z: 0 }, { x: 0, z: 0 });        // a nearer third ship
  const held = makeHostile(200, { x: 0, z: 140 }, { x: 90, z: 0 });
  const freighter = makeTrader(300, { x: 900, z: 0 }, { x: -12, z: 0 });
  h.add(near, held, freighter);
  h.latch(held.id);
  h.state.player.targetId = freighter.id;

  targetNearestHostileToPlayer(h.state, null, { quiet: true });

  assert.equal(h.state.player.targetId, freighter.id, 'the selection is the players');
  assert.equal(resolvePlayerGunTarget(h.state).id, held.id,
    'the guns must still be on the ship on the line, not the nearer third ship');
});

test('a stale hostile lock is still replaced — the refresh keeps doing its actual job', () => {
  const h = createHarness();
  const fled = makeHostile(100, { x: SCANNER_CONTACT_RANGE + 800, z: 0 }, { x: 400, z: 0 });
  const inRange = makeHostile(200, { x: 300, z: 0 }, { x: 0, z: 0 });
  h.add(fled, inRange);
  h.state.player.targetId = fled.id;   // hostile lock that has left scanner range

  targetNearestHostileToPlayer(h.state, null, { quiet: true });

  assert.equal(h.state.player.targetId, inRange.id,
    'an out-of-range HOSTILE lock must still be re-acquired; only non-hostile picks are held');
});

test('a dead non-hostile pick is released rather than held forever', () => {
  const h = createHarness();
  const wreckedTrader = makeTrader(300, { x: 900, z: 0 }, { x: 0, z: 0 });
  const hostile = makeHostile(200, { x: 300, z: 0 }, { x: 0, z: 0 });
  h.add(wreckedTrader, hostile);
  h.state.player.targetId = wreckedTrader.id;
  wreckedTrader.alive = false;

  targetNearestHostileToPlayer(h.state, null, { quiet: true });

  assert.equal(h.state.player.targetId, hostile.id,
    'a destroyed selection is not a destination — the refresh may re-acquire');
});

test('the explicit (non-quiet) call still prefers the hostile on the line', () => {
  const h = createHarness();
  const near = makeHostile(100, { x: 60, z: 0 }, { x: 0, z: 0 });
  const held = makeHostile(200, { x: 0, z: 140 }, { x: 90, z: 0 });
  const freighter = makeTrader(300, { x: 900, z: 0 }, { x: 0, z: 0 });
  h.add(near, held, freighter);
  h.latch(held.id);
  h.state.player.targetId = freighter.id;

  targetNearestHostileToPlayer(h.state, null, {});   // a deliberate Tab / auto-target toggle

  assert.equal(h.state.player.targetId, held.id,
    'an explicit re-target is the player asking; it may take the ship on the line');
});

// ---- harness ----------------------------------------------------------------------------------

function createHarness() {
  const state = createGameState(0x5a);
  state.mode = 'flight';
  state.tick = 100;
  state.simTime = 100 / 60;
  state.playerId = PLAYER_ID;
  state.entities.clear();
  state.entityList = state.entityList || [];
  state.entityList.length = 0;

  const player = {
    id: PLAYER_ID, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, maxSpeed: 120, radius: 8, mass: 200,
    flags: {}, cap: 100,
    data: { weapons: [], combat: {}, derived: { cap: 100 } },
  };
  state.entities.set(PLAYER_ID, player);
  state.entityList.push(player);

  state.player.tether = { active: false, targetId: null, phase: 'slack', restLength: 0 };
  state.player.targetId = null;
  state.input.autoFire = true;
  state.input.actions = state.input.actions || {};
  // Cursor parked on the ship: no entity is inside CURSOR_AIM_GRACE, so the aim resolver falls
  // through to the SELECTION branch — the one this regression is about.
  state.input.aimWorld = { x: 0, z: 0 };

  const harness = { state };
  harness.add = (...entities) => {
    for (const e of entities) {
      state.entities.set(e.id, e);
      state.entityList.push(e);
    }
  };
  harness.latch = (targetId, extra = {}) => {
    state.player.tether = {
      active: true, targetId, phase: 'slack', restLength: 0, strain: 0, attachmentId: null, ...extra,
    };
  };
  // Drive the real masslineThrow system for one tick with the throw armed, and hand back its
  // published aim. `attachmentId: null` means _executeThrow can never fire, so this reads the aim
  // without cutting the line.
  harness.throwAim = () => {
    const bus = { on: () => () => {}, emit: () => {} };
    const system = Object.create(masslineThrow);
    system.init({ state, bus, helpers: {}, registry: { get: () => null } });
    state.input.actions.throwArm = true;
    system.update(1 / 60, state);
    system.destroy();
    return state.massline2.throw;
  };
  return harness;
}

// scanner.isHostileToPlayer flags hostility via ai.huntPlayer / forcePlayerTarget / encounter.
function makeHostile(id, pos, vel) {
  return {
    id, type: 'ship', alive: true, team: 1,
    pos: { ...pos }, vel: { ...vel }, rot: 0, angVel: 0, maxSpeed: 120, radius: 10, mass: 500,
    data: { combat: {}, ai: { huntPlayer: true } },
  };
}

// A neutral hauler: the classic throw destination, and something the hostile scan will never pick.
function makeTrader(id, pos, vel) {
  return {
    id, type: 'ship', alive: true, team: 3,
    pos: { ...pos }, vel: { ...vel }, rot: 0, angVel: 0, maxSpeed: 60, radius: 16, mass: 4200,
    data: { combat: {}, ai: { archetype: 'trader', passive: true } },
  };
}

function makeAsteroid(id, pos) {
  return {
    id, type: 'asteroid', alive: true, team: 0,
    pos: { ...pos }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 22, mass: 1800,
    data: {},
  };
}
