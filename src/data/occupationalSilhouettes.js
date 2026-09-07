// src/data/occupationalSilhouettes.js — Nine occupational silhouette rules.
// Contract:
// - Nine occupational roles (miner, customs, heavy, courier, salvor, surveyor, tender, tug, rescue).
// - Each role defines a distinct silhouette token, hardware protagonist, asymmetry rules,
//   aspect ratio, light code, and faction livery binding.
// - Pure data and pure functions, no DOM, no Three.js.

export const OCCUPATIONAL_ROLE_IDS = Object.freeze([
  'miner',
  'customs',
  'heavy',
  'courier',
  'salvor',
  'surveyor',
  'tender',
  'tug',
  'rescue',
]);

export const OCCUPATIONAL_SILHOUETTE_TOKENS = Object.freeze([
  'token_silhouette_miner',
  'token_silhouette_customs',
  'token_silhouette_heavy',
  'token_silhouette_courier',
  'token_silhouette_salvor',
  'token_silhouette_surveyor',
  'token_silhouette_tender',
  'token_silhouette_tug',
  'token_silhouette_rescue',
]);

export const ROLE_ALIASES = Object.freeze({
  hauler: 'heavy',
  heavy_hauler: 'heavy',
  freighter: 'heavy',
  ore_carrier: 'heavy',
  mining: 'miner',
  prospector: 'miner',
  mining_barge: 'miner',
  patrol: 'customs',
  inspection_cutter: 'customs',
  interdictor: 'customs',
  express: 'courier',
  shuttle: 'courier',
  repair_tender: 'tender',
  salvage_cutter: 'salvor',
  survey_pin: 'surveyor',
  yard_tug: 'tug',
  lighter: 'tug',
  rescue_lifter: 'rescue',
});

