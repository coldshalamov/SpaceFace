// CR situation 1211 — THE FORECASTLE VOTE (crew arbitration beat). Crew used to be weather:
// traffic hulls carried "a crew" the way a wreck carries a manifest, and the only mutiny the
// player ever heard of was a whisper source naming a dead-drop. This beat puts a crew's break
// in front of the pilot: a DMC freighter hove-to while her deck crew cracks the manifest
// locker, her skipper voted off into the ship's gig and hailing the band. Take the desk's
// bounty (stop her by shot or line and the gig physically puts him back aboard), close the
// channel for a cut of hot freight, fly on and let the vote stand, or write yourself into the
// ledger the dark way — a shot at a man in a boat, or a crew burned over a pay dispute.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { factions } from '../src/systems/factions.js';
import { combat } from '../src/systems/combat.js';
import { lootShards } from '../src/systems/lootShards.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { FORECASTLE_VOTE } from '../src/data/encounters/1211-the-forecastle-vote.js';
import { situationMemory } from '../src/systems/crSituationKit.js';

const SEED = 4242;
const SECTOR = 'sector_ceres_belt';
const ANCHOR = Object.freeze({ x: 2400, z: -1600 });
const SHAPE = 'the_forecastle_vote';

async function boot(opts = {}) {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, encounterDirector, economy, cargo, factions, lootShards,
      'collisionConsequences', 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x + 120, z: ANCHOR.z - 120 }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  state.world.activeSector = { stations: [], fields: [], hazards: [], pois: [], gates: [] };
  state.player.credits = 5000;
  const events = [];
  for (const name of [
    'encounter:resolved', 'encounter:voice', 'encounter:choiceOffered', 'encounter:receipt',
    'economy:grantCredits', 'faction:repDelta', 'news:publish', 'moralMemory:remember',
  ]) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  if (opts.prior) {
    situationMemory(state).completed[SHAPE] = {
      outcome: opts.prior, at: 10, tick: 600, encounterId: 'prior_vote',
      sectorId: SECTOR, facts: {}, visits: 1,
    };
  }
  const director = host.runtime.getSystem('encounterDirector');
  const res = director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_forecastle_vote', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'mining_belt', zoneRadius: 900, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  assert.ok(live, 'the forecastle vote went live');
  const w = live.data.vote;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  return { host, state, bus, director, live, w, events, ent };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const grants = (h) => h.events.filter((e) => e.name === 'economy:grantCredits').map((e) => e.p.amount);
const dmcReps = (h) => h.events.filter((e) => e.name === 'faction:repDelta' && e.p.factionId === 'faction_dmc')
  .map((e) => ({ delta: e.p.delta, reason: e.p.reason }));
