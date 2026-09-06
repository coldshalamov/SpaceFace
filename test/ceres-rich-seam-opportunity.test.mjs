import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  claimRichSeamOpportunity,
  expireRichSeamOpportunities,
  fieldDepletion as fieldDepletionBase,
  openRichSeamOpportunity,
  richSeamOpportunityForEntity,
} from '../src/systems/fieldDepletion.js';
import { addCargo, cargo as cargoBase, removeCargo } from '../src/systems/cargo.js';
import { mining as miningBase, RICH_SEAM_HEAT_MULT } from '../src/systems/mining.js';
import { save as saveBase } from '../src/save/saveSystem.js';
import {
  CONTACT_HAIL_ACTION_HELP,
  contactHailAvailability,
  createContactHailOffer,
  createContactHailResponse,
} from '../src/data/contactHail.js';
import { richSeamTargetReadout } from '../src/ui/targetPanel.js';
import { richLotReadoutHtml } from '../src/ui/station/stationHubFormatters.js';

const FIELD_ID = 'f_ceres_1';
const SLOT_ID = 'ceres_seam_ore_clast';

function richAsteroid(id = 38) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    pos: { x: 20, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    hull: 1,
    hullMax: 1,
    data: {
      activityObjectSlotId: SLOT_ID,
      fieldId: FIELD_ID,
      sectorId: 'sector_ceres_belt',
      homeSectorId: 'sector_ceres_belt',
      typeId: 'ast_metallic',
      commodityId: 'cmdty_ore_iron',
      yieldU: 8,
      oreHP: 1,
      oreHPMax: 1,
      isChunk: true,
      bulkMassU: 8,
      seams: [],
    },
  };
}

function opportunityState(simTime = 10) {
  return {
    tick: Math.round(simTime * 60),
    simTime,
    world: { currentSectorId: 'sector_ceres_belt' },
  };
}

function openOpportunity(state, extra = {}) {
  return openRichSeamOpportunity(state, {
    fieldId: FIELD_ID,
    activityObjectSlotId: SLOT_ID,
    sectorId: 'sector_ceres_belt',
    sourceEventId: 'ev_rich_seam_strike',
    sourceCycle: 3,
    simTime: state.simTime,
    ...extra,
  });
}

test('rich seam opportunity is finite, single-claim, and save-stable', () => {
  const state = opportunityState();
  const opened = openOpportunity(state, { durationS: 30 });
  assert.equal(opened.state, 'open');
  assert.equal(opened.bonusU, 8);

  const worked = claimRichSeamOpportunity(state, {
    fieldId: FIELD_ID,
    activityObjectSlotId: SLOT_ID,
    claimId: 'npc-work:one',
    claimedByKind: 'npc',
    claimedById: 202,
    simTime: 12,
  });
  assert.equal(worked.state, 'worked');
  assert.equal(worked.claimedBonusU, 8);
  assert.equal(worked.resolution, 'work');
  assert.equal(claimRichSeamOpportunity(state, {
    fieldId: FIELD_ID,
    activityObjectSlotId: SLOT_ID,
    claimId: 'npc-work:two',
    claimedByKind: 'npc',
    claimedById: 202,
    simTime: 13,
  }), null, 'a worked seam cannot pay twice');

  const owner = { ...fieldDepletionBase };
  owner.init({ state, bus: createBus() });
  const saved = owner.serialize();
  const restoredState = opportunityState(13);
  const restored = { ...fieldDepletionBase };
  restored.init({ state: restoredState, bus: createBus() });
  restored.deserialize(saved);
  assert.deepEqual(richSeamOpportunityForEntity(restoredState, richAsteroid()), worked);
  const replayedTimer = openRichSeamOpportunity(restoredState, {
    fieldId: FIELD_ID,
    activityObjectSlotId: SLOT_ID,
    sourceEventId: 'ev_rich_seam_strike',
    sourceCycle: 0,
    simTime: 14,
  });
  assert.equal(replayedTimer.state, 'worked', 'Continue cannot rewind a claimed opportunity to open');
  assert.equal(replayedTimer.opportunityId, worked.opportunityId);
  owner.destroy();
  restored.destroy();

  const missedState = opportunityState(20);
  openOpportunity(missedState, { durationS: 1 });
  assert.equal(expireRichSeamOpportunities(missedState, 21).length, 1);
  assert.equal(richSeamOpportunityForEntity(missedState, richAsteroid()).state, 'missed');
  assert.equal(richSeamOpportunityForEntity(missedState, richAsteroid()).resolution, 'miss');
});

