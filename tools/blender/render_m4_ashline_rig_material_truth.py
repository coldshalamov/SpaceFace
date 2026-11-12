#!/usr/bin/env python3
"""Render exact-source Ashline Rig material-truth evidence.

Eligible Rig evidence is derived from semantic root-local bounds in the finalized GLB. The builder
computes those bounds from exact named pre-merge component sets, preserving their names and bounds
without adding dozens of runtime draw nodes. Close frames fail closed when the imported root no
longer exposes that contract; there is no material-mesh or guessed-coordinate fallback. Overview
frames use the contract's named ``fullRig`` compound group while retaining ``authoredRig`` as
material-focus provenance; neither is reconstructed from an untracked mesh union. The receipt binds
the exact source, producer, rendered bytes, semantic bounds, camera solution, lighting, and
authored-emission state used for every frame.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import secrets
import shutil
import struct
import tempfile
from typing import Any, Callable, Iterable, Sequence
import uuid
import zlib

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
FAMILY = ROOT / "assets" / "ships" / "m4_ashline_v2"
BASE_RENDERER = ROOT / "tools" / "blender" / "render_m4_ashline_material_truth.py"
TOOL_RELATIVE = "tools/blender/render_m4_ashline_rig_material_truth.py"
BASE_RENDERER_RELATIVE = "tools/blender/render_m4_ashline_material_truth.py"
SCHEMA = "spaceface.ashlineMaterialTruthArtifacts.v1"
SHIP_KEY = "rig"
SHIP_ID = "ashline_v2_rig"
LAST_RESULT: dict[str, Any] = {}
LAST_RENDER_METADATA: dict[str, dict[str, Any]] = {}
LAST_RENDER_PROVENANCE: dict[str, Any] = {}
SEMANTIC_BOUNDS_SCHEMA = "spaceface.m4-ashline-v2.rig-semantic-bounds.v2"
SEMANTIC_BOUNDS_BASIS = "rig-root-local-aabb"
SEMANTIC_IMPORT_CONVERSION = "runtime-x-y-up-z-starboard_to_blender-x-neg-z-y"
RIG_ROOT_NAME = "SF_M4_ASHLINE_V2_RIG_ROOT"
RIG_COMPONENT_INVENTORY_SCHEMA = "spaceface.rigMaterialTruthInventory.v3"
EMISSION_CUE_ROLE = "driveInternalCue"
EMISSION_CUE_MATERIAL = "Material_Cyan"
EMISSION_CUE_NAMES = (
    "Hook_DriveInternalCue_Port",
    "Hook_DriveInternalCue_Starboard",
)
EXPECTED_BLENDER_VERSION = (5, 1, 2)
CAMERA_FIT_SAFETY = 1.00005
FRAME_SIGNAL_RGB_DISTANCE = 18
PROMOTION_LOCK_SCHEMA = "spaceface.materialTruthEvidencePromotionLock.v1"
EXPECTED_VISIBLE_LOD0_MATERIALS = frozenset({
    "Material_CableSteel",
    "Material_Cyan",
    "Material_Hardface",
    "Material_HotSection",
    "Material_Hull",
    "Material_Mechanical",
    "Material_PolishedSteel",
    "Material_Red_Paint",
    "Material_Refractory",
})

ARTIFACT_NAMES = (
    "neutral_front34.png",
    "neutral_rear34.png",
    "capture_boom_close.png",
    "jaw_clevis_close.png",
    "tether_winch_close.png",
    "paired_drive_mount_close.png",
    "hard_grazing.png",
    "top_ortho.png",
    "emission_off.png",
    "game_120px.png",
    "game_45px.png",
)

# These are framing-integrity limits, not an art-quality score. They apply only to frames whose
# exact ``fullRig`` semantic group explicitly binds every visible LOD0 material node. Close frames
# deliberately retain the rest of the ship as contextual geometry, so a whole-frame silhouette
# would not honestly identify their named semantic target.
FRAME_LIMITS = {
    "neutral_front34.png": {
        "minimumSignalPixelFraction": 0.14,
        "minimumSignalBoundingBoxFraction": 0.34,
        "maximumEdgeSignalFraction": 0.02,
    },
    "neutral_rear34.png": {
        "minimumSignalPixelFraction": 0.14,
        "minimumSignalBoundingBoxFraction": 0.34,
        "maximumEdgeSignalFraction": 0.02,
    },
    "top_ortho.png": {
        "minimumSignalPixelFraction": 0.18,
        "minimumSignalBoundingBoxFraction": 0.42,
        "maximumEdgeSignalFraction": 0.02,
    },
    "game_120px.png": {
        "minimumSignalPixelFraction": 0.15,
        "minimumSignalBoundingBoxFraction": 0.34,
        "maximumEdgeSignalFraction": 0.02,
    },
    "game_45px.png": {
        "minimumSignalPixelFraction": 0.15,
        "minimumSignalBoundingBoxFraction": 0.34,
        "maximumEdgeSignalFraction": 0.02,
    },
}

# Whole-frame means are background-sensitive and can be fooled by sparse hot edges. These floors
# apply only to pixels that differ materially from the modal border background, so they require a
# useful lower and middle tonal response across visible subject structure without forcing dark bell
# cavities or negative spaces to become gray.
FOREGROUND_LUMA_LIMITS = {
    "neutral_front34.png": {
        "minimumSignalPixelFraction": 0.14, "minimumP25": 32.0, "minimumP50": 55.0,
    },
    "neutral_rear34.png": {
        "minimumSignalPixelFraction": 0.14, "minimumP25": 32.0, "minimumP50": 55.0,
    },
    "capture_boom_close.png": {
        "minimumSignalPixelFraction": 0.30, "minimumP25": 30.0, "minimumP50": 50.0,
    },
    "jaw_clevis_close.png": {
        "minimumSignalPixelFraction": 0.20, "minimumP25": 32.0, "minimumP50": 55.0,
    },
    "tether_winch_close.png": {
        "minimumSignalPixelFraction": 0.20, "minimumP25": 30.0, "minimumP50": 50.0,
    },
    "paired_drive_mount_close.png": {
        "minimumSignalPixelFraction": 0.25, "minimumP25": 30.0, "minimumP50": 50.0,
    },
    "hard_grazing.png": {
        "minimumSignalPixelFraction": 0.16, "minimumP25": 18.0, "minimumP50": 32.0,
    },
    "top_ortho.png": {
        "minimumSignalPixelFraction": 0.18, "minimumP25": 28.0, "minimumP50": 45.0,
    },
    "emission_off.png": {
        "minimumSignalPixelFraction": 0.25, "minimumP25": 30.0, "minimumP50": 50.0,
    },
    "game_120px.png": {
        "minimumSignalPixelFraction": 0.15, "minimumP25": 25.0, "minimumP50": 40.0,
    },
    "game_45px.png": {
        "minimumSignalPixelFraction": 0.15, "minimumP25": 22.0, "minimumP50": 34.0,
    },
}
MATERIAL_ID_SCHEMA = "spaceface.ashline-rig-semantic-material-id.v1"
MATERIAL_ID_MAX_RGB_DISTANCE = 24
MATERIAL_ID_PALETTE = {
    "Material_CableSteel": [240, 76, 76],
    "Material_Cyan": [42, 224, 224],
    "Material_Hardface": [255, 188, 56],
    "Material_HotSection": [245, 76, 196],
    "Material_Hull": [72, 128, 244],
    "Material_Mechanical": [144, 88, 224],
    "Material_PolishedSteel": [224, 224, 224],
    "Material_Red_Paint": [224, 44, 44],
    "Material_Refractory": [244, 232, 164],
}
MATERIAL_RESPONSE_MAXIMUM_P50 = {
    "Material_CableSteel": 170,
    "Material_Cyan": 220,
    "Material_Hardface": 180,
    "Material_HotSection": 180,
    "Material_Hull": 155,
    "Material_Mechanical": 165,
    "Material_PolishedSteel": 210,
    "Material_Red_Paint": 175,
    "Material_Refractory": 205,
}
SEMANTIC_SURFACE_LIMITS = {
    "neutral_front34.png": {
        "minimumRegionPixelFraction": 0.12,
        "materials": {
            "Material_Hull": {
                "minimumPixels": 1400, "minimumP25": 45,
                "minimumP50": 70, "minimumSpread": 18,
            },
            "Material_Mechanical": {
                "minimumPixels": 220, "minimumP25": 25,
                "minimumP50": 42, "minimumSpread": 14,
            },
            "Material_CableSteel": {
                "minimumPixels": 18, "minimumP25": 24,
                "minimumP50": 38, "minimumSpread": 10,
            },
        },
    },
    "neutral_rear34.png": {
        "minimumRegionPixelFraction": 0.12,
        "materials": {
            "Material_Hull": {
                "minimumPixels": 1400, "minimumP25": 45,
                "minimumP50": 70, "minimumSpread": 18,
            },
            "Material_Mechanical": {
                "minimumPixels": 220, "minimumP25": 25,
                "minimumP50": 42, "minimumSpread": 14,
            },
            "Material_HotSection": {
                "minimumPixels": 70, "minimumP25": 28,
                "minimumP50": 44, "minimumSpread": 14,
            },
        },
    },
    "capture_boom_close.png": {
        "minimumRegionPixelFraction": 0.20,
        "materials": {
            "Material_Hull": {
                "minimumPixels": 5000, "minimumP25": 38,
                "minimumP50": 62, "minimumSpread": 18,
            },
            "Material_Mechanical": {
                "minimumPixels": 350, "minimumP25": 26,
                "minimumP50": 44, "minimumSpread": 14,
            },
        },
    },
    "jaw_clevis_close.png": {
        "minimumRegionPixelFraction": 0.16,
        "materials": {
            "Material_Mechanical": {
                "minimumPixels": 3000, "minimumP25": 26,
                "minimumP50": 44, "minimumSpread": 16,
            },
            "Material_Hardface": {
                "minimumPixels": 180, "minimumP25": 28,
                "minimumP50": 48, "minimumSpread": 14,
            },
            "Material_PolishedSteel": {
                "minimumPixels": 160, "minimumP25": 38,
                "minimumP50": 64, "minimumSpread": 14,
            },
            "Material_CableSteel": {
                "minimumPixels": 60, "minimumP25": 24,
                "minimumP50": 40, "minimumSpread": 10,
            },
        },
    },
    "tether_winch_close.png": {
        "minimumRegionPixelFraction": 0.18,
        "materials": {
            "Material_Mechanical": {
                "minimumPixels": 2800, "minimumP25": 26,
                "minimumP50": 44, "minimumSpread": 16,
            },
            "Material_CableSteel": {
                "minimumPixels": 900, "minimumP25": 24,
                "minimumP50": 40, "minimumSpread": 12,
            },
            "Material_PolishedSteel": {
                "minimumPixels": 180, "minimumP25": 38,
                "minimumP50": 64, "minimumSpread": 14,
            },
            "Material_Red_Paint": {
                "minimumPixels": 180, "minimumP25": 30,
                "minimumP50": 52, "minimumSpread": 14,
            },
        },
    },
    "paired_drive_mount_close.png": {
        "minimumRegionPixelFraction": 0.18,
        "materials": {
            "Material_Hull": {
                "minimumPixels": 500, "minimumP25": 36,
                "minimumP50": 58, "minimumSpread": 16,
            },
            "Material_Mechanical": {
                "minimumPixels": 2200, "minimumP25": 26,
                "minimumP50": 44, "minimumSpread": 16,
            },
            "Material_HotSection": {
                "minimumPixels": 1200, "minimumP25": 28,
                "minimumP50": 46, "minimumSpread": 16,
            },
            "Material_Refractory": {
                "minimumPixels": 300, "minimumP25": 30,
                "minimumP50": 48, "minimumSpread": 12,
            },
        },
    },
    "hard_grazing.png": {
        "minimumRegionPixelFraction": 0.15,
        "materials": {
            "Material_Mechanical": {
                "minimumPixels": 1800, "minimumP25": 18,
                "minimumP50": 34, "minimumSpread": 22,
            },
            "Material_HotSection": {
                "minimumPixels": 900, "minimumP25": 18,
                "minimumP50": 34, "minimumSpread": 24,
            },
            "Material_Refractory": {
                "minimumPixels": 220, "minimumP25": 22,
                "minimumP50": 38, "minimumSpread": 16,
            },
        },
    },
    "top_ortho.png": {
        "minimumRegionPixelFraction": 0.15,
        "materials": {
            "Material_Hull": {
                "minimumPixels": 1800, "minimumP25": 40,
                "minimumP50": 64, "minimumSpread": 16,
            },
            "Material_Mechanical": {
                "minimumPixels": 260, "minimumP25": 24,
                "minimumP50": 42, "minimumSpread": 12,
            },
        },
    },
    "emission_off.png": {
        "minimumRegionPixelFraction": 0.18,
        "materials": {
            "Material_Mechanical": {
                "minimumPixels": 2200, "minimumP25": 26,
                "minimumP50": 44, "minimumSpread": 16,
            },
            "Material_HotSection": {
                "minimumPixels": 1200, "minimumP25": 28,
                "minimumP50": 46, "minimumSpread": 16,
            },
            "Material_Refractory": {
                "minimumPixels": 300, "minimumP25": 30,
                "minimumP50": 48, "minimumSpread": 12,
            },
        },
    },
    "game_120px.png": {
        "minimumRegionPixelFraction": 0.14,
        "materials": {
            "Material_Hull": {
                "minimumPixels": 350, "minimumP25": 34,
                "minimumP50": 54, "minimumSpread": 12,
            },
            "Material_Mechanical": {
                "minimumPixels": 40, "minimumP25": 22,
                "minimumP50": 36, "minimumSpread": 8,
            },
            "Material_HotSection": {
                "minimumPixels": 12, "minimumP25": 22,
                "minimumP50": 36, "minimumSpread": 8,
            },
            "Material_Refractory": {
                "minimumPixels": 4, "minimumP25": 24,
                "minimumP50": 38, "minimumSpread": 6,
            },
        },
    },
    "game_45px.png": {
        "minimumRegionPixelFraction": 0.12,
        "materials": {
            "Material_Hull": {
                "minimumPixels": 40, "minimumP25": 28,
                "minimumP50": 46, "minimumSpread": 8,
            },
            "Material_Mechanical": {
                "minimumPixels": 6, "minimumP25": 18,
                "minimumP50": 30, "minimumSpread": 6,
            },
            "Material_HotSection": {
                "minimumPixels": 2, "minimumP25": 18,
                "minimumP50": 30, "minimumSpread": 4,
            },
            "Material_Refractory": {
                "minimumPixels": 2, "minimumP25": 20,
                "minimumP50": 32, "minimumSpread": 4,
            },
        },
    },
}
LUMA_UPPER_CLIP_THRESHOLD = 247.0
EMISSION_DELTA_LIMITS = {
    "pixelChannelThreshold": 2,
    "minimumChangedPixels": 16,
    "minimumAggregateRgbDelta": 512,
    "minimumPeakChannelDelta": 4,
    "maximumChangedPixelFraction": 0.02,
    "maximumBoundingBoxFraction": 0.25,
}
EMISSION_DELTA_SPATIAL_LIMITS = {
    "pixelPadding": 4,
    "minimumChangedPixelsWithinCueFraction": 0.95,
    "minimumMeaningfulRgbDeltaWithinCueFraction": 0.95,
}

# Machine-readable rather than implied by the implementation: every world, exposure, placement,
# power, emitter-size, shape, and color input used by the evidence rig is receipt provenance. The
# neutral profile is intentionally key-led. Its broad fill, rim, and detail powers are restrained
# so dark phosphate plate stays dark while machined steel, red paint, cable, refractory, and heat
# metal retain separate responses. The hard-grazing profile narrows that key further instead of
# manufacturing contrast with extra fill.
LIGHTING_PROFILE_CONTRACT = json.loads(
    r"""
{
  "schema": "spaceface.ashline-rig-evidence-lighting.v2",
  "energyScale": {
    "minimum": 1900.0,
    "maximum": 7600.0,
    "radiusSquaredMultiplier": 52.0,
    "unit": "W"
  },
  "world": {
    "backgroundColor": [0.30, 0.36, 0.48, 1.0]
  },
  "profiles": {
    "neutral": {
      "exposure": 0.20,
      "worldStrength": 2.10,
      "lights": {
        "ASHLINE_KEY": {
          "type": "AREA",
          "shape": "DISK",
          "locationBasis": {"direction": 1.45, "right": -1.25, "up": 0.82},
          "energyMultiplier": 1.0,
          "minimumSize": 0.26,
          "radiusSizeMultiplier": 0.09,
          "color": [1.0, 0.98, 0.94]
        },
        "ASHLINE_FILL": {
          "type": "AREA",
          "shape": "RECTANGLE",
          "locationBasis": {"direction": 0.75, "right": 1.35, "up": 0.22},
          "energyMultiplier": 2.2,
          "minimumSize": 2.2,
          "radiusSizeMultiplier": 0.72,
          "color": [0.78, 0.84, 0.94]
        },
        "ASHLINE_RIM": {
          "type": "AREA",
          "shape": "DISK",
          "locationBasis": {"direction": -1.55, "right": -0.55, "up": 0.68},
          "energyMultiplier": 0.55,
          "minimumSize": 0.52,
          "radiusSizeMultiplier": 0.20,
          "color": [0.52, 0.70, 1.0]
        },
        "ASHLINE_KICKER": {
          "type": "AREA",
          "shape": "DISK",
          "locationBasis": {"direction": -0.45, "right": 1.05, "up": 0.52},
          "energyMultiplier": 0.25,
          "minimumSize": 0.38,
          "radiusSizeMultiplier": 0.14,
          "color": [1.0, 0.42, 0.18]
        }
      }
    },
    "hard-grazing": {
      "exposure": 0.05,
      "worldStrength": 1.35,
      "lights": {
        "ASHLINE_KEY": {
          "type": "AREA",
          "shape": "DISK",
          "locationBasis": {"direction": 0.30, "right": 1.80, "up": 0.20},
          "energyMultiplier": 1.15,
          "minimumSize": 0.16,
          "radiusSizeMultiplier": 0.045,
          "color": [1.0, 0.94, 0.86]
        },
        "ASHLINE_FILL": {
          "type": "AREA",
          "shape": "RECTANGLE",
          "locationBasis": {"direction": 0.75, "right": -1.25, "up": 0.30},
          "energyMultiplier": 1.2,
          "minimumSize": 1.8,
          "radiusSizeMultiplier": 0.65,
          "color": [0.74, 0.82, 0.96]
        },
        "ASHLINE_RIM": {
          "type": "AREA",
          "shape": "DISK",
          "locationBasis": {"direction": -1.65, "right": 0.15, "up": 0.72},
          "energyMultiplier": 0.38,
          "minimumSize": 0.34,
          "radiusSizeMultiplier": 0.12,
          "color": [0.48, 0.66, 1.0]
        },
        "ASHLINE_KICKER": {
          "type": "AREA",
          "shape": "DISK",
          "locationBasis": {"direction": -0.50, "right": -1.05, "up": 0.38},
          "energyMultiplier": 0.18,
          "minimumSize": 0.24,
          "radiusSizeMultiplier": 0.08,
          "color": [1.0, 0.36, 0.12]
        }
      }
    }
  }
}
""",
)

# Prefix counts are deliberately exact-source requirements, not prose labels. Bounds for close
# views are computed only from the union of nodes matched by these rules.
SEMANTIC_GROUP_REQUIREMENTS: dict[str, tuple[tuple[str, int], ...]] = {
    "capture_boom": (
        ("Hook_BoomRootDoubler_", 2),
        ("Hook_BoomRootGusset_", 2),
        ("Hook_BoomRootTransition_", 2),
        ("Hook_BoomJawTransition_", 2),
        ("Hook_BoomChord_", 4),
        ("Hook_BoomWeb_", 6),
        ("Hook_BoomWebFrame_", 6),
        ("Hook_BoomSplice_", 16),
        ("Hook_ClevisEar_", 4),
        ("Hook_ClevisPin_", 2),
        ("Hook_ClevisCollar_", 2),
        ("Hook_ClevisRetainer_", 2),
    ),
    "jaw_clevis": (
        ("Hook_ClevisEar_", 4),
        ("Hook_ClevisPin_", 2),
        ("Hook_ClevisCollar_", 2),
        ("Hook_ClevisRetainer_", 2),
        ("Hook_JawArm_", 2),
        ("Hook_JawForging_", 2),
        ("Hook_JawKeeper_", 2),
        ("Hook_JawPad_", 6),
        ("Hook_JawPin_", 4),
        ("Hook_JawPivotBoss_", 2),
        ("Hook_JawActuatorEnd_", 2),
        ("Hook_JawHydraulicCase_", 2),
        ("Hook_JawHydraulicRod_", 2),
        ("Hook_JawHydraulicGland_", 2),
        ("Hook_JawHydraulicClevis_", 2),
        ("Hook_JawHydraulicRootPin_", 2),
        ("Hook_JawHydraulicHose_", 2),
    ),
    "tether_winch": (
        ("Hook_TetherBaseFrame_", 2),
        ("Hook_TetherDrum_Grooved", 1),
        ("Hook_TetherDrum_KeyedShaft", 1),
        ("Hook_TetherDrum_CableWrap", 1),
        ("Hook_TetherDrum_Bearing_", 2),
        ("Hook_TetherBearingCap_", 2),
        ("Hook_TetherDrum_BrakeBand", 1),
        ("Hook_TetherBrake_ServiceCover", 1),
        ("Hook_TetherDrum_ClutchLever", 1),
        ("Hook_TetherGuard_", 2),
        ("Hook_TetherFairlead_Sheave", 1),
        ("Hook_TetherFairlead_Guide", 2),
        ("Hook_TetherFairlead_Roller_", 2),
        ("Hook_TetherFairlead_DrumRun", 1),
        ("Hook_TetherFairlead_BraidedRun", 1),
        ("Hook_TetherFairlead_Terminal_", 2),
    ),
    "paired_drive": (
        ("Hook_DrivePressureCase_", 2),
        ("Hook_DriveHotSection_", 2),
        ("Hook_DriveBell_", 2),
        ("Hook_DriveCavityLiner_", 2),
        ("Hook_DriveRefractoryThroat_", 2),
        ("Hook_DriveInternalCue_", 2),
        ("Hook_DriveClamp_", 4),
        ("Hook_DriveThrustSaddle_", 2),
        ("Hook_DriveSaddleCheek_", 2),
        ("Hook_DriveSaddleFoot_", 4),
        ("Hook_DriveSaddleWeb_", 4),
        ("Hook_DriveRootDoubler_", 4),
        ("Hook_DriveRootLink_", 4),
        ("Hook_DriveServiceLine_", 2),
        ("Hook_DriveValveFitting_", 4),
        ("Hook_DriveValvePack_", 2),
        ("Hook_ServiceTag_Drive_", 2),
    ),
    "forward_mount": (
        ("Hook_ForwardMountSaddle", 1),
        ("Hook_ForwardMountGusset_", 2),
    ),
}

SEMANTIC_CONTRACT_GROUPS = {
    "authored_rig": "authoredRig",
    "full_rig": "fullRig",
    "capture_boom": "capture",
    "jaw_clevis": "jaw",
    "tether_winch": "winch",
    "paired_drive": "drives",
    "forward_mount": "forwardMount",
}
SEMANTIC_GROUP_COUNTS = {
    "capture_boom": 50,
    "jaw_clevis": 42,
    "tether_winch": 23,
    "paired_drive": 46,
    "forward_mount": 3,
    "authored_rig": 154,
    "full_rig": 154,
}

VIEW_SPECS: tuple[dict[str, Any], ...] = (
    {
        "name": "neutral_front34.png",
        "group": "full_rig",
        # A broadside-forward overview keeps the exact fullRig span legible in the 16:9 frame
        # instead of foreshortening the long hull into unused background.
        "direction": (0.42, -0.88, 0.21),
        "lens": 62.0,
        "size": (1280, 720),
        "margin": 1.05,
        "lighting": "neutral",
    },
    {
        "name": "neutral_rear34.png",
        "group": "full_rig",
        "direction": (-0.42, -0.88, 0.21),
        "lens": 62.0,
        "size": (1280, 720),
        "margin": 1.05,
        "lighting": "neutral",
    },
    {
        "name": "capture_boom_close.png",
        "group": "capture_boom",
        # The conversion frame sits below the donor shell. An underside three-quarter reveals the
        # entire root-to-collar open web instead of letting either donor flank occlude it.
        "direction": (0.18, 0.32, -0.93),
        "lens": 60.0,
        "size": (1280, 720),
        "margin": 1.08,
        "lighting": "neutral",
    },
    {
        "name": "jaw_clevis_close.png",
        "group": "jaw_clevis",
        # A +Y service-side three-quarter keeps the central void open while reading broadside across
        # the X-axis actuator rods. The former longitudinal view foreshortened and occluded the two
        # polished hydraulic interfaces even though the fabricated rods and clevises were present.
        "direction": (0.28, 0.88, -0.38),
        "lens": 62.0,
        "size": (1280, 720),
        "margin": 1.08,
        "lighting": "neutral",
    },
    {
        "name": "tether_winch_close.png",
        "group": "tether_winch",
        # The +Y service side exposes the drum rather than the donor flank; slight longitudinal
        # parallax separates its split bearings, brake, guard, fairlead, and cable endpoint.
        "direction": (-0.12, 0.92, 0.38),
        "lens": 62.0,
        "size": (1280, 720),
        "margin": 1.08,
        "lighting": "neutral",
    },
    {
        "name": "paired_drive_mount_close.png",
        "group": "paired_drive",
        # A rear-side three-quarter looks through both hollow bells into the recessed ceramic
        # throats, while retaining enough broadside component to expose saddle cheeks, feet, webs,
        # root links, and doublers instead of collapsing the load path into a head-on nozzle view.
        "direction": (-0.78, -0.56, 0.28),
        "lens": 62.0,
        "size": (1280, 720),
        "margin": 1.08,
        "lighting": "neutral",
    },
    {
        "name": "hard_grazing.png",
        "group": "paired_drive",
        # Keep the neutral drive-proof camera so the hard lateral key isolates response changes on
        # the same visible pressure cases, saddles, bells, liners, and recessed ceramic throats.
        # A pure broadside camera cannot honestly require pixels from a recessed axial throat.
        "direction": (-0.78, -0.56, 0.28),
        "lens": 62.0,
        "size": (1280, 720),
        "margin": 1.08,
        "lighting": "hard-grazing",
    },
    {
        "name": "top_ortho.png",
        "group": "full_rig",
        "direction": (0.0, 0.0, 1.0),
        "lens": 50.0,
        "size": (1280, 720),
        "margin": 1.05,
        "lighting": "neutral",
        "orthographic": True,
    },
    {
        "name": "emission_off.png",
        "group": "paired_drive",
        # Exact camera match with paired_drive_mount_close is mandatory: the PNG delta must isolate
        # authored cue emission rather than parallax or a different visible material population.
        "direction": (-0.78, -0.56, 0.28),
        "lens": 62.0,
        "size": (1280, 720),
        "margin": 1.08,
        "lighting": "neutral",
        "emission": "off",
    },
    {
        "name": "game_120px.png",
        "group": "full_rig",
        # A supported elevated rear-side three-quarter keeps the full rig framed while retaining
        # the recessed manufactured drive throats in the game-scale register.
        "direction": (-0.86, -0.36, 0.46),
        "lens": 62.0,
        "size": (120, 120),
        "margin": 1.04,
        "lighting": "neutral",
    },
    {
        "name": "game_45px.png",
        "group": "full_rig",
        "direction": (-0.86, -0.36, 0.46),
        "lens": 62.0,
        "size": (45, 45),
        "margin": 1.04,
        "lighting": "neutral",
    },
)


def load_base_renderer():
    spec = importlib.util.spec_from_file_location("spaceface_ashline_dart_renderer", BASE_RENDERER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {BASE_RENDERER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_base_renderer()


def sha256(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def canonical_json_sha256(value: Any) -> str:
    def normalized(item: Any) -> Any:
        if isinstance(item, float) and item.is_integer():
            return int(item)
        if isinstance(item, list):
            return [normalized(child) for child in item]
        if isinstance(item, tuple):
            return [normalized(child) for child in item]
        if isinstance(item, dict):
            return {str(key): normalized(child) for key, child in item.items()}
        return item

    return hashlib.sha256(
        json.dumps(normalized(value), sort_keys=True, separators=(",", ":")).encode("utf-8"),
    ).hexdigest().upper()


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def png_dimensions(path: Path) -> tuple[int, int]:
    """Read actual PNG dimensions so the receipt binds rendered bytes, not view presets."""
    header = path.read_bytes()[:24]
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"Expected PNG artifact: {path}")
    return struct.unpack(">II", header[16:24])


def paeth_predictor(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    left_distance = abs(estimate - left)
    above_distance = abs(estimate - above)
    upper_left_distance = abs(estimate - upper_left)
    if left_distance <= above_distance and left_distance <= upper_left_distance:
        return left
    if above_distance <= upper_left_distance:
        return above
    return upper_left


def decode_png_rgb(path: Path) -> tuple[int, int, bytes]:
    """CRC-check and decode Blender's non-interlaced 8-bit RGB(A) evidence PNG."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Expected PNG artifact: {path}")
    offset = 8
    ihdr: bytes | None = None
    compressed = bytearray()
    saw_iend = False
    chunk_index = 0
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        chunk_type = data[offset + 4:offset + 8]
        chunk_start = offset + 8
        chunk_end = chunk_start + length
        if chunk_end + 4 > len(data):
            raise ValueError(f"Truncated PNG chunk in {path}")
        chunk = data[chunk_start:chunk_end]
        stored_crc = struct.unpack(">I", data[chunk_end:chunk_end + 4])[0]
        actual_crc = zlib.crc32(chunk, zlib.crc32(chunk_type)) & 0xFFFFFFFF
        if stored_crc != actual_crc:
            raise ValueError(
                f"PNG CRC mismatch for {chunk_type!r} in {path}: "
                f"{stored_crc:08X} != {actual_crc:08X}",
            )
        if chunk_index == 0 and chunk_type != b"IHDR":
            raise ValueError(f"PNG IHDR is not first in {path}")
        if chunk_type == b"IHDR":
            if ihdr is not None or chunk_index != 0:
                raise ValueError(f"PNG contains duplicate or misplaced IHDR: {path}")
            ihdr = chunk
        elif chunk_type == b"IDAT":
            compressed.extend(chunk)
        elif chunk_type == b"IEND":
            if length != 0:
                raise ValueError(f"PNG IEND must be empty in {path}")
            saw_iend = True
            offset = chunk_end + 4
            if offset != len(data):
                raise ValueError(f"PNG contains trailing bytes after IEND: {path}")
            break
        offset = chunk_end + 4
        chunk_index += 1
    if ihdr is None or len(ihdr) != 13 or not compressed or not saw_iend:
        raise ValueError(f"Incomplete PNG structure: {path}")
    width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(
        ">IIBBBBB",
        ihdr,
    )
    if (
        bit_depth != 8
        or color_type not in (2, 6)
        or compression != 0
        or filtering != 0
        or interlace != 0
    ):
        raise ValueError(
            f"Unsupported evidence PNG encoding in {path}: "
            f"depth={bit_depth} color={color_type} interlace={interlace}",
        )
    channels = 3 if color_type == 2 else 4
    stride = width * channels
    decompressed = zlib.decompress(bytes(compressed))
    expected_bytes = height * (stride + 1)
    if len(decompressed) != expected_bytes:
        raise ValueError(
            f"Unexpected PNG scanline payload in {path}: "
            f"{len(decompressed)} != {expected_bytes}",
        )

    previous = bytearray(stride)
    rgb = bytearray(width * height * 3)
    rgb_offset = 0
    source_offset = 0
    for _row in range(height):
        filter_type = decompressed[source_offset]
        source_offset += 1
        scanline = decompressed[source_offset:source_offset + stride]
        source_offset += stride
        reconstructed = bytearray(stride)
        for index, encoded in enumerate(scanline):
            left = reconstructed[index - channels] if index >= channels else 0
            above = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 0:
                value = encoded
            elif filter_type == 1:
                value = encoded + left
            elif filter_type == 2:
                value = encoded + above
            elif filter_type == 3:
                value = encoded + ((left + above) // 2)
            elif filter_type == 4:
                value = encoded + paeth_predictor(left, above, upper_left)
            else:
                raise ValueError(f"Unsupported PNG filter {filter_type} in {path}")
            reconstructed[index] = value & 0xFF
        for index in range(0, stride, channels):
            rgb[rgb_offset:rgb_offset + 3] = reconstructed[index:index + 3]
            rgb_offset += 3
        previous = reconstructed
    return width, height, bytes(rgb)


def png_luma_metrics(path: Path) -> dict[str, float]:
    """Measure dark floor, upper clipping, and histogram contrast after strict decoding."""
    width, height, rgb = decode_png_rgb(path)
    total_luma = 0.0
    below_eight = 0
    above_247 = 0
    histogram = [0] * 256
    for index in range(0, len(rgb), 3):
        luma = 0.2126 * rgb[index] + 0.7152 * rgb[index + 1] + 0.0722 * rgb[index + 2]
        total_luma += luma
        if luma < 8.0:
            below_eight += 1
        if luma >= LUMA_UPPER_CLIP_THRESHOLD:
            above_247 += 1
        histogram[max(0, min(255, int(math.floor(luma))))] += 1
    pixel_count = width * height

    def percentile(fraction: float) -> float:
        target = max(1, math.ceil(pixel_count * fraction))
        cumulative = 0
        for value, count in enumerate(histogram):
            cumulative += count
            if cumulative >= target:
                return float(value)
        raise AssertionError("Luma histogram does not contain every decoded pixel")

    p5 = percentile(0.05)
    p95 = percentile(0.95)
    return {
        "mean": total_luma / pixel_count,
        "belowEightFraction": below_eight / pixel_count,
        "above247Fraction": above_247 / pixel_count,
        "p5": p5,
        "p95": p95,
        "p5P95Spread": p95 - p5,
    }


def assert_luma_eligible(
    label: str,
    metrics: dict[str, float],
    limits: dict[str, float],
) -> None:
    failures = []
    if metrics["mean"] < limits["minimumMean"]:
        failures.append("mean")
    if metrics["belowEightFraction"] > limits["maximumBelowEight"]:
        failures.append("belowEightFraction")
    if metrics["above247Fraction"] > limits["maximumAbove247Fraction"]:
        failures.append("above247Fraction")
    if metrics["p5P95Spread"] < limits["minimumP5P95Spread"]:
        failures.append("p5P95Spread")
    if failures:
        raise RuntimeError(
            f"{label} is content-ineligible: failed {failures}, "
            f"metrics={metrics}, limits={limits}",
        )


def png_frame_metrics(path: Path) -> dict[str, Any]:
    """Measure subject occupancy, foreground luma, and edges against the modal background."""
    width, height, rgb = decode_png_rgb(path)

    def pixel_at(x: int, y: int) -> tuple[int, int, int]:
        offset = (y * width + x) * 3
        return rgb[offset], rgb[offset + 1], rgb[offset + 2]

    # A border mode keeps the threshold tied to the actually rendered background rather than a
    # hard-coded color-management value. The fullRig views reserve a margin, so background remains
    # represented on the border even when the subject becomes appreciably larger.
    border_counts: dict[tuple[int, int, int], int] = {}
    for x in range(width):
        for y in (0, height - 1):
            pixel = pixel_at(x, y)
            border_counts[pixel] = border_counts.get(pixel, 0) + 1
    for y in range(1, height - 1):
        for x in (0, width - 1):
            pixel = pixel_at(x, y)
            border_counts[pixel] = border_counts.get(pixel, 0) + 1
    if not border_counts:
        raise RuntimeError(f"Cannot derive frame background from empty image: {path}")
    background = max(border_counts, key=border_counts.get)

    def is_signal(x: int, y: int) -> bool:
        pixel = pixel_at(x, y)
        return sum(abs(pixel[channel] - background[channel]) for channel in range(3)) >= (
            FRAME_SIGNAL_RGB_DISTANCE
        )

    signal_pixels = 0
    foreground_histogram = [0] * 256
    min_x, min_y = width, height
    max_x = max_y = -1
    for y in range(height):
        for x in range(width):
            if not is_signal(x, y):
                continue
            signal_pixels += 1
            pixel = pixel_at(x, y)
            luma = 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2]
            foreground_histogram[max(0, min(255, int(math.floor(luma))))] += 1
            min_x, min_y = min(min_x, x), min(min_y, y)
            max_x, max_y = max(max_x, x), max(max_y, y)
    if not signal_pixels:
        raise RuntimeError(f"Cannot derive foreground luma from an empty subject mask: {path}")
    pixel_count = width * height
    bounding_area = (
        (max_x - min_x + 1) * (max_y - min_y + 1)
        if signal_pixels
        else 0
    )

    def edge_fraction(points: Sequence[tuple[int, int]]) -> float:
        return sum(1 for x, y in points if is_signal(x, y)) / len(points)

    def foreground_percentile(fraction: float) -> float:
        target = max(1, math.ceil(signal_pixels * fraction))
        cumulative = 0
        for value, count in enumerate(foreground_histogram):
            cumulative += count
            if cumulative >= target:
                return float(value)
        raise AssertionError("Foreground histogram lost masked subject pixels")

    return {
        "backgroundRgb": list(background),
        "signalRgbDistance": FRAME_SIGNAL_RGB_DISTANCE,
        "signalPixelFraction": signal_pixels / pixel_count,
        "foregroundLuma": {
            "signalPixelFraction": signal_pixels / pixel_count,
            "p25": foreground_percentile(0.25),
            "p50": foreground_percentile(0.50),
        },
        "signalBoundingBoxFraction": bounding_area / pixel_count,
        "signalBoundingBox": (
            {"min": [min_x, min_y], "max": [max_x, max_y]}
            if signal_pixels
            else None
        ),
        "edgeSignalFractions": {
            "left": edge_fraction([(0, y) for y in range(height)]),
            "right": edge_fraction([(width - 1, y) for y in range(height)]),
            "top": edge_fraction([(x, 0) for x in range(width)]),
            "bottom": edge_fraction([(x, height - 1) for x in range(width)]),
        },
    }