const news = (h) => h.events.filter((e) => e.name === 'news:publish');
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const voices = (h) => h.events.filter((e) => e.name === 'encounter:voice').map((e) => e.p.text).join('\n');
const moralDebts = (h) => (h.state.story.moralMemory && h.state.story.moralMemory.debts) || {};
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });
const choose = (h, id) => h.host.withFeatures(() => h.bus.emit('encounter:choose', { encounterId: h.live.id, choiceId: id }));
const kill = (h, id, byPlayer = true) => {
  const e = h.ent(id);
  e.alive = false;
  h.host.withFeatures(() => h.bus.emit('entity:killed', {
    id, killerId: byPlayer ? h.state.playerId : 999999, type: 'ship', pos: { ...e.pos },
  }));
};
const hit = (h, id) => h.host.withFeatures(() => h.bus.emit('combat:damage', {
  attackerId: h.state.playerId, targetId: id, applied: 20,
}));
/** A real player line through the shared kernel — the attachment table the encounter reads. */
function playerLatch(h, hullId) {
  const kernel = getCombatKernel({ state: h.state, bus: h.bus });
  const made = kernel.attachments.create({
    defId: 'tether_standard', ownerId: h.state.playerId, targetId: hullId,
  });
  const att = made && made.ok === true ? made.attachment : null;
  h.host.withFeatures(() => h.bus.emit('tether:attached', {
    targetId: hullId, actorId: h.state.playerId, byPlayer: true,
    attachmentId: att ? att.id : null,
  }));
  return att;
}
function stubLatch(h, hullId) {
  const att = playerLatch(h, hullId);
  if (att) return att;
  const attachments = h.state.combat && h.state.combat.attachments;
  if (!attachments || !attachments.byId) return null;
  const stub = { id: `stub:${h.state.playerId}:${hullId}`, defId: 'tether_standard',
    ownerId: h.state.playerId, targetId: hullId, state: 'active' };
  attachments.byId[stub.id] = stub;
  return stub;
}
function unlatch(h, att) {
  // Drop the rope through the kernel — the state table is a per-tick mirror of kernel records,
  // so mutating the mirror alone would be rebuilt next combat update.
  const kernel = getCombatKernel({ state: h.state, bus: h.bus });
  if (att && att.id) {
    const cut = kernel.attachments.cut(att.id, h.state.playerId, 'player_dropped_line');
    if (cut && cut.ok === true) return;
  }
  const attachments = h.state.combat && h.state.combat.attachments;
  if (attachments && attachments.byId && att && att.id && attachments.byId[att.id]) {
    attachments.byId[att.id].state = 'broken';
    delete attachments.byId[att.id];
  }
}

test('the forecastle vote is registered as a crew arbitration beat', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.equal(enc.tier, 'minor');
  assert.equal(enc.deck, 'civilian');
  assert.deepEqual([...enc.zoneTypes], ['mining_belt', 'refinery_approach']);
  assert.deepEqual([...enc.gates.sectorIds].sort(),
    ['sector_ceres_belt', 'sector_charon_expanse', 'sector_vesta_forge']);
  assert.equal(enc.shape.situation, 'distress');
  assert.equal(enc.shape.actor, 'faction_dmc');
  for (const outcome of ['captain_backed', 'took_share', 'vote_stood', 'faded',
    'crew_burned', 'skipper_murdered', 'skipper_lost']) {
    assert.ok(enc.receipts[outcome], `receipt for ${outcome}`);
  }
});

test('the scene stands up: a hove-to freighter mid-crack, her skipper adrift in the gig, both sides on the wire', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const hauler = h.ent(w.haulerId);
    const gig = h.ent(w.gigId);
    assert.ok(hauler && hauler.alive !== false, 'the crewed freighter is a live body');
    assert.ok(gig && gig.alive !== false, 'the gig is a live body');
    assert.equal(hauler.factionId, 'faction_dmc');
    assert.equal(gig.factionId, 'faction_dmc');
    assert.equal(hauler.data.ai.passive, true, 'the crew is cracking, not fighting');
    assert.match(hauler.data.scanLabel, /VOTE ON THE BOARD/);
    assert.match(gig.data.scanLabel, /VOTED OFF/);
    const gap = Math.hypot(gig.pos.x - hauler.pos.x, gig.pos.z - hauler.pos.z);
    assert.ok(Math.abs(gap - FORECASTLE_VOTE.gigAsternWu) < 40,
      `the gig was put off ~${FORECASTLE_VOTE.gigAsternWu} WU astern (${gap.toFixed(0)})`);
    assert.equal(h.live.phase, 'vote');
    assert.ok(w.crackAt > h.state.simTime, 'the locker is still cracking');
    assert.ok(h.events.some((e) => e.name === 'encounter:choiceOffered'
      && e.p.options.some((o) => o.id === 'back_the_desk')
      && e.p.options.some((o) => o.id === 'take_the_share')
      && e.p.options.some((o) => o.id === 'fly_on')), 'both offers and the pass ride the wire');
    assert.match(voices(h), /mutiny bounty|forecastle vote/i);
    assert.ok(w.skipperName && w.bosunName, 'both voices are named people');
    // The bosun's counter lands after the skipper's plea.
    h.state.simTime += FORECASTLE_VOTE.counterS + 1;
    h.host.step(4);
    assert.equal(w.countered, true);
    assert.match(voices(h), /skimmed|fence/i);
  } finally { h.host.dispose(); }
});

