// Runtime recipes accepted from GFX-GROK-01 and bound to the live Kestrel/Hitch seam.
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const KESTREL_MAIN_PLUME_RECIPE = deepFreeze({
  "schemaVersion": 1,
  "id": "hitch_kestrel_main_plume",
  "kind": "continuous_plume",
  "engineFamily": "hitch_ion_kestrel",
  "displayName": "Hitch/Kestrel main thruster plume",
  "notes": "Continuous throttle-responsive ion stream. Identity from flow/geometry/layering, not tint alone. Live seam: engine_ion_small profile fields.",
  "geometry": {
    "axis": "socketForward",
    "baseLength": 11.5,
    "baseWidth": 3.1,
    "segmentCount": 8,
    "aspect": "stream",
    "taper": 0.72,
    "billboard": "axial"
  },
  "layers": [
    {
      "role": "core",
      "enabled": true,
      "texture": {
        "id": "plume_core_flow_v1",
        "mode": "flow",
        "path": "textures/plume_core_flow_v1.png"
      },
      "blend": "additive",
      "softEdge": 0.14,
      "intensity": 6.35,
      "opacity": 0.72,
      "colorHex": "#f5fbff",
      "widthScale": 0.46,
      "lengthScale": 0.32,
      "scrollSpeed": 2.8
    },
    {
      "role": "inner",
      "enabled": true,
      "texture": {
        "id": "plume_inner_flipbook_v1",
        "mode": "flipbook",
        "path": "textures/plume_inner_flipbook_v1.png",
        "cols": 4,
        "rows": 4,
        "fps": 18
      },
      "blend": "additive",
      "softEdge": 0.26,
      "intensity": 4.15,
      "opacity": 0.52,
      "colorHex": "#3eb8ee",
      "widthScale": 0.9,
      "lengthScale": 0.82,
      "scrollSpeed": 2.2
    },
    {
      "role": "sheath",
      "enabled": true,
      "texture": {
        "id": "plume_sheath_noise_v1",
        "mode": "noise",
        "path": "textures/plume_sheath_noise_v1.png"
      },
      "blend": "additive",
      "softEdge": 0.32,
      "intensity": 2.15,
      "opacity": 0.31,
      "colorHex": "#3d51c4",
      "widthScale": 1.76,
      "lengthScale": 1.14,
      "scrollSpeed": 1.4
    },
    {
      "role": "vapor",
      "enabled": true,
      "texture": {
        "id": "plume_vapor_soft_v1",
        "mode": "soft_radial",
        "path": "textures/plume_vapor_soft_v1.png"
      },
      "blend": "alpha",
      "softEdge": 0.44,
      "intensity": 0.88,
      "opacity": 0.32,
      "colorHex": "#29486f",
      "widthScale": 2.18,
      "lengthScale": 1.52,
      "scrollSpeed": 0.85
    },
    {
      "role": "distortion",
      "enabled": true,
      "texture": {
        "id": "plume_distortion_interface_v1",
        "mode": "noise",
        "path": "textures/plume_distortion_interface_v1.png"
      },
      "blend": "alpha",
      "softEdge": 0.48,
      "intensity": 0.35,
      "opacity": 0.12,
      "colorHex": "#a8d0ff",
      "widthScale": 1.1,
      "lengthScale": 0.95,
      "scrollSpeed": 1.1
    }
  ],
  "throttle": {
    "idle": 0.06,
    "length": { "at0": 0.28, "at1": 1.0, "exp": 0.85 },
    "width": { "at0": 0.42, "at1": 1.15, "exp": 0.9 },
    "turbulence": { "at0": 0.25, "at1": 1.15, "exp": 1.1 },
    "coreSheathBalance": { "at0": 0.55, "at1": 1.25, "exp": 0.75 },
    "dissipation": { "at0": 0.4, "at1": 1.2, "exp": 1.0 },
    "flowSpeed": { "at0": 0.45, "at1": 1.35, "exp": 0.8 }
  },
  "timing": {
    "attack": 0.08,
    "sustain": 8.0,
    "release": 0.35
  },
  "eventLight": {
    "enabled": true,
    "maxIntensity": 2.8,
    "maxRange": 12,
    "color": "#9ad8ff",
    "throttleScale": { "at0": 0.15, "at1": 1.0, "exp": 1.0 }
  },
  "accessibility": {
    "reducedMotion": {
      "preserveSilhouette": true,
      "preserveFeedback": true,
      "flowSpeedScale": 0.12,
      "disableLayers": ["distortion"],
      "staticCoreBoost": 0.24,
      "roleLengthScale": { "core": 0.96, "inner": 0.86, "sheath": 0.8, "vapor": 0.72 },
      "roleWidthScale": { "core": 1.18, "inner": 1.06, "sheath": 0.9, "vapor": 0.82 },
      "roleIntensityGain": { "core": 1.08, "inner": 1.04 },
      "roleOpacityGain": { "core": 1.1, "inner": 1.1 }
    },
    "reducedFlash": {
      "preserveSilhouette": true,
      "preserveFeedback": true,
      "intensityScale": 0.72,
      "eventLightScale": 0.25,
      "coreWhitenessCap": 0.35,
      "roleIntensityGain": { "core": 1.24, "inner": 1.16 }
    },
    "lowQuality": {
      "preserveSilhouette": true,
      "preserveFeedback": true,
      "maxLayers": 2,
      "preferRoles": ["core", "inner"]
    }
  },
  "quality": {
    "high": {
      "segments": 8,
      "layers": ["core", "inner", "sheath", "vapor", "distortion"]
    },
    "medium": {
      "segments": 5,
      "layers": ["core", "inner", "sheath", "vapor"]
    },
    "low": {
      "segments": 3,
      "layers": ["core", "inner"]
    }
  },
  "identity": {
    "flowCharacter": {
      "swirl": 0.45,
      "fork": 0.40,
      "noiseScale": 1.5,
      "baseFlow": 2.6,
      "anisotropy": 1.8
    },
    "geometryCharacter": {
      "taper": 0.72,
      "mouthBreak": 0.35,
      "axialFill": 0.82
    },
    "timingCharacter": {
      "driveRise": 9.5,
      "driveFall": 4.2,
      "boostRise": 8.5,
      "boostFall": 3.6
    },
    "layeringCharacter": {
      "coreDominance": 0.78,
      "sheathBloomIndependence": true,
      "vaporOnlyAtTail": true,
      "boostLengthGain": { "core": 0.34, "inner": 0.62, "sheath": 0.88, "vapor": 1.08 },
      "boostWidthGain": { "core": 0.14, "inner": 0.3, "sheath": 0.52, "vapor": 0.64 },
      "boostStructuralDrive": 0.18
    }
  },
  "liveSeams": {
    "engineProfileId": "engine_ion_small",
    "shipIds": ["ship_kestrel"],
    "vfxHooks": [
      "_ensureEnergyPlume",
      "_placeEnergyPlumeAtSocket",
      "_updateEnergyPlume",
      "_hideEnergyPlumes"
    ],
    "profileFields": [
      "plumeCore",
      "plumeHalo",
      "flowSpeed",
      "noiseScale",
      "coreIntensity",
      "haloIntensity",
      "plumeWidthMul",
      "plumeLengthMul",
      "plumeSwirl",
      "plumeFork"
    ]
  }
});

