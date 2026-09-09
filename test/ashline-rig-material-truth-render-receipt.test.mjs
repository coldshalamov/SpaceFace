import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_ashline_v2');
const RECEIPT = resolve(
  FAMILY,
  'evidence/material_truth_v2/eligible_artifacts_rig.json',
);
const SOURCE = resolve(FAMILY, 'source/wholeships/ashline_v2_rig.glb');
const RENDERER = resolve(ROOT, 'tools/blender/render_m4_ashline_rig_material_truth.py');
const BASE_RENDERER = resolve(ROOT, 'tools/blender/render_m4_ashline_material_truth.py');
const EVIDENCE_PREFIX = 'assets/ships/m4_ashline_v2/evidence/material_truth_v2/rig/';
const SEMANTIC_SCHEMA = 'spaceface.m4-ashline-v2.rig-semantic-bounds.v2';
const SEMANTIC_BASIS = 'rig-root-local-aabb';
const SEMANTIC_IMPORT_CONVERSION = 'runtime-x-y-up-z-starboard_to_blender-x-neg-z-y';
const RIG_ROOT_NAME = 'SF_M4_ASHLINE_V2_RIG_ROOT';
const COMPONENT_INVENTORY_SCHEMA = 'spaceface.rigMaterialTruthInventory.v3';
const EMISSION_CUE_NAMES = [
  'Hook_DriveInternalCue_Port',
  'Hook_DriveInternalCue_Starboard',
];
const EMISSION_DELTA_SPATIAL_LIMITS = {
  pixelPadding: 4,
  minimumChangedPixelsWithinCueFraction: 0.95,
  minimumMeaningfulRgbDeltaWithinCueFraction: 0.95,
};
const EXPECTED_VISIBLE_LOD0_MATERIALS = [
  'Material_CableSteel',
  'Material_Cyan',
  'Material_Hardface',
  'Material_HotSection',
  'Material_Hull',
  'Material_Mechanical',
  'Material_PolishedSteel',
  'Material_Red_Paint',
  'Material_Refractory',
];

const EXPECTED = new Map([
  ['neutral_front34.png', { dimensions: [1280, 720], group: 'full_rig' }],
  ['neutral_rear34.png', { dimensions: [1280, 720], group: 'full_rig' }],
  ['capture_boom_close.png', { dimensions: [1280, 720], group: 'capture_boom' }],
  ['jaw_clevis_close.png', { dimensions: [1280, 720], group: 'jaw_clevis' }],
  ['tether_winch_close.png', { dimensions: [1280, 720], group: 'tether_winch' }],
  ['paired_drive_mount_close.png', { dimensions: [1280, 720], group: 'paired_drive' }],
  ['hard_grazing.png', { dimensions: [1280, 720], group: 'paired_drive' }],
  ['top_ortho.png', { dimensions: [1280, 720], group: 'full_rig' }],
  ['emission_off.png', { dimensions: [1280, 720], group: 'paired_drive' }],
  ['game_120px.png', { dimensions: [120, 120], group: 'full_rig' }],
  ['game_45px.png', { dimensions: [45, 45], group: 'full_rig' }],
]);

