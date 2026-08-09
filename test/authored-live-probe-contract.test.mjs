import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/probe-authored-assets-live.mjs', import.meta.url), 'utf8');
const electronSource = readFileSync(new URL('../scripts/check-electron-new-game-launch.mjs', import.meta.url), 'utf8');

function translatedMatrix(x) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, 0, 0, 1,
  ];
}

function repeatedPoolReport() {
  const firstMatrix = translatedMatrix(12);
  const secondMatrix = translatedMatrix(36);
  const submission = (index, matrix) => ({
    key: 'package:wasp:opaque',
    chunk: 0,
    index,
    token: `package:wasp:opaque|0|${index}`,
    submitted: true,
    proxyMatrix: matrix,
    proxyIsInstanceProxy: true,
    proxyIsRenderPackagePooled: true,
    proxyIsMesh: false,
    visibleThroughRoot: true,
    directDrawSuppressed: true,
  });
  return {
    instancePools: [{
      key: 'package:wasp:opaque',
      chunk: 0,
      visible: true,
      sceneParented: true,
      submittedSlotMatrices: [
        { index: 0, determinant: 1, matrix: firstMatrix },
        { index: 1, determinant: 1, matrix: secondMatrix },
      ],
    }],
    ships: [
      {
        id: 101,
        defId: 'ship_wasp',
        trafficRole: 'escort',
        wholeShipBodyUrls: ['assets/ships/release/parts/wholeships/wasp_production_v1.glb'],
        presented: true,
        state: 'authored',
        packagePoolSubmissions: [submission(0, firstMatrix)],
      },
      {
        id: 102,
        defId: 'ship_wasp',
        trafficRole: 'escort',
        wholeShipBodyUrls: ['assets/ships/release/parts/wholeships/wasp_production_v1.glb'],
        presented: true,
        state: 'authored',
        packagePoolSubmissions: [submission(1, secondMatrix)],
      },
    ],
  };
}

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

test('repeated package proof binds two authored roots to two exact submitted matrices', async () => {
  assert.match(source, /export function assessRepeatedAuthoredPackagePoolProof/,
    'the live route must use an import-safe causal proof instead of counting root labels');
  const { assessRepeatedAuthoredPackagePoolProof } = await import('../scripts/probe-authored-assets-live.mjs');

  const valid = repeatedPoolReport();
  const proof = assessRepeatedAuthoredPackagePoolProof(valid);
  assert.equal(proof.pass, true, JSON.stringify(proof.failures));
  assert.equal(proof.proofs.length, 1);
  assert.equal(proof.proofs[0].distinctRootCount, 2);
  assert.equal(proof.proofs[0].distinctSlotCount, 2);

  const aliased = structuredClone(valid);
  aliased.ships[1].packagePoolSubmissions[0] = structuredClone(
    aliased.ships[0].packagePoolSubmissions[0],
  );
  assert.equal(assessRepeatedAuthoredPackagePoolProof(aliased).pass, false,
    'two root labels must not pass by pointing at the same submitted slot token');

  const staleMatrix = structuredClone(valid);
  staleMatrix.ships[1].packagePoolSubmissions[0].proxyMatrix = translatedMatrix(99);
  assert.equal(assessRepeatedAuthoredPackagePoolProof(staleMatrix).pass, false,
    'the submitted slot must contain the exact live proxy matrix');

  const directDuplicate = structuredClone(valid);
  directDuplicate.ships[1].packagePoolSubmissions[0].directDrawSuppressed = false;
  assert.equal(assessRepeatedAuthoredPackagePoolProof(directDuplicate).pass, false,
    'a visible direct package draw may not coexist with the claimed pooled draw');
});

test('owned runtime proof fails closed when any teardown category is absent', async () => {
  assert.match(source, /export function assertAuthoredProbeCleanup/);
  const { assertAuthoredProbeCleanup, finalizeAuthoredProbeEvidence } = await import('../scripts/probe-authored-assets-live.mjs');
  assert.throws(() => assertAuthoredProbeCleanup({}), /Chrome process proof/);
  assert.throws(() => finalizeAuthoredProbeEvidence({ route: 'fixture' }, {}), /Chrome process proof/,
    'missing process, port, and profile evidence must never serialize as PASS');
});

test('port teardown proof distinguishes a live listener from exact refusal', async () => {
  assert.match(source, /export function probePortRefusalOnce/);
  const { probePortRefusalOnce } = await import('../scripts/probe-authored-assets-live.mjs');
  const server = createServer((socket) => socket.end());
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const port = server.address().port;
  assert.equal(await probePortRefusalOnce(port, { timeoutMs: 200 }), false,
    'an accepting listener is not teardown proof');
  await new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
  assert.equal(await probePortRefusalOnce(port, { timeoutMs: 200 }), true,
    'only exact ECONNREFUSED proves the listener is closed');
});

test('server ownership is published before a live readiness failure', async () => {
  assert.match(source, /export async function startFreshServer/);
  const { startFreshServer } = await import('../scripts/probe-authored-assets-live.mjs');
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  try {
    const server = await startFreshServer({
      findFreePort: async () => 18521,
      spawnServer: () => child,
      waitForReachable: async () => { throw new Error('live server stayed unreachable'); },
    });
    assert.equal(server.child, child,
      'the caller must retain the live child before readiness can reject');
    assert.equal(server.port, 18521);
    assert.equal(child.exitCode, null, 'the causal fixture remains alive at the failure boundary');
    await assert.rejects(server.ready, /stayed unreachable/);
  } finally {
    if (child.exitCode == null && child.signalCode == null) {
      await new Promise((resolveExit) => {
        child.once('exit', resolveExit);
        child.kill();
      });
    }
  }
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
