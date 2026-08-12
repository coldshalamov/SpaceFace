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
import { mining as miningBase, RICH_SEAM_HEAT_MULT } from '../src/systems/mining.js';
import { richSeamTargetReadout } from '../src/ui/targetPanel.js';

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
  const worked = richSeamOpportunityForEntity(state, asteroid);
  assert.equal(worked.state, 'worked');
  assert.equal(worked.claimedByKind, 'player');
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
