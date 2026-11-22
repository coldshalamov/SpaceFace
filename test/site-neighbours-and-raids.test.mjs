// The outside half of the rock board: what a worked rock amounts to, what its neighbours do for
// it, and what a raid costs. Rules under test (src/data/sites.js NEIGHBOUR_RULES, RAID_RULES):
//   a rock joined by a line to a rock of ANOTHER trade runs faster, by more the better that
//   neighbour was dug; a belt raid the guard rating fails to meet takes up to a fifth of the stock
//   waiting at the worst-guarded rock, less the nearer the guard came; ice beside a refinery
//   really doubles what it makes.
import test from 'node:test';
import assert from 'node:assert/strict';

import { asteroidSites } from '../src/systems/asteroidSites.js';
import { NEIGHBOUR_RULES, RAID_RULES, SITE_BALANCE, classifySiteSpecialization } from '../src/data/sites.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { machineSeating, seatingGrade, siteSeating, neighbourLift, buildRockReport } from '../src/systems/siteReport.js';
import { raidWorstGuardedRock } from '../src/systems/beltEmpireSystem.js';
import { stepContinuousRecipe, processSpeedParts } from '../src/systems/siteProduction.js';
import { rockReportLines, claimedRockLine } from '../src/ui/asteroid/rockReport.js';
import { rockName } from '../src/ui/asteroid/rockNames.js';
import { registerWorldBeats } from '../src/ui/worldNewsBeats.js';
import { attentionAdmits } from '../src/ui/attentionGlass.js';

function makeHarness() {
  const handlers = new Map();
  const bus = {
    events: [],
    on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); return () => {}; },
    emit(name, payload) { this.events.push({ name, payload }); for (const fn of handlers.get(name) || []) fn(payload); },
  };
  const entities = new Map();
  const state = {
    simTime: 0, tick: 0, meta: { seed: 73 }, entities, playerId: 1,
    player: { cargo: { items: { cmdty_regocrete: 80, cmdty_control_unit: 20, cmdty_refined_metals: 30, cmdty_electronics: 20, cmdty_alloys: 30 },
      usedVolume: 0, usedMass: 0, capVolume: 2000, capMass: 4000 } },
    world: { currentSectorId: 'sec_core_alpha' },
    content: { commodities: COMMODITIES },
  };
  const registry = { get: (name) => (name === 'automation' ? { creditPassive: (gross) => Math.round(gross) } : null) };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers: { spawnEntity(spec) { const e = { id: 9000 + entities.size, alive: true, ...spec, data: spec.data || {} }; entities.set(e.id, e); return e; } }, registry });
  return { sys, state, bus, entities };
}

function claim(h, asteroidId, template, pos) {
  h.entities.set(asteroidId, { id: asteroidId, type: 'asteroid', alive: true, pos, radius: 10,
    data: { typeId: 'ast_common_rock', yieldU: 28, drillCleared: [], fieldId: 'field_alpha' } });
  const res = h.sys.commissionFieldAsteroid(asteroidId, template);
  assert.equal(res.ok, true, `claim ${asteroidId}: ${res.reason}`);
  return h.sys.getSite(res.siteId);
}

const step = (h, seconds) => {
  for (let i = 0; i < seconds; i++) { h.state.simTime += 1; h.state.tick += 1; h.sys.update(1, h.state); }
};

const stockOf = (h, site) => {
  h.sys._runtime(site);
  let n = 0;
  for (const lane of site.laneStores || []) for (const q of Object.values(lane.store || {})) n += Number(q) || 0;
  for (const q of Object.values(site.exportBuffer || {})) n += Number(q) || 0;
  // Part-made units still inside the machines count: stores only ever hold whole units.
  for (const m of site.machines) for (const q of Object.values(m.carry || {})) n += Number(q) || 0;
  return n;
};