test('player can mine the exact clast for one real bonus and pays the hot-cut heat rate', () => {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    flags: { docked: false },
    data: { miningBeam: { tierId: 'beam_mk1', directToCargo: true } },
  };
  const asteroid = richAsteroid();
  const state = {
    ...opportunityState(10),
    mode: 'flight',
    meta: { seed: 47 },
    playerId: player.id,
    player: { cargo: { items: {}, capVolume: 100, usedVolume: 0, usedMass: 0 } },
    input: { aimAngle: 0, fireGroup: 2, actions: {} },
    entities: new Map([[player.id, player], [asteroid.id, asteroid]]),
    entityList: [player, asteroid],
    rng: () => 0,
  };
  const bus = createBus();
  const depletion = { ...fieldDepletionBase };
  depletion.init({ state, bus });
  const mining = { ...miningBase };
  mining.init({
    state,
    bus,
    helpers: { spawnEntity() { throw new Error('rich test must not fracture or spawn pickups'); } },
    registry: { get() { return null; } },
  });
  openOpportunity(state);

  const beam = { heat: 0, heatMax: 100, heatRate: 10, coolRate: 20, overheated: false };
  mining._lockTargetId = asteroid.id;
  mining._updateBeamHeat(beam, true, 1, state);
  assert.equal(beam.heat, 10 * RICH_SEAM_HEAT_MULT);

  mining._seamYield = () => ({ onSeam: true, yieldMult: 1, speedMult: 1 });
  const released = mining.applyMining(asteroid.id, 10, 1, player.id);
  assert.equal(released, 16, 'the 8u rock plus the finite 8u opportunity enters the normal ore path');
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 16);
  assert.equal(state.player.cargo.richLots.length, 1);
  assert.equal(state.player.cargo.richLots[0].qty, 8);
  const worked = richSeamOpportunityForEntity(state, asteroid);
  assert.equal(worked.state, 'worked');
  assert.equal(worked.claimedByKind, 'player');
  assert.equal(worked.resolution, 'exploit');
  assert.equal(state.player.cargo.richLots[0].richOpportunityId, worked.opportunityId);
  assert.equal(state.player.cargo.richLots[0].resolution, 'exploit');
  assert.equal(state.fieldDepletion.fields[FIELD_ID].extractedU, 16,
    'field memory records the authored 8u rock plus the 8u rich bonus');

  const cargoBefore = state.player.cargo.items.cmdty_ore_iron;
  assert.equal(claimRichSeamOpportunity(state, {
    fieldId: FIELD_ID,
    activityObjectSlotId: SLOT_ID,
    claimId: 'player-replay',
    claimedByKind: 'player',
    claimedById: player.id,
    simTime: 11,
  }), null);
  assert.equal(state.player.cargo.items.cmdty_ore_iron, cargoBefore);
  depletion.destroy();
});

test('target readout exposes the live seam and the exact rich lot carried away', () => {
  const state = opportunityState();
  const asteroid = richAsteroid();
  const opened = openOpportunity(state);
  assert.equal(richSeamTargetReadout(asteroid, state).text, 'RICH SEAM · +8u · HOT CUT');

  const carrier = {
    id: 202,
    type: 'ship',
    alive: true,
    data: {
      cargoManifest: {
        lines: [{ commodityId: 'cmdty_ore_iron', qty: 16 }],
        totalQty: 16,
        lotSource: { richOpportunityId: opened.opportunityId, richBonusU: 8 },
      },
    },
  };
  const readout = richSeamTargetReadout(carrier, state);
  assert.equal(readout.state, 'cargo');
  assert.match(readout.text, /^RICH ORE · .* ×16$/);
});

