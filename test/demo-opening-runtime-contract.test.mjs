import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../scripts/check-m3-player-facing-public-route.mjs', import.meta.url), 'utf8');
const baselineSource = await readFile(new URL('../scripts/lib/alphaLiveBaselineRoute.mjs', import.meta.url), 'utf8');
const travelSource = await readFile(new URL('../scripts/lib/professionalTravelPublicRoute.mjs', import.meta.url), 'utf8');
const routeSource = source + baselineSource + travelSource;

test('demo opening uses the public route and proves the playable first loop', () => {
  for (const required of [
    '--demo-opening',
    'runBrowserPublicRoute({',
    'proveEngineeringPreview(baselinePage)',
    'proveAuthoredHunterDamageAndRecovery(baselinePage',
    'requireRecovery: !DEMO_OPENING',
    'runProfessionalTravelPublicRoute({',
    'player remains alive after the first readable authored threat',
    "injectedState: false",
  ]) {
    assert.ok(routeSource.includes(required), `missing demo-opening contract: ${required}`);
  }
});

test('demo opening does not fake docking, saving, loading, or economy state', () => {
  for (const forbidden of [
    /bus\.emit\(['"]dock:docked/,
    /bus\.emit\(['"]game:save/,
    /bus\.emit\(['"]game:load/,
    /localStorage\.setItem\(/,
    /state\.player\.credits\s*=/,
    /state\.player\.cargo\s*=/,
    /state\.ui\.docked\s*=/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test('demo opening proves public docking, mission combat, and cold Continue', () => {
  assert.match(baselineSource, /New Game/);
  assert.match(baselineSource, /Set Waypoint/);
  assert.match(baselineSource, /physical-dock-prompt/);
  assert.match(source, /authored named-warrant damage/);
  assert.match(travelSource, /F5/);
  assert.match(travelSource, /Continue/);
});
