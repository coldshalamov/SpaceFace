import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { CODEX_BESTIARY, codexBestiaryPages, mergeCodexBestiaryRows } from '../src/data/codexBestiary.js';
import { buildNewGamePlusOverlay, storyNewGamePlusRecord } from '../src/core/newGamePlus.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { scanner } from '../src/systems/scanner.js';
import { scanReveal } from '../src/systems/scanReveal.js';
import { combat } from '../src/systems/combat.js';
import { codexProgressSummary } from '../src/ui/screens/codex.js';

function boot(enemyTypeId = 'dart_swarmer') {
  const sim = createSimulation({ seed: 5301, systems: [scanner, scanReveal, combat] });
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    factionId: 'faction_player',
    pos: { x: 0, z: 0 },
    hull: 100,
    hullMax: 100,
    radius: 12,
    mass: 28,
    data: { defId: 'ship_kestrel' },
  });
  player.data.derived = { scannerRadiusMult: 1 };
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.input = { actions: {} };
  const enemy = sim.spawn(makeEnemySpawnSpec(enemyTypeId, 1, { x: 320, z: 0 }));
  return { sim, player, enemy };
}

test('the discovered bestiary is an exact bounded 18-page field manual', () => {
  assert.equal(CODEX_BESTIARY.length, 18);
  assert.equal(new Set(CODEX_BESTIARY.map((entry) => entry.id)).size, 18);
  for (const entry of CODEX_BESTIARY) {
    assert.match(entry.title, /\S/);
    assert.match(entry.fieldRead, /\S/);
    assert.match(entry.counterplay, /\S/);
  }
  const locked = codexBestiaryPages({ flags: {} });
  assert.equal(locked.filter((page) => page.scanned).length, 0);
  assert.equal(locked.filter((page) => page.complete).length, 0);
});
test('a production scanner pulse writes the first durable page and a real player hit completes its counter note', () => {
  const { sim, player, enemy } = boot();
  const updates = [];
  sim.bus.on('codex:bestiaryUpdated', (payload) => updates.push(structuredClone(payload)));

  sim.state.input.actions.scanPulse = true;
  sim.step(SIM_DT);
  let page = codexBestiaryPages(sim.state.story).find((entry) => entry.id === 'dart_swarmer');
  assert.equal(page.scanned, true, 'the live scanner and registered reveal owner write the page');
  assert.equal(page.complete, false, 'a scan alone does not hand out the combat counter');
  assert.deepEqual(updates.map((row) => row.stage), ['scanned']);

  const hit = sim.registry.get('combat').ensureKernel().routeDamage({
    attackerId: player.id,
    targetId: enemy.id,
    packet: {
      channels: { kinetic: 1 },
      penetration: 0,
      shieldBypass: 0,
      source: { kind: 'weapon', weaponId: 'wpn_autocannon_s' },
    },
    origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
  });
  assert.equal(hit.ok, true);
  page = codexBestiaryPages(sim.state.story).find((entry) => entry.id === 'dart_swarmer');
  assert.equal(page.complete, true, 'the first real player-owned damage receipt completes the page');
  assert.match(page.counterplay, /Cross its lane/);
  assert.deepEqual(updates.map((row) => row.stage), ['scanned', 'engaged']);

  const saved = JSON.parse(JSON.stringify(sim.state.story));
  const continuedPage = codexBestiaryPages(saved).find((entry) => entry.id === 'dart_swarmer');
  assert.equal(continuedPage.complete, true, 'plain saved story bytes reconstruct the page');
  const summary = codexProgressSummary(saved);
  assert.equal(summary.items.find((item) => item.key === 'Bestiary').value, '1/18 field notes');
  assert.match(summary.items.find((item) => item.key === 'Completion').value, /^\d+%$/);
  sim.dispose();
});

test('unscanned combat remains hidden until a later real scan identifies that stable enemy type', () => {
  const { sim, player, enemy } = boot('heavy_gunship');
  const kernel = sim.registry.get('combat').ensureKernel();
  const hit = kernel.routeDamage({
    attackerId: player.id,
    targetId: enemy.id,
    packet: { channels: { kinetic: 1 }, penetration: 0, shieldBypass: 0 },
    origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
  });
  assert.equal(hit.ok, true);
  let page = codexBestiaryPages(sim.state.story).find((entry) => entry.id === 'heavy_gunship');
  assert.equal(page.engaged, true);
  assert.equal(page.scanned, false);
  assert.equal(page.complete, false, 'combat telemetry does not identify an unscanned page');

  sim.state.input.actions.scanPulse = true;
  sim.step(SIM_DT);
  page = codexBestiaryPages(sim.state.story).find((entry) => entry.id === 'heavy_gunship');
  assert.equal(page.complete, true, 'the later physical scan joins the already-earned field note');
  sim.dispose();
});

test('New Game+ carries only bounded catalog bestiary rows and unions them with new-run field work', () => {
  const sourceStory = {
    beatIndex: 7,
    endgameChoice: 'E',
    endgameResolved: true,
    flags: { codexLore: { bestiary: {
      dart_swarmer: { scannedAt: 4, engagedAt: 7, defeats: 2 },
      not_a_real_enemy: { scannedAt: 1, engagedAt: 2, defeats: 9999 },
    } } },
  };
  const data = {
    story: sourceStory,
    player: { moduleInventory: [{ defId: 'mod_market_data_s', instanceId: 'keepsake_1' }] },
    aceMemory: {},
  };
  const overlay = buildNewGamePlusOverlay(data, { keepsakeId: 'mod_market_data_s' });
  assert.ok(overlay, 'the existing New Game+ projection accepts a real owned keepsake');
  const record = storyNewGamePlusRecord(overlay, 5302);
  assert.deepEqual(Object.keys(record.codex.codexLore.bestiary), ['dart_swarmer']);
  assert.equal(record.codex.codexLore.bestiary.dart_swarmer.defeats, 2);
  const merged = mergeCodexBestiaryRows(record.codex.codexLore.bestiary, {
    heavy_gunship: { scannedAt: 3, engagedAt: 5 },
  });
  assert.deepEqual(Object.keys(merged), ['dart_swarmer', 'heavy_gunship']);
  assert.equal(merged.dart_swarmer.defeats, 2);
  assert.equal(merged.heavy_gunship.engagedAt, 5);
});
