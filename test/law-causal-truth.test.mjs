// THE LAW SEES WHAT ACTUALLY HAPPENED — causal-truth contracts for law/heat/factions.
//
// The design contract under test — six pinned outcomes:
//
//   * Cause is a legal fact: a WITNESSED terrain slam prices as reckless_kill (below WANTED on
//     its own) while the same scene with a gunshot prices as murder (WANTED) — same seed, same
//     witnesses, materially different outcome.
//   * One witness truth: factions act on the law's adjudicated verdict (`law:killedAdjudicated`),
//     not a second witness query — a faction-mate watching does not move standing when the law
//     could not see, and lawful eyes move standing even with no faction member present. With no
//     verdict and no spatial query the rep listener fails CLOSED.
//   * A hated faction's combat hulls attack on sight; its haulers, team-2 civilians, passive and
//     unarmed hulls never do — the hostility gate stays armed-capable and fails closed.
//   * A WANTED player in high-security space eventually meets a lawful patrol: deterministic,
//     delayed, spawn-distance-bounded; clearing heat releases the warrant hunter.
//   * The ledgers connect: paying the bounty visibly cools heat, and unpaid debt escalates into
//     posted bounty once stale — one levy per day, never twice.
//   * An unwitnessed kill is a pending case, not a free murder: resolving the wreck's black box
//     (scan pulse or finished salvage) convicts through provenance — once, deduplicated.
//   * Reckless prices off the SAME class-scaled murder table at a fixed fraction — a ram can never
//     out-price a shot at any victim class (fighter and hauler pinned).
//   * A witnessed kill the law CLEARS (truth.kind === null) pays no standing — the blameless-none
//     tier; only a charge the law actually issued moves reputation.
//   * The pending-case docket + priced-incident ledger ride the save: an unwitnessed kill still
//     convicts from the wreck after a save/load boundary — once, never twice.
//   * Pending cases key on STABLE victim identity, never the bare runtime id — a recycled entity
//     id cannot cross-charge an unrelated wreck; the kill tick is the recycling disambiguator.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { heat, THRESHOLD as WANTED_THRESHOLD } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { factions } from '../src/systems/factions.js';
import { economy } from '../src/systems/economy.js';
import { scanner, isHostileToPlayer } from '../src/systems/scanner.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';

const SEED = 43117;
const SECTOR = 'sector_tethys_junction';

function boot(systems, { security = 0.9, sectorId = SECTOR } = {}) {
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[sectorId] = { id: sectorId, factionId: 'faction_scn', security, tier: 0 };
  state.player.heat = 0;
  state.player.credits = 5000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 250, z: 10 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;

  const lawResponses = [];
  const receipts = [];
  bus.on('law:response', (p) => lawResponses.push(p));
  bus.on('law:reportIncidentReceipt', (p) => receipts.push(p));
  return { sim, state, bus, player, lawResponses, receipts };
}

function lawfulWitness(run, pos = { x: 120, z: 0 }) {
  return run.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: pos.x, z: pos.z }, hull: 80, hullMax: 80, radius: 8,
    data: { ai: { lawful: true } },
  });
}

function civilianVictim(run, pos = { x: 80, z: 0 }, factionId = 'faction_free') {
  return run.sim.spawn({
    type: 'ship', team: 2, factionId,
    pos: { x: pos.x, z: pos.z }, hull: 40, hullMax: 40, radius: 8,
    data: { shipClass: 'hauler', ai: { archetype: 'fleeing_trader' } },
  });
}

function classedVictim(run, pos, victimClass, factionId = 'faction_free') {
  return run.sim.spawn({
    type: 'ship', team: 2, factionId,
    pos: { x: pos.x, z: pos.z }, hull: 40, hullMax: 40, radius: 8,
    data: { shipClass: victimClass, ai: { archetype: 'fleeing_trader' } },
  });
}

function makeSaveHarness(sim) {
  // Mirrors the capital-boss round-trip harness: the real save definition bound to a sim's
  // state/bus/registry — the same seam the Continue path runs through.
  const save = Object.create(saveDefinition);
  save.state = sim.state;
  save.bus = sim.bus;
  save.registry = { get: (name) => sim.registry.get(name) || null };
  save.helpers = sim.helpers;
  save._restoring = false;
  save._pendingRunTransition = null;
  save._restoreSequence = 0;
  save._rollbackCaptureActive = false;
  save._rollbackInProgress = false;
  return save;
}

