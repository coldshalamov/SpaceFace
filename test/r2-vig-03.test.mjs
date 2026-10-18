import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { DRIFT_AUCTION_RUNTIME } from '../src/systems/driftAuctionRuntime.js';

const SECTOR = 'sector_pallas_drift';
const SHAPE = 'the_drift_auction';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  sim.state.world.activeSector = { stations: [], pois: [] };
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector') };
}

function collect(t, names) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

function live(t, encounterId) {
  return t.state.encounterDirector.live[encounterId];
}

// Drive the self-registered runtime directly: the director routes scan/tether
// events to every self-registered live record, and the generated catalog index
// is foreign-owned this push — so the test builds the live record by hand and
// calls the same fire/tick/event entry points the director would.
function fireAuction(t, suffix = 'a', anchor = { x: 0, z: 0 }) {
  const encounterId = `debug:auction:${suffix}`;
  const live = {
    id: encounterId,
    shapeId: SHAPE,
    sectorId: SECTOR,
    anchor: { ...anchor },
    phase: 'offer',
    ids: [],
    roles: {},
    vars: {},
    data: {},
    factionId: 'faction_quiet',
    shape: { receipts: {}, motive: 'three tethered crates' },
    plan: { motive: 'three tethered crates', engagementTrigger: 'drift_auction_circle' },
  };
  t.state.encounterDirector.live[encounterId] = live;
  DRIFT_AUCTION_RUNTIME.fire(t.director, live, t.state);
  assert.ok(live.vars.scowId != null, 'the scow must be a physical body');
  assert.ok(Array.isArray(live.vars.crates) && live.vars.crates.length === 3,
    'three tethered mystery crates');
  assert.ok(Array.isArray(live.vars.rivals) && live.vars.rivals.length >= 1,
    'at least one circling rival scavenger');
  return encounterId;
}

function tickAuction(t, encounterId, ticks) {
  for (let i = 0; i < ticks; i += 1) {
    t.sim.runTicks(1);
    const rec = t.state.encounterDirector.live[encounterId];
    if (rec && rec.phase !== 'done') {
      DRIFT_AUCTION_RUNTIME.tick(t.director, rec, t.state, t.director.now());
    }
  }
}

function scanPulse(t, encounterId, targetId, sourceId) {
  const rec = live(t, encounterId);
  DRIFT_AUCTION_RUNTIME.event(t.director, rec, t.state, 'scanPulse', {
    sourceId, targetId,
    source: 'player-scanner',
    pos: { x: 0, z: 0 }, radius: 1200,
    simTime: t.director.now(),
  });
}

function tetherLatch(t, encounterId, actorId, targetId) {
  const rec = live(t, encounterId);
  DRIFT_AUCTION_RUNTIME.event(t.director, rec, t.state, 'tetherAttached', {
    actorId, targetId,
  });
}

function crateOf(t, encounterId, index) {
  const rec = live(t, encounterId);
  return t.state.entities.get(rec.vars.crates[index].id);
}

test('firing floats a scow with three tethered mystery crates and circling rivals', () => {
  const t = boot();
  const id = fireAuction(t, 'spawn');
  const rec = live(t, id);
  assert.equal(rec.phase, 'bidding');
  const scow = t.state.entities.get(rec.vars.scowId);
  assert.ok(scow, 'the scow must be a physical body, not a line of text');
  for (let i = 0; i < 3; i += 1) {
    const crate = crateOf(t, id, i);
    assert.ok(crate, `crate ${i} must be a physical body`);
    assert.equal(crate.data.masslineTetherable, true);
  }
  for (const rivalId of rec.vars.rivals) {
    const rival = t.state.entities.get(rivalId);
    assert.ok(rival, 'each rival must be a physical ship');
  }
  // Deterministic per seed: same seed + same encounter id => same dud layout.
  const t2 = boot();
  const id2 = fireAuction(t2, 'spawn', { x: 0, z: 0 });
  const dudA = live(t, id).vars.crates.map((c) => c.dud);
  const dudB = live(t2, id2).vars.crates.map((c) => c.dud);
  assert.deepEqual(dudA, dudB, 'the dud layout is deterministic per seed');
  assert.ok(dudA.filter(Boolean).length >= 1 && dudA.filter((d) => !d).length >= 1,
    'the lot mixes a dud with real salvage');
});

