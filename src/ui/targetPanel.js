import { pallasSeamInfoLine } from '../data/pallasSeamWork.js';
import { targetFrameHtml } from './views/targetFrame.js';
import { commodityDisplayName } from './commodityNames.js';
// Target panel (ARCHITECTURE §5, spec "Target panel") — the selected-target readout above
// the radar. Populated from state.player.targetId → entity lookup. Shows name, faction tag,
// three segmented bars, distance (wu) and closing speed. Hidden when there is neither a live
// selection nor a live engaged contact.
//
// TWO TARGETS, ONE PANEL — read before "simplifying" the subject resolution below.
//
// state.player.targetId is the SELECTION: what Tab locked, what the radar highlights, and what
// aims a Massline throw. state.player.gunTargetId is the ENGAGED contact: a transient per-tick
// mirror written by src/systems/weapons.js:181-188 of what the guns are actually shooting at.
// They differ exactly when the Massline has claimed fire control — you Tab-lock ship A, latch
// hostile B, and the battery gimbals onto B while the panel used to keep naming A. That silent
// divergence is the defect this panel now reports. The two are NOT conflated: the selection stays
// the panel's subject, and the engaged contact gets its own row.
//
// gunTargetId is written only under massline2Flag('fireControl') and is never serialized, so every
// read here treats an absent key as "no divergence" rather than as an error.
//
// Cheap per-frame path: bar widths via transform:scaleX, text via textContent. No DOM churn.

import { FACTION_META } from '../data/factions.js';
import { SHIPS } from '../data/ships.js';
import { DAMAGE_MODEL } from '../data/combatDefs.js';
import { ceresDisabledHaulerTruth, livingWorkStatusText } from '../data/contactHail.js';
import { contactThreatTier, contactStateWord, isHostileToPlayer, isWreckLike, wreckScanned, SCANNER_CONTACT_RANGE } from '../systems/scanner.js';
import { LANE_GIMMICK_LABELS } from '../data/laneContacts.js';
import { interactionClassLine, interactionDisplayName, interactionProfileForEntity, presentationStatusWord } from '../data/entityInteractionProfiles.js';
import { resolveWorldPresentationEntity } from '../world/presentationSources.js';
import { isBeamTargetEligible, beamRangeFor } from '../systems/mining.js';
import { initialMouseToolLane, resolveActionLabel } from '../systems/input.js';
import { finiteWholePickupAmount } from '../core/pickupAcceptance.js';
import { oreTableByWeight, oreTableForAsteroidType } from '../data/mining.js';
import { listSelectableComponents } from '../systems/interactionDescriptors.js';
import { glyphSvg } from './glyphs.js';
import { COMMODITIES } from '../data/commodities.js';
import { commodityCatalogLegality, restrictedSalvageForWreck } from '../data/salvageLegality.js';
import { richSeamOpportunityForEntity } from '../systems/fieldDepletion.js';
import { missionOwnsReward, runOwnsReward } from '../combat/rewardEligibility.js';
import { createTargetTruth, projectTargetTruth } from '../combat/targetTruth.js';
import { exploitableStatusChips, isSurrenderedContact } from '../combat/contactClassifier.js';
import { IDENTITY_WING_ROLE } from '../ai/squad.js';
import { ANVIL_ORCHARD } from '../data/anvilOrchard.js';
import { isOrchardFrame } from '../data/anvilOrchardIdentity.js';
import { stableEntityKey } from '../data/interactionDescriptorCatalog.js';
import { occupantGenerationOf } from '../core/entity.js';
import { targetConditionReadout } from './targetCondition.js';
import { BINDINGS } from './bindings.js';
import { SECTORS, stationContactServices } from '../data/sectors.js';
import { PASSENGER_LINER_ITINERARY_KIND } from '../data/laneContacts.js';
import { SECTOR_ZONES } from '../data/sectorZones.js';
import { stationServiceLabel } from './station/stationHubModel.js';
import { faunaPileFact, faunaSpeciesById, faunaTollFact } from '../data/alienFauna.js';
import { fittedModuleDefs } from '../core/fittedModules.js';

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((commodity) => [commodity.id, commodity]));
const STATION_BY_ID = new Map(SECTORS.flatMap((sector) => sector.stations || []).map((s) => [s.id, s]));
const ZONE_BY_ID = new Map(Object.values(SECTOR_ZONES).flat().map((zone) => [zone.id, zone]));
const CATALOG_IDS = new Set([...SHIP_BY_ID.keys(), ...STATION_BY_ID.keys(), ...ZONE_BY_ID.keys(),
  ...COMMODITY_BY_ID.keys(), ...SECTORS.map((sector) => sector.id)]);

// Reject identity fields masquerading as names, without rewriting authored callsigns.
function readableIdentity(value, entity = null) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const data = entity?.data || {};
  const ids = [entity?.id, data.defId, data.stationId, data.commodityId, data.typeId, data.worldRecordId];
  if (ids.some((id) => id != null && String(id) === text) || CATALOG_IDS.has(text)
    || /^(?:ship|station|sector|zone|cmdty|faction|wpn|mod|mission|squad|sq|npc|entity)[_:]/i.test(text)
    || /^(?:squad|sq|npc|entity)[-_:]/i.test(text)
    || /^\d+$/.test(text) || /[a-f0-9]{12,}/i.test(text)) return null;
  return text;
}

// Damage triangle (BP-02): the player-facing E/K/X families mapped to the kernel's damage channels
// (weights transcribed from scalarHitToDamagePacket in src/combat/damage.js — keep in sync). The panel
// shows how effective each family is against the target's CURRENT outermost layer (shield→armor→hull),
// so the player can read "shoot energy at that shield, kinetic once it's down" at a glance.
const FAMILY_CHANNELS = {
  energy:    { thermal: 0.72, ion: 0.28 },
  kinetic:   { kinetic: 1.0 },
  explosive: { kinetic: 0.65, thermal: 0.35 },
};
const TRIANGLE_REF = 1.35; // multiplier that maps to a full bar

function tierPips(tier) {
  let s = '';
  for (let i = 0; i < 3; i++) s += i < tier ? '▰' : '▱';
  return s;
}

function outerLayerMultipliers(t) {
  if (t.shieldMax > 0 && t.shield > 0) return { layer: 'shield', mult: DAMAGE_MODEL.shieldMultipliers };
  if (t.armorMax > 0 && t.armorHp > 0) return { layer: 'armor', mult: DAMAGE_MODEL.armorMultipliers };
  return { layer: 'hull', mult: DAMAGE_MODEL.hullMultipliers };
}

function familyEffectiveness(channelMult, weights) {
  let sum = 0;
  for (const ch in weights) sum += weights[ch] * (Number.isFinite(channelMult[ch]) ? channelMult[ch] : 1);
  return sum;
}

const ROLE_LABEL = {
  starter: 'Starter', mining: 'Miner', fighter: 'Fighter', freighter: 'Freighter',
  multirole: 'Multirole', interceptor: 'Interceptor', mining_barge: 'Mining Barge',
  corvette: 'Corvette', heavy_hauler: 'Heavy Hauler', explorer: 'Explorer',
  gunship: 'Gunship', battlecruiser: 'Battlecruiser', flagship: 'Flagship',
  // Ambient traffic roles (traffic.js TRAFFIC_ROLES) — short, scannable.
  hauler: 'Hauler', courier: 'Courier', miner: 'Miner', patrol: 'Patrol',
  escort: 'Escort', smuggler: 'Smuggler', pirate: 'Raider', rescue: 'Rescue',
  tanker: 'Tanker', prospector: 'Prospector', sweeper: 'Sweeper', tug: 'Tug',
  shuttle: 'Shuttle', surveyor: 'Survey', salvor: 'Salvor', tender: 'Tender',
  ore_carrier: 'Ore Barge', express: 'Liner', customs: 'Customs',
};

