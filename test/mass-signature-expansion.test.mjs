// EXP-25 — mass-signature expansion: the pilot is on the same glass.
// Covers: the player's own signature readout + tiers, the running-quiet verb, the
// painted-sweep contact, the pulse signature board (incl. the deep band and shadowed
// returns), heat hunters by kind, generation-guarded ledgers, and hostile/restore heals.
import assert from 'node:assert/strict';
import test from 'node:test';

import { massSignature } from '../src/systems/massSignature.js';
import {
  SWEEP_SCANNER_PROFILES, signatureOf, signatureRead, signatureTier,
  heatSeekerProfileFor, HEAT_COLD_COAST, HEAT_IDLE_DRIVE, HEAT_SEEKER_MIN,
} from '../src/data/massSignature.js';

function makeBus() {
  const events = [];
  const listeners = new Map();
  return {
    events,
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
    on(name, fn) {
      const arr = listeners.get(name) || [];
      arr.push(fn);
      listeners.set(name, arr);
      return () => { const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1); };
    },
  };
}

function makeState() {
  return {
    entities: new Map(), simTime: 0, tick: 0, mode: 'flight',
    playerId: null, player: null, input: {},
  };
}

function spawn(state, spec) {
  const e = {
    id: spec.id || `e${state.entities.size + 1}`,
    alive: true,
    pos: { x: spec.x || 0, z: spec.z || 0 },
    vel: spec.vel !== undefined ? spec.vel : { x: 0, z: 0 },
    mass: spec.mass || 0,
    radius: spec.radius || 4,
    type: spec.type || 'ship',
    data: spec.data || {},
    ...spec.extra,
  };
  state.entities.set(e.id, e);
  return e;
}

function spawnPlayer(state, spec = {}) {
  const e = spawn(state, {
    id: spec.id || 'player', x: spec.x || 0, z: spec.z || 0,
    mass: spec.mass ?? 20, vel: spec.vel, data: spec.data || {}, extra: spec.extra,
  });
  state.playerId = e.id;
  state.player = { cargo: spec.cargo || { items: {}, usedMass: 0 }, tether: { reeling: false } };
  return e;
}

function makeHarness() {
  const state = makeState();
  const bus = makeBus();
  const helpers = {};
  const sys = { ...massSignature };
  sys.init({ state, bus, helpers });
  return {
    state, bus, sys,
    tick(dt = 1 / 60, n = 1) {
      for (let i = 0; i < n; i++) { state.simTime += dt; state.tick += 1; sys.update(dt, state); }
    },
  };
}

const eventsNamed = (bus, name) => bus.events.filter((e) => e.name === name);

// ── the player's own signature ────────────────────────────────────────────────────────

test('the pilot reads their own signature — hull mass, hold mass, heat, tier', () => {
  const { state, bus, tick } = makeHarness();
  spawnPlayer(state, { mass: 20, cargo: { items: { cmdty_ore_iron: 50 }, usedMass: 40 } });
  tick(1 / 60, 1);
  const sig = state.massSignature.playerSignature;
  assert.ok(sig, 'playerSignature is published');
  assert.equal(sig.massT, 20, 'hull mass on the glass');
  assert.equal(sig.cargoT, 40, 'the hold reads on the same line');
  assert.ok(sig.heat >= HEAT_IDLE_DRIVE - 1e-9, 'an idle drive is warm');
  assert.equal(sig.tier, 'contact', 'a 20 t warm hull is a contact, not clutter');
  const ev = eventsNamed(bus, 'sensors:playerSignature');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].payload.tier, 'contact');
  assert.equal(ev[0].payload.prevTier, null);

  // Burning hard makes the same hull 'hot' — the tier edge fires once, on the flip.
  state.entities.get('player').vel = { x: 40, z: 0 };
  tick(1 / 60, 1);
  assert.equal(state.massSignature.playerSignature.tier, 'hot');
  assert.equal(eventsNamed(bus, 'sensors:playerSignature').length, 2);
  assert.equal(eventsNamed(bus, 'sensors:playerSignature')[1].payload.prevTier, 'contact');
  tick(1 / 60, 3);
  assert.equal(eventsNamed(bus, 'sensors:playerSignature').length, 2, 'no flap — edge-only');
});