test('player rich ore keeps lot provenance through save, remove, and jettison', () => {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    rot: 0,
    vel: { x: 0, z: 0 },
  };
  const state = {
    playerId: 1,
    simTime: 5,
    player: { cargo: { items: {}, capVolume: 100, capMass: 100, usedVolume: 0, usedMass: 0 } },
    entities: new Map([[1, player]]),
  };
  const bus = createBus();
  const cargo = { ...cargoBase };
  cargo.init({ state, bus, helpers: { spawnEntity() {} } });
  assert.equal(Object.hasOwn(state.player.cargo, 'richLots'), false, 'old/default cargo shape stays unchanged');
  addCargo(state, 'cmdty_ore_iron', 8);
  const source = {
    richOpportunityId: 'rich-seam:f_ceres_1:ceres_seam_ore_clast:3',
    richBonusU: 8,
    fieldId: FIELD_ID,
    activityObjectSlotId: SLOT_ID,
    richResolution: 'exploit',
    richQty: 8,
  };
  assert.equal(addCargo(state, 'cmdty_ore_iron', 8, source), 8);
  assert.deepEqual(state.player.cargo.richLots.map((lot) => ({ id: lot.lotId, qty: lot.qty })), [
    { id: `rich-lot:${source.richOpportunityId}`, qty: 8 },
  ]);
  assert.equal(removeCargo(state, 'cmdty_ore_iron', 3), 3);
  assert.equal(state.player.cargo.richLots[0].qty, 5);

  const save = { ...saveBase, state };
  const savedCargo = save._serializeCargo();
  assert.equal(savedCargo.richLots[0].qty, 5);
  const restoredState = {
    player: { cargo: { items: {}, capVolume: 100, capMass: 100, usedVolume: 0, usedMass: 0 } },
  };
  const restoredSave = { ...saveBase, state: restoredState };
  restoredSave._restoreCargo(savedCargo);
  assert.equal(restoredState.player.cargo.richLots[0].richOpportunityId, source.richOpportunityId);
  assert.equal(restoredState.player.cargo.richLots[0].qty, 5);

  const dumped = cargo.jettison('cmdty_ore_iron', 5);
  assert.equal(dumped, 5);
  assert.equal(state.player.cargo.richLots.length, 0, 'jettison clears the removed rich lot quantity');
});

test('direct rich release preserves provenance across zero, partial, and full hold acceptance', () => {
  const makeRelease = (capVolume) => {
    const player = {
      id: 1,
      type: 'ship',
      alive: true,
      pos: { x: 0, z: 0 },
      radius: 6,
      data: { miningBeam: { tierId: 'beam_mk1', directToCargo: true } },
    };
    const asteroid = richAsteroid(70 + capVolume);
    const state = {
      ...opportunityState(10),
      playerId: player.id,
      player: { cargo: { items: {}, capVolume, capMass: 100, usedVolume: 0, usedMass: 0 } },
      entities: new Map([[player.id, player], [asteroid.id, asteroid]]),
      entityList: [player, asteroid],
      rng: () => 0,
    };
    const bus = createBus();
    const cargo = { ...cargoBase };
    cargo.init({ state, bus, helpers: { spawnEntity() {} } });
    const spawned = [];
    const mining = { ...miningBase };
    mining.init({
      state,
      bus,
      helpers: { spawnEntity(spec) { spawned.push(spec); } },
      registry: { get(name) { return name === 'cargo' ? cargo : null; } },
    });
    const data = asteroid.data;
    data._richBonusPending = 8;
    data._richLotSource = {
      richOpportunityId: `rich-seam:partial:${capVolume}`,
      richBonusU: 8,
      fieldId: FIELD_ID,
      activityObjectSlotId: SLOT_ID,
      richResolution: 'exploit',
      sourceOwner: 'player',
    };
    mining._releaseOre(asteroid, { oreTable: { cmdty_ore_iron: 1 } }, 8, player, data._richLotSource, data);
    return { state, bus, cargo, spawned };
  };

  const zero = makeRelease(0);
  assert.equal(zero.state.player.cargo.items.cmdty_ore_iron, undefined);
  assert.equal(zero.spawned.length, 1);
  assert.equal(zero.spawned[0].data.richLotSource.richQty, 8);

  const partial = makeRelease(3);
  assert.equal(partial.state.player.cargo.items.cmdty_ore_iron, 3);
  assert.equal(partial.state.player.cargo.richLots[0].qty, 3);
  assert.equal(partial.spawned.length, 1);
  assert.equal(partial.spawned[0].data.richLotSource.richQty, 5);
  partial.state.player.cargo.capVolume = 20;
  partial.cargo.recompute();
  const pickup = partial.spawned[0].data;
  partial.bus.emit('pickup:collected', {
    collectorId: partial.state.playerId,
    kind: pickup.kind,
    commodityId: pickup.commodityId,
    amount: pickup.amount,
    richLotSource: pickup.richLotSource,
  });
  assert.equal(partial.state.player.cargo.richLots[0].qty, 8);

  const full = makeRelease(20);
  assert.equal(full.state.player.cargo.items.cmdty_ore_iron, 8);
  assert.equal(full.state.player.cargo.richLots[0].qty, 8);
  assert.equal(full.spawned.length, 0);
});