const GIMMICK_LABELS = {
  'tether-cutter': 'MASSLINE CUTTER',
  'tether_cutter': 'MASSLINE CUTTER',
  'massline-cutter': 'MASSLINE CUTTER',
  'massline_cutter': 'MASSLINE CUTTER',
  'pd-screen': 'PD SCREEN',
  'pd_screen': 'PD SCREEN',
  'ram-plate': 'RAM-PLATE',
  'ram_plate': 'RAM-PLATE',
  sniper: 'SNIPER',
  rammer: 'RAMMER',
  screen: 'SCREEN',
  ...LANE_GIMMICK_LABELS,
  // Ace specialty tags (namedAces.js) — each names the combat problem the hull poses.
  'toll-lancer': 'TOLL LANCER',
  toll_lancer: 'TOLL LANCER',
  'swarm-screen': 'SWARM SCREEN',
  swarm_screen: 'SWARM SCREEN',
  'wake-mines': 'WAKE MINES',
  wake_mines: 'WAKE MINES',
  'pd-curtain': 'PD CURTAIN',
  pd_curtain: 'PD CURTAIN',
  'shield-turtle': 'SHIELD TURTLE',
  shield_turtle: 'SHIELD TURTLE',
  'lane-anchor': 'LANE ANCHOR',
  lane_anchor: 'LANE ANCHOR',
  'belt-claimer': 'BELT CLAIMER',
  belt_claimer: 'BELT CLAIMER',
  'debt-collector': 'DEBT COLLECTOR',
  debt_collector: 'DEBT COLLECTOR',
  duelist: 'DUELIST',
  'masked-disengager': 'MASKED DISENGAGER',
  masked_disengager: 'MASKED DISENGAGER',
  'salvage-surgeon': 'SALVAGE SURGEON',
  salvage_surgeon: 'SALVAGE SURGEON',
  'sensor-ghost': 'SENSOR GHOST',
  sensor_ghost: 'SENSOR GHOST',
  'slash-and-run': 'SLASH AND RUN',
  slash_and_run: 'SLASH AND RUN',
  'tether-scrapline': 'TETHER SCRAPLINE',
  tether_scrapline: 'TETHER SCRAPLINE',
  // The nemesis rival's tag: it watches, it misjudges, it comes back.
  'fallible-observer': 'FALLIBLE OBSERVER',
  fallible_observer: 'FALLIBLE OBSERVER',
};

function getGimmickLabel(gimmick) {
  if (!gimmick) return '';
  const normalized = String(gimmick).toLowerCase().replace(/_/g, '-');
  return GIMMICK_LABELS[normalized] || GIMMICK_LABELS[String(gimmick).toLowerCase()]
    || String(gimmick).replace(/_/g, ' ').toUpperCase();
}

export function targetDisplayName(e, { concealWreck = false } = {}) {
  if (!e) return '—';
  // A broadcast callsign is already public. Scan-only identity stays concealed until resolved —
  // on every surface, not just the roster that opts in (wreck-like covers fx dressing and
  // set-piece props, not only literal type:'wreck').
  if (concealWreck || (isWreckLike(e) && !wreckScanned(e))) return readableIdentity(e.data?.callsign, e) || 'Derelict';
  if (e.type === 'ship') {
    const d = e.data || {};
    const ai = d.ai || {};
    // Named/gimmick-readable identity first (lane contacts, bosses, callsigns) — never portraits.
    const named = [d.name, ai.name, d.callsign, d.scanLabel, d.trafficLabel]
      .map((value) => readableIdentity(value, e)).find(Boolean);
    if (named) return named;
    const def = d.defId ? SHIP_BY_ID.get(d.defId) : null;
    return (def && def.name) || 'Unidentified';
  }
  if (e.type === 'station') {
    const d = e.data || {};
    return readableIdentity(d.name, e) || readableIdentity(d.stationName, e)
      || STATION_BY_ID.get(d.stationId)?.name || (d.isGate ? 'Jump Gate' : 'Station');
  }
  if (e.type === 'asteroid' || e.type === 'wreck') return interactionDisplayName(e);
  if (e.type === 'drone') return readableIdentity(e.data?.callsign, e)
    || readableIdentity(e.data?.name, e) || 'Unidentified';
  return interactionDisplayName(e);
}

export function targetInteractionClass(e) {
  const interaction = interactionProfileForEntity(e);
  if (interaction.kind === 'asteroid') return asteroidClassLine(e);
  return interactionClassLine(e);
}

/**
 * The lock's CLASS line used to read "Mineable Asteroid" - the verb, restated, next to a name
 * that already said "Silicate Asteroid". The information a stranger actually wants is inside the
 * rock, and the type's own ore table has always had it. The class line now reports the yield mix
 * in the one chart language, heaviest first, derived from that table rather than hand-written so
 * it cannot drift from what mining will actually release.
 */
function asteroidClassLine(e) {
  const mix = oreTableByWeight(oreTableForAsteroidType(e.data && e.data.typeId));
  if (!mix.length) return 'Mineable Asteroid';
  const yields = mix.map((row) => {
    const commodity = COMMODITY_BY_ID.get(row.commodityId);
    return (commodity && commodity.name) || row.commodityId;
  });
  return `Mineable · ${yields.join(' / ')}`;
}

export function richSeamTargetReadout(target, state) {
  if (!target) return null;
  const data = target.data || {};
  if (target.type === 'asteroid') {
    const opportunity = richSeamOpportunityForEntity(state, target);
    if (!opportunity) return null;
    if (opportunity.state === 'open') {
      // A calved re-arm (attempt 1) names itself, so the player can tell why this window pays
      // differently from the strike's.
      const seamLabel = opportunity.attempt === 1 ? 'FRESH SEAM' : 'RICH SEAM';
      return Object.freeze({
        state: 'open',
        text: opportunity.reservationId
          ? `${seamLabel} · ALREADY CLAIMED · +${opportunity.bonusU}u`
          : `${seamLabel} · +${opportunity.bonusU}u · OPEN`,
        opportunityId: opportunity.opportunityId,
      });
    }
    if (opportunity.state === 'worked') {
      return Object.freeze({
        state: 'worked',
        text: `WORKED SEAM · ${opportunity.claimedBonusU}u BONUS TAKEN`,
        opportunityId: opportunity.opportunityId,
      });
    }
    return Object.freeze({
      state: 'missed',
      text: 'MISSED SEAM · RICH POCKET COOLED',
      opportunityId: opportunity.opportunityId,
    });
  }
  if (target.type !== 'ship') return null;
  const manifest = data.cargoManifest;
  const source = manifest && manifest.lotSource;
  if (!source || typeof source.richOpportunityId !== 'string' || !source.richOpportunityId
    || !Array.isArray(manifest.lines) || !(manifest.totalQty > 0)) return null;
  const line = manifest.lines.find((entry) => entry && entry.qty > 0);
  if (!line) return null;
  const commodity = COMMODITY_BY_ID.get(line.commodityId);
  const name = commodity && commodity.name || (line.commodityId ? commodityDisplayName(line.commodityId) : 'ORE');
  return Object.freeze({
    state: 'cargo',
    text: `RICH ORE · ${name.toUpperCase()} ×${line.qty}`,
    opportunityId: source.richOpportunityId,
  });
}

// PQ-048.06 keeps actor identity durable across Continue. The target panel deliberately keys this
// readout by the patrol's world record, never the numeric entity id that world rematerialization
// replaces. It is pure presentation: lawSecurity owns the case and the target panel writes none of it.
export function lawfulInspectionStatusText(target, state) {
  if (!target || target.type !== 'ship') return null;
  const worldRecordId = target.data && target.data.worldRecordId;
  if (typeof worldRecordId !== 'string' || !worldRecordId) return null;
  const ledger = state && state.player && state.player.lawfulInspection;
  if (!ledger || typeof ledger !== 'object') return null;
  const active = ledger.active;
  if (active && active.patrolWorldRecordId === worldRecordId) {
    if (active.phase === 'scanning') return 'LAW · HOLD FOR SCAN';
    if (active.phase === 'offered') return 'LAW · INSPECTION REQUESTED';
  }
  const last = ledger.last;
  if (!last || last.patrolWorldRecordId !== worldRecordId) return null;
  switch (last.outcome) {
    case 'cleared': return 'LAW · HOLD CLEAR';
    case 'contraband_discovered': return 'LAW · CONTRABAND SEIZED';
    case 'escaped': return 'LAW · ESCAPED';
    case 'collateral_assault': return 'LAW · COLLATERAL ASSAULT';
    case 'collateral_patrol_destroyed': return 'LAW · PATROL DESTROYED';
    default: return 'LAW · INSPECTION INTERRUPTED';
  }
}

// Tier 0 is "not a threat" and shows no badge at all. The words are the ship-scale language the
// rest of the build already uses, so the badge teaches nothing new -- it just says it sooner.
const THREAT_TIER_WORD = ['', 'LIGHT', 'HEAVY', 'CAPITAL'];