test('signature tiers sort clutter < contact < hot < massive', () => {
  assert.equal(signatureTier({ massT: 8, heat: HEAT_COLD_COAST, strength: 0.2 }), 'clutter');
  assert.equal(signatureTier({ massT: 20, heat: HEAT_IDLE_DRIVE, strength: 0.74 }), 'contact');
  assert.equal(signatureTier({ massT: 20, heat: 0.95, strength: 1.4 }), 'hot');
  assert.equal(signatureTier({ massT: 900, heat: 0.06, strength: 18 }), 'massive');
});

// ── running quiet ───────────────────────────────────────────────────────────────────

test('sitting on no thrust idles the drive cold; any burn relights it', () => {
  const { state, bus, tick } = makeHarness();
  const player = spawnPlayer(state, { mass: 18, vel: { x: 25, z: 0 } }); // drifting fast
  state.input = { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false };
  tick(1 / 60, 30); // 0.5 s — still on the burn clock
  assert.notEqual(player.data.quietCoast, true, 'a fresh drift is still warm');
  tick(1 / 60, 160); // ~3.2 s total without a burn
  assert.equal(player.data.quietCoast, true, 'the drive idled cold');
  assert.ok(eventsNamed(bus, 'sensors:quietCoast').some((e) => e.payload.cold === true));
  assert.equal(signatureOf(player).heat, HEAT_COLD_COAST, 'the model reads it cold');
  assert.equal(state.massSignature.playerSignature.tier, 'clutter',
    'an 18 t hull on a cold drive reads as rock clutter — the quiet verb hides it');

  state.input = { moveX: 0, moveZ: 0.8, turnIntent: 0 }; // burn resumes
  tick(1 / 60, 1);
  assert.equal(player.data.quietCoast, false, 'the burn relights instantly');
  assert.ok(eventsNamed(bus, 'sensors:quietCoast').some((e) => e.payload.cold === false));
  assert.equal(signatureOf(player).heat, 0.95, 'thrusting heat is back');
});

test('reeling the Line keeps the hull loud', () => {
  const { state, tick } = makeHarness();
  const player = spawnPlayer(state, { mass: 18 });
  state.input = {};
  state.player.tether.reeling = true;
  tick(1 / 60, 240); // 4 s — well past the spin-down
  assert.notEqual(player.data.quietCoast, true, 'the winch hums — no cold coast');
});

test('quiet coast needs a live input contract — headless states never go cold by default', () => {
  const { state, tick } = makeHarness();
  const player = spawnPlayer(state, { mass: 18 });
  state.input = undefined;
  tick(1 / 60, 300);
  assert.notEqual(player.data.quietCoast, true);
});

// ── painted by the ring ──────────────────────────────────────────────────────────────

test('a sweep painting the pilot posts a countdown they can beat', () => {
  const { state, bus, tick } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, radius: 40, data: { massScanner: 'scale_barge', scanLabel: 'SCALE BARGE — WEIGHING' } });
  spawnPlayer(state, { x: 300, z: 0, mass: 55 });
  state.input = { moveZ: 0.5 }; // burning — loud

  tick(1 / 60, 10);
  const contact = state.massSignature.playerContact;
  assert.equal(contact.litScannerId, 'barge');
  assert.equal(contact.scannerLabel, 'SCALE BARGE — WEIGHING');
  assert.ok(contact.litS > 0 && contact.litS < contact.dwellS, 'dwell is banking');
  assert.equal(contact.dwellS, SWEEP_SCANNER_PROFILES.scale_barge.dwellS);
  assert.ok(eventsNamed(bus, 'sensors:playerLit').some((e) => e.payload.scannerId === 'barge'));
  assert.ok(eventsNamed(bus, 'comms:log').some((e) => e.payload.from === 'SCALE BARGE — WEIGHING'),
    'the painted warning reaches the feed');

  // The edge dwells to a name — the contact reports the resolution.
  tick(1 / 60, Math.ceil(1.5 * 60) + 8);
  assert.equal(state.massSignature.playerContact.resolvedBy, 'barge');
  assert.ok(eventsNamed(bus, 'sensors:signatureResolved').some((e) => e.payload.targetId === 'player'));
});

