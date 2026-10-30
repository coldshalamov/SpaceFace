// R1 authored unique-wreck runtime and canonical bearing authority.
// Owns only state.player.uniqueWrecks: what the player has read, fixed, recovered, and received.
// It does not write credits, cargo, ship inventory, lossLedger, world discovery, or T4c aftermath
// state. Rewards route through cargo's pickup:collected seam and ships.grantModule().

import { FLAVOR_SOURCE_BY_REF } from '../data/flavor/index.generated.js';
import { ENCOUNTERS } from '../data/encounters/index.generated.js';
import { salvagePoolForWreck } from '../data/salvageLegality.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../data/wreckClasses.js';
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';
import { hash32, mulberry32 } from '../core/rng.js';
import { syncEntitySectorMembership } from '../core/coreSystem.js';
import { deferSectorEnterMaterialization, deferredEnterNow, deferredEnterTick } from '../core/sectorEnterDefer.js';
import { fittedModuleDefs } from '../core/fittedModules.js';
import { normalizeRunShareWreck, runShareWreckId } from '../core/runShareCode.js';
import { blackBoxRecording } from '../sim/blackBoxTape.js';
import { SHIPS } from '../data/ships.js';
import {
  complicationEncounterId,
  deterministicTimer,
  movingRadiationGate,
  rewardDescriptors,
} from '../core/uniqueWreckComplications.js';
import { provenanceStamp } from '../data/lineProgression.js';
import {
  STORY_BUYER_CHOICE_PREFIX, STORY_BUYER_CONTACT_PREFIX, STORY_REWARD_BUYERS,
  storyBuyerAtStation, storyBuyerOffersAt, storyBuyerRepDeltas, storyBuyerRow,
} from '../data/storyRewardBuyers.js';
import {
  UNIQUE_WRECK_MATERIALIZE_PHASES,
  UNIQUE_WRECK_RECEIPT_LIMIT,
  UNIQUE_WRECK_SCAN_RADIUS,
  UNIQUE_WRECK_STATE_SCHEMA_VERSION,
  CERES_ACTIVITY_WRECKS,
  EXPANSION_ACTIVITY_WRECKS,
  UNIQUE_WRECKS,
  placementForUniqueWreck,
  programSeedFor,
  promoteToAuthored,
  uniqueWreckById,
  uniqueWreckForSource,
} from '../data/uniqueWrecks.js';
import { planEncounterShape } from './encounterDirector.js';
import { isSurvivalRunLive } from './adventureMigration.js';
import {
  isPlayerWreckMarker,
  PLAYER_WRECK_ENCOUNTER_ID,
} from './aftermathWrecks.js';
import { indexedTypeScan } from '../world/livingWorldViews.js';
import { cargoUnitVolume } from './cargo.js';
import { createChoirReliefBerth, normalizeChoirRelief } from './choirReliefBerth.js';
import { createMemorialThief, normalizeMemorialThief } from './memorialThief.js';
// PB-CONS-B (SF-156 + SF-162): the aftermath-people companions, same hosting law as the Choir
// berth — durable world records live in this owner's saved bag, the physical people ride the
// job kernel, and every consequence outside the records stays with its canonical owner.
import { createRescuedWorkerReturn, normalizeRescuedWorkers } from './rescuedWorkerReturn.js';
import { createScavengerOccupationSwitch, normalizeOccupationSwitch } from './scavengerOccupationSwitch.js';
// SF-141: warm-site freight rides the same physical pod contract as every other spilled lot —
// persistent, colliding, salvage-scoopable, and theft-priced by law through its owner stamp.
import { spawnJettisonedCargoPod } from './lootShards.js';

// The materialize phase set lives beside the registry so the sector decode warms grade
// the same gate without importing this module (data/uniqueWrecks.js owns the constants).
const VALID_PHASES = UNIQUE_WRECK_MATERIALIZE_PHASES;

// Every def the runtime can mint a bearing for: D1-D16, the Ceres tender, and the expansion
// activity hulls. Save normalization must walk all of them — walking only the sixteen authored
// slots dropped a charted/salvaged Ceres or expansion hull on load, so it re-rumored and re-paid.
const ALL_WRECK_DEFS = Object.freeze([
  ...UNIQUE_WRECKS,
  ...CERES_ACTIVITY_WRECKS,
  ...EXPANSION_ACTIVITY_WRECKS,
]);

// The seven canon rumor channels remain native surfaces. A carrier event is only a transport:
// `_recordRumor` additionally requires the exact primary sourceRef and matching channel.
export const RUMOR_EVENT_BY_CHANNEL = Object.freeze({
  news: 'news:headline',
  comms_intercept: 'comms:popup',
  bark: 'barkDirector:voice',
  mission: 'mission:accepted',
  campaign: 'story:beatAdvanced',
  loss_investigation: 'lossInvestigation:authoredRead',
  bar: 'uniqueWreck:rumorHeard',
});

// Sector-entry first-read surfaces. Four authored wrecks had no always-live producer for their
// canonical channel (loss_investigation machinery, late-campaign story beats, Vael patrol barks),
// so their biggest story payoffs were sealed behind a once-per-save numbers-station lottery. Each
// row names the carrier that delivers the wreck's authored sourceText when the player enters its
// home sector. `_surfaceCanonicalRumor` carries the def's exact bearingSourceRef + channel, so
// `_recordRumor`'s source gate stays the only minting authority — these surfaces never invent a
// bearing, and the organic producers (real story beats, loss promotion, bar keeps) remain
// alternate carriers of the same single first read.
export const SECTOR_RUMOR_SURFACES = Object.freeze({
  sector_nyx_march: {
    wreckId: 'wreck_dmc_ironsong',
    channelId: 'comms_intercept',
    eventName: 'comms:popup',
    extra: { sender: 'QUIET CUT-LANE INTERCEPT' },
  },
  sector_eunomia_gulf: {
    wreckId: 'wreck_gravhand_tideline',
    channelId: 'news',
    eventName: 'news:publish',
    extra: { sender: 'EUNOMIA RECOVERY DESK' },
  },
  // D1: the Concord case file rides the news ticker; the record still mints under its authored
  // loss_investigation channel via the exact loss.vigilant sourceRef.
  sector_veil_nebula: {
    wreckId: 'wreck_isc_vigilant',
    channelId: 'loss_investigation',
    eventName: 'news:publish',
    extra: { sender: 'CONCORD CASE DESK' },
  },
  // D5: a Vael patrol taunt on the bark channel — the shrine warns the tractor-happy.
  sector_triton_wake: {
    wreckId: 'wreck_choir_bell_aegis',
    channelId: 'bark',
    eventName: 'barkDirector:voice',
    extra: { factionId: 'faction_vael', situation: 'patrol_contact' },
  },
  // D3/D12: campaign-relay comms popups shaped exactly like the carrier `_onNativeRumor` builds
  // when a real story beat 7/6 arrives — without emitting a synthetic story:beatAdvanced, which
  // would fire story.js's whole beat device chain for a beat that did not happen.
  sector_ashfall_reach: {
    wreckId: 'wreck_isc_lighthouse',
    channelId: 'campaign',
    eventName: 'comms:popup',
    extra: { sender: 'ASHFALL CAMPAIGN RELAY', beatIndex: 7 },
  },
  sector_haumea_rift: {
    wreckId: 'wreck_choir_cassandra',
    channelId: 'campaign',
    eventName: 'comms:popup',
    extra: { sender: 'CASSANDRA DIPLOMATIC THREAD', beatIndex: 6 },
  },
  // Activity hulls with no flavor page. Entering the sector speaks the scan line and charts
  // the bearing. Sectors that already have a canonical surface keep that surface.
  sector_charon_expanse: {
    wreckId: 'wreck_understory_what_the_wreck_became',
    channelId: 'bar',
    eventName: 'uniqueWreck:rumorHeard',
    extra: { sender: 'EXPANSE DOCK' },
  },
  sector_sker_haven: {
    wreckId: 'wreck_pitborn_everything_else',
    channelId: 'bar',
    eventName: 'uniqueWreck:rumorHeard',
    extra: { sender: 'SKER DOCK' },
  },
  sector_tethys_junction: {
    wreckId: 'wreck_fulfillment_route_88',
    channelId: 'bar',
    eventName: 'uniqueWreck:rumorHeard',
    extra: { sender: 'TETHYS DOCK' },
  },
  sector_pallas_drift: {
    wreckId: 'wreck_archive_codex_ix',
    channelId: 'bar',
    eventName: 'uniqueWreck:rumorHeard',
    extra: { sender: 'PALLAS DOCK' },
  },
  sector_dione_lane: {
    wreckId: 'wreck_helix_due_diligence',
    channelId: 'bar',
    eventName: 'uniqueWreck:rumorHeard',
    extra: { sender: 'DIONE DOCK' },
  },
});

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function copyPoint(value, fallback) {
  const base = fallback || { x: 0, z: 0 };
  return {
    x: finite(value && value.x, base.x),
    z: finite(value && value.z, base.z),
  };
}

/**
 * The deterministic plan a wreck complication's fire resolves: pseudo-zone from the def,
 * rng stream keyed on (programSeed, wreck, encounter), day bucket off simTime. Shared by
 * _activateEncounter and the renderer's decode warm so the warm replays the same shape.
 */
export function planUniqueWreckEncounter({ programSeed, def, bearing, complication, sectorId, simTime, shape }) {
  const center = globalToSectorLocalForSector(copyPoint(complication.anchor || bearing.exactPos), sectorId);
  const rng = mulberry32(hash32(
    programSeed,
    def.id,
    complication.encounterId,
    'unique-wreck-direct-encounter:v1',
  ) || 1);
  const zone = {
    id: `unique-wreck-zone:${def.id}`,
    name: def.name,
    type: 'unique_wreck',
    center,
    radius: 520,
    threat: def.programSlot === 'D6' ? 4 : 3,
    factionId: def.factionId,
  };
  return planEncounterShape(
    shape,
    zone,
    sectorId,
    Math.floor(Math.max(0, finite(simTime, 0)) / 600),
    0,
    rng,
  );
}

export function createUniqueWreckState(metaSeed) {
  return {
    schemaVersion: UNIQUE_WRECK_STATE_SCHEMA_VERSION,
    programSeed: programSeedFor(metaSeed),
    bearings: {},
    grants: {},
    storyRewards: {},
    complications: {},
    pingCounts: {},
    pingRisks: {},
    offers: {},
    published: {},
    receipts: [],
    choirRelief: normalizeChoirRelief(),
    memorialThief: normalizeMemorialThief(),
    // PB-CONS-B: the aftermath-people bags live in the same whitelist as the Choir's, so a
    // validation-failure rebuild re-seeds them instead of silently dropping durable people.
    rescuedWorkers: normalizeRescuedWorkers(),
    occupationSwitch: normalizeOccupationSwitch(),
    // SF-141: per-wreck warm-site ledger. `podsSpawnedAtS` makes the loose relief freight a
    // one-shot physical fact — a validation rebuild re-seeds the bag rather than resurrecting
    // pods the world already scooped or cooked off.
    warm: {},
  };
}

