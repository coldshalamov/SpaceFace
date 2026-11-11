import { isReportInRestitution } from '../missions/restitutionReadout.js';
// Shared mission helpers extracted from missions.js so the ops modules can import the
// vocabulary without importing the composite. This module must never import './missions.js':
// that edge is what made a direct ops import hit the composite's TDZ. Keep behaviour identical
// to the declarations this module was split from; missions.js re-exports the whole surface.

import {
  MISSION_TYPES, STORY_BEATS, AUTHORED_SET_PIECE_TYPE, CAPITAL_BOSS_TYPE, PHYSICAL_MISSION_TYPES,
  CONTRACT_DESK_SERVICES, hasContractsDesk, AUTHORED_SET_PIECE_SOURCE, MEGA_HEIST_SOURCE,
  CAPITAL_BOSS_SOURCE, authoredSetPieceById, megaHeistById, missionMinRepForRisk,
  STORY_BRANCH_INTROS, STORY_BRANCH_INTRO_MIN_REP, STORY_BRANCH_INTRO_TAG, SET_PIECE_MISSIONS,
} from '../data/missions.js';
import { COMMODITIES } from '../data/commodities.js';
import { stationMinRepFor } from '../data/dockDeny.js';
import { hash32 } from '../core/rng.js';
import { FRONTIER_FIRST_NAMES, FRONTIER_LAST_NAMES, PASSENGER_WHY_LINES } from '../data/barks.js';
import { starterRamSentence } from '../data/starterJobs.js';
import { SUBSYSTEM_DEFS } from '../data/combatDefs.js';
import { Masks } from '../core/entity.js';
import {
  TICK_CONDITION_IDS, serializableMissionCondition, missionConditionById, TWIST_MUTATIONS,
} from '../data/missionConditions.js';
import { AUTHORED_SET_PIECE_ENCOUNTERS } from '../data/encounters/set-piece-authored.js';
import { MEGA_HEIST_ENCOUNTERS } from '../data/encounters/mega-heist.js';
import { actionById as salvageActionById } from '../data/salvageActions.js';
import { SECTORS } from '../data/sectors.js';
import { SECTOR_ANCHORS } from '../data/sectorAnchors.js';
import { zonesForSector } from '../data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { FACTION_META } from '../data/factions.js';
import { SHIPS } from '../data/ships.js';
import { FRONTIER_MODULES } from '../data/factions/free.js';
import { isShortageGateRepair } from '../data/economyContractTemplates.js';
import { SET_PIECE_MISSION_SOURCE } from './setPieceMissionOffers.js';
import { LANDMARK_QUEST_SOURCE } from '../data/landmarkMissions.js';
import { SET_PIECE_FOLLOW_ON_SOURCE } from '../data/sandboxSetPieceFollowOns.js';
import { releasableContractUnits, sellableCargoQuantity } from './cargo.js';
import { isSpineBreakOperation, SPINE_BREAK_CONFIG } from '../missions/spineBreakWorksite.js';
import { workingBattlefieldObjective } from './workingBattlefieldRuntime.js';

// ── Static lookups (built once from pure data) ───────────────────────────────────────────────
export const TYPE_BY_ID = new Map(MISSION_TYPES.map((t) => [t.type, t]));
// Offer-mix arrays are ordered to match MISSION_TYPES; remember that order for weighted picks.
export const TYPE_ORDER = MISSION_TYPES.map((t) => t.type);
export const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
export const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
export const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));

// station id → mission-board identity resolved from the SECTORS graph. Physical `type` remains
// the economy/render contract; optional missionProfile/boardAnchorType only shape posted work.
// A contracts desk is the advertised board: the missions counter or a black-market counter —
// exactly the services the hub labels "contracts here". Procedural board rolls only exist
// where one is advertised; earned/authored rows post regardless (see ensureBoard).
export const DESK_SERVICES = CONTRACT_DESK_SERVICES;

export const STATION_INFO = new Map();
export const SECTOR_BY_ID = new Map();
for (const sec of SECTORS) {
  SECTOR_BY_ID.set(sec.id, sec);
  const sectorHasRefuel = (sec.stations || [])
    .some((s) => Array.isArray(s.services) && s.services.includes('refuel'));
  for (const st of sec.stations || []) {
    STATION_INFO.set(st.id, {
      id: st.id, name: st.name, type: st.type, size: st.size || 'M',
      missionProfile: st.missionProfile || st.type,
      boardAnchorType: st.boardAnchorType || null,
      factionId: st.factionId || sec.factionId, sectorId: sec.id,
      sectorTier: sec.tier, security: sec.security,
      // A station that DECLARES services with no contracts desk, in a sector with no pump,
      // rolls no procedural work — the authored fuel-less outpost fiction. A station that
      // declares nothing keeps legacy behavior (fixture/stub stations roll normally).
      desklessOutpost: Array.isArray(st.services) && st.services.length > 0
        && !hasContractsDesk(st.services) && !sectorHasRefuel,
      // Destination pickers read the real gates: a 'scan' service is a customs sweep (smuggling
      // can't route there), repGated means positive standing docks, and an explicit minRep
      // binds the same way the dock gate resolves it (world.js station record).
      services: Array.isArray(st.services) ? st.services.slice() : [],
      repGated: st.repGated === true,
      minRep: stationMinRepFor(st),
      // The unfiltered record for the berth oracles — dockDenyReason reads flags
      // (quarantine, private, military, abandoned) this view deliberately does not copy.
      record: st,
    });
  }
}
export const ALL_STATIONS = [...STATION_INFO.values()];

/** STATION_INFO first, then a runtime content.sectors registry when one is mounted. */
export function stationInfoFor(state, stationId) {
  const reg = state && state.content && state.content.sectors;
  if (reg) {
    const list = Array.isArray(reg) ? reg : Object.values(reg);
    for (const sec of list) {
      for (const st of sec.stations || []) {
        if (st.id === stationId) {
          return {
            id: st.id, name: st.name, type: st.type, size: st.size || 'M',
            missionProfile: st.missionProfile || st.type,
            boardAnchorType: st.boardAnchorType || null,
            factionId: st.factionId || sec.factionId, sectorId: sec.id,
            sectorTier: sec.tier, security: sec.security,
            desklessOutpost: Array.isArray(st.services) && st.services.length > 0
              && !hasContractsDesk(st.services)
              && !(sec.stations || []).some((s) => Array.isArray(s.services) && s.services.includes('refuel')),
            services: Array.isArray(st.services) ? st.services.slice() : [],
            repGated: st.repGated === true,
            minRep: stationMinRepFor(st),
            record: st,
          };
        }
      }
    }
  }
  return STATION_INFO.get(stationId) || null;
}

/**
 * A1 "passengers are people": mint one offer's passenger from (world seed, offer id) — a name
 * and a one-line "why I'm traveling". Never an rng draw and never ambient randomness: the same
 * offer reproduces the same person across board refresh, save/load, and the fugitive reveal.
 */
export function passengerIdentityFor(seed, offerId, destName) {
  const seedU = (Number(seed) || 0) >>> 0;
  const idStr = String(offerId || '');
  const nameHash = hash32(seedU, idStr, 'pax-name');
  const first = FRONTIER_FIRST_NAMES[nameHash % FRONTIER_FIRST_NAMES.length];
  const last = FRONTIER_LAST_NAMES[(nameHash >>> 8) % FRONTIER_LAST_NAMES.length];
  const whyHash = hash32(seedU, idStr, 'pax-why');
  const why = String(PASSENGER_WHY_LINES[whyHash % PASSENGER_WHY_LINES.length])
    .replace(/\{dest\}/g, destName || 'the destination');
  return { name: `${first} ${last}`, why };
}

// Commodities a player can plausibly haul for delivery / be asked to mine / smuggle.
export const LEGAL_TRADE_CMDTYS = COMMODITIES.filter((c) => c.legality === 'legal').map((c) => c.id);
export const MINEABLE_CMDTYS = COMMODITIES.filter((c) => (c.producedBy || []).includes('mining')).map((c) => c.id);
export const CONTRABAND_CMDTYS = COMMODITIES.filter((c) => c.legality === 'contraband' || c.legality === 'restricted').map((c) => c.id);
export const MISSION_RECEIPT_LIMIT = 10;
export const BULK_HAUL_TYPE = 'bulk_haul';
export const BULK_HAUL_MIN_MASS_U = 25;
export const BULK_HAUL_PAY_MULT = 0.8;
export const BULK_HAUL_FEE = 0.06;
// DOCK_SETTLED_TYPES lives in data/missions.js — the type taxonomy shared by this
// accept gate and the dossier preflight.
export const PHYSICAL_TYPE_SET = new Set([
  ...PHYSICAL_MISSION_TYPES,
  AUTHORED_SET_PIECE_TYPE,
  CAPITAL_BOSS_TYPE,
]);
export const PHYSICAL_ROLE = Object.freeze({
  SLAG_CORE: 'slag_core',
  TOWER: 'demolition_tower',
  POD: 'life_pod',
  ESCORT: 'rescue_escort',
  CARGO_POD: 'cargo_pod',
  RAIDER: 'convoy_raider',
  HULK: 'jam_hulk',
  CRADLE: 'cradle_lock',
  ACE: 'ace_pilot',
  MINE: 'reef_mine',
  VAULT: 'vault_hatch',
  JAWS: 'crusher_jaws',
  BELT: 'crusher_belt',
  CAPITAL: 'capital_hull',
  THROW_MASS: 'throw_mass',
  GATE: 'race_gate',
});
export const CAPITAL_SUBSYSTEM_ORDER = Object.freeze([
  'subsystem_drive',
  'subsystem_weapon',
  'subsystem_tether_spool',
]);
export const CAPITAL_SUBSYSTEM_BY_ID = new Map(SUBSYSTEM_DEFS.map((def) => [def.id, def]));
export const THROWN_MASS_SUBSYSTEM_DAMAGE = 40;

export function authoredDefinitionOf(mission) {
  const id = mission && mission.params && mission.params.authoredSetPieceId;
  return authoredSetPieceById(id) || megaHeistById(id);
}

export function authoredEncounterOf(definition) {
  if (!definition) return null;
  return AUTHORED_SET_PIECE_ENCOUNTERS[definition.id] || MEGA_HEIST_ENCOUNTERS[definition.id] || null;
}

export function isCampaign47aB2Rescue(mission) {
  return !!(mission && mission.type === 'rescue_under_fire'
    && String(mission.storyTag || '') === CONTRACT_47A_B2_TAG
    && authoredDefinitionOf(mission)?.id === 'pod_rescue');
}

