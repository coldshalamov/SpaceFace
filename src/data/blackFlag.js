// BLACK FLAG: authored encounter inputs. The shipjack runtime owns materialization and
// custody; missions owns contracts and rewards. No callback or parallel reward engine here.
export const BLACK_FLAG_CONTACTS = Object.freeze({
  mara: Object.freeze({ id: 'captain_mara_venn', name: 'Mara Venn', stationId: 'station_helios', role: 'Recovery registrar',
    offer: 'Empty Seat is still drifting. Bring the bridge home. The family can replace the cargo.',
    returned: 'That is her frame mark. Crew accounted for; the recovery is on record.',
    stolen: 'Possession is a fact. Title is a promise. You have the first one.' }),
  oriel: Object.freeze({ id: 'fence_oriel_pask', name: 'Oriel Pask', stationId: 'station_smuggler', role: 'Fixer',
    offer: 'A clean controller is worth more than a dirty ship. Decide which trouble you are carrying.',
    returned: 'You gave it back? Fine. Some debts pay in doors.',
    stolen: 'The broadcast can lie. The engine cannot. Keep that distinction in mind.' }),
  holt: Object.freeze({ id: 'inspector_sera_holt', name: 'Sera Holt', stationId: 'station_customs', role: 'Registry inspector',
    offer: 'I can authorize one recovery. One frame, one destination. It is not a license to hunt the lane.',
    returned: 'Frame received. Claim closed. Tell the next patrol to read the receipt.',
    stolen: 'Your broadcast says courier. Your drive says Blackbird. Cut thrust and explain.' }),
});

export const BLACK_FLAG_YARDS = Object.freeze([
  Object.freeze({ stationId: 'station_helios', sectorId: 'sector_helios_prime', name: 'Helios Recovery Berth', kind: 'lawful', contactId: BLACK_FLAG_CONTACTS.mara.id }),
  Object.freeze({ stationId: 'station_forge', sectorId: 'sector_vesta_forge', name: 'Forge Reclamation Slip', kind: 'lawful', contactId: BLACK_FLAG_CONTACTS.mara.id }),
  Object.freeze({ stationId: 'station_tethys', sectorId: 'sector_tethys_junction', name: 'Junction Recovery Berth', kind: 'authority', contactId: BLACK_FLAG_CONTACTS.holt.id }),
  Object.freeze({ stationId: 'station_smuggler', sectorId: 'sector_pallas_drift', name: 'Pask’s Hot Berth', kind: 'illicit', contactId: BLACK_FLAG_CONTACTS.oriel.id, fenceId: 'fence_oriel_pask' }),
]);