const LUMA_UPPER_CLIP_THRESHOLD = 247;
const FRAME_SIGNAL_RGB_DISTANCE = 18;
const FRAME_LIMITS = new Map([
  ['neutral_front34.png', {
    minimumSignalPixelFraction: 0.14,
    minimumSignalBoundingBoxFraction: 0.34,
    maximumEdgeSignalFraction: 0.02,
  }],
  ['neutral_rear34.png', {
    minimumSignalPixelFraction: 0.14,
    minimumSignalBoundingBoxFraction: 0.34,
    maximumEdgeSignalFraction: 0.02,
  }],
  ['top_ortho.png', {
    minimumSignalPixelFraction: 0.18,
    minimumSignalBoundingBoxFraction: 0.42,
    maximumEdgeSignalFraction: 0.02,
  }],
  ['game_120px.png', {
    minimumSignalPixelFraction: 0.15,
    minimumSignalBoundingBoxFraction: 0.34,
    maximumEdgeSignalFraction: 0.02,
  }],
  ['game_45px.png', {
    minimumSignalPixelFraction: 0.15,
    minimumSignalBoundingBoxFraction: 0.34,
    maximumEdgeSignalFraction: 0.02,
  }],
]);
const FOREGROUND_LUMA_LIMITS = new Map([
  ['neutral_front34.png', {
    minimumSignalPixelFraction: 0.14, minimumP25: 32, minimumP50: 55,
  }],
  ['neutral_rear34.png', {
    minimumSignalPixelFraction: 0.14, minimumP25: 32, minimumP50: 55,
  }],
  ['capture_boom_close.png', {
    minimumSignalPixelFraction: 0.30, minimumP25: 30, minimumP50: 50,
  }],
  ['jaw_clevis_close.png', {
    minimumSignalPixelFraction: 0.20, minimumP25: 32, minimumP50: 55,
  }],
  ['tether_winch_close.png', {
    minimumSignalPixelFraction: 0.20, minimumP25: 30, minimumP50: 50,
  }],
  ['paired_drive_mount_close.png', {
    minimumSignalPixelFraction: 0.25, minimumP25: 30, minimumP50: 50,
  }],
  ['hard_grazing.png', {
    minimumSignalPixelFraction: 0.16, minimumP25: 18, minimumP50: 32,
  }],
  ['top_ortho.png', {
    minimumSignalPixelFraction: 0.18, minimumP25: 28, minimumP50: 45,
  }],
  ['emission_off.png', {
    minimumSignalPixelFraction: 0.25, minimumP25: 30, minimumP50: 50,
  }],
  ['game_120px.png', {
    minimumSignalPixelFraction: 0.15, minimumP25: 25, minimumP50: 40,
  }],
  ['game_45px.png', {
    minimumSignalPixelFraction: 0.15, minimumP25: 22, minimumP50: 34,
  }],
]);
const MATERIAL_ID_SCHEMA = 'spaceface.ashline-rig-semantic-material-id.v1';
const MATERIAL_ID_MAX_RGB_DISTANCE = 24;
const MATERIAL_ID_PALETTE = {
  Material_CableSteel: [240, 76, 76],
  Material_Cyan: [42, 224, 224],
  Material_Hardface: [255, 188, 56],
  Material_HotSection: [245, 76, 196],
  Material_Hull: [72, 128, 244],
  Material_Mechanical: [144, 88, 224],
  Material_PolishedSteel: [224, 224, 224],
  Material_Red_Paint: [224, 44, 44],
  Material_Refractory: [244, 232, 164],
};
const MATERIAL_RESPONSE_MAXIMUM_P50 = {
  Material_CableSteel: 170,
  Material_Cyan: 220,
  Material_Hardface: 180,
  Material_HotSection: 180,
  Material_Hull: 155,
  Material_Mechanical: 165,
  Material_PolishedSteel: 210,
  Material_Red_Paint: 175,
  Material_Refractory: 205,
};
const SEMANTIC_SURFACE_LIMITS = new Map([
  ['neutral_front34.png', {
    minimumRegionPixelFraction: 0.12,
    materials: {
      Material_Hull: { minimumPixels: 1400, minimumP25: 45, minimumP50: 70, minimumSpread: 18 },
      Material_Mechanical: {
        minimumPixels: 220, minimumP25: 25, minimumP50: 42, minimumSpread: 14,
      },
      Material_CableSteel: {
        minimumPixels: 18, minimumP25: 24, minimumP50: 38, minimumSpread: 10,
      },
    },
  }],
  ['neutral_rear34.png', {
    minimumRegionPixelFraction: 0.12,
    materials: {
      Material_Hull: { minimumPixels: 1400, minimumP25: 45, minimumP50: 70, minimumSpread: 18 },
      Material_Mechanical: {
        minimumPixels: 220, minimumP25: 25, minimumP50: 42, minimumSpread: 14,
      },
      Material_HotSection: {
        minimumPixels: 70, minimumP25: 28, minimumP50: 44, minimumSpread: 14,
      },
    },
  }],
  ['capture_boom_close.png', {
    minimumRegionPixelFraction: 0.20,
    materials: {
      Material_Hull: { minimumPixels: 5000, minimumP25: 38, minimumP50: 62, minimumSpread: 18 },
      Material_Mechanical: {
        minimumPixels: 350, minimumP25: 26, minimumP50: 44, minimumSpread: 14,
      },
    },
  }],
  ['jaw_clevis_close.png', {
    minimumRegionPixelFraction: 0.16,
    materials: {
      Material_Mechanical: {
        minimumPixels: 3000, minimumP25: 26, minimumP50: 44, minimumSpread: 16,
      },
      Material_Hardface: {
        minimumPixels: 180, minimumP25: 28, minimumP50: 48, minimumSpread: 14,
      },
      Material_PolishedSteel: {
        minimumPixels: 160, minimumP25: 38, minimumP50: 64, minimumSpread: 14,
      },
      Material_CableSteel: {
        minimumPixels: 60, minimumP25: 24, minimumP50: 40, minimumSpread: 10,
      },
    },
  }],
  ['tether_winch_close.png', {
    minimumRegionPixelFraction: 0.18,
    materials: {
      Material_Mechanical: {
        minimumPixels: 2800, minimumP25: 26, minimumP50: 44, minimumSpread: 16,
      },
      Material_CableSteel: {
        minimumPixels: 900, minimumP25: 24, minimumP50: 40, minimumSpread: 12,
      },
      Material_PolishedSteel: {
        minimumPixels: 180, minimumP25: 38, minimumP50: 64, minimumSpread: 14,
      },
      Material_Red_Paint: {
        minimumPixels: 180, minimumP25: 30, minimumP50: 52, minimumSpread: 14,
      },
    },
  }],
  ['paired_drive_mount_close.png', {
    minimumRegionPixelFraction: 0.18,
    materials: {
      Material_Hull: { minimumPixels: 500, minimumP25: 36, minimumP50: 58, minimumSpread: 16 },
      Material_Mechanical: {
        minimumPixels: 2200, minimumP25: 26, minimumP50: 44, minimumSpread: 16,
      },
      Material_HotSection: {
        minimumPixels: 1200, minimumP25: 28, minimumP50: 46, minimumSpread: 16,
      },
      Material_Refractory: {
        minimumPixels: 300, minimumP25: 30, minimumP50: 48, minimumSpread: 12,
      },
    },
  }],
  ['hard_grazing.png', {
    minimumRegionPixelFraction: 0.15,
    materials: {
      Material_Mechanical: {
        minimumPixels: 1800, minimumP25: 18, minimumP50: 34, minimumSpread: 22,
      },
      Material_HotSection: {
        minimumPixels: 900, minimumP25: 18, minimumP50: 34, minimumSpread: 24,
      },
      Material_Refractory: {
        minimumPixels: 220, minimumP25: 22, minimumP50: 38, minimumSpread: 16,
      },
    },
  }],
  ['top_ortho.png', {
    minimumRegionPixelFraction: 0.15,
    materials: {
      Material_Hull: { minimumPixels: 1800, minimumP25: 40, minimumP50: 64, minimumSpread: 16 },
      Material_Mechanical: {
        minimumPixels: 260, minimumP25: 24, minimumP50: 42, minimumSpread: 12,
      },
    },
  }],
  ['emission_off.png', {
    minimumRegionPixelFraction: 0.18,
    materials: {
      Material_Mechanical: {
        minimumPixels: 2200, minimumP25: 26, minimumP50: 44, minimumSpread: 16,
      },
      Material_HotSection: {
        minimumPixels: 1200, minimumP25: 28, minimumP50: 46, minimumSpread: 16,
      },
      Material_Refractory: {
        minimumPixels: 300, minimumP25: 30, minimumP50: 48, minimumSpread: 12,
      },
    },
  }],
  ['game_120px.png', {
    minimumRegionPixelFraction: 0.14,
    materials: {
      Material_Hull: { minimumPixels: 350, minimumP25: 34, minimumP50: 54, minimumSpread: 12 },
      Material_Mechanical: {
        minimumPixels: 40, minimumP25: 22, minimumP50: 36, minimumSpread: 8,
      },
      Material_HotSection: {
        minimumPixels: 12, minimumP25: 22, minimumP50: 36, minimumSpread: 8,
      },
      Material_Refractory: {
        minimumPixels: 4, minimumP25: 24, minimumP50: 38, minimumSpread: 6,
      },
    },
  }],
  ['game_45px.png', {
    minimumRegionPixelFraction: 0.12,
    materials: {
      Material_Hull: { minimumPixels: 40, minimumP25: 28, minimumP50: 46, minimumSpread: 8 },
      Material_Mechanical: {
        minimumPixels: 6, minimumP25: 18, minimumP50: 30, minimumSpread: 6,
      },
      Material_HotSection: {
        minimumPixels: 2, minimumP25: 18, minimumP50: 30, minimumSpread: 4,
      },
      Material_Refractory: {
        minimumPixels: 2, minimumP25: 20, minimumP50: 32, minimumSpread: 4,
      },
    },
  }],
]);
const EMISSION_DELTA_LIMITS = {
  pixelChannelThreshold: 2,
  minimumChangedPixels: 16,
  minimumAggregateRgbDelta: 512,
  minimumPeakChannelDelta: 4,
  maximumChangedPixelFraction: 0.02,
  maximumBoundingBoxFraction: 0.25,
};
const EXPECTED_VIEW_DIRECTIONS = new Map([
  ['neutral_front34.png', [0.42, -0.88, 0.21]],
  ['neutral_rear34.png', [-0.42, -0.88, 0.21]],
  ['capture_boom_close.png', [0.18, 0.32, -0.93]],
  ['jaw_clevis_close.png', [0.28, 0.88, -0.38]],
  ['tether_winch_close.png', [-0.12, 0.92, 0.38]],
  ['paired_drive_mount_close.png', [-0.78, -0.56, 0.28]],
  ['hard_grazing.png', [-0.78, -0.56, 0.28]],
  ['top_ortho.png', [0, 0, 1]],
  ['emission_off.png', [-0.78, -0.56, 0.28]],
  ['game_120px.png', [-0.86, -0.36, 0.46]],
  ['game_45px.png', [-0.86, -0.36, 0.46]],
]);
const EXPECTED_VIEW_LENSES = new Map([
  ['neutral_front34.png', 62],
  ['neutral_rear34.png', 62],
  ['capture_boom_close.png', 60],
  ['jaw_clevis_close.png', 62],
  ['tether_winch_close.png', 62],
  ['paired_drive_mount_close.png', 62],
  ['hard_grazing.png', 62],
  ['top_ortho.png', 50],
  ['emission_off.png', 62],
  ['game_120px.png', 62],
  ['game_45px.png', 62],
]);
const EXPECTED_LIGHTING_PROFILES = new Map(
  [...EXPECTED.keys()].map(
    (name) => [name, name === 'hard_grazing.png' ? 'hard-grazing' : 'neutral'],
  ),
);
const EXPECTED_LIGHTING_PROFILE_CONTRACT = {
  schema: 'spaceface.ashline-rig-evidence-lighting.v2',
  energyScale: {
    minimum: 1900,
    maximum: 7600,
    radiusSquaredMultiplier: 52,
    unit: 'W',
  },
  world: {
    backgroundColor: [0.30, 0.36, 0.48, 1],
  },
  profiles: {
    neutral: {
      exposure: 0.20,
      worldStrength: 2.10,
      lights: {
        ASHLINE_KEY: {
          type: 'AREA',
          shape: 'DISK',
          locationBasis: { direction: 1.45, right: -1.25, up: 0.82 },
          energyMultiplier: 1,
          minimumSize: 0.26,
          radiusSizeMultiplier: 0.09,
          color: [1, 0.98, 0.94],
        },
        ASHLINE_FILL: {
          type: 'AREA',
          shape: 'RECTANGLE',
          locationBasis: { direction: 0.75, right: 1.35, up: 0.22 },
          energyMultiplier: 2.2,
          minimumSize: 2.2,
          radiusSizeMultiplier: 0.72,
          color: [0.78, 0.84, 0.94],
        },
        ASHLINE_RIM: {
          type: 'AREA',
          shape: 'DISK',
          locationBasis: { direction: -1.55, right: -0.55, up: 0.68 },
          energyMultiplier: 0.55,
          minimumSize: 0.52,
          radiusSizeMultiplier: 0.20,
          color: [0.52, 0.70, 1],
        },
        ASHLINE_KICKER: {
          type: 'AREA',
          shape: 'DISK',
          locationBasis: { direction: -0.45, right: 1.05, up: 0.52 },
          energyMultiplier: 0.25,
          minimumSize: 0.38,
          radiusSizeMultiplier: 0.14,
          color: [1, 0.42, 0.18],
        },
      },
    },
    'hard-grazing': {
      exposure: 0.05,
      worldStrength: 1.35,
      lights: {
        ASHLINE_KEY: {
          type: 'AREA',
          shape: 'DISK',
          locationBasis: { direction: 0.30, right: 1.80, up: 0.20 },
          energyMultiplier: 1.15,
          minimumSize: 0.16,
          radiusSizeMultiplier: 0.045,
          color: [1, 0.94, 0.86],
        },
        ASHLINE_FILL: {
          type: 'AREA',
          shape: 'RECTANGLE',
          locationBasis: { direction: 0.75, right: -1.25, up: 0.30 },
          energyMultiplier: 1.2,
          minimumSize: 1.8,
          radiusSizeMultiplier: 0.65,
          color: [0.74, 0.82, 0.96],
        },
        ASHLINE_RIM: {
          type: 'AREA',
          shape: 'DISK',
          locationBasis: { direction: -1.65, right: 0.15, up: 0.72 },
          energyMultiplier: 0.38,
          minimumSize: 0.34,
          radiusSizeMultiplier: 0.12,
          color: [0.48, 0.66, 1],
        },
        ASHLINE_KICKER: {
          type: 'AREA',
          shape: 'DISK',
          locationBasis: { direction: -0.50, right: -1.05, up: 0.38 },
          energyMultiplier: 0.18,
          minimumSize: 0.24,
          radiusSizeMultiplier: 0.08,
          color: [1, 0.36, 0.12],
        },
      },
    },
  },
};
const EXPECTED_RENDER_PROVENANCE = {
  blender: {
    version: '5.1.2',
    versionTuple: [5, 1, 2],
  },
  settings: {
    engine: 'BLENDER_EEVEE',
    device: {
      class: 'GPU_RASTER',
      backend: 'OPENGL',
    },
    samples: {
      viewportTaa: 64,
      renderTaa: 64,
      taaReprojection: false,
    },
    png: {
      format: 'PNG',
      colorMode: 'RGBA',
      colorDepth: '8',
      compression: 15,
      useFileExtension: true,
    },
    colorManagement: {
      viewTransform: 'AgX',
      look: 'AgX - Medium High Contrast',
      exposure: 0.20,
      gamma: 1,
      curveMapping: false,
      ditherIntensity: 0,
    },
    filmTransparent: true,
    resolutionPercentage: 100,
    pixelAspect: {
      x: 1,
      y: 1,
    },
    lightingContract: EXPECTED_LIGHTING_PROFILE_CONTRACT,
    lightingContractSha256: canonicalJsonSha256(EXPECTED_LIGHTING_PROFILE_CONTRACT),
  },
};

