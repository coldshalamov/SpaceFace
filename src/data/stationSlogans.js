// Plan 29 station slogans: pure authored copy keyed by canonical station id.
// These are used by station render signage and repeated by the bar barkeep.

export const STATION_SLOGANS = Object.freeze({
  station_helios: 'You Are Leaving.',
  station_coalition: 'Clean berth. Clean record.',
  station_ceres: 'Weigh twice. Burn once.',
  station_beltout: 'Ore in. Names out.',
  station_tethys: 'Every cargo has two prices.',
  station_customs: 'Keep your seal visible.',
  station_forge: 'Bring alloy. Leave with parts.',
  station_depot3: 'Fuel first. Questions later.',
  station_drift: 'Dock light. Leave lighter.',
  station_smuggler: 'No manifest. No sermon.',
  station_reach: 'Pay the lane. Keep the hull.',
  station_expanse: 'Deep cuts. Honest weights.',
  station_sker: 'Vouched, or you are cargo.',
  station_veil: 'Readings first. Comfort never.',
  station_ashcache: 'Buy what should not exist.',
  station_nyx_march: 'Quiet papers end here.',
  station_hyperion_cut: 'Different belt. Same shift.',
  station_hyperion_claim: 'Tag the seam. Mind the cut.',
  station_kepler_scar: 'Favors have weight.',
  station_orcus_shadow: 'Admit the scan. Refuse the name.',
  station_rhea_cinder: 'Scorched ore still pays.',
  station_haumea_rift: 'Log it before you believe it.',
  station_eris_margin: 'No names past the hatch.',
  station_phoebe_echo: 'Repeat the signal. Add nothing.',
  station_nereid: 'Open dock. Thin law.',
  station_nereid_claim: 'Ice crews paid same shift.',
  station_proteus: 'Flat rates. No receipts.',
  station_triton: 'Bring data that bites.',
  station_eunomia: 'No fuel. Fewer questions.',
  station_sedna: 'Patch the hull. Keep moving.',
  station_dione: 'Freight clears when the lane does.',
  station_dione_customs: 'Papers before freight.',
});

export function stationSloganFor(stationId) {
  return STATION_SLOGANS[String(stationId || '')] || null;
}

export default STATION_SLOGANS;
