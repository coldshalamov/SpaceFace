// Paper faction (BP-05): content surfaces only, zero ships. Hostility is never
// inferred from factionId alone; scanner.isHostileToPlayer owns that decision.
export const faction = {
  id: 'faction_helix', name: 'Helix Directorate', short: 'Helix', color: '#8B9CB8',
  personality: 'paper', startingRep: 0,
  homeSectors: ['sector_sedna_dark'],
  controls: ['contract allocation', 'variance audits', 'dock-deny paperwork'],
  fleetClass: 'none',
  relations: { faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0, faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_helix"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#8B9CB8', secondary: '#465066', accent: '#C5CEDD',
    hull: '#667085', emissive: '#8B9CB8', thruster: '#A8B7D0',
  },
  shipRoles: [
    { role: 'directorate-courier', weight: 0.38, hullIds: ['ship_kestrel', 'ship_drifter', 'ship_ranger'] },
    { role: 'directorate-security', weight: 0.3, hullIds: ['ship_wasp', 'ship_hornet', 'ship_bastion'] },
    { role: 'directorate-freight', weight: 0.17, hullIds: ['ship_mule', 'ship_atlas', 'ship_ironback'] },
    // Row 526 additions (02 §9 roster): cutters wear false flags; lien drones stick fines
    // to hulls; the audit platform scaffolds a gate shut; 44-C is the boss filing.
    { role: 'adjudicator-cutter', weight: 0.08, hullIds: ['ship_drifter', 'ship_kestrel'] },
    { role: 'lien-drone', weight: 0.05, hullIds: [] },
    { role: 'auditor-frigate', weight: 0.02, hullIds: ['ship_bastion', 'ship_warden'] },
  ],
  illegalCommodities: [],
  custom: {
    // §34 row 526 — Helix identity mechanics (02 §9).
    falseFlag: {
      // They fly TOO PERFECTLY: exact geometry, matched speeds, clean paint. The perfection
      // is the tell. Break the pattern — fling one into the others — and every transponder
      // in the pack flips to HELIX at once.
      patternBreakWu: 70,        // a member thrown this far off its slot breaks the pattern
      masks: ['faction_reach', 'faction_mts'],  // 60% Reach hulls, 40% Meridian papers
    },
    lienDrone: {
      // Small, polite, adhesive: sticks a fine to your hull and files it before you can
      // scrape it off. While stuck it is dead mass on the scale.
      attachWu: 40,
      fileAfterS: 12,            // the lien files itself after this stuck dwell
      fineCr: 150,
      lienMassT: 6,
    },
    gateAuditPlatform: {
      // NEW P1 scaffold: welds a gate shut over several cycles — physically wreckable.
      // (Row 521 owns the audit schedule; this is the platform's physical def.)
      scaffoldHp: 900,
      weldProgressPerCycle: 0.34,
      tetherable: true,
    },
    adjudicator44C: {
      // NEW P2 boss (capital): closes a gate around you. Data hook for the boss table;
      // the fight itself is capital-boss content.
      refId: 'REF 44-C',
      hullClass: 'capital',
      carriesSeizureClamp: true,
    },
    tooPerfectPack: {
      encounterId: 'too_perfect_pack',  // src/data/encounters/703-too-perfect-pack.js (E-10)
    },
  },
  voiceRegister: 'paper',
};

export default faction;