function killPayload(run, victim, overrides = {}) {
  return {
    id: victim.id,
    killerId: run.state.playerId,
    type: 'ship',
    pos: { x: victim.pos.x, z: victim.pos.z },
    victimClass: 'hauler',
    factionId: victim.factionId || 'faction_free',
    factionLawful: false,
    targetHostileToPlayer: false,
    ...overrides,
  };
}

const KINETIC = { cause: 'kinetic', surface: null, playerCaused: true };
const TERRAIN_SLAM = { cause: 'terrain_collision', surface: 'terrain', playerCaused: true };

// ── 1. Collision kill vs gunshot: same witnesses, different law ─────────────────────────────

test('a witnessed terrain slam is reckless endangerment, not murder — and prices below a shot', () => {
  // Control leg: the same scene, a shot victim.
  const shot = boot([lawSecurity, heat]);
  const shotVictim = civilianVictim(shot, { x: 80, z: 0 });
  lawfulWitness(shot, { x: 140, z: 0 });
  shot.bus.emit('entity:killed', killPayload(shot, shotVictim, { presentation: KINETIC }));
  assert.equal(shot.receipts.length, 1);
  assert.equal(shot.receipts[0].kind, 'unlawful_kill');
  assert.equal(shot.receipts[0].killCause, 'kinetic');
  assert.ok(shot.state.player.heat >= WANTED_THRESHOLD,
    `witnessed shooting must cross WANTED (${shot.state.player.heat})`);
  shot.sim.dispose();

  // Same seed, same witnesses — the victim hit a rock instead of a bullet.
  const slam = boot([lawSecurity, heat]);
  const slamVictim = civilianVictim(slam, { x: 80, z: 0 });
  lawfulWitness(slam, { x: 140, z: 0 });
  slam.bus.emit('entity:killed', killPayload(slam, slamVictim, { presentation: TERRAIN_SLAM }));

  assert.equal(slam.receipts.length, 1, 'a witnessed death still signs a receipt');
  assert.equal(slam.receipts[0].kind, 'reckless_kill',
    'a slammed hull is reckless endangerment on the law\'s ledger, not murder');
  assert.equal(slam.receipts[0].killCause, 'terrain_collision');
  assert.ok(slam.state.player.heat > 0, 'reckless endangerment is still a crime');
  assert.ok(slam.state.player.heat < WANTED_THRESHOLD,
    `reckless kill heat ${slam.state.player.heat} stays below WANTED where the shot crossed it`);
  assert.ok(slam.state.player.heat < shot.state.player.heat,
    'the collision outcome is materially lighter than the shooting outcome');
  slam.sim.dispose();
});

// ── 2. One witness truth: factions follow the law's verdict, fail closed without one ─────────

