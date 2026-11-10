export const faction = {
  id: 'faction_choir', name: 'Ascendant Choir', short: 'Choir', color: '#E85FD0',
  personality: 'zealot', startingRep: 0,
  homeSectors: ['sector_vesta_forge'],
  controls: ['fortified zealot sectors', 'relic shrines'],
  fleetClass: 'mercenary',
  relations: { faction_scn: 0.3, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: -0.35, faction_quiet: 0.0, faction_vael: -0.6, faction_free: -0.2, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_choir"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#E85FD0', secondary: '#702060', accent: '#F8A0E8',
    hull: '#905080', emissive: '#E85FD0', thruster: '#FF80E8',
  },
  shipRoles: [
    { role: 'chorister-wing', weight: 0.4, hullIds: ['ship_wasp', 'ship_hornet', 'ship_drifter'] },
    { role: 'pilgrim-transport', weight: 0.3, hullIds: ['ship_mule', 'ship_pelican', 'ship_ranger'] },
    { role: 'cathedral-hull', weight: 0.15, hullIds: ['ship_bastion', 'ship_colossus', 'ship_leviathan'] },
    { role: 'bell-ship', weight: 0.1, hullIds: ['ship_ranger', 'ship_bastion'], source: 'wreck_choir_tender' },
    { role: 'censer', weight: 0.05, hullIds: ['ship_mule', 'ship_drifter'] },
  ],
  illegalCommodities: [],
  custom: {
    resonators: true,
    relicRecovery: true,
    remembersSacrilege: true,
    ribbonsAndChantLights: true,
  },
  voiceRegister: 'zealot',
};

// ── W-CHOIR (build_map §34.5 row 528, expansion bible 02 §8) ────────────────────────────
// "The relic reports home. The shrine is home." Bells are resonators: their pulses make
// crystal hum and then shatter, and thrown crystal chains. The runtime owner is
// src/systems/faction_choir.js (manifest id 'choirResonance').

// E-23 Bell Shatter: a Bell pulses on a beat; crystal inside the field hums, then
// shatters; a shatter hums any crystal near it — throw crystal at a Bell for chains.
export const CHOIR_BELLS = Object.freeze({
  id: 'E-23',
  pulsePeriodS: 6,
  pulseRadius: 620,        // the resonance field reaches this far from the Bell
  humDurationS: 2,         // crystal hums this long before it lets go
  chainRadius: 160,        // a shattering crystal hums crystal this near it
  chainHumS: 1,            // chained crystal lets go faster — the chain reads as acceleration
  shatterShardCount: 4,    // fragments each shattered crystal leaves behind
  sectors: Object.freeze(['sector_vesta_forge']),
  pulseLine: 'The bell speaks. The field answers.',
  shatterLine: 'The crystal sings — once.',
});

// The ribbons: every pulse trails cloth from the bell-mouth. Presentation reads the
// `choir:bellPulse` event; this is the authored look it dresses.
export const CHOIR_RIBBONS = Object.freeze({
  ribbonCount: 6,
  ribbonLengthScale: 1.4,
  chantLightPulse: true,
  palette: { cloth: '#F8A0E8', bronze: '#B88030', chant: '#E85FD0' },
});

// E-22 The Carried Relic: a certified relic in your hold reports home. Inside a shrine's
// reach it pings your position to every Choir ship — crack the casing against a rock
// above impact speed before the shrine radius, or arrive with the whole choir behind you.
export const CHOIR_CARRIED_RELIC = Object.freeze({
  id: 'E-22',
  pingPeriodS: 3,
  pingRadius: 2400,        // within this of a shrine, the relic starts reporting
  shrineRadius: 800,       // cross this sealed and the choir is behind you
  crackImpactSpeed: 55,    // casing gives way on a rock hit this hard or harder
  sealedLine: 'The relic reports home.',
  crackLine: 'The casing gives. The reporting stops.',
  alarmLine: 'The shrine is home.',
});

// Signature toy: the Bell Head — whatever your Line slams rings, and the ring is a pulse
// that shatters nearby crystal.
export const CHOIR_BELL_HEAD = Object.freeze({
  id: 'head_bell',
  name: 'Bell Head',
  ringMinImpactSpeed: 40,
  ringRadius: 480,
  ringCooldownS: 0.5,      // one ring per half-second per head — a slam, not a buzz
  humDurationS: 1.5,       // a head-rung crystal lets go faster than a ship pulse
  line: 'Anything the Line slams rings. Crystal answers.',
});

// The mark they leave: shrines pile up the relics you brought, and the Choir keeps the
// sacrilege ledger.
export const CHOIR_SHRINE = Object.freeze({
  tributeRecord: 'choir_shrine_tribute',
  sacrilegeRepLoss: -25,
});

// The Choir's holy furniture, per sector. The runtime owner (faction_choir.js) raises
// these bodies when the player flies the sector: shrines (sanctuary, tithe, pilgrim
// legs, heresy), bells (E-23 resonance) and one sealed relic (E-22) to recover. `pos`
// is sector-local; each run jitters it by up to `jitterR` from a hash of the run seed
// and site id, so a sector reads the same on every visit of one run. Bells sit
// well clear of the crystal field (pulseRadius + field radius) so they do not eat
// the field — crystal is brought to a bell. The relic sits beyond pingRadius of
// every shrine so it only reports home once someone carries it in.
export const CHOIR_SITES = Object.freeze({
  jitterR: 120,
  reraiseS: 900,           // a slain shrine or bell is re-raised this long after it fell
  scanGapS: 1,             // presence scan cadence (simTime)
  sectors: Object.freeze({
    sector_vesta_forge: Object.freeze({
      shrines: Object.freeze([
        Object.freeze({ id: 'shrine_vesta_first_chord', name: 'SHRINE OF THE FIRST CHORD',
          pos: Object.freeze({ x: -1900, z: 1500 }), radius: 46, hull: 1600,
          scanLabel: 'SHRINE OF THE FIRST CHORD · holy ground — the laden owe a tithe' }),
        Object.freeze({ id: 'shrine_vesta_slag_psalm', name: 'SHRINE OF THE SLAG PSALM',
          pos: Object.freeze({ x: 2200, z: -300 }), radius: 46, hull: 1600,
          scanLabel: 'SHRINE OF THE SLAG PSALM · holy ground — the laden owe a tithe' }),
      ]),
      bells: Object.freeze([
        Object.freeze({ id: 'bell_vesta_first_chord', name: 'THE FIRST CHORD BELL',
          pos: Object.freeze({ x: -1500, z: 2100 }), radius: 22, hull: 900,
          scanLabel: 'CHOIR BELL · its pulse shatters crystal — throw crystal in its field' }),
        Object.freeze({ id: 'bell_vesta_slag_psalm', name: 'THE SLAG PSALM BELL',
          pos: Object.freeze({ x: 2500, z: 300 }), radius: 22, hull: 900,
          scanLabel: 'CHOIR BELL · its pulse shatters crystal — throw crystal in its field' }),
      ]),
      relics: Object.freeze([
        Object.freeze({ id: 'relic_vesta_helios_approach', name: 'SEALED CHOIR RELIC',
          pos: Object.freeze({ x: 300, z: -2600 }), radius: 6, mass: 10, hull: 40,
          scanLabel: 'SEALED CHOIR RELIC · it reports home near a shrine — crack the casing on a rock' }),
      ]),
    }),
  }),
});

export const CHOIR_BARKS = Object.freeze({
  dormant: 'Dormant. No signal.',
  home: 'The shrine is home.',
  cracked: 'The casing gives. The reporting stops.',
  shatter: 'The crystal sings — once.',
});

export default faction;
