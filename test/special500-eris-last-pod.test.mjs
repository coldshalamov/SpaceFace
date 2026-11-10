// special500 SP2-157 — THE ERIS LAST POD (1311). The Margin Fence chair story is live
// (the director's durable special500.SP2-079 row); the line's last pod hangs fraying in the
// west fog. Three hearings under the roll-call bell — the bell keeps its own cadence, so
// one stop under the line cannot stack the count — and the pod can finally go: a clean
// massline cut at low impulse claims the
// chair; a hard yank wakes the line, every pod swings once, and the bar does not speak to
// the player for a sector week.
//
// Every claim routes through live owners: the choir pod is the real ropeable world one-off
// body (data.oneOffId 'oneoff_drift_choir', the physical hull world.js materializes), the
// cut is judged on the ordinary tether:broken break telemetry (the same impulse input
// masslineImpactDamage reads), the wake is a bounded authored impulse through the physics
// membrane, and the durable outcome rides the director's situation memory.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { LAST_POD, runtime as podRuntime } from '../src/data/encounters/1311-eris-last-pod.js';

const SEED = 157;
const SECTOR = 'sector_eris_margin';
const SITE = Object.freeze({ x: 200, z: 320 });     // the choir's authored spot in the west fog
const SHAPE = 'eris_last_pod';
// The director is a ~1 Hz calendar clock: a beat's tick runs after ~1 s of sim elapses.
const STEP_S = 70;

/** Boot one lab: Eris Margin, the choir's live physical last pod, the player under the bell. */
async function boot({ chairStory = true, bells = 0, standWu = 120 } = {}) {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, encounterDirector, 'physics'],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: SITE.x + standWu, z: SITE.z }, isPlayer: true,
      factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  const events = [];
  for (const name of ['encounter:resolved', 'encounter:voice', 'news:publish']) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  if (!state.story || typeof state.story !== 'object') state.story = { flags: {} };
  if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
  if (!state.story.depthProgramEncounters) {
    state.story.depthProgramEncounters = { schemaVersion: 1, completed: {}, history: [] };
  }
  if (chairStory) {
    state.story.depthProgramEncounters.completed[LAST_POD.contextShapeId] = {
      outcome: 'observed', at: 10, tick: 0, encounterId: LAST_POD.contextShapeId,
      sectorId: SECTOR, seed: SEED, facts: {}, visits: 1,
    };
    state.story.flags['special500.SP2-079'] = 10;
  }
  if (bells > 0) state.story.flags[LAST_POD.flagBells] = bells;

  // The choir's last pod: the world one-off's real physical body (mass 55, ropeable).
  const pod = host.spawnObstacle({
    pos: { ...SITE }, radius: 14, mass: 55, dynamic: true,
    data: { oneOffId: LAST_POD.choirOneOffId, masslineTetherable: true, name: 'The Drift Choir' },
  });
  const director = host.runtime.getSystem('encounterDirector');
  return {
    host, state, bus, events, director, pod,
    flags: () => state.story.flags,
    fire: () => director.requestAuthoredEncounter({
      shapeId: SHAPE, encounterId: 'test_last_pod', sectorId: SECTOR,
      anchor: { x: SITE.x, z: SITE.z }, zoneType: 'nebula_fog', zoneRadius: 900, force: true,
    }),
    live: () => Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE) || null,
    leave: () => {
      const player = state.entities.get(state.playerId);
      player.pos.x = SITE.x + LAST_POD.bellWu + 400;
      player.pos.z = SITE.z;
    },
    return: () => {
      const player = state.entities.get(state.playerId);
      player.pos.x = SITE.x + 90;
      player.pos.z = SITE.z;
    },
    latch: () => host.withFeatures(() => host.bus.emit('tether:attached', {
      actorId: state.playerId, targetId: pod.id, attachmentId: 'att_test', restLength: 60,
    })),
    breakLine: (impulse, reason = 'tether_cut') => host.withFeatures(() => host.bus.emit('tether:broken', {
      actorId: state.playerId, ownerId: state.playerId, controllerId: state.playerId,
      targetId: pod.id, attachmentId: 'att_test', reason,
      tension: 40, impulse,
    })),
  };
}

const voice = (h) => h.events.filter((e) => e.name === 'encounter:voice').map((e) => e.p.text);
const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const news = (h) => h.events.filter((e) => e.name === 'news:publish').map((e) => e.p.text);
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];

/** One visit under the bell: fire the beat and let the hearing land. */
async function visit(h) {
  assert.equal(h.fire().ok, true);
  h.host.step(STEP_S);
}