test('a mass shadow covering the pilot unwinds the dwell and reports the cover', () => {
  const { state, bus, tick } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  spawn(state, { id: 'bigrock', x: 200, z: 0, mass: 5000, radius: 60, type: 'asteroid' });
  spawnPlayer(state, { x: 320, z: 0, mass: 55 }); // behind the rock from the barge
  state.input = { moveZ: 0.5 };
  tick(1 / 60, 30);
  const contact = state.massSignature.playerContact;
  assert.equal(contact.litScannerId, null, 'the shadow keeps the edge off');
  assert.deepEqual(contact.shadowedBy, { scannerId: 'barge', occludedBy: 'bigrock' },
    'the pilot can see which rock is covering them');
  assert.equal(eventsNamed(bus, 'sensors:signatureResolved').length, 0);
});

test('breaking the ring mid-dwell unwinds the paint (sensors:playerUnlit)', () => {
  const { state, bus, tick } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  const player = spawnPlayer(state, { x: 300, z: 0, mass: 55 });
  state.input = { moveZ: 0.5 };
  tick(1 / 60, 20);
  assert.ok(state.massSignature.playerContact.litS > 0);
  player.pos.x = 5000; // bolt out of the ring before the edge finishes
  tick(1 / 60, 1);
  assert.equal(state.massSignature.playerContact, null, 'unpainted and unresolved');
  assert.ok(eventsNamed(bus, 'sensors:playerUnlit').some((e) => e.payload.scannerId === 'barge'));
});

// ── the pulse signature board ────────────────────────────────────────────────────────

test('the player pulse writes a signature board — loudest first, stamps the hulls', () => {
  const { state, bus, sys } = makeHarness();
  spawnPlayer(state, { x: 0, z: 0, mass: 20 });
  const heavy = spawn(state, { id: 'heavy', x: 500, z: 0, mass: 400, radius: 20 });
  const mule = spawn(state, { id: 'mule', x: 300, z: 0, mass: 55 });
  mule.vel = { x: 30, z: 0 }; // burning — hot
  spawn(state, { id: 'ghost', x: 250, z: 0, mass: 60, data: { isGhost: true } });
  spawn(state, { id: 'pebble', x: 100, z: 0, mass: 2, data: { coldCoast: true } });

  bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, radius: 1200, source: 'player-scanner', scannerId: 'player' });
  void sys;
  const report = state.massSignature.playerReport;
  assert.ok(report, 'the board is published');
  assert.equal(report.contacts.length, 2, 'ghost phantoms are not honest signatures');
  assert.equal(report.contacts[0].id, 'heavy', 'loudest first');
  assert.equal(report.contacts[0].tier, 'massive');
  assert.equal(report.contacts[1].id, 'mule');
  assert.equal(report.contacts[1].tier, 'hot');
  assert.equal(report.clutter, 1, 'the cold pebble counts as faint clutter');
  assert.equal(heavy.data.massSignature.resolvedBy, 'player', 'the pulse names what it read');
  assert.equal(mule.data.massSignature.profile, 'player_pulse');
  assert.ok(eventsNamed(bus, 'sensors:signatureReport').length === 1);
  assert.ok(eventsNamed(bus, 'comms:log').some((e) => /Signature board/.test(e.payload.text)));
});

test('the deep band: a massive hull reports past the ring; an ordinary one does not', () => {
  const { state } = makeHarness();
  spawnPlayer(state, { x: 0, z: 0, mass: 20 });
  spawn(state, { id: 'capital', x: 1500, z: 0, mass: 900, radius: 30 }); // 1.25x ring, inside deep band
  spawn(state, { id: 'fighter', x: 1500, z: 10, mass: 30 });             // same range, too quiet
  const { bus } = makeHarness.__proto__ ? {} : {};
  void bus;
  const read = signatureRead(
    { id: 'player_pulse', ringRadius: 1200, readsMass: true, readsHeat: true, deepStrengthMin: 6, deepRangeMult: 1.6 },
    { x: 0, z: 0 }, state.entities.get('capital'), [],
  );
  assert.equal(read.detected, true, 'a capital signature carries past the ring');
  assert.equal(read.deep, true);
  const read2 = signatureRead(
    { id: 'player_pulse', ringRadius: 1200, readsMass: true, readsHeat: true, deepStrengthMin: 6, deepRangeMult: 1.6 },
    { x: 0, z: 0 }, state.entities.get('fighter'), [],
  );
  assert.equal(read2.detected, false, 'a fighter at the same range stays unread');

  // Profiles without a declared band — the scale — never reach past the ring.
  const bargeRead = signatureRead(
    SWEEP_SCANNER_PROFILES.scale_barge, { x: 0, z: 0 },
    { id: 'far_hulk', pos: { x: 700, z: 0 }, mass: 900, data: {} }, [],
  );
  assert.equal(bargeRead.detected, false, 'the scale is ring-bound — the Weighing math is unchanged');
});

