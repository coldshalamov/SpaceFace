// BP-13/B10 Named Crews & Aces.
//
// Pure roster + deterministic readers. Runtime memory lives in systems/aceMemory.js.
import { NAMED_CAPTAINS } from './encounters.js';
import { hash32 } from '../core/rng.js';

const RETURN_MIN_S = 360;
const RETURN_SPAN_S = 420;
export const PIRATE_PROMOTION_MAX_TIER = 3;

const CORE_ROSTER = Object.freeze([
  Object.freeze({
    id: 'ace_yara_no_cut',
    name: 'Yara No-Cut',
    crew: 'Red Latch Crew',
    factionId: 'faction_reach',
    gimmickTag: 'tether-cutter',
    returnArchetype: 'corsair_raider',
    escortArchetype: 'wasp_swarmer',
    baseReturnLevel: 4,
    signatureBark: 'YARA NO-CUT: cargo comes loose, or hull plates do.',
  }),
  Object.freeze({
    id: 'ace_toll_saint_venn',
    name: 'Toll Saint Venn',
    crew: 'Sker Hooks',
    factionId: 'faction_reach',
    gimmickTag: 'toll-lancer',
    returnArchetype: 'lancer_sniper',
    escortArchetype: 'corsair_raider',
    baseReturnLevel: 5,
    signatureBark: 'SKER HOOKS: Saint Venn counts the lane and names the fee.',
  }),
  Object.freeze({
    id: 'ace_mako_broken_ring',
    name: 'Mako of the Broken Ring',
    crew: 'The Empty Ledger',
    factionId: 'faction_reach',
    gimmickTag: 'swarm-screen',
    returnArchetype: 'reaver_pirate',
    escortArchetype: 'wasp_swarmer',
    baseReturnLevel: 4,
    signatureBark: 'Broken Ring: Mako writes debts in engine smoke.',
  }),
]);

// S3 Reach culture aces extend aceMemory through a separate roster so the original B10 export
// remains exactly three entries. Each culture contributes one escalation-capable returning crew.
const REACH_CULTURE_ROSTER = Object.freeze([
  Object.freeze({
    id: 'ace_maw_rake_veyra',
    name: 'Rake Veyra',
    crew: 'The Red Wake',
    factionId: 'faction_reach',
    cultureId: 'maw',
    gimmickTag: 'slash-and-run',
    returnArchetype: 'reaver_pirate',
    escortArchetype: 'wasp_swarmer',
    baseReturnLevel: 5,
    signatureBark: 'THE RED WAKE: count the painted edge. Every hand is a ship that failed to turn.',
  }),
  Object.freeze({
    id: 'ace_rust_lord_orro',
    name: 'Boiler-King Orro',
    crew: 'The Nine Kettles',
    factionId: 'faction_reach',
    cultureId: 'rust-lords',
    gimmickTag: 'tether-scrapline',
    returnArchetype: 'corsair_raider',
    escortArchetype: 'reaver_pirate',
    baseReturnLevel: 5,
    signatureBark: 'NINE KETTLES: nothing leaves the field before Orro weighs the scrap.',
  }),
  Object.freeze({
    id: 'ace_drift_king_iona',
    name: 'Iona False-Face',
    crew: 'The Gilt Masks',
    factionId: 'faction_reach',
    cultureId: 'drift-kings',
    gimmickTag: 'masked-disengager',
    returnArchetype: 'lancer_sniper',
    escortArchetype: 'corsair_raider',
    baseReturnLevel: 5,
    signatureBark: 'GILT MASKS: a courteous distance, captain. We only need the ship intact.',
  }),
]);

