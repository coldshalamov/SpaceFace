// Book 2's acquisition → receiving route. A read of existing owners, never a source,
// intake, mission, reward or save owner. Recomputed at the ordinary mission-nav cadence.
import { UNDERSTORY_RECEIVER, receiverApproach, receiverStatus, gardenGrowthRadius } from '../data/understoryReceiver.js';
import { UNDERSTORY_GARDENS, UNDERSTORY_GARDEN_STAGES, UNDERSTORY_COMPOST_RUN } from '../data/factions/understory.js';
import { ASTEROIDS, BEAMS } from '../data/mining.js';
import { COMMODITIES } from '../data/commodities.js';
import { sectorMembershipAtGlobal } from '../data/sectorCoordinates.js';
import { sellableCargoQuantity } from '../systems/cargo.js';
import { cargoPodMassForContents } from '../systems/lootShards.js';
import { towClassMassFor } from '../systems/shipCapabilities.js';
import { isAttachable } from '../systems/tetherGameplay.js';
import { describeEntity, interactionEligibility } from '../systems/interactionDescriptors.js';
import { resolveBeamVerb } from '../combat/industrialBeam.js';
import { nearestMiningResourceFace } from './starterWorkday.js';

const SECTOR = UNDERSTORY_RECEIVER.sectorId;
const COMMODITY_BY_ID = new Map(COMMODITIES.map((def, order) => [def.id, { def, order }]));
const IRON = COMMODITY_BY_ID.get('cmdty_ore_iron').def;
const number = n => Number(n.toFixed(1)).toString();
const finitePosition = e => Number.isFinite(e?.pos?.x) && Number.isFinite(e?.pos?.z);
const localBody = (state, e) => e?.alive === true && finitePosition(e)
  && state.entities?.get(e.id) === e
  // Home/provenance names the origin ledger, not the load's current physical sector.
  && sectorMembershipAtGlobal(e.pos) === SECTOR;
// These two finite material owners publish exact available mass and custody checks.
// Decorative/site bodies with an edible type are not advertised as loose supplies.
const ownedFeed = e => e?.data?.persistenceOwner === 'aftermathWrecks' || e?.data?.jettisonedCargo === true;

function heldFeed(state, gardenOwner) {
  const line = state.player?.tether, player = state.entities?.get(state.playerId);
  if (line?.active !== true || line.attachmentId == null || player?.alive !== true) return null;
  const a = state.combat?.attachments?.byId?.[line.attachmentId];
  const e = state.entities?.get(line.targetId);
  if (!a || a.state !== 'active' || a.defId !== 'tether_standard' || a.id !== line.attachmentId || a.ownerId !== player.id
    || a.targetId !== e?.id || !localBody(state, e)
    || player.occupantGeneration == null || e.occupantGeneration == null
    || a.ownerGeneration !== player.occupantGeneration || a.targetGeneration !== e.occupantGeneration) return null;
  const mass = gardenOwner.gardenFeedMass(e);
  return Number.isFinite(mass) && mass > 0 ? { entity: e, mass } : null;
}

function freeFeedCargo(state, needed, towCapacity) {
  // Forecast only ordinary, legal, free lots. Reserved/personal/mission stock stays
  // aboard according to cargo's own read; this does not authorize any cargo mutation.
  const items = state.player?.cargo?.items || {};
  const held = Object.keys(items).filter(id => Number.isFinite(Number(items[id])) && Number(items[id]) > 0)
    .map(id => COMMODITY_BY_ID.get(id)).filter(Boolean).sort((a, b) => a.order - b.order);
  for (const { def } of held) {
    if (def.legality !== 'legal' || !(def.massPerU > 0)) continue;
    const free = Math.floor(sellableCargoQuantity(state, def.id));
    if (!Number.isFinite(free) || !(free > 0)) continue;
    const runtime = state.content?.commodities;
    const actual = (Array.isArray(runtime) ? runtime.find(row => row.id === def.id) : runtime?.[def.id]) || def;
    // Intake uses its static mass catalog; do not forecast a runtime override that
    // would produce a pod lighter than the garden's actual remaining commodity mass.
    if (actual.massPerU !== def.massPerU) continue;
    const quantity = Math.min(free, Math.max(1, Math.ceil(needed / def.massPerU)),
      Math.floor(towCapacity / def.massPerU));
    if (quantity > 0 && cargoPodMassForContents(def.massPerU, quantity) <= towCapacity) {
      return { name: def.name, quantity, mass: quantity * def.massPerU };
    }
  }
  return null;
}

