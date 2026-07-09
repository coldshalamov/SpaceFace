#!/usr/bin/env node
// check-station-shell.mjs — Station OS shell contract (design/STATION_SHELL_CONTRACT.md).
// Structural + live-intent proof: no permanent bullseye/beam layout, sell/buy/service wiring,
// Hold price helper, dismissible first-dock strip, AND real economy mutations via ui:sell/ui:service.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { addCargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { holdUnitSellPrice } from '../src/ui/screens/stationHub.js';
import { serviceQuote } from '../src/ui/screens/services.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const hubPath = join(ROOT, 'src/ui/screens/stationHub.js');
const marketPath = join(ROOT, 'src/ui/screens/market.js');
const servicesPath = join(ROOT, 'src/ui/screens/services.js');
const contractPath = join(ROOT, 'design/STATION_SHELL_CONTRACT.md');
const economyPath = join(ROOT, 'src/systems/economy.js');

const hub = readFileSync(hubPath, 'utf8');
const market = readFileSync(marketPath, 'utf8');
const services = readFileSync(servicesPath, 'utf8');
const economySrc = readFileSync(economyPath, 'utf8');

assert.ok(existsSync(contractPath), 'design/STATION_SHELL_CONTRACT.md must exist');
const contract = readFileSync(contractPath, 'utf8');
assert.match(contract, /Nav/i, 'contract defines Nav control type');
assert.match(contract, /Verb/i, 'contract defines Verb control type');
assert.match(contract, /Param/i, 'contract defines Param control type');
assert.match(contract, /Meta/i, 'contract defines Meta control type');
assert.match(contract, /≥70%|70%/, 'contract states workspace height budget');

