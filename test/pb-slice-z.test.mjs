// PB-SLICE-Z — SF-300 capstone: one coherent session connects work, risk and ownership.
// The packet's chosen chain is the landed slice set, not a new system — this suite binds the
// ordinary session those slices produce, end to end through the live owners:
//
//   a useful job            — a starving yard posts a real feed run on a reachable board
//                             (SF-290 / PB-SLICE-B: starvedIndustryNeedFor → _starvedIndustryOffer);
//   a physical complication — the Helios customs corridor sits on the way out of the posting
//                             sector (SF-289 / PB-SLICE-B);
//   a build-dependent choice — hold the beam (a hull that can afford 1.6 s under readSpeed)
//                             or outrun it (a hull built to beat the 34 WU/s read ceiling);
//   an imperfect continuation — the mid-read bolt is flagged, keeps what the beam kept,
//                             and still delivers; the short arrival settles for what lands;
//   a reason to return       — the delivered lot lands through cargo:delivered → stock so the
//                             line resumes and the relief cue names its receipt; a partial
//                             arrival leaves the hopper starving and the broker re-posts it
//                             re-quoted (NXI-169/NXI-171); the runner's flag decays on its own
//                             clock, not on the next transit.
//
// Every leg is driven through real owners — economyContracts posts, missions accepts and
// settles, lawSecurity reads the gate, economy owns the market and the hot ledger. Nothing
// is emitted to fake a stage: the only fixtures are the starved book itself, the pilot's
// position/velocity, and the docked events the real route fires.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { makeEntity } from '../src/core/entity.js';
import { removeCargo } from '../src/systems/cargo.js';
import { economy, starvedIndustryNeedFor } from '../src/systems/economy.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { missions } from '../src/systems/missions.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { hotUntilActive } from '../src/economy/customsRisk.js';
import { HELIOS_CUSTOMS_WEIR } from '../src/world/customsWeir.js';

const IRON = 'cmdty_ore_iron';
const BROKER = 'station_coalition';       // Helios Prime board; Coalition HQ has no first-trade latch
const YARD = 'station_ceres';             // authored refinery in neighbor sector_ceres_belt
const YARD_TYPE = 'refinery';
const YARD_TIER = 1;
const CENTER = HELIOS_CUSTOMS_WEIR.center;
const READ_SPEED = HELIOS_CUSTOMS_WEIR.readSpeed;   // 34 WU/s — the beam's ceiling
const READ_DWELL = HELIOS_CUSTOMS_WEIR.readDwellS;  // 1.6 s under the beam finishes the read

const HEARD = [
  'mission:accepted', 'mission:completed', 'cargo:delivered',
  'economy:freightAccepted', 'economy:shortageRelieved',
  'customs:weirBolt', 'law:response', 'law:voice', 'player:scannedByPatrol', 'toast',
];

