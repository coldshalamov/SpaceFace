// G08-02 — the Pit's thirty rounds carry their authored names and twists.
//
// The course table (src/data/swarmCourse.js) is the design's "thirty rounds with names"
// verbatim: every row is {round, name, twist, twistId} — the name on the round-start
// announcement ("ROUND 7 — Long Shots."), the twist as the second spoken line, and the
// existing event card the twist maps to dealt through the ordinary event seam on that
// round (swarmEventFor on the open rounds, swarmMinorEventFor inside the minor band).
// Rounds whose twist no shipped mechanic carries keep twistId null — the name and the
// roster are the round, never a borrowed card.
//
// The announce harness drives the real run:wavePlanned receipt — the same one survivalRun
// emits — because a line only exists if the ordinary route speaks it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalAnnounce, waveOpeningLine, MAX_LINES_PER_WAVE } from '../src/systems/survivalAnnounce.js';
import { SWARM_COURSE, swarmCourseFor } from '../src/data/swarmCourse.js';
import {
  SWARM_EVENT_BY_ID,
  SWARM_MINOR_WAGER_SCALE,
  isSwarmMinorEventWave,
  swarmEventFor,
  swarmMinorEventFor,
} from '../src/data/swarmEvents.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { swarmRoundPreview } from '../src/data/swarmLadder.js';
import { createSwarmEventDirector, swarmEventFrame } from '../src/systems/swarmEvents.js';

const ARENA = 'helios_core';
const SEED = 4242;
const LINE_EVENTS = new Set(['voice:say', 'alert']);

/** The design's authored table — the source every row must match. */
const AUTHORED = [
  [1, 'Doors Open', 'ten Wasps, one gate. Kiln explains nothing'],
  [2, 'Second Helpings', 'Wasps from two gates. The first wall gun is lit'],
  [3, 'Hot Potato', 'Detonator Darts. The round teaches throwing things back'],
  [4, 'Mind the Gap', 'the lane runs for the first time, with Wasps on both sides of it'],
  [5, 'Iron Maw', 'Boss. A mouth that eats what you throw — until you throw a Detonator'],
  [6, 'The Charge', 'Bruisers. Every wall has a scorch mark by the end'],
  [7, 'Long Shots', 'Lancers at the edges, Wasps in the middle. Rocks appear for cover'],
  [8, 'Breadcrumbs', 'Jackals. The floor fills with mines that are also yours to use'],
  [9, 'Tug of War', 'Tether Raiders. Half the round you are attached to something'],
  [10, 'Corsair Wing', 'Boss: five ships that fly as one. The room changes — the crusher wakes. Bench'],
  [11, 'The Umbrella', 'a Warden shielding gunners. Take the handle away'],
  [12, 'Delivery', 'enemies arrive on the freight. Cut the container loose before it stops'],
  [13, 'Lights Out', 'the arena dims. Ghosts. Your own lamps and the lane lights are all you have'],
  [14, 'Hands Off', 'Anchor Controllers pin whatever you pick up. Nothing stays thrown'],
  [15, 'Mirrorjaw Foreman', 'Boss. Copies the last gun that hit it. Hit it with a rock'],
  [16, 'Rush Hour', 'both lanes, double the traffic, a full pack. The room is the weapon'],
  [17, 'No Small Change', 'Point-Defense Screens shoot down anything small. Find something big'],
  [18, 'Highway Robbery', 'Reavers steal your Scrap and run for the gates. Chase or lose it'],
  [19, 'The Law', 'Lawmen and Cutters box you in — and stop for the lane lights'],
  [20, 'The Yardmaster', 'Boss. It controls the freight. The lanes change direction mid-fight. The room changes again. Bench'],
  [21, 'The Wall', 'heavies, shoulder to shoulder. Guns do nothing. Use the room'],
  [22, 'Chain Gang', 'every enemy is tethered to another. Swing one, swing them all'],
  [23, 'The Choir', 'Zealots in rings. Find the singer'],
  [24, 'Everything Must Go', 'prices halved, enemies doubled, ninety seconds'],
  [25, 'The Anvil', 'Boss. Too heavy to move. So move everything else into it'],
  [26, 'The Umbrella, Again', 'two Wardens covering each other'],
  [27, 'Tailgate', 'a heavy rides the freight round and round. It can only be hit from the lane'],
  [28, 'Black Friday', 'every drop type falls at once, and so does every enemy type'],
  [29, 'Quiet', 'forty seconds of nothing. Then the gates all open together'],
  [30, 'The Forge Regent', 'Final boss. It runs the furnace. Three stages: it feeds the room to the furnace, then feeds the furnace to the room, then comes out itself. Win, and the lights come up'],
];

function boot() {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  run.arenaId = ARENA;
  run.phase = 'active';
  state.run = run;
  survivalAnnounce.init({ state, bus, helpers: {} });
  return {
    state,
    bus,
    emitted,
    texts: () => emitted.filter((e) => LINE_EVENTS.has(e.event)).map((e) => e.payload.text),
  };
}

function planFor(wave) {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
  assert.ok(!plan.error, `wave ${wave} plans`);
  assert.ok(plan.swarm, `wave ${wave} carries the swarm block`);
  return plan;
}

