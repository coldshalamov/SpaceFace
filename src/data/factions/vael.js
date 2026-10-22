export const faction = {
  id: 'faction_vael', name: 'The Vael', short: 'Vael', color: '#2FCFA0',
  personality: 'xenophobic', startingRep: -120,
  homeSectors: ['sector_veil_nebula', 'sector_ashfall_reach'],
  controls: ['far-rim sectors', 'exotic tech', 'unique commodities'],
  fleetClass: 'contractual', // Vael are HUMAN (alien-ecology doc 12): contractual far-rim culture, not an alien species
  relations: { faction_scn: -0.5, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0, faction_quiet: 0.0, faction_free: 0.0, faction_choir: -0.6, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_vael"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#2FCFA0', secondary: '#0A5040', accent: '#80EED0',
    hull: '#204840', emissive: '#2FCFA0', thruster: '#40FFB8',
  },
  shipRoles: [
    { role: 'research-courier', weight: 0.3, hullIds: ['ship_kestrel', 'ship_drifter', 'ship_ranger'] },
    { role: 'override-tender', weight: 0.25, hullIds: ['ship_pelican', 'ship_mule'] },
    { role: 'vael-lance', weight: 0.25, hullIds: ['ship_wasp', 'ship_hornet', 'ship_bastion'] },
    { role: 'vael-ark', weight: 0.2, hullIds: ['ship_atlas', 'ship_colossus', 'ship_leviathan'] },
  ],
  illegalCommodities: [],
  custom: {
    carefulInstrumentHeavyNeverAggressive: true,
    liensArePhysical: true,            // debts become mass clamped to your hull
    remembersEveryOverride: true,
    contractTextEtchedOnHulls: true,   // zoom in and you can read page 9
  },
  voiceRegister: 'xenophobic',
};

// ── W-VAEL (build_map §34.5 row 524, expansion bible 02 §6) ─────────────────────────────
// "They didn't modify the workers. They modified the terms of the workers."
// The runtime owner is src/systems/faction_vael.js (manifest id 'vaelLiens').

// The Lien Anchor: a contract clamp that adds mass — telegraphed, contract jobs only,
// and transferable by throwing it (LOG: `LIEN TRANSFERRED`).
export const VAEL_LIEN = Object.freeze({
  anchorMass: 55,             // tonnes clamped to the hull — Katamari in reverse
  clampRange: 700,            // the tender must be this close to serve the lien
  telegraphS: 4,              // "Voluntary. Standard terms." — a readable wind-up
  contractJobsOnly: true,     // the lien only bites inside contract work
  flingSpeedMin: 24,          // throw the anchor at least this fast to pass the debt on
  transferToHostilesOnly: true,
  payoffPerTonne: 40,         // credits per clamped tonne to settle the addendum
  cutLooseRepLoss: -12,       // cutting the clamp free is legal, and they remember it
  transferLogTemplate: 'LIEN TRANSFERRED: {name} NOW OWES THE VAEL.',
  clampLine: 'Voluntary. Standard terms.',
  telegraphLine: 'Page nine.',
  payoffLine: 'Addendum settled. The Vael invoice your punctuality.',
});

// E-18 Page Nine: mid-job, the addendum activates and a Lien Anchor clamps on.
export const VAEL_PAGE_NINE = Object.freeze({
  id: 'E-18',
  sectors: Object.freeze(['sector_veil_nebula', 'sector_ashfall_reach']),
  armLine: 'The addendum reaches farther than the job does.',
});

// Signature toy: the Override Head — while the Line holds a ship you fire ITS thrusters.
export const VAEL_OVERRIDE_HEAD = Object.freeze({
  id: 'head_override',
  name: 'Override Head',
  thrustAccel: 90,            // the held ship's own engines answer your helm
  line: 'Standard terms. Their engines are yours now.',
});

// Contract text is etched into hull panels in tiny type — readable on close scan.
export const VAEL_HULL_SCRIPT = Object.freeze({
  scanLine: 'HULL SCRIPT · contract addenda etched at 2pt — page 9 legible at this range',
  pageNineTeaser: '…the party of the ninth part assumes all mass, momentum and consequence…',
});

export const VAEL_BARKS = Object.freeze({
  terms: 'Voluntary. Standard terms.',
  pageNine: 'Page nine.',
  reach: 'The addendum reaches farther than the job does.',
  transferred: 'The debt found a new name. Paperwork follows.',
});

export default faction;