/** Let the bell's own cadence run out (the stale visit window stands the live down with it). */
async function ringGap(h) {
  h.state.simTime += LAST_POD.hearingGapS;
  h.host.step(STEP_S);
}

test('the last pod is registered as a fog-side one-off behind the chair story', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.equal(enc.script, 'selfRegistered');
  assert.ok(enc.zoneTypes.includes('nebula_fog'));
  assert.equal(enc.gates.sectorIds[0], SECTOR);
  assert.equal(enc.gates.requiresCompletedShape, 'special500.SP2-079');
  assert.equal(enc.shape.place, 'nebula_fog');
});

test('gates unmet: no chair story, no pod, or off the bell — the beat stays inert', async () => {
  const noChair = await boot({ chairStory: false });
  try {
    assert.equal(podRuntime.fireReady(noChair.state), false, 'the chair story must be live first');
    assert.equal(noChair.fire().reason, 'resolved_on_fire', 'fired and stood down inert');
    assert.deepEqual(noChair.flags()[LAST_POD.flagBells], undefined, 'no hearing counted');
  } finally { noChair.host.dispose(); }

  const noPod = await boot({});
  try {
    noPod.pod.alive = false;
    assert.equal(podRuntime.fireReady(noPod.state), false, 'no line, no beat');
    assert.equal(noPod.fire().reason, 'resolved_on_fire');
  } finally { noPod.host.dispose(); }

  const offBell = await boot({ standWu: LAST_POD.bellWu + 900 });
  try {
    assert.equal(podRuntime.fireReady(offBell.state), false, 'the bell only rings under the line');
  } finally { offBell.host.dispose(); }
});

test('the roll call: three hearings on the bell cadence, and lingering counts none', async () => {
  const h = await boot({ bells: 0 });
  try {
    await visit(h);
    assert.equal(h.flags()[LAST_POD.flagBells], 1, 'first hearing counted');
    assert.ok(voice(h).some((t) => t.includes('Roll call')), 'the barkeep names the roll');

    // The visit ends without a new ring: the window expires, the beat stands down.
    h.state.simTime += LAST_POD.visitWindowS + 1;
    h.host.step(STEP_S);
    assert.equal(h.live(), null, 'the visit window stands the beat down');

    // Lingering under the bell cannot stack the count: the bell has not rung again.
    const lingering = h.fire();
    assert.equal(lingering.reason, 'resolved_on_fire', 'a refire under the bell stood down inert');
    assert.equal(h.flags()[LAST_POD.flagBells], 1, 'the same stop is still one hearing');

    await ringGap(h);
    assert.equal(podRuntime.fireReady(h.state), true, 'a visit length later the bell rings again');
    await visit(h);
    assert.equal(h.flags()[LAST_POD.flagBells], 2, 'second hearing');
    assert.ok(voice(h).some((t) => t.includes('Nobody new. Nobody less.')), 'the roll holds');

    await ringGap(h);
    await visit(h);
    assert.equal(h.flags()[LAST_POD.flagBells], 3, 'third hearing: the roll call has named you');
    assert.ok(voice(h).some((t) => t.includes('Cut it clean. Cut it slow.')), 'the fraying line is spoken');

    // A fourth visit is not a fourth hearing — the count is full.
    await ringGap(h);
    await visit(h);
    assert.equal(h.flags()[LAST_POD.flagBells], 3);
  } finally { h.host.dispose(); }
});

test('a clean cut after the roll call claims the chair', async () => {
  const h = await boot({ bells: 3 });
  try {
    assert.equal(podRuntime.fireReady(h.state), true, 'named, near, and the pod still hangs');
    assert.equal(h.fire().ok, true);
    h.host.step(STEP_S);

    h.latch();
    h.host.step(STEP_S);
    assert.ok(voice(h).some((t) => t.includes('The line takes your weight')), 'the house warns the hand');

    const velBefore = { x: h.pod.vel.x, z: h.pod.vel.z };
    h.breakLine(40, 'tether_cut');
    h.host.step(STEP_S);

    assert.ok(h.flags()[LAST_POD.flagChair] != null, 'the chair flag is set');
    assert.deepEqual(outcomes(h), ['claimed']);
    assert.equal(memory(h).outcome, 'claimed');
    assert.equal(memory(h).facts.breakImpulse, 40);
    assert.ok(voice(h).some((t) => t.includes('The chair has never been used')), 'the house pours');
    assert.ok(news(h).some((t) => t.includes('CAME DOWN CLEAN')), 'the sector keeps the claim');
    assert.equal(h.flags()[LAST_POD.flagBarSilentUntil], undefined, 'a clean cut owes no silence');
    assert.equal(h.pod.vel.x, velBefore.x, 'a clean cut wakes nothing');

    // One-time: the story is told, the beat never fires again.
    assert.equal(podRuntime.fireReady(h.state), false);
  } finally { h.host.dispose(); }
});

