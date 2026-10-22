// stationSigns.js — PULSE-SIGNS (build_map row 433).
//
// Authored copy for the three dockside display surfaces — the berth billboard (ad board), the
// bay screen in the station frame, and the wire crawl — plus the two dynamic panels the row
// requires: a WANTED poster that names the player's own hull and callsign while heat is high,
// and feat headlines that name the pilot.
//
// Sources, per the done-when: the ad board corpus (flavor pack `ad_board`), the news wire
// (marketNews voice — short factual lines with a named cause), and faction propaganda (one
// registered voice per faction id, filtered to the berth's own faction).
//
// Pure data + pure string interpolation. No state reads, no RNG, no DOM. The selection layer
// lives in ui/station/adBoard.js; the crawl/headline owner stays ui/marketNews.js.

// ── bay screens ──────────────────────────────────────────────────────────────────────────
// Station ops in the shift-bell register: terse, procedural, slightly indifferent. `types`
// restricts a line to matching stationTypeId values; absent = any berth.
export const SIGN_BAY = Object.freeze([
  { id: 'bay_berth_01', surface: 'bay', sponsor: 'Berth Control', text: 'Berth assignments hold for one shift. Extensions cost more than apologies.' },
  { id: 'bay_berth_02', surface: 'bay', sponsor: 'Berth Control', text: 'Do not power the main drive inside the cradle. The clamps remember.' },
  { id: 'bay_shift_01', surface: 'bay', sponsor: 'Shift Office', text: 'Shift bell runs on station time, not ship time. No exceptions posted.' },
  { id: 'bay_shift_02', surface: 'bay', sponsor: 'Shift Office', text: 'Crew rotation at the bell. Idle hands will be assigned.' },
  { id: 'bay_shift_03', surface: 'bay', sponsor: 'Shift Office', text: 'Second watch reports to the transfer gallery. First watch reports to the bar.' },
  { id: 'bay_gantry_01', surface: 'bay', sponsor: 'Gantry Crew', text: 'Transfer gantry cycling. Keep limbs inside the painted lines.' },
  { id: 'bay_cargo_01', surface: 'bay', sponsor: 'Cargo Office', text: 'Unmanifested mass stays on the apron. Disputes go to the scale, not the crew.' },
  { id: 'bay_cargo_02', surface: 'bay', sponsor: 'Cargo Office', text: 'Pallet seals are checked at the door, not at the berth. Plan accordingly.' },
  { id: 'bay_air_01', surface: 'bay', sponsor: 'Life Support', text: 'Bay atmosphere is recycled courtesy. Thank the previous tenant.' },
  { id: 'bay_fire_01', surface: 'bay', sponsor: 'Fire Watch', text: 'Open flame requires a permit, a spotter, and a better idea.' },
  { id: 'bay_deck_01', surface: 'bay', sponsor: 'Deck Office', text: 'The deck plate under berth four is honest today. Walk normally.' },
  { id: 'bay_queue_01', surface: 'bay', sponsor: 'Dock Control', text: 'Undock queue is posted in order received. Asking moves you to the back.' },
  { id: 'bay_repair_01', surface: 'bay', sponsor: 'Yard Office', text: 'Patch work carries no warranty past the airlock. Neither do you.' },
  { id: 'bay_power_01', surface: 'bay', sponsor: 'Grid Office', text: 'Shore power draws are metered. The meter is also audited.' },
  { id: 'bay_lost_01', surface: 'bay', sponsor: 'Lost Property', text: 'A crate marked HANDLE WITH CARE has been at the column since Tuesday. It is being handled.' },
  { id: 'bay_notice_01', surface: 'bay', sponsor: 'Station Clerk', text: 'Notices older than one rotation are binding regardless of readership.' },
  { id: 'bay_mil_01', surface: 'bay', sponsor: 'Perimeter Watch', types: Object.freeze(['military']), text: 'Weapons stay safed and slaved inside the ring. The tower counts muzzles.' },
  { id: 'bay_mil_02', surface: 'bay', sponsor: 'Perimeter Watch', types: Object.freeze(['military']), text: 'Transponder on. IFF current. Visitors without clearances berth at the far cradle.' },
  { id: 'bay_ref_01', surface: 'bay', sponsor: 'Smelt Desk', types: Object.freeze(['refinery']), text: 'Vent cycles run hot at the hour. Gantries clear during the flare.' },
  { id: 'bay_ref_02', surface: 'bay', sponsor: 'Smelt Desk', types: Object.freeze(['refinery']), text: 'Tailings drift is a navigation hazard, not a filing error. Fly the corridor.' },
  { id: 'bay_mine_01', surface: 'bay', sponsor: 'Claim Office', types: Object.freeze(['mining']), text: 'Claim disputes settle at the survey, not the shaft. Paper first, charges second.' },
  { id: 'bay_mine_02', surface: 'bay', sponsor: 'Claim Office', types: Object.freeze(['mining']), text: 'Ore tallies are weighed wet. Everyone dries the same.' },
  { id: 'bay_trade_01', surface: 'bay', sponsor: 'Exchange Desk', types: Object.freeze(['trade_hub']), text: 'Spot prices print at the bell. Verbal quotes are wishes.' },
  { id: 'bay_trade_02', surface: 'bay', sponsor: 'Exchange Desk', types: Object.freeze(['trade_hub']), text: 'Manifest corrections close before the market does. The market never does.' },
  { id: 'bay_fab_01', surface: 'bay', sponsor: 'Foundry Deck', types: Object.freeze(['fab']), text: 'Casting runs mark the bay. Expect thermal bloom on approach.' },
  { id: 'bay_fab_02', surface: 'bay', sponsor: 'Foundry Deck', types: Object.freeze(['fab']), text: 'Module cradles rotate on schedule. Berth crews do not rotate the cradles.' },
  { id: 'bay_res_01', surface: 'bay', sponsor: 'Array Desk', types: Object.freeze(['research']), text: 'Telemetry sweeps blind the low band on the mark. Keep your instruments humble.' },
  { id: 'bay_res_02', surface: 'bay', sponsor: 'Array Desk', types: Object.freeze(['research']), text: 'Samples sign in at the airlock. Anything that signs back is quarantine.' },
  { id: 'bay_bm_01', surface: 'bay', sponsor: 'The Berth', types: Object.freeze(['blackmarket']), text: 'No manifest window. No manifest line. Keep your credits where your eyes are.' },
  { id: 'bay_bm_02', surface: 'bay', sponsor: 'The Berth', types: Object.freeze(['blackmarket']), text: 'What the scale says is what you carried. What you carried is your business.' },
]);

