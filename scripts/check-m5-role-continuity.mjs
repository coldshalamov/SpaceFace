// M5 active-hull role continuity + one-time role briefing — live ships + presentation contract.
// Run: node scripts/check-m5-role-continuity.mjs
//
// Proves:
//   • every canonical hull produces a complete deterministic player-facing role packet
//   • New Game publishes exactly one packet + one presentation toast
//   • Continue (save:loaded) publishes exactly one restored packet + one presentation toast
//   • a real hull switch publishes exactly one transition briefing
//   • no-op active selection, recompute, and failed overflow stay silent
//   • destroy/reinit of the presentation consumer does not replay a stale briefing
//   • missing/legacy hull defIds fall back without crashing the briefing seam
//   • ships never emits toast on ship:roleContext (presentationAdapters owns visible UI)

import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SHIPS } from '../src/data/ships.js';
import {
  getDerivedStats,
  makeShipEntitySpec,
  ships,
} from '../src/systems/ships.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';

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

function briefingToasts(toasts) {
  return toasts.filter((toast) => toast
    && toast.kind === 'info'
    && (toast.key === 'ship.role.briefing' || / active · /.test(String(toast.text || ''))));
}

function boot() {
  const state = createGameState(0x5a17);
  const bus = createBus();
  const roleContexts = [];
  const toasts = [];
  const rawShipToasts = [];

  // Capture toast emissions that would mean ships (or anyone else) bypassed presentation.
  const originalEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    if (event === 'toast') toasts.push(payload);
    return originalEmit(event, payload);
  };

  bus.on('ship:roleContext', (payload) => {
    roleContexts.push(payload);
    // Adversarial: ships must not also emit toast while publishing the packet.
    // (toast listener order is independent; we assert totals after each action.)
  });

  // Presentation is the production-visible consumer; register before ships matches registry order.
  presentationAdapters.init({ state, bus, helpers: {} });
  ships.init({ state, bus, helpers: {} });

  return { state, bus, roleContexts, toasts, presentationAdapters, ships, rawShipToasts };
}

// ---------------------------------------------------------------------------
// Lattice completeness (13 distinct roles, deterministic packets)
// ---------------------------------------------------------------------------
{
  const { state, roleContexts, toasts, ships: shipsSys } = boot();
  // Probe without counting New Game noise: clear after a silent query-only path.
  shipsSys.newGame();
  const afterNewGameContexts = roleContexts.length;
  const afterNewGameToasts = briefingToasts(toasts).length;
  assert.equal(afterNewGameContexts, 1, 'New Game publishes exactly one role context');
  assert.equal(afterNewGameToasts, 1, 'New Game surfaces exactly one visible briefing');
  assert.equal(roleContexts[0].source, 'new_game');
  assert.equal(roleContexts[0].announce, true);
  assert.equal(roleContexts[0].defId, 'ship_kestrel');
  assert.match(briefingToasts(toasts)[0].text, /Hitch active/i);

  const roleIds = new Set();
  for (const def of SHIPS) {
    const previousPlayer = state.player;
    state.player = {
      ...previousPlayer,
      activeShipIndex: 0,
      ownedShips: [{ defId: def.id, fittings: [] }],
    };
    const first = shipsSys.activeRoleContext({ source: 'held_out_role_probe' });
    const second = shipsSys.activeRoleContext({ source: 'held_out_role_probe' });
    assert.deepEqual(second, first, `${def.id} role context must be deterministic`);
    assert.equal(first.schema, 'spaceface.shipRoleContext.v1');
    assert.equal(first.defId, def.id);
    assert.equal(first.fallback, false, `${def.id} canonical hull is not a fallback packet`);
    assert.ok(first.roleLabel.length >= 4, `${def.id} role label`);
    assert.ok(first.identityLine.length >= 20, `${def.id} identity line`);
    assert.ok(first.signatureVerb.length >= 20, `${def.id} signature verb`);
    assert.ok(first.counterplay.length >= 20, `${def.id} counterplay`);
    assert.ok(first.primaryCareers.length >= 1, `${def.id} primary careers`);
    assert.equal(roleIds.has(first.role), false, `${def.id} duplicate public role ${first.role}`);
    roleIds.add(first.role);
  }
  assert.equal(roleIds.size, 13, 'all thirteen hull roles must remain distinct');
  // Queries must not emit packets or toasts.
  assert.equal(roleContexts.length, afterNewGameContexts, 'queries must not publish role context');
  assert.equal(briefingToasts(toasts).length, afterNewGameToasts, 'queries must not toast');
}

