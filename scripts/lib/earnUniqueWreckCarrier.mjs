/**
 * Primary-matrix earn-carrier dispatch over uniqueWrecks public earn* APIs.
 *
 * Primary path MUST NOT call surfaceAuthoredPrimaryCarrier. Use these helpers
 * (or the methods on uniqueWrecks directly) after sector/dock/game context is set.
 *
 * @see docs/evidence/orchestration/returns/G_EARN_CARRIER.md
 * @see scripts/lib/primaryNaturalRouteContract.mjs PRIMARY_CARRIER_PLAN
 */
import {
  BAR_STATION_BY_WRECK,
  PRIMARY_CARRIER_PLAN,
} from './primaryNaturalRouteContract.mjs';

/**
 * @param {object} system uniqueWrecks system instance (registry.get('uniqueWrecks'))
 * @param {object} def unique wreck def (uniqueWreckById)
 * @param {{ bus?: { emit: Function } }} [ctx] optional session/bus for D10 game:started
 * @returns {object|null} bearing record when earned, or bearings map for sector enter
 */
export function earnPrimaryCarrier(system, def, ctx = {}) {
  if (!system || !def || !def.id) {
    throw new Error('earnPrimaryCarrier requires uniqueWrecks system and wreck def');
  }
  const plan = PRIMARY_CARRIER_PLAN[def.id];
  const method = plan && plan.method;

  switch (def.id) {
    case 'wreck_choir_tender': {
      // Sanctioned New Game news path only.
      if (ctx.bus && typeof ctx.bus.emit === 'function') {
        ctx.bus.emit('game:started');
      } else if (typeof system._onGameStarted === 'function') {
        system._onGameStarted();
      } else {
        throw new Error('D10 earn requires bus.emit(game:started) or _onGameStarted');
      }
      break;
    }
    case 'wreck_dmc_ironsong':
    case 'wreck_gravhand_tideline': {
      if (typeof system.earnSectorEnter !== 'function') {
        throw new Error('uniqueWrecks.earnSectorEnter missing');
      }
      system.earnSectorEnter(def.sectorId);
      break;
    }
    case 'wreck_nestbreaker':
    case 'wreck_deepsurvey':
    case 'wreck_smokesong':
    case 'wreck_mts_silver_draft': {
      const stationId = BAR_STATION_BY_WRECK[def.id];
      if (!stationId) throw new Error(`no bar station for ${def.id}`);
      if (typeof system.earnBarRumor !== 'function') {
        throw new Error('uniqueWrecks.earnBarRumor missing');
      }
      system.earnBarRumor(stationId);
      break;
    }
    case 'wreck_lanebreaker_pale_coil': {
      if (typeof system.earnLostCoilsMission !== 'function') {
        throw new Error('uniqueWrecks.earnLostCoilsMission missing');
      }
      system.earnLostCoilsMission();
      break;
    }
    case 'wreck_isc_vigilant': {
      if (typeof system.earnLossInvestigation !== 'function') {
        throw new Error('uniqueWrecks.earnLossInvestigation missing');
      }
      system.earnLossInvestigation();
      break;
    }
    case 'wreck_isc_lighthouse':
    case 'wreck_choir_cassandra': {
      if (typeof system.earnCampaignBeat !== 'function') {
        throw new Error('uniqueWrecks.earnCampaignBeat missing');
      }
      system.earnCampaignBeat(def.id);
      break;
    }
    case 'wreck_choir_bell_aegis': {
      if (typeof system.earnBarkPatrol !== 'function') {
        throw new Error('uniqueWrecks.earnBarkPatrol missing');
      }
      system.earnBarkPatrol();
      break;
    }
    default:
      throw new Error(`no primary earn path for ${def.id} (method=${method || 'n/a'})`);
  }

  const bearings = system.state
    && system.state.player
    && system.state.player.uniqueWrecks
    && system.state.player.uniqueWrecks.bearings;
  return (bearings && bearings[def.id]) || null;
}

/**
 * Public survey-suite equip for scan-gated wrecks (D1 Vigilant / D4 Pale-Coil).
 * Accepts wreck def or module id string. Uses ships.grantModule / owned fittings.
 */
export function equipSurveySuiteIfNeeded(system, defOrModuleId = 'mod_survey_suite') {
  if (!system || typeof system.equipSurveySuiteIfNeeded !== 'function') {
    throw new Error('uniqueWrecks.equipSurveySuiteIfNeeded missing');
  }
  const moduleId = typeof defOrModuleId === 'string'
    ? defOrModuleId
    : (defOrModuleId && defOrModuleId.scanRequirement) || null;
  if (!moduleId) return { equipped: false, method: null };
  return system.equipSurveySuiteIfNeeded(moduleId);
}

export function earnMethodForWreck(wreckId) {
  const plan = PRIMARY_CARRIER_PLAN[wreckId];
  return plan ? plan.method : null;
}