function entityClass(e) {
  if (!e) return '';
  if (e.type === 'ship') {
    const d = e.data || {};
    // Traffic role beats hull class for ambient readability (HAULER vs "Freighter").
    const trafficRole = d.trafficRole || d.role;
    if (trafficRole && ROLE_LABEL[trafficRole]) return ROLE_LABEL[trafficRole];
    const def = d.defId ? SHIP_BY_ID.get(d.defId) : null;
    return ROLE_LABEL[e.role] || ROLE_LABEL[def?.role] || 'Ship';
  }
  if (e.type === 'station') {
    return e.data && e.data.isGate ? 'Gate' : 'Station';
  }
  const interactionClass = targetInteractionClass(e);
  if (interactionClass) return interactionClass;
  return typeof e.type === 'string' && e.type
    ? e.type.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '';
}

const MOTIVE_LABEL = Object.freeze({
  cargo_extortion: 'ROBBERY', predation: 'PREDATION', bounty: 'BOUNTY', contract_bounty: 'BOUNTY',
  retaliation: 'RETALIATION', territorial: 'TERRITORIAL', security: 'LAW ENFORCEMENT',
  law_enforcement: 'LAW ENFORCEMENT', escort_duty: 'ESCORT DUTY', defense: 'DEFENSE',
  salvage_claim: 'SALVAGE CLAIM', piracy: 'PIRACY', assigned_interdiction: 'SENT AFTER YOU', patrol: 'PATROL DUTY', trade: 'TRADE ROUTE',
  mining: 'MINING', rescue: 'RESCUE', unknown: 'UNKNOWN',
});

function readableMotive(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return MOTIVE_LABEL[key] || (key ? key.replace(/_/g, ' ').toUpperCase() : '');
}

// INF-022: targeting one member of a tracking wing names the wing and its rough role.
// Everything comes off the entity the panel already holds: the spawn-stamped squad id,
// the doctrine identity stamped alongside it (a mine-layer reads as area denial the same
// way in the panel as in the wing grammar), and the live combat target for the tracking
// half. Pure and DOM-free for headless checks.
export function wingLineFor(target, playerId, state = null) {
  if (!target) return null;
  const ai = (target.data && target.data.ai) || {};
  const squadId = ai.squadId != null ? String(ai.squadId).trim() : '';
  if (!squadId) return null;
  const doctrineId = ai.combatDoctrineId != null ? String(ai.combatDoctrineId) : '';
  const wingRole = IDENTITY_WING_ROLE[doctrineId] || (doctrineId ? 'press' : null);
  const tracking = target.data && target.data.combat && target.data.combat.targetId != null
    && playerId != null && target.data.combat.targetId === playerId;
  const sectorId = state?.world?.currentSectorId;
  const zone = SECTOR_ZONES[sectorId]?.find((entry) => entry.id === squadId) || ZONE_BY_ID.get(squadId);
  let hash = 2166136261;
  for (let i = 0; i < squadId.length; i++) hash = Math.imul(hash ^ squadId.charCodeAt(i), 16777619);
  const code = (hash >>> 0).toString(36).toUpperCase().padStart(4, '0').slice(-4);
  const designation = zone?.name || (!/[_:]/.test(squadId) && readableIdentity(squadId)) || code;
  const full = designation.toUpperCase();
  const role = wingRole ? ` · ${wingRole.replace(/_/g, ' ').toUpperCase()}` : '';
  const track = tracking ? ' · TRACKING YOU' : '';
  const room = 64 - 'WING '.length - role.length - track.length;
  return `WING ${full.length > room ? full.slice(0, Math.max(0, room - 1)) + '…' : full}${role}${track}`;
}

const ZERO_VEL = { x: 0, z: 0 };

function beamVerbWordFor(entity) {
  if (entity && entity.data && entity.data.worldSiteTargetable === true) return 'work site';
  const t = entity && entity.type;
  if (t === 'asteroid') return 'mine';
  if (t === 'wreck' || t === 'derelict') return 'salvage';
  if (t === 'payload') return 'split';
  if (t === 'ship' || t === 'drone') return 'weld';
  return 'beam';
}

function playerWeaponRange(player) {
  const data = player && player.data || {};
  const weapons = Array.isArray(data.weapons) ? data.weapons : [];
  let range = Number(data.weaponRange || data.derived?.weaponRange) || 0;
  for (const weapon of weapons) {
    range = Math.max(range, Number(weapon && (weapon.range || weapon.maxRange || weapon.rangeWu)) || 0);
  }
  return range > 0 ? range : 900;
}

export function targetRangeBand(distance, player) {
  const dist = Math.max(0, Number(distance) || 0);
  const range = playerWeaponRange(player);
  if (dist <= Math.min(450, range * 0.55)) return 'CLOSE';
  if (dist <= range) return 'IN RANGE';
  if (dist <= range * 1.6) return 'APPROACH';
  return 'DISTANT';
}

const _readoutTruth = createTargetTruth();

/**
 * Which contact the panel takes as its subject, and whether the guns have diverged from the
 * selection. Pure and DOM-free so the divergence rule is checkable headlessly; createTargetPanel
 * below is its only production consumer. Source: the target-truth projection
 * (src/combat/targetTruth.js), which reads the selection, the tether and resolvePlayerGunTarget().
 *
 * Returns:
 *   subjectId / subject   — what the panel describes. The SELECTION wins whenever it is live and
 *                           observed, because targetId is also what aims a Massline throw and the
 *                           two must not be conflated. The engaged contact is the subject only when
 *                           there is no live selection, so the guns are never firing at a ship with
 *                           no readout anywhere.
 *   engaged               — the diverged gun target (a hostile on the Massline that is not the
 *                           selection), or null when the guns agree with the selection (the
 *                           ordinary case, which must not print a second name for one ship).
 *   subjectIsEngaged      — true when the subject IS the gun target and there is no selection.
 *   text                  — the row copy, or '' when there is nothing to report.
 */
export function engagedContactReadout(state) {
  const player = (state && state.player) || null;
  const entities = (state && state.entities) || null;
  if (!player || !entities) return { subjectId: null, subject: null, engaged: null, subjectIsEngaged: false, text: '' };
  // Packet 02: the ONE target-truth projection (src/combat/targetTruth.js) decides what is selected
  // and what the guns address — identity-safe and sensor-true. The weapons-written gunTargetId
  // mirror is no longer a second reader's source.
  const truth = projectTargetTruth(state, _readoutTruth);
  const selId = truth.selectedId;
  const selection = selId != null ? resolveWorldPresentationEntity(state, selId) : null;
  const liveSelection = selection && selection.alive !== false && selection.pos ? selection : null;
  // Divergence is "the guns address a hull that is not the selection" (the Massline owns them).
  const gunId = truth.divergent ? truth.effectiveGunTargetId : null;
  const engagedCandidate = gunId != null ? entities.get(gunId) : null;
  const engaged = engagedCandidate && engagedCandidate.alive ? engagedCandidate : null;
  const subjectIsEngaged = !liveSelection && !!engaged;
  const subject = liveSelection || (subjectIsEngaged ? engaged : null);
  const subjectId = subjectIsEngaged ? gunId : selId;
  let text = '';
  if (subjectIsEngaged) text = '⌖ LINE TARGET · NO SELECTION';
  else if (engaged && liveSelection) text = `⌖ LINE TARGET ▸ ${targetDisplayName(engaged)}`;
  return { subjectId, subject, engaged, subjectIsEngaged, text };
}

/**
 * The campaign bounty this target would pay the player on a kill, or 0 when the kill
 * would pay nothing. Gated by the SAME rewardEligibility predicates combat settles
 * through, so the preview can never promise money the kill toast would not print:
 * mission-owned targets settle through missions, Survival bodies through the run wallet.
 * Pure and DOM-free for headless checks.
 */
/**
 * FB-121: the hull's physical class — AMMUNITION / TERRAIN / SPECIALIST — prints once the scanner
 * has resolved the contact. Unscanned hulls never show a class word; pure and DOM-free so the
 * reveal gate is checkable headlessly.
 */
export function targetPhysicalClassLabel(t) {
  const cls = t && t.data && t.data.scanned === true ? t.data.physicalClass : null;
  return typeof cls === 'string' && cls.length > 0 ? cls.toUpperCase() : null;
}

