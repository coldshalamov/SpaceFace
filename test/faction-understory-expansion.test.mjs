// faction-understory-expansion — the quiet ledger on top of the garden reef.
//
// Proves the Understory's hidden-network layer on the real runtime owner:
//   dead-drop caches (stash return / consignment delivery / cracks / lapses),
//   hidden-market access tiers, cover identities, informant debts, detection-risk
//   escalation with blackout, and deterministic shadow pricing — plus the
//   adversarial edges: duplicate resolutions, session resets, recycled entity ids,
//   malformed state, and bounded ledgers.
//
// Run: node --test test/faction-understory-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import {
  understoryGardens,
  spawnGarden,
  ensureUnderstoryState,
  understoryAccess,
  understoryActiveCover,
  understoryNoticeBand,
  understoryShadowPrice,
  understoryMarket,
  UNDERSTORY_QUIET,
  UNDERSTORY_ACCESS_TIERS,
} from '../src/systems/faction_understory.js';

const SEED = 9021;
const SECTOR = 'sector_charon_expanse';

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [understoryGardens] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 800, z: 800 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  const grants = [];
  const reps = [];
  const toasts = [];
  bus.on('economy:grantCredits', (p) => { if (p && /^understory/.test(p.reason || '')) grants.push(p); });
  bus.on('faction:repDelta', (p) => { if (p && p.factionId === 'faction_understory') reps.push(p); });
  bus.on('toast', (p) => toasts.push(p));
  return { sim, state, bus, player, grants, reps, toasts };
}

const wreck = (sim, x, z, mass, extra = {}) => sim.spawn({
  type: 'wreck', team: 2, pos: { x, z }, radius: 14, mass,
  hull: 10, hullMax: 10, collides: true, data: { ...(extra || {}) },
});

/** A sprouting reef (stage ≥2 sheds drops; biomass 200 is stage 3, which also whispers). */
const reef = (sim, state, x, z, biomass = 200) =>
  spawnGarden(state, sim.helpers, { x, z, sectorId: SECTOR, biomass });

/** Force the reef's quiet clocks due, then tick once so the wire posts. */
function shedDrop(sim, state, garden) {
  const u = ensureUnderstoryState(state);
  sim.step(); // first tick normalizes the garden record's clocks
  u.gardens[garden.data.gardenId].nextDropAt = 0;
  sim.step();
  const rec = u.drops.find((r) => r.state === 'open');
  assert.ok(rec, 'the reef shed a pod onto the wire');
  return rec;
}

/** Park an open-drop pod inside a garden's ring, stamped as player-flung. */
function flingPodInto(state, rec, garden, player) {
  const pod = state.entities.get(rec.entityId);
  assert.ok(pod, 'the pod entity is live');
  pod.pos.x = garden.pos.x + 10;
  pod.pos.z = garden.pos.z;
  pod.data.thrownBy = player.id;
  return pod;
}

/** The economy lane's exact-payment handler, faithfully replayed as a test stub. */
function stubExactEconomy(bus, state) {
  bus.on('economy:chargeCredits', (p) => {
    if (!p || p.requireFull !== true) return;
    if (p.result === true) return;
    p.result = false;
    // Mirror of economy.js normalizeCredits — clamped at MAX_SAFE like the owner.
    const raw = Number(state.player.credits);
    const live = Number.isFinite(raw) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(raw))) : 0;
    if (!Number.isSafeInteger(p.amount) || p.amount < 0) return;
    if (live !== p.expectedCredits || live < p.amount || typeof p.commit !== 'function') return;
    if (p.commit() !== true) return;
    state.player.credits = live - p.amount;
    p.result = true;
  });
}

// ── normalization ──────────────────────────────────────────────────────────────

