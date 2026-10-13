// Fixture tests for the player-truth checks (scripts/player-truth/checks.mjs). Small recorded-style
// traces — no browser — so the checks themselves are regression-tested.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLS, VIS, checkLodChurn, checkPlayerShip, checkPopping, checkRoundResolution, checkKillsBeforeInput,
  checkSpawnMotion, checkPlayerControl, checkTumble, checkVfx, checkLoadout, checkFrameTime, checkReadability, overall,
  isLoadingAssetState,
} from '../scripts/player-truth/checks.mjs';
import { classifyEntity } from '../src/testing/playerTruth/reader.js';
import { auditItems, classifyArmoryArrival, formatArmoryMiss, formatSwarmTutorialMiss, SWARM_TUTORIAL_MISS, ARMORY_WORLD_GRACE_MS } from '../scripts/player-truth/routes.mjs';
import { separation } from '../scripts/player-truth/readability.mjs';
import { renderVerdict } from '../scripts/player-truth/verdict.mjs';
import { performanceRunContext } from '../scripts/player-truth/run.mjs';

const goodPlayer = (o = {}) => ({ id: 1, alive: true, x: 0, y: 0, z: 0, vx: 0, vz: 0, rot: 0, angVel: 0, pitch: 0, bank: 0, mesh: true, vis: true, onScreen: true, box: [600, 330, 680, 390], lod: 'lod0', model: 'hornet', state: 'authored', tris: 4000, marker: false, meshId: 'aaaa', ...o });
function trace({ n = 60, dt = 0.1, player = () => goodPlayer(), ents = () => [], events = [], rounds = [], probes = [], vfx = null, mode = 'swarm', meta = {} } = {}) {
  const samples = [];
  for (let i = 0; i < n; i++) samples.push({ f: i, t: i * 100, dt: 16, sim: 10 + i * dt, mode: 'flight', run: mode === 'swarm' ? { ph: 'active', w: 1 } : null, vw: 1280, vh: 720, p: player(i), e: ents(i), vfx: vfx ? vfx(i) : null });
  return { meta: { mode, rounds: mode === 'swarm', ...meta }, samples, events, longTasks: [], keys: ['a|m|lod0|authored', 'b|m|lod1|authored', 'c|box|lod0|resolving'], rounds, probes };
}
const ent = (id, cls, o = {}) => { const e = [id, cls, 100, 100, 0, 0, 640, 360, 10, VIS.onscreen, -1, 0]; for (const [k, v] of Object.entries(o)) e[k] = v; return e; };

test('classifyEntity: player, run hostiles, asteroids, projectiles, neutral', () => {
  assert.equal(classifyEntity({ id: 1, type: 'ship' }, 1, 1), 'player');
  assert.equal(classifyEntity({ id: 2, type: 'ship', team: 1, data: { runRole: 'anchor' } }, 1, 1), 'enemy');
  assert.equal(classifyEntity({ id: 3, type: 'ship', team: 3, data: {} }, 1, 1), 'enemy');
  assert.equal(classifyEntity({ id: 4, type: 'ship', team: 0, data: {} }, 1, 1), 'neutral');
  assert.equal(classifyEntity({ id: 5, type: 'asteroid' }, 1, 1), 'asteroid');
  assert.equal(classifyEntity({ id: 6, type: 'projectile' }, 1, 1), 'projectile');
});

test('lod_churn fails an entity flapping between LODs and passes a stable one', () => {
  const flap = trace({ ents: (i) => [ent(7, CLS.enemy, { 10: i % 2 })] });
  const r = checkLodChurn(flap);
  assert.equal(r.status, 'FAIL'); assert.match(r.offenders[0].line, /entity 7/);
  assert.match(r.value, /59 real LOD · 0 loading/);
  assert.match(r.detail, /59 real LOD\/model swaps · 0 visible loading-state swaps/);
  assert.equal(checkLodChurn(trace({ ents: () => [ent(7, CLS.enemy, { 10: 0 })] })).status, 'PASS');
  assert.equal(checkLodChurn(trace({ ents: () => [ent(7, CLS.enemy)] })).status, 'UNKNOWN');
  const unseen = checkLodChurn(trace({ ents: (i) => [ent(7, CLS.enemy, { 10: i % 2, 9: VIS.offscreen })] }));
  assert.equal(unseen.status, 'PASS'); assert.match(unseen.detail, /off screen, not graded/);
});

