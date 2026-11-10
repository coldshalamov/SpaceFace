// test/bellhop.test.mjs — BELLHOP / CB-9 / row 506 member 11 (03 §4.3).
// Real physics impacts ring the chime floor: the authored phrase in order is
// the song, a wrong note starts it over, and finishing it holds — tuned
// crystals, a one-time fee, and the drone humming the recovered song.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PHOEBE_CHIME_POST } from '../src/data/phoebePracticeConnection.js';
import { BELLHOP } from '../src/data/bellhop.js';
import {
  bellhopCrystalSpot, bellhopNoteOf, bellhopRings, bellhopStrikeResult,
  bellhopStepLine, bellhopDriftHome,
} from '../src/characters/bellhopRules.js';
import { createBellhop, bellhopSpec, bellhopCrystalSpec } from '../src/systems/bellhop.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

function fixture({ sector = 'sector_phoebe_echo', runKind = 'adventure' } = {}) {
  const bus = createBus();
  const popups = [];
  const grants = [];
  bus.on('comms:popup', (p) => popups.push(p));
  bus.on('economy:grantCredits', (p) => grants.push(p));
  const player = { id: 7, occupantGeneration: 1, alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const state = {
    run: { kind: runKind },
    world: { currentSectorId: sector },
    story: { flags: {} },
    simTime: 100,
    tick: 60,
    playerId: player.id,
    player,
    entityList: [player],
    entities: new Map([[player.id, player]]),
  };
  const helpers = {
    spawnEntity(spec) {
      const e = { id: 900 + state.entityList.length, occupantGeneration: 100 + state.entityList.length, alive: true, ...spec };
      state.entityList.push(e); state.entities.set(e.id, e); return e;
    },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
    sectorCookProviders: [],
  };
  const sys = createBellhop();
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, popups, grants, sys };
}

const robot = (state) => state.entityList.find((e) => e.alive && e.data?.bellhop);
const crystals = (state) => state.entityList.filter((e) => e.alive && e.data?.bellhopCrystal);
const says = (popups, prefix) => popups.filter((p) => String(p.id).startsWith(prefix));
const impact = (state,aId,bId,extra={}) => ({aId,bId,backend:'rapier-dynamic',tick:state.tick,aGeneration:state.entities.get(aId)?.occupantGeneration,bGeneration:state.entities.get(bId)?.occupantGeneration,...extra});
const ring = (bus, state, crystal, impulse = BELLHOP.minImpulse) => {
  bus.emit('physics:impact', impact(state,7,crystal.id,{impulse,pos:{x:crystal.pos.x,z:crystal.pos.z}}));
  state.tick += BELLHOP.ringDebounceTicks; // let the debounce window pass between tests' strikes
};
const byNote = (state, i) => crystals(state).find((e) => e.data.bellhopCrystalIndex === i);

test('spec + spawn: the drone and five crystals, in sector only, one hail per visit', () => {
  const s = bellhopSpec();
  assert.equal(s.data.bellhop, true);
  assert.equal(s.data.authoredCharacter, 'bellhop');
  assert.equal(s.data.homeSectorId, 'sector_phoebe_echo');
  const c = bellhopCrystalSpec(2, false);
  assert.equal(c.data.bellhopCrystalIndex, 2);
  assert.equal(c.data.runtimeOwner, 'bellhop');
  const { state, popups } = fixture();
  assert.ok(robot(state));
  assert.equal(crystals(state).length, BELLHOP.crystalCount);
  const hail = says(popups, 'bellhop_announce');
  assert.equal(hail.length, 1);
  assert.match(hail[0].text, /song broke/);
  assert.equal(fixture({ runKind: 'survival' }).state.entityList.filter((e) => e.data?.bellhop).length, 0);
  assert.equal(fixture({ sector: 'sector_io_reach' }).state.entityList.filter((e) => e.data?.bellhop).length, 0);
});

test('the authored phrase in order advances with step calls and holds the song', () => {
  const { state, bus, popups, grants } = fixture();
  for (let i = 0; i < BELLHOP.song.length; i += 1) {
    ring(bus, state, byNote(state, BELLHOP.song[i]));
  }
  assert.equal(state.story.flags.bellhop_sung, true);
  assert.equal(state.story.flags.bellhop_paid, true);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].amount, BELLHOP.payCr);
  assert.equal(grants[0].reason, 'bellhop:song');
  assert.ok(crystals(state).every((e) => e.data.bellhopTuned === true));
  assert.equal(says(popups, 'bellhop_step_').length, BELLHOP.song.length - 1, 'every note but the last calls its step');
  assert.equal(says(popups, 'bellhop_sung').length, 1);
});

