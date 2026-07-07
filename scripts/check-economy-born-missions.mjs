// BP-12 packet ECONOMY_BORN_MISSIONS acceptance check ("Missions Born From The Field").
//
// Contract (src/data/economyContractTemplates.js + src/systems/economyContracts.js):
//   - A sector the field drove to pricePressure > 0.25 with driver.pricePressure==='route_scarcity'
//     produces EXACTLY ONE offer on dock, naming the commodity AND the cause (enumerated tag).
//   - Determinism: same seed+epoch+field ⇒ the same offer, bit for bit.
//   - EMIT-ONLY: the system routes through `mission:offered` and NEVER writes state.missions
//     (missions.js owns boards/active). The check itself plays the consumer role to prove the
//     offer is accept-path compatible: spliced into a board, the REAL missions.js accepts it,
//     instantiates it, and — once the cargo is delivered — pays via economy:grantCredits.
//   - Dedupe per station-epoch (no double-offer on re-dock); a calm field is a STRICT no-op
//     (golden-sim safe); pay is tethered to the LIVE modeled pressure, not a constant.
//   - Seeded: mulberry32(hash32(seed, stationId, epoch, 'econContract')); selection keyed to the
//     field driver (roll-free), never a free roll. No Math.random / no wall clock.
import assert from 'node:assert/strict';

import { economyContracts } from '../src/systems/economyContracts.js';
import { selectEconContract, ECON_CONTRACT_TEMPLATES } from '../src/data/economyContractTemplates.js';
import { missions } from '../src/systems/missions.js';
import { SECTORS } from '../src/data/sectors.js';
import { COMMODITIES } from '../src/data/commodities.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

const HOME = SECTORS.find((s) => (s.stations || []).length > 0);
assert.ok(HOME, 'catalog has a sector with stations');
const STATION = HOME.stations[0];
const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
assert.ok(CMDTY_BY_ID.has('cmdty_fuel_cells'), 'fuel cells exist in the commodity catalog');

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, payload) { emitLog.push({ evt, payload }); for (const fn of (handlers.get(evt) || []).slice()) fn(payload); },
  };
}

function fieldNode({ pricePressure = 0, priceTag = 'market_balance', danger = 0.2, dangerTag = 'structural_baseline', dangerTrend = 0, priceTrend = 0 } = {}) {
  return {
    danger, pricePressure,
    influence: { faction_scn: 0.4, faction_mts: 0.3, faction_reach: 0.3 },
    dominantFactionId: 'faction_scn', dominantInfluence: 0.4, contestMargin: 0.1,
    trend: { danger: dangerTrend, pricePressure: priceTrend, influence: 0 },
    driver: { danger: dangerTag, pricePressure: priceTag, influence: 'territorial_anchor' },
  };
}

function makeState(node, { seed = 7, simTime = 100 } = {}) {
  const player = { id: 1, type: 'ship', alive: true, team: 1, pos: { x: 0, z: 0 } };
  return {
    mode: 'flight', simTime, playerId: 1, meta: { seed },
    world: { currentSectorId: HOME.id, sectors: {} },
    entities: new Map([[1, player]]),
    entityList: [player],
    player: {
      credits: 50000, researchPoints: 0, stats: {},
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 500, capMass: 500 },
    },
    factions: { [STATION.factionId || HOME.factionId]: { rep: 50 } },
    nav: {}, ui: {},
    sectorSim: { field: { version: 1, epochDays: 2, nodes: { [HOME.id]: node } }, sectors: {}, meta: {} },
  };
}

const SCARCITY = () => fieldNode({ pricePressure: 0.32, priceTag: 'route_scarcity' });