test('a shot hoves her to and the gig physically puts the skipper back aboard — the bounty pays', async () => {
  const h = await boot();
  try {
    const w = h.w;
    choose(h, 'back_the_desk');
    assert.equal(w.backed, true);
    const hauler = h.ent(w.haulerId);
    const gig = h.ent(w.gigId);
    hit(h, w.haulerId);
    h.host.step(4);
    assert.equal(h.live.phase, 'held', 'a live gun ends the argument');
    assert.equal(w.yieldVia, 'shot');
    assert.equal(hauler.data.ai.activity.kind, 'loiter', 'she holds for the boarding');
    assert.equal(gig.data.ai.activity.kind, 'transit', 'the gig runs the intercept');
    // No AI clock in this harness — put the gig alongside like the live intercept would.
    gig.pos.x = hauler.pos.x + FORECASTLE_VOTE.dockWu - 20; gig.pos.z = hauler.pos.z;
    const before = h.state.player.credits;
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['captain_backed']);
    assert.ok(grants(h).includes(FORECASTLE_VOTE.bountyCr), 'the desk wired the bounty');
    assert.equal(h.state.player.credits, before + FORECASTLE_VOTE.bountyCr);
    assert.ok(dmcReps(h).some((r) => r.delta === FORECASTLE_VOTE.repBacked
      && r.reason === 'the_forecastle_vote_held_the_line'), 'the hands remember who held the line');
    assert.equal(hauler.data.ai.activity.kind, 'transit', 'the freighter heads home under her skipper');
    assert.match(hauler.data.scanLabel, /SKIPPER BACK ABOARD/);
    assert.ok(news(h).length > 0, 'the wire keeps the paid bounty');
    assert.equal(memory(h).outcome, 'captain_backed');
    assert.equal(memory(h).facts.yieldVia, 'shot');
    assert.equal(memory(h).facts.backed, true);
  } finally { h.host.dispose(); }
});

test('a line on her hull holds the crew — drop the rope and they re-bolt', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const hauler = h.ent(w.haulerId);
    const att = stubLatch(h, w.haulerId);
    h.host.step(4);
    assert.equal(h.live.phase, 'held', 'the rope ends the argument');
    assert.equal(w.yieldVia, 'line');
    // Cut the line: the crew reads the slack and runs. The director is a ~1 Hz owner
    // (calendar cohort + internal accum gate ≈ one call per 60 ticks), so the grace
    // clock lands across two calls a sim-second apart.
    unlatch(h, att);
    h.host.step(70);                                      // first call after the drop — anchors reboltAt
    h.state.simTime += FORECASTLE_VOTE.boltGraceS + 1;
    h.host.step(70);                                      // second call — grace lapsed, they run
    assert.equal(h.live.phase, 'bolting', 'a dropped line is a crew gone');
    assert.equal(hauler.data.ai.activity.kind, 'transit');
    assert.deepEqual(outcomes(h), [], 'still live while they run');
  } finally { h.host.dispose(); }
});

test('a bolting crew still answers a shot — heave-to works at speed', async () => {
  const h = await boot();
  try {
    const w = h.w;
    // Let the locker crack: the crew bolts for the fence.
    h.state.simTime += FORECASTLE_VOTE.crackS + 1;
    h.host.step(10);
    assert.equal(h.live.phase, 'bolting');
    const hauler = h.ent(w.haulerId);
    assert.equal(hauler.data.ai.activity.kind, 'transit', 'she runs the fence bearing');
    hit(h, w.haulerId);
    h.host.step(4);
    assert.equal(h.live.phase, 'held', 'a running crew still heaves to under a gun');
  } finally { h.host.dispose(); }
});