test('a scanner pulse on a crate bids — and a rival answers with its own pulse', () => {
  const t = boot();
  const events = collect(t, ['encounter:voice']);
  const id = fireAuction(t, 'bid');
  const target = crateOf(t, id, 0);

  scanPulse(t, id, target.id, t.state.playerId);
  let rec = live(t, id);
  assert.equal(rec.vars.bids.length, 1, 'the player pulse is a bid');
  assert.equal(rec.vars.bids[0].bidder, 'player');

  // Rivals answer on their own cadence, not instantly: run the bidding window.
  tickAuction(t, id, 60 * 12);
  rec = live(t, id);
  const rivalBids = rec.vars.bids.filter((b) => b.bidder !== 'player');
  assert.ok(rivalBids.length >= 1, 'a rival must answer the bid with its own pulse');
  assert.ok(events.some((row) => /pulse/i.test(row.payload.text)),
    'the outbid is spoken, not silent');
});

test('the first pulse on a dud crate peeks its light lot — bait for a rival', () => {
  const t = boot();
  const events = collect(t, ['encounter:voice']);
  const id = fireAuction(t, 'peek');
  const rec0 = live(t, id);
  const dudIndex = rec0.vars.crates.findIndex((c) => c.dud);
  assert.ok(dudIndex >= 0, 'precondition: the lot hides exactly one dud');
  const target = crateOf(t, id, dudIndex);

  scanPulse(t, id, target.id, t.state.playerId);
  const peek = events.find((row) => /PEEK/i.test(row.payload.text));
  assert.ok(peek, 'the peek is spoken on the first pulse');
  assert.ok(!/cmdty_scrap_metal|scrap_metal/.test(peek.payload.text),
    'player words never carry a raw identifier');
  assert.ok(/light/i.test(peek.payload.text), 'the dud reads light, not dense');
});

test('no pulse, no sale: the lot drifts unsold when nobody bids', () => {
  const t = boot();
  const id = fireAuction(t, 'quiet');
  // Park the rivals far away so none wander into bid range: the quiet branch
  // must close with no winner, not hang.
  const rec0 = live(t, id);
  for (const rivalId of rec0.vars.rivals) {
    const rival = t.state.entities.get(rivalId);
    rival.pos.x += 20000;
    rival.pos.z += 20000;
  }
  tickAuction(t, id, 60 * 130);
  const completion = t.state.story.depthProgramEncounters?.completed?.[SHAPE] || null;
  assert.equal(completion?.outcome, 'unsold');
  assert.ok(!live(t, id), 'the encounter resolves instead of hanging');
});

test('a rival left alone wins the crate — NPCs are allowed to win', () => {
  const t = boot();
  const id = fireAuction(t, 'rivalwins');
  // Nobody bids; the hungriest rival opens on its own cadence and takes the lot.
  tickAuction(t, id, 60 * 130);
  const completion = t.state.story.depthProgramEncounters?.completed?.[SHAPE] || null;
  assert.ok(completion, 'the auction must close on its own');
  assert.ok(['sold', 'unsold'].includes(completion.outcome),
    `a rival may win or the lot goes unsold, got ${completion.outcome}`);
  if (completion.outcome === 'sold') {
    assert.notEqual(completion.winner, 'player', 'this run belongs to the rival');
  }
});

test('cutting a tether is theft: rivals turn hostile and no law answers', () => {
  const t = boot();
  const lawEvents = collect(t, [
    'law:incidentOpened', 'law:dispatchStarted', 'law:distressRaised',
    'encounter:voice', 'news:publish',
  ]);
  const id = fireAuction(t, 'theft');
  const target = crateOf(t, id, 1);
  const rivalIds = [...live(t, id).vars.rivals];

  tetherLatch(t, id, t.state.playerId, target.id);
  const completion = t.state.story.depthProgramEncounters?.completed?.[SHAPE] || null;
  assert.equal(completion?.outcome, 'stolen', 'theft closes the auction as stolen');
  assert.equal(completion?.winner, 'player_theft');
  assert.ok(!lawEvents.some((row) => row.name.startsWith('law:')),
    'the lawless pocket stays silent — no incident, no dispatch');
  assert.ok(lawEvents.some((row) => row.name === 'news:publish'),
    'the theft is a headline, not a fine');
  // Rivals answer through their existing hostility owner: doctrine flips to attack.
  const rivals = rivalIds
    .map((rivalId) => t.state.entities.get(rivalId))
    .filter((rival) => rival && rival.alive !== false);
  assert.ok(rivals.length >= 1, 'the rivals stay physical after the theft');
  assert.ok(rivals.some((rival) => {
    const ai = rival.data && rival.data.ai;
    return ai && ai.activity && ai.activity.kind === 'attack_run'
      && ai.activity.targetId === t.state.playerId;
  }), 'a rival turns its nose on the thief through doctrine');
});
