// moralTraps.js — BP-12 packet MORAL_TRAP_CONTRACTS ("The Job That Isn't What It Says") — DATA.
//
// The "medicine" I'm hauling is counterfeit; the passenger is a fugitive. I learn the truth mid-run
// and choose. A trap overlay attaches to a qualifying offer (smuggling/passenger), fires its reveal
// ONCE mid-run, and presents a BINARY CHOICE via the existing wreckMissions `choice` shape.
//
// CRITICAL DISCIPLINE (the packet's failure modes, enforced structurally):
//   • Each option routes to a DISTINCT shipped consequence — rep, credits, or contraband bust — never
//     two options with no mechanical difference (the named failureMode). The `consequence` field
//     names the shipped channel each option resolves through; the system EMITS the intent, the
//     shipped layer applies it.
//   • The choice uses the EXACT wreckMissions shape { prompt, options:[{id,label,blurb}] } so the
//     existing choice UI consumes it unchanged. `consequence` is additive metadata (not in the
//     shipped shape) the system reads to route the result.
//   • Traps only attach to qualifying offer TYPES (smuggling_run / passenger_transport). A trap that
//     doesn't fit the offer is forbidden.
//   • Low-probability attach (hash32(seed, offerId, 'trap')) — traps are a treat, not every run.
//
// Each trap:
//   id          — stable trap id
//   fitsTypes   — offer types this trap can attach to
//   revealAt    — when the reveal fires: 'mid_run' (after accept, on first scan/proximity cue)
//   revealLine  — the one-line comms reveal (the moment of truth)
//   choice      — { prompt, options:[{id,label,blurb,consequence}] } — the binary choice
//   consequence — for EACH option: { channel: 'rep'|'credits'|'contraband', factionId?, delta?, amount? }
//                 channel='contraband' reuses the shipped runScan bust path.