export function b2RescueActorForRole(mission, role) {
  const definition = isCampaign47aB2Rescue(mission) ? authoredDefinitionOf(mission) : null;
  const encounter = authoredEncounterOf(definition);
  return encounter && Array.isArray(encounter.actors)
    ? encounter.actors.find((actor) => actor && actor.role === role) || null
    : null;
}

export function b2RescueActorCount(mission, actor, paramName) {
  if (!actor) return 0;
  const configured = Number(mission && mission.params && mission.params[paramName]);
  const count = Number.isFinite(configured) ? configured : Number(actor.count);
  return Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
}

export function b2RescueActorIdentity(mission, actor, index) {
  if (!mission || !actor || !actor.actorId || !Number.isInteger(index) || index < 0) return null;
  return `${String(mission.id)}:${actor.actorId}:${index + 1}`;
}

export function b2RescueActorIndexFromEntity(mission, entity, actor, role) {
  const count = b2RescueActorCount(mission, actor, role === PHYSICAL_ROLE.POD ? 'podCount' : 'escortCount');
  const savedId = entity && entity.data && entity.data.missionActorId;
  if (savedId != null) {
    for (let index = 0; index < count; index++) {
      if (String(savedId) === b2RescueActorIdentity(mission, actor, index)) return index;
    }
  }
  const slot = missionTargetSlotOf(entity, mission && mission.id);
  const offset = role === PHYSICAL_ROLE.POD
    ? 0
    : b2RescueActorCount(mission, b2RescueActorForRole(mission, PHYSICAL_ROLE.POD), 'podCount');
  const index = slot == null ? -1 : slot - offset;
  return index >= 0 && index < count ? index : -1;
}

export function ensureB2RescueActorOutcomes(mission) {
  if (!isCampaign47aB2Rescue(mission)) return null;
  mission.params = mission.params || {};
  const current = mission.params.rescueActorOutcomes;
  const hadLedger = !!(current && typeof current === 'object' && !Array.isArray(current));
  const outcomes = hadLedger ? current : {};
  const pods = b2RescueActorForRole(mission, PHYSICAL_ROLE.POD);
  const escorts = b2RescueActorForRole(mission, PHYSICAL_ROLE.ESCORT);
  if (!hadLedger) {
    const lost = Math.min(b2RescueActorCount(mission, pods, 'podCount'),
      Math.max(0, Math.floor(Number(mission.params.podsLost) || 0)));
    const cleared = Math.min(b2RescueActorCount(mission, escorts, 'escortCount'),
      Math.max(0, Math.floor(Number(mission.params.escortsDown) || 0)));
    for (let index = 0; index < lost; index++) {
      outcomes[b2RescueActorIdentity(mission, pods, index)] = 'lost';
    }
    for (let index = 0; index < cleared; index++) {
      outcomes[b2RescueActorIdentity(mission, escorts, index)] = 'cleared';
    }
  }
  mission.params.rescueActorOutcomes = outcomes;
  return outcomes;
}

export function authoredMethodFor(definition, on, role) {
  if (!definition || !definition.methodHooks || !role) return null;
  for (const [method, hook] of Object.entries(definition.methodHooks)) {
    if (hook && hook.role === role && Array.isArray(hook.on) && hook.on.includes(on)) return method;
  }
  return null;
}

export function authoredMethodDebriefPhrase(method) {
  const phrases = {
    wrecking_ball: 'bringing down the tower with thrown mass',
    cut_down: 'cutting down the tower',
    stage_tow: 'towing the pod to safety',
    corridor_pull: 'reeling the pods through the cleared corridor',
    tow_in: 'towing the load into berth',
    sling_in: 'slinging the load into berth',
    tow_the_barge: 'towing the barge into berth',
    sling_the_barge: 'slinging the barge into berth',
    tow_it_home: 'towing the skiff home',
    reel_it_free: 'reeling the skiff free after clearing the scavengers',
    recatch_pods: 'catching the cargo pods on the tow line',
    drive_off: 'driving off the raiders',
    park_the_hulk: 'parking the hulk in the berth',
    swing_the_wedge: 'swinging the wedge clear',
    slip_the_gap: 'slipping through the gap',
    breach_the_lock: 'breaking the lock with thrown mass',
    throw_the_ace: 'throwing the ace off the lane',
    outgun_the_ace: 'outgunning the ace',
    throw_the_deserter: 'throwing the deserter off the range',
    outgun_the_deserter: 'outgunning the deserter',
    bowl_the_chain: 'bowling thrown mass through the mine chain',
    reel_the_line: 'reeling the mine line clear',
    yank_the_hatch: 'yanking the vault hatch open',
    smash_the_door: 'smashing the vault door with swung mass',
    feed_the_jaws: 'feeding thrown mass into the crusher jaws',
    cut_the_belt: 'cutting the crusher belt',
    feed_the_hopper: 'feeding thrown mass into the hopper',
    cut_the_slurry: 'cutting the slurry feed',
    ram_the_gate: 'ramming the gate with swung mass',
    cut_the_gate: 'cutting down the toll gate',
    slip_the_locker: 'reeling the locker out quietly',
    breach_the_seal: 'breaking the locker seal with thrown mass',
  };
  // A missing method has no phrase — the debrief drops the "closed by" clause instead of
  // inventing one ("physics"). Every catalog method is listed above (sfq-b072 checks it); an
  // unlisted future method still reads as words rather than an id.
  if (!method) return null;
  return phrases[method] || String(method).replace(/_/g, ' ');
}

export function stampAuthoredTwist(offer) {
  if (!offer || (offer.source !== AUTHORED_SET_PIECE_SOURCE && offer.source !== MEGA_HEIST_SOURCE)) {
    return offer;
  }
  const twistId = offer.params && offer.params.twistClauseId;
  const row = twistId ? serializableMissionCondition(twistId) : null;
  if (!row) return offer;
  const existing = Array.isArray(offer.clauses) ? offer.clauses : [];
  if (existing.some((clause) => clause && (clause.id === row.id || clause.conditionId === row.id))) {
    return offer;
  }
  const condition = missionConditionById(twistId);
  const next = { ...offer, clauses: [...existing, row] };
  if (condition && condition.brief) {
    next.brief = withClauseBriefSuffix(String(next.brief || '').trim(), condition.brief);
  }
  return next;
}

export function stampCapitalBossTwist(offer) {
  if (!offer || offer.source !== CAPITAL_BOSS_SOURCE) return offer;
  const twistId = offer.params && offer.params.twistClauseId;
  const row = twistId ? serializableMissionCondition(twistId) : null;
  if (!row) return offer;
  const existing = Array.isArray(offer.clauses) ? offer.clauses : [];
  if (existing.some((clause) => clause && (clause.id === row.id || clause.conditionId === row.id))) {
    return offer;
  }
  const condition = missionConditionById(twistId);
  const next = { ...offer, clauses: [...existing, row] };
  if (condition && condition.brief) {
    next.brief = withClauseBriefSuffix(String(next.brief || '').trim(), condition.brief);
  }
  return next;
}

export function isCapitalBossMission(mission) {
  return !!(mission && mission.type === CAPITAL_BOSS_TYPE);
}

export function completedEndgamePull(state, pullId) {
  const completed = state && state.claims && state.claims.endgamePulls && state.claims.endgamePulls.completed;
  return !!(completed && pullId && completed[pullId]);
}

export function capitalSubsystemWorldPos(entity, subsystemId) {
  const def = CAPITAL_SUBSYSTEM_BY_ID.get(subsystemId);
  const center = def && def.volume && Array.isArray(def.volume.center) ? def.volume.center : [0, 0];
  const radius = Math.max(1, Number(entity && entity.radius) || 20);
  const lx = (Number(center[0]) || 0) * radius;
  const lz = (Number(center[1]) || 0) * radius;
  const rot = Number(entity && entity.rot) || 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    x: (entity && entity.pos && entity.pos.x || 0) + lx * cos - lz * sin,
    z: (entity && entity.pos && entity.pos.z || 0) + lx * sin + lz * cos,
  };
}
export const PHYSICAL_BERTH_WU = 700;
// Story B2/B3 dest-dock (latch-dock, throw, sling). Leftover authored / sling_in keep PHYSICAL_BERTH_WU.
// Live limit is dest station hull or dock radius + cargo radius + this slack.
export const STORY_LATCH_DOCK_SLACK_WU = 24;
// Mission wrecks stay type `wreck` (DEFAULT_MASK.wreck === 0) but must be solid to ships,
// thrown mass, shots, and drones. Bidirectional canCollide in leftover physics means this
// mask is enough — do not change the global wreck default.
export const MISSION_WRECK_COLLISION_MASK = Masks.SHIP | Masks.ASTEROID | Masks.PROJECTILE | Masks.DRONE;
// A tick condition may only re-warn this often. The warning is the grace window made visible, not a
// nag: crossing the speed ceiling repeatedly in a dogfight must not bury the rest of the alert lane.
export const CONDITION_WARN_COOLDOWN_S = 8;
export const CONDITION_BRIEF_MAX = 150;

// A clause the player cannot read before accepting is a hidden condition. When the combined
// line overflows the cap, the base brief yields — the term text is never the part that gets cut.
export function withClauseBriefSuffix(base, suffix) {
  const line = base ? `${base} ${suffix}` : suffix;
  if (line.length <= CONDITION_BRIEF_MAX) return line;
  const room = CONDITION_BRIEF_MAX - suffix.length - 4; // "... " separator
  if (room > 0) return `${base.slice(0, room).trimEnd()}... ${suffix}`;
  return suffix.length <= CONDITION_BRIEF_MAX ? suffix
    : `${suffix.slice(0, CONDITION_BRIEF_MAX - 3).trimEnd()}...`;
}
export const TICK_CONDITION_ID_SET = new Set(TICK_CONDITION_IDS);
export const MISSION_HOSTILE_SPAWN_MIN_WU = 1700;
export const MISSION_HOSTILE_SPAWN_MAX_WU = 2600;
export const MISSION_HOSTILE_SPAWN_ATTEMPTS = 24;
export const MISSION_PORT_SAFE_RADIUS_WU = 1200;

