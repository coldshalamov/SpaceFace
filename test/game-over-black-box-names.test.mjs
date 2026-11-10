import test from 'node:test';
import assert from 'node:assert/strict';
import { sortieRecord, deathCauseLabel } from '../src/ui/screens/gameOver.js';

test('the last-sortie black box names what you mined, where you docked and jumped by catalog name', () => {
  const endAt = 600_000;
  const telemetry = {
    getSessionStats: () => ({ deathLog: [{ atMs: endAt, lifespanMs: 300_000, cause: 'environmental' }] }),
    getRecentEvents: () => [
      { type: 'mining:yield', atMs: endAt - 250_000, data: { commodityId: 'cmdty_ore_iron' } },
      { type: 'dock:docked', atMs: endAt - 180_000, data: { stationId: 'station_helios' } },
      { type: 'jump:arrive', atMs: endAt - 90_000, data: { sectorId: 'sector_helios_prime' } },
    ],
  };
  const labels = sortieRecord({ telemetry }).events.map((e) => e.label);
  assert.ok(labels.includes('Mined · Iron Ore'), labels.join(' | '));
  assert.ok(labels.includes('Docked · Helios Station'), labels.join(' | '));
  assert.ok(labels.includes('Jumped · Helios Prime'), labels.join(' | '));
  assert.ok(!labels.some((l) => /cmdty/i.test(l)), 'never a raw commodity id');
});

test('an unknown id still reads as words', () => {
  assert.match(deathCauseLabel({ cause: 'ship:pirate_raider', killerFaction: 'faction_not_real' }), /\(Not Real\)$/);
});
