#!/usr/bin/env node
// check-living-universe-events.mjs — event-level truths for the campaign director's shapes.
//
// Runs surgical, force-fired scenarios through a REAL headless stack (economy, cargo, factions,
// heat, salvage where relevant) and asserts the brief's contract:
//   • pirate toll has Pay / Refuse / Run outcomes; paying charges credits through the economy
//     intent and spawns no hostiles; refusing turns the squad hostile under one encounterId;
//     running can end in a clean escape.
//   • patrol scan never attacks a clean player; clean → clear receipt + tiny rep; contraband →
//     fine/confiscation/heat through economy's own runScan; run/dump/bribe paths work.
//   • distress is genuinely 60/40 across the seed corpus; rescue pays rep+credits through
//     intents; bait springs; ignoring is unpunished and silent.
//   • convoy arrival applies BOUNDED economy pressure (|vol| ≤ 12) via economy:applyTradePressure;
//     robbing it kills the delivery and wakes the escorts.
//   • salvage/black-box signal rides the real salvage system and emits mission + receipt hooks.
//   • a killed named captain stays dead in persistent state; an engaged escape deepens the grudge.

import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector, planEncounterShape } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { salvage } from '../src/systems/salvage.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { ENCOUNTERS, NAMED_CAPTAINS, CONVOY_CARGO } from '../src/data/encounters.js';
import { planEncounters } from '../src/systems/encounterDirector.js';
import { mulberry32, hash32 } from '../src/core/rng.js';

let sections = 0;
function ok(label) { sections++; console.log(`  ✓ ${label}`); }

// ── harness ──────────────────────────────────────────────────────────────────────────────────────
function boot(seed, sectorId, pos, opts = {}) {
  const systems = opts.systems || [spawnBudget, cargo, economy, factions, heat, encounterDirector];
  const sim = createSimulation({ seed, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6 });
  state.playerId = player.id;
  if (opts.cargo) state.player.cargo.items = { ...opts.cargo };
  if (opts.credits != null) state.player.credits = opts.credits;
  const log = { events: [], receipts: [], resolved: [], choices: [], voice: [], pressure: [], credits: [] };
  bus.on('encounter:receipt', (p) => log.receipts.push(p));
  bus.on('encounter:resolved', (p) => log.resolved.push(p));
  bus.on('encounter:choiceOffered', (p) => log.choices.push(p));
  bus.on('encounter:voice', (p) => log.voice.push(p));
  bus.on('economy:applyTradePressure', (p) => log.pressure.push(p));
  bus.on('credits:changed', (p) => log.credits.push(p));
  bus.on('faction:repDelta', (p) => log.events.push({ n: 'repDelta', ...p }));
  bus.on('contraband:scanned', (p) => log.events.push({ n: 'scanned', ...p }));
  bus.on('player:scannedByPatrol', (p) => log.events.push({ n: 'patrolScan', ...p }));
  bus.on('distress:rescued', (p) => log.events.push({ n: 'rescued', ...p }));
  bus.on('mission:offered', (p) => log.events.push({ n: 'missionOffered', offerId: p.offerId }));
  bus.on('cruise:snareRequest', (p) => log.events.push({ n: 'snareReq' }));
  bus.emit('sector:enter', { sectorId });
  return { sim, state, bus, player, log };
}

function forceFire(sim, shapeId, sectorId, opts = {}) {
  const state = sim.state;
  const inst = sim.registry.get('encounterDirector');
  const dir = state.encounterDirector;
  const shape = ENCOUNTERS[shapeId];
  let item = opts.item;
  if (!item) {
    const zones = zonesForSector(sectorId).filter((z) => shape.zoneTypes.includes(z.type));
    assert(zones.length, `${sectorId} has no zone for ${shapeId}`);
    item = planEncounterShape(shape, opts.zone || zones[0], sectorId, 0, 50, mulberry32(hash32(state.meta.seed, shapeId, 'force')));
  }
  item.sectorId = sectorId;
  dir.pressure[shape.deck] = 140;
  inst._fire(dir, state, item, shape, state.simTime || 0);
  return { item, live: dir.live[item.encounterId] || null, id: item.encounterId };
}