/**
 * FB-058: the scanned ship's build badge — the label the buildIdentity system stamped on the
 * entity. Shown only at the SF-133 disclosure stage (deep/full reveal, where fittings are
 * disclosed); a class-band contact never advertises hidden hardware. Pure and DOM-free.
 */
export function targetBuildBadgeLabel(t) {
  const data = t && t.data;
  const reveal = data && data.scanRevealed;
  const disclosed = reveal && (reveal.quality === 'full' || reveal.quality === 'deep');
  const label = disclosed && data.buildIdentity ? data.buildIdentity.label : null;
  return typeof label === 'string' && label.length > 0 ? label.toUpperCase() : null;
}

export function targetBountyPreview(target) {
  const amount = Math.max(0, Math.round(Number(target && target.data && target.data.bountyCr) || 0));
  if (amount <= 0) return 0;
  if (missionOwnsReward(target) || runOwnsReward(target)) return 0;
  return amount;
}

export function targetIntelReadout(target, player, state, distance = Infinity) {
  if (!target) return null;
  const data = target.data || {};
  const ai = data.ai || {};
  const intentData = data.intent || {};
  const engagement = data.engagement || {};
  const playerTeam = player ? player.team : 0;
  const hostile = isHostileToPlayer(target, playerTeam, state);
  const allied = !hostile && playerTeam !== 0 && target.team === playerTeam;
  const intent = isSurrenderedContact(target) ? 'SURRENDERED'
    : allied ? 'ALLY' : contactStateWord(target, playerTeam, state);
  const authoredMotive = engagement.motive || ai.motive || data.motive || intentData.motive;
  let motive = readableMotive(authoredMotive);
  if (!motive && ai.retaliationTargetId === state?.playerId) motive = 'RETALIATION';
  if (!motive && ai.lawful) motive = 'LAW ENFORCEMENT';
  if (!motive && (ai.forcePlayerTarget || ai.huntPlayer)) motive = 'HUNTING YOU';
  if (!motive && hostile) motive = 'HOSTILE INTENT';
  if (!motive && allied) motive = 'SUPPORT';
  if (!motive && ai.passive) motive = 'NONCOMBATANT';
  if (!motive) motive = 'UNRESOLVED';
  const threatTier = contactThreatTier(target, hostile);
  // Lock surface stays thin (phase only); hail STATUS carries tactical means (U3/U5 hierarchy).
  const workStatus = lawfulInspectionStatusText(target, state)
    || livingWorkStatusText(target, { depth: 'lock', state });
  const disabledHauler = ceresDisabledHaulerTruth(state, target);
  const recoveryPrompt = disabledHauler && !disabledHauler.choice
    ? 'HAIL · RECOVER / STEAL / ABANDON'
    : disabledHauler && disabledHauler.choice === 'recover'
      ? 'MASSLINE RECOVERY CLAIMED'
      : null;
  return Object.freeze({
    hostile,
    allied,
    intent,
    motive,
    workStatus: workStatus || null,
    recoveryPrompt,
    threatTier,
    threatPips: tierPips(threatTier),
    rangeBand: targetRangeBand(distance, player),
    // INF-022: targeting a wing member names the wing and its rough role.
    wing: wingLineFor(target, state && state.playerId, state),
  });
}

// The worker publishes this bounded, generation-bound view. Never infer cold cargo
// from missing history or read native custody from the presentation realm.
function orchardThermalFacts(target, state) {
  const d = target.data;
  const rec = state?.planet?.ships?.[target.id];
  const life = occupantGenerationOf(target);
  if (state?.world?.currentSectorId !== ANVIL_ORCHARD.sectorId
    || (state.planet?.siteId !== undefined && state.planet.siteId !== ANVIL_ORCHARD.planetId)
    || target.type !== 'payload' || target.alive === false || state.entities?.get?.(target.id) !== target
    || d?.orchardId !== ANVIL_ORCHARD.id || d.orchardKind !== 'pod' || d.masslineTetherable !== true
    || !Number.isSafeInteger(life) || life < 1 || rec?.occupantGeneration !== life
    || (rec.lotId !== undefined && rec.lotId !== d.worldRecordId)
    || !Number.isFinite(rec.lastThermalAt) || rec.lastThermalAt < 0
    || (Number.isFinite(state.simTime) && rec.lastThermalAt > state.simTime)
    || !Number.isFinite(rec.heat) || rec.heat < 0 || rec.heat > 1
    || ![null, 'skim', 'commit', 'breakup', 'descent'].includes(rec.stage)) return [];
  const stage = { skim: ['skim', 'danger', 'reentry'].includes(rec.region) ? 'HEATING' : 'COOLING', commit: 'COMMIT WINDOW', breakup: 'BREAKING UP', descent: 'DESCENT' }[rec.stage];
  const facts = [`POD HEAT ${Math.round(rec.heat * 100)}%`];
  if (stage) facts.push(stage);
  if (Number.isFinite(target.hull) && Number.isFinite(target.hullMax) && target.hullMax > 0) {
    facts.push(`HULL ${Math.round(Math.max(0, Math.min(1, target.hull / target.hullMax)) * 100)}%`);
  }
  return facts;
}

// CLOUD-04 — a compact fauna field note built only from knowledge the run has legitimately
// earned. The effective revelation is read, never created: ensureAlienEcologyState mutates
// state.world to mint the record, so this projector reproduces effectiveRevelation()'s math
// (raw tier + fitted bioScanTier bonus, clamped to 3) over whatever record actually exists.
function faunaRevelationFor(state) {
  const ae = state && state.world && state.world.alienEcology;
  const base = ae && Number.isFinite(ae.revelation) ? ae.revelation : 0;
  const bonus = fittedModuleDefs(state).reduce(
    (m, d) => Math.max(m, Number(d && d.mods && d.mods.bioScanTier) || 0), 0);
  return Math.min(base + bonus, 3);
}

// Live drive postures in player language. Doc 02 rule: ring-tightening and shadowing are
// posture, never an attack label; the posture word must not outrun what the animal shows.
const FAUNA_POSTURE_WORD = Object.freeze({
  idle: 'IDLE', drift: 'DRIFTING', forage: 'FORAGING', investigate: 'CURIOUS',
  shadow: 'SHADOWING', defend: 'DEFENSIVE · POSTURE', swarm: 'RINGING · POSTURE',
  attach: 'ATTACHED', feed: 'FEEDING', flee: 'FLEEING', return: 'RETURNING',
  migrate: 'MIGRATING', dormant: 'DORMANT', charge: 'CHARGING', trail: 'FOLLOWING WAKE',
  anchored: 'ANCHORED', captured: 'CAPTURED', repair: 'MENDING',
});

/**
 * Compact fauna field note for the facts line: role, one live posture, then up to four authored
 * anatomy facts — only at or past the anatomy gate (revelation ≥ 2, the ladder tier that names the
 * species). Below the gate the name plate already carries everything the run may claim, so the
 * note stays silent rather than leaking taxonomy. False/zero/unknown stay distinct: an explicit
 * relayTissue:false reports NO RELAY TISSUE while a missing key says nothing.
 */
export function faunaFieldNote(t, state) {
  if (!t || t.type !== 'fauna' || t.alive === false) return null;
  if (faunaRevelationFor(state) < 2) return null;
  const eco = t.data && t.data.ecology || {};
  const scannedSpecies = state?.world?.alienEcology?.taxonomy?.scannedSpecies;
  if (scannedSpecies && !scannedSpecies[eco.speciesId]) return null;
  const species = eco.speciesId ? faunaSpeciesById(eco.speciesId) : null;
  if (!species) return null;
  const facts = [];
  if (typeof species.role === 'string' && species.role) facts.push(species.role.toUpperCase());
  const posture = FAUNA_POSTURE_WORD[eco.driveState];
  if (posture) facts.push(posture);
  const pileFact = faunaPileFact(species, eco);
  if (pileFact) facts.push(pileFact);
  const tollFact = faunaTollFact(species, eco);
  if (tollFact) facts.push(tollFact);
  const an = species.anatomy && typeof species.anatomy === 'object' ? species.anatomy : null;
  if (an) {
    if (typeof an.hostTissue === 'string' && an.hostTissue) facts.push(`HOST: ${an.hostTissue.toUpperCase()}`);
    if (typeof an.fungalTissue === 'string' && an.fungalTissue) facts.push(`GROWTH: ${an.fungalTissue.toUpperCase()}`);
    if (an.relayTissue === true) facts.push('RELAY TISSUE PRESENT');
    else if (an.relayTissue === false) facts.push('NO RELAY TISSUE');
    if (typeof an.cystLoad === 'string' && an.cystLoad) facts.push(`CYST LOAD: ${an.cystLoad.toUpperCase()}`);
  }
  return facts.length ? facts : null;
}