/** Drive a wave from planned → started, as survivalRun does. */
function openWave(h, wave, plan = planFor(wave)) {
  h.state.run.wave = wave;
  h.bus.emit('run:wavePlanned', { wave, plan });
  h.bus.emit('run:waveStarted', { wave, tick: 1 });
  return plan;
}

/** A live director on a mock bus — the wager/minor-band suites' own harness. */
function armedDirector({ arenaId, wave, seed = SEED }) {
  const emitted = [];
  const subs = [];
  const bus = {
    on(event, handler) { subs.push([event, handler]); return () => {}; },
    emit(event, payload) {
      emitted.push({ event, payload });
      for (const [type, handler] of subs) if (type === event) handler(payload);
    },
  };
  const state = {
    simTime: 0,
    playerId: 1,
    entities: new Map([[1, { id: 1, team: 1, pos: { x: 40, z: -15 } }]]),
    run: { kind: 'survival', ruleset: 'swarm', phase: 'active', arenaId, wave, seed },
  };
  const director = createSwarmEventDirector({
    state,
    bus,
    helpers: { spawnEntity(spec) { return { id: 'pod-1' }; } },
    registry: { get: (name) => (name === 'fields' ? {
      updateExternal(id, patch) { return { id }; },
      unregisterExternal() { return true; },
      registerEnvironmental(spec) { return spec; },
    } : null) },
  });
  director.init();
  director.setFrame(swarmEventFrame({ at: { x: 0, z: 0 }, laneGate: 'front', seed, wave }));
  director.setInstalledFields([{ id: 'room_field', strength: 40 }]);
  const h = { director, bus, state, emitted };
  h.telegraphed = () => emitted.filter((e) => e.event === 'swarm:eventTelegraphed').map((e) => e.payload);
  return h;
}

// ── The table itself ───────────────────────────────────────────────────────────────────

test('the course is thirty frozen rows — the design table verbatim', () => {
  assert.equal(SWARM_COURSE.length, 30, 'exactly thirty rounds');
  assert.ok(Object.isFrozen(SWARM_COURSE), 'the table is frozen');
  const names = new Set();
  for (const [round, name, twist] of AUTHORED) {
    const row = SWARM_COURSE[round - 1];
    assert.ok(row, `round ${round} exists`);
    assert.ok(Object.isFrozen(row), `round ${round} is frozen`);
    assert.deepEqual(Object.keys(row).sort(), ['name', 'round', 'twist', 'twistId']);
    assert.equal(row.round, round);
    assert.equal(row.name, name, `round ${round}'s name is verbatim`);
    assert.equal(row.twist, twist, `round ${round}'s twist is verbatim`);
    assert.ok(row.twistId === null || typeof row.twistId === 'string');
    names.add(row.name);
  }
  assert.equal(names.size, 30, 'every round has a unique name');
});

test('swarmCourseFor answers inside the thirty and is quiet past the win', () => {
  assert.equal(swarmCourseFor(1).name, 'Doors Open');
  assert.equal(swarmCourseFor(30).name, 'The Forge Regent');
  for (const wave of [0, -3, 31, 150, 'x', null, undefined]) {
    assert.equal(swarmCourseFor(wave), null, `wave ${wave} has no authored row`);
  }
});

// ── Every non-null twistId resolves to a real mechanic — and the band's law holds ──────

test('every non-null twistId is a real event card the seam can deal', () => {
  const twisted = SWARM_COURSE.filter((row) => row.twistId !== null);
  assert.ok(twisted.length > 0, 'the course actually twists some rounds');
  for (const row of twisted) {
    const card = SWARM_EVENT_BY_ID[row.twistId];
    assert.ok(card, `round ${row.round} (${row.name}) names a real card: ${row.twistId}`);
    if (isSwarmMinorEventWave(row.round)) {
      assert.equal(card.minor, true,
        `round ${row.round} rides the minor band — only minor-tagged cards deal there`);
    }
  }
});

// ── The mechanic actually applies on its round through the ordinary seam ───────────────

test('open rounds deal the authored twist card ahead of the seeded draw', () => {
  for (const row of SWARM_COURSE) {
    const draw = swarmEventFor({ arenaId: ARENA, wave: row.round, seed: SEED });
    if (row.twistId && !isSwarmMinorEventWave(row.round)) {
      assert.equal(draw && draw.id, row.twistId,
        `round ${row.round} (${row.name}) deals ${row.twistId}`);
      assert.equal(draw, swarmEventFor({ arenaId: ARENA, wave: row.round, seed: SEED }),
        `round ${row.round}'s card is the same frozen def every call`);
    } else {
      assert.equal(draw, null, `round ${row.round} books no major-band card`);
    }
  }
});

