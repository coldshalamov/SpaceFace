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
//   needsCargoFamily — optional gate on the ACTUAL hauled commodity's moral family
//                 (COMMODITY_MORAL_TAGS, src/data/commodityMoralTags.js). An arms-class trap
//                 requires a military hold; the counterfeit lie requires humanitarian relief in
//                 the hold; the stolen-air lie requires contraband; the grave lie requires
//                 industrial ore. A trap whose family contradicts the hold is forbidden — the
//                 lie is about the specific crates aboard, never a generic voice. Passenger
//                 traps carry no family gate (a person is not a commodity).
//   revealAt    — when the reveal fires: 'mid_run' (after accept, on first scan/proximity cue)
//   revealLine  — the one-line comms reveal (the moment of truth)
//   revealLineNamed / patrolRevealLineNamed / promptNamed — the PASSENGER variant: the same
//                 moment with {name} interpolated, so the fugitive trap is about the person the
//                 run made real. attachTrap prefers these when the offer carries a minted
//                 passenger identity; the static lines stay the no-name fallback.
//   patrolRevealLine — the WITNESSED variant, spoken when the reveal lands under a live law
//                 sweep (patrol:proximity — a real cutter alongside running the hold): the
//                 patrol is inside the fiction, and the fork stands with it there. Falls back
//                 to revealLine when absent.
//   choice      — { prompt, options:[{id,label,blurb,settle,consequence}] } — the binary choice
//   settle      — 'continue': the job still runs to normal settlement (the rep mark lands now, the
//                 pay lands at delivery — "keep the pay" is literal). 'end': the contract is broken
//                 NOW through missions' own abandon path — poster penalty and forfeit included.
//   consequence — for EACH option: { channel: 'rep'|'credits'|'contraband', factionId?, delta?, amount? }
//                 channel='contraband' reuses the shipped runScan bust path. A credits channel on a
//                 'continue' option is never granted upfront — that would double-pay at settlement.

import { COMMODITY_MORAL_TAGS } from './commodityMoralTags.js';