// Variety aces (append-only). Kept off CORE_ROSTER so B10 NAMED_ACE_IDS stays three entries.
const VARIETY_ROSTER = Object.freeze([
  Object.freeze({
    id: 'ace_jex_wake_salt',
    name: 'Jex Wake-Salt',
    crew: 'The Salt Wake',
    factionId: 'faction_reach',
    gimmickTag: 'wake-mines',
    returnArchetype: 'mine_layer_jackal',
    escortArchetype: 'pd_screen_escort',
    baseReturnLevel: 4,
    signatureBark: 'SALT WAKE: leave the trail. We already seeded it.',
  }),
  Object.freeze({
    id: 'ace_noll_curtain',
    name: 'Noll of the Curtain',
    crew: 'Curtain Company',
    factionId: 'faction_reach',
    gimmickTag: 'pd-curtain',
    returnArchetype: 'pd_screen_escort',
    escortArchetype: 'corsair_raider',
    baseReturnLevel: 5,
    signatureBark: 'CURTAIN COMPANY: your missiles are a polite request. Denied.',
  }),
  Object.freeze({
    id: 'ace_ves_no_face',
    name: 'Ves No-Face',
    crew: 'Blank Ledger',
    factionId: 'faction_quiet',
    gimmickTag: 'sensor-ghost',
    returnArchetype: 'quiet_ghost',
    escortArchetype: 'lancer_sniper',
    baseReturnLevel: 5,
    signatureBark: 'BLANK LEDGER: you never saw this ship. File that.',
  }),
  Object.freeze({
    id: 'ace_sere_pattern',
    name: 'Sere of the Pattern',
    crew: 'Third Refrains',
    factionId: 'faction_choir',
    gimmickTag: 'slash-and-run',
    returnArchetype: 'choir_zealot',
    escortArchetype: 'choir_zealot',
    baseReturnLevel: 4,
    signatureBark: 'THIRD REFRAINS: the Pattern names you. Answer in fire.',
  }),
  Object.freeze({
    // Named Drift defender: the worker voice gets a face, not just the Reach lane-kingpins.
    // Voss's suspended claim (narrative.js pers_voss_suspended) gets a body behind it.
    id: 'ace_voss_shaft_seven',
    name: 'Voss of Shaft Seven',
    crew: 'The Last Two',
    factionId: 'faction_dmc',
    gimmickTag: 'belt-claimer',
    returnArchetype: 'bruiser_brawler',
    escortArchetype: 'bruiser_brawler',
    baseReturnLevel: 4,
    signatureBark: 'THE LAST TWO: Shaft Seven filed us as moisture. We file you as salvage.',
  }),
  Object.freeze({
    // Reach ace whose arithmetic is the testimony: counts hulls, names the short one.
    id: 'ace_drell_short_fall',
    name: 'Drell Short-Fall',
    crew: 'The Weigh-Slip Open',
    factionId: 'faction_reach',
    gimmickTag: 'tether-cutter',
    returnArchetype: 'corsair_raider',
    escortArchetype: 'wasp_swarmer',
    baseReturnLevel: 5,
    signatureBark: 'WEIGH-SLIP OPEN: four hulls this cycle. You are the one that falls short.',
  }),
]);

