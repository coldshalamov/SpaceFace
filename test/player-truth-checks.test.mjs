// Fixture tests for the player-truth checks (scripts/player-truth/checks.mjs). Small recorded-style
// traces — no browser — so the checks themselves are regression-tested.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLS, VIS, checkLodChurn, checkPlayerShip, checkPopping, checkRoundResolution, checkKillsBeforeInput,
  checkSpawnMotion, checkPlayerControl, checkTumble, checkVfx, checkLoadout, checkFrameTime, checkReadability, overall,
} from '../scripts/player-truth/checks.mjs';
import { classifyEntity } from '../src/testing/playerTruth/reader.js';
import { auditItems } from '../scripts/player-truth/routes.mjs';
import { separation } from '../scripts/player-truth/readability.mjs';

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
  assert.equal(checkLodChurn(trace({ ents: () => [ent(7, CLS.enemy, { 10: 0 })] })).status, 'PASS');
  assert.equal(checkLodChurn(trace({ ents: () => [ent(7, CLS.enemy)] })).status, 'UNKNOWN');
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
  assert.equal(checkPopping(pop).status, 'FAIL');
  assert.equal(checkPopping(trace({ ents: () => [ent(9, CLS.asteroid)] })).status, 'PASS');
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
