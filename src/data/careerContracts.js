// M3/M4 repeatable career contracts — authored three-stage work, not random task soup.
// Missions owns offers/active objectives/rewards. This catalog owns actors, motives, explicit
// instructions, recovery language, career skill expression, and persistent sector consequences.

export const CAREER_CONTRACT_SCHEMA_VERSION = 1;
export const CAREER_CONTRACT_IDS = Object.freeze(['hauler', 'hunter', 'prospector']);

function stage(input) {
  return Object.freeze({
    collateralCr: 0,
    preloadedCargo: false,
    params: Object.freeze({}),
    successImpulse: Object.freeze({ danger: -0.01, pricePressure: -0.01 }),
    failureImpulse: Object.freeze({ danger: 0.01, pricePressure: 0.01 }),
    ...input,
  });
}

function contract(input) {
  return Object.freeze({ ...input, actor: Object.freeze(input.actor), failure: Object.freeze(input.failure), stages: Object.freeze(input.stages) });
}

export const REPEATABLE_CAREER_CONTRACTS = Object.freeze([
  // HAULER — route judgment, custody, and customs exposure rather than three fetches.
  contract({
    id: 'hauler_relief_circuit', careerId: 'hauler', title: 'The Three-Port Relief Circuit',
    startStationId: 'station_helios', skillExpression: 'Plan a loaded three-port circuit, preserve sealed cargo, then shepherd the empty relief convoy home.',
    actor: { id: 'actor_mara_venn', name: 'Quartermaster Mara Venn', factionId: 'faction_mts', motive: 'Ceres ration reserves are below one shift; Venn needs food delivered without creating a panic bid.' },
    failure: { consequence: 'A missed leg spikes provisions and leaves the relief hull exposed.', recovery: 'Venn reissues the current leg at reduced pay; the completed legs remain credited.' },
    consequence: 'Stable food and fuel flow lowers corridor price pressure and convoy danger.',
    stages: [
      stage({ id: 'seal_rations', title: 'Seal the Ceres Ration Lot', type: 'cargo_delivery', boardStationId: 'station_helios', destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt', riskTier: 1, rewardCr: 520, collateralCr: 120, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_food', qty: 10 }), instruction: 'Take 10u sealed provisions from Helios to Ceres Refinery. Do not divert the manifest.', failureText: 'Loss of custody forces Ceres onto spot-market rations.', recoveryText: 'Return to Helios; Venn can reseal a smaller lot.', successImpulse: Object.freeze({ danger: -0.01, pricePressure: -0.035 }), failureImpulse: Object.freeze({ danger: 0.005, pricePressure: 0.025 }) }),
      stage({ id: 'forge_cells', title: 'Carry the Forge Fuel Allotment', type: 'cargo_delivery', boardStationId: 'station_ceres', destStationId: 'station_forge', destSectorId: 'sector_vesta_forge', riskTier: 2, rewardCr: 760, collateralCr: 180, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_fuel_cells', qty: 8 }), instruction: 'Load the ration-paid fuel cells at Ceres and deliver them to Forge Foundry.', failureText: 'The foundry loses its protected allotment and buys fuel at emergency rates.', recoveryText: 'Ceres will release a replacement allotment after the custody loss is logged.', successImpulse: Object.freeze({ danger: -0.015, pricePressure: -0.04 }), failureImpulse: Object.freeze({ danger: 0.01, pricePressure: 0.03 }) }),
      stage({ id: 'empty_convoy_home', title: 'Bring the Relief Hulls Home', type: 'escort', boardStationId: 'station_forge', destStationId: 'station_helios', destSectorId: 'sector_helios_prime', riskTier: 2, rewardCr: 980, params: Object.freeze({ targetStrength: 1.15 }), instruction: 'Form on the empty relief convoy at Vesta and keep it intact to Helios Station.', failureText: 'Losing the empty hulls erases the route capacity you just restored.', recoveryText: 'Forge assembles a slower reserve convoy; meet it at the foundry.', successImpulse: Object.freeze({ danger: -0.045, pricePressure: -0.025 }), failureImpulse: Object.freeze({ danger: 0.04, pricePressure: 0.02 }) }),
    ],
  }),
  contract({
    id: 'hauler_wreck_reclamation', careerId: 'hauler', title: 'Wake Reclamation Ledger',
    startStationId: 'station_reach', skillExpression: 'Read a battle aftermath, move recovered material through a risky corridor, and close the ledger with replacement stock.',
    actor: { id: 'actor_orin_vale', name: 'Recovery Broker Orin Vale', factionId: 'faction_free', motive: 'Vale wants a destroyed crew identified and its useful mass returned before scavengers erase the evidence.' },
    failure: { consequence: 'Unrecovered evidence keeps the loss unexplained and raises route risk.', recovery: 'Vale preserves the cause record and reposts only the failed recovery stage.' },
    consequence: 'Verified recovery reduces salvage-route danger and returns scarce electronics to circulation.',
    stages: [
      stage({ id: 'read_the_wake', title: 'Read the Wake', type: 'recon_scan', boardStationId: 'station_reach', destSectorId: 'sector_io_reach', riskTier: 2, rewardCr: 620, params: Object.freeze({ scanTargets: 2 }), instruction: 'Pulse two wreck signatures in Io Reach and identify which loss record still carries a live transponder.', failureText: 'The trail cools and opportunists strip the identifying hardware.', recoveryText: 'Vale rebroadcasts the last verified coordinates from Reach Station.', successImpulse: Object.freeze({ danger: -0.015, pricePressure: -0.005 }), failureImpulse: Object.freeze({ danger: 0.02, pricePressure: 0.005 }) }),
      stage({ id: 'carry_the_recorders', title: 'Carry the Flight Recorders', type: 'cargo_delivery', boardStationId: 'station_reach', destStationId: 'station_tethys', destSectorId: 'sector_tethys_junction', riskTier: 2, rewardCr: 840, collateralCr: 220, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_salvage_electronics', qty: 6 }), instruction: 'Deliver 6u tagged recorder electronics from Io Reach to Tethys Trade Hub for authentication.', failureText: 'Lost recorders turn a named loss into untraceable scrap.', recoveryText: 'Vale issues duplicate telemetry cores if you return to Reach Station.', successImpulse: Object.freeze({ danger: -0.02, pricePressure: -0.025 }), failureImpulse: Object.freeze({ danger: 0.025, pricePressure: 0.015 }) }),
      stage({ id: 'replacement_stock', title: 'Return Replacement Stock', type: 'cargo_delivery', boardStationId: 'station_tethys', destStationId: 'station_reach', destSectorId: 'sector_io_reach', riskTier: 2, rewardCr: 940, collateralCr: 180, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_comp_circuitry', qty: 5 }), instruction: 'Use the authenticated claim to carry 5u replacement circuitry back to Reach Station.', failureText: 'The claim pays out, but the frontier crew still lacks replacement controls.', recoveryText: 'Tethys keeps the claim open for one replacement dispatch.', successImpulse: Object.freeze({ danger: -0.035, pricePressure: -0.035 }), failureImpulse: Object.freeze({ danger: 0.025, pricePressure: 0.025 }) }),
    ],
  }),
  contract({
    id: 'hauler_shadow_manifest', careerId: 'hauler', title: 'Shadow Manifest Arbitration',
    startStationId: 'station_tethys', skillExpression: 'Balance passenger trust, customs exposure, hidden cargo, and a lawful return leg.',
    actor: { id: 'actor_kest_vale', name: 'Manifest Arbiter Kest Vale', factionId: 'faction_free', motive: 'A defecting customs clerk carries proof of selective seizures; Vale wants the witness moved before either side can bury the ledger.' },
    failure: { consequence: 'A scan or lost witness strengthens predatory customs and increases corridor danger.', recovery: 'Vale changes the transponder and reposts the failed leg, never the entire chain.' },
    consequence: 'Publishing the ledger reduces predatory pressure while preserving legitimate trade flow.',
    stages: [
      stage({ id: 'move_the_clerk', title: 'Move the Clerk Off-Grid', type: 'passenger_transport', boardStationId: 'station_tethys', destStationId: 'station_drift', destSectorId: 'sector_pallas_drift', riskTier: 2, rewardCr: 720, instruction: 'Carry the defecting clerk from Tethys to Drift Market without stopping at Customs Gate.', failureText: 'The witness disappears and the seizure ledger remains unauthenticated.', recoveryText: 'Vale moves the witness to a secondary berth at Tethys.', successImpulse: Object.freeze({ danger: -0.015, pricePressure: -0.01 }), failureImpulse: Object.freeze({ danger: 0.025, pricePressure: 0.015 }) }),
      stage({ id: 'smuggle_the_ledger', title: 'Run the Seizure Ledger', type: 'smuggling_run', boardStationId: 'station_drift', destStationId: 'station_nyx_march', destSectorId: 'sector_nyx_march', riskTier: 3, rewardCr: 1320, collateralCr: 320, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_classified_salvage', qty: 3 }), instruction: 'Carry 3u encoded seizure records from Drift Market to the Nyx Fence. A patrol scan burns the proof.', failureText: 'A customs scan exposes the ledger before independent copies exist.', recoveryText: 'The clerk retained a split copy; return to Drift Market for a narrower run.', successImpulse: Object.freeze({ danger: -0.025, pricePressure: -0.02 }), failureImpulse: Object.freeze({ danger: 0.04, pricePressure: 0.025 }) }),
      stage({ id: 'lawful_countermanifest', title: 'File the Counter-Manifest', type: 'cargo_delivery', boardStationId: 'station_nyx_march', destStationId: 'station_customs', destSectorId: 'sector_tethys_junction', riskTier: 2, rewardCr: 1080, collateralCr: 150, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_microchips', qty: 4 }), instruction: 'Return 4u signed audit chips to Customs Gate openly; the final leg must survive inspection.', failureText: 'Without the signed counter-manifest, the leak reads as criminal fabrication.', recoveryText: 'Nyx can stamp another audit set after the failed custody chain is disclosed.', successImpulse: Object.freeze({ danger: -0.05, pricePressure: -0.025 }), failureImpulse: Object.freeze({ danger: 0.035, pricePressure: 0.02 }) }),
    ],
  }),

  // HUNTER — identify, position, protect, and recover evidence; killing is only one tool.
  contract({
    id: 'hunter_warrant_ladder', careerId: 'hunter', title: 'The Quiet Warrant',
    startStationId: 'station_coalition', skillExpression: 'Build lawful target certainty, intercept one marked actor, then preserve admissible evidence.',
    actor: { id: 'actor_ilyan_rooke', name: 'Marshal Ilyan Rooke', factionId: 'faction_scn', motive: 'Rooke needs a raider captain removed without turning Helios security into indiscriminate retaliation.' },
    failure: { consequence: 'A sloppy warrant raises local danger and weakens lawful identification.', recovery: 'Rooke reissues the current evidentiary step with a new target signature.' },
    consequence: 'A clean warrant lowers predation without increasing civilian screening.',
    stages: [
      stage({ id: 'verify_transponders', title: 'Verify the Decoy Transponders', type: 'recon_scan', boardStationId: 'station_coalition', destSectorId: 'sector_ceres_belt', riskTier: 1, rewardCr: 560, params: Object.freeze({ scanTargets: 3 }), instruction: 'Scan three marked contacts in Ceres and identify the transponder that repeats across the ambush record.', failureText: 'The false identities remain mixed with lawful belt traffic.', recoveryText: 'Coalition analysis narrows the set and reposts the scan order.', successImpulse: Object.freeze({ danger: -0.015, pricePressure: 0 }), failureImpulse: Object.freeze({ danger: 0.02, pricePressure: 0 }) }),
      stage({ id: 'serve_the_warrant', title: 'Serve the Warrant at Tethys', type: 'bounty_hunt', boardStationId: 'station_ceres', destSectorId: 'sector_tethys_junction', riskTier: 2, rewardCr: 980, params: Object.freeze({ targetStrength: 1.25 }), instruction: 'Intercept only the marked captain in Tethys Junction; lawful traffic is not part of the warrant.', failureText: 'The captain escapes with proof that the patrol cannot discriminate targets.', recoveryText: 'Rooke waits for the captain to reuse the forged transponder.', successImpulse: Object.freeze({ danger: -0.04, pricePressure: -0.005 }), failureImpulse: Object.freeze({ danger: 0.045, pricePressure: 0.005 }) }),
      stage({ id: 'return_the_evidence', title: 'Return the Gunnery Core', type: 'cargo_delivery', boardStationId: 'station_tethys', destStationId: 'station_coalition', destSectorId: 'sector_helios_prime', riskTier: 2, rewardCr: 860, collateralCr: 180, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_salvage_electronics', qty: 2 }), instruction: 'Carry the tagged gunnery core from Tethys to Coalition HQ so the warrant closes on evidence, not rumor.', failureText: 'Without the core, the captain becomes another unexplained kill.', recoveryText: 'Tethys technicians can image a second evidentiary core.', successImpulse: Object.freeze({ danger: -0.035, pricePressure: -0.01 }), failureImpulse: Object.freeze({ danger: 0.025, pricePressure: 0.005 }) }),
    ],
  }),
  contract({
    id: 'hunter_convoy_screen', careerId: 'hunter', title: 'Foundry Screen Rotation',
    startStationId: 'station_customs', skillExpression: 'Protect a vulnerable convoy, clear its specific threat corridor, then extract the route witness.',
    actor: { id: 'actor_nara_sile', name: 'Screen Chief Nara Sile', factionId: 'faction_scn', motive: 'Sile needs one foundry convoy to arrive intact so Vesta does not militarize every civilian shipment.' },
    failure: { consequence: 'A lost convoy raises escort demand, danger, and component prices.', recovery: 'A reserve convoy launches after the failed screen is logged.' },
    consequence: 'A defended civilian route lowers danger without spawning permanent martial law.',
    stages: [
      stage({ id: 'screen_the_foundry_run', title: 'Screen the Foundry Run', type: 'escort', boardStationId: 'station_customs', destStationId: 'station_forge', destSectorId: 'sector_vesta_forge', riskTier: 2, rewardCr: 1040, params: Object.freeze({ targetStrength: 1.2 }), instruction: 'Stay with the foundry convoy from Customs Gate until it reaches Forge Foundry.', failureText: 'The convoy loss proves the route cannot carry civilian tonnage safely.', recoveryText: 'Sile assigns a slower reserve hull with a tighter formation.', successImpulse: Object.freeze({ danger: -0.04, pricePressure: -0.025 }), failureImpulse: Object.freeze({ danger: 0.05, pricePressure: 0.035 }) }),
      stage({ id: 'break_the_cut', title: 'Break the Hyperion Cut', type: 'patrol_clear', boardStationId: 'station_forge', destSectorId: 'sector_hyperion_cut', riskTier: 3, rewardCr: 1380, params: Object.freeze({ clearCount: 3, targetStrength: 1.35 }), instruction: 'Clear the three ships tied to the convoy ambush record in Hyperion Cut; ignore unrelated traffic.', failureText: 'The ambush cell learns the convoy timing and fortifies the cut.', recoveryText: 'Forge intelligence marks the next verified assembly window.', successImpulse: Object.freeze({ danger: -0.06, pricePressure: -0.015 }), failureImpulse: Object.freeze({ danger: 0.055, pricePressure: 0.02 }) }),
      stage({ id: 'extract_the_route_witness', title: 'Extract the Route Witness', type: 'passenger_transport', boardStationId: 'station_hyperion_cut', destStationId: 'station_customs', destSectorId: 'sector_tethys_junction', riskTier: 2, rewardCr: 920, instruction: 'Carry the refinery dispatcher who identified the ambush schedule back to Customs Gate.', failureText: 'Without the dispatcher, the cleared ships are replaced by another timed ambush.', recoveryText: 'The dispatcher moves to Cut Claim Outpost and requests a second extraction.', successImpulse: Object.freeze({ danger: -0.045, pricePressure: -0.02 }), failureImpulse: Object.freeze({ danger: 0.035, pricePressure: 0.02 }) }),
    ],
  }),
  contract({
    id: 'hunter_ashfall_pursuit', careerId: 'hunter', title: 'Ashfall Cause Pursuit',
    startStationId: 'station_nyx_march', skillExpression: 'Read an unresolved aftermath, survive deep-space pursuit, and return causal proof instead of a kill count.',
    actor: { id: 'actor_sable_kerr', name: 'Ledger Keeper Sable Kerr', factionId: 'faction_free', motive: 'Kerr tracks crews that manufacture wreck fields to hide contract murders; she wants the cause, not another anonymous hulk.' },
    failure: { consequence: 'The responsible crew converts another wreck field into recruitment propaganda.', recovery: 'Kerr preserves the aftermath fingerprint and waits for its next transmission.' },
    consequence: 'Closing the causal record reduces deep-route predation and preserves the victim ledger.',
    stages: [
      stage({ id: 'trace_the_cause', title: 'Trace the Ashfall Cause', type: 'recon_scan', boardStationId: 'station_nyx_march', destSectorId: 'sector_ashfall_reach', riskTier: 3, rewardCr: 980, params: Object.freeze({ scanTargets: 3 }), instruction: 'Scan three Ashfall signatures and match one to the unresolved wreck fingerprint.', failureText: 'The causal signature decays into ordinary debris noise.', recoveryText: 'Kerr recomputes the trace from the last persistent aftermath record.', successImpulse: Object.freeze({ danger: -0.02, pricePressure: 0 }), failureImpulse: Object.freeze({ danger: 0.035, pricePressure: 0 }) }),
      stage({ id: 'stop_the_fabricator', title: 'Break the Wreck Fabricator Cell', type: 'patrol_clear', boardStationId: 'station_ashcache', destSectorId: 'sector_ashfall_reach', riskTier: 4, rewardCr: 1880, params: Object.freeze({ clearCount: 3, targetStrength: 1.65 }), instruction: 'Clear the three marked fabricator ships near Ashfall; do not chase decoy contacts into the cache.', failureText: 'The fabricator cell survives and stages another false battle site.', recoveryText: 'Kerr reposts when the same motive signature returns.', successImpulse: Object.freeze({ danger: -0.07, pricePressure: -0.01 }), failureImpulse: Object.freeze({ danger: 0.065, pricePressure: 0.015 }) }),
      stage({ id: 'carry_the_cause_ledger', title: 'Carry the Cause Ledger', type: 'cargo_delivery', boardStationId: 'station_ashcache', destStationId: 'station_coalition', destSectorId: 'sector_helios_prime', riskTier: 3, rewardCr: 1420, collateralCr: 300, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_classified_salvage', qty: 2 }), instruction: 'Carry the classified cause ledger from Ashfall to Coalition HQ for permanent attribution.', failureText: 'The deep-route loss remains a rumor and the wreck maker keeps its legend.', recoveryText: 'Ash Cache retains an encrypted duplicate for one more courier.', successImpulse: Object.freeze({ danger: -0.055, pricePressure: -0.01 }), failureImpulse: Object.freeze({ danger: 0.045, pricePressure: 0.01 }) }),
    ],
  }),

  // PROSPECTOR — survey, choose a seam, extract the named material, then prove value at market.
  contract({
    id: 'prospector_ceres_assay', careerId: 'prospector', title: 'Ceres Gradient Assay',
    startStationId: 'station_ceres', skillExpression: 'Survey before cutting, select the metallic seam, and realize value through a measured refinery sale.',
    actor: { id: 'actor_eno_tall', name: 'Assayer Eno Tall', factionId: 'faction_dmc', motive: 'Tall needs a trustworthy titanium gradient before Ceres commits industrial cutters to the wrong field.' },
    failure: { consequence: 'Bad or missing samples waste cutter time and tighten refined-metal supply.', recovery: 'Tall keeps accepted samples and reposts only the failed measurement.' },
    consequence: 'A verified assay improves resource confidence and eases refinery pressure.',
    stages: [
      stage({ id: 'carry_the_assayer', title: 'Carry the Assayer to Belt Outpost', type: 'passenger_transport', boardStationId: 'station_ceres', destStationId: 'station_beltout', destSectorId: 'sector_ceres_belt', riskTier: 1, rewardCr: 480, collateralCr: 120, instruction: 'Carry Eno Tall and the calibrated assay case from Ceres Refinery to Belt Outpost.', failureText: 'The field window opens without the assayer or calibrated reference case.', recoveryText: 'Tall books a reserve berth and keeps the assay window alive.', successImpulse: Object.freeze({ danger: -0.005, pricePressure: -0.005 }), failureImpulse: Object.freeze({ danger: 0.005, pricePressure: 0.01 }) }),
      stage({ id: 'map_the_gradient', title: 'Map the Metallic Gradient', type: 'recon_scan', boardStationId: 'station_beltout', destSectorId: 'sector_ceres_belt', riskTier: 1, rewardCr: 620, params: Object.freeze({ scanTargets: 3 }), instruction: 'Pulse three Ceres deposits before firing a mining head; mark the strongest metallic gradient.', failureText: 'The cutter allocation proceeds on old survey data.', recoveryText: 'Tall republishes the three remaining survey cells.', successImpulse: Object.freeze({ danger: -0.005, pricePressure: -0.01 }), failureImpulse: Object.freeze({ danger: 0.005, pricePressure: 0.015 }) }),
      stage({ id: 'cut_titanium_sample', title: 'Cut the Titanium Sample', type: 'mining_quota', boardStationId: 'station_beltout', destSectorId: 'sector_ceres_belt', riskTier: 2, rewardCr: 980, params: Object.freeze({ cmdtyId: 'cmdty_ore_titanium', qty: 10 }), instruction: 'Mine 10u titanium from the surveyed Ceres field; random ore does not satisfy the assay.', failureText: 'The sample window closes before a representative cut is logged.', recoveryText: 'Tall reopens the same seam window with the survey credit intact.', successImpulse: Object.freeze({ danger: -0.01, pricePressure: -0.045 }), failureImpulse: Object.freeze({ danger: 0.005, pricePressure: 0.03 }) }),
    ],
  }),
  contract({
    id: 'prospector_veil_volatiles', careerId: 'prospector', title: 'Veil Volatile Envelope',
    startStationId: 'station_veil', skillExpression: 'Read an anomaly region, extract the correct gas under danger, and carry the result into a separate research market.',
    actor: { id: 'actor_sori_ven', name: 'Dr. Sori Ven', factionId: 'faction_dmc', motive: 'Ven needs a clean helium-3 envelope to distinguish natural Veil flow from an encounter disturbance.' },
    failure: { consequence: 'Contaminated or missing gas keeps the anomaly model ambiguous.', recovery: 'Ven retains scan calibration and requests another sealed sample.' },
    consequence: 'A clean envelope reduces anomaly uncertainty and research supply pressure.',
    stages: [
      stage({ id: 'calibrate_the_veil', title: 'Calibrate the Veil Envelope', type: 'recon_scan', boardStationId: 'station_veil', destSectorId: 'sector_veil_nebula', riskTier: 3, rewardCr: 860, params: Object.freeze({ scanTargets: 4 }), instruction: 'Scan four gas pockets in Veil Nebula and reject the pocket carrying battle-afterglow noise.', failureText: 'The anomaly model cannot separate gas flow from recent violence.', recoveryText: 'Ven republishes the calibration order with the noisy pocket excluded.', successImpulse: Object.freeze({ danger: -0.015, pricePressure: -0.005 }), failureImpulse: Object.freeze({ danger: 0.025, pricePressure: 0.005 }) }),
      stage({ id: 'draw_helium_envelope', title: 'Draw the Helium-3 Envelope', type: 'mining_quota', boardStationId: 'station_veil', destSectorId: 'sector_veil_nebula', riskTier: 3, rewardCr: 1120, params: Object.freeze({ cmdtyId: 'cmdty_gas_helium3', qty: 8 }), instruction: 'Extract 8u helium-3 from the calibrated pocket; mixed gas does not satisfy the envelope.', failureText: 'The calibrated pocket disperses before a complete draw is recorded.', recoveryText: 'Ven identifies the next stable pocket from your surviving scan data.', successImpulse: Object.freeze({ danger: -0.015, pricePressure: -0.025 }), failureImpulse: Object.freeze({ danger: 0.025, pricePressure: 0.02 }) }),
      stage({ id: 'deliver_to_triton', title: 'Settle the Triton Comparison', type: 'bulk_trade', boardStationId: 'station_veil', destStationId: 'station_triton', destSectorId: 'sector_triton_wake', riskTier: 3, rewardCr: 1260, collateralCr: 240, params: Object.freeze({ cmdtyId: 'cmdty_gas_helium3', qty: 8 }), instruction: 'Sell the sealed 8u envelope at Triton Wake Lab so two anomaly regions can be compared.', failureText: 'Without the Triton comparison, the Veil sample remains an isolated curiosity.', recoveryText: 'Triton holds the comparison order while you recover another envelope.', successImpulse: Object.freeze({ danger: -0.035, pricePressure: -0.035 }), failureImpulse: Object.freeze({ danger: 0.03, pricePressure: 0.025 }) }),
    ],
  }),
  contract({
    id: 'prospector_charon_provenance', careerId: 'prospector', title: 'Charon Provenance Cut',
    startStationId: 'station_expanse', skillExpression: 'Tie an exotic deposit to a persistent cause record, take a controlled cut, and prove provenance at a distant market.',
    actor: { id: 'actor_pel_ardent', name: 'Foreman Pel Ardent', factionId: 'faction_dmc', motive: 'Ardent suspects recent wreck activity exposed a stellarite seam; she needs proof the deposit is real and not contaminated salvage.' },
    failure: { consequence: 'An unproven exotic claim attracts reckless cutters and raises local danger.', recovery: 'Ardent preserves the cause fingerprint and reopens the exact failed step.' },
    consequence: 'Verified provenance lowers claim conflict and feeds a legitimate exotic market.',
    stages: [
      stage({ id: 'separate_rock_from_wreck', title: 'Separate Rock from Wreck', type: 'recon_scan', boardStationId: 'station_expanse', destSectorId: 'sector_charon_expanse', riskTier: 3, rewardCr: 920, params: Object.freeze({ scanTargets: 3 }), instruction: 'Scan three Charon signatures and separate the exotic seam from tagged aftermath debris.', failureText: 'The claim remains indistinguishable from wreck contamination.', recoveryText: 'Ardent reuses the persistent wreck fingerprint to narrow the next scan.', successImpulse: Object.freeze({ danger: -0.02, pricePressure: -0.005 }), failureImpulse: Object.freeze({ danger: 0.03, pricePressure: 0.01 }) }),
      stage({ id: 'controlled_stellarite_cut', title: 'Take the Controlled Stellarite Cut', type: 'mining_quota', boardStationId: 'station_expanse', destSectorId: 'sector_charon_expanse', riskTier: 4, rewardCr: 1540, params: Object.freeze({ cmdtyId: 'cmdty_ore_einsteinium', qty: 6 }), instruction: 'Extract exactly 6u stellarite from the proven seam before claim traffic converges.', failureText: 'The unverified rush strips the seam without a defensible sample.', recoveryText: 'Ardent marks a smaller control face from the original scan.', successImpulse: Object.freeze({ danger: -0.025, pricePressure: -0.035 }), failureImpulse: Object.freeze({ danger: 0.04, pricePressure: 0.025 }) }),
      stage({ id: 'prove_the_lot_at_veil', title: 'Prove the Lot at Veil', type: 'cargo_delivery', boardStationId: 'station_expanse', destStationId: 'station_veil', destSectorId: 'sector_veil_nebula', riskTier: 4, rewardCr: 1720, collateralCr: 300, params: Object.freeze({ cmdtyId: 'cmdty_ore_einsteinium', qty: 6 }), instruction: 'Deliver the mined 6u provenance lot to Research Station Veil, where the assay can be independently reproduced.', failureText: 'A sample that never reaches an independent lab becomes another frontier claim rumor.', recoveryText: 'Veil keeps the assay window open for the retained control cut.', successImpulse: Object.freeze({ danger: -0.04, pricePressure: -0.045 }), failureImpulse: Object.freeze({ danger: 0.035, pricePressure: 0.03 }) }),
    ],
  }),
]);

export const CAREER_CONTRACT_BY_ID = Object.freeze(Object.fromEntries(
  REPEATABLE_CAREER_CONTRACTS.map((entry) => [entry.id, entry]),
));

export function careerContractsFor(careerId) {
  return REPEATABLE_CAREER_CONTRACTS.filter((entry) => entry.careerId === careerId);
}

export function validateCareerContractCatalog() {
  const errors = [];
  const ids = new Set();
  for (const entry of REPEATABLE_CAREER_CONTRACTS) {
    if (!entry.id || ids.has(entry.id)) errors.push(`duplicate/missing contract id ${entry.id}`);
    ids.add(entry.id);
    if (!CAREER_CONTRACT_IDS.includes(entry.careerId)) errors.push(`${entry.id}: invalid career`);
    if (!entry.actor?.id || !entry.actor?.name || !entry.actor?.motive) errors.push(`${entry.id}: actor/motive missing`);
    if (!entry.skillExpression || !entry.failure?.consequence || !entry.failure?.recovery || !entry.consequence) errors.push(`${entry.id}: outcome contract incomplete`);
    if (!Array.isArray(entry.stages) || entry.stages.length !== 3) errors.push(`${entry.id}: must have exactly three stages`);
    for (const part of entry.stages || []) {
      if (!part.id || !part.title || !part.type || !part.boardStationId || !part.destSectorId) errors.push(`${entry.id}/${part.id}: route shape incomplete`);
      if (!part.instruction || !part.failureText || !part.recoveryText) errors.push(`${entry.id}/${part.id}: action/failure/recovery copy missing`);
      if (!part.params || !Number.isFinite(part.rewardCr) || !Number.isFinite(part.riskTier)) errors.push(`${entry.id}/${part.id}: params/reward/risk missing`);
    }
  }
  for (const careerId of CAREER_CONTRACT_IDS) {
    const rows = careerContractsFor(careerId);
    if (rows.length !== 3) errors.push(`${careerId}: expected three contracts, got ${rows.length}`);
    const sequences = new Set(rows.map((entry) => entry.stages.map((part) => part.type).join('>')));
    if (sequences.size !== rows.length) errors.push(`${careerId}: repeated generic stage sequence`);
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors), contracts: ids.size, stages: REPEATABLE_CAREER_CONTRACTS.reduce((sum, entry) => sum + entry.stages.length, 0) });
}

export default REPEATABLE_CAREER_CONTRACTS;
