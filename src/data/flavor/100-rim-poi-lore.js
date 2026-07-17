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
  ],
});