test('visible loading-state swaps are reported apart from real LOD swaps and still FAIL', () => {
  assert.equal(isLoadingAssetState('awaiting-authored-admission'), true);
  assert.equal(isLoadingAssetState('loading'), true);
  assert.equal(isLoadingAssetState('compiling-pipelines'), true);
  assert.equal(isLoadingAssetState('authored'), false);
  const loading = trace({
    player: (i) => goodPlayer({ state: i % 2 ? 'compiling-pipelines' : 'authored' }),
    ents: () => [ent(7, CLS.enemy, { 10: 0 })],
  });
  loading.keys = ['a|m|lod0|authored'];
  const r = checkLodChurn(loading);
  assert.equal(r.status, 'FAIL');
  assert.match(r.value, /0 real LOD · 59 loading/);
  assert.match(r.detail, /0 real LOD\/model swaps · 59 visible loading-state swaps \(awaiting\/loading\/compiling, still counted\)/);
  const md = renderVerdict({
    meta: { label: 't', mode: 'swarm', seed: 4242, commit: 'c', renderer: 'swift', browserVersion: '1', resolution: '960x540', when: 't', wallSeconds: 1, simSeconds: 1, frames: 60, shots: 1, script: 's' },
    results: [r], overall: 'FAIL', paths: null,
  });
  assert.match(md, /0 real LOD · 59 loading/);
  assert.match(md, /visible loading-state swaps/);
  const off = trace({ ents: (i) => [ent(7, CLS.enemy, { 10: i % 2, 9: VIS.offscreen })] });
  off.keys = ['a|m|lod0|loading', 'b|m|lod1|compiling-pipelines'];
  const hidden = checkLodChurn(off);
  assert.equal(hidden.status, 'PASS');
  assert.match(hidden.detail, /0 visible loading-state swaps/);
  assert.match(hidden.detail, /off screen, not graded/);
});

test('player_ship flags a placeholder rectangle and a missing ship', () => {
  assert.equal(checkPlayerShip(trace()).status, 'PASS');
  const box = checkPlayerShip(trace({ player: (i) => (i > 40 ? goodPlayer({ tris: 12, state: 'resolving' }) : goodPlayer()) }));
  assert.equal(box.status, 'FAIL'); assert.ok(box.offenders.some((o) => /placeholder|asset resolving/.test(o.line)));
  const gone = checkPlayerShip(trace({ player: (i) => (i % 10 === 0 ? goodPlayer({ vis: false }) : goodPlayer()) }));
  assert.equal(gone.status, 'FAIL');
});

test('popping counts on-screen hide/show toggles of a live body', () => {
  const pop = trace({ ents: (i) => [ent(9, CLS.asteroid, { 9: i % 4 < 2 ? VIS.onscreen : VIS.hidden })] });
  const r = checkPopping(pop);
  assert.equal(r.status, 'FAIL');
  assert.match(r.detail, /visibility pops · 0 visible loading-state pops/);
  assert.equal(checkPopping(trace({ ents: () => [ent(9, CLS.asteroid)] })).status, 'PASS');
  const loading = trace({ ents: (i) => [ent(9, CLS.asteroid, { 9: i % 4 < 2 ? VIS.onscreen : VIS.hidden, 10: 0 })] });
  loading.keys = ['u|wasp|lod1|awaiting-authored-admission'];
  const lr = checkPopping(loading);
  assert.equal(lr.status, 'FAIL');
  assert.match(lr.value, /0 visibility · \d+ loading/);
  assert.match(lr.detail, /0 visibility pops · \d+ visible loading-state pops \(awaiting\/loading\/compiling, still counted\)/);
  assert.match(lr.offenders[0].line, /loading-state/);
});