def assert_foreground_luma_eligible(
    label: str,
    metrics: dict[str, float],
    limits: dict[str, float],
) -> None:
    failures = []
    if metrics["signalPixelFraction"] < limits["minimumSignalPixelFraction"]:
        failures.append("signalPixelFraction")
    if metrics["p25"] < limits["minimumP25"]:
        failures.append("p25")
    if metrics["p50"] < limits["minimumP50"]:
        failures.append("p50")
    if failures:
        raise RuntimeError(
            f"{label} has crushed subject midtones: failed {failures}, "
            f"metrics={metrics}, limits={limits}",
        )


def assert_frame_eligible(
    label: str,
    metrics: dict[str, Any],
    limits: dict[str, float],
) -> None:
    failures = []
    if metrics["signalPixelFraction"] < limits["minimumSignalPixelFraction"]:
        failures.append("signalPixelFraction")
    if metrics["signalBoundingBoxFraction"] < limits["minimumSignalBoundingBoxFraction"]:
        failures.append("signalBoundingBoxFraction")
    edge_limit = limits["maximumEdgeSignalFraction"]
    for edge, fraction in metrics["edgeSignalFractions"].items():
        if fraction > edge_limit:
            failures.append(f"{edge}EdgeSignalFraction")
    if failures:
        raise RuntimeError(
            f"{label} is framing-ineligible: failed {failures}, "
            f"metrics={metrics}, limits={limits}",
        )


