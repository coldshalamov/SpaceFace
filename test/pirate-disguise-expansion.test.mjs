// pirate-disguise-expansion — the cover book under BP-13 / PQ-151.02.
//
// Proves the deception layer end to end on the real system and the real events:
//   · disguise quality: every mask carries a seeded grade — stable, serialized,
//     banded thin/standard/deep
//   · detection over exposure: near-miss pulses and loitering fray a disguise —
//     the mark telegraphs once, then bolts hostile short of the reveal ring
//   · witnesses: living actors in earshot file tagged rows; a dead or recycled
//     mouth closes its file; silencing a filer is its own charge
//   · faction suspicion: the Reach learns your face, the law flags your papers —
//     each book cools, warns, fines, and burns on its own thresholds
//   · burned marks persist: Reach masks drop pretense inside your ring, the
//     Quiet's wash charges flagged-paper prices, pages turn on their own clock
//   · bargains: outlaw berths post priced, expiring offers — new papers, burned
//     records, hushed witnesses, cooled marks — each taken exactly once
//   · once-only: tips pay per hull generation, offer latches land before the
//     charge, and a JSON round-trip never re-pays or re-bills
//
// Money moves through economy:grantCredits / economy:chargeCredits; standing
// through faction:repDelta. All rolls derive from hash32(meta.seed, …) + simTime.
//
// Run: node --test test/pirate-disguise-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';
import { applyPirateDisguise } from '../src/data/pirateDisguise.js';
import { launderCutCredits } from '../src/data/salvageLegality.js';
import {
  frontierRumorOffer,
  TETHYS_BLACK_MARKET_DISCOVERY,
  TETHYS_BLACK_MARKET_RUN,
} from '../src/data/frontierRumors.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import {
  pirateDisguise,
  ensureCoverState,
  coverBoard,
  coverStandingFor,
  coverCheckChance,
  disguiseReadFor,
  disguiseBand,
  COVER_QUALITY,
  COVER_SPOOK,
  COVER_WITNESS,
  COVER_SUSPICION,
  COVER_CHECK,
  COVER_BURN,
  COVER_BARGAIN,
  COVER_TIP,
} from '../src/systems/pirateDisguise.js';

const SEED = 4242;
const tick = (s) => Math.ceil(s * 60);
const OUTLAW = 'station_smuggler';
const LAWFUL = 'station_helios';
const fracOf = (seed, ...args) => (hash32(seed, ...args) >>> 0) / 4294967296;

function boot({ credits = 50000 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [pirateDisguise] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: {},
  });
  state.playerId = player.id;
  state.player.credits = credits;
  const events = { grants: [], charges: [], reps: [], logs: [], toasts: [] };
  bus.on('economy:grantCredits', (p) => {
    if (!p) return;
    state.player.credits = Math.round(state.player.credits + Math.round(p.amount || 0));
    events.grants.push(p);
  });
  bus.on('economy:chargeCredits', (p) => {
    if (!p) return;
    if (p.requireFull === true) {
      // The economy's exact-charge contract: the live balance must match, the commit runs
      // first, and only then does the money move.
      p.result = false;
      const live = state.player.credits;
      if (live !== p.expectedCredits || live < p.amount || typeof p.commit !== 'function' || p.commit() !== true) return;
      p.result = true;
    }
    state.player.credits = Math.max(0, Math.round(state.player.credits - Math.round(p.amount || 0)));
    events.charges.push(p);
  });
  bus.on('faction:repDelta', (p) => events.reps.push(p));
  bus.on('comms:log', (p) => events.logs.push(p));
  bus.on('toast', (p) => events.toasts.push(p));
  return { sim, state, bus, player, events };
}

const granted = (events, prefix) =>
  events.grants.filter((g) => String(g.reason || '').startsWith(prefix));
const charged = (events, prefix) =>
  events.charges.filter((c) => String(c.reason || '').startsWith(prefix));
const repTotal = (events, reason) =>
  events.reps.filter((r) => r.reason === reason).reduce((a, r) => a + r.delta, 0);

function disguisedPirate(sim, x, z, key = 'raid') {
  const e = sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach',
    pos: { x, z }, radius: 14, mass: 30, hull: 80, hullMax: 80, collides: true,
    data: { ai: { doctrine: 'thief', archetype: 'pirate_raider', passive: false } },
  });
  const skin = applyPirateDisguise(e, { seed: SEED, key: `${key}:${e.id}` });
  assert.ok(skin && skin.disguised === true);
  assert.equal(e.team, 2, 'the mask reads civilian before anything touches it');
  return e;
}

function witnessShip(sim, x, z, factionId = 'faction_scn') {
  return sim.spawn({
    type: 'ship', team: 2, factionId,
    pos: { x, z }, radius: 12, mass: 24, hull: 60, hullMax: 60, collides: true, data: {},
  });
}

function hotPod(t, spec = {}) {
  const pod = spawnJettisonedCargoPod(t.state, {
    pos: spec.pos || { x: 30, z: 0 },
    vel: { x: 0, z: 0 },
    commodityId: 'cmdty_narcotics',
    amount: spec.amount != null ? spec.amount : 8,
    unitMass: 0.5,
    ownerId: t.player.id,
    factionId: 'player',
  }, t.sim.helpers);
  assert.ok(pod, 'the pod is a real body');
  return pod;
}

// The Pallas den is Tethys-gated: the entrance run must be delivered before the
// berth admits anything — same unlock the PQ-151.02 fixture performs.
function deliverAccess(state) {
  const discovery = TETHYS_BLACK_MARKET_DISCOVERY;
  const lead = frontierRumorOffer(state, discovery.stationId);
  state.world.frontierRumors.byId[discovery.rumorId] = {
    ...lead, phase: 'contacted', contactId: discovery.contactId,
    entranceRun: { ...TETHYS_BLACK_MARKET_RUN, phase: 'delivered', deliveredAt: 1, parcel: null },
  };
}

// ── Surface ──────────────────────────────────────────────────────────────────

