import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GAMEPLAY_MILESTONES,
  MONEY_MOMENTS,
  RELEASE_CAPTURE_SCHEMA,
  artifactClaimFromBytes,
  buildReleaseCaptureReceipt,
  canonicalCaptureJson,
  validateReleaseCaptureManifest,
  validateReleaseCaptureReceipt,
} from '../scripts/lib/releaseCaptureContracts.mjs';

const hash = (char) => char.repeat(64);
const MOMENT_BINDING_CONTRACTS = Object.freeze({
  'tether-slingshot-mid-arc': { targetKind: 'tether_anchor', evidenceId: 'tether:attached', cueId: 'tether.attach' },
  'seam-lit-asteroid-under-beam': { targetKind: 'asteroid', evidenceId: 'mining:tick', cueId: 'mining.seam.quality' },
  'station-approach-core-palette': { targetKind: 'station', evidenceId: 'dock:range', cueId: 'hud.dock.prompt' },
  'wedge-formation-telegraphing': { targetKind: 'hostile_squad', evidenceId: 'ai:telegraph', cueId: 'combat.doctrine.telegraph' },
  'cruise-streaks': { targetKind: 'player_ship', evidenceId: 'cruise:engaged', cueId: 'travel.cruise.engaged' },
  'capital-kill-bloom': { targetKind: 'capital_ship', evidenceId: 'entity:killed', cueId: 'combat.player.kill' },
});

function fixture() {
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(64, 1)]);
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(128, 2)]);
  const artifacts = new Map();
  const shots = MONEY_MOMENTS.map((moment, index) => {
    const path = `shots/${String(index + 1).padStart(2, '0')}-${moment.id}.png`;
    artifacts.set(path, png);
    const frameClaim = artifactClaimFromBytes(path, png);
    return {
      momentId: moment.id,
      predicateId: moment.predicateId,
      reached: true,
      width: 2560,
      height: 1440,
      hudVisible: true,
      authoredAssetsReady: true,
      canonicalRoot: true,
      publicActionCount: 2,
      ...frameClaim,
      binding: {
        targetId: `target-${index + 1}`,
        targetKind: MOMENT_BINDING_CONTRACTS[moment.id].targetKind,
        evidenceId: MOMENT_BINDING_CONTRACTS[moment.id].evidenceId,
        cueId: MOMENT_BINDING_CONTRACTS[moment.id].cueId,
        capturedTick: 100 + index,
        frameSha256: frameClaim.sha256,
      },
    };
  });
  artifacts.set('video/gameplay-60s.webm', webm);
  const decodedFrames = [5, 30, 55].map((atS, index) => {
    const path = `video/decoded-${index + 1}.png`;
    artifacts.set(path, png);
    return { atS, width: 1920, height: 1080, ...artifactClaimFromBytes(path, png) };
  });
  const manifest = {
    schema: RELEASE_CAPTURE_SCHEMA,
    captureId: 'release-capture-fixture',
    runtime: 'browser',
    canonicalUrl: 'http://127.0.0.1:41788/',
    candidate: { head: hash('a').slice(0, 40), worktreeDigest: hash('b'), selectionDigest: hash('c') },
    policy: {
      canonicalRootOnly: true,
      visibleKeyboardMouseOnly: true,
      noInjection: true,
      authoredAssetsRequired: true,
      hudRequired: true,
      noSubstitutions: true,
    },
    settings: {
      changedOnlyThroughVisibleUi: true,
      maximumPresetVerified: true,
      originalSha256: hash('d'),
      captureSha256: hash('e'),
      restoredSha256: hash('d'),
      restored: true,
      visibleActions: ['Settings', 'Video', 'Render scale=2.00x', 'Particle quality=High', 'Back'],
    },
    worktree: { beforeDigest: hash('b'), afterDigest: hash('b'), unchanged: true },
    route: {
      reusedVisualProbeServer: true,
      reusedAlphaLiveBaseline: true,
      browserIssues: [],
      publicActions: [{ seq: 1, kind: 'keyboard', value: 'Space' }, { seq: 2, kind: 'pointer', value: 'Launch' }],
    },
    producer: {
      entrypoint: 'scripts/capture-capsule-shots.mjs',
      runner: 'scripts/lib/releaseCaptureRunner.mjs',
    },
    cleanup: {
      completedBeforeManifest: true,
      shotPageClosed: true,
      shotContextClosed: true,
      videoPageClosed: true,
      videoContextClosed: true,
      browserClosed: true,
      serverClosed: true,
      canonicalTrackersPassed: true,
    },
    shots,
    video: {
      ...artifactClaimFromBytes('video/gameplay-60s.webm', webm),
      container: 'webm',
      durationS: 60.1,
      width: 1920,
      height: 1080,
      decodedFrameCount: 3,
      decodedFrames,
      runtimeSamples: Array.from({ length: 25 }, (_, index) => ({
        atS: index * 2.45,
        hudVisible: true,
        authoredAssetsReady: true,
        shipCount: 3,
      })),
      milestones: GAMEPLAY_MILESTONES.map((id, index) => ({ id, reached: true, atS: index * 9 + 1 })),
      hudVisibleThroughout: true,
      authoredAssetsThroughout: true,
    },
    artifacts: [],
  };
  manifest.artifacts = [...artifacts.entries()].map(([path, bytes]) => artifactClaimFromBytes(path, bytes));
  const verified = manifest.artifacts.map((claim) => ({ ...claim }));
  const verifiedMedia = {
    video: {
      path: manifest.video.path,
      bytes: manifest.video.bytes,
      sha256: manifest.video.sha256,
      container: manifest.video.container,
      durationS: manifest.video.durationS,
      width: manifest.video.width,
      height: manifest.video.height,
      magicVerified: true,
      ffprobeVerified: true,
    },
    decodedFrames: manifest.video.decodedFrames.map((frame) => ({
      ...frame,
      magicVerified: true,
      decodedFromVideoSha256: manifest.video.sha256,
    })),
  };
  const acceptedTreeFiles = [...manifest.artifacts.map((artifact) => artifact.path), 'manifest.json', 'receipt.json'].sort();
  return { manifest, artifacts, verified, verifiedMedia, acceptedTreeFiles };
}