function beamAvailable(state, player) {
  // mining._beamRuntime writes defaults. Read the same tier fallback without calling it.
  const beam = player?.data?.miningBeam || state.player?.miningBeam;
  if (!beam) return false;
  const tier = BEAMS.find(row => row.id === beam.tierId) || BEAMS[0];
  return (beam.dps || tier.dps) > 0 && (beam.range || tier.range) > 0;
}

export function compostRouteFocus(owner) {
  const state = owner.state, receiver = receiverStatus(state), garden = receiver.garden;
  const base = { stationId: null, sectorId: SECTOR, targetEntityId: null,
    label: `Compost Run — ${UNDERSTORY_RECEIVER.name} west outside-mouth approach`, pos: garden && finitePosition(garden)
      ? { x: garden.pos.x + UNDERSTORY_RECEIVER.approachOffset.x,
        z: garden.pos.z + UNDERSTORY_RECEIVER.approachOffset.z } : receiverApproach() };
  if (garden && !finitePosition(garden)) return { ...base, pos: null,
    reason: 'The live receiving garden has no reliable position. No approach or delivery is being promised.' };
  if (receiver.status === 'unavailable') return { ...base, pos: null,
    label: 'Compost receiver — not receiving', reason: 'The receiver is unavailable. No feed or growth is credited; the Nest still waits for real player-fed growth.' };
  const saved = garden?.data || state.understory?.authoredReceiver?.terminalGardenData || {};
  const biomass = receiver.status === 'destroyed' ? 0 : Number.isFinite(saved.gardenBiomass)
    ? Math.max(0, saved.gardenBiomass) : UNDERSTORY_RECEIVER.initialBiomass;
  const next = UNDERSTORY_GARDEN_STAGES.find(row => row.massFloor > biomass);
  const needed = next ? Math.ceil((next.massFloor - biomass) / UNDERSTORY_GARDENS.digestionYield * 10) / 10 : 0;
  const fed = Math.max(0, Number(saved.compostFedMass) || 0);
  const progress = `${receiver.status === 'destroyed' ? 'Destroyed receiver: regrow from zero. ' : ''}${number(biomass)} biomass; ${number(needed)}t feed to the next visible stage. First visible growth opens the Nest.`;
  const run = saved.compostRunComplete === true ? 'Run paid once; no repeat payment.'
    : `Optional paid run: ${number(fed)}/${UNDERSTORY_COMPOST_RUN.targetMass}t; no pay before ${UNDERSTORY_COMPOST_RUN.targetMass}t.`;
  const reason = action => `${action} ${progress} ${run}`;
  if (!next) return { ...base, reason: `The garden is at its last stage; no further growth can show. ${run}` };
  if (state.world?.currentSectorId !== SECTOR) return { ...base,
    reason: reason('Return to Charon and the west approach. Your feed and growth remain with the garden; no new material is supplied.') };
  const gardenOwner = owner.registry?.get?.('understoryGardens');
  if (typeof gardenOwner?.gardenFeedMass !== 'function') return { ...base,
    reason: reason('Material eligibility is unavailable; no usable load is being promised.') };
  const held = heldFeed(state, gardenOwner);
  if (held) {
    let arrival = '';
    if (garden && state.mode === 'flight' && !state.ui?.docked) {
      const gap = Math.hypot(held.entity.pos.x - garden.pos.x, held.entity.pos.z - garden.pos.z)
        - gardenGrowthRadius(garden) * UNDERSTORY_GARDENS.absorbPadding - (Number(held.entity.radius) || 0);
      if (Number.isFinite(gap)) arrival = gap > 0
        ? `Load ${Math.ceil(gap)} WU outside the living mouth. ` : 'Load at the mouth; wait for the garden to take it. ';
    }
    return { ...base, reason: reason(`${number(held.mass)}t valid feed on your Line. ${arrival}Tow it into the living mat from the west; keep your cockpit outside. Only consumed mass counts.`) };
  }
  const player = state.entities?.get(state.playerId);
  const towCapacity = player?.alive === true ? towClassMassFor(player.data?.derived) : 0;
  const cargoOwner = owner.registry?.get?.('cargo'), podOwner = owner.registry?.get?.('lootShards');
  const cargo = typeof cargoOwner?.jettison === 'function' && typeof podOwner?.gardenFeedMass === 'function'
    ? freeFeedCargo(state, needed, towCapacity) : null;
  if (cargo) return { ...base, reason: reason(`You have free ${cargo.name}: jettison ${cargo.quantity}u (${number(cargo.mass)}t feed) at the west approach, then catch the pod with the Line and tow it into the mat. Keep your cockpit outside; jettison alone is not growth.`) };
  let source = null, distance = Infinity, sourceMass = 0;
  const index = state.entityIndex;
  // Ready type lanes are authoritative (including empty ones); no full-world census.
  const lanes = index?.__spacefaceEntityIndexV1 && index.ready === true
    ? [index.wrecks || [], index.payloads || []] : [state.entityList || []];
  if (finitePosition(player) && towCapacity > 0) for (const lane of lanes) for (const e of lane) {
    if (!localBody(state, e) || !ownedFeed(e) || !isAttachable(e, state.playerId, state)
      || !Number.isFinite(e.mass) || e.mass > towCapacity) continue;
    const mass = gardenOwner.gardenFeedMass(e);
    if (!(Number.isFinite(mass) && mass > 0)) continue;
    const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    if (d < distance) { source = e; distance = d; sourceMass = mass; }
  }
  if (source) return { ...base, label: 'Compost Run — recover loose feed', targetEntityId: source.id,
    pos: { x: source.pos.x, z: source.pos.z }, reason: reason(`${number(sourceMass)}t usable loose feed located. Approach and catch it with the Line; clear any obstruction before latching. Then return to Rookside's west approach. Other valid feed also counts.`) };
  if (typeof cargoOwner?.jettison !== 'function' || typeof podOwner?.gardenFeedMass !== 'function') return { ...base, pos: null,
    reason: reason('Cargo delivery eligibility is unavailable. No mining-to-feed supply is being promised.') };
  const iron = IRON;
  const hold = state.player?.cargo;
  if (!(towCapacity >= cargoPodMassForContents(iron.massPerU, 1))) return { ...base, pos: null,
    reason: reason('No usable feed is held. This fit cannot put a 20t cargo pod under way; restore tow capability or bring a lighter eligible load. No feed is supplied.') };
  if (!beamAvailable(state, player) || !Number.isFinite(hold?.capVolume) || !Number.isFinite(hold?.usedVolume)
    || hold.capVolume - hold.usedVolume < iron.volPerU) return { ...base, pos: null,
    reason: reason('No usable loose feed located. Mining needs an available beam and free hold space; restore them or bring another eligible load.') };
  const beamMode = state.ui?.beamMode || state.player?.beamMode || 'auto';
  if (!['auto', 'extract'].includes(beamMode) || state.input?.receiver) return { ...base, pos: null,
    reason: reason('Set the beam to AUTO or EXTRACT without a transfer receiver to mine ordinary iron, or bring another eligible load.') };
  const { face } = nearestMiningResourceFace(state, { sectorId: SECTOR, center: player.pos,
    commodityId: iron.id }, ASTEROIDS, e => interactionEligibility(state, e, 'mine', { phase: 'extract' }).ok
      && (() => { const action = resolveBeamVerb(describeEntity(state, e), { mode: beamMode,
          selectedComponentId: state.ui?.componentSelection?.componentId || null });
        return action.ok && action.verb === 'extract'; })());
  if (!face) return { ...base, label: 'Compost Run — find feed', pos: null,
    reason: reason('No eligible live or dormant Charon iron face located. Search for another real loose load or free cargo; an exhausted field is not a supply promise.') };
  return { ...base, label: 'Compost Run — Charon iron face',
    targetEntityId: face.fieldResident ? null : face.id, pos: { x: face.pos.x, z: face.pos.z },
    reason: reason(`Mine ordinary iron at this face; ${Math.ceil(needed / iron.massPerU)}u would supply ${number(needed)}t or more. Only actual ore collected counts. Once free cargo is aboard, return to Rookside to jettison and Line-feed it; other valid material also works.`) };
}