export function normalizeUniqueWreckState(value, metaSeed) {
  const input = value && typeof value === 'object' ? value : {};
  const fallback = createUniqueWreckState(metaSeed);
  const programSeed = (Number(input.programSeed) >>> 0) || fallback.programSeed;
  const out = {
    schemaVersion: UNIQUE_WRECK_STATE_SCHEMA_VERSION,
    programSeed,
    bearings: {},
    grants: {},
    storyRewards: {},
    complications: {},
    pingCounts: {},
    pingRisks: {},
    offers: {},
    published: {},
    receipts: [],
    choirRelief: normalizeChoirRelief(input.choirRelief),
    memorialThief: normalizeMemorialThief(input.memorialThief),
    rescuedWorkers: normalizeRescuedWorkers(input.rescuedWorkers),
    occupationSwitch: normalizeOccupationSwitch(input.occupationSwitch),
    warm: {},
  };
  if (Array.isArray(input.crossRunWrecks)) {
    const seen = new Set();
    const wrecks = [];
    for (const candidate of input.crossRunWrecks) {
      const wreck = normalizeRunShareWreck(candidate);
      if (!wreck) continue;
      const id = runShareWreckId(wreck);
      if (seen.has(id)) continue;
      seen.add(id);
      wrecks.push(wreck);
    }
    if (wrecks.length) out.crossRunWrecks = wrecks;
    // Additive ledger (keyed by runShareWreckId, so the shared-wreck identity hash is untouched):
    // a black box already pulled must not be offered again after leaving the sector or reloading.
    const pulled = input.crossRunBlackBoxes && typeof input.crossRunBlackBoxes === 'object'
      ? input.crossRunBlackBoxes : null;
    if (pulled) {
      const kept = {};
      for (const id of seen) if (pulled[id] === true) kept[id] = true;
      if (Object.keys(kept).length) out.crossRunBlackBoxes = kept;
    }
  }
  const bearings = input.bearings && typeof input.bearings === 'object' ? input.bearings : {};
  for (const def of ALL_WRECK_DEFS) {
    const record = bearings[def.id];
    if (!record || typeof record !== 'object') continue;
    const placement = placementForUniqueWreck(programSeed, def.id, def.sectorId);
    const phase = VALID_PHASES.has(record.phase) ? record.phase : 'rumored';
    out.bearings[def.id] = {
      wreckId: def.id,
      name: def.name,
      sectorId: def.sectorId,
      phase,
      sourceRef: typeof record.sourceRef === 'string' ? record.sourceRef : def.bearingSourceRef,
      channelId: typeof record.channelId === 'string' ? record.channelId : null,
      heardAtS: Math.max(0, finite(record.heardAtS, 0)),
      coordSpace: 'global_v1',
      bearingCenter: copyPoint(record.bearingCenter, placement.bearingCenterGlobal),
      radius: Math.max(1, finite(record.radius, placement.radius)),
      exactPos: copyPoint(record.exactPos, placement.exactGlobal),
      fixedPos: phase === 'rumored' ? null : copyPoint(record.fixedPos, placement.exactGlobal),
      fixedAtS: phase === 'rumored' ? null : Math.max(0, finite(record.fixedAtS, 0)),
      reactorDueAt: record.reactorDueAt == null ? null : Math.max(0, finite(record.reactorDueAt, 0)),
      decisionReadyAtS: phase === 'decision' || phase === 'salvaged'
        ? Math.max(0, finite(record.decisionReadyAtS, record.fixedAtS))
        : null,
      choiceId: phase === 'salvaged' && typeof record.choiceId === 'string' ? record.choiceId : null,
      outcome: phase === 'salvaged' && typeof record.outcome === 'string' ? record.outcome : null,
      resolvedAtS: phase === 'salvaged' ? Math.max(0, finite(record.resolvedAtS, record.salvagedAtS)) : null,
      rewardReceipt: phase === 'salvaged' && record.rewardReceipt && typeof record.rewardReceipt === 'object'
        ? clonePlain(record.rewardReceipt)
        : null,
      salvagedAtS: phase === 'salvaged' ? Math.max(0, finite(record.salvagedAtS, 0)) : null,
    };
  }
  const dropIds = new Set(ALL_WRECK_DEFS.flatMap((def) => rewardDescriptors(def)
    .filter((reward) => reward.kind === 'weapon' || reward.kind === 'module')
    .map((reward) => reward.id)));
  const grants = input.grants && typeof input.grants === 'object' ? input.grants : {};
  for (const dropId of dropIds) {
    const grant = grants[dropId];
    if (!grant || typeof grant !== 'object') continue;
    out.grants[dropId] = {
      wreckId: uniqueWreckById(grant.wreckId) ? grant.wreckId : null,
      grantedAtS: Math.max(0, finite(grant.grantedAtS, 0)),
    };
  }
  const storyRewardIds = new Set(ALL_WRECK_DEFS.flatMap((def) => rewardDescriptors(def)
    .filter((reward) => reward.kind === 'story_commodity' || reward.kind === 'story_data')
    .map((reward) => reward.id)));
  const storyRewards = input.storyRewards && typeof input.storyRewards === 'object' ? input.storyRewards : {};
  for (const rewardId of storyRewardIds) {
    const reward = storyRewards[rewardId];
    if (!reward || typeof reward !== 'object') continue;
    out.storyRewards[rewardId] = {
      wreckId: uniqueWreckById(reward.wreckId) ? reward.wreckId : null,
      kind: String(reward.kind || 'story_data'),
      flagKey: typeof reward.flagKey === 'string' ? reward.flagKey : null,
      grantedAtS: Math.max(0, finite(reward.grantedAtS, 0)),
      ...(typeof reward.unlockFlag === 'string' ? { unlockFlag: reward.unlockFlag } : {}),
      ...(Array.isArray(reward.choices)
        ? { choices: reward.choices.filter((c) => typeof c === 'string') } : {}),
      // Additive: who bought the story item, where, and for what. Present only once sold.
      ...(normalizeStoryDisposition(rewardId, reward.disposition)
        ? { disposition: normalizeStoryDisposition(rewardId, reward.disposition) } : {}),
    };
  }
  const complications = input.complications && typeof input.complications === 'object' ? input.complications : {};
  for (const [key, rec] of Object.entries(complications)) {
    const recDef = rec && uniqueWreckById(rec.wreckId);
    if (!rec || typeof rec !== 'object' || !recDef) continue;
    out.complications[key] = {
      id: String(rec.id || key),
      wreckId: rec.wreckId,
      timerId: rec.timerId == null ? null : String(rec.timerId),
      kind: String(rec.kind || 'complication'),
      trigger: rec.trigger == null ? null : String(rec.trigger),
      status: String(rec.status || 'scheduled'),
      scheduledAt: Math.max(0, finite(rec.scheduledAt, 0)),
      dueAt: rec.dueAt == null ? null : Math.max(0, finite(rec.dueAt, 0)),
      triggeredAt: rec.triggeredAt == null ? null : Math.max(0, finite(rec.triggeredAt, 0)),
      encounterId: rec.encounterId == null ? null : String(rec.encounterId),
      sectorId: typeof rec.sectorId === 'string' ? rec.sectorId : recDef.sectorId,
      anchor: rec.anchor && typeof rec.anchor === 'object' ? copyPoint(rec.anchor) : null,
    };
  }
  const pingCounts = input.pingCounts && typeof input.pingCounts === 'object' ? input.pingCounts : {};
  for (const def of ALL_WRECK_DEFS) {
    if (Number.isFinite(Number(pingCounts[def.id]))) out.pingCounts[def.id] = Math.max(0, Math.floor(Number(pingCounts[def.id])));
  }
  const pingRisks = input.pingRisks && typeof input.pingRisks === 'object' ? input.pingRisks : {};
  for (const def of ALL_WRECK_DEFS) {
    const risk = pingRisks[def.id];
    if (!risk || typeof risk !== 'object') continue;
    out.pingRisks[def.id] = {
      count: Math.max(0, Math.floor(finite(risk.count, 0))),
      cooldownUntil: Math.max(0, finite(risk.cooldownUntil, 0)),
      triggerCount: Math.max(0, Math.floor(finite(risk.triggerCount, 0))),
      lastTriggeredAt: risk.lastTriggeredAt == null
        ? null
        : Math.max(0, finite(risk.lastTriggeredAt, 0)),
    };
  }
  const offers = input.offers && typeof input.offers === 'object' ? input.offers : {};
  for (const [key, value] of Object.entries(offers)) if (value) out.offers[key] = true;
  const published = input.published && typeof input.published === 'object' ? input.published : {};
  for (const def of ALL_WRECK_DEFS) if (published[def.id]) out.published[def.id] = true;
  // SF-141: keep only authored-wreck warm ledgers; an unknown key or malformed record drops
  // rather than letting a stale save pin a spawn that never happened.
  const warm = input.warm && typeof input.warm === 'object' ? input.warm : {};
  for (const def of ALL_WRECK_DEFS) {
    const rec = warm[def.id];
    if (!rec || typeof rec !== 'object' || !def.warm) continue;
    out.warm[def.id] = {
      podsSpawnedAtS: rec.podsSpawnedAtS == null ? null : Math.max(0, finite(rec.podsSpawnedAtS, 0)),
    };
  }
  const receipts = Array.isArray(input.receipts) ? input.receipts : [];
  out.receipts = receipts.slice(-UNIQUE_WRECK_RECEIPT_LIMIT).map((receipt) => ({
    type: String(receipt && receipt.type || 'receipt'),
    wreckId: uniqueWreckById(receipt && receipt.wreckId) ? receipt.wreckId : null,
    t: Math.max(0, finite(receipt && receipt.t, 0)),
  }));
  const playerWreck = normalizePlayerWreckRecord(input.playerWreck);
  if (playerWreck) out.playerWreck = playerWreck;
  return out;
}

function normalizePlayerWreckRecord(input) {
  if (!input || typeof input !== 'object') return null;
  const markerId = typeof input.markerId === 'string' ? input.markerId : null;
  const sectorId = typeof input.sectorId === 'string' ? input.sectorId : null;
  if (!markerId || !sectorId) return null;
  const pos = copyPoint(input.pos);
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  const encounterId = typeof input.encounterId === 'string' && input.encounterId
    ? input.encounterId
    : PLAYER_WRECK_ENCOUNTER_ID;
  return {
    wreckId: 'player_wreck',
    playerWreck: true,
    markerId,
    sectorId,
    pos,
    victimLabel: typeof input.victimLabel === 'string' ? input.victimLabel : 'Your Hull',
    encounterId,
    citedAt: Math.max(0, finite(input.citedAt, 0)),
  };
}

export function playerWreckCitation(state) {
  const own = state && state.player && state.player.uniqueWrecks;
  return own && own.playerWreck ? clonePlain(own.playerWreck) : null;
}

function normalizeStoryDisposition(rewardId, value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.choiceId !== 'string' || !storyBuyerRow(rewardId, value.choiceId)) return null;
  return {
    choiceId: value.choiceId,
    stationId: typeof value.stationId === 'string' ? value.stationId : null,
    resolvedAtS: Math.max(0, finite(value.resolvedAtS, 0)),
    credits: Math.max(0, Math.floor(finite(value.credits, 0))),
    repDeltas: Array.isArray(value.repDeltas)
      ? value.repDeltas
        .filter((rep) => rep && typeof rep.factionId === 'string' && Number.isFinite(Number(rep.delta)))
        .map((rep) => ({ factionId: rep.factionId, delta: Number(rep.delta) }))
      : [],
  };
}

function ensurePlayer(state) {
  if (!state.player || typeof state.player !== 'object') state.player = {};
  if (!state.player.flags || typeof state.player.flags !== 'object') state.player.flags = {};
  if (!Array.isArray(state.player.flags.uniqueWrecksVisited)) state.player.flags.uniqueWrecksVisited = [];
  return state.player;
}

function sourceLine(sourceRef) {
  const source = FLAVOR_SOURCE_BY_REF[sourceRef];
  const line = source && Array.isArray(source.lines) ? source.lines[0] : null;
  return line && typeof line.text === 'string' ? line.text : '';
}

function sourceText(sourceRef) {
  const source = FLAVOR_SOURCE_BY_REF[sourceRef];
  if (!source || !Array.isArray(source.lines)) return '';
  return source.lines
    .map((line) => line && typeof line.text === 'string' ? line.text.trim() : '')
    .filter(Boolean)
    .join(' ');
}

function distance(a, b) {
  return Math.hypot(finite(a && a.x) - finite(b && b.x), finite(a && a.z) - finite(b && b.z));
}

function hasModule(state, defId) {
  if (!defId) return true;
  const player = state && state.player || {};
  if ((player.moduleInventory || []).some((item) => item && item.defId === defId)) return true;
  const owned = player.ownedShips && player.ownedShips[player.activeShipIndex || 0];
  return !!(owned && Array.isArray(owned.fittings) && owned.fittings.includes(defId));
}

function tutorialOwnsOpeningPresentation(state) {
  const onboarding = state && state.onboarding;
  return !!(onboarding && onboarding.active && !onboarding.finished);
}