// ---------------------------------------------------------------------------
// Live switch, no-op silence, overflow fail-closed, Continue briefing, recompute silence
// ---------------------------------------------------------------------------
{
  const ctx = boot();
  const { state, bus, roleContexts, toasts, ships: shipsSys } = ctx;
  shipsSys.newGame();
  const playerEntity = installPlayerEntity(state);
  assert.equal(roleContexts.length, 1, 'New Game exactly once (packet)');
  assert.equal(briefingToasts(toasts).length, 1, 'New Game exactly once (toast)');

  // Recompute must not republish or toast.
  const beforeRecomputeContexts = roleContexts.length;
  const beforeRecomputeToasts = briefingToasts(toasts).length;
  shipsSys.recomputeEntity(playerEntity.id, state.player.ownedShips[0].fittings);
  assert.equal(roleContexts.length, beforeRecomputeContexts, 'recompute must not publish role context');
  assert.equal(briefingToasts(toasts).length, beforeRecomputeToasts, 'recompute must not toast');

  assert.equal(shipsSys.buyShip({ defId: 'ship_wasp', grant: true, setActive: true }), true);
  assert.equal(state.player.activeShipIndex, 1, 'purchased Wasp must become active');
  assert.equal(playerEntity.data.defId, 'ship_wasp', 'live player entity must swap hull');
  assert.equal(playerEntity.data.derived.roleIdentity.role, 'fighter', 'live derived role identity');
  assert.equal(roleContexts.length, 2, 'successful transition publishes one additional role context');
  assert.equal(roleContexts[1].source, 'active_ship_changed');
  assert.equal(roleContexts[1].announce, true);
  assert.equal(roleContexts[1].previousDefId, 'ship_kestrel');
  assert.equal(roleContexts[1].defId, 'ship_wasp');
  assert.match(roleContexts[1].signatureVerb, /gun|attack|pass|charge/i);
  assert.equal(briefingToasts(toasts).length, 2, 'successful transition publishes one additional briefing');
  assert.match(briefingToasts(toasts)[1].text, /Wasp active.*Light Fighter/i);

  // Re-selecting the active hull is a no-op, not a false progression receipt.
  playerEntity.data.derived.roleIdentity = null;
  assert.equal(shipsSys.setActiveShip(1), true);
  assert.equal(playerEntity.data.derived.roleIdentity.role, 'fighter',
    'no-op active selection must preserve the existing derived-stat recomputation path');
  assert.equal(roleContexts.length, 2, 'no-op active selection must not republish context');
  assert.equal(briefingToasts(toasts).length, 2, 'no-op active selection must not replay briefing');

  // Cargo overflow must fail closed: keep the old hull and never claim the new role became active.
  assert.equal(shipsSys.buyShip({ defId: 'ship_hornet', grant: true, setActive: false }), true);
  const hornetIndex = state.player.ownedShips.length - 1;
  const hornet = state.player.ownedShips[hornetIndex];
  const hornetCargo = getDerivedStats(hornet.defId, hornet.fittings || [], state.player).cargoCap;
  state.player.cargo.usedVolume = hornetCargo + 1;
  assert.equal(shipsSys.setActiveShip(hornetIndex), false, 'overflow switch must fail');
  assert.equal(state.player.activeShipIndex, 1, 'failed switch must retain Wasp');
  assert.equal(playerEntity.data.defId, 'ship_wasp', 'failed switch must retain live entity hull');
  assert.equal(roleContexts.length, 2, 'failed switch must not publish role context');
  assert.equal(briefingToasts(toasts).length, 2, 'failed switch must not publish role briefing');

  // Save only ownership/loadout truth. Continue reconstructs role and shows one briefing.
  state.player.cargo.usedVolume = 0;
  const serializedPlayer = JSON.stringify(state.player);
  assert.equal(serializedPlayer.includes('roleContext'), false, 'transient role context must not serialize');
  assert.equal(serializedPlayer.includes('signatureVerb'), false, 'lattice copy must not serialize');
  assert.equal(serializedPlayer.includes('announce'), false, 'announce flag must not serialize');
  const restoredPlayer = JSON.parse(serializedPlayer);
  state.player.activeShipIndex = 0;
  state.player = restoredPlayer;
  const toastsBeforeLoad = briefingToasts(toasts).length;
  const contextsBeforeLoad = roleContexts.length;
  bus.emit('save:loaded', { slot: 2, visualGatePending: false });
  assert.equal(roleContexts.length, contextsBeforeLoad + 1, 'Continue publishes one reconstructed role context');
  const restoredContext = roleContexts[roleContexts.length - 1];
  assert.equal(restoredContext.source, 'save_loaded');
  assert.equal(restoredContext.announce, true);
  assert.equal(restoredContext.defId, 'ship_wasp');
  assert.equal(restoredContext.role, 'fighter');
  assert.equal(restoredContext.signatureVerb, roleContexts[1].signatureVerb);
  assert.equal(restoredContext.counterplay, roleContexts[1].counterplay);
  assert.equal(
    briefingToasts(toasts).length,
    toastsBeforeLoad + 1,
    'Continue surfaces exactly one restored-role briefing',
  );
  assert.match(briefingToasts(toasts)[briefingToasts(toasts).length - 1].text, /Wasp active.*Light Fighter/i);

  // Second save:loaded is another Continue (exactly one more), not a silent no-op of the consumer.
  bus.emit('save:loaded', { slot: 2, visualGatePending: false });
  assert.equal(roleContexts.length, contextsBeforeLoad + 2, 'each Continue publishes one packet');
  assert.equal(briefingToasts(toasts).length, toastsBeforeLoad + 2, 'each Continue surfaces one briefing');
}