test('quiet ledger: malformed or hostile state.understory normalizes to a bounded shape', () => {
  const { sim, state } = boot();
  try {
    state.understory = {
      gardens: { 'g:junk': 7, 'g:row': { biomass: 'x' } },
      compost: { 'g:junk': 'nope', 'g:row': { fedMass: 3 } }, tidePushback: null,
      drops: [null, 7, { id: 9, kind: 'nope' },
        { id: 'd:ok', kind: 'stash', state: 'open', entityId: null },
        { id: 'd:far', kind: 'stash', state: 'open', entityId: null, postedAt: 0, expiresAt: 1e12 }],
      whispers: [{ id: 'w:bad' },
        { id: 'w:far', kind: 'feed', state: 'open', postedAt: 0, expiresAt: 1e12 }],
      covers: [{ id: 'c:1', name: 'X', integrity: 99, burned: 0 }],
      informants: [1, 2], paid: {}, seq: 'abc', favors: 3.9, notice: 'loud', debtCr: -50,
      blackoutUntil: 'never', nextWildDropAt: {}, freeCoverIssued: 1,
    };
    for (let i = 0; i < 200; i++) state.understory.paid[`k:${i}`] = i;
    const u = ensureUnderstoryState(state);
    assert.ok(u.gardens && !Array.isArray(u.gardens), 'gardens is an object');
    assert.equal(u.gardens['g:junk'], undefined, 'a primitive garden row cannot sink a field write');
    assert.ok(u.gardens['g:row'] && u.gardens['g:row'].biomass === 'x', 'object rows survive for field coercion');
    assert.equal(u.compost['g:junk'], undefined, 'a primitive compost row is dropped');
    assert.ok(Object.keys(u.paid).length <= 96, 'the stamp ledger caps on normalize, not only on write');
    assert.equal(u.drops.length, 2, 'malformed drop rows are dropped outright');
    assert.equal(u.drops[0].state, 'open');
    assert.equal(u.whispers.length, 1, 'a whisper without a valid kind cannot enter the wire');
    assert.equal(u.whispers[0].id, 'w:far');
    // A far-future expiry cannot jam a slot: both ledgers clamp expiresAt to the TTL window.
    assert.equal(u.drops.find((r) => r.id === 'd:far').expiresAt,
      UNDERSTORY_QUIET.dropTtlS * 2, 'a far-future stash expiry clamps to its clock');
    assert.equal(u.whispers[0].expiresAt,
      UNDERSTORY_QUIET.whisperTtlS * 2, 'a far-future whisper expiry clamps to its clock');
    assert.equal(u.covers.length, 1);
    assert.equal(u.covers[0].integrity, UNDERSTORY_QUIET.coverPool, 'cover integrity clamps to the pool');
    assert.deepEqual(u.informants, {});
    assert.equal(u.seq, 0);
    assert.equal(u.favors, 3);
    assert.equal(u.notice, 0);
    assert.equal(u.debtCr, 0, 'a debt cannot go negative');
    assert.equal(u.freeCoverIssued, true);
    assert.doesNotThrow(() => sim.step(), 'the whole tick survives hostile state');
    // The one surviving open row names a pod that does not exist — the tick lapses it honestly.
    assert.equal(u.drops.find((r) => r.id === 'd:ok').state, 'lost');
    // Fat keyed ledgers bound on read, not only on write — the per-tick pricing and
    // informant walks iterate them, so a fattened payload must shed oldest keys.
    for (let i = 0; i < 300; i++) {
      u.gardens[`flood:${i}`] = { biomass: 1 };
      u.compost[`flood:${i}`] = { fedMass: 1 };
      u.tidePushback[`s${i}`] = 0.1;
    }
    // Row arrays bound the same way: well-formed open rows past the live cap plus
    // the kept log are payload, and open rows outlive closed rows in the shed order.
    for (let i = 0; i < 40; i++) {
      u.drops.push({ id: `df:${i}`, kind: 'stash', state: 'open', entityId: null });
      u.whispers.push({ id: `wf:${i}`, kind: 'feed', state: 'open' });
    }
    const b = ensureUnderstoryState(state);
    assert.ok(Object.keys(b.gardens).length <= 256, 'the garden ledger caps on read');
    assert.ok(Object.keys(b.compost).length <= 256, 'the compost ledger caps on read');
    assert.ok(Object.keys(b.tidePushback).length <= 256, 'the pushback ledger caps on read');
    assert.ok(b.drops.length <= UNDERSTORY_QUIET.maxOpenDrops + UNDERSTORY_QUIET.dropLogKeep,
      'the drop ledger caps open rows plus the kept log');
    assert.ok(b.whispers.length <= UNDERSTORY_QUIET.maxOpenWhispers + UNDERSTORY_QUIET.whisperLogKeep,
      'the whisper ledger caps open rows plus the kept log');
    assert.doesNotThrow(() => sim.step(), 'a flooded ledger still ticks');
  } finally {
    sim.dispose();
  }
});

test('quiet ledger: a fresh sim boots a normalized, bounded ledger', () => {
  const { sim, state } = boot();
  try {
    const u = ensureUnderstoryState(state);
    assert.deepEqual(u.drops, []);
    assert.deepEqual(u.whispers, []);
    assert.deepEqual(u.covers, []);
    assert.equal(u.notice, 0);
    assert.equal(u.favors, 0);
    assert.equal(understoryAccess(state).tier, 0);
    assert.equal(understoryActiveCover(state), null);
  } finally {
    sim.dispose();
  }
});

// ── dead-drop caches ───────────────────────────────────────────────────────────

test('dead-drop: a sprouting reef sheds a tagged quiet pod on its own clock', () => {
  const { sim, state, bus } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    const stashed = [];
    bus.on('understory:dropStashed', (p) => stashed.push(p));
    const rec = shedDrop(sim, state, garden);
    assert.equal(stashed.length, 1);
    assert.equal(stashed[0].kind, 'stash', 'a lone reef stashes — addressed work needs a far side');
    const pod = state.entities.get(rec.entityId);
    assert.equal(pod.data.understoryDrop, true);
    assert.equal(pod.data.understoryCacheId, rec.id);
    assert.equal(typeof pod.data.scanLabel, 'string');
    // The pod lands outside the reef's absorb ring — the player must go get it.
    const reach = garden.radius + UNDERSTORY_QUIET.dropSpawnPad;
    assert.ok(Math.hypot(pod.pos.x - garden.pos.x, pod.pos.z - garden.pos.z) > reach - 1,
      'the pod sheds outside the ring');
    assert.ok(Number.isFinite(rec.expiresAt) && rec.expiresAt > state.simTime, 'the stash has a clock');
    assert.equal(rec.gen, pod.occupantGeneration, 'the record binds the pod occupant');
  } finally {
    sim.dispose();
  }
});

test('dead-drop: stash spawns are deterministic for a fixed seed and clock', () => {
  const a = boot();
  const b = boot();
  try {
    const ga = reef(a.sim, a.state, 0, 0);
    const gb = reef(b.sim, b.state, 0, 0);
    const ra = shedDrop(a.sim, a.state, ga);
    const rb = shedDrop(b.sim, b.state, gb);
    assert.equal(ra.pos.x, rb.pos.x);
    assert.equal(ra.pos.z, rb.pos.z);
    assert.equal(ra.valueCr, rb.valueCr);
    const pa = a.state.entities.get(ra.entityId);
    const pb = b.state.entities.get(rb.entityId);
    assert.equal(pa.pos.x, pb.pos.x, 'same seed, same drift');
  } finally {
    a.sim.dispose(); b.sim.dispose();
  }
});

test('dead-drop: a returned stash pays the pilot once through the economy seam', () => {
  const { sim, state, bus, player, grants, reps } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    const returned = [];
    bus.on('understory:dropReturned', (p) => returned.push(p));
    const favors = [];
    bus.on('understory:favor', (p) => favors.push(p));
    const rec = shedDrop(sim, state, garden);
    flingPodInto(state, rec, garden, player);
    sim.step();
    assert.equal(returned.length, 1, 'the return resolves once');
    assert.equal(grants.length, 1, 'one quiet envelope opens');
    const price = understoryShadowPrice(state, SECTOR);
    const expected = Math.max(0, Math.round(rec.valueCr * understoryAccess(state).payMult * price));
    assert.equal(grants[0].amount, expected, 'the pay is value × tier × shadow index');
    assert.equal(reps.filter((r) => r.reason === 'understory_cache_return').length, 1);
    assert.equal(favors.filter((f) => f.kind === 'return').length, 1);
    assert.equal(ensureUnderstoryState(state).favors, 1);
    // Repeating ticks cannot re-mint the envelope.
    sim.runTicks(10);
    assert.equal(grants.length, 1, 'still one grant');
    assert.equal(returned.length, 1);
  } finally {
    sim.dispose();
  }
});