export const OCCUPATIONAL_SILHOUETTE_RULES = Object.freeze({
  miner: Object.freeze({
    role: 'miner',
    label: 'Mining Rig',
    silhouetteToken: 'token_silhouette_miner',
    signatureVerb: 'Cuts and crabs relative to the rock face; extracts ore under amber work floods.',
    hardwareProtagonist: 'Asymmetric extraction arms forward (port cutter, starboard scoop), underslung dust hopper/filter drums.',
    asymmetry: 'Heavy port cutter boom, offset collector throat, unilateral debris skirt.',
    aspectRatio: 1.68,
    primarySilhouette: 'wide_box_workframe',
    silhouetteAnchors: Object.freeze(['extraction_arms', 'hopper_drum', 'dust_skirt', 'boom_head']),
    lightCode: Object.freeze({
      meaning: 'Mass and cutting; blind cone at seam',
      cadence: 'slow_pulse',
      primaryColor: '#F2B233',
      beamStyle: 'amber_work_cone',
    }),
    hazardMarking: 'Amber chevrons on arm knuckles, hazard border on hopper lips.',
    behaviorSignature: Object.freeze({
      flightClass: 'miner',
      paceWU: 30,
      combatRole: 'fleeing_trader',
      tacticalTell: 'Squat industrial work frame; sluggish loaded turn authority; clings to ore face.',
    }),
    factionLivery: Object.freeze({
      baseWear: 'workwear',
      grimeDelta: 0.20,
      chromeAllowed: false,
      accentPlacement: 'tool_mounts_and_arm_knuckles',
      primaryCoverage: 0.60,
    }),
  }),

  customs: Object.freeze({
    role: 'customs',
    label: 'Customs Cutter',
    silhouetteToken: 'token_silhouette_customs',
    signatureVerb: 'Enforces inspection corridors; locks steady arc-blue inspection bar on selected contact.',
    hardwareProtagonist: 'Squared inspection emitter collar around bow (\'judge\'s collar\'), dorsal sensor fin, boarding clamp.',
    asymmetry: 'Strict axial symmetry; bilateral inspection collar with central sensor fin.',
    aspectRatio: 1.85,
    primarySilhouette: 'collared_wedge',
    silhouetteAnchors: Object.freeze(['inspection_collar', 'dorsal_fin', 'boarding_collar', 'flush_fairings']),
    lightCode: Object.freeze({
      meaning: 'Authority and inspection; regulated metronome',
      cadence: 'metronome',
      primaryColor: '#3A78FF',
      beamStyle: 'arc_blue_sweep_bar',
    }),
    hazardMarking: 'High-contrast lighted registry stencils, zero illicit tag space.',
    behaviorSignature: Object.freeze({
      flightClass: 'scout',
      paceWU: 44,
      combatRole: 'interdictor',
      tacticalTell: 'Sleek angular wedge wearing a judge\'s collar; fast station-keeping; locks arc-blue sweep bar.',
    }),
    factionLivery: Object.freeze({
      baseWear: 'clean_authority',
      grimeDelta: -0.20,
      chromeAllowed: true,
      accentPlacement: 'dorsal_fin_and_collar_trim',
      primaryCoverage: 0.75,
    }),
  }),

  heavy: Object.freeze({
    role: 'heavy',
    label: 'Bulk Hauler',
    silhouetteToken: 'token_silhouette_heavy',
    signatureVerb: 'Moves massive cargo pods along logistics lanes; slow to correct momentum.',
    hardwareProtagonist: 'Massive rectangular open-truss spine loaded with modular cargo pods, gigantic aft drive block.',
    asymmetry: 'Alternating pod clamps, offset fuel feed raceways, high forward bridge cab.',
    aspectRatio: 2.25,
    primarySilhouette: 'stepped_slab_truss',
    silhouetteAnchors: Object.freeze(['open_truss_spine', 'pod_bay_clusters', 'aft_engine_wall', 'high_bridge']),
    lightCode: Object.freeze({
      meaning: 'Mass in transit; load-strobe heartbeat',
      cadence: 'load_strobe_heartbeat',
      primaryColor: '#FFB347',
      beamStyle: 'amber_load_strobe',
    }),
    hazardMarking: 'Volatile cargo bands, yellow/black load stripe on pod latching frames.',
    behaviorSignature: Object.freeze({
      flightClass: 'hauler',
      paceWU: 22,
      combatRole: 'fleeing_trader',
      tacticalTell: 'Gigantic rectangular slab; slow arrival deceleration; high linear inertia.',
    }),
    factionLivery: Object.freeze({
      baseWear: 'industrial',
      grimeDelta: 0.15,
      chromeAllowed: false,
      accentPlacement: 'spine_truss_rails_and_pod_latches',
      primaryCoverage: 0.50,
    }),
  }),

  courier: Object.freeze({
    role: 'courier',
    label: 'Priority Courier',
    silhouetteToken: 'token_silhouette_courier',
    signatureVerb: 'Flies rapid tangent passes on priority contracts; commits through without loitering.',
    hardwareProtagonist: 'Needle-sharp aerodynamic delta wedge, high-sweep wings, oversized central thruster cone.',
    asymmetry: 'Clean bilateral dart lines; faired flush surfaces with zero external pods.',
    aspectRatio: 2.10,
    primarySilhouette: 'needle_delta_dart',
    silhouetteAnchors: Object.freeze(['needle_nose', 'raked_wings', 'central_propulsion_cone', 'flush_cockpit']),
    lightCode: Object.freeze({
      meaning: 'Clean transit; unencumbered speed',
      cadence: 'clean_burn_strobe',
      primaryColor: '#A0EEF8',
      beamStyle: 'cyan_white_strobe',
    }),
    hazardMarking: 'Reflective leading-edge speed chevrons, dispatch crest.',
    behaviorSignature: Object.freeze({
      flightClass: 'scout',
      paceWU: 52,
      combatRole: 'fleeing_trader',
      tacticalTell: 'Knife-edge dart; high thrust-to-mass; immediate roll-and-burn evasion.',
    }),
    factionLivery: Object.freeze({
      baseWear: 'sleek_satin',
      grimeDelta: -0.15,
      chromeAllowed: true,
      accentPlacement: 'wing_leading_edges_and_spine_strip',
      primaryCoverage: 0.70,
    }),
  }),

  salvor: Object.freeze({
    role: 'salvor',
    label: 'Salvage Cutter',
    silhouetteToken: 'token_silhouette_salvor',
    signatureVerb: 'Breaks dead hulks in relative hold; cuts with hooded lamps down-aimed.',
    hardwareProtagonist: 'Starboard hydraulic plate-shears, 3 overhead hooded umbrella lamps, aft scrap cradle.',
    asymmetry: 'Massive starboard shears, port gas/foam cylinder stack, asymmetrical umbrella boom arms.',
    aspectRatio: 1.72,
    primarySilhouette: 'asymmetric_cutter_cradle',
    silhouetteAnchors: Object.freeze(['hydraulic_shears', 'umbrella_cowls', 'scrap_rib_cradle', 'tether_reels']),
    lightCode: Object.freeze({
      meaning: 'Salvage in progress; hooded confession light',
      cadence: 'hooded_down_flood',
      primaryColor: '#D87838',
      beamStyle: 'amber_umbrella_floods',
    }),
    hazardMarking: 'Scorched jaw knuckles, yellow/black hazard hatching on shear rams.',
    behaviorSignature: Object.freeze({
      flightClass: 'miner',
      paceWU: 40,
      combatRole: 'fleeing_trader',
      tacticalTell: 'Ragged silhouette with downward umbrellas; stays with the wreck; does not scatter.',
    }),
    factionLivery: Object.freeze({
      baseWear: 'patchwork_soot',
      grimeDelta: 0.35,
      chromeAllowed: false,
      accentPlacement: 'replacement_plates_and_cradle_lips',
      primaryCoverage: 0.40,
    }),
  }),

  surveyor: Object.freeze({
    role: 'surveyor',
    label: 'Survey Rig',
    silhouetteToken: 'token_silhouette_surveyor',
    signatureVerb: 'Crabs 90° across uncharted belts; reads the dark with periodic pulse rings.',
    hardwareProtagonist: 'Stepped dorsal sensor spine, high oval array paddles, 90° crab survey pin boom.',
    asymmetry: 'Forward survey pin crabs 90° off-axis; chin range-mast cluster offset from dorsal boom.',
    aspectRatio: 2.40,
    primarySilhouette: 'moth_paddle_sensor_spine',
    silhouetteAnchors: Object.freeze(['sensor_spine_extension', 'array_paddles', 'crab_pin_boom', 'range_mast_tripod']),
    lightCode: Object.freeze({
      meaning: 'Reading the dark; scanner pulse rings',
      cadence: 'rhythmic_pulse_ring',
      primaryColor: '#80EED0',
      beamStyle: 'cool_survey_pulse',
    }),
    hazardMarking: 'Sensor calibration scales, stamped survey quadrant plate.',
    behaviorSignature: Object.freeze({
      flightClass: 'multirole',
      paceWU: 34,
      combatRole: 'passive_observer',
      tacticalTell: 'Flies sideways under wide paddles; keeps boom between stranger and belly; slides away.',
    }),
    factionLivery: Object.freeze({
      baseWear: 'ash_grey_utility',
      grimeDelta: 0.05,
      chromeAllowed: false,
      accentPlacement: 'cable_raceway_spine_and_paddle_frames',
      primaryCoverage: 0.55,
    }),
  }),

  tender: Object.freeze({
    role: 'tender',
    label: 'Repair Tender',
    silhouetteToken: 'token_silhouette_tender',
    signatureVerb: 'Provides mobile field repairs; holds soft relative drift with red corners lit.',
    hardwareProtagonist: 'Port curved vertical plate rack, starboard articulated welding crane with lamp head, 4 red corners.',
    asymmetry: 'Extreme left/right split: entire port side is plate rack, entire starboard is weld boom.',
    aspectRatio: 1.75,
    primarySilhouette: 'split_rack_crane_hull',
    silhouetteAnchors: Object.freeze(['plate_rack_vertical', 'welding_crane_arm', 'soft_dock_collar', 'corner_lamp_stems']),
    lightCode: Object.freeze({
      meaning: 'Hull open; personnel outside; do not push',
      cadence: 'static_quad_corners',
      primaryColor: '#FF4455',
      beamStyle: 'static_red_corners_blue_weld',
    }),
    hazardMarking: 'Safety-yellow bay lips, swing-out white \'DO NOT PUSH\' engine bar.',
    behaviorSignature: Object.freeze({
      flightClass: 'multirole',
      paceWU: 66,
      combatRole: 'passive_assistant',
      tacticalTell: 'Broad flat workshop frame; plate rack looks like books; stationary zero-drift hold.',
    }),
    factionLivery: Object.freeze({
      baseWear: 'primer_workshop',
      grimeDelta: 0.10,
      chromeAllowed: false,
      accentPlacement: 'welding_boom_elbows_and_safety_lips',
      primaryCoverage: 0.50,
    }),
  }),

  tug: Object.freeze({
    role: 'tug',
    label: 'Yard Tug',
    silhouetteToken: 'token_silhouette_tug',
    signatureVerb: 'Nudges heavy tonnage into dock alignment; provides short high-thrust contact bursts.',
    hardwareProtagonist: 'Heavy bow push-cradle with padded vertical ribs, hip nudge-keels with replaceable shoes, aft winch.',
    asymmetry: 'Blunt flat nose with vertical ribbing, hip skids flanking low bilges, high forward bridge.',
    aspectRatio: 1.45,
    primarySilhouette: 'blunt_cradle_nudge_hull',
    silhouetteAnchors: Object.freeze(['bow_push_cradle', 'hip_nudge_keels', 'aft_winch_tower', 'perched_bridge']),
    lightCode: Object.freeze({
      meaning: 'Berth operations; apron beacon',
      cadence: 'steady_apron_beacon',
      primaryColor: '#FFF4D4',
      beamStyle: 'warm_white_cradle_floods',
    }),
    hazardMarking: 'Apron-yellow nose, high-friction abrasion on contact pads.',
    behaviorSignature: Object.freeze({
      flightClass: 'hauler',
      paceWU: 20,
      combatRole: 'passive_service',
      tacticalTell: 'Short blunt powerhouse; oversized drives; touches client with push-cradle ticks.',
    }),
    factionLivery: Object.freeze({
      baseWear: 'apron_work',
      grimeDelta: 0.25,
      chromeAllowed: false,
      accentPlacement: 'cradle_uprights_and_winch_pylons',
      primaryCoverage: 0.65,
    }),
  }),

  rescue: Object.freeze({
    role: 'rescue',
    label: 'Rescue Lifter',
    silhouetteToken: 'token_silhouette_rescue',
    signatureVerb: 'Answers emergency beacons; approaches with steady red-white identity bars and searchlights.',
    hardwareProtagonist: 'Forward casualty bay with soft-dock padded jaws, dorsal stretcher boom, flank identity light bars.',
    asymmetry: 'Forward casualty mouth flanked by soft padding; dorsal boom equipped with rescue basket.',
    aspectRatio: 1.90,
    primarySilhouette: 'intake_mouth_lifter',
    silhouetteAnchors: Object.freeze(['casualty_bay_mouth', 'stretcher_grapple', 'flank_identity_bars', 'triage_pods']),
    lightCode: Object.freeze({
      meaning: 'Emergency responder; sanctioned presence',
      cadence: 'steady_red_white_bars',
      primaryColor: '#FF3344',
      beamStyle: 'steady_dual_color_bars',
    }),
    hazardMarking: 'Sanctioned red-white rescue bars along full flanks, reflective emergency chevrons.',
    behaviorSignature: Object.freeze({
      flightClass: 'multirole',
      paceWU: 48,
      combatRole: 'passive_service',
      tacticalTell: 'Flies steady red-white flank bars; fast direct approach; floodlights light debris.',
    }),
    factionLivery: Object.freeze({
      baseWear: 'clean_service',
      grimeDelta: -0.10,
      chromeAllowed: false,
      accentPlacement: 'flank_emergency_bands_and_mouth_rim',
      primaryCoverage: 0.80,
    }),
  }),
});