def png_emission_delta(
    first: Path,
    second: Path,
    cue_region: dict[str, list[int]],
) -> dict[str, Any]:
    first_width, first_height, first_rgb = decode_png_rgb(first)
    second_width, second_height, second_rgb = decode_png_rgb(second)
    if (first_width, first_height) != (second_width, second_height):
        raise RuntimeError("Matched emission frames have different dimensions")
    threshold = EMISSION_DELTA_LIMITS["pixelChannelThreshold"]
    changed_pixels = 0
    aggregate_delta = 0
    meaningful_delta = 0
    cue_changed_pixels = 0
    cue_meaningful_delta = 0
    peak_delta = 0
    min_x, min_y = first_width, first_height
    max_x = max_y = -1
    for pixel_index, offset in enumerate(range(0, len(first_rgb), 3)):
        deltas = [
            abs(first_rgb[offset + channel] - second_rgb[offset + channel])
            for channel in range(3)
        ]
        aggregate_delta += sum(deltas)
        pixel_peak = max(deltas)
        peak_delta = max(peak_delta, pixel_peak)
        if pixel_peak >= threshold:
            changed_pixels += 1
            meaningful_delta += sum(deltas)
            x = pixel_index % first_width
            y = pixel_index // first_width
            if (
                cue_region["min"][0] <= x <= cue_region["max"][0]
                and cue_region["min"][1] <= y <= cue_region["max"][1]
            ):
                cue_changed_pixels += 1
                cue_meaningful_delta += sum(deltas)
            min_x, min_y = min(min_x, x), min(min_y, y)
            max_x, max_y = max(max_x, x), max(max_y, y)
    pixel_count = first_width * first_height
    bounding_area = (
        (max_x - min_x + 1) * (max_y - min_y + 1)
        if changed_pixels
        else 0
    )
    return {
        "changedPixels": changed_pixels,
        "aggregateRgbDelta": aggregate_delta,
        "meaningfulRgbDelta": meaningful_delta,
        "peakChannelDelta": peak_delta,
        "changedPixelFraction": changed_pixels / pixel_count,
        "boundingBoxFraction": bounding_area / pixel_count,
        "boundingBox": (
            {"min": [min_x, min_y], "max": [max_x, max_y]}
            if changed_pixels
            else None
        ),
        "cueRegion": cue_region,
        "changedPixelsWithinCue": cue_changed_pixels,
        "meaningfulRgbDeltaWithinCue": cue_meaningful_delta,
        "changedPixelsWithinCueFraction": (
            cue_changed_pixels / changed_pixels if changed_pixels else 0.0
        ),
        "meaningfulRgbDeltaWithinCueFraction": (
            cue_meaningful_delta / meaningful_delta if meaningful_delta else 0.0
        ),
    }


def assert_emission_delta(metrics: dict[str, Any]) -> None:
    limits = EMISSION_DELTA_LIMITS
    failures = []
    if metrics["changedPixels"] < limits["minimumChangedPixels"]:
        failures.append("changedPixels")
    if metrics["meaningfulRgbDelta"] < limits["minimumAggregateRgbDelta"]:
        failures.append("meaningfulRgbDelta")
    if metrics["peakChannelDelta"] < limits["minimumPeakChannelDelta"]:
        failures.append("peakChannelDelta")
    if metrics["changedPixelFraction"] > limits["maximumChangedPixelFraction"]:
        failures.append("changedPixelFraction")
    if metrics["boundingBoxFraction"] > limits["maximumBoundingBoxFraction"]:
        failures.append("boundingBoxFraction")
    if failures:
        raise RuntimeError(
            f"Authored emission delta is not meaningful and localized: failed {failures}, "
            f"metrics={metrics}, limits={limits}",
        )


def assert_emission_delta_is_bound_to_cue(metrics: dict[str, Any]) -> None:
    limits = EMISSION_DELTA_SPATIAL_LIMITS
    failures = []
    if (
        metrics["changedPixelsWithinCueFraction"]
        < limits["minimumChangedPixelsWithinCueFraction"]
    ):
        failures.append("changedPixelsWithinCueFraction")
    if (
        metrics["meaningfulRgbDeltaWithinCueFraction"]
        < limits["minimumMeaningfulRgbDeltaWithinCueFraction"]
    ):
        failures.append("meaningfulRgbDeltaWithinCueFraction")
    if failures:
        raise RuntimeError(
            "Authored emission delta is not spatially bound to the exact named drive cues: "
            f"failed {failures}, metrics={metrics}, limits={limits}",
        )


def rounded(values: Iterable[float]) -> list[float]:
    return [round(float(value), 6) for value in values]


def id_property_value(owner: Any, key: str) -> Any:
    try:
        return owner.get(key)
    except (AttributeError, TypeError):
        return None


