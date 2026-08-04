import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { test } from 'node:test';

import {
  PERFORMANCE_LIFECYCLE_SCHEMA,
  foregroundWindowSequenceSettled,
  foregroundWindowsComparable,
  summarizeLifecycleDelta,
  validatePerformanceLifecycleEvidence,
} from '../scripts/lib/performanceLifecycleContracts.mjs';
import {
  PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES,
  createBrowserWindowLifecycleDriver,
  createElectronFocusSink,
  createElectronLifecycleLaunchOptions,
  destroyElectronFocusSink,
  driveElectronWindow,
  extractLifecycleClaimIdentity,
  findPresentLifecycleBackgroundSwitches,
  focusRuntimeForLifecycleSample,
  isHiddenLifecycleReady,
  measureSettledForegroundWindow,
  readElectronWindowState,
  setBrowserWindowLifecycleState,
  unlockAudioWithKeyboard,
} from '../scripts/lib/performanceLifecycleProbe.mjs';
import {
  buildOwnedChromeLifecycleArgs,
  normalizeRawNavigationUrl,
  RAW_CDP_LIFECYCLE_INITIALIZATION_COMMANDS,
  RawCdpLifecyclePage,
} from '../scripts/lib/rawCdpLifecycleBrowser.mjs';

const DIGEST = 'a'.repeat(64);

function transition(id, trigger) {
  const electron = trigger !== 'document-visibility';
  return {
    id,
    trigger,
    native: true,
    hiddenState: 'hidden-or-minimized',
    documentVisibilityDuring: electron ? 'visible' : 'hidden',
    hiddenDurationMs: 750,
    hiddenDelta: {
      executedFrames: 0,
      renderUpdates: 0,
      simulationCompletedTicks: 0,
      stateTicks: 0,
      simTime: 0,
      gpuSubmissions: 0,
    },
    suspendDelta: 1,
    resumeDelta: 1,
    restoreFrameDelta: 1,
    timestampResetDelta: 2,
    shedBacklogDelta: 0,
    maxStepsAfter: 1,
    postRestoreFrameDelta: 1,
    postRestoreShedBacklogDelta: 0,
    postRestoreMaxStepsAfter: 1,
    input: {
      heldBefore: true,
      neutralWhileHidden: true,
      neutralAfterRestore: true,
    },
    audio: {
      contextWasRunning: true,
      lifecycleSuspendedWhileHidden: true,
      frameOwnerWhileHidden: false,
      contextSuspendedWhileHidden: true,
      lifecycleSuspendedAfterRestore: false,
      contextRunningAfterRestore: true,
    },
    nativeWindowBefore: electron
      ? { available: true, minimized: false, visible: true, focused: true, hidden: false }
      : null,
    nativeWindowDuring: electron
      ? { available: true, minimized: trigger === 'window-minimize', visible: false, focused: false, hidden: true }
      : null,
    nativeWindowAfter: electron
      ? { available: true, minimized: false, visible: true, focused: true, hidden: false }
      : null,
  };
}