test('exports: the old contract is intact and the cover book is additive', () => {
  assert.equal(pirateDisguise.name, 'pirateDisguise');
  assert.equal(typeof pirateDisguise.launderAtDock, 'function');
  assert.equal(typeof pirateDisguise.update, 'function', 'the book keeps a beat');
  assert.equal(typeof ensureCoverState, 'function');
  assert.equal(typeof coverBoard, 'function');
  assert.equal(typeof coverStandingFor, 'function');
  assert.equal(typeof coverCheckChance, 'function');
  assert.equal(typeof disguiseReadFor, 'function');
  assert.equal(disguiseBand(0.2), 'thin');
  assert.equal(disguiseBand(0.6), 'standard');
  assert.equal(disguiseBand(0.9), 'deep');
  assert.ok(COVER_SPOOK.spookRadius > 1200, 'the spook band reaches past the reveal ring');
  assert.ok(COVER_SPOOK.frayRadius > 0 && COVER_WITNESS.maxRows >= 4);
  assert.ok(COVER_BURN.markAmbushR > 0 && COVER_TIP.baseCr > 0 && COVER_BARGAIN.maxPosted >= 1);
});

// ── Witnessed deeds ──────────────────────────────────────────────────────────

test('a witnessed reveal files the Reach book and tags the mouths that saw it', () => {
  const { sim, state, bus } = boot();
  try {
    const pirate = disguisedPirate(sim, 80, 0);
    const watcher = witnessShip(sim, 300, 0, 'faction_scn');
    const revealed = [], filed = [], spied = [];
    bus.on('pirateDisguise:revealed', (p) => revealed.push(p));
    bus.on('pirateDisguise:witnessFiled', (p) => filed.push(p));
    bus.on('pirateDisguise:suspicionFiled', (p) => spied.push(p));

    bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq: 1, source: 'player-scanner' });
    assert.equal(revealed.length, 1);
    assert.equal(revealed[0].by, 'scan');
    assert.ok(Number.isFinite(revealed[0].quality), 'the read carries the mask grade');
    assert.ok(['thin', 'standard', 'deep'].includes(revealed[0].band));
    assert.equal(revealed[0].witnesses, 1);
    assert.equal(pirate.data.disguiseBlown, true);
    assert.equal(pirate.team, 1, 'the blown mask flips hostile as before');

    // The row is bound id + generation + a tag riding the body itself.
    const cover = ensureCoverState(state);
    const row = cover.witnesses.find((r) => r.entityId === watcher.id);
    assert.ok(row && row.kind === 'reveal');
    assert.equal(row.gen, watcher.occupantGeneration);
    assert.equal(watcher.data.coverWitness[row.id], true);
    assert.equal(filed.length, 1);

    const reach = cover.suspicion['faction_reach'];
    assert.ok(reach && reach.score >= COVER_SUSPICION.outedWitnessed, 'the Reach learns your face');
    assert.ok(spied.some((s) => s.kind === 'outed_witnessed'));
    assert.ok(cover.quality < COVER_QUALITY.max, 'the filing frays the cover');

    // A second pulse over the blown hull files nothing new.
    bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq: 2, source: 'player-scanner' });
    assert.equal(revealed.length, 1);
    assert.equal(filed.length, 1);
    assert.equal(cover.witnesses.length, 1);
  } finally {
    sim.dispose();
  }
});

test('a lawful mouth pays the spotter tip once per hull generation', () => {
  const { sim, state, bus, events } = boot();
  try {
    const pirate = disguisedPirate(sim, 60, 0);
    witnessShip(sim, 200, 0, 'faction_scn');
    const tips = [];
    bus.on('pirateDisguise:tipPaid', (p) => tips.push(p));

    bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq: 1, source: 'player-scanner' });
    assert.equal(tips.length, 1);
    const grant = granted(events, 'cover_tip:');
    assert.equal(grant.length, 1, 'the tip pays once');
    assert.equal(grant[0].amount, tips[0].amount);
    assert.ok(tips[0].amount >= COVER_TIP.baseCr);
    assert.equal(repTotal(events, 'cover_tip'), COVER_TIP.rep);

    // The latch is durable: a direct re-pay attempt is refused, even after a
    // save round-trip — the same occupant never collects twice.
    const sys = sim.registry.get('pirateDisguise');
    const cover = ensureCoverState(state);
    const before = events.grants.length;
    sys._payTip(state, cover, pirate, { quality: 0.5 }, { id: 'w:x', factionId: 'faction_scn' });
    assert.equal(events.grants.length, before, 'the paid latch refuses a replay');
    state.player.pirateCover = JSON.parse(JSON.stringify(state.player.pirateCover));
    sys._payTip(state, ensureCoverState(state), pirate, { quality: 0.5 }, { id: 'w:x', factionId: 'faction_scn' });
    assert.equal(events.grants.length, before, 'the restored latch still refuses');
  } finally {
    sim.dispose();
  }
});

test('a reveal on an empty lane files nothing — the void tells no tales', () => {
  const { sim, state, bus, events } = boot();
  try {
    disguisedPirate(sim, 60, 0);
    const revealed = [];
    bus.on('pirateDisguise:revealed', (p) => revealed.push(p));
    bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq: 1, source: 'player-scanner' });
    assert.equal(revealed.length, 1);
    assert.equal(revealed[0].witnesses, 0);
    const cover = ensureCoverState(state);
    assert.equal(cover.witnesses.length, 0);
    assert.equal(Object.keys(cover.suspicion).length, 0, 'no mouths, no file');
    assert.equal(granted(events, 'cover_tip:').length, 0, 'nobody pays for a read nobody saw');
  } finally {
    sim.dispose();
  }
});

// ── Disguise quality and exposure ────────────────────────────────────────────