function orchardSocketInfoLine(target, state) {
  // The machine's wreck envelope carries generic salvage data. The finite socket descriptors
  // own its player-facing facts; this projection grants no native release/pickup authority.
  if (state?.world?.currentSectorId !== ANVIL_ORCHARD.sectorId
    || !state.sites?.anvilOrchard || state.entities?.get?.(target.id) !== target) return 'Orchard status unavailable';
  const components = listSelectableComponents(state, target);
  if (components.length !== ANVIL_ORCHARD.socketCount) return 'Orchard status unavailable';
  if (components[0].inactiveReason === 'frame-destroyed') return 'Frame destroyed · release unavailable';
  const selection = state.ui?.componentSelection;
  const component = selection?.targetId === target.id
    && (selection.stableKey == null || selection.stableKey === stableEntityKey(target))
    ? components.find(entry => entry.componentId === selection.componentId)
    : null;
  if (!component) {
    const reserve = state.sites.anvilOrchard.sourceRemaining;
    return `${reserve} ${reserve === 1 ? 'unit' : 'units'} in reserve · select a pod socket`;
  }
  const units = `${component.units} ${component.units === 1 ? 'unit' : 'units'}`;
  if (component.status === 'empty') return 'Empty socket · awaiting harvest';
  if (component.operation === 'closing') {
    const progress = Math.round(component.workRemaining / component.workThreshold * 100);
    const outcome = component.status === 'delivered' ? 'Collected' : component.status === 'lost' ? 'Pod lost' : units;
    return `${outcome} · closing ${progress}%`;
  }
  if (component.status === 'delivered') return `Collected · socket ${component.operation === 'closed' ? 'closed' : 'open'}`;
  if (component.status === 'lost') return component.operation === 'closed' ? 'Pod lost · socket closed' : 'Pod lost';
  if (component.status === 'drifting') return `${units} · released`;
  if (component.operation === 'open') return `${units} · releasing pod`;
  const opening = component.operation === 'opening';
  const progress = opening ? ` · opening ${Math.round(component.workApplied / component.workThreshold * 100)}%` : '';
  if (component.inactiveReason === 'phase-ineligible') return `${units}${progress} · wait for calm`;
  const beam = resolveActionLabel(state, 'siteBeam');
  const hold = beam ? `hold ${beam}` : 'hold the release beam';
  if (opening) return `${units}${progress} · ${hold}`;
  if (component.active) {
    const commodity = COMMODITY_BY_ID.get(ANVIL_ORCHARD.commodityId)?.name || 'Hydrogen';
    return `${commodity} · ${units} · ${hold} to release`;
  }
  return `${units} · release unavailable`;
}

const LINER_LEG_WORD = Object.freeze({
  DELIVERED: 'arrived', ARRIVED: 'arrived', RETURNED: 'returned', LOST: 'lost',
  arrived: 'arrived', returned: 'returned', lost: 'lost',
});

/** The persisted last leg on a passenger liner, or '' when the record was never settled. */
export function passengerLinerLastLegLine(entity) {
  const data = entity && entity.data;
  const itinerary = data && data.itinerary;
  if (!itinerary || itinerary.kind !== PASSENGER_LINER_ITINERARY_KIND) return '';
  const last = itinerary.lastOutcome;
  if (!last || typeof last !== 'object') return '';
  const word = LINER_LEG_WORD[last.outcome];
  if (!word) return '';
  const stationId = typeof last.stationId === 'string' ? last.stationId : '';
  const station = stationId ? STATION_BY_ID.get(stationId) : null;
  // A station id outside the static catalog still reads as a place ("helios reach"), never
  // the raw `station_helios_reach` slug.
  const stationName = (station && station.name)
    || String(stationId || '').replace(/^station_/, '').replace(/_/g, ' ').trim();
  return stationName ? `last leg: ${word} · ${stationName}` : `last leg: ${word}`;
}

export function objectInfoLine(t, state, p, dist) {
  const pallasSeam = pallasSeamInfoLine(t, state);
  if (pallasSeam !== null) return pallasSeam;
  if (t.type === 'ship' || t.type === 'drone') {
    const status = presentationStatusWord(t) || '';
    const leg = passengerLinerLastLegLine(t);
    if (!leg) return status;
    return status ? `${status} · ${leg}` : leg;
  }
  if (t.type === 'station') {
    const services = stationContactServices(t.data && t.data.stationId);
    const facts = services.length ? [`Services: ${services.map(stationServiceLabel).join(' · ')}`] : [];
    if (Number.isFinite(t.mass) && t.mass > 0) {
      facts.push(`Mass ${Number.isInteger(t.mass) ? t.mass : Math.round(t.mass * 100) / 100}`);
    }
    return facts.join(' · ');
  }
  if (isOrchardFrame(t)) return orchardSocketInfoLine(t, state);
  if (t.data?.orchardId === ANVIL_ORCHARD.id && t.data.orchardKind === 'frame') return 'Orchard status unavailable';
  const d = t.data || {};
  const facts = orchardThermalFacts(t, state);
  if (t.type === 'asteroid') {
    facts.push(d.respawnAt != null ? 'Mined out' : 'Ore-bearing');
  } else if (t.type === 'fauna') {
    // The scanner ladder owns the name; at anatomy tier the earned field note rides here.
    const note = faunaFieldNote(t, state);
    if (note) facts.push(...note);
  } else if (t.type === 'payload' || t.type === 'wreck' || t.type === 'pickup') {
    const pool = d.salvagePool && typeof d.salvagePool === 'object' ? d.salvagePool : null;
    const lines = pool
      ? Object.entries(pool).map(([id, q]) => [id, finiteWholePickupAmount(q)]).filter(([, q]) => q > 0)
      : [];
    if (lines.length) {
      const parts = lines.slice(0, 3).map(([id, q]) => {
        const c = COMMODITY_BY_ID.get(id);
        const label = (c && c.name) || 'Unidentified cargo';
        return `${label} ×${q}`;
      });
      facts.push(`Holds ${parts.join(', ')}`);
    } else if (d.commodityId) {
      const c = COMMODITY_BY_ID.get(d.commodityId);
      const label = (c && c.name) || 'Unidentified cargo';
      const amount = finiteWholePickupAmount(d.amount);
      facts.push(`Holds ${label}${amount > 0 ? ` ×${amount}` : ''}`);
    } else if (t.type === 'wreck') {
      facts.push('Salvageable');
    }
    const pickedClean = t.type === 'wreck' && pool != null && lines.length === 0;
    const heldCommodityIds = lines.length
      ? lines.map(([id]) => id)
      : (typeof d.commodityId === 'string' && d.commodityId ? [d.commodityId] : []);
    if (d.laundered === true) {
      facts.push('Papers washed');
    } else if (t.type === 'wreck' && restrictedSalvageForWreck(t) && !pickedClean) {
      facts.push('Restricted salvage');
    } else if (d.legality !== 'legal') {
      const hasContraband = d.legality === 'contraband'
        || heldCommodityIds.some((id) => commodityCatalogLegality(id) === 'contraband');
      const hasRestricted = d.legality === 'restricted'
        || heldCommodityIds.some((id) => commodityCatalogLegality(id) === 'restricted');
      if (hasContraband) facts.push('Contraband');
      else if (hasRestricted) facts.push('Restricted cargo');
    }
    // A disclosed kill record rides the same facts line in its own terse shape — the reveal's
    // story exists only at identified+, so its presence IS the disclosure gate.
    const record = t.type === 'wreck' && d.scanRevealed && d.scanRevealed.story ? d.scanRevealed : null;
    if (record) {
      const killer = d.provenance && d.provenance.killerLabel;
      if (killer) facts.push(`Killer: ${killer}`);
      if (Number.isFinite(record.daysAgo) && record.daysAgo > 0) facts.push(`${record.daysAgo}d ago`);
    }
    // An ordinary battlefield wreck files the same fact at record time — aftermathWrecks
    // stamps provenance (killerLabel + the provenanceLine sentence) on the body it spawns.
    // Scan-resolve is the disclosure gate here too: the black-box killer rides the facts
    // line once scanned, and an unscanned hulk stays anonymous.
    if (!record && t.type === 'wreck' && d.scanned && d.provenance && d.provenance.killerLabel) {
      facts.push(`Killer: ${d.provenance.killerLabel}`);
    }
  } else if (Number.isFinite(t.mass) && t.mass > 0) {
    facts.push(`Mass ${Number.isInteger(t.mass) ? t.mass : Math.round(t.mass * 100) / 100}`);
  }
  // d.owner is an id (entity/station/entity-slot) as often as an authored name. A live entity
  // resolves through the world; otherwise resolve the catalog name or run it through
  // readableIdentity — an id-shaped owner slug must not print as "Owner: npc_99".
  const ownerName = typeof d.ownerName === 'string' && d.ownerName ? d.ownerName
    : (typeof d.owner === 'string' && d.owner
      && !(state && state.entities && typeof state.entities.get === 'function' && state.entities.get(d.owner))
      ? (readableIdentity(STATION_BY_ID.get(d.owner)?.name) || readableIdentity(d.owner)) : null);
  if (ownerName) facts.push(`Owner: ${ownerName}`);
  const interaction = interactionProfileForEntity(t);
  if (interaction.hazardous) facts.push('Hazard');
  const lane = initialMouseToolLane(state, t.id);
  const eligible = isBeamTargetEligible(t, state);
  const beamRange = beamRangeFor(p, state);
  let action;
  if (lane === 'beam') {
    if (!eligible) {
      action = d.respawnAt != null ? 'Beam depleted' : 'Beam unavailable';
    } else if (beamRange != null && dist <= beamRange + (t.radius || 0)) {
      action = `Hold RMB · ${beamVerbWordFor(t)}`;
    } else {
      action = 'Out of beam range';
    }
  } else if (lane === 'sling') {
    action = 'Hold RMB · aim sling';
  } else {
    action = 'Inspect only';
  }
  facts.push(action);
  if (t.type === 'asteroid') facts.push(`Tether, then ${BINDINGS.drill.label} · enter asteroid`);
  return facts.join(' · ');
}