// ---------------------------------------------------------------------------
// Destroy / reinit idempotence — no phantom toast without a fresh publish
// ---------------------------------------------------------------------------
{
  const ctx = boot();
  const { state, bus, roleContexts, toasts, ships: shipsSys } = ctx;
  shipsSys.newGame();
  assert.equal(briefingToasts(toasts).length, 1);

  presentationAdapters.dispose();
  // Re-init consumer mid-session. Must not replay the prior New Game briefing.
  const toastsAfterDispose = briefingToasts(toasts).length;
  const contextsAfterDispose = roleContexts.length;
  presentationAdapters.init({ state, bus, helpers: {} });
  assert.equal(roleContexts.length, contextsAfterDispose, 'reinit must not republish role context');
  assert.equal(briefingToasts(toasts).length, toastsAfterDispose, 'reinit must not replay briefing toast');

  // A real publish after reinit still works once.
  shipsSys.publishActiveRoleContext({ source: 'active_ship_changed', announce: true });
  assert.equal(briefingToasts(toasts).length, toastsAfterDispose + 1, 'post-reinit announce still surfaces once');
}

// ---------------------------------------------------------------------------
// Shipyard transition visibility — docked role changes wait until the public undock boundary
// ---------------------------------------------------------------------------
{
  const ctx = boot();
  const { state, bus, roleContexts, toasts, ships: shipsSys } = ctx;
  state.mode = 'flight';
  shipsSys.newGame();
  installPlayerEntity(state);
  assert.equal(briefingToasts(toasts).length, 1, 'starter briefing surfaces in playable flight');

  state.ui.docked = true;
  assert.equal(shipsSys.buyShip({ defId: 'ship_wasp', grant: true, setActive: false }), true);
  bus.emit('ui:setActiveShip', { index: 1 });
  assert.equal(state.player.activeShipIndex, 1, 'public Shipworks intent activates the owned hull while docked');
  assert.equal(roleContexts.at(-1).source, 'active_ship_changed');
  assert.equal(briefingToasts(toasts).length, 1,
    'docked hull switch must not spend its five-second briefing behind the station modal');
  assert.equal(ctx.presentationAdapters.inspect().pendingRoleBriefingSource, 'active_ship_changed');

  bus.emit('dock:undocked', {});
  await Promise.resolve();
  assert.equal(briefingToasts(toasts).length, 1,
    'committed undock keeps the briefing pending during the canonical launch fade');
  state.ui.docked = false;
  await new Promise((resolve) => setTimeout(resolve, 475));
  assert.equal(briefingToasts(toasts).length, 2, 'undock surfaces exactly one deferred role briefing');
  assert.match(briefingToasts(toasts).at(-1).text, /Wasp active.*Light Fighter/i);
  assert.equal(ctx.presentationAdapters.inspect().pendingRoleBriefingSource, null);

  bus.emit('dock:undocked', {});
  await Promise.resolve();
  assert.equal(briefingToasts(toasts).length, 2, 'repeated undock cannot replay a consumed briefing');
}