test('disguise quality is seeded, stable, and survives a JSON round-trip', () => {
  const { sim, state } = boot();
  try {
    const a = disguisedPirate(sim, 60, 0, 'a');
    const b = disguisedPirate(sim, 120, 0, 'b');
    const ra = disguiseReadFor(state, a);
    assert.ok(ra.quality >= 0 && ra.quality < 1, 'the grade is a fraction');
    assert.equal(a.data.pirateDisguise.quality, ra.quality, 'the grade stamps the body');
    assert.equal(disguiseReadFor(state, a).quality, ra.quality, 'the read is stable');
    a.data = JSON.parse(JSON.stringify(a.data));
    assert.equal(disguiseReadFor(state, a).quality, ra.quality, 'the stamp serializes');
    const rb = disguiseReadFor(state, b);
    assert.ok(rb.quality >= 0 && rb.quality < 1);
    assert.equal(rb.blown, false);
    // The grade re-derives deterministically if the stamp is wiped.
    delete b.data.pirateDisguise.quality;
    assert.equal(disguiseReadFor(state, b).quality, rb.quality, 'a lost stamp re-derives identically');
  } finally {
    sim.dispose();
  }
});

test('near-miss pulses spook, then a rattled mark bolts hostile', () => {
  const { sim, state, bus } = boot();
  try {
    // Beyond the 1200 reveal ring, inside the spook band.
    const pirate = disguisedPirate(sim, COVER_SPOOK.spookRadius - 200, 0);
    const d = pirate.data.pirateDisguise;
    const read = disguiseReadFor(state, pirate);
    const spookAt = COVER_SPOOK.spookBase + read.quality * COVER_SPOOK.spookQuality;
    const boltAt = spookAt + COVER_SPOOK.boltAfter;
    const spooked = [], revealed = [], bolted = [];
    bus.on('pirateDisguise:spooked', (p) => spooked.push(p));
    bus.on('pirateDisguise:revealed', (p) => revealed.push(p));
    bus.on('pirateDisguise:bolted', (p) => bolted.push(p));

    const pulse = (seq) => bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq, source: 'player-scanner' });
    pulse(1);
    pulse(1); // a replayed pulse key cannot stack exposure
    assert.equal(d.exposure, COVER_SPOOK.nearMissExposure, 'one pulse, one mark of exposure');
    assert.equal(revealed.length, 0, 'a near-miss does not blow the mask');

    let seq = 1;
    while (d.spookAnnounced !== true && seq < 40) { seq += 1; pulse(seq); }
    assert.equal(spooked.length, 1, 'the telegraph fires exactly once');
    assert.ok(d.exposure >= spookAt);
    assert.equal(spooked[0].by, 'scan');
    assert.equal(pirate.data.ai.spooked, true, 'the mark goes visibly nervous');
    assert.ok(pirate.data.trafficLabel.startsWith('Erratic'), 'the contact label frays in public');

    while (d.disguiseBlown !== true && seq < 80) { seq += 1; pulse(seq); }
    assert.equal(bolted.length, 1);
    assert.equal(bolted[0].by, 'spooked');
    assert.equal(revealed.length, 1);
    assert.equal(revealed[0].by, 'spooked');
    assert.ok(d.exposure >= boltAt);
    assert.equal(pirate.team, 1, 'the ambush flips hostile for real');
    assert.equal(pirate.data.ai.huntPlayer, true);
  } finally {
    sim.dispose();
  }
});

test('loitering inside the fray ring frays a mask without any scan', () => {
  const { sim, state, bus } = boot();
  try {
    const pirate = disguisedPirate(sim, COVER_SPOOK.frayRadius - 60, 0);
    const spooked = [], revealed = [];
    bus.on('pirateDisguise:spooked', (p) => spooked.push(p));
    bus.on('pirateDisguise:revealed', (p) => revealed.push(p));
    sim.runTicks(tick(20));
    assert.equal(revealed.length, 1, 'the loitered mask bolts on its own');
    assert.equal(revealed[0].by, 'rattled');
    assert.equal(pirate.team, 1);
    assert.equal(spooked.length, 1);
    assert.equal(spooked[0].by, 'proximity');
  } finally {
    sim.dispose();
  }
});

test('a frayed mask cools when the pressure lifts', () => {
  const { sim, state, player } = boot();
  try {
    const pirate = disguisedPirate(sim, COVER_SPOOK.frayRadius - 60, 0);
    sim.runTicks(tick(1));
    const warm = pirate.data.pirateDisguise.exposure;
    assert.ok(warm > 0, 'one second inside the ring frays the lie');
    player.pos.x = 9000; // leave the ring entirely
    sim.runTicks(tick(4));
    assert.ok(pirate.data.pirateDisguise.exposure < warm, 'exposure bleeds off out of range');
    assert.equal(pirate.data.disguiseBlown, undefined, 'it never blew');
  } finally {
    sim.dispose();
  }
});

// ── Kills under the mask ─────────────────────────────────────────────────────

test('a masked kill files the Reach book and the skin they wore', () => {
  const { sim, state, bus, player } = boot();
  try {
    const pirate = disguisedPirate(sim, 100, 0);
    witnessShip(sim, 260, 0, 'faction_scn');
    const skinFaction = pirate.factionId;
    assert.notEqual(skinFaction, 'faction_reach', 'the corpse died under a civilian flag');

    pirate.alive = false;
    bus.emit('entity:killed', {
      id: pirate.id, killerId: player.id, type: 'ship', pos: { x: 100, z: 0 },
    });
    const cover = ensureCoverState(state);
    const reach = cover.suspicion['faction_reach'];
    assert.ok(reach && reach.score >= COVER_SUSPICION.maskedKill, 'the crew knew better');
    const skin = cover.suspicion[skinFaction];
    assert.ok(skin && skin.score >= COVER_SUSPICION.maskedKillSkin,
      'the watching world saw a civilian murdered');
    assert.ok(cover.witnesses.some((r) => r.kind === 'masked_kill'));
  } finally {
    sim.dispose();
  }
});