// ── Contract claim-stake salvage (WF-08) ───────────────────────────────────────────
// An ordinary board salvage_retrieval is a promised dead hull on the destination's
// approach lane, not a cargo fetch: the wreck drifts outside port safety with the
// contract manifest in its salvagePool, a filed field-claim (mining's own
// `salvorClaimedBy` → `salvage:claimJumped` → lawSecurity.reportIncident protest
// path), and a passive working crew — a hauler lead that physically siphons the
// pool into its cargoManifest while the player watches, plus cutter escorts that
// hold fire until the claim is touched. Every approach stays open: strip it under
// protest (law judges the theft where witnessed), gun the crew down first (the
// claim lapses when nobody holds it), drag the whole hull off on a tether, or let
// the crew finish and take the goods off the hauler the hard way — the manifest
// drops as a real takeable body through lootShards' civilian-payload path.
export const CONTRACT_CLAIM_PLAYER_RANGE_WU = 900;   // the crew only works while the player is on scene
export const CONTRACT_CLAIM_WORK_RANGE_WU = 240;     // the hauler must stay on the hull to cut it
export const CONTRACT_CLAIM_CUT_PERIOD_S = 10;       // one manifest unit siphoned per this many seconds
export const CONTRACT_CLAIM_FLEE_RANGE_WU = 1500;    // a sprung hauler runs this far off the hull
export const CONTRACT_CLAIM_ORBIT_RAD_PER_S = 0.11;  // slow visible mill around the wreck
export const CONTRACT_CLAIM_SCAN_LABEL = 'DEAD HAULER — FILED CLAIM';

// ── PQ-138.04 failure mutation ("failure should usually mutate the situation") ───────────────
// A broken contract must not dead-end in a red toast: the situation the player is standing in
// becomes the next objective. ONE descriptor per failure reason, keyed by prefix so a full reason
// like `clause_broken:cargo_intact` resolves. Reasons with NO row (abandoned, condition breaches
// without a twist descriptor, story-asset losses, escort_abandoned) stay plain failures —
// "usually" is this table. Every `type` reuses an existing MISSION_TYPES entry; nothing here
// authors a new mission type.
//
// DROPPED from the sketched table, deliberately:
//   clause_broken:no_kills / clause_broken:no_scan — pure fine-print violations with no physical
//     residue (no wreck, no lost manifest), and the shipped clause acceptance suite
//     (test/depth-program-sp1-clauses.test.mjs) pins those breaches to settle-and-remove.
//   heist_failed — the heist already owns an authored failure→follow-up seam
//     (_boardHeistRecovery + the recovery comms cue); a second generic successor would double-post
//     on the same settlement. Authored set-piece missions carry their own recovery offers, so
//     _mutateInsteadOfFail refuses them for the same reason.
//   abandoned / escort_abandoned / seed_asset_lost — quitting on purpose and story-asset losses
//     are a settled ending, not a scene to salvage.
//
// CHAIN BOUND: a successor minted by a mutation carries mutationDepth; a mission at the cap
// fails plainly so failure→residue→failure cannot chain indefinitely.
export const MUTATION_MAX_DEPTH = 1;
export const MUTATION_SALVAGE_CMDTYS = Object.freeze(['cmdty_scrap_metal', 'cmdty_salvage_electronics']);
export const MISSION_MUTATIONS = Object.freeze({
  // The convoy died → the wreck it left is salvage to bring home.
  escortee_lost: Object.freeze({ type: 'salvage_retrieval', tag: 'salvage' }),
  // The cargo was confiscated → the manifest is now a debt: replace the lot and finish the leg.
  'clause_broken:cargo_intact': Object.freeze({ type: 'cargo_delivery', tag: 'restitution' }),
  // The rescue came second → recover what the wreck left.
  'clause_broken:rescue_priority': Object.freeze({ type: 'salvage_retrieval', tag: 'recovery' }),
  // A patrol scan caught the sealed lot → customs took it; the client still wants it replaced.
  busted: Object.freeze({ type: 'cargo_delivery', tag: 'restitution' }),
  // The clock ran out → the job that lapsed decides the residue. An escorted convoy survived
  // the missed window — it is still a hull on the lane, so the successor re-issues the escort
  // (keepTargets hands the live escortee over). A slipped warrant reposts as a fresh hunt.
  // Every other lapsed contract refiles as a restitution debt, unchanged.
  deadline: Object.freeze({
    type: 'cargo_delivery',
    tag: 'restitution',
    byType: Object.freeze({
      escort: Object.freeze({ type: 'escort', tag: 'resumed', keepTargets: true }),
      bounty_hunt: Object.freeze({ type: 'bounty_hunt', tag: 'warrant' }),
    }),
  }),
  // The pods went down with the run → recover what the wreck left.
  // The 'recovery' tag keeps the salvage leg; the toast and brief name what was actually lost
  // (the tag's default copy is the rescue_priority story).
  pods_lost: Object.freeze({
    type: 'salvage_retrieval',
    tag: 'recovery',
    toast: (title) => `The pods went down with the run — the wreck can still be recovered. Contract live: ${title}.`,
    brief: (homeName) => `The pods went down with the run. What the wreck left still pays at ${homeName}.`,
  }),
  // The towed slag core broke up → the scatter still pays at the yard.
  core_lost: Object.freeze({
    type: 'salvage_retrieval',
    tag: 'recovery',
    toast: (title) => `The core broke up in transit — the scatter still pays. Recovery contract live: ${title}.`,
    brief: (homeName) => `The slag core broke up on the line. The scatter still pays at ${homeName}.`,
  }),
  // FB-068 — another crew (or the rocks) took the objective down. The contract voids fairly
  // (deposit back, no penalty — handled by the 'failed_external' branch in _failMission) and
  // the objective's wreck still pays as a recovery leg: the loss is an outcome, not a dead end.
  failed_external: Object.freeze({
    type: 'salvage_retrieval',
    tag: 'recovery',
    // Names the cause the failing contract stamped (gunnery / an explosive / the rocks) — the
    // player hears WHAT took the objective down, not just that a follow-up exists.
    toast: (title, m) => `${(m && m.params && m.params.externalCauseLabel) || 'The objective went down to someone else'} — its wreck can still be recovered: ${title}.`,
    brief: (homeName) => `Someone else took the objective down. What is left of it still pays at ${homeName}.`,
  }),
  // BP-01.1: the ship went down WITH the contract manifest → the player's own wreck still holds
  // the lost units. keepManifest keeps the failed contract's commodity on the successor; the
  // ship_lost handler stamps the durable wreck site and the lost quantity before settling.
  ship_lost: Object.freeze({
    type: 'salvage_retrieval',
    tag: 'recovery',
    keepManifest: true,
    toast: (title) => `Ship lost — your wreck still holds the manifest. Recovery contract live: ${title}.`,
  }),
  // PQ-152.03 — mid-run twist clauses. Same successor seam; both reason prefixes so a tick
  // term and an event term cannot drift apart.
  ...Object.fromEntries(Object.entries(TWIST_MUTATIONS).flatMap(([id, descriptor]) => ([
    [`clause_broken:${id}`, descriptor],
    [`condition_broken:${id}`, descriptor],
  ]))),
});
export const ESCORT_TURN_DELAY_S = 12;
// NXI-149: failure words live in data/missionFailReasons.js (shared with the mission log).
export const MUTATION_TOAST = Object.freeze({
  salvage: (title) => `Convoy lost — the wreck is still out there. Salvage contract live: ${title}.`,
  restitution: (title) => `Contract broken — the manifest is now a debt. Restitution job live: ${title}.`,
  recovery: (title) => `The rescue was lost — the wreck can still be recovered. Contract live: ${title}.`,
  turned: (title) => `The escort turned. Hunt contract live: ${title}.`,
  cooked: (title) => `The cargo cooked. Recovery live: ${title}.`,
  sting: (title) => `The buyer is the law. New drop live: ${title}.`,
  wakes: (title) => `The wreck woke. Hunt contract live: ${title}.`,
  bait: (title) => `The pods were bait. Clear the field: ${title}.`,
  resumed: (title) => `The window lapsed — the convoy is still on the lane. Escort re-issued: ${title}.`,
  warrant: (title) => `The mark slipped the window — the warrant is reposted: ${title}.`,
});

export function missionMutationFor(reason) {
  if (!reason) return null;
  if (MISSION_MUTATIONS[reason]) return MISSION_MUTATIONS[reason];
  const text = String(reason);
  for (const key of Object.keys(MISSION_MUTATIONS)) {
    if (text.startsWith(`${key}:`)) return MISSION_MUTATIONS[key];
  }
  return null;
}

/**
 * INF-066: stamp where a lost escortee died. The destroy payload carries the last position but
 * the entity row is already deleted (coreSystem), so the sector + pos must be captured here —
 * this is what routes the salvage successor to the true wreck instead of the old destination.
 * Returns null when nothing usable survives (callers keep the legacy fallbacks).
 */
export function escortLossSite(pos, sectorId) {
  if (!pos || typeof pos !== 'object') return null;
  const x = Number(pos.x);
  const z = Number(pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || sectorId == null) return null;
  return { sectorId: String(sectorId), wreckPos: { x, z } };
}

/** NXB-038: is this convoy hull's drive dead? Reads the combat-subsystem runtime record the
 *  same way latchRepair/surrenderRecovery do — a disabled drive is a towable hull, not a corpse. */
export function driveDisabledRuntime(state, entityId) {
  const runtime = state && state.combat && state.combat.entities
    ? state.combat.entities[String(entityId)]
    : null;
  const drive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
  return !!((drive && drive.effectiveDisabled === true)
    || (runtime && runtime.capabilities && runtime.capabilities.drive === false));
}

/**
 * INF-066: resolve a salvage successor's recovery site. Reads the stamped loss site first
 * (escort failure), then the successor's own carried params, then the legacy fallback chain —
 * one helper for both the offer builder (failing mission) and the waypoint/salvage hooks
 * (successor mission) so the two can never disagree about where the wreck is.
 */
export function mutationWreckRouting(m, currentSectorId) {
  const p = (m && m.params) || {};
  const stampedPos = m && m._escorteeWreckPos;
  const paramPos = p.lostWreckPos;
  const rawPos = (stampedPos && Number.isFinite(stampedPos.x) && Number.isFinite(stampedPos.z))
    ? stampedPos
    : (paramPos && Number.isFinite(paramPos.x) && Number.isFinite(paramPos.z) ? paramPos : null);
  const sectorId = (m && m._escorteeSectorId) || p.lostSectorId
    || (m && m.destSectorId) || currentSectorId || null;
  return {
    sectorId: sectorId == null ? null : String(sectorId),
    wreckPos: rawPos ? { x: rawPos.x, z: rawPos.z } : null,
  };
}