test('dead-drop: a pod the reef absorbs on its own pays nothing', () => {
  const { sim, state, grants, reps } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    const rec = shedDrop(sim, state, garden);
    const pod = state.entities.get(rec.entityId);
    pod.pos.x = garden.pos.x + 10; pod.pos.z = garden.pos.z; // drifts in — nobody carried it
    sim.step();
    assert.equal(rec.state, 'absorbed');
    assert.equal(grants.length, 0, 'no envelope without the pilot');
    assert.equal(reps.length, 0);
  } finally {
    sim.dispose();
  }
});

test('dead-drop: the real thrown-credit signals pay — impulse provenance and Line release', () => {
  const { sim, state, bus, player, grants } = boot();
  try {
    const garden = reef(sim, state, 0, 0);

    // A pod flung hard by the real massline pipeline carries WeakMap impulse
    // provenance — never data.thrownBy. tumbleStates writes the record on throw and
    // sling release and holds it for the whole flight; the ledger must read the same
    // record the kill lanes read, or every flung delivery lands 'absorbed'.
    let rec = shedDrop(sim, state, garden);
    const pod = state.entities.get(rec.entityId);
    recordImpulseProvenance(pod, {
      actorId: player.id, weaponId: 'massline', tag: 'massline_throw',
      appliedTick: state.tick,
    });
    pod.pos.x = garden.pos.x + 10; pod.pos.z = garden.pos.z;
    sim.step();
    assert.equal(rec.state, 'returned', 'a thrown pod pays like a towed one');
    assert.equal(grants.length, 1);

    // A deliberate cut loose off the Line stamps the last handler on the body itself
    // — a set-down the reef eats later is still the pilot's delivery, and the stamp
    // is the same data-field shape mines/lootShards write.
    rec = shedDrop(sim, state, garden);
    const pod2 = state.entities.get(rec.entityId);
    bus.emit('tether:released', { targetId: pod2.id });
    assert.equal(pod2.data.lastThrowerId, player.id, 'the release marks the handler');
    pod2.pos.x = garden.pos.x + 10; pod2.pos.z = garden.pos.z;
    sim.step();
    assert.equal(rec.state, 'returned');
    assert.equal(grants.length, 2);
  } finally {
    sim.dispose();
  }
});

test('dead-drop: a consignment pays only inside the addressed reef', () => {
  const { sim, state, bus, player, grants, reps } = boot();
  try {
    const gA = reef(sim, state, 0, 0);
    const gB = reef(sim, state, 1400, 0);
    sim.step();
    const u = ensureUnderstoryState(state);
    const delivered = [];
    bus.on('understory:dropDelivered', (p) => delivered.push(p));
    // _spawnDrop reads this.helpers/this.bus off the system object; createSimulation
    // runs init on a forked instance, so lend the prototype the live seams.
    understoryGardens.helpers = sim.helpers;
    understoryGardens.bus = bus;
    const rec = understoryGardens._spawnDrop(state, u, {
      kind: 'consignment', anchor: { x: 0, z: 0, radius: gA.radius },
      sectorId: SECTOR, gardenId: gA.data.gardenId,
      destGardenId: gB.data.gardenId, destName: gB.data.name,
      destPos: { x: gB.pos.x, z: gB.pos.z }, informant: 'Test Informant',
    });
    assert.match(state.entities.get(rec.entityId).data.scanLabel, /bound [NESW]+ \d+m/,
      'the scan line names the bearing and the leg');
    // Feed it to the wrong rings first? No — feed it to the ADDRESSED reef.
    flingPodInto(state, rec, gB, player);
    sim.step();
    assert.equal(rec.state, 'delivered');
    assert.equal(delivered.length, 1);
    assert.equal(grants.length, 1);
    assert.equal(reps.filter((r) => r.reason === 'understory_consignment').length, 1);

    // A second consignment fed to the wrong reef is the reef's now — no pay, honest lapse.
    const rec2 = understoryGardens._spawnDrop(state, u, {
      kind: 'consignment', anchor: { x: 0, z: 0, radius: gA.radius },
      sectorId: SECTOR, gardenId: gA.data.gardenId, destGardenId: gB.data.gardenId,
      informant: 'Test Informant',
    });
    flingPodInto(state, rec2, gA, player); // back to the sender — the wrong rings
    sim.step();
    assert.equal(rec2.state, 'lost');
    assert.equal(delivered.length, 1, 'no second delivery');
    assert.equal(grants.length, 1, 'the wrong rings pay nothing');
  } finally {
    sim.dispose();
  }
});

test('dead-drop: cracking a seal pays less and costs notice, standing, and a toll — once', () => {
  const { sim, state, bus, player, grants, reps } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    const rec = shedDrop(sim, state, garden);
    const pod = state.entities.get(rec.entityId);
    const cracked = [];
    const debts = [];
    const notices = [];
    bus.on('understory:dropCracked', (p) => cracked.push(p));
    bus.on('understory:debtChanged', (p) => debts.push(p));
    bus.on('understory:noticeChanged', (p) => notices.push(p));

    bus.emit('entity:killed', { id: pod.id, type: 'payload', pos: { ...pod.pos }, killerId: player.id });
    assert.equal(rec.state, 'cracked');
    assert.equal(cracked.length, 1);
    assert.equal(cracked[0].sanctioned, false, 'an unmarked seal is a break');
    assert.equal(grants.length, 1, 'the spill still pays — at the crack share');
    const u = ensureUnderstoryState(state);
    assert.equal(u.debtCr, UNDERSTORY_QUIET.debtPerCrack, 'the toll lands on the pilot');
    assert.equal(debts.length, 1);
    assert.equal(u.notice, UNDERSTORY_QUIET.crackNotice, 'the reef saw the gun');
    assert.equal(notices.length, 1);
    assert.equal(notices[0].band, 'seen');
    assert.equal(reps.filter((r) => r.reason === 'understory_cache_cracked').length, 1);
    assert.equal(reps[0].delta, UNDERSTORY_QUIET.crackRep);

    // The same kill event again, or another tick, cannot re-break the seal.
    bus.emit('entity:killed', { id: pod.id, type: 'payload', pos: { ...pod.pos }, killerId: player.id });
    sim.step();
    assert.equal(cracked.length, 1);
    assert.equal(grants.length, 1);
    assert.equal(u.debtCr, UNDERSTORY_QUIET.debtPerCrack, 'the toll does not double');
  } finally {
    sim.dispose();
  }
});