test('factions act on the law\'s witness verdict, not a second pair of eyes', () => {
  const run = boot([lawSecurity, factions]);
  const fsys = run.sim.registry.get('factions');
  const repChanges = [];
  run.bus.on('faction:repChanged', (p) => repChanges.push(p));
  fsys.applyRep('faction_free', 1, 'seed_record'); // create the record so deltas are observable
  repChanges.length = 0;

  // A faction-mate COMBAT escort watches the kill — a ship factions' own witness query would
  // count (any faction hull within 1200 wu). But it is not a lawful unit, not a marked witness,
  // and not a protected civilian, so the law's verdict is: unwitnessed.
  const victim = civilianVictim(run, { x: 5000, z: 0 });
  run.sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_free',
    pos: { x: 5200, z: 0 }, hull: 80, hullMax: 80, radius: 8,
    data: { shipClass: 'fighter', trafficRole: 'escort', weapons: [{}], ai: {} },
  });
  assert.equal(fsys._witnessed({ x: 5000, z: 0 }, 'faction_free'), true,
    'sanity: factions\' own query DOES see a faction hull near the kill');

  run.bus.emit('entity:killed', killPayload(run, victim, { presentation: KINETIC }));
  assert.ok(!repChanges.some((p) => p && p.factionId === 'faction_free'
      && (p.reason === 'kill_faction_ship' || p.reason === 'kill_faction_ship_collision')),
    'the law saw no one who matters — the faction cannot punish a kill it cannot prove');
  assert.ok(!run.lawResponses.some((r) => r.action === 'crime_validated'),
    'sanity: the law itself recorded no charge for the unwitnessed kill');

  // Same scene with lawful eyes: the law says seen, and standing answers — even though the
  // observer is nobody the victim's faction would count on its own.
  const repBefore = run.state.factions.faction_free.rep;
  const victim2 = civilianVictim(run, { x: 6000, z: 0 });
  lawfulWitness(run, { x: 6060, z: 0 });
  run.bus.emit('entity:killed', killPayload(run, victim2, { presentation: KINETIC }));
  assert.ok(repChanges.some((p) => p && p.factionId === 'faction_free' && p.reason === 'kill_faction_ship'),
    'the law\'s witnessed verdict docks standing through the kill price');
  assert.ok(run.state.factions.faction_free.rep < repBefore - 10,
    `standing answers the law's verdict (${run.state.factions.faction_free.rep} < ${repBefore})`);

  // Fail closed: no law system, no spatial query — an unverifiable kill moves nothing.
  const blind = boot([factions]);
  delete blind.sim.helpers.queryRadius;
  const blindChanges = [];
  blind.bus.on('faction:repChanged', (p) => blindChanges.push(p));
  blind.sim.registry.get('factions').applyRep('faction_free', 1, 'seed_record');
  blindChanges.length = 0;
  const blindVictim = civilianVictim(blind, { x: 80, z: 0 });
  blind.bus.emit('entity:killed', killPayload(blind, blindVictim, { presentation: KINETIC }));
  assert.ok(!blindChanges.some((p) => p && p.factionId === 'faction_free'
      && (p.reason === 'kill_faction_ship' || p.reason === 'kill_faction_ship_collision')),
    'with no verdict and no way to see, the honest answer is no standing change');
  run.sim.dispose();
  blind.sim.dispose();
});

// ── 3. Aggro factions field combat hulls; civilians never join the grudge ────────────────────

test('an aggro faction\'s armed combat hulls are hostile on sight; its civilians are not', () => {
  const state = {
    playerId: 1,
    player: { heat: 0 },
    world: { currentSectorId: SECTOR, sectors: { [SECTOR]: { security: 0.9, tier: 0 } } },
    factions: {
      faction_reach: { rep: -500, aggro: true },
      faction_free: { rep: 0, aggro: false },
    },
    combat: { entities: {} },
    days: 0,
  };
  const player = { id: 1, type: 'ship', team: 0, pos: { x: 0, z: 0 }, alive: true, data: {} };
  const reachShip = (id, data = {}) => ({
    id, type: 'ship', team: 1, factionId: 'faction_reach',
    pos: { x: 100, z: 0 }, alive: true,
    data: { ai: {}, ...data },
  });

  // Armed combat hull of a hated faction → attacks on sight, through BOTH gates the game reads.
  const fighter = reachShip(10, { weapons: [{ id: 'wpn_pulse_laser_s' }], trafficRole: 'patrol' });
  assert.equal(isHostileToPlayer(fighter, 0, state), true,
    'an armed hull flying a hated flag is hostile without a warrant');
  assert.equal(isHostileForAI(state, fighter, player), true,
    'the AI fire authority sees the same hostility the HUD does');

  // The same faction\'s hauler, civilian, passive escort, and unarmed hull never join the grudge.
  assert.equal(isHostileToPlayer(
    reachShip(11, { trafficRole: 'hauler', weapons: [{}] }), 0, state), false,
    'a hated faction\'s hauler still hauls — noncombat traffic is excluded');
  const civilian = reachShip(12, { weapons: [{}] });
  civilian.team = 2;
  assert.equal(isHostileToPlayer(civilian, 0, state), false,
    'team-2 civilians stay non-hostile even under an aggro flag');
  assert.equal(isHostileToPlayer(
    reachShip(13, { weapons: [{}], ai: { passive: true } }), 0, state), false,
    'passive actors fail closed against accidental hostility');
  assert.equal(isHostileToPlayer(reachShip(14, {}), 0, state), false,
    'an unarmed hull cannot fight, so the grudge cannot arm it');

  // Standing is the oracle: the same armed hull on calm standing stays neutral.
  const calmFighter = reachShip(15, { weapons: [{}] });
  calmFighter.factionId = 'faction_free';
  assert.equal(isHostileToPlayer(calmFighter, 0, state), false,
    'a faction that does not hate you does not shoot first');
});

// ── 4. Bounty cools heat; stale debt posts bounty ────────────────────────────────────────────