test('silencing a filed witness closes its rows — at a price', () => {
  const { sim, state, bus, player } = boot();
  try {
    disguisedPirate(sim, 80, 0);
    const mouth = witnessShip(sim, 300, 0, 'faction_scn');
    const second = witnessShip(sim, 320, 0, 'faction_mts');
    bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq: 1, source: 'player-scanner' });
    const cover = ensureCoverState(state);
    const rows = cover.witnesses.filter((r) => r.entityId === mouth.id);
    assert.ok(rows.length >= 1, 'the mouth is filed');

    // Cool the mouth — with another live mouth still watching.
    mouth.alive = false;
    bus.emit('entity:killed', { id: mouth.id, killerId: player.id, type: 'ship', pos: { x: 300, z: 0 } });
    assert.ok(rows.every((r) => r.closed === true), 'the dead mouth\'s file closes');
    assert.equal(mouth.data.coverWitness[rows[0].id], undefined, 'the tag strips off the body');
    const scn = cover.suspicion['faction_scn'];
    assert.ok(scn && scn.score >= COVER_SUSPICION.witnessSilenced, 'silencing is its own charge');
    assert.ok(cover.witnesses.some((r) => r.kind === 'silencing' && r.entityId === second.id),
      'the remaining mouth carries the silencing');
  } finally {
    sim.dispose();
  }
});

test('a recycled or dead witness id never vouches — the row prunes', () => {
  const { sim, state, bus } = boot();
  try {
    disguisedPirate(sim, 80, 0);
    const mouth = witnessShip(sim, 300, 0, 'faction_scn');
    bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq: 1, source: 'player-scanner' });
    const cover = ensureCoverState(state);
    const row = cover.witnesses.find((r) => r.entityId === mouth.id);
    assert.ok(row && row.closed !== true);

    // A different occupant wears the id — same slot, new generation, no tag.
    mouth.occupantGeneration += 5;
    delete mouth.data.coverWitness;
    sim.runTicks(tick(1));
    assert.ok(!cover.witnesses.some((r) => r.entityId === mouth.id && !r.closed),
      'the recycled body cannot vouch — the row is pruned');
  } finally {
    sim.dispose();
  }
});

test('a doubled kill receipt files the masked kill exactly once — even re-entrant or restored', () => {
  const { sim, state, bus, player } = boot();
  try {
    const pirate = disguisedPirate(sim, 100, 0);
    witnessShip(sim, 260, 0, 'faction_scn');
    const skinFaction = pirate.factionId;
    pirate.alive = false;
    const kill = { id: pirate.id, killerId: player.id, type: 'ship', pos: { x: 100, z: 0 } };
    bus.emit('entity:killed', kill);
    let cover = ensureCoverState(state);
    const reachScore = cover.suspicion['faction_reach'].score;
    const skinScore = cover.suspicion[skinFaction].score;
    const filedRows = cover.witnesses.filter((r) => r.kind === 'masked_kill').length;
    assert.ok(filedRows > 0, 'the deed is on the book');

    // A replayed receipt — and one replayed through a save round-trip — files nothing.
    bus.emit('entity:killed', kill);
    state.player.pirateCover = JSON.parse(JSON.stringify(state.player.pirateCover));
    bus.emit('entity:killed', kill);
    cover = ensureCoverState(state);
    assert.equal(cover.suspicion['faction_reach'].score, reachScore, 'no second masked_kill');
    assert.equal(cover.suspicion[skinFaction].score, skinScore, 'no second civilian_kill');
    assert.equal(cover.witnesses.filter((r) => r.kind === 'masked_kill').length, filedRows);

    // Re-entrancy: a listener that replays the kill inside the filing emission
    // meets the same latch — the word still lands exactly once.
    const pirate2 = disguisedPirate(sim, 140, 0, 'raid2');
    pirate2.alive = false;
    const kill2 = { id: pirate2.id, killerId: player.id, type: 'ship', pos: { x: 140, z: 0 } };
    const unsub = bus.on('pirateDisguise:witnessFiled', (p) => {
      if (p && p.kind === 'masked_kill' && p.entityId === pirate2.id) bus.emit('entity:killed', kill2);
    });
    bus.emit('entity:killed', kill2);
    unsub();
    cover = ensureCoverState(state);
    assert.equal(cover.suspicion['faction_reach'].score, reachScore + COVER_SUSPICION.maskedKill,
      'the re-entrant replay could not double-file');
  } finally {
    sim.dispose();
  }
});

test('a recycled occupant\'s death closes the row but files no silencing charge', () => {
  const { sim, state, bus, player } = boot();
  try {
    disguisedPirate(sim, 80, 0);
    const mouth = witnessShip(sim, 300, 0, 'faction_scn');
    witnessShip(sim, 320, 0, 'faction_mts');
    bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq: 1, source: 'player-scanner' });
    const cover = ensureCoverState(state);
    const row = cover.witnesses.find((r) => r.entityId === mouth.id);
    assert.ok(row && row.closed !== true, 'the mouth is filed');
    const scnScore = () => (cover.suspicion['faction_scn'] || {}).score || 0;

    // The id is recycled: a new occupant wears the slot — new generation, fresh
    // data, the old body's tag gone. Killing the stranger closes the stale row,
    // but the crew knows it was not the mouth that filed on you.
    mouth.occupantGeneration += 9;
    mouth.data = {};
    mouth.alive = false;
    bus.emit('entity:killed', { id: mouth.id, killerId: player.id, type: 'ship', pos: { x: 300, z: 0 } });
    assert.equal(row.closed, true, 'the stale row still closes on the receipt');
    assert.equal(scnScore(), 0,
      'a stranger\'s death files no witness_silenced charge');
    assert.ok(!cover.witnesses.some((r) => r.kind === 'silencing' && r.entityId === mouth.id),
      'no silencing tale rides the recycled mouth');
  } finally {
    sim.dispose();
  }
});