test('the board marks returns lost in mass shadow — the honest something-is-back-there', () => {
  const { state, bus } = makeHarness();
  spawnPlayer(state, { x: 0, z: 0, mass: 20 });
  spawn(state, { id: 'bigrock', x: 200, z: 0, mass: 5000, radius: 60, type: 'asteroid' });
  spawn(state, { id: 'hider', x: 320, z: 0, mass: 80 });
  bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, radius: 1200, source: 'player-scanner', scannerId: 'player' });
  const report = state.massSignature.playerReport;
  assert.equal(report.contacts.length, 1, 'the rock itself is the only named signature');
  assert.equal(report.contacts[0].id, 'bigrock');
  assert.equal(report.shadowed.length, 1);
  assert.equal(report.shadowed[0].id, 'hider');
  assert.equal(report.shadowed[0].occludedBy, 'bigrock');
});

test('hostile pulses are refused; foreign pulses never write the board', () => {
  const { state, bus } = makeHarness();
  spawnPlayer(state, { x: 0, z: 0, mass: 20 });
  spawn(state, { id: 'mule', x: 300, z: 0, mass: 55 });
  bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, radius: 1200 });                       // no source
  bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, radius: 1200, source: 'drill' });      // wrong source
  bus.emit('scan:pulse', { pos: null, radius: 1200, source: 'player-scanner' });       // no origin
  bus.emit('scan:pulse', { pos: { x: NaN, z: 0 }, radius: 1200, source: 'player-scanner' });
  assert.equal(state.massSignature.playerReport, null, 'none of them wrote a board');
  // A hostile radius clamps into the sane band instead of crawling the whole sector.
  bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, radius: 1e9, source: 'player-scanner' });
  assert.equal(state.massSignature.playerReport.radius, 6000);
});

// ── hunters by signature ─────────────────────────────────────────────────────────────

test('a fauna lantern cyst hunts heat without a stamp — kind, not paperwork', () => {
  const { state, bus, tick } = makeHarness();
  const cyst = spawn(state, {
    id: 'cyst', x: 0, z: 0, mass: 5, type: 'fauna',
    data: { ecology: { speciesId: 'lantern_cyst' }, scanLabel: 'LANTERN CYST' },
  });
  const hot = spawn(state, { id: 'hot_hull', x: 300, z: 0, mass: 55, vel: { x: 40, z: 0 } });
  assert.equal(heatSeekerProfileFor(cyst).id, 'lantern_cyst');
  tick(1 / 60, 1);
  assert.equal(cyst.data.ai.heatTargetId, 'hot_hull', 'the cyst drift-locks the hot hull');
  assert.equal(state.massSignature.heatLocks.cyst, 'hot_hull');
  assert.ok(eventsNamed(bus, 'sensors:heatLock').some((e) => e.payload.targetId === 'hot_hull'));

  hot.data.coldCoast = true; // the hull cuts its drive
  tick(1 / 60, 1);
  assert.equal(cyst.data.ai.heatTargetId, null, 'a cold hull is not a heat to hunt');
});

test('a furnace-maw archetype hunts with the maw profile', () => {
  const { state, tick } = makeHarness();
  const maw = spawn(state, { id: 'maw', x: 0, z: 0, mass: 560, data: { archetype: 'furnace_maw' } });
  const hot = spawn(state, { id: 'hot_hull', x: 1100, z: 0, mass: 55, vel: { x: 40, z: 0 } });
  assert.equal(heatSeekerProfileFor(maw).id, 'furnace_maw');
  tick(1 / 60, 1);
  assert.equal(maw.data.ai.heatTargetId, 'hot_hull', 'the maw picks at 1100 wu — past a cyst ring');
});