function tickS(sim, seconds) { sim.runTicks(Math.round(seconds * 60)); }

function squadEnts(state, live) {
  return live.ids.map((id) => state.entities.get(id)).filter((e) => e && e.alive !== false);
}

function killAs(sim, ids, killerId) {
  for (const id of ids.slice()) {
    const e = sim.state.entities.get(id);
    if (!e || e.alive === false) continue;
    sim.bus.emit('entity:killed', { id, killerId, pos: { x: e.pos.x, z: e.pos.z } });
    e.alive = false;
  }
}

const TETHYS_LANE = { x: 500, z: 1500 };      // Junction Trade Lane center
const HELIOS_CORE = { x: 400, z: 0 };         // Concord Core center
const SKER_DEEP = { x: -540, z: 680 };        // Skerris Deep center

// ── A/B/C. pirate toll: pay / refuse / run ───────────────────────────────────────────────────────
{
  // PAY — via the deterministic choice bridge. Credits move through economy; nobody turns hostile.
  const { sim, state, log } = boot(11, 'sector_tethys_junction', TETHYS_LANE, { cargo: { cmdty_refined_metals: 12 }, credits: 1000 });
  const { live, id } = forceFire(sim, 'pirate_toll', 'sector_tethys_junction');
  assert(live && live.ids.length >= 2, 'toll squad spawned');
  const offer = log.choices.find((c) => c.encounterId === id);
  assert(offer, 'toll offers a choice');
  assert.deepEqual(offer.options.map((o) => o.id), ['pay', 'refuse', 'run'], 'toll choices are Pay/Refuse/Run');
  assert.equal(offer.timeoutChoice, 'refuse', 'toll timeout default is deterministic (refuse)');
  for (const e of squadEnts(state, live)) {
    assert.equal(e.data.ai.passive, true, 'toll squad holds fire during the demand');
    assert.equal(isHostileToPlayer(e, 0, state), false, 'toll squad reads non-hostile during the demand');
    assert.equal(e.data.ai.encounterId, id, 'squad tagged with shared encounterId');
  }
  sim.bus.emit('encounter:choose', { encounterId: id, choiceId: 'pay' });
  tickS(sim, 3);
  assert.equal(state.player.credits, 880, `paying charges min(12% cargo, 400)=120 via economy (got ${state.player.credits})`);
  assert(log.credits.some((c) => c.reason === 'toll:reach' && c.delta === -120), 'credits moved through economy:chargeCredits intent');
  const res = log.resolved.find((r) => r.encounterId === id);
  assert(res && res.outcome === 'paid', 'toll resolves as paid');
  assert(log.receipts.some((r) => r.encounterId === id && /TOLL PAID/.test(r.text)), 'toll paid receipt');
  for (const e of squadEnts(state, live)) assert.equal(isHostileToPlayer(e, 0, state), false, 'paid toll spawns no hostiles');
  ok('pirate toll PAY: choice bridge, economy intent (−120 cr), zero hostiles, receipt');
}
{
  // REFUSE — squad turns hostile under one encounterId; clearing them resolves with a receipt.
  const { sim, state, log } = boot(12, 'sector_tethys_junction', TETHYS_LANE, { cargo: { cmdty_refined_metals: 12 }, credits: 1000 });
  const { live, id } = forceFire(sim, 'pirate_toll', 'sector_tethys_junction');
  sim.bus.emit('encounter:choose', { encounterId: id, choiceId: 'refuse' });
  tickS(sim, 2);
  const ents = squadEnts(state, live);
  assert(ents.length >= 2, 'refused toll squad lives');
  for (const e of ents) {
    assert.equal(!!e.data.ai.passive, false, 'refused toll squad goes weapons-free');
    assert.equal(isHostileToPlayer(e, 0, state), true, 'refused toll squad reads hostile');
    assert.equal(e.data.ai.encounterId, id, 'hostiles share the encounter id');
  }
  assert.equal(state.player.credits, 1000, 'refusing charges nothing');
  killAs(sim, live.ids, state.playerId);
  tickS(sim, 2);
  assert(log.resolved.some((r) => r.encounterId === id && r.outcome === 'cleared'), 'clearing refused toll resolves');
  assert(log.receipts.some((r) => r.encounterId === id && /RAIDERS DOWN/.test(r.text)), 'cleared receipt');
  ok('pirate toll REFUSE: hostile squad, shared encounterId, cleared receipt');
}
{
  // RUN — pursuit goes live; real distance ends it as escaped.
  const { sim, state, player, log } = boot(13, 'sector_tethys_junction', TETHYS_LANE, { cargo: { cmdty_refined_metals: 12 }, credits: 500 });
  const { live, id } = forceFire(sim, 'pirate_toll', 'sector_tethys_junction');
  sim.bus.emit('encounter:choose', { encounterId: id, choiceId: 'run' });
  tickS(sim, 1);
  for (const e of squadEnts(state, live)) assert.equal(!!e.data.ai.passive, false, 'runners get pursued');
  player.pos.x += 6000;
  tickS(sim, 3);
  assert(log.resolved.some((r) => r.encounterId === id && r.outcome === 'escaped'), 'outrunning the toll resolves as escaped');
  assert(log.receipts.some((r) => r.encounterId === id && /TOLL EVADED/.test(r.text)), 'escape receipt');
  assert.equal(state.player.credits, 500, 'running charges nothing');
  ok('pirate toll RUN: pursuit then clean escape, receipt, no charge');
}