/** INF-066: salvage-family mutation tags — the only missions with a recovery leg. */
export function isMutationRecovery(m) {
  const tag = m && m.mutationTag;
  return tag === 'salvage' || tag === 'recovery' || tag === 'cooked';
}

/**
 * INF-069: the convoy client's three-state arc, bound to live settlement — never to intent.
 * `recovering` answers the first salvage credit; `completed` answers the dock (full thanks
 * only when the full manifest actually changed hands, short-settle otherwise); `failed`
 * answers abandonment or expiry with a closed file and no thanks. Returns null for every
 * mission that is not a salvage successor, so ordinary contracts keep their own voice and
 * the client can neither thank for unperformed work nor re-introduce itself after settling
 * (settlement fires once; the reaction carries a once-flag at the call site).
 */
export function convoyClientVoice(m, outcome, homeName) {
  if (!isMutationRecovery(m)) return null;
  const home = String(homeName || 'home');
  const sender = `${home} Salvage Desk`;
  const p = (m && m.params) || {};
  const qty = Math.max(1, Math.floor(Number(p.qty) || 1));
  if (outcome === 'recovering') {
    return {
      sender,
      text: `You're into the wreck — bring what's left of it home to ${home}. The desk pays for what comes back.`,
    };
  }
  if (outcome === 'completed') {
    if (p.completionMethod === 'partial_recovery') {
      return {
        sender,
        text: `Short manifest logged. It isn't the whole convoy, but it settles what came home to ${home}.`,
      };
    }
    return {
      sender,
      text: `Full ${qty}u manifest home at ${home}. The convoy's file is closed with thanks — settled in full.`,
    };
  }
  if (outcome === 'failed' || outcome === 'expired') {
    return {
      sender,
      text: `The wreck's gone cold and the file is closed at ${home}. No payment, no blame — there was nothing left to bring home.`,
    };
  }
  return null;
}

/** INF-068: the convoy-wreck pocket geometry — a near-ring offset plus a slow drift. */
export const CONVOY_WRECK_RING_WU = 60;
export const CONVOY_WRECK_DRIFT_WU_S = 6;

/**
 * INF-068: author the convoy-wreck pocket for one salvage successor. The lost hull died where
 * the stamp says; the pocket spawns one drifting wreck there holding the contract commodity
 * with its core armed. Arming `data.unstableReactor` is the whole trick: the salvage catalog
 * answers it with the vent-reactor action (vent or tow clear), and the salvage update ticks
 * its burst timer — both physical answers work through existing systems, and settlement stays
 * the canonical credit-plus-dock path. Pure over the mission plus explicit inputs; the caller
 * supplies rng angles and the clock. Returns null when the mission is not a salvage successor
 * with a known loss site and a contract commodity.
 */
export function convoyWreckPocket(m, opts = {}) {
  if (!m || m.type !== 'salvage_retrieval' || !isMutationRecovery(m)) return null;
  const p = m.params || {};
  const cmdtyId = p.cmdtyId;
  const qty = Math.max(1, Math.floor(Number(p.qty) || 1));
  if (!cmdtyId) return null;
  const routing = mutationWreckRouting(m, opts.currentSectorId || null);
  if (!routing.wreckPos || !routing.sectorId) return null;
  const nowS = Number(opts.nowS) || 0;
  const catalog = (typeof salvageActionById === 'function' && salvageActionById('vent_reactor')) || {};
  const timerS = Math.max(1, Number(catalog.timerS) || 8);
  const damage = Math.max(1, Math.min(Number(catalog.burstDamage) || 18, 24));
  const persistedDueAt = Number(p.convoyWreckDueAt);
  const dueAt = Number.isFinite(persistedDueAt) ? persistedDueAt : nowS + timerS;
  const ringAngle = Number(opts.ringAngle) || 0;
  const driftAngle = Number(opts.driftAngle) || 0;
  // A ship_lost successor claims the manifest is inside the player's own wreck — the pocket
  // co-locates exactly on the wreck marker instead of ringing it, so the cargo physically sits
  // where the contract says it does.
  const ringWu = p.playerWreckSite === true ? 0 : CONVOY_WRECK_RING_WU;
  const pos = {
    x: routing.wreckPos.x + Math.cos(ringAngle) * ringWu,
    z: routing.wreckPos.z + Math.sin(ringAngle) * ringWu,
  };
  return {
    sectorId: routing.sectorId,
    dueAt,
    spec: {
      type: 'wreck',
      pos,
      vel: {
        x: Math.cos(driftAngle) * CONVOY_WRECK_DRIFT_WU_S,
        z: Math.sin(driftAngle) * CONVOY_WRECK_DRIFT_WU_S,
      },
      rot: 0,
      radius: 9,
      mass: 60,
      hull: 1,
      hullMax: 1,
      factionId: null,
      team: 2,
      collides: false,
      flags: { noInterp: true, missionPinned: true, durable: true },
      data: {
        parentType: 'ship',
        unstableReactor: { dueAt, damage, vented: false, burst: false, towedClear: false },
        authoredSalvagePool: { [cmdtyId]: qty },
        authoredScanLabel: p.playerWreckSite === true
          ? 'Your wreck — unstable core'
          : 'Convoy wreck — unstable core',
        identityKey: `mission:${m.id}:convoy-wreck`,
        homeSectorId: routing.sectorId,
        sectorId: routing.sectorId,
        durable: true,
        missionId: m.id,
        missionTag: m.id,
        missionPinned: true,
      },
    },
  };
}

/**
 * INF-067: is an ordinary bounty contract void because its mark is gone? True when the killed
 * entity is a tagged target, the objective is still unmet, and every tagged target is dead or
 * gone (the just-killed id counts as gone unconditionally — the event IS its death). Authored
 * (storyTag) bounties own their own failure branches and never void here. Pure over the
 * instance plus a liveness predicate, so tests pin it without the system.
 */
export function bountyTargetLost(m, killedId, isGone) {
  if (!m || m.status !== 'active' || m.type !== 'bounty_hunt') return false;
  if (m.storyTag) return false;
  const ids = Array.isArray(m.targetEntityIds) ? m.targetEntityIds : [];
  if (!ids.includes(killedId)) return false;
  const target = Math.max(1, m.objectiveTarget || 1);
  if ((m.objectiveProgress || 0) >= target) return false;
  const gone = typeof isGone === 'function' ? isGone : () => true;
  return ids.every((id) => id === killedId || gone(id));
}

/**
 * FB-068: is this kill-lane contract's objective dead under someone else's guns? Shared predicate
 * behind the non-player entity:killed lane. Bounty marks are named persons — dead is dead, so the
 * INF-067 check decides (multi-target nests can still be hunted after a rival takes one).
 * patrol_clear packs deliberately stay OUT: the spawn quota tops back up to the owed count from
 * vacant slots, so an external kill there costs the player time, never the contract — voiding
 * a still-winnable job would be the dishonest outcome. Physical objectives (core, tower, pods)
 * settle through the physical kill/destroy lanes, which own their own role checks.
 * Pure over the instance plus a liveness predicate.
 */
export function externalTargetLoss(m, killedId, isGone) {
  if (!m || m.status !== 'active' || m.storyTag) return false;
  const ids = Array.isArray(m.targetEntityIds) ? m.targetEntityIds : [];
  if (!ids.includes(killedId)) return false;
  if ((m.objectiveProgress || 0) >= Math.max(1, m.objectiveTarget || 1)) return false;
  if (m.type === 'bounty_hunt') return bountyTargetLost(m, killedId, isGone);
  return false;
}

/**
 * INF-066: partial-recovery settlement math. A successor that docks short of its full qty
 * settles once for what is actually aboard: proportional pay on the successor's own (already
 * halved) stake. Returns null when nothing is aboard — the caller keeps the legacy
 * "not carrying" path. Pure; the caller consumes via the cargo single-writer.
 */
export function mutationPartialSettlement(have, need, rewardCr) {
  const needQty = Math.max(1, Math.floor(Number(need) || 1));
  const haveQty = Math.max(0, Math.floor(Number(have) || 0));
  const deliverQty = Math.min(haveQty, needQty);
  if (deliverQty <= 0) return null;
  const partial = deliverQty < needQty;
  return {
    deliverQty,
    partial,
    payCr: Math.max(0, Math.round((Number(rewardCr) || 0) * deliverQty / needQty)),
  };
}

/**
 * NXB-028: a damaged/short freight delivery settles on the contract's recorded terms — the
 * accepted reward divided by the contracted units — never a live market price. Only units that
 * are actually deliverable count: loose cargo is limited by `sellableCargoQuantity` (sealed
 * siblings are not spendable), a sealed manifest by `releasableContractUnits` (only this
 * contract's own reservation). Returns null when nothing aboard can settle, so the caller keeps
 * the ordinary "not carrying" path.
 */
export function partialDeliverySettlement(m, state) {
  if (!m || m.status !== 'active' || m.type !== 'cargo_delivery' || !m.params || !m.params.cmdtyId) return null;
  if (m.storyTag === CONTRACT_47A_B0_TAG || m.storyTag === CONTRACT_47A_B1_TAG
    || m.storyTag === 'campaign47a:b1:alloy_run') return null;
  const tracked = m.preloadedCargo === true;
  const need = tracked
    ? Math.max(0, Math.floor(Number(m.params.sealedRemaining != null ? m.params.sealedRemaining : m.params.qty) || 0))
    : Math.max(1, Math.floor(Number(m.params.qty) || 1));
  if (need <= 0) return null;
  const have = tracked
    ? Math.max(0, Math.floor(Number(releasableContractUnits(state, m)) || 0))
    : Math.max(0, Math.floor(Number(sellableCargoQuantity(state, m.params.cmdtyId)) || 0));
  const deliverQty = Math.min(have, need);
  if (deliverQty <= 0 || deliverQty >= need) return null;
  return {
    needQty: need,
    deliverQty,
    shortfallUnits: need - deliverQty,
    payCr: Math.max(0, Math.round((Number(m.reward_cr) || 0) * deliverQty / need)),
    tracked,
  };
}
export const LONG_READ_RUMOR_EVENT = Object.freeze({
  news: 'news:headline',
  comms_intercept: 'comms:popup',
  bark: 'barkDirector:voice',
  mission: 'mission:accepted',
  campaign: 'story:beatAdvanced',
  loss_investigation: 'lossInvestigation:authoredRead',
  bar: 'uniqueWreck:rumorHeard',
});
// SF-149 — the Choir vigil rides the same set-piece event surface as long_read rather than a
// parallel lifecycle: `choir_long_night` IS the live-salvage verdict drive (complication +
// decision ready), and `choir_what_remains` is a disposition stage whose accept files the
// named outcome into the durable bearing — the mission then completes on the physical return
// visit, not on the filing itself.
export const SET_PIECE_RECOVERY_OBJECTIVES = new Set(['long_read_salvage', 'choir_long_night']);
export const SET_PIECE_DISPOSITION_OBJECTIVES = new Set(['long_read_fence', 'choir_what_remains']);
// Radius of the third-visit site return: standing inside the recovered site is the job.
export const CHOIR_RETURN_RADIUS_WU = 500;
export const CONTRACT_47A_B0_TAG = 'campaign47a:b0:recovery';
export const CONTRACT_47A_SAMPLE_ID = 'cmdty_47a_assay_sample';
export const CONTRACT_47A_B1_TAG = 'campaign47a:b1:honest_work';
export const CONTRACT_47A_B2_TAG = 'campaign47a:b2:elroy';
export const CONTRACT_47A_B3_TAG = 'campaign47a:b3:bigger_boat';