// ── billboards ───────────────────────────────────────────────────────────────────────────
// Commerce notices in the ad board's bureaucratic-horror register. These join the same deck
// as the authored ad_board pack — the billboard draws from both.
export const SIGN_BILLBOARD = Object.freeze([
  { id: 'sign_bb_01', surface: 'billboard', sponsor: 'Concord Registry', text: 'AN UNFILED HULL IS AN UNOWNED HULL. FILE OR BE FILED.' },
  { id: 'sign_bb_02', surface: 'billboard', sponsor: 'Meridian Bonds', text: 'YOUR DOCKING BOND EARNS INTEREST. FOR US.' },
  { id: 'sign_bb_03', surface: 'billboard', sponsor: 'DMC Survey Desk', text: 'THE BELT PROVIDES. THE BELT ITEMIZES.' },
  { id: 'sign_bb_04', surface: 'billboard', sponsor: 'Helios Transit', text: 'LANE COURTESY IS MANDATORY. FRIENDLINESS IS BILLABLE.' },
  { id: 'sign_bb_05', surface: 'billboard', sponsor: 'MTS Cargo', text: 'WE INSURE THE CRATE. THE CONTENTS ARE A CONVERSATION.' },
  { id: 'sign_bb_06', surface: 'billboard', sponsor: 'Concord Customs', text: 'A SEALED HOLD IS A PROMISE. PROMISES ARE AUDITED.' },
  { id: 'sign_bb_07', surface: 'billboard', sponsor: 'Tethys Brokers', text: 'INFORMATION WANTS TO BE SOLD.' },
  { id: 'sign_bb_08', surface: 'billboard', sponsor: 'Meridian Clinics', text: 'STASIS IS A SUBSCRIPTION. CANCELLATION REQUIRES NOTICE.' },
  { id: 'sign_bb_09', surface: 'billboard', sponsor: 'DMC Tool Pool', text: 'BORROWED CUTTERS RETURN THEMSELVES. EVENTUALLY.' },
  { id: 'sign_bb_10', surface: 'billboard', sponsor: 'Helios Reclaim', text: 'YOUR WRECK HAS VALUE. SO DOES YOUR ARRIVAL.' },
  { id: 'sign_bb_11', surface: 'billboard', sponsor: 'MTS Chart House', text: 'MAPS SOLD AS SURVEYED. THE SURVEY SOLD AS IS.' },
  { id: 'sign_bb_12', surface: 'billboard', sponsor: 'Concord Benefits', text: 'DEPENDENTS MUST BE DECLARED BEFORE THEY ARE DEPENDENT.' },
  { id: 'sign_bb_13', surface: 'billboard', sponsor: 'DMC Galley', text: 'HOT MEAL. COLD TRAY. WARM LEDGER.' },
  { id: 'sign_bb_14', surface: 'billboard', sponsor: 'Meridian Vaults', text: 'WE HOLD WHAT YOU CANNOT AFFORD TO LOSE.' },
  { id: 'sign_bb_15', surface: 'billboard', sponsor: 'Tethys Mediation', text: 'DISPUTES SETTLE FASTER WHEN BOTH PARTIES PAY UPFRONT.' },
  { id: 'sign_bb_16', surface: 'billboard', sponsor: 'Concord Archive', text: 'EVERY MANIFEST IS FOREVER. WRITE A GOOD ONE.' },
  { id: 'sign_bb_17', surface: 'billboard', sponsor: 'Helios Chandlery', text: 'O-RINGS, SEALS, AND THE OCCASIONAL MIRACLE. STOCK VARIES.' },
  { id: 'sign_bb_18', surface: 'billboard', sponsor: 'DMC Assurance', text: 'ACCIDENTS ARE REPORTED IN THE ORDER THEY ARE PAID.' },
  { id: 'sign_bb_19', surface: 'billboard', sponsor: 'MTS Routing', text: 'THE SHORT ROUTE IS CHARGED AS THE LONG ONE. ASK ANYTHING.' },
  { id: 'sign_bb_20', surface: 'billboard', sponsor: 'Concord Towage', text: 'IMPOUND IS A STORAGE SOLUTION WITH A PAPERWORK PREMIUM.' },
  { id: 'sign_bb_21', surface: 'billboard', sponsor: 'Meridian Futures', text: 'HEDGE YOUR HAUL. THE MARKET ALREADY BET AGAINST YOU.' },
  { id: 'sign_bb_22', surface: 'billboard', sponsor: 'Helios Watch', text: 'CURFEW IS A SERVICE WINDOW. COMPLY AND BE SERVICED.' },
]);