test('a hard yank wakes the line: the pod swings once and the bar goes silent for a sector week', async () => {
  const h = await boot({ bells: 3 });
  try {
    assert.equal(h.fire().ok, true);
    h.host.step(STEP_S);
    h.latch();
    h.host.step(STEP_S);

    const velBefore = { x: h.pod.vel.x, z: h.pod.vel.z };
    h.breakLine(2600, 'tether_cut'); // a loaded cut: half again the line's own break load
    h.host.step(STEP_S);

    assert.deepEqual(outcomes(h), ['woken']);
    assert.equal(memory(h).outcome, 'woken');
    assert.equal(memory(h).facts.breakImpulse, 2600);
    assert.ok(h.pod.vel.z !== velBefore.z, 'the last pod takes the wake as real motion');
    assert.ok(voice(h).some((t) => t.includes('The whole choir swings once')), 'the wake is spoken');
    assert.ok(news(h).some((t) => t.includes('THE ERIS TOW-LINE WOKE')), 'the sector keeps the wake');

    const until = h.flags()[LAST_POD.flagBarSilentUntil];
    const now = h.state.simTime;
    assert.ok(until > now, 'the house silence stands');
    // The stamp is wake-time + one calendar sector week (the read lands a beat later).
    const silence = until - now;
    assert.ok(silence <= LAST_POD.sectorWeekS && silence > LAST_POD.sectorWeekS - 2,
      'the silence is one calendar sector week');

    // One-time: the wake is the end of this story too.
    assert.equal(podRuntime.fireReady(h.state), false);
    assert.equal(h.fire().reason, 'resolved_on_fire', 'a refired beat stands down inert');
    assert.equal(memory(h).outcome, 'woken', 'the durable record took no second outcome');
  } finally { h.host.dispose(); }
});

test('the line letting go under the player\'s load is a yank, not a cut', async () => {
  const h = await boot({ bells: 3 });
  try {
    assert.equal(h.fire().ok, true);
    h.host.step(STEP_S);
    h.latch();
    h.host.step(STEP_S);
    h.breakLine(3400, 'physics_break'); // the massline's own break law, on the player's line
    h.host.step(STEP_S);
    assert.deepEqual(outcomes(h), ['woken'], 'a snapped loaded line wakes the choir');
    assert.ok(h.flags()[LAST_POD.flagBarSilentUntil] > h.state.simTime);
  } finally { h.host.dispose(); }
});

test('a cut before the roll call names you is taken by the fog and answers nothing', async () => {
  const h = await boot({ bells: 1 });
  try {
    assert.equal(h.fire().ok, true);
    h.host.step(STEP_S);
    h.latch();
    h.host.step(STEP_S);
    h.breakLine(30, 'tether_cut'); // clean technique, wrong week
    h.host.step(STEP_S);
    assert.deepEqual(outcomes(h), ['aborted:unnamed_cut'], 'the beat stands down, uninhabited');
    assert.equal(h.flags()[LAST_POD.flagChair], undefined, 'no chair for an unnamed hand');
    assert.equal(h.flags()[LAST_POD.flagBarSilentUntil], undefined, 'no silence owed');
    assert.equal(memory(h), undefined, 'no durable outcome: the pod can still be named');
    assert.ok(voice(h).some((t) => t.includes('Nothing answers')), 'the fog takes the sound');

    // The roll call still counts from where it stood: the bell's cadence re-opens it.
    assert.equal(podRuntime.fireReady(h.state), false, 'the bell has not rung again yet');
    await ringGap(h);
    assert.equal(podRuntime.fireReady(h.state), true, 'the next visit can still hear the bell');
  } finally { h.host.dispose(); }
});

test('a stale save with the terminal row never replays the ending', async () => {
  const h = await boot({ bells: 3 });
  try {
    assert.equal(h.fire().ok, true);
    h.host.step(STEP_S);
    h.latch();
    h.host.step(STEP_S);
    h.breakLine(40, 'tether_cut');
    h.host.step(STEP_S);
    const ended = memory(h);

    // The same save loaded again: the durable row blocks, the pod hangs, nothing fires.
    const again = podRuntime.fireReady(h.state);
    assert.equal(again, false, 'the situation memory is the refire lock');
    const res = h.fire();
    assert.equal(res.reason, 'resolved_on_fire');
    assert.equal(memory(h), ended, 'the record is untouched');
    assert.equal(Object.keys(h.flags()).filter((k) => k === LAST_POD.flagChair).length, 1);
  } finally { h.host.dispose(); }
});
