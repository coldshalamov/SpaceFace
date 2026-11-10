// Browser-safe journey world. Node and the Chrome tape host share this setup.
// No node: builtins. The massline lab controller stays out of this module.

import {
  collisionProxyIdForStation,
  resolveBerthWorld,
  resolveCorridorAxisWorld,
  resolveCollisionProxyManifest,
} from '../../../../src/data/collisionProxyManifests.js';
import { laneInputWrite } from '../../../../src/core/simLaneCommands.js';
import { commitDockedUiState } from '../../../../src/ui/dockStateCommit.js';
import { redactString } from './redact.mjs';

export const HOME_SECTOR = 'sector_helios_prime';

export function applyAction(state, grammar, frame, dt) {
  const player = state.entities.get(state.playerId);
  const rot = player && Number.isFinite(player.rot) ? player.rot : 0;
  const origin = player && player.pos ? player.pos : { x: 0, z: 0 };
  const attached = !!(state.player && state.player.tether && state.player.tether.active);
  state.input = state.input || {};
  state.input.moveX = frame.moveX;
  state.input.moveZ = frame.moveZ;
  state.input.turnIntent = frame.turnIntent;
  state.input.boost = frame.boost;
  state.input.fire = frame.fire;
  state.input.brake = frame.brake;
  state.input.fireGroup = frame.fireGroup;
  state.input.aimAngle = rot;
  state.input.keys = {
    KeyW: frame.moveZ > 0.2,
    KeyS: frame.moveZ < -0.2,
    KeyD: frame.moveX > 0.2,
    KeyA: frame.moveX < -0.2,
    ShiftLeft: frame.boost,
    KeyF: frame.tether,
    KeyQ: frame.reel < 0,
    KeyE: frame.reel > 0,
  };
  state.input.aimWorld = {
    x: origin.x + Math.cos(rot) * 1000,
    z: origin.z + Math.sin(rot) * 1000,
  };
  state.input.actions = state.input.actions || {};
  state.input.actions.reelDelta = frame.reel;
  state.input.actions.scanPulse = frame.scanPulse;
  const packet = grammar.step(dt, {
    held: frame.tether,
    attached,
    lineLength: frame.reel,
    orbitDirection: frame.turnIntent,
  });
  state.input.actions.massline = packet ? { ...packet } : null;
  // The input system is the owner that publishes grammar edges. This host has no DOM
  // keyboard, so it publishes the same edges the input owner writes from that grammar.
  state.input.actions.tetherFire = !!(packet && packet.latch);
  state.input.actions.tetherCut = !!(packet && packet.cut);
  state.input.tetherMode = packet && packet.latch && frame.tetherNearest ? 'nearest' : null;
}

export async function runCommands(runtime, commands, tick, held) {
  const notes = [];
  for (const command of commands || []) {
    notes.push(await runCommand(runtime, command, tick, held));
  }
  return notes;
}