// ── news crawl ───────────────────────────────────────────────────────────────────────────
// Wire items in the marketNews register: factual, local, quietly bleak. These feed the crawl
// pool alongside live headlines so the wire carries the station's own weather.
export const SIGN_CRAWL = Object.freeze([
  { id: 'sign_crawl_01', surface: 'crawl', sponsor: 'Local Wire', text: 'Berth fees hold steady this rotation. Dock office cites routine.' },
  { id: 'sign_crawl_02', surface: 'crawl', sponsor: 'Local Wire', text: 'Gantry crew reports one near-miss and zero admissions. Filed as routine.' },
  { id: 'sign_crawl_03', surface: 'crawl', sponsor: 'Local Wire', text: 'A crate of unclaimed mail waits at the column. The clerk is patient.' },
  { id: 'sign_crawl_04', surface: 'crawl', sponsor: 'Local Wire', text: 'Shift rotation proceeds without incident. Supervisors call it a record.' },
  { id: 'sign_crawl_05', surface: 'crawl', sponsor: 'Local Wire', text: 'The ore scale passed inspection. The inspector was weighed first.' },
  { id: 'sign_crawl_06', surface: 'crawl', sponsor: 'Local Wire', text: 'Dock control reminds inbound traffic that the queue is not a rumor.' },
  { id: 'sign_crawl_07', surface: 'crawl', sponsor: 'Local Wire', text: 'The bar extends hours at the bell. Management denies a connection.' },
  { id: 'sign_crawl_08', surface: 'crawl', sponsor: 'Local Wire', text: 'A patrol flight returned with every hull it left with. Noted, not praised.' },
  { id: 'sign_crawl_09', surface: 'crawl', sponsor: 'Local Wire', text: 'Freight insurance renewals climb again. Actuaries decline to celebrate.' },
  { id: 'sign_crawl_10', surface: 'crawl', sponsor: 'Local Wire', text: 'Missing-person filings hold at seasonal average. The board keeps the names.' },
  { id: 'sign_crawl_11', surface: 'crawl', sponsor: 'Local Wire', text: 'The air plant hit quota early. Breathing remains subsidized.' },
  { id: 'sign_crawl_12', surface: 'crawl', sponsor: 'Local Wire', text: 'An unmarked hull paid cash and left before the receipt printed. Standard.' },
  { id: 'sign_crawl_13', surface: 'crawl', sponsor: 'Local Wire', text: 'The market board flickers but the numbers hold. The board denies flickering.' },
  { id: 'sign_crawl_14', surface: 'crawl', sponsor: 'Local Wire', text: 'Dockside prayer wheel turns again. The Choir asks that you not lean on it.' },
  { id: 'sign_crawl_15', surface: 'crawl', sponsor: 'Local Wire', text: 'A long-haul skipper swore the lane sang back. The wire prints it anyway.' },
  { id: 'sign_crawl_16', surface: 'crawl', sponsor: 'Local Wire', text: 'Survey crews report the rocks are where the charts left them. A good week.' },
]);