test('dead-drop: a recycled entity id cannot cash a dead pod\'s record', () => {
  const { sim, state, bus, player, grants } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    const rec = shedDrop(sim, state, garden);
    const pod = state.entities.get(rec.entityId);
    const oldId = pod.id;
    const cracked = [];
    bus.on('understory:dropCracked', (p) => cracked.push(p));

    // The pod's slot is freed and a new occupant takes the recycled id — the old
    // record names a generation that is gone.
    sim.helpers.removeEntity(pod.id, { immediate: true });
    const impostor = sim.spawn({
      type: 'wreck', team: 2, pos: { x: 5, z: 5 }, radius: 14, mass: 20,
      hull: 10, hullMax: 10, collides: true, data: {},
    });
    // The allocator recycles freed slots — prove the impostor actually took the dead
    // pod's id, or the generation guard below is never really exercised.
    assert.equal(impostor.id, oldId, 'the freed slot is recycled by the next spawn');
    assert.notEqual(impostor.occupantGeneration, rec.gen, 'the id recycled under a new generation');
    impostor.data.understoryCacheId = rec.id; // a hostile copied tag
    bus.emit('entity:killed', { id: impostor.id, type: 'wreck', pos: { ...impostor.pos }, killerId: player.id });
    assert.equal(cracked.length, 0, 'the recycled occupant never cashes the seal');
    assert.equal(grants.filter((g) => g.reason.includes(rec.id)).length, 0);
    sim.step();
    assert.equal(rec.state, 'lost', 'the dead pod\'s row lapses');
  } finally {
    sim.dispose();
  }
});

test('dead-drop: a session-forgotten pod can never pay — restore stamps it resolved', () => {
  const { sim, state, player, grants } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    const rec = shedDrop(sim, state, garden);
    const pod = state.entities.get(rec.entityId);
    // A save/continue drops state.understory entirely; the persistent pod body survives.
    state.understory = { gardens: {}, compost: {}, tidePushback: {} };
    sim.step(); // the orphan scan stamps the pod resolved
    assert.equal(pod.data.understoryResolved, true, 'the restored pod is stamped ordinary');
    flingPodInto(state, rec, garden, player);
    sim.step();
    assert.equal(pod.alive, false, 'the reef still eats it — as ordinary mass');
    assert.equal(grants.length, 0, 'no envelope can be re-minted');
    assert.equal(ensureUnderstoryState(state).favors, 0);
  } finally {
    sim.dispose();
  }
});

test('dead-drop: a stash nobody moves goes cold and the pod is pulled', () => {
  const { sim, state, bus } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    const rec = shedDrop(sim, state, garden);
    const pod = state.entities.get(rec.entityId);
    const lapsed = [];
    bus.on('understory:dropLapsed', (p) => lapsed.push(p));
    state.simTime = rec.expiresAt + 1;
    sim.step();
    assert.equal(rec.state, 'expired');
    assert.equal(pod.alive, false, 'the cold pod leaves the field');
    assert.equal(lapsed.filter((p) => p.dropId === rec.id && p.cause === 'expired').length, 1);
  } finally {
    sim.dispose();
  }
});

test('dead-drop: open stashes stay bounded by the wire cap', () => {
  const { sim, state } = boot();
  try {
    const gardens = [];
    for (let i = 0; i < 8; i++) gardens.push(reef(sim, state, i * 900, -2000 + (i % 3) * 500));
    sim.step();
    const u = ensureUnderstoryState(state);
    for (const g of gardens) u.gardens[g.data.gardenId].nextDropAt = 0;
    sim.step();
    const open = u.drops.filter((r) => r.state === 'open').length;
    assert.ok(open <= UNDERSTORY_QUIET.maxOpenDrops, `open drops ${open} <= ${UNDERSTORY_QUIET.maxOpenDrops}`);
  } finally {
    sim.dispose();
  }
});

// ── the wild stash ─────────────────────────────────────────────────────────────

test('hidden market: once Heard, the market plants a wild stash on the pilot\'s line', () => {
  const { sim, state, bus } = boot();
  try {
    reef(sim, state, -1800, -1800);
    const u = ensureUnderstoryState(state);
    u.favors = UNDERSTORY_ACCESS_TIERS[1].favors; // Heard
    sim.step(); // normalize + schedule
    u.nextWildDropAt = state.simTime;
    const stashed = [];
    bus.on('understory:dropStashed', (p) => stashed.push(p));
    sim.step();
    const wild = stashed.filter((p) => p.wild === true);
    assert.equal(wild.length, 1, 'one wild stash lands on the pilot\'s drift');
    const pod = state.entities.get(u.drops.find((r) => r.id === wild[0].dropId).entityId);
    assert.ok(pod && pod.data.understoryDrop === true);
  } finally {
    sim.dispose();
  }
});

// ── the whisper wire ───────────────────────────────────────────────────────────

test('whisper wire: an established reef posts rumors and the pilot can verify them', () => {
  const { sim, state, bus, player, grants, reps } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    const posted = [];
    const verified = [];
    bus.on('understory:whisperPosted', (p) => posted.push(p));
    bus.on('understory:whisperVerified', (p) => verified.push(p));
    sim.step();
    const u = ensureUnderstoryState(state);
    const rec = u.gardens[garden.data.gardenId];
    rec.nextWhisperAt = 0;
    sim.step();
    assert.equal(posted.length, 1, 'the reef spoke once');
    const w = u.whispers.find((x) => x.state === 'open');
    assert.ok(w, 'an open whisper rides the wire');
    // The pilot runs the named deed — force the feed whisper and feed the reef.
    w.kind = 'feed';
    wreck(sim, 20, 0, 30, { thrownBy: player.id });
    sim.step();
    assert.equal(w.state, 'verified');
    assert.equal(verified.length, 1);
    assert.equal(verified[0].whisperId, w.id);
    assert.equal(grants.filter((g) => g.reason === `understory_whisper:${w.id}`).length, 1);
    assert.equal(reps.filter((r) => r.reason === 'understory_whisper_verified').length, 1);
  } finally {
    sim.dispose();
  }
});