// ── D–H. patrol scan: clean / fine / run / dump / bribe ─────────────────────────────────────────
{
  // CLEAN — lawful patrol never hostile; clear receipt + tiny rep through the factions intent.
  const { sim, state, log } = boot(21, 'sector_helios_prime', HELIOS_CORE, { credits: 300 });
  const { live, id } = forceFire(sim, 'patrol_scan', 'sector_helios_prime');
  const offer = log.choices.find((c) => c.encounterId === id);
  assert(offer, 'scan offers choices');
  assert.deepEqual(offer.options.map((o) => o.id), ['submit', 'run'], 'clean player sees submit/run only');
  let everHostile = false;
  for (let s = 0; s < 12; s++) {
    tickS(sim, 1);
    for (const e of squadEnts(state, live)) if (isHostileToPlayer(e, 0, state)) everHostile = true;
  }
  assert.equal(everHostile, false, 'lawful patrol NEVER hostile to a clean player');
  assert(log.events.some((e) => e.n === 'patrolScan' && e.hasContraband === false), 'real economy scan ran');
  assert(log.resolved.some((r) => r.encounterId === id && r.outcome === 'clean'), 'clean scan resolves');
  assert(log.receipts.some((r) => r.encounterId === id && /SCAN CLEAR/.test(r.text)), 'clear receipt');
  assert(log.events.some((e) => e.n === 'repDelta' && e.factionId === 'faction_scn' && e.delta === 1), 'tiny rep gain intent');
  ok('patrol scan CLEAN: no hostility ever, economy scan, clear receipt, +1 rep intent');
}
{
  // CONTRABAND → SUBMIT — the fine/confiscation/heat chain is economy's own machinery.
  let caught = null;
  for (let seed = 1; seed <= 16 && !caught; seed++) {
    const t = boot(seed, 'sector_helios_prime', HELIOS_CORE, { cargo: { cmdty_narcotics: 4 }, credits: 4000 });
    const { id } = forceFire(t.sim, 'patrol_scan', 'sector_helios_prime');
    tickS(t.sim, 12);
    const scanned = t.log.events.find((e) => e.n === 'scanned' && e.found);
    if (scanned) caught = { ...t, id, scanned };
  }
  assert(caught, 'a seed in 1..16 must produce a caught contraband scan (pScan≈0.5 at Helios security)');
  const { state, log, id, scanned } = caught;
  assert(scanned.fine > 0, 'fine computed');
  assert.equal(state.player.cargo.items.cmdty_narcotics || 0, 0, 'contraband confiscated by economy');
  assert(log.credits.some((c) => c.reason === 'fine:contraband' && c.delta < 0), 'fine charged via economy');
  assert(log.resolved.some((r) => r.encounterId === id && r.outcome === 'fined'), 'scan resolves as fined');
  assert(log.receipts.some((r) => r.encounterId === id && /FINED/.test(r.text)), 'fined receipt');
  assert(state.player.heat > 0.1, 'contraband bust raises WANTED heat through heat\'s own listener');
  ok('patrol scan CONTRABAND: economy fine + confiscation, heat rises via heat system, receipt');
}
{
  // RUN — refusing the scan is a rep nick and a flag, never an attack on an unproven player.
  const { sim, state, player, log } = boot(23, 'sector_helios_prime', HELIOS_CORE, { cargo: { cmdty_narcotics: 3 }, credits: 500 });
  const { live, id } = forceFire(sim, 'patrol_scan', 'sector_helios_prime');
  tickS(sim, 2);
  player.pos.x += 4000;
  tickS(sim, 4);
  assert(log.resolved.some((r) => r.encounterId === id && r.outcome === 'ran'), 'running resolves as ran');
  assert(log.receipts.some((r) => r.encounterId === id && /SCAN REFUSED/.test(r.text)), 'refused receipt');
  assert(log.events.some((e) => e.n === 'repDelta' && e.factionId === 'faction_scn' && e.delta === -3), 'rep nick intent');
  assert(!log.events.some((e) => e.n === 'scanned'), 'no scan completed — no fine, no confiscation');
  assert.equal(state.player.heat, 0, 'no heat without proof (WANTED comes only from heat\'s own inputs)');
  for (const e of squadEnts(state, live)) assert.equal(isHostileToPlayer(e, 0, state), false, 'patrol does not attack the runner');
  ok('patrol scan RUN: flagged + rep nick, zero heat, zero hostility');
}
{
  // DUMP — jettison through cargo's own writer; the scan then reads clean.
  const { sim, state, log } = boot(24, 'sector_helios_prime', HELIOS_CORE, { cargo: { cmdty_narcotics: 3, cmdty_ore_iron: 5 }, credits: 500 });
  const { id } = forceFire(sim, 'patrol_scan', 'sector_helios_prime');
  const offer = log.choices.find((c) => c.encounterId === id);
  assert.deepEqual(offer.options.map((o) => o.id), ['submit', 'bribe', 'dump', 'run'], 'contraband unlocks bribe/dump');
  sim.bus.emit('encounter:choose', { encounterId: id, choiceId: 'dump' });
  tickS(sim, 1);
  assert.equal(state.player.cargo.items.cmdty_narcotics || 0, 0, 'contraband jettisoned via cargo.removeCargo');
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 5, 'legal cargo untouched');
  tickS(sim, 11);
  assert(log.resolved.some((r) => r.encounterId === id && r.outcome === 'clean'), 'post-dump scan reads clean');
  ok('patrol scan DUMP: contraband jettisoned (cargo-owned write), scan clears');
}
{
  // BRIBE — 30% of the would-be fine through economy's contraband:bribe intent; no scan happens.
  const { sim, state, log } = boot(25, 'sector_helios_prime', HELIOS_CORE, { cargo: { cmdty_narcotics: 4 }, credits: 4000 });
  const { id } = forceFire(sim, 'patrol_scan', 'sector_helios_prime');
  sim.bus.emit('encounter:choose', { encounterId: id, choiceId: 'bribe' });
  tickS(sim, 2);
  const fine = Math.round(220 * 4 * 1.5);              // basePrice × qty × contraband mult
  const bribe = Math.round(fine * 0.3);
  assert(log.credits.some((c) => c.reason === 'bribe:contraband' && c.delta === -bribe), `bribe charges ${bribe} via economy`);
  assert(log.resolved.some((r) => r.encounterId === id && r.outcome === 'bribed'), 'resolves as bribed');
  assert.equal(state.player.cargo.items.cmdty_narcotics, 4, 'bribed patrol never scans — cargo keeps');
  assert(log.events.some((e) => e.n === 'repDelta' && e.delta === -2), 'bribe rep consequence');
  ok('patrol scan BRIBE: 30% fine via contraband:bribe, cargo kept, rep consequence');
}

