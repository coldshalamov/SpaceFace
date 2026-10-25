import { defineFlavorPack } from './catalog.js';

export const flavorOrder = 100;
export const flavorId = 'rim_poi_lore';
export const flavorKind = 'scan_lore';

export default defineFlavorPack({
  id: flavorId,
  kind: flavorKind,
  description: 'Short scan lore for densified rim and junction POIs on the existing 24-sector graph.',
  entries: [
    {
      id: 'tethys_weigh_slip',
      displayName: 'Weigh-Slip Buoy',
      location: { sectorId: 'sector_tethys_junction', poiId: 'poi_tethys_weigh' },
      lines: [
        { id: 'tw_01', text: 'MTS paint over Concord metal. The buoy still cites Ref 44-C.' },
        { id: 'tw_02', text: 'Every mass that passes is sold twice: once as cargo, once as data.' },
        { id: 'tw_03', text: 'The Quiet leave no pings. The weigh still lists their ghosts.' },
      ],
    },
    {
      id: 'vesta_slag_choir',
      displayName: 'Slag-Choir Relay',
      location: { sectorId: 'sector_vesta_forge', poiId: 'poi_vesta_slag_relay' },
      lines: [
        { id: 'vs_01', text: 'Forge crews call it a jammer. The Choir call it a hymn.' },
        { id: 'vs_02', text: 'Radiation spikes in threes. Nobody files the third spike.' },
        { id: 'vs_03', text: 'Scrap from the freighter wreck still carries Pattern chalk.' },
      ],
    },
    {
      id: 'charon_lung_marker',
      displayName: 'Lung Marker',
      location: { sectorId: 'sector_charon_expanse', poiId: 'poi_charon_lung_marker' },
      lines: [
        { id: 'cl_01', text: 'Birth records start late. The marker starts earlier.' },
        { id: 'cl_02', text: 'Air is the claim here. Ore is the excuse.' },
        { id: 'cl_03', text: 'A snapped tether turned a home into a distress log.' },
      ],
    },
    {
      id: 'eunomia_gulf_ledger',
      displayName: 'Gulf Ledger Plate',
      location: { sectorId: 'sector_eunomia_gulf', poiId: 'poi_eunomia_ledger' },
      lines: [
        { id: 'eg_01', text: 'Vael script on human steel. The debt is still open.' },
        { id: 'eg_02', text: 'The hulk lists seven colors of paint. None match the registry.' },
        { id: 'eg_03', text: 'Gulf traffic ends here. So do most excuses.' },
      ],
    },
    {
      id: 'orcus_shadow_plinth',
      displayName: 'Shadow Plinth',
      location: { sectorId: 'sector_orcus_shadow', poiId: 'poi_orcus_plinth' },
      lines: [
        { id: 'os_01', text: 'Sensors ghost on approach. The plinth stays sharp.' },
        { id: 'os_02', text: 'Vael guards do not hail. They measure.' },
        { id: 'os_03', text: 'The vault is not locked. It is waiting for the correct filing.' },
      ],
    },
    {
      id: 'sedna_dark_cadence',
      displayName: 'Dark Cadence Beacon',
      location: { sectorId: 'sector_sedna_dark', poiId: 'poi_sedna_cadence' },
      lines: [
        { id: 'sd_01', text: 'Pulse interval shorter than your last visit. Or your first.' },
        { id: 'sd_02', text: 'Survey post keeps the lights on. The dark keeps the receipts.' },
        { id: 'sd_03', text: 'Whatever the vault holds, it has already counted you.' },
      ],
    },
    {
      id: 'haumea_rift_probe',
      displayName: 'Rift Probe Shell',
      location: { sectorId: 'sector_haumea_rift', poiId: 'poi_haumea_probe' },
      lines: [
        { id: 'hr_01', text: 'Ordinary probes return empty. This shell came back with one image.' },
        { id: 'hr_02', text: 'Ice fissure telemetry ends mid-sentence.' },
        { id: 'hr_03', text: 'Someone left a buoy because the map would not hold still.' },
      ],
    },
    {
      id: 'eris_margin_drop',
      displayName: 'Margin Dead Drop',
      location: { sectorId: 'sector_eris_margin', poiId: 'poi_eris_dead_drop' },
      lines: [
        { id: 'em_01', text: 'Quiet leave packages, not messages.' },
        { id: 'em_02', text: 'The toll-runner wreck still has a sealed second hold.' },
        { id: 'em_03', text: 'If the drop is empty, someone better than you was here.' },
      ],
    },
    // ── The remaining authored rim POIs, same surface: one entry per id, three-plus fragments. ──
    {
      id: 'nyx_march_drop',
      displayName: 'March Drop Cache',
      location: { sectorId: 'sector_nyx_march', poiId: 'poi_nyx_cache' },
      lines: [
        { id: 'nx_01', text: 'A cache hung where the cut-lane widens. Its manifest predates the ambush maps.' },
        { id: 'nx_02', text: 'DMC seals on Quiet lashings. Both sides deny packing it.' },
        { id: 'nx_03', text: 'The lane keeps its payroll here. The lane keeps it poorly.' },
      ],
    },
    {
      id: 'nyx_cut_runner',
      displayName: 'Cut-Runner Wreck',
      location: { sectorId: 'sector_nyx_march', poiId: 'poi_nyx_wreck' },
      lines: [
        { id: 'nc_01', text: 'A runner that tried the cut with the wrong lights. The hull kept the toll receipt.' },
        { id: 'nc_02', text: 'Scorch marks read both directions. The ambush was mutual.' },
        { id: 'nc_03', text: 'Its transponder still offers the lane a name nobody answers.' },
      ],
    },
    {
      id: 'hyperion_caved_shaft',
      displayName: 'The Caved Shaft',
      location: { sectorId: 'sector_hyperion_cut', poiId: 'poi_hyperion_driller' },
      lines: [
        { id: 'hs_01', text: 'The drill platform sold its own shaft for parts. The shaft disagreed first.' },
        { id: 'hs_02', text: 'Hollow asteroid, honest drill. Only one of them filed correctly.' },
        { id: 'hs_03', text: 'Cut crews steer wide of the mast. The mast steers nothing.' },
      ],
    },
    {
      id: 'hyperion_cut_beacon',
      displayName: 'Cut Lane Beacon',
      location: { sectorId: 'sector_hyperion_cut', poiId: 'poi_hyperion_beacon' },
      lines: [
        { id: 'hb_01', text: 'The beacon marks the lane and the lane marks the ships that trust it.' },
        { id: 'hb_02', text: 'Toll lights cycle green-red-green. Ambush logs cycle the same way.' },
        { id: 'hb_03', text: 'DMC keeps it lit. The Cut keeps it honest in a different sense.' },
      ],
    },
    {
      id: 'kepler_flight_deck',
      displayName: 'The Flight Deck',
      location: { sectorId: 'sector_kepler_scar', poiId: 'poi_kepler_hulk' },
      lines: [
        { id: 'kd_01', text: 'The carrier died upside-down and the market grew in the shade of it.' },
        { id: 'kd_02', text: 'Launch rails read as awnings now. The teeth stayed.' },
        { id: 'kd_03', text: 'Reach stalls pay rent to a hull that cannot collect.' },
      ],
    },
    {
      id: 'kepler_raider_stash',
      displayName: 'Raider Stash',
      location: { sectorId: 'sector_kepler_scar', poiId: 'poi_kepler_stash' },
      lines: [
        { id: 'ks_01', text: 'A raider cache under scar debris. The tally plates inside are not theirs.' },
        { id: 'ks_02', text: 'Whoever stocked it marked the shelf life in other people\u2019s hulls.' },
        { id: 'ks_03', text: 'The Scar patrols pass it by. So did the last owner.' },
      ],
    },
    {
      id: 'orcus_signal',
      displayName: 'Orcus Signal',
      location: { sectorId: 'sector_orcus_shadow', poiId: 'poi_orcus_anomaly' },
      lines: [
        { id: 'sg_01', text: 'It answers every scan with the same scan, one pulse late.' },
        { id: 'sg_02', text: 'No source resolves. The behavior files itself.' },
        { id: 'sg_03', text: 'The Plinth faces it. Nobody remembers which arrived first.' },
      ],
    },
    {
      id: 'orcus_shadow_vault',
      displayName: 'Shadow Vault',
      location: { sectorId: 'sector_orcus_shadow', poiId: 'poi_orcus_vault' },
      lines: [
        { id: 'sv_01', text: 'The vault accepts no key the survey post has tried.' },
        { id: 'sv_02', text: 'Cache marks outside; sealed mass inside. The seam between them is deliberate.' },
        { id: 'sv_03', text: 'Vael patrol passes take longer here. They are reading it, slowly.' },
      ],
    },
    {
      id: 'rhea_slag_hulk',
      displayName: 'Slag Hauler Hulk',
      location: { sectorId: 'sector_rhea_cinder', poiId: 'poi_rhea_slag' },
      lines: [
        { id: 'rs_01', text: 'A hauler that poured its last load sideways. The slag is still cooling on the chart.' },
        { id: 'rs_02', text: 'The Cinder foundry logged the hull before the crew.' },
        { id: 'rs_03', text: 'Its cargo froze mid-air and nobody swept it. The Pour makes good scenery.' },
      ],
    },
    {
      id: 'rhea_burned_cache',
      displayName: 'Burned Survey Cache',
      location: { sectorId: 'sector_rhea_cinder', poiId: 'poi_rhea_claim' },
      lines: [
        { id: 'rc_01', text: 'A survey cache sealed under a burned camp. The assay tags survived the camp.' },
        { id: 'rc_02', text: 'Gold assay inside, soot outside. Whoever torched it wanted the map, not the ore.' },
        { id: 'rc_03', text: 'The claim flag is still legible under the burn. Claims outlive crews here.' },
      ],
    },
    {
      id: 'haumea_fissure_signal',
      displayName: 'Ice Fissure Signal',
      location: { sectorId: 'sector_haumea_rift', poiId: 'poi_haumea_fissure' },
      lines: [
        { id: 'fs_01', text: 'A thermal rift in the ice sheet. The radio scatter carries heavy things that do not move.' },
        { id: 'fs_02', text: 'Two wrecks answer its band. The fissure answers first.' },
        { id: 'fs_03', text: 'The Observatory files every echo. The map refuses to hold the same shape twice.' },
      ],
    },
    {
      id: 'haumea_range_buoy',
      displayName: 'Rift Range Buoy',
      location: { sectorId: 'sector_haumea_rift', poiId: 'poi_haumea_buoy' },
      lines: [
        { id: 'hb2_01', text: 'A range buoy at the fissure\u2019s edge, replacing the last one the ice ate.' },
        { id: 'hb2_02', text: 'It marks where probes stop returning telemetry. The mark drifts.' },
        { id: 'hb2_03', text: 'Rift traffic uses it to pretend the edge is a line.' },
      ],
    },
    {
      id: 'eris_quiet_drop',
      displayName: 'Quiet Drop Point',
      location: { sectorId: 'sector_eris_margin', poiId: 'poi_eris_drop' },
      lines: [
        { id: 'qd_01', text: 'A Quiet drop with no watcher posted. The watching is the point.' },
        { id: 'qd_02', text: 'Packages rotate through on no schedule the Margin admits.' },
        { id: 'qd_03', text: 'The Fence bills the lane for a service it does not name.' },
      ],
    },
    {
      id: 'eris_toll_runner',
      displayName: 'Toll-Runner Wreck',
      location: { sectorId: 'sector_eris_margin', poiId: 'poi_eris_wreck' },
      lines: [
        { id: 'tr_01', text: 'A toll-runner that outbid the wrong cordon. Its rate card is still pinned.' },
        { id: 'tr_02', text: 'The second hold never opened. The hull answers for it now.' },
        { id: 'tr_03', text: 'Margin crews salvage around it, not through it. House rule.' },
      ],
    },
    {
      id: 'eris_metronome',
      displayName: 'The Metronome',
      location: { sectorId: 'sector_eris_margin', poiId: 'poi_eris_metronome' },
      lines: [
        { id: 'mt_01', text: 'The beam keeps perfect time badly. The eighth second runs short.' },
        { id: 'mt_02', text: 'Navigators calibrate to it. The Fence sells what slips between beats.' },
        { id: 'mt_03', text: 'It was built to deny an area. It denies it politely, on schedule.' },
      ],
    },
    {
      id: 'phoebe_shard_sphere',
      displayName: 'The Shard Sphere',
      location: { sectorId: 'sector_phoebe_echo', poiId: 'poi_phoebe_echo' },
      lines: [
        { id: 'ss_01', text: 'Sixty fragments hold a sphere over the shrine. Active scan isolates one note at a time.' },
        { id: 'ss_02', text: 'The Echo Shrine sells the song back a note at a time.' },
        { id: 'ss_03', text: 'The sphere reads hostile intent as tuning error.' },
      ],
    },
    {
      id: 'phoebe_silent_vault',
      displayName: 'Silent Vault',
      location: { sectorId: 'sector_phoebe_echo', poiId: 'poi_phoebe_vault' },
      lines: [
        { id: 'pv_01', text: 'A sealed Vael cache in the nebula rim. The silence around it is maintained.' },
        { id: 'pv_02', text: 'Shrine records call its contents evidence. Evidence of what stays unindexed.' },
        { id: 'pv_03', text: 'The patrol orbit tightens near it. The vault does not notice.' },
      ],
    },
    {
      id: 'nereid_ice_hull',
      displayName: 'Ice-Hull Wreck',
      location: { sectorId: 'sector_nereid_shoal', poiId: 'poi_nereid_wreck' },
      lines: [
        { id: 'ih_01', text: 'A hull sheathed in its own frozen atmosphere. The ice kept the crew\u2019s last shape.' },
        { id: 'ih_02', text: 'Shoal salvors read the rime before they cut. The rime reads back poorly.' },
        { id: 'ih_03', text: 'It filed no distress. The shoal filed it anyway.' },
      ],
    },
    {
      id: 'nereid_shoal_cache',
      displayName: 'Shoal Cache',
      location: { sectorId: 'sector_nereid_shoal', poiId: 'poi_nereid_cache' },
      lines: [
        { id: 'sc_01', text: 'A cache tucked into the shoal\u2019s blind side. Its lashings match three different owners.' },
        { id: 'sc_02', text: 'The ice field drifts; the cache stays filed where the map says.' },
        { id: 'sc_03', text: 'Nobody claims it twice. Claiming it once was enough.' },
      ],
    },
    {
      id: 'proteus_below_deck',
      displayName: 'Below-Deck Cache',
      location: { sectorId: 'sector_proteus_well', poiId: 'poi_proteus_stash' },
      lines: [
        { id: 'bd_01', text: 'Quiet bearer cases sealed under the debris floor. Passive scans call it floor.' },
        { id: 'bd_02', text: 'The mass return is honest. The hull above it is not.' },
        { id: 'bd_03', text: 'Cases ride out on violet strip lanes, single-file, unbilled.' },
      ],
    },
    {
      id: 'proteus_funnel',
      displayName: 'The Funnel',
      location: { sectorId: 'sector_proteus_well', poiId: 'poi_proteus_hulk' },
      lines: [
        { id: 'pf_01', text: 'A freighter cut into a throat. The design intent is legible from very far away.' },
        { id: 'pf_02', text: 'Violet strips split the honest path from the short one.' },
        { id: 'pf_03', text: 'Large hulls enter here in ways their insurers would dispute.' },
      ],
    },
    {
      id: 'proteus_well_buoy',
      displayName: 'Well Range Buoy',
      location: { sectorId: 'sector_proteus_well', poiId: 'poi_proteus_buoy' },
      lines: [
        { id: 'wb_01', text: 'A range buoy marking the well\u2019s edge. It has outlasted three of its own replacements.' },
        { id: 'wb_02', text: 'Its broadcast names a depth the charts round off.' },
        { id: 'wb_03', text: 'Well traffic passes it silently. The buoy notes every pass.' },
      ],
    },
    {
      id: 'triton_wake_anomaly',
      displayName: 'Wake Anomaly',
      location: { sectorId: 'sector_triton_wake', poiId: 'poi_triton_anomaly' },
      lines: [
        { id: 'wa_01', text: 'A star once occupied this wake. The distortion says it is still leaving.' },
        { id: 'wa_02', text: 'Nothing here reflects light. Instruments grade the absence as deliberate.' },
        { id: 'wa_03', text: 'The Watcher was aimed here first. The field lab files it second.' },
      ],
    },
    {
      id: 'triton_wake_marker',
      displayName: 'Wake Marker',
      location: { sectorId: 'sector_triton_wake', poiId: 'poi_triton_beacon' },
      lines: [
        { id: 'wm_01', text: 'A beacon inside the resonance field, pulsing where the shrine can hear it.' },
        { id: 'wm_02', text: 'Its interval agrees with the bell. That is not an accident.' },
        { id: 'wm_03', text: 'Pilots time their tractors off it. The marker does not bill them.' },
      ],
    },
    {
      id: 'triton_wake_runner',
      displayName: 'Wake-Runner Hull',
      location: { sectorId: 'sector_triton_wake', poiId: 'poi_triton_wreck' },
      lines: [
        { id: 'wr_01', text: 'A runner that mistimed the resonance beat. The discharge kept the hull intact.' },
        { id: 'wr_02', text: 'Its tractor line is still paid out. Nobody reels it back.' },
        { id: 'wr_03', text: 'The Wake lets it rest. The Wake is not always so generous.' },
      ],
    },
    {
      id: 'triton_watcher',
      displayName: 'The Tide-Locked Watcher',
      location: { sectorId: 'sector_triton_wake', poiId: 'poi_triton_watcher' },
      lines: [
        { id: 'wt_01', text: 'A carved aperture aimed at where a star used to be. The carving outdates the star\u2019s absence.' },
        { id: 'wt_02', text: 'Close passes dampen. The dampening is focused on purpose.' },
        { id: 'wt_03', text: 'It has watched empty space longer than the map has existed.' },
      ],
    },
    {
      id: 'triton_field_lab',
      displayName: 'Triton Field Lab',
      location: { sectorId: 'sector_triton_wake', poiId: 'poi_triton_field_lab' },
      lines: [
        { id: 'fl_01', text: 'An Archive platform in the Wake, logging something its instruments cannot show.' },
        { id: 'fl_02', text: 'Its signal slips in and out of lock. The staff bill the silence as data.' },
        { id: 'fl_03', text: 'The lab does not publish. It accumulates.' },
      ],
    },
    {
      id: 'eunomia_gulf_hulk',
      displayName: 'Gulf Hulk',
      location: { sectorId: 'sector_eunomia_gulf', poiId: 'poi_eunomia_hulk' },
      lines: [
        { id: 'gh_01', text: 'The debris chain\u2019s anchor. Everything downstream of it is technically salvage.' },
        { id: 'gh_02', text: 'Its paint ledger predates three flags. The plates still argue.' },
        { id: 'gh_03', text: 'The Tideline was towing from here when it stopped towing.' },
      ],
    },
    {
      id: 'eunomia_paint_scar',
      displayName: 'Paint-Scar Debris',
      location: { sectorId: 'sector_eunomia_gulf', poiId: 'poi_eunomia_debris' },
      lines: [
        { id: 'ps_01', text: 'Debris wearing seven registry colors. The registry denies all seven.' },
        { id: 'ps_02', text: 'Each scar is a separate incident. The Gulf files them as weather.' },
        { id: 'ps_03', text: 'Salvors read the paint before the metal. The paint tells more.' },
      ],
    },
    {
      id: 'eunomia_hush',
      displayName: 'The Hush',
      location: { sectorId: 'sector_eunomia_gulf', poiId: 'poi_hush' },
      lines: [
        { id: 'hu_01', text: 'A world-shaped gap in the band. Signal stops politely at the edge.' },
        { id: 'hu_02', text: 'The receiver loses carrier and static together. The silence stays level.' },
        { id: 'hu_03', text: 'Pilots report the quiet as equipment. The equipment disagrees.' },
      ],
    },
    {
      id: 'sedna_vault',
      displayName: 'Sedna Vault',
      location: { sectorId: 'sector_sedna_dark', poiId: 'poi_sedna_vault' },
      lines: [
        { id: 'vt_01', text: 'A vault in the dark that predates the post watching it.' },
        { id: 'vt_02', text: 'The survey log calls it sealed. The vault calls nothing.' },
        { id: 'vt_03', text: 'Whatever it holds, the cadence beacon counts the seconds it takes to notice.' },
      ],
    },
    {
      id: 'sedna_ringworld',
      displayName: 'The Ringworld Arc',
      location: { sectorId: 'sector_sedna_dark', poiId: 'poi_sedna_ringworld' },
      lines: [
        { id: 'rw_01', text: 'An arc of ring around a dead star. The rivers dried; the lights stayed on.' },
        { id: 'rw_02', text: 'The city grid outlived the primary. The maintenance contract did not.' },
        { id: 'rw_03', text: 'One street still answers a held station. The post files it as anomaly.' },
      ],
    },
    {
      id: 'dione_lane_relay',
      displayName: 'Lane Relay',
      location: { sectorId: 'sector_dione_lane', poiId: 'poi_dione_relay' },
      lines: [
        { id: 'lr_01', text: 'A relay on the toll lane, repeating what the lane has already sold.' },
        { id: 'lr_02', text: 'Its carrier is clean. The traffic on it is not.' },
        { id: 'lr_03', text: 'The lane\u2019s only honest signal. It lies by omission.' },
      ],
    },
    {
      id: 'dione_dead_drop',
      displayName: 'Toll-Lane Dead Drop',
      location: { sectorId: 'sector_dione_lane', poiId: 'poi_dione_deaddrop' },
      lines: [
        { id: 'dd_01', text: 'A sealed case off the relay: pack marks on the clasp, Meridian rate cards inside.' },
        { id: 'dd_02', text: 'The lane quotes two prices. The lawful one is the discount.' },
        { id: 'dd_03', text: 'The drop is heavier than freight and lighter than evidence.' },
      ],
    },
    {
      // S-02: the claim cluster on f_ceres_1's rim — two pins, one claim, three crews.
      id: 'ceres_claim_tag',
      displayName: 'Claim Forty-Tag',
      location: { sectorId: 'sector_ceres_belt', poiId: 'poi_ceres_claim_tag' },
      lines: [
        { id: 'ct_01', text: 'Third-issue stamp over drilled rock. The filing fees were paid on time.' },
        { id: 'ct_02', text: 'A second pin stands four hands off: fourth issue, same claim, different crew.' },
        { id: 'ct_03', text: 'The Board lapsed the dead and re-filed the living in one shift. The rock never noticed.' },
      ],
    },
    {
      id: 'ceres_vigil',
      displayName: 'Cathedral Vigil',
      location: { sectorId: 'sector_ceres_belt', poiId: 'poi_ceres_vigil' },
      lines: [
        { id: 'cv_01', text: 'A worklight with no work order, burning on a schedule nobody ordered.' },
        { id: 'cv_02', text: 'Two names welded under the mounting plate. The shipbreak counts tonnage, not names.' },
        { id: 'cv_03', text: 'The cell is always fresh. The crew that keeps it fresh does not sign the board.' },
      ],
    },
    {
      id: 'ceres_lapsed_cache',
      displayName: 'Lapsed Claim Cache',
      location: { sectorId: 'sector_ceres_belt', poiId: 'poi_ceres_lapsed_cache' },
      lines: [
        { id: 'lc_01', text: 'Weighed, tagged, never collected. The toll receipt outdates the strike.' },
        { id: 'lc_02', text: 'The pin above it still holds. The crew under it does not.' },
        { id: 'lc_03', text: 'Take the ore. The belt already took everything it was owed.' },
      ],
    },
    {
      id: 'ceres_ash_pin',
      displayName: 'Ash Pin on the Pallas Leg',
      location: { sectorId: 'sector_ceres_belt', poiId: 'poi_ceres_ash_pin' },
      lines: [
        { id: 'ap_01', text: 'A pin cooked to its socket. Its survey ID still transmits on the old band.' },
        { id: 'ap_02', text: 'Drift crews pass it slow — the ID is still on the books.' },
        { id: 'ap_03', text: 'The belt keeps its graves in a ledger. This one still pings.' },
      ],
    },
    {
      // S-03: the junction's outbound legs, in the two-desk register.
      id: 'tethys_marshal_nine',
      displayName: 'Convoy Marshal Nine',
      location: { sectorId: 'sector_tethys_junction', poiId: 'poi_tethys_marshal_nine' },
      lines: [
        { id: 'mn_01', text: 'Meridian paint over a Concord lane keeper. The serial still bleeds through.' },
        { id: 'mn_02', text: 'Outbound threes form on the lamps. The Tally counts in; this one counts out.' },
        { id: 'mn_03', text: 'Its on-time log is the shortest file at the junction.' },
      ],
    },
    {
      id: 'tethys_second_count',
      displayName: 'Second Count Buoy',
      location: { sectorId: 'sector_tethys_junction', poiId: 'poi_tethys_second_count' },
      lines: [
        { id: 'sc_01b', text: 'Concord housing, dark lamps, seal intact. The lease changed; the mount did not.' },
        { id: 'sc_02b', text: 'The Vesta leg paid a toll before this one. It will pay another after.' },
        { id: 'sc_03b', text: 'Filed shutdown, filed salvage, filed waiver. Nobody came. The filing is complete.' },
      ],
    },
    {
      id: 'tethys_refiled',
      displayName: 'The Re-filed Hull',
      location: { sectorId: 'sector_tethys_junction', poiId: 'poi_tethys_refiled' },
      lines: [
        { id: 'rf_01', text: 'Flagged HELD at a bend the lane no longer takes.' },
        { id: 'rf_02', text: 'The desk was re-filed twice. The hold transferred with the furniture.' },
        { id: 'rf_03', text: 'Her crew signed the release years ago. The hold did not.' },
      ],
    },
    {
      // S-04: the burn's workforce and the foundry's signature.
      id: 'vesta_hot_face',
      displayName: 'Hot Face Claim',
      location: { sectorId: 'sector_vesta_forge', poiId: 'poi_vesta_hot_face' },
      lines: [
        { id: 'hf_01', text: 'Seven stamp layers on one pin. The roster is the claim.' },
        { id: 'hf_02', text: 'Twenty-minute watches. The four-watch crew is still argued about.' },
        { id: 'hf_03', text: 'The best face in the Forge sits in the burn. Nobody files that as a problem.' },
      ],
    },
    {
      id: 'vesta_lead_hedge',
      displayName: 'The Lead Hedge',
      location: { sectorId: 'sector_vesta_forge', poiId: 'poi_vesta_lead_hedge' },
      lines: [
        { id: 'lh_01', text: 'Lead doors chalked with watch-tallies. Most run to the floor.' },
        { id: 'lh_02', text: 'A few columns end mid-tally. Nobody erases those.' },
        { id: 'lh_03', text: 'The next crew chalks a fresh door. The count stays honest.' },
      ],
    },
    {
      id: 'vesta_guild_stamps',
      displayName: 'Guild Stamp Post',
      location: { sectorId: 'sector_vesta_forge', poiId: 'poi_vesta_guild_stamps' },
      lines: [
        { id: 'gs_01', text: 'Second Pour at the crown, Third Pour below. The base is all ghosts.' },
        { id: 'gs_02', text: 'The gallery across the field signs the welders. This signs the work.' },
        { id: 'gs_03', text: 'A single strike reads as provenance. Unsigned plate does not ship.' },
      ],
    },
    {
      // S-05: the drift's kept mooring, the den's doorbell, the kitchen's line.
      id: 'pallas_eighteenth',
      displayName: 'The Eighteenth Mooring',
      location: { sectorId: 'sector_pallas_drift', poiId: 'poi_pallas_eighteenth' },
      lines: [
        { id: 'pm_01', text: 'A mooring pin on the Quiessence\u2019s approach, lamp burning over an empty berth.' },
        { id: 'pm_02', text: 'Seventeen freighters hold formation in the murk. The drift keeps the eighteenth slot on the outside.' },
        { id: 'pm_03', text: 'Repainted every season. Asking whose season keeps it is bad bookkeeping.' },
      ],
    },
    {
      id: 'pallas_quiet_bell',
      displayName: 'The Quiet Bell',
      location: { sectorId: 'sector_pallas_drift', poiId: 'poi_pallas_quiet_bell' },
      lines: [
        { id: 'qb_01', text: 'A whistle-buoy on the den\u2019s approach lane. Regulars run the manifold across it once.' },
        { id: 'qb_02', text: 'Ring twice and the house answers with silence. At the den, silence is a complete sentence.' },
        { id: 'qb_03', text: 'The only roll the house calls. Nobody is asked to sign it.' },
      ],
    },
    {
      id: 'pallas_mess_line',
      displayName: 'The Mess Line',
      location: { sectorId: 'sector_pallas_drift', poiId: 'poi_pallas_mess_line' },
      lines: [
        { id: 'ml_01', text: 'Ration pods staged off the market\u2019s south apron, chalk-sorted by skiff and shift.' },
        { id: 'ml_02', text: 'Every unlisted crew on the fringe eats through this line. The intake overshoots; the surplus clears.' },
        { id: 'ml_03', text: 'Nobody asks where a pod goes once it leaves the rack. That is the whole arrangement.' },
      ],
    },
    {
      // S-13: the memorial markers beside the unplated frontier wrecks — the eulogy register.
      id: 'nyx_runner_memorial',
      displayName: 'Runner\u2019s Tally Post',
      location: { sectorId: 'sector_nyx_march', poiId: 'poi_nyx_runner_memorial' },
      lines: [
        { id: 'rn_01', text: 'A tally post beside a stripped wreck. The names it keeps were filed nowhere else.' },
        { id: 'rn_02', text: 'Toma Reye ran a forged cut with two unpaid hands. The scoring on the flank reads in threes.' },
        { id: 'rn_03', text: 'Holds and drive were gone before the hull cooled. The post outlasted the paperwork.' },
      ],
    },
    {
      id: 'rhea_slag_memorial',
      displayName: 'Slagman\u2019s Lantern',
      location: { sectorId: 'sector_rhea_cinder', poiId: 'poi_rhea_slag_memorial' },
      lines: [
        { id: 'sl_01', text: 'A furnace lantern on a cell that still takes charge. Somebody keeps it fed.' },
        { id: 'sl_02', text: 'Pall Vess, Nera Oku, and the apprentice refused the torch. The ingot reads slag-bound.' },
        { id: 'sl_03', text: 'The scoring on the bell runs inward. The lantern burns anyway.' },
      ],
    },
    {
      id: 'haumea_probe_memorial',
      displayName: 'Probe-Keeper\u2019s Stake',
      location: { sectorId: 'sector_haumea_rift', poiId: 'poi_haumea_probe_memorial' },
      lines: [
        { id: 'pk_01', text: 'Anchor knot-work on a survey stake, left by the machine that minds the crack.' },
        { id: 'pk_02', text: 'RIME-4 came back wrong. Ansi Toro and Bes Mar are recorded at the Anchor.' },
        { id: 'pk_03', text: 'The shell\u2019s scoring runs inward. No weapon the rift knows does that.' },
      ],
    },
    {
      id: 'eris_toll_memorial',
      displayName: 'Toll-Book Marker',
      location: { sectorId: 'sector_eris_margin', poiId: 'poi_eris_toll_memorial' },
      lines: [
        { id: 'tb_01', text: 'A torn toll-book page sealed under the plate. The runner HALKETT paid through seventeen times.' },
        { id: 'tb_02', text: 'On the eighteenth crossing the toll was the hull. Salvors took drive and holds the first day.' },
        { id: 'tb_03', text: 'The margin keeps what is left. The page keeps the count.' },
      ],
    },
    {
      id: 'nereid_shoal_memorial',
      displayName: 'Shoal Ledger Marker',
      location: { sectorId: 'sector_nereid_shoal', poiId: 'poi_nereid_shoal_memorial' },
      lines: [
        { id: 'sh_01', text: 'The shoal salvors set this marker by law. The rime keeps the count; the stake keeps the names.' },
        { id: 'sh_02', text: 'O. Ferro, K. Ferro, and an apprentice nobody carded.' },
        { id: 'sh_03', text: 'Cut lines on the holds say they were opened after the crew were already ice.' },
      ],
    },
    {
      id: 'triton_wake_memorial',
      displayName: 'Wake-Bell Marker',
      location: { sectorId: 'sector_triton_wake', poiId: 'poi_triton_wake_memorial' },
      lines: [
        { id: 'wk_01', text: 'A bell buoy with its clapper pulled, tuned silent on the wake drift.' },
        { id: 'wk_02', text: 'The plate names only the captain — Reva Ils. The wake does not give the other three back.' },
        { id: 'wk_03', text: 'Kill-marks line the spine like stitching. Too regular to be rock.' },
      ],
    },
    {
      id: 'eunomia_row_marker',
      displayName: 'Gardener\u2019s Row Marker',
      location: { sectorId: 'sector_eunomia_gulf', poiId: 'poi_eunomia_row_marker' },
      lines: [
        { id: 'ro_01', text: 'A compost post in the Understory\u2019s hand, newer than the wreck it faces.' },
        { id: 'ro_02', text: 'Row 7 — the hulk YARROW, planted whole. Pell Osta, S. Reck, and the ship\u2019s cat are returned to the garden.' },
        { id: 'ro_03', text: 'The scoring on the hull predates the planting. The gardener counts what falls.' },
      ],
    },
    {
      id: 'eunomia_bed_marker',
      displayName: 'Painted-Bed Marker',
      location: { sectorId: 'sector_eunomia_gulf', poiId: 'poi_eunomia_bed_marker' },
      lines: [
        { id: 'pb_01', text: 'Bed 12 — loose tonnage, three crews\u2019 worth of scrap under a compost post.' },
        { id: 'pb_02', text: 'The names left aboard are written on the stake\u2019s weather side.' },
        { id: 'pb_03', text: 'Kill-marks point inward from every bearing. Whatever died here was running.' },
      ],
    },
    {
      // S-14: the five dressed regions' own scan-lore bindings.
      id: 'hyperion_stake_line',
      displayName: 'Second Stake Line',
      location: { sectorId: 'sector_hyperion_cut', poiId: 'poi_hyperion_stake_line' },
      lines: [
        { id: 'st_01', text: 'Claim stakes in the seam\u2019s shadow, filed in the Outpost\u2019s own shorthand: S-LINE TWO.' },
        { id: 'st_02', text: 'Worked before the cave. Half the stakes name crews the Shaft\u2019s roster dropped.' },
        { id: 'st_03', text: 'The line is older than the crack in the band. The filing outlived the crew.' },
      ],
    },
    {
      id: 'hyperion_tag_face',
      displayName: 'Marked Face',
      location: { sectorId: 'sector_hyperion_cut', poiId: 'poi_hyperion_tag_face' },
      lines: [
        { id: 'tf_01', text: 'Auger tally and shift codes on the field\u2019s largest face, painted before the cave took the mast.' },
        { id: 'tf_02', text: 'One name in a circle. The refinery calls it vandalism; the crews call it the shift board.' },
        { id: 'tf_03', text: 'The paint predates the drill logs. Nobody files either anymore.' },
      ],
    },
    {
      id: 'dione_convoy_tally',
      displayName: 'Convoy Tally Post',
      location: { sectorId: 'sector_dione_lane', poiId: 'poi_dione_convoy_tally' },
      lines: [
        { id: 'co_01', text: 'Chalk manifests and berth numbers where the hauler lines form up before the customs read.' },
        { id: 'co_02', text: 'The convoy count is in Meridian hands. Every flag on the lane agrees this scale is honest.' },
        { id: 'co_03', text: 'Crews wait out the customs read against this seam. The post is the waiting room.' },
      ],
    },
    {
      id: 'dione_way_tag',
      displayName: 'Wayline Tag',
      location: { sectorId: 'sector_dione_lane', poiId: 'poi_dione_way_tag' },
      lines: [
        { id: 'wy_01', text: 'Neat block letters, a lane number, a date — filed to within an inch of regulation.' },
        { id: 'wy_02', text: 'Even the graffiti on the watched lane keeps to the margin.' },
        { id: 'wy_03', text: 'The customs desk logs it under morale, admissible.' },
      ],
    },
    {
      id: 'eris_watch_pin',
      displayName: 'Watch Pin',
      location: { sectorId: 'sector_eris_margin', poiId: 'poi_eris_watch_pin' },
      lines: [
        { id: 'wp_01', text: 'A burned survey pin dead-center on the metallic field, pointed at nothing the telescope admits.' },
        { id: 'wp_02', text: 'The Quiet do not pull dead pins. A pin that watches nothing is the kind that still works.' },
        { id: 'wp_03', text: 'No signal, no keeper, no filing. The pin was never the payload.' },
      ],
    },
    {
      id: 'eris_mark_stone',
      displayName: 'Mark Stone',
      location: { sectorId: 'sector_eris_margin', poiId: 'poi_eris_mark_stone' },
      lines: [
        { id: 'ms_01', text: 'A name, a hull weight, a date — in a hand nobody at the Fence teaches.' },
        { id: 'ms_02', text: 'The filing this mark answers to lives in somebody else\u2019s registry.' },
        { id: 'ms_03', text: 'On the Margin, the mark that matters is never where the marker is.' },
      ],
    },
    {
      id: 'eunomia_gulf_stake',
      displayName: 'Gulf Stake',
      location: { sectorId: 'sector_eunomia_gulf', poiId: 'poi_eunomia_gulf_stake' },
      lines: [
        { id: 'gu_01', text: 'A claim stake stamped LICENSE E-1140 in the Understory\u2019s plate script.' },
        { id: 'gu_02', text: 'The fence\u2019s cutting crews file under a yard license, not a name.' },
        { id: 'gu_03', text: 'The exotic seam\u2019s last three filings read the same: licensed, uninspected, unreturned.' },
      ],
    },
    {
      id: 'eunomia_lamp_row',
      displayName: 'Lamp Row',
      location: { sectorId: 'sector_eunomia_gulf', poiId: 'poi_eunomia_lamp_row' },
      lines: [
        { id: 'la_01', text: 'Worklamps strung along the licensed plate drift — half dead, half burning on scavenged cells.' },
        { id: 'la_02', text: 'The yard\u2019s shift line, strung so the cutting crews find the drift after the fog lifts.' },
        { id: 'la_03', text: 'The lit half marks where the last crew stopped.' },
      ],
    },
    {
      id: 'haumea_frost_tag',
      displayName: 'Frost Mark',
      location: { sectorId: 'sector_haumea_rift', poiId: 'poi_haumea_frost_tag' },
      lines: [
        { id: 'ft_01', text: 'A frost-etched tag on the ice field\u2019s clearest face — instrument-log date stamps, one doodle of the fracture the chart will not name.' },
        { id: 'ft_02', text: 'Observatory crews get bored on the long scans. The mark is the log of the boredom.' },
        { id: 'ft_03', text: 'The survey post files it as surface contamination, benign.' },
      ],
    },
    {
      id: 'haumea_listen_pin',
      displayName: 'Listen Pin',
      location: { sectorId: 'sector_haumea_rift', poiId: 'poi_haumea_listen_pin' },
      lines: [
        { id: 'lp_01', text: 'A dropped receiver on the crystalline seam\u2019s edge, still answering the observatory\u2019s ping schedule.' },
        { id: 'lp_02', text: 'Channel four, on schedule. The acquisition paperwork lists it as recovered.' },
        { id: 'lp_03', text: 'The ping log disagrees with the paperwork. The equipment cage stopped reconciling the two.' },
      ],
    },
    // S-14 remainder: the nine undressed regions' own scan-lore bindings — one entry
    // per new field-edge POI, three-plus fragments each in the region's register.
    {
      id: 'kepler_price_post',
      displayName: 'Price Post',
      location: { sectorId: 'sector_kepler_scar', poiId: 'poi_kepler_price_post' },
      lines: [
        { id: 'kpp_01', text: 'A tally post where the Bazaar\u2019s cutters mark rock already spoken for — hull codes, strip counts, favors.' },
        { id: 'kpp_02', text: 'The stall that owns a stone changes shift to shift. The chalk keeps the last honest answer.' },
        { id: 'kpp_03', text: 'On the Scar, a price is not a number. It is a name you owe.' },
      ],
    },
    {
      id: 'kepler_tow_marks',
      displayName: 'Tow Marks',
      location: { sectorId: 'sector_kepler_scar', poiId: 'poi_kepler_tow_marks' },
      lines: [
        { id: 'ktm_01', text: 'Drag-marks and scorch tallies on the seam\u2019s quiet face. One line per late payer.' },
        { id: 'ktm_02', text: 'The enforcers keep their ledger where the radiation fog eats paint slowest.' },
        { id: 'ktm_03', text: 'Every mark ends under the carrier\u2019s belly. None of them end anywhere else.' },
      ],
    },
    {
      id: 'nyx_dark_lantern',
      displayName: 'Dark Lantern',
      location: { sectorId: 'sector_nyx_march', poiId: 'poi_nyx_dark_lantern' },
      lines: [
        { id: 'nlp_01', text: 'A lantern that burns backwards. Lit means the lane is watched; dark means run it.' },
        { id: 'nlp_02', text: 'The runners who keep it have never once answered for the schedule.' },
        { id: 'nlp_03', text: 'On the March, the honest signal is the one that says nothing.' },
      ],
    },
    {
      id: 'nyx_forged_stakes',
      displayName: 'Forged Stakes',
      location: { sectorId: 'sector_nyx_march', poiId: 'poi_nyx_forged_stakes' },
      lines: [
        { id: 'nfs_01', text: 'Claim stakes filed under a registry that exists nowhere else.' },
        { id: 'nfs_02', text: 'The Fence stakes rock the way it files manifests — forged, tidy, honored.' },
        { id: 'nfs_03', text: 'Everyone who needs the lane honors the line. That is the whole registry.' },
      ],
    },
    {
      id: 'orcus_measure_stake',
      displayName: 'Measure Stake',
      location: { sectorId: 'sector_orcus_shadow', poiId: 'poi_orcus_measure_stake' },
      lines: [
        { id: 'oms_01', text: 'A Vael survey stake — an instrument, not a claim mark.' },
        { id: 'oms_02', text: 'Its tally counts scans in a notation older than the Shadow Cache.' },
        { id: 'oms_03', text: 'The count increments when nothing is watching it. In the Shadow, that is most of the time.' },
      ],
    },
    {
      id: 'orcus_shepherd_tag',
      displayName: 'Shepherd\u2019s Tag',
      location: { sectorId: 'sector_orcus_shadow', poiId: 'poi_orcus_shepherd_tag' },
      lines: [
        { id: 'ost_01', text: 'A herder\u2019s tag on the shadow debris\u2019 lead rock. The flock was never driven home.' },
        { id: 'ost_02', text: 'It names the flock, the driver, and a delivery bearing that ends at the signal\u2019s throat.' },
        { id: 'ost_03', text: 'The Broken Shepherd\u2019s last job is still posted. The flock is still waiting.' },
      ],
    },
    {
      id: 'rhea_assay_board',
      displayName: 'Scorch Assay Board',
      location: { sectorId: 'sector_rhea_cinder', poiId: 'poi_rhea_assay_board' },
      lines: [
        { id: 'rab_01', text: 'Scorched assays pinned in sale order. You buy the read, then the rock.' },
        { id: 'rab_02', text: 'The top pin has been re-hung so often the board reads as a price history.' },
        { id: 'rab_03', text: 'On the Cinder, the assay is worth more than the claim it condemns.' },
      ],
    },
    {
      id: 'rhea_escort_tally',
      displayName: 'Escort Tally',
      location: { sectorId: 'sector_rhea_cinder', poiId: 'poi_rhea_escort_tally' },
      lines: [
        { id: 'ret_01', text: 'Hauler marks in one column, escort marks in a shorter one.' },
        { id: 'ret_02', text: 'The desk files it under weather. The haulers file it under reasons to carry guns.' },
        { id: 'ret_03', text: 'Every scratch is a run somebody made alone. The column keeps growing.' },
      ],
    },
    {
      id: 'phoebe_struck_face',
      displayName: 'Struck Face',
      location: { sectorId: 'sector_phoebe_echo', poiId: 'poi_phoebe_struck_face' },
      lines: [
        { id: 'psf_01', text: 'Test-strike scars in a pattern that is almost a scale.' },
        { id: 'psf_02', text: 'Stones that answer wrong get culled from the song. The face remembers the culls.' },
        { id: 'psf_03', text: 'The shrine tunes the seam the way a tuner pulls strings — by breaking the wrong ones.' },
      ],
    },
    {
      id: 'phoebe_listener_post',
      displayName: 'Listener\u2019s Post',
      location: { sectorId: 'sector_phoebe_echo', poiId: 'poi_phoebe_listener_post' },
      lines: [
        { id: 'plp_01', text: 'Two columns on the keeper\u2019s post: those who came to listen, those who came to take.' },
        { id: 'plp_02', text: 'The second column is longer. Both columns get visited.' },
        { id: 'plp_03', text: 'The shrine does not stop the takers. It writes them down.' },
      ],
    },
    {
      id: 'nereid_rime_board',
      displayName: 'Rime Board',
      location: { sectorId: 'sector_nereid_shoal', poiId: 'poi_nereid_rime_board' },
      lines: [
        { id: 'nrb_01', text: 'Claim-lines scratched through the same rime that keeps the salvors\u2019 count.' },
        { id: 'nrb_02', text: 'A line holds until the ice grows over it. That is the shoal\u2019s whole filing period.' },
        { id: 'nrb_03', text: 'The board is older than the claim desk. The ice honors both.' },
      ],
    },
    {
      id: 'nereid_independent_flag',
      displayName: 'Independent Flag',
      location: { sectorId: 'sector_nereid_shoal', poiId: 'poi_nereid_independent_flag' },
      lines: [
        { id: 'nif_01', text: 'A hand-sewn flag, one of a dozen the ice crews fly under the Collective\u2019s cut.' },
        { id: 'nif_02', text: 'The colors are filed at the Shoal Claim desk and nowhere else.' },
        { id: 'nif_03', text: 'On the shoal a flag is a signature, not a flag.' },
      ],
    },
    {
      id: 'proteus_strip_marks',
      displayName: 'Strip Marks',
      location: { sectorId: 'sector_proteus_well', poiId: 'poi_proteus_strip_marks' },
      lines: [
        { id: 'psm_01', text: 'Violet strip-paint in the same hand as the Funnel\u2019s guide strips.' },
        { id: 'psm_02', text: 'A stone wearing the violet is a stone you are invited not to assay.' },
        { id: 'psm_03', text: 'The den marks its rock in the same color it marks its throats.' },
      ],
    },
    {
      id: 'proteus_bearer_post',
      displayName: 'Bearer Post',
      location: { sectorId: 'sector_proteus_well', poiId: 'poi_proteus_bearer_post' },
      lines: [
        { id: 'pbp_01', text: 'Bearer cases stage here before the funnel run. The chalk marks who is owed.' },
        { id: 'pbp_02', text: 'No names, no cargo, only the count — the only part the den files as evidence.' },
        { id: 'pbp_03', text: 'The lock opens for the strip-lights, not for hands.' },
      ],
    },
    {
      id: 'triton_drift_log',
      displayName: 'Drift Log Buoy',
      location: { sectorId: 'sector_triton_wake', poiId: 'poi_triton_drift_log' },
      lines: [
        { id: 'tdl_01', text: 'A telemetry buoy logging how fast the dead metal still travels.' },
        { id: 'tdl_02', text: 'Eighty million years after departure, the debris is still arriving somewhere.' },
        { id: 'tdl_03', text: 'The lab files its drift tables quarterly. The wake files nothing.' },
      ],
    },
    {
      id: 'triton_abandoned_survey',
      displayName: 'Abandoned Survey',
      location: { sectorId: 'sector_triton_wake', poiId: 'poi_triton_abandoned_survey' },
      lines: [
        { id: 'tas_01', text: 'Half a survey grid: stake holes, one bearing line, no completion stamp.' },
        { id: 'tas_02', text: 'The team filed the seam as measured. The instruments that disagreed were filed as equipment.' },
        { id: 'tas_03', text: 'In the Wake, an unfinished survey is a finished answer.' },
      ],
    },
    {
      id: 'sedna_buoy_ledger',
      displayName: 'Buoy Ledger',
      location: { sectorId: 'sector_sedna_dark', poiId: 'poi_sedna_buoy_ledger' },
      lines: [
        { id: 'sbl_01', text: 'Buoy numbers and dark dates. The recovery notes all read the same: left in place.' },
        { id: 'sbl_02', text: 'The unlit lane\u2019s casualties get a tally post, not a rescue.' },
        { id: 'sbl_03', text: 'The count grows at a rate the post files as seasonal.' },
      ],
    },
    {
      id: 'sedna_survey_etch',
      displayName: 'Survey Etch',
      location: { sectorId: 'sector_sedna_dark', poiId: 'poi_sedna_survey_etch' },
      lines: [
        { id: 'sse_01', text: 'Grid lines, sample flags, a return date three seasons old.' },
        { id: 'sse_02', text: 'The post keeps etching rock for a crew it has stopped expecting.' },
        { id: 'sse_03', text: 'The alternative is admitting nobody is coming. The etching continues.' },
      ],
    },
    // ── The rim POIs merged onto the same sectors: claim stakes with their authored
    // micro-histories, and the six sector wonders — every one carries scan lore too. ──
    {
      id: 'nyx_unwritten_bridge',
      displayName: 'The Unwritten Bridge',
      location: { sectorId: 'sector_nyx_march', poiId: 'world_site_nyx_unwritten_bridge' },
      lines: [
        { id: 'ub_01', text: 'Two spans hold a gap the March never bridged on paper. The clamps are the only filing.' },
        { id: 'ub_02', text: 'The crosswind is a toll with no collector. Open the second clamp and it stops billing.' },
        { id: 'ub_03', text: 'Nobody wrote the bridge down. Building it twice is how the lane keeps the secret.' },
      ],
    },
    {
      id: 'nyx_blackglass_lease',
      displayName: 'Blackglass Lease',
      location: { sectorId: 'sector_nyx_march', poiId: 'poi_claim_blackglass' },
      lines: [
        { id: 'bg_01', text: 'Glass-sheared rock under a Quiet cutting front. The docket never carried an origin line.' },
        { id: 'bg_02', text: 'The lease lapsed the week the Cut-Runner went down. The Fence sells the lapse forward.' },
        { id: 'bg_03', text: 'A claim whose paper ends at the fence is a claim that was never meant to be read.' },
      ],
    },
    {
      id: 'hyperion_cutwater',
      displayName: 'Cutwater Anchorage',
      location: { sectorId: 'sector_hyperion_cut', poiId: 'poi_claim_cutwater' },
      lines: [
        { id: 'cwa_01', text: 'The cut\u2019s first anchorage: mooring rings, an assay scale, bunks for four crews.' },
        { id: 'cwa_02', text: 'Consolidated the season the Shaft took its drift crew. The rings kept the old sizes.' },
        { id: 'cwa_03', text: 'Haulers still fit the moorings. Nobody files the fit as a vacancy.' },
      ],
    },
    {
      id: 'kepler_scarline',
      displayName: 'Scarline Hold',
      location: { sectorId: 'sector_kepler_scar', poiId: 'poi_claim_scarline' },
      lines: [
        { id: 'slh_01', text: 'Eleven owners filed straight down the carrier\u2019s debris scar. None of them left it empty.' },
        { id: 'slh_02', text: 'The Bazaar gets first pick of every plate. That is not a tax; it is the succession rule.' },
        { id: 'slh_03', text: 'Under the launch rails, ownership is whoever the stalls vouch for this week.' },
      ],
    },
    {
      id: 'orcus_last_lantern',
      displayName: 'The Last Lantern',
      location: { sectorId: 'sector_orcus_shadow', poiId: 'world_site_orcus_last_lantern' },
      lines: [
        { id: 'll_01', text: 'A dead lantern on a live intake. The Shadow kept the post after the light filed out.' },
        { id: 'll_02', text: 'Its dish still aims where the count said light should go. The instrument outlasted the flame.' },
        { id: 'll_03', text: 'Vael survey marks ring the mount. Whatever the lantern last showed, they measured it.' },
      ],
    },
    {
      id: 'rhea_red_sun_engine',
      displayName: 'The Red Sun Engine',
      location: { sectorId: 'sector_rhea_cinder', poiId: 'world_site_rhea_red_sun_engine' },
      lines: [
        { id: 'rse_01', text: 'A stationary engine bolted to the burn\u2019s math. The ash wall is its exhaust note.' },
        { id: 'rse_02', text: 'The bleed valve failed mid-cycle. The core stayed hot; the socket stayed cold.' },
        { id: 'rse_03', text: 'Foundry crews file it as weather. The valve disagrees, on schedule.' },
      ],
    },
    {
      id: 'rhea_emberwake',
      displayName: 'Emberwake Plot',
      location: { sectorId: 'sector_rhea_cinder', poiId: 'poi_claim_emberwake' },
      lines: [
        { id: 'ew_01', text: 'A corner lot off the Cinder Claim. The flare took the timbers and the assay office together.' },
        { id: 'ew_02', text: 'The Claim bought ore trucks after. The corner lot was never re-filed.' },
        { id: 'ew_03', text: 'Scorched stakes at regulation spacing. The burn read the survey before the surveyor did.' },
      ],
    },
    {
      id: 'haumea_glass_harp',
      displayName: 'The Glass Harp',
      location: { sectorId: 'sector_haumea_rift', poiId: 'world_site_haumea_glass_harp' },
      lines: [
        { id: 'ghp_01', text: 'Three bent chords strung across the fissure\u2019s throat. It sounds when the crack shifts.' },
        { id: 'ghp_02', text: 'The Observatory logs every note and files the harp as an instrument it did not order.' },
        { id: 'ghp_03', text: 'Each chord is a real free mass pretending to be a string. The last one ends the music.' },
      ],
    },
    {
      id: 'nereid_ship_in_ice',
      displayName: 'The Ship Inside the Ice',
      location: { sectorId: 'sector_nereid_shoal', poiId: 'world_site_nereid_ship_in_ice' },
      lines: [
        { id: 'sii_01', text: 'A whole keel inside the floe, grown into the ice like a set bone.' },
        { id: 'sii_02', text: 'The rime keeps it pristine. The shoal keeps it catalogued under weather.' },
        { id: 'sii_03', text: 'Salvors cut the seam once and stopped. The shore cradle is still waiting.' },
      ],
    },
    {
      id: 'nereid_shoal_exchange',
      displayName: 'Shoal Exchange Rock',
      location: { sectorId: 'sector_nereid_shoal', poiId: 'poi_claim_shoal_exchange' },
      lines: [
        { id: 'sx_01', text: 'One scale, same shift: ice crews and the Shoal Claim settling under the Collective\u2019s cut.' },
        { id: 'sx_02', text: 'It outlived two waystation managers and every indoor-market proposal on file.' },
        { id: 'sx_03', text: 'The rock is the referee because the rock never left. That is the whole charter.' },
      ],
    },
    {
      id: 'eunomia_stepwell',
      displayName: 'The Stepwell',
      location: { sectorId: 'sector_eunomia_gulf', poiId: 'world_site_eunomia_stepwell' },
      lines: [
        { id: 'swl_01', text: 'Two ballast steps sunk into the band like a stair built for weather.' },
        { id: 'swl_02', text: 'The gulf recoils on a schedule the steps interrupt. Nobody signed the plumbing.' },
        { id: 'swl_03', text: 'The Understory gardens around it. Whatever it steps down to stays unlisted.' },
      ],
    },
    {
      id: 'sedna_far_ledger',
      displayName: 'Far Ledger',
      location: { sectorId: 'sector_sedna_dark', poiId: 'poi_claim_far_ledger' },
      lines: [
        { id: 'fld_01', text: 'A plinth of filed claims the registries refused: plates, bearers, debts in hull-mark.' },
        { id: 'fld_02', text: 'The survey post reads every entry and amends none. Reading is not agreeing.' },
        { id: 'fld_03', text: 'Every line is honored. Nobody has survived dishonoring one to contest the custom.' },
      ],
    },
    {
      id: 'dione_wayline',
      displayName: 'Wayline Charter',
      location: { sectorId: 'sector_dione_lane', poiId: 'poi_claim_wayline' },
      lines: [
        { id: 'wl_01', text: 'A chartered berth where convoys formed before the customs read. The clock still runs.' },
        { id: 'wl_02', text: 'Concord moved the scan line half a lane inward. The charter did not move with it.' },
        { id: 'wl_03', text: 'The formation marks are still painted. Convoys form at the Exchange now, on newer paint.' },
      ],
    },
  ],
});