test('whisper wire: a whisper nobody runs sours and costs standing', () => {
  const { sim, state, reps } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    sim.step();
    const u = ensureUnderstoryState(state);
    u.whispers.push({
      id: 'w:test', kind: 'feed', gardenId: garden.data.gardenId,
      gardenEntityId: garden.id, gen: garden.occupantGeneration,
      informant: 'Test Informant', sectorId: SECTOR,
      pos: { x: 0, z: 0 }, postedAt: 0, expiresAt: state.simTime - 1, state: 'open',
    });
    sim.step();
    const w = u.whispers.find((x) => x.id === 'w:test');
    assert.equal(w.state, 'soured');
    assert.equal(reps.filter((r) => r.reason === 'understory_whisper_soured').length, 1);
    assert.equal(reps[0].delta, UNDERSTORY_QUIET.sourRep);
    sim.step();
    assert.equal(reps.filter((r) => r.reason === 'understory_whisper_soured').length, 1, 'sours once');
  } finally {
    sim.dispose();
  }
});

// ── informant debts ────────────────────────────────────────────────────────────

test('informant debts: quiet work under a reef\'s eye accrues to its named informant', () => {
  const { sim, state, player } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    sim.step();
    const u = ensureUnderstoryState(state);
    const rec = u.gardens[garden.data.gardenId];
    assert.equal(typeof rec.informant, 'string', 'every reef has a named informant');
    wreck(sim, 20, 0, 30, { thrownBy: player.id });
    sim.step();
    const inf = u.informants[rec.informant];
    assert.ok(inf, 'the feed accrues to the reef\'s informant');
    assert.equal(inf.owedCr, UNDERSTORY_QUIET.feedOwedCr);
    assert.equal(inf.gardenId, garden.data.gardenId, 'the informant remembers their reef');
  } finally {
    sim.dispose();
  }
});

test('informant debts: a fat tab settles in kind — a marked stash the pilot may open', () => {
  const { sim, state, bus, player, grants } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    sim.step();
    const u = ensureUnderstoryState(state);
    const grec = u.gardens[garden.data.gardenId];
    grec.informant = 'Brother Hypha';
    u.informants['Brother Hypha'] = {
      name: 'Brother Hypha', gardenId: garden.data.gardenId,
      owedCr: UNDERSTORY_QUIET.owedTipCr + 1, tipsPaid: 0,
    };
    const marked = [];
    const cracked = [];
    bus.on('understory:markedStash', (p) => marked.push(p));
    bus.on('understory:dropCracked', (p) => cracked.push(p));
    sim.step();
    assert.equal(marked.length, 1, 'the informant plants the gift');
    const rec = u.drops.find((r) => r.id === marked[0].dropId);
    assert.equal(rec.kind, 'marked');
    assert.ok(u.informants['Brother Hypha'].owedCr <= 1, 'the tab settled against the tip');
    // A marked seal is sanctioned: opening it pays full freight and raises nothing.
    const pod = state.entities.get(rec.entityId);
    const noticeBefore = u.notice;
    bus.emit('entity:killed', { id: pod.id, type: 'payload', pos: { ...pod.pos }, killerId: player.id });
    assert.equal(rec.state, 'cracked');
    assert.equal(cracked[0].sanctioned, true);
    assert.equal(grants.length, 1);
    assert.equal(u.debtCr, 0, 'no toll on a sanctioned break');
    assert.equal(u.notice, noticeBefore, 'the reef does not count it against you');
  } finally {
    sim.dispose();
  }
});

test('informant debts: a reef in another sector defers the gift — no wrong-sector pod', () => {
  const { sim, state, bus } = boot();
  try {
    sim.step();
    const u = ensureUnderstoryState(state);
    // The informant remembers a reef that lives in a different sector — the tip must
    // wait rather than materialize a pod at wrong-sector coordinates in this space.
    u.informants['Sister Peat'] = {
      name: 'Sister Peat', gardenId: 'garden:elsewhere', owedCr: UNDERSTORY_QUIET.owedTipCr + 5, tipsPaid: 0,
    };
    u.gardens['garden:elsewhere'] = {
      sectorId: 'sector_eunomia_gulf', stage: 3, biomass: 200,
      x: 50, z: 50, fedByPlayer: 0, fedMass: 0, seededAt: 0,
    };
    const marked = [];
    bus.on('understory:markedStash', (p) => marked.push(p));
    sim.step();
    assert.equal(marked.length, 0, 'the gift waits for its own reef\'s sector');
    assert.equal(u.informants['Sister Peat'].owedCr, UNDERSTORY_QUIET.owedTipCr + 5,
      'the tab is not spent on a pod that cannot reach its reef');
    assert.equal(u.drops.filter((r) => r.state === 'open').length, 0);
  } finally {
    sim.dispose();
  }
});

test('informant debts: the network skims quiet payouts until the toll is square', () => {
  const { sim, state, bus, player, grants } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    const rec = shedDrop(sim, state, garden);
    const u = ensureUnderstoryState(state);
    u.debtCr = 40;
    const debts = [];
    bus.on('understory:debtChanged', (p) => debts.push(p));
    flingPodInto(state, rec, garden, player);
    sim.step();
    assert.equal(grants.length, 1);
    const gross = Math.max(0, Math.round(rec.valueCr
      * understoryAccess(state).payMult * understoryShadowPrice(state, SECTOR)));
    const skim = Math.min(40, Math.round(gross * UNDERSTORY_QUIET.skimFrac));
    assert.equal(grants[0].amount, gross - skim, 'the skim leaves the envelope');
    assert.equal(u.debtCr, 40 - skim, 'the skim pays the toll down');
    assert.equal(debts.filter((d) => d.cause === 'skim').length, 1);
  } finally {
    sim.dispose();
  }
});