test('seating: a machine is graded on the share of useful rock it touches', () => {
  const ext = { id: 'm1', defId: 'sm_extractor', mode: null };
  assert.equal(machineSeating(ext, { solid: 6, ores: {} }), 1, 'six contacts is a full seat');
  assert.equal(machineSeating(ext, { solid: 3, ores: {} }), 0.5);
  assert.equal(machineSeating({ id: 'c', defId: 'sm_massline_core' }, { solid: 8, ores: {} }), null, 'a Core reads no rock');
  const smelt = { id: 'm2', defId: 'sm_refinery', mode: 'sr_smelt_iron' };
  assert.equal(machineSeating(smelt, { solid: 4, ores: { cmdty_ore_iron: 4 } }), 1, 'four matched faces');
  assert.equal(machineSeating(smelt, { solid: 2, ores: { cmdty_ice_water: 2 } }), 1, 'two ice cells');
  assert.equal(machineSeating(smelt, { solid: 3, ores: { cmdty_ore_iron: 1, cmdty_ice_water: 1 } }), 0.75);
  assert.equal(machineSeating(smelt, { solid: 5, ores: {} }), 0, 'rock the recipe cannot use is no seat');
  assert.deepEqual([1, 0.8, 0.79, 0.6, 0.35, 0.1].map(seatingGrade), ['A', 'A', 'B', 'B', 'C', 'D']);
  const whole = siteSeating({ machines: [ext, smelt, { id: 'c', defId: 'sm_massline_core' }] },
    { m1: { solid: 6, ores: {} }, m2: { solid: 2, ores: { cmdty_ore_iron: 2 } } });
  assert.equal(whole.counted, 2);
  assert.equal(whole.share, 0.75);
  assert.equal(whole.grade, 'B');
  assert.equal(siteSeating({ machines: [] }).grade, null);
});

test('neighbours: only a linked rock of another trade lifts, once per trade, three trades at most', () => {
  const mk = (id, machines, extra = {}) => ({ id, anchored: true, sectorId: 's', machines: machines.map((defId, i) => ({ id: `${id}m${i}`, defId })), links: [], ...extra });
  const mine = mk('a', ['sm_extractor']);
  const twin = mk('b', ['sm_extractor']);
  const smelter = mk('c', ['sm_refinery']);
  const worse = mk('d', ['sm_refinery']);
  const fab = mk('e', ['sm_fabricator']);
  const fort = mk('f', ['sm_massline_core'], { defenses: [{ kind: 'turret' }, { kind: 'turret' }] });
  const bare = mk('g', ['sm_massline_core']);
  const far = mk('h', ['sm_refinery'], { sectorId: 'elsewhere' });
  const byId = { a: mine, b: twin, c: smelter, d: worse, e: fab, f: fort, g: bare, h: far };
  const share = { a: 1, b: 1, c: 0.8, d: 0.4, e: 0.5, f: null, g: null, h: 1 };
  const lift = () => neighbourLift(mine, byId, (s) => share[s.id]);

  assert.equal(lift().mult, 1, 'no line, no lift');
  mine.links = [{ targetSiteId: 'b', kind: 'material', active: true }];
  assert.equal(lift().mult, 1, 'a twin of the same trade adds nothing');
  assert.equal(lift().linked, 1);
  worse.links = [{ targetSiteId: 'a', kind: 'power', active: true }];
  assert.equal(lift().mult, 1.04, 'a line INTO this rock counts too; a poorly dug smelter gives 4%');
  mine.links.push({ targetSiteId: 'c', kind: 'material', active: true });
  assert.equal(lift().mult, 1.08, 'the trade counts once, at its best-dug example');
  assert.equal(lift().rows[0].siteId, 'c');
  assert.equal(lift().rows[0].grade, 'A');
  mine.links.push({ targetSiteId: 'g', kind: 'material', active: true }, { targetSiteId: 'h', kind: 'material', active: true });
  assert.equal(lift().mult, 1.08, 'a bare claim has no trade, and another sector is not a neighbour');
  mine.links.push({ targetSiteId: 'e', kind: 'material', active: true }, { targetSiteId: 'f', kind: 'material', active: true });
  const full = lift();
  assert.equal(full.rows.length, NEIGHBOUR_RULES.maxTrades);
  assert.equal(full.mult, 1.18, 'smelter 8% + fabricator 5% + fort (no rock-reading machine) 5%');
  mine.links[1].active = false;
  assert.equal(lift().rows.find((r) => r.roleId === 'smelting').siteId, 'd', 'a cut line stops counting');
});