// ── I. distress: 60/40 corpus, rescue, bait, ignore ─────────────────────────────────────────────
function craftDistress(sectorId, wantKind) {
  const shape = ENCOUNTERS.distress_call;
  const zones = zonesForSector(sectorId).filter((z) => shape.zoneTypes.includes(z.type));
  for (let s = 1; s < 300; s++) {
    const item = planEncounterShape(shape, zones[0], sectorId, 0, 500 + s, mulberry32(hash32(s, 'craft-distress')));
    if (item.variantKind === wantKind) return item;
  }
  throw new Error(`no seed produced ${wantKind}`);
}
{
  // Corpus: both variants occur across seeds; genuine dominates ~60/40.
  let genuine = 0, bait = 0;
  for (let seed = 1; seed <= 80; seed++) {
    for (let day = 0; day < 2; day++) {
      for (const it of planEncounters(seed, 'sector_ceres_belt', day, zonesForSector('sector_ceres_belt'))) {
        if (it.variantKind === 'distress_genuine') genuine++;
        if (it.variantKind === 'distress_bait') bait++;
      }
    }
  }
  assert(genuine >= 3 && bait >= 3, `both distress variants must occur across the corpus (genuine=${genuine}, bait=${bait})`);
  assert(genuine > bait, '60/40: genuine outnumbers bait');
  ok(`distress corpus: genuine=${genuine} bait=${bait} across 80 seeds × 2 days`);
}
{
  // GENUINE RESCUE — drive off the harriers, victim lives: pay + rep event + receipt.
  const { sim, state, player, log } = boot(31, 'sector_ceres_belt', { x: 240, z: -1180 }, { credits: 100 });
  const item = craftDistress('sector_ceres_belt', 'distress_genuine');
  const { live, id } = forceFire(sim, 'distress_call', 'sector_ceres_belt', { item });
  const victim = squadEnts(state, live).find((e) => live.roles[e.id] === 'victim');
  assert(victim && victim.team === 2 && victim.hull < victim.hullMax, 'victim is a holed civilian (team 2)');
  player.pos.x = item.zoneCenter.x; player.pos.z = item.zoneCenter.z;   // fly to the signal
  tickS(sim, 2);
  const threats = live.ids.filter((eid) => live.roles[eid] === 'threat');
  assert(threats.length >= 1, 'genuine distress has harriers');
  killAs(sim, threats, state.playerId);
  tickS(sim, 2);
  assert(log.resolved.some((r) => r.encounterId === id && r.outcome === 'rescued'), 'rescue resolves');
  assert(log.events.some((e) => e.n === 'rescued'), 'distress:rescued intent emitted (factions listen: +rep)');
  assert(log.credits.some((c) => c.reason === 'rescue:distress' && c.delta === 120), 'rescue pay granted via economy');
  assert(log.receipts.some((r) => r.encounterId === id && /RESCUE COMPLETE/.test(r.text)), 'rescue receipt');
  ok('distress GENUINE: rescue pays through intents, victim survives, receipt');
}
{
  // BAIT — closing on the "victim" springs the trap; breaking it earns the receipt.
  const { sim, state, player, log } = boot(32, 'sector_ceres_belt', { x: 240, z: -1180 }, { credits: 100 });
  const item = craftDistress('sector_ceres_belt', 'distress_bait');
  const { live, id } = forceFire(sim, 'distress_call', 'sector_ceres_belt', { item });
  for (const e of squadEnts(state, live)) assert.equal(e.data.ai.passive, true, 'bait plays dead');
  player.pos.x = item.zoneCenter.x; player.pos.z = item.zoneCenter.z;
  tickS(sim, 2);
  for (const e of squadEnts(state, live)) {
    assert.equal(!!e.data.ai.passive, false, 'bait springs on approach');
    assert.equal(isHostileToPlayer(e, 0, state), true, 'sprung bait is hostile');
  }
  assert(log.voice.some((v) => v.encounterId === id && /Gotcha/.test(v.text)), 'bait spring line');
  killAs(sim, live.ids, state.playerId);
  tickS(sim, 2);
  assert(log.receipts.some((r) => r.encounterId === id && /BAIT BROKEN/.test(r.text)), 'bait broken receipt');
  ok('distress BAIT: springs on approach, hostile, broken receipt');
}
{
  // IGNORE — the signal fades. No punishment, no receipt, silent resolution.
  const { sim, state, log } = boot(33, 'sector_ceres_belt', { x: 1900, z: 1900 }, { credits: 100 });
  const item = craftDistress('sector_ceres_belt', 'distress_genuine');
  const { id } = forceFire(sim, 'distress_call', 'sector_ceres_belt', { item });
  tickS(sim, 245);
  assert(log.resolved.some((r) => r.encounterId === id && r.outcome === 'ignored'), 'ignored distress fades');
  assert(!log.receipts.some((r) => r.encounterId === id), 'ignoring is silent — no receipt, no guilt-trip');
  assert.equal(state.player.credits, 100, 'ignoring costs nothing');
  ok('distress IGNORE: fades silently, unpunished');
}