def plain_property(value: Any) -> Any:
    """Convert imported glTF ID properties into ordinary Python containers."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "keys"):
        return {str(key): plain_property(value[key]) for key in value.keys()}
    if hasattr(value, "to_list"):
        return [plain_property(item) for item in value.to_list()]
    if isinstance(value, (list, tuple)):
        return [plain_property(item) for item in value]
    return value


def is_collision_helper(obj: bpy.types.Object) -> bool:
    name = obj.name.upper()
    if name.startswith("COLLISION_"):
        return True
    if bool(id_property_value(obj, "sf_collision")):
        return True
    metadata = id_property_value(obj, "spaceface")
    try:
        return bool(metadata.get("collision") or metadata.get("nonRender"))
    except (AttributeError, TypeError):
        return False


def is_lod0_mesh(obj: bpy.types.Object) -> bool:
    if obj.type != "MESH" or is_collision_helper(obj):
        return False
    name = obj.name
    if name.startswith("LOD0_"):
        return True
    lod = id_property_value(obj, "spaceface.lod")
    if str(lod).lower() == "lod0":
        return True
    metadata = id_property_value(obj, "spaceface")
    try:
        if str(metadata.get("lod", "")).lower() == "lod0":
            return True
    except (AttributeError, TypeError):
        pass
    return False


def import_visible_lod0(source: Path) -> list[bpy.types.Object]:
    bpy.ops.import_scene.gltf(filepath=str(source))
    visible: list[bpy.types.Object] = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        enabled = is_lod0_mesh(obj)
        obj.hide_render = not enabled
        obj.hide_viewport = not enabled
        if enabled:
            visible.append(obj)
    if not visible:
        raise RuntimeError(f"{source} imported no visible LOD0 render meshes")
    visible_materials = {
        slot.material.name
        for obj in visible
        for slot in obj.material_slots
        if slot.material is not None
    }
    if visible_materials != EXPECTED_VISIBLE_LOD0_MATERIALS:
        raise RuntimeError(
            "Rig visible LOD0 material split drifted: "
            f"{sorted(visible_materials)} != {sorted(EXPECTED_VISIBLE_LOD0_MATERIALS)}",
        )
    return sorted(visible, key=lambda obj: obj.name)


def semantic_component_audit(
    group: str,
) -> tuple[tuple[str, int], ...]:
    if group in {"authored_rig", "full_rig"}:
        combined: list[tuple[str, int]] = []
        seen: set[str] = set()
        for source_group in (
            "capture_boom",
            "jaw_clevis",
            "tether_winch",
            "paired_drive",
            "forward_mount",
        ):
            for prefix, minimum in SEMANTIC_GROUP_REQUIREMENTS[source_group]:
                if prefix not in seen:
                    combined.append((prefix, minimum))
                    seen.add(prefix)
        return tuple(combined)
    rules = SEMANTIC_GROUP_REQUIREMENTS.get(group)
    if rules is None:
        raise KeyError(f"Unknown Rig semantic group: {group}")
    return rules


def audit_component_names(
    group: str,
    components: Sequence[str],
) -> list[dict[str, Any]]:
    if not components or any(not isinstance(name, str) for name in components):
        raise RuntimeError(f"Rig semantic group {group} has no valid named components")
    if list(components) != sorted(set(components)):
        raise RuntimeError(f"Rig semantic group {group} component names must be sorted and unique")
    if any(not name.startswith("Hook_") for name in components):
        raise RuntimeError(f"Rig semantic group {group} contains a non-Hook component")
    expected_group_count = SEMANTIC_GROUP_COUNTS.get(group)
    if expected_group_count is None:
        raise KeyError(f"Unknown Rig semantic group: {group}")
    if len(components) != expected_group_count:
        raise RuntimeError(
            f"Rig semantic group {group} has {len(components)} components, "
            f"expected exactly {expected_group_count}",
        )
    audit: list[dict[str, Any]] = []
    for prefix, expected in semantic_component_audit(group):
        matches = [name for name in components if name.startswith(prefix)]
        if len(matches) != expected:
            raise RuntimeError(
                f"Finalized Rig GLB cannot frame {group}: semantic prefix {prefix!r} "
                f"matched {len(matches)}, expected exactly {expected}",
            )
        audit.append({
            "namePrefix": prefix,
            "expectedCount": expected,
            "matchedCount": len(matches),
        })
    return audit


def xyz_vector(value: Any, label: str) -> Vector:
    if not isinstance(value, dict) or any(axis not in value for axis in ("x", "y", "z")):
        raise RuntimeError(f"{label} must be an x/y/z object")
    numbers = [value[axis] for axis in ("x", "y", "z")]
    if any(isinstance(number, bool) or not isinstance(number, (int, float)) for number in numbers):
        raise RuntimeError(f"{label} must contain numeric x/y/z values")
    if any(not math.isfinite(float(number)) for number in numbers):
        raise RuntimeError(f"{label} must contain finite x/y/z values")
    return Vector(tuple(float(number) for number in numbers))


def validate_local_group(group_name: str, value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RuntimeError(f"Rig semantic bounds group {group_name} must be an object")
    components = value.get("components")
    if (
        not isinstance(components, list)
        or any(not isinstance(name, str) for name in components)
    ):
        raise RuntimeError(f"Rig semantic bounds group {group_name} has no component list")
    normalized_components = list(components)
    if normalized_components != sorted(set(normalized_components)):
        raise RuntimeError(
            f"Rig semantic bounds group {group_name} components must be sorted and unique",
        )
    vectors = {
        field: xyz_vector(value.get(field), f"semanticBounds.groups.{group_name}.{field}")
        for field in ("min", "max", "center", "size")
    }
    # Blender converts imported custom-property numbers to float32. Retain the JSON scalars beside
    # the Vector form: vectors are appropriate for tolerance and camera math, but a receipt must
    # serialize the exact-source contract rather than float32 round-trip noise.
    exact = {
        "components": list(normalized_components),
        **{
            field: {
                axis: value[field][axis]
                for axis in ("x", "y", "z")
            }
            for field in ("min", "max", "center", "size")
        },
    }
    size = vectors["max"] - vectors["min"]
    center = (vectors["min"] + vectors["max"]) * 0.5
    tolerance = 1e-5
    if min(size) <= 1e-6:
        raise RuntimeError(f"Rig semantic bounds group {group_name} is degenerate")
    if (vectors["size"] - size).length > tolerance:
        raise RuntimeError(f"Rig semantic bounds group {group_name} size is inconsistent")
    if (vectors["center"] - center).length > tolerance:
        raise RuntimeError(f"Rig semantic bounds group {group_name} center is inconsistent")
    normalized = {
        "components": normalized_components,
        **vectors,
        "exact": exact,
    }
    if group_name == "fullRig":
        raw_nodes = value.get("visualNodes")
        if not isinstance(raw_nodes, list) or not raw_nodes:
            raise RuntimeError("Rig fullRig group has no visualNodes")
        visual_nodes: list[dict[str, Any]] = []
        for entry in raw_nodes:
            if not isinstance(entry, dict) or not isinstance(entry.get("name"), str):
                raise RuntimeError("Rig fullRig visualNodes entry has no valid name")
            materials = entry.get("materials")
            if (
                not isinstance(materials, list)
                or not materials
                or any(not isinstance(name, str) for name in materials)
                or materials != sorted(set(materials))
            ):
                raise RuntimeError(
                    f"Rig fullRig visual node {entry['name']} has invalid materials",
                )
            visual_nodes.append({
                "name": entry["name"],
                "materials": list(materials),
            })
        if visual_nodes != sorted(visual_nodes, key=lambda entry: entry["name"]):
            raise RuntimeError("Rig fullRig visualNodes must be sorted")
        if len({entry["name"] for entry in visual_nodes}) != len(visual_nodes):
            raise RuntimeError("Rig fullRig visualNodes must be unique")
        normalized["visualNodes"] = visual_nodes
        exact["visualNodes"] = [
            {"name": entry["name"], "materials": list(entry["materials"])}
            for entry in visual_nodes
        ]
    return normalized


def exact_source_material_truth(source: Path) -> dict[str, Any]:
    """Read root material truth from GLB JSON without Blender float32 coercion."""
    data = source.read_bytes()
    if len(data) < 20:
        raise RuntimeError(f"Rig source is not a complete GLB: {source}")
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(data):
        raise RuntimeError(
            f"Rig source has an invalid GLB header: "
            f"magic={magic!r} version={version} length={declared_length}/{len(data)}",
        )
    offset = 12
    document = None
    while offset + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk_end = offset + chunk_length
        if chunk_end > len(data):
            raise RuntimeError(f"Rig source GLB chunk overruns the file: {source}")
        if chunk_type == b"JSON":
            document = json.loads(data[offset:chunk_end].rstrip(b"\x00 \t\r\n").decode("utf-8"))
            break
        offset = chunk_end
    if document is None:
        raise RuntimeError(f"Rig source GLB has no JSON chunk: {source}")
    roots = [
        node
        for node in document.get("nodes", [])
        if node.get("name") == RIG_ROOT_NAME
    ]
    if len(roots) != 1:
        raise RuntimeError(
            f"Rig source GLB must contain exactly one {RIG_ROOT_NAME}, found {len(roots)}",
        )
    try:
        material_truth = roots[0]["extras"]["spaceface"]["materialTruth"]
    except (KeyError, TypeError):
        raise RuntimeError(
            "Rig source GLB has no exact spaceface.materialTruth root contract",
        ) from None
    if not isinstance(material_truth, dict):
        raise RuntimeError("Rig source materialTruth contract must be an object")
    return material_truth


def exact_source_semantic_contract(source: Path) -> dict[str, Any]:
    """Read the semantic contract from exact GLB root material truth."""
    try:
        contract = exact_source_material_truth(source)["semanticBounds"]
    except (KeyError, TypeError):
        raise RuntimeError(
            "Rig source GLB has no exact spaceface.materialTruth.semanticBounds contract",
        ) from None
    if not isinstance(contract, dict):
        raise RuntimeError("Rig source semanticBounds contract must be an object")
    return contract


def validate_emission_cue_inventory(value: Any) -> dict[str, Any]:
    """Require exact named, pre-merge Cyan ownership for the paired-drive emission proof."""
    if not isinstance(value, dict) or value.get("schema") != RIG_COMPONENT_INVENTORY_SCHEMA:
        raise RuntimeError("Rig component inventory has no supported material-binding schema")
    roles = value.get("roles")
    if not isinstance(roles, list):
        raise RuntimeError("Rig component inventory roles must be a list")
    rows = [row for row in roles if isinstance(row, dict) and row.get("role") == EMISSION_CUE_ROLE]
    if len(rows) != 1:
        raise RuntimeError("Rig component inventory must contain exactly one driveInternalCue role")
    row = rows[0]
    names = row.get("names")
    if names != list(EMISSION_CUE_NAMES) or row.get("count") != len(EMISSION_CUE_NAMES):
        raise RuntimeError("Rig component inventory has invalid named drive internal cues")
    if row.get("namePrefix") != "Hook_DriveInternalCue_":
        raise RuntimeError("Rig component inventory has an invalid drive internal cue prefix")
    if row.get("material") != EMISSION_CUE_MATERIAL:
        raise RuntimeError("Rig drive internal cues must own exactly Material_Cyan")
    expected_bindings = {name: EMISSION_CUE_MATERIAL for name in EMISSION_CUE_NAMES}
    if row.get("materialBindings") != expected_bindings:
        raise RuntimeError("Rig drive internal cue material bindings are not exact")
    bounds = row.get("bounds")
    if not isinstance(bounds, dict):
        raise RuntimeError("Rig drive internal cues have no root-local bounds")
    vectors = {
        field: xyz_vector(bounds.get(field), f"componentInventory.{EMISSION_CUE_ROLE}.bounds.{field}")
        for field in ("min", "max", "center", "size")
    }
    size = vectors["max"] - vectors["min"]
    center = (vectors["min"] + vectors["max"]) * 0.5
    if min(size) <= 1e-6:
        raise RuntimeError("Rig drive internal cue bounds are degenerate")
    if (vectors["size"] - size).length > 1e-5 or (vectors["center"] - center).length > 1e-5:
        raise RuntimeError("Rig drive internal cue bounds are inconsistent")
    return {
        "components": list(EMISSION_CUE_NAMES),
        "material": EMISSION_CUE_MATERIAL,
        "min": vectors["min"],
        "max": vectors["max"],
        "center": vectors["center"],
        "size": vectors["size"],
        "exact": {
            field: {axis: bounds[field][axis] for axis in ("x", "y", "z")}
            for field in ("min", "max", "center", "size")
        },
    }


def imported_semantic_contract(source: Path) -> tuple[bpy.types.Object, dict[str, Any]]:
    root = bpy.data.objects.get(RIG_ROOT_NAME)
    if root is None:
        raise RuntimeError(f"Finalized Rig GLB has no exact root {RIG_ROOT_NAME}")
    spaceface = plain_property(id_property_value(root, "spaceface"))
    try:
        material_truth = spaceface["materialTruth"]
        contract = material_truth["semanticBounds"]
    except (KeyError, TypeError):
        raise RuntimeError(
            "Finalized Rig GLB has no spaceface.materialTruth.semanticBounds contract",
        ) from None
    if not isinstance(contract, dict):
        raise RuntimeError("Rig semanticBounds contract must be an object")
    if contract.get("schema") != SEMANTIC_BOUNDS_SCHEMA:
        raise RuntimeError(f"Unsupported Rig semanticBounds schema: {contract.get('schema')!r}")
    if contract.get("basis") != SEMANTIC_BOUNDS_BASIS:
        raise RuntimeError(f"Unsupported Rig semanticBounds basis: {contract.get('basis')!r}")
    raw_groups = contract.get("groups")
    required_group_names = set(SEMANTIC_CONTRACT_GROUPS.values())
    if not isinstance(raw_groups, dict) or set(raw_groups) != required_group_names:
        raise RuntimeError(
            f"Rig semanticBounds groups must be exactly {sorted(required_group_names)}",
        )
    groups = {
        name: validate_local_group(name, raw_groups[name])
        for name in sorted(required_group_names)
    }
    exact_contract = exact_source_semantic_contract(source)
    exact_material_truth = exact_source_material_truth(source)
    if exact_contract.get("schema") != SEMANTIC_BOUNDS_SCHEMA:
        raise RuntimeError(
            f"Unsupported exact-source Rig semanticBounds schema: "
            f"{exact_contract.get('schema')!r}",
        )
    if exact_contract.get("basis") != SEMANTIC_BOUNDS_BASIS:
        raise RuntimeError(
            f"Unsupported exact-source Rig semanticBounds basis: "
            f"{exact_contract.get('basis')!r}",
        )
    exact_raw_groups = exact_contract.get("groups")
    if not isinstance(exact_raw_groups, dict) or set(exact_raw_groups) != required_group_names:
        raise RuntimeError(
            f"Exact-source Rig semanticBounds groups must be exactly "
            f"{sorted(required_group_names)}",
        )
    exact_groups = {
        name: validate_local_group(name, exact_raw_groups[name])
        for name in sorted(required_group_names)
    }
    for name in sorted(required_group_names):
        imported_group = groups[name]
        exact_group = exact_groups[name]
        if imported_group["components"] != exact_group["components"]:
            raise RuntimeError(f"Imported Rig semantic group {name} changed component identity")
        if imported_group.get("visualNodes") != exact_group.get("visualNodes"):
            raise RuntimeError(f"Imported Rig semantic group {name} changed visual-node identity")
        for field in ("min", "max", "center", "size"):
            if (imported_group[field] - exact_group[field]).length > 1e-5:
                raise RuntimeError(
                    f"Imported Rig semantic group {name}.{field} drifted from exact GLB JSON",
                )

    close_names = ("capture", "jaw", "winch", "drives", "forwardMount")
    expected_components = sorted({
        component
        for name in close_names
        for component in groups[name]["components"]
    })
    if groups["authoredRig"]["components"] != expected_components:
        raise RuntimeError("Rig authoredRig components must equal the semantic-group union")
    union_min = Vector(tuple(
        min(groups[name]["min"][axis] for name in close_names)
        for axis in range(3)
    ))
    union_max = Vector(tuple(
        max(groups[name]["max"][axis] for name in close_names)
        for axis in range(3)
    ))
    if (groups["authoredRig"]["min"] - union_min).length > 1e-5:
        raise RuntimeError("Rig authoredRig minimum must equal the semantic-group union")
    if (groups["authoredRig"]["max"] - union_max).length > 1e-5:
        raise RuntimeError("Rig authoredRig maximum must equal the semantic-group union")
    if groups["fullRig"]["components"] != groups["authoredRig"]["components"]:
        raise RuntimeError("Rig fullRig components must retain authoredRig provenance")
    for axis in range(3):
        if (
            groups["fullRig"]["min"][axis] > groups["authoredRig"]["min"][axis] + 1e-5
            or groups["fullRig"]["max"][axis] < groups["authoredRig"]["max"][axis] - 1e-5
        ):
            raise RuntimeError("Rig fullRig bounds must contain authoredRig")
    imported_cue = validate_emission_cue_inventory(material_truth.get("componentInventory"))
    exact_cue = validate_emission_cue_inventory(exact_material_truth.get("componentInventory"))
    if (
        imported_cue["components"] != exact_cue["components"]
        or imported_cue["material"] != exact_cue["material"]
    ):
        raise RuntimeError("Imported Rig drive internal cue identity changed from exact GLB JSON")
    for field in ("min", "max", "center", "size"):
        if (imported_cue[field] - exact_cue[field]).length > 1e-5:
            raise RuntimeError(
                f"Imported Rig drive internal cue {field} drifted from exact GLB JSON",
            )
    return root, {
        "schema": exact_contract["schema"],
        "basis": exact_contract["basis"],
        "groups": exact_groups,
        "emissionCue": exact_cue,
    }


def bounds_from_points(points: Sequence[Vector]) -> dict[str, Any]:
    if not points:
        raise RuntimeError("Cannot derive evidence bounds from an empty point set")
    lo = Vector((
        min(point.x for point in points),
        min(point.y for point in points),
        min(point.z for point in points),
    ))
    hi = Vector((
        max(point.x for point in points),
        max(point.y for point in points),
        max(point.z for point in points),
    ))
    size = hi - lo
    if min(size) <= 1e-6:
        raise RuntimeError(f"Degenerate evidence bounds: min={tuple(lo)} max={tuple(hi)}")
    return {
        "min": lo,
        "max": hi,
        "center": (lo + hi) * 0.5,
        "size": size,
        "radius": max(size.length * 0.5, 0.25),
        "points": list(points),
    }


def semantic_world_bounds(
    root: bpy.types.Object,
    local_group: dict[str, Any],
) -> dict[str, Any]:
    lo, hi = local_group["min"], local_group["max"]
    points = [
        # The root extras remain in exported/runtime Y-up coordinates. Blender's glTF importer
        # converts mesh coordinates back to Z-up but does not rewrite numeric extras, so apply the
        # inverse of the builder's runtime_point_from_blender mapping before root.matrix_world.
        root.matrix_world @ Vector((x, -z, y))
        for x in (lo.x, hi.x)
        for y in (lo.y, hi.y)
        for z in (lo.z, hi.z)
    ]
    return bounds_from_points(points)


def local_group_receipt(local_group: dict[str, Any]) -> dict[str, Any]:
    exact = local_group.get("exact")
    if not isinstance(exact, dict):
        raise RuntimeError("Rig local semantic group lost its exact-source scalar contract")
    receipt = {
        "components": list(exact["components"]),
        **{
            field: {
                axis: round(float(exact[field][axis]), 6)
                for axis in ("x", "y", "z")
            }
            for field in ("min", "max", "center", "size")
        },
    }
    if "visualNodes" in exact:
        receipt["visualNodes"] = [
            {"name": entry["name"], "materials": list(entry["materials"])}
            for entry in exact["visualNodes"]
        ]
    return receipt


def receipt_bounds(bounds: dict[str, Any]) -> dict[str, list[float]]:
    return {
        "min": rounded(bounds["min"]),
        "max": rounded(bounds["max"]),
        "center": rounded(bounds["center"]),
        "size": rounded(bounds["size"]),
    }


def fit_camera_to_bounds(
    camera: bpy.types.Object,
    bounds: dict[str, Any],
    *,
    direction_values: Sequence[float],
    lens: float,
    size: tuple[int, int],
    margin: float,
    orthographic: bool,
) -> tuple[dict[str, Any], dict[str, Vector]]:
    target: Vector = bounds["center"].copy()
    direction = Vector(direction_values)
    if direction.length <= 1e-6:
        raise ValueError("Evidence camera direction must be non-zero")
    direction.normalize()
    rotation = (target - (target + direction)).to_track_quat("-Z", "Y")
    right = rotation @ Vector((1.0, 0.0, 0.0))
    up = rotation @ Vector((0.0, 1.0, 0.0))
    deltas = [point - target for point in bounds["points"]]
    aspect = float(size[0]) / float(size[1])
    fit_margin = margin * CAMERA_FIT_SAFETY

    if orthographic:
        half_width = max(abs(delta.dot(right)) for delta in deltas)
        half_height = max(abs(delta.dot(up)) for delta in deltas)
        # Blender's Camera.ortho_scale is the image-plane horizontal span. The visible vertical
        # span is therefore ``ortho_scale / aspect``; using the inverse cropped the fullRig while
        # the former metadata-only calculation claimed it fit.
        ortho_scale = max(
            2.0 * half_width * fit_margin,
            2.0 * half_height * fit_margin * aspect,
        )
        distance = max(bounds["radius"] * 3.0, 2.0)
        location = target + direction * distance
        camera_mode: dict[str, Any] = {
            "projection": "orthographic",
            "orthoScale": round(ortho_scale, 6),
        }
    else:
        camera.data.sensor_fit = "HORIZONTAL"
        tan_horizontal = camera.data.sensor_width / (2.0 * lens)
        tan_vertical = tan_horizontal / aspect
        distance = max(
            max(
                fit_margin * abs(delta.dot(right)) / tan_horizontal + delta.dot(direction),
                fit_margin * abs(delta.dot(up)) / tan_vertical + delta.dot(direction),
            )
            for delta in deltas
        )
        nearest_safe = max(delta.dot(direction) for delta in deltas) + 0.1
        distance = max(distance, nearest_safe, bounds["radius"] * 1.05)
        location = target + direction * distance
        camera_mode = {
            "projection": "perspective",
            "lensMm": round(lens, 6),
        }

    metadata = {
        **camera_mode,
        "location": rounded(location),
        "target": rounded(target),
        "direction": rounded(direction),
        "right": rounded(right),
        "up": rounded(up),
        "sensorWidthMm": round(float(camera.data.sensor_width), 6),
        "aspect": round(aspect, 9),
        "margin": round(margin, 6),
        "fitSafetyFactor": CAMERA_FIT_SAFETY,
        "projectedCornerLimit": round(1.0 / margin, 9),
        "resolution": [int(size[0]), int(size[1])],
    }
    return metadata, {"direction": direction, "right": right, "up": up}


def assert_camera_contains_bounds(
    camera_metadata: dict[str, Any],
    bounds: dict[str, Any],
) -> list[float]:
    """Project all eight semantic AABB corners and fail before rendering on any crop."""
    location = Vector(camera_metadata["location"])
    direction = Vector(camera_metadata["direction"])
    right = Vector(camera_metadata["right"])
    up = Vector(camera_metadata["up"])
    forward = -direction
    maximum_x = maximum_y = 0.0
    for point in bounds["points"]:
        offset = point - location
        if camera_metadata["projection"] == "perspective":
            depth = offset.dot(forward)
            if depth <= 0.0:
                raise RuntimeError("Semantic evidence corner lies behind its fitted camera")
            tan_horizontal = (
                camera_metadata["sensorWidthMm"] / (2.0 * camera_metadata["lensMm"])
            )
            tan_vertical = tan_horizontal / camera_metadata["aspect"]
            projected_x = abs(offset.dot(right)) / (depth * tan_horizontal)
            projected_y = abs(offset.dot(up)) / (depth * tan_vertical)
        else:
            projected_x = (
                2.0 * abs(offset.dot(right))
                / camera_metadata["orthoScale"]
            )
            projected_y = (
                2.0 * abs(offset.dot(up)) * camera_metadata["aspect"]
                / camera_metadata["orthoScale"]
            )
        maximum_x = max(maximum_x, projected_x)
        maximum_y = max(maximum_y, projected_y)
    limit = float(camera_metadata["projectedCornerLimit"])
    if maximum_x > limit or maximum_y > limit:
        raise RuntimeError(
            "Fitted evidence camera crops semantic bounds: "
            f"maximum=({maximum_x:.9f}, {maximum_y:.9f}) limit={limit:.9f}",
        )
    return [round(maximum_x, 9), round(maximum_y, 9)]


def place_light(
    name: str,
    location: Vector,
    target: Vector,
    *,
    energy: float,
    size: float,
    color: tuple[float, float, float],
    light_type: str,
    shape: str,
) -> None:
    light = bpy.data.objects.get(name)
    if light is None or light.type != "LIGHT":
        raise RuntimeError(f"Missing evidence light {name}")
    light.location = location
    if light.data.type != light_type:
        light.data.type = light_type
    light.data.energy = energy
    light.data.color = color
    light.data.shape = shape
    light.data.size = size
    base.point_at(light, tuple(target))


def lighting_contract_receipt() -> dict[str, Any]:
    """Return a JSON-native copy suitable for a stable receipt and independent test fixture."""
    return json.loads(json.dumps(LIGHTING_PROFILE_CONTRACT))


def world_background_node() -> bpy.types.Node:
    world = bpy.context.scene.world
    if world is None or not world.use_nodes or world.node_tree is None:
        raise RuntimeError("Material-truth scene has no node world")
    background = world.node_tree.nodes.get("Background")
    if background is None:
        raise RuntimeError("Material-truth scene has no world Background node")
    return background


def configure_view_lighting(
    bounds: dict[str, Any],
    basis: dict[str, Vector],
    profile: str,
) -> dict[str, Any]:
    target: Vector = bounds["center"]
    radius = bounds["radius"]
    direction, right, up = basis["direction"], basis["right"], basis["up"]
    scale_contract = LIGHTING_PROFILE_CONTRACT["energyScale"]
    energy_scale = max(
        float(scale_contract["minimum"]),
        min(
            float(scale_contract["maximum"]),
            float(scale_contract["radiusSquaredMultiplier"]) * radius * radius,
        ),
    )
    profiles = LIGHTING_PROFILE_CONTRACT["profiles"]
    if profile not in profiles:
        raise ValueError(f"Unknown evidence lighting profile {profile}")
    profile_contract = profiles[profile]

    scene = bpy.context.scene
    scene.view_settings.exposure = float(profile_contract["exposure"])
    background = world_background_node()
    background.inputs["Strength"].default_value = float(profile_contract["worldStrength"])

    light_contracts = profile_contract["lights"]
    expected_lights = ("ASHLINE_KEY", "ASHLINE_FILL", "ASHLINE_RIM", "ASHLINE_KICKER")
    if set(light_contracts) != set(expected_lights):
        raise RuntimeError(
            f"Evidence lighting profile {profile} must define exactly {expected_lights}",
        )
    for name in expected_lights:
        light_contract = light_contracts[name]
        location_basis = light_contract["locationBasis"]
        location = (
            target
            + direction * (float(location_basis["direction"]) * radius)
            + right * (float(location_basis["right"]) * radius)
            + up * (float(location_basis["up"]) * radius)
        )
        place_light(
            name,
            location,
            target,
            energy=energy_scale * float(light_contract["energyMultiplier"]),
            size=max(
                float(light_contract["minimumSize"]),
                radius * float(light_contract["radiusSizeMultiplier"]),
            ),
            color=tuple(float(value) for value in light_contract["color"]),
            light_type=str(light_contract["type"]),
            shape=str(light_contract["shape"]),
        )

    light_states = {}
    for name in ("ASHLINE_KEY", "ASHLINE_FILL", "ASHLINE_RIM", "ASHLINE_KICKER"):
        light = bpy.data.objects[name]
        light_states[name] = {
            "location": rounded(light.location),
            "type": str(light.data.type),
            "energy": round(float(light.data.energy), 3),
            "size": round(float(light.data.size), 3),
            "color": rounded(light.data.color),
            "shape": str(light.data.shape),
        }
    return {
        "profile": profile,
        "contractSha256": canonical_json_sha256(LIGHTING_PROFILE_CONTRACT),
        "exposure": round(float(bpy.context.scene.view_settings.exposure), 3),
        "worldStrength": round(float(background.inputs["Strength"].default_value), 3),
        "energyScale": round(energy_scale, 3),
        "lights": light_states,
    }


class AuthoredEmission:
    """Temporarily disable the authored Rig cue while preserving linked shader inputs exactly."""

    def __init__(
        self,
        visible_objects: Sequence[bpy.types.Object],
        cue_contract: dict[str, Any],
    ) -> None:
        materials: dict[str, bpy.types.Material] = {}
        if (
            cue_contract.get("components") != list(EMISSION_CUE_NAMES)
            or cue_contract.get("material") != EMISSION_CUE_MATERIAL
        ):
            raise RuntimeError(
                "Paired-drive emission proof requires exact named Material_Cyan internal cues",
            )
        for obj in visible_objects:
            for slot in obj.material_slots:
                material = slot.material
                if material is not None and material.name == EMISSION_CUE_MATERIAL:
                    materials[material.name] = material
        if not materials:
            raise RuntimeError("Visible LOD0 has no authored Material_Cyan emission role")

        self.states: list[dict[str, Any]] = []
        for material in materials.values():
            if not material.use_nodes or material.node_tree is None:
                continue
            for node in material.node_tree.nodes:
                strength = node.inputs.get("Emission Strength")
                if strength is None and node.type == "EMISSION":
                    strength = node.inputs.get("Strength")
                if strength is None:
                    continue
                incoming = [
                    link.from_socket
                    for link in material.node_tree.links
                    if link.to_socket == strength
                ]
                default_value = float(strength.default_value)
                if default_value <= 0.0 and not incoming:
                    continue
                self.states.append({
                    "material": material,
                    "tree": material.node_tree,
                    "node": node,
                    "socket": strength,
                    "default": default_value,
                    "incoming": incoming,
                })
        if not self.states:
            raise RuntimeError(
                "Authored Material_Cyan has no non-zero or linked emission-strength input",
            )
        self.material_names = sorted({state["material"].name for state in self.states})
        self.bindings = sorted(
            (
                {
                    "material": state["material"].name,
                    "node": state["node"].name,
                    "socket": state["socket"].name,
                    "authoredStrength": round(float(state["default"]), 6),
                    "incomingLinks": len(state["incoming"]),
                }
                for state in self.states
            ),
            key=lambda binding: (binding["material"], binding["node"], binding["socket"]),
        )

    def set_enabled(self, enabled: bool) -> None:
        for state in self.states:
            tree = state["tree"]
            socket = state["socket"]
            for link in list(tree.links):
                if link.to_socket == socket:
                    tree.links.remove(link)
            socket.default_value = state["default"] if enabled else 0.0
            if enabled:
                for from_socket in state["incoming"]:
                    tree.links.new(from_socket, socket)


def configure_scene() -> bpy.types.Object:
    camera = base.configure_scene()
    scene = bpy.context.scene
    legacy_detail = bpy.data.objects.get("ASHLINE_DETAIL")
    kicker = bpy.data.objects.get("ASHLINE_KICKER")
    if kicker is None and legacy_detail is not None and legacy_detail.type == "LIGHT":
        legacy_detail.name = "ASHLINE_KICKER"
        legacy_detail.data.name = "ASHLINE_KICKER"
    elif kicker is None:
        raise RuntimeError("Material-truth scene has no fourth evidence light")
    if tuple(bpy.app.version) != EXPECTED_BLENDER_VERSION:
        raise RuntimeError(
            f"Rig evidence requires Blender {EXPECTED_BLENDER_VERSION}, "
            f"got {tuple(bpy.app.version)}",
        )
    bpy.context.preferences.system.gpu_backend = "OPENGL"
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_samples = 64
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_taa_reprojection = False
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    scene.render.film_transparent = True
    scene.render.use_file_extension = True
    scene.render.dither_intensity = 0.0
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    neutral_profile = LIGHTING_PROFILE_CONTRACT["profiles"]["neutral"]
    scene.view_settings.exposure = float(neutral_profile["exposure"])
    scene.view_settings.gamma = 1.0
    scene.view_settings.use_curve_mapping = False
    background = world_background_node()
    background.inputs["Color"].default_value = tuple(
        float(value)
        for value in LIGHTING_PROFILE_CONTRACT["world"]["backgroundColor"]
    )
    background.inputs["Strength"].default_value = float(neutral_profile["worldStrength"])
    camera.data.clip_start = 0.02
    camera.data.clip_end = 2000.0
    return camera


def render_provenance() -> dict[str, Any]:
    scene = bpy.context.scene
    return {
        "blender": {
            "version": bpy.app.version_string,
            "versionTuple": list(bpy.app.version),
        },
        "settings": {
            "engine": scene.render.engine,
            "device": {
                "class": "GPU_RASTER",
                "backend": bpy.context.preferences.system.gpu_backend,
            },
            "samples": {
                "viewportTaa": int(scene.eevee.taa_samples),
                "renderTaa": int(scene.eevee.taa_render_samples),
                "taaReprojection": bool(scene.eevee.use_taa_reprojection),
            },
            "png": {
                "format": scene.render.image_settings.file_format,
                "colorMode": scene.render.image_settings.color_mode,
                "colorDepth": scene.render.image_settings.color_depth,
                "compression": int(scene.render.image_settings.compression),
                "useFileExtension": bool(scene.render.use_file_extension),
            },
            "colorManagement": {
                "viewTransform": scene.view_settings.view_transform,
                "look": scene.view_settings.look,
                "exposure": round(float(scene.view_settings.exposure), 6),
                "gamma": float(scene.view_settings.gamma),
                "curveMapping": bool(scene.view_settings.use_curve_mapping),
                "ditherIntensity": float(scene.render.dither_intensity),
            },
            "filmTransparent": bool(scene.render.film_transparent),
            "resolutionPercentage": int(scene.render.resolution_percentage),
            "pixelAspect": {
                "x": float(scene.render.pixel_aspect_x),
                "y": float(scene.render.pixel_aspect_y),
            },
            "lightingContract": lighting_contract_receipt(),
            "lightingContractSha256": canonical_json_sha256(LIGHTING_PROFILE_CONTRACT),
        },
    }


def configure_camera_for_metadata(
    camera: bpy.types.Object,
    camera_metadata: dict[str, Any],
) -> None:
    scene = bpy.context.scene
    camera.location = camera_metadata["location"]
    base.point_at(camera, tuple(camera_metadata["target"]))
    if camera_metadata["projection"] == "orthographic":
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = camera_metadata["orthoScale"]
    else:
        camera.data.type = "PERSP"
        camera.data.lens = camera_metadata["lensMm"]
    scene.render.resolution_x, scene.render.resolution_y = camera_metadata["resolution"]
    scene.camera = camera


def assert_blender_camera_contains_bounds(
    camera: bpy.types.Object,
    camera_metadata: dict[str, Any],
    bounds: dict[str, Any],
) -> list[float]:
    """Verify the configured Blender camera, not only our analytic projection algebra."""
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    maximum_x = maximum_y = 0.0
    for point in bounds["points"]:
        projected = world_to_camera_view(scene, camera, point)
        projected_x = 2.0 * abs(float(projected.x) - 0.5)
        projected_y = 2.0 * abs(float(projected.y) - 0.5)
        maximum_x = max(maximum_x, projected_x)
        maximum_y = max(maximum_y, projected_y)
    limit = float(camera_metadata["projectedCornerLimit"])
    if maximum_x > limit + 1e-5 or maximum_y > limit + 1e-5:
        raise RuntimeError(
            "Configured Blender evidence camera crops semantic bounds: "
            f"maximum=({maximum_x:.9f}, {maximum_y:.9f}) limit={limit:.9f}",
        )
    return [round(maximum_x, 9), round(maximum_y, 9)]


def render_frame(
    camera: bpy.types.Object,
    output: Path,
    camera_metadata: dict[str, Any],
    bounds: dict[str, Any],
) -> None:
    configure_camera_for_metadata(camera, camera_metadata)
    blender_projection = assert_blender_camera_contains_bounds(
        camera,
        camera_metadata,
        bounds,
    )
    analytic_projection = camera_metadata["projectedCornerMaximum"]
    if any(
        abs(float(expected) - float(actual)) > 1e-5
        for expected, actual in zip(analytic_projection, blender_projection)
    ):
        raise RuntimeError(
            "Evidence camera analytic projection drifted from Blender: "
            f"analytic={analytic_projection} blender={blender_projection}",
        )
    scene = bpy.context.scene
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def projected_semantic_region(
    camera: bpy.types.Object,
    bounds: dict[str, Any],
) -> dict[str, list[int]]:
    """Project the exact named semantic AABB into PNG pixel coordinates."""
    scene = bpy.context.scene
    width = int(scene.render.resolution_x)
    height = int(scene.render.resolution_y)
    projected = [world_to_camera_view(scene, camera, point) for point in bounds["points"]]
    minimum_x = max(0, min(width - 1, int(math.floor(min(point.x for point in projected) * width))))
    maximum_x = max(0, min(width - 1, int(math.ceil(max(point.x for point in projected) * width)) - 1))
    minimum_y = max(
        0,
        min(
            height - 1,
            int(math.floor((1.0 - max(point.y for point in projected)) * height)),
        ),
    )
    maximum_y = max(
        0,
        min(
            height - 1,
            int(math.ceil((1.0 - min(point.y for point in projected)) * height)) - 1,
        ),
    )
    if minimum_x > maximum_x or minimum_y > maximum_y:
        raise RuntimeError("Projected semantic region is empty")
    return {"min": [minimum_x, minimum_y], "max": [maximum_x, maximum_y]}


def padded_projected_region(region: dict[str, list[int]]) -> dict[str, list[int]]:
    """Allow a small anti-aliasing halo while requiring emission inside named cue bounds."""
    padding = EMISSION_DELTA_SPATIAL_LIMITS["pixelPadding"]
    width = int(bpy.context.scene.render.resolution_x)
    height = int(bpy.context.scene.render.resolution_y)
    return {
        "min": [
            max(0, region["min"][0] - padding),
            max(0, region["min"][1] - padding),
        ],
        "max": [
            min(width - 1, region["max"][0] + padding),
            min(height - 1, region["max"][1] + padding),
        ],
    }


def srgb_byte_to_linear(value: int) -> float:
    encoded = float(value) / 255.0
    return encoded / 12.92 if encoded <= 0.04045 else ((encoded + 0.055) / 1.055) ** 2.4


class TemporaryMaterialIdPass:
    """Transaction-local flat material segmentation that restores the surfaced scene exactly."""

    def __init__(self, visible: Sequence[bpy.types.Object]) -> None:
        self.visible = list(visible)
        self.scene = bpy.context.scene
        self.original_slots = [
            (obj, index, slot.material)
            for obj in self.visible
            for index, slot in enumerate(obj.material_slots)
        ]
        original_names = {
            material.name
            for _obj, _index, material in self.original_slots
            if material is not None
        }
        if original_names != EXPECTED_VISIBLE_LOD0_MATERIALS:
            raise RuntimeError(
                "Material-ID pass requires the exact nine authored LOD0 materials: "
                f"{sorted(original_names)}",
            )
        background = world_background_node()
        self.scene_state = {
            "viewTransform": str(self.scene.view_settings.view_transform),
            "look": str(self.scene.view_settings.look),
            "exposure": float(self.scene.view_settings.exposure),
            "gamma": float(self.scene.view_settings.gamma),
            "dither": float(self.scene.render.dither_intensity),
            "backgroundColor": tuple(background.inputs["Color"].default_value),
            "backgroundStrength": float(background.inputs["Strength"].default_value),
            "filepath": str(self.scene.render.filepath),
        }
        self.materials: dict[str, bpy.types.Material] = {}
        self.active = False

    def apply(self) -> None:
        if self.active:
            raise RuntimeError("Material-ID pass is already active")
        self.active = True
        for material_name, color in MATERIAL_ID_PALETTE.items():
            material = bpy.data.materials.new(name=f"__ASHLINE_ID__{material_name}")
            material.use_nodes = True
            tree = material.node_tree
            if tree is None:
                raise RuntimeError(f"Material-ID node tree missing for {material_name}")
            tree.nodes.clear()
            output = tree.nodes.new("ShaderNodeOutputMaterial")
            emission = tree.nodes.new("ShaderNodeEmission")
            emission.inputs["Color"].default_value = (
                *(srgb_byte_to_linear(value) for value in color),
                1.0,
            )
            emission.inputs["Strength"].default_value = 1.0
            tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
            self.materials[material_name] = material
        for obj, index, material in self.original_slots:
            if material is None or material.name not in self.materials:
                raise RuntimeError(f"Unclassified material slot on {obj.name}")
            obj.material_slots[index].material = self.materials[material.name]
        background = world_background_node()
        background.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
        background.inputs["Strength"].default_value = 0.0
        self.scene.view_settings.view_transform = "Standard"
        self.scene.view_settings.look = "None"
        self.scene.view_settings.exposure = 0.0
        self.scene.view_settings.gamma = 1.0
        self.scene.render.dither_intensity = 0.0

    def restore(self, diagnostic_path: Path) -> None:
        try:
            if self.active:
                for obj, index, material in self.original_slots:
                    obj.material_slots[index].material = material
                background = world_background_node()
                background.inputs["Color"].default_value = self.scene_state["backgroundColor"]
                background.inputs["Strength"].default_value = self.scene_state["backgroundStrength"]
                self.scene.view_settings.view_transform = self.scene_state["viewTransform"]
                self.scene.view_settings.look = self.scene_state["look"]
                self.scene.view_settings.exposure = self.scene_state["exposure"]
                self.scene.view_settings.gamma = self.scene_state["gamma"]
                self.scene.render.dither_intensity = self.scene_state["dither"]
                self.scene.render.filepath = self.scene_state["filepath"]
        finally:
            self.active = False
            for material in self.materials.values():
                if material.users:
                    raise RuntimeError(
                        f"Temporary material-ID material still has users: {material.name}",
                    )
                bpy.data.materials.remove(material)
            self.materials.clear()
            diagnostic_path.unlink(missing_ok=True)

    def render_and_measure(
        self,
        camera: bpy.types.Object,
        camera_metadata: dict[str, Any],
        bounds: dict[str, Any],
        beauty_path: Path,
        diagnostic_path: Path,
        region: dict[str, list[int]],
    ) -> dict[str, Any]:
        try:
            self.apply()
            render_frame(camera, diagnostic_path, camera_metadata, bounds)
            return semantic_surface_metrics(beauty_path, diagnostic_path, region)
        finally:
            self.restore(diagnostic_path)


def semantic_surface_metrics(
    beauty_path: Path,
    material_id_path: Path,
    region: dict[str, list[int]],
) -> dict[str, Any]:
    """Measure authored material response only on exact material-ID pixels in the named region."""
    beauty_width, beauty_height, beauty = decode_png_rgb(beauty_path)
    id_width, id_height, material_ids = decode_png_rgb(material_id_path)
    if (beauty_width, beauty_height) != (id_width, id_height):
        raise RuntimeError("Beauty and material-ID diagnostic dimensions differ")
    histograms = {name: [0] * 256 for name in MATERIAL_ID_PALETTE}
    counts = {name: 0 for name in MATERIAL_ID_PALETTE}
    classified = 0
    minimum_x, minimum_y = region["min"]
    maximum_x, maximum_y = region["max"]
    for y in range(minimum_y, maximum_y + 1):
        for x in range(minimum_x, maximum_x + 1):
            offset = (y * beauty_width + x) * 3
            nearest_name = None
            nearest_distance = math.inf
            for material_name, color in MATERIAL_ID_PALETTE.items():
                distance = sum(
                    abs(int(material_ids[offset + channel]) - color[channel])
                    for channel in range(3)
                )
                if distance < nearest_distance:
                    nearest_name = material_name
                    nearest_distance = distance
            if nearest_name is None or nearest_distance > MATERIAL_ID_MAX_RGB_DISTANCE:
                continue
            classified += 1
            counts[nearest_name] += 1
            luma = (
                0.2126 * beauty[offset]
                + 0.7152 * beauty[offset + 1]
                + 0.0722 * beauty[offset + 2]
            )
            histograms[nearest_name][max(0, min(255, int(math.floor(luma))))] += 1
    region_pixels = (maximum_x - minimum_x + 1) * (maximum_y - minimum_y + 1)

    def percentile(material_name: str, fraction: float) -> int | None:
        pixel_count = counts[material_name]
        if not pixel_count:
            return None
        target = max(1, math.ceil(pixel_count * fraction))
        cumulative = 0
        for value, count in enumerate(histograms[material_name]):
            cumulative += count
            if cumulative >= target:
                return value
        raise AssertionError("Semantic material histogram lost pixels")

    material_metrics = {}
    for material_name in MATERIAL_ID_PALETTE:
        p10 = percentile(material_name, 0.10)
        p25 = percentile(material_name, 0.25)
        p50 = percentile(material_name, 0.50)
        p90 = percentile(material_name, 0.90)
        material_metrics[material_name] = {
            "pixels": counts[material_name],
            "p10": p10,
            "p25": p25,
            "p50": p50,
            "p90": p90,
            "spread": p90 - p10 if p10 is not None and p90 is not None else None,
        }
    return {
        "region": region,
        "regionPixels": region_pixels,
        "classifiedPixels": classified,
        "regionPixelFraction": classified / region_pixels,
        "materials": material_metrics,
    }


def assert_semantic_surface_eligible(
    label: str,
    metrics: dict[str, Any],
    limits: dict[str, Any],
) -> None:
    failures = []
    if metrics["regionPixelFraction"] < limits["minimumRegionPixelFraction"]:
        failures.append("regionPixelFraction")
    for material_name, material_limits in limits["materials"].items():
        measured = metrics["materials"][material_name]
        if measured["pixels"] < material_limits["minimumPixels"]:
            failures.append(f"{material_name}.pixels")
            continue
        if measured["p25"] < material_limits["minimumP25"]:
            failures.append(f"{material_name}.p25")
        if measured["p50"] < material_limits["minimumP50"]:
            failures.append(f"{material_name}.p50")
        if measured["p50"] > MATERIAL_RESPONSE_MAXIMUM_P50[material_name]:
            failures.append(f"{material_name}.washedP50")
        if measured["spread"] < material_limits["minimumSpread"]:
            failures.append(f"{material_name}.spread")
    if failures:
        raise RuntimeError(
            f"{label} has ineligible semantic-local material response: "
            f"failed={failures}, metrics={metrics}, limits={limits}",
        )


def render_rig(source: Path, output_dir: Path) -> list[Path]:
    global LAST_RENDER_METADATA, LAST_RENDER_PROVENANCE
    base.clear_scene()
    visible = import_visible_lod0(source)
    camera = configure_scene()
    LAST_RENDER_PROVENANCE = render_provenance()
    output_dir.mkdir(parents=True, exist_ok=True)

    root, semantic_contract = imported_semantic_contract(source)
    cue_contract = semantic_contract["emissionCue"]
    cue_bounds = semantic_world_bounds(root, cue_contract)
    cue_receipt = {
        "components": list(cue_contract["components"]),
        "material": cue_contract["material"],
        "rootLocalBounds": cue_contract["exact"],
    }
    groups: dict[str, dict[str, Any]] = {}
    for group, contract_group in SEMANTIC_CONTRACT_GROUPS.items():
        local_group = semantic_contract["groups"][contract_group]
        audit = audit_component_names(group, local_group["components"])
        bounds = semantic_world_bounds(root, local_group)
        groups[group] = {
            "components": list(local_group["components"]),
            "audit": audit,
            "bounds": bounds,
            "contractGroup": contract_group,
            "localGroup": local_group,
        }
    full_rig_views = {
        str(spec["name"])
        for spec in VIEW_SPECS
        if str(spec["group"]) == "full_rig"
    }
    if set(FRAME_LIMITS) != full_rig_views:
        raise RuntimeError(
            "Every and only fullRig view must carry pixel-space framing limits: "
            f"limits={sorted(FRAME_LIMITS)} views={sorted(full_rig_views)}",
        )
    if set(SEMANTIC_SURFACE_LIMITS) != set(ARTIFACT_NAMES):
        raise RuntimeError("Every Rig artifact must have semantic-local material surface intent")
    emission = AuthoredEmission(
        visible,
        cue_contract,
    )

    written: list[Path] = []
    metadata: dict[str, dict[str, Any]] = {}
    cue_regions: dict[str, dict[str, list[int]]] = {}
    try:
        for spec in VIEW_SPECS:
            name = str(spec["name"])
            group = str(spec["group"])
            group_data = groups[group]
            bounds = group_data["bounds"]
            camera_metadata, basis = fit_camera_to_bounds(
                camera,
                bounds,
                direction_values=spec["direction"],
                lens=float(spec["lens"]),
                size=spec["size"],
                margin=float(spec["margin"]),
                orthographic=bool(spec.get("orthographic")),
            )
            camera_metadata["projectedCornerMaximum"] = assert_camera_contains_bounds(
                camera_metadata,
                bounds,
            )
            lighting = configure_view_lighting(bounds, basis, str(spec["lighting"]))
            emission_state = str(spec.get("emission", "authored-on"))
            emission.set_enabled(emission_state != "off")
            output = output_dir / name
            render_frame(camera, output, camera_metadata, bounds)
            written.append(output)
            if name in {"paired_drive_mount_close.png", "emission_off.png"}:
                cue_regions[name] = padded_projected_region(
                    projected_semantic_region(camera, cue_bounds),
                )
            semantic_region = projected_semantic_region(camera, bounds)
            diagnostic_path = output_dir / f".{name}.material-id.png"
            semantic_metrics = TemporaryMaterialIdPass(visible).render_and_measure(
                camera,
                camera_metadata,
                bounds,
                output,
                diagnostic_path,
                semantic_region,
            )
            semantic_limits = SEMANTIC_SURFACE_LIMITS[name]
            assert_semantic_surface_eligible(name, semantic_metrics, semantic_limits)
            semantic_metadata = {
                "group": group,
                "boundsSource": (
                    "root-semantic-full-rig-bounds"
                    if group == "full_rig"
                    else "root-semantic-component-bounds"
                ),
                "components": group_data["components"],
                "requirements": group_data["audit"],
                "bounds": receipt_bounds(bounds),
            }
            semantic_metadata["contract"] = {
                "root": root.name,
                "schema": semantic_contract["schema"],
                "basis": semantic_contract["basis"],
                "importConversion": SEMANTIC_IMPORT_CONVERSION,
                "group": group_data["contractGroup"],
            }
            semantic_metadata["rootLocalBounds"] = local_group_receipt(
                group_data["localGroup"],
            )
            if group == "full_rig":
                authored_group = semantic_contract["groups"]["authoredRig"]
                semantic_metadata["materialFocusProvenance"] = {
                    "contractGroup": "authoredRig",
                    "components": list(authored_group["components"]),
                    "rootLocalBounds": local_group_receipt(authored_group),
                }
            metadata[name] = {
                "semantic": semantic_metadata,
                "camera": camera_metadata,
                "lighting": lighting,
                "emission": {
                    "state": emission_state,
                    "materials": emission.material_names,
                    "bindings": emission.bindings,
                    "cue": {
                        **cue_receipt,
                        **(
                            {"projectedRegion": cue_regions[name]}
                            if name in cue_regions else {}
                        ),
                    },
                },
                "surfaceResponse": {
                    "semantic": {
                        "schema": MATERIAL_ID_SCHEMA,
                        "group": group,
                        "palette": json.loads(json.dumps(MATERIAL_ID_PALETTE)),
                        "maximumRgbDistance": MATERIAL_ID_MAX_RGB_DISTANCE,
                        "maximumP50ByMaterial": dict(MATERIAL_RESPONSE_MAXIMUM_P50),
                        **semantic_metrics,
                        "regionPixelFraction": round(
                            semantic_metrics["regionPixelFraction"],
                            6,
                        ),
                        "limits": json.loads(json.dumps(semantic_limits)),
                    },
                },
            }
    finally:
        emission.set_enabled(True)

    names = tuple(path.name for path in written)
    if names != ARTIFACT_NAMES:
        raise RuntimeError(f"Rig evidence set drifted: {names}")
    paired_path = output_dir / "paired_drive_mount_close.png"
    off_path = output_dir / "emission_off.png"
    paired_cue_region = cue_regions.get("paired_drive_mount_close.png")
    off_cue_region = cue_regions.get("emission_off.png")
    if paired_cue_region is None or off_cue_region is None:
        raise RuntimeError("Matched emission frames have no projected named cue region")
    if paired_cue_region != off_cue_region:
        raise RuntimeError("Matched emission frames project named cue bounds differently")
    if sha256(paired_path) == sha256(off_path):
        raise RuntimeError(
            "Matched paired-drive emission-on/off frames are byte-identical; "
            "the authored cue was not honestly demonstrated",
        )
    emission_delta = png_emission_delta(paired_path, off_path, paired_cue_region)
    assert_emission_delta(emission_delta)
    assert_emission_delta_is_bound_to_cue(emission_delta)
    emission_delta_receipt = {
        **emission_delta,
        "changedPixelFraction": round(emission_delta["changedPixelFraction"], 9),
        "boundingBoxFraction": round(emission_delta["boundingBoxFraction"], 9),
        "limits": dict(EMISSION_DELTA_LIMITS),
        "spatialLimits": dict(EMISSION_DELTA_SPATIAL_LIMITS),
    }
    for name in ("paired_drive_mount_close.png", "emission_off.png"):
        metadata[name]["emission"]["delta"] = emission_delta_receipt
    if set(FOREGROUND_LUMA_LIMITS) != set(ARTIFACT_NAMES):
        raise RuntimeError("Every Rig artifact must have a foreground-luma eligibility intent")
    for path in written:
        frame_metrics = png_frame_metrics(path)
        foreground_metrics = frame_metrics["foregroundLuma"]
        foreground_limits = FOREGROUND_LUMA_LIMITS[path.name]
        assert_foreground_luma_eligible(
            path.name,
            foreground_metrics,
            foreground_limits,
        )
        metadata[path.name]["surfaceResponse"]["foreground"] = {
            "backgroundRgb": frame_metrics["backgroundRgb"],
            "signalRgbDistance": frame_metrics["signalRgbDistance"],
            "signalPixelFraction": round(
                frame_metrics["signalPixelFraction"],
                6,
            ),
            "p25": foreground_metrics["p25"],
            "p50": foreground_metrics["p50"],
            "limits": dict(foreground_limits),
        }
        if path.name in FRAME_LIMITS:
            frame_limits = FRAME_LIMITS[path.name]
            assert_frame_eligible(path.name, frame_metrics, frame_limits)
            metadata[path.name]["frame"] = {
                "backgroundRgb": frame_metrics["backgroundRgb"],
                "signalRgbDistance": frame_metrics["signalRgbDistance"],
                "signalPixelFraction": round(frame_metrics["signalPixelFraction"], 6),
                "signalBoundingBoxFraction": round(
                    frame_metrics["signalBoundingBoxFraction"],
                    6,
                ),
                "signalBoundingBox": frame_metrics["signalBoundingBox"],
                "edgeSignalFractions": {
                    edge: round(fraction, 6)
                    for edge, fraction in frame_metrics["edgeSignalFractions"].items()
                },
                "limits": dict(frame_limits),
            }
    LAST_RENDER_METADATA = metadata
    return written


def build_receipt(
    *,
    transaction_id: str,
    source: Path,
    source_hash: str,
    staged_paths: Sequence[Path],
    output_dir: Path,
    producer_hash: str,
    base_renderer_hash: str,
) -> dict[str, Any]:
    """Bind validated staged bytes to their eventual canonical paths."""
    names = tuple(path.name for path in staged_paths)
    if names != ARTIFACT_NAMES:
        raise RuntimeError(f"Cannot receipt incomplete Rig evidence set: {names}")
    if set(LAST_RENDER_METADATA) != set(ARTIFACT_NAMES):
        raise RuntimeError("Rig render metadata is incomplete; receipt withheld")
    if not LAST_RENDER_PROVENANCE:
        raise RuntimeError("Rig render provenance is absent; receipt withheld")

    producer = {"path": TOOL_RELATIVE, "sha256": producer_hash}
    producer_dependencies = [{
        "path": BASE_RENDERER_RELATIVE,
        "sha256": base_renderer_hash,
    }]
    provenance_hash = canonical_json_sha256(LAST_RENDER_PROVENANCE)
    artifacts = []
    for staged_path in staged_paths:
        width, height = png_dimensions(staged_path)
        canonical_path = output_dir / staged_path.name
        artifacts.append({
            "path": relative(canonical_path),
            "sha256": sha256(staged_path),
            "bytes": staged_path.stat().st_size,
            "width": width,
            "height": height,
            "dimensions": [width, height],
            "inputBindings": [{"shipKey": SHIP_KEY, "sourceSha256": source_hash}],
            "producer": producer,
            "producerDependencies": producer_dependencies,
            "renderProvenanceSha256": provenance_hash,
            **LAST_RENDER_METADATA[staged_path.name],
        })
    return {
        "schema": SCHEMA,
        "transactionId": transaction_id,
        "shipKey": SHIP_KEY,
        "source": relative(source),
        "sourceSha256": source_hash,
        "producer": producer,
        "producerDependencies": producer_dependencies,
        "renderProvenance": LAST_RENDER_PROVENANCE,
        "renderProvenanceSha256": provenance_hash,
        "artifacts": artifacts,
    }


def validate_receipt_against_staging(
    staged_paths: Sequence[Path],
    output_dir: Path,
    receipt: dict[str, Any],
    *,
    canonical_path_label: Callable[[Path], str] = relative,
) -> dict[str, str]:
    """Fail before canonical mutation unless receipt, names, paths, and staged bytes agree."""
    names = tuple(path.name for path in staged_paths)
    if names != ARTIFACT_NAMES or len(set(staged_paths)) != len(staged_paths):
        raise RuntimeError(f"Staged Rig evidence set drifted: {names}")
    if any(not path.is_file() for path in staged_paths):
        raise RuntimeError("Every staged Rig evidence artifact must be a regular file")
    stage_parents = {path.parent.resolve() for path in staged_paths}
    if len(stage_parents) != 1:
        raise RuntimeError("Rig evidence artifacts must share one staging directory")

    artifacts = receipt.get("artifacts")
    if not isinstance(artifacts, list) or len(artifacts) != len(staged_paths):
        raise RuntimeError("Rig receipt artifact set is incomplete")
    artifacts_by_name: dict[str, dict[str, Any]] = {}
    for artifact in artifacts:
        if not isinstance(artifact, dict) or not isinstance(artifact.get("path"), str):
            raise RuntimeError("Rig receipt contains an invalid artifact record")
        name = Path(artifact["path"]).name
        if name in artifacts_by_name:
            raise RuntimeError(f"Rig receipt duplicates artifact {name}")
        artifacts_by_name[name] = artifact

    staged_hashes = {path.name: sha256(path) for path in staged_paths}
    for path in staged_paths:
        artifact = artifacts_by_name.get(path.name)
        expected_path = canonical_path_label(output_dir / path.name)
        if artifact is None or artifact.get("path") != expected_path:
            raise RuntimeError(f"Rig receipt canonical path mismatch for {path.name}")
        if artifact.get("sha256") != staged_hashes[path.name]:
            raise RuntimeError(f"Rig receipt byte hash mismatch for {path.name}")
        if artifact.get("bytes") != path.stat().st_size:
            raise RuntimeError(f"Rig receipt byte count mismatch for {path.name}")
    return staged_hashes


def canonical_file_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"exists": False}
    if not path.is_file():
        return {"exists": True, "kind": "non-file"}
    return {
        "exists": True,
        "kind": "file",
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
    }


def canonical_bundle_precondition(
    output_dir: Path,
    receipt_path: Path,
) -> dict[str, Any]:
    """Snapshot only owned canonical targets so a stale renderer cannot overwrite a newer bundle."""
    return {
        "receipt": canonical_file_state(receipt_path),
        "artifacts": [
            {
                "name": name,
                **canonical_file_state(output_dir / name),
            }
            for name in ARTIFACT_NAMES
        ],
    }


def promotion_lock_record(
    receipt: dict[str, Any],
    staged_paths: Sequence[Path],
    staged_hashes: dict[str, str],
    owner_token: str,
    canonical_precondition: dict[str, Any],
) -> dict[str, Any]:
    """Describe the exact transaction an exclusive canonical-evidence owner may perform."""
    transaction_id = receipt.get("transactionId")
    if not isinstance(transaction_id, str) or not transaction_id:
        raise RuntimeError("Rig receipt has no transactionId for promotion ownership")
    source_path = receipt.get("source")
    source_hash = receipt.get("sourceSha256")
    producer = receipt.get("producer")
    if (
        not isinstance(source_path, str)
        or not isinstance(source_hash, str)
        or not isinstance(producer, dict)
        or not isinstance(producer.get("path"), str)
        or not isinstance(producer.get("sha256"), str)
    ):
        raise RuntimeError("Rig receipt cannot identify source and renderer for its owner lock")
    return {
        "schema": PROMOTION_LOCK_SCHEMA,
        "shipKey": SHIP_KEY,
        "transactionId": transaction_id,
        "ownerToken": owner_token,
        "processId": os.getpid(),
        "source": {
            "path": source_path,
            "sha256": source_hash,
        },
        "renderer": dict(producer),
        "rendererDependencies": receipt.get("producerDependencies", []),
        "canonicalPrecondition": canonical_precondition,
        "artifacts": [
            {
                "name": path.name,
                "sha256": staged_hashes[path.name],
                "bytes": path.stat().st_size,
            }
            for path in staged_paths
        ],
    }


def acquire_promotion_lock(
    lock_path: Path,
    lock_record: dict[str, Any],
) -> str:
    """Atomically create the cooperative owner lock; an existing lock always fails closed."""
    lock_text = json.dumps(lock_record, sort_keys=True, separators=(",", ":")) + "\n"
    try:
        # Python's text ``x`` mode is the atomic O_EXCL equivalent of Node's ``wx``.
        with lock_path.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(lock_text)
            handle.flush()
            os.fsync(handle.fileno())
    except FileExistsError as error:
        raise RuntimeError(
            f"Rig evidence promotion lock already exists; canonical paths untouched: {lock_path}",
        ) from error
    return lock_text


def assert_promotion_lock_owner(lock_path: Path, expected_text: str) -> None:
    try:
        actual_text = lock_path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise RuntimeError(
            f"Rig evidence promotion owner lock disappeared: {lock_path}",
        ) from error
    if actual_text != expected_text:
        raise RuntimeError(
            f"Rig evidence promotion owner lock changed; canonical mutation refused: {lock_path}",
        )


def release_promotion_lock(lock_path: Path, expected_text: str) -> None:
    """Release only the exact lock bytes this transaction atomically created."""
    assert_promotion_lock_owner(lock_path, expected_text)
    lock_path.unlink()


def promote_evidence_bundle(
    staged_paths: Sequence[Path],
    output_dir: Path,
    receipt_path: Path,
    receipt: dict[str, Any],
    *,
    canonical_precondition: dict[str, Any],
    validate_before_receipt: Callable[[], None] | None = None,
    failure_point: str | None = None,
    canonical_path_label: Callable[[Path], str] = relative,
    owner_token: str | None = None,
    promotion_hook: Callable[[str, Path, dict[str, Any]], None] | None = None,
) -> list[Path]:
    """Exclusively and recoverably promote images, then atomically replace the receipt last."""
    staged_paths = list(staged_paths)
    # Preparation may inspect only this contender's staging directory. Canonical preconditions and
    # all input revalidation are repeated after exclusive ownership is acquired.
    staged_hashes = validate_receipt_against_staging(
        staged_paths,
        output_dir,
        receipt,
        canonical_path_label=canonical_path_label,
    )
    receipt_text = json.dumps(receipt, indent=2) + "\n"
    stage_dir = staged_paths[0].parent
    staged_receipt = stage_dir / f".{receipt_path.name}.staged"
    staged_receipt.write_text(receipt_text, encoding="utf-8")
    # Reparse before any canonical mutation so serialization errors cannot strand a partial set.
    if json.loads(staged_receipt.read_text(encoding="utf-8")) != receipt:
        raise RuntimeError("Staged Rig receipt failed its serialization round trip")
    staged_receipt_hash = sha256(staged_receipt)

    if not receipt_path.parent.is_dir():
        raise RuntimeError("Rig evidence canonical parent must already exist")
    lock_path = receipt_path.parent / f".{SHIP_KEY}-material-truth.owner.lock"
    owner_token = owner_token or secrets.token_hex(32)
    lock_record = promotion_lock_record(
        receipt,
        staged_paths,
        staged_hashes,
        owner_token,
        canonical_precondition,
    )
    lock_text = acquire_promotion_lock(lock_path, lock_record)

    backup_dir: Path | None = None
    output_dir_created = False
    artifact_backups: list[tuple[Path, Path, str]] = []
    promoted: list[tuple[Path, Path]] = []
    receipt_backup: tuple[Path, str] | None = None
    receipt_promoted = False

    def checkpoint(point: str) -> None:
        assert_promotion_lock_owner(lock_path, lock_text)
        if promotion_hook is not None:
            promotion_hook(point, lock_path, lock_record)
        assert_promotion_lock_owner(lock_path, lock_text)
        if failure_point == point:
            raise RuntimeError(f"Injected Rig evidence transaction failure at {point}")

    try:
        checkpoint("after-lock-acquired")
        # Repeat every staged and canonical precondition while holding the owner lock.
        locked_hashes = validate_receipt_against_staging(
            staged_paths,
            output_dir,
            receipt,
            canonical_path_label=canonical_path_label,
        )
        if locked_hashes != staged_hashes:
            raise RuntimeError("Rig staged bytes changed while acquiring promotion ownership")
        if canonical_bundle_precondition(output_dir, receipt_path) != canonical_precondition:
            raise RuntimeError(
                "Rig canonical evidence changed since rendering began; promotion refused",
            )
        if not output_dir.parent.is_dir() or receipt_path.parent != output_dir.parent:
            raise RuntimeError("Rig evidence targets must share one existing canonical parent")
        if output_dir.exists() and not output_dir.is_dir():
            raise RuntimeError(f"Rig evidence target is not a directory: {output_dir}")
        if receipt_path.exists() and not receipt_path.is_file():
            raise RuntimeError(f"Rig evidence receipt target is not a file: {receipt_path}")
        if any((output_dir / path.name).is_dir() for path in staged_paths):
            raise RuntimeError("Rig evidence target collides with a directory")
        if validate_before_receipt is not None:
            validate_before_receipt()
        checkpoint("after-locked-preconditions")

        backup_dir = Path(tempfile.mkdtemp(
            prefix=f".{SHIP_KEY}-material-truth-backup-",
            dir=output_dir.parent,
        ))
        output_dir_created = not output_dir.exists()
        if output_dir_created:
            checkpoint("before-output-directory")
            output_dir.mkdir()
        for index, staged_path in enumerate(staged_paths, start=1):
            checkpoint(f"before-artifact:{index}")
            target = output_dir / staged_path.name
            if target.exists():
                backup = backup_dir / staged_path.name
                old_hash = sha256(target)
                target.replace(backup)
                artifact_backups.append((backup, target, old_hash))
                if sha256(backup) != old_hash:
                    raise RuntimeError(f"Rig backup hash drifted for {target.name}")
            checkpoint(f"before-artifact-install:{index}")
            if target.exists():
                raise RuntimeError(f"Rig evidence target unexpectedly reappeared: {target}")
            staged_path.replace(target)
            promoted.append((target, staged_path))
            if sha256(target) != staged_hashes[target.name]:
                raise RuntimeError(f"Promoted Rig evidence hash drifted for {target.name}")
            checkpoint(f"after-artifact:{index}")

        # Moving a file does not change its bytes, but verify the complete promoted image set before
        # allowing the receipt to point at it.
        for target, _staged_path in promoted:
            if sha256(target) != staged_hashes[target.name]:
                raise RuntimeError(f"Promoted Rig evidence hash drifted for {target.name}")
        checkpoint("after-artifact-validation")
        if validate_before_receipt is not None:
            validate_before_receipt()
        checkpoint("before-receipt-backup")

        if receipt_path.exists():
            backup_path = backup_dir / receipt_path.name
            old_receipt_hash = sha256(receipt_path)
            receipt_path.replace(backup_path)
            receipt_backup = (backup_path, old_receipt_hash)
            if sha256(backup_path) != old_receipt_hash:
                raise RuntimeError("Rig receipt backup hash drifted")
        checkpoint("after-receipt-backup")
        if receipt_path.exists():
            raise RuntimeError("Rig receipt target unexpectedly reappeared")
        staged_receipt.replace(receipt_path)
        receipt_promoted = True
        if sha256(receipt_path) != staged_receipt_hash:
            raise RuntimeError("Promoted Rig receipt hash drifted")
        checkpoint("after-receipt-replace")
    except Exception as promotion_error:
        rollback_errors: list[str] = []

        def rollback(label: str, operation: Callable[[], Any]) -> None:
            try:
                assert_promotion_lock_owner(lock_path, lock_text)
                operation()
            except Exception as error:  # pragma: no cover - retained backup is the recovery path.
                rollback_errors.append(f"{label}: {error}")

        if receipt_promoted and receipt_path.exists():
            def return_new_receipt() -> None:
                if sha256(receipt_path) != staged_receipt_hash:
                    raise RuntimeError("new receipt no longer belongs to this transaction")
                if staged_receipt.exists():
                    raise RuntimeError("staged receipt destination is occupied")
                receipt_path.replace(staged_receipt)

            rollback("return new receipt to staging", return_new_receipt)
        if receipt_backup is not None and receipt_backup[0].exists():
            def restore_prior_receipt() -> None:
                backup_path, expected_hash = receipt_backup
                if receipt_path.exists():
                    raise RuntimeError("receipt target is occupied by another output")
                if sha256(backup_path) != expected_hash:
                    raise RuntimeError("prior receipt backup hash changed")
                backup_path.replace(receipt_path)

            rollback("restore prior receipt", restore_prior_receipt)
        for target, staged_path in reversed(promoted):
            if target.exists():
                def return_promoted_artifact(
                    target: Path = target,
                    staged_path: Path = staged_path,
                ) -> None:
                    if sha256(target) != staged_hashes[target.name]:
                        raise RuntimeError("promoted target no longer belongs to this transaction")
                    if staged_path.exists():
                        raise RuntimeError("staged artifact destination is occupied")
                    target.replace(staged_path)

                rollback(f"return {target.name} to staging", return_promoted_artifact)
        for backup, target, expected_hash in reversed(artifact_backups):
            if backup.exists():
                def restore_prior_artifact(
                    backup: Path = backup,
                    target: Path = target,
                    expected_hash: str = expected_hash,
                ) -> None:
                    if target.exists():
                        raise RuntimeError("artifact target is occupied by another output")
                    if sha256(backup) != expected_hash:
                        raise RuntimeError("prior artifact backup hash changed")
                    backup.replace(target)

                rollback(f"restore prior {target.name}", restore_prior_artifact)
        if output_dir_created and output_dir.exists():
            rollback("remove empty output directory", output_dir.rmdir)

        if rollback_errors:
            raise RuntimeError(
                "Rig evidence promotion failed and rollback was incomplete; "
                f"owner lock and recovery backup retained at {backup_dir}: {rollback_errors}",
            ) from promotion_error
        if backup_dir is not None:
            assert_promotion_lock_owner(lock_path, lock_text)
            shutil.rmtree(backup_dir)
        release_promotion_lock(lock_path, lock_text)
        raise

    # A successful receipt-last promotion is complete, but ownership remains held until every
    # recoverable backup has been cleaned.
    checkpoint("before-backup-cleanup")
    if backup_dir is not None:
        shutil.rmtree(backup_dir)
    checkpoint("before-lock-release")
    release_promotion_lock(lock_path, lock_text)
    return [output_dir / path.name for path in staged_paths]


def transaction_fixture_self_test() -> dict[str, Any]:
    """Exercise ownership, contention, safe rollback, and receipt-last success in temp fixtures."""
    fixture_root = Path(tempfile.mkdtemp(prefix="spaceface-rig-transaction-fixture-"))
    try:
        evidence_root = fixture_root / "material_truth_v2"
        evidence_root.mkdir()
        output_dir = evidence_root / SHIP_KEY
        output_dir.mkdir()
        receipt_path = evidence_root / "eligible_artifacts_rig.json"
        old_receipt = b'{"fixture":"old"}\n'
        receipt_path.write_bytes(old_receipt)
        old_bytes = {}
        for name in ARTIFACT_NAMES:
            value = f"old:{name}".encode("utf-8")
            old_bytes[name] = value
            (output_dir / name).write_bytes(value)

        stage_dir = Path(tempfile.mkdtemp(prefix=".fixture-stage-", dir=evidence_root))
        staged_paths = []
        new_bytes = {}
        for name in ARTIFACT_NAMES:
            value = f"new:{name}".encode("utf-8")
            new_bytes[name] = value
            path = stage_dir / name
            path.write_bytes(value)
            staged_paths.append(path)

        def fixture_relative(path: Path) -> str:
            return str(path).replace("\\", "/")

        def fixture_receipt(paths: Sequence[Path], transaction_id: str) -> dict[str, Any]:
            return {
                "transactionId": transaction_id,
                "source": "fixture/source.glb",
                "sourceSha256": "A" * 64,
                "producer": {"path": "fixture/renderer.py", "sha256": "B" * 64},
                "producerDependencies": [],
                "artifacts": [
                    {
                        "path": fixture_relative(output_dir / path.name),
                        "sha256": sha256(path),
                        "bytes": path.stat().st_size,
                    }
                    for path in paths
                ],
            }

        receipt = fixture_receipt(staged_paths, "fixture-primary")
        lock_path = evidence_root / f".{SHIP_KEY}-material-truth.owner.lock"
        old_precondition = canonical_bundle_precondition(output_dir, receipt_path)

        def assert_old_state(point: str) -> None:
            if receipt_path.read_bytes() != old_receipt:
                raise AssertionError(f"Receipt rollback failed at {point}")
            for path in staged_paths:
                if path.read_bytes() != new_bytes[path.name]:
                    raise AssertionError(f"Staging rollback failed for {path.name} at {point}")
                if (output_dir / path.name).read_bytes() != old_bytes[path.name]:
                    raise AssertionError(f"Canonical rollback failed for {path.name} at {point}")
            if lock_path.exists():
                raise AssertionError(f"Owner lock leaked after clean rollback at {point}")

        invalid_receipt = json.loads(json.dumps(receipt))
        invalid_receipt["artifacts"][0]["sha256"] = "0" * 64
        try:
            promote_evidence_bundle(
                staged_paths,
                output_dir,
                receipt_path,
                invalid_receipt,
                canonical_precondition=old_precondition,
                canonical_path_label=fixture_relative,
            )
        except RuntimeError as error:
            if "receipt byte hash mismatch" not in str(error):
                raise
        else:
            raise AssertionError("Pre-promotion receipt mismatch did not fail")
        assert_old_state("prepromotion-receipt-hash")

        def reject_changed_inputs() -> None:
            raise RuntimeError("Injected fixture input-hash drift")

        try:
            promote_evidence_bundle(
                staged_paths,
                output_dir,
                receipt_path,
                receipt,
                canonical_precondition=old_precondition,
                validate_before_receipt=reject_changed_inputs,
                canonical_path_label=fixture_relative,
                owner_token="fixture-input-validator-owner",
            )
        except RuntimeError as error:
            if "Injected fixture input-hash drift" not in str(error):
                raise
        else:
            raise AssertionError("Input-hash drift inside promotion did not fail")
        assert_old_state("input-validator")

        contender_stage = Path(tempfile.mkdtemp(
            prefix=".fixture-contender-stage-",
            dir=evidence_root,
        ))
        contender_paths = []
        for name in ARTIFACT_NAMES:
            path = contender_stage / name
            path.write_bytes(f"contender:{name}".encode("utf-8"))
            contender_paths.append(path)
        contender_receipt = fixture_receipt(contender_paths, "fixture-contender")
        contender_rejections = 0

        def canonical_snapshot() -> dict[str, str]:
            return {
                "receipt": sha256(receipt_path),
                **{
                    name: sha256(output_dir / name)
                    for name in ARTIFACT_NAMES
                },
            }

        def reject_second_contender(
            point: str,
            _lock_path: Path,
            _lock_record: dict[str, Any],
        ) -> None:
            nonlocal contender_rejections
            if point != "after-lock-acquired":
                return
            if (
                _lock_record.get("schema") != PROMOTION_LOCK_SCHEMA
                or _lock_record.get("source") != {
                    "path": receipt["source"],
                    "sha256": receipt["sourceSha256"],
                }
                or _lock_record.get("renderer") != receipt["producer"]
                or [item.get("name") for item in _lock_record.get("artifacts", [])]
                != list(ARTIFACT_NAMES)
                or _lock_record.get("canonicalPrecondition") != old_precondition
            ):
                raise AssertionError("Owner lock does not identify the exact primary transaction")
            before = canonical_snapshot()
            try:
                promote_evidence_bundle(
                    contender_paths,
                    output_dir,
                    receipt_path,
                    contender_receipt,
                    canonical_precondition=old_precondition,
                    canonical_path_label=fixture_relative,
                    owner_token=f"fixture-contender-owner-{contender_rejections + 1}",
                )
            except RuntimeError as error:
                if "promotion lock already exists" not in str(error):
                    raise
            else:
                raise AssertionError("Second contender acquired occupied canonical evidence")
            if canonical_snapshot() != before:
                raise AssertionError("Rejected second contender touched canonical paths")
            contender_rejections += 1

        for point in ("after-artifact:3", "after-receipt-replace"):
            try:
                promote_evidence_bundle(
                    staged_paths,
                    output_dir,
                    receipt_path,
                    receipt,
                    canonical_precondition=old_precondition,
                    failure_point=point,
                    canonical_path_label=fixture_relative,
                    owner_token=f"fixture-rollback-owner-{point}",
                    promotion_hook=(
                        reject_second_contender
                        if point == "after-artifact:3"
                        else None
                    ),
                )
            except RuntimeError as error:
                if "Injected Rig evidence transaction failure" not in str(error):
                    raise
            else:
                raise AssertionError(f"Fixture failure point did not fail: {point}")
            assert_old_state(point)

        def change_owner_lock(
            point: str,
            fixture_lock_path: Path,
            lock_record: dict[str, Any],
        ) -> None:
            if point != "after-lock-acquired":
                return
            changed = {**lock_record, "ownerToken": "changed-by-another-owner"}
            fixture_lock_path.write_text(
                json.dumps(changed, sort_keys=True, separators=(",", ":")) + "\n",
                encoding="utf-8",
            )

        try:
            promote_evidence_bundle(
                staged_paths,
                output_dir,
                receipt_path,
                receipt,
                canonical_precondition=old_precondition,
                canonical_path_label=fixture_relative,
                owner_token="fixture-lock-change-owner",
                promotion_hook=change_owner_lock,
            )
        except RuntimeError as error:
            if "owner lock changed" not in str(error):
                raise
        else:
            raise AssertionError("Changed owner token did not fail closed")
        # No canonical mutation occurred; this temp-only fixture removes the intentionally poisoned
        # stale lock after proving production code refused to release or mutate through it.
        if canonical_snapshot() != {
            "receipt": hashlib.sha256(old_receipt).hexdigest().upper(),
            **{
                name: hashlib.sha256(old_bytes[name]).hexdigest().upper()
                for name in ARTIFACT_NAMES
            },
        }:
            raise AssertionError("Changed lock allowed a canonical mutation")
        lock_path.unlink()
        assert_old_state("changed-owner-lock")

        def replace_promoted_with_other_output(
            point: str,
            _lock_path: Path,
            _lock_record: dict[str, Any],
        ) -> None:
            if point == "after-artifact:1":
                (output_dir / ARTIFACT_NAMES[0]).write_bytes(b"other-owner-output")

        try:
            promote_evidence_bundle(
                staged_paths,
                output_dir,
                receipt_path,
                receipt,
                canonical_precondition=old_precondition,
                failure_point="after-artifact:1",
                canonical_path_label=fixture_relative,
                owner_token="fixture-foreign-output-owner",
                promotion_hook=replace_promoted_with_other_output,
            )
        except RuntimeError as error:
            if (
                "rollback was incomplete" not in str(error)
                or "no longer belongs to this transaction" not in str(error)
            ):
                raise
        else:
            raise AssertionError("Rollback touched a foreign replacement output")
        foreign_target = output_dir / ARTIFACT_NAMES[0]
        if foreign_target.read_bytes() != b"other-owner-output":
            raise AssertionError("Rollback moved or overwrote another owner's output")
        if not lock_path.exists():
            raise AssertionError("Incomplete rollback released its fail-closed owner lock")
        retained_backups = list(evidence_root.glob(
            f".{SHIP_KEY}-material-truth-backup-*",
        ))
        if len(retained_backups) != 1:
            raise AssertionError("Incomplete rollback did not retain exactly one recovery backup")
        # Temp-fixture recovery only: restore the old baseline so subsequent clean success can run.
        foreign_target.unlink()
        retained_old = retained_backups[0] / ARTIFACT_NAMES[0]
        retained_old.replace(foreign_target)
        staged_paths[0].write_bytes(new_bytes[ARTIFACT_NAMES[0]])
        shutil.rmtree(retained_backups[0])
        lock_path.unlink()
        assert_old_state("foreign-output-protection")

        promoted = promote_evidence_bundle(
            staged_paths,
            output_dir,
            receipt_path,
            receipt,
            canonical_precondition=old_precondition,
            canonical_path_label=fixture_relative,
            owner_token="fixture-success-owner",
            promotion_hook=reject_second_contender,
        )
        if [path.name for path in promoted] != list(ARTIFACT_NAMES):
            raise AssertionError("Fixture successful promotion set drifted")
        if json.loads(receipt_path.read_text(encoding="utf-8")) != receipt:
            raise AssertionError("Fixture receipt was not replaced last with the new payload")
        for path in promoted:
            if path.read_bytes() != new_bytes[path.name]:
                raise AssertionError(f"Fixture success bytes drifted for {path.name}")
        if lock_path.exists():
            raise AssertionError("Successful promotion leaked its owner lock")
        if contender_rejections != 2:
            raise AssertionError(
                f"Expected two deterministic contender rejections, got {contender_rejections}",
            )
        completed_snapshot = canonical_snapshot()
        try:
            promote_evidence_bundle(
                contender_paths,
                output_dir,
                receipt_path,
                contender_receipt,
                canonical_precondition=old_precondition,
                canonical_path_label=fixture_relative,
                owner_token="fixture-stale-contender-owner",
            )
        except RuntimeError as error:
            if "changed since rendering began" not in str(error):
                raise
        else:
            raise AssertionError("Stale contender overwrote a newer completed bundle")
        if canonical_snapshot() != completed_snapshot or lock_path.exists():
            raise AssertionError("Stale contender changed canonical state or leaked its lock")
        return {
            "status": "complete",
            "failurePoints": [
                "prepromotion-receipt-hash",
                "input-validator",
                "after-artifact:3",
                "after-receipt-replace",
                "changed-owner-lock",
                "foreign-output-protection",
            ],
            "contenderRejections": contender_rejections,
            "staleContenderRejections": 1,
            "artifactCount": len(promoted),
        }
    finally:
        shutil.rmtree(fixture_root)


def png_decoder_fixture_self_test() -> dict[str, Any]:
    """Prove CRC and terminal-IEND rejection against isolated synthetic PNG fixtures."""
    fixture_root = Path(tempfile.mkdtemp(prefix="spaceface-rig-png-fixture-"))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        checksum = zlib.crc32(payload, zlib.crc32(kind)) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)

    def encode_rgb(width: int, height: int, pixels: Sequence[tuple[int, int, int]]) -> bytes:
        if len(pixels) != width * height:
            raise AssertionError("Synthetic PNG pixel count drifted")
        scanlines = bytearray()
        for row in range(height):
            scanlines.append(0)
            for pixel in pixels[row * width:(row + 1) * width]:
                scanlines.extend(pixel)
        ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
        return (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(scanlines)))
            + chunk(b"IEND", b"")
        )

    try:
        valid_bytes = encode_rgb(1, 1, [(1, 2, 3)])
        valid = fixture_root / "valid.png"
        valid.write_bytes(valid_bytes)
        if decode_png_rgb(valid) != (1, 1, b"\x01\x02\x03"):
            raise AssertionError("Synthetic valid PNG did not decode exactly")

        corrupt_bytes = bytearray(valid_bytes)
        corrupt_bytes[29] ^= 0x01
        fixtures = {
            "crc": bytes(corrupt_bytes),
            "trailing": valid_bytes + b"trailing",
            "missingIend": valid_bytes[:-12],
        }
        rejected = []
        for name, payload in fixtures.items():
            path = fixture_root / f"{name}.png"
            path.write_bytes(payload)
            try:
                decode_png_rgb(path)
            except ValueError:
                rejected.append(name)
            else:
                raise AssertionError(f"Malformed PNG fixture was accepted: {name}")

        width = height = 16
        rich_pixels = [
            (
                (20, 20, 20)
                if x < 2
                else (180, 180, 180)
                if x >= 12
                else (90, 90, 90)
            )
            for _y in range(height)
            for x in range(width)
        ]
        content_fixtures = {
            "contentRich": rich_pixels,
            "flatWhite": [(255, 255, 255)] * (width * height),
            "flatGray": [(96, 96, 96)] * (width * height),
        }
        content_metrics = {}
        for name, pixels in content_fixtures.items():
            path = fixture_root / f"{name}.png"
            path.write_bytes(encode_rgb(width, height, pixels))
            content_metrics[name] = png_luma_metrics(path)
        fixture_limits = {
            "minimumMean": 16.0,
            "maximumBelowEight": 0.78,
            "maximumAbove247Fraction": 0.06,
            "minimumP5P95Spread": 24.0,
        }
        assert_luma_eligible("contentRich", content_metrics["contentRich"], fixture_limits)
        content_rejected = []
        for name in ("flatWhite", "flatGray"):
            try:
                assert_luma_eligible(name, content_metrics[name], fixture_limits)
            except RuntimeError:
                content_rejected.append(name)
            else:
                raise AssertionError(f"Content-free luma fixture was accepted: {name}")
        return {
            "status": "complete",
            "pngStructureRejected": rejected,
            "contentRejected": content_rejected,
            "contentAccepted": ["valid", "contentRich"],
            "contentMetrics": content_metrics,
        }
    finally:
        shutil.rmtree(fixture_root)


def nonrender_acceptance_self_test(source: Path | None = None) -> dict[str, Any]:
    """Exercise exact import, pinned settings, camera containment, and emission restoration."""
    source = source or (
        FAMILY / "source" / "wholeships" / f"{SHIP_ID}.glb"
    )
    base.clear_scene()
    visible = import_visible_lod0(source)
    camera = configure_scene()
    provenance = render_provenance()
    expected_provenance = {
        "blender": {
            "version": "5.1.2",
            "versionTuple": [5, 1, 2],
        },
        "settings": {
            "engine": "BLENDER_EEVEE",
            "device": {"class": "GPU_RASTER", "backend": "OPENGL"},
            "samples": {
                "viewportTaa": 64,
                "renderTaa": 64,
                "taaReprojection": False,
            },
            "png": {
                "format": "PNG",
                "colorMode": "RGBA",
                "colorDepth": "8",
                "compression": 15,
                "useFileExtension": True,
            },
            "colorManagement": {
                "viewTransform": "AgX",
                "look": "AgX - Medium High Contrast",
                "exposure": 0.20,
                "gamma": 1.0,
                "curveMapping": False,
                "ditherIntensity": 0.0,
            },
            "filmTransparent": True,
            "resolutionPercentage": 100,
            "pixelAspect": {"x": 1.0, "y": 1.0},
            "lightingContract": lighting_contract_receipt(),
            "lightingContractSha256": canonical_json_sha256(
                LIGHTING_PROFILE_CONTRACT,
            ),
        },
    }
    if provenance != expected_provenance:
        raise AssertionError(
            f"Pinned Rig render provenance drifted: {provenance} != {expected_provenance}",
        )

    root, semantic_contract = imported_semantic_contract(source)
    groups = {}
    for group, contract_group in SEMANTIC_CONTRACT_GROUPS.items():
        local_group = semantic_contract["groups"][contract_group]
        audit_component_names(group, local_group["components"])
        groups[group] = semantic_world_bounds(root, local_group)
    camera_audits = {}
    lighting_audits = {}
    for spec in VIEW_SPECS:
        metadata, basis = fit_camera_to_bounds(
            camera,
            groups[str(spec["group"])],
            direction_values=spec["direction"],
            lens=float(spec["lens"]),
            size=spec["size"],
            margin=float(spec["margin"]),
            orthographic=bool(spec.get("orthographic")),
        )
        analytic_audit = assert_camera_contains_bounds(
            metadata,
            groups[str(spec["group"])],
        )
        configure_camera_for_metadata(camera, metadata)
        blender_audit = assert_blender_camera_contains_bounds(
            camera,
            metadata,
            groups[str(spec["group"])],
        )
        if any(
            abs(float(expected) - float(actual)) > 1e-5
            for expected, actual in zip(analytic_audit, blender_audit)
        ):
            raise AssertionError(
                "Rig nonrender camera projection drifted from Blender: "
                f"analytic={analytic_audit} blender={blender_audit}",
            )
        camera_audits[str(spec["name"])] = blender_audit
        lighting_audits[str(spec["name"])] = configure_view_lighting(
            groups[str(spec["group"])],
            basis,
            str(spec["lighting"]),
        )

    material_snapshot = [
        (obj.name, index, slot.material.name if slot.material else None)
        for obj in visible
        for index, slot in enumerate(obj.material_slots)
    ]
    diagnostic_root = Path(tempfile.mkdtemp(prefix="ashline-rig-material-id-self-test-"))
    diagnostic_path = diagnostic_root / "transaction-only.material-id.png"
    diagnostic_path.write_bytes(b"cleanup-proof")
    diagnostic = TemporaryMaterialIdPass(visible)
    try:
        diagnostic.apply()
        if not diagnostic.active:
            raise AssertionError("Material-ID self-test did not become active")
    finally:
        diagnostic.restore(diagnostic_path)
        shutil.rmtree(diagnostic_root, ignore_errors=True)
    restored_snapshot = [
        (obj.name, index, slot.material.name if slot.material else None)
        for obj in visible
        for index, slot in enumerate(obj.material_slots)
    ]
    if restored_snapshot != material_snapshot:
        raise AssertionError("Material-ID self-test did not restore exact material slots")
    if diagnostic_path.exists():
        raise AssertionError("Material-ID self-test left a transaction-local diagnostic")

    emission = AuthoredEmission(
        visible,
        semantic_contract["emissionCue"],
    )

    def emission_snapshot() -> list[dict[str, Any]]:
        snapshot = []
        for state in emission.states:
            links = sorted(
                (
                    link.from_node.name,
                    link.from_socket.name,
                )
                for link in state["tree"].links
                if link.to_socket == state["socket"]
            )
            snapshot.append({
                "material": state["material"].name,
                "node": state["node"].name,
                "socket": state["socket"].name,
                "default": float(state["socket"].default_value),
                "links": links,
            })
        return snapshot

    authored_snapshot = emission_snapshot()
    emission.set_enabled(False)
    disabled_snapshot = emission_snapshot()
    if any(state["default"] != 0.0 or state["links"] for state in disabled_snapshot):
        raise AssertionError("Rig emission-off state retained an authored signal")
    emission.set_enabled(True)
    if emission_snapshot() != authored_snapshot:
        raise AssertionError("Rig authored emission state was not restored exactly")
    return {
        "status": "complete",
        "sourceSha256": sha256(source),
        "semanticGroups": sorted(semantic_contract["groups"]),
        "fullRigRootLocalBounds": local_group_receipt(
            semantic_contract["groups"]["fullRig"],
        ),
        "cameraAudits": camera_audits,
        "lightingAudits": lighting_audits,
        "materialIdDiagnostic": {
            "schema": MATERIAL_ID_SCHEMA,
            "palette": json.loads(json.dumps(MATERIAL_ID_PALETTE)),
            "maximumRgbDistance": MATERIAL_ID_MAX_RGB_DISTANCE,
            "maximumP50ByMaterial": dict(MATERIAL_RESPONSE_MAXIMUM_P50),
            "restored": True,
            "transactionLocalRemoved": True,
        },
        "emissionBindings": emission.bindings,
        "renderProvenance": provenance,
        "renderProvenanceSha256": canonical_json_sha256(provenance),
    }


def main() -> int:
    global LAST_RESULT
    source = FAMILY / "source" / "wholeships" / f"{SHIP_ID}.glb"
    output_dir = FAMILY / "evidence" / "material_truth_v2" / SHIP_KEY
    receipt_path = (
        FAMILY / "evidence" / "material_truth_v2" / "eligible_artifacts_rig.json"
    )
    if not source.exists():
        raise FileNotFoundError(source)
    source_hash = sha256(source)
    producer_hash = sha256(ROOT / TOOL_RELATIVE)
    base_renderer_hash = sha256(BASE_RENDERER)
    transaction_id = uuid.uuid4().hex
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    canonical_precondition = canonical_bundle_precondition(output_dir, receipt_path)
    stage_dir = Path(tempfile.mkdtemp(
        prefix=f".{SHIP_KEY}-material-truth-stage-",
        dir=output_dir.parent,
    ))

    def validate_inputs_unchanged() -> None:
        if sha256(source) != source_hash:
            raise RuntimeError("Rig source changed during evidence rendering; receipt withheld")
        if sha256(ROOT / TOOL_RELATIVE) != producer_hash:
            raise RuntimeError("Rig evidence producer changed during rendering; receipt withheld")
        if sha256(BASE_RENDERER) != base_renderer_hash:
            raise RuntimeError(
                "Rig base-renderer dependency changed during rendering; receipt withheld",
            )

    try:
        staged = render_rig(source, stage_dir)
        validate_inputs_unchanged()
        receipt = build_receipt(
            transaction_id=transaction_id,
            source=source,
            source_hash=source_hash,
            staged_paths=staged,
            output_dir=output_dir,
            producer_hash=producer_hash,
            base_renderer_hash=base_renderer_hash,
        )
        written = promote_evidence_bundle(
            staged,
            output_dir,
            receipt_path,
            receipt,
            canonical_precondition=canonical_precondition,
            validate_before_receipt=validate_inputs_unchanged,
        )
    finally:
        shutil.rmtree(stage_dir, ignore_errors=True)

    LAST_RESULT = {
        "status": "complete",
        "shipKey": SHIP_KEY,
        "sourceSha256": source_hash,
        "producerSha256": producer_hash,
        "artifacts": [relative(path) for path in written],
        "receipt": relative(receipt_path),
    }
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
