// SWARM-01 — the persistent Hangar. Bounty bought between runs never enters the adventure wallet.

import { SWARM_BOSS_EVERY, isSwarmBossWave } from './swarmMode.js';

export const HANGAR_TRACKS = Object.freeze([
  Object.freeze({ id: 'plating', name: 'Plating', stat: 'hull', perRank: 0.05, prices: Object.freeze([100, 250, 500, 900, 1400]) }),
  Object.freeze({ id: 'shield', name: 'Shield capacitor', stat: 'shield', perRank: 0.05, prices: Object.freeze([100, 250, 500, 900, 1400]) }),
  Object.freeze({ id: 'war_chest', name: 'War chest', stat: 'purse', perRank: 100, prices: Object.freeze([100, 250, 500, 900, 1400]) }),
  Object.freeze({ id: 'broker', name: 'Broker', stat: 'price', perRank: 0.04, prices: Object.freeze([100, 250, 500, 900, 1400]) }),
  Object.freeze({ id: 'rerolls', name: 'Rerolls', stat: 'reroll', perRank: 1, prices: Object.freeze([100, 250, 500, 900, 1400]) }),
  Object.freeze({ id: 'magnet', name: 'Magnet', stat: 'magnet', perRank: 0.15, prices: Object.freeze([100, 250, 500, 900, 1400]) }),
]);

const TRACK_BY_ID = new Map(HANGAR_TRACKS.map((row) => [row.id, row]));
const RANK_CAP = 5;

export function emptyHangar() {
  return { bounty: 0, ranks: {}, settledKeys: [], ownedHulls: [], rerollsUsed: 0 };
}

export function migrateHangar(raw) {
  const empty = emptyHangar();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const bounty = Math.max(0, Math.round(Number(raw.bounty) || 0));
  const ranks = {};
  const srcRanks = raw.ranks && typeof raw.ranks === 'object' ? raw.ranks : {};
  for (const track of HANGAR_TRACKS) {
    const n = Math.round(Number(srcRanks[track.id]) || 0);
    if (n > 0) ranks[track.id] = Math.min(RANK_CAP, n);
  }
  const settledKeys = Array.isArray(raw.settledKeys)
    ? raw.settledKeys.filter((key) => typeof key === 'string').slice(-80)
    : [];
  const ownedHulls = Array.isArray(raw.ownedHulls)
    ? raw.ownedHulls.filter((id) => typeof id === 'string' && !/saucer/i.test(id))
    : [];
  return {
    bounty,
    ranks,
    settledKeys,
    ownedHulls,
    rerollsUsed: Math.max(0, Math.round(Number(raw.rerollsUsed) || 0)),
  };
}

export function hangarRank(hangar, trackId) {
  const bag = hangar || emptyHangar();
  return Math.max(0, Math.min(RANK_CAP, Math.round(Number(bag.ranks && bag.ranks[trackId]) || 0)));
}

export function bossWasCleared(result) {
  const cleared = Math.round(Number(result && (result.wavesCleared != null ? result.wavesCleared : result.wave)) || 0);
  if (cleared < SWARM_BOSS_EVERY) return false;
  for (let wave = SWARM_BOSS_EVERY; wave <= cleared; wave += SWARM_BOSS_EVERY) {
    if (isSwarmBossWave(wave)) return true;
  }
  return false;
}

/** Death banks half. A chosen cash-out after a boss banks all. An early cash-out banks half. */
export function bankFraction(result) {
  if (!result) return 0;
  const outcome = String(result.outcome || '');
  const died = outcome === 'dead' || outcome === 'died' || outcome === 'death';
  const cashed = result.cashOut === true || outcome === 'extracted';
  if (died) return 0.5;
  if (cashed && bossWasCleared(result)) return 1;
  if (cashed) return 0.5;
  return 0;
}

export function settleKey(result) {
  if (!result) return 'run:none';
  if (result.runId != null) return `run:${result.runId}`;
  return [
    'run',
    result.seed ?? 'na',
    result.endedAt ?? result.t ?? 'na',
    result.wave ?? result.wavesCleared ?? 0,
    result.outcome || 'open',
  ].join(':');
}

export function applyBank(hangar, result) {
  const bag = migrateHangar(hangar);
  const key = settleKey(result);
  const fraction = bankFraction(result);
  if (bag.settledKeys.includes(key)) {
    return {
      hangar: bag, banked: 0, hangarBounty: bag.bounty, cashOut: fraction === 1, duplicate: true,
    };
  }
  const credits = Math.max(0, Math.round(Number(result && result.credits) || 0));
  const banked = Math.floor(credits * fraction);
  if (banked > 0 || fraction > 0) bag.settledKeys.push(key);
  bag.bounty += banked;
  return {
    hangar: bag, banked, hangarBounty: bag.bounty, cashOut: fraction === 1, duplicate: false,
  };
}

export function trackPrice(trackId, rank) {
  const track = TRACK_BY_ID.get(trackId);
  if (!track) return null;
  const next = Math.max(0, Math.round(Number(rank) || 0));
  if (next >= RANK_CAP) return null;
  return track.prices[next];
}

export function buyTrack(hangar, trackId) {
  const bag = migrateHangar(hangar);
  const rank = hangarRank(bag, trackId);
  const price = trackPrice(trackId, rank);
  if (price == null) return { ok: false, reason: 'maxed', hangar: bag };
  if (bag.bounty < price) return { ok: false, reason: 'short', hangar: bag, price };
  bag.bounty -= price;
  bag.ranks[trackId] = rank + 1;
  return { ok: true, hangar: bag, rank: rank + 1, price };
}

export function buyHull(hangar, hullId, price) {
  const bag = migrateHangar(hangar);
  if (typeof hullId !== 'string' || /saucer/i.test(hullId)) {
    return { ok: false, reason: 'refused', hangar: bag };
  }
  if (bag.ownedHulls.includes(hullId)) return { ok: true, hangar: bag, duplicate: true };
  const cost = Math.max(0, Math.round(Number(price) || 0));
  if (bag.bounty < cost) return { ok: false, reason: 'short', hangar: bag };
  bag.bounty -= cost;
  bag.ownedHulls.push(hullId);
  return { ok: true, hangar: bag };
}

export function purseBonusFor(hangar) {
  return hangarRank(hangar, 'war_chest') * 100;
}

export function brokerMultiplier(hangar) {
  const rank = hangarRank(hangar, 'broker');
  return Math.max(0, 1 - rank * 0.04);
}

export function magnetMultiplier(hangar) {
  const rank = hangarRank(hangar, 'magnet');
  return rank > 0 ? 1 + rank * 0.15 : 1;
}

export function hangarRerollState(run) {
  const hangar = run && run.telemetry && run.telemetry.hangar;
  const free = hangarRank(hangar, 'rerolls');
  const used = Math.max(0, Math.round(Number(hangar && hangar.rerollsUsed) || 0));
  const left = Math.max(0, free - used);
  return {
    available: left > 0,
    reason: left > 0 ? 'hangar_reroll' : 'armory',
    freeRerolls: left,
  };
}

export function consumeHangarReroll(hangar) {
  const bag = migrateHangar(hangar);
  const state = hangarRerollState({ telemetry: { hangar: bag } });
  if (!state.available) return { ok: false, hangar: bag };
  bag.rerollsUsed += 1;
  return { ok: true, hangar: bag };
}