const SEMANTIC_REQUIREMENTS = new Map([
  ['capture_boom', [
    ['Hook_BoomRootDoubler_', 2],
    ['Hook_BoomRootGusset_', 2],
    ['Hook_BoomRootTransition_', 2],
    ['Hook_BoomJawTransition_', 2],
    ['Hook_BoomChord_', 4],
    ['Hook_BoomWeb_', 6],
    ['Hook_BoomWebFrame_', 6],
    ['Hook_BoomSplice_', 16],
    ['Hook_ClevisEar_', 4],
    ['Hook_ClevisPin_', 2],
    ['Hook_ClevisCollar_', 2],
    ['Hook_ClevisRetainer_', 2],
  ]],
  ['jaw_clevis', [
    ['Hook_ClevisEar_', 4],
    ['Hook_ClevisPin_', 2],
    ['Hook_ClevisCollar_', 2],
    ['Hook_ClevisRetainer_', 2],
    ['Hook_JawArm_', 2],
    ['Hook_JawForging_', 2],
    ['Hook_JawKeeper_', 2],
    ['Hook_JawPad_', 6],
    ['Hook_JawPin_', 4],
    ['Hook_JawPivotBoss_', 2],
    ['Hook_JawActuatorEnd_', 2],
    ['Hook_JawHydraulicCase_', 2],
    ['Hook_JawHydraulicRod_', 2],
    ['Hook_JawHydraulicGland_', 2],
    ['Hook_JawHydraulicClevis_', 2],
    ['Hook_JawHydraulicRootPin_', 2],
    ['Hook_JawHydraulicHose_', 2],
  ]],
  ['tether_winch', [
    ['Hook_TetherBaseFrame_', 2],
    ['Hook_TetherDrum_Grooved', 1],
    ['Hook_TetherDrum_KeyedShaft', 1],
    ['Hook_TetherDrum_CableWrap', 1],
    ['Hook_TetherDrum_Bearing_', 2],
    ['Hook_TetherBearingCap_', 2],
    ['Hook_TetherDrum_BrakeBand', 1],
    ['Hook_TetherBrake_ServiceCover', 1],
    ['Hook_TetherDrum_ClutchLever', 1],
    ['Hook_TetherGuard_', 2],
    ['Hook_TetherFairlead_Sheave', 1],
    ['Hook_TetherFairlead_Guide', 2],
    ['Hook_TetherFairlead_Roller_', 2],
    ['Hook_TetherFairlead_DrumRun', 1],
    ['Hook_TetherFairlead_BraidedRun', 1],
    ['Hook_TetherFairlead_Terminal_', 2],
  ]],
  ['paired_drive', [
    ['Hook_DrivePressureCase_', 2],
    ['Hook_DriveHotSection_', 2],
    ['Hook_DriveBell_', 2],
    ['Hook_DriveCavityLiner_', 2],
    ['Hook_DriveRefractoryThroat_', 2],
    ['Hook_DriveInternalCue_', 2],
    ['Hook_DriveClamp_', 4],
    ['Hook_DriveThrustSaddle_', 2],
    ['Hook_DriveSaddleCheek_', 2],
    ['Hook_DriveSaddleFoot_', 4],
    ['Hook_DriveSaddleWeb_', 4],
    ['Hook_DriveRootDoubler_', 4],
    ['Hook_DriveRootLink_', 4],
    ['Hook_DriveServiceLine_', 2],
    ['Hook_DriveValveFitting_', 4],
    ['Hook_DriveValvePack_', 2],
    ['Hook_ServiceTag_Drive_', 2],
  ]],
  ['forward_mount', [
    ['Hook_ForwardMountSaddle', 1],
    ['Hook_ForwardMountGusset_', 2],
  ]],
]);

const authoredRigRequirements = [];
const authoredRigPrefixes = new Set();
for (const sourceGroup of [
  'capture_boom',
  'jaw_clevis',
  'tether_winch',
  'paired_drive',
  'forward_mount',
]) {
  for (const rule of SEMANTIC_REQUIREMENTS.get(sourceGroup)) {
    if (!authoredRigPrefixes.has(rule[0])) {
      authoredRigRequirements.push(rule);
      authoredRigPrefixes.add(rule[0]);
    }
  }
}
SEMANTIC_REQUIREMENTS.set('authored_rig', authoredRigRequirements);
SEMANTIC_REQUIREMENTS.set('full_rig', authoredRigRequirements);

const SEMANTIC_CONTRACT_GROUPS = new Map([
  ['authored_rig', 'authoredRig'],
  ['full_rig', 'fullRig'],
  ['capture_boom', 'capture'],
  ['jaw_clevis', 'jaw'],
  ['tether_winch', 'winch'],
  ['paired_drive', 'drives'],
  ['forward_mount', 'forwardMount'],
]);
const SEMANTIC_GROUP_COUNTS = new Map([
  ['capture_boom', 50],
  ['jaw_clevis', 42],
  ['tether_winch', 23],
  ['paired_drive', 46],
  ['forward_mount', 3],
  ['authored_rig', 154],
  ['full_rig', 154],
]);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalJsonSha256(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex').toUpperCase();
}

function glbEvidenceSource(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', 'source must be a GLB');
  assert.equal(bytes.readUInt32LE(4), 2, 'source must use glTF 2');
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    assert.ok(end <= bytes.length, 'GLB chunk extends past source bytes');
    if (type === 0x4E4F534A) {
      const json = JSON.parse(bytes.toString('utf8', start, end).replace(/\u0000+$/u, ''));
      const root = (json.nodes ?? []).find((node) => node.name === RIG_ROOT_NAME);
      assert.ok(root, `source must contain exact root ${RIG_ROOT_NAME}`);
      return {
        semanticBounds: root.extras?.spaceface?.materialTruth?.semanticBounds,
        componentInventory: root.extras?.spaceface?.materialTruth?.componentInventory,
      };
    }
    offset = end;
  }
  assert.fail('source GLB has no JSON chunk');
}

function roundedGroup(group) {
  const rounded = {
    components: [...group.components],
    ...Object.fromEntries(
      ['min', 'max', 'center', 'size'].map((field) => [
        field,
        Object.fromEntries(
          ['x', 'y', 'z'].map((axis) => [axis, Number(group[field][axis].toFixed(6))]),
        ),
      ]),
    ),
  };
  if (group.visualNodes) {
    rounded.visualNodes = group.visualNodes.map((entry) => ({
      name: entry.name,
      materials: [...entry.materials],
    }));
  }
  return rounded;
}

function assertRootSemanticContract(contract) {
  assert.ok(contract && typeof contract === 'object', 'source semanticBounds contract');
  assert.equal(contract.schema, SEMANTIC_SCHEMA);
  assert.equal(contract.basis, SEMANTIC_BASIS);
  assert.deepEqual(
    Object.keys(contract.groups).sort(),
    ['authoredRig', 'capture', 'drives', 'forwardMount', 'fullRig', 'jaw', 'winch'],
  );
  for (const [name, group] of Object.entries(contract.groups)) {
    assert.ok(Array.isArray(group.components), `${name} components`);
    assert.deepEqual(
      group.components,
      [...new Set(group.components)].sort(),
      `${name} components must be sorted and unique`,
    );
    for (const field of ['min', 'max', 'center', 'size']) {
      assertFiniteVector(
        ['x', 'y', 'z'].map((axis) => group[field]?.[axis]),
        `${name}.${field}`,
      );
    }
    for (const axis of ['x', 'y', 'z']) {
      const expectedSize = group.max[axis] - group.min[axis];
      const expectedCenter = (group.max[axis] + group.min[axis]) * 0.5;
      assert.ok(expectedSize > 0, `${name}.${axis} bounds must be non-degenerate`);
      assert.ok(
        Math.abs(group.size[axis] - expectedSize) <= 1e-5,
        `${name}.${axis} size must match min/max`,
      );
      assert.ok(
        Math.abs(group.center[axis] - expectedCenter) <= 1e-5,
        `${name}.${axis} center must match min/max`,
      );
    }
  }
  for (const [semanticGroup, contractGroup] of SEMANTIC_CONTRACT_GROUPS) {
    assert.equal(
      contract.groups[contractGroup].components.length,
      SEMANTIC_GROUP_COUNTS.get(semanticGroup),
      `${contractGroup} exact component count`,
    );
  }

  const closeGroups = ['capture', 'jaw', 'winch', 'drives', 'forwardMount'].map(
    (name) => contract.groups[name],
  );
  const componentUnion = [...new Set(closeGroups.flatMap((group) => group.components))].sort();
  assert.deepEqual(contract.groups.authoredRig.components, componentUnion);
  assert.deepEqual(contract.groups.fullRig.components, contract.groups.authoredRig.components);
  assert.ok(contract.groups.fullRig.visualNodes.length > 0, 'fullRig visual nodes');
  assert.deepEqual(
    contract.groups.fullRig.visualNodes,
    [...contract.groups.fullRig.visualNodes].sort(
      (left, right) => left.name.localeCompare(right.name),
    ),
    'fullRig visual nodes must be sorted',
  );
  assert.deepEqual(
    contract.groups.fullRig.visualNodes,
    EXPECTED_VISIBLE_LOD0_MATERIALS.map((material) => ({
      name: `LOD0_Merged_${material}`,
      materials: [material],
    })),
    'fullRig visual nodes must be the exact unique nine-material split',
  );
  const visualMaterials = [];
  for (const node of contract.groups.fullRig.visualNodes) {
    assert.equal(node.materials.length, 1, `fullRig visual node ${node.name} material count`);
    assert.equal(
      node.name,
      `LOD0_Merged_${node.materials[0]}`,
      `fullRig visual node ${node.name} exact material split`,
    );
    assert.deepEqual(node.materials, [...new Set(node.materials)].sort());
    visualMaterials.push(...node.materials);
  }
  assert.deepEqual(
    [...new Set(visualMaterials)].sort(),
    EXPECTED_VISIBLE_LOD0_MATERIALS,
    'fullRig visual nodes must expose exactly the nine authored LOD0 materials',
  );
  for (const axis of ['x', 'y', 'z']) {
    assert.equal(
      contract.groups.authoredRig.min[axis],
      Math.min(...closeGroups.map((group) => group.min[axis])),
      `authoredRig ${axis} minimum`,
    );
    assert.equal(
      contract.groups.authoredRig.max[axis],
      Math.max(...closeGroups.map((group) => group.max[axis])),
      `authoredRig ${axis} maximum`,
    );
    assert.ok(
      contract.groups.fullRig.min[axis] <= contract.groups.authoredRig.min[axis]
      && contract.groups.fullRig.max[axis] >= contract.groups.authoredRig.max[axis],
      `fullRig must contain authoredRig on ${axis}`,
    );
  }
}

function assertFiniteVector(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.equal(value.length, 3, `${label} must contain three coordinates`);
  assert.ok(value.every(Number.isFinite), `${label} must contain finite coordinates`);
}

function vectorDot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function vectorLength(value) {
  return Math.hypot(...value);
}

function normalizedVector(value) {
  const length = vectorLength(value);
  assert.ok(length > 0, 'direction vector must be non-zero');
  return value.map((coordinate) => coordinate / length);
}

function assertVectorNear(actual, expected, tolerance, label) {
  assertFiniteVector(actual, label);
  assertFiniteVector(expected, `${label} expected`);
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(
      Math.abs(actual[axis] - expected[axis]) <= tolerance,
      `${label}[${axis}] ${actual[axis]} != ${expected[axis]}`,
    );
  }
}