test('paying the bounty visibly cools the heat; unpaid debt ages into posted bounty', () => {
  const run = boot([economy, heat], { security: 0.9 });
  run.state.player.heat = 0.5;
  run.state.player.bounty = 400;

  const heatChanges = [];
  const escalations = [];
  run.bus.on('heat:changed', (p) => heatChanges.push(p));
  run.bus.on('economy:debtEscalated', (p) => escalations.push(p));

  const payEnvelope = {};
  run.bus.emit('economy:payBounty', payEnvelope);
  assert.equal(payEnvelope.result && payEnvelope.result.ok, true, 'the payment lands');
  assert.equal(run.state.player.bounty, 0, 'the bounty ledger clears');
  assert.equal(run.state.player.credits, 4600, 'the payoff is real credits through economy');
  const cooled = 0.5 - Math.min(0.5, 400 * 0.0004); // BOUNTY_PAID_COOL_PER_CR
  assert.ok(Math.abs(run.state.player.heat - cooled) < 1e-9,
    `paying the bounty cools heat proportionally (${run.state.player.heat} ≈ ${cooled})`);
  assert.ok(heatChanges.some((p) => p && /bounty paid/.test(String(p.reason || ''))),
    'the heat owner records why the ledger cooled');

  // Debt side: a stale unpaid ledger quietly becomes a price on the player's head.
  run.state.player.debt = 1000;
  run.bus.emit('day:tick', { days: 5, elapsed: 1 }); // grace window starts
  run.bus.emit('day:tick', { days: 6, elapsed: 1 }); // 1 day stale — still inside grace
  assert.equal(run.state.player.bounty, 0, 'the grace period gives the debtor a fair window');
  run.bus.emit('day:tick', { days: 7, elapsed: 1 }); // 2 days stale → first levy
  assert.equal(run.state.player.bounty, 250, 'stale debt posts a deterministic levy');
  run.bus.emit('day:tick', { days: 7, elapsed: 1 }); // same day, replayed — must not double-charge
  assert.equal(run.state.player.bounty, 250, 'the same day cannot levy twice');
  run.bus.emit('day:tick', { days: 8, elapsed: 1 }); // next day levies again
  assert.equal(run.state.player.bounty, 500);
  assert.equal(escalations.length, 2, 'one escalation event per stale day, no more');
  run.sim.dispose();
});

// ── 5. The wreck testifies: scan or salvage surfaces an unwitnessed kill — once ──────────────

test('an unwitnessed kill comes back through the wreck\'s black box — once, not twice', () => {
  const run = boot([lawSecurity, factions, heat, scanner]);
  const fsys = run.sim.registry.get('factions');
  fsys.applyRep('faction_free', 1, 'seed_record');
  const repStart = run.state.factions.faction_free.rep;

  // A kill in deep space: no lawful eyes, no civilian eyes — the law records a pending case.
  const victim = civilianVictim(run, { x: 5000, z: 0 });
  run.bus.emit('entity:killed', killPayload(run, victim, { presentation: KINETIC }));
  assert.equal(run.state.player.heat, 0, 'unwitnessed: no charge yet');
  const pending = run.state.lawSecurity.unreportedKills;
  // The docket keys on the victim's STABLE id (the same basis as reportId), never the bare
  // runtime id — a recycled entity number can never collide the case with a stranger's wreck.
  assert.ok(pending && pending[`entity:${victim.id}`],
    'the unwitnessed kill is retained as a bounded pending case keyed by stable identity');

  // The victim's wreck persists with durable provenance: the black box names the killer.
  const markerId = 'aft_test_blackbox_1';
  if (!run.state.aftermathWrecks) run.state.aftermathWrecks = { bySector: {} };
  run.state.aftermathWrecks.bySector[SECTOR] = [{
    markerId, sectorId: SECTOR,
    victimId: victim.id, victimClass: 'hauler', victimFactionId: 'faction_free',
    killerId: run.state.playerId, pos: { x: 5000, z: 0 }, tick: run.state.tick | 0,
  }];
  run.sim.spawn({
    type: 'wreck', team: 2, pos: { x: 5000, z: 0 }, radius: 10,
    data: { markerId, aftermath: { victimId: victim.id, markerId } },
  });
  // Move the player next to the wreck so the real scan pulse resolves it.
  run.player.pos.x = 5000; run.player.pos.z = 0;
  if (!run.state.input) run.state.input = {};
  if (!run.state.input.actions) run.state.input.actions = {};
  run.state.input.actions.scanPulse = true;
  run.sim.step();

  assert.equal(run.receipts.length, 1, 'the black box resolves to exactly one charge');
  const receipt = run.receipts[0];
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.discovery, true, 'the receipt says how the law learned of it');
  assert.equal(receipt.kind, 'unlawful_kill');
  assert.equal(receipt.evidence, 'wreck_provenance');
  assert.equal(receipt.markerId, markerId);
  assert.ok(run.state.player.heat >= WANTED_THRESHOLD,
    `the discovered murder convicts (${run.state.player.heat}) — the scene was quiet, the hulk was not`);
  assert.ok(run.state.factions.faction_free.rep < repStart - 10,
    'the faction answers the discovered kill once the law names the killer');
  const discovered = run.lawResponses.find((r) => r.action === 'crime_discovered');
  assert.ok(discovered, 'the canonical law response records the discovery');

  const heatAfterDiscovery = run.state.player.heat;
  const repAfterDiscovery = run.state.factions.faction_free.rep;
  const receiptsAfterDiscovery = run.receipts.length;

  // The follow-up salvage pass over the same hulk must not charge a second time.
  run.bus.emit('salvage:completed', { wreckId: null, markerId, pos: { x: 5000, z: 0 } });
  run.bus.emit('scan:wreckResolved', { wreckId: 424242, markerId, pos: { x: 5000, z: 0 } });
  assert.equal(run.state.player.heat, heatAfterDiscovery,
    'scan-then-salvage of the same wreck prices the crime once');
  assert.equal(run.state.factions.faction_free.rep, repAfterDiscovery,
    'the faction answers the same report exactly once');
  assert.ok(Object.keys(run.state.lawSecurity.unreportedKills).length === 0,
    'the pending case is closed once the charge lands');
  run.sim.dispose();
});