test('a wrong note starts the phrase over — AGAIN.', () => {
  const { state, bus, popups } = fixture();
  ring(bus, state, byNote(state, BELLHOP.song[0])); // progress 1
  ring(bus, state, byNote(state, BELLHOP.song[2])); // wrong — expects song[1]
  assert.equal(state.story.flags.bellhop_progress, 0);
  assert.equal(says(popups, 'bellhop_wrong_').length, 1);
  assert.match(says(popups, 'bellhop_wrong_')[0].text, /AGAIN/);
  // And the phrase can still be rung from the top.
  for (let i = 0; i < BELLHOP.song.length; i += 1) ring(bus, state, byNote(state, BELLHOP.song[i]));
  assert.equal(state.story.flags.bellhop_sung, true);
});

test('a drift-brush never rings, and a ringing hit cannot double-count its own bounce', () => {
  const { state, bus } = fixture();
  const c = byNote(state, BELLHOP.song[0]);
  bus.emit('physics:impact', impact(state,7,c.id,{impulse:BELLHOP.minImpulse-1}));
  assert.equal(state.story.flags.bellhop_progress ?? 0, 0, 'soft contact is not a strike');
  const t0 = state.tick;
  bus.emit('physics:impact', impact(state,7,c.id,{impulse:BELLHOP.minImpulse*2}));
  bus.emit('physics:impact', impact(state,c.id,7,{impulse:BELLHOP.minImpulse*2})); // the bounce, either side
  assert.equal(state.tick - t0 < BELLHOP.ringDebounceTicks, true);
  assert.equal(state.story.flags.bellhop_progress, 1, 'the bounce counted once');
});

test('post-song chimes are the sandbox — strikes after sung never judge', () => {
  const { state, bus, popups } = fixture();
  for (let i = 0; i < BELLHOP.song.length; i += 1) ring(bus, state, byNote(state, BELLHOP.song[i]));
  const before = popups.length;
  ring(bus, state, byNote(state, 0));
  ring(bus, state, byNote(state, 4));
  assert.equal(popups.length, before, 'the tuned chime rings silent of verdicts');
  assert.equal(state.story.flags.bellhop_progress, BELLHOP.song.length);
});

test('kill the tuner: the crystals keep their own time — rings land but nothing judges', () => {
  const { state, bus, popups } = fixture();
  const r = robot(state);
  r.alive = false;
  bus.emit('entity:killed', { id: r.id, killerId: 7 });
  assert.equal(state.story.flags.bellhop_gone, true);
  assert.match(says(popups, 'bellhop_gone')[0].text, /CB-9 DOWN/);
  const before = popups.length;
  ring(bus, state, byNote(state, BELLHOP.song[0]));
  assert.equal(state.story.flags.bellhop_progress ?? 0, 0, 'no tuner, no judge');
  assert.equal(popups.length, before);
  bus.emit('sector:enter', { sectorId: BELLHOP.sectorId });
  assert.equal(robot(state), undefined, 'the drone never re-takes the floor');
  assert.equal(crystals(state).length, BELLHOP.crystalCount, 'the chimes outlive it');
});

test('a shattered crystal is re-hung — raw before the song, tuned after', () => {
  const { state, bus, sys } = fixture();
  const c = byNote(state, 3);
  bus.emit('entity:killed', { id: c.id, killerId: 7 });
  c.alive = false;
  sys.update(0.5, state);
  const rehung = byNote(state, 3);
  assert.ok(rehung, 'the floor owes the seat back');
  assert.equal(rehung.data.bellhopTuned, false);
  // Finish the song, then shatter one — the re-hung spare holds its note.
  for (let i = 0; i < BELLHOP.song.length; i += 1) ring(bus, state, byNote(state, BELLHOP.song[i]));
  const c2 = byNote(state, 1);
  bus.emit('entity:killed', { id: c2.id, killerId: 7 });
  c2.alive = false;
  sys.update(0.5, state);
  assert.equal(byNote(state, 1).data.bellhopTuned, true, 'a spare hung after the song is already tuned');
});

test('drift-home rides the impulse membrane, never vel', () => {
  const { state, sys } = fixture();
  const r = robot(state);
  r.pos = { x: PHOEBE_CHIME_POST.x + 300, z: PHOEBE_CHIME_POST.z };
  sys.update(0.5, state);
  const cmds = consumePhysicsCommand(r);
  assert.ok(cmds && cmds.impulses.length === 1, 'one home-pointing impulse');
  assert.ok(cmds.impulses[0].x < 0, 'toward the post');
});