test('a stale-but-open row does not charge silencing when its mouth dies', () => {
  const { sim, state, bus, player } = boot();
  try {
    disguisedPirate(sim, 80, 0);
    const mouth = witnessShip(sim, 300, 0, 'faction_scn');
    witnessShip(sim, 320, 0, 'faction_mts');
    bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq: 1, source: 'player-scanner' });
    const cover = ensureCoverState(state);
    const row = cover.witnesses.find((r) => r.entityId === mouth.id);
    assert.ok(row, 'the mouth is filed');

    // The tale went cold on the shelf but the beat has not pruned the row yet —
    // killing the mouth now closes a dead file, not a live one.
    row.staleAt = state.simTime - 1;
    mouth.alive = false;
    bus.emit('entity:killed', { id: mouth.id, killerId: player.id, type: 'ship', pos: { x: 300, z: 0 } });
    assert.equal(row.closed, true);
    assert.equal((cover.suspicion['faction_scn'] || {}).score || 0, 0,
      'a tale gone stale is not a live mouth to silence');
  } finally {
    sim.dispose();
  }
});

test('corrupt body fields never crash the filing or spook paths', () => {
  const { sim, state, bus } = boot();
  try {
    disguisedPirate(sim, 80, 0);
    const mouth = witnessShip(sim, 300, 0, 'faction_scn');
    mouth.data.coverWitness = 7; // a corrupt restore left a number where the tag book lives
    bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq: 1, source: 'player-scanner' });
    const cover = ensureCoverState(state);
    const row = cover.witnesses.find((r) => r.entityId === mouth.id);
    assert.ok(row, 'the mouth still files');
    assert.equal(mouth.data.coverWitness[row.id], true, 'the book reseats and the tag lands');

    // A corrupt ai block on a disguised hull cannot throw inside the telegraph.
    // Park the mark in the spook band so the pulse takes the near-miss path.
    const spooked = [];
    bus.on('pirateDisguise:spooked', (p) => spooked.push(p));
    const far = disguisedPirate(sim, COVER_SPOOK.spookRadius - 200, 0, 'far');
    far.data.ai = 5;
    const d = far.data.pirateDisguise;
    const read = disguiseReadFor(state, far);
    d.exposure = COVER_SPOOK.spookBase + read.quality * COVER_SPOOK.spookQuality;
    bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq: 9, source: 'player-scanner' });
    // exposure was already past the telegraph — the near-miss pushes it into the check
    assert.equal(spooked.length, 1, 'the telegraph still fires');
    assert.equal(far.data.ai.spooked, true, 'the ai block reseats clean');
  } finally {
    sim.dispose();
  }
});

test('a witness row dropped over the cap strips the tag off the body', () => {
  const t = boot();
  try {
    hotPod(t);
    const mouth = witnessShip(t.sim, 400, 0);
    const cover = ensureCoverState(t.state);
    // Seat the file at cap with tagged rows — the manifest office's next row
    // pushes the oldest mouth off the book.
    for (let i = 0; i < COVER_WITNESS.maxRows; i++) {
      const id = `wit-stuffed:${i}`;
      (mouth.data.coverWitness || (mouth.data.coverWitness = {}))[id] = true;
      cover.witnesses.push({
        id, actId: 'act:stuffed', kind: 'reveal', entityId: mouth.id,
        gen: mouth.occupantGeneration == null ? null : mouth.occupantGeneration,
        factionId: 'faction_scn', filedAt: 0, staleAt: 1e9, closed: false,
      });
    }
    t.bus.emit('dock:docked', { stationId: LAWFUL });
    assert.equal(cover.witnesses.length, COVER_WITNESS.maxRows, 'the file stays bounded');
    assert.equal(mouth.data.coverWitness['wit-stuffed:0'], undefined,
      'the row the cap dropped left no mark on the body');
    assert.equal(mouth.data.coverWitness['wit-stuffed:1'], true, 'a kept row stays tagged');

    // The same law holds when the book normalizes an overstuffed restore.
    for (let i = COVER_WITNESS.maxRows; i < COVER_WITNESS.maxRows + 2; i++) {
      const id = `wit-stuffed:${i}`;
      mouth.data.coverWitness[id] = true;
      cover.witnesses.push({
        id, actId: 'act:stuffed', kind: 'reveal', entityId: mouth.id,
        gen: mouth.occupantGeneration == null ? null : mouth.occupantGeneration,
        factionId: 'faction_scn', filedAt: 0, staleAt: 1e9, closed: false,
      });
    }
    ensureCoverState(t.state);
    assert.equal(cover.witnesses.length, COVER_WITNESS.maxRows);
    assert.equal(mouth.data.coverWitness['wit-stuffed:1'], undefined,
      'the normalize drop strips its tag too');
    assert.equal(mouth.data.coverWitness[`wit-stuffed:${COVER_WITNESS.maxRows}`], true);
  } finally {
    t.sim.dispose();
  }
});

// ── Docking and the manifest office ──────────────────────────────────────────

test('hot pods under a lawful berth file seen_hot — once per visit', () => {
  const t = boot();
  try {
    hotPod(t);
    const filed = [];
    t.bus.on('pirateDisguise:suspicionFiled', (p) => filed.push(p));
    t.bus.on('pirateDisguise:witnessFiled', (p) => filed.push({ witness: p }));
    t.bus.emit('dock:docked', { stationId: LAWFUL });
    const cover = ensureCoverState(t.state);
    const scn = cover.suspicion['faction_scn'];
    assert.ok(scn && scn.score >= COVER_SUSPICION.seenHot, 'the manifest office smelled the hold');
    assert.ok(cover.witnesses.some((r) => r.kind === 'seen_hot' && r.stationId === LAWFUL));
    assert.ok(filed.some((f) => f.kind === 'seen_hot'));
    t.bus.emit('dock:docked', { stationId: LAWFUL }); // a re-emitted dock event files nothing new
    assert.equal(filed.filter((f) => f.kind === 'seen_hot').length, 1);
  } finally {
    t.sim.dispose();
  }
});

