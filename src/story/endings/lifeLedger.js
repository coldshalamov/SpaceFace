// One read-only normalization boundary for live GameState, raw v14 data, and {data: v14} saves.
// A current wanted level is not a lifetime crime count. Unknown is never silently made innocent.
import { dossArchiveEvidence } from '../../data/dossArchive.js';
import { CAPITAL_SHIP_DEF_IDS, BRANCH_FACTION } from './endingDefs.js';
import { array, object, number, count, key, text, timestamp, freeze } from './value.js';

export const LIFE_LEDGER_SCHEMA = 'spaceface.endingLifeLedger.v1';
const CAPITALS = new Set(CAPITAL_SHIP_DEF_IDS);
const LAW_WORK = new Set(['patrol_clear', 'bounty_hunt', 'escort']);
const ROUTE_WORK = new Set(['cargo_delivery', 'bulk_trade', 'bulk_haul', 'passenger_transport', 'smuggling']);
const ACE_META = new Set(['schemaVersion', 'news', 'activeReturns', 'cultureIntros', 'planetChallenges', 'playerStyle', 'aces']);

export function ledgerSource(input) {
  const root = object(input);
  const s = root.data && root.data.player && root.data.missions ? object(root.data) : root;
  const saved = !s.story && s.missions && s.missions.story;
  return {
    state: s, saved: !!saved,
    story: object(saved ? s.missions.story : s.story),
    missions: object(saved ? s.missions.missions : s.missions),
    player: object(s.player), cargo: object(saved ? s.cargo : object(s.player).cargo),
    world: object(s.world), factions: object(s.factions),
    simTime: Math.max(0, number(s.simTime, number(object(s.entities).simTime, number(object(s.meta).playtimeS)))),
    seed: number(object(s.meta).seed) >>> 0,
  };
}