test('close the channel: the bosun cuts a real share loose and the crew runs the fence', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const podCount = [...h.state.entities.values()].filter((e) => e.data && e.data.salvagePool).length;
    choose(h, 'take_the_share');
    runUntilResolved(h, 30);
    assert.deepEqual(outcomes(h), ['took_share']);
    const pods = [...h.state.entities.values()].filter((e) => e.data && e.data.salvagePool);
    assert.equal(pods.length, podCount + 1, 'the share is a real pod in the world');
    const pod = pods.find((e) => e.id === w.sharePodId);
    assert.ok(pod, 'the share pod is identifiable');
    assert.equal(pod.data.salvagePool.cmdty_stolen_goods, FORECASTLE_VOTE.shareQty,
      'the cut is the stolen manifest — hot goods, honestly');
    assert.ok(dmcReps(h).some((r) => r.delta === FORECASTLE_VOTE.repHands
      && r.reason === 'the_forecastle_vote_closed_channel'), 'the hands remember a closed channel');
    assert.equal(h.ent(w.haulerId).data.ai.activity.kind, 'transit', 'the crew runs once the deal is done');
    assert.ok(news(h).length > 0);
    assert.equal(memory(h).facts.shareCut, true);
  } finally { h.host.dispose(); }
});

test('fly on and the vote stands: the crew makes the fence and the skipper drifts on', async () => {
  const h = await boot();
  try {
    const w = h.w;
    choose(h, 'fly_on');
    assert.equal(w.declined, true);
    h.state.simTime += FORECASTLE_VOTE.crackS + 1;
    h.host.step(10);
    assert.equal(h.live.phase, 'bolting');
    // A bolting crew reaches the fence bearing — no AI clock needed for the arrival check.
    const hauler = h.ent(w.haulerId);
    hauler.pos.x = w.egress.x - 100; hauler.pos.z = w.egress.z;
    h.state.simTime += 2;
    runUntilResolved(h, 120);
    assert.deepEqual(outcomes(h), ['vote_stood']);
    assert.deepEqual(grants(h), [], 'no bounty — nobody held her');
    const gig = h.ent(w.gigId);
    assert.ok(gig && gig.alive !== false, 'the skipper drifts on, honestly in the world');
    assert.equal(gig.data.despawnAt == null, true, 'no despawn stamp on a man still adrift');
    assert.equal(h.live.roles[w.gigId], undefined, 'the roster released the gig');
    assert.equal(memory(h).outcome, 'vote_stood');
    assert.equal(memory(h).facts.declined, true);
  } finally { h.host.dispose(); }
});

test('burn the mutinied freighter and the ledger keeps the registry that fired', async () => {
  const h = await boot();
  try {
    const w = h.w;
    h.state.simTime += 12;   // past the per-shape bark gap so the skipper's grief lands on the band
    kill(h, w.haulerId, true);
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['crew_burned']);
    assert.ok(dmcReps(h).some((r) => r.delta === FORECASTLE_VOTE.repCrewBurned
      && r.reason === 'the_forecastle_vote_crew_burned'));
    assert.deepEqual(grants(h), [], 'the desk does not pay a butcher');
    const debts = moralDebts(h);
    assert.ok(debts[`forecastle-crew:${h.live.id}`], 'the crew is a durable debt on the ledger');
    assert.equal(debts[`forecastle-crew:${h.live.id}`].cause, 'mutineers_burned');
    assert.equal(debts[`forecastle-crew:${h.live.id}`].status, 'pending');
    assert.match(voices(h), /my crew|butchers/i, 'the skipper watched his crew die');
    assert.equal(memory(h).facts.byPlayer, true);
  } finally { h.host.dispose(); }
});

test('kill the freighter by another hand and no registry pays for it', async () => {
  const h = await boot();
  try {
    const w = h.w;
    kill(h, w.haulerId, false);
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['crew_burned']);
    assert.deepEqual(dmcReps(h), [], 'the world, not the player, ended the vote');
    assert.equal(moralDebts(h)[`forecastle-crew:${h.live.id}`], undefined,
      'no debt lands on the pilot');
    assert.equal(memory(h).facts.byPlayer, false);
  } finally { h.host.dispose(); }
});

