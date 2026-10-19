// CR situation 1209 — THE LAST TOW (aftermath retrieval beat). The aftermath ledger records real
// ship kills — victim name, killer name, estate residue — but nothing ever came FOR the dead:
// wrecks were only ever raw material to strip. This beat makes the recorded death matter: when the
// sector's aftermath ledger holds an unclaimed kill, the line's retrieval contract sends a real
// collection detail (winch tug + honor guard) to the dead hull's actual death site, and Reach
// corpse-robbers race the same filing to strip the grave.
//
// Everything routes through live owners: the scene anchors on the durable aftermath marker (not an
// invented prop), the estate pods are real owner-stamped jettisoned freight (the stolen-cargo law
// path prices a witnessed grab itself), robbers carry their take in the ordinary kill-spill schema
// (killing a laden one re-drops the goods physically), the guard is a lawful witness (murdering the
// detail is adjudicated murder), and credits/rep/news ride the director's intents.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { lootShards } from '../src/systems/lootShards.js';
import { combat } from '../src/systems/combat.js';
import { aftermathWrecks, aftermathForSector } from '../src/systems/aftermathWrecks.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { LAST_TOW, runtime as lastTowRuntime } from '../src/data/encounters/1209-the-last-tow.js';

const SEED = 4242;
const SECTOR = 'sector_helios_prime';
const SITE = Object.freeze({ x: 9000, z: -4000 });          // where the dead hull went down
const ANCHOR = Object.freeze({ x: SITE.x - 900, z: SITE.z + 300 });
const SHAPE = 'the_last_tow';
const KILLER_ID = 424242;                                   // a Reach raider, not the player

/** A real recorded death in this sector: an MTS hauler vents and the ledger keeps her name. */
function recordKill(host, pos, label = 'Sable Run') {
  const victim = host.spawnShip({ hullId: 'ship_mule', pos, factionId: 'faction_mts', team: 1 });
  victim.data.name = label;
  victim.alive = false;
  host.withFeatures(() => host.bus.emit('entity:killed', {
    id: victim.id, killerId: KILLER_ID, type: 'ship', victimClass: 'hauler',
    factionId: victim.factionId, pos: { ...victim.pos }, sectorId: SECTOR, label,
  }));
  return victim;
}

function markerFor(state) {
  const markers = aftermathForSector(state, SECTOR);
  assert.equal(markers.length, 1, 'one recorded death on the ledger');
  return markers[0];
}

function boundWreck(state, markerId) {
  return state.entityList.find((e) => e && e.type === 'wreck' && e.alive !== false
    && e.data && e.data.markerId === markerId) || null;
}

async function boot({ kill = true } = {}) {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, lawSecurity, encounterDirector, lootShards, aftermathWrecks,
      'collisionConsequences', 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x, z: ANCHOR.z }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  const events = [];
  for (const name of [
    'encounter:resolved', 'encounter:telegraph', 'encounter:voice',
    'economy:grantCredits', 'faction:repDelta', 'news:publish', 'law:killedAdjudicated',
    'loot:drop', 'aftermathWreck:spawned',
  ]) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  const victim = kill ? recordKill(host, SITE) : null;
  const marker = kill ? markerFor(state) : null;
  const director = host.runtime.getSystem('encounterDirector');
  const res = director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_last_tow', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'trade_lane', zoneRadius: 800, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  const w = live.data.lastTow;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  return { host, state, bus, director, live, w, events, ent, victim, marker };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const grants = (h) => h.events.filter((e) => e.name === 'economy:grantCredits').map((e) => e.p.amount);
const reps = (h) => h.events.filter((e) => e.name === 'faction:repDelta').map((e) => ({ factionId: e.p.factionId, delta: e.p.delta, reason: e.p.reason }));
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });
const kill = (h, id, byPlayer = true) => {
  const e = h.ent(id);
  e.alive = false;
  h.host.withFeatures(() => h.bus.emit('entity:killed', {
    id, killerId: byPlayer ? h.state.playerId : 999999, type: 'ship', pos: { ...e.pos },
  }));
};

test('the last tow is registered as an aftermath retrieval beat', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.equal(enc.tier, 'minor');
  assert.equal(enc.deck, 'combat');
  assert.ok(enc.zoneTypes.includes('derelict_field'));
  assert.equal(enc.shape.situation, 'salvage');
});