test('release capture manifest requires six exact money moments and decoded 60-second WebM proof', () => {
  const { manifest, verified, verifiedMedia, acceptedTreeFiles } = fixture();
  const result = validateReleaseCaptureManifest(manifest, { verifiedArtifacts: verified, verifiedMedia, acceptedTreeFiles });
  assert.equal(result.ok, true, result.issues.join('\n'));
  assert.deepEqual(manifest.shots.map((shot) => shot.momentId), MONEY_MOMENTS.map((moment) => moment.id));
  assert.deepEqual(manifest.video.milestones.map((entry) => entry.id), GAMEPLAY_MILESTONES);
});

test('receipt is bound to canonical manifest bytes, artifact set, candidate, and worktree', () => {
  const { manifest, verified, verifiedMedia, acceptedTreeFiles } = fixture();
  const manifestBytes = Buffer.from(`${canonicalCaptureJson(manifest)}\n`);
  const receipt = buildReleaseCaptureReceipt({
    manifestBytes, manifest, verifiedArtifacts: verified, verifiedMedia, acceptedTreeFiles,
  });
  assert.equal(validateReleaseCaptureReceipt(receipt, {
    manifestBytes, manifest, verifiedArtifacts: verified, verifiedMedia, acceptedTreeFiles,
  }).ok, true);

  const tampered = Buffer.from(manifestBytes);
  tampered[tampered.length - 2] ^= 1;
  assert.equal(validateReleaseCaptureReceipt(receipt, {
    manifestBytes: tampered, manifest, verifiedArtifacts: verified, verifiedMedia, acceptedTreeFiles,
  }).ok, false);
  const wrongArtifacts = structuredClone(verified);
  wrongArtifacts[0].sha256 = hash('9');
  assert.equal(validateReleaseCaptureReceipt(receipt, {
    manifestBytes, manifest, verifiedArtifacts: wrongArtifacts, verifiedMedia, acceptedTreeFiles,
  }).ok, false);
});