test('round_resolution and kills_before_input reproduce the four-second idle win', () => {
  const rounds = [{ wave: 1, startSim: 10, startT: 0, endSim: 14, endT: 4000, endPhase: 'draft' }];
  const events = [{ ev: 'killed', sim: 11, t: 1000, id: 50, type: 'ship', killerId: 60, killerType: 'asteroid', byPlayer: false }];
  const t = trace({ rounds, events });
  const rr = checkRoundResolution(t);
  assert.equal(rr.status, 'FAIL'); assert.match(rr.offenders[0].line, /zero player input/); assert.match(rr.offenders[0].line, /< 20 s/);
  const kb = checkKillsBeforeInput(t);
  assert.equal(kb.status, 'FAIL'); assert.match(kb.offenders[0].line, /asteroid×1/);
  const ok = trace({ rounds: [{ wave: 1, startSim: 10, endSim: 45, endPhase: 'draft' }], events: [{ ev: 'input', kind: 'keydown', code: 'KeyW', sim: 12 }, { ev: 'killed', sim: 20, type: 'ship', byPlayer: true }] });
  assert.equal(checkRoundResolution(ok).status, 'PASS');
  assert.equal(checkKillsBeforeInput(ok).status, 'PASS');
  assert.equal(checkRoundResolution(trace({ mode: 'adventure' })).status, 'N/A');
});

test('spawn_motion flags a rock already flying at the round start', () => {
  const rounds = [{ wave: 1, startSim: 10 }];
  const t = trace({ rounds, ents: () => [ent(20, CLS.asteroid, { 4: 30, 5: 0 })] });
  assert.equal(checkSpawnMotion(t).status, 'FAIL');
  assert.equal(checkSpawnMotion(trace({ rounds, ents: () => [ent(20, CLS.asteroid)] })).status, 'PASS');
});

test('player_control fails a ship that does not answer thrust', () => {
  const probes = [{ label: 'round 2 thrust', kind: 'thrust', key: 'KeyW', startSim: 11, endSim: 12.2 }];
  assert.equal(checkPlayerControl(trace({ probes })).status, 'FAIL');
  const moving = trace({ probes, player: (i) => goodPlayer({ vx: i, x: i * i }) });
  assert.equal(checkPlayerControl(moving).status, 'PASS');
  assert.equal(checkPlayerControl(trace()).status, 'UNKNOWN');
});

test('tumble flags sustained pitch out of the play plane', () => {
  assert.equal(checkTumble(trace({ player: (i) => goodPlayer({ pitch: i > 20 ? 1.2 : 0 }) })).status, 'FAIL');
  assert.equal(checkTumble(trace()).status, 'PASS');
});

test('vfx_coverage flags a column sitting over the player', () => {
  const v = () => ({ cov: 0.31, od: 1.4, pOcc: 0.9, tOcc: 0.1, tN: 3, unb: 0, top: [['crystalColumn', null, 0.2, [600, 0, 700, 720]]] });
  const r = checkVfx(trace({ vfx: v }));
  assert.equal(r.status, 'FAIL'); assert.match(r.offenders[0].line, /player ship/);
  assert.equal(checkVfx(trace({ vfx: () => ({ cov: 0.05, od: 0.1, pOcc: 0, tOcc: 0, tN: 2, unb: 0, top: [] }) })).status, 'PASS');
});

