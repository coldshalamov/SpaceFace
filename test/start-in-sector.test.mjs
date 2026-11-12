import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveStartSectorId } from '../src/systems/world.js';
import { SECTORS } from '../src/data/sectors.js';

test('resolveStartSectorId handles canonical sector IDs', () => {
  for (const sector of SECTORS) {
    assert.equal(resolveStartSectorId(sector.id), sector.id);
  }
});

test('resolveStartSectorId handles packet examples', () => {
  assert.equal(resolveStartSectorId('sector_vesta_forge'), 'sector_vesta_forge');
  assert.equal(resolveStartSectorId('sector_ceres_belt'), 'sector_ceres_belt');
  assert.equal(resolveStartSectorId('tethys'), 'sector_tethys_junction');
  assert.equal(resolveStartSectorId('helios_core'), 'sector_helios_prime');
});

test('resolveStartSectorId handles short names and profile aliases', () => {
  assert.equal(resolveStartSectorId('vesta_forge'), 'sector_vesta_forge');
  assert.equal(resolveStartSectorId('vesta'), 'sector_vesta_forge');
  assert.equal(resolveStartSectorId('ceres_belt'), 'sector_ceres_belt');
  assert.equal(resolveStartSectorId('ceres'), 'sector_ceres_belt');
  assert.equal(resolveStartSectorId('pallas_drift'), 'sector_pallas_drift');
  assert.equal(resolveStartSectorId('pallas'), 'sector_pallas_drift');
  assert.equal(resolveStartSectorId('sker_haven'), 'sector_sker_haven');
  assert.equal(resolveStartSectorId('sker'), 'sector_sker_haven');
  assert.equal(resolveStartSectorId('io_reach'), 'sector_io_reach');
  assert.equal(resolveStartSectorId('fringe'), 'sector_io_reach');
  assert.equal(resolveStartSectorId('veil_nebula'), 'sector_veil_nebula');
  assert.equal(resolveStartSectorId('anomaly'), 'sector_veil_nebula');
  assert.equal(resolveStartSectorId('the_bolus'), 'sector_the_bolus');
  assert.equal(resolveStartSectorId('viscera'), 'sector_the_bolus');
  assert.equal(resolveStartSectorId('charon_expanse'), 'sector_charon_expanse');
  assert.equal(resolveStartSectorId('ashfall_reach'), 'sector_ashfall_reach');
});

test('resolveStartSectorId trims whitespace and ignores case', () => {
  assert.equal(resolveStartSectorId('  TETHYS  '), 'sector_tethys_junction');
  assert.equal(resolveStartSectorId('SECTOR_VESTA_FORGE'), 'sector_vesta_forge');
  assert.equal(resolveStartSectorId('\tHelios_Core\n'), 'sector_helios_prime');
});

test('resolveStartSectorId returns null for invalid or missing inputs', () => {
  assert.equal(resolveStartSectorId(''), null);
  assert.equal(resolveStartSectorId('   '), null);
  assert.equal(resolveStartSectorId(null), null);
  assert.equal(resolveStartSectorId(undefined), null);
  assert.equal(resolveStartSectorId(12345), null);
  assert.equal(resolveStartSectorId({}), null);
  assert.equal(resolveStartSectorId('not_a_real_sector'), null);
  assert.equal(resolveStartSectorId('sector_does_not_exist'), null);
});

// FIX-R4b: dev ?sector= route must leave ordinary boot untouched on invalid sector ID
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const fnMatch = mainSource.match(/(async function applyDevSectorJump\([\s\S]*?\n    \})\n\n    \/\/ Dev-only/);
assert.ok(fnMatch, 'applyDevSectorJump must be declared in src/main.js');
const applyDevSectorJump = new Function(`return (${fnMatch[1]})`)();

function createTestHarness() {
  const emittedEvents = [];
  const sessionData = new Map();
  const logs = [];
  let confirmDismissed = 0;
  const newGameDefaults = { startingSectorId: 'sector_helios_prime' };

  const state = {
    mode: 'menu',
    settings: {
      accessibility: {
        firstLightOffered: false,
      },
    },
  };

  const bus = {
    emit(event, payload) {
      emittedEvents.push({ event, payload });
    },
  };

  const sessionStorage = {
    setItem(key, value) {
      sessionData.set(key, String(value));
    },
    getItem(key) {
      return sessionData.get(key) ?? null;
    },
  };

  const dismissConfirm = () => {
    confirmDismissed += 1;
  };

  const logger = (msg) => {
    logs.push(msg);
  };

  return {
    state,
    bus,
    sessionStorage,
    newGameDefaults,
    dismissConfirm,
    logger,
    emittedEvents,
    sessionData,
    logs,
    getConfirmDismissed: () => confirmDismissed,
  };
}

