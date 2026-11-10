/**
 * THE WORLD ANSWERS — the belt talks about the ore flood (C8) and the heavy raking its own line (C10).
 *
 * `economy:oreFlood` and `combat:tumbleRake` were receipts nobody voiced. barkDirector now speaks
 * each once through the ordinary voice queue: the flood by the nearest working civilian (else the
 * local station desk), the rake by a hull on the raked line. Seeds 4242 / 8008.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { ORE_FLOOD_BARKS, TUMBLE_RAKE_BARKS, oreFloodBarkFor, tumbleRakeBarkFor } from '../src/data/barks.js';

const SEEDS = [4242, 8008];

function boot(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.tick = 600;
  state.simTime = 10;
  const bus = createBus();
  const said = [];
  const helpers = { voice: { say(p) { said.push(p); return true; } } };
  core.init({ state, bus, helpers, registry: null });
  state.world.currentSectorId = 'sector_helios_prime';

  const spawn = (spec) => helpers.spawnEntity({
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 12, hull: 100, hullMax: 100,
    collides: true, ...spec, data: { ...(spec.data || {}) },
  });
  const player = spawn({ type: 'ship', team: 0 });
  state.playerId = player.id;

  const barkSys = Object.assign({}, barkDirector);
  barkSys.init({ state, bus, helpers, registry: null });
  const voices = [];
  bus.on('barkDirector:voice', (p) => voices.push(p));
  return { state, bus, helpers, spawn, player, barkSys, said, voices };
}

function dispose(h) { h.barkSys.destroy?.(); }

function flood(h, over = {}) {
  return {
    schemaVersion: 1, sectorId: 'sector_helios_prime', bodyId: 'rock_1', material: 'iron',
    commodityId: 'cmdty_ore_iron', yieldU: 14, fragments: 6, actorId: h.player.id, byPlayer: true,
    pricePressure: -0.02, x: 300, z: 200, tick: h.state.tick, ...over,
  };
}

const floodBarks = (h) => h.said.filter((s) => s.kind === 'oreFlood');
const rakeBarks = (h) => h.said.filter((s) => s.kind === 'tumbleRake');

for (const seed of SEEDS) {
  test(`ore flood [${seed}]: the nearest working civilian speaks once per body, naming the ore`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    h.spawn({ type: 'station', pos: { x: 500, z: 200 }, mass: 1e6, factionId: 'faction_scn', data: { stationId: 'st_a' } });
    const far = h.spawn({ type: 'ship', team: 2, pos: { x: 800, z: 200 }, data: { trafficRole: 'hauler' } });
    const near = h.spawn({ type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 360, z: 220 }, data: { trafficRole: 'miner' } });
    const fighter = h.spawn({ type: 'ship', team: 1, pos: { x: 305, z: 200 }, data: { trafficRole: 'patrol' } });
    assert.ok(far && near && fighter);

    h.bus.emit('economy:oreFlood', flood(h));
    const barks = floodBarks(h);
    assert.equal(barks.length, 1);
    assert.equal(barks[0].channel, 'bark');
    assert.equal(barks[0].id, `barkDirector:${near.id}:ore-flood`, 'nearest working hull, not the fighter or the far hauler');
    assert.equal(barks[0].register, 'working');
    assert.ok(ORE_FLOOD_BARKS.working.some((line) => line.replace(/\{ore\}/g, 'iron ore') === barks[0].text), barks[0].text);
    assert.match(barks[0].text, /iron ore/);
    assert.equal(h.voices.filter((v) => v.situation === 'ore-flood').length, 1);

    h.bus.emit('economy:oreFlood', flood(h));
    h.bus.emit('economy:oreFlood', flood(h, { yieldU: 30 }));
    assert.equal(floodBarks(h).length, 1, 'the same body never barks twice');

    // A different body is a different act — but the nearest hull has just spoken (per-speaker
    // cooldown), so the next working hull in range takes it.
    h.state.simTime += 1;
    h.bus.emit('economy:oreFlood', flood(h, { bodyId: 'rock_2', x: 700, z: 200 }));
    const second = floodBarks(h);
    assert.equal(second.length, 2);
    assert.equal(second[1].id, `barkDirector:${far.id}:ore-flood`, 'a hull that just spoke is on cooldown');
  });

  test(`ore flood [${seed}]: no bark for an NPC-caused flood, a dust flood, or a bad receipt`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    h.spawn({ type: 'ship', team: 2, pos: { x: 320, z: 200 }, data: { trafficRole: 'miner' } });
    h.spawn({ type: 'station', pos: { x: 500, z: 200 }, mass: 1e6, factionId: 'faction_free', data: { stationId: 'st_a' } });
    h.bus.emit('economy:oreFlood', flood(h, { byPlayer: false, actorId: 999, bodyId: 'npc' }));
    h.bus.emit('economy:oreFlood', flood(h, { yieldU: 7.9, bodyId: 'dust' }));
    h.bus.emit('economy:oreFlood', flood(h, { bodyId: null }));
    h.bus.emit('economy:oreFlood', flood(h, { bodyId: 'elsewhere', sectorId: 'sector_ceres_belt' }));
    h.bus.emit('economy:oreFlood', {});
    assert.equal(floodBarks(h).length, 0);
    h.bus.emit('economy:oreFlood', flood(h, { yieldU: 8, bodyId: 'edge' }));
    assert.equal(floodBarks(h).length, 1, 'yieldU 8 is the floor');
  });

  test(`ore flood [${seed}]: with no working hull near, the station desk speaks in its own register`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    // Out of range hauler, an ordinary trader (not an ore role), and a patrol: none qualify.
    h.spawn({ type: 'ship', team: 2, pos: { x: 1500, z: 200 }, data: { trafficRole: 'hauler' } });
    h.spawn({ type: 'ship', team: 2, pos: { x: 320, z: 200 }, data: { trafficRole: 'trader' } });
    h.spawn({ type: 'ship', team: 1, pos: { x: 330, z: 200 }, data: { trafficRole: 'patrol' } });
    const lawful = h.spawn({ type: 'station', pos: { x: 900, z: 0 }, mass: 1e6, factionId: 'faction_scn', data: { stationId: 'st_l' } });
    h.bus.emit('economy:oreFlood', flood(h, { bodyId: 'lawful_rock', commodityId: 'cmdty_silicate' }));
    let barks = floodBarks(h);
    assert.equal(barks.length, 1);
    assert.equal(barks[0].register, 'dock_control');
    assert.equal(barks[0].id, `barkDirector:${lawful.id}:ore-flood`);
    assert.match(barks[0].text, /^Dock control: /);
    assert.match(barks[0].text, /silicate rock/);
    assert.equal(barks[0].factionId, 'faction_scn');

    // Same index, other register: the Yardmaster speaks for a non-lawful station.
    const h2 = boot(seed);
    t.after(() => dispose(h2));
    h2.spawn({ type: 'station', pos: { x: 900, z: 0 }, mass: 1e6, factionId: 'faction_free', data: { stationId: 'st_y' } });
    h2.bus.emit('economy:oreFlood', flood(h2, { commodityId: null }));
    barks = floodBarks(h2);
    assert.equal(barks.length, 1);
    assert.equal(barks[0].register, 'yardmaster');
    assert.match(barks[0].text, /^Yardmaster: /);
    assert.match(barks[0].text, /\bore\b/, 'an unnamed commodity reads as plain ore');
    assert.doesNotMatch(barks[0].text, /\{ore\}/);

    // No station at all in the sector: nobody to say it, nothing said.
    const h3 = boot(seed);
    t.after(() => dispose(h3));
    h3.bus.emit('economy:oreFlood', flood(h3));
    assert.equal(floodBarks(h3).length, 0);
  });

  test(`tumble rake [${seed}]: one bark per episode, from a hull on the raked line`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    h.player.pos = { x: -200, z: 0 };
    const heavy = h.spawn({ type: 'ship', team: 1, factionId: 'faction_vael', mass: 420, pos: { x: 0, z: 0 } });
    const a = h.spawn({ type: 'ship', team: 1, factionId: 'faction_vael', pos: { x: 0, z: 150 } });
    const b = h.spawn({ type: 'ship', team: 1, factionId: 'faction_vael', pos: { x: 100, z: 100 } });
    const payload = { hullId: heavy.id, factionId: 'faction_vael', victims: [a.id, b.id], tick: 700 };

    h.bus.emit('combat:tumbleRake', payload);
    let barks = rakeBarks(h);
    assert.equal(barks.length, 1);
    assert.equal(barks[0].channel, 'bark');
    assert.equal(barks[0].id, `barkDirector:${a.id}:tumble-rake`, 'first raked hull speaks');
    assert.equal(barks[0].factionId, 'faction_vael');
    assert.ok(TUMBLE_RAKE_BARKS.includes(barks[0].text));
    assert.equal(h.voices.filter((v) => v.situation === 'tumble-rake').length, 1);

    h.bus.emit('combat:tumbleRake', { ...payload });
    assert.equal(rakeBarks(h).length, 1, 'a re-emitted receipt does not bark twice');

    // A later tumble episode of the same heavy is a new act; hull a has just spoken, so b does.
    h.state.simTime += 1;
    h.bus.emit('combat:tumbleRake', { ...payload, tick: 1500 });
    barks = rakeBarks(h);
    assert.equal(barks.length, 2);
    assert.equal(barks[1].id, `barkDirector:${b.id}:tumble-rake`);
  });

  test(`tumble rake [${seed}]: silent for the player's or a wingman's heavy, a dead line, or no audience`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    h.player.pos = { x: -200, z: 0 };
    const victim = h.spawn({ type: 'ship', team: 1, pos: { x: 0, z: 150 } });
    const wingHeavy = h.spawn({ type: 'ship', team: 0, mass: 420, pos: { x: 0, z: 0 }, data: { wingman: true } });
    h.bus.emit('combat:tumbleRake', { hullId: h.player.id, victims: [victim.id], tick: 701 });
    h.bus.emit('combat:tumbleRake', { hullId: wingHeavy.id, victims: [victim.id], tick: 702 });
    assert.equal(rakeBarks(h).length, 0, 'player and wingman rakers never bark');

    const heavy = h.spawn({ type: 'ship', team: 1, mass: 420, pos: { x: 0, z: 0 } });
    h.bus.emit('combat:tumbleRake', { hullId: heavy.id, victims: [], tick: 703 });
    h.bus.emit('combat:tumbleRake', { hullId: heavy.id, victims: [h.player.id], tick: 704 });
    h.bus.emit('combat:tumbleRake', { hullId: 987654, victims: [victim.id], tick: 705 });
    assert.equal(rakeBarks(h).length, 0, 'no raked hull, or the player as the only "victim", is not a bark');

    const faraway = h.spawn({ type: 'ship', team: 1, mass: 420, pos: { x: 9000, z: 0 } });
    h.bus.emit('combat:tumbleRake', { hullId: faraway.id, victims: [victim.id], tick: 706 });
    assert.equal(rakeBarks(h).length, 0, 'out of the player\'s earshot');

    h.bus.emit('combat:tumbleRake', { hullId: heavy.id, victims: [victim.id], tick: 707 });
    assert.equal(rakeBarks(h).length, 1, 'and the line still speaks when it should');
  });
}

test('barks are deterministic catalogue picks, never Math.random', () => {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random used'); };
  try {
    for (let i = 0; i < 12; i += 1) {
      assert.equal(oreFloodBarkFor('working', i, 'Iron Ore'), oreFloodBarkFor('working', i, 'Iron Ore'));
      assert.equal(tumbleRakeBarkFor(i), tumbleRakeBarkFor(i));
    }
    assert.equal(oreFloodBarkFor('nope', 0, ''), oreFloodBarkFor('working', 0, null), 'unknown register speaks the working belt');
    for (const [register, lines] of Object.entries(ORE_FLOOD_BARKS)) {
      for (const line of [...lines, ...TUMBLE_RAKE_BARKS]) {
        assert.ok(line.length <= 110 && !/[\r\n]/.test(line), `${register}: ${line}`);
        assert.ok((line.match(/[.!?]/g) || []).length <= 2, `${register} is short: ${line}`);
      }
    }
  } finally {
    Math.random = real;
  }
});
