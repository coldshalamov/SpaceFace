// Massline rung 10 acceptance check: massline:threat produces player-facing feedback through the
// existing presentation pipeline (presentationOrchestrator -> presentation:cue ->
// presentationAdapters -> alert/audio:cue/presentation:vfxCue/presentation:caption).
//
// This is the consume half of rung 09's emit: the orchestrator subscribes to massline:threat
// (sibling of the tether.near_break wiring), maps it to the 'massline.threat' cue with
// severity -> magnitude and the threat kind riding the tags, and the adapters fan it out to an
// audio sting + a clean non-diegetic HUD warn + an accessibility caption.
//
// Same harness shape as check-massline-release-feedback.mjs: real orchestrator + adapters on an
// in-memory bus. Plus one end-to-end leg: the REAL masslineThreats observer (rung 09) emitting
// into the same bus, proving the emit->consume pair with no mock in between.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { masslineThreats } from '../src/systems/masslineThreats.js';
import { PRESENTATION_RECIPES, validatePresentationRecipes } from '../src/presentation/cueRecipes.js';

// Sanity: the threat recipe exists and the whole recipe table still validates.
const recipeReport = validatePresentationRecipes();
assert(recipeReport.ok, `presentation recipes must validate: ${recipeReport.issues.join('; ')}`);
assert.ok(PRESENTATION_RECIPES['massline.threat'], 'recipe massline.threat must exist');

assertThreatEmitsPlayerFacingCue();
assertSeverityScalesMagnitude();
assertKindRidesTags();
assertDedupeSuppressesRepeat();
assertEndToEndFromRealObserver();

console.log('Massline threat feedback checks OK');

// 1. A massline:threat emit fires exactly one presentation:cue mapped to massline.threat, and the
//    adapters produce at least one player-facing output (and exactly one HUD alert — no
//    double-toast).
function assertThreatEmitsPlayerFacingCue() {
  const h = createHarness();
  emitThreat(h, { kind: 'line-near-break', targetId: 2, severity: 0.8 });

  assert.equal(h.cues.length, 1, 'threat must emit exactly one presentation:cue');
  assert.equal(h.cues[0].id, 'massline.threat', 'threat must map to the massline.threat cue');
  assert.equal(h.cues[0].targetId, 2, 'cue must carry the threat targetId');
  assert.equal(h.alerts.length, 1, 'threat must emit exactly one UI alert (no double-toast)');
  assert.equal(h.alerts[0].sev, 'warn', 'threat alert must read as a warn tier');
  assert.equal(h.audioCues.length, 1, 'threat must emit an audio sting');
  assert.equal(h.vfxCues.length, 1, 'threat must emit a vfx cue');
  assert.equal(h.captions.length, 1, 'threat must emit an accessibility caption');
}

// 2. Severity drives the cue magnitude (adapters scale from it): hot threat > mild threat.
function assertSeverityScalesMagnitude() {
  const mild = createHarness();
  emitThreat(mild, { kind: 'hostile-on-arc', targetId: 9, severity: 0.3 });
  const hot = createHarness();
  emitThreat(hot, { kind: 'hostile-on-arc', targetId: 9, severity: 0.9 });

  const mildMag = mild.vfxCues[0] && mild.vfxCues[0].magnitude;
  const hotMag = hot.vfxCues[0] && hot.vfxCues[0].magnitude;
  assert.ok(Number.isFinite(mildMag) && Number.isFinite(hotMag), 'vfx cues must carry magnitude');
  assert.ok(hotMag > mildMag, `severity must scale magnitude; hot=${hotMag} mild=${mildMag}`);
}

// 3. The threat kind rides the cue tags so downstream consumers can flavor by kind.
function assertKindRidesTags() {
  const h = createHarness();
  emitThreat(h, { kind: 'collision-course', targetId: 5, severity: 0.6 });
  assert.ok(h.cues[0].tags.includes('collision-course'),
    `cue tags must carry the threat kind; got ${JSON.stringify(h.cues[0].tags)}`);
  assert.ok(h.cues[0].tags.includes('threat'), 'cue tags must carry the threat marker');
}