// SPEC2/03 B5. These are ordinary mission offers with one extra provenance tag so the
// first-hour rail can guarantee a legible three-loop choice without inventing a second contract
// lifecycle. Missions still owns generation, acceptance, targets, rewards, and receipts.
export const ONBOARDING_CHOICE_SOURCE = 'onboardingChoice';
// Provenance tag for offers inserted through postBoardOffer: posted authored work,
// not an epoch reroll — ensureBoard's refresh retains them like the other
// player-earned classes so a regen cannot swallow the row before acceptance.
export const POSTED_BOARD_SOURCE = 'postedBoardOffer';
export const ONBOARDING_CHOICE_LOOPS = Object.freeze([
  Object.freeze({
    type: 'bulk_trade', label: 'HAUL', maxRiskTier: 1, maxCollateralCr: 2000, maxRewardCr: 10000,
  }),
  Object.freeze({
    type: 'bounty_hunt', label: 'BOUNTY', maxRiskTier: 1, maxCollateralCr: 0, maxRewardCr: 10000,
  }),
  Object.freeze({
    type: 'recon_scan', label: 'SURVEY', maxRiskTier: 1, maxCollateralCr: 0, maxRewardCr: 10000,
  }),
]);

/** Record first dock for the corridor hierarchy. Idempotent; returns true on first mark. */
export function markCorridorFirstDock(state, stationId = null, simTime = 0) {
  if (!state || typeof state !== 'object') return false;
  state.ui = state.ui || {};
  if (state.ui.corridorFirstDocked === true) return false;
  state.ui.corridorFirstDocked = true;
  state.ui.corridorFirstDockAtS = Math.max(0, Number(simTime) || 0);
  if (stationId != null) state.ui.corridorFirstDockStationId = String(stationId);
  return true;
}

// The Cold Start contract itself pays nothing (payment withheld, status pending); the credits
// the dock posts are the beat-0 story grant (`story:cold_start`, missionStoryOps._advanceStory).
// Read the figure from that grant so the receipt and copy cannot drift from what actually lands.
export const CONTRACT_47A_REWARD_CR = Math.max(0, Math.round(Number(
  STORY_BEATS[0] && STORY_BEATS[0].reward && STORY_BEATS[0].reward.credits) || 0));
export const contract47aBalanceNote = (cr) =>
  `Contract pay withheld — status pending. ${Math.max(0, Math.round(Number(cr) || 0)).toLocaleString('en-US')} cr posted for balance.`;
// The opening assay binds a real world slot; only proven depletion can re-mark its field exposure.
export const CONTRACT_47A_B2_SCAN_RADIUS_WU = 1200;
export const CONTRACT_47A_B2_CUSTODY_REEL_WU = 60;

// Station size → tier number used for slot count (S=0,M=1,L=2).
export const SIZE_TIER = { S: 0, M: 1, L: 2 };

// Story branch → faction mapping (B4/B5 spec).
export const BRANCH_FACTION = Object.fromEntries(STORY_BRANCH_INTROS.map((intro) => [intro.branch, intro.factionId]));
export const BRANCH_INTRO_BY_FACTION = new Map(STORY_BRANCH_INTROS.map((intro) => [intro.factionId, intro]));
export const BRANCH_INTRO_BY_BRANCH = new Map(STORY_BRANCH_INTROS.map((intro) => [intro.branch, intro]));
export const HOME_FACTION = 'faction_scn'; // resolves STORY_BEATS B0 reward.rep.faction === 'home'

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const round = Math.round;

export function cargoFootprint(offer) {
  const p = offer && offer.params || {};
  if (p.mutationReroute) return 0;
  if (!p.cmdtyId || !(p.qty > 0)) return 0;
  const commodity = CMDTY_BY_ID.get(p.cmdtyId);
  const volPerU = commodity && commodity.volPerU > 0 ? commodity.volPerU : 1;
  return Math.floor(p.qty) * volPerU;
}

export function fmtCargoUnits(value) {
  return (Math.round(value * 10) / 10).toLocaleString('en-US');
}

export function signedRep(value) {
  const n = Math.round(Number(value) || 0);
  return (n > 0 ? '+' : '') + n;
}

export function factionShortName(factionId) {
  const fac = factionId ? FACTION_BY_ID.get(factionId) : null;
  return (fac && (fac.short || fac.name)) || 'this faction';
}

export function isStoryBranchIntroOffer(offer, state) {
  const intro = storyBranchIntroForOffer(offer);
  return !!(
    intro &&
    state && state.story && state.story.beatIndex === 4 &&
    (offer.storyTag === STORY_BRANCH_INTRO_TAG || offer.storyTag === 4)
  );
}

export function storyBranchIntroForOffer(offer) {
  if (!offer || !offer.factionId) return null;
  const intro = BRANCH_INTRO_BY_FACTION.get(offer.factionId);
  if (!intro) return null;
  if (offer.storyBranch && offer.storyBranch !== intro.branch) return null;
  return intro;
}

export function missionOfferMinRep(offer, state = null) {
  if (isStoryBranchIntroOffer(offer, state)) return STORY_BRANCH_INTRO_MIN_REP;
  const explicit = Number(offer && offer.minRep);
  if (Number.isFinite(explicit)) return Math.round(explicit);
  return missionMinRepForRisk(offer && offer.riskTier);
}

export function setPieceCauseOf(value) {
  return value && value.source === SET_PIECE_MISSION_SOURCE && value.cause
    && value.cause.chainId ? value.cause : null;
}

export function isFingerprintBoardSource(source) {
  return source === 'blackFlag' || source === 'poiBehavior'
    || source === 'mercyService' || source === 'wreckCourt'
    || source === SET_PIECE_MISSION_SOURCE
    || source === LANDMARK_QUEST_SOURCE
    // Each cargo-kill chain mints its own salvage offer — dedupe per chain, not per source, so
    // a second completed chain at the same station still boards its contract.
    || source === 'cargoKillChain'
    // BP-01.1: a wreck-communicator offer's identity is its stable salvage-point id — receipts
    // dedupe a completed contract on replay/re-entry while distinct points still board.
    || source === 'salvage'
    // Ecology desks carry stable per-mission ids and no cause — per-identity dedupe, not
    // one-row-per-source, so a site holding several contracts surfaces all of them.
    || source === 'ecology'
    || source === SET_PIECE_FOLLOW_ON_SOURCE;
}

/**
 * NXB-043 — a competing feedstock bid is TWO rows for ONE shortage: a rival-tagged starvation
 * row may board beside the other member of its pair (a different starving yard), while the
 * same yard can never double-post. Anything else keeps the one-row-per-source guard.
 */
export function isCompetingStarvedRow(offer) {
  return !!(offer && offer.source === 'economyContract' && offer.type === 'cargo_delivery'
    && offer.cause && offer.cause.tag === 'industry_starved' && offer.cause.rivalStationId);
}

export function isZeroPayLandmarkMission(mission, rewardCr) {
  return !!(mission
    && mission.source === LANDMARK_QUEST_SOURCE
    && mission.params && mission.params.landmarkProbe
    && rewardCr === 0);
}

export function setPieceEventFields(value, transition = null) {
  const cause = setPieceCauseOf(value);
  if (!cause) return {};
  const receipt = transition && transition.receipt || null;
  const nextStationIds = receipt && Array.isArray(receipt.nextStationIds)
    ? receipt.nextStationIds : [];
  return {
    chainId: cause.chainId,
    archetypeId: cause.archetypeId,
    startEpoch: cause.startEpoch,
    stageIndex: cause.stageIndex,
    stageId: cause.stageId || undefined,
    branchId: cause.branchId || null,
    attempt: cause.attempt || 0,
    house: receipt && receipt.house || cause.house || null,
    houseText: receipt && receipt.houseText || undefined,
    recoveryText: receipt && receipt.recoveryText || undefined,
    nextStationId: receipt && receipt.nextStationId || null,
    nextStationIds,
    wreckId: cause.wreckId || value.wreckId || null,
  };
}

export function setPieceUpfrontCost(offer, state = null) {
  const cause = setPieceCauseOf(offer);
  if (!cause || (cause.attempt | 0) > 0) return 0;
  if (cause.archetypeId === 'long_read' && cause.stageIndex === 0) {
    const wreckId = cause.wreckId || offer.wreckId || offer.params && offer.params.wreckId;
    const bearing = wreckId && state && state.player && state.player.uniqueWrecks
      && state.player.uniqueWrecks.bearings && state.player.uniqueWrecks.bearings[wreckId];
    if (bearing) return 0;
  }
  return Math.max(0, Math.round(Number(offer.upfrontCostCr) || 0));
}

export function missionObservesClauseEvent(mission, eventName) {
  return Array.isArray(mission && mission.clauses) && mission.clauses.some((clause) => (
    clause && clause.event === eventName
  ));
}

// Map-space distance between two sectors → world-unit-ish path length (deterministic, bounded).
// Sector map positions are small integers (±~11); scale to a sensible wu range and floor same-sector.
export function sectorDistanceWu(aSectorId, bSectorId) {
  if (!aSectorId || !bSectorId || aSectorId === bSectorId) return 600; // intra-sector hop
  const a = SECTOR_BY_ID.get(aSectorId), b = SECTOR_BY_ID.get(bSectorId);
  if (!a || !b || !a.position || !b.position) return 1800;
  const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
  return clamp(600 + Math.hypot(dx, dy) * 650, 600, 6000);
}