test('no recorded death on the ledger means no detail: fireReady refuses a clean sector', async () => {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, lawSecurity, encounterDirector, lootShards, aftermathWrecks,
      'collisionConsequences', 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', pos: { ...ANCHOR }, isPlayer: true, factionId: 'faction_free' }],
  });
  try {
    host.state.world.currentSectorId = SECTOR;
    assert.equal(lastTowRuntime.fireReady(host.state), false, 'nobody died — nobody gets a tow');
    recordKill(host, SITE, 'Sable Run');
    assert.equal(lastTowRuntime.fireReady(host.state), true, 'a recorded kill inside reach arms the filing');
  } finally { host.dispose(); }
});

test('the detail stands up over the ledger\'s real death site with the estate in the water', async () => {
  const h = await boot();
  try {
    const w = h.w;
    assert.equal(w.markerId, h.marker.markerId, 'the beat is anchored on the recorded kill, not a prop');
    assert.equal(w.victimLabel, 'Sable Run');
    const wreck = boundWreck(h.state, h.marker.markerId);
    assert.ok(wreck, 'the aftermath owner materialized the bound wreck at the death site');
    assert.ok(Math.hypot(wreck.pos.x - h.marker.pos.x, wreck.pos.z - h.marker.pos.z) < 400);

    // The estate is real owner-stamped freight — the stolen-cargo law path reads it.
    assert.equal(w.pods.length, LAST_TOW.podCount);
    for (const rec of w.pods) {
      const pod = h.ent(rec.podId);
      assert.equal(pod.data.ownerId, `estate:${h.marker.victimId}`, 'estate-stamped ownership');
      assert.equal(pod.data.jettisonedCargo, true, 'the stolen-cargo law path reads these');
      assert.match(pod.data.scanLabel, /ESTATE OF SABLE RUN/);
      assert.ok(Math.hypot(pod.pos.x - SITE.x, pod.pos.z - SITE.z) < 200, 'pods sit at the death site');
    }

    const tug = h.ent(w.tugId);
    assert.equal(tug.factionId, 'faction_mts');
    assert.equal(tug.data.ai.activity.kind, 'transit', 'the winch tug flies in on the contract');
    const guard = h.ent(w.guardId);
    assert.equal(guard.data.ai.lawful, true, 'the honor guard is a lawful witness');
    assert.equal(guard.data.lawWitness, true);
    assert.equal(guard.data.ai.roe, 'hold_fire');
    for (const id of w.robberIds) {
      const robber = h.ent(id);
      assert.equal(robber.factionId, 'faction_reach');
      assert.equal(robber.data.ai.passive, false, 'corpse-robbers are lawful hostile targets');
    }
    h.host.step(120);
    assert.deepEqual(outcomes(h), [], 'nothing resolves on its own');
  } finally { h.host.dispose(); }
});

test('the tug winches the estate home and a defending registry collects the screen fee', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const tug = h.ent(w.tugId);
    // A defense contribution while the beat is live: one corpse-robber down to the player's guns.
    kill(h, w.robberIds[0], true);
    assert.equal(w.defended, 1, 'the detail logged the screen');
    // The detail is on station; let the winch clock run (sim-time jumps compress the wait).
    tug.pos.x = w.site.x + LAST_TOW.standoffWu;
    tug.pos.z = w.site.z;
    h.host.step(80);
    assert.equal(w.tugArrived, true, 'the tug reached winch station over the hulk');
    for (let i = 0; i < LAST_TOW.podCount && w.secured < LAST_TOW.podCount; i++) {
      h.state.simTime += LAST_TOW.winchS + 1;
      h.host.step(30);
    }
    assert.equal(w.secured, LAST_TOW.podCount, 'the whole estate made the cradle');
    assert.equal(w.tugDeparted, true, 'nothing loose — the detail burns for home');
    runUntilResolved(h, 90);
    assert.deepEqual(outcomes(h), ['crew_home']);
    assert.ok(grants(h).includes(LAST_TOW.guardFeeCr), 'the line wired the screen fee');
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts' && r.delta === 3 && r.reason === 'the_last_tow_screened'));
    assert.ok(h.events.some((e) => e.name === 'news:publish'), 'the sector keeps the retrieval');
    assert.equal(memory(h).outcome, 'crew_home');
    assert.equal(memory(h).facts.secured, LAST_TOW.podCount);
    assert.ok(memory(h).facts.servedMarkers.includes(h.marker.markerId), 'the ledger remembers which dead were served');
  } finally { h.host.dispose(); }
});