test('informant debts: understory:payDebt settles the toll whole over the wire', () => {
  const { sim, state, bus } = boot();
  try {
    stubExactEconomy(bus, state);
    const u = ensureUnderstoryState(state);
    u.debtCr = 200;
    state.player.credits = 1000;
    const squared = [];
    bus.on('understory:debtSquared', (p) => squared.push(p));
    bus.emit('understory:payDebt', {});
    assert.equal(u.debtCr, 0, 'the toll is paid');
    assert.equal(state.player.credits, 800);
    assert.equal(squared.length, 1);

    // A short balance leaves the toll standing and takes nothing.
    u.debtCr = 900;
    bus.emit('understory:payDebt', {});
    assert.equal(u.debtCr, 900);
    assert.equal(state.player.credits, 800);

    // No debt, no wire movement.
    u.debtCr = 0;
    bus.emit('understory:payDebt', {});
    assert.equal(state.player.credits, 800);
  } finally {
    sim.dispose();
  }
});

// ── cover identities ───────────────────────────────────────────────────────────

test('cover identities: a live name drinks the notice a loud act would raise', () => {
  const { sim, state, bus, player } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    sim.step();
    const u = ensureUnderstoryState(state);
    u.covers.push({
      id: 'c:test', name: 'Gray Mercy', integrity: UNDERSTORY_QUIET.coverPool,
      acquiredAt: 0, how: 'earned', burned: false, burnedAt: null,
    });
    const victim = sim.spawn({
      type: 'ship', team: 2, pos: { x: 10, z: 0 }, radius: 10, mass: 30,
      hull: 10, hullMax: 10, collides: true, data: {},
    });
    bus.emit('entity:killed', { id: victim.id, type: 'ship', pos: { x: 10, z: 0 }, killerId: player.id });
    const cover = u.covers[0];
    assert.equal(cover.burned, false);
    const soaked = UNDERSTORY_QUIET.killNearGarden * UNDERSTORY_QUIET.coverSoakFrac;
    assert.ok(Math.abs(cover.integrity - (UNDERSTORY_QUIET.coverPool - soaked)) < 1e-9,
      'the name drank the act');
    assert.ok(Math.abs(u.notice - (UNDERSTORY_QUIET.killNearGarden - soaked)) < 1e-9,
      'only the overflow lands on the pilot');
    assert.equal(understoryActiveCover(state).name, 'Gray Mercy');
  } finally {
    sim.dispose();
  }
});

test('cover identities: a spent name burns and the pilot wears their own again', () => {
  const { sim, state, bus, player } = boot();
  try {
    reef(sim, state, 0, 0);
    sim.step();
    const u = ensureUnderstoryState(state);
    u.covers.push({
      id: 'c:test', name: 'Low Candle', integrity: 0.1,
      acquiredAt: 0, how: 'earned', burned: false, burnedAt: null,
    });
    const burned = [];
    bus.on('understory:coverBurned', (p) => burned.push(p));
    const victim = sim.spawn({
      type: 'ship', team: 2, pos: { x: 10, z: 0 }, radius: 10, mass: 30,
      hull: 10, hullMax: 10, collides: true, data: {},
    });
    bus.emit('entity:killed', { id: victim.id, type: 'ship', pos: { x: 10, z: 0 }, killerId: player.id });
    assert.equal(burned.length, 1);
    assert.equal(u.covers[0].burned, true);
    assert.equal(understoryActiveCover(state), null, 'no live name remains');
    assert.ok(u.notice > 0.1, 'the overflow hit the pilot');
  } finally {
    sim.dispose();
  }
});

test('cover identities: understory:buyCover rides the exact-payment wire', () => {
  const { sim, state, bus, toasts } = boot();
  try {
    const u = ensureUnderstoryState(state);
    u.favors = UNDERSTORY_ACCESS_TIERS[2].favors; // Hooded — a discounted name
    stubExactEconomy(bus, state);
    state.player.credits = 1000;
    const issued = [];
    bus.on('understory:coverIssued', (p) => issued.push(p));
    bus.emit('understory:buyCover', {});
    assert.equal(issued.length, 1);
    assert.equal(issued[0].how, 'bought');
    const price = Math.max(UNDERSTORY_QUIET.coverFloorCr,
      Math.round(UNDERSTORY_QUIET.coverPriceCr * (2 - understoryAccess(state).payMult)));
    assert.equal(state.player.credits, 1000 - price, 'the name was charged exactly');
    assert.equal(understoryActiveCover(state).name, issued[0].name);

    // The quiet carries at most three live names.
    for (let i = 0; i < 2; i++) {
      u.covers.push({ id: `c:x${i}`, name: `N${i}`, integrity: 0.5, acquiredAt: 0, how: 'bought', burned: false, burnedAt: null });
    }
    bus.emit('understory:buyCover', {});
    assert.equal(issued.length, 1, 'a fourth name is refused');
    assert.ok(toasts.some((t) => /another of your names/.test(t.text)));

    // A short balance buys nothing — and the wire moves nothing.
    u.covers = u.covers.filter((c) => c.burned === true);
    const credits = state.player.credits = 100;
    bus.emit('understory:buyCover', {});
    assert.equal(state.player.credits, credits);
    assert.equal(issued.length, 1);
  } finally {
    sim.dispose();
  }
});

test('cover identities: the first real standing earns a name on the house', () => {
  const { sim, state, bus, player } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    const issued = [];
    const tiers = [];
    bus.on('understory:coverIssued', (p) => issued.push(p));
    bus.on('understory:accessTier', (p) => tiers.push(p));
    const u = ensureUnderstoryState(state);
    u.favors = UNDERSTORY_ACCESS_TIERS[1].favors - 1; // one return crosses to Heard
    const rec = shedDrop(sim, state, garden);
    flingPodInto(state, rec, garden, player);
    sim.step();
    assert.equal(understoryAccess(state).tier, 1, 'the favor crossed the line');
    assert.equal(tiers.length, 1);
    assert.equal(tiers[0].id, 'heard');
    assert.equal(issued.length, 1, 'the network names the pilot');
    assert.equal(issued[0].how, 'earned');
  } finally {
    sim.dispose();
  }
});