// ── Salvaged-site husk identity ────────────────────────────────────────────────────────────────
// A recovered unique wreck stays a place with a past: the map ring keeps pointing at a real husk
// stamped with the outcome the player chose there, and nothing pays out twice.

/** The outcome phrase stamped onto the husk's scan identity, derived from the recorded choice. */
function siteStampForRecord(def, record) {
  if (record.phase === 'decision') return 'RECOVERY CLAIM PENDING';
  const choice = record.choiceId && def.decision
    ? (def.decision.choices || []).find((entry) => entry.id === record.choiceId)
    : null;
  if (choice && choice.siteStamp) return choice.siteStamp;
  return record.outcome === 'claimed' ? 'CLAIMED UNDER YOUR NAME' : 'FILED WITH THE AUTHORITY';
}

/** Decision husks and handover husks are stripped/impounded: empty. Claim keeps salvage rights
 * to the remains — the husk pool is the claim path's own residual yield, never a second decision
 * payout (unique drops and bonus cargo flow only through _onChoose). */
function huskPoolForRecord(def, record) {
  return record.phase === 'salvaged' && record.outcome === 'claimed' ? def.salvagePool : {};
}

function huskPlacard(def, record, stamp) {
  if (record.phase === 'decision') {
    return `Recovered. The recovery claim is still open — choose who receives ${def.name}'s surviving systems.`;
  }
  const detail = record.rewardReceipt && typeof record.rewardReceipt.detail === 'string'
    ? record.rewardReceipt.detail
    : null;
  return detail ? `${stamp}. ${detail}` : `${def.name} recovered. ${stamp}.`;
}

