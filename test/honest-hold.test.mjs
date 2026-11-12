import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calculateHoldWorth, resolveCargoSellPrice } from '../src/ui/market/tradeLogic.js';
import { DRAWER_TABS } from '../src/ui/asteroid/asteroidScreen.js';
import { MISSION_STANDING_LADDER } from '../src/data/missionsData.js';
import { TECH_NODES } from '../src/data/tech.js';

test('SCAN RISK is removed completely from src/ui/hud.js', () => {
  const hudPath = resolve('src/ui/hud.js');
  const hudContent = readFileSync(hudPath, 'utf8');

  assert.doesNotMatch(hudContent, /SCAN RISK/i, 'hud.js must contain no SCAN RISK text');
  assert.doesNotMatch(hudContent, /gaugeRisk/i, 'hud.js must contain no gaugeRisk code');
  assert.doesNotMatch(hudContent, /sf-gauge-risk/i, 'hud.js must contain no sf-gauge-risk element');
  assert.doesNotMatch(hudContent, /hasContraband\s*\?\s*0\.75/i, 'hud.js must contain no hardcoded 75% scan risk calculation');
});

test('Plain labels are applied across codebase', () => {
  const hudPath = resolve('src/ui/hud.js');
  const hudContent = readFileSync(hudPath, 'utf8');

  // MANIFEST ACQUIRED -> Cargo loaded
  assert.ok(hudContent.includes('Cargo loaded'), 'hud.js displays Cargo loaded');
  assert.doesNotMatch(hudContent, /MANIFEST ACQUIRED/, 'hud.js does not display MANIFEST ACQUIRED');

  // HOLD READS -> In the hold
  assert.ok(hudContent.includes('In the hold:'), 'hud.js displays In the hold:');
  assert.doesNotMatch(hudContent, /HOLD READS:/, 'hud.js does not display HOLD READS:');

  // Avg Basis -> You paid
  assert.ok(hudContent.includes('You paid:'), 'hud.js displays You paid:');
  assert.doesNotMatch(hudContent, /Avg Basis:/, 'hud.js does not display Avg Basis:');

  // u vol -> space
  assert.ok(hudContent.includes('space</span>'), 'hud.js displays space instead of u vol');

  // R0-R1 local hauling -> Short hauls
  const recoveryRung = MISSION_STANDING_LADDER.find((r) => r.name === 'Recovery Work');
  assert.ok(recoveryRung, 'Recovery Work rung exists');
  assert.match(recoveryRung.unlocks, /Short hauls/, 'Recovery Work rung says Short hauls');
  assert.doesNotMatch(recoveryRung.unlocks, /R0-R1 local hauling/, 'Recovery Work does not say R0-R1 local hauling');

  // Payload Conduction -> Cargo handling, Attack Topology -> Attack angles
  const techCargo = TECH_NODES.find((t) => t.id === 'tech_payload_conduction');
  const techAttack = TECH_NODES.find((t) => t.id === 'tech_attack_topology');
  assert.equal(techCargo?.name, 'Cargo handling', 'tech_payload_conduction is named Cargo handling');
  assert.equal(techAttack?.name, 'Attack angles', 'tech_attack_topology is named Attack angles');

  // Two screens called Ledger: asteroid drawer renamed to Record while tab key stays ledger
  const asteroidPath = resolve('src/ui/asteroid/asteroidScreen.js');
  const asteroidContent = readFileSync(asteroidPath, 'utf8');
  assert.ok(asteroidContent.includes("ledger: 'Record'"), 'asteroid screen drawer tab label is Record');
});

test('Hold value sums destination prices when nav waypoint is set', () => {
  const state = {
    player: {
      credits: 1000,
      cargo: {
        capVolume: 40,
        usedVolume: 12,
        items: {
          cmdty_ore_iron: 8,
          cmdty_fuel_cells: 4,
        },
      },
    },
    nav: {
      waypoint: {
        stationId: 'station_forge',
      },
    },
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_tethys_junction' },
  };

  const ctx = {
    state,
    registry: {
      get: (id) => {
        if (id === 'economy') {
          return {
            quote: (stationId, cmdtyId, side, _qty) => {
              if (side === 'sell' && stationId === 'station_forge') {
                if (cmdtyId === 'cmdty_ore_iron') return { unit: 120 };
                if (cmdtyId === 'cmdty_fuel_cells') return { unit: 200 };
              }
              return null;
            },
          };
        }
        return null;
      },
    },
  };

  const hold = calculateHoldWorth(state, ctx);
  // 8 * 120 = 960; 4 * 200 = 800; total = 1760
  assert.equal(hold.used, 12);
  assert.equal(hold.cap, 40);
  assert.equal(hold.totalWorth, 1760);
  assert.equal(hold.hasUnsellable, false);
  assert.equal(hold.towedCount, 0);
  assert.equal(hold.text, 'HOLD 12/40 · ≈ 1,760 cr');
});