test('applyDevSectorJump with invalid sector ID leaves ordinary boot alone (no launch, no overrides)', async () => {
  const h = createTestHarness();
  const searchParams = new URLSearchParams('?sector=not_a_real_sector&seed=42');

  const result = await applyDevSectorJump({
    searchParams,
    state: h.state,
    bus: h.bus,
    sessionStorage: h.sessionStorage,
    resolveSector: resolveStartSectorId,
    newGameDefaults: h.newGameDefaults,
    dismissConfirm: h.dismissConfirm,
    logger: h.logger,
  });

  // Must not launch
  assert.equal(result.launched, false);
  assert.equal(result.targetSectorId, null);
  assert.equal(h.emittedEvents.length, 0, 'game:new must not be emitted for an invalid sector');

  // Must not override first-run onboarding or confirm
  assert.equal(h.state.settings.accessibility.firstLightOffered, false, 'firstLightOffered must not be overridden');
  assert.equal(h.sessionData.has('sf.cinematicSeen'), false, 'cinematicSeen must not be set in sessionStorage');
  assert.equal(h.getConfirmDismissed(), 0, 'dismissConfirm must not be called');
  assert.equal(h.newGameDefaults.startingSectorId, 'sector_helios_prime', 'startingSectorId must remain unchanged');

  // Must log the one plain line
  assert.equal(h.logs.length, 1);
  assert.equal(h.logs[0], "[SpaceFace] unknown sector 'not_a_real_sector', starting normally");
});

test('applyDevSectorJump with blank or unknown sector returns without launch or overrides', async () => {
  for (const invalid of ['', '   ', 'does_not_exist']) {
    const h = createTestHarness();
    const searchParams = new URLSearchParams(`?sector=${encodeURIComponent(invalid)}`);

    const result = await applyDevSectorJump({
      searchParams,
      state: h.state,
      bus: h.bus,
      sessionStorage: h.sessionStorage,
      resolveSector: resolveStartSectorId,
      newGameDefaults: h.newGameDefaults,
      dismissConfirm: h.dismissConfirm,
      logger: h.logger,
    });

    assert.equal(result.launched, false);
    assert.equal(h.emittedEvents.length, 0);
    assert.equal(h.state.settings.accessibility.firstLightOffered, false);
    assert.equal(h.sessionData.has('sf.cinematicSeen'), false);
    assert.equal(h.getConfirmDismissed(), 0);
    assert.equal(h.newGameDefaults.startingSectorId, 'sector_helios_prime');
  }
});

test('applyDevSectorJump with valid sector ID launches fresh run with overrides', async () => {
  const h = createTestHarness();
  const searchParams = new URLSearchParams('?sector=vesta&seed=999');

  const result = await applyDevSectorJump({
    searchParams,
    state: h.state,
    bus: h.bus,
    sessionStorage: h.sessionStorage,
    resolveSector: resolveStartSectorId,
    newGameDefaults: h.newGameDefaults,
    dismissConfirm: h.dismissConfirm,
    logger: h.logger,
    pollArrival: false,
  });

  assert.equal(result.launched, true);
  assert.equal(result.targetSectorId, 'sector_vesta_forge');

  // Emits game:new with seed
  assert.equal(h.emittedEvents.length, 1);
  assert.equal(h.emittedEvents[0].event, 'game:new');
  assert.deepEqual(h.emittedEvents[0].payload, { seed: 999 });

  // Onboarding overrides applied
  assert.equal(h.state.settings.accessibility.firstLightOffered, true);
  assert.equal(h.sessionData.get('sf.cinematicSeen'), '1');
  assert.equal(h.getConfirmDismissed(), 1);
  assert.equal(h.newGameDefaults.startingSectorId, 'sector_vesta_forge');
});

test('applyDevSectorJump arrival polling enters target sector on flight mode', async () => {
  const h = createTestHarness();
  let enteredSector = null;
  const registry = {
    get(name) {
      if (name === 'world') {
        return {
          enterSector(id) {
            enteredSector = id;
          },
        };
      }
      return null;
    },
  };
  h.state.mode = 'flight';
  h.state.world = { currentSectorId: 'sector_helios_prime' };

  const searchParams = new URLSearchParams('?sector=vesta');

  await applyDevSectorJump({
    searchParams,
    state: h.state,
    bus: h.bus,
    registry,
    sessionStorage: h.sessionStorage,
    resolveSector: resolveStartSectorId,
    newGameDefaults: h.newGameDefaults,
    dismissConfirm: h.dismissConfirm,
    logger: h.logger,
    pollArrival: true,
  });

  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(enteredSector, 'sector_vesta_forge');
});