// ── J. convoy: bounded arrival pressure / robbery ───────────────────────────────────────────────
{
  const { sim, state, log } = boot(41, 'sector_tethys_junction', TETHYS_LANE, { credits: 100 });
  state.world.activeSector = { stations: [{ id: 'st_tethys_hub', pos: { x: 1050, z: 380 }, name: 'Meridian Exchange' }] };
  const { live, id } = forceFire(sim, 'convoy_departure', 'sector_tethys_junction');
  const haulers = squadEnts(state, live).filter((e) => live.roles[e.id] === 'hauler');
  const escorts = squadEnts(state, live).filter((e) => live.roles[e.id] === 'escort');
  assert(haulers.length >= 2 && escorts.length >= 1, 'convoy = haulers + escort');
  for (const h of haulers) {
    assert.equal(h.team, 2, 'haulers are true civilians');
    assert(/Hauler/.test(h.data.scanLabel || ''), 'haulers are scannable (cargo label)');
    assert.equal(isHostileToPlayer(h, 0, state), false, 'convoy is not a threat');
  }
  const first = log.voice.find((v) => v.encounterId === id);
  assert(first && /convoy on the lane/.test(first.text), 'departure announced on the ticker line');
  tickS(sim, 235);                                     // transit + arrival
  const tp = log.pressure.filter((p) => p.stationId === 'st_tethys_hub');
  assert.equal(tp.length, 1, 'arrival applies market pressure exactly once');
  assert(tp[0].vol > 0 && tp[0].vol <= 12, `arrival pressure bounded (got ${tp[0].vol})`);
  assert(CONVOY_CARGO.some((c) => c.commodityId === tp[0].good), 'pressure is the convoy\'s cargo');
  assert(log.receipts.some((r) => r.encounterId === id && /CONVOY ARRIVED/.test(r.text)), 'arrival receipt');
  ok('convoy ARRIVAL: scannable civilians, one bounded economy-pressure intent, ticker + receipt');
}
{
  const { sim, state, log } = boot(42, 'sector_tethys_junction', TETHYS_LANE, { credits: 100 });
  state.world.activeSector = { stations: [{ id: 'st_tethys_hub', pos: { x: 1050, z: 380 }, name: 'Meridian Exchange' }] };
  const { live, id } = forceFire(sim, 'convoy_departure', 'sector_tethys_junction');
  tickS(sim, 5);
  const haulerIds = live.ids.filter((eid) => live.roles[eid] === 'hauler');
  killAs(sim, haulerIds, state.playerId);              // piracy
  tickS(sim, 3);
  for (const e of squadEnts(state, live).filter((x) => live.roles[x.id] === 'escort')) {
    assert.equal(!!e.data.ai.passive, false, 'escorts wake when the convoy is hit');
  }
  assert(log.resolved.some((r) => r.encounterId === id && r.outcome === 'robbed'), 'dead convoy resolves as robbed');
  assert(log.receipts.some((r) => r.encounterId === id && /CONVOY RAIDED/.test(r.text)), 'raid receipt');
  assert.equal(log.pressure.length, 0, 'no delivery — no market pressure');
  ok('convoy ROBBERY: escorts wake, no delivery pressure, raid receipt');
}