// ── 6. High-security space eventually answers WANTED — delayed, lawful, bounded ──────────────

test('a WANTED player in high-sec space eventually meets one lawful patrol; clearing heat recalls it', () => {
  // Synthetic sector ids carry no authored regional-ecology profile, so `world.sectors`
  // security is the effective law coverage — the test owns both ends of the gate.
  const run = boot([lawSecurity, heat], { security: 0.9, sectorId: 'sector_law_lab_high' });
  run.state.player.heat = 0.2; // WANTED (>= 0.15), below the bounty band

  const posted = [];
  const released = [];
  run.bus.on('law:highSecWarrantPosted', (p) => posted.push(p));
  run.bus.on('law:highSecWarrantReleased', (p) => released.push(p));

  // Rare and delayed: nothing lawful materializes for a while, then exactly one patrol.
  run.sim.runTicks(60 * 20); // twenty sim-seconds — under the exposure threshold
  assert.equal(posted.length, 0, 'no instant response — high-sec coverage is a slow clock');
  run.sim.runTicks(60 * 120); // long enough to cross any seeded threshold (45–105 s)
  assert.equal(posted.length, 1, 'exactly one lawful warrant patrol posts per warrant epoch');
  assert.ok(posted[0].contractId.includes(String(SEED)),
    'the warrant contract is deterministic from the seed');

  const hunter = run.state.entities.get(posted[0].hunterId);
  assert.ok(hunter, 'a real hull was spawned, not a phantom flag');
  assert.equal(hunter.data.ai.lawful, true, 'the responder flies under lawful authority');
  assert.equal(hunter.data.ai.securityTargetId, run.state.playerId,
    'the patrol hunts the WANTED player through the canonical lawful gate');
  const dx = hunter.pos.x - run.player.pos.x;
  const dz = hunter.pos.z - run.player.pos.z;
  assert.ok(dx * dx + dz * dz >= 900 * 900,
    'the reserve arrival never materializes on top of the player');
  assert.equal(isHostileToPlayer(hunter, 0, run.state), true,
    'the lawful responder reads hostile to the wanted player');
  assert.equal(isHostileForAI(run.state, hunter, run.player), true,
    'the fire authority will let it engage');

  // Cooling the heat recalls the coverage — the warrant releases on the record.
  run.bus.emit('heat:clear', { reason: 'test' });
  run.sim.runTicks(2);
  assert.equal(released.length, 1, 'the warrant releases when the player stops being wanted');
  assert.equal(run.state.lawSecurity.highSecWarrant, null);
  assert.equal(hunter.data.ai.passive, true,
    'the recalled patrol stands down rather than lingering hostile');

  // Low-security control: the same wanted heat in the badlands posts nothing.
  const low = boot([lawSecurity, heat], { security: 0.2, sectorId: 'sector_law_lab_low' });
  low.state.player.heat = 0.2;
  const lowPosted = [];
  low.bus.on('law:highSecWarrantPosted', (p) => lowPosted.push(p));
  low.sim.runTicks(60 * 120);
  assert.equal(lowPosted.length, 0, 'frontier space has no lawful coverage to answer with');
  run.sim.dispose();
  low.sim.dispose();
});