function completedRows(missions) {
  const seen = new Map();
  for (const row of array(missions.completedLog)) {
    const r = object(row), id = key(r.id || r.missionId);
    if (!id || ['failed', 'abandoned', 'active'].includes(r.status)) continue;
    // A row belongs to the completed-log owner. No success inferred from active mission params.
    const clean = {
      id, type: text(r.type, 64), storyTag: text(r.storyTag || r.storyContractId, 160),
      factionId: text(r.factionId, 64), at: timestamp(r.completedAtS) ? r.completedAtS : null,
    };
    // Conflicting duplicate ids are not allowed to smuggle in a more favorable mission type.
    if (seen.has(id) && JSON.stringify(seen.get(id)) !== JSON.stringify(clean)) seen.set(id, null);
    else if (!seen.has(id)) seen.set(id, clean);
  }
  return [...seen.values()].filter(Boolean).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function namedDebts(story) {
  const debts = object(object(story.moralMemory).debts);
  return Object.entries(debts).flatMap(([id, raw]) => {
    const r = object(raw);
    if (!key(id) || key(r.id) !== key(id) || !timestamp(r.recordedAt)) return [];
    if (!['pending', 'revealed'].includes(r.status)) return [];
    const cause = text(r.cause, 64);
    return [{
      id: key(id), name: text(r.name) || key(id), cause, recordedAt: r.recordedAt,
      status: r.status,
      // Do not leak the seeded ally/vengeful outcome before the reveal.
      disposition: r.status === 'revealed' && ['ally', 'vengeful'].includes(r.disposition) ? r.disposition : null,
      explicitMercy: cause === 'spared', escaped: cause === 'spared_escape',
      source: 'story.moralMemory.debts', currentSurvival: 'unverified',
    }];
  }).sort((a, b) => a.recordedAt - b.recordedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function defeatedAces(state) {
  const bag = object(state.aceMemory), found = new Set();
  for (const entries of [object(bag.aces), bag]) {
    for (const [id, raw] of Object.entries(entries)) {
      if (!ACE_META.has(id) && object(raw).defeated === true && key(id)) found.add(key(object(raw).id || id));
    }
  }
  return [...found].sort();
}

function originIds(state) {
  // Runtime career bag is known; the opaque serialized careerOrigins bag is NOT guessed at.
  const origins = object(object(state.careers).origins);
  return ['hauler', 'hunter', 'prospector'].filter(id => {
    const r = object(origins[id]);
    return ['accepted', 'active', 'completed'].includes(r.status)
      || timestamp(r.acceptedAtS) || timestamp(r.completedAtS) || r.accepted === true;
  });
}

/** A finite snapshot whose scalars never alias the source save. */
export function readLifeLedger(input) {
  const src = ledgerSource(input), { state, story, player, cargo, world, factions, missions } = src;
  const flags = object(story.flags), stats = object(player.stats);
  const rows = completedRows(missions);
  const ownedDefIds = array(player.ownedShips).map(ship => typeof ship === 'string' ? text(ship) : text(object(ship).defId)).filter(Boolean);
  const capitalOwned = ownedDefIds.some(id => CAPITALS.has(id));
  const credits = number(player.credits), debt = Math.max(0, number(player.debt));
  // Retain the old conservative hull proxy, but subtract debt. Do NOT pretend this is a market appraisal.
  const assetProxyCr = ownedDefIds.length * 2000 + (capitalOwned ? 25000 : 0);
  const netWorthCr = Math.max(0, credits + assetProxyCr - debt);
  const items = object(cargo.items);
  const cargoIds = Object.keys(items).filter(id => number(items[id]) > 0).sort();
  const cap = number(cargo.capVolume), used = number(cargo.usedVolume, -1);
  const numericCargoKnown = typeof cargo.usedVolume === 'number' && Number.isFinite(cargo.usedVolume) && cap > 0 && used >= 0;
  const persistent = array(story.persistentCargo).filter(id => typeof id === 'string');
  const hasLedger = cargoIds.includes('cmdty_personal_ledger');
  // The native ledger is persistent; a durable persistent marker plus its owner flag can recover a v14
  // snapshot whose cargo projection omitted it. A naked hasLedger flag is not sufficient.
  const ledgerCustody = hasLedger || (flags.hasLedger === true && persistent.includes('cmdty_personal_ledger'));
  const claims = array(object(state.claims).bodies).filter(r => key(object(r).id || object(r).poiId || object(r).name));
  const camp = object(story.campaign47a);
  const outposts = array(object(state.automation).outposts).filter(r => key(object(r).id || object(r).poiId || object(r).stationId));
  const campOutposts = array(camp.outpostsOwned).filter(r => key(typeof r === 'object' ? r.id : r));
  const hasOutpost = outposts.length > 0 || campOutposts.length > 0;
  const aceIdsBeaten = defeatedAces(state);
  const rep = Object.fromEntries(Object.keys(factions).sort().map(id => [id, number(object(factions[id]).rep)]));
  const branch = ['traders', 'patrol', 'free'].includes(story.branch) ? story.branch : null;
  const branchFactionId = branch ? BRANCH_FACTION[branch] : null;
  const branchRep = branchFactionId ? number(rep[branchFactionId]) : Math.max(0, ...Object.values(rep));
  const applied = object(player.heatIncidentsApplied);
  const incidentIds = Object.keys(applied).filter(id => applied[id] === true && key(id)).sort();
  const debts = namedDebts(story);
  const archives = dossArchiveEvidence({ world }).map(r => ({ id: r.id, title: r.title, detail: r.detail }));
  const lungOutcome = (archives.find(r => r.id === 'lung_of_charon_case') || {}).detail || null;
  const rescueContractIds = rows.filter(r => r.type === 'rescue_under_fire').map(r => r.id);
  const operationRows = rows.filter(r => /^campaign47a:b7:(custody|force):[^\s]+$/.test(r.storyTag));
  const deepReachComplete = flags.deep_reach_operation_complete === true || operationRows.length > 0;
  const deskVisited = flags.kurtz_desk_opened === true || ledgerCustody;
  const ashfallVisited = flags.ashfall_visited === true || flags.deep_reach_ashfall_docked === true || deskVisited;
  const discoveredSectorIds = Object.keys(object(world.discovery)).filter(id => {
    const r = object(world.discovery[id]);
    return r.visited === true || r.discovered === true || timestamp(r.firstVisitedAt);
  }).sort();
  const tradeCount = count(stats.tradesCount), missionsDone = count(stats.missionsDone);
  const passiveLifetime = Math.max(0, number(stats.totalPassiveEarnedLifetime), number(object(object(state.automation).meta).totalPassiveEarnedLifetime));
  const smuggledValue = Math.max(0, number(stats.smuggledValue));
  const lawfulContracts = rows.filter(r => LAW_WORK.has(r.type)).length;
  const routeContracts = rows.filter(r => ROUTE_WORK.has(r.type)).length;
  // A late-career witness can resolve a life without manufacturing a missing quest flag. The
  // independent route requires real ledger custody and at least THREE distinct kinds of lived work.
  const careerEvidence = [
    tradeCount >= 25 ? 'trade_history' : null,
    Math.max(missionsDone, rows.length) >= 6 ? 'contract_history' : null,
    aceIdsBeaten.length > 0 ? 'named_combat' : null,
    passiveLifetime > 0 ? 'operating_assets' : null,
    archives.length >= 2 ? 'recovered_archive' : null,
    lungOutcome === 'rescue' || debts.some(r => r.explicitMercy) ? 'recorded_lives' : null,
  ].filter(Boolean);
  const independentWitness = ledgerCustody && careerEvidence.length >= 3;
  const evidence = [
    { id: 'wealth', path: 'player.credits - player.debt + ownedShips proxy', confidence: 'proxy', detail: 'Liquid credits, debt, and conservative hull allowance; no market valuation.' },
    { id: 'crime', path: 'player.heatIncidentsApplied', confidence: incidentIds.length ? 'lower_bound' : 'unknown', detail: 'Accepted incident ids only. Absence is not an acquittal. Kills are not presumed crimes.' },
    { id: 'smuggling', path: 'player.stats.smuggledValue', confidence: typeof stats.smuggledValue === 'number' && Number.isFinite(stats.smuggledValue) ? 'recorded' : 'unknown', detail: 'Recorded value, not an incident count or a proof of victim harm.' },
    { id: 'lives', path: 'world.discovery + story.moralMemory.debts', confidence: lungOutcome || debts.length ? 'recorded' : 'unknown', detail: 'Distinguishes a rescued cohort, explicit mercy, and an escaped opponent. No current-survival claim.' },
    { id: 'contracts', path: src.saved ? 'missions.missions.completedLog' : 'missions.completedLog', confidence: rows.length ? 'lower_bound' : 'unknown', detail: 'Distinct retained completions; no number of people inferred from rescue contracts.' },
    { id: 'campaign', path: 'story.flags.deep_reach_operation_complete / completedLog.storyTag / independent career evidence', confidence: deepReachComplete || independentWitness ? 'recorded' : 'missing', detail: 'Place and lived evidence, never beatIndex alone.' },
  ];
  const actualFields = Object.values(object(world.discovery)).reduce((n, r) => n + Object.values(object(object(r).fieldsDepleted)).filter(v => number(v) > 0).length, 0);
  return freeze({
    schema: LIFE_LEDGER_SCHEMA, seed: src.seed, simTime: src.simTime,
    beatIndex: count(story.beatIndex), branch, branchFactionId, branchRep,
    endgameFlag: flags.endgame === true, endgameOffered: story.endgameOffered === true,
    endgameChoice: typeof story.endgameChoice === 'string' ? story.endgameChoice : null,
    endgameResolved: story.endgameResolved === true || !!story.endgameChoice || flags.sandboxContinued === true,
    sandboxContinued: flags.sandboxContinued === true,
    pendingChoice: text(object(story.endgamePending).choice) || null,
    declined: [...new Set(array(story.endgameDeclined).filter(id => ['A', 'B', 'C', 'D', 'E'].includes(id)))].sort(),
    credits, debt, assetProxyCr, netWorthCr, wealthBasis: 'conservative_hull_proxy_less_debt',
    scnRep: number(rep.faction_scn), mtsRep: number(rep.faction_mts), freeRep: number(rep.faction_free),
    quietRep: number(rep.faction_quiet), factionStandings: rep,
    ownedDefIds, capitalOwned, hasClaim: claims.length > 0, hasOutpost,
    empireStake: capitalOwned || claims.length > 0 || hasOutpost,
    combatStake: aceIdsBeaten.length > 0, worldStake: capitalOwned || claims.length > 0 || hasOutpost || aceIdsBeaten.length > 0,
    // Compatibility diagnostics, not surrogate gameplay evidence. No unrecorded tow inferred from B3.
    towClass: rows.some(r => r.type === 'tow_recovery') ? 'medium' : 'none',
    towClassOk: rows.some(r => r.type === 'tow_recovery'), fieldCount: actualFields, hasField: actualFields > 0,
    acesBeaten: aceIdsBeaten.length, aceIdsBeaten, origins: originIds(state),
    cargoIds, hasLedger: ledgerCustody, hasCoords: flags.hasCoords === true,
    cargoFillKnown: numericCargoKnown, fullLoad: numericCargoKnown && used >= cap * 0.95,
    activeMissionCount: array(missions.active).length, missionActivityKnown: Array.isArray(missions.active),
    noActiveMissions: Array.isArray(missions.active) && missions.active.length === 0,
    sectorId: text(world.currentSectorId) || null, inAshfall: world.currentSectorId === 'sector_ashfall_reach',
    heat: Math.max(0, Math.min(1, number(player.heat))),
    heatKnown: typeof player.heat === 'number' && Number.isFinite(player.heat),
    incidentIds, crimeCoverage: 'partial', smuggledValue,
    kills: count(stats.kills), killsAreCrimes: false,
    tradeCount, missionsDone, lawfulContracts, routeContracts, completedIds: rows.map(r => r.id),
    lifetimeProfit: number(stats.lifetimeProfit), passiveLifetime,
    namedDebts: debts, explicitMercyCount: debts.filter(r => r.explicitMercy).length,
    escapedOpponentCount: debts.filter(r => r.escaped).length,
    rescueContractIds, lungOutcome, archiveSources: archives, discoveredSectorIds,
    deepReachComplete, deskVisited, ashfallVisited, independentWitness, careerEvidence,
    readyByHistory: deepReachComplete || independentWitness,
    heliosGridFound: flags.helios_bay7_scanned === true,
    // This is the aftermath fact, not its private unrevealed inputs.
    valeGatesRevoked: object(story.verge).valeGatesRevoked === true,
    evidence,
  });
}