test('band rounds serve the authored twist at the minor voice and price', () => {
  for (const row of SWARM_COURSE.filter((r) => isSwarmMinorEventWave(r.round))) {
    const draw = swarmMinorEventFor({ arenaId: ARENA, wave: row.round, seed: SEED });
    if (row.twistId && SWARM_EVENT_BY_ID[row.twistId].minor === true) {
      assert.equal(draw.id, row.twistId, `round ${row.round} deals its authored twist`);
      const authored = SWARM_EVENT_BY_ID[row.twistId];
      assert.equal(draw.band, 'minor');
      assert.equal(draw.wager.score,
        Math.max(1, Math.round(authored.wager.score * SWARM_MINOR_WAGER_SCALE)),
        'the twist pays the band price');
    } else {
      assert.ok(draw, `round ${row.round} still deals its seeded minor card`);
    }
  }
});

test('the live director telegraphs each twisted round through the shipped seam', () => {
  for (const row of SWARM_COURSE.filter((r) => r.twistId !== null)) {
    const h = armedDirector({ arenaId: ARENA, wave: row.round });
    h.bus.emit('run:waveStarted', { wave: row.round });
    const offers = h.telegraphed();
    assert.equal(offers.length, 1, `round ${row.round} telegraphs exactly one card`);
    assert.equal(offers[0].eventId, row.twistId,
      `round ${row.round} (${row.name}) plays ${row.twistId}`);
    assert.equal(offers[0].band, isSwarmMinorEventWave(row.round) ? 'minor' : 'major',
      `round ${row.round} rides the right band`);
    h.director.destroy();
  }
});

// ── The round-start announcement ───────────────────────────────────────────────────────

test('a course round opens "ROUND N — NAME." with the twist as the second line', () => {
  for (const wave of [1, 4, 7, 8, 16, 23, 29]) {
    const h = boot();
    openWave(h, wave);
    const texts = h.texts();
    const course = swarmCourseFor(wave);
    assert.ok(texts[0].startsWith(`ROUND ${wave} — ${course.name}.`),
      `wave ${wave} opens "ROUND ${wave} — ${course.name}." — got: ${texts[0]}`);
    assert.equal(texts[1], course.twist,
      `wave ${wave}'s second line is the authored twist`);
    assert.ok(texts.length <= MAX_LINES_PER_WAVE, 'still inside the line budget');
    survivalAnnounce.destroy();
  }
});

test('a named boss round does not repeat its own name — the boss line carries the tell', () => {
  for (const wave of [10, 15, 20, 25, 30]) {
    const h = boot();
    openWave(h, wave);
    const texts = h.texts();
    const course = swarmCourseFor(wave);
    assert.ok(texts[0].startsWith(`ROUND ${wave} — ${course.name}.`), `wave ${wave} opens named`);
    assert.equal(texts[1], course.twist, `wave ${wave}'s twist is the second line`);
    const occurrences = texts[0].split(course.name).length - 1;
    assert.equal(occurrences, 1, `wave ${wave} names ${course.name} once, not twice`);
    survivalAnnounce.destroy();
  }
});

test('the Iron Maw keeps its hull name — the round name is not the ship', () => {
  const h = boot();
  openWave(h, 5);
  const texts = h.texts();
  assert.ok(texts[0].startsWith('ROUND 5 — Iron Maw.'));
  assert.ok(texts[0].includes("Dreadnought 'Iron Maw'."),
    'the dreadnought still names itself on arrival');
  assert.equal(texts[1], swarmCourseFor(5).twist);
  survivalAnnounce.destroy();
});

test('the open ladder and the Circuit keep their own headings — no borrowed names', () => {
  // Past the win the ladder has no authored names; the opener stays the old one.
  const deep = waveOpeningLine(35, planFor(35));
  assert.ok(deep.startsWith('Wave 35.'), `deep wave keeps "Wave N." — got: ${deep}`);
  // A Circuit round names its stage, not a course round.
  const circuit = planFor(7);
  circuit.swarm.circuit = { stage: 1, localRound: 7, kind: 'survive' };
  const circuitLine = waveOpeningLine(7, circuit);
  assert.ok(circuitLine.startsWith('Wave 7.'), `circuit keeps "Wave N." — got: ${circuitLine}`);
  // An arc plan carries no swarm block and never borrows the course either.
  const arcPlan = planWave({ seed: SEED, arenaId: ARENA, wave: 7 });
  assert.ok(!arcPlan.swarm);
  assert.ok(waveOpeningLine(7, arcPlan).startsWith('Wave 7.'));
});

// ── The armory preview carries the round's identity ────────────────────────────────────

test('the round preview exposes the authored name and twist', () => {
  const long = swarmRoundPreview({ arenaId: ARENA, wave: 7, seed: SEED });
  assert.deepEqual(long.course, {
    round: 7, name: 'Long Shots',
    twist: 'Lancers at the edges, Wasps in the middle. Rocks appear for cover',
    twistId: 'plate_drift',
  });
  assert.equal(long.event.name, 'Plate drift', 'the preview names the card the twist deals');
  const quiet = swarmRoundPreview({ arenaId: ARENA, wave: 29, seed: SEED });
  assert.equal(quiet.course.name, 'Quiet');
  assert.equal(quiet.course.twistId, null);
  const deep = swarmRoundPreview({ arenaId: ARENA, wave: 35, seed: SEED });
  assert.equal(deep.course, null, 'the open ladder has no authored row');
});