function passingEvidence(runtimeKind = 'browser') {
  const triggers = runtimeKind === 'browser'
    ? Array(4).fill('document-visibility')
    : ['window-minimize', 'window-hide', 'window-minimize', 'window-hide'];
  return {
    schema: PERFORMANCE_LIFECYCLE_SCHEMA,
    pass: true,
    primaryAcceptance: true,
    runtimeKind,
    fixedSeed: 35035,
    candidateCommit: 'b'.repeat(40),
    claim: {
      claimId: 'claim-1',
      candidateDigest: DIGEST,
      sourceCandidateDigest: DIGEST,
      routeDigest: DIGEST,
      regressionDigest: DIGEST,
    },
    route: {
      canonicalRoot: true,
      mode: 'flight',
      seed: 35035,
      defaultSettings: true,
      authoredVisualReady: true,
      signatureBefore: DIGEST,
      signatureAfter: DIGEST,
    },
    gpu: {
      hasContext: true,
      source: 'game-renderer',
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel UHD Direct3D11)',
      software: false,
    },
    launchPolicy: {
      schema: 'spaceface.performanceLifecycleLaunchPolicy.v1',
      driver: runtimeKind === 'browser'
        ? 'owned-chrome-raw-cdp'
        : 'harness-electron-preload-remove-switch',
      forbiddenSwitches: [...PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES],
      presentBefore: runtimeKind === 'browser' ? [] : [...PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES],
      presentAfter: [],
      observedCommandLine: true,
      focusEmulationDisabled: true,
      appliedBeforeAppReady: true,
      productRuntimeOverride: false,
      nativeDefaultsRestored: true,
    },
    driver: runtimeKind === 'browser'
      ? { kind: 'browser-window-minimize', observedDocumentHidden: true, synthetic: false }
      : { kind: 'electron-browser-window', observedNativeWindowState: true, synthetic: false },
    foreground: {
      baseline: { executedFrames: 36, renderUpdates: 36, simulationCompletedTicks: 36, stateTicks: 36, gpuSubmissions: 420 },
      resumed: { executedFrames: 35, renderUpdates: 35, simulationCompletedTicks: 35, stateTicks: 35, gpuSubmissions: 415 },
      cadenceRatio: 35 / 36,
      sampleMs: 650,
      warmupMs: 5_000,
      settleWindows: [
        { executedFrames: 35 },
        { executedFrames: 35 },
        { executedFrames: 36 },
      ],
    },
    occlusion: runtimeKind === 'electron' ? {
      trigger: 'native-focus-transfer',
      native: true,
      state: 'foreground-occluded',
      restoredState: 'foreground-visible',
      executedFrames: 20,
      renderUpdates: 20,
      simulationCompletedTicks: 20,
      nativeWindowDuring: {
        available: true,
        windowId: 41,
        minimized: false,
        visible: true,
        focused: false,
        hidden: false,
      },
      focusTransfer: {
        driver: 'harness-native-browser-window',
        synthetic: false,
        mainWindowId: 41,
        sinkWindowId: 42,
        sinkNativeDuring: {
          available: true,
          windowId: 42,
          minimized: false,
          visible: true,
          focused: true,
          hidden: false,
        },
        cleanup: {
          mainWindowId: 41,
          sinkWindowId: 42,
          existed: true,
          destroyed: true,
        },
      },
    } : null,
    transitions: triggers.map((trigger, index) => transition(`${runtimeKind}-${index + 1}`, trigger)),
    soak: {
      cycles: 4,
      suspendDelta: 4,
      resumeDelta: 4,
      restoreFrameDelta: 4,
      duplicateShellCommandDelta: 0,
      staleShellCommandDelta: 0,
      invalidShellCommandDelta: 0,
      shedBacklogDelta: 0,
      maxStepsAfter: 1,
      postRestoreFrameDelta: 4,
      postRestoreShedBacklogDelta: 0,
      postRestoreMaxStepsAfter: 1,
    },
    physicalPower: {
      claimed: false,
      driver: null,
      reason: 'OS suspend and workstation lock were not safely driven by this acceptance process.',
    },
    errors: [],
    cleanup: runtimeKind === 'browser'
      ? {
        pass: true,
        pageClosed: true,
        contextClosed: true,
        runtimeClosed: true,
        serverClosed: true,
        profileRemoved: true,
        windowDriverClosed: true,
      }
      : {
        pass: true,
        pageClosed: true,
        runtimeClosed: true,
        listenerClosed: true,
        profileRemoved: true,
        windowDriverClosed: true,
      },
  };
}