// Plan 16's launch contract. The original roster rows above remain the stable identity source used
// by old saves; these overlays supply the player-facing production character without multiplying
// registries. Rewards deliberately reuse the twelve existing salvage-only unique fittings: combat
// can materialize them as real pickups without widening the already-full commodity catalog.
const LAUNCH_ACE_PRODUCTION = Object.freeze({
  ace_yara_no_cut: {
    returnArchetype: 'tether_control_raider',
    appearance: { hullColor: '#5b191e', accentColor: '#f0c35c', finish: 'worn', wear: 0.72, decalId: 'borrowed_time' },
    spawnStory: 'Red Latch grapples still hang from Yara\'s keel; every hook is painted with the registry of a ship she stripped in motion.',
    barStory: 'Dockhands say Yara once cut her own tow before it could drag a hospital barge into a refinery wall. She kept the knife and the debt.',
    gimmick: { id: 'massline-cut', label: 'Latch-Line Raider', mechanic: 'An enemy Massline contests your vector and turns a clean pursuit into a moving anchor fight.', counter: 'Displace her, break the anchor, or win the mass contest.', runtime: 'tether_control_raider' },
    barks: { opening: 'YARA NO-CUT: cargo comes loose, or hull plates do.', return: 'YARA NO-CUT: same hook. Better knot.', flee: 'YARA NO-CUT: keep the scar. I will collect the rest.', playerLoss: 'YARA NO-CUT: I remember where the old hull opened.' },
    reward: { bountyCr: 850, uniqueItemId: 'unique_tideline_tractor', physicalLabel: 'Yara\'s Tideline Tractor', techId: 'ace_tech_cut_line', techLabel: 'Latch-Line Geometry', researchPoints: 18 },
  },
  ace_toll_saint_venn: {
    returnArchetype: 'lancer_sniper',
    appearance: { hullColor: '#24242b', accentColor: '#f5df9a', finish: 'polished', wear: 0.12, decalId: 'concord' },
    spawnStory: 'Venn arrives exactly on the lane centerline, black hull washed clean except for one ivory toll stripe from prow to rail muzzle.',
    barStory: 'Saint Venn never raises a fee after firing. The number he quotes is the distance at which he has already solved your drift.',
    gimmick: { id: 'toll-line', label: 'Toll-Line Shot', mechanic: 'A long-range rail platform repositions outside brawler range and punishes straight approaches.', counter: 'Close under its turn rate, break line of fire, or force a Well clump.', runtime: 'lancer_sniper' },
    barks: { opening: 'SAINT VENN: lane use, one hull. Payment is now due.', return: 'SAINT VENN: the unpaid distance has accrued.', flee: 'SAINT VENN: invoice carried forward.', playerLoss: 'SAINT VENN: your previous account remains open.' },
    reward: { bountyCr: 950, uniqueItemId: 'unique_veil_cutter', physicalLabel: 'Venn\'s Veil-Cutter', techId: 'ace_tech_toll_solution', techLabel: 'Toll-Line Solution', researchPoints: 20 },
  },
  ace_mako_broken_ring: {
    returnArchetype: 'reaver_pirate',
    appearance: { hullColor: '#704126', accentColor: '#e6e1d5', finish: 'satin', wear: 0.55, decalId: 'industrial' },
    spawnStory: 'Mako\'s open-ring mark spans every escort; together the moving hulls close the missing segment around their captain.',
    barStory: 'The Broken Ring is not a mourning sign. Mako leaves one place empty so every recruit knows there is room for the next debtor.',
    gimmick: { id: 'broken-ring', label: 'Broken Ring Screen', mechanic: 'The Reaver calls Wasp reinforcements when pressured, closing a disposable screen around Mako.', counter: 'Remove the captain before the low-hull reinforcement call or punch through the light screen.', runtime: 'reaver_pirate' },
    barks: { opening: 'MAKO: the ring closes when somebody pays.', return: 'MAKO: I found another hand for the empty place.', flee: 'MAKO: leave it open. I am not finished.', playerLoss: 'MAKO: one more hull entered in the empty ledger.' },
    reward: { bountyCr: 900, uniqueItemId: 'unique_nestbreaker_rack', physicalLabel: 'Mako\'s Nestbreaker Rack', techId: 'ace_tech_ring_screen', techLabel: 'Broken-Ring Screen', researchPoints: 19 },
  },
  ace_maw_rake_veyra: {
    returnArchetype: 'harrier_kiter',
    appearance: { hullColor: '#7e0f16', accentColor: '#d7c8a1', finish: 'worn', wear: 0.83, decalId: 'frontier' },
    spawnStory: 'The Red Wake\'s handprints are not trophies at rest: every edge points the way she breaks when she crosses your nose.',
    barStory: 'Veyra lets survivors repaint one hand on the Wake. The catch is that the hand must point toward the mistake that cost them the ship.',
    gimmick: { id: 'rake-pass', label: 'Rake Pass', mechanic: 'A Harrier kites on a live ranged disengager route, firing only from the winning bearing.', counter: 'Cut the orbit, deny the preferred range, and catch the turn rather than chasing the wake.', runtime: 'harrier_kiter' },
    barks: { opening: 'RAKE VEYRA: count the hands. They all chased.', return: 'RAKE VEYRA: I saved your place on the edge.', flee: 'RAKE VEYRA: wrong turn. Remember it.', playerLoss: 'RAKE VEYRA: your old hand still points true.' },
    reward: { bountyCr: 1000, uniqueItemId: 'unique_ironsong_ac', physicalLabel: 'Veyra\'s Ironsong AC', techId: 'ace_tech_rake_bearing', techLabel: 'Rake-Bearing Fire', researchPoints: 21 },
  },
  ace_rust_lord_orro: {
    returnArchetype: 'field_anchor_controller',
    appearance: { hullColor: '#5c341d', accentColor: '#9bd0c2', finish: 'worn', wear: 0.92, decalId: 'industrial' },
    spawnStory: 'Nine mismatched boiler jackets armor Orro\'s Bastion; the pale anchor cage between them is the only part without rust.',
    barStory: 'Orro weighs wrecks before bodies. A captain who dies inside his anchor field is merely scrap that has stopped arguing the price.',
    gimmick: { id: 'kettle-anchor', label: 'Nine-Kettle Anchor', mechanic: 'A heavy controller plants an anchor field and makes local momentum expensive.', counter: 'Break the controller, displace it beyond the field, or fight from outside the anchored pocket.', runtime: 'field_anchor_controller' },
    barks: { opening: 'ORRO: hold still. The scale hates a moving answer.', return: 'ORRO: the kettles kept your weight warm.', flee: 'ORRO: bad scale. We weigh again.', playerLoss: 'ORRO: your last hull balanced clean.' },
    reward: { bountyCr: 1200, uniqueItemId: 'unique_choir_bell_aegis', physicalLabel: 'Orro\'s Bell-Metal Aegis', techId: 'ace_tech_kettle_anchor', techLabel: 'Kettle-Anchor Field Notes', researchPoints: 24 },
  },
  ace_drift_king_iona: {
    returnArchetype: 'jammer_specialist',
    appearance: { hullColor: '#d6c7a1', accentColor: '#6b43a6', finish: 'polished', wear: 0.08, decalId: 'concord' },
    spawnStory: 'Iona\'s gilded false face rides the bow while the true hull slides off the sensor solution behind an active jammer screen.',
    barStory: 'Every Gilt Mask is cast from a surrendered transponder. Iona wears the owner\'s public face until the bounty office notices the swap.',
    gimmick: { id: 'false-face', label: 'False-Face Jam', mechanic: 'A jammer specialist attacks target confidence and withdraws behind its close screen.', counter: 'Close through the smear, trust the hull you can see over the contact you cannot, and remove the escort screen.', runtime: 'jammer_specialist' },
    barks: { opening: 'IONA FALSE-FACE: a courteous distance. Which name shall I keep?', return: 'IONA FALSE-FACE: this mask remembered you.', flee: 'IONA FALSE-FACE: a face may leave before its name.', playerLoss: 'IONA FALSE-FACE: I wore your registry for a week.' },
    reward: { bountyCr: 1050, uniqueItemId: 'unique_truesight_scanner', physicalLabel: 'Iona\'s Truesight Scanner', techId: 'ace_tech_false_face', techLabel: 'False-Face Discrimination', researchPoints: 22 },
  },
  ace_jex_wake_salt: {
    returnArchetype: 'mine_layer_jackal',
    appearance: { hullColor: '#182b31', accentColor: '#efe5c8', finish: 'worn', wear: 0.62, decalId: 'frontier' },
    spawnStory: 'Salt-white racks stand proud of Jex\'s dark keel, each carrying a mine that drifts into the exact route a pursuer wants.',
    barStory: 'Jex salts a wake only once. If a pilot flies it twice, Salt Wake custom says the second blast belongs to the pilot.',
    gimmick: { id: 'salt-wake', label: 'Salt Wake', mechanic: 'The Jackal lays a drifting mine wake across its escape vector.', counter: 'Leave the wake, move the mines with field impulses, or attack from a crossing bearing.', runtime: 'mine_layer_jackal' },
    barks: { opening: 'JEX WAKE-SALT: leave the trail. I already seeded it.', return: 'JEX WAKE-SALT: same wake, fresher salt.', flee: 'JEX WAKE-SALT: follow if you trust your map.', playerLoss: 'JEX WAKE-SALT: your old blast still rings.' },
    reward: { bountyCr: 900, uniqueItemId: 'unique_smokesong_chaff', physicalLabel: 'Jex\'s Smokesong Chaff', techId: 'ace_tech_salt_wake', techLabel: 'Salt-Wake Drift Tables', researchPoints: 19 },
  },
  ace_noll_curtain: {
    returnArchetype: 'pd_screen_escort',
    appearance: { hullColor: '#273c4c', accentColor: '#e55b45', finish: 'satin', wear: 0.3, decalId: 'industrial' },
    spawnStory: 'Noll\'s red curtain bars align only when the flak mounts acquire; the hull seems to drop its curtain before every interception.',
    barStory: 'Curtain Company charges by missiles denied, not ships killed. Noll keeps the flattened seeker heads in numbered velvet drawers.',
    gimmick: { id: 'red-curtain', label: 'Red Curtain', mechanic: 'Two point-defense mounts select, assign, and intercept incoming ordnance.', counter: 'Hold missiles, use direct kinetics, then peel the screen before launching.', runtime: 'pd_screen_escort' },
    barks: { opening: 'NOLL: your missiles are a polite request. Denied.', return: 'NOLL: curtain up. Same disappointing act.', flee: 'NOLL: interval. Keep your ticket.', playerLoss: 'NOLL: we kept the seeker that found your last hull.' },
    reward: { bountyCr: 1100, uniqueItemId: 'unique_lighthouse_heavy_beam', physicalLabel: 'Noll\'s Lighthouse Beam', techId: 'ace_tech_curtain_assignment', techLabel: 'Curtain Assignment Logic', researchPoints: 23 },
  },
  ace_ves_no_face: {
    returnArchetype: 'quiet_ghost',
    appearance: { hullColor: '#15191d', accentColor: '#7fb7b0', finish: 'satin', wear: 0.18, decalId: 'none' },
    spawnStory: 'Ves has painted over every seam and registry light; only the cold teal EMP vanes give the black Wasp a front.',
    barStory: 'Blank Ledger pays witnesses to disagree about Ves. The only consistent detail is the rail report arriving before anyone finds a face.',
    gimmick: { id: 'blank-bearing', label: 'Blank Bearing', mechanic: 'The Quiet Ghost combines a long-range rail solution with EMP disruption and repeated repositioning.', counter: 'Break the first lock, close under cover, and force the light hull to turn.', runtime: 'quiet_ghost' },
    barks: { opening: 'VES NO-FACE: you never saw this ship. File that.', return: 'VES NO-FACE: your correction was rejected.', flee: 'VES NO-FACE: no contact. No report.', playerLoss: 'VES NO-FACE: your last log also omitted me.' },
    reward: { bountyCr: 1000, uniqueItemId: 'unique_quietcloak', physicalLabel: 'Ves\'s Quietcloak', techId: 'ace_tech_blank_bearing', techLabel: 'Blank-Bearing Reconstruction', researchPoints: 22 },
  },
  ace_sere_pattern: {
    returnArchetype: 'choir_zealot',
    appearance: { hullColor: '#ebe1cf', accentColor: '#b62955', finish: 'polished', wear: 0.05, decalId: 'concord' },
    spawnStory: 'Sere\'s white Wasp enters at the point of a matched Choir refrain, every escort pulsing the same magenta identification cadence.',
    barStory: 'Sere claims the Pattern is audible in collision alarms. The Third Refrains keep recordings of every ramming run and call each impact a verse.',
    gimmick: { id: 'third-refrain', label: 'Third Refrain', mechanic: 'A fast Choir pack repeats synchronized attack runs instead of settling into a static firing circle.', counter: 'Break formation, throw one light hull into another, and deny the repeated run-up.', runtime: 'choir_zealot' },
    barks: { opening: 'SERE: the Pattern names you. Answer in fire.', return: 'SERE: the refrain returns to its first measure.', flee: 'SERE: the verse ends elsewhere.', playerLoss: 'SERE: your last alarm held the correct note.' },
    reward: { bountyCr: 900, uniqueItemId: 'unique_pale_coil_warp_drive', physicalLabel: 'Sere\'s Pale-Coil Drive', techId: 'ace_tech_third_refrain', techLabel: 'Third-Refrain Timing', researchPoints: 20 },
  },
  ace_voss_shaft_seven: {
    returnArchetype: 'bruiser_brawler',
    appearance: { hullColor: '#35444a', accentColor: '#f4a33a', finish: 'worn', wear: 0.78, decalId: 'industrial' },
    spawnStory: 'Voss welded Shaft Seven\'s orange lift numerals over a blunt Bastion prow; the plate is both union banner and impact surface.',
    barStory: 'The Last Two survived the Shaft Seven accounting purge because the roster listed them as moisture. Voss now audits with the prow.',
    gimmick: { id: 'shaft-audit', label: 'Shaft-Seven Audit', mechanic: 'A high-mass brawler commits at ramming range and converts its armored closing line into collision pressure.', counter: 'Tumble the approach, sidestep the mass line, and make the Bastion spend its turn.', runtime: 'bruiser_brawler' },
    barks: { opening: 'VOSS: Shaft Seven files you as salvage.', return: 'VOSS: audit reopened. Two signatures remain.', flee: 'VOSS: Seven could not bury us. Neither will you.', playerLoss: 'VOSS: Seven listed you as moisture too.' },
    reward: { bountyCr: 1050, uniqueItemId: 'unique_knitbots', physicalLabel: 'Voss\'s Union Knitbots', techId: 'ace_tech_shaft_audit', techLabel: 'Shaft-Seven Load Audit', researchPoints: 22 },
  },
  ace_drell_short_fall: {
    returnArchetype: 'hostile_repair_tender',
    appearance: { hullColor: '#6a685f', accentColor: '#d63f2e', finish: 'satin', wear: 0.47, decalId: 'borrowed_time' },
    spawnStory: 'Drell\'s gray tender carries four red tally blocks and one unpainted socket, a repair lattice exposed where the fifth should be.',
    barStory: 'Drell counts every crew as five hulls. Four arrive, four leave, and the missing fifth is always the stranger who challenged the slip.',
    gimmick: { id: 'fifth-hull', label: 'The Missing Fifth', mechanic: 'A hostile repair tender keeps the escort alive with a live repair beam.', counter: 'Separate the tender from its screen and remove the repair owner before grinding the escorts.', runtime: 'hostile_repair_tender' },
    barks: { opening: 'DRELL: five on the slip. You are the short fall.', return: 'DRELL: the slip is short again.', flee: 'DRELL: one hull remains unentered.', playerLoss: 'DRELL: your last registry filled the fifth line.' },
    reward: { bountyCr: 950, uniqueItemId: 'unique_deepsurvey_suite', physicalLabel: 'Drell\'s Weigh-Slip Survey Suite', techId: 'ace_tech_fifth_hull', techLabel: 'Missing-Fifth Logistics', researchPoints: 21 },
  },
});