// ── detection-risk escalation ──────────────────────────────────────────────────

test('detection: kills on a reef\'s watch ring raise notice through the bands', () => {
  const { sim, state, bus, player } = boot();
  try {
    reef(sim, state, 0, 0);
    sim.step();
    const u = ensureUnderstoryState(state);
    const notices = [];
    bus.on('understory:noticeChanged', (p) => notices.push(p));
    const victim = sim.spawn({
      type: 'ship', team: 2, pos: { x: 10, z: 0 }, radius: 10, mass: 30,
      hull: 10, hullMax: 10, collides: true, data: {},
    });
    bus.emit('entity:killed', { id: victim.id, type: 'ship', pos: { x: 10, z: 0 }, killerId: player.id });
    assert.ok(u.notice > 0, 'the reef saw the gun');
    assert.equal(understoryNoticeBand(u.notice), 'seen');
    assert.equal(notices.length, 1);
    assert.equal(notices[0].band, 'seen');

    // Kills nobody owns — or far from any reef — move nothing.
    const before = u.notice;
    const far = sim.spawn({
      type: 'ship', team: 2, pos: { x: -5000, z: -5000 }, radius: 10, mass: 30,
      hull: 10, hullMax: 10, collides: true, data: {},
    });
    bus.emit('entity:killed', { id: far.id, type: 'ship', pos: { x: -5000, z: -5000 }, killerId: player.id });
    bus.emit('entity:killed', { id: victim.id, type: 'ship', pos: { x: 10, z: 0 }, killerId: 'npc_7' });
    assert.equal(u.notice, before, 'unwitnessed or unowned kills raise nothing');
  } finally {
    sim.dispose();
  }
});

test('detection: marked goes dark — the wire posts nothing while the pilot is seen', () => {
  const { sim, state, bus, player } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    sim.step();
    const u = ensureUnderstoryState(state);
    u.notice = UNDERSTORY_QUIET.markedBand;
    u.gardens[garden.data.gardenId].nextDropAt = 0;
    u.gardens[garden.data.gardenId].nextWhisperAt = 0;
    const stashed = [];
    const posted = [];
    bus.on('understory:dropStashed', (p) => stashed.push(p));
    bus.on('understory:whisperPosted', (p) => posted.push(p));
    sim.step();
    assert.equal(stashed.length, 0, 'a marked pilot gets no stashes');
    assert.equal(posted.length, 0, 'a marked pilot gets no whispers');
  } finally {
    sim.dispose();
  }
});

test('detection: saturation blacklists the name — standing burns, covers burn, a blackout', () => {
  const { sim, state, bus, player, reps } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    sim.step();
    const u = ensureUnderstoryState(state);
    u.covers.push({
      id: 'c:test', name: 'Drift Psalm', integrity: 0.5,
      acquiredAt: 0, how: 'earned', burned: false, burnedAt: null,
    });
    u.notice = UNDERSTORY_QUIET.noticeSaturate - 0.05;
    const blacklisted = [];
    bus.on('understory:blacklisted', (p) => blacklisted.push(p));
    const victim = sim.spawn({
      type: 'ship', team: 2, pos: { x: 10, z: 0 }, radius: 10, mass: 30,
      hull: 10, hullMax: 10, collides: true, data: {},
    });
    bus.emit('entity:killed', { id: victim.id, type: 'ship', pos: { x: 10, z: 0 }, killerId: player.id });
    assert.equal(blacklisted.length, 1, 'the blacklist lands');
    assert.equal(u.blackouts, 1);
    assert.ok(u.blackoutUntil > state.simTime, 'a blackout window opens');
    assert.equal(u.covers[0].burned, true, 'the name burns with the pilot\'s');
    assert.ok(u.notice < UNDERSTORY_QUIET.markedBand, 'the needle resets below the mark');
    assert.equal(reps.filter((r) => r.reason === 'understory_blacklisted').length, 1);

    // During the blackout the wire stays dark even after the needle cools.
    u.gardens[garden.data.gardenId].nextDropAt = 0;
    const stashed = [];
    bus.on('understory:dropStashed', (p) => stashed.push(p));
    sim.step();
    assert.equal(stashed.length, 0);
    state.simTime = u.blackoutUntil + 1;
    sim.step();
    assert.equal(stashed.length, 1, 'after the blackout the quiet posts again');
  } finally {
    sim.dispose();
  }
});

test('detection: quiet time cools the watch — bands decay down and emit once', () => {
  const { sim, state, bus } = boot();
  try {
    reef(sim, state, 0, 0);
    const u = ensureUnderstoryState(state);
    u.notice = UNDERSTORY_QUIET.seenBand + 0.01;
    const notices = [];
    bus.on('understory:noticeChanged', (p) => notices.push(p));
    const before = u.notice;
    sim.runTicks(120); // ~2 s of quiet work
    assert.ok(u.notice < before, 'the needle cooled');
    sim.runTicks(600); // ~10 s total — through the seen band
    assert.ok(u.notice < UNDERSTORY_QUIET.seenBand, 'the reef forgets');
    assert.equal(notices.filter((p) => p.cause === 'decay' && p.band === 'quiet').length, 1,
      'the down-crossing emits once');
  } finally {
    sim.dispose();
  }
});

// ── hidden-market access tiers ─────────────────────────────────────────────────

test('hidden market: favors raise the access tier and multiply every quiet pay', () => {
  const { sim, state, bus, player, grants } = boot();
  try {
    const garden = reef(sim, state, 0, 0);
    const tiers = [];
    bus.on('understory:accessTier', (p) => tiers.push(p));
    const u = ensureUnderstoryState(state);
    u.favors = UNDERSTORY_ACCESS_TIERS[2].favors - 1;
    const rec = shedDrop(sim, state, garden);
    flingPodInto(state, rec, garden, player);
    sim.step();
    const access = understoryAccess(state);
    assert.equal(access.tier, 2);
    assert.equal(access.id, 'hooded');
    assert.equal(tiers.length, 1);
    const price = understoryShadowPrice(state, SECTOR);
    const expected = Math.max(0, Math.round(rec.valueCr
      * UNDERSTORY_ACCESS_TIERS[2].payMult * price));
    assert.equal(grants[0].amount, expected, 'the pay rode the Hooded multiplier');
    // The market snapshot is a copy for the screens — tier, band, wire contents.
    const market = understoryMarket(state);
    assert.equal(market.access.tier, 2);
    assert.equal(market.band, 'quiet');
    assert.equal(market.blackedOut, false);
    assert.equal(market.canConsign, true, 'Hooded runners get addressed work');
    market.drops.length = 0; // mutate the copy —
    assert.ok(u.drops.length > 0, 'the wire itself is not aliased');
  } finally {
    sim.dispose();
  }
});

