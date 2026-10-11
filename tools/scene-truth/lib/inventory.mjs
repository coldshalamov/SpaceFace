import fs from 'node:fs';
import { detectGpu, QUALITY_PRESETS } from '../../../src/render/adaptiveQuality.js';
import { CAMERA_ZOOM_MAX, CAMERA_ZOOM_MIN } from '../../../src/render/camera.js';
import { REQUIRED_WHOLE_SHIP_DEF_IDS } from '../../../src/render/partsLibrary.js';
import { RENDER_PACKAGE_PILOTS } from '../../../src/render/renderPackageManifest.js';
import { WHOLE_SHIP_LOD_RUNTIME_DEMOTION } from '../../../src/render/wholeShipLodPolicy.js';
import { bindEntity } from './bindVisual.mjs';
import { legalQualityTiers, legalZooms, SHIPPING_CHASE_ZOOM, SHIPPING_FOV_DEG } from './frame.mjs';
import { repoPath } from './root.mjs';

export function readHeadCommit() {
  try {
    const head = fs.readFileSync(repoPath('.git/HEAD'), 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const ref = head.slice(5).trim();
      const file = repoPath('.git', ref);
      if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
    }
    return head;
  } catch (err) {
    return `unreadable:${err.message}`;
  }
}

function shipProbe(defId) {
  return bindEntity({
    id: defId,
    type: 'ship',
    alive: true,
    isPlayer: defId === 'ship_kestrel',
    radius: 14,
    pos: { x: 0, z: 0 },
    data: { defId, scenarioAlias: defId },
  });
}

export function buildInventory() {
  const gpu = detectGpu(null);
  const ships = REQUIRED_WHOLE_SHIP_DEF_IDS.map((defId) => {
    const bound = shipProbe(defId);
    return {
      defId,
      file: bound.expectedFile,
      packageKey: bound.package.key,
      contentHash: bound.package.contentHash,
      sourceExists: bound.package.sourceExists,
      metadataExists: bound.package.metadataExists,
      lodLevel: bound.lodLevel,
      censusLodOverTolerance: bound.censusLodOverTolerance,
      placeholder: bound.placeholder,
    };
  });
  let pilotFiles = 0;
  let pilotMetadata = 0;
  for (const pilot of RENDER_PACKAGE_PILOTS) {
    if (pilot.sourceUrl && fs.existsSync(repoPath(pilot.sourceUrl))) pilotFiles += 1;
    if (pilot.metadataUrl && fs.existsSync(repoPath(pilot.metadataUrl))) pilotMetadata += 1;
  }
  const reviews = ships
    .filter((row) => row.censusLodOverTolerance && WHOLE_SHIP_LOD_RUNTIME_DEMOTION !== true)
    .map((row) => ({
      schema: 'spaceface.sceneTruthIssue.v1',
      kind: 'lod-outline-over-tolerance',
      confidence: 'review',
      failBuild: false,
      scenarioId: 'inventory',
      seed: null,
      tick: null,
      zoom: null,
      qualityTier: null,
      objectIds: [row.defId],
      expected: 'LOD outline within census tolerance when that LOD is drawn',
      observed: `${row.file} census lod.overTolerance=true`,
      summary: `${row.defId} census marks an LOD outline over tolerance. Whole-ship runtime demotion is off, so this LOD is not swapped on screen. Review, not a build failure.`,
      command: 'node tools/scene-truth/cli.mjs --inventory',
    }));
  return {
    schema: 'spaceface.sceneTruthInventory.v1',
    commit: readHeadCommit(),
    camera: {
      zoomMin: CAMERA_ZOOM_MIN,
      zoomMax: CAMERA_ZOOM_MAX,
      shippingZoom: SHIPPING_CHASE_ZOOM,
      fovDeg: SHIPPING_FOV_DEG,
      legalZooms: legalZooms(),
      frame: 'clampFocusToPlayerSafeRect half-extents (tan(fov/2) * zoom * 0.72)',
    },
    qualityTiers: legalQualityTiers(),
    qualityPresetIds: QUALITY_PRESETS.map((preset) => preset.id),
    lodRuntimeDemotion: WHOLE_SHIP_LOD_RUNTIME_DEMOTION === true,
    packages: {
      pilotCount: RENDER_PACKAGE_PILOTS.length,
      sourceFilesPresent: pilotFiles,
      metadataFilesPresent: pilotMetadata,
    },
    requiredShips: ships,
    gpu: {
      ...gpu,
      webglContextCreated: false,
      fpsMeasured: false,
      note: 'detectGpu(null) reports unknown because this process does not create a WebGL context. No frame rate is claimed.',
    },
    capture: {
      sim: 'runLabScenarioInternal + deterministic checkpoint surface',
      packages: 'RENDER_PACKAGE_PILOTS and on-disk release files',
      geometry: 'modelTruthPlanarRadius / flight-plane stick',
      pixels: 'semantic SVG projection, not a GPU frame',
      diagnostics: 'window.__THREE_GAME_DIAGNOSTICS__ has draw counters and no object ids. See ADAPTER.md.',
    },
    reviews,
  };
}