function assertLightingEvidence(artifact, fileName) {
  const expectedProfileName = EXPECTED_LIGHTING_PROFILES.get(fileName);
  const profile = EXPECTED_LIGHTING_PROFILE_CONTRACT.profiles[expectedProfileName];
  assert.ok(profile, `${fileName} expected lighting profile`);
  assert.equal(artifact.lighting.profile, expectedProfileName, `${fileName} lighting profile`);
  assert.equal(
    artifact.lighting.contractSha256,
    canonicalJsonSha256(EXPECTED_LIGHTING_PROFILE_CONTRACT),
    `${fileName} lighting contract hash`,
  );
  assert.equal(artifact.lighting.exposure, profile.exposure, `${fileName} exposure`);
  assert.equal(
    artifact.lighting.worldStrength,
    profile.worldStrength,
    `${fileName} world strength`,
  );

  const radius = vectorLength(artifact.semantic.bounds.size) * 0.5;
  const scaleContract = EXPECTED_LIGHTING_PROFILE_CONTRACT.energyScale;
  const expectedEnergyScale = Math.max(
    scaleContract.minimum,
    Math.min(scaleContract.maximum, scaleContract.radiusSquaredMultiplier * radius * radius),
  );
  assert.ok(
    Math.abs(artifact.lighting.energyScale - expectedEnergyScale) <= 0.001,
    `${fileName} radius-bound energy scale`,
  );
  assert.deepEqual(
    Object.keys(artifact.lighting.lights).sort(),
    Object.keys(profile.lights).sort(),
    `${fileName} bound light set`,
  );
  for (const [name, lightContract] of Object.entries(profile.lights)) {
    const light = artifact.lighting.lights[name];
    assert.equal(light.type, lightContract.type, `${fileName} ${name} type`);
    assert.equal(light.shape, lightContract.shape, `${fileName} ${name} shape`);
    assert.deepEqual(light.color, lightContract.color, `${fileName} ${name} color`);
    assert.ok(
      Math.abs(light.energy - expectedEnergyScale * lightContract.energyMultiplier) <= 0.001,
      `${fileName} ${name} energy`,
    );
    assert.ok(
      Math.abs(
        light.size
          - Math.max(lightContract.minimumSize, radius * lightContract.radiusSizeMultiplier),
      ) <= 0.001,
      `${fileName} ${name} size`,
    );
    const basis = lightContract.locationBasis;
    const expectedLocation = artifact.camera.target.map(
      (coordinate, axis) => coordinate
        + artifact.camera.direction[axis] * basis.direction * radius
        + artifact.camera.right[axis] * basis.right * radius
        + artifact.camera.up[axis] * basis.up * radius,
    );
    assertVectorNear(light.location, expectedLocation, 0.00002, `${fileName} ${name} location`);
  }
}

function rendererLightingContract(rendererSource) {
  const match = rendererSource.match(
    /LIGHTING_PROFILE_CONTRACT = json\.loads\(\s*r"""\s*([\s\S]*?)\s*""",\s*\)/u,
  );
  assert.ok(match, 'renderer must expose a machine-readable lighting contract');
  return JSON.parse(match[1]);
}

function rendererViewCamera(rendererSource, fileName) {
  const escapedName = fileName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const viewMatch = rendererSource.match(
    new RegExp(
      `"name":\\s*"${escapedName}"[\\s\\S]{0,900}?"direction":\\s*\\(([^)]+)\\)`
        + `[\\s\\S]{0,300}?"lens":\\s*([0-9.]+)`,
      'u',
    ),
  );
  assert.ok(viewMatch, `renderer must pin ${fileName} camera`);
  const direction = viewMatch[1].split(',').map((value) => Number.parseFloat(value.trim()));
  assertFiniteVector(direction, `${fileName} renderer direction`);
  return {
    direction,
    lens: Number.parseFloat(viewMatch[2]),
  };
}

function assertFullRigCornersInsideCamera(artifact) {
  const { camera, semantic } = artifact;
  for (const field of ['location', 'target', 'direction', 'right', 'up']) {
    assertFiniteVector(camera[field], `${artifact.path} camera.${field}`);
  }
  assert.ok(Math.abs(vectorLength(camera.direction) - 1) <= 2e-5);
  assert.ok(Math.abs(vectorLength(camera.right) - 1) <= 2e-5);
  assert.ok(Math.abs(vectorLength(camera.up) - 1) <= 2e-5);
  assert.ok(Math.abs(vectorDot(camera.direction, camera.right)) <= 2e-5);
  assert.ok(Math.abs(vectorDot(camera.direction, camera.up)) <= 2e-5);
  assert.ok(Math.abs(vectorDot(camera.right, camera.up)) <= 2e-5);
  assert.equal(camera.fitSafetyFactor, 1.00005);
  assert.ok(Math.abs(camera.projectedCornerLimit - 1 / camera.margin) <= 2e-6);

  const forward = camera.direction.map((value) => -value);
  const corners = [];
  for (const x of [semantic.bounds.min[0], semantic.bounds.max[0]]) {
    for (const y of [semantic.bounds.min[1], semantic.bounds.max[1]]) {
      for (const z of [semantic.bounds.min[2], semantic.bounds.max[2]]) {
        corners.push([x, y, z]);
      }
    }
  }
  let maximumX = 0;
  let maximumY = 0;
  for (const corner of corners) {
    const relative = corner.map((value, axis) => value - camera.location[axis]);
    let projectedX;
    let projectedY;
    if (camera.projection === 'perspective') {
      const depth = vectorDot(relative, forward);
      assert.ok(depth > 0, `${artifact.path} fullRig corner is behind camera`);
      const tanHorizontal = camera.sensorWidthMm / (2 * camera.lensMm);
      const tanVertical = tanHorizontal / camera.aspect;
      projectedX = Math.abs(vectorDot(relative, camera.right)) / (depth * tanHorizontal);
      projectedY = Math.abs(vectorDot(relative, camera.up)) / (depth * tanVertical);
    } else {
      assert.equal(camera.projection, 'orthographic');
      // Blender's orthoScale is the horizontal image-plane span; vertical span is scale/aspect.
      projectedX = 2 * Math.abs(vectorDot(relative, camera.right)) / camera.orthoScale;
      projectedY = 2 * Math.abs(vectorDot(relative, camera.up)) * camera.aspect
        / camera.orthoScale;
    }
    maximumX = Math.max(maximumX, projectedX);
    maximumY = Math.max(maximumY, projectedY);
    assert.ok(
      projectedX <= camera.projectedCornerLimit,
      `${artifact.path} fullRig corner exceeds horizontal margin: ${projectedX}`,
    );
    assert.ok(
      projectedY <= camera.projectedCornerLimit,
      `${artifact.path} fullRig corner exceeds vertical margin: ${projectedY}`,
    );
  }
  assert.ok(
    Math.abs(camera.projectedCornerMaximum[0] - maximumX) <= 0.000002,
    `${artifact.path} horizontal camera-containment audit`,
  );
  assert.ok(
    Math.abs(camera.projectedCornerMaximum[1] - maximumY) <= 0.000002,
    `${artifact.path} vertical camera-containment audit`,
  );
}

function assertSemanticEvidence(artifact, sourceEvidence) {
  const { semantic } = artifact;
  assert.ok(semantic && typeof semantic === 'object', `${artifact.path} semantic metadata`);
  assert.equal(
    semantic.components.length,
    new Set(semantic.components).size,
    `${artifact.path} duplicate components`,
  );
  assertFiniteVector(semantic.bounds.min, `${artifact.path} bounds.min`);
  assertFiniteVector(semantic.bounds.max, `${artifact.path} bounds.max`);
  assertFiniteVector(semantic.bounds.center, `${artifact.path} bounds.center`);
  assertFiniteVector(semantic.bounds.size, `${artifact.path} bounds.size`);
  assert.ok(semantic.bounds.size.every((value) => value > 0), `${artifact.path} degenerate bounds`);
  assert.deepEqual(
    artifact.camera.target,
    semantic.bounds.center,
    `${artifact.path} target must be its computed semantic-bounds center`,
  );

  assert.equal(
    semantic.boundsSource,
    semantic.group === 'full_rig'
      ? 'root-semantic-full-rig-bounds'
      : 'root-semantic-component-bounds',
  );
  const expectedRules = SEMANTIC_REQUIREMENTS.get(semantic.group);
  assert.ok(expectedRules, `${artifact.path} unknown semantic group ${semantic.group}`);
  assert.equal(
    semantic.components.length,
    SEMANTIC_GROUP_COUNTS.get(semantic.group),
    `${artifact.path} exact semantic group component count`,
  );
  const contractGroup = SEMANTIC_CONTRACT_GROUPS.get(semantic.group);
  assert.equal(semantic.contract.root, RIG_ROOT_NAME);
  assert.equal(semantic.contract.schema, SEMANTIC_SCHEMA);
  assert.equal(semantic.contract.basis, SEMANTIC_BASIS);
  assert.equal(semantic.contract.importConversion, SEMANTIC_IMPORT_CONVERSION);
  assert.equal(semantic.contract.group, contractGroup);
  const sourceGroup = sourceEvidence.semanticBounds.groups[contractGroup];
  assert.deepEqual(semantic.components, sourceGroup.components);
  assert.deepEqual(semantic.rootLocalBounds, roundedGroup(sourceGroup));
  if (semantic.group === 'full_rig') {
    assert.ok(
      artifact.camera.margin >= 1.035 && artifact.camera.margin <= 1.07,
      `${artifact.path} fullRig margin must remain tight without cropping`,
    );
    assert.equal(semantic.materialFocusProvenance.contractGroup, 'authoredRig');
    assert.deepEqual(
      semantic.materialFocusProvenance.components,
      sourceEvidence.semanticBounds.groups.authoredRig.components,
    );
    assert.deepEqual(
      semantic.materialFocusProvenance.rootLocalBounds,
      roundedGroup(sourceEvidence.semanticBounds.groups.authoredRig),
    );
  }
  assert.equal(semantic.requirements.length, expectedRules.length);
  for (const [namePrefix, expectedCount] of expectedRules) {
    const matches = semantic.components.filter((name) => name.startsWith(namePrefix));
    assert.equal(
      matches.length,
      expectedCount,
      `${artifact.path} ${namePrefix} matched ${matches.length}, expected exactly ${expectedCount}`,
    );
    const audit = semantic.requirements.find((item) => item.namePrefix === namePrefix);
    assert.deepEqual(audit, {
      namePrefix,
      expectedCount,
      matchedCount: matches.length,
    });
  }
}

