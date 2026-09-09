// Post-ending replay chains: one authored, branching three-mission loop per ending plus sandbox.
// Pure data. Endings own disposition truth; missions own contract execution and payouts.

import { ENDING_IDS, SANDBOX_ID, endingDef } from '../story/endings/endingDefs.js';

export const POST_ENDING_REPLAY_SCHEMA_VERSION = 1;
export const POST_ENDING_REPLAY_SOURCE = 'postEndingReplay';

function stage(input) {
  return Object.freeze({
    collateralCr: 0,
    preloadedCargo: false,
    params: Object.freeze({}),
    ...input,
  });
}

function branch(input) {
  return Object.freeze({ ...input, consequence: Object.freeze(input.consequence), mission: stage(input.mission), finale: stage(input.finale) });
}

function chain(input) {
  return Object.freeze({ ...input, actor: Object.freeze(input.actor), opening: stage(input.opening), branches: Object.freeze(input.branches.map(branch)) });
}

export const POST_ENDING_REPLAY_CHAINS = Object.freeze([
  chain({
    id: 'replay_auxiliary_watch', choiceId: 'A', replayHookId: 'post47a_auxiliary_patrols',
    title: 'Auxiliary Watch Rotation',
    actor: { id: 'actor_sena_voss', name: 'Auxiliary Controller Sena Voss', motive: 'Concord gave you a clean record and now expects your badge to decide whose safety counts.' },
    durablePremise: 'The player is now part of the institution; every rotation chooses protection or coercion.',
    choicePrompt: 'Report to Ceres to shield civilian capacity, or Coalition HQ to enforce a punitive screen.',
    opening: { id: 'audit_the_badge', title: 'Audit the New Badge', type: 'recon_scan', boardStationId: 'station_coalition', destSectorId: 'sector_tethys_junction', factionId: 'faction_scn', riskTier: 2, rewardCr: 760, params: Object.freeze({ scanTargets: 3 }), instruction: 'Scan three Tethys contacts and separate lawful congestion from the route complaint that triggered this watch.', failureText: 'A blind response turns a traffic complaint into collective punishment.', recoveryText: 'Voss keeps the watch open and narrows the contact list.' },
    branches: [
      { id: 'shield', label: 'Shield the Route', tradeoff: 'Lower danger and prices by protecting civilian capacity; accept the burden of escort.', consequence: { sectorId: 'sector_vesta_forge', danger: -0.055, pricePressure: -0.035, worldFlag: 'auxiliary_protection_doctrine' }, mission: { id: 'escort_relief_hulls', title: 'Escort the Relief Hulls', type: 'escort', boardStationId: 'station_ceres', destStationId: 'station_forge', destSectorId: 'sector_vesta_forge', factionId: 'faction_scn', riskTier: 3, rewardCr: 1240, params: Object.freeze({ targetStrength: 1.35 }), instruction: 'Form on the Ceres relief hulls and keep them intact to Forge Foundry.', failureText: 'The badge protects paper while civilian route capacity burns.', recoveryText: 'Ceres launches a slower reserve convoy on the same protection order.' }, finale: { id: 'carry_witness_home', title: 'Carry the Convoy Witness Home', type: 'passenger_transport', boardStationId: 'station_forge', destStationId: 'station_coalition', destSectorId: 'sector_helios_prime', factionId: 'faction_scn', riskTier: 2, rewardCr: 940, instruction: 'Carry the convoy dispatcher to Coalition HQ so protection, not kill count, closes the watch.', failureText: 'Without testimony the escort becomes another unverifiable patrol claim.', recoveryText: 'The dispatcher waits at Forge under a new travel identity.' } },
      { id: 'sanction', label: 'Sanction the Route', tradeoff: 'Suppress danger harder but raise commercial pressure through seizures and force.', consequence: { sectorId: 'sector_hyperion_cut', danger: -0.08, pricePressure: 0.025, worldFlag: 'auxiliary_sanction_doctrine' }, mission: { id: 'clear_the_cut', title: 'Impose the Hyperion Sanction', type: 'patrol_clear', boardStationId: 'station_coalition', destSectorId: 'sector_hyperion_cut', factionId: 'faction_scn', riskTier: 3, rewardCr: 1460, params: Object.freeze({ clearCount: 3, targetStrength: 1.45 }), instruction: 'Clear only the three marked sanction targets in Hyperion Cut; unmarked freight remains lawful.', failureText: 'The failed sanction emboldens the marked cell and frightens neutral carriers.', recoveryText: 'Voss revalidates the three warrants before another deployment.' }, finale: { id: 'return_seizure_cores', title: 'Return the Seizure Cores', type: 'cargo_delivery', boardStationId: 'station_hyperion_cut', destStationId: 'station_coalition', destSectorId: 'sector_helios_prime', factionId: 'faction_scn', riskTier: 2, rewardCr: 1020, collateralCr: 220, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_salvage_electronics', qty: 3 }), instruction: 'Carry three tagged seizure cores to Coalition HQ so the sanction remains auditable.', failureText: 'A sanction without evidence becomes indistinguishable from confiscation.', recoveryText: 'Hyperion technicians image a second evidentiary set.' } },
    ],
  }),
  chain({
    id: 'replay_quiet_manifest', choiceId: 'B', replayHookId: 'post47a_quiet_routes',
    title: 'Quiet Manifest Rotation',
    actor: { id: 'actor_channel_zero', name: 'CHANNEL ZERO', motive: 'Your public identity is gone; the routing desk now tests whether anonymity serves people or only throughput.' },
    durablePremise: 'The player is a hidden routing channel whose invisible choices reshape supply and risk.',
    choicePrompt: 'Take the clean relief channel through Nereid, or the profitable black channel through Sker.',
    opening: { id: 'move_the_unlisted_clerk', title: 'Move the Unlisted Clerk', type: 'passenger_transport', boardStationId: 'station_drift', destStationId: 'station_nyx_march', destSectorId: 'sector_nyx_march', factionId: 'faction_free', riskTier: 2, rewardCr: 860, instruction: 'Move an unlisted routing clerk from Drift Market to the Nyx Fence without attaching your former name.', failureText: 'The clerk is indexed and the quiet channel acquires a public owner.', recoveryText: 'CHANNEL ZERO rotates the clerk to another anonymous berth.' },
    branches: [
      { id: 'clean_channel', label: 'Run the Clean Channel', tradeoff: 'Move medicine openly enough to help Nereid while preserving the channel.', consequence: { sectorId: 'sector_nereid_shoal', danger: -0.02, pricePressure: -0.055, worldFlag: 'quiet_channel_relief' }, mission: { id: 'route_nereid_medicine', title: 'Route Nereid Medicine', type: 'cargo_delivery', boardStationId: 'station_nereid', destStationId: 'station_dione', destSectorId: 'sector_dione_lane', factionId: 'faction_free', riskTier: 3, rewardCr: 1320, collateralCr: 260, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_medical', qty: 8 }), instruction: 'Take the clean-channel handoff at Nereid and carry eight units of medical supplies to Dione Exchange.', failureText: 'Dione loses the relief lot and the channel becomes an empty abstraction.', recoveryText: 'Nereid issues a smaller replacement lot with the same anonymous custody.' }, finale: { id: 'return_blind_receipts', title: 'Return the Blind Receipts', type: 'cargo_delivery', boardStationId: 'station_dione', destStationId: 'station_drift', destSectorId: 'sector_pallas_drift', factionId: 'faction_free', riskTier: 2, rewardCr: 980, collateralCr: 140, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_microchips', qty: 3 }), instruction: 'Return three blind receipt chips to Drift Market without exposing the recipients.', failureText: 'Lost receipts leave the relief route vulnerable to tracing and extortion.', recoveryText: 'Dione rekeys the receipt chips for another return.' } },
      { id: 'black_channel', label: 'Run the Black Channel', tradeoff: 'Earn stronger price relief through contraband flow while increasing predation risk.', consequence: { sectorId: 'sector_sker_haven', danger: 0.035, pricePressure: -0.075, worldFlag: 'quiet_channel_blackflow' }, mission: { id: 'route_sker_cores', title: 'Route the Unregistered Cores', type: 'smuggling_run', boardStationId: 'station_nyx_march', destStationId: 'station_sker', destSectorId: 'sector_sker_haven', factionId: 'faction_free', riskTier: 4, rewardCr: 1840, collateralCr: 360, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_classified_salvage', qty: 3 }), instruction: 'Carry three unregistered routing cores from Nyx to Sker Bazaar; a patrol scan burns the channel.', failureText: 'The black route becomes evidence tied to the identity you erased.', recoveryText: 'CHANNEL ZERO splits the surviving image across a new three-core lot.' }, finale: { id: 'wash_the_route_keys', title: 'Wash the Route Keys', type: 'cargo_delivery', boardStationId: 'station_sker', destStationId: 'station_drift', destSectorId: 'sector_pallas_drift', factionId: 'faction_free', riskTier: 3, rewardCr: 1180, collateralCr: 180, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_electronics', qty: 4 }), instruction: 'Carry four washed route-key boards back to Drift Market before Sker can duplicate them.', failureText: 'Duplicated keys turn your channel into a pirate toll map.', recoveryText: 'Sker offers a second washed set at reduced trust and pay.' } },
    ],
  }),
  chain({
    id: 'replay_return_circuit', choiceId: 'C', replayHookId: 'post47a_loop_cartography',
    title: 'Return Circuit Survey',
    actor: { id: 'actor_echo_47', name: 'ECHO 47', motive: 'The loop returned you to the same frontier; the only choice left is whether to understand the recurrence or exploit it.' },
    durablePremise: 'The wormhole did not escape the world; repeated landmarks can become knowledge or arbitrage.',
    choicePrompt: 'Measure the recurrence through Veil, or sell the timing through Tethys.',
    opening: { id: 'scan_the_return_scar', title: 'Scan the Return Scar', type: 'recon_scan', boardStationId: 'station_ashcache', destSectorId: 'sector_ashfall_reach', factionId: 'faction_free', riskTier: 4, rewardCr: 1040, params: Object.freeze({ scanTargets: 4 }), instruction: 'Scan four Ashfall signatures and identify which landmark repeated after the wormhole return.', failureText: 'The recurrence decays into ordinary Ashfall noise.', recoveryText: 'ECHO 47 retains the last stable landmark and reopens the scan.' },
    branches: [
      { id: 'measure', label: 'Measure the Loop', tradeoff: 'Reduce anomaly danger by sharing calibration instead of monetizing the timing.', consequence: { sectorId: 'sector_veil_nebula', danger: -0.045, pricePressure: -0.01, worldFlag: 'loop_measured' }, mission: { id: 'compare_veil_echoes', title: 'Compare the Veil Echoes', type: 'recon_scan', boardStationId: 'station_veil', destSectorId: 'sector_veil_nebula', factionId: 'faction_dmc', riskTier: 4, rewardCr: 1520, params: Object.freeze({ scanTargets: 4 }), instruction: 'Scan four Veil pockets and compare their timing against the Ashfall return landmark.', failureText: 'Without a second region the recurrence remains a story, not a measurement.', recoveryText: 'Veil preserves the Ashfall baseline for another comparison pass.' }, finale: { id: 'deliver_loop_calibration', title: 'Deliver the Loop Calibration', type: 'cargo_delivery', boardStationId: 'station_veil', destStationId: 'station_helios', destSectorId: 'sector_helios_prime', factionId: 'faction_dmc', riskTier: 3, rewardCr: 1240, collateralCr: 240, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_quantum_cores', qty: 2 }), instruction: 'Carry two calibration cores from Veil to Helios so the loop becomes public navigation knowledge.', failureText: 'Lost calibration leaves the loop private and unverifiable.', recoveryText: 'Veil can encode one replacement pair from the retained scan.' } },
      { id: 'exploit', label: 'Exploit the Loop', tradeoff: 'Ease prices through early routing while increasing the danger of a privately held timing edge.', consequence: { sectorId: 'sector_tethys_junction', danger: 0.025, pricePressure: -0.065, worldFlag: 'loop_exploited' }, mission: { id: 'move_the_timing_broker', title: 'Move the Timing Broker', type: 'passenger_transport', boardStationId: 'station_tethys', destStationId: 'station_drift', destSectorId: 'sector_pallas_drift', factionId: 'faction_free', riskTier: 3, rewardCr: 1340, instruction: 'Carry the timing broker from Tethys to Drift Market before public charts catch up.', failureText: 'The broker vanishes with the only buyer list for the recurrence.', recoveryText: 'Tethys rotates a second broker through an unlisted berth.' }, finale: { id: 'sell_the_return_window', title: 'Sell the Return Window', type: 'smuggling_run', boardStationId: 'station_drift', destStationId: 'station_nyx_march', destSectorId: 'sector_nyx_march', factionId: 'faction_free', riskTier: 4, rewardCr: 1760, collateralCr: 320, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_classified_salvage', qty: 2 }), instruction: 'Carry two encrypted return-window records to Nyx without a patrol scan.', failureText: 'A scan makes the timing edge public before the route can exploit it.', recoveryText: 'Drift retained a narrower window for one replacement run.' } },
    ],
  }),
  chain({
    id: 'replay_witness_archive', choiceId: 'D', replayHookId: 'post47a_witness_archive',
    title: 'Witness Archive Circuit',
    actor: { id: 'actor_desk_current', name: 'THE CURRENT DESK', motive: 'You stayed to witness; the desk now asks whether truth should be public record or protected memory.' },
    durablePremise: 'The player is Ashfall’s witness and must choose exposure against protection.',
    choicePrompt: 'Publish the evidence through Coalition channels, or shelter the witness through Nereid.',
    opening: { id: 'index_the_new_wreck', title: 'Index the New Wreck', type: 'recon_scan', boardStationId: 'station_ashcache', destSectorId: 'sector_ashfall_reach', factionId: 'faction_free', riskTier: 3, rewardCr: 900, params: Object.freeze({ scanTargets: 3 }), instruction: 'Scan three Ashfall wreck signatures and identify the one whose loss record was deliberately erased.', failureText: 'The erased loss merges with the field and the desk fails its witness.', recoveryText: 'The ledger preserves two coordinates and reopens the missing third.' },
    branches: [
      { id: 'publish', label: 'Publish the Record', tradeoff: 'Reduce danger through public attribution while increasing institutional pressure around Ashfall.', consequence: { sectorId: 'sector_ashfall_reach', danger: -0.055, pricePressure: 0.015, worldFlag: 'witness_record_published' }, mission: { id: 'bring_the_examiner', title: 'Bring the Independent Examiner', type: 'passenger_transport', boardStationId: 'station_coalition', destStationId: 'station_ashcache', destSectorId: 'sector_ashfall_reach', factionId: 'faction_scn', riskTier: 3, rewardCr: 1120, instruction: 'Choose publication at Coalition HQ, then carry an independent examiner to Ash Cache Station.', failureText: 'Publication without inspection becomes another remote administrative claim.', recoveryText: 'Coalition assigns a second examiner under civilian credentials.' }, finale: { id: 'carry_verified_extract', title: 'Carry the Verified Archive Extract', type: 'cargo_delivery', boardStationId: 'station_ashcache', destStationId: 'station_coalition', destSectorId: 'sector_helios_prime', factionId: 'faction_scn', riskTier: 3, rewardCr: 1360, collateralCr: 280, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_classified_salvage', qty: 2 }), instruction: 'Carry two examiner-signed archive extracts from Ashfall to Coalition HQ for public attribution.', failureText: 'A lost extract lets the institution deny that the erased crew existed.', recoveryText: 'The desk signs a second extract against the persistent ledger.' } },
      { id: 'protect', label: 'Protect the Witness', tradeoff: 'Preserve a living source and reduce local danger without creating a public institutional claim.', consequence: { sectorId: 'sector_nereid_shoal', danger: -0.035, pricePressure: -0.015, worldFlag: 'witness_record_sheltered' }, mission: { id: 'move_the_living_witness', title: 'Move the Living Witness', type: 'passenger_transport', boardStationId: 'station_ashcache', destStationId: 'station_nereid', destSectorId: 'sector_nereid_shoal', factionId: 'faction_free', riskTier: 3, rewardCr: 1280, instruction: 'Carry the erased crew’s surviving witness from Ashfall to Nereid Waystation without filing a public passenger name.', failureText: 'The witness disappears and the private archive becomes hearsay.', recoveryText: 'The desk moves the witness to a secondary Ashfall berth.' }, finale: { id: 'verify_shelter_trail', title: 'Verify the Shelter Trail', type: 'recon_scan', boardStationId: 'station_nereid', destSectorId: 'sector_nereid_shoal', factionId: 'faction_free', riskTier: 2, rewardCr: 980, params: Object.freeze({ scanTargets: 3 }), instruction: 'Scan three Nereid handoff points and verify the witness trail is intact but not publicly indexed.', failureText: 'An unverified shelter trail can hide either safety or another disappearance.', recoveryText: 'Nereid preserves the first two handoffs for a clean verification pass.' } },
    ],
  }),
  chain({
    id: 'replay_contract_47b', choiceId: 'E', replayHookId: 'post47a_next_manifest',
    title: 'Contract 47-B Rotation',
    actor: { id: 'actor_broker_47b', name: 'BROKER DESK 47-B', motive: 'You took the next run; the new manifest already contains another discrepancy and another choice to ignore it.' },
    durablePremise: 'The working pilot can audit the next lie or keep the route moving for thin coin.',
    choicePrompt: 'Audit the discrepancy at Tethys, or escort the manifest onward to Vesta.',
    opening: { id: 'carry_manifest_47b', title: 'Carry Manifest 47-B', type: 'cargo_delivery', boardStationId: 'station_ashcache', destStationId: 'station_tethys', destSectorId: 'sector_tethys_junction', factionId: 'faction_mts', riskTier: 3, rewardCr: 1280, collateralCr: 260, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_refined_metals', qty: 8 }), instruction: 'Carry eight units under Manifest 47-B from Ashfall to Tethys Trade Hub and preserve the recorded mass.', failureText: 'The replacement manifest closes without a surviving comparison load.', recoveryText: 'Ash Cache issues another eight-unit reference lot under the same file.' },
    branches: [
      { id: 'audit', label: 'Audit the Discrepancy', tradeoff: 'Expose the new mass discrepancy, reducing danger but slowing the market.', consequence: { sectorId: 'sector_tethys_junction', danger: -0.045, pricePressure: 0.02, worldFlag: 'manifest_47b_audited' }, mission: { id: 'scan_47b_handoffs', title: 'Scan the 47-B Handoffs', type: 'recon_scan', boardStationId: 'station_customs', destSectorId: 'sector_tethys_junction', factionId: 'faction_mts', riskTier: 3, rewardCr: 1160, params: Object.freeze({ scanTargets: 3 }), instruction: 'Choose audit at Customs Gate, then scan the three 47-B handoff points and locate the mass change.', failureText: 'The discrepancy enters the ledger as acceptable transit loss.', recoveryText: 'Customs preserves the reference mass for another handoff scan.' }, finale: { id: 'deliver_47b_audit', title: 'Deliver the 47-B Audit', type: 'cargo_delivery', boardStationId: 'station_customs', destStationId: 'station_coalition', destSectorId: 'sector_helios_prime', factionId: 'faction_scn', riskTier: 2, rewardCr: 1080, collateralCr: 180, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_microchips', qty: 3 }), instruction: 'Carry three signed audit chips to Coalition HQ before the manifest is rewritten again.', failureText: 'Without the chips, 47-B becomes another allegation without custody.', recoveryText: 'Customs signs one replacement audit set from the preserved scans.' } },
      { id: 'deliver', label: 'Take the Next Coin', tradeoff: 'Keep supply moving and prices lower while leaving the discrepancy unresolved.', consequence: { sectorId: 'sector_vesta_forge', danger: -0.02, pricePressure: -0.055, worldFlag: 'manifest_47b_delivered' }, mission: { id: 'escort_47b_onward', title: 'Escort 47-B Onward', type: 'escort', boardStationId: 'station_tethys', destStationId: 'station_forge', destSectorId: 'sector_vesta_forge', factionId: 'faction_mts', riskTier: 3, rewardCr: 1420, params: Object.freeze({ targetStrength: 1.4 }), instruction: 'Escort the 47-B carrier from Tethys to Forge Foundry without reopening its manifest.', failureText: 'The carrier loss turns the ignored discrepancy into a route shortage.', recoveryText: 'Tethys launches a reserve carrier against the same closed manifest.' }, finale: { id: 'return_47b_receipt', title: 'Return the Thin Receipt', type: 'cargo_delivery', boardStationId: 'station_forge', destStationId: 'station_ashcache', destSectorId: 'sector_ashfall_reach', factionId: 'faction_mts', riskTier: 3, rewardCr: 980, collateralCr: 160, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_electronics', qty: 3 }), instruction: 'Carry three settlement boards back to Ashfall and close 47-B without a title.', failureText: 'The route moved, but the missing receipt leaves payment and cause unresolved.', recoveryText: 'Forge images another thin receipt from the delivered carrier.' } },
    ],
  }),
  chain({
    id: 'replay_open_frontier', choiceId: SANDBOX_ID, replayHookId: 'post47a_open_frontier',
    title: 'Open Frontier Circuit',
    actor: { id: 'actor_self_directed', name: 'OPEN FRONTIER', motive: 'No disposition owns you; the next durable mark is the route you choose to build or map.' },
    durablePremise: 'The sandbox is not an ending package; the player authors a practical frontier consequence.',
    choicePrompt: 'Build a civilian route through Dione, or map the unknown through Veil.',
    opening: { id: 'carry_the_cartographer', title: 'Carry the Independent Cartographer', type: 'passenger_transport', boardStationId: 'station_helios', destStationId: 'station_tethys', destSectorId: 'sector_tethys_junction', factionId: 'faction_free', riskTier: 2, rewardCr: 760, instruction: 'Carry an independent cartographer from Helios to Tethys and choose which frontier question they pursue.', failureText: 'The open route begins without a witness or a chart.', recoveryText: 'Helios assigns another independent cartographer without filing a disposition.' },
    branches: [
      { id: 'build', label: 'Build a Civilian Route', tradeoff: 'Lower prices and danger by proving a repeatable Dione supply circuit.', consequence: { sectorId: 'sector_dione_lane', danger: -0.04, pricePressure: -0.06, worldFlag: 'open_frontier_route_built' }, mission: { id: 'supply_ceres_from_dione', title: 'Build the Dione-Ceres Route', type: 'cargo_delivery', boardStationId: 'station_dione', destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt', factionId: 'faction_mts', riskTier: 2, rewardCr: 1060, collateralCr: 180, preloadedCargo: true, params: Object.freeze({ cmdtyId: 'cmdty_food', qty: 10 }), instruction: 'Choose route-building at Dione, then carry ten units of provisions to Ceres Refinery.', failureText: 'The proposed civilian route fails its first practical load.', recoveryText: 'Dione releases a replacement proof load with the route still unfiled.' }, finale: { id: 'escort_ceres_return', title: 'Escort the Ceres Return', type: 'escort', boardStationId: 'station_ceres', destStationId: 'station_dione', destSectorId: 'sector_dione_lane', factionId: 'faction_mts', riskTier: 2, rewardCr: 1180, params: Object.freeze({ targetStrength: 1.25 }), instruction: 'Escort the Ceres return hull to Dione Exchange so the route proves two-way capacity.', failureText: 'A one-way delivery is charity, not a durable frontier route.', recoveryText: 'Ceres launches a lighter return hull for another proof.' } },
      { id: 'map', label: 'Map the Unknown', tradeoff: 'Reduce anomaly danger and reveal resources without creating a fixed commercial lane.', consequence: { sectorId: 'sector_veil_nebula', danger: -0.035, pricePressure: -0.01, worldFlag: 'open_frontier_unknown_mapped' }, mission: { id: 'scan_veil_frontier', title: 'Map the Veil Frontier', type: 'recon_scan', boardStationId: 'station_veil', destSectorId: 'sector_veil_nebula', factionId: 'faction_dmc', riskTier: 3, rewardCr: 1180, params: Object.freeze({ scanTargets: 4 }), instruction: 'Choose mapping at Veil, then scan four pockets selected by the independent cartographer.', failureText: 'The uncharted pockets remain rumor and navigational danger.', recoveryText: 'The cartographer retains the first stable bearings for another survey.' }, finale: { id: 'sample_veil_gas', title: 'Sample the Open Veil', type: 'mining_quota', boardStationId: 'station_veil', destSectorId: 'sector_veil_nebula', factionId: 'faction_dmc', riskTier: 3, rewardCr: 1320, params: Object.freeze({ cmdtyId: 'cmdty_gas_hydrogen', qty: 8 }), instruction: 'Extract eight units of hydrogen from the mapped pocket to prove the chart describes a usable place.', failureText: 'A chart without a physical sample remains an untested frontier story.', recoveryText: 'Veil preserves the mapped pocket for another controlled sample.' } },
    ],
  }),
]);

export const POST_ENDING_REPLAY_BY_CHOICE = Object.freeze(Object.fromEntries(
  POST_ENDING_REPLAY_CHAINS.map((entry) => [entry.choiceId, entry]),
));

export function postEndingReplayChain(choiceId) {
  return POST_ENDING_REPLAY_BY_CHOICE[choiceId] || null;
}

export function validatePostEndingReplayChains() {
  const errors = [];
  const expected = [...ENDING_IDS, SANDBOX_ID];
  const ids = new Set();
  const hooks = new Set();
  for (const def of POST_ENDING_REPLAY_CHAINS) {
    if (!def.id || ids.has(def.id)) errors.push(`duplicate/missing chain id ${def.id}`);
    ids.add(def.id);
    if (!expected.includes(def.choiceId)) errors.push(`${def.id}: unknown choice ${def.choiceId}`);
    const ending = endingDef(def.choiceId);
    if (!ending || ending.continuity?.replayHookId !== def.replayHookId) errors.push(`${def.id}: replay hook drift`);
    if (hooks.has(def.replayHookId)) errors.push(`${def.id}: duplicate replay hook`);
    hooks.add(def.replayHookId);
    if (!def.actor?.name || !def.actor?.motive || !def.durablePremise || !def.choicePrompt) errors.push(`${def.id}: identity/premise/choice missing`);
    if (!def.opening?.id || !def.opening?.instruction) errors.push(`${def.id}: opening missing`);
    if (!Array.isArray(def.branches) || def.branches.length !== 2) errors.push(`${def.id}: exactly two branches required`);
    const branchIds = new Set();
    for (const option of def.branches || []) {
      if (!option.id || branchIds.has(option.id)) errors.push(`${def.id}: duplicate/missing branch`);
      branchIds.add(option.id);
      if (!option.label || !option.tradeoff || !option.consequence?.worldFlag) errors.push(`${def.id}/${option.id}: choice consequence incomplete`);
      for (const part of [option.mission, option.finale]) {
        if (!part?.id || !part?.type || !part?.boardStationId || !part?.destSectorId) errors.push(`${def.id}/${option.id}: mission route incomplete`);
        if (!part?.instruction || !part?.failureText || !part?.recoveryText) errors.push(`${def.id}/${option.id}: action/recovery copy incomplete`);
      }
    }
  }
  for (const choiceId of expected) if (!POST_ENDING_REPLAY_BY_CHOICE[choiceId]) errors.push(`missing choice chain ${choiceId}`);
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors), chains: ids.size, playableRoutes: POST_ENDING_REPLAY_CHAINS.reduce((sum, entry) => sum + entry.branches.length, 0) });
}

export default POST_ENDING_REPLAY_CHAINS;