test('berth-hopping inside one visit window cannot re-file or re-fine a stop', () => {
  const t = boot();
  try {
    const cover = ensureCoverState(t.state);
    cover.suspicion['faction_scn'] = { score: 60, stage: 0, lastAt: 0, nextCheckAt: 0, nextFineAt: 0 };
    hotPod(t);
    const filed = [];
    t.bus.on('pirateDisguise:witnessFiled', (p) => filed.push(p));
    const seq0 = cover.checkSeq;
    // A lawful berth, a second lawful berth, then back to the first — all inside
    // one visit window. The office already read the first stop.
    t.bus.emit('dock:docked', { stationId: LAWFUL });
    t.bus.emit('dock:docked', { stationId: 'station_beta', factionId: 'faction_scn' });
    t.bus.emit('dock:docked', { stationId: LAWFUL });
    assert.equal(filed.filter((f) => f.kind === 'seen_hot').length, 2,
      'each berth smells the hold once — the hop back is the same visit');
    assert.equal(cover.checkSeq - seq0, 2,
      'two offices ran the papers read; the return stop was already read');
    // After the window the next stop is a new visit — the office reads it fresh.
    t.state.simTime += COVER_CHECK.dockPapersGapS + 1;
    t.bus.emit('dock:docked', { stationId: LAWFUL });
    assert.equal(filed.filter((f) => f.kind === 'seen_hot').length, 3, 'a later visit files again');
    assert.equal(cover.checkSeq - seq0, 3, 'the office reads again past the window');
  } finally {
    t.sim.dispose();
  }
});

test('a posted bargain keeps a unique id even when the caller asks for a taken one', () => {
  const t = boot();
  try {
    const sys = t.sim.registry.get('pirateDisguise');
    const a = sys.offerCoverBargain(t.state, { id: 'fix-1', kind: 'new_papers', costCr: 10 });
    const b = sys.offerCoverBargain(t.state, { id: 'fix-1', kind: 'burn_record', costCr: 10 });
    assert.equal(a.id, 'fix-1');
    assert.notEqual(b.id, 'fix-1', 'the colliding request mints a fresh id');
    assert.equal(b.kind, 'burn_record');
    const receipt = sys.takeBargain(t.state, a.id);
    assert.equal(receipt.kind, 'new_papers', 'the id lookup takes the right offer');
    assert.equal(charged(t.events, 'cover_bargain:').length, 1);
  } finally {
    t.sim.dispose();
  }
});

test('a hot file at a lawful berth triggers the papers check — once per visit', () => {
  const t = boot();
  try {
    const cover = ensureCoverState(t.state);
    cover.suspicion['faction_scn'] = { score: 60, stage: 0, lastAt: 0, nextCheckAt: 0, nextFineAt: 0 };
    cover.quality = 50;
    const p = coverCheckChance(t.state, 'faction_scn');
    assert.ok(p > 0, 'a hot file has real odds');
    // Pin the roll: find the first checkSeq whose deterministic draw fails.
    let seq = -1;
    for (let s = 0; s < 1e6; s++) {
      if (fracOf(SEED, 'papersCheck', 'faction_scn', s) < p) { seq = s; break; }
    }
    assert.ok(seq >= 0, 'a failing roll exists');
    cover.checkSeq = seq;
    const fined = [];
    t.bus.on('pirateDisguise:papersFined', (pl) => fined.push(pl));
    t.bus.emit('dock:docked', { stationId: LAWFUL });
    assert.equal(fined.length, 1, 'the office reads the hot file');
    assert.equal(charged(t.events, 'cover_fine:').length, 1, 'the fine bills once');
    t.bus.emit('dock:docked', { stationId: LAWFUL });
    assert.equal(fined.length, 1, 'the same visit never double-bills');
    assert.equal(charged(t.events, 'cover_fine:').length, 1);
  } finally {
    t.sim.dispose();
  }
});

// ── Escalation and persistent consequences ───────────────────────────────────

test('a hot file warns, then fines, then burns — each stage exactly once', () => {
  const { sim, state, events } = boot();
  try {
    const cover = ensureCoverState(state);
    const warned = [], fined = [], burned = [];
    sim.bus.on('pirateDisguise:coverWarned', (p) => warned.push(p));
    sim.bus.on('pirateDisguise:coverFined', (p) => fined.push(p));
    sim.bus.on('pirateDisguise:coverBurned', (p) => burned.push(p));

    // Seat a hot Reach file below the burn line so the stages have room to walk.
    cover.suspicion['faction_reach'] = { score: 40, stage: 0, lastAt: 0, nextCheckAt: 0, nextFineAt: 0 };
    cover.quality = 40;
    const p0 = coverCheckChance(state, 'faction_reach');
    assert.ok(p0 > 0 && p0 <= COVER_CHECK.cap);
    const failSeq = (from) => {
      for (let s = from; s < from + 1e6; s++) {
        if (fracOf(SEED, 'coverCheck', 'faction_reach', s) < p0) return s;
      }
      return -1;
    };

    cover.checkSeq = failSeq(0);
    sim.runTicks(tick(1)); // one beat — one check
    assert.equal(warned.length, 1, 'the first failed read warns');
    assert.equal(repTotal(events, 'cover_warned'), COVER_CHECK.warnRep);
    assert.equal(cover.suspicion['faction_reach'].stage, 1);

    // Re-due the read and pin the next failing roll — one beat, one check.
    cover.checkSeq = failSeq(cover.checkSeq + 1);
    cover.suspicion['faction_reach'].nextCheckAt = 0;
    sim.runTicks(tick(1));
    assert.equal(fined.length, 1, 'the next failed read fines');
    assert.equal(charged(events, 'cover_fine:').length, 1);
    assert.ok(charged(events, 'cover_fine:')[0].amount >= COVER_CHECK.fineBaseCr);
    assert.equal(repTotal(events, 'cover_fined'), COVER_CHECK.fineRep);
    assert.equal(cover.suspicion['faction_reach'].stage, 2);

    // Push the file past the burn line — the next failed read torches it.
    cover.suspicion['faction_reach'].score = 90;
    cover.checkSeq = failSeq(cover.checkSeq + 1);
    cover.suspicion['faction_reach'].nextCheckAt = 0;
    sim.runTicks(tick(1));
    assert.equal(burned.length, 1, 'the burn lands once');
    assert.ok(cover.burned['faction_reach'], 'the mark persists on the book');
    assert.ok(cover.burned['faction_reach'].until > state.simTime);
    assert.equal(repTotal(events, 'cover_burned'), COVER_CHECK.burnRep);
    assert.equal(cover.suspicion['faction_reach'].stage, 3);
  } finally {
    sim.dispose();
  }
});