test('lifecycle delta keeps exact counter and simulation differences', () => {
  const before = {
    tick: 40,
    simTime: 2,
    gpuSubmissions: 100,
    loop: { executedFrames: 20, renderUpdates: 20, suspendCount: 1 },
    simulation: { completedSequence: 40 },
  };
  const after = {
    tick: 40,
    simTime: 2,
    gpuSubmissions: 100,
    loop: { executedFrames: 20, renderUpdates: 20, suspendCount: 2 },
    simulation: { completedSequence: 40 },
  };
  assert.deepEqual(summarizeLifecycleDelta(before, after), {
    executedFrames: 0,
    renderUpdates: 0,
    simulationCompletedTicks: 0,
    stateTicks: 0,
    simTime: 0,
    gpuSubmissions: 0,
    suspendCount: 1,
  });
});

test('foreground settling rejects a warmup window and accepts consecutive normal cadence', () => {
  assert.equal(foregroundWindowsComparable({ executedFrames: 6 }, { executedFrames: 32 }), false);
  assert.equal(foregroundWindowsComparable({ executedFrames: 30 }, { executedFrames: 21 }), false);
  assert.equal(foregroundWindowsComparable({ executedFrames: 31 }, { executedFrames: 32 }), true);
  assert.equal(foregroundWindowSequenceSettled([
    { executedFrames: 27 },
    { executedFrames: 25 },
  ]), false, 'the spent Electron claim two-window plateau is not settled');
  assert.equal(foregroundWindowSequenceSettled([
    { executedFrames: 27 },
    { executedFrames: 25 },
    { executedFrames: 38 },
  ]), false, 'a later cadence step invalidates the prior plateau');
  assert.equal(foregroundWindowSequenceSettled([
    { executedFrames: 20 },
    { executedFrames: 24 },
    { executedFrames: 27 },
  ]), false, 'pairwise drift cannot compound across the settled suffix');
  assert.equal(foregroundWindowSequenceSettled([
    { executedFrames: 38 },
    { executedFrames: 39 },
    { executedFrames: 38 },
  ]), true);
});

test('foreground settling reacquires native focus after the long warmup before sampling', async () => {
  const calls = [];
  const samples = [27, 25, 38, 39, 38];
  const runtime = { runtimeKind: 'electron', page: { id: 'page' } };
  const result = await measureSettledForegroundWindow(runtime, {
    warmupMs: 5_000,
    settleAttempts: samples.length,
    waitForWarmup: async (milliseconds) => calls.push(['warmup', milliseconds]),
    focusAfterWarmup: async (value) => calls.push(['focus', value.runtimeKind]),
    measureWindow: async (page) => {
      const executedFrames = samples.shift();
      calls.push(['measure', page.id, executedFrames]);
      return { delta: { executedFrames } };
    },
  });
  assert.deepEqual(calls.slice(0, 2), [
    ['warmup', 5_000],
    ['focus', 'electron'],
  ]);
  assert.equal(result.delta.executedFrames, 38);
  assert.deepEqual(result.settleWindows.map((window) => window.executedFrames), [27, 25, 38, 39, 38]);
});

test('hidden lifecycle readiness waits for synchronous input-owner neutralization', () => {
  const hidden = {
    lifecycleState: 'hidden-or-minimized',
    documentVisibility: 'hidden',
    audio: { lifecycleSuspended: true, frameOwner: false, contextState: 'suspended' },
    input: { neutral: false, ownerNeutral: false },
  };
  assert.equal(isHiddenLifecycleReady(hidden, 'browser'), false);
  hidden.input.ownerNeutral = true;
  assert.equal(isHiddenLifecycleReady(hidden, 'browser'), true);
  hidden.documentVisibility = 'visible';
  assert.equal(isHiddenLifecycleReady(hidden, 'browser'), false);
  assert.equal(isHiddenLifecycleReady(hidden, 'electron'), true);
});

