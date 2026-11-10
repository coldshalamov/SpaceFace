#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { validateArtifactFiles } from './lib/releaseSoakContracts.mjs';
import {
  GAMEPLAY_MILESTONES,
  MONEY_MOMENTS,
  MOMENT_BINDING_CONTRACTS,
  RELEASE_CAPTURE_SCHEMA,
  artifactClaimFromBytes,
  buildReleaseCaptureReceipt,
  canonicalCaptureJson,
  validateReleaseCaptureManifest,
  validateReleaseCaptureReceipt,
} from './lib/releaseCaptureContracts.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ACCEPTED_ROOT = path.join(ROOT, '.devshots', 'spec2', 'release-capture', 'accepted');
const execFileAsync = promisify(execFile);

if (process.argv.includes('--self-test')) {
  await runSelfTest();
} else {
  await validateAcceptedPacket();
}

async function validateAcceptedPacket() {
  const result = await validateAcceptedPacketAt(ACCEPTED_ROOT);
  console.log(`[check-release-capture] PASS ${result.manifest.captureId}: 6 shots + ${result.manifest.video.durationS}s WebM`);
}

async function validateAcceptedPacketAt(root) {
  const manifestBytes = await readFile(path.join(root, 'manifest.json'));
  const receipt = JSON.parse(await readFile(path.join(root, 'receipt.json'), 'utf8'));
  const manifest = JSON.parse(manifestBytes);
  const artifacts = await validateArtifactFiles(root, manifest.artifacts, { requireClaims: true });
  assert.equal(artifacts.pass, true, artifacts.failures.join('\n'));
  const verifiedMedia = await independentlyVerifyReleaseMedia(root, manifest.video);
  const acceptedTreeFiles = await listAcceptedTreeFiles(root);
  const manifestResult = validateReleaseCaptureManifest(manifest, {
    verifiedArtifacts: artifacts.verified,
    verifiedMedia,
    acceptedTreeFiles,
  });
  assert.equal(manifestResult.ok, true, manifestResult.issues.join('\n'));
  const receiptResult = validateReleaseCaptureReceipt(receipt, {
    manifestBytes,
    manifest,
    verifiedArtifacts: artifacts.verified,
    verifiedMedia,
    acceptedTreeFiles,
  });
  assert.equal(receiptResult.ok, true, receiptResult.issues.join('\n'));
  return { manifest, receipt, verifiedMedia, acceptedTreeFiles };
}

