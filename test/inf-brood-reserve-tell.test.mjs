// inf-brood-reserve-tell — the wave's held-back second breath, heard. The brood reserve
// (B5) lands mid-wave as one gate clump at the 165 wu arrival ring and its receipt
// (`swarm:broodReserve`) had no production consumer: the only voice near the drop was the
// family telegraph, which speaks a family's behavior line for ANY commitment (a mother's
// birth, a splitter's break) and carries no count and no bearing. This wires the combat
// net to the receipt, reusing the wave-7 reinforce machinery exactly:
//   the line — the count and the compass word where the clump landed, in the gate tell's
//   own sentence shape and "the <compass>" words, so "out of the north" is true on screen;
//   the machinery — the same 8 s gap, the same 2-per-wave cap and the same counters the
//   reinforcement tell keeps (they are the same kind of sentence about the same kind of
//   arrival), the same warn/finite-ttl alert lane, counted in the hard per-wave bound;
//   the honesty — a landing point nobody can read still says the count ("on approach");
//   a drop finishing its budget over several ticks coalesces into one line per gap;
//   another wave's receipt says nothing.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { survivalAnnounce } from '../src/systems/survivalAnnounce.js';
import {
  MAX_REINFORCE_LINES_PER_WAVE,
  REINFORCE_TELL_GAP_S,
} from '../src/systems/survivalAnnounce.js';

const WAVE = 15;
const T0 = 30; // the wave is live deep inside the run, past every reset clock

/** The combat net alone — the reserve tell is announce's seam; the engine side emits the bus receipt. */
function boot() {
  const state = createGameState(4242);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 400,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
  state.run.phase = 'active';
  state.run.wave = WAVE;
  state.mode = 'flight';
  state.simTime = T0;
  survivalAnnounce.init({ state, bus, registry: { get: () => null } });
  bus.emit('run:started', {});
  state.simTime = T0;
  bus.emit('run:waveStarted', { wave: WAVE });
  return { state, bus, emitted, player };
}

/** Reopen the wave on the same boot (a fresh per-wave budget, the _resetWave law). */
function reopenWave(h) {
  h.state.simTime = T0;
  survivalAnnounce._resetWave(WAVE);
  h.bus.emit('run:waveStarted', { wave: WAVE });
}

function alerts(h) {
  return h.emitted.filter((e) => e.event === 'alert');
}

function lines(h) {
  return alerts(h).map((e) => e.payload.text);
}

test('a reserve drop names its count and the compass word where it landed', () => {
  const h = boot();
  try {
    // +z is north, screen up — the clump lands 300 wu north of the pilot.
    h.bus.emit('swarm:broodReserve', {
      familyId: 'mite', count: 6, wave: WAVE, pos: { x: 0, z: 300 },
    });
    assert.deepEqual(lines(h), ['Six more inbound — out of the north.']);
    const alert = alerts(h)[0].payload;
    assert.equal(alert.key, `reserve:${WAVE}`);
    assert.equal(alert.sev, 'warn', 'a state of the round on the warn lane');
    assert.ok(Number.isFinite(alert.ttl) && alert.ttl > 0, 'finite ttl — never a pill');
  } finally {
    survivalAnnounce.destroy();
  }
});

test('the compass words are the landing point\'s, read against the pilot position', () => {
  const h = boot();
  try {
    const word = (x, z) => {
      h.emitted.length = 0;
      reopenWave(h);
      h.bus.emit('swarm:broodReserve', { familyId: 'mite', count: 2, wave: WAVE, pos: { x, z } });
      return lines(h)[0];
    };
    // East is +x; west is −x (playerCompass.js — the one convention every bearing reads).
    assert.match(word(300, 0), /out of the east\.$/);
    assert.match(word(0, -300), /out of the south\.$/);
    assert.match(word(-300, 0), /out of the west\.$/);
    assert.match(word(210, 210), /out of the north(?:east)?\.$/);
  } finally {
    survivalAnnounce.destroy();
  }
});

test('a drop finishing over several ticks is one line per gap, then the cap', () => {
  const h = boot();
  try {
    const tick = (count) => h.bus.emit('swarm:broodReserve', {
      familyId: 'mite', count, wave: WAVE, pos: { x: 0, z: 300 },
    });
    tick(6);
    h.state.simTime += 0.2;
    tick(5); // same burst, next tick — the 8 s gap coalesces it
    h.state.simTime += 0.2;
    tick(4);
    assert.equal(lines(h).length, 1, 'one burst, one line');

    h.state.simTime += REINFORCE_TELL_GAP_S;
    tick(2);
    assert.equal(lines(h).length, 2, 'a later drop inside the same wave may speak again');
    assert.match(lines(h)[1], /^Two more inbound/);

    h.state.simTime += REINFORCE_TELL_GAP_S;
    tick(1);
    assert.equal(lines(h).length, 2,
      `the shared per-wave cap holds (max ${MAX_REINFORCE_LINES_PER_WAVE})`);
  } finally {
    survivalAnnounce.destroy();
  }
});

test('the reserve shares the reinforcement tell\'s own clock and budget', () => {
  const h = boot();
  try {
    // The pressure hold's reinforcement materializes first (the wave-7 path).
    h.bus.emit('run:waveMaterialized', {
      wave: WAVE, admitted: 3, enemyId: 'wasp_swarmer', reinforcement: true,
      gateGroup: 'N', tick: 1,
    });
    assert.equal(lines(h).length, 1, 'the reinforce tell spoke');
    // The reserve drop lands one second later: same machinery, same gap — no second voice.
    h.state.simTime += 1;
    h.bus.emit('swarm:broodReserve', { familyId: 'mite', count: 5, wave: WAVE, pos: { x: 0, z: 300 } });
    assert.equal(lines(h).length, 1, 'the drop inside the gap is the same sentence, not a chorus');
    // Past the gap the reserve takes the second line; the reinforce stream now finds the cap.
    h.state.simTime += REINFORCE_TELL_GAP_S;
    h.bus.emit('swarm:broodReserve', { familyId: 'mite', count: 4, wave: WAVE, pos: { x: 0, z: 300 } });
    assert.equal(lines(h).length, 2);
    h.state.simTime += REINFORCE_TELL_GAP_S;
    h.bus.emit('run:waveMaterialized', {
      wave: WAVE, admitted: 2, enemyId: 'wasp_swarmer', reinforcement: true,
      gateGroup: 'S', tick: 2,
    });
    assert.equal(lines(h).length, 2, 'the cap is shared and hard');
  } finally {
    survivalAnnounce.destroy();
  }
});

test('a landing point nobody can read still says the count; another wave says nothing', () => {
  const h = boot();
  try {
    h.bus.emit('swarm:broodReserve', { familyId: 'mite', count: 3, wave: WAVE });
    assert.deepEqual(lines(h), ['Three more inbound, on approach.'],
      'no readable point, no compass guess');

    reopenWave(h);
    h.emitted.length = 0;
    h.bus.emit('swarm:broodReserve', {
      familyId: 'mite', count: 2, wave: WAVE, pos: { x: 0.5, z: 0.5 },
    });
    assert.deepEqual(lines(h), ['Two more inbound, on approach.'],
      'a landing at the pilot\'s side names no bearing');

    reopenWave(h);
    h.emitted.length = 0;
    h.bus.emit('swarm:broodReserve', { familyId: 'mite', count: 4, wave: WAVE + 1, pos: { x: 0, z: 300 } });
    assert.deepEqual(lines(h), [], 'another wave\'s reserve is not this wave\'s sentence');
  } finally {
    survivalAnnounce.destroy();
  }
});