test('Electron cadence sampling restores native focus before observing foreground readiness', async () => {
  const calls = [];
  const runtime = {
    runtimeKind: 'electron',
    mainWindowId: 42,
    page: { id: 'page' },
    electronApp: {
      async evaluate(_callback, payload) {
        calls.push(['window', payload.requestedAction, payload.targetWindowId]);
        return { action: payload.requestedAction, minimized: false, visible: true, focused: true };
      },
    },
    windowActivator: {
      async activate() { calls.push(['native-activate', 42]); },
    },
  };
  await focusRuntimeForLifecycleSample(runtime, {
    waitForForeground: async (page, predicate, label) => {
      calls.push(['wait', page.id, label]);
      assert.equal(predicate({ lifecycleState: 'foreground-occluded' }), false);
      assert.equal(predicate({ lifecycleState: 'foreground-visible' }), true);
      return { lifecycleState: 'foreground-visible' };
    },
  });
  assert.deepEqual(calls, [
    ['window', 'restore', 42],
    ['native-activate', 42],
    ['wait', 'page', 'electron foreground sample focus'],
  ]);
});

test('Electron focus sink targets and cleans exact native window identities', async () => {
  class FakeBrowserWindow {
    static nextId = 1;
    static windows = new Map();

    static fromId(id) {
      return this.windows.get(id) || null;
    }

    constructor(options = {}) {
      this.id = FakeBrowserWindow.nextId++;
      this.visible = options.show === true;
      this.focused = false;
      this.minimized = false;
      this.destroyed = false;
      FakeBrowserWindow.windows.set(this.id, this);
    }

    isDestroyed() { return this.destroyed; }
    isMinimized() { return this.minimized; }
    isVisible() { return this.visible; }
    isFocused() { return this.focused; }
    minimize() { this.minimized = true; this.visible = true; this.focused = false; }
    restore() { this.minimized = false; }
    hide() { this.visible = false; this.focused = false; }
    show() { this.visible = true; }
    moveTop() {}
    setMenuBarVisibility() {}
    focus() {
      for (const window of FakeBrowserWindow.windows.values()) window.focused = false;
      this.focused = true;
    }
    destroy() {
      this.destroyed = true;
      this.visible = false;
      this.focused = false;
      FakeBrowserWindow.windows.delete(this.id);
    }
  }

  const electronApp = {
    async evaluate(callback, payload) {
      return callback({
        BrowserWindow: FakeBrowserWindow,
        screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
      }, payload);
    },
  };
  const decoy = new FakeBrowserWindow({ show: true });
  const main = new FakeBrowserWindow({ show: true });
  main.focus();

  await driveElectronWindow(electronApp, 'hide', main.id);
  assert.equal(main.isVisible(), false);
  assert.equal(decoy.isVisible(), true, 'unrelated window was not targeted');
  await driveElectronWindow(electronApp, 'show', main.id);

  const transfer = await createElectronFocusSink(electronApp, main.id);
  assert.equal(transfer.mainWindowId, main.id);
  assert.notEqual(transfer.sinkWindowId, main.id);
  assert.equal(main.isFocused(), false);
  assert.equal((await readElectronWindowState(electronApp, transfer.sinkWindowId)).focused, true);

  const cleanup = await destroyElectronFocusSink(electronApp, main.id, transfer.sinkWindowId);
  assert.deepEqual(cleanup, {
    mainWindowId: main.id,
    sinkWindowId: transfer.sinkWindowId,
    existed: true,
    destroyed: true,
  });
  assert.equal(FakeBrowserWindow.fromId(transfer.sinkWindowId), null);
  assert.equal(FakeBrowserWindow.fromId(main.id), main);
});

test('broker claim identity is extracted from authoritative nested digests', () => {
  const identity = extractLifecycleClaimIdentity({
    claimId: 'claim-nested',
    digests: {
      candidateDigest: 'a'.repeat(64),
      sourceCandidateDigest: 'b'.repeat(64),
      productionDigest: 'c'.repeat(64),
      regressionDigest: 'd'.repeat(64),
    },
  });
  assert.deepEqual(identity, {
    claimId: 'claim-nested',
    candidateDigest: 'a'.repeat(64),
    sourceCandidateDigest: 'b'.repeat(64),
    routeDigest: 'c'.repeat(64),
    regressionDigest: 'd'.repeat(64),
  });
});