test('loadout audit flags a cargo scanner in Swarm and a silent swap', () => {
  const items = [{ name: 'Cargo Scanner S', category: 'Rigs', desc: 'Reads what a hull carries.' }, { name: 'Pulse Laser S', category: 'Weapons', desc: '' }];
  const a = auditItems('swarm', items);
  assert.equal(a.irrelevant.length, 1); assert.equal(a.undescribed.length, 1);
  const r = checkLoadout({ meta: { mode: 'swarm', hasLoadout: true }, loadout: { items, ...a, silentSwaps: [{ bought: 'X', removed: ['Y'], said: '' }], swapProbe: '1 installs' } });
  assert.equal(r.status, 'FAIL'); assert.equal(r.offenders.length, 3);
});

test('frame_time is UNKNOWN on software GL and grades on a GPU', () => {
  assert.equal(checkFrameTime(trace({ meta: { softwareGl: true } })).status, 'UNKNOWN');
  assert.equal(checkFrameTime(trace()).status, 'PASS');
});

test('performance context reads only the dedicated marker and records observer cadence', () => {
  const env = {SPACEFACE_QUIET_HOST: '0'};
  const context = performanceRunContext(env, {screenshotEveryMs: 1500});
  assert.deepEqual(context, {quietHost: false, contended: true, authority: 'diagnostic-only',
    observer: {pixelSplitPasses: 3, pixelSplitEveryFrames: 24, screenshotEveryMs: 1500}});
  assert.deepEqual(env, {SPACEFACE_QUIET_HOST: '0'}, 'the runner cannot mark its own host');
  assert.equal(performanceRunContext({}).contended, true);
  assert.equal(performanceRunContext({SPACEFACE_QUIET_HOST: true}).quietHost, false);
  assert.equal(performanceRunContext({SPACEFACE_QUIET_HOST: '1'}).quietHost, true);
});

test('contended frame times stay diagnostic UNKNOWN with all measurements; quiet hardware still fails', () => {
  const slow = trace(); for (const sample of slow.samples) sample.dt = 100;
  slow.longTasks = [{t: 200, d: 338, sim: 10.2, f: 2}];
  const hardware = checkFrameTime(slow); assert.equal(hardware.status, 'FAIL');
  slow.meta.performanceContext = performanceRunContext({});
  const contended = checkFrameTime(slow);
  assert.equal(contended.status, 'UNKNOWN');
  assert.equal(contended.value, hardware.value); assert.equal(contended.threshold, hardware.threshold);
  assert.deepEqual(contended.offenders, hardware.offenders);
  assert.match(contended.detail, /quiet-host performance unmeasured/);
  slow.meta.performanceContext = performanceRunContext({SPACEFACE_QUIET_HOST: '1'});
  assert.equal(checkFrameTime(slow).status, 'FAIL');
  const fast = trace({meta: {performanceContext: performanceRunContext({})}});
  assert.equal(checkFrameTime(fast).status, 'UNKNOWN', 'fast contended measurements cannot certify performance');
  fast.meta.performanceContext = performanceRunContext({SPACEFACE_QUIET_HOST: '1'});
  assert.equal(checkFrameTime(fast).status, 'PASS');
  fast.meta.softwareGl = true; assert.equal(checkFrameTime(fast).status, 'UNKNOWN');
});

test('diagnostic frame context is visible in the verdict and cannot erase a gameplay failure', () => {
  const recorded = trace({meta: {performanceContext: performanceRunContext({})}});
  const frame = checkFrameTime(recorded);
  const badShip = checkPlayerShip(trace({player: () => goodPlayer({mesh: false})}));
  assert.equal(badShip.status, 'FAIL'); assert.equal(overall([frame, badShip]), 'FAIL');
  assert.equal(overall([frame]), 'INCOMPLETE');
  const md = renderVerdict({meta: {...recorded.meta, label: 'diagnostic'}, results: [frame], overall: 'INCOMPLETE'});
  assert.match(md, /Performance context: unmarked\/contended development host · diagnostic-only/);
  assert.match(md, /3 render\/readback passes every 24 frames; screenshots every 1000 ms/);
  assert.match(md, /\*\*UNKNOWN\*\*/); assert.match(md, /quiet-host performance unmeasured/);
});

