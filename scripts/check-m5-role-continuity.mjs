// M5 active-hull role continuity — live ships-authority contract.
// Run: node scripts/check-m5-role-continuity.mjs
//
// Proves that every canonical hull can produce a complete player-facing role packet, a real
// Make Active transition publishes exactly one role briefing, overflow/no-op attempts do not
// publish false transitions, and Continue reconstructs role context from saved hull ownership.

import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SHIPS } from '../src/data/ships.js';
import {
  getDerivedStats,
  makeShipEntitySpec,
  ships,
} from '../src/systems/ships.js';

function installPlayerEntity(state) {
  const owned = state.player.ownedShips[state.player.activeShipIndex];
  const spec = makeShipEntitySpec(owned.defId, {
    fittings: owned.fittings || [],
    isPlayer: true,
    player: state.player,
  });
  const entity = {
    ...spec,
    id: 1,
    alive: true,
    vel: { x: 0, z: 0 },
  };
  state.playerId = entity.id;
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  return entity;
}

const state = createGameState(0x5a17);
const bus = createBus();
const roleContexts = [];
const toasts = [];
bus.on('ship:roleContext', (payload) => roleContexts.push(payload));
bus.on('toast', (payload) => toasts.push(payload));

ships.init({ state, bus, helpers: {} });
ships.newGame();
const playerEntity = installPlayerEntity(state);

// Every authored hull must expose a complete, deterministic player-facing role context.
const roleIds = new Set();
for (const def of SHIPS) {
  const previousPlayer = state.player;
  state.player = {
    ...previousPlayer,
    activeShipIndex: 0,
    ownedShips: [{ defId: def.id, fittings: [] }],
  };
  const first = ships.activeRoleContext({ source: 'held_out_role_probe' });
  const second = ships.activeRoleContext({ source: 'held_out_role_probe' });
  assert.deepEqual(second, first, `${def.id} role context must be deterministic`);
  assert.equal(first.schema, 'spaceface.shipRoleContext.v1');
  assert.equal(first.defId, def.id);
  assert.ok(first.roleLabel.length >= 4, `${def.id} role label`);
  assert.ok(first.identityLine.length >= 20, `${def.id} identity line`);
  assert.ok(first.signatureVerb.length >= 20, `${def.id} signature verb`);
  assert.ok(first.counterplay.length >= 20, `${def.id} counterplay`);
  assert.ok(first.primaryCareers.length >= 1, `${def.id} primary careers`);
  assert.equal(roleIds.has(first.role), false, `${def.id} duplicate public role ${first.role}`);
  roleIds.add(first.role);
}
assert.equal(roleIds.size, 13, 'all thirteen hull roles must remain distinct');

// Restore the real new-game ownership and exercise the live ship authority.
ships.newGame();
playerEntity.data.defId = state.player.ownedShips[0].defId;
ships.recomputeEntity(playerEntity.id, state.player.ownedShips[0].fittings);

assert.equal(ships.buyShip({ defId: 'ship_wasp', grant: true, setActive: true }), true);
assert.equal(state.player.activeShipIndex, 1, 'purchased Wasp must become active');
assert.equal(playerEntity.data.defId, 'ship_wasp', 'live player entity must swap hull');
assert.equal(playerEntity.data.derived.roleIdentity.role, 'fighter', 'live derived role identity');
assert.equal(roleContexts.length, 1, 'successful transition publishes one role context');
assert.equal(roleContexts[0].source, 'active_ship_changed');
assert.equal(roleContexts[0].previousDefId, 'ship_kestrel');
assert.equal(roleContexts[0].defId, 'ship_wasp');
assert.match(roleContexts[0].signatureVerb, /gun|attack|pass|charge/i);
const briefingToasts = () => toasts.filter((toast) => toast && toast.kind === 'info');
assert.equal(briefingToasts().length, 1, 'successful transition publishes one visible briefing');
assert.match(briefingToasts()[0].text, /Wasp active.*Light Fighter/i);

// Re-selecting the active hull is a no-op, not a false progression receipt.
playerEntity.data.derived.roleIdentity = null;
assert.equal(ships.setActiveShip(1), true);
assert.equal(playerEntity.data.derived.roleIdentity.role, 'fighter',
  'no-op active selection must preserve the existing derived-stat recomputation path');
assert.equal(roleContexts.length, 1, 'no-op active selection must not republish context');
assert.equal(briefingToasts().length, 1, 'no-op active selection must not replay briefing');

// Cargo overflow must fail closed: keep the old hull and never claim the new role became active.
assert.equal(ships.buyShip({ defId: 'ship_hornet', grant: true, setActive: false }), true);
const hornetIndex = state.player.ownedShips.length - 1;
const hornet = state.player.ownedShips[hornetIndex];
const hornetCargo = getDerivedStats(hornet.defId, hornet.fittings || [], state.player).cargoCap;
state.player.cargo.usedVolume = hornetCargo + 1;
assert.equal(ships.setActiveShip(hornetIndex), false, 'overflow switch must fail');
assert.equal(state.player.activeShipIndex, 1, 'failed switch must retain Wasp');
assert.equal(playerEntity.data.defId, 'ship_wasp', 'failed switch must retain live entity hull');
assert.equal(roleContexts.length, 1, 'failed switch must not publish role context');
assert.equal(briefingToasts().length, 1, 'failed switch must not publish role briefing');

// Save only ownership/loadout truth. Continue derives the exact active role and does not replay UI.
state.player.cargo.usedVolume = 0;
const serializedPlayer = JSON.stringify(state.player);
assert.equal(serializedPlayer.includes('roleContext'), false, 'transient role context must not serialize');
assert.equal(serializedPlayer.includes('signatureVerb'), false, 'lattice copy must not serialize');
const restoredPlayer = JSON.parse(serializedPlayer);
state.player.activeShipIndex = 0;
state.player = restoredPlayer;
const toastsBeforeLoad = briefingToasts().length;
bus.emit('save:loaded', { slot: 2, visualGatePending: false });
assert.equal(roleContexts.length, 2, 'Continue publishes one reconstructed role context');
const restoredContext = roleContexts[1];
assert.equal(restoredContext.source, 'save_loaded');
assert.equal(restoredContext.defId, 'ship_wasp');
assert.equal(restoredContext.role, 'fighter');
assert.equal(restoredContext.signatureVerb, roleContexts[0].signatureVerb);
assert.equal(restoredContext.counterplay, roleContexts[0].counterplay);
assert.equal(briefingToasts().length, toastsBeforeLoad, 'Continue must not replay switch toast');

console.log('M5 role continuity OK — 13 role contexts, live switch briefing, fail-closed overflow, save/Continue reconstruction.');