export function missionNavReason(m, station, sector) {
  const p = m && m.params || {};
  const commodity = p.cmdtyId && CMDTY_BY_ID.get(p.cmdtyId);
  const cargo = commodity ? commodity.name : 'cargo';
  const stationName = station && station.name || 'destination';
  const sectorName = sector && sector.name || 'target sector';
  const remaining = Math.max(0, (m.objectiveTarget || p.qty || 1) - (m.objectiveProgress || 0));
  const wreckName = p.wreckName || 'the marked wreck';
  if (p.frontierBarnRaisingVersion === 1) {
    const remainingModules = Math.max(0, FRONTIER_MODULES.length - Math.max(0, Number(m.objectiveProgress) || 0));
    return remainingModules > 0
      ? `Tow or push ${remainingModules} marked E-21 module${remainingModules === 1 ? '' : 's'} into the matching Io frame slots`
      : 'Hold the six snapped modules while the frame welders finish';
  }
  if (isSpineBreakOperation(m)) {
    const goal = SPINE_BREAK_CONFIG.recoupleGoal;
    const progress = Math.max(0, Math.min(goal, Number(m.objectiveProgress) || 0));
    return progress >= goal
      ? `Escort the re-coupled train to ${stationName}`
      : `Re-couple ${goal} loose containers (${progress}/${goal}), then escort the train to ${stationName}`;
  }
  if (p.setPieceObjective === 'long_read_rumor_survey') {
    if (p.rumorAlreadyKnown) return `Fix the known ${wreckName} bearing in ${sectorName}`;
    return p.rumorPurchased
      ? `Fix the purchased ${wreckName} bearing in ${sectorName}`
      : `Purchase the ${wreckName} rumor, then fix its bearing in ${sectorName}`;
  }
  if (p.setPieceObjective === 'long_read_salvage') {
    if (p.salvageDecisionReady && !p.complicationObserved) {
      return `Observe the ${wreckName} complication before confirming recovery`;
    }
    if (p.complicationObserved) return `Recover ${wreckName} to its disposition decision`;
    return `Reach ${wreckName}, survive its complication, and recover the wreck`;
  }
  if (p.setPieceObjective === 'long_read_fence') {
    const choice = p.wreckChoiceId === 'authority_handover' ? 'authority handover' : 'hardware claim';
    return `Confirm the ${choice} disposition for ${wreckName}`;
  }
  if (p.setPieceObjective === 'investigation_recover_box') {
    return `Salvage a wreck in ${sectorName} and recover its black box`;
  }
  if (m.storyTag === CONTRACT_47A_B0_TAG) {
    return p.sampleRecovered
      ? 'Deliver the 47-A sample to Helios Station'
      : 'Recover the 47-A sample from the marked rock';
  }
  if (m.storyTag === CONTRACT_47A_B1_TAG && m.type === 'cargo_delivery') {
    return p.cargoRecoveryNeeded
      ? 'Return to Helios for replacement cargo'
      : 'Deliver sealed alloys to Tycho; compare the manifest';
  }
  if (m.storyTag === CONTRACT_47A_B2_TAG && m.type === 'bounty_hunt') {
    return p.investigationStage === 'identified'
      ? 'Choose: fire to close the tag, or reel Elroy inside sixty'
      : 'Scan the marked vessel before acting';
  }
  if (m.type === 'recon_scan' && p.originSurveySample) {
    const sample = CMDTY_BY_ID.get(p.sampleCmdtyId);
    return p.surveyComplete
      ? `Mine ${p.sampleQty || 1}u ${sample ? sample.name : 'sample'} from the scanned seam`
      : `Scan an asteroid field in ${sectorName}`;
  }
  if (m.type === 'recon_scan' && p.landmarkProbe) {
    return `Fire one close scanner pulse at ${p.landmarkProbe.poiLabel || 'the Caved Shaft'}`;
  }
  if (m.type === 'recon_scan' && p.poiSignalFollowup) {
    return `Scan the ${plainFollowupPlace(p.poiSignalFollowup)} in ${sectorName}`;
  }
  if (isReportInRestitution(m)) return `Dock at ${stationName} to report in`;
  if (isShortageGateRepair(m)) return `Buy or salvage ${p.qty}u ${cargo}, then deliver to ${stationName}`;
  if (p.workingBattlefield) return workingBattlefieldObjective(m);
  switch (m.type) {
    case 'cargo_delivery': return `Deliver ${p.qty || ''}u ${cargo} to ${stationName}`.trim();
    case 'bulk_trade': return `Sell ${remaining || p.qty || ''}u ${cargo} at ${stationName}`.trim();
    case BULK_HAUL_TYPE: return `Tether-haul ${remaining || p.massU || ''}u bulk ore to ${stationName}`.trim();
    case 'mining_quota': return `Mine ${remaining || p.qty || ''}u ${cargo}`.trim();
    case 'salvage_retrieval': return `Recover ${p.qty || ''}u ${cargo} for ${stationName}`.trim();
    case 'smuggling_run':
      if (p.wakeHandoff) return 'Match the hauler and take the crate in its wake';
      return `Smuggle ${p.qty || ''}u ${cargo} to ${stationName}`.trim();
    case 'passenger_transport':
      if (p.quietPassage) return 'Escort passenger transport cold through Customs Gate checkpoint';
      return `Transport passenger to ${stationName}`;
    case 'escort': return `Escort convoy to ${stationName}`;
    case 'bounty_hunt': {
      const ram = starterRamSentence(p);
      if (ram) return ram;
      return p.markName
        ? `Find ${p.markName} near ${sectorName}`
        : `Find the bounty near ${sectorName}`;
    }
    case 'patrol_clear': return `Clear hostiles in ${sectorName}`;
    case 'recon_scan': return `Scan sites in ${sectorName}`;
    case 'tow_recovery': return `Tow the ${p.massU} t slag core to ${stationName}, or sling it into the yard`;
    case 'demolition': return `Knock down the marked tower in ${sectorName}`;
    case 'rescue_under_fire': return `Pull the life pods out of ${sectorName}`;
    case AUTHORED_SET_PIECE_TYPE: return m.title || `Finish the physical job in ${sectorName}`;
    default: return stationName || sectorName;
  }
}

export function plainFollowupPlace(follow) {
  if (follow && follow.targetType === 'wreck') return 'linked derelict';
  if (follow && follow.targetType === 'anomaly') return 'linked anomaly';
  return 'linked return';
}

export const B6_DEPLOYMENT_KINDS = new Set(['drone', 'trader', 'outpost']);

export function b6DeploymentPayload(payload) {
  // `asset:deployed` is an admission receipt: kind + identity + stable definition identity.
  // Automation supplies defId; commissioned claim outposts supply claimSpecId.
  if (!payload || !B6_DEPLOYMENT_KINDS.has(payload.kind) || payload.id == null) return null;
  const definitionId = payload.defId || payload.claimSpecId;
  if (typeof definitionId !== 'string' || !definitionId.trim()) return null;
  return payload;
}

// ── 47-A route classification (PQ-032.02) ────────────────────────────────────────
// The old bounty B2 stamped elroy_outcome; the live `rescue_under_fire` pod pull does
// not. A missing outcome is therefore NOT proof of a legacy save — classify only on
// positive marks each route actually writes:
//   'legacy' — explicit elroy_outcome_legacy, or no evidence of the embodied route at
//              all (pre-embodiment Continue saves). Keeps the old net-worth/rep endgame.
//   'pinned' — an outcome token exists (old-route resolve or a hand-set save) without the
//              legacy stamp: leftover stakes still pin B4's door and B6's program.
//   'live'   — no outcome, but durable authored-route evidence (embodied_route flag or
//              sidecar beat 1–3 step records — both written only by the real contracts).
export function campaign47aEmbodiedEvidence(state) {
  const story = state && state.story;
  const flags = (story && story.flags) || {};
  if (flags.embodied_route                       // stamped when authored B1–B3 complete
    || flags.pick_a_side_pending                 // live B4 door accepted, work pending
    || flags.empire_seed_pending_id != null      // live B6 drone awaiting its program
    || flags.empire_seed_asset_id != null        // live B6 seed bound
    || flags.empire_seed_complete                // live B6 settled
    || flags.deep_reach_asset_lost               // live B7 seed recovery in flight
    || flags.deep_reach_operation_complete       // live B7 operation already done
    || flags.deep_reach_variant) {
    return true;
  }
  // The sidecar's per-beat step log is save-durable. B1–B3 steps only land through the
  // authored campaign47a contracts; a legacy bounty B2 stamps elroy_outcome_legacy before
  // it records, so the flag check in campaign47aRouteKind still wins for those saves.
  const steps = story && story.campaign47a && story.campaign47a.stepProgress;
  if (steps && typeof steps === 'object') {
    for (const key of ['1', '2', '3']) {
      const bucket = steps[key];
      if (bucket && Array.isArray(bucket.completed) && bucket.completed.length) return true;
    }
  }
  return false;
}

/** The Book 2 register contract (`campaign47a:b2:elroy`) is the one live writer of
 * `elroy_outcome` that is not a legacy stamp. It records its `elroy` step in the sidecar
 * BEFORE it stamps the token, and a legacy bounty B2 stamps `elroy_outcome_legacy` instead —
 * so a token plus a beat-2 `elroy` step record is positive proof the token came from the
 * embodied register, not from a pinned old save. */
export function campaign47aRegisterResolved(state) {
  const steps = state && state.story && state.story.campaign47a && state.story.campaign47a.stepProgress;
  const bucket = steps && typeof steps === 'object' ? steps['2'] : null;
  return !!(bucket && Array.isArray(bucket.completed) && bucket.completed.includes('elroy'));
}

export function campaign47aRouteKind(state) {
  const flags = (state && state.story && state.story.flags) || {};
  if (flags.elroy_outcome_legacy) return 'legacy';
  // The live register stamps the token too; it must not pin Pick a Side to one door —
  // Beat 4 names all three and the player chooses (see campaign47aRegisterResolved).
  if (flags.elroy_outcome) return campaign47aRegisterResolved(state) ? 'live' : 'pinned';
  return campaign47aEmbodiedEvidence(state) ? 'live' : 'legacy';
}

/** The old-vocabulary token ('custody'|'force') the program/operation tables read.
 * Pinned and legacy saves keep their stamped token. The live route derives it from the door
 * the player actually took (patrol carries custody; traders and free read force) so a later
 * branch is never shadowed by the register's token; before a door exists the register's
 * token (if any) is the only signal there is. */