test('multi-lot jettison spawns separate provenance-bearing pickups and recollects each lot', () => {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, radius: 6, vel: { x: 0, z: 0 }, rot: 0 };
  const state = {
    ...opportunityState(10),
    playerId: 1,
    player: { cargo: { items: {}, capVolume: 100, capMass: 100, usedVolume: 0, usedMass: 0 } },
    entities: new Map([[1, player]]),
  };
  const bus = createBus();
  const spawned = [];
  const cargo = { ...cargoBase };
  cargo.init({ state, bus, helpers: { spawnEntity(spec) { spawned.push(spec); } } });
  addCargo(state, 'cmdty_ore_iron', 3, { richOpportunityId: 'rich-one', richBonusU: 8, richQty: 3, richResolution: 'exploit' });
  addCargo(state, 'cmdty_ore_iron', 4, { richOpportunityId: 'rich-two', richBonusU: 8, richQty: 4, richResolution: 'help' });
  assert.equal(cargo.jettison('cmdty_ore_iron', 7), 7);
  assert.equal(spawned.length, 2);
  assert.deepEqual(spawned.map((entry) => [entry.data.richLotSource.richOpportunityId, entry.data.amount]), [
    ['rich-one', 3], ['rich-two', 4],
  ]);
  for (const entry of spawned) {
    const data = entry.data;
    bus.emit('pickup:collected', {
      collectorId: state.playerId,
      kind: data.kind,
      commodityId: data.commodityId,
      amount: data.amount,
      richLotSource: data.richLotSource,
    });
  }
  assert.deepEqual(state.player.cargo.richLots.map((lot) => [lot.richOpportunityId, lot.qty]), [
    ['rich-one', 3], ['rich-two', 4],
  ]);
});

test('worker hail exposes a reachable rich HELP action and readable work signal', () => {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 } };
  const miner = {
    id: 202,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 40, z: 0 },
    data: {
      role: 'ore_carrier',
      trafficRole: 'ore_carrier',
      activityActorSlotId: 'ceres_seam_miner',
      worldRecordId: 'ceres-miner',
      jobId: 'job:ceres-miner',
      sectorId: 'sector_ceres_belt',
      homeSectorId: 'sector_ceres_belt',
      ceresCausalPhase: 'cutting',
    },
  };
  const asteroid = richAsteroid(38);
  const state = {
    ...opportunityState(10),
    mode: 'flight',
    playerId: player.id,
    player: { targetId: miner.id },
    entities: new Map([[player.id, player], [miner.id, miner], [asteroid.id, asteroid]]),
    entityList: [player, miner, asteroid],
  };
  openOpportunity(state);
  const availability = contactHailAvailability(state);
  const offer = createContactHailOffer(state, availability, 'hail-rich', 18);
  assert.ok(offer.actions.some((action) => action.id === CONTACT_HAIL_ACTION_HELP));
  const status = createContactHailResponse(state, offer, 'status');
  assert.match(status.lines[0], /RICH SEAM/);
  const help = createContactHailResponse(state, offer, CONTACT_HAIL_ACTION_HELP);
  assert.match(help.lines[0], /^HELP · RICH SEAM/);

  const unrelated = {
    ...miner,
    id: 203,
    data: {
      ...miner.data,
      activityActorSlotId: 'other_ore_carrier',
      worldRecordId: 'other-miner',
      jobId: 'job:other-miner',
      sectorId: 'sector_other',
      homeSectorId: 'sector_other',
    },
  };
  state.entities.set(unrelated.id, unrelated);
  state.player.targetId = unrelated.id;
  const unrelatedAvailability = contactHailAvailability(state);
  assert.equal(unrelatedAvailability.richSeamHelpAvailable, false);
  const unrelatedOffer = createContactHailOffer(state, unrelatedAvailability, 'hail-other', 18);
  assert.ok(!unrelatedOffer.actions.some((action) => action.id === CONTACT_HAIL_ACTION_HELP));
});

