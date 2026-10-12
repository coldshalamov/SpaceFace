// Eight deterministic policies. They read the observation and emit flight axes plus
// player-route commands. They do not write credits, cargo, hull, or mission status.

import { clamp, unitFromSeed, wrapPi } from './rng.mjs';

export const PERSONA_IDS = Object.freeze([
  'first-time-pilot',
  'reckless-improvisor',
  'meticulous-cargo-handler',
  'mission-runner',
  'massline-stunt-pilot',
  'weak-hardware-input-stress',
  'save-continue-skeptic',
  'hostile-edge-case-explorer',
]);

const EMPTY = Object.freeze({
  moveX: 0,
  moveZ: 0,
  turnIntent: 0,
  boost: false,
  fire: false,
  fireGroup: 0,
  tether: false,
  reel: 0,
  scanPulse: false,
  brake: false,
  commands: Object.freeze([]),
});

export function getPersona(id) {
  const persona = PERSONAS[id];
  if (!persona) throw new Error(`unknown stranger persona: ${id}`);
  return persona;
}

export function listPersonas() {
  return PERSONA_IDS.map((id) => ({ id, summary: PERSONAS[id].summary }));
}

function base(extra) {
  return {
    moveX: 0,
    moveZ: 0,
    turnIntent: 0,
    boost: false,
    fire: false,
    fireGroup: 0,
    tether: false,
    reel: 0,
    scanPulse: false,
    brake: false,
    commands: [],
    ...extra,
  };
}

function turnToward(obs) {
  if (!obs.nearest) return 0;
  const desired = Math.atan2(obs.nearest.z - obs.z, obs.nearest.x - obs.x);
  return clamp(wrapPi(desired - obs.rot) / Math.PI, -1, 1);
}

function masslineJourney(obs) {
  return obs.journeyId === 'tether-attach-cut' || obs.journeyId === 'heavy-object';
}