export function campaign47aOutcomeKey(state) {
  const flags = (state && state.story && state.story.flags) || {};
  const token = flags.elroy_outcome === 'custody' || flags.elroy_outcome === 'force' ? flags.elroy_outcome : null;
  const branch = state && state.story && state.story.branch;
  if (token && !(branch && campaign47aRouteKind(state) === 'live')) return token;
  return branch === 'patrol' ? 'custody' : 'force';
}

// ── Receipt helpers (module-scope, derived from shared mission tuning) ───────────────────────

export function normalizeMissionReceipts(value) {
  if (!Array.isArray(value)) return [];
  const receipts = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const outcome = String(raw.outcome || 'settled');
    const missionId = raw.missionId != null
      ? String(raw.missionId)
      : String(raw.id || '').split(':')[0];
    if (!missionId) continue;
    receipts.push({
      ...raw,
      id: raw.id || missionId + ':' + outcome,
      missionId,
      outcome,
    });
    if (receipts.length >= MISSION_RECEIPT_LIMIT) break;
  }
  return receipts;
}

export function setPieceEpochFrom(value, archetypeId, chainId) {
  if (Number.isFinite(Number(value && value.startEpoch))) {
    return Math.max(0, Math.trunc(Number(value.startEpoch)));
  }
  const prefix = `sp1_${archetypeId}_`;
  if (!String(chainId || '').startsWith(prefix)) return null;
  const suffix = String(chainId).slice(prefix.length);
  const separator = suffix.indexOf('_');
  const parsed = Number(separator >= 0 ? suffix.slice(0, separator) : suffix);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

/**
 * Compact durable identity for the latest settled chain per authored archetype. This is not a run
 * object: boards/active missions/causes still own progression. It only survives the independent
 * ten-row presentation receipt cap so ensureBoard cannot resurrect an already-settled epoch.
 */
export function normalizeSetPieceSettlements(value, receipts = []) {
  const known = new Set((SET_PIECE_MISSIONS || []).map((definition) => definition && definition.id).filter(Boolean));
  const out = {};
  const consider = (archetypeId, raw) => {
    if (!known.has(archetypeId) || !raw || typeof raw !== 'object') return;
    const chainId = typeof raw.chainId === 'string' ? raw.chainId : '';
    if (!chainId) return;
    const startEpoch = setPieceEpochFrom(raw, archetypeId, chainId);
    if (startEpoch == null) return;
    const candidate = {
      chainId,
      startEpoch,
      stageIndex: Number.isFinite(Number(raw.stageIndex))
        ? Math.max(0, Math.trunc(Number(raw.stageIndex))) : 0,
      outcome: String(raw.outcome || 'settled'),
      settledAtS: Math.max(0, Number(raw.settledAtS != null ? raw.settledAtS : raw.at_s) || 0),
    };
    const current = out[archetypeId];
    if (!current || candidate.startEpoch > current.startEpoch
      || (candidate.startEpoch === current.startEpoch && candidate.stageIndex > current.stageIndex)
      || (candidate.startEpoch === current.startEpoch && candidate.stageIndex === current.stageIndex
        && candidate.settledAtS >= current.settledAtS)) {
      out[archetypeId] = candidate;
    }
  };
  if (value && typeof value === 'object') {
    for (const [archetypeId, raw] of Object.entries(value)) consider(archetypeId, raw);
  }
  // Migration for older saves: a surviving canonical receipt carries enough seeded identity to
  // construct the durable marker. New settlements no longer depend on that receipt remaining.
  for (const receipt of Array.isArray(receipts) ? receipts : []) {
    consider(receipt && receipt.archetypeId, receipt);
  }
  return out;
}

export const CLEAN_PHYSICAL_RELEASE = new Set(['clean', 'razor']);

export function physicalRoleOf(entity) {
  return entity && entity.data && entity.data.physicalRole || null;
}

/**
 * Claim-stake salvage predicates. The OFFER-level gate decides `needsTargets` before
 * instance creation (story/site fields live on the offer, not in params); the MISSION-level
 * gate drives the spawn/steer/listener paths on the live instance. Both refuse every salvage
 * row that already owns a physical site — authored set pieces, wreck-communicator offers,
 * POI follow-ups, and the mutation-recovery pocket all keep their own machinery.
 */
export function contractClaimSiteOffer(offer) {
  if (!offer || offer.type !== 'salvage_retrieval') return false;
  if (offer.storyTag || offer.storyContractId || offer.wreckId || offer.campaign47aBeat != null) return false;
  const p = offer.params;
  if (!p || !p.cmdtyId) return false;
  if (p.setPieceObjective || p.salvagePointId || p.survivorPodId || p.wreckMissionId
    || p.wreckPos || p.poiSignalFollowup) return false;
  return true;
}

export function contractClaimSiteMission(m) {
  if (!m || m.type !== 'salvage_retrieval' || m.status !== 'active') return false;
  if (m.storyTag || m.storyContractId || m.wreckId || isMutationRecovery(m)) return false;
  const p = m.params;
  if (!p || !p.cmdtyId) return false;
  if (p.setPieceObjective || p.salvagePointId || p.survivorPodId || p.wreckMissionId
    || p.wreckPos || p.poiSignalFollowup) return false;
  return true;
}

/** Whole units still inside a salvagePool map (the shared wreck/payload drain shape). */
export function salvagePoolUnits(pool) {
  if (!pool || typeof pool !== 'object') return 0;
  let total = 0;
  for (const id of Object.keys(pool)) total += Math.max(0, Math.floor(Number(pool[id]) || 0));
  return total;
}

/** Sanctioned passive-ship steer: write the flight intent (claim-beacon pattern — an
 *  unrostered ship is driven nowhere else). Pure geometry + simTime, no allocation. */
export function steerIntentToward(e, tx, tz, stop) {
  const data = e.data || (e.data = {});
  const intent = data.intent || (data.intent = {});
  const dx = tx - e.pos.x, dz = tz - e.pos.z;
  const d2 = dx * dx + dz * dz;
  const stopR = stop || 40;
  if (d2 <= stopR * stopR) { intent.moveZ = 0; intent.moveX = 0; return; }
  const len = Math.sqrt(d2) || 1;
  const ux = dx / len, uz = dz / len;
  const cf = Math.cos(e.rot || 0), sf = Math.sin(e.rot || 0);
  intent.moveZ = cf * ux + sf * uz;
  intent.moveX = -sf * ux + cf * uz;
  intent.aimAngle = Math.atan2(dz, dx);
  intent.fire = false;
  intent.fireGroup = null;
}

export function missionHostileSpawnPos(state, origin, rng) {
  const center = origin || { x: 0, z: 0 };
  for (let attempt = 0; attempt < MISSION_HOSTILE_SPAWN_ATTEMPTS; attempt++) {
    const ang = rng() * Math.PI * 2;
    const r = MISSION_HOSTILE_SPAWN_MIN_WU + rng() * (MISSION_HOSTILE_SPAWN_MAX_WU - MISSION_HOSTILE_SPAWN_MIN_WU);
    const pos = { x: center.x + Math.cos(ang) * r, z: center.z + Math.sin(ang) * r };
    if (outsideMissionPortSafety(state, pos)) return pos;
  }
  return null;
}

export function missionTargetSlotOf(entity, missionId) {
  const data = entity && entity.data;
  if (!data) return null;
  const explicit = Number(data.missionTargetSlot);
  if (Number.isInteger(explicit) && explicit >= 0) return explicit;
  const identity = typeof data.identityKey === 'string' ? data.identityKey : '';
  const prefix = `mission:${missionId}:`;
  if (!identity.startsWith(prefix)) return null;
  const tail = identity.slice(prefix.length);
  if (!/^\d+$/.test(tail)) return null;
  const parsed = Number(tail);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function completedMissionTargetSlots(mission) {
  const slots = new Set();
  for (const raw of Array.isArray(mission && mission.completedTargetSlots)
    ? mission.completedTargetSlots : []) {
    const slot = Number(raw);
    if (Number.isInteger(slot) && slot >= 0) slots.add(slot);
  }
  return slots;
}

export function lowestVacantSlot(occupied) {
  let slot = 0;
  while (occupied.has(slot)) slot++;
  return slot;
}

/** A point on the Ashfall cache approach, in galactic coordinates. `along` is world units on local +X. */
export function ashfallCacheApproachPos(mission, along) {
  if (!mission || mission.destSectorId !== 'sector_ashfall_reach' || mission.destStationId !== 'station_ashcache') {
    return null;
  }
  const anchors = SECTOR_ANCHORS.sector_ashfall_reach;
  const station = anchors && Array.isArray(anchors.stations)
    ? anchors.stations.find((row) => row && row.id === 'station_ashcache')
    : null;
  if (!station || !station.pos) return null;
  return sectorLocalToGlobalForSector({
    x: station.pos.x + along,
    z: station.pos.z,
  }, 'sector_ashfall_reach');
}

/** Deep Reach blockade: the jam hulk is the Ashfall cache door, not the Tethys ring. */
export function ashfallBlockadeDoorPos(missions, mission, definition) {
  if (!mission || !definition || definition.facilityRole !== 'jam_hulk') return null;
  const approach = ashfallCacheApproachPos(mission, 140);
  if (!approach) return null;
  const live = missions && typeof missions._liveStation === 'function'
    ? missions._liveStation(mission.destStationId)
    : null;
  if (live && live.pos && Number.isFinite(live.pos.x) && Number.isFinite(live.pos.z)) {
    return { x: live.pos.x + 140, z: live.pos.z };
  }
  return approach;
}

export function stableEntityId(id) {
  return `${typeof id}:${String(id)}`;
}

/** Place an authored target inside its named sector zone so the ordinary entity:killed event can
 * create a real aftermathWrecks marker. Zone centers are sector-local; live entities are global. */
export function missionStoryTargetSpawnPos(mission, target, rng) {
  const sectorId = mission && mission.destSectorId;
  const anchorId = target && target.anchorId;
  const anchors = sectorId && SECTOR_ANCHORS[sectorId];
  const anchor = anchorId && anchors
    ? ['stations', 'gates', 'fields', 'pois']
      .flatMap((key) => Array.isArray(anchors[key]) ? anchors[key] : [])
      .find((candidate) => candidate && (candidate.id === anchorId || candidate.to === anchorId))
    : null;
  const anchorCenter = anchor && (anchor.pos || anchor.center);
  if (anchorCenter) {
    const angle = rng() * Math.PI * 2;
    const authoredRadius = Number(target.anchorRadius);
    const maxRadius = Number.isFinite(authoredRadius)
      ? Math.max(0, Math.min(320, authoredRadius))
      : 120;
    // An authored floor keeps the scatter off solid bodies (gate proxies post a mark beside
    // the transit ring, never inside it).
    const authoredMin = Number(target.anchorMinRadius);
    const minRadius = Number.isFinite(authoredMin) ? Math.max(0, Math.min(maxRadius, authoredMin)) : 0;
    const radius = minRadius + Math.sqrt(rng()) * (maxRadius - minRadius);
    return sectorLocalToGlobalForSector({
      x: anchorCenter.x + Math.cos(angle) * radius,
      z: anchorCenter.z + Math.sin(angle) * radius,
    }, sectorId);
  }
  const zoneId = target && target.zoneId;
  const zone = zonesForSector(sectorId).find((candidate) => candidate && candidate.id === zoneId);
  if (!zone || !zone.center) return null;
  const angle = rng() * Math.PI * 2;
  const radius = Math.sqrt(rng()) * Math.max(40, Math.min(240, (zone.radius || 400) * 0.35));
  const local = {
    x: zone.center.x + Math.cos(angle) * radius,
    z: zone.center.z + Math.sin(angle) * radius,
  };
  return sectorLocalToGlobalForSector(local, sectorId);
}

export function outsideMissionPortSafety(state, pos) {
  const active = state && state.world && state.world.activeSector || {};
  for (const station of active.stations || []) {
    if (!station || !station.pos) continue;
    const dockRadius = Number(station.data && station.data.dockRadius);
    const radius = Math.max(MISSION_PORT_SAFE_RADIUS_WU, Number.isFinite(dockRadius) ? dockRadius + 900 : 0);
    if (distSq(pos, station.pos) < radius * radius) return false;
  }
  for (const gate of active.gates || []) {
    if (gate && gate.pos && distSq(pos, gate.pos) < 1000 * 1000) return false;
  }
  return true;
}

/** True when the authored cast placement is comfortable: port-safe and clear of live bodies. */
export function capitalBossPlacementClear(state, pos, radius) {
  if (!outsideMissionPortSafety(state, pos)) return false;
  const player = state.entities && state.entities.get(state.playerId);
  if (player && player.alive !== false && player.pos) {
    const pad = radius + (player.radius || 10) + 150;
    if (distSq(pos, player.pos) < pad * pad) return false;
  }
  const index = state.entityIndex;
  const list = index && index.__spacefaceEntityIndexV1 === true && index.ready === true
    && Array.isArray(index.collidables)
    ? index.collidables
    : state.entityList;
  if (Array.isArray(list)) {
    for (const other of list) {
      if (!other || other.alive === false || !other.pos || other.collides === false) continue;
      const pad = radius + (other.radius || 10) + 60;
      if (distSq(pos, other.pos) < pad * pad) return false;
    }
  }
  return true;
}

export const CAPITAL_BOSS_PLACEMENT_ATTEMPTS = 10;

/**
 * Authored capital offsets are initial-layout DESIRES. When one would overlap the player, another
 * live body or a protected area, spin the spawn deterministically around the desired point (seeded
 * from the durable actor key — never Math.random) until it is comfortable. Returns null only when
 * the hard safety floor (port safety + player clearance) cannot be met anywhere tried: a genuinely
 * denied spawn is retryable and issues nothing.
 */
export function capitalBossAdjustedPlacement(state, pos, radius, jitterKey) {
  if (capitalBossPlacementClear(state, pos, radius)) return pos;
  const baseSeed = hash32(state && state.meta && state.meta.seed || 1, String(jitterKey || 'capital-boss'));
  for (let attempt = 0; attempt < CAPITAL_BOSS_PLACEMENT_ATTEMPTS; attempt++) {
    const spin = ((baseSeed ^ hash32(state && state.meta && state.meta.seed || 1, attempt + 1)) >>> 0)
      / 4294967296 * Math.PI * 2;
    const dist = 220 + (((baseSeed >>> 8) ^ hash32(state && state.meta && state.meta.seed || 1, attempt + 7)) >>> 0) % 940;
    const candidate = { x: pos.x + Math.cos(spin) * dist, z: pos.z + Math.sin(spin) * dist };
    if (capitalBossPlacementClear(state, candidate, radius)) return candidate;
  }
  // Hard floor only: never on top of the player, never inside a protected area.
  if (!outsideMissionPortSafety(state, pos)) return null;
  const player = state.entities && state.entities.get(state.playerId);
  if (player && player.alive !== false && player.pos) {
    const pad = radius + (player.radius || 10) + 40;
    if (distSq(pos, player.pos) < pad * pad) return null;
  }
  return pos;
}

export function distSq(a, b) {
  const dx = (a && a.x || 0) - (b && b.x || 0);
  const dz = (a && a.z || 0) - (b && b.z || 0);
  return dx * dx + dz * dz;
}

// Story-beat trigger kind (first-X model). B0 is ordered multi-step (mine then dock) via sidecar.
// Gate-only beats (4/5/7) use branch accept / chain count / credit-rep gates.
export const BEAT_TRIGGER = {
  0: null,             // ordered mine → dock (sidecar isBeatStepsComplete gate)
  1: 'trade',          // first sell
  2: 'kill',           // first player kill
  3: 'ship_purchased', // buy any ship (T2 gate is a soft hint)
  4: null,             // branch set on accept (handled in _maybeSetBranch)
  5: null,             // branch chain (handled in _advanceStoryChain)
  6: 'asset_deployed', // first passive asset
  7: null,             // net-worth gate (handled in _checkStoryGates)
};

/** Map missions story kinds → campaign47a step signals (observe/gate only). */
export const STORY_SIGNAL_BY_KIND = {
  mine: 'mining:yield',
  trade: 'economy:tradeCompleted',
  kill: 'entity:killed',
  ship_purchased: 'ship:purchased',
  asset_deployed: 'asset:deployed',
  dock: 'dock:docked',
};

// Per-branch B5 chain requirements (spec B5).
export const BRANCH_CHAIN_TYPE = { traders: 'bulk_trade', patrol: 'patrol_clear', free: 'smuggling_run' };
// Player-facing name of one Proving Ground leg per branch (the internal branch id is not copy).
export const BRANCH_CHAIN_LEG_LABEL = { traders: 'Meridian trade', patrol: 'Concord patrol', free: 'Free Captain smuggling' };
export const BRANCH_CHAIN_COUNT = { traders: 3, patrol: 2, free: 2 };

// Direction hints shown when a beat becomes current (Captain's Log north star).
export const BEAT_HINT = {
  0: 'Cold Start: Contract 47-A — sample the 12.4t mass discrepancy, then dock at Helios. Payment is withheld; status pending.',
  1: 'Honest Work: the book posts the alloy run first — the Scale 4 weigh and the furnace detail follow.',
  2: 'First Blood: dock at Tethys Junction and accept Cinder marks from the mission board. Then fly to Charon; the Compost Run, the Nest, and the register follow in order.',
  3: 'Bigger Boat: take delivery of VARIANCE ADJUSTMENT at Slate\u2019s berth — the maw and the Foreman follow.',
  4: 'Pick a Side: accept an intro contract, then run the door\u2019s operation on the board.',
  5: 'Proving Ground: complete your faction\'s mission chain.',
  6: 'Empire Seed: deploy your first passive asset (drone, trader, or outpost).',
  7: 'The Deep Reach: run your side\u2019s operation — the blockade, the siege, or the evidence tow — or bring the ledger, then settle at the Ash Cache desk.',
};

export function storyBeatTitle(beat) {
  if (!beat) return 'Story Objective';
  const hint = BEAT_HINT[beat.beat] || '';
  const colon = hint.indexOf(':');
  // W1 Journey framing: the act is a separate field. The label carries only the beat's own
  // actionable words, so a tracker/popup never hides the act inside a truncated string and a
  // beat-specific `reason` never overwrites it.
  return colon > 0 ? hint.slice(0, colon) : String(beat.id || `Beat ${beat.beat}`)
    .replace(/^b\d+_?/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function hasActiveMissionEntityIndex(state) {
  const index = state && state.entityIndex;
  return !!(index && index.__spacefaceEntityIndexV1);
}

export function missionIndexedEntities(state, primaryKey, secondaryKey) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    return index[primaryKey] || index[secondaryKey] || [];
  }
  return (state && state.entityList) || [];
}

export function sameNavWaypoint(a, b) {
  if (!a || !b) return !a && !b;
  if ((a.kind || null) !== (b.kind || null)) return false;
  if ((a.missionId || null) !== (b.missionId || null)) return false;
  if ((a.targetEntityId || null) !== (b.targetEntityId || null)) return false;
  if ((a.presentationEntityId || null) !== (b.presentationEntityId || null)) return false;
  if ((a.storyBeat ?? null) !== (b.storyBeat ?? null)) return false;
  if ((a.stationId || null) !== (b.stationId || null)) return false;
  if ((a.sectorId || null) !== (b.sectorId || null)) return false;
  if ((a.label || '') !== (b.label || '')) return false;
  if ((a.reason || '') !== (b.reason || '')) return false;
  // The identity bind is what throw, tether, and the chart resolve; a bind that appears or
  // changes under an unchanged id/position is a different waypoint and must be published.
  if (!sameStableBind(a.stable, b.stable)) return false;
  return sameNavPos(a.pos, b.pos);
}

export function sameStableBind(a, b) {
  if (!a || !b) return !a && !b;
  if ((a.key ?? null) !== (b.key ?? null)) return false;
  if ((a.entityId ?? null) !== (b.entityId ?? null)) return false;
  if (!!a.durable !== !!b.durable) return false;
  const sa = a.stamp || null;
  const sb = b.stamp || null;
  if (!sa || !sb) return !sa && !sb;
  const keys = new Set([...Object.keys(sa), ...Object.keys(sb)]);
  for (const key of keys) if ((sa[key] ?? null) !== (sb[key] ?? null)) return false;
  return true;
}

export function sameNavPos(a, b) {
  if (!a || !b) return !a && !b;
  return Math.abs((a.x || 0) - (b.x || 0)) < 0.05
    && Math.abs((a.z || 0) - (b.z || 0)) < 0.05;
}

// Wrap an angle to (-π, π] for the smallest turn delta (escortee steering; no THREE dependency).
export function wrapAngleLocal(a) {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

// ── local PRNG fallback (only if core helpers absent, e.g. isolated unit test) ────────────────
export function mulberryLocal(a) {
  a >>>= 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
