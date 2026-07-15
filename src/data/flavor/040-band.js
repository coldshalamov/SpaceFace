import { defineFlavorPack } from './catalog.js';

export const flavorOrder = 40;
export const flavorId = 'band';
export const flavorKind = 'radio_scripts';

export default defineFlavorPack({
  id: flavorId,
  kind: flavorKind,
  description: 'Eight Band beds with terse ticker copy for the later radio system.',
  entries: [
    {
      id: 'concord_bulletin', label: 'Concord Bulletin',
      bed: { kind: 'civil_service', pulse: 'teletype', cadence: 'metered', timbre: 'clean_mono' },
      ident: { id: 'concord_ident', text: 'Concord Bulletin. The record remains orderly.' },
      lines: [
        { id: 'concord_01', text: 'Transit delays resolved through mandatory vessel detention.' },
        { id: 'concord_02', text: 'No civilians displaced. Housing eligibility was revised.' },
        { id: 'concord_03', text: 'Atmo allocation remained stable after three sectors closed.' },
        { id: 'concord_04', text: 'Unregistered wreck removed from public navigation records.' },
        { id: 'concord_05', text: 'Concord confirms no incident requiring public concern.' },
        { id: 'concord_06', text: 'Piracy fell after survivor reporting was centralized.' },
        { id: 'concord_07', text: 'Helios Bay Seven passed review. Criteria remain sealed.' },
        { id: 'concord_08', text: 'All submitted corrections remain officially received.' },
      ],
    },
    {
      id: 'the_margin', label: 'The Margin',
      bed: { kind: 'investigative', pulse: 'tuned_knock', cadence: 'close', timbre: 'tape_hiss' },
      ident: { id: 'margin_ident', text: 'The Margin. Send proof. Keep names.' },
      lines: [
        { id: 'margin_01', eventKey: 'player.break_blockade', text: 'Tessera broke the blockade. Concord reports the lane reopened itself.' },
        { id: 'margin_02', text: 'A convoy arrived three ships short. Nobody filed missing.' },
        { id: 'margin_03', eventKey: 'player.clear_lane', text: 'Tessera cleared the lane. Survivors received the invoice.' },
        { id: 'margin_04', eventKey: 'player.dock_heavily_damaged', text: 'The Tessera docked with fresh scars and no statement.' },
        { id: 'margin_05', text: 'Hollow Station counted seventeen hulls. Still no crews.' },
        { id: 'margin_06', eventKey: 'player.destroy_freighter', text: 'Tessera dropped a freighter. Prices followed. Someone planned both.' },
        { id: 'margin_07', eventKey: 'player.cross_vale_closure', text: "Tessera crossed Vale's closure. The people remained inside." },
        { id: 'margin_08', text: 'If you saw it, send proof. Names protected.' },
      ],
    },
    {
      id: 'the_static', label: 'The Static',
      bed: { kind: 'pirate_roast', pulse: 'burst_noise', cadence: 'loose', timbre: 'overdriven' },
      ident: { id: 'static_ident', text: 'The Static. Nobody owns this frequency.' },
      lines: [
        { id: 'static_01', repBand: 'hostile', text: "Reach remembers Tessera's guns. Bring armor, not apologies." },
        { id: 'static_02', text: 'Concord says seizure. Reach says free salvage.' },
        { id: 'static_03', text: 'Meridian lost a hauler and found three invoices.' },
        { id: 'static_04', text: 'Quiet ship passed you. You noticed late.' },
        { id: 'static_05', repBand: 'neutral', text: "Reach knows Tessera's name. Nobody has priced it yet." },
        { id: 'static_06', text: "Patrol lights off. That's confidence or shame." },
        { id: 'static_07', text: 'New bounty posted. Old corpse underneath.' },
        { id: 'static_08', repBand: 'allied', text: 'Tessera drinks free. Anyone objecting can pay in teeth.' },
      ],
    },
    {
      id: 'ballad_line', label: 'The Ballad Line',
      bed: { kind: 'frontier_ballad', pulse: 'engine_hum', cadence: 'human', timbre: 'plucked_strings' },
      ident: { id: 'ballad_ident', text: 'Ballad Line. Keep one light.' },
      lines: [
        { id: 'ballad_01', text: 'White candles lean where no wind can reach.' },
        { id: 'ballad_02', text: 'The Pit kept names the ledger lost.' },
        { id: 'ballad_03', text: 'Borrowed time still pays in scars.' },
        { id: 'ballad_04', text: 'A tollman smiled; the convoy passed.' },
        { id: 'ballad_05', text: 'Seventeen sailed; the dark returned their hulls.' },
        { id: 'ballad_06', text: 'The Thunderchild died. The title crossed the fire.' },
        { id: 'ballad_07', text: 'Old gates remember every borrowed key.' },
        { id: 'ballad_08', text: 'Keep one light for ships that cannot answer.' },
      ],
    },
    {
      id: 'choir_vespers', label: 'Choir Vespers',
      bed: { kind: 'harmonic_drone', pulse: 'subharmonic', cadence: 'slow', timbre: 'stacked_fifths' },
      ident: { id: 'vespers_ident', text: 'Choir Vespers. Enter the Pattern.' },
      lines: [
        { id: 'vespers_01', text: 'One voice enters. The Pattern widens.' },
        { id: 'vespers_02', text: 'Burden becomes offering. Offering becomes ascent.' },
        { id: 'vespers_03', text: 'The dark is not empty. It listens.' },
        { id: 'vespers_04', text: 'A broken hull still keeps its note.' },
        { id: 'vespers_05', text: 'The unrecorded are not the unmade.' },
        { id: 'vespers_06', text: 'At the seventh interval, release your name.' },
        { id: 'vespers_07', text: 'The Choir counts no distance between graves.' },
        { id: 'vespers_08', text: 'Be still. The next chord remembers you.' },
      ],
    },
    {
      id: 'fulfillment_routing', label: 'Fulfillment Routing',
      bed: { kind: 'routing_loop', pulse: 'barcode_chirp', cadence: 'quantized', timbre: 'relay_clicks' },
      ident: { id: 'routing_ident', text: 'FULFILLMENT ROUTING. FOUND. HELD. DELIVERED.' },
      lines: [
        { id: 'routing_01', text: 'FOUND: VESSEL. HELD: ROUTE. DELIVERY: PENDING.' },
        { id: 'routing_02', text: 'UNCLAIMED MASS ENTERED FOR SORTING.' },
        { id: 'routing_03', text: 'DELAY IS A LOCATION. YOU ARE IN IT.' },
        { id: 'routing_04', text: 'OWNER FIELD BLANK. CUSTODY REMAINS VALID.' },
        { id: 'routing_05', text: 'CARGO RING THREE AWAITS A LIVING SIGNATURE.' },
        { id: 'routing_06', text: 'OBSTRUCTION RECLASSIFIED AS INVENTORY.' },
        { id: 'routing_07', text: 'ALL DESTINATIONS EXIST UNTIL DELIVERY.' },
        { id: 'routing_08', text: 'FOUND. HELD. DELIVERED. FOUND AGAIN.' },
      ],
    },
    {
      id: 'numbers_station', label: 'Quiet Numbers',
      bed: { kind: 'numbers_station', pulse: 'four_count', cadence: 'sparse', timbre: 'narrowband_sine' },
      ident: { id: 'numbers_ident', text: 'Quiet numbers. Count doors, not ships.' },
      lines: [
        { id: 'numbers_01', text: 'SEVEN. FOUR. FOUR. HOLD.' },
        { id: 'numbers_02', text: 'NINE LEFT. TWO RETURNED. SAY NOTHING.' },
        { id: 'numbers_03', text: 'PALLAS. ZERO-THREE. BLACK WAKE.' },
        { id: 'numbers_04', text: 'ONE VOICE. SEVENTEEN HULLS. NO NAMES.' },
        { id: 'numbers_05', role: 'unique_wreck_bearing', seeded: true, perSaveCap: 1, text: 'BEARING {bearing}. REPEAT. BEARING {bearing}.' },
        { id: 'numbers_06', text: 'THE THIRD LIGHT LIES.' },
        { id: 'numbers_07', text: 'COUNT DOORS, NOT SHIPS.' },
        { id: 'numbers_08', text: 'CODE ENDS WHEN SOMEONE ANSWERS.' },
      ],
    },
    {
      id: 'landmark_bleed', label: 'Local Bleed', contextual: true, tunable: false,
      bed: { kind: 'landmark_override', pulse: 'proximity', cadence: 'source_bound', timbre: 'carrier_deformation' },
      sourceBehaviors: [
        {
          id: 'quiessence_carrier', sourceId: 'landmark_quiessence', kind: 'ident',
          ident: { id: 'quiessence_ident', text: 'QUIET MEMORIAL: THEY ARE NOT DEAD.' },
        },
        { id: 'hush_carrier', sourceId: 'planet_hush', kind: 'silence' },
      ],
      lines: [
        { id: 'local_quiessence_01', sourceId: 'landmark_quiessence', text: 'Seventeen intact hulls answer only by staying dark.' },
        { id: 'local_quiessence_02', sourceId: 'landmark_quiessence', text: 'Seventeen carrier IDs answer. No transmitters do.' },
        { id: 'local_quiessence_03', sourceId: 'landmark_quiessence', text: 'The violet buoy pulses between station intervals.' },
        { id: 'local_quiessence_04', sourceId: 'landmark_quiessence', text: 'Memorial channel repeats no names.' },
        { id: 'local_hush_01', sourceId: 'planet_hush', text: 'A world-shaped gap enters the receiver.' },
        { id: 'local_hush_02', sourceId: 'planet_hush', text: 'Carrier absent. Static absent. Nothing to tune.' },
        { id: 'local_hush_03', sourceId: 'planet_hush', text: 'Gain rises. The silence stays level.' },
        { id: 'local_hush_04', sourceId: 'planet_hush', text: "Signal resumes beyond the Hush's orbital shadow." },
      ],
    },
  ],
});