// ── K. salvage signal: black box through the REAL salvage system ────────────────────────────────
{
  let bound = null;
  for (let seed = 1; seed <= 24 && !bound; seed++) {
    const t = boot(seed, 'sector_ceres_belt', { x: 240, z: -1180 }, { systems: [spawnBudget, encounterDirector, salvage] });
    const pts = (t.state.salvage && t.state.salvage.points) || [];
    if (!pts.some((p) => p.isCommunicator && !p.offered)) continue;
    const ff = forceFire(t.sim, 'salvage_signal', 'sector_ceres_belt');
    if (ff.live && ff.live.data.pointId) bound = { ...t, id: ff.id, live: ff.live, pts };
  }
  assert(bound, 'a seed in 1..24 must place a communicator in the Ceres derelict field');
  const pt = bound.pts.find((p) => p.id === bound.live.data.pointId);
  bound.player.pos.x = pt.pos.x; bound.player.pos.z = pt.pos.z;        // fly to the transponder
  tickS(bound.sim, 3);
  assert(bound.log.events.some((e) => e.n === 'missionOffered'), 'black box offers a mission (salvage\'s own hook)');
  assert(bound.log.resolved.some((r) => r.encounterId === bound.id && r.outcome === 'recovered'), 'signal resolves as recovered');
  assert(bound.log.receipts.some((r) => r.encounterId === bound.id && /BLACK BOX RECOVERED/.test(r.text)), 'black box receipt');
  ok('salvage signal: rides real salvage points — mission offer + BLACK BOX receipt');
}