async function runSelfTest() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'spaceface-release-capture-'));
  try {
    const { manifest, verifiedMedia, acceptedTreeFiles } = await buildSelfTestPacket(temporary);
    const verifiedResult = await validateArtifactFiles(temporary, manifest.artifacts, { requireClaims: true });
    assert.equal(verifiedResult.pass, true, verifiedResult.failures.join('\n'));
    const validation = validateReleaseCaptureManifest(manifest, {
      verifiedArtifacts: verifiedResult.verified,
      verifiedMedia,
      acceptedTreeFiles,
    });
    assert.equal(validation.ok, true, validation.issues.join('\n'));
    const manifestBytes = Buffer.from(`${canonicalCaptureJson(manifest)}\n`);
    const receipt = buildReleaseCaptureReceipt({
      manifestBytes,
      manifest,
      verifiedArtifacts: verifiedResult.verified,
      verifiedMedia,
      acceptedTreeFiles,
    });
    assert.equal(validateReleaseCaptureReceipt(receipt, {
      manifestBytes,
      manifest,
      verifiedArtifacts: verifiedResult.verified,
      verifiedMedia,
      acceptedTreeFiles,
    }).ok, true);

    const hostileCases = [
      ['shot substitution', (doc) => { doc.shots[1].momentId = doc.shots[0].momentId; }],
      ['unreached predicate', (doc) => { doc.shots[0].reached = false; }],
      ['wrong screenshot size', (doc) => { doc.shots[0].width = 1920; }],
      ['hidden HUD', (doc) => { doc.shots[0].hudVisible = false; }],
      ['fallback asset', (doc) => { doc.shots[0].authoredAssetsReady = false; }],
      ['query route', (doc) => { doc.canonicalUrl += '?debug=1'; }],
      ['injection allowed', (doc) => { doc.policy.noInjection = false; }],
      ['quality bypass', (doc) => { doc.settings.changedOnlyThroughVisibleUi = false; }],
      ['settings drift', (doc) => { doc.settings.restoredSha256 = '9'.repeat(64); }],
      ['worktree drift', (doc) => { doc.worktree.afterDigest = '9'.repeat(64); }],
      ['short video', (doc) => { doc.video.durationS = 57.9; }],
      ['small video', (doc) => { doc.video.height = 720; }],
      ['missing decode', (doc) => { doc.video.decodedFrames = []; doc.video.decodedFrameCount = 0; }],
      ['runtime HUD gap', (doc) => { doc.video.runtimeSamples[8].hudVisible = false; }],
      ['missing milestone', (doc) => { doc.video.milestones[2].reached = false; }],
      ['browser issue', (doc) => { doc.route.browserIssues.push({ type: 'pageerror', text: 'boom' }); }],
      ['wrong bound target', (doc) => { doc.shots[0].binding.targetId = ''; }],
      ['wrong bound cue', (doc) => { doc.shots[1].binding.cueId = 'travel.cruise.engaged'; }],
      ['wrong bound frame', (doc) => { doc.shots[2].binding.frameSha256 = '9'.repeat(64); }],
      ['cleanup incomplete', (doc) => { doc.cleanup.browserClosed = false; }],
      ['legacy producer', (doc) => { doc.producer.entrypoint = 'scripts/capture-gameplay.mjs'; }],
    ];
    for (const [label, mutate] of hostileCases) {
      const hostile = structuredClone(manifest);
      mutate(hostile);
      assert.equal(validateReleaseCaptureManifest(hostile, {
        verifiedArtifacts: verifiedResult.verified,
        verifiedMedia,
        acceptedTreeFiles,
      }).ok, false, label);
    }

    const fakeRoot = path.join(temporary, 'fake-media');
    await mkdir(path.join(fakeRoot, 'video'), { recursive: true });
    const fakeBytes = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(160, 7)]);
    await writeFile(path.join(fakeRoot, 'video', 'gameplay-60s.webm'), fakeBytes);
    await assert.rejects(
      () => independentlyVerifyReleaseMedia(fakeRoot, {
        ...manifest.video,
        ...artifactClaimFromBytes('video/gameplay-60s.webm', fakeBytes),
      }),
      /ffprobe|Invalid data|media/i,
      'synthetic EBML header cannot satisfy independent media verification',
    );

    await writeFile(path.join(temporary, 'run.log'), 'undeclared scratch');
    const treeWithExtra = await listAcceptedTreeFiles(temporary);
    assert.equal(validateReleaseCaptureManifest(manifest, {
      verifiedArtifacts: verifiedResult.verified,
      verifiedMedia,
      acceptedTreeFiles: treeWithExtra,
    }).ok, false, 'undeclared accepted-tree file must reject');
    await rm(path.join(temporary, 'run.log'));

    await assertRunnerWiring();
    console.log(`[check-release-capture] PASS self-test: real ffprobe/ffmpeg proof + ${hostileCases.length + 2} hostile cases; no browser launched`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function buildSelfTestPacket(root) {
  const png = makePngHeader(2560, 1440);
  const artifactBytes = new Map();
  const shots = [];
  for (const [index, moment] of MONEY_MOMENTS.entries()) {
    const artifactPath = `shots/${String(index + 1).padStart(2, '0')}-${moment.id}.png`;
    artifactBytes.set(artifactPath, png);
    const claim = artifactClaimFromBytes(artifactPath, png);
    const binding = MOMENT_BINDING_CONTRACTS[moment.id];
    shots.push({
      momentId: moment.id,
      predicateId: moment.predicateId,
      reached: true,
      width: 2560,
      height: 1440,
      hudVisible: true,
      authoredAssetsReady: true,
      canonicalRoot: true,
      publicActionCount: 3,
      ...claim,
      binding: {
        targetId: `self-test-target-${index + 1}`,
        targetKind: binding.targetKind,
        evidenceId: binding.evidenceId,
        cueId: binding.cueId,
        capturedTick: 100 + index,
        frameSha256: claim.sha256,
      },
    });
  }
  const videoPath = path.join(root, 'video', 'gameplay-60s.webm');
  await mkdir(path.dirname(videoPath), { recursive: true });
  await createSelfTestWebm(videoPath);
  const webm = await readFile(videoPath);
  artifactBytes.set('video/gameplay-60s.webm', webm);
  const decodedFrames = [];
  for (const [index, atS] of [5, 30, 55].entries()) {
    const artifactPath = `video/decoded-${index + 1}.png`;
    const fullPath = path.join(root, artifactPath);
    await decodeVideoFrame(videoPath, fullPath, atS);
    const videoFrame = await readFile(fullPath);
    const dimensions = inspectPngBytes(videoFrame, artifactPath);
    artifactBytes.set(artifactPath, videoFrame);
    decodedFrames.push({ atS, ...dimensions, ...artifactClaimFromBytes(artifactPath, videoFrame) });
  }
  for (const [artifactPath, bytes] of artifactBytes) {
    const fullPath = path.join(root, artifactPath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, bytes);
  }
  const media = await probeWebm(videoPath);
  const hash = (character) => character.repeat(64);
  const manifest = {
    schema: RELEASE_CAPTURE_SCHEMA,
    captureId: 'headless-self-test',
    runtime: 'browser',
    canonicalUrl: 'http://127.0.0.1:41788/',
    candidate: { head: 'a'.repeat(40), worktreeDigest: hash('b'), selectionDigest: hash('c') },
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
      visibleActions: ['Settings', 'Video', 'Render scale=2', 'Particle quality=high', 'Back'],
    },
    worktree: { beforeDigest: hash('b'), afterDigest: hash('b'), unchanged: true },
    route: {
      reusedVisualProbeServer: true,
      reusedAlphaLiveBaseline: true,
      browserIssues: [],
      publicActions: [
        { seq: 1, kind: 'keyboard', value: 'Space' },
        { seq: 2, kind: 'pointer', value: 'New Game' },
        { seq: 3, kind: 'settings_control', value: 'Render scale=2' },
      ],
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
      durationS: media.durationS,
      width: media.width,
      height: media.height,
      decodedFrameCount: decodedFrames.length,
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
    artifacts: [...artifactBytes].map(([artifactPath, bytes]) => artifactClaimFromBytes(artifactPath, bytes)),
  };
  const verifiedMedia = await independentlyVerifyReleaseMedia(root, manifest.video);
  const acceptedTreeFiles = [...manifest.artifacts.map((artifact) => artifact.path), 'manifest.json', 'receipt.json'].sort();
  const verifiedArtifacts = (await validateArtifactFiles(root, manifest.artifacts, { requireClaims: true })).verified;
  const manifestBytes = Buffer.from(`${canonicalCaptureJson(manifest)}\n`);
  const receipt = buildReleaseCaptureReceipt({
    manifestBytes,
    manifest,
    verifiedArtifacts,
    verifiedMedia,
    acceptedTreeFiles,
  });
  await writeFile(path.join(root, 'manifest.json'), manifestBytes);
  await writeFile(path.join(root, 'receipt.json'), `${canonicalCaptureJson(receipt)}\n`);
  await validateAcceptedPacketAt(root);
  return { manifest, verifiedMedia, acceptedTreeFiles };
}

async function assertRunnerWiring() {
  const runnerPath = path.join(ROOT, 'scripts', 'lib', 'releaseCaptureRunner.mjs');
  const runner = await readFile(runnerPath, 'utf8');
  for (const required of [
    'acquireVisualProbeServer',
    'loadPlaywright',
    'collectPageIssues',
    'runBrowserPublicRoute',
    'publishAcceptedArtifacts',
    'worktreeFingerprint',
    'strictWorktreeFingerprint',
    'validateArtifactFiles',
    'recordVideo',
    'ffprobe',
    'ffmpeg',
  ]) assert(runner.includes(required), `release runner must reuse ${required}`);
  for (const forbidden of [
    /\.bus\.emit\s*\(/,
    /localStorage\.(?:setItem|removeItem|clear)\s*\(/,
    /sessionStorage\.(?:setItem|removeItem|clear)\s*\(/,
    /\.entities\.(?:add|delete|clear|set|spawn|destroy)\s*\(/,
    /window\.SF\.state\s*=/,
  ]) assert.equal(forbidden.test(runner), false, `release runner contains forbidden injection pattern ${forbidden}`);
  for (const wrapper of ['capture-capsule-shots.mjs', 'capture-gameplay-60s.mjs']) {
    const source = await readFile(path.join(ROOT, 'scripts', wrapper), 'utf8');
    assert(source.includes("from './lib/releaseCaptureRunner.mjs'"), `${wrapper} must use the single release runner`);
    assert(source.includes(`producerEntrypoint: 'scripts/${wrapper}'`), `${wrapper} must identify its approved producer path`);
    assert.equal(source.includes("producerEntrypoint: 'scripts/capture-gameplay.mjs'"), false,
      `${wrapper} cannot identify the legacy producer`);
  }
}

async function independentlyVerifyReleaseMedia(root, video) {
  assert(video && typeof video === 'object', 'media verification requires declared video');
  const videoPath = path.join(root, video.path);
  const videoBytes = await readFile(videoPath);
  assert(videoBytes.length > 4 && videoBytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
    'media verification rejected non-WebM magic');
  const claim = artifactClaimFromBytes(video.path, videoBytes);
  const probed = await probeWebm(videoPath);
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'spaceface-release-decode-'));
  try {
    const decodedFrames = [];
    for (const [index, expected] of (video.decodedFrames || []).entries()) {
      const decodedPath = path.join(temporary, `decoded-${index + 1}.png`);
      await decodeVideoFrame(videoPath, decodedPath, expected.atS);
      const decodedBytes = await readFile(decodedPath);
      const dimensions = inspectPngBytes(decodedBytes, expected.path);
      const storedBytes = await readFile(path.join(root, expected.path));
      inspectPngBytes(storedBytes, expected.path);
      const independentClaim = artifactClaimFromBytes(expected.path, decodedBytes);
      assert.equal(independentClaim.sha256, artifactClaimFromBytes(expected.path, storedBytes).sha256,
        `independent ffmpeg frame hash mismatch at ${expected.atS}s`);
      decodedFrames.push({
        atS: expected.atS,
        ...dimensions,
        ...independentClaim,
        magicVerified: true,
        decodedFromVideoSha256: claim.sha256,
      });
    }
    return {
      video: {
        ...claim,
        container: probed.container,
        durationS: probed.durationS,
        width: probed.width,
        height: probed.height,
        magicVerified: true,
        ffprobeVerified: true,
      },
      decodedFrames,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function createSelfTestWebm(outputPath) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=black:s=1920x1080:r=1:d=60',
    '-an',
    '-c:v', 'libvpx-vp9',
    '-deadline', 'realtime',
    '-cpu-used', '8',
    '-b:v', '160k',
    '-pix_fmt', 'yuv420p',
    outputPath,
  ], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
}

async function probeWebm(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration,format_name',
    '-of', 'json',
    filePath,
  ], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0] || {};
  assert(/webm|matroska/i.test(String(parsed.format?.format_name || '')), 'ffprobe did not identify WebM/Matroska media');
  const width = Number(stream.width);
  const height = Number(stream.height);
  const durationS = Math.round(Number(parsed.format?.duration) * 1000) / 1000;
  assert(Number.isInteger(width) && Number.isInteger(height) && Number.isFinite(durationS),
    'ffprobe media dimensions/duration are invalid');
  return { container: 'webm', width, height, durationS };
}

async function decodeVideoFrame(inputPath, outputPath, atS) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-y', '-ss', String(atS), '-i', inputPath,
    '-map_metadata', '-1', '-threads', '1', '-frames:v', '1', outputPath,
  ], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
}

function inspectPngBytes(bytes, label) {
  assert(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    `${label} is not a real PNG frame`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert(width > 0 && height > 0, `${label} has invalid PNG dimensions`);
  return { width, height };
}

async function listAcceptedTreeFiles(root) {
  const files = [];
  async function visit(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      const metadata = await lstat(absolute);
      assert.equal(metadata.isSymbolicLink(), false, `accepted tree refuses symbolic link ${relative}`);
      if (metadata.isDirectory()) await visit(absolute, relative);
      else {
        assert.equal(metadata.isFile(), true, `accepted tree refuses non-file ${relative}`);
        files.push(relative.replace(/\\/g, '/'));
      }
    }
  }
  await visit(root);
  return files.sort();
}

function makePngHeader(width, height) {
  const bytes = Buffer.alloc(64, 0);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}