// ── shadow pricing ─────────────────────────────────────────────────────────────

test('shadow price: tide inflates, sated reefs deflate, heat premiums, bands cut — bounded', () => {
  const { sim, state } = boot();
  try {
    const base = understoryShadowPrice(state, SECTOR);
    assert.ok(Math.abs(base - 1) < 1e-9, 'a cold market prices at par');

    state.worldPressure = { tide: { [SECTOR]: 0.6 } };
    const tidePrice = understoryShadowPrice(state, SECTOR);
    assert.ok(Math.abs(tidePrice - (1 + 0.6 * UNDERSTORY_QUIET.tidePriceWeight)) < 1e-9,
      'a Bloom tide inflates the quiet market');

    reef(sim, state, 0, 0, 900);
    sim.step();
    const sated = understoryShadowPrice(state, SECTOR);
    const expectSated = 1 + 0.6 * UNDERSTORY_QUIET.tidePriceWeight
      - Math.min(UNDERSTORY_QUIET.satePriceCap, 900 * UNDERSTORY_QUIET.satePriceWeight);
    assert.ok(Math.abs(sated - expectSated) < 1e-9, 'a fed reef deflates the market');

    state.player.heat = 0.8;
    const heated = understoryShadowPrice(state, SECTOR);
    assert.ok(heated > sated, 'law heat on the pilot is a contraband premium');
    state.player.heat = 0; // the premium is checked — clear it so the band cut reads alone

    const u = ensureUnderstoryState(state);
    u.notice = UNDERSTORY_QUIET.markedBand;
    assert.ok(understoryShadowPrice(state, SECTOR) < sated, 'a marked band takes its cut');
    u.notice = UNDERSTORY_QUIET.huntedBand;
    assert.ok(understoryShadowPrice(state, SECTOR) < sated - UNDERSTORY_QUIET.huntedPricePenalty + 0.01,
      'hunted bleeds deeper than marked');

    state.worldPressure.tide[SECTOR] = 99;
    u.notice = 0;
    state.player.heat = 99;
    assert.ok(understoryShadowPrice(state, SECTOR) <= UNDERSTORY_QUIET.priceCeil + 1e-9, 'the index is bounded above');
    state.worldPressure.tide[SECTOR] = -99;
    spawnGarden(state, sim.helpers, { x: 0, z: 0, sectorId: SECTOR, biomass: 1e9, gardenId: 'garden:huge' });
    sim.step();
    assert.ok(understoryShadowPrice(state, SECTOR) >= UNDERSTORY_QUIET.priceFloor - 1e-9, 'and bounded below');
  } finally {
    sim.dispose();
  }
});

// ── bounded ledgers ────────────────────────────────────────────────────────────

test('bounded: closed rows garbage-collect and paid stamps cap', () => {
  const { sim, state } = boot();
  try {
    const u = ensureUnderstoryState(state);
    for (let i = 0; i < 40; i++) {
      u.drops.push({
        id: `d:${i}`, kind: 'stash', state: 'returned', entityId: null,
        pos: { x: 0, z: 0 }, valueCr: 10, postedAt: 0, expiresAt: 1, settledAt: 0,
      });
      u.whispers.push({
        id: `w:${i}`, kind: 'feed', state: 'soured', pos: { x: 0, z: 0 },
        postedAt: 0, expiresAt: 1, settledAt: 0,
      });
    }
    for (let i = 0; i < 200; i++) u.paid[`k:${i}`] = i;
    sim.step();
    assert.ok(u.drops.filter((r) => r.state !== 'open').length <= UNDERSTORY_QUIET.dropLogKeep,
      'the drop record strip stays bounded');
    assert.ok(u.whispers.filter((w) => w.state !== 'open').length <= UNDERSTORY_QUIET.whisperLogKeep,
      'the wire keeps only recent closures');
    // The paid ledger is capped lazily at next stamp; assert the cap path itself.
    understoryGardens._paidOnce(u, 'k:new');
    assert.ok(Object.keys(u.paid).length <= 201, 'stamps accrue but the next gc trims');
    understoryGardens._paidOnce(u, 'k:new'); // same stamp — returns false, no growth
    assert.ok(Object.keys(u.paid).length <= 201);
  } finally {
    sim.dispose();
  }
});

// ── coexistence: the garden system is intact under the ledger ─────────────────

test('coexistence: gardens still eat, grow, and complete the Compost Run under the ledger', () => {
  const { sim, state, bus, player } = boot();
  try {
    const garden = spawnGarden(state, sim.helpers, { x: 0, z: 0, sectorId: SECTOR });
    const runs = [];
    bus.on('understory:compostRunComplete', (p) => runs.push(p));
    let fed = 0;
    while (fed < 240) {
      wreck(sim, 20, 0, 60, { thrownBy: player.id });
      sim.step();
      fed += 60;
    }
    assert.equal(runs.length, 1, 'the Compost Run still closes exactly once');
    assert.equal(garden.data.compostRunComplete, true);
    assert.ok(garden.data.gardenStage >= 2, 'the reef still grows');
    // And the feeds were ledger work too — the reef's informant owes the pilot.
    const u = ensureUnderstoryState(state);
    const grec = u.gardens[garden.data.gardenId];
    assert.ok(u.informants[grec.informant].owedCr >= 4 * UNDERSTORY_QUIET.feedOwedCr,
      'every fed tonne accrued under the informant\'s eye');
  } finally {
    sim.dispose();
  }
});