// ── faction propaganda ───────────────────────────────────────────────────────────────────
// One registered voice per faction. `factionId` filters the line to berths flying that flag;
// these run on the billboard as posters and on the crawl as official notices.
export const SIGN_PROPAGANDA = Object.freeze([
  { id: 'sign_prop_scn_01', surface: 'billboard', factionId: 'faction_scn', sponsor: 'Solar Concord Navy', text: 'THE LANE IS PATROLLED BECAUSE THE LANE IS YOURS. FLY QUIET AND LEGAL.' },
  { id: 'sign_prop_scn_02', surface: 'billboard', factionId: 'faction_scn', sponsor: 'Solar Concord Navy', text: 'A REGISTERED HULL IS A PROTECTED HULL. REGISTER BEFORE YOU NEED PROTECTING.' },
  { id: 'sign_prop_mts_01', surface: 'billboard', factionId: 'faction_mts', sponsor: 'Meridian Trade Syndicate', text: 'EVERY TONNE MOVES. EVERY TONNE IS COUNTED. MOVE WITH THE COUNT.' },
  { id: 'sign_prop_mts_02', surface: 'billboard', factionId: 'faction_mts', sponsor: 'Meridian Trade Syndicate', text: 'THE LEDGER DOES NOT LIE. PEOPLE LIE TO THE LEDGER.' },
  { id: 'sign_prop_dmc_01', surface: 'billboard', factionId: 'faction_dmc', sponsor: 'Drift Miners Collective', text: 'THE ROCK BELONGS TO THE CREW THAT BREAKS IT. CLOCK IN AND SWING.' },
  { id: 'sign_prop_dmc_02', surface: 'billboard', factionId: 'faction_dmc', sponsor: 'Drift Miners Collective', text: 'A CLAIM IS A PROMISE TO THE BELT. KEEP IT AND THE BELT KEEPS YOU.' },
  { id: 'sign_prop_reach_01', surface: 'billboard', factionId: 'faction_reach', sponsor: 'Crimson Reach', text: 'THE WEAK PAY TOLLS. THE STRONG COLLECT THEM. CHOOSE A SIDE OF THE LEDGER.' },
  { id: 'sign_prop_reach_02', surface: 'billboard', factionId: 'faction_reach', sponsor: 'Crimson Reach', text: 'NO FLAG, NO DEBTS. ONLY THE REACH AND THE TAKING.' },
  { id: 'sign_prop_quiet_01', surface: 'billboard', factionId: 'faction_quiet', sponsor: 'The Quiet', text: 'SAY NOTHING, CARRY EVERYTHING. THE QUIET REMEMBERS WHO PAID.' },
  { id: 'sign_prop_quiet_02', surface: 'billboard', factionId: 'faction_quiet', sponsor: 'The Quiet', text: 'YOUR MANIFEST IS YOUR OWN. KEEP IT THAT WAY.' },
  { id: 'sign_prop_vael_01', surface: 'billboard', factionId: 'faction_vael', sponsor: 'The Vael', text: 'THE TIDE TAKES WHAT THE TIDE IS OWED. SAIL WITH IT, NOT AGAINST IT.' },
  { id: 'sign_prop_vael_02', surface: 'billboard', factionId: 'faction_vael', sponsor: 'The Vael', text: 'WE READ THE DARK BETTER THAN YOUR CHARTS. ASK US FIRST.' },
  { id: 'sign_prop_free_01', surface: 'billboard', factionId: 'faction_free', sponsor: 'Free Frontier', text: 'NO MASTERS, NO MANIFESTS, NO MERCY FOR TOLL-TAKERS. THE FRONTIER STAYS FREE.' },
  { id: 'sign_prop_free_02', surface: 'billboard', factionId: 'faction_free', sponsor: 'Free Frontier', text: 'YOUR HULL, YOUR RULES. PAY YOUR CREWS AND KEEP MOVING.' },
  { id: 'sign_prop_choir_01', surface: 'billboard', factionId: 'faction_choir', sponsor: 'Ascendant Choir', text: 'EVERY HULL HAS A NOTE. THE CHOIR TEACHES IT TO SING.' },
  { id: 'sign_prop_choir_02', surface: 'billboard', factionId: 'faction_choir', sponsor: 'Ascendant Choir', text: 'WORK IS THE FIRST VERSE. COME HEAR THE REST AT THE VIGIL.' },
  { id: 'sign_prop_helix_01', surface: 'billboard', factionId: 'faction_helix', sponsor: 'Helix Directorate', text: 'IMPROVEMENT IS MEASURABLE. SUBMIT TO MEASUREMENT.' },
  { id: 'sign_prop_helix_02', surface: 'billboard', factionId: 'faction_helix', sponsor: 'Helix Directorate', text: 'THE BODY IS A PROTOTYPE. THE DIRECTORATE SHIPS REVISIONS.' },
  { id: 'sign_prop_understory_01', surface: 'billboard', factionId: 'faction_understory', sponsor: 'The Understory', text: 'EVERY STATION HAS A FLOOR BELOW THE FLOOR. WE KEEP THE LIGHTS ON DOWN THERE.' },
  { id: 'sign_prop_understory_02', surface: 'billboard', factionId: 'faction_understory', sponsor: 'The Understory', text: 'YOU WERE CARRIED HERE BY HANDS YOU NEVER SAW. TIP THEM ANYWAY.' },
  { id: 'sign_prop_fulfillment_01', surface: 'billboard', factionId: 'faction_fulfillment', sponsor: 'The Fulfillment', text: 'EVERY ORDER FILLED. EVERY CRATE A SMALL PROMISE KEPT.' },
  { id: 'sign_prop_fulfillment_02', surface: 'billboard', factionId: 'faction_fulfillment', sponsor: 'The Fulfillment', text: 'SATISFACTION IS A ROUTE. WE RUN IT ON SCHEDULE.' },
  { id: 'sign_prop_archive_01', surface: 'billboard', factionId: 'faction_archive', sponsor: 'The Archive', text: 'WHAT IS WRITTEN SURVIVES THE WRITER. CONTRIBUTE YOUR RECORD.' },
  { id: 'sign_prop_archive_02', surface: 'billboard', factionId: 'faction_archive', sponsor: 'The Archive', text: 'FORGETTING IS A SERVICE OUTAGE. THE ARCHIVE STAYS UP.' },
  { id: 'sign_prop_pitborn_01', surface: 'billboard', factionId: 'faction_pitborn', sponsor: 'The Pitborn', text: 'BORN IN THE PIT. DIED ON YOUR LEDGER. STILL HERE.' },
  { id: 'sign_prop_pitborn_02', surface: 'billboard', factionId: 'faction_pitborn', sponsor: 'The Pitborn', text: 'THE PIT OWES US NOTHING. WE TAKE IT ANYWAY.' },
  { id: 'sign_prop_verge_01', surface: 'billboard', factionId: 'faction_verge_layers', sponsor: 'The Verge-Layers', text: 'THE MACHINES LEFT DOORS. WE KEEP THE KEYS. KNOCK POLITELY.' },
  { id: 'sign_prop_verge_02', surface: 'billboard', factionId: 'faction_verge_layers', sponsor: 'The Verge-Layers', text: 'EVERY GATE HAS A PRICE AND A QUESTION. ANSWER BOTH.' },
]);

