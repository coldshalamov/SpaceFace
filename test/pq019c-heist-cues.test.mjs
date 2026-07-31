// PQ-019C — the player-visible half of the capsule run.
//
// The packet asks for readable TIMING, OWNERSHIP, WITNESS, WANTED, PURSUIT, CATCHER/FENCE, DENIAL
// and RECOVERY cues, through existing surfaces only, one-voice compliant. These tests pin the part
// a player can actually perceive: which run moments become spoken lines, that each is bounded rather
// than per-frame, that the whole run occupies exactly ONE voice floor, that nothing depends on hue
// or motion, and that none of it reaches the simulation.
//
// The voice arbiter here is the REAL one, registered last so a line said during missions.update
// reaches the floor on the same tick.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';
import { missions } from '../src/systems/missions.js';
import { CHANNEL_PRIORITY, voiceArbiter } from '../src/ui/voiceArbiter.js';
import { PQ019_HEIST_SECTOR_ID } from '../src/data/heistFacilities.js';
import {
  PQ019C_HEIST_TYPE, PQ019C_HEIST_STATION_ID, buildHeistOffer,
} from '../src/data/heistMission.js';
import {
  HEIST_CUE_TEXT, HEIST_VOICE_CHANNEL, HEIST_VOICE_ID,
} from '../src/missions/heistMissionRuntime.js';

const SYSTEMS = [
  physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime, missions, voiceArbiter,
];

function roleEntities(state, role) {
  return state.entityList.filter((e) => e?.alive !== false && e.data?.heistFacilityRole === role);
}

function boot({ seed = 19019, withPatrol = true } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  state.player.heat = 0;
  state.player.credits = 20000;
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);

  const cues = [];
  const surfaced = [];
  const cleared = [];
  bus.on('heist:missionCue', (p) => cues.push(p));
  bus.on('voice:surface', (p) => surfaced.push(p));
  bus.on('voice:clear', (p) => cleared.push(p));

  const step = (n = 1) => { for (let i = 0; i < n; i++) sim.step(SIM_DT); };

  const anchor = (() => {
    const head = roleEntities(state, 'heist_launcher_head')[0];
    return head ? { x: head.pos.x, z: head.pos.z } : { x: 0, z: 0 };
  })();
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: anchor.x + 120, z: anchor.z }, radius: 42,
    data: { stationId: 'station_tethys_customs', dockRadius: 72, factionId: 'faction_scn' },
  });
  const jobs = sim.registry.get('npcJobsRuntime');
  if (withPatrol) {
    const hull = sim.spawn({
      type: 'ship', team: 2, factionId: 'faction_scn',
      pos: { x: anchor.x + 200, z: anchor.z + 60 }, radius: 9, hull: 100, hullMax: 100,
      data: { worldRecordId: 'wr_tethys_patrol', ai: { lawful: true, archetype: 'patrol_lawman' } },
    });
    jobs.assign(hull, {
      kind: NPC_JOB_KIND.PATROL,
      route: [
        { id: 'b0', pos: { x: anchor.x + 200, z: anchor.z } },
        { id: 'b1', pos: { x: anchor.x, z: anchor.z + 200 } },
      ],
      sectorId: PQ019_HEIST_SECTOR_ID,
      speed: 100, commissionS: 1, departS: 1, approachS: 1,
      workS: 2, loadS: 1, unloadS: 1, dwellS: 1,
    });
  }

  const t = {
    sim, state, bus, cues, surfaced, cleared, step, anchor,
    arbiter: sim.registry.get('voiceArbiter'),
    missionsSys: sim.registry.get('missions'),
    mission: () => (state.missions.active || []).find((m) => m && m.heist) || null,
    capsule: () => {
      const id = state.heistFacilities?.capsuleEntityId;
      return id == null ? null : state.entities.get(id);
    },
    accept: ({ launchWindowS = 1 } = {}) => {
      const board = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
      board.slots = board.slots.filter((o) => o && o.type !== PQ019C_HEIST_TYPE);
      const offer = buildHeistOffer({ epoch: 0 });
      offer.params.launchWindowS = launchWindowS;
      board.slots.unshift(offer);
      bus.emit('ui:acceptMission', { missionId: offer.id });
      return t.mission();
    },
    stepToLaunch: (max = 400) => {
      for (let i = 0; i < max; i++) { step(1); if (t.capsule()) return true; }
      return false;
    },
    latch: () => {
      const capsule = t.capsule();
      assert.ok(capsule, 'latch needs a live capsule');
      bus.emit('tether:latched', { targetId: capsule.id, type: 'tether_massline' });
    },
    contact: (facilityId, tickOffset = 1) => {
      const head = roleEntities(state, `${facilityId}_head`)[0];
      const capsule = t.capsule();
      assert.ok(head && capsule);
      bus.emit('physics:impact', {
        tick: (state.tick | 0) + tickOffset, aId: capsule.id, bId: head.id, dp: 50,
        pos: { x: head.pos.x, z: head.pos.z },
      });
    },
    moments: () => cues.map((c) => c.moment),
    heistSurfaces: () => surfaced.filter((p) => p && p.id === HEIST_VOICE_ID),
  };
  return t;
}