// ── 7. Reckless is a fraction of the same-class murder — fighter and hauler pinned ────────────

test('reckless endangerment never out-prices the same-class murder — fighter and hauler', () => {
  // The old flat reckless price (0.12) exceeded the class-scaled murder price for fighter,
  // default, and large victims — ramming a light hull was the MORE expensive crime. Reckless is
  // now a fixed fraction of the same murder table, so the ordering can never invert.
  for (const victimClass of ['fighter', 'hauler']) {
    const outcome = {};
    for (const [leg, presentation] of [['shot', KINETIC], ['slam', TERRAIN_SLAM]]) {
      const run = boot([lawSecurity, heat]);
      const victim = classedVictim(run, { x: 80, z: 0 }, victimClass);
      lawfulWitness(run, { x: 140, z: 0 });
      run.bus.emit('entity:killed', killPayload(run, victim, { victimClass, presentation }));
      assert.equal(run.receipts.length, 1,
        `${victimClass}/${leg}: a witnessed kill signs a receipt`);
      outcome[leg] = { kind: run.receipts[0].kind, heat: run.state.player.heat };
      run.sim.dispose();
    }
    assert.equal(outcome.shot.kind, 'unlawful_kill');
    assert.equal(outcome.slam.kind, 'reckless_kill');
    assert.ok(outcome.slam.heat > 0, `${victimClass}: the ram is still a crime`);
    assert.ok(outcome.slam.heat < outcome.shot.heat,
      `${victimClass}: ram (${outcome.slam.heat}) must cost less than shot (${outcome.shot.heat})`);
    assert.ok(Math.abs(outcome.slam.heat - outcome.shot.heat * 0.5) < 1e-9,
      `${victimClass}: reckless is the class-scaled murder table at half, not a flat price`);
  }
});

// ── 8. A witnessed kill the law clears pays no standing ──────────────────────────────────────

test('a witnessed kill the law clears costs no standing — the blameless none tier', () => {
  const run = boot([lawSecurity, factions]);
  const fsys = run.sim.registry.get('factions');
  // faction_helix on purpose: it holds no standing relationships, so rep can only move if the
  // kill path itself prices it — no enemy-approval or spillover can smuggle a delta in here.
  fsys.applyRep('faction_helix', 5, 'seed_record');
  const repStart = run.state.factions.faction_helix.rep;
  const repDeltas = [];
  run.bus.on('faction:repChanged', (p) => repDeltas.push(p));

  const victim = civilianVictim(run, { x: 80, z: 0 }, 'faction_helix');
  lawfulWitness(run, { x: 140, z: 0 });
  run.bus.emit('entity:killed', killPayload(run, victim, {
    presentation: KINETIC, targetHostileToPlayer: true,
  }));

  assert.ok(run.lawResponses.some((r) => r.action === 'kill_adjudicated' && r.outcome === 'lawful'),
    'the law clears the defensive kill on its own record');
  assert.equal(run.receipts.length, 0, 'a cleared kill signs no charge');
  assert.equal(run.state.factions.faction_helix.rep, repStart,
    'the blameless-none tier pays nothing for a kill the law refused to price');
  assert.ok(!repDeltas.some((p) => p && (p.reason === 'kill_faction_ship'
    || p.reason === 'kill_faction_ship_collision')),
    'no kill-priced standing delta fires for the cleared kill');

  // Control: the same eyes and the same scene with a non-hostile victim still docks standing.
  const repBeforeControl = run.state.factions.faction_helix.rep;
  const victim2 = civilianVictim(run, { x: 90, z: 0 }, 'faction_helix');
  lawfulWitness(run, { x: 150, z: 0 });
  run.bus.emit('entity:killed', killPayload(run, victim2, { presentation: KINETIC }));
  assert.equal(run.receipts.length, 1, 'the witnessed hostile-on-civilian kill charges');
  assert.ok(run.state.factions.faction_helix.rep < repBeforeControl,
    'a witnessed hostile-on-civilian kill still docks the killer\'s standing');
  run.sim.dispose();
});