export function normalizeOccupationalRole(role) {
  if (!role || typeof role !== 'string') return null;
  const key = role.toLowerCase().trim();
  if (OCCUPATIONAL_SILHOUETTE_RULES[key]) return key;
  return ROLE_ALIASES[key] || null;
}

export function getOccupationalSilhouetteRule(role) {
  const norm = normalizeOccupationalRole(role);
  return norm ? OCCUPATIONAL_SILHOUETTE_RULES[norm] : null;
}

export function getRoleFactionLivery(role, factionId, factionPalettes = null) {
  const rule = getOccupationalSilhouetteRule(role);
  if (!rule) return null;
  const fallback = {
    primary: '#3A78FF',
    secondary: '#1A3A8F',
    accent: '#A0C4FF',
    hull: '#345FAE',
    emissive: '#3A78FF',
    thruster: '#88AAFF',
  };
  const palettes = factionPalettes || {};
  const factionPalette = (factionId && palettes[factionId]) || fallback;
  return Object.freeze({
    role: rule.role,
    label: rule.label,
    silhouetteToken: rule.silhouetteToken,
    factionId: factionId || 'unaligned',
    hullColor: factionPalette.hull || factionPalette.primary || fallback.hull,
    primaryCoat: factionPalette.primary || fallback.primary,
    secondaryTrim: factionPalette.secondary || fallback.secondary,
    accentHardware: factionPalette.accent || fallback.accent,
    emissiveWorkLight: rule.lightCode.primaryColor,
    thrusterPlume: factionPalette.thruster || fallback.thruster,
    baseWear: rule.factionLivery.baseWear,
    grimeDelta: rule.factionLivery.grimeDelta,
    chromeAllowed: rule.factionLivery.chromeAllowed,
    accentPlacement: rule.factionLivery.accentPlacement,
    primaryCoverage: rule.factionLivery.primaryCoverage,
  });
}