export const KESTREL_RCS_RECIPE = deepFreeze({
  "schemaVersion": 1,
  "id": "hitch_kestrel_rcs_impulse",
  "kind": "impulse_burst",
  "engineFamily": "hitch_ion_kestrel",
  "displayName": "Hitch/Kestrel RCS directional impulse",
  "notes": "Short directional reaction jet — not a miniature main engine, not a circular flash. Structurally distinct timing, aspect, and layer balance.",
  "geometry": {
    "axis": "socketForward",
    "baseLength": 4.35,
    "baseWidth": 2.05,
    "segmentCount": 3,
    "aspect": "jet",
    "taper": 0.55,
    "billboard": "axial"
  },
  "layers": [
    {
      "role": "core",
      "enabled": true,
      "texture": {
        "id": "rcs_core_jet_v1",
        "mode": "flow",
        "path": "textures/rcs_core_jet_v1.png"
      },
      "blend": "additive",
      "softEdge": 0.12,
      "intensity": 7.1,
      "opacity": 0.96,
      "colorHex": "#f3fbff",
      "widthScale": 0.58,
      "lengthScale": 0.58,
      "scrollSpeed": 4.5
    },
    {
      "role": "inner",
      "enabled": true,
      "texture": {
        "id": "rcs_inner_streak_v1",
        "mode": "flow",
        "path": "textures/rcs_inner_streak_v1.png"
      },
      "blend": "additive",
      "softEdge": 0.16,
      "intensity": 4.65,
      "opacity": 0.72,
      "colorHex": "#54c4f4",
      "widthScale": 0.84,
      "lengthScale": 0.9,
      "scrollSpeed": 3.6
    },
    {
      "role": "sheath",
      "enabled": true,
      "texture": {
        "id": "rcs_sheath_puff_v1",
        "mode": "noise",
        "path": "textures/rcs_sheath_puff_v1.png"
      },
      "blend": "additive",
      "softEdge": 0.3,
      "intensity": 1.55,
      "opacity": 0.32,
      "colorHex": "#294d9f",
      "widthScale": 1.1,
      "lengthScale": 1.08,
      "scrollSpeed": 1.8
    },
    {
      "role": "vapor",
      "enabled": true,
      "texture": {
        "id": "rcs_vapor_dissipate_v1",
        "mode": "soft_radial",
        "path": "textures/rcs_vapor_dissipate_v1.png"
      },
      "blend": "alpha",
      "softEdge": 0.42,
      "intensity": 0.65,
      "opacity": 0.3,
      "colorHex": "#24395b",
      "widthScale": 1.3,
      "lengthScale": 1.24,
      "scrollSpeed": 1.0
    }
  ],
  "throttle": {
    "idle": 0.0,
    "length": { "at0": 0.55, "at1": 1.0, "exp": 0.7 },
    "width": { "at0": 0.65, "at1": 1.05, "exp": 0.8 },
    "turbulence": { "at0": 0.5, "at1": 0.95, "exp": 1.0 },
    "coreSheathBalance": { "at0": 0.9, "at1": 1.1, "exp": 1.0 },
    "dissipation": { "at0": 0.85, "at1": 1.25, "exp": 1.2 },
    "flowSpeed": { "at0": 0.9, "at1": 1.3, "exp": 1.0 }
  },
  "timing": {
    "attack": 0.022,
    "sustain": 0.055,
    "release": 0.18
  },
  "eventLight": {
    "enabled": true,
    "maxIntensity": 1.4,
    "maxRange": 4.5,
    "color": "#b8e0ff",
    "throttleScale": { "at0": 0.4, "at1": 1.0, "exp": 1.0 }
  },
  "accessibility": {
    "reducedMotion": {
      "preserveSilhouette": true,
      "preserveFeedback": true,
      "flowSpeedScale": 0.08,
      "disableLayers": [],
      "staticCoreBoost": 0.28,
      "holdMs": 135,
      "roleLengthScale": { "core": 0.94, "inner": 0.84, "sheath": 0.76, "vapor": 0.68 },
      "roleWidthScale": { "core": 1.2, "inner": 1.1, "sheath": 0.96, "vapor": 0.86 },
      "roleIntensityGain": { "core": 1.08, "inner": 1.04 },
      "roleOpacityGain": { "core": 1.12, "inner": 1.12 }
    },
    "reducedFlash": {
      "preserveSilhouette": true,
      "preserveFeedback": true,
      "intensityScale": 0.68,
      "eventLightScale": 0.15,
      "coreWhitenessCap": 0.28,
      "roleIntensityGain": { "core": 1.22, "inner": 1.14 }
    },
    "lowQuality": {
      "preserveSilhouette": true,
      "preserveFeedback": true,
      "maxLayers": 2,
      "preferRoles": ["core", "sheath"]
    }
  },
  "quality": {
    "high": {
      "segments": 3,
      "layers": ["core", "inner", "sheath", "vapor"]
    },
    "medium": {
      "segments": 2,
      "layers": ["core", "inner", "sheath"]
    },
    "low": {
      "segments": 1,
      "layers": ["core", "sheath"]
    }
  },
  "identity": {
    "flowCharacter": {
      "swirl": 0.2,
      "fork": 0.25,
      "noiseScale": 1.1,
      "baseFlow": 4.2,
      "anisotropy": 2.6
    },
    "geometryCharacter": {
      "taper": 0.55,
      "mouthBreak": 0.15,
      "axialFill": 0.95,
      "lateralKick": 0.35
    },
    "timingCharacter": {
      "driveRise": 24.0,
      "driveFall": 14.0,
      "boostRise": 0,
      "boostFall": 0,
      "oneShot": true
    },
    "layeringCharacter": {
      "coreDominance": 0.92,
      "sheathBloomIndependence": true,
      "vaporOnlyAtTail": false,
      "noContinuousIdle": true
    }
  },
  "liveSeams": {
    "engineProfileId": "engine_ion_small",
    "shipIds": ["ship_kestrel"],
    "vfxHooks": ["_onThrust", "RCS / reverse nozzle trail paths"],
    "structuralDistinctionFromMain": [
      "kind=impulse_burst vs continuous_plume",
      "total envelope ≤ 0.55s",
      "jet aspect with short baseLength",
      "no idle hold",
      "higher anisotropy / lateral kick",
      "no distortion layer"
    ]
  }
});