test('readability: overlapping classes fail, distinct classes pass, thin data is UNKNOWN', () => {
  const S = (L, a, b, r, n) => Array.from({ length: n }, (_, i) => ({ lab: [L + (i % 3) * 4, a, b], r }));
  assert.ok(separation(S(50, 10, 10, 8, 6), S(51, 10, 11, 8, 6)).sep < 1);
  assert.ok(separation(S(80, 60, 40, 8, 6), S(30, -5, -20, 30, 6)).sep > 3);
  const bad = { meta: { mode: 'swarm' }, readability: { classes: { enemy: { n: 6 }, asteroid: { n: 6 } }, pairs: [{ a: 'enemy', b: 'asteroid', nA: 6, nB: 6, sep: 0.4, dColor: 3, sizeRatio: 1 }] } };
  assert.equal(checkReadability(bad).status, 'FAIL');
  assert.equal(checkReadability({ meta: {}, readability: { classes: { enemy: { n: 1 } }, pairs: [{ a: 'enemy', b: 'asteroid', nA: 1, nB: 0, sep: null }] } }).status, 'UNKNOWN');
});

test('overall: any FAIL fails, UNKNOWN is never PASS', () => {
  assert.equal(overall([{ status: 'PASS' }, { status: 'FAIL' }]), 'FAIL');
  assert.equal(overall([{ status: 'PASS' }, { status: 'UNKNOWN' }]), 'INCOMPLETE');
  assert.equal(overall([{ status: 'PASS' }, { status: 'N/A' }]), 'PASS');
});

test('menu clicks are not flight input; canvas presses and keys are', async () => {
  const { isFlightInput } = await import('../scripts/player-truth/checks.mjs');
  assert.equal(isFlightInput({ ev: 'input', kind: 'mousedown', tgt: 'BUTTON' }), false);
  assert.equal(isFlightInput({ ev: 'input', kind: 'mousedown', tgt: 'CANVAS' }), true);
  assert.equal(isFlightInput({ ev: 'input', kind: 'keydown', tgt: 'BODY' }), true);
  assert.equal(isFlightInput({ ev: 'input', kind: 'keyup', tgt: 'BODY' }), false);
});

test('score credited before the first flight input fails', async () => {
  const { checkRewardBeforeInput } = await import('../scripts/player-truth/checks.mjs');
  const mk = (sim, sc) => ({ sim, t: sim * 1000, mode: 'flight', run: { ph: 'active', sc }, e: [] });
  const trace = { meta: { mode: 'swarm', rounds: true }, rounds: [{ wave: 1, startSim: 1, endSim: null }],
    samples: [mk(1, 0), mk(2, 0), mk(3, 120), mk(8, 300)], events: [{ ev: 'input', kind: 'keydown', sim: 7.5 }] };
  const r = checkRewardBeforeInput(trace);
  assert.equal(r.status, 'FAIL');
  assert.match(r.value, /\+120/);
  trace.samples[2].run.sc = 0;
  assert.equal(checkRewardBeforeInput(trace).status, 'PASS');
});