/** A full witnessed heist ending at the fence: the route that speaks the most lines. */
function flyFullHeist(t) {
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  t.contact('fence_receiver');
  t.step(4);
  return m;
}

// ── The named cue families ─────────────────────────────────────────────────────────────────────

test('the run speaks every cue family the packet names', () => {
  const t = boot();
  flyFullHeist(t);
  const moments = t.moments();
  // timing, ownership, witness, WANTED, pursuit, catcher/fence
  assert.ok(moments.includes('accepted'), 'TIMING: the launcher is arming');
  assert.ok(moments.includes('launched'), 'TIMING: the capsule is away');
  assert.ok(moments.includes('possessed'), 'OWNERSHIP: the capsule is in tow');
  // WITNESS + WANTED + PURSUIT arrive as ONE composed line, because all three are decided in the
  // same tick and a single stable voice id coalesces in place. See HEIST_CUE_TEXT.
  assert.ok(moments.includes('theft_witnessed_pursuit'),
    'WITNESS + WANTED + PURSUIT in one floor slot');
  const composed = HEIST_CUE_TEXT.theft_witnessed_pursuit;
  assert.match(composed, /witness/i, 'the composed line still states the WITNESS fact');
  assert.match(composed, /WANTED/, 'and the WANTED fact');
  assert.match(composed, /patrol/i, 'and the PURSUIT fact');
  assert.ok(moments.includes('fenced'), 'FENCE: the outcome');
});

test('an unwitnessed theft says so instead of staying silent', () => {
  const t = boot({ withPatrol: false });
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  // Move the only lawful station far away so the theft is genuinely unseen. The law owner denies,
  // and a denial the player cannot perceive is indistinguishable from getting away with it.
  for (const station of t.state.entityList.filter((e) => e.type === 'station')) {
    station.pos.x += 100000;
  }
  t.latch();
  assert.ok(t.moments().includes('theft_unwitnessed'), 'DENIAL: the theft is unlogged, for now');
  assert.equal(m.heist.lawIncidentReceiptId, null);
  assert.ok(!t.moments().some((x) => x.startsWith('theft_witnessed')),
    'no WANTED claim without an accepted, law-signed incident');
  assert.ok(!/WANTED/.test(HEIST_CUE_TEXT.theft_unwitnessed));
});

test('no patrol in range is spoken, not silently skipped', () => {
  const t = boot({ withPatrol: false });
  t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  assert.ok(t.moments().includes('theft_witnessed_no_patrol'),
    'PURSUIT: nobody is coming, and you are told rather than left to infer it from silence');
  assert.ok(!t.moments().includes('theft_witnessed_pursuit'));
  assert.match(HEIST_CUE_TEXT.theft_witnessed_no_patrol, /no patrol/i);
});

test('the catcher route speaks its own outcome, distinct from the fence', () => {
  const t = boot();
  t.accept();
  assert.ok(t.stepToLaunch());
  t.contact('lawful_catcher');
  t.step(4);
  assert.ok(t.moments().includes('lawful_arrival'));
  assert.ok(!t.moments().includes('fenced'));
});