test('shoot a man in a boat: the crew sees a killer and the desk keeps the name', async () => {
  const h = await boot();
  try {
    const w = h.w;
    kill(h, w.gigId, true);
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['skipper_murdered']);
    assert.ok(dmcReps(h).some((r) => r.delta === FORECASTLE_VOTE.repSkipperMurdered
      && r.reason === 'the_forecastle_vote_skipper_murdered'));
    const debts = moralDebts(h);
    assert.ok(debts[`forecastle-skipper:${h.live.id}`], 'the skipper is a durable debt');
    assert.equal(debts[`forecastle-skipper:${h.live.id}`].cause, 'captain_murdered');
    assert.equal(h.ent(w.haulerId).data.ai.activity.kind, 'transit',
      'a crew that watched a murder bolts for the fence');
    assert.equal(memory(h).outcome, 'skipper_murdered');
  } finally { h.host.dispose(); }
});

test('carry the band out of reach and the vote settles unwitnessed', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const player = h.ent(h.state.playerId);
    player.pos.x = ANCHOR.x + 4000; player.pos.z = ANCHOR.z;   // out of the zone + slack
    h.state.simTime += 2;
    runUntilResolved(h, 120);
    assert.deepEqual(outcomes(h), ['faded']);
    // Both hulls stay in the world — the stand continues off your band.
    assert.ok(h.ent(w.haulerId).alive !== false);
    assert.ok(h.ent(w.gigId).alive !== false);
    assert.equal(news(h).length, 0, 'an unwitnessed vote keeps no registry');
  } finally { h.host.dispose(); }
});

test('the window lapses mid-stand: both hulls remain in the world', async () => {
  const h = await boot();
  try {
    const w = h.w;
    // Held but never boarded: keep the locker un-cracked and the gig short of her.
    hit(h, w.haulerId);
    h.host.step(4);
    assert.equal(h.live.phase, 'held');
    h.state.simTime += FORECASTLE_VOTE.windowS + 2;
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['faded']);
    assert.ok(h.ent(w.haulerId).alive !== false);
    assert.ok(h.ent(w.gigId).alive !== false);
  } finally { h.host.dispose(); }
});

test('a registry that burned a forecastle meets a faster crack and a wary band', async () => {
  const h = await boot({ prior: 'crew_burned' });
  try {
    const w = h.w;
    assert.equal(w.priorKind, 'blood');
    assert.ok(w.crackAt - w.firedAt < FORECASTLE_VOTE.crackS,
      'the crew cracks faster for a registry it knows');
    assert.match(voices(h), /transponder/i);
  } finally { h.host.dispose(); }
});

test('ordinary director roll: the planner books the vote only on DMC ground', async () => {
  const { planEncounters } = await import('../src/systems/encounterDirector.js');
  const { zonesForSector } = await import('../src/data/sectorZones.js');
  const enc = ENCOUNTERS[SHAPE];
  let booked = null;
  for (let day = 0; day < 365 && !booked; day++) {
    booked = planEncounters(SEED, SECTOR, day, zonesForSector(SECTOR))
      .find((item) => item.shapeId === SHAPE) || null;
  }
  assert.ok(booked, 'planner never books the forecastle vote in 365 Ceres days');
  const zone = zonesForSector(SECTOR).find((z) => z.id === booked.zoneId);
  assert.ok(zone && enc.zoneTypes.includes(zone.type), `booked on ${booked.zoneId} (${zone && zone.type})`);
  for (const other of ['sector_pallas_drift', 'sector_io_reach', 'sector_helios_prime']) {
    for (let day = 0; day < 120; day++) {
      const off = planEncounters(SEED, other, day, zonesForSector(other))
        .find((item) => item.shapeId === SHAPE);
      assert.ok(!off, `${other}: forecastle vote booked outside its gates on day ${day}`);
    }
  }
});