test('Open armory is ready on the draft screen and lost in a non-draft world', () => {
  const draft = { top: 'crucibleDraft', mode: 'flight', kind: 'adventure', phase: 'draft' };
  assert.equal(classifyArmoryArrival(draft, ARMORY_WORLD_GRACE_MS), 'ready');
  const door = { top: 'crucible', mode: 'menu', kind: 'adventure', phase: 'inactive' };
  assert.equal(classifyArmoryArrival(door, 0), 'wait');
  const booting = { top: null, mode: 'flight', kind: 'adventure', phase: 'inactive' };
  assert.equal(classifyArmoryArrival(booting, ARMORY_WORLD_GRACE_MS - 1), 'wait');
  assert.equal(classifyArmoryArrival(booting, ARMORY_WORLD_GRACE_MS), 'lost');
  const pending = { top: null, mode: 'loading', kind: 'adventure', phase: 'draft' };
  assert.equal(classifyArmoryArrival(pending, ARMORY_WORLD_GRACE_MS * 2), 'wait');
  const line = formatArmoryMiss({ mode: 'flight', kind: 'adventure', phase: 'inactive', top: null, hud: 'Ceres Refinery intake short' });
  assert.match(line, /mode=flight kind=adventure phase=inactive top=none/);
  assert.match(line, /Ceres Refinery/);
  assert.ok(line.length < 180);
  const parked = formatArmoryMiss({ mode: 'flight', kind: 'adventure', phase: 'inactive', top: null, x: -1900, z: -2200, hud: 'TRAINING DERELICT' });
  assert.match(parked, /at -1900,-2200 helios_core spawn/);
  assert.ok(parked.length < 180);
  const gauntlet = { top: null, mode: 'flight', kind: 'survival', phase: 'active' };
  assert.equal(classifyArmoryArrival(gauntlet, ARMORY_WORLD_GRACE_MS), 'lost');
  assert.equal(classifyArmoryArrival(gauntlet, ARMORY_WORLD_GRACE_MS, { acceptSurvival: true }), 'ready');
  assert.match(formatArmoryMiss(gauntlet, 'Enter the Gauntlet'), /^Enter the Gauntlet missed the draft:/);
  const tutorial = { top: null, mode: 'flight', kind: 'adventure', phase: 'inactive', tutorial: true, x: -1900, z: -2200 };
  assert.equal(classifyArmoryArrival(tutorial, 0), 'wait');
  assert.equal(classifyArmoryArrival(tutorial, 0, { failOnTutorial: true }), 'lost');
  const rescue = { top: null, mode: 'flight', kind: 'adventure', phase: 'inactive', rescue: true };
  assert.equal(classifyArmoryArrival(rescue, 0, { failOnTutorial: true }), 'lost');
  const live = { top: null, mode: 'flight', kind: 'survival', phase: 'active', tutorial: true };
  assert.equal(classifyArmoryArrival(live, 0, { failOnTutorial: true, acceptSurvival: true }), 'ready');
  assert.equal(classifyArmoryArrival(live, 0, { failOnTutorial: true }), 'wait');
  const tutorialLine = formatSwarmTutorialMiss(tutorial);
  assert.match(tutorialLine, new RegExp(SWARM_TUTORIAL_MISS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(tutorialLine, /mode=flight kind=adventure phase=inactive/);
  assert.match(tutorialLine, /at -1900,-2200 helios_core spawn/);
  assert.ok(tutorialLine.length < 180);
});


test('crucible_realm: Adventure objective in a swarm play frame or an empty armory FAILs', async () => {
  const { checkCrucibleRealm } = await import('../scripts/player-truth/checks.mjs');
  const meta = { mode: 'swarm', hasLoadout: true };
  const clean = { meta, loadout: { items: [{}, {}], shotT: 1 }, realm: [{ t: 2, sim: 1, file: 'f/0003.jpg', advText: [], onboarding: false, sector: 'sector_crucible' }] };
  assert.equal(checkCrucibleRealm(clean).status, 'PASS');
  const leak = { ...clean, realm: [{ t: 2, sim: 1, file: 'f/0003.jpg', advText: ['Recover the 47-A sample from the marker'], onboarding: false, sector: 'sector_helios_prime' }] };
  assert.equal(checkCrucibleRealm(leak).status, 'FAIL');
  const empty = { ...clean, loadout: { items: [], shotT: 1 } };
  assert.equal(checkCrucibleRealm(empty).status, 'FAIL');
  const gauntlet = { meta: { mode: 'gauntlet', hasLoadout: false }, realm: [{ t: 2, advText: [], onboarding: true, sector: 'x' }] };
  assert.equal(checkCrucibleRealm(gauntlet).status, 'FAIL');
  assert.equal(checkCrucibleRealm({ meta: { mode: 'adventure' } }).status, 'N/A');
});