test('Browser and Electron native lifecycle evidence pass the same fail-closed contract', () => {
  for (const runtimeKind of ['browser', 'electron']) {
    const result = validatePerformanceLifecycleEvidence(passingEvidence(runtimeKind), { runtimeKind });
    assert.equal(result.pass, true, `${runtimeKind}: ${result.failures.join('; ')}`);
    assert.deepEqual(result.failures, []);
  }
});

test('hidden work, stale input, audio drift, and restore storms each invalidate acceptance', () => {
  const mutations = [
    ['hidden frame', (e) => { e.transitions[0].hiddenDelta.executedFrames = 1; }, /hidden executedFrames/],
    ['hidden sim tick', (e) => { e.transitions[0].hiddenDelta.stateTicks = 1; }, /hidden stateTicks/],
    ['hidden GPU submission', (e) => { e.transitions[0].hiddenDelta.gpuSubmissions = 1; }, /hidden gpuSubmissions/],
    ['held input leak', (e) => { e.transitions[0].input.neutralWhileHidden = false; }, /input was not neutral while hidden/],
    ['audio owner leak', (e) => { e.transitions[0].audio.frameOwnerWhileHidden = true; }, /audio frame owner survived/],
    ['audio restore failure', (e) => { e.transitions[0].audio.contextRunningAfterRestore = false; }, /audio context did not restore/],
    ['restore storm', (e) => { e.transitions[0].restoreFrameDelta = 2; }, /exactly one restore frame/],
    ['missing post-restore frame', (e) => { e.transitions[0].postRestoreFrameDelta = 0; }, /measured post-restore frame/],
    ['backlog shedding', (e) => { e.transitions[0].postRestoreShedBacklogDelta = 1; }, /post-restore frame shed backlog/],
    ['catch-up overflow', (e) => { e.transitions[0].postRestoreMaxStepsAfter = 5; }, /four-step cap/],
    ['missing catch-up observation', (e) => { delete e.transitions[0].postRestoreMaxStepsAfter; }, /four-step cap/],
    ['native window gap', (e) => { e.transitions[0].nativeWindowDuring.hidden = false; }, /BrowserWindow lifecycle state/],
    ['focus transfer not observed', (e) => { e.occlusion.nativeWindowDuring.focused = true; }, /occlusion evidence/],
    ['focus sink not destroyed', (e) => { e.occlusion.focusTransfer.cleanup.destroyed = false; }, /focus-sink/],
  ];
  for (const [name, mutate, expected] of mutations) {
    const evidence = passingEvidence('electron');
    mutate(evidence);
    const result = validatePerformanceLifecycleEvidence(evidence, { runtimeKind: 'electron' });
    assert.equal(result.pass, false, name);
    assert.match(result.failures.join('\n'), expected, name);
  }
});

