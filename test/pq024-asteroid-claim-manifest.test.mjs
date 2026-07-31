import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import manifest, {
  createPq024AsteroidClaimManifest,
  PQ024_ASTEROID_CLAIM_FIXED_SEED,
} from '../scripts/validation-manifests/pq024-asteroid-claim.mjs';

const PROBE_URL = new URL('../scripts/probe-pq024-asteroid-claim.mjs', import.meta.url);
const BROKER_CLI_URL = new URL('../scripts/validation-broker-cli.mjs', import.meta.url);

test('PQ-024 broker manifest binds one acceptance launch to the queue-listed headless gates', () => {
  const fresh = createPq024AsteroidClaimManifest();
  assert.equal(manifest.id, 'pq024-asteroid-claim');
  assert.equal(fresh.id, manifest.id);
  assert.equal(fresh.runtimeKind, 'browser');
  assert.equal(fresh.mode, 'acceptance');
  assert.equal(fresh.command, process.execPath);
  assert.deepEqual(fresh.commandArgs, ['scripts/probe-pq024-asteroid-claim.mjs']);
  assert.deepEqual(fresh.fastGateCommands, [
    'npm run check:pq024:survey-claim',
    'node --test test/asteroid-sites.test.mjs',
    'npm run check:sim:compare',
  ]);
  assert.equal(fresh.maxLaunchesPerCandidate, 1);
  assert.equal(fresh.requireBrokerClaim, true);
  assert.equal(fresh.cleanupPolicy, 'kill-tree');
  assert.equal(fresh.fixedSeed, PQ024_ASTEROID_CLAIM_FIXED_SEED);
  assert.match(String(fresh.artifactRoot), /pq024-asteroid-claim/);

  for (const required of [
    'test/pq024-asteroid-claim-manifest.test.mjs',
    'test/pq024-survey-claim.test.mjs',
    'test/asteroid-sites.test.mjs',
  ]) {
    assert.ok(fresh.regressionSourcePaths.includes(required), `missing regression dependency ${required}`);
  }
  for (const required of [
    'src/systems/asteroidSites.js',
    'src/systems/drill.js',
    'src/systems/economy.js',
    'src/save/saveSystem.js',
    'src/ui/asteroid/asteroidScreen.js',
    'src/ui/asteroid/asteroidController.js',
    'src/ui/station/screens/market.js',
  ]) {
    assert.ok(fresh.productionSourcePaths.includes(required), `missing production dependency ${required}`);
  }
});

test('PQ-024 probe preserves the public route and observes owner-produced terminal truth', () => {
  const source = readFileSync(PROBE_URL, 'utf8');

  for (const publicSeam of [
    "page.keyboard.type('Helios Station')",
    '.sf-alert--dock',
    '[data-market-search]',
    '[data-cmdty="${item.commodityId}"]',
    '.sx-qty__in',
    '[data-go]',
    'button.st-undock',
    "page.keyboard.press('KeyM')",
    '_lastClickTargets',
    "page.keyboard.press('Space')",
    "page.keyboard.press('KeyB')",
    '.ao-survey',
    '[data-item-id="${defId}"]',
    "page.keyboard.press('Enter')",
    "page.keyboard.press('F5')",
    'page.reload(',
    "name: 'Continue'",
  ]) {
    assert.ok(source.includes(publicSeam), `probe must retain public seam ${publicSeam}`);
  }

  const orderedMilestones = [
    'buyConstructionCargo(page)',
    'selectAsteroidOnLocalMap(page)',
    'pulseSurveyReveal(page)',
    "placeSiteMachine(page, 'sm_massline_core'",
    "placeSiteMachine(page, 'sm_extractor'",
    'waitForPositiveProduction(page',
    'assertExactlyOneExteriorRelay(page',
    'quickSave(page)',
    'coldContinue(page',
    'reenterAsteroidOps(page',
  ];
  let cursor = -1;
  for (const milestone of orderedMilestones) {
    const next = source.indexOf(milestone, cursor + 1);
    assert.ok(next > cursor, `route milestone is absent or out of order: ${milestone}`);
    cursor = next;
  }

  assert.match(source, /requireBrokerClaimOrDiagnostic/);
  assert.match(source, /headless:\s*false/);
  assert.match(source, /site:producing/);
  assert.match(source, /positiveQuantity/);
  assert.match(source, /place_claim_outpost_relay/);
  assert.match(source, /survey\.lifecycle\s*===\s*['"]producing['"]/);

  for (const forbidden of [
    /\bworld\.enterSector\s*\(/,
    /\bsiteSys\.installMachine\s*\(/,
    /\bdrillSys\.pulseScan\s*\(/,
    /\._ensureBeacon\s*\(/,
    /\._emitProductionReceipt\s*\(/,
    /\._acceptProductionReceipt\s*\(/,
    /\bstate\.player\.cargo(?:\.items)?\s*=/,
    /\b(?:producing|inventory|survey|exteriorRelay)\s*=\s*(?:true|false|\{|\[)/,
  ]) {
    assert.doesNotMatch(source, forbidden, `probe contains forbidden terminal mutation ${forbidden}`);
  }
});

test('validation broker CLI registers the PQ-024 manifest without changing its export fallback', () => {
  const source = readFileSync(BROKER_CLI_URL, 'utf8');
  assert.match(
    source,
    /'pq024-asteroid-claim':\s*\(\)\s*=>\s*import\('\.\/validation-manifests\/pq024-asteroid-claim\.mjs'\)/,
  );
  assert.match(source, /^\s*pq024-asteroid-claim\s*$/m);
  assert.match(source, /const rawManifest = mod\.default/);
});