async function runCommand(runtime, command, tick, held) {
  const state = runtime.state;
  try {
    if (command.type === 'buy') return buy(runtime, command, tick);
    if (command.type === 'refit') return refit(runtime, command, tick);
    if (command.type === 'accept-mission') return acceptMission(runtime, command, tick);
    if (command.type === 'abandon-mission') return abandonMission(runtime, command, tick);
    if (command.type === 'jump') return requestJump(runtime, command, tick);
    if (command.type === 'save') {
      if (held.saved) return { type: 'save', tick, ok: true, skipped: true };
      const note = saveSlot(runtime, command, tick, held);
      if (note.ok) held.saved = true;
      held.savedTick = tick;
      return note;
    }
    if (command.type === 'continue') {
      if (held.continued) return { type: 'continue', tick, ok: true, skipped: true };
      if (!held.envelope || held.savedTick === tick) {
        return { type: 'continue', tick, ok: false, skipped: true, reason: 'wait-for-save' };
      }
      held.continued = true;
      return continueSlot(runtime, command, tick, held);
    }
    if (command.type === 'begin-run') {
      runtime.bus.emit('run:beginRequested', {
        kind: command.kind || 'survival',
        seed: command.seed,
        arenaId: command.arenaId || null,
      });
      return { type: command.type, tick, ok: !!(state.run && state.run.phase && state.run.phase !== 'inactive') };
    }
    if (command.type === 'run-loadout-ready') {
      if (held.loadoutReady) return { type: command.type, tick, ok: true, skipped: true };
      held.loadoutReady = true;
      runtime.bus.emit('run:loadoutReady', {});
      return { type: command.type, tick, ok: true };
    }
    if (command.type === 'run-continue' && command.event) {
      const run = state.run || {};
      const key = `${run.phase}|${run.wave}|${command.event}`;
      held.continues = held.continues || new Set();
      if (held.continues.has(key)) return { type: command.type, tick, ok: true, skipped: true };
      held.continues.add(key);
      runtime.bus.emit(command.event, {});
      return { type: command.type, tick, ok: true, event: command.event };
    }
    if (command.type === 'undock') {
      const docked = !!(state.ui && state.ui.docked);
      if (!docked) return { type: 'undock', tick, ok: false, reason: 'not-docked' };
      // Same committed payload the station undock control emits. uiRoot is not in this
      // headless bundle, so the flag clear that handler owns is applied here.
      runtime.bus.emit('dock:undocked', { committed: true, intent: 'explicit', source: 'sx-dock' });
      laneInputWrite(state, 'ui.docked', false);
      laneInputWrite(state, 'ui.dockedStationId', null);
      const combat = runtime.getSystem('combat');
      if (combat && typeof combat.setPlayerDocked === 'function') combat.setPlayerDocked(false);
      return { type: 'undock', tick, ok: true };
    }
    if (command.type === 'recover') {
      const combat = runtime.getSystem('combat');
      const result = combat && typeof combat.recoverPendingPlayer === 'function'
        ? combat.recoverPendingPlayer({})
        : { ok: false, reason: 'no-combat' };
      return { type: command.type, tick, ok: !!(result && result.ok), reason: result && result.reason };
    }
    if (command.type === 'probe-dock') {
      const corridor = state.dockingCorridor || null;
      const berthed = !!(corridor && corridor.berthed);
      if (!berthed) {
        return {
          type: 'probe-dock',
          tick,
          ok: false,
          berthed: false,
          docked: !!(state.ui && state.ui.docked),
          refused: true,
          reason: 'not-at-berth',
        };
      }
      const stationId = corridor.stationId || 'station_helios';
      const committed = commitDockedUiState(state, {
        stationId,
        shipId: state.playerId,
        source: 'stranger-probe',
      }, runtime.bus);
      return {
        type: 'probe-dock',
        tick,
        ok: committed === true,
        berthed: true,
        docked: !!(state.ui && state.ui.docked),
        stationId,
      };
    }
    return { type: command.type || 'unknown', tick, ok: false, reason: 'unknown-command' };
  } catch (error) {
    return {
      type: command.type || 'unknown',
      tick,
      ok: false,
      reason: 'threw',
      error: redactString(error && error.message || String(error)),
    };
  }
}

function buy(runtime, command, tick) {
  const economy = runtime.getSystem('economy');
  const state = runtime.state;
  const before = state.player.credits;
  const result = economy.execute(
    command.stationId,
    command.commodityId,
    'buy',
    command.qty || 1,
    { intentId: command.intentId },
  );
  const after = state.player.credits;
  const charged = Number.isFinite(before) && Number.isFinite(after) && after < before - 0.001;
  return {
    type: 'buy',
    tick,
    intentId: command.intentId || null,
    ok: !!(result && result.ok),
    duplicate: !!(result && result.duplicate),
    total: result && Number.isFinite(result.total) ? result.total : 0,
    charged: !!(result && result.ok && charged && !result.duplicate),
    refused: !(result && result.ok),
    reason: result && result.reason || null,
  };
}

function refit(runtime, command, tick) {
  const state = runtime.state;
  const before = state.player.credits;
  runtime.bus.emit('ui:buyModule', { defId: command.defId });
  const after = state.player.credits;
  const charged = Number.isFinite(before) && Number.isFinite(after) && after < before - 0.001;
  return {
    type: 'refit',
    tick,
    intentId: command.intentId || command.defId,
    ok: charged,
    duplicate: false,
    total: charged ? before - after : 0,
    charged,
    refused: !charged,
  };
}

function acceptMission(runtime, command, tick) {
  const missions = runtime.getSystem('missions');
  const ok = !!(missions && missions.acceptMission(command.missionId));
  const active = runtime.state.missions && runtime.state.missions.active
    ? runtime.state.missions.active.find((mission) => mission && mission.status === 'active')
    : null;
  const objectiveMet = !!(active && active.objectiveTarget != null
    && active.objectiveProgress >= active.objectiveTarget);
  return {
    type: 'accept-mission',
    tick,
    missionId: command.missionId,
    ok,
    objectiveMet,
  };
}