test('driver provenance, foreground equivalence, soak uniqueness, hardware, and cleanup fail closed', () => {
  const mutations = [
    ['synthetic driver', (e) => { e.driver.synthetic = true; }, /synthetic lifecycle driver/],
    ['missing driver provenance', (e) => { delete e.driver.synthetic; }, /synthetic lifecycle driver/],
    ['visibility not observed', (e) => { e.driver.observedDocumentHidden = false; }, /document.hidden/],
    ['signature drift', (e) => { e.route.signatureAfter = 'b'.repeat(64); }, /route signature changed/],
    ['seed drift', (e) => { e.route.seed = 7; }, /route seed mismatch/],
    ['authored route not ready', (e) => { e.route.authoredVisualReady = false; }, /authored visual readiness/],
    ['foreground stalled', (e) => { e.foreground.resumed.executedFrames = 0; }, /resumed foreground executed no frames/],
    ['fabricated cadence', (e) => { e.foreground.cadenceRatio = 1; }, /does not match frame counters/],
    ['short foreground warmup', (e) => { e.foreground.warmupMs = 1_000; }, /at least 5000 ms/],
    ['short foreground sample', (e) => { e.foreground.sampleMs = 100; }, /sample is too short/],
    ['cadence regression', (e) => { e.foreground.cadenceRatio = 0.2; }, /cadence ratio/],
    ['duplicate command', (e) => { e.soak.duplicateShellCommandDelta = 1; }, /duplicate shell commands/],
    ['software renderer', (e) => { e.gpu.software = true; }, /hardware GPU/],
    ['missing hardware classification', (e) => { delete e.gpu.software; }, /hardware GPU/],
    ['background execution switch', (e) => {
      e.launchPolicy.presentAfter.push('--disable-renderer-backgrounding');
    }, /background execution switches survived/],
    ['invalid launch pre-state', (e) => { e.launchPolicy.presentBefore = ['--unrelated']; }, /pre-state is invalid/],
    ['product lifecycle override', (e) => {
      e.launchPolicy.productRuntimeOverride = true;
    }, /product runtime override/],
    ['focus emulation override', (e) => {
      e.launchPolicy.focusEmulationDisabled = false;
    }, /focus emulation still masks/],
    ['cleanup leak', (e) => { e.cleanup.runtimeClosed = false; }, /cleanup/],
    ['runtime errors', (e) => { e.errors.push({ type: 'pageerror', text: 'boom' }); }, /runtime errors/],
  ];
  for (const [name, mutate, expected] of mutations) {
    const evidence = passingEvidence('browser');
    mutate(evidence);
    const result = validatePerformanceLifecycleEvidence(evidence, { runtimeKind: 'browser' });
    assert.equal(result.pass, false, name);
    assert.match(result.failures.join('\n'), expected, name);
  }
});

test('native lifecycle launch policy avoids Playwright page emulation and background switches', () => {
  assert.deepEqual(PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES, [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ]);
  const browserArgs = buildOwnedChromeLifecycleArgs({
    userDataDir: 'C:\\tmp\\owned-profile',
    rootUrl: 'about:blank',
    viewport: { width: 1440, height: 900 },
  });
  assert.ok(browserArgs.includes('--user-data-dir=C:\\tmp\\owned-profile'));
  assert.ok(browserArgs.includes('--remote-debugging-port=0'));
  assert.ok(browserArgs.includes('--window-size=1440,900'));
  assert.deepEqual(findPresentLifecycleBackgroundSwitches(browserArgs), []);
  assert.equal(RAW_CDP_LIFECYCLE_INITIALIZATION_COMMANDS.includes('Emulation.setFocusEmulationEnabled'), false);
  assert.equal(RAW_CDP_LIFECYCLE_INITIALIZATION_COMMANDS.includes('Target.setAutoAttach'), false);
  assert.equal(normalizeRawNavigationUrl('http://127.0.0.1:8123'), 'http://127.0.0.1:8123/');

  const portableRoot = path.resolve('repo');
  const portablePreload = path.join(portableRoot, 'scripts', 'lib', 'performanceLifecycleLaunchPolicy.cjs');
  const electron = createElectronLifecycleLaunchOptions(
    { args: ['.'], cwd: portableRoot },
    { policyPreloadPath: portablePreload },
  );
  assert.equal(electron.cwd, portableRoot);
  assert.deepEqual(electron.args, [
    '-r',
    portablePreload,
    '.',
  ]);
  assert.deepEqual(findPresentLifecycleBackgroundSwitches([
    'chrome.exe',
    '--disable-renderer-backgrounding=false',
    '--unrelated-disable-background-timer-throttling',
  ]), ['--disable-renderer-backgrounding']);
  assert.deepEqual(findPresentLifecycleBackgroundSwitches(['chrome.exe', '--incognito']), []);
});

