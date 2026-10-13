import test from 'node:test';
import assert from 'node:assert/strict';
import { fightBeat } from '../scripts/player-truth/driver.mjs';
import { createMasslineInputGrammar } from '../src/systems/masslineInputGrammar.js';
import { stepAnchorRelativeOrbitAssist } from '../src/core/flight/orbitAssist.js';
import { radarHostileCourseText, publishRadarHostileCourse } from '../src/ui/radar.js';

for (const mode of ['latched', 'unlatched', 'phase-change', 'error']) {
  test(`offscreen public pursuit ${mode}: release the visible Massline before chasing, with normal tap grammar`, async () => {
    const saved = { window: globalThis.window, document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
    const attrs = new Map();
    const radar = { offsetParent: {}, getAttribute: k => attrs.get(k) ?? null,
      setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k) };
    const payload = { offsetParent: {}, getBoundingClientRect: () => ({ width: 100, height: 20 }) };
    const player = { id: 1, alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 100, z: 0 }, rot: 0, hull: 260, hullMax: 260 };
    const tether = { active: mode !== 'unlatched', targetId: 374, restLength: 700, phase: 'loaded' };
    const state = { mode: 'flight', simTime: 10, playerId: 1, player: { tether },
      settings: { controls: { bindings: { tether: ['KeyL'] } } },
      run: { kind: 'survival', phase: 'active' }, entityList: [player],
      render: { camera: {}, meshes: new Map(), renderer: { domElement: canvas } } };
    const anchor = { pos: { x: 0, z: 700 }, vel: { x: 0, z: 0 }, alive: true, mass: 16 };
    const steering = () => stepAnchorRelativeOrbitAssist({ host: player, anchor, tether, dt: 1 / 60,
      profile: { maxYawRate: 4 }, strength: 'standard', input: { throttle: 1, turn: 1, boost: true },
      flightIntent: { forward: 1, lateral: 1 } });
    if (tether.active) {
      const owned = steering();
      assert.equal(owned.active, true, 'the canonical orbit owner receives this held W/turn/boost chord');
      assert.notEqual(owned.input.turn, 1, 'holding pursuit keys cannot assume their heading owns an active line');
    }
    const grammar = createMasslineInputGrammar();
    const held = new Set(), presses = [], chase = []; let cuts = 0;
    const paintRadar = () => publishRadarHostileCourse(radar, { baseLabel: 'Local tactical radar.',
      courseText: radarHostileCourseText([{ x: 50, y: 10 }], 50), mode: state.mode, simTime: state.simTime });
    const tapTick = down => {
      state.simTime += 1 / 60;
      const command = grammar.step(1 / 60, { attached: tether.active, held: down, source: 'keyboard' });
      if (command.cut) { tether.active = false; cuts++; }
      paintRadar();
    };
    const page = { evaluate: async (fn, arg) => fn(arg), waitForTimeout: async () => {
      state.simTime += .2; paintRadar();
    }, keyboard: {
      press: async key => {
        presses.push(key); held.add(key);
        if (mode === 'error') throw new Error('public cut input failed');
        assert.equal(key, 'KeyL', 'the actor follows the current public tether rebind');
        tapTick(true); held.delete(key); tapTick(false);
        if (mode === 'phase-change') state.run.phase = 'draft';
      },
      down: async key => {
        held.add(key); chase.push(key);
        assert.equal(tether.active, false, 'the public cut must finish before search thrust or boost');
        const manual = steering();
        assert.equal(manual.active, false); assert.equal(manual.input.turn, 1, 'manual search regains its heading intent');
      }, up: async key => held.delete(key),
    } };
    try {
      globalThis.window = { SF: { THREE: { Vector3: class {} }, state } };
      globalThis.document = { querySelector: selector => selector === '.sf-radar-semantic-canvas' ? radar
        : selector === '.orr-cluster__payload' ? payload : null };
      globalThis.getComputedStyle = () => ({ display: 'block', visibility: tether.active ? 'visible' : 'hidden', opacity: '1' });
      paintRadar();
      if (mode === 'error') await assert.rejects(fightBeat(page, 1), /public cut input failed/);
      else await fightBeat(page, 1);
      assert.deepEqual(presses, mode === 'unlatched' ? [] : ['KeyL']);
      assert.equal(cuts, mode === 'latched' || mode === 'phase-change' ? 1 : 0);
      assert.equal(held.size, 0, 'tether and all search controls release after completion or interruption');
      if (mode === 'phase-change' || mode === 'error') assert.deepEqual(chase, [], 'no chase leaks through a phase change or failed cut');
      else { assert.ok(chase.includes('KeyW')); assert.ok(state.simTime < 14, 'cut plus sustained search stays bounded'); }
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
      }
    }
  });
}