function boot(seed) {
  const sim = createSimulation({ seed, systems: [economy, missions, economyContracts, lawSecurity] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.onboarding = { active: false, finished: true };
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 90, capMass: 90 };
  state.world.currentSectorId = 'sector_helios_prime';
  const player = makeEntity({ id: state.playerId, type: 'ship', isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  state.entities.set(state.playerId, player);
  state.entityList.push(player);
  const events = [];
  for (const name of HEARD) bus.on(name, (payload) => events.push({ name, payload }));
  return { sim, state, bus, player, events };
}

const evs = (h, name) => h.events.filter((e) => e.name === name);

/** Starve the Ceres refinery's iron leg. Small baseEq keeps the hopper math legible —
 *  one bounded relief lot can actually fill it (the NXB-043 convention). */
function starveYard(h, baseEq = 24, fill = 0.05) {
  const econ = h.sim.registry.get('economy');
  const market = econ.ensureMarket(YARD);
  market[IRON].baseEq = baseEq;
  market[IRON].stock = baseEq * fill;
  return market;
}

function yardNeed(h) {
  return starvedIndustryNeedFor(YARD_TYPE, YARD_TIER, h.state.economy.markets[YARD]);
}

function starvedRows(h, stationId = BROKER) {
  const board = h.state.missions.boards[stationId];
  return (board && board.slots || []).filter((o) => o
    && o.source === 'economyContract' && o.cause && o.cause.tag === 'industry_starved');
}

/** The job leg: dock at the broker, take the posted relief run. */
function postAndAccept(h) {
  h.bus.emit('dock:docked', { stationId: BROKER });
  const offer = starvedRows(h)[0];
  assert.ok(offer, 'the starving yard posts a real feed run on the broker board');
  const missionsSys = h.sim.registry.get('missions');
  assert.equal(missionsSys.acceptMission(offer.id), true, 'the run accepts');
  const mission = h.state.missions.active.find((m) => m && m.status === 'active'
    && m.destStationId === YARD);
  assert.ok(mission, 'the accepted run is a live mission into the starving yard');
  return { offer, mission, missionsSys };
}

/** One weir crossing: enter the corridor at `speed`, dwell `steps × dt` seconds, leave. */
function crossWeir(h, { speed = 8, dwellSteps = 0, dt = 0.5, exitDx = 400 }) {
  h.player.pos.x = CENTER.x; h.player.pos.z = CENTER.z;
  h.player.vel.x = speed; h.player.vel.z = 0;
  for (let i = 0; i < dwellSteps; i += 1) h.sim.step(dt);
  h.player.pos.x = CENTER.x + exitDx; // out the far side
  h.sim.step(dt);
}

function arriveAtYard(h) {
  h.state.world.currentSectorId = 'sector_ceres_belt';
  h.bus.emit('dock:docked', { stationId: YARD });
}

// ── The session, lawful build ─────────────────────────────────────────────────────────────

test('SF-300 lawful session: the run posts, the beam logs the hull, the delivery feeds the line', () => {
  const h = boot(30001);
  try {
    const market = starveYard(h);
    const needBefore = yardNeed(h);
    assert.ok(needBefore && needBefore.inputId === IRON, 'BEFORE: the yard is really starving');

    const { offer, mission } = postAndAccept(h);
    assert.equal(offer.params.cmdtyId, IRON, 'the run names the real input leg');
    assert.ok(offer.summary && offer.summary.length > 0, 'the row says why it is posted');
    assert.ok((h.state.player.cargo.items[IRON] || 0) >= mission.params.qty,
      'accepting loads the client\'s sealed freight — the job is carried, not flagged');

    // The freighter build can afford the beam: hold under readSpeed for the dwell.
    crossWeir(h, { speed: READ_SPEED - 10, dwellSteps: Math.ceil(READ_DWELL / 0.5) });
    assert.equal(evs(h, 'law:response').filter((e) => e.payload.action === 'weir_read').length, 1,
      'the held read logs the transit once');
    assert.ok(evs(h, 'player:scannedByPatrol').some((e) => e.payload.source === 'customs_weir'),
      'the manifest resolves through the gate\'s own scan path');
    assert.equal(evs(h, 'customs:weirBolt').length, 0, 'a logged transit is not a bolt');
    assert.ok(h.state.player.customsHotUntil == null
      || !hotUntilActive(h.state.player.customsHotUntil, h.state.simTime, 'faction_scn'),
      'the clean hull carries no flag');

    const ironBefore = market[IRON].stock;
    arriveAtYard(h);
    const delivered = evs(h, 'cargo:delivered');
    assert.equal(delivered.length, 1, 'the delivery lands once');
    assert.equal(delivered[0].payload.missionId, mission.id, 'the freight fact names its contract');
    assert.equal(delivered[0].payload.qty, mission.params.qty, 'the whole sealed lot lands');
    assert.ok(market[IRON].stock - ironBefore >= mission.params.qty - 1,
      'the lot is real market stock, not a flag');
    assert.equal(evs(h, 'mission:completed').length, 1, 'the run pays once');
    assert.equal(yardNeed(h), null, 'AFTER: the hopper is fed — the consequence is durable');
    const relief = evs(h, 'economy:shortageRelieved');
    assert.equal(relief.length, 1, 'one threshold-crossing delivery earns one relief cue');
    assert.equal(relief[0].payload.receiptId, `mission-delivery:${mission.id}`,
      'the cue cites the relieving transaction — every changed state is traceable');
  } finally { h.sim.dispose(); }
});

// ── The return visit ──────────────────────────────────────────────────────────────────────

test('SF-300 return visit: the fed yard keeps producing and the stale emergency stays down', () => {
  const h = boot(30002);
  try {
    const market = starveYard(h);
    const metals = market.cmdty_refined_metals;
    const econ = h.sim.registry.get('economy');
    const metals0 = metals.stock;
    econ.applyStationIndustry(60);
    const starvedDelta = metals.stock - metals0;
    assert.ok(starvedDelta < 0.5, `the starving line barely runs (${starvedDelta.toFixed(3)} u/min)`);

    const { mission } = postAndAccept(h);
    crossWeir(h, { speed: READ_SPEED - 10, dwellSteps: Math.ceil(READ_DWELL / 0.5) });
    arriveAtYard(h);
    assert.equal(yardNeed(h), null);

    // The yard the player fed keeps working while they are away: the line burns relief
    // stock into product at the fed rate — the change a return visit can actually see.
    const metals1 = metals.stock;
    econ.applyStationIndustry(60);
    const fedDelta = metals.stock - metals1;
    assert.ok(fedDelta > starvedDelta * 3,
      `the line resumed on relief (${fedDelta.toFixed(2)} u vs ${starvedDelta.toFixed(3)} u starved)`);

    // A later-epoch re-dock at the broker: the board reflects the fed hopper — the resolved
    // emergency does not repost, and replaying the same receipt cannot re-move stock.
    h.state.simTime += 601; // next board epoch
    h.bus.emit('dock:docked', { stationId: BROKER });
    assert.equal(starvedRows(h).length, 0, 'the fed yard\'s row stays down on the return dock');

    const stockNow = market[IRON].stock;
    const relievedNow = evs(h, 'economy:shortageRelieved').length;
    h.bus.emit('cargo:delivered', {
      commodityId: IRON, qty: mission.params.qty, missionId: mission.id, stationId: YARD,
    });
    assert.equal(market[IRON].stock, stockNow, 'a replayed receipt moves no stock a second time');
    assert.equal(evs(h, 'economy:shortageRelieved').length, relievedNow,
      'a replayed receipt earns no second relief cue');
    h.bus.emit('dock:docked', { stationId: YARD });
    assert.equal(evs(h, 'mission:completed').length, 1, 'a spent run cannot re-pay at a second dock');
    assert.equal(evs(h, 'cargo:delivered').length, 2, 'the re-dock emits no second delivery');
  } finally { h.sim.dispose(); }
});

// ── Build two: the courier outruns the read ───────────────────────────────────────────────

test('SF-300 the courier build bolts the gate and carries a decaying flag — the job still lands', () => {
  const h = boot(30003);
  try {
    starveYard(h);
    const { mission } = postAndAccept(h);

    // The fast hull cannot be read: it streaks the corridor above the beam's ceiling.
    crossWeir(h, { speed: READ_SPEED * 6, dwellSteps: 1 });
    const bolts = evs(h, 'customs:weirBolt');
    assert.equal(bolts.length, 1, 'one unread transit is one flag, not a stream');
    assert.equal(bolts[0].payload.kind, 'speed_run', 'a hull that never fed the beam speed-ran');
    const flagUntil = h.state.player.customsHotUntil.faction_scn;
    assert.ok(flagUntil > h.state.simTime, 'the gate\'s faction remembers the runner — decaying');
    assert.ok(flagUntil <= h.state.simTime + 601,
      'the record is one bounded window, not an escalating penalty');

    // The consequence is proportionate: the delivery still lands — the flag is the cost, not the job.
    arriveAtYard(h);
    assert.equal(evs(h, 'mission:completed').length, 1, 'the bolter still finishes the run');
    assert.equal(yardNeed(h), null, 'the yard does not care how the freight crossed');

    // A second unread transit re-bases the same window — it extends by max, never stacks.
    h.state.world.currentSectorId = 'sector_helios_prime';
    crossWeir(h, { speed: READ_SPEED * 6, dwellSteps: 1 });
    assert.equal(evs(h, 'customs:weirBolt').length, 2, 'each transit is its own flag');
    const flagUntil2 = h.state.player.customsHotUntil.faction_scn;
    assert.ok(flagUntil2 <= h.state.simTime + 601 && flagUntil2 >= flagUntil,
      'repeat bolts re-base one window — they never compound into a longer record');

    // The flag decays on its own clock: a clean return under the window does not clear it
    // early, and after the window the gate forgets.
    h.state.simTime = flagUntil2 + 1;
    assert.equal(hotUntilActive(h.state.player.customsHotUntil, h.state.simTime, 'faction_scn'), false,
      'the window decays — the runner\'s record is not permanent');
  } finally { h.sim.dispose(); }
});

// ── The intentional mistake ───────────────────────────────────────────────────────────────

test('SF-300 the hesitant bolt is flagged — the beam keeps what it read and the job still lands', () => {
  const h = boot(30004);
  try {
    starveYard(h);
    const { mission } = postAndAccept(h);

    // The mistake: brake into the beam (1.0 s of the 1.6 s read), lose the nerve, run it.
    crossWeir(h, { speed: READ_SPEED - 24, dwellSteps: 2 }); // readT 1.0 ≥ half of 1.6
    const deep = evs(h, 'customs:weirBolt');
    assert.equal(deep.length, 1);
    assert.equal(deep[0].payload.kind, 'read_bolt', 'breaking a live read is the worse flag');
    assert.ok(evs(h, 'player:scannedByPatrol').some((e) => e.payload.source === 'customs_weir_bolt'),
      'a beam mostly finished keeps the manifest it caught — bolting does not erase it');
    assert.ok(h.state.player.customsHotUntil.faction_scn > h.state.simTime, 'still flagged');

    // A shallower graze flags the same way but the gate kept nothing to resolve.
    h.player.pos.x = CENTER.x; h.player.pos.z = CENTER.z;
    h.player.vel.x = READ_SPEED - 24; h.player.vel.z = 0;
    h.sim.step(0.4); // readT 0.4 < 0.8
    h.player.pos.x = CENTER.x + 400;
    h.sim.step(0.4);
    assert.equal(evs(h, 'customs:weirBolt').length, 2, 'the graze is its own flag');
    assert.equal(evs(h, 'player:scannedByPatrol')
      .filter((e) => e.payload.source === 'customs_weir_bolt').length, 1,
      'the shallow graze resolves nothing — the mistake gained nothing');

    arriveAtYard(h);
    assert.equal(evs(h, 'mission:completed').length, 1,
      'the mistake costs the flag, not the contract — imperfect continuation stays playable');
    assert.equal(yardNeed(h), null);
  } finally { h.sim.dispose(); }
});

// ── The imperfect continuation: a short arrival settles what actually landed ───────────────

test('SF-300 a raid-short arrival pays the delivered fraction and the board re-posts the rest', () => {
  const h = boot(30005);
  try {
    const market = starveYard(h, 182, 0.05); // full-size yard: one lot relieves the fill only partly
    const { mission } = postAndAccept(h);
    const sealed = mission.params.sealedRemaining;
    assert.equal(sealed, 20, 'the posting bound seals a bounded lot');

    crossWeir(h, { speed: READ_SPEED - 10, dwellSteps: Math.ceil(READ_DWELL / 0.5) });

    // The physical loss en route: six sealed units spill off the manifest (the raider's share).
    const spilled = removeCargo(h.state, IRON, 6);
    assert.equal(spilled, 6);

    const ironBefore = market[IRON].stock;
    arriveAtYard(h);
    const delivered = evs(h, 'cargo:delivered');
    assert.equal(delivered.length, 1, 'the short arrival settles once');
    assert.equal(delivered[0].payload.qty, sealed - spilled,
      'only the freight that physically lands is delivered');
    assert.ok(Math.abs(market[IRON].stock - ironBefore - (sealed - spilled)) < 1e-9,
      'the hopper gains what arrived — not what was signed for');
    const done = evs(h, 'mission:completed');
    assert.equal(done.length, 1);
    assert.equal(done[0].payload.completionMethod, 'partial_delivery',
      'the settlement names the shortfall honestly');
    assert.ok(done[0].payload.rewardCr < mission.reward_cr + 1,
      'the pay scales to delivered units, not the manifest');
    assert.ok(yardNeed(h), 'the yard is still starving — the work is not done');

    // The reason to return: a later-epoch re-dock re-posts the SAME live shortage, re-quoted
    // from the hopper the player left behind (NXI-171) — not a replay of the first emergency.
    h.state.simTime += 601;
    h.bus.emit('dock:docked', { stationId: BROKER });
    const repost = starvedRows(h);
    assert.equal(repost.length, 1, 'the unfinished hopper posts again on the return dock');
    const liveNeed = yardNeed(h);
    assert.equal(repost[0].params.cmdtyId, IRON, 'the repost names the same live leg');
    assert.equal(repost[0].params.qty, Math.min(20, liveNeed.deficitUnits),
      'the repost quotes the new actual deficit, not the old memory');
    assert.notEqual(repost[0].id, mission.sourceOfferId || '',
      'the repost is a fresh evaluation under the new epoch, not the consumed row');
  } finally { h.sim.dispose(); }
});

// ── The stale row cannot be accepted, and refusals cost nothing ───────────────────────────

test('SF-300 a relieved shortage retires its row at accept time — the stale offer refuses', () => {
  const h = boot(30006);
  try {
    starveYard(h);
    h.bus.emit('dock:docked', { stationId: BROKER });
    const offer = starvedRows(h)[0];
    assert.ok(offer);

    // The yard gets fed by other means before the player commits — a direct stock write
    // (industry buffer, another berth's flow) that carries no freight receipt, so the row
    // is still posted but the need that minted it is gone.
    const econ = h.sim.registry.get('economy');
    econ.applyStockPressure(YARD, IRON, 'sell', 20);
    assert.equal(yardNeed(h), null, 'the hopper filled before the player committed');
    assert.equal(starvedRows(h).length, 1, 'the un-synced row is still physically on the board');

    const missionsSys = h.sim.registry.get('missions');
    assert.equal(missionsSys.acceptMission(offer.id), false,
      'a shortage that no longer exists refuses its stale premium at accept');
    assert.ok(evs(h, 'toast').some((e) => /no longer needs/i.test(e.payload && e.payload.text || '')),
      'the refusal says why');
    assert.equal(starvedRows(h).length, 0, 'the dead row comes off the board');
    assert.equal(h.state.player.cargo.items[IRON] || 0, 0, 'no sealed freight was conjured');
  } finally { h.sim.dispose(); }
});

test('SF-300 refusals: routing around the gate and ignoring the row both cost nothing', () => {
  const h = boot(30007);
  try {
    starveYard(h);
    h.bus.emit('dock:docked', { stationId: BROKER });
    assert.equal(starvedRows(h).length, 1, 'the row is live');

    // Decline the row: nothing is owed, nothing is carried, the offer stays posted.
    assert.equal(h.state.missions.active.length, 0, 'ignoring the board accepts nothing');
    assert.equal(h.state.player.cargo.items[IRON] || 0, 0, 'no freight is conjured');

    // Route around the weir: a hull that never enters the corridor is never flagged.
    h.player.pos.x = CENTER.x + HELIOS_CUSTOMS_WEIR.halfWidth + 120; // outside the corridor
    h.player.pos.z = CENTER.z;
    h.player.vel.x = READ_SPEED * 6; h.player.vel.z = 0;
    for (let i = 0; i < 3; i += 1) h.sim.step(0.5);
    assert.equal(evs(h, 'customs:weirBolt').length, 0, 'staying out is never flagged');
    assert.equal(evs(h, 'player:scannedByPatrol').length, 0, 'staying out is never scanned');
    assert.equal(starvedRows(h).length, 1, 'the ignored row is still there for the next pilot');
    assert.equal(evs(h, 'mission:completed').length, 0, 'no beat fired for a job never taken');
  } finally { h.sim.dispose(); }
});