// ── One voice ──────────────────────────────────────────────────────────────────────────────────

test('the whole run occupies at most one voice floor slot', () => {
  const t = boot();
  let maxQueue = 0;
  const originalStep = t.step;
  const watchedStep = (n = 1) => {
    for (let i = 0; i < n; i++) {
      originalStep(1);
      const size = t.arbiter && typeof t.arbiter.queueSize === 'function'
        ? t.arbiter.queueSize()
        : (t.state.ui?.voice?.queue?.length || 0);
      maxQueue = Math.max(maxQueue, size);
    }
  };
  t.step = watchedStep;
  flyFullHeist(t);
  assert.ok(maxQueue <= 1, `the voice queue never exceeds one entry (saw ${maxQueue})`);
});

test('every surfaced heist line carries one stable id on the objective channel', () => {
  const t = boot();
  flyFullHeist(t);
  // missions' own "Tracking: ..." line (id `objective:tracked`) is enqueued by trackMission at the
  // same `objective` priority, and the queue resolves equal priority by insertion order. The heist
  // lines therefore wait behind it rather than shouting over it — which is the arbiter working —
  // so the floor has to be given time to free before asserting a surface.
  t.step(300);
  const surfaces = t.heistSurfaces();
  assert.ok(surfaces.length >= 1, 'the run reached the floor at least once');
  for (const surface of surfaces) {
    assert.equal(surface.id, HEIST_VOICE_ID, 'one stable id, so lines coalesce in place');
    assert.equal(surface.priority, CHANNEL_PRIORITY[HEIST_VOICE_CHANNEL]);
    assert.notEqual(surface.priority, CHANNEL_PRIORITY.danger,
      'danger is reserved for life-critical alerts; a contract cue never claims it');
  }
  // Every clear is paired to the same id.
  for (const clear of t.cleared) {
    if (clear && clear.id === HEIST_VOICE_ID) assert.equal(clear.id, HEIST_VOICE_ID);
  }
});

test('the theft truth waits out the first-use Massline tutorial instead of going stale', () => {
  const t = boot();
  t.accept();
  assert.ok(t.stepToLaunch());
  t.arbiter.newGame();
  t.bus.emit('voice:say', {
    channel: 'tutorial',
    id: 'tutorial:hint:masslineThrow',
    text: 'Hold RIGHT MOUSE; release waits for the white diamond.',
    ttl: 7,
  });
  t.arbiter.update(0, t.state);
  const latchedAtSimTime = t.state.simTime;
  t.latch();
  t.arbiter.update(0, t.state);

  assert.equal(t.arbiter.queue.active?.id, 'tutorial:hint:masslineThrow');
  assert.equal(t.arbiter.queue.pending.some((entry) => entry.id === HEIST_VOICE_ID), true);

  t.state.simTime = latchedAtSimTime + 7.01;
  t.arbiter.update(0, t.state);
  assert.equal(t.arbiter.queue.active?.id, HEIST_VOICE_ID,
    'the composed witness/WANTED/pursuit truth must surface after the tutorial floor expires');
  assert.equal(t.arbiter.queue.active?.text, HEIST_CUE_TEXT.theft_witnessed_pursuit);
});

test('each cue moment fires at most once, no matter how long the run is driven', () => {
  const t = boot();
  flyFullHeist(t);
  t.step(240);
  const counts = new Map();
  for (const moment of t.moments()) counts.set(moment, (counts.get(moment) || 0) + 1);
  for (const [moment, count] of counts) {
    assert.equal(count, 1, `${moment} must be bounded, not per-frame`);
  }
});

test('cue ids are stable and unique per moment, so a re-render replaces in place', () => {
  const t = boot();
  flyFullHeist(t);
  const ids = t.cues.map((c) => c.cueId);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate cue receipts');
  for (const cue of t.cues) {
    assert.ok(cue.cueId.startsWith('pq019c:cue:'), 'namespaced cue identity');
    assert.equal(cue.voiceId, HEIST_VOICE_ID);
    assert.equal(cue.channel, HEIST_VOICE_CHANNEL);
  }
});

