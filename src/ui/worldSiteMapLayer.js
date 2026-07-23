// PQ-017 pure map adapter. Durable site records are projected by their simulation owner/kernel;
// the map receives ordinary POI markers and never reads transient materialization ids.

import { worldSiteManifestById } from '../data/worldSiteManifests.js';
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';
import { projectWorldSite } from '../systems/worldSiteKernel.js';

export function worldSiteHistoryRows(ledger) {
  const receipts = ledger && Array.isArray(ledger.recentReceipts) ? ledger.recentReceipts.slice(-5) : [];
  return Object.freeze(receipts.map((receipt) => Object.freeze({
    kind: receipt.kind === 'failure' ? 'failure' : 'operation',
    sequence: Number(receipt.sequence) || 0,
    tick: Number(receipt.tick) || 0,
    label: receipt.kind === 'failure'
      ? `Failure — ${semanticLabel(receipt.failureId || receipt.componentId)}`
      : `${receipt.complete ? 'Completed' : 'Progress'} — ${semanticLabel(receipt.operationId || receipt.componentId)}`,
    detail: receipt.kind === 'failure'
      ? `Recovery cycle ${Number(receipt.cycle) || 0}`
      : `${formatWorkAmount(receipt.amountApplied)} work applied`,
  })));
}

export function worldSiteHistoryPresentation(projection) {
  const ledger = projection && projection.ledger || {};
  return Object.freeze({
    stageLabel: String(projection && projection.stageLabel || 'UNKNOWN STAGE'),
    completedCount: Math.max(0, Number(ledger.completedCount) || 0),
    failureCount: Math.max(0, Number(ledger.failureCount) || 0),
    rows: worldSiteHistoryRows(ledger),
  });
}

export function worldSiteMapMarkers(state, sectorId) {
  const sites = state && state.sites;
  if (!sites || !sites.worldById) return [];
  const markers = [];
  for (const siteId of [...(sites.worldOrder || [])].sort()) {
    const record = sites.worldById[siteId];
    const manifest = record && worldSiteManifestById(record.manifestId);
    if (!manifest || record.sectorId !== sectorId) continue;
    const projection = projectWorldSite(manifest, record);
    if (!projection.map || !projection.map.kind) continue;
    markers.push(Object.freeze({
      id: projection.id,
      kind: 'poi',
      poiType: projection.map.poiType || 'world-site',
      mapKind: projection.map.kind,
      name: projection.map.label || manifest.name,
      searchText: projection.map.searchText || manifest.name,
      x: projection.pos.x,
      z: projection.pos.z,
      drawPos: globalToSectorLocalForSector(projection.pos, sectorId),
      entityId: null,
      sectorId,
      stageId: projection.stageId,
      stageLabel: projection.stageLabel,
      ledger: projection.ledger,
      history: worldSiteHistoryPresentation(projection),
      traffic: projection.traffic,
    }));
  }
  return Object.freeze(markers);
}

function semanticLabel(value) {
  const words = String(value || 'world site activity').replace(/[_-]+/g, ' ').trim();
  return words ? words.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'World Site Activity';
}

function formatWorkAmount(value) {
  const amount = Math.max(0, Number(value) || 0);
  return amount.toFixed(3).replace(/\.?0+$/, '');
}

export default worldSiteMapMarkers;