export const MORAL_TRAPS = Object.freeze({
  // Cargo-is-weapons: the "industrial equipment" is arms for a faction the player may not back.
  // Family gate: the lie only lands on a military-class hold (weapons/munitions/charges).
  cargo_is_weapons: Object.freeze({
    id: 'cargo_is_weapons',
    fitsTypes: Object.freeze(['smuggling_run', 'cargo_delivery']),
    needsCargoFamily: 'military',
    revealAt: 'mid_run',
    revealLine: 'The manifest was sealed — but the crate shifted, and what you saw wasn\'t industrial equipment. These are weapons.',
    patrolRevealLine: 'Under the patrol\'s sweep the crate shifts again — that is not industrial equipment, and the cutter alongside knows it too.',
    choice: Object.freeze({
      prompt: 'The cargo is weapons, not equipment. What do you do?',
      options: Object.freeze([
        Object.freeze({
          id: 'deliver', label: 'Deliver as agreed', blurb: 'Arms reach their buyer. You keep the pay — and a quiet faction\'s approval.',
          settle: 'continue',
          consequence: Object.freeze({ channel: 'credits', amount: 1.0, repChannel: 'faction_quiet', repDelta: 5 }),
        }),
        Object.freeze({
          id: 'divert', label: 'Divert to Concord', blurb: 'Hand the arms to a Concord patrol. You lose the pay but earn lawful standing.',
          settle: 'end',
          consequence: Object.freeze({ channel: 'rep', repChannel: 'faction_scn', repDelta: 12 }),
        }),
      ]),
    }),
  }),

  // Passenger-is-fugitive: the "diplomat" is wanted — and now the lie is about a NAMED person:
  // the named variants interpolate the offer's minted passenger identity ({name} tokens).
  passenger_is_fugitive: Object.freeze({
    id: 'passenger_is_fugitive',
    fitsTypes: Object.freeze(['passenger_transport']),
    revealAt: 'mid_run',
    revealLine: 'The passenger\'s credentials don\'t scan. The face on the Concord bulletin matches. They\'re a fugitive.',
    revealLineNamed: '{name}\'s credentials don\'t scan clean. The face on the Concord bulletin is {name}. Your passenger is a fugitive.',
    patrolRevealLine: 'The patrol sweep pings your hull and your passenger\'s forged credentials go pale — the bulletin face is in your hold, and the cutter is alongside.',
    patrolRevealLineNamed: 'The patrol sweep pings your hull and {name}\'s forged credentials go pale — the bulletin face is in your cabin, and the cutter is alongside.',
    promptNamed: 'Your passenger {name} is a wanted fugitive. What do you do?',
    choice: Object.freeze({
      prompt: 'Your passenger is a wanted fugitive. What do you do?',
      options: Object.freeze([
        Object.freeze({
          id: 'harbor', label: 'Honor the passage', blurb: 'You ferry them to safety. Frontier goodwill — and Concord heat if scanned.',
          settle: 'continue',
          consequence: Object.freeze({ channel: 'rep', repChannel: 'faction_free', repDelta: 10 }),
        }),
        Object.freeze({
          id: 'turn_in', label: 'Signal Concord', blurb: 'Turn them in for the bounty. Credits now — and a name the Frontier won\'t forget.',
          settle: 'end',
          consequence: Object.freeze({ channel: 'credits', amount: 1.5, repChannel: 'faction_free', repDelta: -15 }),
        }),
      ]),
    }),
  }),

  // Medicine-is-counterfeit: the relief cargo is fake — running it poisons the relief effort.
  // Family gate: the purity check is a lie only about humanitarian cargo in the hold.
  medicine_is_counterfeit: Object.freeze({
    id: 'medicine_is_counterfeit',
    fitsTypes: Object.freeze(['cargo_delivery', 'smuggling_run']),
    needsCargoFamily: 'humanitarian',
    revealAt: 'mid_run',
    revealLine: 'You ran the standard purity check. Half these doses are inert filler. The relief cargo is counterfeit.',
    patrolRevealLine: 'While the patrol sweep holds you, you crack a vial on the excuse: half the doses are inert filler. The relief cargo is counterfeit.',
    choice: Object.freeze({
      prompt: 'The medicine is counterfeit. What do you do?',
      options: Object.freeze([
        Object.freeze({
          id: 'deliver', label: 'Deliver anyway', blurb: 'The station gets useless cargo. You keep the pay — but the Frontier remembers.',
          settle: 'continue',
          consequence: Object.freeze({ channel: 'credits', amount: 1.0, repChannel: 'faction_free', repDelta: -20 }),
        }),
        Object.freeze({
          id: 'dump', label: 'Dump and report', blurb: 'Jettison the fakes, name the supplier. You lose the pay but the relief effort lives.',
          settle: 'end',
          consequence: Object.freeze({ channel: 'rep', repChannel: 'faction_free', repDelta: 8 }),
        }),
      ]),
    }),
  }),

  // Air-is-owed: the sealed atmo canisters are diverted relief. Delivering them poisons the Pit’s ledger.
  // Closes audit II.2 (named beneficiary this cycle): MTS holds the short; the canisters widen it.
  // Family gate: stolen relief air is a contraband-class hold (narcotics/stolen goods lanes).
  air_is_owed: Object.freeze({
    id: 'air_is_owed',
    fitsTypes: Object.freeze(['smuggling_run', 'cargo_delivery']),
    needsCargoFamily: 'contraband',
    revealAt: 'mid_run',
    revealLine: 'The canister seals match a Pit relief batch withdrawn three cycles ago. This is rebreathed air sold back to the station that was promised it.',
    patrolRevealLine: 'The patrol\'s sweep rattles the canister racks, and the seals it paints match a Pit relief batch withdrawn three cycles ago — rebreathed air, sold back to the station promised it.',
    choice: Object.freeze({
      prompt: 'The air was stolen from the people waiting for it. What do you do?',
      options: Object.freeze([
        Object.freeze({
          id: 'deliver', label: 'Deliver to the buyer', blurb: 'The Pit pays twice for its own air. You keep the margin. Meridian’s Clear-Air position widens.',
          settle: 'continue',
          consequence: Object.freeze({ channel: 'credits', amount: 1.2, repChannel: 'faction_mts', repDelta: 6 }),
        }),
        Object.freeze({
          id: 'return', label: 'Divert to the Pit dock', blurb: 'Hand the canisters to the station they were stolen from. No pay. The Pit breathes one cycle longer.',
          settle: 'end',
          consequence: Object.freeze({ channel: 'rep', repChannel: 'faction_dmc', repDelta: 14 }),
        }),
      ]),
    }),
  }),

  // Ore-is-mass-grave: the “refined slurry” is ballast from a shaft collapse that killed nine.
  // Closes audit II.1 (close the arithmetic): the 0.7t moisture-loss column is the cover for the dead.
  // Family gate: the assay lie only lands on an industrial-class hold (ores/refined/metals).
  ore_is_mass_grave: Object.freeze({
    id: 'ore_is_mass_grave',
    fitsTypes: Object.freeze(['cargo_delivery', 'smuggling_run']),
    needsCargoFamily: 'industrial',
    revealAt: 'mid_run',
    revealLine: 'The slurry assay reads organic. Two crew from Shaft 7 are still listed as 0.7t moisture loss. This ore is the column that hides them.',
    patrolRevealLine: 'The patrol\'s hold x-ray reads the slurry as organic. Two crew from Shaft 7 are still filed as 0.7t moisture loss — this is the column that hides them, and the cutter is watching you read it.',
    choice: Object.freeze({
      prompt: 'The cargo is the cover for two dead miners. What do you do?',
      options: Object.freeze([
        Object.freeze({
          id: 'deliver', label: 'Deliver as logged', blurb: 'The moisture-loss column stands. The two stay filed as tonnes. Drift remembers, and so does the ledger.',
          settle: 'continue',
          consequence: Object.freeze({ channel: 'credits', amount: 1.0, repChannel: 'faction_dmc', repDelta: -18 }),
        }),
        Object.freeze({
          id: 'reweigh', label: 'Reweigh and refile', blurb: 'Strip the moisture-loss line and log the two by name. The ore contract is broken. The dead leave the column.',
          settle: 'end',
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

/**
 * Does a trap fit the ACTUAL hauled commodity? A trap with needsCargoFamily attaches only when
 * the hold's commodity carries that moral family (COMMODITY_MORAL_TAGS is the one source of
 * truth). Untagged cargo is amoral — no cargo-familied trap may lie about it. Traps without a
 * family gate (the passenger trap — a person is not a commodity) always fit this check.
 */
export function trapFitsCargoFamily(trap, cmdtyId) {
  if (!trap || !trap.needsCargoFamily) return true;
  if (!cmdtyId) return false;
  return COMMODITY_MORAL_TAGS[cmdtyId] === trap.needsCargoFamily;
}

export default MORAL_TRAPS;