// ── the dynamic panels ───────────────────────────────────────────────────────────────────
// WANTED poster: shown on the billboard while the player's heat carries a real warrant
// (wanted tier bounty or higher). Slots: {callsign} {hull} {tier}.
export const WANTED_POSTER_LINES = Object.freeze([
  { id: 'sign_wanted_01', sponsor: 'Concord Warrant Office', text: 'WANTED — the {hull} {callsign}. {tier} warrant outstanding. Report sightings; do not approach.' },
  { id: 'sign_wanted_02', sponsor: 'Concord Warrant Office', text: 'NOTICE OF WARRANT — {callsign}, registered {hull}. Charges pending review. Surrender preserves the hull.' },
  { id: 'sign_wanted_03', sponsor: 'Station Security', text: 'SECURITY POSTING — the {hull} {callsign} is wanted under a {tier} warrant. Berth crews report contact.' },
  { id: 'sign_wanted_04', sponsor: 'Bounty Desk', text: 'OPEN CLAIM — the {hull} {callsign}. {tier} warrant. Finders collect in person.' },
]);

// Feat headline: the wire names the pilot when the Record says they did something loud.
// {pilot} is the pilot display name; the deed body follows on the same line.
export const FEAT_HEADLINE_FORMAT = '{pilot} — {deed}';