// ── 9. The pending case rides the save — the wreck still convicts after reload ────────────────

test('an unwitnessed kill survives a save/load boundary — the wreck still convicts once', () => {
  // Session A: the kill nobody saw becomes a pending case; the save seam must carry it.
  const a = boot([lawSecurity, factions, heat, scanner]);
  const victim = civilianVictim(a, { x: 5000, z: 0 });
  a.bus.emit('entity:killed', killPayload(a, victim, { presentation: KINETIC }));
  const key = `entity:${victim.id}`;
  assert.ok(a.state.lawSecurity.unreportedKills[key], 'the pending case is recorded');
  assert.equal(a.state.player.heat, 0, 'unwitnessed: not yet convicted');

  const saveA = makeSaveHarness(a.sim);
  const data = saveA.serializeData();
  assert.ok(data.lawSecurity && data.lawSecurity.unreportedKills
    && data.lawSecurity.unreportedKills[key],
    'the discovered-crime docket rides the save payload');
  const savedSlice = JSON.parse(JSON.stringify(data.lawSecurity)); // disk-shaped, not aliased
  a.sim.dispose();

  // Session B: a fresh sim adopts the saved law slice — the Continue path.
  const b = boot([lawSecurity, factions, heat, scanner]);
  const saveB = makeSaveHarness(b.sim);
  saveB._callDeserialize('lawSecurity', savedSlice);
  const restored = b.state.lawSecurity.unreportedKills[key];
  assert.ok(restored, 'the pending case survives the reload');
  assert.equal(restored.reportId, `kill:${key}`, 'the case re-derives the same stable reportId');

  // The hulk persists through its own owner; scanning it must convict the restored case once.
  const markerId = 'aft_test_reload_blackbox';
  if (!b.state.aftermathWrecks) b.state.aftermathWrecks = { bySector: {} };
  b.state.aftermathWrecks.bySector[SECTOR] = [{
    markerId, sectorId: SECTOR,
    victimId: restored.victimEntityId, victimClass: 'hauler', victimFactionId: 'faction_free',
    killerId: b.state.playerId, pos: { x: 5000, z: 0 }, tick: restored.causalTick,
  }];
  b.sim.spawn({
    type: 'wreck', team: 2, pos: { x: 5000, z: 0 }, radius: 10,
    data: { markerId, aftermath: { victimId: restored.victimEntityId, markerId, tick: restored.causalTick } },
  });
  b.player.pos.x = 5000; b.player.pos.z = 0;
  if (!b.state.input) b.state.input = {};
  if (!b.state.input.actions) b.state.input.actions = {};
  b.state.input.actions.scanPulse = true;
  b.sim.step();

  assert.equal(b.receipts.length, 1, 'the restored case convicts on the first resolve');
  assert.equal(b.receipts[0].discovery, true, 'the receipt still says how the law learned');
  assert.equal(b.receipts[0].kind, 'unlawful_kill');
  assert.ok(b.state.player.heat >= WANTED_THRESHOLD,
    'the saved kill convicts after reload — the boundary laundered nothing');
  assert.equal(Object.keys(b.state.lawSecurity.unreportedKills).length, 0,
    'the pending case closes on conviction');

  // The dedupe latch survived the boundary: replayed resolves cannot charge twice.
  b.bus.emit('scan:wreckResolved', { wreckId: null, markerId, pos: { x: 5000, z: 0 } });
  b.bus.emit('salvage:completed', { wreckId: null, markerId, pos: { x: 5000, z: 0 } });
  assert.equal(b.receipts.length, 1, 'post-load resolves dedupe through the same latches');
  assert.ok(b.state.lawSecurity.reportedIncidents
    && b.state.lawSecurity.reportedIncidents[b.receipts[0].reportId],
    'the priced-incident ledger recorded the conviction it must dedupe');
  b.sim.dispose();
});

// ── 10. A recycled entity id cannot cross-charge an unrelated wreck ──────────────────────────

