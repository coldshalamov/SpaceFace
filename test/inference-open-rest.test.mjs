import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { survivalRoundWreckLatchLegal, isAttachable } from '../src/systems/tetherGameplay.js';
import { cargo } from '../src/systems/cargo.js';
import { selectedJettisonLot } from '../src/systems/cargo.js';
import { seedHeliosOfferTrap, moralTrapSystem } from '../src/systems/moralTrap.js';
import { HELIOS_MEMORIAL_TOURIST, traffic } from '../src/systems/traffic.js';
import { SECTORS } from '../src/data/sectors.js';

test('VERB-12 a survival wreck in this round is a legal Massline target', () => {
  const wreck = {
    id: 4, type: 'wreck', alive: true, pos: { x: 10, z: 12 },
    data: { runCohort: 'survival', runWave: 2, masslineTetherable: false },
  };
  const fighting = { run: { phase: 'combat', wave: 2 } };
  assert.equal(survivalRoundWreckLatchLegal(wreck, fighting), true);
  assert.equal(isAttachable(wreck, 1, fighting), true);
  assert.equal(survivalRoundWreckLatchLegal(wreck, { run: { phase: 'shop', wave: 2 } }), false);
  assert.equal(survivalRoundWreckLatchLegal({ ...wreck, data: { runCohort: 'survival', runWave: 1 } }, fighting), false);
});

test('VERB-13 the flight jettison key dumps the selected lot', () => {
  const input = readFileSync(new URL('../src/systems/input.js', import.meta.url), 'utf8');
  assert.match(input, /jettisonLot:\s*\['Period'\]/);
  const dumped = [];
  const state = {
    input: { actions: { jettisonLot: true } },
    player: { cargo: { selectedId: 'cmdty_ore_iron', items: { cmdty_ore_iron: 3, cmdty_water: 1 } } },
    entities: new Map(),
    missions: { active: [] },
  };
  assert.equal(selectedJettisonLot(state), 'cmdty_ore_iron');
  cargo.update.call({
    jettison(id, qty) { dumped.push([id, qty]); return qty; },
  }, 0, state);
  assert.deepEqual(dumped, [['cmdty_ore_iron', 1]]);
  assert.equal(state.input.actions.jettisonLot, false);
});

test('WORLD-18 accepting a seeded Helios cargo offer says the reveal once', () => {
  const offer = seedHeliosOfferTrap({
    id: 'offer_helios_crate',
    stationId: 'station_helios',
    type: 'cargo_delivery',
  });
  assert.equal(offer.trap.id, 'cargo_is_weapons');
  const lines = [];
  const mission = {
    id: 'm-helios',
    stationId: 'station_helios',
    trap: offer.trap,
  };
  const sys = {
    _state: { missions: { active: [mission] } },
    _bus: { emit(name, payload) { if (name === 'toast') lines.push(payload.text); } },
    _helpers: {},
    _findActive: moralTrapSystem._findActive,
    _speakReveal: moralTrapSystem._speakReveal,
    _revealAcceptedHeliosTrap: moralTrapSystem._revealAcceptedHeliosTrap,
  };
  sys._revealAcceptedHeliosTrap({ missionId: 'm-helios', stationId: 'station_helios' });
  sys._revealAcceptedHeliosTrap({ missionId: 'm-helios', stationId: 'station_helios' });
  assert.deepEqual(lines, [offer.trap.revealLine]);
});

test('WORLD-20 seed 4242 can place a living tourist inside the Helios memorial', () => {
  const zone = { center: { x: 1680, z: -820 }, radius: 340 };
  const dx = HELIOS_MEMORIAL_TOURIST.pos.x - zone.center.x;
  const dz = HELIOS_MEMORIAL_TOURIST.pos.z - zone.center.z;
  assert.ok(Math.hypot(dx, dz) <= zone.radius);
  assert.equal(HELIOS_MEMORIAL_TOURIST.role, 'tourist');
  const spawned = [];
  const list = [];
  traffic._ensureHeliosMemorialTourist.call({
    state: { meta: { seed: 4242 }, entities: new Map() },
    helpers: {
      spawnEntity(spec) {
        const entity = { id: 77, alive: true, pos: { ...spec.pos }, data: {}, flags: {} };
        spawned.push(entity);
        return entity;
      },
    },
    _active: [],
    _stampTrafficDurableIdentity: traffic._stampTrafficDurableIdentity,
    _ensureHeliosMemorialTourist: traffic._ensureHeliosMemorialTourist,
  }, 'sector_helios_prime', { factionId: 'faction_scn' }, [{ id: 'station_helios', pos: { x: 0, z: 0 } }], list);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].data.trafficRole, 'tourist');
  assert.equal(spawned[0].alive, true);
  assert.equal(list[0].role, 'tourist');
  const dist = Math.hypot(spawned[0].pos.x - zone.center.x, spawned[0].pos.z - zone.center.z);
  assert.ok(dist <= zone.radius);
});

test('WORLD-15 the Sker Throne scan does not claim a body that cannot be claimed', () => {
  const sker = SECTORS.find((sector) => sector.id === 'sector_sker_haven');
  const throne = sker.pois.find((poi) => poi.id === 'poi_sker_throne');
  assert.notEqual(throne.claimable, true);
  assert.doesNotMatch(`${throne.discoveryPlate.title} ${throne.discoveryPlate.body}`, /claim/i);
});

test('INST-07 the boot canvas is not a 640 by 380 buffer', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="boot-terminal-canvas"/);
  assert.doesNotMatch(html, /boot-terminal-canvas[^>]*width="640"/);
  assert.doesNotMatch(html, /boot-terminal-canvas[^>]*height="380"/);
});

test('INST-12 leftover station buttons do not get a second control face', () => {
  const css = readFileSync(new URL('../styles/station-orbital.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /button:not\(\.fh-key\)[\s\S]{0,180}font-family/);
  assert.match(css, /data-sf-role="primary"/);
});