test('hostile substitutions, hidden HUD, quality mutation, route drift, missing predicates, and weak video reject', () => {
  const cases = [
    ['substituted moment', (m) => { m.shots[1].momentId = m.shots[0].momentId; }],
    ['unreachable predicate', (m) => { m.shots[2].reached = false; }],
    ['wrong shot dimensions', (m) => { m.shots[3].width = 1920; }],
    ['HUD hidden', (m) => { m.shots[4].hudVisible = false; }],
    ['procedural fallback', (m) => { m.shots[5].authoredAssetsReady = false; }],
    ['query route', (m) => { m.canonicalUrl += '?capture=1'; }],
    ['state injection policy', (m) => { m.policy.noInjection = false; }],
    ['quality not visible UI', (m) => { m.settings.changedOnlyThroughVisibleUi = false; }],
    ['settings not restored', (m) => { m.settings.restoredSha256 = hash('8'); }],
    ['worktree changed', (m) => { m.worktree.afterDigest = hash('8'); }],
    ['short video', (m) => { m.video.durationS = 57.99; }],
    ['low-resolution video', (m) => { m.video.width = 1280; }],
    ['fake decode count', (m) => { m.video.decodedFrameCount = 0; m.video.decodedFrames = []; }],
    ['runtime HUD gap', (m) => { m.video.runtimeSamples[8].hudVisible = false; }],
    ['missing route milestone', (m) => { m.video.milestones[3].reached = false; }],
    ['browser issue', (m) => { m.route.browserIssues.push({ type: 'pageerror', text: 'boom' }); }],
    ['wrong target binding', (m) => { m.shots[1].binding.targetId = ''; }],
    ['unrelated evidence binding', (m) => { m.shots[1].binding.evidenceId = 'cruise:engaged'; }],
    ['unrelated cue binding', (m) => { m.shots[4].binding.cueId = 'combat.kill.capital'; }],
    ['frame not bound', (m) => { m.shots[5].binding.frameSha256 = hash('9'); }],
    ['cleanup incomplete', (m) => { m.cleanup.serverClosed = false; }],
    ['legacy producer', (m) => { m.producer.entrypoint = 'scripts/capture-gameplay.mjs'; }],
  ];
  for (const [label, mutate] of cases) {
    const { manifest, verified, verifiedMedia, acceptedTreeFiles } = fixture();
    mutate(manifest);
    assert.equal(validateReleaseCaptureManifest(manifest, {
      verifiedArtifacts: verified, verifiedMedia, acceptedTreeFiles,
    }).ok, false, label);
  }
});

test('independent media claims and exact accepted-tree allowlist are mandatory', () => {
  const { manifest, verified, verifiedMedia, acceptedTreeFiles } = fixture();
  const wrongMedia = structuredClone(verifiedMedia);
  wrongMedia.decodedFrames[1].sha256 = hash('9');
  assert.equal(validateReleaseCaptureManifest(manifest, {
    verifiedArtifacts: verified, verifiedMedia: wrongMedia, acceptedTreeFiles,
  }).ok, false, 'independently decoded frame mismatch must reject');
  assert.equal(validateReleaseCaptureManifest(manifest, {
    verifiedArtifacts: verified, verifiedMedia, acceptedTreeFiles: [...acceptedTreeFiles, 'alpha-route/05-dock-prompt.png'],
  }).ok, false, 'undeclared scratch file must reject');
  assert.equal(validateReleaseCaptureManifest(manifest, {
    verifiedArtifacts: verified, verifiedMedia, acceptedTreeFiles: acceptedTreeFiles.filter((file) => file !== 'receipt.json'),
  }).ok, false, 'incomplete accepted tree must reject');
});