function productionAce(ace) {
  const production = LAUNCH_ACE_PRODUCTION[ace.id] || {};
  const completed = {
    ...ace,
    ...production,
    signatureBark: production.barks && production.barks.opening || ace.signatureBark,
    botRoutes: {
      gimmick: {
        id: `bot:named-ace:${ace.id}:gimmick`,
        shapeId: 'named_hunter',
        aceId: ace.id,
        assertion: `boss.data.namedAceGimmick.runtime=${production.gimmick && production.gimmick.runtime}`,
      },
      escape: {
        id: `bot:named-ace:${ace.id}:escape`,
        shapeId: 'named_hunter',
        aceId: ace.id,
        outcome: 'escaped',
        assertion: 'physical_boundary_crossed_before_receipt',
      },
      recurrence: {
        id: `bot:named-ace:${ace.id}:recurrence`,
        shapeId: 'named_hunter',
        aceId: ace.id,
        assertion: 'return_reenters_named_hunter_with_same_ace_id',
      },
    },
  };
  return deepFreeze(completed);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const COMPLETE_CORE_ROSTER = Object.freeze(CORE_ROSTER.map(productionAce));
const COMPLETE_REACH_CULTURE_ROSTER = Object.freeze(REACH_CULTURE_ROSTER.map(productionAce));
const COMPLETE_VARIETY_ROSTER = Object.freeze(VARIETY_ROSTER.map(productionAce));
const LAUNCH_ROSTER = Object.freeze([
  ...COMPLETE_CORE_ROSTER,
  ...COMPLETE_REACH_CULTURE_ROSTER,
  ...COMPLETE_VARIETY_ROSTER,
]);

export const NAMED_ACE_IDS = Object.freeze(COMPLETE_CORE_ROSTER.map((ace) => ace.id));
export const NAMED_ACES = Object.freeze(Object.fromEntries(COMPLETE_CORE_ROSTER.map((ace) => [ace.id, ace])));
export const REACH_CULTURE_ACE_IDS = Object.freeze(COMPLETE_REACH_CULTURE_ROSTER.map((ace) => ace.id));
export const REACH_CULTURE_ACES = Object.freeze(Object.fromEntries(
  COMPLETE_REACH_CULTURE_ROSTER.map((ace) => [ace.id, ace]),
));
export const VARIETY_ACE_IDS = Object.freeze(COMPLETE_VARIETY_ROSTER.map((ace) => ace.id));
export const VARIETY_ACES = Object.freeze(Object.fromEntries(
  COMPLETE_VARIETY_ROSTER.map((ace) => [ace.id, ace]),
));
export const LAUNCH_ACE_IDS = Object.freeze(LAUNCH_ROSTER.map((ace) => ace.id));

// Plan 52 recurring peer. Kei is deliberately not part of ALL_KNOWN_ACES: that roster feeds the
// hostile named-hunter lifecycle, while this pilot enters through the self-bounded aceMemory.rival
// route as neutral physical competition. Keeping the identity beside the ace roster gives the Codex
// and renderer one authored face without letting a peer inherit bounty, grudge, or pirate returns.
export const RECURRING_RIVAL = deepFreeze({
  id: 'rival_kei_halber',
  name: 'Kei Halber',
  crew: 'Second Line',
  factionId: 'faction_free',
  shipDefId: 'ship_hornet',
  appearance: {
    hullColor: '#223746', accentColor: '#f0b64b', finish: 'satin', wear: 0.26, decalId: 'frontier',
  },
  barks: {
    intro: 'KEI HALBER: Your line is clean. Mine is cleaner.',
    challenge: 'KEI HALBER: Same gates. No excuses.',
    playerWon: 'KEI HALBER: Clean run. Keep the line warm.',
    rivalWon: 'KEI HALBER: I left you the wake.',
    invalidated: 'KEI HALBER: Bent line. Run it again.',
    rescue: 'KEI HALBER: Dispatch found me. Hold still.',
  },
});

/** Plan 52's occasional-save cadence is derived only from Kei's own head-to-head history.
 * One rescue is available after the first resolved race, then one more after every two results. */
export function recurringRivalRescueReady(state, lossId = null) {
  const rival = state && state.aceMemory && state.aceMemory.rival;
  if (!rival || rival.unlocked !== true) return false;
  const results = Math.max(0, Math.floor(Number(rival.playerWins) || 0))
    + Math.max(0, Math.floor(Number(rival.rivalWins) || 0));
  const saves = Math.max(0, Math.floor(Number(rival.savesCount) || 0));
  const savedLossIds = Array.isArray(rival.recentSaveLossIds) ? rival.recentSaveLossIds : [];
  if (lossId && savedLossIds.includes(String(lossId))) return false;
  return results > 0 && saves < Math.ceil(results / 2);
}

const CAPTAIN_ALIASES = Object.freeze(NAMED_CAPTAINS.map((cap) => Object.freeze({
  id: cap.id,
  name: cap.name,
  crew: 'Known Hunter',
  factionId: 'faction_reach',
  gimmickTag: cap.gimmick || 'hunter',
  returnArchetype: cap.archetype || 'corsair_raider',
  escortArchetype: cap.escort && cap.escort.archetypes && cap.escort.archetypes[0] || 'reaver_pirate',
  baseReturnLevel: 4 + (cap.levelBonus || 1),
  signatureBark: `${cap.name}: the old grudge has your transponder.`,
  encounterCaptain: true,
})));

const ALL_KNOWN_ACES = Object.freeze([...LAUNCH_ROSTER, ...CAPTAIN_ALIASES]);
const ACE_BY_ID = new Map(ALL_KNOWN_ACES.map((ace) => [ace.id, ace]));
const ACE_BY_NAME = new Map(ALL_KNOWN_ACES.map((ace) => [normalizeName(ace.name), ace]));

export function aceById(id) {
  return ACE_BY_ID.get(String(id || '')) || null;
}

export function aceByName(name) {
  return ACE_BY_NAME.get(normalizeName(name)) || null;
}

export function aceFromText(text) {
  const haystack = normalizeName(text);
  if (!haystack) return null;
  for (const ace of ALL_KNOWN_ACES) {
    if (haystack.includes(normalizeName(ace.name))) return ace;
  }
  return null;
}

export function knownAces() {
  return ALL_KNOWN_ACES.slice();
}

export function launchAces() {
  return LAUNCH_ROSTER.slice();
}

export function newsForAceTransition(ace, transition) {
  if (!ace) return '';
  if (transition === 'fled') {
    return `${ace.name} fled ${ace.crew} contact; lane chatter says a bigger crew is forming.`;
  }
  if (transition === 'defeated') {
    return `${ace.name} defeated; ${ace.crew} loses its captain in the outer lanes.`;
  }
  if (transition === 'encountered') {
    return `${ace.name} sighted with ${ace.crew}.`;
  }
  return `${ace.name} moves through the pirate bands.`;
}

export function returnPlanForAce(ace, seed, now = 0) {
  const id = ace && ace.id || 'unknown';
  const returnSeed = hash32(seed == null ? 0 : seed, 'aceMemory', id, 'return');
  const returnAfterS = RETURN_MIN_S + (returnSeed % RETURN_SPAN_S);
  return {
    returnAt: Math.round((Number(now) || 0) + returnAfterS),
    returnAfterS,
    returnSeed,
  };
}

export function returnLevelBandsForAce(ace, returnTier = 1) {
  const base = Math.max(1, (ace && ace.baseReturnLevel) || 4);
  const tier = Math.max(1, Math.min(PIRATE_PROMOTION_MAX_TIER, returnTier | 0));
  const previousLo = base + tier - 1;
  const currentLo = base + tier;
  return {
    previous: Object.freeze([previousLo, previousLo + 2]),
    current: Object.freeze([currentLo, currentLo + 2]),
  };
}

export function returnCrewForAce(ace, returnTier = 1) {
  const tier = Math.max(1, Math.min(PIRATE_PROMOTION_MAX_TIER, returnTier | 0));
  const bands = returnLevelBandsForAce(ace, tier);
  const bossArchetype = ace && ace.returnArchetype || 'corsair_raider';
  const escortArchetype = ace && ace.escortArchetype || 'wasp_swarmer';
  const escorts = 1 + Math.min(2, tier);
  const out = [{
    role: 'boss',
    archetype: bossArchetype,
    level: bands.current[1],
  }];
  for (let i = 0; i < escorts; i++) {
    out.push({
      role: 'escort',
      archetype: escortArchetype,
      level: bands.current[0],
    });
  }
  return Object.freeze(out.map((ship) => Object.freeze(ship)));
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}