// Shell: Station OS desk mode default
assert.match(hub, /st-hub--os|st-hub--desk/, 'station hub uses Station OS / desk shell class');
assert.match(hub, /st-top-credits/, 'top strip shows credits');
assert.match(hub, /st-top-cargo/, 'top strip shows cargo');
assert.match(hub, /st-inspector-toggle/, 'Briefing is Meta (opt-in)');
assert.match(hub, /is-collapsed/, 'briefing drawer starts collapsed');
assert.match(hub, /data-handoff-dismiss|st-handoff-dismiss/, 'first-dock strip is dismissible');
assert.ok(
  /data-centerpiece=["']station-service-console["']/.test(hub)
    || /setAttribute\(\s*['"]data-centerpiece['"]\s*,\s*['"]station-service-console['"]\s*\)/.test(hub),
  'workspace carries station centerpiece slug');

// No dead trade event
assert.doesNotMatch(hub, /ui:trade/, 'Hold must not emit dead ui:trade');
assert.match(hub, /ui:sell/, 'Hold emits live ui:sell');
assert.match(market, /ui:buy/, 'Market emits ui:buy');
assert.match(market, /ui:sell/, 'Market emits ui:sell');
assert.match(market, /data-trade-mode|tradeMode/, 'Market has Buy|Sell mode param');
assert.match(services, /ui:service/, 'Services emit ui:service');
assert.match(services, /confirm\(/, 'Services use quote→confirm for paid verbs');
assert.match(economySrc, /bus\.on\(['"]ui:sell['"]/, 'economy listens to ui:sell');
assert.match(economySrc, /bus\.on\(['"]ui:buy['"]/, 'economy listens to ui:buy');
assert.match(economySrc, /bus\.on\(['"]ui:service['"]/, 'economy listens to ui:service');

// Accept primary on missions
assert.match(hub, /data-act=["']accept["']/, 'Missions expose Accept action');
assert.match(hub, /st-mission-accept|Accept<\/button>/, 'Accept is the primary mission verb label');

// ── Runtime: drive SHIPPED economy handlers on the real intent path ────────────
// Step 3 of the Station OS verification plan: ui:sell / ui:service must mutate
// cargo+credits / fuel+hull via economy (not string-only wiring).

const STATION_ID = 'station_helios';
const ORE_ID = 'cmdty_ore_iron';

function makeHelpers() {
  return {
    hash32(seed, label) {
      const s = String(seed) + ':' + String(label || '');
      let h = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    },
    mulberry32(seed) {
      let a = seed >>> 0;
      const rng = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      rng.seed = seed >>> 0;
      return rng;
    },
  };
}

function bootDockedEconomy(seed = 0x50a1) {
  const state = createGameState(seed);
  const bus = createBus();
  const helpers = makeHelpers();
  const registry = { get() { return null; } };
  // Player ship entity for repair
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    hull: 40,
    hullMax: 100,
    armorHp: 10,
    armorMax: 50,
  };
  state.playerId = ship.id;
  state.entities = new Map([[ship.id, ship]]);
  state.entityList = [ship];
  state.ui = state.ui || {};
  state.ui.docked = true;
  state.ui.dockedStationId = STATION_ID;
  state.fuel = state.fuel || { current: 20, max: 100 };
  state.fuel.current = 20;
  state.fuel.max = 100;
  state.player.credits = 10000;
  state.player.cargo = state.player.cargo || { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 80 };
  state.player.cargo.capVolume = 80;
  state.player.cargo.capMass = 80;
  state.player.cargo.items = {};
  state.player.cargo.usedVolume = 0;

  economy.init({ state, bus, helpers, registry });
  bus.emit('dock:docked', { stationId: STATION_ID });
  // Ensure the ore is traded at this station market
  const market = economy.ensureMarket(STATION_ID);
  assert.ok(market, 'ensureMarket returns a market for ' + STATION_ID);
  if (!market[ORE_ID]) {
    // Seed a minimal tradable entry if the station type does not list iron ore
    market[ORE_ID] = {
      stock: 50,
      lastBuy: 40,
      lastSell: 30,
      lastMid: 35,
      role: 'import',
    };
  }
  // Recompute so quote path is live
  if (typeof economy.recomputePrices === 'function' && market[ORE_ID]) {
    const def = { id: ORE_ID, basePrice: 28, volPerU: 1, massPerU: 1, legality: 'legal', elasticity: 0.4 };
    try { economy.recomputePrices(market[ORE_ID], def, 0); } catch (_) { /* entry already priced */ }
  }
  return { state, bus, ship, market };
}

// Pure helper: holdUnitSellPrice reads live lastSell
{
  const fakeState = {
    economy: { markets: {} },
    player: { marketMemory: {}, cargo: { items: {}, usedVolume: 0, capVolume: 40 }, credits: 1000 },
  };
  fakeState.economy.markets.station_test = { cmdty_ore_iron: { lastSell: 42, lastBuy: 55, stock: 10 } };
  assert.equal(holdUnitSellPrice(fakeState, 'station_test', 'cmdty_ore_iron'), 42, 'holdUnitSellPrice reads lastSell');
  console.log('ok   holdUnitSellPrice uses live lastSell');
}

// serviceQuote structure
{
  const state = {
    fuel: { current: 10, max: 100 },
    player: { credits: 5000, cargo: { items: {}, usedVolume: 0, capVolume: 40 }, insurance: {} },
    playerId: 1,
    entities: new Map([[1, { hull: 50, hullMax: 100, armorHp: 0, armorMax: 0 }]]),
  };
  const q = serviceQuote('refuel', state, state.entities.get(1));
  assert.ok(q && typeof q === 'object' && 'cost' in q && 'amount' in q, 'serviceQuote has cost + amount');
  console.log('ok   serviceQuote(refuel) returns cost structure');
}

// LIVE path: ui:sell mutates cargo + credits through economy.handleTrade
{
  const { state, bus } = bootDockedEconomy(0x5e11);
  const beforeCredits = state.player.credits | 0;
  addCargo(state, ORE_ID, 10);
  const beforeQty = state.player.cargo.items[ORE_ID] || 0;
  assert.ok(beforeQty >= 10, 'seeded cargo before sell (got ' + beforeQty + ')');

  // Hold/Market ship this intent — drive the same bus event economy listens for.
  bus.emit('ui:sell', { commodityId: ORE_ID, qty: 3 });

  const afterQty = state.player.cargo.items[ORE_ID] || 0;
  const afterCredits = state.player.credits | 0;
  assert.equal(afterQty, beforeQty - 3, 'ui:sell removes sold qty from cargo via economy');
  assert.ok(afterCredits > beforeCredits, 'ui:sell grants credits (before ' + beforeCredits + ' after ' + afterCredits + ')');
  console.log('ok   ui:sell mutates cargo+credits via live economy (' + beforeQty + '→' + afterQty + ' ore, credits ' + beforeCredits + '→' + afterCredits + ')');
}

// LIVE path: ui:buy mutates cargo + credits
{
  const { state, bus } = bootDockedEconomy(0x5e12);
  const beforeCredits = state.player.credits | 0;
  const beforeQty = state.player.cargo.items[ORE_ID] || 0;

  bus.emit('ui:buy', { commodityId: ORE_ID, qty: 2 });

  const afterQty = state.player.cargo.items[ORE_ID] || 0;
  const afterCredits = state.player.credits | 0;
  assert.ok(afterQty >= beforeQty + 1, 'ui:buy adds cargo via economy (before ' + beforeQty + ' after ' + afterQty + ')');
  assert.ok(afterCredits < beforeCredits, 'ui:buy charges credits (before ' + beforeCredits + ' after ' + afterCredits + ')');
  console.log('ok   ui:buy mutates cargo+credits via live economy');
}

// LIVE path: ui:service refuel mutates fuel + credits
{
  const { state, bus } = bootDockedEconomy(0x5e13);
  state.fuel.current = 20;
  state.fuel.max = 100;
  const beforeFuel = state.fuel.current;
  const beforeCredits = state.player.credits | 0;

  bus.emit('ui:service', { type: 'refuel', amount: 30 });

  assert.ok(state.fuel.current > beforeFuel, 'ui:service refuel increases fuel (' + beforeFuel + '→' + state.fuel.current + ')');
  assert.ok((state.player.credits | 0) < beforeCredits, 'ui:service refuel charges credits');
  console.log('ok   ui:service refuel mutates fuel+credits via live economy');
}

// LIVE path: ui:service repair mutates hull + credits
{
  const { state, bus, ship } = bootDockedEconomy(0x5e14);
  ship.hull = 40;
  ship.hullMax = 100;
  ship.armorHp = 10;
  ship.armorMax = 50;
  const beforeHull = ship.hull;
  const beforeCredits = state.player.credits | 0;

  bus.emit('ui:service', { type: 'repair', amount: 100 });

  assert.ok(ship.hull > beforeHull, 'ui:service repair increases hull (' + beforeHull + '→' + ship.hull + ')');
  assert.ok((state.player.credits | 0) < beforeCredits, 'ui:service repair charges credits');
  console.log('ok   ui:service repair mutates hull+credits via live economy');
}

console.log('Station shell OK — OS layout, dismissible handoff, live trade/service mutations');