test('a hunter on the pilot warns once per window; running cold drops the lock', () => {
  const { state, bus, tick } = makeHarness();
  const player = spawnPlayer(state, { x: 400, z: 0, mass: 18, vel: { x: 30, z: 0 } });
  spawn(state, {
    id: 'cyst', x: 0, z: 0, mass: 5, type: 'fauna',
    data: { ecology: { speciesId: 'lantern_cyst' }, scanLabel: 'LANTERN CYST' },
  });
  state.input = { moveZ: 0.4 };
  tick(1 / 60, 1);
  assert.equal(state.massSignature.playerHunted.seekerIds[0], 'cyst');
  const warns = eventsNamed(bus, 'comms:log').filter((e) => /tracking your heat/.test(e.payload.text));
  assert.equal(warns.length, 1);
  tick(1 / 60, 400); // ~6.7 s: the lock persists under the warn window, no second line
  assert.equal(eventsNamed(bus, 'comms:log').filter((e) => /tracking your heat/.test(e.payload.text)).length, 1);

  state.input = {}; // hands off — the drive idles cold inside 3 s
  tick(1 / 60, 200);
  assert.equal(player.data.quietCoast, true);
  assert.equal(signatureOf(player).heat, HEAT_COLD_COAST);
  assert.ok(signatureOf(player).heat < HEAT_SEEKER_MIN, 'below what a hunter can fix');
  assert.equal(state.massSignature.playerHunted, null, 'the cyst lost the pilot’s heat');
});

// ── generation guards ────────────────────────────────────────────────────────────────

test('a recycled entity id never inherits the dead hull’s resolution', () => {
  const { state, tick } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  const first = spawn(state, { id: 'hull', x: 300, z: 0, mass: 55 });
  first.occupantGeneration = 3;
  tick(1 / 60, Math.ceil(1.5 * 60) + 6);
  assert.equal(state.massSignature.scans.barge.reads.hull.resolved, true);

  // The hull dies; a new body recycles the id with a new generation.
  state.entities.delete('hull');
  const second = spawn(state, { id: 'hull', x: 300, z: 0, mass: 55 });
  second.occupantGeneration = 4;
  tick(1 / 60, 1);
  const row = state.massSignature.scans.barge.reads.hull;
  assert.equal(row.resolved, false, 'the new occupant banks its own dwell');
  assert.equal(row.gen, 4);
});

test('a recycled lock target re-fires heatLock — the new hull is a new fix', () => {
  const { state, bus, tick } = makeHarness();
  spawn(state, { id: 'cyst', x: 0, z: 0, mass: 5, data: { heatSeeker: true } });
  const first = spawn(state, { id: 'hull', x: 300, z: 0, mass: 55, vel: { x: 40, z: 0 } });
  first.occupantGeneration = 1;
  tick(1 / 60, 1);
  assert.equal(eventsNamed(bus, 'sensors:heatLock').length, 1);

  state.entities.delete('hull');
  const second = spawn(state, { id: 'hull', x: 300, z: 0, mass: 55, vel: { x: 40, z: 0 } });
  second.occupantGeneration = 2;
  tick(1 / 60, 1);
  assert.equal(eventsNamed(bus, 'sensors:heatLock').length, 2, 'the recycled id re-locks and re-fires');
});

// ── hostile state, restore, re-entrancy ──────────────────────────────────────────────

test('hostile ledgers heal to bounded values — no wedge, no instant resolve storm', () => {
  const { state, tick } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  spawnPlayer(state, { x: 300, z: 0, mass: 55 });
  state.input = { moveZ: 0.5 };
  state.massSignature = {
    scans: { barge: { reads: { player: { detected: true, resolved: false, t: -1e9 } }, litS: { player: 1e9 } } },
    heatLocks: 'corrupted',
    playerQuietS: -44,
    playerContact: 'junk',
    playerReport: 42,
    playerHunted: [],
  };
  tick(1 / 60, 1);
  const sig = state.massSignature;
  assert.equal(typeof sig.heatLocks, 'object', 'corrupted map heals');
  assert.equal(sig.playerQuietS, 0, 'negative quiet clock heals to zero');
  assert.equal(sig.playerContact === null || typeof sig.playerContact === 'object', true);
  assert.equal(typeof sig.playerReport === 'object' || sig.playerReport === null, true, 'junk report heals');
  // The banked 1e9 s dwell clamps and resolves — once — instead of wedging.
  const row = sig.scans.barge.reads.player;
  assert.equal(row.resolved, true, 'a hostile dwell resolves, bounded');
  assert.ok(sig.scans.barge.litS.player <= 30 + 1 / 60, 'dwell is capped');
});