test('Hold value falls back to nearest buyer when no destination is set', () => {
  const state = {
    player: {
      credits: 500,
      cargo: {
        capVolume: 40,
        usedVolume: 10,
        items: {
          cmdty_ore_iron: 10,
        },
      },
      marketMemory: {
        station_alpha: {
          cmdty_ore_iron: {
            sell: 150,
            buy: 180,
            seenAt: 100,
          },
        },
      },
    },
    entities: new Map(),
    entityList: [],
  };

  const hold = calculateHoldWorth(state, { state });
  // 10 * 150 = 1500
  assert.equal(hold.totalWorth, 1500);
  assert.equal(hold.hasUnsellable, false);
  assert.equal(hold.text, 'HOLD 10/40 · ≈ 1,500 cr');
});

test('Cargo nobody nearby buys counts as 0 and flags unsellable', () => {
  const state = {
    player: {
      credits: 500,
      cargo: {
        capVolume: 40,
        usedVolume: 15,
        items: {
          cmdty_ore_iron: 10,
          cmdty_obscure_waste: 5, // nobody buys this
        },
      },
      marketMemory: {
        station_alpha: {
          cmdty_ore_iron: {
            sell: 100,
            seenAt: 10,
          },
        },
      },
    },
    entities: new Map(),
    entityList: [],
  };

  const hold = calculateHoldWorth(state, { state });
  // iron = 10 * 100 = 1000; obscure waste = 0; hasUnsellable = true
  assert.equal(hold.totalWorth, 1000);
  assert.equal(hold.hasUnsellable, true);
  assert.equal(hold.text, 'HOLD 15/40 · ≈ 1,000 cr · some unsellable here');
});

test('Loose towed cargo on the Line counts and displays as + 1 towed', () => {
  const podEntity = {
    id: 99,
    type: 'payload',
    alive: true,
    data: {
      kind: 'payload',
      payloadType: 'cargo_pod',
      commodityId: 'cmdty_ore_iron',
      amount: 4,
    },
  };

  const state = {
    player: {
      credits: 0,
      cargo: {
        capVolume: 40,
        usedVolume: 8,
        items: {
          cmdty_ore_iron: 8,
        },
      },
      marketMemory: {
        station_alpha: {
          cmdty_ore_iron: {
            sell: 120,
            seenAt: 10,
          },
        },
      },
      tether: {
        active: true,
        targetId: 99,
      },
    },
    entities: new Map([[99, podEntity]]),
    entityList: [podEntity],
  };

  const hold = calculateHoldWorth(state, { state });
  // Hold: 8 * 120 = 960
  // Towed: 4 * 120 = 480
  // Total: 960 + 480 = 1440
  assert.equal(hold.used, 8);
  assert.equal(hold.cap, 40);
  assert.equal(hold.towedCount, 1);
  assert.equal(hold.totalWorth, 1440);
  assert.equal(hold.hasUnsellable, false);
  assert.equal(hold.text, 'HOLD 8/40 · ≈ 1,440 cr + 1 towed');
});

test('Hold panel row worth helper gives row format', () => {
  const state = {
    player: {
      cargo: {
        items: {
          cmdty_ore_iron: 8,
        },
      },
      marketMemory: {
        station_forge: {
          cmdty_ore_iron: {
            sell: 120,
            seenAt: 10,
          },
        },
      },
    },
    entities: new Map(),
    entityList: [],
  };

  const price = resolveCargoSellPrice(state, { state }, 'cmdty_ore_iron');
  assert.equal(price.unitSell, 120);
  const rowWorth = 8 * price.unitSell;
  assert.equal(rowWorth, 960);
});