// ── L. named hunter: permanent death + escalating grudge ───────────────────────────────────────
{
  const { sim, state, log } = boot(51, 'sector_sker_haven', SKER_DEEP, { credits: 100 });
  const { live, id } = forceFire(sim, 'named_hunter', 'sector_sker_haven');
  const boss = squadEnts(state, live).find((e) => live.roles[e.id] === 'boss');
  assert(boss, 'named hunter spawns a boss');
  assert(NAMED_CAPTAINS.some((c) => c.name === boss.data.ai.name), 'boss carries a captain name');
  assert(boss.data.bountyCr > 0, 'named captain carries a bounty');
  assert.equal(boss.data.ai.passive, true, 'staged entrance — silhouette before guns');
  tickS(sim, 10);
  assert.equal(!!boss.data.ai.passive, false, 'entrance ends, hunter engages');
  const capId = live.data.captainId;
  killAs(sim, [boss.id], state.playerId);
  tickS(sim, 2);
  assert.equal(state.encounterDirector.named[capId].alive, false, 'killed captain is PERMANENTLY dead in persistent state');
  assert(log.receipts.some((r) => r.encounterId === id && /HUNTER DOWN/.test(r.text)), 'hunter down receipt');
  for (let i = 0; i < 4; i++) {
    const ff = forceFire(sim, 'named_hunter', 'sector_sker_haven', {
      item: (() => { const it = planEncounterShape(ENCOUNTERS.named_hunter, zonesForSector('sector_sker_haven')[0], 'sector_sker_haven', 0, 80 + i, mulberry32(hash32(i, 'nh'))); return it; })(),
    });
    if (ff.live && ff.live.data.captainId) {
      assert.notEqual(ff.live.data.captainId, capId, 'a dead captain never respawns');
      sim.registry.get('encounterDirector').abort(ff.live, 'test_cleanup');
    }
  }
  ok('named hunter KILL: permanent death persisted, never re-picked, receipt');
}
{
  const { sim, state, player, log } = boot(52, 'sector_sker_haven', SKER_DEEP, { credits: 100 });
  const { live, id } = forceFire(sim, 'named_hunter', 'sector_sker_haven');
  tickS(sim, 10);                                      // entrance ends → engaged
  const capId = live.data.captainId;
  player.pos.x += 9000;                                // flee the system's worst day
  tickS(sim, 3);
  const rec = state.encounterDirector.named[capId];
  assert.equal(rec.alive, true, 'escaped captain lives');
  assert.equal(rec.tier, 1, 'escape deepens the grudge (tier 0→1: +1 escort next time)');
  assert.equal(rec.escapes, 1, 'escape counted');
  assert.equal(rec.lastSeenSector, 'sector_sker_haven', 'last seen sector booked');
  assert(log.receipts.some((r) => r.encounterId === id && /HUNTER ESCAPED/.test(r.text)), 'escape receipt');
  ok('named hunter ESCAPE: grudge tier +1, lastSeenSector booked, receipt');
}

