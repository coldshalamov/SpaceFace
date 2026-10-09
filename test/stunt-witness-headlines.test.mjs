// STUNT WITNESS HEADLINES (U8) — THE MARGIN RUNS IT. A rare or legendary physics stunt is
// witnessed news: named, credited, cited, once per episode. Ordinary tricks stay receipts
// and Crucible keeps its own scoring.
//
// Contract (deterministic):
//   1. a legendary trick makes the wire, named and credited;
//   2. a rare trick with real collateral makes it too; a common trick and a rare trick with
//      no collateral stay receipts;
//   3. one headline per episode, however the receipt replays;
//   4. a Crucible run never feeds the adventure wire.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';

const SEED = 4242;

function boot(mode = 'flight') {
  const sim = createSimulation({ seed: SEED, systems: [] });
  sim.state.mode = mode;
  sim.state.world.currentSectorId = 'sector_helios_prime';
  return { sim, state: sim.state, bus: sim.bus };
}

function headlines(t) {
  const model = t.state.ui && t.state.ui.marketNews;
  return model && Array.isArray(model.log) ? model.log.map((h) => h.text) : [];
}

test('stunt headlines: legendary and collateral-heavy rare tricks make the wire', async () => {
  const t = boot();
  const { createMarketNews } = await import('../src/ui/marketNews.js');
  const news = createMarketNews({ state: t.state, bus: t.bus });

  t.bus.emit('stunt:trickDetected', {
    episodeId: 'ep_1', trickId: 'wrecking_ball', name: 'Wrecking Ball', rarity: 'legendary',
    modifiers: { collateralCount: 1 },
  });
  t.bus.emit('stunt:trickDetected', {
    episodeId: 'ep_2', trickId: 'clothesline', name: 'Clothesline', rarity: 'rare',
    modifiers: { collateralCount: 3 },
  });

  const lines = headlines(t);
  assert.ok(lines.some((x) => x.includes('WITNESSED: Wrecking Ball') && x.includes('whose ship')),
    `legendary named: ${JSON.stringify(lines)}`);
  assert.ok(lines.some((x) => x.includes('WITNESSED: Clothesline') && x.includes('3 hulls')),
    `rare+collateral named: ${JSON.stringify(lines)}`);
});

test('stunt headlines: ordinary tricks stay receipts; one headline per episode', async () => {
  const t = boot();
  const { createMarketNews } = await import('../src/ui/marketNews.js');
  const news = createMarketNews({ state: t.state, bus: t.bus });

  t.bus.emit('stunt:trickDetected', {
    episodeId: 'ep_3', trickId: 'near_miss', name: 'Near Miss', rarity: 'common',
    modifiers: { collateralCount: 1 },
  });
  t.bus.emit('stunt:trickDetected', {
    episodeId: 'ep_4', trickId: 'tow_kill', name: 'Tow Kill', rarity: 'rare',
    modifiers: { collateralCount: 1 },
  });
  assert.equal(headlines(t).filter((x) => x.includes('WITNESSED')).length, 0,
    'no collateral, no wire');

  t.bus.emit('stunt:trickDetected', {
    episodeId: 'ep_1', trickId: 'wrecking_ball', name: 'Wrecking Ball', rarity: 'legendary',
    modifiers: { collateralCount: 1 },
  });
  t.bus.emit('stunt:trickDetected', {
    episodeId: 'ep_1', trickId: 'wrecking_ball', name: 'Wrecking Ball', rarity: 'legendary',
    modifiers: { collateralCount: 1 },
  });
  assert.equal(headlines(t).filter((x) => x.includes('Wrecking Ball')).length, 1,
    'one headline per episode');
});

test('stunt headlines: the Crucible never feeds the adventure wire', async () => {
  const t = boot();
  t.state.run = { kind: 'survival', phase: 'active' };
  const { createMarketNews } = await import('../src/ui/marketNews.js');
  const news = createMarketNews({ state: t.state, bus: t.bus });

  t.bus.emit('stunt:trickDetected', {
    episodeId: 'ep_swarm', trickId: 'wrecking_ball', name: 'Wrecking Ball', rarity: 'legendary',
    modifiers: { collateralCount: 4 },
  });
  assert.equal(headlines(t).filter((x) => x.includes('WITNESSED')).length, 0,
    'the arena scores itself');
});