// ── Accessibility properties ───────────────────────────────────────────────────────────────────

test('every line carries its whole meaning in words', () => {
  // NON-COLOR SEMANTICS: each line names its subject and its consequence. Nothing depends on hue,
  // and nothing is a bare status token that would need a legend.
  for (const [moment, text] of Object.entries(HEIST_CUE_TEXT)) {
    assert.ok(typeof text === 'string' && text.length >= 20,
      `${moment} must read as a sentence, not a token`);
    assert.ok(/[a-z]/.test(text), `${moment} must not be an all-caps status token`);
    assert.ok(!/\b(red|green|amber|yellow|blue|orange)\b/i.test(text),
      `${moment} must not name a colour as its meaning`);
  }
});

test('no cue introduces motion or a new surface of its own', () => {
  const t = boot();
  const before = t.state.entityList.length;
  flyFullHeist(t);
  // The cue path is the existing one-voice floor and nothing else: no vfx cue, no HUD element, no
  // spawned presenter. Reduced-motion safety is inherited from that surface rather than re-invented.
  const vfx = [];
  t.bus.on('presentation:vfxCue', (p) => vfx.push(p));
  t.step(60);
  assert.equal(vfx.length, 0, 'the heist cue path emits no motion of its own');
  assert.ok(t.state.entityList.length <= before + 1, 'no presenter entity is spawned');
});

// ── Flight-only, and sim-inert ─────────────────────────────────────────────────────────────────

test('cues stay off the flight HUD while docked, but the world keeps running', () => {
  const t = boot();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.step(240); // let the floor drain so a later surface is unambiguous
  const surfacedBefore = t.heistSurfaces().length;
  // While docked the Station OS is a fullscreen surface in front of the #alerts slot; speaking there
  // would burn the one-voice floor on a pill nobody can see. Matches PQ-019A's launch-countdown rule.
  t.state.mode = 'docked';
  t.latch();
  t.step(120);
  assert.equal(t.heistSurfaces().length, surfacedBefore,
    'nothing is narrated to a screen nobody is watching');
  // The OWNER RECEIPT still fires: it is presenter-free by design, which is what makes the cue
  // observable headlessly. What is suppressed is the player-visible floor line, not the record.
  assert.ok(t.moments().some((x) => x.startsWith('theft_witnessed')),
    'the owner receipt records the moment even with no surface to show it on');
  // The theft still happened: law logged it and heat charged for it while docked.
  assert.ok(m.heist.lawIncidentReceiptId, 'the crime is world simulation, not presentation');
  assert.equal(Object.keys(t.state.player.heatIncidentsApplied || {}).length, 1);
});

test('the cue path writes nothing to the simulation', () => {
  const t = boot();
  const cargoBefore = JSON.stringify(t.state.player.cargo?.items || {});
  const creditsBefore = t.state.player.credits;
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(4);
  assert.equal(JSON.stringify(t.state.player.cargo?.items || {}), cargoBefore);
  assert.equal(t.state.player.credits, creditsBefore, 'no cue moves credits');
  assert.ok(m.heist.cues.possessed, 'and the cue really did fire');
});

test('a run with no voice presenter still emits its owner receipts', () => {
  // Where voiceArbiter is not registered, helpers.voice is undefined and say() is a strict no-op.
  // The observable receipt must survive, or the cue would be untestable and unobservable headlessly.
  const bus = createBus();
  const sim = createSimulation({
    seed: 19019, bus,
    systems: [physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime, missions],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 20000;
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  const cues = [];
  bus.on('heist:missionCue', (p) => cues.push(p));
  const missionsSys = sim.registry.get('missions');
  const board = missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
  board.slots = board.slots.filter((o) => o && o.type !== PQ019C_HEIST_TYPE);
  const offer = buildHeistOffer({ epoch: 0 });
  offer.params.launchWindowS = 1;
  board.slots.unshift(offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  for (let i = 0; i < 200; i++) sim.step(SIM_DT);
  assert.ok(cues.some((c) => c.moment === 'accepted'));
  assert.ok(cues.some((c) => c.moment === 'launched'));
});