export function createTargetPanel(ctx) {
  const { state, bus } = ctx;
  const el = document.createElement('div');
  el.className = 'sf-target sf-hudpanel';
  el.style.display = 'none';
  el.dataset.hudSlot = 'current-threat';
  // The card is its own disclosure control (owner note: the corner readout was a wall of text
  // that "gets in the way"): compact by default in every mode — including survival runs, so the
  // crucibleFocus idiom (state.run.kind === 'survival' && isRunSealed) needs no special case —
  // with the deeper rows one click, keypress, hover or scan reveal away. role=button also makes
  // the card a UI-command target (isUiCommandTarget), so its clicks and keys never fall through
  // to flight bindings. Pure presentation: nothing on the bus, nothing written to state.
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-expanded', 'false');
  el.setAttribute('aria-label', 'Current target');
  el.innerHTML = targetFrameHtml();

  const elName = el.querySelector('.sf-target__name');
  const elFac = el.querySelector('.sf-target__faction');
  const elThreat = el.querySelector('.sf-target__threat');
  const elThreatPips = el.querySelector('.sf-target__threat-pips');
  const elThreatWord = el.querySelector('.sf-target__threat-word');
  const elRangeFill = el.querySelector('.sf-target__rangefill');
  const elDist = el.querySelector('.sf-target__dist');
  const elClose = el.querySelector('.sf-target__closing');
  const elCloseGlyph = elClose.querySelector('[data-glyph]');
  const elCloseTxt = elClose.querySelector('[data-txt]');
  const elGimmick = el.querySelector('.sf-target__gimmick');
  const elTriangle = el.querySelector('.sf-target__triangle');
  const triE = el.querySelector('.sf-tri--e');
  const triK = el.querySelector('.sf-tri--k');
  const triX = el.querySelector('.sf-tri--x');
  const triFillE = triE.querySelector('.sf-tri__fill');
  const triFillK = triK.querySelector('.sf-tri__fill');
  const triFillX = triX.querySelector('.sf-tri__fill');
  const elTriLayer = el.querySelector('.sf-target__tri-layer');
  const elWeak = el.querySelector('.sf-target__weak');
  const elComponent = el.querySelector('.sf-target__component');
  // Engagement marks render as SVG glyphs (src/ui/glyphs.js) beside text spans, so game-data
  // strings keep flowing through the textContent-only channel (never innerHTML).
  const elWeakGlyph = elWeak.querySelector('[data-glyph]');
  const elWeakTxt = elWeak.querySelector('[data-txt]');
  const elComponentGlyph = elComponent.querySelector('[data-glyph]');
  const elComponentTxt = elComponent.querySelector('[data-txt]');
  const elIdBits = el.querySelector('.sf-target__idbits');
  const elBounty = el.querySelector('.sf-target__bounty');
  const elIntent = el.querySelector('.sf-target__intent');
  const elCondition = el.querySelector('.sf-target__condition');
  const elRange = el.querySelector('.sf-target__range');
  const elObject = el.querySelector('.sf-target__object');
  const elEngaged = el.querySelector('.sf-target__engaged');
  const elEngagedGlyph = elEngaged.querySelector('[data-glyph]');
  const elEngagedTxt = elEngaged.querySelector('[data-txt]');
  let lastEngagedKey = null;
  let lastTriKey = null;
  let lastIdentityKey = null;
  let lastBountyKey = null;
  let lastIntelKey = null;
  let lastComponentKey = null;
  let lastConditionKey = null;
  let lastObjectKey = null;

  // PQ-015: the component chip is the reachable (DOM) trigger for sub-selecting a target component.
  // pointer-events:auto is set inline so the chip is clickable even inside a pointer-events:none HUD
  // panel. A keyboard binding through input.js is a pending shared-change request (see REPORT).
  elComponent.addEventListener('click', () => { if (bus) bus.emit('ui:cycleComponent', { dir: 1 }); });
  elComponent.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (bus) bus.emit('ui:cycleComponent', { dir: ev.shiftKey ? -1 : 1 });
    }
  });

  // Compact/detail disclosure. Three ways the deeper rows open: pinned by click or Enter/Space,
  // peeked while the pointer rests on the card, or opened on its own while the subject carries
  // scan-revealed intel (update() drives detailScan). The sf-target--detail class is the only
  // state the stylesheet reads.
  let detailPinned = false;
  let detailPeek = false;
  let detailScan = false;
  let detailApplied = null;
  function applyDetailState() {
    const expanded = detailPinned || detailPeek || detailScan;
    if (expanded === detailApplied) return;
    detailApplied = expanded;
    el.classList.toggle('sf-target--detail', expanded);
    el.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
  // Focus must never camp here: the flight adapter suppresses gameplay keys from focused
  // buttons, so a focused card would eat movement and weapon keys. Clicking never takes
  // focus at all (preventDefault beats the browser's focus-on-mousedown); a keyboard
  // toggle blurs right after, so Tab→Enter opens and immediately hands control back.
  el.addEventListener('mousedown', (ev) => ev.preventDefault());
  el.addEventListener('click', (ev) => {
    // The component chip is the card's one interactive child with its own verb — its click
    // cycles parts, never toggles the card.
    if (ev.target && ev.target.closest && ev.target.closest('.sf-target__component')) return;
    detailPinned = !detailPinned;
    applyDetailState();
    el.blur();
  });
  el.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    // Consumed key: stopPropagation is the ONLY suppression the flight input adapter honors
    // (ui/input.js never inspects defaultPrevented). The chip's own handler keeps its verb;
    // the stop still shields the flight lane from a bound Enter/Space.
    if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
    if (ev.target && ev.target.closest && ev.target.closest('.sf-target__component')) return;
    ev.preventDefault();
    detailPinned = !detailPinned;
    applyDetailState();
    el.blur();
  });
  el.addEventListener('pointerenter', () => { detailPeek = true; applyDetailState(); });
  el.addEventListener('pointerleave', () => { detailPeek = false; applyDetailState(); });

  let lastTargetId = null;
  let lastName = null;
  let lastClass = null;
  let lastFactionId = null;
  let lastDistText = '';
  let lastThreatKey = '';
  let lastRangeScale = '';
  let lastCloseText = '';
  let lastCloseColor = '';
  let lastCloseGlyph = '';
  let tickN = 0;
  let lastSurrendered = false;

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  // hud.js drives this same element through its _sfStyle write-cache (setDisplay); a direct
  // style.display write here must keep that cache coherent or hud's next suppress is skipped.
  function setPanelDisplay(value) {
    const cache = el._sfStyle || (el._sfStyle = Object.create(null));
    if (cache.display === value && el.style.display === value) return;
    cache.display = value;
    el.style.display = value;
  }

  function update(options = {}) {
    tickN++;
    const gunRead = engagedContactReadout(state);
    const t = gunRead.subject;
    const tid = gunRead.subjectId;
    if (!t || t.alive === false || !t.pos) {
      setPanelDisplay('none');
      lastTargetId = null;
      lastEngagedKey = null;
      lastObjectKey = null;
      if (detailScan) { detailScan = false; applyDetailState(); }
      return;
    }
    setPanelDisplay('block');
    // Scan-revealed detail earns the open card: a pulse that resolved this hull to deep/full
    // disclosure (loadout, manifest, salvage hint) or exposed a weak point is exactly the moment
    // the hidden rows say something the compact card cannot. Class/contact-level reveals only
    // confirm what the head already prints, so they do not open it.
    const scanReveal = t.data && t.data.scanRevealed;
    const scanDetail = !!(options.weakPoint
      || (scanReveal && (scanReveal.quality === 'deep' || scanReveal.quality === 'full')));
    if (scanDetail !== detailScan) { detailScan = scanDetail; applyDetailState(); }
    const surrendered = isSurrenderedContact(t);
    const surrenderChanged = surrendered !== lastSurrendered;
    lastSurrendered = surrendered;

    // The divergence row: the one thing the panel could not previously say.
    if (gunRead.text !== lastEngagedKey) {
      lastEngagedKey = gunRead.text;
      if (!elEngagedGlyph.firstChild) elEngagedGlyph.innerHTML = glyphSvg('guns_lock', 11);
      setText(elEngagedTxt, gunRead.text.replace('⌖ ', ''));
      const show = gunRead.text ? 'block' : 'none';
      if (elEngaged.style.display !== show) elEngaged.style.display = show;
    }

    const nextName = targetDisplayName(t);
    const nextClass = entityClass(t);
    const targetChanged = tid !== lastTargetId || nextName !== lastName || nextClass !== lastClass || t.factionId !== lastFactionId;
    if (targetChanged) {
      lastTargetId = tid;
      lastName = nextName;
      lastClass = nextClass;
      lastFactionId = t.factionId || null;
      const classText = nextClass && nextClass.toLowerCase() !== nextName.toLowerCase()
        ? ` · ${nextClass}`.toUpperCase()
        : '';
      setText(elName, `${nextName}${classText}`);
      if (el._sfAriaLabel !== `Current target: ${nextName}${nextClass ? `, ${nextClass}` : ''}`) {
        el._sfAriaLabel = `Current target: ${nextName}${nextClass ? `, ${nextClass}` : ''}`;
        el.setAttribute('aria-label', el._sfAriaLabel);
      }
      const fac = t.factionId ? FACTION_BY_ID.get(t.factionId) : null;
      if (fac) {
        setText(elFac, fac.short || fac.name);
        const color = fac.color || 'var(--ink-dim)';
        if (elFac.style.color !== color) elFac.style.color = color;
      } else {
        setText(elFac, '');
      }
    }

    // Health is drawn in the world (.sf-target-arcs), not here. See the DOM note above.

    // Identity is stable; live intent/motive/threat is a separate tactical receipt below it.
    if (t.type === 'ship' || t.type === 'drone') {
      const player = state.entities.get(state.playerId);
      const role = entityClass(t);
      const level = t.data && t.data.level;
      const fac = t.factionId ? FACTION_BY_ID.get(t.factionId) : null;
      const facShort = fac ? (fac.short || fac.name) : '—';
      const callsign = t.data && t.data.callsign;
      const classLabel = targetPhysicalClassLabel(t);
      const badgeLabel = targetBuildBadgeLabel(t);
      const idKey = `${tid}:${facShort}:${role}:${level}:${callsign || ''}:${classLabel || ''}:${badgeLabel || ''}`;
      if (idKey !== lastIdentityKey) {
        lastIdentityKey = idKey;
        // Concision (owner 2026-10-27): the head row already names ship + role beside the faction
        // chip, so the old identity line collapses to the meta row's level/hull/badge bits.
        const bits = [level != null ? `L${level}` : '', classLabel, badgeLabel].filter(Boolean).join(' · ');
        setText(elIdBits, bits);
        const show = bits ? 'inline' : 'none';
        if (elIdBits.style.display !== show) elIdBits.style.display = show;
      }
    } else if (elIdBits.style.display !== 'none') {
      elIdBits.style.display = 'none';
      lastIdentityKey = null;
    }

    // Bounty preview: the price on this hull, when the kill would actually pay it.
    // Keyed like identity so the row only rewrites on target/amount change.
    const bounty = (t.type === 'ship' || t.type === 'drone') ? targetBountyPreview(t) : 0;
    if (bounty > 0) {
      const bountyKey = `${tid}:${bounty}`;
      if (bountyKey !== lastBountyKey) {
        lastBountyKey = bountyKey;
        setText(elBounty, `BOUNTY ${bounty} CR`);
      }
      if (elBounty.style.display !== 'block') elBounty.style.display = 'block';
    } else {
      if (elBounty.style.display !== 'none') elBounty.style.display = 'none';
      if (lastBountyKey !== null) lastBountyKey = null;
    }

    // Damage triangle (BP-02): effectiveness of E/K/X against the target's current outer layer.
    // Only recompute when the target or its outer layer changes (values are per-layer constants).
    if (t.type === 'ship' || t.type === 'drone') {
      const { layer, mult } = outerLayerMultipliers(t);
      const triKey = `${tid}:${layer}`;
      if (triKey !== lastTriKey) {
        lastTriKey = triKey;
        const eE = familyEffectiveness(mult, FAMILY_CHANNELS.energy);
        const eK = familyEffectiveness(mult, FAMILY_CHANNELS.kinetic);
        const eX = familyEffectiveness(mult, FAMILY_CHANNELS.explosive);
        const barW = (v) => `scaleX(${Math.max(0.06, Math.min(1, v / TRIANGLE_REF)).toFixed(3)})`;
        triFillE.style.transform = barW(eE);
        triFillK.style.transform = barW(eK);
        triFillX.style.transform = barW(eX);
        const best = Math.max(eE, eK, eX);
        triE.classList.toggle('best', eE === best);
        triK.classList.toggle('best', eK === best);
        triX.classList.toggle('best', eX === best);
        setText(elTriLayer, layer.toUpperCase());
      }
      if (elTriangle.style.display !== 'flex') elTriangle.style.display = 'flex';
    } else {
      if (elTriangle.style.display !== 'none') elTriangle.style.display = 'none';
      lastTriKey = null;
    }

    // Weak-point line (BP-02): shown once a scan pulse has revealed the target's soft spot (hud passes
    // the revealed entry in options.weakPoint). Tells the player what to hit and roughly where.
    const wp = options.weakPoint;
    if (wp && wp.label && (t.type === 'ship' || t.type === 'drone')) {
      if (!elWeakGlyph.firstChild) elWeakGlyph.innerHTML = glyphSvg('weakpoint', 11);
      setText(elWeakTxt, `WEAK: ${wp.label}${wp.hint ? ' · ' + wp.hint : ''}`);
      if (elWeak.style.display !== 'block') elWeak.style.display = 'block';
    } else if (elWeak.style.display !== 'none') {
      elWeak.style.display = 'none';
    }

    // PQ-015 component chip: the target's selectable components (combat subsystems / salvage weak-
    // point) and the current sub-selection, from the shared descriptor. Clicking cycles it. Hidden
    // for targets with no targetable components (e.g. bare asteroids).
    const comps = listSelectableComponents(state, t);
    if (comps.length) {
      const sel = state.ui && state.ui.componentSelection;
      const selHere = sel && sel.targetId === t.id ? sel : null;
      const selLabel = selHere ? ((comps.find((c) => c.componentId === selHere.componentId) || {}).label || null) : null;
      const compKey = `${tid}:${comps.length}:${selLabel || ''}`;
      if (compKey !== lastComponentKey) {
        lastComponentKey = compKey;
        if (!elComponentGlyph.firstChild) elComponentGlyph.innerHTML = glyphSvg('component', 11);
        setText(elComponentTxt, selLabel ? `PART: ${selLabel}` : `PARTS · ${comps.length} · CLICK`);
        const active = !!selLabel;
        if (elComponent.style.borderColor !== (active ? 'var(--visor-amber)' : '')) {
          elComponent.style.borderColor = active ? 'var(--visor-amber)' : '';
          elComponent.style.color = active ? 'var(--visor-amber)' : 'var(--text-primary)';
        }
      }
      if (elComponent.style.display !== 'block') elComponent.style.display = 'block';
    } else if (elComponent.style.display !== 'none') {
      elComponent.style.display = 'none';
      lastComponentKey = null;
    }

    // Gimmick / readable quirk tag (bounty hunters + named lane freighters)
    const richSeam = richSeamTargetReadout(t, state);
    const gimmick = t.data && (t.data.bountyGimmick || t.data.gimmick || t.data.bountyTag);
    const gimmickLabel = richSeam ? richSeam.text : getGimmickLabel(gimmick);
    if (gimmickLabel) {
      setText(elGimmick, gimmickLabel);
      if (elGimmick.style.display !== 'inline-block') elGimmick.style.display = 'inline-block';
    } else {
      if (elGimmick.style.display !== 'none') elGimmick.style.display = 'none';
    }

    const p = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    if (p && p.pos && t.pos && (targetChanged || surrenderChanged || options.slow || (tickN % 6) === 0)) {
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      const tacticalTarget = t.type === 'ship' || t.type === 'drone';
      const intel = tacticalTarget ? targetIntelReadout(t, p, state, dist) : null;
      const intelKey = intel
        ? `${tid}:${intel.intent}:${intel.motive}:${intel.workStatus || ''}:${intel.recoveryPrompt || ''}:${intel.threatTier}:${intel.rangeBand}:${intel.wing || ''}`
        : '';
      if (intel && intelKey !== lastIntelKey) {
        lastIntelKey = intelKey;
        const workBit = intel.workStatus ? ` · ${intel.workStatus}` : '';
        const recoveryBit = intel.recoveryPrompt ? ` · ${intel.recoveryPrompt}` : '';
        const wingBit = intel.wing ? ` · ${intel.wing}` : '';
        // J07: threat leaves the paragraph and becomes a badge. Spelling out INTENT/MOTIVE/THREAT
        // was eight words to answer one question you ask constantly in a fight. The badge answers
        // it as a shape; the sentence keeps only what a shape cannot carry.
        setText(elIntent, `${intel.intent} · ${intel.motive}${workBit}${recoveryBit}${wingBit}`);
        setText(elRange, intel.rangeBand);
        if (elIntent.style.display !== 'block') elIntent.style.display = 'block';
        const aria = `Current target: ${nextName}, ${nextClass || 'contact'}, intent ${intel.intent}, motive ${intel.motive}, threat ${intel.threatTier}, ${intel.rangeBand}${intel.workStatus ? `, ${intel.workStatus}` : ''}${intel.recoveryPrompt ? `, ${intel.recoveryPrompt}` : ''}${intel.wing ? `, ${intel.wing}` : ''}`;
        if (el._sfAriaLabel !== aria) {
          el._sfAriaLabel = aria;
          el.setAttribute('aria-label', aria);
        }
      } else if (!intel) {
        lastIntelKey = null;
        if (elIntent.style.display !== 'none') elIntent.style.display = 'none';
        setText(elRange, targetRangeBand(dist, p));
      }
      // Delivered-condition row (PB-ORD-A): what the last bomb/status did to this hull — guns
      // out vs rearming with its clock, helm vs guns, burn stacks. Rides the slow cadence so
      // the countdowns tick without per-frame writes; hidden on clean hulls.
      if (t.type === 'ship' || t.type === 'drone') {
        const condition = targetConditionReadout(state, t);
        // Packet 02: a status earns a chip only when the FITTED attack can act on it (an ionized
        // hull reads ARC READY only if a fitted chain hops to Ionized targets). Sim-sourced clock.
        let conditionText = condition ? condition.text : '';
        for (const chip of exploitableStatusChips(state, t)) {
          const word = `${chip.label} ${(Math.round(chip.secondsLeft * 10) / 10).toFixed(1)}s`;
          conditionText = conditionText ? `${conditionText} · ${word}` : word;
        }
        const conditionKey = `${tid}:${conditionText}`;
        if (conditionKey !== lastConditionKey) {
          lastConditionKey = conditionKey;
          setText(elCondition, conditionText);
          const show = conditionText ? 'block' : 'none';
          if (elCondition.style.display !== show) elCondition.style.display = show;
        }
      } else if (lastConditionKey !== null) {
        lastConditionKey = null;
        if (elCondition.style.display !== 'none') elCondition.style.display = 'none';
      }
      const objectLine = objectInfoLine(t, state, p, dist);
      const objectKey = `${tid}:${objectLine}`;
      if (objectKey !== lastObjectKey) {
        lastObjectKey = objectKey;
        setText(elObject, objectLine);
        const show = objectLine ? 'block' : 'none';
        if (elObject.style.display !== show) elObject.style.display = show;
      }
      // Threat badge. Tier drives a data attribute so colour AND the printed word both carry it --
      // never colour alone (grammar: no state may be colour-only).
      // contactThreatTier returns a NUMBER 0..3 keyed off mass (scanner.js THREAT_MASS_TIERS),
      // not a word. Styling on [data-tier="high"] would have been dead CSS that looked correct.
      const tierNum = intel ? (intel.threatTier | 0) : 0;
      const tier = tierNum > 0 ? String(tierNum) : '';
      const threatKey = tier + '|' + (intel ? intel.threatPips : '');
      if (threatKey !== lastThreatKey) {
        lastThreatKey = threatKey;
        if (intel && tier) {
          setText(elThreatPips, String(intel.threatPips || ''));
          setText(elThreatWord, THREAT_TIER_WORD[tierNum] || 'THREAT');
          if (elThreat.dataset.tier !== tier) elThreat.dataset.tier = tier;
          if (elThreat.hidden) elThreat.hidden = false;
        } else if (!elThreat.hidden) {
          elThreat.hidden = true;
          // `dataset.x = ''` still matches [data-x]; delete is the only way to clear the selector.
          delete elThreat.dataset.tier;
        }
      }
      // Range bar: distance as a proportion of scanner range, so "far" reads as a length instead of
      // a number you must compare against another number you do not remember.
      const rangeFrac = Math.max(0, Math.min(1, 1 - dist / SCANNER_CONTACT_RANGE));
      const rangeScale = 'scaleX(' + rangeFrac.toFixed(3) + ')';
      if (rangeScale !== lastRangeScale) { elRangeFill.style.transform = rangeScale; lastRangeScale = rangeScale; }
      const distText = dist > 1000 ? (dist / 1000).toFixed(1) + 'k' : String(Math.round(dist));
      if (distText !== lastDistText) { elDist.textContent = distText; lastDistText = distText; }
      // closing speed = -dot(relVel, normalize(relPos)); positive = approaching
      const tv = t.vel || ZERO_VEL;
      const pv = p.vel || ZERO_VEL;
      const rvx = tv.x - pv.x, rvz = tv.z - pv.z;
      const inv = dist > 0.001 ? 1 / dist : 0;
      const closing = -((rvx * dx + rvz * dz) * inv);
      const closeText = String(Math.abs(Math.round(closing)));
      const closeGlyph = closing >= 0 ? 'closing' : 'opening';
      // Direction is carried twice already (the arrow glyph + the signed read); colour stays a
      // bone reading, never an alarm — red is threat only, and an approached asteroid is not a
      // threat. Closing is the brighter reading, opening the dimmer one.
      const closeColor = closing >= 0 ? 'var(--dp-phos, #dfeeff)' : 'var(--dp-ink-dim, #b7b4a6)';
      if (closeGlyph !== lastCloseGlyph) { elCloseGlyph.innerHTML = glyphSvg(closeGlyph, 10); lastCloseGlyph = closeGlyph; }
      if (closeText !== lastCloseText) { elCloseTxt.textContent = closeText; lastCloseText = closeText; }
      if (closeColor !== lastCloseColor) { elClose.style.color = closeColor; lastCloseColor = closeColor; }
    }
  }

  function forceRefresh() {
    lastTargetId = null;
    lastTriKey = null;
    lastIntelKey = null;
    lastEngagedKey = null;
    lastConditionKey = null;
    tickN = 5;
  }

  return { el, update, forceRefresh };
}
