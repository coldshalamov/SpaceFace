import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CHECK_PATH = path.join(ROOT, 'scripts', 'check-alpha-live-baseline-browser.mjs');
const ROUTE_PATH = path.join(ROOT, 'scripts', 'lib', 'alphaLiveBaselineRoute.mjs');
const CONTRACTS_PATH = path.join(ROOT, 'scripts', 'lib', 'alphaLiveBaselineContracts.mjs');
const PACKAGE_PATH = path.join(ROOT, 'package.json');

assert.equal(existsSync(CHECK_PATH), true, 'browser baseline check must exist');
assert.equal(existsSync(ROUTE_PATH), true, 'public-route helper must exist');
assert.equal(existsSync(CONTRACTS_PATH), true, 'importable browser-baseline contracts must exist');

const [checkSource, routeSource, contractsSource, packageSource] = await Promise.all([
  readFile(CHECK_PATH, 'utf8'),
  readFile(ROUTE_PATH, 'utf8'),
  readFile(CONTRACTS_PATH, 'utf8'),
  readFile(PACKAGE_PATH, 'utf8'),
]);
const combined = `${checkSource}\n${routeSource}\n${contractsSource}`;
const pkg = JSON.parse(packageSource);

assert.equal(
  pkg.scripts['check:alpha:baseline:contracts'],
  'node test/alpha-live-baseline-contracts.test.mjs && node test/alpha-live-baseline-route-contract.test.mjs && node test/alpha-live-baseline-electron-contract.test.mjs && npm run check:cinematic-input-fence && npm run check:asset-runtime-disposal && npm run check:galaxy-map-inspector',
  'package exposes browser/Electron baseline, cinematic-input, asset-runtime disposal, and galaxy-map inspector contract tests exactly once',
);
assert.equal(
  pkg.scripts['check:cinematic-input-fence'],
  'node test/cinematic-input-fence.test.mjs',
  'cinematic release-fence behavior has a direct non-headed gate',
);
assert.equal(
  pkg.scripts['check:alpha:baseline:browser'],
  'npm run check:alpha:baseline:contracts && node scripts/check-alpha-live-baseline-browser.mjs && npm run check:galaxy-map-search-pointer',
  'headed browser gate runs the non-headed preflight, canonical baseline, and physical map-pointer regression',
);
assert.equal(
  pkg.scripts['check:galaxy-map-search-pointer'],
  'node scripts/check-galaxy-map-search-pointer.mjs',
  'active-objective search and pointer routing have a direct canonical-browser gate',
);
for (const scriptName of ['check', 'check:ci']) {
  assert.equal(
    String(pkg.scripts[scriptName]).split('npm run check:alpha:baseline:contracts').length - 1,
    1,
    `${scriptName} wires the non-headed baseline contract gate exactly once`,
  );
  assert.match(
    pkg.scripts[scriptName],
    /check:alpha:evidence:contract && npm run check:alpha:baseline:contracts && npm run check:launch-policy/,
    `${scriptName} keeps the baseline contracts next to the alpha evidence contract`,
  );
}
const contractGateConsumers = Object.entries(pkg.scripts)
  .filter(([, command]) => String(command).includes('npm run check:alpha:baseline:contracts'))
  .map(([name]) => name)
  .sort();
assert.deepEqual(contractGateConsumers, ['check', 'check:alpha:baseline:browser', 'check:alpha:baseline:electron', 'check:ci'],
  'the non-headed baseline contract gate is consumed only by check, check:ci, and the headed browser/Electron preflights');
for (const [name, command] of Object.entries(pkg.scripts)) {
  if (name === 'check:alpha:baseline:browser') continue;
  assert.equal(
    String(command || '').split('check-alpha-live-baseline-browser.mjs').length - 1,
    0,
    `${name} must not duplicate the live headed baseline`,
  );
}