test('a burned Reach mark means masked raiders stop pretending inside your ring', () => {
  const { sim, state, bus } = boot();
  try {
    const cover = ensureCoverState(state);
    cover.burned['faction_reach'] = {
      until: state.simTime + COVER_BURN.windowS, filedAt: state.simTime, by: 'checks',
    };
    const pirate = disguisedPirate(sim, COVER_BURN.markAmbushR - 100, 0);
    const revealed = [], marked = [];
    bus.on('pirateDisguise:revealed', (p) => revealed.push(p));
    bus.on('pirateDisguise:bolted', (p) => marked.push(p));
    sim.runTicks(tick(1));
    assert.equal(revealed.length, 1, 'no scan needed — the mark dropped pretense');
    assert.equal(revealed[0].by, 'marked');
    assert.equal(marked.length, 1);
    assert.equal(pirate.team, 1, 'they came in hot');
  } finally {
    sim.dispose();
  }
});

test('a burned mark turns the page on its own clock', () => {
  const t = boot();
  try {
    const cover = ensureCoverState(t.state);
    cover.suspicion['faction_reach'] = { score: 10, stage: 3, lastAt: 0, nextCheckAt: 1e9, nextFineAt: 0 };
    cover.burned['faction_reach'] = { until: t.state.simTime + 1, filedAt: t.state.simTime, by: 'checks' };
    const cooled = [];
    t.bus.on('pirateDisguise:coverCooled', (p) => cooled.push(p));
    t.sim.runTicks(tick(2));
    assert.equal(cooled.length, 1, 'the page turns once');
    assert.equal(cover.burned['faction_reach'], undefined);
    assert.equal(cover.suspicion['faction_reach'].stage, 0, 'the file resets for the next chapter');
    assert.ok(cover.log.some((r) => r.kind === 'page_turned'));
  } finally {
    t.sim.dispose();
  }
});

// ── Bargains ─────────────────────────────────────────────────────────────────

test('the berth fixer prices the work; a taken bargain charges once and restores', () => {
  const t = boot();
  try {
    deliverAccess(t.state);
    const sys = t.sim.registry.get('pirateDisguise');
    const cover = ensureCoverState(t.state);
    cover.quality = 50;
    cover.suspicion['faction_reach'] = { score: 40, stage: 0, lastAt: 0, nextCheckAt: 0, nextFineAt: 0 };
    const offered = [], taken = [];
    t.bus.on('pirateDisguise:bargainOffered', (p) => offered.push(p));
    t.bus.on('pirateDisguise:bargain', (p) => taken.push(p));

    t.bus.emit('dock:docked', { stationId: OUTLAW });
    assert.ok(offered.length >= 2, 'the fixer posts papers and a record burn for a hot book');
    const papers = cover.offers.find((o) => o.kind === 'new_papers' && o.state === 'open');
    assert.ok(papers, 'new papers are on the board');
    const burn = cover.offers.find((o) => o.kind === 'burn_record' && o.state === 'open');
    assert.ok(burn && burn.factionId === 'faction_reach', 'the hottest file is the offer');

    const credits0 = t.state.player.credits;
    const receipt = sys.takeBargain(t.state, papers.id);
    assert.ok(receipt && receipt.accepted === true);
    assert.equal(charged(t.events, 'cover_bargain:').length, 1, 'the charge lands once');
    assert.equal(t.state.player.credits, credits0 - papers.costCr);
    assert.ok(cover.quality > 50, 'new papers read cleaner');
    assert.equal(papers.state, 'taken');
    assert.equal(taken.filter((r) => r.accepted).length, 1);

    // A replayed take is refused — the latch outlives the click.
    assert.equal(sys.takeBargain(t.state, papers.id), null);
    assert.equal(charged(t.events, 'cover_bargain:').length, 1);
  } finally {
    t.sim.dispose();
  }
});

test('a taken bargain stays taken through a save round-trip; undock closes the window', () => {
  const t = boot();
  try {
    deliverAccess(t.state);
    const sys = t.sim.registry.get('pirateDisguise');
    const cover = ensureCoverState(t.state);
    cover.quality = 40;
    t.bus.emit('dock:docked', { stationId: OUTLAW });
    const offer = cover.offers.find((o) => o.state === 'open');
    assert.ok(offer, 'the fixer posted for the frayed cover');
    assert.ok(sys.takeBargain(t.state, offer.id).accepted);

    t.state.player.pirateCover = JSON.parse(JSON.stringify(t.state.player.pirateCover));
    const cover2 = ensureCoverState(t.state);
    assert.equal(cover2.offers.find((o) => o.id === offer.id).state, 'taken', 'the stamp serializes');
    assert.equal(sys.takeBargain(t.state, offer.id), null, 'the restored latch refuses the replay');
    assert.equal(charged(t.events, 'cover_bargain:').length, 1, 'still only one charge');
    assert.ok(cover2.paid.includes(offer.id), 'the paid stamp rides the save');

    // Leaving the berth closes the window after a short grace.
    const open = sys.offerCoverBargain(t.state, { kind: 'new_papers', stationId: OUTLAW, costCr: 100 });
    t.bus.emit('dock:undocked', {});
    assert.ok(open.expiresAt <= t.state.simTime + COVER_BARGAIN.undockGraceS + 0.001);
    t.sim.runTicks(tick(COVER_BARGAIN.undockGraceS + 1));
    assert.equal(open.state, 'expired', 'the fixer does not wait forever');
  } finally {
    t.sim.dispose();
  }
});