test('station Hold escapes crafted rich-lot provenance before innerHTML', () => {
  const html = richLotReadoutHtml({
    commodityId: 'cmdty_<img src=x onerror=alert(1)>',
    qty: 7,
    richOpportunityId: 'opp" onmouseover="<script>alert(1)</script>',
    lotId: 'lot"><img src=x>',
    resolution: 'help</span><script>alert(1)</script>',
  });
  assert.match(html, /&lt;img/);
  assert.match(html, /&quot; onmouseover=/);
  assert.doesNotMatch(html, /<img\b|<script\b|onmouseover="<script/);
});

test('calving aftermath re-arms a resolved window in the same cycle; live windows still win', () => {
  const state = opportunityState();
  const strike = openOpportunity(state);
  assert.equal(strike.state, 'open');
  assert.equal(strike.attempt, 0);

  const calveArgs = {
    fieldId: FIELD_ID,
    activityObjectSlotId: SLOT_ID,
    sectorId: 'sector_ceres_belt',
    sourceEventId: 'ev_rock_calving',
    sourceCycle: 3,
    attempt: 1,
    opportunityId: `rich-seam:${FIELD_ID}:${SLOT_ID}:3:calved`,
    simTime: state.simTime,
  };
  // The calving's fresh face cannot replace the strike's still-open window.
  const refused = openRichSeamOpportunity(state, calveArgs);
  assert.equal(refused.opportunityId, strike.opportunityId);
  assert.equal(refused.sourceEventId, 'ev_rich_seam_strike');

  // Work the strike window; the calving then re-arms the seam as the fresh-face aftermath.
  const worked = claimRichSeamOpportunity(state, {
    fieldId: FIELD_ID,
    activityObjectSlotId: SLOT_ID,
    claimId: 'claim:calving-rearm',
    claimedByKind: 'player',
    resolution: 'work',
    simTime: state.simTime,
  });
  assert.equal(worked.state, 'worked');
  const rearmed = openRichSeamOpportunity(state, calveArgs);
  assert.ok(rearmed);
  assert.equal(rearmed.state, 'open');
  assert.equal(rearmed.sourceEventId, 'ev_rock_calving');
  assert.equal(rearmed.attempt, 1);

  // A repeat same-attempt open stays idempotent while the re-armed window is live.
  const again = openRichSeamOpportunity(state, calveArgs);
  assert.equal(again.opportunityId, rearmed.opportunityId);

  // Once the re-armed window expires, the NEXT cycle's primary strike supersedes the calved record.
  expireRichSeamOpportunities(state, state.simTime + 181);
  const nextStrike = openRichSeamOpportunity({ ...state, simTime: state.simTime + 182 }, {
    fieldId: FIELD_ID,
    activityObjectSlotId: SLOT_ID,
    sectorId: 'sector_ceres_belt',
    sourceEventId: 'ev_rich_seam_strike',
    sourceCycle: 4,
    simTime: state.simTime + 182,
  });
  assert.ok(nextStrike);
  assert.equal(nextStrike.state, 'open');
  assert.equal(nextStrike.sourceEventId, 'ev_rich_seam_strike');
  assert.equal(nextStrike.attempt, 0);
  assert.equal(nextStrike.sourceCycle, 4);
});