export const MORAL_TRAPS = Object.freeze({
  // Cargo-is-weapons: the "industrial equipment" is arms for a faction the player may not back.
  cargo_is_weapons: Object.freeze({
    id: 'cargo_is_weapons',
    fitsTypes: Object.freeze(['smuggling_run', 'cargo_delivery']),
    revealAt: 'mid_run',
    revealLine: 'The manifest was sealed — but the crate shifted, and what you saw wasn\'t industrial equipment. These are weapons.',
    choice: Object.freeze({
      prompt: 'The cargo is weapons, not equipment. What do you do?',
      options: Object.freeze([
        Object.freeze({
          id: 'deliver', label: 'Deliver as agreed', blurb: 'Arms reach their buyer. You keep the pay — and a quiet faction\'s approval.',
          consequence: Object.freeze({ channel: 'credits', amount: 1.0, repChannel: 'faction_quiet', repDelta: 5 }),
        }),
        Object.freeze({
          id: 'divert', label: 'Divert to Concord', blurb: 'Hand the arms to a Concord patrol. You lose the pay but earn lawful standing.',
          consequence: Object.freeze({ channel: 'rep', repChannel: 'faction_scn', repDelta: 12 }),
        }),
      ]),
    }),
  }),

  // Passenger-is-fugitive: the "diplomat" is wanted.
  passenger_is_fugitive: Object.freeze({
    id: 'passenger_is_fugitive',
    fitsTypes: Object.freeze(['passenger_transport']),
    revealAt: 'mid_run',
    revealLine: 'The passenger\'s credentials don\'t scan. The face on the Concord bulletin matches. They\'re a fugitive.',
    choice: Object.freeze({
      prompt: 'Your passenger is a wanted fugitive. What do you do?',
      options: Object.freeze([
        Object.freeze({
          id: 'harbor', label: 'Honor the passage', blurb: 'You ferry them to safety. Frontier goodwill — and Concord heat if scanned.',
          consequence: Object.freeze({ channel: 'rep', repChannel: 'faction_free', repDelta: 10 }),
        }),
        Object.freeze({
          id: 'turn_in', label: 'Signal Concord', blurb: 'Turn them in for the bounty. Credits now — and a name the Frontier won\'t forget.',
          consequence: Object.freeze({ channel: 'credits', amount: 1.5, repChannel: 'faction_free', repDelta: -15 }),
        }),
      ]),
    }),
  }),

  // Medicine-is-counterfeit: the relief cargo is fake — running it poisons the relief effort.
  medicine_is_counterfeit: Object.freeze({
    id: 'medicine_is_counterfeit',
    fitsTypes: Object.freeze(['cargo_delivery', 'smuggling_run']),
    revealAt: 'mid_run',
    revealLine: 'You ran the standard purity check. Half these doses are inert filler. The relief cargo is counterfeit.',
    choice: Object.freeze({
      prompt: 'The medicine is counterfeit. What do you do?',
      options: Object.freeze([
        Object.freeze({
          id: 'deliver', label: 'Deliver anyway', blurb: 'The station gets useless cargo. You keep the pay — but the Frontier remembers.',
          consequence: Object.freeze({ channel: 'credits', amount: 1.0, repChannel: 'faction_free', repDelta: -20 }),
        }),
        Object.freeze({
          id: 'dump', label: 'Dump and report', blurb: 'Jettison the fakes, name the supplier. You lose the pay but the relief effort lives.',
          consequence: Object.freeze({ channel: 'rep', repChannel: 'faction_free', repDelta: 8 }),
        }),
      ]),
    }),
  }),

  // Air-is-owed: the sealed atmo canisters are diverted relief. Delivering them poisons the Pit’s ledger.
  // Closes audit II.2 (named beneficiary this cycle): MTS holds the short; the canisters widen it.
  air_is_owed: Object.freeze({
    id: 'air_is_owed',
    fitsTypes: Object.freeze(['smuggling_run', 'cargo_delivery']),
    revealAt: 'mid_run',
    revealLine: 'The canister seals match a Pit relief batch withdrawn three cycles ago. This is rebreathed air sold back to the station that was promised it.',
    choice: Object.freeze({
      prompt: 'The air was stolen from the people waiting for it. What do you do?',
      options: Object.freeze([
        Object.freeze({
          id: 'deliver', label: 'Deliver to the buyer', blurb: 'The Pit pays twice for its own air. You keep the margin. Meridian’s Clear-Air position widens.',
          consequence: Object.freeze({ channel: 'credits', amount: 1.2, repChannel: 'faction_mts', repDelta: 6 }),
        }),
        Object.freeze({
          id: 'return', label: 'Divert to the Pit dock', blurb: 'Hand the canisters to the station they were stolen from. No pay. The Pit breathes one cycle longer.',
          consequence: Object.freeze({ channel: 'rep', repChannel: 'faction_dmc', repDelta: 14 }),
        }),
      ]),
    }),
  }),

  // Ore-is-mass-grave: the “refined slurry” is ballast from a shaft collapse that killed nine.
  // Closes audit II.1 (close the arithmetic): the 0.7t moisture-loss column is the cover for the dead.
  ore_is_mass_grave: Object.freeze({
    id: 'ore_is_mass_grave',
    fitsTypes: Object.freeze(['cargo_delivery', 'smuggling_run']),
    revealAt: 'mid_run',
    revealLine: 'The slurry assay reads organic. Two crew from Shaft 7 are still listed as 0.7t moisture loss. This ore is the column that hides them.',
    choice: Object.freeze({
      prompt: 'The cargo is the cover for two dead miners. What do you do?',
      options: Object.freeze([
        Object.freeze({
          id: 'deliver', label: 'Deliver as logged', blurb: 'The moisture-loss column stands. The two stay filed as tonnes. Drift remembers, and so does the ledger.',
          consequence: Object.freeze({ channel: 'credits', amount: 1.0, repChannel: 'faction_dmc', repDelta: -18 }),
        }),
        Object.freeze({
          id: 'reweigh', label: 'Reweigh and refile', blurb: 'Strip the moisture-loss line and log the two by name. The ore pays less. The dead leave the column.',
          consequence: Object.freeze({ channel: 'rep', repChannel: 'faction_dmc', repDelta: 16 }),
        }),
      ]),
    }),
  }),
});

/** All trap ids. */
export const TRAP_IDS = Object.freeze(Object.keys(MORAL_TRAPS));

/** Lookup a trap by id (frozen record or undefined). */
export function trapById(id) {
  return MORAL_TRAPS[id];
}

/** Does a trap fit an offer type? */
export function trapFitsOfferType(trap, offerType) {
  return !!(trap && trap.fitsTypes && trap.fitsTypes.includes(offerType));
}

export default MORAL_TRAPS;