// ── M. save/load: durable subset survives, transients rebuild, old saves are absence-safe ──────
{
  const { sim, state } = boot(53, 'sector_sker_haven', SKER_DEEP, { credits: 100 });
  const { live } = forceFire(sim, 'named_hunter', 'sector_sker_haven');
  const capId = live.data.captainId;
  tickS(sim, 10);
  const boss = squadEnts(state, live).find((e) => live.roles[e.id] === 'boss');
  killAs(sim, [boss.id], state.playerId);
  tickS(sim, 2);
  assert.equal(state.encounterDirector.named[capId].alive, false, 'captain dead pre-save');
  // Simulate exactly what saveSystem now does on load: stage the durable subset, emit save:loaded.
  const durable = JSON.parse(JSON.stringify({
    named: state.encounterDirector.named,
    receipts: state.encounterDirector.receipts,
    cooldowns: state.encounterDirector.cooldowns,
    stats: state.encounterDirector.stats,
  }));
  state.encounterDirector = durable;
  sim.bus.emit('save:loaded', {});
  const dir2 = state.encounterDirector;
  assert.equal(dir2.named[capId].alive, false, 'named death SURVIVES save/load (durable merge)');
  assert(dir2.receipts.length >= 1, 'receipts survive save/load');
  assert.equal(dir2.pending.length, 0, 'no stale pending after load');
  assert.equal(Object.keys(dir2.live).length, 0, 'no live entity references after load');
  // Old save with no director key: absence-safe fresh start.
  state.encounterDirector = null;
  sim.bus.emit('save:loaded', {});
  assert.equal(state.encounterDirector.named[capId].alive, true, 'old saves (no key) start captains fresh');
  ok('save/load: durable subset survives, transients rebuilt, absence-safe for old saves');
}

console.log(`[check-living-universe-events] PASS — ${sections} sections green`);