test('raw Browser window driver never installs the Playwright focus override', async () => {
  const calls = [];
  class FakeSession extends EventEmitter {
    async send(method, params) {
      calls.push([method, params || null]);
      if (method === 'Browser.getWindowForTarget') return { windowId: 88, bounds: { windowState: 'normal' } };
      return {};
    }
  }
  const page = new RawCdpLifecyclePage(new FakeSession(), { initialUrl: 'about:blank' });
  const driver = await createBrowserWindowLifecycleDriver(null, page);
  assert.equal(driver.rawCdp, true);
  assert.deepEqual(calls, [['Browser.getWindowForTarget', null]]);
});

test('raw Browser keyboard emits text-bearing keyDown and a physical keyUp for public input', async () => {
  const calls = [];
  class FakeSession extends EventEmitter {
    async send(method, params) {
      calls.push([method, params]);
      return {};
    }
  }
  const page = new RawCdpLifecyclePage(new FakeSession(), { initialUrl: 'about:blank' });
  await page.bringToFront();
  await page.keyboard.press('Space');
  await page.keyboard.press('F13');
  assert.deepEqual(calls, [
    ['Page.bringToFront', undefined],
    ['Input.dispatchKeyEvent', {
      type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32,
      nativeVirtualKeyCode: 32, modifiers: 0, text: ' ', unmodifiedText: ' ',
      autoRepeat: false, location: 0,
    }],
    ['Input.dispatchKeyEvent', {
      type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32,
      nativeVirtualKeyCode: 32, modifiers: 0, autoRepeat: false, location: 0,
    }],
    ['Input.dispatchKeyEvent', {
      type: 'rawKeyDown', key: 'F13', code: 'F13', windowsVirtualKeyCode: 124,
      nativeVirtualKeyCode: 124, modifiers: 0, autoRepeat: false, location: 0,
    }],
    ['Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'F13', code: 'F13', windowsVirtualKeyCode: 124,
      nativeVirtualKeyCode: 124, modifiers: 0, autoRepeat: false, location: 0,
    }],
  ]);
});

test('physical suspend or lock can never be promoted from a synthetic EventEmitter call', () => {
  const evidence = passingEvidence('electron');
  evidence.physicalPower = {
    claimed: true,
    driver: 'electron-event-emitter',
    reason: null,
  };
  const result = validatePerformanceLifecycleEvidence(evidence, { runtimeKind: 'electron' });
  assert.equal(result.pass, false);
  assert.match(result.failures.join('\n'), /physical power evidence cannot be synthetic/);
});

test('audio unlock uses a focused keyboard gesture that HUD overlays cannot intercept', async () => {
  const calls = [];
  const page = {
    locator(selector) {
      calls.push(['locator', selector]);
      return { focus: async () => { calls.push(['focus', selector]); } };
    },
    keyboard: {
      press: async (key) => { calls.push(['press', key]); },
    },
  };
  await unlockAudioWithKeyboard(page);
  assert.deepEqual(calls, [
    ['locator', '#gl-canvas'],
    ['focus', '#gl-canvas'],
    ['press', 'F13'],
  ]);
});

test('Browser visibility uses the owned native Chrome window instead of unreliable tab transfer', async () => {
  const calls = [];
  const cdp = {
    async send(method, params) {
      calls.push([method, params || null]);
      if (method === 'Browser.getWindowForTarget') {
        return { windowId: 47, bounds: { left: 10, top: 20, width: 1440, height: 900, windowState: 'normal' } };
      }
      return {};
    },
  };
  const context = { newCDPSession: async () => cdp };
  const page = {};
  const driver = await createBrowserWindowLifecycleDriver(context, page);
  await setBrowserWindowLifecycleState(driver, 'minimized');
  await setBrowserWindowLifecycleState(driver, 'normal');
  assert.deepEqual(calls, [
    ['Emulation.setFocusEmulationEnabled', { enabled: false }],
    ['Browser.getWindowForTarget', null],
    ['Browser.setWindowBounds', { windowId: 47, bounds: { windowState: 'minimized' } }],
    ['Browser.setWindowBounds', { windowId: 47, bounds: { windowState: 'normal' } }],
  ]);
});