assert.match(checkSource, /acquireVisualProbeServer/, 'check reuses the canonical in-process server helper');
assert.match(checkSource, /headless\s*:\s*false/, 'baseline launches a headed browser');
assert.match(checkSource, /executablePath/, 'baseline requires an installed system Chrome or Edge');
assert.match(checkSource, /newContext\s*\(/, 'baseline uses a fresh incognito browser context');
assert.match(checkSource, /deviceScaleFactor\s*:\s*1/, 'baseline fixes DPR at one');
assert.match(checkSource, /width\s*:\s*1440/, 'baseline fixes the acceptance viewport width');
assert.match(checkSource, /height\s*:\s*900/, 'baseline fixes the acceptance viewport height');
assert.match(checkSource, /bringToFront\s*\(/, 'headed page is brought to the foreground');
assert.match(checkSource, /worktreeFingerprint/, 'capture is bound to a stable tracked, staged, intent-to-add, and ordinary untracked tree');
assert.match(checkSource, /publishAcceptedArtifacts/, 'accepted artifacts are promoted only after the route passes');
assert.match(checkSource, /publishFailureArtifacts/, 'failed runs retain a non-primary failure packet');
assert.match(checkSource, /failure-screenshot\.png/, 'failed routes retain a headed screenshot without touching accepted evidence');
assert.match(checkSource, /failure-state\.json/, 'failed routes retain a read-only DOM/runtime snapshot');
assert.match(checkSource, /closeOwnedResources/, 'page, context, browser, and server use awaited owned cleanup');
assert.match(checkSource, /assertPublicationUrlContract/, 'accepted publication reasserts the canonical URL contract');
assert.match(checkSource, /redirectedFrom\s*\(/, 'initial navigation rejects redirect chains');
assert.match(contractsSource, /\.on\(['"]framenavigated['"]/, 'tracker records main-frame navigation events');
assert.match(contractsSource, /node-live-url-poll/, 'tracker polls live page URLs from Node for same-document history drift');
assert.match(contractsSource, /stopAfterPageClose/, 'URL tracker remains owned until page closure');
assert.match(contractsSource, /immediately-preclose-live/, 'cleanup records a fresh live URL immediately before page close');
assert.match(checkSource, /flight-input-telemetry\.json/, 'accepted evidence carries held and released input snapshots');
assert.match(checkSource, /url-lifecycle-telemetry\.json/, 'accepted evidence carries the page-lifecycle URL tracker');
assert.match(checkSource, /hardware-gpu-telemetry\.json/, 'accepted evidence carries affirmative hardware GPU diagnostics');
assert.match(checkSource, /station-settlement-telemetry\.json/, 'accepted evidence carries the rAF station sequence and overlay diagnostics');

for (const [label, forbidden] of [
  ['storage access', /\b(?:localStorage|sessionStorage|indexedDB)\b/],
  ['cookie mutation', /\b(?:addCookies|clearCookies|cookies\s*\()/],
  ['initialization injection', /\baddInitScript\s*\(/],
  ['direct event injection', /\b(?:SF|sf)\.bus\.emit\s*\(|\bbus\.emit\s*\(/],
  ['direct entity spawning', /\bspawnEntity\s*\(/],
  ['direct gameplay service invocation', /\bregistry\.get\s*\(|\bhelpers\.[A-Za-z_$][\w$]*\s*\(/],
  ['direct runtime property assignment', /\b(?:state|player|entity|sf\.state)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*=(?!=)/],
  ['fixed or shared game port', /\b(?:8123|8160|41788)\b/],
  ['launcher or serving-policy duplication', /\b(?:server\.js|gameServer\.cjs|createGameServer)\b/],
  ['process killing', /\b(?:taskkill|Stop-Process|kill\s*\(|\.kill\s*\()\b/i],
  ['forced GPU mode', /--(?:disable-gpu|use-gl|use-angle)/i],
  ['debug/query route flags', /(?:goto|baseUrl|route)\s*[^\n]*[?](?:debug|perf|probe|scenario|fixture)/i],
]) {
  assert.doesNotMatch(combined, forbidden, `live baseline forbids ${label}`);
}

assert.doesNotMatch(checkSource, /\.listen\s*\(/, 'the check cannot open its own fixed or copied listener');
assert.doesNotMatch(combined, /document\.querySelector[^\n;]*\.click\s*\(/, 'DOM evaluation cannot synthesize UI clicks');
assert.doesNotMatch(combined, /\.evaluate\s*\([^)]*=>[^;{}]*\.click\s*\(/s, 'page evaluation cannot synthesize UI clicks');
assert.doesNotMatch(routeSource, /\.player\.speed\s*>\s*1\b/, 'ambient momentum alone cannot certify input response');

for (const required of [
  /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]New Game['"],\s*exact:\s*true\s*\}\)/,
  /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]Launch['"],\s*exact:\s*true\s*\}\)/,
  /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]Set Waypoint['"],\s*exact:\s*true\s*\}\)/,
  /keyboard\.down\(['"]KeyW['"]\)/,
  /keyboard\.down\(['"]Shift['"]\)/,
  /keyboard\.press\(['"]KeyN['"]\)/,
  /#sf-galaxymap/,
  /keyboard\.press\(['"]\/['"]\)/,
  /keyboard\.type\(['"]Helios Station['"]\)/,
  /keyboard\.press\(['"]KeyE['"]\)/,
  /\.sf-alert--dock/,
  /\[data-screen=["']station["']\]/,
  /#sf-dock-overlay/,
  /01-main-menu\.png/,
  /02-new-game\.png/,
  /03-flight-after-input\.png/,
  /04-galaxy-map\.png/,
  /05-dock-prompt\.png/,
  /06-station-hub\.png/,
]) {
  assert.match(routeSource, required, `public-route helper is missing contract token ${required}`);
}

for (const causalToken of [
  /const baselineStart\s*=/,
  /const baselineEnd\s*=/,
  /wHeld\s*=/,
  /boostHeld\s*=/,
  /const released\s*=/,
  /evaluateFlightInputCausality/,
  /controls\.moveZ/,
  /controls\.boost/,
  /powered\.displacementPerSecond\s*>\s*baseline\.displacementPerSecond/,
  /powered\.speedChange\s*>\s*baseline\.speedChange/,
  /powered\.accelerationPerSecond\s*>\s*baseline\.accelerationPerSecond/,
]) {
  assert.match(routeSource, causalToken, `causal flight proof is missing ${causalToken}`);
}

assert.match(routeSource, /recordCanonicalUrl\(['"]boot-ready['"]\)/, 'route checks URL at boot');
assert.match(routeSource, /recordCanonicalUrl\(['"]before-route-return['"]\)/, 'route checks URL immediately before returning acceptance data');
assert.match(routeSource, /validateFinalStationFrameSuffix\(observations/,
  'station consumer validates only the final contiguous animation-frame suffix');
assert.doesNotMatch(routeSource, /observations\.slice\(start/,
  'station consumer cannot search for an earlier passing window');
assert.match(routeSource, /const canonicalUndockSelector\s*=\s*['"]button\.st-undock['"]/,
  'station settlement pins the canonical Undock structural selector');
assert.match(routeSource, /document\.querySelectorAll\(canonicalUndockSelector\)/,
  'station settlement structurally enumerates canonical controls document-wide');
assert.match(routeSource, /canonicalMatchCount:\s*undockMatches\.length/,
  'station telemetry records the total canonical match count from the live DOM');
assert.match(routeSource, /visibleCanonicalMatchCount:\s*visibleUndockMatches\.length/,
  'station telemetry records the visible canonical match count from the live DOM');
assert.match(routeSource, /isConnected:\s*undock\?\.isConnected\s*===\s*true/,
  'station telemetry derives selected-control connection state from the live DOM');
assert.match(routeSource, /containedByStationScreen:\s*!!\(screen\s*&&\s*undock\s*&&\s*screen\.contains\(undock\)\)/,
  'station telemetry derives canonical-control containment from the live station screen');
assert.match(routeSource, /function accessibleNameOf\(element\)/,
  'station settlement uses an explicit deterministic accessible-name helper');
for (const accessibleNameSource of [
  /getAttribute\(['"]aria-labelledby['"]\)/,
  /getAttribute\(['"]aria-label['"]\)/,
  /element\?\.innerText/,
  /element\?\.textContent/,
  /getAttribute\(['"]title['"]\)/,
]) {
  assert.match(routeSource, accessibleNameSource,
    `accessible-name helper is missing live DOM source ${accessibleNameSource}`);
}
assert.match(routeSource, /function inspectAccessibilityAncestry\(element\)/,
  'station settlement explicitly inspects effective accessibility ancestry');
for (const ancestrySource of [
  /node\.parentElement/,
  /getAttribute\(['"]aria-hidden['"]\)/,
  /hasAttribute\(['"]inert['"]\)/,
  /getAttribute\(['"]aria-disabled['"]\)/,
]) {
  assert.match(routeSource, ancestrySource,
    `accessibility ancestry helper is missing live DOM source ${ancestrySource}`);
}
assert.match(routeSource, /accessibleName:\s*undockAccessibleName\.name/,
  'station telemetry records the deterministic diagnostic accessible name rather than presentation copy');
assert.match(routeSource, /page\.getByRole\(['"]button['"],\s*\{\s*name:\s*\/\\bundock\\b\/i\s*\}\)/,
  'Playwright computed role/name matching is the station action acceptance authority');
assert.match(routeSource, /page\.locator\(['"]button\.st-undock['"]\)/,
  'computed role/name authority begins with the document-wide canonical selector');
assert.match(routeSource, /\.and\(computedUndockRole\)/,
  'computed role/name authority is identity-intersected with the canonical control');
assert.match(routeSource, /ariaSnapshot\s*\(/,
  'computed role/name proof records Playwright ARIA output');
assert.match(routeSource, /before-settlement/,
  'computed role/name proof brackets station observation before settlement');
assert.match(routeSource, /after-settlement/,
  'computed role/name proof brackets station observation after settlement');
assert.match(routeSource, /page\.evaluate\(observeStableStationFramesInPage/,
  'the exported DOM observer seam is the exact implementation executed in the browser');
const beforeRoleProofIndex = routeSource.indexOf("readComputedUndockRoleProof(page, 'before-settlement')");
const stationObserverIndex = routeSource.indexOf('page.evaluate(observeStableStationFramesInPage');
const afterRoleProofIndex = routeSource.indexOf("readComputedUndockRoleProof(page, 'after-settlement')");
assert(beforeRoleProofIndex > 0 && stationObserverIndex > beforeRoleProofIndex
  && afterRoleProofIndex > stationObserverIndex,
  'computed role/name authority brackets the uninterrupted rAF observer in actual dataflow order');
assert.match(routeSource, /validateComputedUndockRoleProofs\(\[computedRoleBefore,\s*computedRoleAfter\]\)/,
  'both bracket proofs feed the station acceptance validator');
assert.match(contractsSource, /proof\.computedRoleCount\s*<\s*proof\.identityBoundCount/,
  'global computed-name count is validated as a superset of the canonical identity intersection');
assert.doesNotMatch(contractsSource,
  /computed role\/name match count[^\n]*(?:must be exactly one|!==\s*1)/i,
  'global explanatory Undock buttons cannot be mistaken for canonical uniqueness failures');
assert.match(routeSource, /\.matches\(['"]:disabled['"]\)/,
  'effective native disabled state includes disabled fieldset ancestry');
assert.match(routeSource, /normalizedLabel:/,
  'station telemetry records normalized presentation copy for diagnostics');
assert.match(routeSource, /readiness:/,
  'station telemetry records the dynamic readiness semantic without pinning its value');
assert.match(routeSource, /disabled:/,
  'station telemetry records native disabled semantics without making decorated copy the identity');
assert.doesNotMatch(routeSource,
  /(?:textContent|innerText)[^\n;]{0,200}(?:===|==)\s*['"]Undock['"]|['"]Undock['"]\s*(?:===|==)[^\n;]{0,200}(?:textContent|innerText)/,
  'station settlement cannot regress to exact literal or case-sensitive Undock copy');
assert.doesNotMatch(routeSource, /querySelectorAll\(['"]button['"]\)[\s\S]{0,240}\.find\s*\(/,
  'a loose scan across arbitrary button copy cannot satisfy the canonical action identity');
assert.match(contractsSource, /actual\.origin\s*!==\s*expected\.origin/, 'URL contract pins origin');
assert.match(contractsSource, /actual\.pathname\s*!==\s*expected\.pathname/, 'URL contract pins pathname');
assert.match(contractsSource, /actual\.search\s*!==\s*['"]['"]/, 'URL contract rejects search parameters');
assert.match(contractsSource, /actual\.hash\s*!==\s*['"]['"]/, 'URL contract rejects fragments');
const publicationRecheckIndex = checkSource.indexOf('const publicationUrlCheck = assertPublicationUrlContract');
const acceptedEvidenceWriteIndex = checkSource.indexOf("writeJsonAtomic(path.join(STAGING_ROOT, 'evidence.json')");
assert(publicationRecheckIndex > 0, 'main check performs an explicit publication URL recheck');
assert(acceptedEvidenceWriteIndex > publicationRecheckIndex,
  'publication URL recheck runs before accepted evidence is written');
const routeFingerprintIndex = checkSource.indexOf('routeFingerprint = await worktreeFingerprint(ROOT)');
const postFingerprintLiveIndex = checkSource.indexOf("observeNow('post-worktree-fingerprint-live')");
assert(routeFingerprintIndex > 0 && postFingerprintLiveIndex > routeFingerprintIndex,
  'fresh live URL check runs after route worktree fingerprinting');
assert.match(combined, /inspectCanonicalRootUrl\(page\.url\(\),\s*ownedServer\.baseUrl\)/,
  'post-navigation page URL is compared with the originally requested root');
assert.match(combined, /WEBGL_debug_renderer_info/, 'GPU identity comes from the real WebGL context');
assert.match(combined, /swiftshader\|llvmpipe/i, 'hardware check rejects well-known software renderers');
assert.match(combined, /performance-telemetry\.json/, 'route publishes descriptive performance telemetry');
assert.match(combined, /primaryAcceptance\s*:\s*true/, 'successful public route emits primary browser evidence');
assert.match(combined, /injectedState\s*:\s*false/, 'evidence states that gameplay was not injected');
assert.match(combined, /inputSource\s*:\s*['"]keyboard-mouse['"]/, 'evidence names real keyboard and mouse input');

const routeModule = await import(new URL('../scripts/lib/alphaLiveBaselineRoute.mjs', import.meta.url));
assert.equal(typeof routeModule.runBrowserPublicRoute, 'function', 'route helper exports the public-route runner');
assert.equal(typeof routeModule.summarizePerformanceSamples, 'function', 'route helper exports its descriptive sampler summary');
assert.equal(typeof routeModule.evaluateFlightInputCausality, 'function', 'route helper exports causal flight evaluation');
assert.equal(typeof routeModule.inspectCanonicalRootUrl, 'function', 'route helper exports canonical URL inspection');
assert.equal(typeof routeModule.evaluateCanonicalUrlAcceptance, 'function', 'route helper exports lifecycle URL acceptance');
assert.equal(typeof routeModule.observeStableStationFramesInPage, 'function',
  'route helper exports the exact DOM observer used by page.evaluate');

await testStationDomObserver(routeModule);

assert.deepEqual(
  routeModule.summarizePerformanceSamples([
    { frameMs: 10, memory: { geometries: 2, textures: 3, programs: 4 }, heap: 100 },
    { frameMs: 20, memory: { geometries: 5, textures: 6, programs: 7 }, heap: 120 },
    { frameMs: 40, memory: { geometries: 8, textures: 9, programs: 10 }, heap: 140 },
  ]).frameMs,
  { sampleCount: 3, p50: 20, p95: 40, p99: 40, max: 40, hitchesOver32Ms: 1 },
  'performance summary is descriptive and retains the requested percentile/hitch fields',
);

const momentumOnly = {
  baselineStart: flightSnapshot({ tick: 0, simTime: 0, x: 0, speed: 100 }),
  baselineEnd: flightSnapshot({ tick: 10, simTime: 1, x: 100, speed: 100 }),
  wHeld: flightSnapshot({ tick: 15, simTime: 1.5, x: 150, speed: 100 }),
  boostHeld: flightSnapshot({ tick: 20, simTime: 2, x: 200, speed: 100 }),
  released: flightSnapshot({ tick: 22, simTime: 2.2, x: 220, speed: 100 }),
};
const momentumResult = routeModule.evaluateFlightInputCausality(momentumOnly);
assert.equal(momentumResult.pass, false, 'high ambient momentum cannot pass causal flight input');
assert(momentumResult.failures.some((failure) => /W hold did not appear/.test(failure)),
  'momentum-only failure identifies the absent live W field');

const controlWithoutResponse = {
  ...momentumOnly,
  wHeld: flightSnapshot({ tick: 15, simTime: 1.5, x: 150, speed: 100, moveZ: 1 }),
  boostHeld: flightSnapshot({ tick: 20, simTime: 2, x: 200, speed: 100, moveZ: 1, boost: true }),
};
const noResponseResult = routeModule.evaluateFlightInputCausality(controlWithoutResponse);
assert.equal(noResponseResult.pass, false, 'live control fields without excess motion cannot pass causal flight input');
assert(noResponseResult.failures.some((failure) => /displacement rate/.test(failure)),
  'no-response failure compares powered displacement with the released baseline');
assert(noResponseResult.failures.some((failure) => /speed change/.test(failure)),
  'no-response failure compares powered speed change with the released baseline');
assert(noResponseResult.failures.some((failure) => /acceleration/.test(failure)),
  'no-response failure compares powered acceleration with the released baseline');

const causalResult = routeModule.evaluateFlightInputCausality({
  baselineStart: flightSnapshot({ tick: 0, simTime: 0, x: 0, speed: 0 }),
  baselineEnd: flightSnapshot({ tick: 5, simTime: 0.5, x: 0, speed: 0 }),
  wHeld: flightSnapshot({ tick: 10, simTime: 1, x: 5, speed: 20, moveZ: 1 }),
  boostHeld: flightSnapshot({ tick: 15, simTime: 1.4, x: 25, speed: 60, moveZ: 1, boost: true }),
  released: flightSnapshot({ tick: 17, simTime: 1.6, x: 37, speed: 55 }),
});
assert.deepEqual(causalResult.failures, [], 'held controls plus motion above baseline pass causal flight proof');
assert.equal(causalResult.pass, true, 'causal flight proof passes only with live controls and excess response');

const canonical = 'http://127.0.0.1:54321/';
assert.equal(routeModule.inspectCanonicalRootUrl(canonical, canonical).pass, true, 'exact canonical root passes');
for (const drifted of [
  'http://127.0.0.1:54322/',
  'http://127.0.0.1:54321/other',
  'http://127.0.0.1:54321/?mode=other',
  'http://127.0.0.1:54321/#other',
]) {
  assert.equal(routeModule.inspectCanonicalRootUrl(drifted, canonical).pass, false,
    `canonical URL inspection rejects ${drifted}`);
}

const lifecycleBase = {
  expectedRootUrl: canonical,
  observations: [
    { sequence: 1, source: 'framenavigated', actual: canonical },
    { sequence: 2, source: 'node-live-url-poll', actual: canonical },
  ],
  postFingerprintUrlCheck: { source: 'post-worktree-fingerprint-live', actual: canonical },
  precloseUrlCheck: { source: 'immediately-preclose-live', actual: canonical },
};
assert.equal(routeModule.evaluateCanonicalUrlAcceptance(lifecycleBase).pass, true,
  'canonical lifecycle with fresh post-fingerprint and preclose observations passes');

const lateQuery = routeModule.evaluateCanonicalUrlAcceptance({
  ...lifecycleBase,
  observations: [...lifecycleBase.observations, {
    sequence: 3,
    source: 'node-live-url-poll',
    actual: `${canonical}?late-push-state=1`,
  }],
});
assert.equal(lateQuery.pass, false, 'late pushState/query observation rejects publication');
assert(lateQuery.failures.some((failure) => /search became/.test(failure)), 'late query failure names search drift');

const lateHash = routeModule.evaluateCanonicalUrlAcceptance({
  ...lifecycleBase,
  observations: [...lifecycleBase.observations, {
    sequence: 3,
    source: 'node-live-url-poll',
    actual: `${canonical}#late-history-hash`,
  }],
});
assert.equal(lateHash.pass, false, 'late hash/history observation rejects publication');
assert(lateHash.failures.some((failure) => /hash became/.test(failure)), 'late hash failure names fragment drift');

const lateRedirect = routeModule.evaluateCanonicalUrlAcceptance({
  ...lifecycleBase,
  observations: [...lifecycleBase.observations, {
    sequence: 3,
    source: 'framenavigated',
    actual: 'http://127.0.0.1:54322/',
  }],
});
assert.equal(lateRedirect.pass, false, 'late main-frame redirect observation rejects publication');
assert(lateRedirect.failures.some((failure) => /origin changed/.test(failure)), 'late redirect failure names origin drift');

const missingPreclose = routeModule.evaluateCanonicalUrlAcceptance({
  ...lifecycleBase,
  precloseUrlCheck: null,
});
assert.equal(missingPreclose.pass, false, 'missing immediately-preclose observation rejects publication');
assert(missingPreclose.failures.some((failure) => /immediately-preclose-live observation is missing/.test(failure)),
  'missing preclose failure is explicit');

const missingPostFingerprint = routeModule.evaluateCanonicalUrlAcceptance({
  ...lifecycleBase,
  postFingerprintUrlCheck: null,
});
assert.equal(missingPostFingerprint.pass, false, 'missing post-fingerprint live observation rejects publication');
assert(missingPostFingerprint.failures.some((failure) => /post-worktree-fingerprint-live observation is missing/.test(failure)),
  'missing post-fingerprint failure is explicit');

const missingPoll = routeModule.evaluateCanonicalUrlAcceptance({
  ...lifecycleBase,
  observations: lifecycleBase.observations.filter((observation) => observation.source !== 'node-live-url-poll'),
});
assert.equal(missingPoll.pass, false, 'missing Node-side URL poll coverage rejects publication');
assert(missingPoll.failures.some((failure) => /live URL poll observation is missing/.test(failure)),
  'missing poll coverage failure is explicit');

function flightSnapshot({ tick, simTime, x, speed, moveZ = 0, boost = false }) {
  return {
    tick,
    simTime,
    player: { pos: { x, z: 0 }, speed },
    controls: { moveX: 0, moveZ, boost },
  };
}

async function testStationDomObserver(routeModule) {
  const baseline = await observeStationFixture(routeModule);
  assert.equal(baseline.length, 1, 'DOM observer fixture emits the requested frame count');
  assert.equal(baseline[0].screenVisible, true, 'baseline station intersects the viewport and is visible');
  assert.equal(baseline[0].undockAction.canonicalMatchCount, 1,
    'DOM observer counts canonical controls document-wide');
  assert.equal(baseline[0].undockAction.visibleCanonicalMatchCount, 1,
    'DOM observer derives visible canonical count from effective visibility');
  assert.equal(baseline[0].undockAction.accessibleName, 'Undock from Helios Station',
    'DOM observer diagnostic name is derived from the fixture aria-label');
  assert.equal(baseline[0].undockAction.disabled, false,
    'baseline canonical action is effectively enabled');

  for (const [label, options, expectedScreenVisible] of [
    ['ancestor opacity', { stationStyle: { opacity: '0' } }, false],
    ['ancestor display', { stationStyle: { display: 'none' } }, false],
    ['ancestor visibility', { stationStyle: { visibility: 'hidden' } }, false],
    ['ancestor hidden attribute', { stationHidden: true }, false],
    ['viewport intersection', { buttonRect: { left: 1600, top: 100, width: 180, height: 44 } }, true],
    ['nontrivial intersected area', { buttonRect: { left: 1439.5, top: 100, width: 180, height: 44 } }, true],
  ]) {
    const frames = await observeStationFixture(routeModule, options);
    assert.equal(frames[0].screenVisible, expectedScreenVisible,
      `${label} produces the expected station-level effective visibility`);
    assert.equal(frames[0].undockAction.visible, false,
      `${label} prevents canonical action visibility in the executed DOM observer`);
    assert.equal(frames[0].undockAction.visibleCanonicalMatchCount, 0,
      `${label} removes the canonical action from the visible match count`);
  }

  const duplicate = await observeStationFixture(routeModule, { duplicateCanonical: true });
  assert.equal(duplicate[0].undockAction.canonicalMatchCount, 2,
    'DOM observer rejects descendant-only uniqueness by seeing an outside-screen duplicate');

  const fieldsetDisabled = await observeStationFixture(routeModule, { disabledFieldset: true });
  assert.equal(fieldsetDisabled[0].undockAction.disabled, true,
    'DOM observer uses :disabled semantics for disabled fieldset ancestry');
}

async function observeStationFixture(routeModule, options = {}) {
  const fixture = createStationDomFixture(options);
  const prior = new Map();
  for (const [key, value] of Object.entries(fixture.globals)) {
    prior.set(key, Object.prototype.hasOwnProperty.call(globalThis, key)
      ? { owned: true, value: globalThis[key] }
      : { owned: false });
    globalThis[key] = value;
  }
  try {
    return await routeModule.observeStableStationFramesInPage({ maximumFrames: 1 });
  } finally {
    for (const [key, previous] of prior) {
      if (previous.owned) globalThis[key] = previous.value;
      else delete globalThis[key];
    }
  }
}

function createStationDomFixture({
  stationStyle = {},
  stationHidden = false,
  buttonRect = { left: 1080, top: 24, width: 180, height: 44 },
  duplicateCanonical = false,
  disabledFieldset = false,
} = {}) {
  const body = fakeElement({ tag: 'body', rect: { left: 0, top: 0, width: 1440, height: 900 } });
  const station = fakeElement({
    tag: 'section',
    parent: body,
    hidden: stationHidden,
    attrs: { 'data-screen': 'station' },
    style: stationStyle,
    rect: { left: 80, top: 40, width: 1280, height: 820 },
    innerText: 'Helios Station Market Shipyard Missions ⏏ UNDOCK · READY',
  });
  const fieldset = fakeElement({ tag: 'fieldset', parent: station, disabled: disabledFieldset });
  const undock = fakeElement({
    tag: 'button',
    parent: fieldset,
    classes: ['st-undock'],
    attrs: {
      'aria-label': 'Undock from Helios Station',
      'data-readiness': 'ready',
    },
    rect: buttonRect,
    innerText: '⏏ UNDOCK · READY',
  });
  const tab = fakeElement({
    tag: 'button',
    parent: station,
    attrs: { role: 'tab', 'data-tab': 'market' },
    rect: { left: 120, top: 140, width: 120, height: 36 },
    innerText: 'Market',
  });
  const outsideDuplicate = duplicateCanonical ? fakeElement({
    tag: 'button',
    parent: body,
    classes: ['st-undock'],
    attrs: { 'aria-label': 'Undock duplicate' },
    rect: { left: 20, top: 20, width: 120, height: 36 },
    innerText: 'Undock duplicate',
  }) : null;

  station.querySelectorAll = (selector) => selector === '[role="tab"][data-tab]' ? [tab] : [];
  station.contains = (candidate) => containsElement(station, candidate);
  const canonical = [undock, outsideDuplicate].filter(Boolean);
  const documentRef = {
    documentElement: { clientWidth: 1440, clientHeight: 900 },
    querySelector: (selector) => {
      if (selector === '[data-screen="station"]') return station;
      if (selector === '#sf-dock-overlay') return null;
      return null;
    },
    querySelectorAll: (selector) => selector === 'button.st-undock' ? canonical : [],
    getElementById: () => null,
  };
  const windowRef = {
    innerWidth: 1440,
    innerHeight: 900,
    SF: {
      state: {
        ui: { docked: true, dockedStationId: 'helios-station' },
      },
    },
  };
  let frame = 0;
  return {
    globals: {
      document: documentRef,
      window: windowRef,
      getComputedStyle: (element) => element._style,
      requestAnimationFrame: (callback) => queueMicrotask(() => callback(++frame * 16.667)),
    },
  };
}

function fakeElement({
  tag = 'div',
  parent = null,
  attrs = {},
  classes = [],
  style = {},
  rect = { left: 0, top: 0, width: 100, height: 40 },
  hidden = false,
  disabled = false,
  innerText = '',
} = {}) {
  const attributes = new Map(Object.entries(attrs));
  const element = {
    localName: tag,
    tagName: tag.toUpperCase(),
    parentElement: parent,
    hidden,
    disabled,
    isConnected: true,
    id: attributes.get('id') || '',
    classList: classes,
    innerText,
    textContent: innerText,
    _style: {
      display: style.display ?? 'block',
      visibility: style.visibility ?? 'visible',
      opacity: style.opacity ?? '1',
      pointerEvents: style.pointerEvents ?? 'auto',
    },
    getAttribute: (name) => attributes.has(name) ? attributes.get(name) : null,
    hasAttribute: (name) => attributes.has(name),
    getBoundingClientRect: () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    }),
    matches: (selector) => selector === ':disabled'
      ? disabled || hasDisabledFieldsetAncestor(element)
      : false,
    querySelectorAll: () => [],
    contains: (candidate) => containsElement(element, candidate),
  };
  return element;
}

function containsElement(container, candidate) {
  for (let node = candidate; node; node = node.parentElement) {
    if (node === container) return true;
  }
  return false;
}

function hasDisabledFieldsetAncestor(element) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node.localName === 'fieldset' && node.disabled === true) return true;
  }
  return false;
}

console.log('PASS alpha live browser route contract: public input only, canonical root, hardware browser, atomic evidence');