test('a trade cannot be flipped with a cable or a turret: two identical mines never lift each other', () => {
  const mk = (id, extra = {}) => ({ id, anchored: true, sectorId: 's', links: [],
    machines: [{ id: `${id}c`, defId: 'sm_massline_core' }, { id: `${id}e`, defId: 'sm_extractor' }], ...extra });
  // A power line between twin mines used to make the sender a "power hub".
  const a = mk('a', { links: [{ targetSiteId: 'b', kind: 'power', active: true }] });
  const b = mk('b');
  assert.equal(neighbourLift(a, { a, b }, () => 1).mult, 1);
  assert.equal(neighbourLift(b, { a, b }, () => 1).mult, 1);
  // Two turrets beside a mine used to make it a "bastion". Guarding a rock must not change its trade.
  const c = mk('c', { defenses: [{ kind: 'turret' }, { kind: 'turret' }], links: [{ targetSiteId: 'd', kind: 'material', active: true }] });
  const d = mk('d');
  assert.equal(classifySiteSpecialization(c).id, 'extraction');
  assert.equal(neighbourLift(c, { c, d }, () => 1).mult, 1);
  assert.equal(neighbourLift(d, { c, d }, () => 1).mult, 1);
  // A gas-tap rock is a power rock whether or not it has run a line yet.
  assert.equal(classifySiteSpecialization({ machines: [{ defId: 'sm_gas_tap' }] }).id, 'powerhouse');
  assert.equal(classifySiteSpecialization({ machines: [{ defId: 'sm_massline_core' }], links: [{ kind: 'power', active: true }] }).id, 'outpost');
});

test('a mixed pair of rocks out-produces the same two rocks unlinked', () => {
  const run = (linked) => {
    const h = makeHarness();
    const mine = claim(h, 7001, 'extractor', { x: 0, z: 0 });
    const works = claim(h, 7002, 'refinery', { x: 300, z: 0 });
    if (linked) assert.equal(h.sys.setSiteLink(works.id, mine.id, 'power').ok, true);
    step(h, 240);
    return { h, mine, works, made: stockOf(h, mine), lift: h.sys.neighbourLift(mine) };
  };
  const alone = run(false);
  const joined = run(true);
  // The number a player READS moves too: the rock card's "Makes" comes from the supply ledger,
  // and the ledger carries the same multiplier the tick applies.
  const shown = (r) => r.h.sys.sectorNetworkProjection('sec_core_alpha').sites.find((s) => s.siteId === r.mine.id).report;
  const perMin = (rep) => rep.makes.reduce((s, m) => s + m.perMin, 0);
  assert.ok(perMin(shown(alone)) > 0);
  assert.ok(Math.abs(perMin(shown(joined)) / perMin(shown(alone)) - joined.lift.mult) < 0.01,
    `card shows ${perMin(shown(joined))} linked against ${perMin(shown(alone))} alone`);
  assert.equal(alone.lift.mult, 1);
  assert.ok(joined.lift.mult > 1.02, `the smelter next door lifts the mine (${joined.lift.mult})`);
  assert.ok(alone.made > 0, 'the mine makes something on its own');
  const ratio = joined.made / alone.made;
  assert.ok(Math.abs(ratio - joined.lift.mult) < 0.03,
    `linked output ${joined.made} / alone ${alone.made} = ${ratio.toFixed(3)}, rule says ${joined.lift.mult}`);
  // The lift is derived, never saved: a reload reads the same number from the same rocks.
  const data = JSON.parse(JSON.stringify(joined.h.sys.serialize()));
  assert.doesNotMatch(JSON.stringify(data), /"(neighbours|seating|report|lift)":/);
});