test('a swollen scanner ledger is evicted oldest-first, resolved rows last', () => {
  const { state, tick } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  const reads = {}; const litS = {};
  for (let i = 0; i < 140; i++) {
    reads[`dead_${i}`] = { detected: false, resolved: i < 40, t: i };
    litS[`dead_${i}`] = 0;
  }
  state.massSignature = { scans: { barge: { reads, litS } }, heatLocks: {} };
  tick(1 / 60, 1);
  const live = Object.keys(state.massSignature.scans.barge.reads);
  assert.ok(live.length <= 96, `bounded to 96 (got ${live.length})`);
  assert.ok(state.massSignature.scans.barge.reads.dead_0, 'the oldest resolved row is kept');
});

test('save:restoring drops dwell, boards and locks — nothing lands inside its own window', () => {
  const { state, bus, tick } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  spawnPlayer(state, { x: 300, z: 0, mass: 55 });
  state.input = { moveZ: 0.5 };
  tick(1 / 60, 72); // bank 1.2 s of the 1.5 s dwell — painted but not yet named
  bus.emit('scan:pulse', { pos: { x: 300, z: 0 }, radius: 1200, source: 'player-scanner' });
  spawn(state, { id: 'cyst', x: 0, z: 0, mass: 5, data: { heatSeeker: true } });
  tick(1 / 60, 1);
  assert.ok(state.massSignature.scans.barge.litS.player > 1, 'dwell was banked');
  assert.ok(state.massSignature.playerReport, 'a board existed');

  bus.emit('save:restoring', {});
  const sig = state.massSignature;
  assert.equal(sig.scans.barge.litS.player, 0, 'dwell timers heal empty');
  assert.equal(sig.playerReport, null);
  assert.equal(sig.playerContact, null);
  assert.equal(sig.playerHunted, null);
  assert.deepEqual(sig.heatLocks, {}, 'locks do not ghost a reseated world');
});

test('resolved receipts survive restore — only the dwell clock heals', () => {
  const { state, bus, tick } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  const mule = spawn(state, { id: 'mule', x: 300, z: 0, mass: 55 });
  tick(1 / 60, Math.ceil(1.5 * 60) + 6);
  assert.equal(state.massSignature.scans.barge.reads.mule.resolved, true);
  bus.emit('save:restoring', {});
  assert.equal(state.massSignature.scans.barge.reads.mule.resolved, true,
    'a learned signature stays learned');
  assert.equal(state.massSignature.scans.barge.litS.mule, 30,
    'a resolved row re-arms fully banked — the rewind cannot un-name it');
  // And it does not re-fire the resolve event when the edge re-banks.
  const before = eventsNamed(bus, 'sensors:signatureResolved').length;
  tick(1 / 60, Math.ceil(1.5 * 60) + 6);
  const after = eventsNamed(bus, 'sensors:signatureResolved').length;
  assert.equal(after, before, 'no re-resolve storm after the rewind');
});

test('listeners re-entering mid-emit see the write already committed', () => {
  const { state, bus, tick } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  const mule = spawn(state, { id: 'mule', x: 300, z: 0, mass: 55 });
  const seen = [];
  bus.on('sensors:signatureResolved', (p) => {
    seen.push({
      rowResolved: state.massSignature.scans[p.scannerId].reads[p.targetId].resolved,
      stampBy: state.entities.get(p.targetId).data.massSignature.resolvedBy,
    });
  });
  bus.on('sensors:signatureReport', () => {
    seen.push({ reportContacts: state.massSignature.playerReport.contacts.length });
  });
  tick(1 / 60, Math.ceil(1.5 * 60) + 6);
  assert.deepEqual(seen[0], { rowResolved: true, stampBy: 'barge' },
    'the row and the stamp are committed before the event speaks');
  void mule;

  spawnPlayer(state, { x: 0, z: 0, mass: 20 });
  bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, radius: 1200, source: 'player-scanner' });
  assert.equal(seen[1].reportContacts >= 2, true, 'the board is populated before the event fires');
});

