// Read-only tender projection. The ordinary cargo, hull and physical manifest owners stay authoritative.
import { COMMODITIES } from '../../data/commodities.js';
import { globalToSectorLocalForSector } from '../../data/sectorCoordinates.js';
import { sellableCargoQuantity } from '../../systems/cargo.js';
import { captureEntitySelection } from '../../ui/sim/stableSelection.js';
import { TENDER_CONFIG, TENDER_STAGES } from './model.js';
export { salvageTenderWholeShipVisual, salvageTenderRequiresAuthoredHull } from './visualIdentity.js';

const COMMODITY_NAMES = new Map(COMMODITIES.map((row) => [row.id, row.name]));
const SUPPLIES = Object.freeze(['cmdty_scrap_metal', 'cmdty_salvage_electronics', 'cmdty_fuel_cells']);
const EMPTY = Object.freeze([]);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const count = (value) => Math.max(0, Math.floor(finite(value)));

function actualBody(state, id) {
  const body = state?.entities?.get?.(id);
  if (body && body.alive !== false && (typeof id !== 'string'
    || (body.data?.persistenceOwner === 'salvageTender' && body.data.worldRecordId === id
      && body.data.identityKey === id))) return body;
  // The durable worldRecordId is deliberately not the transient numeric entity id. A cold load
  // rebinds the same identity to a new native occupant; never use the saved key as a Map index.
  if (typeof id !== 'string') return null;
  let found = null;
  for (const candidate of state?.entityList || EMPTY) {
    if (candidate?.alive === false || candidate?.data?.persistenceOwner !== 'salvageTender'
      || candidate.data.worldRecordId !== id || candidate.data.identityKey !== id) continue;
    if (found) return null;
    found = candidate;
  }
  return found;
}

export function salvageTenderBodyForState(state) {
  const record = state?.salvageTender?.physical?.tender;
  // A terminal rejection from the physical owner outranks copied public identity fields.
  // A later entity with the same label is not permission to resurrect the original home.
  return record?.status === 'missing' ? null : actualBody(state, record?.id);
}

function positionOf(body, record) {
  const pos = body?.pos || record?.pose;
  return pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)
    ? { x: pos.x, z: pos.z } : null;
}

function cargoLines(manifest) {
  return Array.isArray(manifest?.lines) ? manifest.lines : EMPTY;
}

function stageDefinition(stage) {
  return TENDER_STAGES.find((entry) => entry.stage === stage) || null;
}

function installQuote(state, stage) {
  const next = stageDefinition(stage + 1);
  if (!next) return null;
  const costs = next.cost || {};
  const items = Array.isArray(costs.items)
    ? costs.items : Object.entries(costs.items || {}).map(([commodityId, qty]) => ({ commodityId, qty }));
  const lines = items.map((item) => {
    const commodityId = item.commodityId || item.id;
    const required = count(item.qty ?? item.amount);
    const available = count(sellableCargoQuantity(state, commodityId));
    return Object.freeze({
      commodityId, name: COMMODITY_NAMES.get(commodityId) || commodityId,
      required, available, missing: Math.max(0, required - available),
    });
  });
  const credits = count(costs.credits);
  return Object.freeze({
    stage: next.stage, name: next.name, description: next.description,
    credits, availableCredits: count(state?.player?.credits),
    materialsReady: lines.every((line) => line.missing === 0),
    creditsReady: finite(state?.player?.credits) >= credits,
    lines: Object.freeze(lines),
    label: `${lines.map((line) => `${line.required} ${line.name}`).join(' + ')}${lines.length ? ' or ' : ''}${credits} cr`,
  });
}

/** Small contextual model, suitable for an inspection card, a map contact and a HUD home fix.
 * Call at UI cadence, not once per mesh; this function never creates or repairs game state. */
