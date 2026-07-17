/**
 * Primary natural-route acceptance contract (strategist fail-closed).
 *
 * Primary ≠ supporting. CI pair seeds and eligibility compression may only
 * produce supporting:true results. Primary matrix MUST use held-out seeds and
 * earned public carriers.
 *
 * Supporting harnesses (D10 CI pair, injection regression) may still use
 * D10_CI_SEEDS / PRIMARY_CI_SEEDS_SUPPORTING_ONLY — they call
 * validateNaturalRouteSources only when appropriate, never
 * validatePrimaryNaturalRouteSources / validatePrimaryHarnessSources.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadHeldOutSeeds,
  D10_CI_SEEDS,
  PRIMARY_NATURAL_ROUTE_FORBIDDEN,
  validatePrimaryNaturalRouteSources,
} from './naturalRoute.mjs';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** Held-out seeds only — CI pair is supporting/regression, not primary matrix. */
export function primaryMatrixSeeds() {
  const heldOut = loadHeldOutSeeds();
  if (heldOut.length < 5) {
    throw new Error(`primary matrix requires ≥5 held-out seeds; got ${heldOut.length}`);
  }
  return Object.freeze([...heldOut]);
}

/** CI pair — supporting/regression only; never primary MATRIX_SEEDS. */
export const PRIMARY_CI_SEEDS_SUPPORTING_ONLY = Object.freeze([...D10_CI_SEEDS]);

/**
 * Substrings forbidden in primary harness sources (fail-closed).
 * Superset: naturalRoute primary delta + base teleport/bus seams restated for
 * evidence / contractMeta listings.
 */
export const PRIMARY_FORBIDDEN_SOURCE_PATTERNS = Object.freeze([
  ...PRIMARY_NATURAL_ROUTE_FORBIDDEN,
  [/\bexactPos\b/, 'primary must not use exactPos oracle'],
  [/setPlayerPos\s*\(/, 'primary must not teleport via setPlayerPos'],
  [/bus\.emit\s*\(\s*['"]scan:pulse/, 'primary must not inject scan:pulse'],
  [/bus\.emit\s*\(\s*['"]salvage:completed/, 'primary must not inject salvage:completed'],
  [/bus\.emit\s*\(\s*['"]uniqueWreck:choose/, 'primary must not inject uniqueWreck:choose'],
]);

/** Allowed run-start / public context events in primary harness. */
export const PRIMARY_ALLOWED_BUS_EMITS = Object.freeze([
  'game:started', // D10 authored New Game news only
  'dock:docked', // public berth context for bar / Lost Coils offer
  'sector:enter', // public sector membership for sector-native carriers
]);

/**
 * Static fail-closed check for primary harness sources.
 * Delegates base + primary delta to validatePrimaryNaturalRouteSources, then
 * enforces seed-policy (held-out matrix; no CI pair as MATRIX_SEEDS).
 * @returns {{ pass: boolean, failures: string[], supportingForced: boolean }}
 */
export function validatePrimaryHarnessSources(sources = {}) {
  const base = validatePrimaryNaturalRouteSources(sources);
  const failures = [...(base.failures || [])];
  const strip = (value) => String(value || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[\n\r])\s*\/\/.*$/gm, '$1');
  const harness = [sources.harnessSrc, sources.checkSrc]
    .filter((v) => typeof v === 'string')
    .map(strip)
    .join('\n');

  // Primary must import this contract (single source of seed policy).
  if (harness && !/primaryNaturalRouteContract|primaryMatrixSeeds/.test(harness)) {
    failures.push('primary harness must import primaryMatrixSeeds from primaryNaturalRouteContract');
  }
  if (harness && /D10_CI_SEEDS|MATRIX_SEEDS\s*=\s*Object\.freeze\(\[\s*\.\.\.D10_CI/.test(harness)) {
    failures.push('primary matrix must not use D10_CI_SEEDS as MATRIX_SEEDS');
  }

  const pass = failures.length === 0;
  return {
    pass,
    failures: [...new Set(failures)],
    supportingForced: !pass,
  };
}

/**
 * Runtime step log classifier.
 * @param {{ name: string, detail?: object }[]} steps
 */
export function classifyPrimarySteps(steps = []) {
  const failures = [];
  const carrierSteps = [];
  for (const step of steps) {
    const name = String(step?.name || '');
    const method = String(step?.detail?.method || step?.detail?.path || '');
    if (/surfaceAuthoredPrimaryCarrier|_surfaceCanonicalRumor|moduleInventory\.push|exactPos/.test(name + method)) {
      failures.push(`forbidden primary step: ${name} ${method}`);
    }
    if (name === 'carrier-surfaced' || name === 'carrier') {
      carrierSteps.push(step);
    }
  }
  for (const c of carrierSteps) {
    const method = String(c?.detail?.method || '');
    if (method === 'surfaceAuthoredPrimaryCarrier') {
      failures.push('carrier method surfaceAuthoredPrimaryCarrier is not primary-eligible');
    }
  }
  return {
    pass: failures.length === 0,
    failures,
    carrierMethods: carrierSteps.map((c) => c?.detail?.method).filter(Boolean),
  };
}

/** Station map for authored bar wreck carriers (production bar adapter). */
export const BAR_STATION_BY_WRECK = Object.freeze({
  wreck_nestbreaker: 'station_sker',
  wreck_deepsurvey: 'station_haumea_rift',
  wreck_smokesong: 'station_reach',
  wreck_mts_silver_draft: 'station_helios',
});

/**
 * Document which public earn path each wreck uses (for evidence / skeptic).
 * Methods are production uniqueWrecks / bar adapter entry points — not injects.
 */
export const PRIMARY_CARRIER_PLAN = Object.freeze({
  wreck_choir_tender: { method: 'game:started', channel: 'news', public: true },
  wreck_dmc_ironsong: { method: 'earnSectorEnter', channel: 'comms_intercept', public: true },
  wreck_gravhand_tideline: { method: 'earnSectorEnter', channel: 'news', public: true },
  wreck_nestbreaker: { method: 'earnBarRumor', channel: 'bar', public: true },
  wreck_deepsurvey: { method: 'earnBarRumor', channel: 'bar', public: true },
  wreck_smokesong: { method: 'earnBarRumor', channel: 'bar', public: true },
  wreck_mts_silver_draft: { method: 'earnBarRumor', channel: 'bar', public: true },
  wreck_lanebreaker_pale_coil: { method: 'earnLostCoilsMission', channel: 'mission', public: true },
  wreck_isc_vigilant: { method: 'earnLossInvestigation', channel: 'loss_investigation', public: true },
  wreck_isc_lighthouse: { method: 'earnCampaignBeat', channel: 'campaign', public: true },
  wreck_choir_cassandra: { method: 'earnCampaignBeat', channel: 'campaign', public: true },
  wreck_choir_bell_aegis: { method: 'earnBarkPatrol', channel: 'bark', public: true },
});

export function contractMeta() {
  return {
    schema: 'spaceface.primaryNaturalRouteContract.v1',
    matrixSeeds: primaryMatrixSeeds(),
    minSeedsPerWreck: 5,
    forbidden: PRIMARY_FORBIDDEN_SOURCE_PATTERNS.map(([, msg]) => msg),
    carrierPlan: PRIMARY_CARRIER_PLAN,
    seedsFile: join(MODULE_DIR, 'naturalRouteSeeds.json'),
  };
}