const PERSONAS = {
  'first-time-pilot': {
    id: 'first-time-pilot',
    summary: 'Gentle thrust, rare hesitation, no weapons, tether only when the cue is the line.',
    decide(obs) {
      if ((obs.tick % 24) === 0) return base({ brake: false });
      const turn = clamp(turnToward(obs) * 0.35, -0.25, 0.25);
      return base({
        moveZ: obs.tick < 8 ? 0 : 0.65,
        turnIntent: turn,
        tether: masslineJourney(obs) && obs.tick > 12 && obs.tick < 70,
        reel: masslineJourney(obs) && obs.tetherActive && obs.tick > 40 ? -1 : 0,
        scanPulse: obs.journeyId === 'scan' && obs.tick === 15,
      });
    },
  },
  'reckless-improvisor': {
    id: 'reckless-improvisor',
    summary: 'Full throttle, boost, wide seeded turns, fires when something is close.',
    decide(obs, ctx) {
      const swing = unitFromSeed(ctx.seed, obs.tick, 2) * 2 - 1;
      const fighting = obs.journeyId === 'combat-death-retry';
      return base({
        moveZ: fighting ? (ctx.recovered ? 0.4 : 0) : 1,
        moveX: fighting ? 0 : clamp(swing, -1, 1),
        turnIntent: fighting ? turnToward(obs) : clamp(swing * 0.8 + turnToward(obs) * 0.2, -1, 1),
        boost: fighting ? false : obs.tick > 6,
        fire: fighting ? obs.tick < 3 : !!(obs.nearest && obs.nearest.dist < 80 && obs.nearest.kind !== 'station'),
        commands: fighting && obs.alive === false ? [{ type: 'recover' }] : [],
        tether: masslineJourney(obs),
        reel: masslineJourney(obs) && (obs.tick % 20) < 8 ? -1 : 0,
      });
    },
  },
  'meticulous-cargo-handler': {
    id: 'meticulous-cargo-handler',
    summary: 'Slow approach, no boost, reel when lined, buys and fits only at a berth.',
    decide(obs) {
      const dist = obs.nearest ? obs.nearest.dist : 999;
      const closing = dist > 18 ? 0.45 : 0.15;
      const commands = [];
      if (obs.journeyId === 'buy-refit' && obs.docked && obs.tick === 8) {
        commands.push({
          type: 'buy',
          stationId: 'station_helios',
          commodityId: 'cmdty_silicate',
          qty: 1,
          intentId: `stranger-buy-${obs.journeyId}`,
        });
      }
      if (obs.journeyId === 'buy-refit' && obs.docked && obs.tick === 24) {
        commands.push({
          type: 'refit',
          defId: 'mod_cargo_scanner_s',
          intentId: 'stranger-refit-scanner',
        });
      }
      if (obs.journeyId === 'mining' && dist < 40) {
        return base({
          moveZ: dist > 22 ? 0.35 : 0,
          turnIntent: turnToward(obs),
          fireGroup: 2,
          commands,
        });
      }
      if (obs.journeyId === 'docking' && obs.dockBerth) {
        const arrivalSpeed = Math.min(16, Math.max(2, (obs.dockDistToBerth || 0) * 0.5));
        return base({
          moveZ: obs.berthed || obs.speed > arrivalSpeed ? 0 : 0.15,
          brake: obs.berthed || obs.speed > arrivalSpeed,
          turnIntent: obs.berthed ? 0 : turnToward({ ...obs, nearest: obs.dockBerth }),
          commands,
        });
      }
      return base({
        moveZ: obs.journeyId === 'buy-refit' ? 0 : closing,
        turnIntent: turnToward(obs),
        tether: masslineJourney(obs) && dist < 80,
        reel: obs.tetherActive ? -1 : 0,
        commands,
      });
    },
  },
  'mission-runner': {
    id: 'mission-runner',
    summary: 'Flies the cue, accepts the visible offer, abandons when the contract will not finish.',
    decide(obs, ctx) {
      const commands = [];
      if (obs.journeyId === 'mission' && obs.missionOfferId && obs.tick === 6) {
        commands.push({ type: 'accept-mission', missionId: obs.missionOfferId });
      }
      if (obs.journeyId === 'mission' && obs.missionActiveId && obs.tick === 48) {
        const done = obs.missionTarget != null && obs.missionProgress != null
          && obs.missionProgress >= obs.missionTarget;
        if (!done) commands.push({ type: 'abandon-mission', missionId: obs.missionActiveId });
      }
      if (obs.journeyId === 'crucible-wave') {
        if (obs.runPhase === 'inactive' && obs.tick === 2) {
          commands.push({
            type: 'begin-run',
            kind: 'survival',
            seed: ctx.seed >>> 0,
            arenaId: 'helios_core',
          });
        }
        if (obs.runPhase === 'loadout') commands.push({ type: 'run-loadout-ready' });
        if (obs.runPhase === 'arena_intro') commands.push({ type: 'run-continue', event: 'run:arenaIntroComplete' });
        if (obs.runPhase === 'wave_intro') commands.push({ type: 'run-continue', event: 'run:waveIntroComplete' });
      }
      return base({
        moveZ: obs.journeyId === 'mission' || obs.journeyId === 'crucible-wave' ? 0.4 : 0.7,
        turnIntent: clamp(turnToward(obs), -0.6, 0.6),
        commands,
      });
    },
  },
  'massline-stunt-pilot': {
    id: 'massline-stunt-pilot',
    summary: 'Holds the line, strafes, and reels in a seeded orbit attempt.',
    decide(obs) {
      const orbit = Math.sin(obs.tick / 8);
      const attaching = obs.journeyId === 'tether-attach-cut';
      const holdLine = attaching
        ? (obs.tetherActive ? (obs.tick % 30) < 4 : (obs.tick % 25) < 12)
        : true;
      return base({
        moveZ: attaching ? 0.35 : 0.85,
        moveX: attaching ? 0 : clamp(orbit, -1, 1),
        turnIntent: clamp(turnToward(obs), -1, 1),
        tether: holdLine,
        tetherNearest: attaching && !obs.tetherActive,
        reel: obs.tetherActive ? -1 : 0,
        boost: !attaching && obs.tick > 20 && obs.tick < 40,
      });
    },
  },
  'weak-hardware-input-stress': {
    id: 'weak-hardware-input-stress',
    summary: 'Burst input then long gaps, as if frames and edges were dropped. Touch runs quantize further.',
    decide(obs, ctx) {
      const burst = (obs.tick % 17) < 3;
      if (!burst) return base({});
      const chatter = unitFromSeed(ctx.seed, obs.tick, 9) > 0.5 ? 1 : -1;
      return base({
        moveZ: chatter > 0 ? 1 : 0,
        moveX: chatter,
        turnIntent: chatter,
        fire: obs.journeyId === 'combat-death-retry',
        fireGroup: obs.journeyId === 'mining' ? 2 : 0,
        scanPulse: obs.journeyId === 'scan' && obs.tick === 3,
        tether: masslineJourney(obs),
      });
    },
  },
  'save-continue-skeptic': {
    id: 'save-continue-skeptic',
    summary: 'Flies, requests a gate jump, then saves and continues from that envelope.',
    decide(obs) {
      const commands = [];
      if (obs.journeyId === 'save-continue' && obs.tick === 12) {
        commands.push({
          type: 'jump',
          targetSectorId: 'sector_ceres_belt',
          via: 'gate',
        });
      }
      if (obs.journeyId === 'save-continue' && obs.sectorId === 'sector_ceres_belt' && obs.jumpState !== 'CHARGING' && obs.jumpState !== 'JUMPING') {
        commands.push({ type: 'save', slot: 'stranger' });
        commands.push({ type: 'continue', slot: 'stranger' });
      }
      return base({
        moveZ: obs.tick < 30 ? 0.7 : 0.2,
        turnIntent: 0.1,
        commands,
      });
    },
  },
  'hostile-edge-case-explorer': {
    id: 'hostile-edge-case-explorer',
    summary: 'Contradictory axes, repeated buys, missing mission ids, scan spam, dock probe while far.',
    decide(obs, ctx) {
      const commands = [];
      if (obs.journeyId === 'buy-refit' && obs.tick === 10) {
        const buy = {
          type: 'buy',
          stationId: 'station_helios',
          commodityId: 'cmdty_silicate',
          qty: 1,
          intentId: 'stranger-hostile-buy',
        };
        commands.push(buy, { ...buy });
      }
      if (obs.journeyId === 'mission' && obs.tick === 4) {
        commands.push({ type: 'accept-mission', missionId: 'stranger-missing-offer' });
      }
      if (obs.journeyId === 'mission' && obs.missionOfferId && obs.tick === 8) {
        commands.push({ type: 'accept-mission', missionId: obs.missionOfferId });
      }
      if (obs.journeyId === 'docking' && obs.tick === 5) {
        commands.push({ type: 'probe-dock' });
      }
      if (obs.journeyId === 'combat-death-retry' && obs.alive === false) {
        commands.push({ type: 'recover' });
      }
      const flip = unitFromSeed(ctx.seed, obs.tick, 4) > 0.5 ? 1 : -1;
      return base({
        moveX: flip,
        moveZ: -flip,
        turnIntent: flip,
        boost: true,
        brake: true,
        fire: true,
        fireGroup: obs.journeyId === 'mining' ? 2 : 0,
        scanPulse: obs.journeyId === 'scan',
        tether: true,
        reel: flip,
        commands,
      });
    },
  },
};

export function emptyAction() {
  return { ...EMPTY, commands: [] };
}