// ---------------------------------------------------------------------------
// Missing / legacy role fallback
// ---------------------------------------------------------------------------
{
  const ctx = boot();
  const { state, bus, roleContexts, toasts, ships: shipsSys } = ctx;
  shipsSys.newGame();
  const baselineToasts = briefingToasts(toasts).length;
  const baselineContexts = roleContexts.length;

  state.player.ownedShips = [{ defId: 'ship_legacy_unknown_hull', fittings: [] }];
  state.player.activeShipIndex = 0;
  const fallback = shipsSys.activeRoleContext({ source: 'legacy_probe' });
  assert.ok(fallback, 'missing lattice hull still yields a role packet');
  assert.equal(fallback.fallback, true);
  assert.equal(fallback.defId, 'ship_legacy_unknown_hull');
  assert.ok(fallback.roleLabel.length >= 4);
  assert.ok(fallback.signatureVerb.length >= 20);
  assert.ok(fallback.counterplay.length >= 20);
  assert.ok(fallback.primaryCareers.length >= 1);

  const published = shipsSys.publishActiveRoleContext({
    source: 'save_loaded',
    announce: true,
  });
  assert.ok(published);
  assert.equal(published.fallback, true);
  assert.equal(published.announce, true);
  assert.equal(roleContexts.length, baselineContexts + 1);
  assert.equal(briefingToasts(toasts).length, baselineToasts + 1);
  assert.match(briefingToasts(toasts)[briefingToasts(toasts).length - 1].text, /legacy|unknown|hull|active/i);

  // Empty ownership fails closed (no packet, no toast).
  state.player.ownedShips = [];
  assert.equal(shipsSys.publishActiveRoleContext({ source: 'save_loaded', announce: true }), null);
  assert.equal(roleContexts.length, baselineContexts + 1, 'empty ownership must not publish');
  assert.equal(briefingToasts(toasts).length, baselineToasts + 1, 'empty ownership must not toast');

  // Silent publish (announce:false) still emits packet for internal consumers, no toast.
  state.player.ownedShips = [{ defId: 'ship_wasp', fittings: [] }];
  shipsSys.publishActiveRoleContext({ source: 'query', announce: false });
  assert.equal(roleContexts.length, baselineContexts + 2);
  assert.equal(roleContexts[roleContexts.length - 1].announce, false);
  assert.equal(briefingToasts(toasts).length, baselineToasts + 1, 'announce:false must stay silent');
}