function lumaMetricsFromRaw(data, info) {
  assert.equal(info.channels, 3, 'luma guard expects RGB');
  let sum = 0;
  let belowEight = 0;
  let above247 = 0;
  const histogram = Array(256).fill(0);
  const pixels = info.width * info.height;
  for (let offset = 0; offset < data.length; offset += 3) {
    const luma = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
    sum += luma;
    if (luma < 8) belowEight += 1;
    if (luma >= LUMA_UPPER_CLIP_THRESHOLD) above247 += 1;
    histogram[Math.max(0, Math.min(255, Math.floor(luma)))] += 1;
  }
  const percentile = (fraction) => {
    const target = Math.max(1, Math.ceil(pixels * fraction));
    let cumulative = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      cumulative += histogram[value];
      if (cumulative >= target) return value;
    }
    assert.fail('luma histogram does not contain every decoded pixel');
  };
  const p5 = percentile(0.05);
  const p95 = percentile(0.95);
  return {
    mean: sum / pixels,
    belowEightFraction: belowEight / pixels,
    above247Fraction: above247 / pixels,
    p5,
    p95,
    p5P95Spread: p95 - p5,
  };
}

async function lumaMetrics(path) {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return lumaMetricsFromRaw(data, info);
}

function lumaEligibilityFailures(metrics, limits) {
  const failures = [];
  if (metrics.mean < limits.minimumMean) failures.push('mean');
  if (metrics.belowEightFraction > limits.maximumBelowEight) {
    failures.push('belowEightFraction');
  }
  if (metrics.above247Fraction > limits.maximumAbove247Fraction) {
    failures.push('above247Fraction');
  }
  if (metrics.p5P95Spread < limits.minimumP5P95Spread) {
    failures.push('p5P95Spread');
  }
  return failures;
}

function frameMetricsFromRaw(data, info) {
  assert.equal(info.channels, 3, 'frame guard expects RGB');
  const pixelAt = (x, y) => {
    const offset = (y * info.width + x) * 3;
    return [data[offset], data[offset + 1], data[offset + 2]];
  };
  const edgeCounts = new Map();
  const countEdgePixel = (pixel) => {
    const key = (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < info.width; x += 1) {
    countEdgePixel(pixelAt(x, 0));
    countEdgePixel(pixelAt(x, info.height - 1));
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    countEdgePixel(pixelAt(0, y));
    countEdgePixel(pixelAt(info.width - 1, y));
  }
  const [backgroundKey] = [...edgeCounts.entries()]
    .sort((left, right) => right[1] - left[1])[0];
  const backgroundRgb = [
    (backgroundKey >> 16) & 0xFF,
    (backgroundKey >> 8) & 0xFF,
    backgroundKey & 0xFF,
  ];
  const isSignal = (x, y) => pixelAt(x, y).reduce(
    (distance, value, channel) => distance + Math.abs(value - backgroundRgb[channel]),
    0,
  ) >= FRAME_SIGNAL_RGB_DISTANCE;
  let signalPixels = 0;
  const foregroundHistogram = Array(256).fill(0);
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (!isSignal(x, y)) continue;
      signalPixels += 1;
      const pixel = pixelAt(x, y);
      const luma = 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2];
      foregroundHistogram[Math.max(0, Math.min(255, Math.floor(luma)))] += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const edgeFraction = (points) => points.reduce(
    (count, [x, y]) => count + Number(isSignal(x, y)),
    0,
  ) / points.length;
  const pixels = info.width * info.height;
  const boundingArea = signalPixels
    ? (maxX - minX + 1) * (maxY - minY + 1)
    : 0;
  assert.ok(signalPixels > 0, 'foreground mask must contain subject pixels');
  const foregroundPercentile = (fraction) => {
    const target = Math.max(1, Math.ceil(signalPixels * fraction));
    let cumulative = 0;
    for (let value = 0; value < foregroundHistogram.length; value += 1) {
      cumulative += foregroundHistogram[value];
      if (cumulative >= target) return value;
    }
    assert.fail('foreground histogram lost masked subject pixels');
  };
  return {
    backgroundRgb,
    signalRgbDistance: FRAME_SIGNAL_RGB_DISTANCE,
    signalPixelFraction: signalPixels / pixels,
    foregroundLuma: {
      signalPixelFraction: signalPixels / pixels,
      p25: foregroundPercentile(0.25),
      p50: foregroundPercentile(0.50),
    },
    signalBoundingBoxFraction: boundingArea / pixels,
    signalBoundingBox: signalPixels ? { min: [minX, minY], max: [maxX, maxY] } : null,
    edgeSignalFractions: {
      left: edgeFraction(Array.from({ length: info.height }, (_, y) => [0, y])),
      right: edgeFraction(Array.from({ length: info.height }, (_, y) => [info.width - 1, y])),
      top: edgeFraction(Array.from({ length: info.width }, (_, x) => [x, 0])),
      bottom: edgeFraction(Array.from({ length: info.width }, (_, x) => [x, info.height - 1])),
    },
  };
}

async function frameMetrics(path) {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return frameMetricsFromRaw(data, info);
}

function frameEligibilityFailures(metrics, limits) {
  const failures = [];
  if (metrics.signalPixelFraction < limits.minimumSignalPixelFraction) {
    failures.push('signalPixelFraction');
  }
  if (metrics.signalBoundingBoxFraction < limits.minimumSignalBoundingBoxFraction) {
    failures.push('signalBoundingBoxFraction');
  }
  for (const [edge, fraction] of Object.entries(metrics.edgeSignalFractions)) {
    if (fraction > limits.maximumEdgeSignalFraction) {
      failures.push(`${edge}EdgeSignalFraction`);
    }
  }
  return failures;
}

function foregroundLumaEligibilityFailures(metrics, limits) {
  const failures = [];
  if (metrics.signalPixelFraction < limits.minimumSignalPixelFraction) {
    failures.push('signalPixelFraction');
  }
  if (metrics.p25 < limits.minimumP25) failures.push('p25');
  if (metrics.p50 < limits.minimumP50) failures.push('p50');
  return failures;
}

function semanticSurfaceMetricsFromRaw(beauty, materialIds, info, region, palette) {
  assert.equal(info.channels, 3, 'semantic surface guard expects RGB');
  assert.equal(beauty.length, materialIds.length, 'beauty and material ID buffers must match');
  const histograms = Object.fromEntries(
    Object.keys(palette).map((material) => [material, Array(256).fill(0)]),
  );
  const counts = Object.fromEntries(Object.keys(palette).map((material) => [material, 0]));
  const nearestMaterial = (offset) => {
    let selected = null;
    let selectedDistance = Number.POSITIVE_INFINITY;
    for (const [material, color] of Object.entries(palette)) {
      const distance = color.reduce(
        (sum, value, channel) => sum + Math.abs(value - materialIds[offset + channel]),
        0,
      );
      if (distance < selectedDistance) {
        selected = material;
        selectedDistance = distance;
      }
    }
    return selectedDistance <= MATERIAL_ID_MAX_RGB_DISTANCE ? selected : null;
  };
  let classifiedPixels = 0;
  for (let y = region.min[1]; y <= region.max[1]; y += 1) {
    for (let x = region.min[0]; x <= region.max[0]; x += 1) {
      const offset = (y * info.width + x) * 3;
      const material = nearestMaterial(offset);
      if (!material) continue;
      classifiedPixels += 1;
      counts[material] += 1;
      const luma = 0.2126 * beauty[offset]
        + 0.7152 * beauty[offset + 1]
        + 0.0722 * beauty[offset + 2];
      histograms[material][Math.max(0, Math.min(255, Math.floor(luma)))] += 1;
    }
  }
  const regionPixels = (region.max[0] - region.min[0] + 1)
    * (region.max[1] - region.min[1] + 1);
  const percentile = (histogram, pixels, fraction) => {
    if (!pixels) return null;
    const target = Math.max(1, Math.ceil(pixels * fraction));
    let cumulative = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      cumulative += histogram[value];
      if (cumulative >= target) return value;
    }
    assert.fail('semantic material histogram lost pixels');
  };
  return {
    region,
    regionPixels,
    classifiedPixels,
    regionPixelFraction: classifiedPixels / regionPixels,
    materials: Object.fromEntries(Object.keys(palette).map((material) => {
      const pixels = counts[material];
      const p10 = percentile(histograms[material], pixels, 0.10);
      const p25 = percentile(histograms[material], pixels, 0.25);
      const p50 = percentile(histograms[material], pixels, 0.50);
      const p90 = percentile(histograms[material], pixels, 0.90);
      return [material, {
        pixels,
        p10,
        p25,
        p50,
        p90,
        spread: pixels ? p90 - p10 : null,
      }];
    })),
  };
}

function semanticSurfaceEligibilityFailures(metrics, limits) {
  const failures = [];
  if (metrics.regionPixelFraction < limits.minimumRegionPixelFraction) {
    failures.push('regionPixelFraction');
  }
  for (const [material, materialLimits] of Object.entries(limits.materials)) {
    const measured = metrics.materials[material];
    if (!measured || measured.pixels < materialLimits.minimumPixels) {
      failures.push(`${material}.pixels`);
      continue;
    }
    if (measured.p25 < materialLimits.minimumP25) failures.push(`${material}.p25`);
    if (measured.p50 < materialLimits.minimumP50) failures.push(`${material}.p50`);
    if (measured.p50 > MATERIAL_RESPONSE_MAXIMUM_P50[material]) {
      failures.push(`${material}.washedP50`);
    }
    if (measured.spread < materialLimits.minimumSpread) failures.push(`${material}.spread`);
  }
  return failures;
}