export const SIGN_SURFACE_IDS = Object.freeze(['billboard', 'bay', 'crawl']);

const ALL_STATIC = Object.freeze([...SIGN_BAY, ...SIGN_BILLBOARD, ...SIGN_CRAWL, ...SIGN_PROPAGANDA]);

/**
 * signsForSurface(surface, { factionId, stationTypeId }) → entries eligible for that berth.
 * Billboard/bay/crawl each own their pools; propaganda lines ride the billboard pool for the
 * berth's own flag and the crawl pool as official notices (same line, different casing below).
 */
export function signsForSurface(surface, { factionId = null, stationTypeId = null } = {}) {
  const out = [];
  for (const entry of ALL_STATIC) {
    if (entry.factionId && entry.factionId !== factionId) continue;
    if (entry.types && !entry.types.includes(stationTypeId)) continue;
    if (entry.surface === surface) { out.push(entry); continue; }
    // Propaganda authored for the billboard also runs on the crawl as an official notice.
    if (surface === 'crawl' && entry.factionId && entry.surface === 'billboard') out.push(entry);
  }
  return out;
}

/** fillSignSlots(template, slots) → interpolated text (missing slots leave the braces out). */
export function fillSignSlots(template, slots = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (match, key) => {
    const value = slots[key];
    return value == null || value === '' ? match : String(value);
  });
}

export default {
  SIGN_BAY, SIGN_BILLBOARD, SIGN_CRAWL, SIGN_PROPAGANDA,
  WANTED_POSTER_LINES, FEAT_HEADLINE_FORMAT, SIGN_SURFACE_IDS,
  signsForSurface, fillSignSlots,
};
