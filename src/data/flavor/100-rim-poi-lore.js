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
  ],
});
