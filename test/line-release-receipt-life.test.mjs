import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineHud, masslineHudInputsUnchanged } from '../src/ui/masslineHud.js';
import { createBus } from '../src/core/eventBus.js';
import { laneSetMode, applyLaneMode } from '../src/core/simLaneCommands.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { readFileSync } from 'node:fs';

function element() {
  return { style: {}, textContent: '', attrs: {}, classList: { toggle() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
}

test('native release receipt follows its body but not a recycled target id', async () => {
  let nativeRating, nativeBreakEvents;
  const h = await bootRealPath({ seed: 10,
    systems: ['actions', 'flightV3', 'aiPorts', 'physics', combat, tetherGameplay],
    hulls: [{ hullId: 'ship_wasp', isPlayer: true, pos: { x: 0, z: 0 } }] });
  try {
    const rock = h.spawnObstacle({ pos: { x: 110, z: 0 }, radius: 14, mass: 960,
      dynamic: false, data: { typeId: 'ast_common_rock' } });
    const hud = Object.assign({}, masslineHud);
    hud.init({ state: h.state, bus: h.bus, helpers: {} });
    h.state.input.aimWorld = { ...rock.pos }; h.state.input.tetherMode = 'nearest';
    h.step(1, { before() { h.state.input.actions.tetherFire = true; } });
    h.step(60, { before() { h.state.input.actions.tetherFire = false; } });
    assert.equal(h.state.player.tether.targetId, rock.id);
    h.step(60, { before() { h.state.input.actions.massline = {
      lineControl: true, lineLength: -1, reelIn: 1, payOut: 0, orbitDirection: 0, pump: false,
    }; } });
    assert.ok(h.state.player.tether.load > 0, 'the native line is loaded before release');
    const releaseLoad = h.state.player.tether.load;
    const toasts = [], ratings = [];
    h.bus.on('toast', p => { if (p.channel === 'massline') toasts.push(p.text); });
    h.bus.on('tether:releaseRated', p => { if (p.deliberate) ratings.push(p); });
    h.step(1, { before() { h.state.input.actions.massline = { cut: true }; } });
    h.step(2, { before() { h.state.input.actions.massline = {}; } });
    assert.match(toasts[0], /Line released:/);
    assert.equal(ratings[0].load, releaseLoad);
    assert.equal(ratings[0].targetGeneration, rock.occupantGeneration);
    assert.equal(ratings[0].tonnageU, rock.mass);
    nativeRating = structuredClone(ratings[0]);
    assert.match(toasts[0], new RegExp(`load ${Math.round(releaseLoad * 100)}%`));
    const verdict = h.state.masslineReleaseVerdict;
    assert.ok(verdict, 'the native cut produces the HUD receipt');
    const dom = { previewEl: element(), previewMark: element(), previewSourceMark: element(), previewSvg: element() };
    const player = h.state.entities.get(h.state.playerId);
    const project = q => ({ x: q.x, y: q.z, onScreen: true });
    const paint = () => hud._renderVerdictPill(dom, h.state, player, project, verdict);
    paint();
    const originalX = verdict.atX, originalZ = verdict.atZ;
    assert.equal(dom.previewMark.style.transform, `translate3d(${Math.round(originalX)}px, ${Math.round(originalZ)}px, 0)`);
    masslineHudInputsUnchanged(h.state, player);
    rock.pos.x = 150; rock.pos.z = 40;
    assert.equal(masslineHudInputsUnchanged(h.state, player), false, 'moving the released body schedules a repaint');
    paint();
    assert.equal(dom.previewMark.style.transform, 'translate3d(150px, 40px, 0)', 'same life stays followed');
    rock.alive = false;
    assert.equal(masslineHudInputsUnchanged(h.state, player), false, 'retiring the target schedules a repaint');
    paint();
    assert.equal(dom.previewMark.style.transform, `translate3d(${Math.round(originalX)}px, ${Math.round(originalZ)}px, 0)`,
      'a retired target falls back to the captured point');
    h.state.entities.set(rock.id, { id: rock.id, occupantGeneration: rock.occupantGeneration + 1,
      alive: true, pos: { x: 600, z: 200 } });
    assert.equal(masslineHudInputsUnchanged(h.state, player), false, 'recycling schedules a repaint');
    paint();
    assert.equal(dom.previewMark.style.transform, `translate3d(${Math.round(originalX)}px, ${Math.round(originalZ)}px, 0)`,
      'a new occupant cannot inherit the release receipt');
  } finally { h.dispose(); }

  const b = await bootRealPath({ seed: 10,
    systems: ['actions', 'flightV3', 'aiPorts', 'physics', combat, tetherGameplay],
    hulls: [{ hullId: 'ship_wasp', isPlayer: true, pos: { x: 0, z: 0 } }] });
  try {
    const rock = b.spawnObstacle({ pos: { x: 110, z: 0 }, radius: 14, mass: 960,
      dynamic: false, data: { typeId: 'ast_common_rock' } });
    b.state.input.aimWorld = { ...rock.pos }; b.state.input.tetherMode = 'nearest';
    b.step(1, { before() { b.state.input.actions.tetherFire = true; } });
    b.step(60, { before() { b.state.input.actions.tetherFire = false; } });
    assert.equal(b.state.player.tether.targetId, rock.id);
    nativeBreakEvents = [];
    b.bus.on('tether:broken', p => nativeBreakEvents.push(['tether:broken', structuredClone(p)]));
    b.bus.on('tether:releaseRated', p => nativeBreakEvents.push(['tether:releaseRated', structuredClone(p)]));
    const attachments = b.runtime.getSystem('combat').ensureKernel().attachments;
    assert.equal(attachments.cut(b.state.player.tether.attachmentId, b.state.playerId, 'threshold').ok, true);
    b.step(1);
    const rating = nativeBreakEvents.find(([type]) => type === 'tether:releaseRated')?.[1];
    assert.equal(rating?.breakReason, 'threshold');
    assert.equal(rating.targetGeneration, rock.occupantGeneration);
    assert.equal(rating.targetX, rock.pos.x);
  } finally { b.dispose(); }

  // Deliver that real native rating through the production worker bridge and the actual
  // main-lane journal/domain application, which runs before replaying captured events.
  const host = createSimHost(), main = createGameState(10), bus = createBus();
  let receive, request, seq = 0;
  const lane = createSimLaneRuntime({ state: main, bus, registry: {}, helpers: {},
    flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
    channelFactory: () => ({ onMessage(fn) { receive = fn; }, post(msg) { if (msg.kind === 'init') request = msg; }, terminate() {} }) });
  try {
    const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
    const init = await host.init({ ...request, scenarioContract });
    receive(structuredClone({ kind: 'ready', seq: request.seq, ...init })); await lane.readyPromise;
    const state = host.host.state, runtime = host.host.runtime;
    state.mode = 'flight';
    const player = runtime.spawn({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 20, radius: 8 });
    state.playerId = player.id;
    const spec = { type: 'asteroid', pos: { x: 150, z: 40 }, vel: { x: 0, z: 0 }, mass: 960, radius: 14 };
    const rock = runtime.spawn(spec);
    assert.equal(rock.id, nativeRating.targetId);
    assert.equal(rock.occupantGeneration, nativeRating.targetGeneration);
    const hud = Object.assign({}, masslineHud), toasts = [];
    hud.init({ state: main, bus, helpers: {} });
    bus.on('toast', p => { if (p.channel === 'massline') toasts.push(p.text); });
    const deliver = async () => {
      const reply = await host.tick({ tick: ++seq, steps: 0, commands: [], generation: 0 });
      receive(structuredClone({ kind: 'clockTick', ...reply })); return reply;
    };
    host.host.bus.emit('tether:releaseRated', structuredClone(nativeRating));
    let reply = await deliver();
    assert.ok(reply.events.some(e => e.t === 'tether:releaseRated' && e.p.targetGeneration === nativeRating.targetGeneration));
    assert.equal(main.entities.get(rock.id).occupantGeneration, nativeRating.targetGeneration);
    const dom = { previewEl: element(), previewMark: element(), previewSourceMark: element(), previewSvg: element() };
    const project = q => ({ x: q.x, y: q.z, onScreen: true });
    const paint = () => hud._renderVerdictPill(dom, main, main.entities.get(main.playerId), project, main.masslineReleaseVerdict);
    paint();
    assert.equal(dom.previewMark.style.transform, 'translate3d(150px, 40px, 0)', 'same generation follows the moved target');
    assert.match(toasts.at(-1), new RegExp(`load ${Math.round(nativeRating.load * 100)}%`));

    assert.equal(host.host.sim.helpers.removeEntity(rock.id, { immediate: true }), true);
    const replacement = runtime.spawn({ ...spec, pos: { x: 600, z: 200 }, mass: 10 });
    assert.equal(replacement.id, rock.id);
    assert.notEqual(replacement.occupantGeneration, nativeRating.targetGeneration);
    host.host.bus.emit('tether:releaseRated', structuredClone(nativeRating));
    reply = await deliver();
    assert.ok(reply.events.some(e => e.t === 'tether:releaseRated'));
    assert.equal(main.entities.get(rock.id).occupantGeneration, replacement.occupantGeneration,
      'the replacement projection is installed before event replay');
    paint();
    assert.equal(dom.previewMark.style.transform, `translate3d(${Math.round(nativeRating.targetX)}px, ${Math.round(nativeRating.targetZ)}px, 0)`);
    assert.match(toasts.at(-1), /960 t/, 'the new occupant cannot supply the old receipt mass');

    for (const [type, payload] of nativeBreakEvents) host.host.bus.emit(type, structuredClone(payload));
    reply = await deliver();
    assert.ok(reply.events.some(e => e.t === 'tether:broken'));
    assert.ok(reply.events.some(e => e.t === 'tether:releaseRated' && e.p.breakReason === 'threshold'));
    assert.equal(main.masslineReleaseVerdict.broke, true, 'the existing snap remains a break, not a release grade');
    paint();
    assert.equal(dom.previewMark.style.transform, `translate3d(${Math.round(nativeRating.targetX)}px, ${Math.round(nativeRating.targetZ)}px, 0)`,
      'the native snap receipt also uses its captured point when the ID was recycled before replay');
    hud.destroy();
  } finally { lane.close(); host.shutdown(); }
});

test('pause, mode changes and load/new lifecycle clear only the transient receipt', () => {
  const state = { mode: 'flight', simTime: 1, playerId: 1,
    player: { tether: { active: true, targetId: 7, load: .55 } }, entities: new Map() };
  const bus = createBus(), hud = Object.assign({}, masslineHud);
  hud.init({ state, bus, helpers: {} });
  const publish = () => bus.emit('tether:releaseRated', { targetId: 7, deliberate: true, classification: 'good' });
  publish(); laneSetMode(state, bus, 'paused'); hud._hideAll();
  assert.equal(state.masslineReleaseVerdict, null);
  laneSetMode(state, bus, 'flight');
  assert.equal(state.masslineReleaseVerdict, null, 'resume cannot repaint the retired marker');
  publish(); bus.emit('sim:pause', {}); assert.equal(state.masslineReleaseVerdict, null);
  publish(); assert.equal(state.masslineReleaseVerdict, null, 'a delayed worker receipt cannot repaint during pause');
  bus.emit('sim:resume', {}); publish(); assert.ok(state.masslineReleaseVerdict, 'fresh receipts work after resume');
  for (const [begin, end] of [['save:restoring', 'save:loaded'], ['game:new', 'game:started'],
    ['game:exitToMenu', 'save:loaded']]) {
    publish(); assert.ok(state.masslineReleaseVerdict);
    bus.emit(begin, {}); assert.equal(state.masslineReleaseVerdict, null, begin);
    publish(); assert.equal(state.masslineReleaseVerdict, null, 'old receipts stay hidden during reset');
    bus.emit(end, {}); publish(); assert.ok(state.masslineReleaseVerdict, end);
  }
  publish(); applyLaneMode(state, bus, 'menu'); assert.equal(state.masslineReleaseVerdict, null);
  assert.deepEqual(state.player.tether, { active: true, targetId: 7, load: .55 }, 'presentation never mutates the live line');
  hud.destroy();
});

test('legacy missing values remain unknown while an actual zero is retained', () => {
  const state = { mode: 'flight', simTime: 1, playerId: 1, player: {}, entities: new Map() };
  const bus = createBus(), hud = Object.assign({}, masslineHud), toasts = [];
  hud.init({ state, bus, helpers: {} });
  bus.on('toast', p => toasts.push(p.text));
  bus.emit('tether:releaseRated', { deliberate: true, targetId: 2, strain: .2 });
  assert.equal(toasts.pop(), 'Line released: strain 20%');
  assert.equal(state.masslineReleaseVerdict.targetGeneration, null);
  assert.equal(state.masslineReleaseVerdict.atX, null);
  bus.emit('tether:releaseRated', { deliberate: true, tonnageU: 0, load: 0, receiptStrain: 0 });
  assert.equal(toasts.pop(), 'Line released: 0 t, load 0%, strain 0%');
  hud.destroy();
});