test('how the neighbour was dug matters: strip its contacts and the lift it gives falls', () => {
  const h = makeHarness();
  const mine = claim(h, 7001, 'extractor', { x: 0, z: 0 });
  const works = claim(h, 7002, 'refinery', { x: 300, z: 0 });
  h.sys.setSiteLink(works.id, mine.id, 'power');
  const before = h.sys.neighbourLift(works);
  assert.equal(before.rows[0].roleId, 'extraction');
  // Hollow out every cell around the mine's extractor.
  const ext = mine.machines.find((m) => m.defId === 'sm_extractor');
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
    const idx = (ext.row + dr) * 28 + (ext.col + dc);
    if ((dc || dr) && !mine.cleared.includes(idx)) mine.cleared.push(idx);
  }
  h.sys._markDirty(mine.id, { field: true, net: true });
  const after = h.sys.neighbourLift(works);
  assert.equal(h.sys.siteSeating(mine).share, 0);
  assert.equal(after.mult, 1, 'an extractor touching no rock is worth nothing to the smelter next door');
  assert.ok(before.mult > after.mult);
});

test('ice really doubles a refinery: the step makes twice the metal, not 1.6 times', () => {
  const run = (speedMultiplier) => {
    const store = { cmdty_ore_iron: 500 };
    const carry = {};
    let made = 0;
    for (let i = 0; i < 600; i++) {
      const res = stepContinuousRecipe({ recipeId: 'sr_smelt_iron', dtMin: 1 / 60, powerRatio: 1, store,
        roomFor: () => 1e6, carry, throughputBudget: Infinity, processMultiplier: 1.6, speedMultiplier });
      made += Object.values(res.produced).reduce((s, n) => s + n, 0);
    }
    return made + (carry.cmdty_refined_metals || 0);
  };
  const plain = run(1);
  const cooled = run(2);
  assert.ok(plain > 0);
  assert.ok(Math.abs(cooled / plain - 2) < 0.02, `cooled ${cooled} vs plain ${plain}`);
  assert.deepEqual(processSpeedParts({ processMultiplier: 3.2, coolMultiplier: 2 }), { processMultiplier: 1.6, speedMultiplier: 2 });
  assert.deepEqual(processSpeedParts({ processMultiplier: 1.3 }), { processMultiplier: 1.3, speedMultiplier: 1 });
});