export function getSalvageTenderReadModel(state) {
  const row = state?.salvageTender;
  const physical = row?.physical;
  if (!row || !physical?.tender) return null;
  const stage = Math.max(0, Math.min(3, count(row.stage)));
  const body = salvageTenderBodyForState(state);
  const position = positionOf(body, physical.tender);
  const player = actualBody(state, state?.playerId);
  const sameSector = physical.sectorId === state?.world?.currentSectorId;
  const hull = Math.max(0, finite(body?.hull, finite(physical.tender.hull)));
  const hullMax = Math.max(1, finite(body?.hullMax, 160));
  const hullRatio = Math.min(1, hull / hullMax);
  const disabled = physical.disabled === true || physical.tender.disabled === true
    || hull < TENDER_CONFIG.serviceHullFloor;
  const speed = body?.vel ? Math.hypot(finite(body.vel.x), finite(body.vel.z))
    : Math.hypot(finite(physical.tender.pose?.vx), finite(physical.tender.pose?.vz));
  const secured = physical.mode === 'secured';
  const status = physical.tender.status === 'missing' ? 'missing' : disabled ? 'disabled' : !row.owned ? 'unclaimed'
    : !secured ? (speed > 1 ? 'moving' : 'released') : hullRatio < 0.65 ? 'damaged' : 'secured';
  const statusText = {
    missing: 'Last known berth · tender body unavailable',
    disabled: 'Machinery offline · repair the tender',
    unclaimed: row.rescueAccepted ? 'Recovery accepted · guide it to the marked berth' : 'Unclaimed service barge',
    moving: 'Under tow · services paused',
    released: 'Moorings released · secure before service',
    damaged: 'Secured · hull needs attention',
    secured: 'Secured · home beacon steady',
  }[status];
  const rack = (physical.recovery || []).find((entry) => entry.id === physical.rackId && entry.status === 'racked');
  const rackBody = rack ? actualBody(state, rack.id) : null;
  const manifest = rackBody?.data?.cargoManifest || rack?.manifest;
  const rackQuantities = new Map();
  for (const line of cargoLines(manifest)) {
    rackQuantities.set(line.commodityId, count(rackQuantities.get(line.commodityId)) + count(line.qty));
  }
  const supplies = SUPPLIES.map((commodityId) => Object.freeze({
    commodityId, name: COMMODITY_NAMES.get(commodityId),
    hold: count(sellableCargoQuantity(state, commodityId)),
    sealed: Math.max(0, count(state?.player?.cargo?.items?.[commodityId])
      - count(sellableCargoQuantity(state, commodityId))),
    rack: count(rackQuantities.get(commodityId)),
  }));
  const capabilities = [];
  if (stage >= 1) capabilities.push('Home beacon', 'Fuel-cell pump', 'Emergency weld');
  if (stage >= 2) capabilities.push('Hull and armor repair bench');
  if (stage >= 3) capabilities.push('Fast expedition servicing', 'Physical cargo rack');
  const history = Array.isArray(row.history) ? row.history.slice(-3).map((entry) => ({
    at: finite(entry.at), kind: String(entry.kind || ''), text: String(entry.text || ''),
  })) : [];
  const service = row.service ? Object.freeze({
    type: row.service.type,
    requested: finite(row.service.requested),
    delivered: finite(row.service.delivered),
    remaining: finite(row.service.remaining),
    paused: row.service.paused === true,
    pauseReason: String(row.service.pauseReason || ''),
  }) : null;
  return Object.freeze({
    id: row.id, name: row.name || 'Morrowlight', entityId: body?.id ?? null,
    bodyIdentity: physical.tender.id,
    sectorId: physical.sectorId, position, sameSector,
    owned: row.owned === true, rescueAccepted: row.rescueAccepted === true,
    stage, stageName: stageDefinition(stage)?.name || 'Battered service barge',
    hull, hullMax, hullRatio, speed, disabled, secured, status, statusText,
    lastStatus: String(row.lastStatus || ''),
    distance: sameSector && player?.pos && position
      ? Math.hypot(player.pos.x - position.x, player.pos.z - position.z) : null,
    visible: sameSector && !!body,
    capabilities: Object.freeze(capabilities), supplies: Object.freeze(supplies),
    rack: Object.freeze({
      installed: stage >= 3, occupied: !!rack, bodyId: rackBody?.id ?? null,
      bodyIdentity: rack?.id || null,
      manifestId: manifest?.manifestId || null,
      lines: Object.freeze(cargoLines(manifest).map((line) => Object.freeze({
        commodityId: line.commodityId,
        name: COMMODITY_NAMES.get(line.commodityId) || line.commodityId,
        qty: count(line.qty),
      }))),
    }),
    nextStage: installQuote(state, stage), service,
    arrivals: count(row.arrivals), history: Object.freeze(history),
    ariaLabel: `${row.name || 'Morrowlight'}. ${stageDefinition(stage)?.name || 'Unrestored'}. ${statusText}. Hull ${Math.round(hullRatio * 100)} percent.`,
  });
}

