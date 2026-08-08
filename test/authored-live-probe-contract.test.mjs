import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/probe-authored-assets-live.mjs', import.meta.url), 'utf8');
const electronSource = readFileSync(new URL('../scripts/check-electron-new-game-launch.mjs', import.meta.url), 'utf8');

test('live asset proof respects spatial streaming while forbidding visible substitutes', () => {
  assert.doesNotMatch(source, /requestAuthoredUpgrade/,
    'normal-route proof must not defeat the production residency policy by demanding every offscreen body');
  assert.match(source, /report\.ships\.filter\(\(ship\) => ship\.presented && ship\.state !== 'authored'/,
    'every presented ship remains required to use its authored identity');
  assert.match(source, /!ship\.presented && ship\.state !== 'awaiting-authored-admission'/,
    'offscreen boundaries must wait invisibly instead of publishing procedural boxes');
  assert.match(source, /maxConcurrentDecode <= 1/,
    'production decode admission remains serial and bounded');
  assert.match(source, /repeatedPackageShipPoolKeys\.length > 0/,
    'the live route must bind one real package pool key to at least two Wasp or freighter roots');
  assert.match(source, /entry\.roots\.filter\(isFrequentShipRoot\)\.length >= 2/,
    'both roots counted by repeated package proof must be members of the frequent Wasp/freighter population');
  assert.match(source, /spacefaceRenderPackagePooled === true/,
    'surface and bounds proof must recognize package pool proxies without pretending they are direct meshes');
  assert.match(source, /packagePoolTextureResidency\.allResident/,
    'pool proxies retain final materials so the live proof can verify their textures are resident');
  assert.match(source, /packageSubmittedPoolKeys/,
    'repeated-root proof must use package slots submitted by the production pool sync');
  assert.match(source, /submittedInstancePoolSlots/,
    'the live probe must reject zero-matrix and hidden pool membership as route proof');
  assert.match(source, /submittedSlotCount/,
    'the report exposes currently submitted slots per exact scene pool chunk');
  assert.match(source, /await render\.warmPostProcess\(\)/,
    'forced presentation must use the production-owned renderer epoch so dynamic buffers publish before upload');
  assert.doesNotMatch(source, /render\.renderer\.render\(render\.scene, render\.camera\)/,
    'the live probe must not bypass dynamic-buffer publication through the exposed raw renderer');
});

test('Electron normal route proves authored release identities without an artificial drain', () => {
  assert.doesNotMatch(electronSource, /requestAuthoredUpgrade/,
    'Electron acceptance must exercise production demand rather than forcing distant assets resident');
  assert.match(electronSource, /ship\.authoredAssetState === 'authored'/);
  assert.match(electronSource,
    /function hasAcceptableAuthoredPresentation\(ship\)[\s\S]*?if \(!ship \|\| ship\.authoredAssetMode !== 'release'\) return false;/,
    'the shared acceptance predicate must fail closed for every non-release ship');
  assert.match(electronSource, /report\.ships\.every\(hasAcceptableAuthoredPresentation\)/,
    'the written acceptance receipt must apply the shared release predicate to every live ship');
  assert.match(electronSource,
    /report\.ships\.filter\(\(ship\) => !hasAcceptableAuthoredPresentation\(ship\)\)/,
    'the terminal assertion must reject every ship that fails the shared release predicate');
  assert.match(electronSource, /report\.mode === 'flight'/,
    'the proof remains a real playable-route handoff, not an isolated asset viewer');
  assert.match(electronSource, /getByRole\('button', \{ name: 'New Game', exact: true \}\)/,
    'the diagnostic must click the New Game control rather than the identically named heading');
  assert.match(electronSource, /getByRole\('button', \{ name: 'Launch', exact: true \}\)/,
    'the diagnostic must bind Launch to its exact button role');
});