test('a raid takes up to a fifth of the stock at the worst-guarded rock, less with part of a guard, nothing with a full one', () => {
  const h = makeHarness();
  const a = claim(h, 7001, 'extractor', { x: 0, z: 0 });
  const b = claim(h, 7002, 'extractor', { x: 300, z: 0 });
  h.sys._runtime(a); h.sys._runtime(b);
  a.laneStores[0].store.cmdty_ore_iron = 40;
  a.exportBuffer.cmdty_silicate = 10;
  b.laneStores[0].store.cmdty_ore_iron = 80;
  assert.equal(h.sys.deploySiteDefense(b.id, 'turret').ok, true);
  const matrix = h.sys.sectorNetworkProjection('sec_core_alpha').supplyMatrix;
  const hit = raidWorstGuardedRock(h.sys, 'sec_core_alpha', matrix);
  assert.equal(hit.siteId, a.id, 'the rock with no turret is the one they hit');
  assert.deepEqual(hit.taken, { cmdty_ore_iron: 8, cmdty_silicate: 2 });
  assert.equal(hit.units, 10);
  assert.equal(a.laneStores[0].store.cmdty_ore_iron, 32);
  assert.equal(a.exportBuffer.cmdty_silicate, 8);
  // Half the guard the belt needs keeps half of what an unguarded belt would lose.
  a.laneStores[0].store.cmdty_ore_iron = 40; a.exportBuffer.cmdty_silicate = 10;
  const half = raidWorstGuardedRock(h.sys, 'sec_core_alpha', matrix, 0.5);
  assert.deepEqual(half.taken, { cmdty_ore_iron: 4, cmdty_silicate: 1 });
  assert.equal(raidWorstGuardedRock(h.sys, 'sec_core_alpha', matrix, 0), null, 'a full guard loses nothing');
  assert.equal(b.laneStores[0].store.cmdty_ore_iron, 80, 'the guarded rock is left alone');
  assert.equal(a.machines.length, 3, 'nothing is ever broken');
  assert.match(a.ledger[0].text, /Raiders took \d+ units/);
  // A rock holding less than the minimum is not worth the trip.
  a.laneStores[0].store.cmdty_ore_iron = 2; a.exportBuffer.cmdty_silicate = 2;
  b.laneStores[0].store = {};
  assert.equal(raidWorstGuardedRock(h.sys, 'sec_core_alpha', matrix), null);
  assert.ok(RAID_RULES.minStockU > 4);

  // Through the live belt step: an unguarded pair of rocks is raided, the event names the rock.
  const live = makeHarness();
  const p = claim(live, 7001, 'extractor', { x: 0, z: 0 });
  claim(live, 7002, 'extractor', { x: 300, z: 0 });
  live.sys._runtime(p);
  p.laneStores[0].store.cmdty_ore_iron = 60;
  step(live, 185);
  const raided = live.bus.events.filter((e) => e.name === 'site:raided');
  assert.ok(raided.length >= 1, 'the raid fired');
  assert.ok(raided[0].payload.units > 0);
  assert.match(live.state.sites.empire.raidStatus.lastMessage, /Raiders took \d+ units from your worst-guarded rock\. Guard 0 of \d+ needed\./);

  // Same belt with enough guard: nothing is taken.
  const safe = makeHarness();
  const q = claim(safe, 7001, 'extractor', { x: 0, z: 0 });
  const r = claim(safe, 7002, 'extractor', { x: 300, z: 0 });
  for (let i = 0; i < 3; i++) { safe.sys.deploySiteDefense(q.id, 'turret'); safe.sys.deploySiteDefense(r.id, 'turret'); }
  step(safe, 185);
  assert.equal(safe.bus.events.filter((e) => e.name === 'site:raided').length, 0);
  assert.match(safe.state.sites.empire.raidStatus.lastMessage, /Raiders looked this belt over and left/);
});