async function emissionDeltaMetrics(firstPath, secondPath, cueRegion) {
  const [first, second] = await Promise.all([
    sharp(firstPath).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(secondPath).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  assert.deepEqual(first.info, second.info, 'matched emission frames must have identical layout');
  let changedPixels = 0;
  let aggregateRgbDelta = 0;
  let meaningfulRgbDelta = 0;
  let changedPixelsWithinCue = 0;
  let meaningfulRgbDeltaWithinCue = 0;
  let peakChannelDelta = 0;
  let minX = first.info.width;
  let minY = first.info.height;
  let maxX = -1;
  let maxY = -1;
  for (
    let offset = 0, pixelIndex = 0;
    offset < first.data.length;
    offset += first.info.channels, pixelIndex += 1
  ) {
    const deltas = Array.from(
      { length: first.info.channels },
      (_, channel) => Math.abs(first.data[offset + channel] - second.data[offset + channel]),
    );
    aggregateRgbDelta += deltas.reduce((sum, value) => sum + value, 0);
    const pixelPeak = Math.max(...deltas);
    peakChannelDelta = Math.max(peakChannelDelta, pixelPeak);
    if (pixelPeak >= EMISSION_DELTA_LIMITS.pixelChannelThreshold) {
      changedPixels += 1;
      meaningfulRgbDelta += deltas.reduce((sum, value) => sum + value, 0);
      const x = pixelIndex % first.info.width;
      const y = Math.floor(pixelIndex / first.info.width);
      if (
        x >= cueRegion.min[0] && x <= cueRegion.max[0]
        && y >= cueRegion.min[1] && y <= cueRegion.max[1]
      ) {
        changedPixelsWithinCue += 1;
        meaningfulRgbDeltaWithinCue += deltas.reduce((sum, value) => sum + value, 0);
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const pixelCount = first.info.width * first.info.height;
  const boundingArea = changedPixels
    ? (maxX - minX + 1) * (maxY - minY + 1)
    : 0;
  return {
    changedPixels,
    aggregateRgbDelta,
    meaningfulRgbDelta,
    peakChannelDelta,
    changedPixelFraction: changedPixels / pixelCount,
    boundingBoxFraction: boundingArea / pixelCount,
    boundingBox: changedPixels
      ? { min: [minX, minY], max: [maxX, maxY] }
      : null,
    cueRegion,
    changedPixelsWithinCue,
    meaningfulRgbDeltaWithinCue,
    changedPixelsWithinCueFraction: changedPixelsWithinCue / changedPixels,
    meaningfulRgbDeltaWithinCueFraction: meaningfulRgbDeltaWithinCue / meaningfulRgbDelta,
  };
}

test('Rig semantic material-ID fixture rejects crushed causal surfaces', () => {
  const width = 16;
  const height = 16;
  const info = { width, height, channels: 3 };
  const region = { min: [2, 2], max: [13, 13] };
  const materialIds = Buffer.alloc(width * height * 3);
  const rich = Buffer.alloc(width * height * 3);
  const crushed = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const inRegion = x >= 2 && x <= 13 && y >= 2 && y <= 13;
      const mechanical = x < 8;
      const id = inRegion
        ? MATERIAL_ID_PALETTE[mechanical ? 'Material_Mechanical' : 'Material_HotSection']
        : [0, 0, 0];
      materialIds.set(id, offset);
      const richValue = inRegion ? 28 + ((x + y) % 8) * 12 : 4;
      const crushedValue = inRegion ? ((x + y) % 11 === 0 ? 190 : 14) : 4;
      rich.set([richValue, richValue, richValue], offset);
      crushed.set([crushedValue, crushedValue, crushedValue], offset);
    }
  }
  const limits = {
    minimumRegionPixelFraction: 0.80,
    materials: {
      Material_Mechanical: {
        minimumPixels: 40, minimumP25: 28, minimumP50: 48, minimumSpread: 30,
      },
      Material_HotSection: {
        minimumPixels: 40, minimumP25: 28, minimumP50: 48, minimumSpread: 30,
      },
    },
  };
  const richMetrics = semanticSurfaceMetricsFromRaw(
    rich,
    materialIds,
    info,
    region,
    MATERIAL_ID_PALETTE,
  );
  const crushedMetrics = semanticSurfaceMetricsFromRaw(
    crushed,
    materialIds,
    info,
    region,
    MATERIAL_ID_PALETTE,
  );
  assert.deepEqual(semanticSurfaceEligibilityFailures(richMetrics, limits), []);
  assert.ok(
    semanticSurfaceEligibilityFailures(crushedMetrics, limits).includes(
      'Material_Mechanical.p25',
    ),
    'sparse highlights must not rescue crushed local mechanical structure',
  );
  const absentIds = Buffer.alloc(materialIds.length);
  const absent = semanticSurfaceMetricsFromRaw(rich, absentIds, info, region, MATERIAL_ID_PALETTE);
  assert.deepEqual(
    semanticSurfaceEligibilityFailures(absent, limits),
    ['regionPixelFraction', 'Material_Mechanical.pixels', 'Material_HotSection.pixels'],
    'unclassified or missing material-ID pixels must fail closed',
  );
});

test('Rig frame metrics reject crops and underfilled fullRig fixtures', () => {
  const width = 16;
  const height = 16;
  const background = [13, 22, 31];
  const signal = [180, 170, 160];
  const fixture = (isSignal) => {
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = isSignal(x, y) ? signal : background;
        const offset = (y * width + x) * 3;
        data[offset] = pixel[0];
        data[offset + 1] = pixel[1];
        data[offset + 2] = pixel[2];
      }
    }
    return frameMetricsFromRaw(data, { width, height, channels: 3 });
  };
  const limits = FRAME_LIMITS.get('game_120px.png');
  const wellFramed = fixture((x, y) => x >= 3 && x <= 12 && y >= 3 && y <= 12);
  const underfilled = fixture((x, y) => x >= 7 && x <= 8 && y >= 7 && y <= 8);
  const cropped = fixture((x, y) => x <= 5 && y >= 2 && y <= 13);

  assert.deepEqual(frameEligibilityFailures(wellFramed, limits), []);
  assert.ok(
    frameEligibilityFailures(underfilled, limits).includes('signalPixelFraction'),
    'a distant fullRig must fail the signal-occupancy floor',
  );
  assert.ok(
    frameEligibilityFailures(underfilled, limits).includes('signalBoundingBoxFraction'),
    'a distant fullRig must fail the frame-span floor',
  );
  assert.ok(
    frameEligibilityFailures(cropped, limits).includes('leftEdgeSignalFraction'),
    'a fullRig touching an image edge must fail the crop guard',
  );
});

test('Rig foreground luma rejects sparse highlights over crushed subject structure', () => {
  const width = 16;
  const height = 16;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let pixel = [3, 3, 3];
      if (x >= 2 && x <= 13 && y >= 2 && y <= 13) {
        pixel = x === 2 ? [180, 180, 180] : [24, 24, 24];
      }
      const offset = (y * width + x) * 3;
      data[offset] = pixel[0];
      data[offset + 1] = pixel[1];
      data[offset + 2] = pixel[2];
    }
  }
  const info = { width, height, channels: 3 };
  const wholeFrame = lumaMetricsFromRaw(data, info);
  const foreground = frameMetricsFromRaw(data, info).foregroundLuma;
  assert.ok(
    wholeFrame.p5P95Spread > 20,
    'whole-frame contrast can look healthy while semantic-local machinery is crushed',
  );
  assert.deepEqual(
    foregroundLumaEligibilityFailures(
      foreground,
      FOREGROUND_LUMA_LIMITS.get('capture_boom_close.png'),
    ),
    ['p25', 'p50'],
    'foreground quartile and median must reject crushed subject midtones',
  );
  assert.deepEqual(
    foregroundLumaEligibilityFailures(
      { signalPixelFraction: 0.01, p25: 180, p50: 180 },
      FOREGROUND_LUMA_LIMITS.get('capture_boom_close.png'),
    ),
    ['signalPixelFraction'],
    'a few bright edges must not masquerade as an illuminated subject',
  );
});

test('Rig exact source exposes complete pre-merge semantic bounds on its root', () => {
  const sourceEvidence = glbEvidenceSource(SOURCE);
  assertRootSemanticContract(sourceEvidence.semanticBounds);
  assert.equal(sourceEvidence.componentInventory?.schema, COMPONENT_INVENTORY_SCHEMA);
  const cue = sourceEvidence.componentInventory.roles.find((row) => row.role === 'driveInternalCue');
  assert.deepEqual(cue?.names, EMISSION_CUE_NAMES);
  assert.equal(cue?.material, 'Material_Cyan');
  assert.deepEqual(
    cue?.materialBindings,
    Object.fromEntries(EMISSION_CUE_NAMES.map((name) => [name, 'Material_Cyan'])),
  );
  for (const [semanticGroup, contractGroup] of SEMANTIC_CONTRACT_GROUPS) {
    const components = sourceEvidence.semanticBounds.groups[contractGroup].components;
    for (const [namePrefix, expectedCount] of SEMANTIC_REQUIREMENTS.get(semanticGroup)) {
      const matches = components.filter((name) => name.startsWith(namePrefix));
      assert.equal(
        matches.length,
        expectedCount,
        `${contractGroup} ${namePrefix} matched ${matches.length}, expected exactly ${expectedCount}`,
      );
    }
  }
});