// 4. The same threat repeated inside the dedupe window is suppressed (anti-spam is the
//    orchestrator's job; the sibling near_break behaves the same way).
function assertDedupeSuppressesRepeat() {
  const h = createHarness();
  emitThreat(h, { kind: 'line-near-break', targetId: 2, severity: 0.8 });
  h.state.tick += 2; // inside dedupeWindowTicks (12)
  h.bus.emit('massline:threat', { kind: 'line-near-break', targetId: 2, severity: 0.8 });
  h.bus.flush();

  assert.equal(h.cues.length, 1, 'repeat threat inside the dedupe window must not double-cue');
  assert.ok(h.suppressed.some((s) => s.id === 'massline.threat' && s.reason === 'dedupe_window'),
    'the repeat must be reported as dedupe_window suppressed');
}

// 5. End-to-end: the REAL rung-09 observer detects a near-break from seeded tether state and its
//    emit lands as a player-facing cue through the same bus — no mock between emit and consume.
function assertEndToEndFromRealObserver() {
  const h = createHarness();
  const threats = Object.create(masslineThreats);
  threats.init({ state: h.state, bus: h.bus, helpers: {} });

  h.state.playerId = 1;
  h.state.player = {
    tether: { active: true, targetId: 2, strain: 0.8, load: 1, restLength: 90, phase: 'overload' },
    masslineTelemetry: { active: true, tangentialSpeed: 0 },
  };
  h.state.tick += 20;
  threats.update(1 / 60, h.state);
  h.bus.flush();

  assert.equal(h.cues.length, 1, 'observer-detected threat must produce a presentation:cue');
  assert.equal(h.cues[0].id, 'massline.threat', 'end-to-end cue must be massline.threat');
  assert.ok(h.cues[0].tags.includes('line-near-break'), 'end-to-end cue must carry the detected kind');
  assert.equal(h.alerts.length, 1, 'end-to-end threat must reach the HUD as one alert');
}

// ---- harness (mirrors check-massline-release-feedback.mjs) ----

function createHarness() {
  const bus = createBus();
  const state = {
    tick: 1,
    simTime: 1 / 60,
    playerId: 1,
    entities: new Map([
      [1, { id: 1, type: 'ship', alive: true, team: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6 }],
      [2, { id: 2, type: 'asteroid', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 11 }],
    ]),
    settings: {
      video: { motionReduce: false },
      accessibility: { flashReduce: false },
    },
  };
  const ctx = { state, bus, helpers: {} };

  const orchestrator = Object.create(presentationOrchestrator);
  orchestrator.init(ctx);
  const adapters = Object.create(presentationAdapters);
  adapters.init(ctx);

  const harness = {
    state, bus, orchestrator, adapters,
    cues: [], alerts: [], audioCues: [], vfxCues: [], captions: [], suppressed: [],
  };
  bus.on('presentation:cue', (p) => harness.cues.push(p));
  bus.on('alert', (p) => harness.alerts.push(p));
  bus.on('audio:cue', (p) => harness.audioCues.push(p));
  bus.on('presentation:vfxCue', (p) => harness.vfxCues.push(p));
  bus.on('presentation:caption', (p) => harness.captions.push(p));
  bus.on('presentation:cueSuppressed', (p) => harness.suppressed.push(p));
  return harness;
}

function emitThreat(harness, overrides) {
  harness.state.tick += 20; // clear any prior dedupe window between distinct emits
  const payload = {
    kind: 'line-near-break',
    targetId: 2,
    severity: 0.8,
    tick: harness.state.tick,
    time: harness.state.tick / 60,
    ...overrides,
  };
  harness.bus.emit('massline:threat', payload);
  // presentation:cue is queued (deferred) by the orchestrator; flush dispatches it to adapters.
  harness.bus.flush();
}