test('the rock report: one summary a player reads on the belt and on the way out of the rock', () => {
  const h = makeHarness();
  const mine = claim(h, 7001, 'extractor', { x: 0, z: 0 });
  const works = claim(h, 7002, 'refinery', { x: 300, z: 0 });
  h.sys.setSiteLink(mine.id, works.id, 'material');
  step(h, 30);
  const net = h.sys.sectorNetworkProjection('sec_core_alpha');
  const node = net.sites.find((s) => s.siteId === mine.id);
  const rep = node.report;
  assert.equal(rep.role.id, 'extraction');
  assert.ok(rep.makes.length >= 1, 'it names what the rock makes');
  assert.ok(rep.makes.every((m) => m.perMin > 0));
  assert.ok(['A', 'B', 'C', 'D'].includes(rep.seating.grade));
  assert.equal(rep.lift.rows[0].roleId, 'smelting');
  assert.ok(rep.lift.mult > 1);
  const worksRep = net.sites.find((s) => s.siteId === works.id).report;
  assert.ok(worksRep.wants.some((w) => w.goodId === 'cmdty_ore_iron') || worksRep.makes.some((m) => m.goodId === 'cmdty_refined_metals'),
    'the smelter rock wants ore or makes metal');

  const nameOf = (id) => ({ 7001: 'Cold Anchor', 7002: 'Brass Kettle' })[id] || 'a rock';
  const lines = rockReportLines(rep, { nameOf });
  const text = lines.map((l) => `${l.label}: ${l.value}`).join('\n');
  assert.match(text, /Makes: .+ a minute/);
  assert.match(text, /Dug: grade [ABCD]/);
  assert.match(text, /Neighbours: \+\d+% from Brass Kettle/);
  assert.doesNotMatch(text, /site_\d|cmdty_|undefined|NaN|[—–]/, 'no ids, no dashes');

  // The cockpit's target card says the same thing in one line, for a rock the pilot owns only.
  const rockEnt = h.entities.get(7001);
  assert.match(claimedRockLine(rockEnt, h.state), /^Your claim: mining, grade [ABCD] · 3 machines · 1 line out$/);
  h.entities.set(7003, { id: 7003, type: 'asteroid', alive: true, pos: { x: 900, z: 0 }, data: {} });
  assert.equal(claimedRockLine(h.entities.get(7003), h.state), null, 'an unclaimed rock says nothing');
  const mirrorBefore = JSON.stringify(h.state.sites.byId[mine.id]);
  claimedRockLine(rockEnt, h.state);
  assert.equal(JSON.stringify(h.state.sites.byId[mine.id]), mirrorBefore, 'reading the line writes nothing');

  // An empty report still reads as sentences.
  const bare = rockReportLines(buildRockReport({ specialization: { id: 'outpost', label: 'Anchored Claim' } }), { nameOf });
  assert.ok(bare.some((l) => /Nothing yet/.test(l.value)));
  assert.ok(bare.some((l) => /No line to another rock/.test(l.value)));
  assert.equal(SITE_BALANCE.linkRangeWu > 0, true);
});

test('a raid reaches the pilot: one news sentence naming the rock, a guard line on its card', () => {
  const handlers = {};
  const state = { simTime: 400, ui: {}, world: { currentSectorId: 'sec_core_alpha' } };
  registerWorldBeats((name, fn) => { handlers[name] = fn; }, state);
  assert.equal(typeof handlers['site:raided'], 'function', 'the raid event has a listener');
  const headline = handlers['site:raided']({ siteId: 'site_1', asteroidId: 7001, units: 12, taken: { cmdty_ore_iron: 12 } });
  assert.equal(headline.text, `Raiders took 12 units from ${rockName(7001)}, your worst-guarded rock.`);
  assert.doesNotMatch(headline.text, /site_\d|cmdty_|[—–]/);
  assert.equal((headline.text.match(/[.!?]/g) || []).length, 1, 'one sentence: the flight glass drops prose of two');
  assert.equal(handlers['site:raided']({ siteId: 'site_1', units: 0 }), null, 'a raid that took nothing is not news');

  // The rock card names the guard only once raiders are testing the belt.
  const rep = buildRockReport({ specialization: { id: 'extraction', label: 'Extraction Rig' }, matrixRow: { defenseRating: 0, netMw: 0 } });
  assert.equal(rockReportLines(rep).some((l) => l.id === 'guard'), false);
  const guard = rockReportLines(rep, { raidPressure: 55 }).find((l) => l.id === 'guard');
  assert.equal(guard.value, 'None. Raiders go for the worst-guarded rock first');
  const held = rockReportLines({ ...rep, defended: 50 }, { raidPressure: 55 }).find((l) => l.id === 'guard');
  assert.equal(held.value, '50 of the 55 this belt needs between all its rocks');
  assert.equal(typeof attentionAdmits, 'function');
});

test('forty names a side: twenty rocks in a belt rarely share one', () => {
  let clashes = 0;
  for (let belt = 0; belt < 200; belt++) {
    const names = new Set();
    for (let i = 0; i < 6; i++) names.add(rockName(belt * 97 + i * 13 + 200));
    if (names.size < 6) clashes++;
  }
  assert.ok(clashes <= 6, `${clashes} of 200 six-claim belts had two claims with one name`);
});
