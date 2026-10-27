// Pure read model for exploration trophies and per-sector completion.
// World remains the sole writer of state.world.discovery; Codex and the map only project it.

import { RINGWORLD_GRID_READING, validateLandmarkQuestOffer } from '../data/landmarkMissions.js';

import { SECTORS } from '../data/sectors.js';
import { UNIQUE_WRECKS } from '../data/uniqueWrecks.js';
import { shardSphereSongProgress, SHARD_SPHERE_SONG } from '../data/landmarkMissions.js';
import { borrowedVoiceJournalPlate } from '../data/borrowedVoice.js';

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));

function sectorOf(sectorOrId) {
  if (sectorOrId && typeof sectorOrId === 'object') return sectorOrId;
  return SECTOR_BY_ID.get(sectorOrId) || null;
}

function discoveryFor(state, sectorId) {
  return state && state.world && state.world.discovery
    && state.world.discovery[sectorId] || null;
}

function finiteTime(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

export function isExplorationPoiFound(record) {
  return !!(record && (record.investigated || record.identified || record.defeated));
}

// The per-sector census counts authored find-sites — rows a player can physically discover
// once and keep. Three row classes deliberately stay out of the census:
// - `runtimeOwner` rows are scanner/map identity for sites materialized by an owning runtime
//   (alien-ecology waves, the machine layer, asteroid world-sites, heist facilities). The
//   census keeps only curated single-site runtimes whose delegated row IS the authored find
//   record — extend AUTHORED_SITE_DELEGATE_OWNERS for those, never for identity rows.
// - gated route markers (`gatedBy` / `machineGate`) are navigation infrastructure, not finds.
// - `repeatableScannerSignal` sources re-fire after every resolution, so they never complete
//   as a one-time durable find.
const AUTHORED_SITE_DELEGATE_OWNERS = new Set(['vesper', 'uniqueWrecks']);

export function isAuthoredExplorationSite(poi) {
  if (!poi || typeof poi !== 'object') return false;
  if (typeof poi.runtimeOwner === 'string' && poi.runtimeOwner
    && !AUTHORED_SITE_DELEGATE_OWNERS.has(poi.runtimeOwner)) return false;
  if (poi.gatedBy || poi.machineGate) return false;
  if (poi.repeatableScannerSignal === true) return false;
  return true;
}

export function sectorExplorationProgress(state, sectorOrId) {
  const sector = sectorOf(sectorOrId);
  if (!sector) {
    return { sectorId: null, found: 0, total: 0, remaining: 0, value: null, percent: null };
  }
  const pois = (Array.isArray(sector.pois) ? sector.pois : []).filter(isAuthoredExplorationSite);
  const records = discoveryFor(state, sector.id);
  const byId = records && records.pois || {};
  let found = 0;
  for (const poi of pois) {
    if (poi && isExplorationPoiFound(byId[poi.id])) found++;
  }
  const total = pois.length;
  const value = total > 0 ? found / total : null;
  return {
    sectorId: sector.id,
    found,
    total,
    remaining: Math.max(0, total - found),
    value,
    percent: value == null ? null : Math.round(value * 100),
  };
}

function sensorDenialPhrase(sector) {
  const types = new Set((sector.hazards || []).map((hazard) => hazard && hazard.type).filter(Boolean));
  if (types.has('nebula') && types.has('radiation')) return ' through nebula and radiation interference';
  if (types.has('nebula')) return ' through nebula interference';
  if (types.has('radiation')) return ' through radiation interference';
  return '';
}

function plateBody(sector, poi, record) {
  if (record.landmarkArtifact && record.landmarkArtifact.body) {
    return `${record.landmarkArtifact.title || 'Recovered artifact'} — ${record.landmarkArtifact.body}`;
  }
  if (poi.discoveryPlate && typeof poi.discoveryPlate.body === 'string') {
    return poi.discoveryPlate.body.trim();
  }
  if (poi.type === 'anomaly' && record.triangulated) {
    const bearings = Math.max(1, Math.floor(Number(record.triangulationSampleCount) || 3));
    return `Triangulated in ${sector.name} from ${bearings} distinct bearings, then flown down to the source${sensorDenialPhrase(sector)}.`;
  }
  const verb = record.investigated ? 'Investigated' : (record.defeated ? 'Resolved' : 'Identified');
  return `${verb} by close approach in ${sector.name}. Classification: ${poi.type || 'unknown'}.`;
}


// Sedna's earned filing is not a procedural desk. Project existing owners only; no saved flags.
function applySednaGridReadingGuidance(state, plates) {
  const def = RINGWORLD_GRID_READING;
  const plate = plates.find(row => row.sectorId === def.sectorId && row.poiId === def.poiId);
  if (!plate) return;
  const record = discoveryFor(state, def.sectorId)?.pois?.[def.poiId];
  const artifact = record?.landmarkArtifact;
  const filed = artifact?.id === def.artifact.id
    && (artifact.sourceRef == null || artifact.sourceRef === def.targetRef);
  if (filed) {
    plate.body = def.artifact.title + ' — ' + def.artifact.body
      + '\nGrid Reading filed for Sedna Survey Post. The reading remains in your archive.';
    return;
  }
  // Never display an unrelated artifact as this landmark's filed record.
  const sector = SECTOR_BY_ID.get(def.sectorId);
  const poi = sector.pois.find(row => row.id === def.poiId);
  plate.body = plateBody(sector, poi, { ...record, landmarkArtifact: null });
  if (artifact) {
    const progress = sectorExplorationProgress(state, sector);
    plate.note = progress.total > 0
      ? progress.found + '/' + progress.total + ' authored sites found · ' + progress.percent + '% sector exploration'
      : 'No additional authored sites are charted in this sector.';
  }
  const active = Array.isArray(state?.missions?.active) ? state.missions.active : [];
  const receipts = Array.isArray(state?.missions?.receipts) ? state.missions.receipts : [];
  const matches = row => row && (row.sourceOfferId === def.id
    || row.causeFingerprint === def.causeFingerprint);
  const canonical = row => {
    if (!row || row.sourceOfferId !== def.id || row.sourceRef !== def.targetRef) return false;
    const probe = row.params?.landmarkProbe;
    return validateLandmarkQuestOffer({ ...row, id: row.sourceOfferId, minRep: def.minRep })
      && probe.maxRangeWu === def.maxRangeWu
      && probe.targetLocalPos.x === def.targetLocalPos.x
      && probe.targetLocalPos.z === def.targetLocalPos.z;
  };
  let text;
  if (receipts.some(matches) || active.some(row => canonical(row)
    && (row.status !== 'active' || row.params.landmarkProbe.returned))) {
    text = 'The Grid Reading contract is no longer active. No Ringworld grid reading is filed.';
  } else if (active.some(row => row.status === 'active' && canonical(row))) {
    text = 'Grid Reading accepted at Sedna Survey Post. Return to the Ringworld Arc and fire a close scanner pulse within 300 WU.';
  } else {
    text = 'For Grid Reading work, check Sedna Survey Post’s Jobs board. The post keeps earned filings, not a regular contracts desk.';
  }
  plate.body += '\n' + text + ' Sedna Survey Post has no fuel pump; plan your fuel before the trip.';
}

function uniqueWreckPlateBody(def, sector, record) {
  const choice = (def.decision && def.decision.choices || []).find(
    (c) => c.id === record.choiceId || c.outcome === record.outcome,
  );
  const actionDetail = choice && (choice.receiptDetail || choice.consequence) || '';
  const prov = def.provenance
    ? `Loss record: ${def.provenance.lossId} (${def.provenance.incidentId}).`
    : '';
  if (actionDetail) {
    return `${actionDetail} ${prov}`.trim();
  }
  if (record.phase === 'fixed' || record.phase === 'decision') {
    const loc = (def.hazardContext && def.hazardContext.label) || (sector && sector.name) || 'deep space';
    return `Survey lock established at ${loc}. ${def.scanLabel || ''}. ${def.decision && def.decision.prompt || ''}`.trim();
  }
  return `Historical loss tracked in ${(sector && sector.name) || def.sectorId}. ${def.scanLabel || ''} ${prov}`.trim();
}

function uniqueWreckPlateNote(def, record) {
  if (def.followup && typeof def.followup.text === 'string') {
    return def.followup.text;
  }
  if (record.outcome === 'claimed') {
    return 'Salvaged hardware claimed into player manifest.';
  }
  if (record.outcome === 'handed_over') {
    return 'Authority custody transfer filed and settled.';
  }
  return 'Awaiting physical salvage decision at the wreck site.';
}

export function explorationDiscoveryPlates(state) {
  const plates = [];
  for (const sector of SECTORS) {
    const disc = discoveryFor(state, sector.id);
    const byId = disc && disc.pois || {};
    const progress = sectorExplorationProgress(state, sector);
    for (const poi of (sector.pois || [])) {
      if (!poi) continue;
      const record = byId[poi.id];
      if (!isExplorationPoiFound(record)) continue;
      const completedAt = finiteTime(
        record.investigatedAt,
        record.identifiedAt,
        record.defeatedAt,
        record.triangulatedAt,
      );
      const song = sector.id === SHARD_SPHERE_SONG.sectorId && poi.id === SHARD_SPHERE_SONG.poiId
        ? shardSphereSongProgress(state) : null;
      plates.push({
        id: `${sector.id}:${poi.id}`,
        sectorId: sector.id,
        poiId: poi.id,
        title: poi.discoveryPlate && typeof poi.discoveryPlate.title === 'string'
          ? poi.discoveryPlate.title.trim()
          : (poi.name || record.name || poi.id),
        meta: `${sector.name} · ${record.investigated ? 'SOURCE INVESTIGATED' : (record.defeated ? 'SITE RESOLVED' : 'PHYSICALLY IDENTIFIED')}`,
        body: [plateBody(sector, poi, record), song?.text].filter(Boolean).join(' '),
        note: record.landmarkArtifact && record.landmarkArtifact.id
          ? `Recovered ${record.landmarkArtifact.id} · ${progress.found}/${progress.total} authored sites found · ${progress.percent}% sector exploration`
          : progress.total > 0
            ? `${progress.found}/${progress.total} authored sites found · ${progress.percent}% sector exploration`
            : 'No additional authored sites are charted in this sector.',
        completedAt,
      });
    }
  }

  const uniqueWreckBearings = state && state.player && state.player.uniqueWrecks
    && state.player.uniqueWrecks.bearings;
  if (uniqueWreckBearings && typeof uniqueWreckBearings === 'object') {
    for (const def of UNIQUE_WRECKS) {
      const record = uniqueWreckBearings[def.id];
      if (!record) continue;
      const hasFixOrSalvage = record.phase === 'fixed' || record.phase === 'decision' || record.phase === 'salvaged'
        || Number.isFinite(record.fixedAtS) || Number.isFinite(record.salvagedAtS);
      if (!hasFixOrSalvage) continue;
      const sector = sectorOf(def.sectorId);
      const completedAt = finiteTime(
        record.salvagedAtS,
        record.resolvedAtS,
        record.fixedAtS,
        record.heardAtS,
      );
      const isSalvaged = record.phase === 'salvaged' || !!record.outcome;
      const status = isSalvaged
        ? (record.outcome === 'claimed' ? 'HISTORIC WRECK CLAIMED' : 'HISTORIC RECOVERY FILED')
        : (record.phase === 'decision' ? 'SALVAGE DECISION PENDING' : 'PHYSICALLY LOCATED');
      plates.push({
        id: `unique_wreck:${def.id}`,
        sectorId: def.sectorId,
        poiId: def.id,
        title: def.name,
        meta: `${sector ? sector.name : def.sectorId} · ${status}`,
        body: uniqueWreckPlateBody(def, sector, record),
        note: uniqueWreckPlateNote(def, record),
        completedAt,
      });
    }
  }

  applySednaGridReadingGuidance(state, plates);

  const retainedVoice = borrowedVoiceJournalPlate(state);
  if (retainedVoice) plates.push(retainedVoice);
  plates.sort((a, b) => (b.completedAt - a.completedAt) || a.id.localeCompare(b.id));
  return plates;
}

export function galaxyExplorationSummary(state) {
  let totalSectors = 0;
  let exploredSectors = 0;
  let partialSectors = 0;
  let totalPois = 0;
  let foundPois = 0;
  let trophies = 0;

  for (const sector of SECTORS) {
    totalSectors++;
    const progress = sectorExplorationProgress(state, sector);
    totalPois += progress.total;
    foundPois += progress.found;
    if (progress.total > 0) {
      if (progress.found >= progress.total) {
        exploredSectors++;
      } else if (progress.found > 0) {
        partialSectors++;
      }
    }
    const disc = discoveryFor(state, sector.id);
    const byId = (disc && disc.pois) || {};
    for (const key of Object.keys(byId)) {
      if (byId[key]?.landmarkArtifact?.id) trophies++;
    }
  }

  const uniqueWreckBearings = state && state.player && state.player.uniqueWrecks
    && state.player.uniqueWrecks.bearings;
  if (uniqueWreckBearings && typeof uniqueWreckBearings === 'object') {
    for (const row of Object.values(uniqueWreckBearings)) {
      if (row && (row.phase === 'salvaged' || row.outcome)) {
        trophies++;
      }
    }
  }

  const overallPercent = totalPois > 0 ? Math.round((foundPois / totalPois) * 100) : 0;

  return {
    totalSectors,
    exploredSectors,
    partialSectors,
    totalPois,
    foundPois,
    overallPercent,
    trophies,
  };
}