test('pure rules: spots deterministic, note gate honest, strike math, step calls', () => {
  assert.deepEqual(bellhopCrystalSpot(3), bellhopCrystalSpot(3));
  assert.equal(bellhopNoteOf({ alive: true, data: { bellhopCrystal: true, bellhopCrystalIndex: 4 } }), 4);
  assert.equal(bellhopNoteOf({ alive: true, data: { bellhopCrystal: true, bellhopCrystalIndex: 9 } }), -1);
  assert.equal(bellhopNoteOf({ alive: false, data: { bellhopCrystal: true, bellhopCrystalIndex: 1 } }), -1);
  assert.equal(bellhopNoteOf({ alive: true, data: {} }), -1);
  assert.equal(bellhopRings(BELLHOP.minImpulse), true);
  assert.equal(bellhopRings(BELLHOP.minImpulse - 0.5), false);
  assert.deepEqual(bellhopStrikeResult(0, BELLHOP.song[0]).verdict, 'hit');
  assert.deepEqual(bellhopStrikeResult(0, 99), { progress: 0, verdict: 'miss' });
  assert.equal(bellhopStrikeResult(BELLHOP.song.length - 1, BELLHOP.song[BELLHOP.song.length - 1]).verdict, 'done');
  assert.equal(bellhopStrikeResult(BELLHOP.song.length, 0).verdict, 'done');
  assert.equal(bellhopStepLine(0), 'LOWER.');
  assert.equal(bellhopStepLine(BELLHOP.song.length - 1), 'THERE.');
  assert.equal(bellhopDriftHome({ pos: { ...BELLHOP.post }, vel: { x: 0, z: 0 } }), null);
});

test('destroy + re-init: provider and every owned hull clean', () => {
  const { state, helpers, sys } = fixture();
  assert.equal(helpers.sectorCookProviders.length, 1);
  sys.destroy();
  assert.equal(helpers.sectorCookProviders.length, 0);
  assert.equal(state.entityList.filter(
    (e) => e.alive && (e.data?.bellhop || e.data?.bellhopCrystal)).length, 0);
  sys.init({ state, bus: createBus(), helpers });
  assert.equal(helpers.sectorCookProviders.length, 1);
  assert.ok(robot(state));
  assert.equal(crystals(state).length, BELLHOP.crystalCount);
});


test('five physical crystals sound distinct spatial pitches through the existing audio owner', async () => {
  const { audio } = await import('../src/audio/audioSystem.js');
  const f = fixture(), played = [];
  const ear = Object.create(audio); ear.state = f.state; ear.rt = { ctx: { currentTime: 0 } };
  ear.play = (id, options) => { played.push({ id, options }); return null; };
  f.bus.on('audio:cue', cue => ear._onCue(cue));
  for (let i = 0; i < BELLHOP.crystalCount; i++) ring(f.bus, f.state, byNote(f.state, i));
  assert.equal(played.length, 5, 'each real crystal impact reaches playback, including wrong notes');
  for (let i = 0; i < played.length; i++) {
    assert.equal(played[i].id, 'sfx_discovery_plate_note', 'reuse the authored glass voice');
    assert.deepEqual(played[i].options.position, byNote(f.state, i).pos);
    assert.ok(played[i].options.gain > 0 && played[i].options.gain <= 1);
    if (i) assert.ok(played[i].options.rate > played[i - 1].options.rate, 'each crystal keeps its own ordered pitch');
  }
  assert.equal(f.grants.length, 0, 'playing the wrong phrase still grants nothing');
});

test('chime playback debounces native bounces and survives tuning or tuner loss without a second fee', () => {
  const f = fixture(), cues = []; f.bus.on('audio:cue', cue => cues.push(cue));
  for (const i of BELLHOP.song) ring(f.bus, f.state, byNote(f.state, i));
  assert.equal(f.grants.length, 1);
  cues.length = 0;
  const c = byNote(f.state, 0), event = impact(f.state, 7, c.id, { impulse: 100 });
  f.bus.emit('physics:impact', event); f.bus.emit('physics:impact', event);
  assert.equal(cues.length, 1, 'one crystal bounce sounds once per native debounce window');
  const r = robot(f.state); r.alive = false; f.bus.emit('entity:killed', { id: r.id });
  f.state.tick += BELLHOP.ringDebounceTicks;
  ring(f.bus, f.state, byNote(f.state, 1));
  assert.equal(cues.length, 2, 'the physical chimes outlive their judge');
  assert.equal(f.grants.length, 1);
  assert.equal(f.state.story.flags.bellhop_sung, true);
  assert.equal(f.state.story.flags.bellhop_gone, true);
  const before = cues.length;
  for (const patch of [{ backend: 'legacy' }, { tick: f.state.tick - 1 }, { aGeneration: -1 }, { bGeneration: -1 }]) {
    f.bus.emit('physics:impact', impact(f.state, 7, c.id, { impulse: 100, ...patch }));
  }
  assert.equal(cues.length, before, 'stale or unmeasured contacts cannot fabricate a note');
});


test('orphaned untuned crystals still sound without inventing a judged phrase or fee', () => {
  const f = fixture(), cues = []; f.bus.on('audio:cue', cue => cues.push(cue));
  const r = robot(f.state); r.alive = false; f.bus.emit('entity:killed', { id: r.id });
  for (const note of BELLHOP.song) ring(f.bus, f.state, byNote(f.state, note));
  assert.equal(cues.length, BELLHOP.song.length);
  assert.equal(f.state.story.flags.bellhop_progress, undefined);
  assert.equal(f.state.story.flags.bellhop_sung, undefined);
  assert.equal(f.state.story.flags.bellhop_paid, undefined);
  assert.equal(f.grants.length, 0);
});