test('Rig renderer pins key-led material lighting and mechanism-revealing cameras', () => {
  const rendererSource = readFileSync(RENDERER, 'utf8');
  assert.deepEqual(
    rendererLightingContract(rendererSource),
    EXPECTED_LIGHTING_PROFILE_CONTRACT,
    'renderer lighting JSON must match the independent receipt fixture',
  );
  for (const [profileName, profile] of Object.entries(
    EXPECTED_LIGHTING_PROFILE_CONTRACT.profiles,
  )) {
    assert.ok(profile.exposure >= 0.04 && profile.exposure <= 0.21, `${profileName} exposure`);
    assert.ok(
      profile.worldStrength >= 1.30 && profile.worldStrength <= 2.12,
      `${profileName} reflection environment strength`,
    );
    const keyPower = profile.lights.ASHLINE_KEY.energyMultiplier;
    const fill = profile.lights.ASHLINE_FILL;
    const key = profile.lights.ASHLINE_KEY;
    const fillDensity = fill.energyMultiplier / (fill.radiusSizeMultiplier ** 2);
    const keyDensity = key.energyMultiplier / (key.radiusSizeMultiplier ** 2);
    assert.ok(fill.energyMultiplier > keyPower, `${profileName} broad card total power`);
    assert.ok(
      fillDensity / keyDensity < 0.08,
      `${profileName} broad card must remain weak per emitting area`,
    );
    const rimRatio = profile.lights.ASHLINE_RIM.energyMultiplier / keyPower;
    const kickerRatio = profile.lights.ASHLINE_KICKER.energyMultiplier / keyPower;
    assert.ok(rimRatio >= 0.30 && rimRatio <= 0.60, `${profileName} cold rim ratio`);
    assert.ok(kickerRatio >= 0.15 && kickerRatio <= 0.30, `${profileName} warm kicker ratio`);
    assert.ok(
      profile.lights.ASHLINE_KEY.radiusSizeMultiplier
        < profile.lights.ASHLINE_FILL.radiusSizeMultiplier,
      `${profileName} key must remain harder than its fill`,
    );
  }

  for (const [fileName, expectedDirection] of EXPECTED_VIEW_DIRECTIONS) {
    const camera = rendererViewCamera(rendererSource, fileName);
    assert.deepEqual(camera.direction, expectedDirection, `${fileName} raw direction`);
    assert.equal(camera.lens, EXPECTED_VIEW_LENSES.get(fileName), `${fileName} lens`);
  }
  const boomElevation = normalizedVector(
    EXPECTED_VIEW_DIRECTIONS.get('capture_boom_close.png'),
  )[2];
  assert.ok(
    boomElevation <= -0.90,
    'boom view must come from below the donor shell to expose bays and crossed webs',
  );
  const jawDirection = normalizedVector(EXPECTED_VIEW_DIRECTIONS.get('jaw_clevis_close.png'));
  assert.ok(
    jawDirection[1] >= 0.84 && jawDirection[1] <= 0.92
      && jawDirection[0] >= 0.24 && jawDirection[0] <= 0.33,
    'jaw view must retain its +Y service-side bias to preserve the central void and actuator interfaces',
  );
  assert.ok(jawDirection[2] <= -0.34, 'jaw view must clear the donor shell from below');
  const winchElevation = normalizedVector(
    EXPECTED_VIEW_DIRECTIONS.get('tether_winch_close.png'),
  )[2];
  assert.ok(winchElevation >= 0.35 && winchElevation <= 0.42, 'winch service-side elevation');
  const driveDirection = normalizedVector(
    EXPECTED_VIEW_DIRECTIONS.get('paired_drive_mount_close.png'),
  );
  assert.ok(
    driveDirection[0] >= -0.82 && driveDirection[0] <= -0.74
      && driveDirection[1] >= -0.60 && driveDirection[1] <= -0.52
      && driveDirection[2] >= 0.24 && driveDirection[2] <= 0.32,
    'drive view must retain the rear-side three-quarter that exposes both bells and the drive load path',
  );
  for (const [fileName, minimumLens, maximumLens] of [
    ['capture_boom_close.png', 55, 62],
    ['jaw_clevis_close.png', 58, 65],
    ['tether_winch_close.png', 58, 65],
    ['paired_drive_mount_close.png', 58, 65],
    ['hard_grazing.png', 58, 65],
  ]) {
    const lens = EXPECTED_VIEW_LENSES.get(fileName);
    assert.ok(
      lens >= minimumLens && lens <= maximumLens,
      `${fileName} must avoid telephoto mechanism compression`,
    );
  }
});