// ---------------------------------------------------------------------------
// ships authority never emits toast itself for role briefings (adapter path only)
// ---------------------------------------------------------------------------
{
  const state = createGameState(0x5a18);
  const bus = createBus();
  const toasts = [];
  const roleContexts = [];
  bus.on('toast', (p) => toasts.push(p));
  bus.on('ship:roleContext', (p) => roleContexts.push(p));
  // Deliberately do NOT init presentationAdapters — ships alone must not toast.
  ships.init({ state, bus, helpers: {} });
  ships.newGame();
  assert.equal(roleContexts.length, 1, 'ships still publishes the packet without adapters');
  assert.equal(roleContexts[0].announce, true);
  assert.equal(toasts.length, 0, 'ships must not emit toast without presentationAdapters');
  ships.publishActiveRoleContext({ source: 'active_ship_changed', previousDefId: 'ship_kestrel', announce: true });
  assert.equal(roleContexts.length, 2);
  assert.equal(toasts.length, 0, 'hull-switch packet without adapters stays non-visual');
}

// Public-route timing: New Game and Continue publish during the authored-visual loading gate.
// The role briefing must wait for both the shared playable flight boundary and the staged
// onboarding handoff so its TTL is useful without competing with the opening instruction.
{
  const ctx = boot();
  const { state, bus, roleContexts, toasts, ships: shipsSys } = ctx;
  state.mode = 'loading';
  shipsSys.newGame();
  assert.equal(roleContexts.length, 1, 'loading New Game still publishes exactly one role context');
  assert.equal(briefingToasts(toasts).length, 0, 'loading gate defers the role briefing toast');
  assert.equal(
    ctx.presentationAdapters.inspect().pendingRoleBriefingSource,
    'new_game',
    'presentation adapter retains the deferred New Game briefing',
  );

  state.mode = 'flight';
  bus.emit('mode:changed', { mode: 'flight', previousMode: 'loading' });
  assert.equal(briefingToasts(toasts).length, 0, 'New Game waits through the flight-mode UI reset');
  // Production registry order initializes presentationAdapters before onboarding. Mimic that exact
  // listener order: onboarding becomes active later in the same game:started dispatch, before the
  // adapter's microtask is allowed to publish.
  bus.on('game:started', () => {
    state.onboarding = { active: true, finished: false };
  });
  bus.emit('game:started', {});
  await Promise.resolve();
  assert.equal(briefingToasts(toasts).length, 0,
    'active onboarding retains the New Game briefing instead of competing with its instruction');
  assert.equal(
    ctx.presentationAdapters.inspect().pendingRoleBriefingSource,
    'new_game',
    'the deferred role identity remains available for the tutorial handoff',
  );

  state.onboarding.active = false;
  state.onboarding.finished = true;
  bus.emit('tutorial:finished', {});
  await Promise.resolve();
  assert.equal(briefingToasts(toasts).length, 1,
    'tutorial handoff surfaces the deferred New Game role briefing exactly once');
  assert.equal(ctx.presentationAdapters.inspect().pendingRoleBriefingSource, null,
    'tutorial handoff consumes the deferred briefing');

  bus.emit('mode:changed', { mode: 'flight', previousMode: 'loading' });
  bus.emit('game:started', {});
  await Promise.resolve();
  assert.equal(briefingToasts(toasts).length, 1, 'repeated lifecycle events do not duplicate New Game briefing');
}

{
  const ctx = boot();
  const { state, bus, toasts } = ctx;
  state.mode = 'loading';
  bus.emit('ship:roleContext', {
    announce: true,
    source: 'save_loaded',
    defId: 'ship_kestrel',
    role: 'starter',
    name: 'Hitch',
    roleLabel: 'Starter Scout',
    signatureVerb: 'Mine, tow, or fight without changing hulls.',
  });
  assert.equal(briefingToasts(toasts).length, 0, 'loading Continue defers its restored-hull briefing');
  state.mode = 'flight';
  bus.emit('mode:changed', { mode: 'flight', previousMode: 'loading' });
  assert.equal(briefingToasts(toasts).length, 1, 'Continue surfaces one restored-hull briefing at flight');
}

console.log('M5 role continuity OK — 13 roles, New Game/Continue/switch briefings once each, loading-boundary delivery, silence guards, legacy fallback, presentation-owned toast.');
