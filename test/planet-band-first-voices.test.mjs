// PLANET BAND FIRST VOICES (U5) — the planet's bands explain themselves once.
//
// The band machine was deep and silent: sling, skim, danger, and reentry had instruments and
// physics but no first-contact receipt. Contract (deterministic, sim-time only):
//   1. the first crossing of each authored band emits exactly one planet:bandFirst per body;
//   2. a second pass never re-speaks (the bandFirsts gate is per body, per band);
//   3. NPC bodies cross bands with the same receipt, isPlayer false;
//   4. onboarding answers the player's receipts with one instrument line per band, once per
//      save, and never for an NPC body.
import test from 'node:test';
import assert from 'node:assert/strict';

import { planetRuntime } from '../src/systems/planetRuntime.js';
import { onboarding } from '../src/systems/onboarding.js';

function siteStub() {
  return {
    id: 'site_anvil', sectorId: 'sector_helios_prime',
    bands: { reentry: 150, danger: 300, skim: 600, sling: 900, influence: 1200 },
    heat: { skimRate: 0.01, dangerRate: 0.02, reentryRate: 0.05, coolRate: 0.03, coolSkimRate: 0.001 },
    drag: { skim: 0.01, danger: 0.03, reentry: 0.08, maxAccel: 200 },
    hysteresis: 20,
    plunge: { commitHeat: 0.95, regressS: 9999, breakupHeat: 0.99, descentRadius: 10, burnDps: 0, descentDps: 0 },
    recovery: { impulse: 100, capSpeed: 200, assistAccel: 40, tangentialDamp: 0.2, heatSpike: 0.01 },
  };
}

function rtStub(site) {
  return {
    siteId: site.id, center: { x: 0, z: 0 },
    telemetry: { inBands: 0, dragImpulses: 0 },
    ships: {},
    player: { recoveryBurn: false },
  };
}

function bodyStub(id, isPlayer) {
  return {
    id, type: 'ship', alive: true, team: isPlayer ? 0 : 1,
    pos: { x: 5000, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6,
    hull: 100, hullMax: 100,
    physicsBody: { mass: 100 },
  };
}

function recStub() {
  return { region: 'outside', regionRank: 0, r: Infinity, heat: 0, stage: null, stageAt: 0, outwardS: 0, burnNextAt: 0, bandFirsts: null };
}

function planetHarness() {
  const emitted = [];
  const bus = { emit: (name, p) => emitted.push({ name, p }), on: () => () => {} };
  const state = { simTime: 40, tick: 2400, playerId: 'p1', mode: 'flight', entities: new Map(), input: { boost: false, actions: {} } };
  planetRuntime.init({ state, bus, helpers: {}, registry: null });
  return { emitted, state, bus };
}

function tickAt(planet, rt, site, body, rec, r, now) {
  body.pos.x = r;
  body.pos.z = 0;
  planet._tickOneShip(0.016, { simTime: now, tick: now * 60, playerId: 'p1', mode: 'flight', entities: new Map(), input: { boost: false, actions: {} } }, rt, site, body, rec, now, body.team === 0);
}

test('band first: each band speaks exactly once per body, in order, and never twice', () => {
  const { emitted } = planetHarness();
  const site = siteStub();
  const rt = rtStub(site);
  const body = bodyStub('p1', true);
  const rec = recStub();

  const walk = [
    [800, 'sling'], [500, 'skim'], [250, 'danger'], [100, 'reentry'],
  ];
  let now = 40;
  for (const [r, band] of walk) {
    tickAt(planetRuntime, rt, site, body, rec, r, now);
    now += 0.5;
  }
  const firsts = emitted.filter((e) => e.name === 'planet:bandFirst').map((e) => e.p.band);
  assert.deepEqual(firsts, walk.map(([, band]) => band), 'one receipt per band, in descent order');
  assert.equal(emitted.filter((e) => e.name === 'planet:bandFirst' && e.p.isPlayer === true).length, 4);

  // Linger in the reentry band: the count does not move.
  for (let i = 0; i < 5; i++) {
    tickAt(planetRuntime, rt, site, body, rec, 100, now);
    now += 0.5;
  }
  assert.equal(emitted.filter((e) => e.name === 'planet:bandFirst').length, 4, 'no re-speaking');
});

test('band first: NPC bodies get their own receipts with isPlayer false', () => {
  const { emitted } = planetHarness();
  const site = siteStub();
  const rt = rtStub(site);
  const npc = bodyStub('npc_1', false);
  const rec = recStub();

  let now = 40;
  for (const [r] of [[800], [500]]) {
    tickAt(planetRuntime, rt, site, npc, rec, r, now);
    now += 0.5;
  }
  const firsts = emitted.filter((e) => e.name === 'planet:bandFirst');
  assert.deepEqual(firsts.map((e) => e.p.band), ["sling", "skim"]);
  assert.equal(firsts.every((e) => e.p.isPlayer === false), true, 'the body is not the player');
  assert.equal(firsts.every((e) => e.p.siteId === 'site_anvil'), true);
});

test('band first: onboarding answers the player receipts once per save, never for NPCs', () => {
  const emitted = [];
  const bus = { emit: (name, p) => emitted.push({ name, p }), on: () => () => {} };
  const state = {
    simTime: 10, tick: 600, playerId: 'p1', mode: 'flight',
    player: { hints: {} },
    entities: new Map(),
    input: { actions: {} },
  };
  onboarding.init({ state, bus, helpers: {}, registry: null });

  // NPC receipts are not lessons.
  assert.equal(onboarding._speakBandFirst({ band: 'sling', siteId: 'site_anvil', isPlayer: false }), false);
  assert.equal(emitted.filter((e) => e.name === 'hud:firstUse').length, 0);

  // The player's first sling crossing speaks the law of the band.
  assert.equal(onboarding._speakBandFirst({ band: 'sling', siteId: 'site_anvil', isPlayer: true }), true);
  const line = emitted.find((e) => e.name === 'hud:firstUse');
  assert.ok(line && line.p.text.includes('yours to keep'), `sling line: ${line && line.p.text}`);
  assert.equal(state.player.hints.band_first_site_anvil_sling, true, 'the hint is stamped for the save');

  // Same band, same body: never twice.
  assert.equal(onboarding._speakBandFirst({ band: 'sling', siteId: 'site_anvil', isPlayer: true }), false);
  assert.equal(emitted.filter((e) => e.name === 'hud:firstUse').length, 1);

  // A different body speaks its own receipt.
  assert.equal(onboarding._speakBandFirst({ band: 'sling', siteId: 'site_other', isPlayer: true }), true);
  assert.equal(emitted.filter((e) => e.name === 'hud:firstUse').length, 2);

  // Every authored band has a line.
  for (const band of ['sling', 'skim', 'danger', 'reentry']) {
    const st2 = { simTime: 0, tick: 0, playerId: 'p1', mode: 'flight', player: { hints: {} }, entities: new Map(), input: { actions: {} } };
    onboarding.state = st2;
    assert.equal(onboarding._speakBandFirst({ band, siteId: 's2', isPlayer: true }), true, `${band} has a line`);
  }
});