test('newGame clears the pilot-facing runtime', () => {
  const { state, sys, tick } = makeHarness();
  spawnPlayer(state, { x: 0, z: 0, mass: 20 });
  state.input = {};
  tick(1 / 60, 200);
  assert.ok(state.massSignature.playerQuietS > 0);
  sys.newGame();
  assert.equal(state.massSignature.playerQuietS, 0);
  assert.equal(state.massSignature.playerReport, null);
});

test('a playerUnlit listener sees the committed contact, not the stale lit stamp', () => {
  const { state, bus, tick } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  const player = spawnPlayer(state, { x: 300, z: 0, mass: 55 });
  state.input = { moveZ: 0.5 };
  tick(1 / 60, 20);
  let seen;
  bus.on('sensors:playerUnlit', () => { seen = state.massSignature.playerContact; });
  player.pos.x = 9000;
  tick(1 / 60, 1);
  assert.ok(seen === null || seen.litScannerId === null,
    'the contact was already unlit when the event spoke');
});

test('game:new over the bus heals the runtime — the boot path is wired', () => {
  const { state, bus, tick } = makeHarness();
  spawnPlayer(state, { x: 0, z: 0, mass: 20 });
  state.input = {};
  tick(1 / 60, 200);
  assert.ok(state.massSignature.playerQuietS > 0);
  bus.emit('game:new', {});
  assert.equal(state.massSignature.playerQuietS, 0, 'newGame ran off the bus event');
  bus.emit('game:newGame', {});
  assert.equal(state.massSignature.playerQuietS, 0, 'the legacy alias works too');
});

test('a malformed scan row cannot kill the tick — hostile shapes normalize', () => {
  const { state, tick } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  spawn(state, { id: 'mule', x: 300, z: 0, mass: 55 });
  state.massSignature = { scans: { barge: 'junk' }, heatLocks: {} };
  tick(1 / 60, 1); // must not throw
  assert.equal(typeof state.massSignature.scans.barge.reads, 'object');
  assert.ok(state.massSignature.scans.barge.reads.mule, 'the read landed after healing');
  // Half-broken shape: reads object present, litS a string.
  state.massSignature.scans.barge = { reads: {}, litS: 'nope' };
  tick(1 / 60, 1);
  assert.equal(typeof state.massSignature.scans.barge.litS, 'object');
});

test('restore clears the quietCoast stamp — a reseat cannot inherit "engine cold"', () => {
  const { state, bus, tick } = makeHarness();
  const player = spawnPlayer(state, { x: 0, z: 0, mass: 18 });
  state.input = {};
  tick(1 / 60, 200);
  assert.equal(player.data.quietCoast, true);
  bus.emit('save:restoring', {});
  assert.equal(player.data.quietCoast, false, 'the cold-drive stamp is runtime truth');
  assert.equal(state.massSignature.playerQuietS, 0);
});

test('a divergent heatLocks ledger converges to the live pick', () => {
  const { state, tick } = makeHarness();
  spawn(state, { id: 'cyst', x: 0, z: 0, mass: 5, data: { heatSeeker: true } });
  spawn(state, { id: 'hull', x: 300, z: 0, mass: 55, vel: { x: 40, z: 0 } });
  state.massSignature = { scans: {}, heatLocks: { cyst: 'bogus_id' } };
  tick(1 / 60, 1);
  assert.equal(state.massSignature.heatLocks.cyst, 'hull',
    'the serializable row tracks the real fix, not stale save junk');
  tick(1 / 60, 1);
  assert.equal(state.massSignature.heatLocks.cyst, 'hull', 'and stays converged');
});

test('destroy detaches the subscriptions', () => {
  const { state, bus, sys, tick } = makeHarness();
  spawnPlayer(state, { x: 0, z: 0, mass: 20 });
  spawn(state, { id: 'mule', x: 300, z: 0, mass: 55 });
  sys.destroy();
  bus.emit('scan:pulse', { pos: { x: 0, z: 0 }, radius: 1200, source: 'player-scanner' });
  assert.equal(state.massSignature.playerReport, null, 'no board after destroy');
  tick(1 / 60, 1); // the tick itself still works — subscriptions were the live seam
});
