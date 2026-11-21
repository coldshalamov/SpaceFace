// Adventure experience sources (FIRST HOUR, 2026-11-21; design/overhaul/06 §2.3).
//
// Adventure used to give no experience at all (runSession.award refuses the Adventure run).
// This module is the single place that turns what the pilot DOES in Adventure into experience:
// it listens to the existing sim receipts and emits one event,
//
//   pilot:xpEarned { xp, source, label }
//
// which the progression owner (runSession / the Pilot Tree) banks and levels. Nothing here
// writes player state. Deterministic: event-driven only, no wall time, no randomness.
//
// Scale (agreed with the progression lead): a fighter kill ~10, a job ~60, a sale ~1 per 100 cr
// of profit, a discovery ~40; hauling and mining pay small, steady amounts so the first mining
// loop visibly moves the bar.
const XP = Object.freeze({
  killMin: 5,
  killPerHull: 1 / 15,      // a 150-hull fighter ≈ 10
  killMax: 80,
  bossKill: 150,
  jobBase: 40,
  jobPerCr: 1 / 200,        // a 4,000 cr job ≈ 60
  jobMax: 200,
  haulPerDelivery: 12,
  minePerUnits: 10,         // 1 XP per 10 units of ore that reach the hold…
  mineBatchXp: 3,           // …paid in batches of 3 XP so the bar ticks, not the toast feed
  salePerCr: 1 / 100,
  saleMax: 150,
  poiDiscovery: 40,
  sectorDiscovery: 60,
});
export const ADVENTURE_XP = XP;

function adventureLive(state) {
  if (!state || state.mode === 'menu') return false;
  const run = state.run;
  // Swarm and lab runs own their own XP path; Adventure is everything else.
  if (run && (run.kind === 'survival' || run.kind === 'lab') && run.phase !== 'inactive') return false;
  if (state.physicsVenueSession) return false;
  return true;
}

function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

export function installAdventureXp(owner) {
  const state = owner.state;
  const bus = owner.bus;
  if (!state || !bus || typeof bus.on !== 'function') return [];
  let mineUnits = 0;
  const earn = (xp, source, label) => {
    const amount = Math.max(0, Math.round(xp));
    if (amount <= 0 || !adventureLive(state)) return;
    bus.emit('pilot:xpEarned', { xp: amount, source, label });
  };
  const unsubs = [];
  unsubs.push(bus.on('entity:killed', (p) => {
    if (!p || p.killerId == null || p.killerId !== state.playerId) return;
    const e = state.entities && state.entities.get(p.id);
    if (!e || e.id === state.playerId || e.type !== 'ship') return;
    if (e.team === 0 && !(e.data && e.data.ai && e.data.ai.hostile)) return; // no XP for killing your own side
    const d = e.data || {};
    if (d.isBoss) return earn(XP.bossKill, 'kill', `Destroyed ${d.name || e.name || 'the boss'}`);
    const hull = Number(e.hullMax) || 150;
    const xp = Math.min(XP.killMax, Math.max(XP.killMin, hull * XP.killPerHull));
    earn(xp, 'kill', `Destroyed ${d.name || e.name || 'a hostile'}`);
  }));
  unsubs.push(bus.on('mission:completed', (p) => {
    if (!p) return;
    const reward = Number(p.rewardCr) || 0;
    const xp = Math.min(XP.jobMax, XP.jobBase + reward * XP.jobPerCr);
    earn(xp, 'job', 'Job done');
  }));
  unsubs.push(bus.on('cargo:delivered', (p) => {
    // A contract haul the pilot carried in (yard courier pods emit the same receipt without a job).
    if (!p || p.missionId == null) return;
    earn(XP.haulPerDelivery, 'haul', 'Cargo delivered');
  }));
  unsubs.push(bus.on('mining:yield', (p) => {
    if (!p || p.minerId == null || p.minerId !== state.playerId) return;
    const qty = Number.isFinite(p.acceptedAmount) ? p.acceptedAmount : Number(p.qty) || 0;
    if (qty <= 0) return;
    mineUnits += qty;
    const batchUnits = XP.minePerUnits * XP.mineBatchXp;
    if (mineUnits >= batchUnits) {
      const batches = Math.floor(mineUnits / batchUnits);
      mineUnits -= batches * batchUnits;
      earn(batches * XP.mineBatchXp, 'mine', `Mined ${plural(batches * batchUnits, 'unit')} of ore`);
    }
  }));
  unsubs.push(bus.on('economy:tradeCompleted', (p) => {
    if (!p || p.side !== 'sell') return;
    const profit = Number(p.profit);
    if (!(profit > 0)) return;
    const xp = Math.min(XP.saleMax, Math.max(1, profit * XP.salePerCr));
    earn(xp, 'sale', `Sold ${plural(Number(p.qty) || 0, 'unit')} for ${Math.round(profit)} cr profit`);
  }));
  unsubs.push(bus.on('poi:discovered', () => earn(XP.poiDiscovery, 'discovery', 'New place found')));
  unsubs.push(bus.on('sector:discovered', () => earn(XP.sectorDiscovery, 'discovery', 'New sector charted')));
  unsubs.push(bus.on('game:newGame', () => { mineUnits = 0; }));
  return unsubs;
}