test('a recycled victim id cannot cross-charge an unrelated wreck', () => {
  const run = boot([lawSecurity, factions, heat, scanner]);
  const law = run.sim.registry.get('lawSecurity');

  // The kill nobody saw files a pending case under the victim's STABLE id.
  const victim = civilianVictim(run, { x: 5000, z: 0 });
  run.bus.emit('entity:killed', killPayload(run, victim, { presentation: KINETIC }));
  const killTick = run.state.tick | 0;
  assert.ok(run.state.lawSecurity.unreportedKills[`entity:${victim.id}`],
    'the record-less victim files under the entity:<id> fallback');

  // Runtime ids recycle: a LATER, unrelated death wears the same number. Its black box dates a
  // different kill — even naming the player as killer it must bind no charge.
  if (!run.state.aftermathWrecks) run.state.aftermathWrecks = { bySector: {} };
  run.state.aftermathWrecks.bySector[SECTOR] = [{
    markerId: 'aft_test_recycled_stranger', sectorId: SECTOR,
    victimId: victim.id,                          // the same recycled runtime id
    victimClass: 'hauler', victimFactionId: 'faction_free',
    killerId: run.state.playerId,                 // black box even blames the player…
    pos: { x: 9000, z: 0 }, tick: killTick + 60,  // …but it dates a different death
  }];
  const stranger = law._handleWreckCrimeDiscovery(
    { wreckId: null, markerId: 'aft_test_recycled_stranger', pos: { x: 9000, z: 0 } },
    'wreck_scan');
  assert.equal(stranger, null, 'a recycled id at a foreign kill tick binds nothing');
  assert.equal(run.receipts.length, 0, 'no charge minted for the stranger');
  assert.ok(run.state.lawSecurity.unreportedKills[`entity:${victim.id}`],
    'the real pending case is untouched by the stranger\'s wreck');

  // The victim's own hulk — same recycled id, the case's own tick — still convicts.
  run.state.aftermathWrecks.bySector[SECTOR].push({
    markerId: 'aft_test_recycled_own', sectorId: SECTOR,
    victimId: victim.id, victimClass: 'hauler', victimFactionId: 'faction_free',
    killerId: run.state.playerId, pos: { x: 5000, z: 0 }, tick: killTick,
  });
  const own = law._handleWreckCrimeDiscovery(
    { wreckId: null, markerId: 'aft_test_recycled_own', pos: { x: 5000, z: 0 } },
    'wreck_scan');
  assert.ok(own && own.accepted === true, 'the victim\'s own wreck still convicts');
  assert.equal(own.kind, 'unlawful_kill');
  assert.equal(run.receipts.length, 1);

  // Durable victim: the case files under worldRecordId, unreachable from the bare runtime id —
  // discovery resolves it through the bounded (entityId, killTick) match, and only that match.
  const durable = civilianVictim(run, { x: 6000, z: 0 });
  durable.data.worldRecordId = 'wr_npc_test_durable';
  run.bus.emit('entity:killed', killPayload(run, durable, { presentation: KINETIC }));
  const durTick = run.state.tick | 0;
  assert.ok(run.state.lawSecurity.unreportedKills.wr_npc_test_durable,
    'the durable case files under the record id, not the runtime id');
  run.state.aftermathWrecks.bySector[SECTOR].push({
    markerId: 'aft_test_durable_stranger', sectorId: SECTOR,
    victimId: durable.id, victimClass: 'hauler', victimFactionId: 'faction_free',
    killerId: run.state.playerId, pos: { x: 6000, z: 0 }, tick: durTick + 30,
  });
  assert.equal(law._handleWreckCrimeDiscovery(
    { wreckId: null, markerId: 'aft_test_durable_stranger', pos: { x: 6000, z: 0 } },
    'wreck_scan'), null,
    'the durable case ignores a recycled id at a foreign tick');
  run.state.aftermathWrecks.bySector[SECTOR].push({
    markerId: 'aft_test_durable_own', sectorId: SECTOR,
    victimId: durable.id, victimClass: 'hauler', victimFactionId: 'faction_free',
    killerId: run.state.playerId, pos: { x: 6000, z: 0 }, tick: durTick,
  });
  const hit = law._handleWreckCrimeDiscovery(
    { wreckId: null, markerId: 'aft_test_durable_own', pos: { x: 6000, z: 0 } },
    'wreck_scan');
  assert.ok(hit && hit.accepted === true && hit.reportId === 'kill:wr_npc_test_durable',
    'the durable case resolves through its stable key');
  run.sim.dispose();
});