test('hush_witness closes live files and strips the tags off the bodies', () => {
  const t = boot();
  try {
    const sys = t.sim.registry.get('pirateDisguise');
    disguisedPirate(t.sim, 80, 0);
    const w1 = witnessShip(t.sim, 300, 0, 'faction_scn');
    const w2 = witnessShip(t.sim, 320, 0, 'faction_free');
    t.bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq: 1, source: 'player-scanner' });
    const cover = ensureCoverState(t.state);
    assert.equal(cover.witnesses.filter((r) => !r.closed).length, 2, 'two mouths carry the tale');

    const offer = sys.offerCoverBargain(t.state, {
      kind: 'hush_witness', stationId: OUTLAW, factionId: 'faction_quiet', costCr: 50, qty: 4,
    });
    const receipt = sys.takeBargain(t.state, offer.id);
    assert.equal(receipt.accepted, true);
    assert.equal(receipt.effect.hushed, 2, 'both open files close');
    assert.equal(cover.witnesses.filter((r) => !r.closed).length, 0);
    assert.equal(Object.keys(w1.data.coverWitness).length, 0, 'the tag strips off the hull');
    assert.equal(Object.keys(w2.data.coverWitness).length, 0);
  } finally {
    t.sim.dispose();
  }
});

// ── The wash still answers ───────────────────────────────────────────────────

test('burned Quiet papers cost flagged prices at the wash; a paid wash repairs the cover', () => {
  const t = boot();
  try {
    deliverAccess(t.state);
    const cover = ensureCoverState(t.state);
    cover.quality = 40;
    cover.burned['faction_quiet'] = { until: t.state.simTime + 300, filedAt: t.state.simTime, by: 'checks' };
    // The wash is the explicit per-pod service: dock at the den, ask the price, confirm one pod.
    t.sim.spawn({ type: 'station', pos: { x: 0, z: 0 }, radius: 20, data: { stationId: OUTLAW } });
    t.state.ui.docked = true;
    t.state.ui.dockedStationId = OUTLAW;
    hotPod(t);
    const base = launderCutCredits('cmdty_narcotics', 8, 0);
    const sys = t.sim.registry.get('pirateDisguise');
    const ask = { stationId: OUTLAW, contextId: 'ctx:flagged' };
    const quoted = sys.launderAtDock({ ...ask, requestId: 'req:quote', action: 'quote' });
    assert.equal(quoted.accepted, true);
    assert.equal(quoted.quotes.length, 1);
    assert.equal(quoted.quotes[0].flagged, true, 'the price shows the surcharge before any money moves');
    assert.equal(quoted.quotes[0].cut, Math.ceil(base * COVER_BURN.flaggedCutMult));
    assert.equal(charged(t.events, 'launder:').length, 0, 'asking the price charges nothing');
    const receipt = sys.launderAtDock({ ...ask, requestId: 'req:confirm', action: 'confirm', quoteId: quoted.quotes[0].quoteId });
    assert.equal(receipt.accepted, true);
    assert.equal(charged(t.events, 'launder:').length, 1, 'the cut is charged once');
    assert.equal(receipt.flagged, true);
    assert.equal(receipt.cut, Math.ceil(base * COVER_BURN.flaggedCutMult), 'flagged paper pays the surcharge');
    assert.equal(receipt.coverRestored, COVER_QUALITY.launderRestore);
    assert.equal(cover.quality, 40 + COVER_QUALITY.launderRestore, 'fresh paper reads fresh');
  } finally {
    t.sim.dispose();
  }
});

// ── Save-safety and board reads ──────────────────────────────────────────────

test('the book survives a save round-trip: rows, stamps and scores hold', () => {
  const t = boot();
  try {
    disguisedPirate(t.sim, 80, 0);
    witnessShip(t.sim, 300, 0, 'faction_scn');
    t.bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, seq: 1, source: 'player-scanner' });
    const before = coverBoard(t.state);
    t.state.player.pirateCover = JSON.parse(JSON.stringify(t.state.player.pirateCover));
    const after = coverBoard(t.state);
    assert.equal(after.quality, before.quality);
    assert.equal(after.openWitnesses, before.openWitnesses);
    assert.deepEqual(after.suspicion, before.suspicion);
    assert.deepEqual(after.offers, before.offers);
    assert.equal(after.log.length, before.log.length);
    // The snapshot is a copy — mutating it never reaches the ledger.
    after.witnesses.push({ bogus: true });
    assert.equal(coverBoard(t.state).openWitnesses, before.openWitnesses);
    const standing = coverStandingFor(t.state, 'faction_reach');
    assert.equal(standing.factionId, 'faction_reach');
    assert.ok(standing.score > 0);
    assert.equal(standing.burned, false);
  } finally {
    t.sim.dispose();
  }
});

test('malformed book rows drop on ensure and the ledger stays plain JSON', () => {
  const t = boot();
  try {
    t.state.player.pirateCover = {
      quality: 'hot',
      suspicion: { f: { score: 'x' }, '': { score: 1 }, good: 'no' },
      witnesses: [
        { bad: 1 },
        { id: 'w1', entityId: 9, kind: 'reveal' },
        { id: 'w2', stationId: 's', kind: 'seen_hot' },
      ],
      offers: [{ id: 'o1', kind: 'bogus' }, { id: 'o2', kind: 'new_papers', costCr: 'x' }],
      burned: { f1: 'x', f2: { until: 'z' }, f3: { until: 99 } },
      paid: [7, 'ok'],
      log: [null, { kind: 'k' }],
      seq: 'z',
    };
    const c = ensureCoverState(t.state);
    assert.equal(c.quality, COVER_QUALITY.max, 'junk quality reseats at clean');
    assert.deepEqual(Object.keys(c.suspicion), ['f'], 'nameless and non-object files drop');
    assert.equal(c.suspicion.f.score, 0, 'junk score clamps');
    assert.equal(c.witnesses.length, 2, 'half-formed rows drop, tagged rows keep');
    assert.equal(c.offers.length, 1, 'unknown kinds drop');
    assert.equal(c.offers[0].costCr, 0);
    assert.deepEqual(Object.keys(c.burned), ['f3'], 'unreadable marks drop');
    assert.deepEqual(c.paid, ['ok'], 'non-string stamps drop');
    assert.equal(c.log.length, 1);
    assert.equal(typeof c.seq, 'number');
    JSON.parse(JSON.stringify(c)); // the whole book is serializable
  } finally {
    t.sim.dispose();
  }
});