export const uniqueWrecks = {
  name: 'uniqueWrecks',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._entityByWreck = new Map();
    this._wreckByEntity = new Map();
    this._bandRequestResolutions = new Map();
    this._gameStartDispatch = false;
    this._subscriptions = [];
    this._ensureState();
    this._choirRelief = createChoirReliefBerth(this);
    this._memorialThief = createMemorialThief(this);
    this._rescuedWorkers = createRescuedWorkerReturn(this);
    this._occupationSwitch = createScavengerOccupationSwitch(this);

    this._listen('game:newGame', (payload) => this._importRunWreck(payload?.wreck));
    this._listen('game:started', () => this._onGameStarted());
    this._listen('save:loaded', () => this._onSaveLoaded());
    this._listen('save:restoring', () => this._clearRuntime());
    this._listen('sector:enter', (payload) => this._onSectorEnter(payload));
    // Census arm: unique-wreck registration lands inside the sector cook deterministically.
    // The cook drives the chunked twin across its slice clock; the emit listener drains the
    // same steps synchronously, so both paths mint the identical field.
    this._cookProvider = (sector) => this._onSectorEnterSteps({
      sectorId: (sector && sector.id)
        || (this.state && this.state.world && this.state.world.currentSectorId),
    });
    (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
      .push(this._cookProvider);
    this._listen('dock:docked', (payload) => this._onDocked(payload));
    for (const [channelId, event] of Object.entries(RUMOR_EVENT_BY_CHANNEL)) {
      this._listen(event, (payload) => this._onNativeRumor(channelId, payload));
    }
    this._listen('lossInvestigation:promoted', (payload) => this._onLossPromoted(payload));
    this._listen('scan:pulse', (payload) => this._onScanPulse(payload));
    this._listen('economy:tick', () => {
      this._pumpComplications();
      this._choirRelief.sync();
      this._memorialThief.sync();
      this._rescuedWorkers.sync();
      this._occupationSwitch.sync();
    });
    this._listen('npcjobs:work', (payload) => this._choirRelief.work(payload));
    this._listen('npcjobs:complete', (payload) => {
      this._choirRelief.complete(payload);
      this._occupationSwitch.jobComplete(payload || {});
    });
    this._listen('combat:subsystemEnabled', (payload) => this._choirRelief.enabled(payload));
    this._listen('combat:subsystemDisabled', (payload) => this._choirRelief.disabled(payload));
    this._listen('entity:killed', (payload) => {
      this._choirRelief.killed(payload);
      this._memorialThief.killed(payload);
      this._rescuedWorkers.killed(payload);
      this._occupationSwitch.killed(payload || {});
    });
    // SF-156: the survivor-pod resolution seam decides the person's fate; the return is the
    // later workplace beat. SF-162: the field owner's own departed event is the released
    // obligation both packets require before any switch may fire.
    this._listen('survivorPod:ejected', (payload) => this._rescuedWorkers.podEjected(payload || {}));
    this._listen('survivorPod:resolved', (payload) => this._rescuedWorkers.podResolved(payload || {}));
    // NXB-042: the rescue is acknowledged in the person's own voice exactly once — the owner
    // latches the receipt when the hail offer the player actually receives targets that person.
    this._listen('contactHail:offer', (payload) => this._rescuedWorkers.hailOffered(payload || {}));
    this._listen('wreckEcology:departed', (payload) => this._occupationSwitch.departed(payload || {}));
    this._listen('salvage:completed', (payload) => this._onSalvageCompleted(payload));
    this._listen('uniqueWreck:choose', (payload) => this._onChoose(payload));
    // A claimed story item's buyers wait at the bar of a matching berth (data/storyRewardBuyers.js).
    this._listen('ui:talkContact', (payload) => this._onStoryBuyerTalk(payload));
    this._listen('dock:docked', (payload) => this._onStoryBuyerDock(payload));
    this._listen('uniqueWreck:decisionRequest', (payload) => this._republishPendingDecisions(payload));
    this._listen('band:bearingRequest', (payload) => this._onBandBearingRequest(payload));
    this._listen('encounter:resolved', (payload) => this._onEncounterResolved(payload));
    this._listen('entity:destroyed', (payload) => this._onEntityDestroyed(payload));
    this._listen('aftermathWreck:recorded', (payload) => this._onPlayerWreckRecorded(payload));
  },

  _listen(event, handler) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this.bus.on(event, handler);
    this._subscriptions.push([event, handler]);
  },

  _ensureState() {
    const player = ensurePlayer(this.state);
    const current = player.uniqueWrecks;
    if (!current || typeof current !== 'object'
      || current.schemaVersion !== UNIQUE_WRECK_STATE_SCHEMA_VERSION
      || !current.bearings || typeof current.bearings !== 'object'
      || !current.grants || typeof current.grants !== 'object'
      || !current.storyRewards || typeof current.storyRewards !== 'object'
      || !current.complications || typeof current.complications !== 'object'
      || !current.pingCounts || typeof current.pingCounts !== 'object'
      || !current.pingRisks || typeof current.pingRisks !== 'object'
      || !current.offers || typeof current.offers !== 'object'
      || !current.published || typeof current.published !== 'object'
      || !Array.isArray(current.receipts)) {
      player.uniqueWrecks = normalizeUniqueWreckState(current, this.state.meta && this.state.meta.seed);
    }
    return player.uniqueWrecks;
  },

  newGame() {
    const player = ensurePlayer(this.state);
    player.uniqueWrecks = createUniqueWreckState(this.state.meta && this.state.meta.seed);
    player.flags.uniqueWrecksVisited = [];
    this._clearRuntime();
    return player.uniqueWrecks;
  },

  _clearRuntime() {
    this._choirRelief?.clear();
    this._memorialThief?.clear();
    this._rescuedWorkers?.clear();
    this._occupationSwitch?.clear();
    if (this._entityByWreck) this._entityByWreck.clear();
    if (this._wreckByEntity) this._wreckByEntity.clear();
    if (this._bandRequestResolutions) this._bandRequestResolutions.clear();
  },

  _receipt(type, wreckId) {
    const own = this._ensureState();
    own.receipts.push({ type, wreckId, t: Math.max(0, finite(deferredEnterNow(this.state), 0)) });
    if (own.receipts.length > UNIQUE_WRECK_RECEIPT_LIMIT) {
      own.receipts.splice(0, own.receipts.length - UNIQUE_WRECK_RECEIPT_LIMIT);
    }
  },

  _onGameStarted() {
    this._syncRunWrecks(this.state.world?.currentSectorId);
    // Crucible runs carry no adventure rumor/news surface — the arena is its own content.
    if (isSurvivalRunLive(this.state && this.state.run)) return;
    this._gameStartDispatch = true;
    try {
      const own = this._ensureState();
      const current = this.state.world && this.state.world.currentSectorId;
      this._offerLostCoils();
      this._surfaceSectorRumors(current);
      if (current !== 'sector_helios_prime'
        || own.bearings.wreck_choir_tender
        || own.published.wreck_choir_tender) return;
      const def = uniqueWreckById('wreck_choir_tender');
      // R1's established ticker contract is deliberately the first headline line; the longer R2
      // intercept/campaign producers use sourceText so their full authored copy reaches the player.
      const text = sourceLine(def.bearingSourceRef);
      if (!text) return;
      this.bus.emit('news:publish', {
        text,
        kind: 'wreck_rumor',
        sourceRef: def.bearingSourceRef,
        wreckId: def.id,
        sectorId: def.sectorId,
        channelId: 'news',
        followup: false,
        receiptId: 'depth-r1:d10:first-read',
      });
      // marketNews normally relays news:publish to news:headline. The direct record is the
      // headless/runtime fallback and still passes through the exact source/channel guard.
      if (!own.bearings[def.id]) this._recordRumor({
        wreckId: def.id,
        sourceRef: def.bearingSourceRef,
        channelId: 'news',
      });
    } finally {
      this._gameStartDispatch = false;
    }
  },

  _onSaveLoaded() {
    const player = ensurePlayer(this.state);
    player.uniqueWrecks = normalizeUniqueWreckState(player.uniqueWrecks, this.state.meta?.seed);
    this._clearRuntime();
    // encounterDirector deliberately does not serialize live entity references. An authored boss
    // that was active at save time is therefore pending again until the post-load sector entry.
    for (const complication of Object.values(this._ensureState().complications)) {
      if (complication && complication.encounterId && complication.status === 'active') {
        complication.status = 'requested';
      }
    }
    this._syncSector(this.state.world && this.state.world.currentSectorId);
    // A save parked in a surface sector still deserves its first-read carrier even though no
    // fresh sector:enter fires until the player next jumps. Idempotent: recorded rumors no-op.
    this._surfaceSectorRumors(this.state.world && this.state.world.currentSectorId);
    for (const record of Object.values(this._ensureState().bearings)) {
      if (record && record.phase === 'decision') this._publishDecision(record.wreckId, 'continue');
    }
    if (this._ensureState().playerWreck) this._citePlayerWreckEncounter(this._ensureState().playerWreck);
  },

  _onPlayerWreckRecorded(payload) {
    if (!isPlayerWreckMarker(payload)) return null;
    const own = this._ensureState();
    const record = normalizePlayerWreckRecord({
      markerId: payload.markerId,
      sectorId: payload.sectorId,
      pos: payload.pos,
      victimLabel: payload.victimLabel,
      encounterId: payload.encounterId || PLAYER_WRECK_ENCOUNTER_ID,
      citedAt: Math.max(0, finite(this.state.simTime, 0)),
    });
    if (!record) return null;
    own.playerWreck = record;
    return this._citePlayerWreckEncounter(record);
  },

  _citePlayerWreckEncounter(record) {
    const citation = normalizePlayerWreckRecord(record);
    if (!citation || !this.bus || typeof this.bus.emit !== 'function') return null;
    const payload = {
      wreckId: 'player_wreck',
      playerWreck: true,
      markerId: citation.markerId,
      sectorId: citation.sectorId,
      encounterId: citation.encounterId,
      pos: copyPoint(citation.pos),
      kind: 'player_wreck',
      trigger: 'player_wreck_cited',
      requestedAt: Math.max(0, finite(this.state.simTime, 0)),
    };
    this.bus.emit('uniqueWreck:encounterRequested', payload);
    return payload;
  },

  _onNewsHeadline(payload) {
    return this._onNativeRumor('news', payload);
  },

  _onRumorEvent(payload) {
    return this._onNativeRumor('bar', payload);
  },

  _onNativeRumor(channelId, payload) {
    if (!payload) return null;
    if (!payload.sourceRef && channelId === 'campaign') {
      const beatIndex = Number.isFinite(Number(payload.toIndex))
        ? Number(payload.toIndex)
        : Number(payload.beatIndex);
      if (beatIndex === 7) return this._surfaceCanonicalRumor(
        'wreck_isc_lighthouse',
        'campaign',
        'comms:popup',
        { sender: 'ASHFALL CAMPAIGN RELAY', beatIndex },
      );
      // Stable branch reveal: campaign beat 6 is where the Cassandra proof becomes actionable.
      if (beatIndex === 6) return this._surfaceCanonicalRumor(
        'wreck_choir_cassandra',
        'campaign',
        'comms:popup',
        { sender: 'CASSANDRA DIPLOMATIC THREAD', beatIndex },
      );
      return null;
    }
    if (!payload.sourceRef && channelId === 'bark') {
      const sectorId = payload.sectorId || (this.state.world && this.state.world.currentSectorId);
      const factionId = payload.factionId || payload.speakerFactionId
        || (payload.actor && payload.actor.factionId);
      const situation = String(payload.situation || payload.reason || payload.kind || '').toLowerCase();
      if (sectorId === 'sector_triton_wake'
        && factionId === 'faction_vael'
        && situation.includes('patrol')) {
        return this._surfaceCanonicalRumor(
          'wreck_choir_bell_aegis',
          'bark',
          'barkDirector:voice',
          { factionId, sectorId, situation: payload.situation || 'patrol_contact' },
        );
      }
      return null;
    }
    if (!payload.sourceRef) return null;
    return this._recordRumor({
      ...payload,
      // The subscription channel is the transport; the payload's own channelId is what the
      // carrier DECLARED. A mission:accepted transport delivers any channel the accepting
      // contract carried — the declared channel decides which source row it may mint through.
      declaredChannelId: typeof payload.channelId === 'string' ? payload.channelId : null,
      channelId,
    });
  },

  _onLossPromoted(payload) {
    if (!payload || (payload.lossId !== 'loss_vigilant'
      && payload.authoredWreckId !== 'wreck_isc_vigilant'
      && payload.wreckId !== 'wreck_isc_vigilant')) return null;
    return this._surfaceCanonicalRumor(
      'wreck_isc_vigilant',
      'loss_investigation',
      'lossInvestigation:authoredRead',
      {
        ...payload,
        lossId: payload.lossId || 'loss_vigilant',
      },
    );
  },

  _recordRumor(payload) {
    if (isSurvivalRunLive(this.state && this.state.run)) return null;
    const sourceRef = payload && payload.sourceRef;
    const def = uniqueWreckById(payload && payload.wreckId) || uniqueWreckForSource(sourceRef);
    if (!def || sourceRef !== def.bearingSourceRef) return null;
    const own = this._ensureState();
    if (own.bearings[def.id]) return own.bearings[def.id];
    // Match the carrier channel AND the ref: a wreck may declare the same public report
    // through several channels (SF-149 — the vigil chain's mission:accepted reprints the
    // Helios loss news). A mission:accepted transport additionally requires the ACCEPTED
    // CONTRACT to have declared the mission channel: a long_read accept carrying the wreck's
    // public 'news' channel must not mint through the mission row — its native carrier is the
    // rumor-purchase reprint that follows on the news wire.
    const declared = payload.declaredChannelId;
    const source = def.rumorSources.find((entry) => entry.sourceRef === sourceRef
      && entry.channelId === payload.channelId
      && (payload.channelId !== 'mission' || declared == null || declared === 'mission'));
    if (!source) return null;
    const placement = placementForUniqueWreck(own.programSeed, def.id, def.sectorId);
    const record = {
      wreckId: def.id,
      name: def.name,
      sectorId: def.sectorId,
      phase: 'rumored',
      sourceRef,
      channelId: payload.recordedChannelId || payload.channelId || source.channelId,
      heardAtS: Math.max(0, finite(deferredEnterNow(this.state), 0)),
      coordSpace: 'global_v1',
      bearingCenter: { ...placement.bearingCenterGlobal },
      radius: placement.radius,
      exactPos: { ...placement.exactGlobal },
      fixedPos: null,
      fixedAtS: null,
      reactorDueAt: null,
      decisionReadyAtS: null,
      choiceId: null,
      outcome: null,
      resolvedAtS: null,
      rewardReceipt: null,
      salvagedAtS: null,
    };
    own.bearings[def.id] = record;
    own.published[def.id] = true;
    this._scheduleSeededTimers(def, 'bearing_recorded');
    this._receipt('rumor', def.id);
    this.bus.emit('uniqueWreck:rumorRecorded', {
      wreckId: def.id,
      sectorId: def.sectorId,
      sourceRef,
      channelId: record.channelId,
      phase: record.phase,
    });
    if (!payload.silent) {
      if (this._gameStartDispatch) {
        // uniqueWrecks is registered before onboarding. Wait until the synchronous New Game
        // dispatch completes so the tutorial can claim its opening presentation window.
        const bus = this.bus;
        const state = this.state;
        queueMicrotask(() => {
          if (this.bus !== bus || this.state !== state) return;
          this._surfaceRumorToast(def);
        });
      } else {
        this._surfaceRumorToast(def);
      }
    }
    if (def.sectorId === (this.state.world && this.state.world.currentSectorId)) this._materialize(def.id);
    return record;
  },

  _surfaceRumorToast(def) {
    if (!def || !this.bus || tutorialOwnsOpeningPresentation(this.state)) return null;
    if (isSurvivalRunLive(this.state && this.state.run)) return null;
    const toast = {
      text: `${def.name}: rumor charted. Search the amber bearing ring, then pulse scan.`,
      kind: 'objective',
      ttl: 6,
    };
    this.bus.emit('toast', toast);
    return toast;
  },

  _onBandBearingRequest(payload) {
    const requestId = payload && typeof payload.requestId === 'string' ? payload.requestId.trim() : '';
    if (!requestId || !this.bus) return null;
    const radio = this.state && this.state.bandRadio;
    const pending = radio && radio.pendingBearingRequest;
    const authorized = !!pending
      && !radio.numbersReceipt
      && payload.channelId === 'numbers_station'
      && payload.contractVersion === 1
      && requestId === pending.requestId
      && payload.channelId === pending.channelId
      && payload.contractVersion === pending.contractVersion
      && payload.sequence === pending.sequence
      && payload.requestedAtS === pending.requestedAtS;
    // A request id correlates transport; it is not authority. Only the Band system's current,
    // seeded request may mint the one canonical numbers-station bearing for this save.
    if (!authorized) return null;
    const prior = this._bandRequestResolutions && this._bandRequestResolutions.get(requestId);
    if (prior) {
      this.bus.emit('band:bearingResolved', clonePlain(prior));
      return prior;
    }

    const own = this._ensureState();
    const candidates = UNIQUE_WRECKS.filter((def) => !own.bearings[def.id] && !own.published[def.id]);
    if (!candidates.length) {
      this.bus.emit('band:bearingUnavailable', { requestId, reason: 'no-unread-canonical-wrecks' });
      return null;
    }
    const pick = hash32(own.programSeed, 'band:numbers-bearing', requestId) % candidates.length;
    const def = candidates[pick];
    const source = def.rumorSources.find((entry) => entry.sourceRef === def.bearingSourceRef)
      || def.rumorSources[0];
    if (!source) {
      this.bus.emit('band:bearingUnavailable', { requestId, reason: 'canonical-source-missing' });
      return null;
    }
    // Keep the definition's exact source/channel validation as the authorization boundary, then
    // record the Band as the delivery carrier. The numbers station reveals a real fuzzy map ring;
    // it never invents a wreck, exact coordinate, source ref, or alternate salvage path.
    const record = this._recordRumor({
      wreckId: def.id,
      sourceRef: source.sourceRef,
      channelId: source.channelId,
      recordedChannelId: 'band',
      silent: true,
    });
    if (!record) {
      this.bus.emit('band:bearingUnavailable', { requestId, reason: 'canonical-record-rejected' });
      return null;
    }
    const a = hash32(own.programSeed, def.id, 'band-bearing-a') % 1000;
    const b = hash32(own.programSeed, def.id, 'band-bearing-b') % 1000;
    const resolution = {
      requestId,
      canonical: true,
      wreckId: def.id,
      sourceRef: record.sourceRef,
      sectorId: record.sectorId,
      bearingLabel: `${String(a).padStart(3, '0')}-${String(b).padStart(3, '0')}`,
    };
    this._bandRequestResolutions.set(requestId, resolution);
    this.bus.emit('band:bearingResolved', clonePlain(resolution));
    return resolution;
  },

  // Seeded timers only arm on bearing_recorded today — a timer authored with any other trigger
  // is inert until a call site passes that trigger through here.
  _scheduleSeededTimers(def, trigger) {
    const own = this._ensureState();
    const now = Math.max(0, finite(deferredEnterNow(this.state), 0));
    for (const timer of Array.isArray(def && def.seededTimers) ? def.seededTimers : []) {
      if (timer.trigger && timer.trigger !== trigger) continue;
      const key = `${def.id}:timer:${timer.id}`;
      if (own.complications[key]) continue;
      const authored = (def.complications || []).find((entry) => entry && entry.id === timer.id) || {};
      const delay = deterministicTimer(own.programSeed, def.id, timer.id, timer);
      const record = {
        id: key,
        wreckId: def.id,
        timerId: timer.id,
        kind: authored.kind || timer.kind || timer.id,
        trigger: timer.trigger || trigger,
        status: 'scheduled',
        scheduledAt: now,
        dueAt: now + delay,
        triggeredAt: null,
        encounterId: authored.encounterRef || authored.encounterId || null,
        sectorId: def.sectorId,
        anchor: null,
      };
      own.complications[key] = record;
      this.bus.emit('uniqueWreck:complicationScheduled', {
        wreckId: def.id,
        wreckName: def.name,
        sectorId: record.sectorId,
        timerId: record.timerId,
        kind: record.kind,
        dueAt: record.dueAt,
        encounterId: record.encounterId,
      });
    }
  },

  _pumpComplications() {
    const own = this._ensureState();
    const now = Math.max(0, finite(deferredEnterNow(this.state), 0));
    for (const record of Object.values(own.complications)) {
      if (!record || record.status !== 'scheduled' || record.dueAt == null || record.dueAt > now) continue;
      record.status = 'triggered';
      record.triggeredAt = now;
      const def = uniqueWreckById(record.wreckId);
      this._receipt('complication', record.wreckId);
      this.bus.emit('uniqueWreck:complicationTriggered', {
        wreckId: record.wreckId,
        wreckName: def && def.name,
        sectorId: record.sectorId,
        timerId: record.timerId,
        kind: record.kind,
        dueAt: record.dueAt,
        triggeredAt: record.triggeredAt,
        encounterId: record.encounterId,
      });
      if (record.encounterId) {
        const bearing = def && own.bearings[def.id];
        if (def && bearing) this._requestEncounter(def, record.encounterId, bearing, record.kind, {
          emitComplicationTriggered: false,
        });
      }
    }
  },

  _onSectorEnter(payload) {
    // Live GPU + flight + hard enter: defer into the cook's FIFO — the census
    // drains this same body under its slice clock in listener order.
    if (deferSectorEnterMaterialization(this.state, payload, this._cookProvider)) return;
    // Sync lane (emit listener, tests): drain the chunked steps inline.
    for (const _ of this._onSectorEnterSteps(payload)) { /* inline */ }
  },

  *_onSectorEnterSteps(payload) {
    const sectorId = payload && typeof payload === 'object' ? payload.sectorId : payload;
    // A tail-drained emit carries the epoch of the enter that minted it: a replayed
    // payload whose enterEpoch no longer matches the world's serial is stale — do not
    // materialize its wreck field under the live world's id. Synthetic payloads carry
    // no epoch and always run.
    if (payload && typeof payload === 'object' && payload.enterEpoch != null
        && this.state && this.state.world && this.state.world.enterSerial != null
        && payload.enterEpoch !== this.state.world.enterSerial) return;
    this._syncRunWrecks(sectorId);
    if (isSurvivalRunLive(this.state && this.state.run)) return;
    yield* this._syncSectorSteps(sectorId);
    this._pumpComplications();
    this._surfaceSectorRumors(sectorId);
    this._activatePendingEncounters(sectorId);
  },

  _onDocked(payload) {
    const stationId = payload && payload.stationId;
    if (stationId === 'station_helios') this._offerLostCoils();
  },

  _surfaceCanonicalRumor(wreckId, channelId, eventName, extra = {}) {
    const def = uniqueWreckById(wreckId);
    const own = this._ensureState();
    if (!def || own.bearings[def.id] || own.published[def.id]) return own.bearings[def && def.id] || null;
    const text = sourceText(def.bearingSourceRef)
      || (EXPANSION_ACTIVITY_WRECKS.some((row) => row.id === def.id) ? def.scanLabel : '');
    if (!text) return null;
    const payload = {
      ...extra,
      text,
      kind: 'wreck_rumor',
      wreckId: def.id,
      authoredWreckId: def.id,
      sectorId: def.sectorId,
      sourceRef: def.bearingSourceRef,
      channelId,
      followup: false,
      receiptId: `depth-r2:${def.programSlot.toLowerCase()}:first-read`,
    };
    if (eventName === 'barkDirector:voice') {
      const voice = this.helpers && this.helpers.voice;
      if (voice && typeof voice.say === 'function') {
        voice.say({
          channel: 'bark',
          text,
          kind: 'uniqueWreckRumor',
          ttl: 4,
          id: payload.receiptId,
          factionId: payload.factionId || def.factionId,
        });
        // Arbiter-bound, same as every barkDirector:voice receipt: the voice waits for the
        // real floor surface keyed by this id (and a refused line stays silent) instead of
        // scheduling immediately and bypassing serialization.
        payload.voiceId = payload.receiptId;
      }
    }
    this.bus.emit(eventName, payload);
    // Some public surfaces (news:publish and campaign dialogue via comms) relay through UI
    // systems that are absent in deterministic/headless runs. Record only after the authentic
    // carrier was emitted, and still enforce the exact source/channel pair in _recordRumor.
    if (!own.bearings[def.id]) this._recordRumor(payload);
    return own.bearings[def.id] || null;
  },

  _surfaceSectorRumors(sectorId) {
    const surface = sectorId && SECTOR_RUMOR_SURFACES[sectorId];
    if (!surface) return null;
    return this._surfaceCanonicalRumor(
      surface.wreckId,
      surface.channelId,
      surface.eventName,
      { ...surface.extra },
    );
  },

  _offerLostCoils() {
    const own = this._ensureState();
    const offerId = 'unique-wreck:the-lost-coils:v1';
    if (own.offers[offerId] || own.bearings.wreck_lanebreaker_pale_coil) return false;
    own.offers[offerId] = true;
    this.bus.emit('mission:offered', {
      id: offerId,
      type: 'recon_scan',
      title: 'The Lost Coils',
      summary: 'Trace the Pale-Coil research bearing into Phoebe Echo.',
      stationId: 'station_helios',
      factionId: 'faction_scn',
      destSectorId: 'sector_phoebe_echo',
      destStationId: null,
      params: { scanTargets: 1 },
      reward_cr: 0,
      collateral_cr: 0,
      riskTier: 1,
      minRep: -1000,
      distance: 1600,
      source: 'uniqueWreck',
      storyTag: 'mission.the_lost_coils',
      wreckId: 'wreck_lanebreaker_pale_coil',
      sourceRef: 'mission.the_lost_coils',
      channelId: 'mission',
    });
    return true;
  },

  _requestEncounter(def, encounterId, bearing, kind = 'authored_encounter', options = {}) {
    if (!def || !encounterId || !bearing) return null;
    const own = this._ensureState();
    const key = `${def.id}:encounter:${encounterId}`;
    const existing = own.complications[key];
    if (existing && !(options.allowCompletedRepeat === true && existing.status === 'completed')) {
      return existing;
    }
    const now = Math.max(0, finite(deferredEnterNow(this.state), 0));
    const sectorId = typeof options.sectorId === 'string'
      ? options.sectorId
      : typeof bearing.sectorId === 'string' ? bearing.sectorId : def.sectorId;
    const anchor = copyPoint(options.anchor || options.pos || bearing.exactPos);
    const record = {
      id: key,
      wreckId: def.id,
      timerId: null,
      kind: String(kind || 'authored_encounter'),
      trigger: 'direct_authored_request',
      status: 'requested',
      scheduledAt: now,
      dueAt: null,
      triggeredAt: now,
      encounterId: String(encounterId),
      sectorId,
      anchor,
    };
    // Persist before synchronous dispatch so re-entrant listeners cannot request the boss twice.
    own.complications[key] = record;
    this._receipt('encounter_requested', def.id);
    const payload = {
      wreckId: def.id,
      wreckName: def.name,
      sectorId,
      encounterId: record.encounterId,
      kind: record.kind,
      trigger: record.trigger,
      pos: { ...anchor },
      requestedAt: now,
    };
    if (options.emitComplicationTriggered !== false) {
      this.bus.emit('uniqueWreck:complicationTriggered', payload);
    }
    this.bus.emit('uniqueWreck:encounterRequested', payload);
    this._activateEncounter(def, bearing, record);
    return record;
  },

  _encounterInstanceId(def, encounterId) {
    return `unique-wreck:${def.id}:${encounterId}`;
  },

  _activateEncounter(def, bearing, complication) {
    if (!def || !bearing || !complication || complication.status === 'completed') return false;
    const sectorId = complication.sectorId || bearing.sectorId || def.sectorId;
    const anchor = copyPoint(complication.anchor || bearing.exactPos);
    if ((this.state.world && this.state.world.currentSectorId) !== sectorId) return false;
    const director = this.registry && this.registry.get && this.registry.get('encounterDirector');
    const shape = ENCOUNTERS[complication.encounterId];
    const dir = this.state.encounterDirector;
    if (!director || typeof director._fire !== 'function' || !shape || !dir || !dir.live) return false;

    const encounterId = this._encounterInstanceId(def, complication.encounterId);
    if (dir.live[encounterId]) {
      complication.status = 'active';
      return true;
    }
    const own = this._ensureState();
    const item = planUniqueWreckEncounter({
      programSeed: own.programSeed,
      def,
      bearing,
      complication,
      sectorId,
      simTime: deferredEnterNow(this.state),
      shape,
    });
    if (!item || !Array.isArray(item.ships) || !item.ships.length) return false;
    item.encounterId = encounterId;
    item.squadId = encounterId;
    item.data = {
      ...(item.data || {}),
      uniqueWreckId: def.id,
      uniqueWreckEncounterId: complication.encounterId,
    };
    director._fire(dir, this.state, item, shape, Math.max(0, finite(deferredEnterNow(this.state), 0)));
    if (!dir.live[encounterId]) return false;
    complication.status = 'active';
    this.bus.emit('uniqueWreck:encounterActivated', {
      wreckId: def.id,
      sectorId,
      encounterId: complication.encounterId,
      instanceId: encounterId,
      pos: { ...anchor },
    });
    return true;
  },

  _activatePendingEncounters(sectorId) {
    const own = this._ensureState();
    for (const complication of Object.values(own.complications)) {
      if (!complication || complication.status !== 'requested' || !complication.encounterId) continue;
      const def = uniqueWreckById(complication.wreckId);
      const bearing = def && own.bearings[def.id];
      const requestSectorId = complication.sectorId || (bearing && bearing.sectorId) || (def && def.sectorId);
      if (def && bearing && requestSectorId === sectorId) this._activateEncounter(def, bearing, complication);
    }
  },

  _onEncounterResolved(payload) {
    if (!payload || !payload.encounterId) return;
    const own = this._ensureState();
    for (const complication of Object.values(own.complications)) {
      if (!complication || !complication.encounterId || complication.status === 'completed') continue;
      const def = uniqueWreckById(complication.wreckId);
      if (!def || this._encounterInstanceId(def, complication.encounterId) !== payload.encounterId) continue;
      complication.status = 'completed';
      this._receipt('encounter_resolved', def.id);
      this.bus.emit('uniqueWreck:encounterCompleted', {
        wreckId: def.id,
        sectorId: complication.sectorId || def.sectorId,
        encounterId: complication.encounterId,
        instanceId: payload.encounterId,
        outcome: payload.outcome || null,
      });
      return;
    }
  },

  _triggerFixedComplications(def, bearing) {
    for (const complication of Array.isArray(def && def.complications) ? def.complications : []) {
      if (!complication || complication.trigger !== 'wreck_fixed') continue;
      const encounterId = complication.encounterRef || complication.encounterId
        || complicationEncounterId(def, complication.kind);
      if (encounterId) this._requestEncounter(def, encounterId, bearing, complication.kind);
    }
  },

  _countDeepsurveyPingRisk() {
    const def = uniqueWreckById('wreck_deepsurvey');
    const own = this._ensureState();
    const bearing = def && own.bearings[def.id];
    if (!def || !bearing || bearing.phase !== 'salvaged' || !own.grants[def.uniqueDropId]) return 0;

    const fitted = fittedModuleDefs(this.state).find((moduleDef) => moduleDef.id === def.uniqueDropId);
    const threshold = fitted && fitted.mods && fitted.mods.overusePingThreshold;
    if (!Number.isFinite(threshold) || threshold < 1) return 0;
    const required = Math.max(1, Math.floor(threshold));

    const player = this.state.entities && this.state.entities.get
      && this.state.entities.get(this.state.playerId);
    const sectorId = this.state.world && this.state.world.currentSectorId;
    if (!player || player.alive === false || !player.pos || !sectorId) return 0;

    const risk = own.pingRisks[def.id] || (own.pingRisks[def.id] = {
      count: 0,
      cooldownUntil: 0,
      triggerCount: 0,
      lastTriggeredAt: null,
    });
    const now = Math.max(0, finite(this.state.simTime, 0));
    if (now < risk.cooldownUntil) return risk.count;

    risk.count += 1;
    if (risk.count < required) return risk.count;

    const complication = (def.complications || []).find((entry) => entry
      && entry.trigger === 'equipped_scan_pulse_threshold');
    const encounterId = complication && (complication.encounterRef || complication.encounterId
      || complicationEncounterId(def, complication.kind));
    if (!complication || !encounterId) return risk.count;

    // The encounter's authored cooldown is sim-clocked and persisted with the count. Record it
    // before synchronous dispatch so another scan listener cannot request the same answer twice.
    const cooldownS = Math.max(0, finite(ENCOUNTERS[encounterId] && ENCOUNTERS[encounterId].cooldownS, 1200));
    risk.count = 0;
    risk.cooldownUntil = now + cooldownS;
    risk.triggerCount += 1;
    risk.lastTriggeredAt = now;
    this._requestEncounter(def, encounterId, bearing, complication.kind, {
      allowCompletedRepeat: true,
      sectorId,
      anchor: player.pos,
    });
    return risk.count;
  },

  _triggerStoryRewardComplications(def, bearing, grantedRewardIds) {
    if (!def || !bearing || !Array.isArray(grantedRewardIds) || !grantedRewardIds.length) return 0;
    let requested = 0;
    for (const complication of Array.isArray(def.complications) ? def.complications : []) {
      if (!complication || complication.trigger !== 'story_reward_granted') continue;
      if (complication.requiredRewardId && !grantedRewardIds.includes(complication.requiredRewardId)) continue;
      const encounterId = complication.encounterRef || complication.encounterId
        || complicationEncounterId(def, complication.kind);
      if (encounterId && this._requestEncounter(def, encounterId, bearing, complication.kind)) requested++;
    }
    return requested;
  },

  /** Claim-path complications (bounty admirers, shrine guards) after unique hardware is taken. */
  _triggerClaimComplications(def, bearing, choice) {
    if (!def || !bearing || !choice || choice.outcome !== 'claimed') return 0;
    let requested = 0;
    for (const complication of Array.isArray(def.complications) ? def.complications : []) {
      if (!complication) continue;
      const trigger = String(complication.trigger || '');
      if (trigger !== 'salvaged' && trigger !== 'unique_drop_claimed' && trigger !== 'claim_hardware') continue;
      // Handover leaves the shrine intact — admirers only rise when the hardware is stolen.
      if (complication.claimOnly === false) continue;
      const encounterId = complication.encounterRef || complication.encounterId
        || complicationEncounterId(def, complication.kind);
      if (encounterId && this._requestEncounter(def, encounterId, bearing, complication.kind || 'bounty_escalation')) {
        requested++;
      } else if (!encounterId && (complication.kind === 'bounty_escalation' || complication.kind === 'ace_return')) {
        // Durable heat/receipt when no encounter shape is authored yet.
        const own = this._ensureState();
        const key = `${def.id}:claim:${complication.id || complication.kind}`;
        if (!own.complications[key]) {
          own.complications[key] = {
            id: key,
            wreckId: def.id,
            kind: complication.kind,
            trigger: trigger || 'unique_drop_claimed',
            status: 'active',
            factionId: complication.factionId || def.factionId,
            triggeredAt: Math.max(0, finite(this.state.simTime, 0)),
          };
          this._receipt('claim_complication', def.id);
          this.bus.emit('uniqueWreck:complicationTriggered', {
            wreckId: def.id,
            wreckName: def.name,
            sectorId: def.sectorId,
            kind: complication.kind,
            trigger: 'unique_drop_claimed',
            factionId: complication.factionId || def.factionId,
          });
          requested++;
        }
      }
    }
    return requested;
  },

  _importRunWreck(input) {
    const wreck = normalizeRunShareWreck(input);
    if (!wreck) return;
    const own = this._ensureState();
    const records = own.crossRunWrecks || (own.crossRunWrecks = []);
    const id = runShareWreckId(wreck);
    if (!records.some((record) => runShareWreckId(record) === id)) records.push(wreck);
  },

  _syncRunWrecks(sectorId) {
    if (sectorId !== this.state.world?.currentSectorId) return;
    for (const wreck of this._ensureState().crossRunWrecks || []) {
      if (wreck.sectorId !== sectorId) continue;
      const id = runShareWreckId(wreck);
      if (this._findLive(id)) continue;
      // A hull id that left the catalog still gets a physical, scannable husk rather than a throw.
      const ship = SHIPS.find((def) => def.id === wreck.hullId) || { name: 'hull', radius: 10, mass: 100 };
      const fittings = [];
      for (const entry of wreck.loadout) fittings[entry.slotIndex] = entry.defId;
      const entity = this.helpers.spawnEntity({
        type: 'wreck', pos: { ...wreck.pos }, vel: { x: 0, z: 0 },
        radius: ship.radius || 10, mass: ship.mass || 100, hull: 1, hullMax: 1,
        physicsBody: { shape: 'capsule', mass: ship.mass || 100 },
        data: {
          uniqueWreckId: id, crossRunWreck: true, persistenceOwner: 'uniqueWrecks',
          sectorId, name: 'Echo of a fallen pilot', scanLabel: 'Wreck from another run',
          scanDescription: `A fallen ${ship.name}. Its hull scars and fitted equipment survived the crossing.`
            + (wreck.killReplay ? ' Its black box survived too — pulse scan to pull the tape.' : ''),
          parentType: 'ship', wreckClass: 'battlefield',
          hulkOfDefId: wreck.hullId, hulkVisual: { defId: wreck.hullId, fittings },
          livingHull: clonePlain(wreck.livingHull), loadout: clonePlain(wreck.loadout), fittings,
          ...(wreck.killReplay ? { blackBox: clonePlain(wreck.killReplay), blackBoxRecovered: this._ensureState().crossRunBlackBoxes?.[id] === true } : {}),
          proportions: WRECK_COLLIDER_PROPORTIONS,
        },
      });
      if (entity) {
        this._entityByWreck.set(id, entity.id);
        this._wreckByEntity.set(entity.id, id);
        syncEntitySectorMembership(this.state && this.state.entityIndex, entity);
      }
    }
  },

  _syncSector(sectorId) {
    this._syncRunWrecks(sectorId);
    for (const _ of this._syncSectorSteps(sectorId)) { /* inline */ }
  },

  // Chunked cook-provider twin: one materialize per yield so the sliced census can
  // interleave presentation between wrecks; _materialize self-dedupes via _findLive.
  *_syncSectorSteps(sectorId) {
    if (!sectorId) return;
    const own = this._ensureState();
    for (const record of Object.values(own.bearings)) {
      // Every phase keeps its site physical: rumored/fixed spawn the live wreck, decision/salvaged
      // spawn the outcome-stamped husk, so a map bearing never points at empty space.
      if (record && record.sectorId === sectorId && VALID_PHASES.has(record.phase)) {
        this._materialize(record.wreckId);
        yield;
      }
    }
    this._choirRelief?.sync();
    this._memorialThief?.sync();
  },

  _findLive(wreckId) {
    const knownId = this._entityByWreck.get(wreckId);
    if (knownId != null && this.state.entities && this.state.entities.get) {
      const known = this.state.entities.get(knownId);
      if (known && known.alive !== false) return known;
    }
    for (const entity of indexedTypeScan(this.state, 'wrecks')) {
      if (entity && entity.alive !== false && entity.data && entity.data.uniqueWreckId === wreckId) return entity;
    }
    return null;
  },

  _materialize(wreckId) {
    const def = uniqueWreckById(wreckId);
    const own = this._ensureState();
    const record = own.bearings[wreckId];
    if (!def || !record || !VALID_PHASES.has(record.phase)) return null;
    if (def.sectorId !== (this.state.world && this.state.world.currentSectorId)) return null;
    let entity = this._findLive(wreckId);
    if (!entity) {
      if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
      const authored = promoteToAuthored({
        authoredWreckId: def.id,
        lossId: def.id === 'wreck_isc_vigilant' ? 'loss_vigilant' : `loss_${def.id.replace(/^wreck_/, '')}`,
        sectorId: def.sectorId,
        factionId: def.factionId,
        sourceRef: record.sourceRef,
      });
      entity = this.helpers.spawnEntity({
        type: 'wreck',
        // Live entities use galactic-global XZ; the authored placement was composed into that
        // space once by placementForUniqueWreck. Only zone-planner inputs remain sector-local.
        // Past the rumor phase the durable fixed point is the site authority.
        pos: { ...(record.phase === 'rumored' ? record.exactPos : (record.fixedPos || record.exactPos)) },
        vel: { x: 0, z: 0 },
        radius: def.id === 'wreck_choir_tender' ? 12 : 10,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        factionId: def.factionId,
        // SFQ-B025: a named unique wreck keeps its authored dead-mass through normalization.
        physicsBody: { shape: 'capsule', mass: 1e6 },
        data: {
          uniqueWreckId: def.id,
          authoredWreckId: def.id,
          proportions: WRECK_COLLIDER_PROPORTIONS,
          aftermathMarkerId: authored.markerId,
          sectorId: def.sectorId,
          parentType: authored.parentType,
          wreckClass: authored.wreckClass,
          wreckClassLabel: authored.wreckClassLabel,
          wreckClassBlurb: authored.wreckClassBlurb,
          provenance: { ...authored.provenance },
          name: def.name,
          scanLabel: authored.scanLabel,
          scanned: record.phase !== 'rumored',
        },
      });
    }
    this._bindEntity(def, record, entity);
    this._publishWreckFieldSource(def, record, entity);
    this._syncWarmSite(def, record, entity);
    return entity;
  },

  /**
   * SF-141 — one physical freight spill per warm wreck site. The authored `warm.cargoPods`
   * rows materialize as ordinary persistent jettisoned pods beside the hull: colliding bodies
   * that tether, scoop, cook off, and answer to the law. Ownership is stamped to the relief
   * crew's durable world-record id (not a recycling entity id), so taking the lot stays theft
   * even if the owner dies mid-transfer. The durable `warm` ledger never re-spills the site:
   * pods the world already took or destroyed stay gone.
   */
  _syncWarmSite(def, record, wreckEntity) {
    const authored = def && def.warm && Array.isArray(def.warm.cargoPods)
      ? def.warm.cargoPods : null;
    if (!def || !record || !authored || !authored.length) return null;
    if (!wreckEntity || !wreckEntity.pos) return null;
    if (isSurvivalRunLive(this.state && this.state.run)) return null;
    if (typeof spawnJettisonedCargoPod !== 'function'
      || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    const own = this._ensureState();
    const site = own.warm[def.id] || (own.warm[def.id] = { podsSpawnedAtS: null });
    if (site.podsSpawnedAtS != null) return site;
    const ownerRecordId = def.id === 'wreck_choir_tender'
      ? `choir-relief:${own.programSeed}:attendant` : null;
    let spawned = 0;
    for (const pod of authored) {
      const pos = {
        x: wreckEntity.pos.x + finite(pod && pod.offset && pod.offset.x, 0),
        z: wreckEntity.pos.z + finite(pod && pod.offset && pod.offset.z, 0),
      };
      const entity = spawnJettisonedCargoPod(this.state, {
        commodityId: pod.commodityId,
        amount: pod.amount,
        unitMass: pod.unitMass,
        radius: pod.radius,
        pos,
        ownerId: ownerRecordId,
        ownerName: 'CHOIR RELIEF — LAST LIGHT',
        factionId: def.factionId,
        originId: def.id,
        destinationId: 'station_helios',
        cargoIdentity: {
          originId: def.id,
          destinationId: 'station_helios',
          ownerId: ownerRecordId,
          ownerName: 'CHOIR RELIEF — LAST LIGHT',
        },
      }, this.helpers);
      if (!entity) continue;
      const data = entity.data || (entity.data = {});
      // `warmWreckId`, not `uniqueWreckId`: the pod is freight AT the site, not the hull — the
      // wreck identity stamp stays exclusive to the materialized hull/husk so lookups by
      // uniqueWreckId keep returning the site itself.
      data.warmWreckId = def.id;
      data.warmPodId = String(pod.id || `warm_pod_${spawned}`);
      data.scanLabel = `${def.name} relief pod — attended freight`;
      spawned++;
    }
    // The stamp is durable even when the spawn budget refused a pod: the spill is a site fact,
    // not a per-visit respawn. A pod that never appeared is the same dead pod in every save.
    site.podsSpawnedAtS = Math.max(0, finite(this.state.simTime, 0));
    return site;
  },

  _publishWreckFieldSource(def, record, entity) {
    if (!def || !record || !this.bus || typeof this.bus.emit !== 'function') return null;
    const pos = copyPoint(entity && entity.pos || record.exactPos || record.fixedPos);
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    const payload = {
      fieldId: `unique:${def.id}`,
      sectorId: def.sectorId,
      zoneId: (def.hazardContext && def.hazardContext.zoneId) || `unique:${def.id}`,
      kind: 'unique',
      wreckId: def.id,
      pos,
      bornAt: Math.max(0, finite(record.heardAtS, 0)),
    };
    this.bus.emit('wreckField:source', payload);
    return payload;
  },

  _bindEntity(def, record, entity) {
    if (!entity) return null;
    const authored = promoteToAuthored({
      authoredWreckId: def.id,
      lossId: def.id === 'wreck_isc_vigilant' ? 'loss_vigilant' : `loss_${def.id.replace(/^wreck_/, '')}`,
      sectorId: def.sectorId,
      factionId: def.factionId,
      sourceRef: record.sourceRef,
    });
    const data = entity.data || (entity.data = {});
    data.uniqueWreckId = def.id;
    data.authoredWreckId = def.id;
    data.aftermathMarkerId = authored.markerId;
    data.sectorId = def.sectorId;
    syncEntitySectorMembership(this.state && this.state.entityIndex, entity);
    data.parentType = authored.parentType;
    data.wreckClass = authored.wreckClass;
    data.wreckClassLabel = authored.wreckClassLabel;
    data.wreckClassBlurb = authored.wreckClassBlurb;
    data.provenance = { ...authored.provenance };
    data.name = def.name;
    const husked = record.phase === 'decision' || record.phase === 'salvaged';
    const stamp = husked ? siteStampForRecord(def, record) : null;
    data.scanLabel = stamp ? `${def.scanLabel} · ${stamp}` : authored.scanLabel;
    data.scanDescription = record.phase === 'rumored'
      ? 'Pulse scan inside the charted bearing ring to resolve this named wreck.'
      : husked
        ? huskPlacard(def, record, stamp)
        : `${def.name}. Recover the wreck, then choose who receives its surviving systems.`;
    data.interactionPrompt = record.phase === 'rumored'
      ? 'PULSE SCANNER TO IDENTIFY'
      : husked
        ? (record.phase === 'decision' ? 'RECOVERY CLAIM PENDING' : 'OUTCOME FILED — SEE SCAN')
        : 'SALVAGE TO OPEN RECOVERY CLAIM';
    data.objectiveLabel = record.phase === 'rumored'
      ? `Search for ${def.name}`
      : husked ? `${def.name} site` : `Recover ${def.name}`;
    data.scanned = record.phase !== 'rumored';
    // The recovered site keeps its husk: intervention.js reads _salvaged to close jumper
    // interventions as recovered, and the hull can never be re-salvaged into a second decision.
    if (husked) {
      data._salvaged = true;
      delete data.unstableReactor;
    }
    this._entityByWreck.set(def.id, entity.id);
    this._wreckByEntity.set(entity.id, def.id);
    if (def.id === 'wreck_choir_tender') this._choirRelief?.sync();

    const salvage = this.registry && this.registry.get && this.registry.get('salvageActions');
    // Only a freshly fixed (not yet recovered) wreck arms its reactor; a husk has none to arm.
    // A fuse that already ran out while the player was away (or across a save) must not be
    // restored onto a freshly reminted hull: the sweep would detonate it the instant the player
    // returns and the claim would never open. A hull with no running fuse past its due time comes
    // back disarmed and salvageable (and stays so on every re-bind); a hull whose fuse is already
    // ticking in this session keeps it.
    const fuseNow = finite(deferredEnterNow(this.state), finite(this.state && this.state.simTime, 0));
    const fuseElapsed = record.reactorDueAt != null && finite(record.reactorDueAt, 0) <= fuseNow;
    const fuseRunning = !!(data.unstableReactor && typeof data.unstableReactor === 'object'
      && !data.unstableReactor.burst);
    const arm = !!(def.reactor && record.phase === 'fixed') && !(fuseElapsed && !fuseRunning);
    const pool = husked ? huskPoolForRecord(def, record) : def.salvagePool;
    if (salvage && typeof salvage.configureAuthoredWreck === 'function') {
      salvage.configureAuthoredWreck(entity, {
        salvagePool: pool,
        scanLabel: data.scanLabel,
        reactorTimerS: arm ? def.reactor.timerS : null,
      });
    } else {
      data.authoredSalvagePool = { ...pool };
      data.salvagePool = salvagePoolForWreck(entity, data.authoredSalvagePool);
      data.authoredScanLabel = data.scanLabel;
      data.scanLabel = data.scanLabel;
      if (arm) {
        data.unstableReactor = {
          dueAt: finite(deferredEnterNow(this.state)) + def.reactor.timerS,
          damage: def.reactor.damage,
          vented: false,
          burst: false,
          towedClear: false,
        };
      }
    }
    if (arm && data.unstableReactor && record.reactorDueAt != null) {
      data.unstableReactor.dueAt = record.reactorDueAt;
      data.unstableReactor.damage = def.reactor.damage;
    }
    return entity;
  },

  _onScanPulse(payload) {
    const origin = payload && payload.pos;
    if (!origin) return;
    this._countDeepsurveyPingRisk();
    const sectorId = this.state.world && this.state.world.currentSectorId;
    const own = this._ensureState();
    for (const record of Object.values(own.bearings)) {
      if (!record || (record.phase !== 'rumored' && record.phase !== 'fixed') || record.sectorId !== sectorId) continue;
      const def = uniqueWreckById(record.wreckId);
      if (!def || !hasModule(this.state, def.scanRequirement)) continue;
      if (distance(origin, record.exactPos) > UNIQUE_WRECK_SCAN_RADIUS) continue;
      if (record.phase === 'fixed') continue;
      const gate = movingRadiationGate(this.state, record, def);
      if (!gate.allowed) {
        this._receipt('scan_blocked', def.id);
        this.bus.emit('uniqueWreck:scanBlocked', {
          wreckId: def.id,
          sectorId: def.sectorId,
          phase: record.phase,
          reason: gate.reason,
          radiationPhase: gate.phase,
          nextOpenAt: gate.nextOpenAt,
        });
        continue;
      }
      record.phase = 'fixed';
      record.fixedPos = { ...record.exactPos };
      record.fixedAtS = Math.max(0, finite(this.state.simTime, 0));
      if (def.reactor) record.reactorDueAt = record.fixedAtS + def.reactor.timerS;
      const entity = this._materialize(def.id);
      if (entity && entity.data) {
        entity.data.scanned = true;
        entity.data.pingedUntil = record.fixedAtS + 12;
        this._bindEntity(def, record, entity);
      }
      this._receipt('fixed', def.id);
      this.bus.emit('uniqueWreck:bearingFixed', {
        wreckId: def.id,
        sectorId: def.sectorId,
        phase: record.phase,
        pos: { ...record.fixedPos },
      });
      this.bus.emit('toast', {
        text: `${def.name} fixed. Set the amber wreck bearing and recover it.`,
        kind: 'objective',
        ttl: 6,
      });
      this._triggerFixedComplications(def, record);
    }
    // A cross-run wreck carries its own black box: a pulse inside the scan ring hands the
    // last five seconds of the death to the replay deck as an ordinary recording.
    for (const entity of indexedTypeScan(this.state, 'wrecks')) {
      const data = entity && entity.data;
      if (!entity || entity.alive === false || !data || data.crossRunWreck !== true
        || !data.blackBox || data.blackBoxRecovered || data.sectorId !== sectorId) continue;
      if (!entity.pos || distance(origin, entity.pos) > UNIQUE_WRECK_SCAN_RADIUS) continue;
      data.blackBoxRecovered = true;
      data.scanned = true;
      if (typeof data.uniqueWreckId === 'string') {
        const ledger = own.crossRunBlackBoxes || (own.crossRunBlackBoxes = {});
        ledger[data.uniqueWreckId] = true;
      }
      const recording = blackBoxRecording(data.blackBox, {
        wreckId: data.uniqueWreckId, hullId: data.hulkOfDefId,
      });
      if (recording) {
        this.state.replay = this.state.replay || {};
        this.state.replay.blackBoxTape = recording;
      }
      this._receipt('black_box', data.uniqueWreckId);
      this.bus.emit('uniqueWreck:blackBoxRecovered', {
        wreckId: data.uniqueWreckId, sectorId,
        pos: { x: entity.pos.x, z: entity.pos.z },
      });
      this.bus.emit('toast', {
        text: 'Black box recovered — the last five seconds are on the replay deck.',
        kind: 'objective', ttl: 6,
      });
    }
  },

  _onSalvageCompleted(payload) {
    const entityId = payload && payload.wreckId;
    let wreckId = this._wreckByEntity.get(entityId) || null;
    const entity = this.state.entities && this.state.entities.get && this.state.entities.get(entityId);
    if (!wreckId && entity && entity.data) wreckId = entity.data.uniqueWreckId || null;
    const def = uniqueWreckById(wreckId);
    const own = this._ensureState();
    const record = def && own.bearings[def.id];
    if (!def || !record || record.phase !== 'fixed') return null;

    record.phase = 'decision';
    record.decisionReadyAtS = Math.max(0, finite(this.state.simTime, 0));
    record.choiceId = null;
    record.outcome = null;
    record.resolvedAtS = null;
    record.rewardReceipt = null;
    if (entity && entity.data) entity.data._salvaged = true;
    this._receipt('decision', def.id);
    this._entityByWreck.delete(def.id);
    this._wreckByEntity.delete(entityId);
    this._publishDecision(def.id, 'salvage');
    // The recovered hull collapsed, but the site stays physical: a claim-pending husk spawns at
    // the fixed point so the bearing never points at empty space between recovery and choice.
    // mining.js flips alive AFTER this dispatch returns, so flip it here first — otherwise
    // _findLive would re-bind the dying hull and the husk would die with it.
    if (entity) entity.alive = false;
    this._materialize(def.id);
    return record;
  },

  _decisionReadout(def, record, source = 'runtime') {
    return {
      wreckId: def.id,
      sectorId: def.sectorId,
      phase: record.phase,
      source,
      headline: def.decision.headline,
      prompt: def.decision.prompt,
      choices: def.decision.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        consequence: choice.consequence,
      })),
    };
  },

  _publishDecision(wreckId, source = 'runtime') {
    const def = uniqueWreckById(wreckId);
    const record = def && this._ensureState().bearings[def.id];
    if (!def || !record || record.phase !== 'decision') return null;
    const readout = this._decisionReadout(def, record, source);
    this.bus.emit('uniqueWreck:decisionReady', readout);
    this.bus.emit('toast', {
      text: `${def.name} recovered. Choose CLAIM or HANDOVER in the recovery panel.`,
      kind: 'objective',
      ttl: 8,
    });
    return readout;
  },

  _republishPendingDecisions(payload) {
    const source = payload && payload.source || 'request';
    let published = 0;
    for (const record of Object.values(this._ensureState().bearings)) {
      if (record && record.phase === 'decision' && this._publishDecision(record.wreckId, source)) published++;
    }
    return published;
  },

  /** The legality-resolved bonus cargo a claim pays, keyed by commodity. */
  _bonusCargoFor(def) {
    const rawCargo = {};
    for (const item of def.bonusCargo || []) {
      rawCargo[item.commodityId] = (rawCargo[item.commodityId] || 0) + item.qty;
    }
    const rewardWreck = {
      type: 'wreck',
      data: {
        parentType: def.wreckClass === 'military' ? 'military' : 'ship',
        wreckClass: def.wreckClass,
      },
    };
    return salvagePoolForWreck(rewardWreck, rawCargo);
  },

  /** Volume the hold lacks to take every unit of `cargo`, 0 when it fits (or no hold exists). */
  _bonusCargoShortfall(cargo) {
    const hold = this.state.player && this.state.player.cargo;
    if (!hold || !Number.isFinite(hold.capVolume) || !Number.isFinite(hold.usedVolume)) return 0;
    let free = hold.capVolume - hold.usedVolume;
    let short = 0;
    for (const [commodityId, amount] of Object.entries(cargo || {})) {
      const need = Math.max(0, finite(amount, 0)) * cargoUnitVolume(this.state, commodityId);
      if (need <= 0) continue;
      if (need > free + 1e-9) short += need - Math.max(0, free);
      free = Math.max(0, free - need);
    }
    return short;
  },

  _onChoose(payload) {
    const def = uniqueWreckById(payload && payload.wreckId);
    const own = this._ensureState();
    const record = def && own.bearings[def.id];
    if (!def || !record || record.phase !== 'decision') return null;
    const choice = def.decision.choices.find((entry) => entry.id === payload.choiceId);
    if (!choice) {
      this._publishDecision(def.id, 'invalid-choice');
      return null;
    }

    // Fit check BEFORE the latch: bonus cargo that does not fit the hold was silently discarded
    // while the decision closed for good (Choir-Tender's 50 medical is 40 volume — a whole default
    // hold). A choice that cannot be paid stays open so the pilot can make room and choose again.
    const choiceCargo = choice.bonusCargo ? this._bonusCargoFor(def) : {};
    const shortfall = this._bonusCargoShortfall(choiceCargo);
    if (shortfall > 0) {
      this.bus.emit('uniqueWreck:choiceBlocked', {
        wreckId: def.id,
        sectorId: def.sectorId,
        choiceId: choice.id,
        reason: 'cargo_full',
        neededVolume: shortfall,
      });
      this.bus.emit('toast', {
        text: `${choice.label}: the hold needs ${Math.ceil(shortfall)} more free volume for the cargo. Make room and choose again.`,
        kind: 'warn',
        ttl: 8,
      });
      return null;
    }

    // Close the durable decision before emitting authority intents. Event dispatch is synchronous;
    // this ordering makes duplicate/re-entrant choice events unable to settle twice.
    const resolvedAtS = Math.max(0, finite(this.state.simTime, 0));
    record.phase = 'salvaged';
    record.choiceId = choice.id;
    record.outcome = choice.outcome;
    record.resolvedAtS = resolvedAtS;
    record.salvagedAtS = resolvedAtS;

    const collector = this.state.entities && this.state.entities.get
      ? this.state.entities.get(this.state.playerId) : null;
    const recoveryPos = copyPoint(record.fixedPos || record.exactPos || (collector && collector.pos))
      || { x: 0, z: 0 };
    const cargoGranted = {};
    if (choice.bonusCargo) {
      for (const [commodityId, amount] of Object.entries(choiceCargo)) {
        const before = finite(this.state.player && this.state.player.cargo
          && this.state.player.cargo.items && this.state.player.cargo.items[commodityId], 0);
        this.bus.emit('pickup:collected', {
          collectorId: this.state.playerId,
          kind: 'cargo',
          amount,
          commodityId,
          source: 'unique_wreck',
          wreckId: def.id,
          pos: { ...recoveryPos },
        });
        const after = finite(this.state.player && this.state.player.cargo
          && this.state.player.cargo.items && this.state.player.cargo.items[commodityId], before);
        if (after > before) cargoGranted[commodityId] = after - before;
      }
    }

    const uniqueDropIds = [];
    const storyRewardIds = [];
    if (choice.uniqueDrop) {
      const ships = this.registry && this.registry.get && this.registry.get('ships');
      const inventory = this.state.player && this.state.player.moduleInventory || [];
      for (const reward of rewardDescriptors(def)) {
        if (reward.kind === 'weapon' || reward.kind === 'module') {
          let granted = !!own.grants[reward.id];
          if (!granted) {
            const alreadyOwned = inventory.some((item) => item && item.defId === reward.id);
            granted = alreadyOwned || !!(ships
              && typeof ships.grantModule === 'function'
              && ships.grantModule({
                defId: reward.id,
                reason: `unique-wreck:${def.id}:${choice.id}`,
                // NXB-032 + row 500 — the recovered instance keeps where it came from
                // through hold/fit/resale. Salvage is an authored provenance source:
                // a named hull's part carries the Storied rim and its deed.
                provenance: provenanceStamp({
                  tier: 'storied',
                  label: `Recovered: ${def.name || def.id}`,
                  source: 'wreck',
                  deed: `hull of ${def.victimLabel || def.name || def.id}`,
                }) || `Recovered: ${def.name || def.id}`,
              }));
            if (granted) own.grants[reward.id] = { wreckId: def.id, grantedAtS: resolvedAtS };
          }
          if (granted) uniqueDropIds.push(reward.id);
          continue;
        }
        if (reward.kind !== 'story_commodity' && reward.kind !== 'story_data') continue;
        let granted = !!own.storyRewards[reward.id];
        if (!granted) {
          const flags = ensurePlayer(this.state).flags;
          // The authored row carries the buyer choices and the unlock flag; rewardDescriptors
          // flattens them away, so read the source row. The unlock flag is what opens the
          // downstream path (e.g. the Choir-Vael treaty) — a bare flagKey alone opened nothing.
          const source = (def.uniqueDrops || []).find((drop) => drop && drop.id === reward.id) || {};
          const choices = Array.isArray(source.choices) ? source.choices.filter((c) => typeof c === 'string') : null;
          const unlockFlag = typeof source.unlockFlag === 'string' ? source.unlockFlag : null;
          if (reward.flagKey) flags[reward.flagKey] = true;
          if (unlockFlag) flags[unlockFlag] = true;
          own.storyRewards[reward.id] = {
            wreckId: def.id,
            kind: reward.kind,
            flagKey: reward.flagKey || null,
            grantedAtS: resolvedAtS,
            ...(unlockFlag ? { unlockFlag } : {}),
            ...(choices ? { choices } : {}),
          };
          granted = true;
          this.bus.emit('uniqueWreck:storyRewardGranted', {
            wreckId: def.id,
            sectorId: def.sectorId,
            rewardId: reward.id,
            kind: reward.kind,
            flagKey: reward.flagKey || null,
            unlockFlag,
            choices: choices ? [...choices] : [],
          });
        }
        if (granted) storyRewardIds.push(reward.id);
      }
    }
    const uniqueDropGranted = uniqueDropIds.includes(def.uniqueDropId);
    this._triggerStoryRewardComplications(def, record, storyRewardIds);
    if (uniqueDropGranted || choice.outcome === 'claimed') {
      this._triggerClaimComplications(def, record, choice);
    }

    if (choice.credits > 0) this.bus.emit('economy:grantCredits', {
      amount: choice.credits,
      reason: `unique-wreck:${def.id}:${choice.id}`,
    });
    if (choice.repDelta) this.bus.emit('faction:repDelta', {
      factionId: def.factionId,
      delta: choice.repDelta,
      reason: `unique-wreck:${def.id}:${choice.id}`,
    });
    // Durable graffiti receipt: bulkhead remembers the disposition, not only the news ticker.
    this.bus.emit('graffiti:show', {
      line: choice.outcome === 'claimed'
        ? `${def.name}: CLAIMED UNDER YOUR NAME.`
        : `${def.name}: LEFT WHOLE. THE RECEIPT IS THEIRS.`,
      where: 'bulkhead',
      wreckId: def.id,
      choiceId: choice.id,
      source: 'unique_wreck',
    });

    record.rewardReceipt = {
      id: `unique-wreck:${def.id}:${choice.id}`,
      title: choice.receiptTitle,
      detail: choice.receiptDetail,
      wreckId: def.id,
      choiceId: choice.id,
      outcome: choice.outcome,
      uniqueDropId: uniqueDropGranted ? def.uniqueDropId : null,
      uniqueDropIds: [...uniqueDropIds],
      storyRewardIds: [...storyRewardIds],
      cargo: clonePlain(cargoGranted),
      credits: Math.max(0, finite(choice.credits, 0)),
      factionId: def.factionId,
      repDelta: finite(choice.repDelta, 0),
      resolvedAtS,
    };

    const flags = ensurePlayer(this.state).flags;
    if (!flags.uniqueWrecksVisited.includes(def.id)) flags.uniqueWrecksVisited.push(def.id);
    this._receipt('salvaged', def.id);
    const event = {
      wreckId: def.id,
      sectorId: def.sectorId,
      phase: record.phase,
      choiceId: choice.id,
      outcome: choice.outcome,
      uniqueDropId: uniqueDropGranted ? def.uniqueDropId : null,
      uniqueDropIds: [...uniqueDropIds],
      storyRewardIds: [...storyRewardIds],
      cargo: clonePlain(cargoGranted),
      receipt: clonePlain(record.rewardReceipt),
    };
    this.bus.emit('uniqueWreck:resolved', event);
    this.bus.emit('uniqueWreck:salvaged', event);
    this.bus.emit('news:publish', {
      text: choice.receiptDetail,
      kind: 'wreck_recovery',
      sourceRef: `followup.${def.id}.${choice.id}`,
      wreckId: def.id,
      sectorId: def.sectorId,
      channelId: 'news',
      followup: true,
      receiptId: `depth-r1:${def.programSlot.toLowerCase()}:${choice.id}`,
    });
    // `uniqueWreck:resolved` has one player-facing owner: recoveryEncounterPrompt renders the
    // durable named receipt. Mirroring the same title/detail as an eight-second toast stacked two
    // copies in the upper-right flight HUD and obscured contacts during the recovery aftermath.
    // `news:publish` remains the durable follow-up/history surface.
    // Re-bind (or respawn) the site husk so the choice just made is legible on site immediately:
    // outcome-stamped scan identity, placard scan line, and the outcome's residual pool.
    this._materialize(def.id);
    return record;
  },

  /**
   * Docking at a berth that keeps a buyer for an unsold story item says so once per dock, in the
   * comms log: the buyer is at the bar. The offer itself is a pure read (storyBuyerOffersAt).
   */
  _onStoryBuyerDock(payload) {
    const stationId = payload && payload.stationId;
    if (!stationId || (this.host && this.host._saveRestoring)) return;
    for (const offer of storyBuyerOffersAt(this.state, stationId)) {
      const item = STORY_REWARD_BUYERS[offer.rewardId];
      const row = item && item.choices[offer.choiceIds[0]];
      if (!row) continue;
      this.bus.emit('comms:log', {
        from: row.buyerName,
        text: `${row.buyerName} is asking at the bar about the ${offer.itemName}.`,
        kind: 'story_buyer',
        sourceRef: `storyBuyer:${offer.rewardId}:${stationId}`,
      });
    }
  },

  /**
   * The bar buyer's choice (ui:talkContact from barContacts' story-buyer contact). Sole settler of
   * a story item's disposition: validates berth + undisposed, records it durably, then asks the
   * credit and reputation owners by intent and publishes the consequence.
   */
  _onStoryBuyerTalk(payload) {
    if (!payload || typeof payload.contactId !== 'string' || typeof payload.choiceId !== 'string') return null;
    if (!payload.contactId.startsWith(STORY_BUYER_CONTACT_PREFIX)) return null;
    if (!payload.choiceId.startsWith(STORY_BUYER_CHOICE_PREFIX)) return null;
    const rewardId = payload.contactId.slice(STORY_BUYER_CONTACT_PREFIX.length);
    const choiceId = payload.choiceId.slice(STORY_BUYER_CHOICE_PREFIX.length);
    return this.disposeStoryReward({ rewardId, choiceId, stationId: payload.stationId });
  },

  disposeStoryReward({ rewardId, choiceId, stationId } = {}) {
    const own = this._ensureState();
    const record = own.storyRewards[rewardId];
    const row = storyBuyerRow(rewardId, choiceId);
    if (!record || !row || record.disposition) return null;
    if (Array.isArray(record.choices) && !record.choices.includes(choiceId)) return null;
    const ui = this.state && this.state.ui;
    const dockedAt = ui && ui.docked !== false && typeof ui.dockedStationId === 'string' ? ui.dockedStationId : null;
    const at = typeof stationId === 'string' ? stationId : dockedAt;
    if (!at || (dockedAt && dockedAt !== at) || !storyBuyerAtStation(rewardId, choiceId, at)) return null;

    const repDeltas = storyBuyerRepDeltas(row, at);
    const credits = Math.max(0, Math.floor(finite(row.credits, 0)));
    record.disposition = {
      choiceId,
      stationId: at,
      resolvedAtS: Math.max(0, finite(this.state && this.state.simTime, 0)),
      credits,
      repDeltas: repDeltas.map((rep) => ({ ...rep })),
    };
    const reason = `story-buyer:${rewardId}:${choiceId}`;
    if (credits > 0) this.bus.emit('economy:grantCredits', { amount: credits, reason });
    for (const rep of repDeltas) {
      this.bus.emit('faction:repDelta', { factionId: rep.factionId, delta: rep.delta, reason });
    }
    this.bus.emit('news:publish', {
      text: row.news,
      kind: 'story_disposition',
      sourceRef: `followup.${record.wreckId || rewardId}.${choiceId}`,
      wreckId: record.wreckId || null,
      rewardId,
      choiceId,
      stationId: at,
      channelId: 'news',
      followup: true,
    });
    this.bus.emit('uniqueWreck:storyRewardDisposed', {
      rewardId,
      wreckId: record.wreckId || null,
      choiceId,
      stationId: at,
      credits,
      repDeltas: repDeltas.map((rep) => ({ ...rep })),
    });
    return record.disposition;
  },

  _onEntityDestroyed(payload) {
    const entityId = payload && payload.id;
    const wreckId = this._wreckByEntity.get(entityId);
    if (!wreckId) return;
    this._wreckByEntity.delete(entityId);
    this._entityByWreck.delete(wreckId);
  },

  serialize() {
    return clonePlain(this._ensureState());
  },

  deserialize(payload) {
    const player = ensurePlayer(this.state);
    player.uniqueWrecks = normalizeUniqueWreckState(payload, this.state.meta && this.state.meta.seed);
    this._clearRuntime();
    return player.uniqueWrecks;
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      for (const [event, handler] of this._subscriptions || []) this.bus.off(event, handler);
    }
    if (this._subscriptions) this._subscriptions.length = 0;
    this._clearRuntime();
  },
};

export default uniqueWrecks;