function abandonMission(runtime, command, tick) {
  const missions = runtime.getSystem('missions');
  if (missions && typeof missions.abandonMission === 'function') {
    missions.abandonMission(command.missionId);
  } else {
    runtime.bus.emit('ui:abandonMission', { missionId: command.missionId });
  }
  return { type: 'abandon-mission', tick, missionId: command.missionId, ok: true };
}

function requestJump(runtime, command, tick) {
  runtime.bus.emit('world:requestJump', {
    targetSectorId: command.targetSectorId,
    via: command.via || 'gate',
  });
  const jump = runtime.state.jump || {};
  return {
    type: 'jump',
    tick,
    ok: jump.state === 'CHARGING' || jump.state === 'JUMPING',
    jumpState: jump.state || null,
    targetSectorId: jump.targetSectorId || command.targetSectorId,
  };
}

function saveSlot(runtime, command, tick, held) {
  const save = runtime.getSystem('save');
  if (!save || typeof save.serialize !== 'function') {
    return { type: 'save', tick, ok: false, reason: 'no-save-system' };
  }
  const envelope = save.serialize(command.slot || 'stranger');
  held.envelope = envelope;
  return { type: 'save', tick, ok: !!envelope, snapshot: poseSnapshot(runtime.state) };
}

async function continueSlot(runtime, command, tick, held) {
  const save = runtime.getSystem('save');
  if (!save || typeof save.loadEnvelope !== 'function' || !held.envelope) {
    return { type: 'continue', tick, ok: false, reason: held.envelope ? 'no-save-system' : 'no-envelope' };
  }
  await save.loadEnvelope(held.envelope, command.slot || 'stranger');
  return { type: 'continue', tick, ok: true, snapshot: poseSnapshot(runtime.state) };
}

function poseSnapshot(state) {
  const player = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
  return {
    sectorId: state.world && state.world.currentSectorId || null,
    credits: state.player && Number.isFinite(state.player.credits) ? state.player.credits : null,
    x: player && player.pos ? player.pos.x : null,
    z: player && player.pos ? player.pos.z : null,
    simTime: state.simTime,
  };
}

export async function prepareJourney(runtime, journey, aliasMap) {
  const state = runtime.state;
  if (journey.id === 'combat-death-retry') {
    state.world.currentSectorId = 'sector_ceres_belt';
    // The opening ten minutes of a new career cap simultaneous shooters. This fixture is
    // a combat route, not that opening, so it starts after the cap the way a later sortie does.
    state.simTime = 601;
    // Authored combat fixture. Hostility, response window, and attack activity are the
    // same fields the live encounter producer writes. The player is not pre-wrecked.
    for (const spec of journey.entities.filter((row) => row.role === 'hostile')) {
      const enemy = state.entities.get(aliasMap[spec.alias]);
      enemy.data.encounter = { id: 'stranger_combat_fixture' };
      Object.assign(enemy.data.ai, {
        passive: false, lawful: false, roe: 'weapons_free', hostileTeams: [0], huntPlayer: true,
        motive: 'hostile_training_encounter', engagementTrigger: 'player_attack',
        zoneId: 'stranger_combat_fixture', approachTelegraph: 'rail_lance_charge',
        noFireResponseWindowS: 2,
        retaliationTargetId: state.playerId,
        factionPresenceDoctrine: null,
      });
    }
  }
  if (journey.id === 'launch') {
    const station = spawnHelios(runtime, aliasMap);
    placeOnBerth(state, station);
    state.ui = state.ui || {};
    laneInputWrite(state, 'ui.docked', true);
    laneInputWrite(state, 'ui.dockedStationId', 'station_helios');
  }
  if (journey.setup === 'station-counter') {
    state.ui = state.ui || {};
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_helios';
    state.player.credits = 25000;
    const economy = runtime.getSystem('economy');
    if (economy && typeof economy.ensureMarket === 'function') {
      economy.ensureMarket('station_helios');
    }
  }
  if (journey.setup === 'mission-board') {
    state.player.credits = Math.max(state.player.credits || 0, 25000);
    const missions = runtime.getSystem('missions');
    if (missions && typeof missions.ensureBoard === 'function') {
      const board = missions.ensureBoard('station_helios');
      const sectorId = state.world && state.world.currentSectorId || HOME_SECTOR;
      if (board && Array.isArray(board.slots)) {
        board.slots.unshift(strangerReconOffer(sectorId), strangerUnfinishableOffer(sectorId));
      }
    }
  }
  if (journey.setup === 'tether-rock' || journey.setup === 'mining') {
    runtime.spawn({
      type: 'asteroid',
      pos: { x: 0, z: 28 },
      vel: { x: 0, z: 0 },
      radius: 8,
      mass: 400,
      collides: true,
      hull: 80,
      hullMax: 80,
      data: { typeId: 'ast_common_rock', oreHP: 40, oreHPMax: 40 },
    });
  }
  if (journey.setup === 'docking') {
    const station = spawnHelios(runtime, aliasMap);
    placeOnApproach(state, station);
  }
  if (journey.setup === 'sector-home' && state.world) {
    state.world.currentSectorId = HOME_SECTOR;
  }
}