function makeVoice() {
  const calls = [];
  return { calls, say(m) { calls.push(m); return true; } };
}

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in econ-contract path'); };
  Date.now = () => { throw new Error('Date.now in econ-contract path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

function freshSys() { return { ...economyContracts }; }

guarded(testTemplateSelectionKeyedToDriver);
guarded(testEmitOnlyOfferNamesCommodityAndCause);
guarded(testNoDirectMissionsWrite);
guarded(testDeterminism);
guarded(testDedupePerStationEpoch);
guarded(testCalmFieldStrictNoOp);
guarded(testPayTetheredToField);
guarded(testAcceptPathAndPayout);

console.log('Economy-born-missions checks OK');

// ── 1. selection is keyed to the field driver, deterministic, roll-free ────────────────────────
function testTemplateSelectionKeyedToDriver() {
  const scarcity = selectEconContract({ ...SCARCITY(), sectorId: HOME.id });
  assert.ok(scarcity && scarcity.template.key === 'scarcity_fuel_run', 'route_scarcity → the fuel run');
  assert.equal(scarcity.causeTag, 'route_scarcity', 'cause tag is the enumerated driver tag');
  const surplus = selectEconContract(fieldNode({ pricePressure: -0.3, priceTag: 'route_surplus' }));
  assert.equal(surplus.template.key, 'surplus_haul_out', 'route_surplus → the haul-out');
  const reach = selectEconContract(fieldNode({ danger: 0.6, dangerTag: 'reach_pressure' }));
  assert.equal(reach.template.key, 'reach_bounty', 'reach_pressure → bounty_hunt');
  assert.equal(reach.template.offerType, 'bounty_hunt');
  const loss = selectEconContract(fieldNode({ pricePressure: 0.2, priceTag: 'infrastructure_disruption' }));
  assert.equal(loss.template.key, 'station_loss_salvage', 'station loss → salvage_retrieval');
  const rising = selectEconContract(fieldNode({ danger: 0.6, dangerTag: 'contested_space', dangerTrend: 0.01 }));
  assert.equal(rising.template.key, 'rising_danger_escort', 'rising tagged danger → escort family');
  assert.equal(selectEconContract(fieldNode()), null, 'a calm field selects NOTHING');
  // Below the acceptance threshold, scarcity does not fire even with the tag present.
  assert.equal(selectEconContract(fieldNode({ pricePressure: 0.2, priceTag: 'route_scarcity' })), null,
    'route_scarcity below 0.25 pressure → no offer');
  const keys = ECON_CONTRACT_TEMPLATES.map((t) => t.key);
  const baseKeys = ['scarcity_fuel_run', 'surplus_haul_out', 'reach_bounty', 'station_loss_salvage', 'rising_danger_escort'];
  for (const key of baseKeys) assert.ok(keys.includes(key), `base spec arrow remains present: ${key}`);
  assert.deepEqual(keys.filter((key) => !baseKeys.includes(key)), ['blockade_relief'],
    'only the BP-12 blockade relief extension is allowed beyond the five base arrows');
}

// ── 2. docking a scarce sector emits EXACTLY ONE offer naming commodity + cause ────────────────
function testEmitOnlyOfferNamesCommodityAndCause() {
  const bus = makeBus();
  const state = makeState(SCARCITY());
  const voice = makeVoice();
  const sys = freshSys();
  sys.init({ bus, state, helpers: { voice } });
  bus.emit('dock:docked', { stationId: STATION.id });

  const offers = bus.emitLog.filter((e) => e.evt === 'mission:offered');
  assert.equal(offers.length, 1, 'exactly ONE offer per dock');
  const offer = offers[0].payload;
  assert.equal(offer.type, 'cargo_delivery', 'scarcity rides the shipped cargo_delivery type');
  assert.equal(offer.params.cmdtyId, 'cmdty_fuel_cells', 'the fuel run names fuel');
  const fuelName = CMDTY_BY_ID.get('cmdty_fuel_cells').name;
  assert.ok(offer.title.includes(fuelName), `title names the commodity: "${offer.title}"`);
  assert.ok(/scarcity/i.test(offer.title), `title names the cause: "${offer.title}"`);
  assert.ok(offer.summary.includes(fuelName), `summary names the commodity: "${offer.summary}"`);
  assert.equal(offer.cause.tag, 'route_scarcity', 'machine-traceable cause = the enumerated driver tag');
  assert.equal(offer.destStationId, STATION.id, 'the fuel run delivers TO the scarce station');
  assert.equal(offer.id, `eco_${STATION.id}_0`, 'stable station-epoch offer id');
  assert.equal(voice.calls.length, 1, 'one news line per offer');
  assert.equal(voice.calls[0].channel, 'news', 'spoken on the news channel');
}

// ── 3. EMIT-ONLY: the system never creates or writes state.missions ────────────────────────────
function testNoDirectMissionsWrite() {
  const bus = makeBus();
  const state = makeState(SCARCITY());
  assert.equal(state.missions, undefined, 'fixture starts with no missions tree');
  const sys = freshSys();
  sys.init({ bus, state, helpers: { voice: makeVoice() } });
  bus.emit('dock:docked', { stationId: STATION.id });
  assert.equal(bus.emitLog.filter((e) => e.evt === 'mission:offered').length, 1, 'offer emitted');
  assert.equal(state.missions, undefined,
    'state.missions untouched — offers route through the bus, never a direct board write');
}

// ── 4. determinism: same seed+epoch+field ⇒ the same offer ─────────────────────────────────────
function testDeterminism() {
  const run = () => {
    const bus = makeBus();
    const sys = freshSys();
    sys.init({ bus, state: makeState(SCARCITY()), helpers: { voice: makeVoice() } });
    bus.emit('dock:docked', { stationId: STATION.id });
    return bus.emitLog.find((e) => e.evt === 'mission:offered').payload;
  };
  assert.deepStrictEqual(run(), run(), 'same seed+epoch+field ⇒ identical offer');
  // A different seed moves the seeded stream (qty etc.) while the driver keying holds.
  const bus = makeBus();
  const sys = freshSys();
  sys.init({ bus, state: makeState(SCARCITY(), { seed: 99 }), helpers: { voice: makeVoice() } });
  bus.emit('dock:docked', { stationId: STATION.id });
  const other = bus.emitLog.find((e) => e.evt === 'mission:offered').payload;
  assert.equal(other.cause.tag, 'route_scarcity', 'driver keying is seed-independent');
}

// ── 5. dedupe per station-epoch ─────────────────────────────────────────────────────────────────
function testDedupePerStationEpoch() {
  const bus = makeBus();
  const state = makeState(SCARCITY());
  const sys = freshSys();
  sys.init({ bus, state, helpers: { voice: makeVoice() } });
  bus.emit('dock:docked', { stationId: STATION.id });
  bus.emit('dock:docked', { stationId: STATION.id });
  assert.equal(bus.emitLog.filter((e) => e.evt === 'mission:offered').length, 1,
    're-dock inside the epoch → NO double-offer');
  state.simTime += 600; // next refresh epoch
  bus.emit('dock:docked', { stationId: STATION.id });
  const offers = bus.emitLog.filter((e) => e.evt === 'mission:offered');
  assert.equal(offers.length, 2, 'a new epoch re-evaluates the field');
  assert.equal(offers[1].payload.id, `eco_${STATION.id}_1`, 'epoch-stamped id');
}

// ── 6. calm field → STRICT no-op (golden-sim safe) ─────────────────────────────────────────────
function testCalmFieldStrictNoOp() {
  const bus = makeBus();
  const state = makeState(fieldNode());
  const voice = makeVoice();
  const sys = freshSys();
  sys.init({ bus, state, helpers: { voice } });
  const missionsBefore = state.missions;
  bus.emit('dock:docked', { stationId: STATION.id });
  assert.equal(bus.emitLog.filter((e) => e.evt === 'mission:offered').length, 0, 'no offer from a calm field');
  assert.equal(voice.calls.length, 0, 'no voice from a calm field');
  assert.equal(state.missions, missionsBefore, 'no state invented');
}

// ── 7. pay is tethered to the LIVE modeled pressure, not a constant ────────────────────────────
function testPayTetheredToField() {
  const at = (pressure) => {
    const sys = freshSys();
    sys.init({ bus: makeBus(), state: makeState(fieldNode({ pricePressure: pressure, priceTag: 'route_scarcity' })), helpers: {} });
    const info = { id: STATION.id, name: STATION.name, type: STATION.type, factionId: STATION.factionId || HOME.factionId, sectorId: HOME.id };
    return sys.planOffer(info, 0);
  };
  const mild = at(0.27), severe = at(0.9);
  assert.ok(mild && severe, 'both pressures produce the scarcity offer');
  assert.ok(severe.reward_cr > mild.reward_cr,
    `deeper modeled scarcity pays more (${severe.reward_cr} > ${mild.reward_cr}) — payout reads the field`);
}

// ── 8. the offer routes through the EXISTING accept path and pays via economy:grantCredits ──────
function testAcceptPathAndPayout() {
  const bus = makeBus();
  const state = makeState(SCARCITY());
  const helpers = { voice: makeVoice() };

  // Real missions.js on the same bus/state — the shipped accept/track/payout lifecycle.
  const missionsSys = { ...missions };
  missionsSys.init({ bus, state, helpers });
  const sys = freshSys();
  sys.init({ bus, state, helpers });

  // The consumer role (a future missions.js seam): board the emitted offer via missions' OWN
  // ensureBoard machinery. Production economyContracts never does this — the check is the shim.
  let offer = null;
  bus.on('mission:offered', (p) => {
    if (!p || p.source !== 'economyContract') return;
    offer = p;
    const board = missionsSys.ensureBoard(p.stationId);
    if (board) board.slots.push(p);
  });

  bus.emit('dock:docked', { stationId: STATION.id });
  assert.ok(offer, 'offer emitted and boarded by the consumer shim');

  // Accept through the EXISTING intent path (ui:acceptMission → missions.acceptMission).
  bus.emit('ui:acceptMission', { missionId: offer.id });
  const accepted = bus.emitLog.filter((e) => e.evt === 'mission:accepted');
  assert.equal(accepted.length, 1, 'the real missions.js accepted the field-born offer');
  const inst = state.missions.active.find((m) => m.type === 'cargo_delivery');
  assert.ok(inst, 'a live mission instance exists');
  assert.equal(inst.params.cmdtyId, 'cmdty_fuel_cells', 'instance carries the offer params verbatim');

  // Deliver: put the fuel aboard and dock at the destination (the scarce station itself).
  const qty = inst.params.qty;
  const vol = CMDTY_BY_ID.get('cmdty_fuel_cells').volPerU || 1;
  const mass = CMDTY_BY_ID.get('cmdty_fuel_cells').massPerU || 1;
  state.player.cargo.items.cmdty_fuel_cells = qty;
  state.player.cargo.usedVolume = qty * vol;
  state.player.cargo.usedMass = qty * mass;
  bus.emit('dock:docked', { stationId: offer.destStationId });

  const completed = bus.emitLog.filter((e) => e.evt === 'mission:completed');
  assert.equal(completed.length, 1, 'delivery completed through the shipped dock-objective path');
  const grants = bus.emitLog.filter((e) => e.evt === 'economy:grantCredits'
    && e.payload && e.payload.reason === `mission:${inst.id}`);
  assert.equal(grants.length, 1, 'paid via economy:grantCredits (single-writer)');
  assert.equal(grants[0].payload.amount, offer.reward_cr, 'paid the offered field-scaled reward');
  assert.equal(state.player.cargo.items.cmdty_fuel_cells, undefined, 'the delivered fuel was consumed');
}