test('a corpse-robber cuts a pod into its hold; killing it re-drops the take physically', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const robber = h.ent(w.robberIds[0]);
    const rec = w.pods[0];
    const pod = h.ent(rec.podId);
    // Park the thief on the pod — the work loop does the rest.
    robber.pos.x = pod.pos.x + 20;
    robber.pos.z = pod.pos.z;
    h.host.step(80);
    assert.equal(rec.fate, 'robbed', 'the robber cut the pod loose');
    assert.equal(w.scavTaken, 1);
    assert.equal(pod.alive, false, 'the estate pod is aboard');
    assert.equal(robber.data.cargo.items[rec.cid], rec.amount, 'the take rides the kill-spill schema');
    assert.equal(robber.data.ai.activity.kind, 'transit', 'a laden thief bolts, it does not duel');

    // Drop the laden robber: the ordinary kill-cargo path physically re-drops what it stole.
    kill(h, robber.id, true);
    assert.equal(w.defended, 1, 'the detail logs the screen');
    const spill = h.events.filter((e) => e.name === 'loot:drop')
      .flatMap((e) => (e.p.items || []))
      .filter((i) => i && i.commodityId === rec.cid);
    assert.ok(spill.length >= 1, 'the take physically re-dropped off the dead robber');
  } finally { h.host.dispose(); }
});

test('scoop the estate under the guard\'s eyes and the desk logs a robbery', async () => {
  const h = await boot();
  try {
    const w = h.w;
    // Scoop every estate pod — pods leave the world the way collected cargo does.
    for (const rec of w.pods) { const pod = h.ent(rec.podId); pod.alive = false; }
    h.host.step(90);
    assert.equal(w.taken, LAST_TOW.podCount, 'the guard logged the empty cradles');
    assert.equal(w.guardHot, true, 'the honor guard answered');
    const guard = h.ent(w.guardId);
    assert.equal(guard.data.ai.roe, 'weapons_free');
    runUntilResolved(h, 120);
    assert.deepEqual(outcomes(h), ['robbed_the_dead']);
    assert.ok(!grants(h).includes(LAST_TOW.guardFeeCr), 'no screen fee was wired');
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts' && r.delta === -5 && r.reason === 'the_last_tow_robbed_estate'));
    assert.equal(memory(h).outcome, 'robbed_the_dead');
  } finally { h.host.dispose(); }
});

test('haul a latched pod to the detail\'s line and the hand-back fee pays on the spot', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const tug = h.ent(w.tugId);
    const rec = w.pods[0];
    const pod = h.ent(rec.podId);
    // The player tethers the pod (the ordinary tow verb) and brings it to the tug.
    h.host.withFeatures(() => h.bus.emit('tether:attached', {
      targetId: pod.id, byPlayer: true, pos: { ...pod.pos },
    }));
    h.host.step(6);
    assert.ok(w.latched.includes(pod.id), 'the detail marked the player\'s line on the pod');
    // Deliver it inside the hand-back reach.
    tug.pos.x = w.site.x + LAST_TOW.standoffWu;
    tug.pos.z = w.site.z;
    pod.pos.x = tug.pos.x + 40;
    pod.pos.z = tug.pos.z;
    h.host.step(140); // the director's cadence is ~1 Hz — give the hand-off a full window
    assert.equal(rec.fate, 'returned', 'the detail took custody on the line');
    assert.equal(w.returned, 1);
    assert.ok(grants(h).includes(LAST_TOW.returnFeeCr), 'the hand-back fee paid immediately');
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts' && r.delta === 2 && r.reason === 'the_last_tow_hand_back'));
  } finally { h.host.dispose(); }
});

test('murder the detail and the desk keeps the registry', async () => {
  const h = await boot();
  try {
    const w = h.w;
    kill(h, w.tugId, true);
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['detail_murdered']);
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts' && r.delta === -8 && r.reason === 'the_last_tow_detail_murdered'));
    assert.equal(memory(h).outcome, 'detail_murdered');
  } finally { h.host.dispose(); }
});

test('the detail never arrives and the estate drifts past the window — retrieval lapses', async () => {
  const h = await boot();
  try {
    const w = h.w;
    // A third party burns the tug before it reaches station: the filing outlives the detail.
    kill(h, w.tugId, false);
    h.state.simTime += LAST_TOW.windowS + 2;
    runUntilResolved(h, 120);
    assert.deepEqual(outcomes(h), ['went_cold']);
    assert.ok(!grants(h).includes(LAST_TOW.guardFeeCr));
    assert.equal(memory(h).outcome, 'went_cold');
  } finally { h.host.dispose(); }
});