test('Rig renderer stages, validates, and promotes the receipt last', () => {
  const rendererSource = readFileSync(RENDERER, 'utf8');
  assert.equal(
    rendererSource.includes('--receipt-only'),
    false,
    'a receipt must only be written by a complete exact-source rerender',
  );
  assert.match(
    rendererSource,
    /staged = render_rig\(source, stage_dir\)/u,
    'renderer must generate every eligible artifact in isolated staging before promotion',
  );
  assert.match(
    rendererSource,
    /promote_evidence_bundle\([\s\S]*validate_before_receipt=validate_inputs_unchanged/u,
    'renderer must validate stable inputs inside recoverable promotion before receipt replacement',
  );
  assert.ok(
    rendererSource.indexOf('staged_receipt.replace(receipt_path)')
      > rendererSource.indexOf('staged_path.replace(target)'),
    'receipt replacement must be the final promotion phase after every image',
  );
  assert.equal(
    /receipt_path\.write_text\(/u.test(rendererSource),
    false,
    'renderer must never overwrite the canonical receipt in place',
  );
  assert.match(
    rendererSource,
    /def transaction_fixture_self_test\(\)/u,
    'renderer must retain an isolated late-failure rollback fixture',
  );
  assert.match(
    rendererSource,
    /lock_path\.open\("x", encoding="utf-8", newline="\\n"\)/u,
    'canonical promotion ownership must use atomic exclusive creation',
  );
  assert.match(
    rendererSource,
    /assert_promotion_lock_owner\(lock_path, lock_text\)/u,
    'canonical mutation and rollback must repeatedly validate the owner token',
  );
  assert.ok(
    rendererSource.indexOf('canonical_precondition = canonical_bundle_precondition(')
      < rendererSource.indexOf('staged = render_rig(source, stage_dir)'),
    'renderer must snapshot canonical targets before the long render begins',
  );
  assert.match(
    rendererSource,
    /changed since rendering began; promotion refused/u,
    'stale completed renders must fail their canonical precondition under lock',
  );
  assert.match(
    rendererSource,
    /promoted target no longer belongs to this transaction/u,
    'rollback must refuse to touch a foreign replacement output',
  );
  assert.match(
    rendererSource,
    /def png_decoder_fixture_self_test\(\)/u,
    'renderer must retain isolated CRC and terminal-IEND decoder fixtures',
  );
  assert.match(
    rendererSource,
    /imported_semantic_contract\(source\)/u,
    'close cameras must cross-check imported bounds against the exact source contract',
  );
  assert.match(
    rendererSource,
    /2\.0 \* half_width \* fit_margin,[\s\S]*2\.0 \* half_height \* fit_margin \* aspect/u,
    'orthographic fit must use Blender horizontal orthoScale semantics',
  );
  assert.match(
    rendererSource,
    /def assert_blender_camera_contains_bounds\([\s\S]*world_to_camera_view/u,
    'Blender-space camera containment must cross-check the analytic projection before render',
  );
  assert.match(
    rendererSource,
    /def png_frame_metrics\([\s\S]*def assert_frame_eligible\(/u,
    'fullRig framing must have a pixel-space occupancy and crop guard',
  );
  assert.match(
    rendererSource,
    /class TemporaryMaterialIdPass[\s\S]*def restore\([\s\S]*unlink\(missing_ok=True\)/u,
    'semantic material-ID diagnostics must restore source materials and delete temporary masks',
  );
  assert.match(
    rendererSource,
    /def semantic_surface_metrics\([\s\S]*def assert_semantic_surface_eligible\(/u,
    'named frames must gate exact material surfaces inside their projected semantic region',
  );
  assert.equal(
    /^LUMA_LIMITS\s*=/mu.test(rendererSource),
    false,
    'whole-frame black-background luma thresholds must not remain an eligibility gate',
  );
  assert.match(
    rendererSource,
    /round\(float\(exact\[field\]\[axis\]\), 6\)/u,
    'receipt semantic bounds must serialize retained exact-source scalars, '
      + 'not Blender float32 vectors',
  );
  assert.equal(
    rendererSource.includes('named-component-nodes'),
    false,
    'material-merged source nodes must not masquerade as semantic close-frame bounds',
  );
  assert.equal(
    rendererSource.includes('visible-lod0-meshes'),
    false,
    'full-subject eligibility must not accept an untracked visible-mesh union',
  );
});

test('Rig material-truth receipt is exact-source, semantic, and byte-complete', async () => {
  const receipt = JSON.parse(readFileSync(RECEIPT, 'utf8'));
  const sourceSha256 = sha256(SOURCE);
  const rendererSha256 = sha256(RENDERER);
  const baseRendererSha256 = sha256(BASE_RENDERER);
  const sourceEvidence = glbEvidenceSource(SOURCE);
  assertRootSemanticContract(sourceEvidence.semanticBounds);

  assert.equal(receipt.schema, 'spaceface.ashlineMaterialTruthArtifacts.v1');
  assert.match(receipt.transactionId, /^[0-9a-f]{32}$/u);
  assert.equal(receipt.shipKey, 'rig');
  assert.equal(
    receipt.source,
    'assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_rig.glb',
  );
  assert.equal(receipt.sourceSha256, sourceSha256);
  assert.deepEqual(receipt.producer, {
    path: 'tools/blender/render_m4_ashline_rig_material_truth.py',
    sha256: rendererSha256,
  });
  assert.deepEqual(receipt.producerDependencies, [{
    path: 'tools/blender/render_m4_ashline_material_truth.py',
    sha256: baseRendererSha256,
  }]);
  assert.deepEqual(receipt.renderProvenance, EXPECTED_RENDER_PROVENANCE);
  assert.equal(
    receipt.renderProvenanceSha256,
    canonicalJsonSha256(receipt.renderProvenance),
    'receipt must hash the exact pinned Blender/render settings',
  );
  assert.equal(receipt.artifacts.length, EXPECTED.size);

  const names = receipt.artifacts.map((artifact) => artifact.path.split('/').at(-1));
  assert.equal(new Set(names).size, EXPECTED.size, 'eligible artifact names must be unique');
  assert.deepEqual([...names].sort(), [...EXPECTED.keys()].sort());

  const artifactsByName = new Map();
  for (const artifact of receipt.artifacts) {
    const fileName = artifact.path.split('/').at(-1);
    const expected = EXPECTED.get(fileName);
    assert.ok(expected, `unexpected artifact ${artifact.path}`);
    assert.equal(artifact.path, `${EVIDENCE_PREFIX}${fileName}`);
    assert.deepEqual(artifact.inputBindings, [{
      shipKey: 'rig',
      sourceSha256,
    }]);
    assert.deepEqual(artifact.producer, receipt.producer);
    assert.deepEqual(artifact.producerDependencies, receipt.producerDependencies);
    assert.equal(
      artifact.renderProvenanceSha256,
      receipt.renderProvenanceSha256,
      `${fileName} pinned render provenance binding`,
    );

    const absolutePath = resolve(ROOT, artifact.path);
    const actualSha256 = sha256(absolutePath);
    const actualBytes = statSync(absolutePath).size;
    const image = await sharp(absolutePath).metadata();
    assert.equal(artifact.sha256, actualSha256, `${fileName} sha256`);
    assert.equal(artifact.bytes, actualBytes, `${fileName} bytes`);
    assert.equal(artifact.width, image.width, `${fileName} width`);
    assert.equal(artifact.height, image.height, `${fileName} height`);
    assert.equal(image.format, 'png', `${fileName} encoding`);
    assert.equal(image.depth, 'uchar', `${fileName} must be 8-bit`);
    assert.ok(
      image.channels === 3 || image.channels === 4,
      `${fileName} must be RGB or RGBA`,
    );
    assert.deepEqual(artifact.dimensions, [image.width, image.height], `${fileName} dimensions`);
    assert.deepEqual(artifact.dimensions, expected.dimensions, `${fileName} expected dimensions`);
    assert.equal(artifact.semantic.group, expected.group, `${fileName} semantic group`);
    assertSemanticEvidence(artifact, sourceEvidence);
    if (artifact.semantic.group === 'full_rig') {
      assertFullRigCornersInsideCamera(artifact);
    }
    assert.deepEqual(artifact.camera.resolution, expected.dimensions);
    assertVectorNear(
      artifact.camera.direction,
      normalizedVector(EXPECTED_VIEW_DIRECTIONS.get(fileName)),
      0.000002,
      `${fileName} camera direction`,
    );
    if (artifact.camera.projection === 'perspective') {
      assert.equal(artifact.camera.lensMm, EXPECTED_VIEW_LENSES.get(fileName), `${fileName} lens`);
    }
    assert.deepEqual(
      artifact.emission.materials,
      ['Material_Cyan'],
      `${fileName} exact authored emission material`,
    );
    assert.deepEqual(
      [...new Set(artifact.emission.bindings.map((binding) => binding.material))],
      ['Material_Cyan'],
      `${fileName} exact authored emission binding materials`,
    );
    assert.ok(
      artifact.emission.bindings.some(
        (binding) => binding.authoredStrength > 0 || binding.incomingLinks > 0,
      ),
      `${fileName} must bind a real authored emission-strength signal`,
    );
    assert.deepEqual(artifact.emission.cue.components, EMISSION_CUE_NAMES);
    assert.equal(artifact.emission.cue.material, 'Material_Cyan');
    assertLightingEvidence(artifact, fileName);
    artifactsByName.set(fileName, artifact);
  }

  const paired = artifactsByName.get('paired_drive_mount_close.png');
  const emissionOff = artifactsByName.get('emission_off.png');
  assert.equal(paired.emission.state, 'authored-on');
  assert.equal(emissionOff.emission.state, 'off');
  assert.deepEqual(emissionOff.semantic, paired.semantic, 'emission pair semantic frame');
  assert.deepEqual(emissionOff.camera, paired.camera, 'emission pair camera');
  assert.deepEqual(emissionOff.lighting, paired.lighting, 'emission pair lighting');
  assert.deepEqual(emissionOff.emission.materials, paired.emission.materials);
  assert.deepEqual(emissionOff.emission.bindings, paired.emission.bindings);
  assert.deepEqual(emissionOff.emission.cue, paired.emission.cue);
  assert.deepEqual(
    paired.emission.cue.rootLocalBounds,
    sourceEvidence.componentInventory.roles.find((row) => row.role === 'driveInternalCue').bounds,
  );
  assert.notEqual(emissionOff.sha256, paired.sha256, 'authored emission pair must visibly differ');
  const emissionDelta = await emissionDeltaMetrics(
    resolve(ROOT, paired.path),
    resolve(ROOT, emissionOff.path),
    paired.emission.cue.projectedRegion,
  );
  assert.deepEqual(paired.emission.delta.limits, EMISSION_DELTA_LIMITS);
  assert.deepEqual(paired.emission.delta.spatialLimits, EMISSION_DELTA_SPATIAL_LIMITS);
  assert.deepEqual(emissionOff.emission.delta, paired.emission.delta);
  for (const field of [
    'changedPixels',
    'aggregateRgbDelta',
    'meaningfulRgbDelta',
    'peakChannelDelta',
    'boundingBox',
    'cueRegion',
    'changedPixelsWithinCue',
    'meaningfulRgbDeltaWithinCue',
  ]) {
    assert.deepEqual(paired.emission.delta[field], emissionDelta[field], `emission ${field}`);
  }
  for (const field of [
    'changedPixelFraction',
    'boundingBoxFraction',
    'changedPixelsWithinCueFraction',
    'meaningfulRgbDeltaWithinCueFraction',
  ]) {
    assert.ok(
      Math.abs(paired.emission.delta[field] - emissionDelta[field]) <= 0.000000001,
      `emission ${field}`,
    );
  }
  assert.ok(emissionDelta.changedPixels >= EMISSION_DELTA_LIMITS.minimumChangedPixels);
  assert.ok(emissionDelta.aggregateRgbDelta >= emissionDelta.meaningfulRgbDelta);
  assert.ok(
    emissionDelta.meaningfulRgbDelta >= EMISSION_DELTA_LIMITS.minimumAggregateRgbDelta,
  );
  assert.ok(emissionDelta.peakChannelDelta >= EMISSION_DELTA_LIMITS.minimumPeakChannelDelta);
  assert.ok(
    emissionDelta.changedPixelFraction <= EMISSION_DELTA_LIMITS.maximumChangedPixelFraction,
  );
  assert.ok(
    emissionDelta.boundingBoxFraction <= EMISSION_DELTA_LIMITS.maximumBoundingBoxFraction,
  );
  assert.ok(
    emissionDelta.changedPixelsWithinCueFraction
      >= EMISSION_DELTA_SPATIAL_LIMITS.minimumChangedPixelsWithinCueFraction,
  );
  assert.ok(
    emissionDelta.meaningfulRgbDeltaWithinCueFraction
      >= EMISSION_DELTA_SPATIAL_LIMITS.minimumMeaningfulRgbDeltaWithinCueFraction,
  );
  assert.equal(artifactsByName.get('hard_grazing.png').lighting.profile, 'hard-grazing');
  assert.equal(artifactsByName.get('hard_grazing.png').emission.state, 'authored-on');

  const game120 = artifactsByName.get('game_120px.png');
  const game45 = artifactsByName.get('game_45px.png');
  assert.deepEqual(game45.semantic, game120.semantic, 'gamescale frames must use fullRig bounds');
  assert.deepEqual(
    { ...game45.camera, resolution: undefined },
    { ...game120.camera, resolution: undefined },
    'gamescale frames must preserve one tight full-band composition',
  );

  assert.deepEqual(
    [...FRAME_LIMITS.keys()].sort(),
    [...EXPECTED.entries()]
      .filter(([, expected]) => expected.group === 'full_rig')
      .map(([name]) => name)
      .sort(),
    'every and only fullRig view must bind pixel-space frame limits',
  );
  for (const [fileName, limits] of FRAME_LIMITS) {
    const artifact = artifactsByName.get(fileName);
    const metrics = await frameMetrics(resolve(ROOT, artifact.path));
    assert.deepEqual(artifact.frame.limits, limits, `${fileName} bound frame intent`);
    assert.deepEqual(artifact.frame.backgroundRgb, metrics.backgroundRgb, `${fileName} background`);
    assert.equal(
      artifact.frame.signalRgbDistance,
      metrics.signalRgbDistance,
      `${fileName} signal threshold`,
    );
    assert.deepEqual(
      artifact.frame.signalBoundingBox,
      metrics.signalBoundingBox,
      `${fileName} signal bounding box`,
    );
    for (const field of ['signalPixelFraction', 'signalBoundingBoxFraction']) {
      assert.ok(
        Math.abs(artifact.frame[field] - metrics[field]) <= 0.000001,
        `${fileName} ${field} must match rendered bytes`,
      );
    }
    for (const edge of ['left', 'right', 'top', 'bottom']) {
      assert.ok(
        Math.abs(artifact.frame.edgeSignalFractions[edge] - metrics.edgeSignalFractions[edge])
          <= 0.000001,
        `${fileName} ${edge} edge signal must match rendered bytes`,
      );
    }
    assert.deepEqual(
      frameEligibilityFailures(metrics, limits),
      [],
      `${fileName} independent fullRig framing eligibility`,
    );
  }

  assert.deepEqual(
    [...FOREGROUND_LUMA_LIMITS.keys()].sort(),
    [...EXPECTED.keys()].sort(),
    'every eligible artifact must have a foreground-midtone intent',
  );
  assert.deepEqual(
    [...SEMANTIC_SURFACE_LIMITS.keys()].sort(),
    [...EXPECTED.keys()].sort(),
    'every eligible artifact must have semantic-local material surface intent',
  );
  for (const [fileName, foregroundLimits] of FOREGROUND_LUMA_LIMITS) {
    const artifact = artifactsByName.get(fileName);
    const foregroundMetrics = await frameMetrics(resolve(ROOT, artifact.path));
    assert.deepEqual(
      artifact.surfaceResponse.foreground,
      {
        backgroundRgb: foregroundMetrics.backgroundRgb,
        signalRgbDistance: foregroundMetrics.signalRgbDistance,
        signalPixelFraction: Number(foregroundMetrics.signalPixelFraction.toFixed(6)),
        p25: foregroundMetrics.foregroundLuma.p25,
        p50: foregroundMetrics.foregroundLuma.p50,
        limits: foregroundLimits,
      },
      `${fileName} foreground receipt must match rendered subject pixels`,
    );
    assert.deepEqual(
      foregroundLumaEligibilityFailures(
        foregroundMetrics.foregroundLuma,
        foregroundLimits,
      ),
      [],
      `${fileName} independent foreground-midtone eligibility`,
    );
    const semantic = artifact.surfaceResponse.semantic;
    const semanticLimits = SEMANTIC_SURFACE_LIMITS.get(fileName);
    assert.equal(semantic.schema, MATERIAL_ID_SCHEMA, `${fileName} semantic surface schema`);
    assert.deepEqual(semantic.palette, MATERIAL_ID_PALETTE, `${fileName} material ID palette`);
    assert.equal(
      semantic.maximumRgbDistance,
      MATERIAL_ID_MAX_RGB_DISTANCE,
      `${fileName} material ID classification distance`,
    );
    assert.deepEqual(
      semantic.maximumP50ByMaterial,
      MATERIAL_RESPONSE_MAXIMUM_P50,
      `${fileName} material wash ceilings`,
    );
    assert.deepEqual(semantic.limits, semanticLimits, `${fileName} semantic surface limits`);
    assert.equal(semantic.group, artifact.semantic.group, `${fileName} semantic surface group`);
    assert.ok(semantic.regionPixels > 0, `${fileName} semantic region pixels`);
    assert.ok(
      semantic.classifiedPixels <= semantic.regionPixels,
      `${fileName} classified semantic pixels`,
    );
    assert.deepEqual(
      semanticSurfaceEligibilityFailures(semantic, semanticLimits),
      [],
      `${fileName} semantic-local material response eligibility`,
    );
  }
});