function spawnHelios(runtime, aliasMap) {
  const proxy = collisionProxyIdForStation('station_helios') || 'station_ring_hub';
  const station = runtime.spawn({
    type: 'station',
    factionId: 'faction_scn',
    pos: { x: 0, z: 220 },
    radius: 42,
    mass: 1e6,
    hull: 1e6,
    hullMax: 1e6,
    collides: true,
    alive: true,
    data: {
      stationId: 'station_helios',
      stationTypeId: 'trade_hub',
      dockRadius: 90,
      collisionRadius: 42,
      collisionProxy: proxy,
      corridorBearingDeg: 180,
      services: ['trade', 'shipyard', 'refuel', 'repair', 'missions'],
      name: 'Helios Station',
      size: 'L',
      sectorId: HOME_SECTOR,
    },
  });
  aliasMap.station = station.id;
  return station;
}

function strangerReconOffer(sectorId) {
  return {
    id: 'stranger-recon',
    type: 'recon_scan',
    stationId: 'station_helios',
    destStationId: 'station_helios',
    destSectorId: sectorId,
    title: 'Pulse this sector',
    reward_cr: 100,
    collateral_cr: 0,
    duration_s: 1000,
    riskTier: 0,
    params: { scanTargets: 1 },
  };
}

function strangerUnfinishableOffer(sectorId) {
  return {
    id: 'stranger-unfinishable',
    type: 'bounty_hunt',
    stationId: 'station_helios',
    destStationId: 'station_helios',
    destSectorId: sectorId,
    title: 'A mark that is not in this window',
    reward_cr: 50,
    collateral_cr: 0,
    duration_s: 1000,
    riskTier: 0,
    params: {},
  };
}

function placeOnBerth(state, station) {
  const player = state.entities.get(state.playerId);
  if (!player) return;
  const manifest = resolveCollisionProxyManifest(station);
  if (!manifest) return;
  const berth = resolveBerthWorld(station, manifest);
  const axis = resolveCorridorAxisWorld(station, manifest);
  player.pos.x = berth.x;
  player.pos.z = berth.z;
  player.vel.x = 0;
  player.vel.z = 0;
  player.rot = Math.atan2(axis.z, axis.x);
}

function placeOnApproach(state, station) {
  const player = state.entities.get(state.playerId);
  if (!player) return;
  const manifest = resolveCollisionProxyManifest(station);
  if (!manifest) return;
  const berth = resolveBerthWorld(station, manifest);
  const axis = resolveCorridorAxisWorld(station, manifest);
  player.pos.x = berth.x + axis.x * 40;
  player.pos.z = berth.z + axis.z * 40;
  player.rot = Math.atan2(-axis.z, -axis.x);
}

export function attachLines(runtime, aliasMap, attachments) {
  const actions = runtime.getSystem('actions');
  const kernel = actions && actions.kernel;
  if (!kernel || !kernel.attachments) throw new Error('attachment kernel missing');
  const state = runtime.state;
  for (const attachment of attachments) {
    const owner = state.entities.get(aliasMap[attachment.ownerAlias]);
    const target = state.entities.get(aliasMap[attachment.targetAlias]);
    const created = kernel.attachments.create({
      defId: 'tether_standard',
      ownerId: owner.id,
      targetId: target.id,
      sourceWorld: { x: owner.pos.x, y: 0, z: owner.pos.z },
      targetWorld: { x: target.pos.x, y: 0, z: target.pos.z },
    });
    if (!created || !created.ok || !created.attachment) {
      throw new Error(`attachment create failed (${created && created.reason})`);
    }
    if (owner.id === state.playerId) {
      state.player.tether = {
        ...(state.player.tether || {}),
        active: true,
        targetId: target.id,
        attachmentId: created.attachment.id,
        restLength: created.attachment.restLength,
        strain: 0,
        load: 0,
        phase: 'loaded',
      };
    }
  }
}
