import assert from 'node:assert/strict';
import test from 'node:test';

import { BLUEPRINT_BY_ID } from '../src/data/blueprints.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { refineryServiceFeeForBlueprint } from '../src/systems/economy.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { industryBlueprintReadiness } from '../src/ui/station/screens/industry.js';

const BP_ID = 'bp_refine_metals';
const STATION_ID = 'station_ceres';

function boot() {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 0x5806 });
  const { state, bus } = runtime;
  const ships = runtime.getSystem('ships');
  ships.newGame();
  const owned = state.player.ownedShips[0];
  const player = runtime.spawn(makeShipEntitySpec(owned.defId, {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    fittings: owned.fittings,
    appearance: owned.appearance,
    pos: { x: 0, z: 0 },
  }));
  player.flags = { ...(player.flags || {}), persistent: true };
  state.playerId = player.id;
  state.player.credits = 100;
  state.player.cargo.items = {
    ...(state.player.cargo.items || {}),
    cmdty_ore_iron: 6,
    cmdty_ore_titanium: 2,
  };
  return {
    runtime,
    state,
    bus,
    crafting: runtime.getSystem('crafting'),
  };
}

test('Ceres charges one quoted refinery fee before consuming ore and Continue cannot repeat it', () => {
  const route = boot();
  try {
    const { runtime, state, bus, crafting } = route;
    const bp = BLUEPRINT_BY_ID.get(BP_ID);
    const feeCr = refineryServiceFeeForBlueprint(bp);
    assert.equal(feeCr, 10, 'six percent of 2 × 85cr rounds to the visible 10cr service fee');

    const fees = [];
    const completes = [];
    bus.on('craft:serviceFeeCharged', (payload) => fees.push(structuredClone(payload)));
    bus.on('craft:complete', (payload) => completes.push(structuredClone(payload)));

    const originalCargo = structuredClone(state.player.cargo.items);
    assert.equal(crafting.build(BP_ID, STATION_ID), false, 'a forged station id cannot charge or refine');
    assert.equal(state.player.credits, 100);
    assert.deepEqual(state.player.cargo.items, originalCargo);
    assert.equal(fees.length, 0);

    state.mode = 'station';
    state.ui.docked = true;
    state.ui.dockedStationId = STATION_ID;
    bus.emit('dock:docked', { stationId: STATION_ID });
    state.player.credits = feeCr - 1;
    assert.deepEqual(industryBlueprintReadiness(bp, state, 'refinery'), {
      state: 'credits',
      label: `Need ${feeCr} cr fee`,
      feeCr,
    }, 'the default Industry console blocks on the same Economy quote');
    assert.equal(crafting.build(BP_ID, STATION_ID), false, 'an underfunded refinery job fails before cargo mutation');
    assert.equal(state.player.credits, feeCr - 1);
    assert.deepEqual(state.player.cargo.items, originalCargo);
    assert.equal(fees.length, 0);

    state.player.credits = 100;
    assert.deepEqual(industryBlueprintReadiness(bp, state, 'refinery'), {
      state: 'ready',
      label: 'Ready to build',
      feeCr,
    });
    assert.equal(crafting.build(BP_ID, STATION_ID), true);
    assert.equal(state.player.credits, 100 - feeCr);
    assert.equal(state.player.cargo.items.cmdty_ore_iron, 3);
    assert.equal(state.player.cargo.items.cmdty_ore_titanium, 1);
    assert.equal(state.player.cargo.items.cmdty_refined_metals, 2);
    assert.equal(fees.length, 1);
    assert.deepEqual(fees[0], {
      ok: true,
      bpId: BP_ID,
      stationId: STATION_ID,
      feeCr,
      remainingCredits: 100 - feeCr,
    });
    assert.equal(completes.length, 1);

    const save = runtime.getSystem('save');
    const envelope = save.serialize('plan58-refinery-service-fee');
    assert.equal(save.loadEnvelope(structuredClone(envelope), 'plan58-refinery-service-fee'), true);
    assert.equal(state.player.credits, 100 - feeCr);
    assert.equal(state.player.cargo.items.cmdty_refined_metals, 2);
    assert.equal(fees.length, 1, 'Continue restores the result without replaying the refinery charge');
  } finally {
    route.runtime.dispose();
  }
});

test('the compact field kit does not charge the station refinery service fee', () => {
  const route = boot();
  try {
    const { state, bus, crafting } = route;
    const bpId = 'bp_field_refined_fuel';
    const bp = BLUEPRINT_BY_ID.get(bpId);
    assert.ok(refineryServiceFeeForBlueprint(bp) > 0, 'the same recipe has a real dockside quote');
    state.mode = 'flight';
    state.ui.docked = false;
    crafting.unlockSource('faction_rep', { factionId: 'faction_dmc', delta: 1 });
    state.player.cargo.items.cmdty_volatiles = 2;
    state.player.credits = 0;
    const fees = [];
    bus.on('craft:serviceFeeCharged', (payload) => fees.push(payload));
    assert.equal(crafting.buildField(bpId), true);
    assert.equal(state.player.credits, 0);
    assert.equal(fees.length, 0);
  } finally {
    route.runtime.dispose();
  }
});