/** A map fix follows the persisted body, including while the player is in another sector. */
export function getSalvageTenderHomeMarker(state) {
  const model = getSalvageTenderReadModel(state);
  if (!model?.owned || !model.position) return null;
  return Object.freeze({
    id: 'personal-salvage-tender:home', entityId: model.entityId,
    label: model.name, kind: 'home', sectorId: model.sectorId,
    pos: model.position, status: model.status, subtitle: model.statusText,
  });
}

/** Existing unified-map ownership marker contract: drawPos is sector-local, while an
 * actionable local fix is galactic-global. A remote home deliberately has no local x/z
 * or entity stamp: the exact-base course resolver then plots a sector route, even when
 * continuous residency still keeps the distant hull alive. */
export function getSalvageTenderMapMarkers(state, sectorId = state?.world?.currentSectorId) {
  const model = getSalvageTenderReadModel(state);
  if (!model?.owned || !model.position || model.sectorId !== sectorId) return EMPTY;
  const body = model.sameSector ? salvageTenderBodyForState(state) : null;
  const homePosition = Object.freeze({ ...model.position });
  const marker = Object.freeze({
    id: 'personal-salvage-tender:home',
    salvageTender: true,
    bodyIdentity: model.bodyIdentity,
    sectorId: model.sectorId,
    targetEntityId: body?.id ?? null,
    stable: body ? captureEntitySelection(body) : null,
    kind: 'home', role: 'HOME', glyph: '◆', color: '#eae6df',
    name: `HOME · ${model.name}`,
    named: true,
    status: model.status.toUpperCase(),
    statusLine: `${model.stageName} · ${model.statusText}`,
    playerVerb: model.sameSector
      ? 'Return within 100 wu and match speed to open the tender.'
      : `Plot a route to ${model.name}'s sector, then follow its home beacon.`,
    consequence: model.capabilities.join(' · '),
    riskLine: model.status === 'missing'
      ? 'Last recorded position. The original tender body is unavailable.'
      : model.disabled ? 'Repair the tender hull to restart its machinery.'
        : 'Moorings must be secured before the pump and repair bench can run.',
    x: model.sameSector ? homePosition.x : null,
    z: model.sameSector ? homePosition.z : null,
    homePosition,
    drawPos: Object.freeze(globalToSectorLocalForSector(homePosition, model.sectorId)),
    courseArrivalRadius: 70,
    courseLabel: `${model.name} · home`,
  });
  return Object.freeze([marker]);
}

/** Apply after the local model's live AND remembered-contact passes. The persistent home
 * marker owns the original hull's one chart glyph; every unrelated contact remains intact. */
export function filterSalvageTenderMapContacts(state, contacts) {
  if (!Array.isArray(contacts)) return EMPTY;
  const row = state?.salvageTender;
  if (!row?.owned || row.physical?.sectorId !== state?.world?.currentSectorId) return contacts;
  const body = salvageTenderBodyForState(state);
  if (!body) return contacts;
  const id = String(body.id);
  const key = `record:${row.physical.tender.id}`;
  return contacts.filter((contact) => String(contact?.entityId ?? contact?.id) !== id
    && contact?.stable?.key !== key);
}
