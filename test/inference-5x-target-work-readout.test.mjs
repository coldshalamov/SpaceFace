/**
 * U5 — target panel living-work readout on ordinary Tab-lock path.
 * Drives targetIntelReadout (shipped pure function consumed by createTargetPanel).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { targetIntelReadout } from '../src/ui/targetPanel.js';

function entity(id, overrides = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 100, z: 0 },
    vel: { x: 0, z: 0 },
    hull: 100,
    hullMax: 100,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    ...overrides,
    data: { ...(overrides.data || {}) },
  };
}

test('U5: targetIntelReadout includes workStatus from causal stamps', () => {
  const player = entity('player', { team: 1, data: {} });
  const target = entity('miner', {
    team: 2,
    data: {
      trafficRole: 'miner',
      ceresCausalEventId: 'ev_rich_seam_strike',
      ceresCausalPhase: 'strike',
      ceresCausalCue: 'blind_cone',
      ai: { passive: true },
    },
  });
  const state = { playerId: 'player', player: { team: 1 }, entities: new Map() };
  const intel = targetIntelReadout(target, player, state, 400);
  assert.ok(intel);
  // Lock surface is phase-only; hail STATUS carries tactical means.
  assert.equal(intel.workStatus, 'WORK · RICH STRIKE');
  assert.ok(intel.intent);
  assert.ok(intel.motive);
});

test('U5: no work stamp → workStatus null (no false WORK line)', () => {
  const player = entity('player', { team: 1, data: {} });
  const target = entity('raider', {
    team: 0,
    data: { ai: { huntPlayer: true } },
  });
  const intel = targetIntelReadout(target, player, { playerId: 'player' }, 200);
  assert.equal(intel.workStatus, null);
});

test('U5: salvage stack phase is readable on lock-on', () => {
  const player = entity('player', { team: 1, data: {} });
  const salvor = entity('salvor', {
    team: 2,
    data: {
      trafficRole: 'salvor',
      ceresCausalPhase: 'stack',
      ceresCausalCue: 'spilling_the_count',
      ceresCausalEventId: 'ev_cutter_strips_wreck',
      ai: { passive: true },
    },
  });
  const intel = targetIntelReadout(salvor, player, { playerId: 'player' }, 800);
  assert.equal(intel.workStatus, 'WORK · STACKING SALVAGE');
});

test('disabled Ceres hauler advertises recovery need on the ordinary target panel', () => {
  const player = entity('player', { team: 1, data: {} });
  const worldRecordId = 'wr_convoy_disabled_hauler';
  const manifestId = 'fm_disabled_hauler';
  const handoffId = 'ceres-handoff:disabled-hauler';
  const rootLotId = 'ceres-root:disabled-hauler';
  const hauler = entity('hauler', {
    team: 2,
    data: {
      trafficRole: 'hauler',
      worldRecordId,
      jobId: `job:${worldRecordId}`,
      activityActorSlotId: 'ceres_refinery_hauler',
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      ceresCausalEventId: 'ev_disabled_hauler_recovery',
      ceresCausalPhase: 'distress',
      ceresCausalCue: 'breaking_the_pattern',
      cargoManifest: {
        manifestId,
        freighterKey: worldRecordId,
        role: 'hauler',
        lines: [{ commodityId: 'cmdty_ore_iron', qty: 8 }],
        totalQty: 8,
        lotId: 'lot_disabled_hauler',
        lotSource: { rootLotId, handoffId, transferSeq: 1 },
        custody: {
          holderKind: 'traffic', holderId: worldRecordId,
          acquiredBy: 'traffic:ceresMinerHaulerHandoff', handoffId, transferSeq: 1, rootLotId,
        },
      },
      ceresDisabledHauler: {
        schema: 'spaceface.ceresDisabledHaulerRecovery.v1',
        incidentId: 'ceres-disabled-hauler:test',
        manifestId,
      },
      ai: { passive: true },
    },
  });
  const state = {
    playerId: 'player',
    world: { currentSectorId: 'sector_ceres_belt' },
    traffic: { ceresMinerHaulerHandoff: {
      schema: 'spaceface.ceresMinerHaulerHandoff.v1',
      handoffId,
      rootLotId,
      state: 'in_transit',
      haulerWorldRecordId: worldRecordId,
      transferredQty: 8,
      deliveredQty: 0,
      transferSeq: 1,
    }, ceresDisabledHaulerIncident: {
      schema: 'spaceface.ceresDisabledHaulerRecovery.v1',
      incidentId: 'ceres-disabled-hauler:test',
      handoffId,
      rootLotId,
      state: 'distress',
      choice: null,
      haulerWorldRecordId: worldRecordId,
      manifestId,
      manifest: structuredClone(hauler.data.cargoManifest),
      responseAtSimT: 30,
    } },
    combat: { entities: { [hauler.id]: {
      capabilities: { drive: false },
      subsystems: { subsystem_drive: { effectiveDisabled: true } },
    } } },
  };
  const intel = targetIntelReadout(hauler, player, state, 350);
  assert.equal(intel.workStatus, 'DISTRESS · DRIVE DISABLED');
  assert.equal(intel.recoveryPrompt, 'HAIL · RECOVER / STEAL / ABANDON');
  assert.equal(intel.motive, 'NONCOMBATANT');
});

test('serviced Ceres miner reads from the persisted incident plus combat truth on the ordinary target panel', () => {
  const player = entity('player', { team: 1, data: {} });
  const miner = entity('miner-service', {
    team: 2,
    data: {
      trafficRole: 'ore_carrier',
      worldRecordId: 'wr_convoy_service_miner',
      jobId: 'job:wr_convoy_service_miner',
      activityActorSlotId: 'ceres_seam_miner',
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      ceresCausalEventId: 'ev_tender_services_miner',
      ceresCausalPhase: 'work',
      ceresCausalCue: 'hull_open',
      ai: { passive: true },
    },
  });
  const state = {
    playerId: 'player',
    world: { currentSectorId: 'sector_ceres_belt' },
    traffic: {
      ceresTenderServiceIncident: {
        schema: 'spaceface.ceresTenderServiceIncident.v1',
        incidentId: 'ceres-tender-service:wr_npc_service_tender:wr_convoy_service_miner:1',
        sequence: 1,
        tenderWorldRecordId: 'wr_npc_service_tender',
        minerWorldRecordId: miner.data.worldRecordId,
        state: 'holding',
      },
    },
    combat: {
      entities: {
        [miner.id]: {
          subsystems: { subsystem_drive: { destroyed: true, effectiveDisabled: true } },
        },
      },
    },
    entities: new Map([[miner.id, miner]]),
  };
  const intel = targetIntelReadout(miner, player, state, 350);
  assert.equal(intel.workStatus, 'WORK · SERVICE HOLD');
});