// Coordinates are offsets from a real materialized POI (or the named receiver if that
// POI has not materialized). They are never assumed to be global universe coordinates.
// Fitted ids are canonical modules/weapons; runtime installs them through ships' slot rules.
export const BLACK_FLAG_ENCOUNTERS = Object.freeze([
  Object.freeze({ id: 'black_flag_empty_seat', act: 1, name: 'Empty Seat',
    sectorId: 'sector_helios_prime', stationId: 'station_helios', anchorPoiId: 'poi_helios_lane_pin', offset: { x: 90, z: 75 },
    defId: 'ship_mule', factionId: 'faction_mts', ownerId: 'captain_mara_venn', profile: 'civilian_cooperative',
    disabled: true, crew: 'evacuated', condition: 0.68, legalCategory: 'recovery', returnReward: 950,
    fitted: ['mod_engine_ion_m', 'mod_cargo_pod_m', 'mod_cargo_scanner_s'],
    objective: 'Scan Empty Seat; steady its drift with Massline. Bring it to Helios, or take custody and keep its claim.',
    intro: 'Mara Venn: Empty Seat lost drive on the lane. Crew got clear. Tow her slowly; the frame is still sound.',
    failure: 'The ship is gone. Its registry and last trajectory remain in the ledger.' }),
  Object.freeze({ id: 'black_flag_blackbird', act: 2, name: 'Blackbird',
    sectorId: 'sector_tethys_junction', stationId: 'station_tethys', anchorPoiId: 'poi_tethys_weigh', offset: { x: 110, z: -80 },
    defId: 'ship_hornet', factionId: 'faction_mts', ownerId: 'corporate_blackbird_registry', profile: 'corporate_locked',
    disabled: false, crew: 'stubborn', condition: 0.94, legalCategory: 'registered', returnReward: 2400,
    fitted: ['wpn_pulse_laser_m', 'unique_blackbird_governor', 'mod_shield_capacitor_m', 'mod_cargo_scanner_s'],
    objective: 'Read Blackbird’s signal. Negotiate, isolate its drive, or exploit an exposed port. Its title will remain corporate.',
    intro: 'Oriel Pask: Blackbird is passing the weigh slip. Fast drive, slow paperwork. I am buying either.',
    failure: 'Blackbird’s departure closes the ambush. A recorded signature still identifies the frame.' }),
  Object.freeze({ id: 'black_flag_second_measure', act: 1, name: 'Second Measure',
    sectorId: 'sector_ceres_belt', stationId: 'station_ceres', anchorPoiId: 'world_site_ceres_second_measure', offset: { x: 95, z: -60 },
    defId: 'ship_pelican', factionId: 'faction_dmc', ownerId: 'ceres_shift_cooperative', profile: 'civilian_cooperative',
    disabled: true, crew: 'aboard', condition: 0.43, legalCategory: 'recovery', returnReward: 1250,
    fitted: ['mod_engine_ion_m', 'mod_mining_laser_s', 'mod_cargo_scanner_s'],
    objective: 'Guarantee safe passage, then recover the miner intact. Pulling its drive leaves a stranded shell.',
    intro: 'Second Measure: We have people aboard. You want the machine, first tell us where we go.',
    failure: 'The hull can be lost without losing the crew’s testimony.' }),
  Object.freeze({ id: 'black_flag_writ_of_return', act: 3, name: 'Writ of Return',
    sectorId: 'sector_io_reach', stationId: 'station_reach', anchorPoiId: 'poi_merc', offset: { x: -125, z: 70 },
    defId: 'ship_wasp', factionId: 'faction_reach', ownerId: 'reach_claimant_17', profile: 'pirate_improvised',
    disabled: false, crew: 'pragmatic', condition: 0.77, legalCategory: 'warrant', returnReward: 1800,
    fitted: ['wpn_autocannon_s', 'mod_engine_ion_m', 'mod_sensor_scrambler_s'],
    objective: 'Invoke the frame-specific warrant or secure the craft by force. Deliver the disputed frame to Reach.',
    intro: 'Sera Holt: The writ names a Wasp, not every pirate in Io. Let the pilot surrender.',
    failure: 'A destroyed frame leaves evidence; it cannot satisfy intact recovery.' }),
  Object.freeze({ id: 'black_flag_cold_logic', act: 3, name: 'Cold Logic',
    sectorId: 'sector_vesta_forge', stationId: 'station_forge', anchorPoiId: 'poi_freighter', offset: { x: -110, z: -85 },
    defId: 'ship_drifter', factionId: 'faction_dmc', ownerId: 'forge_automation_pool', profile: 'derelict_autonomous',
    disabled: true, crew: 'automated', condition: 0.52, legalCategory: 'salvage', returnReward: 1350,
    fitted: ['mod_engine_fusion_m', 'mod_cargo_scanner_s', 'mod_shield_booster_s'],
    objective: 'Isolate emergency power before claiming the autonomous hull. Preserve its controller or return the whole craft.',
    intro: 'Forge control: Cold Logic keeps rebooting. No crew. Plenty of stored charge. Do not cut a live bus.',
    failure: 'A scorched controller is still evidence, and a poorer part.' }),
  Object.freeze({ id: 'black_flag_claim_war', act: 4, name: 'Little Mercy',
    sectorId: 'sector_pallas_drift', stationId: 'station_smuggler', anchorPoiId: 'poi_pwreck', offset: { x: 105, z: 60 },
    defId: 'ship_hawser', factionId: 'faction_quiet', ownerId: 'pallas_salvage_claimants', profile: 'pirate_improvised',
    disabled: true, crew: 'pragmatic', condition: 0.61, legalCategory: 'disputed', returnReward: 1650,
    fitted: ['mod_tractor_beam_m', 'mod_engine_fusion_m', 'mod_cargo_scanner_s'],
    objective: 'Read the frame record before accepting either claim. Return the tug, keep disputed custody, or sell to Pask.',
    intro: 'Oriel Pask: Two owners, one tug. Before you choose which story to sell, read what is stamped under the paint.',
    failure: 'Neither claimant owns the truth just because the hull is gone.' }),
]);

export const BLACK_FLAG_ENCOUNTER_BY_ID = new Map(BLACK_FLAG_ENCOUNTERS.map(row => [row.id, row]));
export const BLACK_FLAG_YARD_BY_STATION = new Map(BLACK_FLAG_YARDS.map(row => [row.stationId, row]));

/** Human terms shared by flight and station presentation. Custody is deliberately separate
 * from title: flying a ship does not promise that an honest yard will buy it. */
export const BLACK_FLAG_TERMS = Object.freeze({
  provisional: 'Provisional custody — title unresolved', hot: 'Stolen registry — honest sale refused',
  clean: 'Registered title', disputed: 'Contested title', salvage: 'Salvage claim pending',
  recovery: 'Owner’s property — return for recovery fee', impounded: 'Authority hold — resolve at registry',
  returned: 'Returned to registered owner', sold: 'Custody released to buyer',
});
