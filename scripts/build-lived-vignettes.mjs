#!/usr/bin/env node
// Writes externalOnly lived-vignette encounter modules (orders 372+).
// Re-run is deterministic. Then run scripts/build-encounter-index.mjs.
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEncounterShape } from '../src/data/encounters/shape.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIR = join(ROOT, 'src/data/encounters');
const ZONE_TYPES = [
  'civilian_core', 'trade_lane', 'patrol_corridor', 'border_checkpoint',
  'refinery_approach', 'mining_belt', 'colony', 'derelict_field',
  'outlaw_zone', 'radiation_field', 'nebula_fog', 'ambush_lane',
  'anomaly_deep', 'planetary_mass',
];

const MOTION = {
  hold_and_talk: 'hold',
  wedding_join: 'face',
  procession: 'creep',
  shift_relief: 'depart',
  argument: 'face',
  busker: 'orbit',
  search_pattern: 'weave',
  festival_orbit: 'orbit',
  strike_ring: 'ring',
  false_alarm: 'hold',
  customs_theater: 'face',
  race_loop: 'orbit',
  escort: 'creep',
  tow_prop: 'hold',
};

const ARCH = {
  mule_trader: 'mule_trader',
  faction_choir: 'choir_zealot',
  faction_reach: 'reaver_pirate',
  faction_scn: 'patrol_lawman',
  faction_vael: 'customs_cutter',
  faction_mts: 'mule_trader',
  faction_dmc: 'mule_trader',
  faction_free: 'mule_trader',
  faction_understory: 'mule_trader',
  faction_fulfillment: 'mule_trader',
  faction_archive: 'mule_trader',
  faction_pitborn: 'bruiser_brawler',
  faction_helix: 'patrol_lawman',
  faction_verge_layers: 'quiet_ghost',
  faction_quiet: 'quiet_ghost',
  patrol_lawman: 'patrol_lawman',
  choir_zealot: 'choir_zealot',
  reaver_pirate: 'reaver_pirate',
  bruiser_brawler: 'bruiser_brawler',
  quiet_ghost: 'quiet_ghost',
  customs_cutter: 'customs_cutter',
  wasp_swarmer: 'wasp_swarmer',
  none: 'mule_trader',
  corsair_raider: 'corsair_raider',
  lancer_sniper: 'lancer_sniper',
  pd_screen_escort: 'pd_screen_escort',
  field_anchor_controller: 'field_anchor_controller',
};

function scene(order, file, id, grammar, verb, cast, title, voice, factionId, hail, choices, receipts, color, prop) {
  const [situation, place, twist, actor] = grammar.split('|');
  return {
    order, file, id, situation, place, twist, actor, verb, cast, title, voice, factionId, hail, choices, receipts, color, prop: prop || null,
  };
}

const C = (a, b, c) => [
  { id: 'a', label: a[0], playerLine: a[1] },
  { id: 'b', label: b[0], playerLine: b[1] },
  { id: 'c', label: c[0], playerLine: c[1] },
];

const SITUATION_TEXT = {
  toll: {
    hail: '${voice}: The ${noun} is due at ${placeLabel}. Pay, dispute, or keep moving.',
    choices: [
      ['Pay the count', '${voice}, I will pay for the ${noun} and take the marked lane.'],
      ['Ask for proof', 'Show me the ${noun} count before I enter ${placeLabel}.'],
      ['Leave the toll', 'I decline the ${noun}; clear my hull from ${placeLabel}.'],
    ],
    receipts: {
      a: 'Count cleared. The ${noun} crossed ${placeLabel} under your name.',
      b: 'Dispute logged. ${voice} kept the original count intact.',
      c: 'Declined. The ${noun} stays on their side of ${placeLabel}.',
    },
    color: [
      'The toll board has one number and three kinds of handwriting.',
      '${voice} counts the queue by hull, not by promise.',
    ],
  },
  patrol: {
    hail: '${voice}: Hold at ${placeLabel}. The ${noun} is not on your manifest.',
    choices: [
      ['Answer the scan', 'I am holding. Read the ${noun} against my manifest.'],
      ['File a question', 'Log the stop, ${voice}; I want the rule in writing.'],
      ['Leave the lane', 'I decline the scan. My hull is leaving ${placeLabel}.'],
    ],
    receipts: {
      a: 'Scan complete. The ${noun} remains in the same place.',
      b: 'Question filed. ${voice} has to answer it next shift.',
      c: 'You left. The patrol kept its route through ${placeLabel}.',
    },
    color: [
      'The patrol has one working lamp and no spare explanation.',
      '${voice} marks the stop before the scanner warms.',
    ],
  },
  hunt: {
    hail: '${voice}: We found the ${noun} trail crossing ${placeLabel}. Stay outside it.',
    choices: [
      ['Track the mark', 'I will follow the ${noun} trail, slow and outside your line.'],
      ['Share the bearing', 'Send me the last bearing before the mark went cold.'],
      ['Leave the search', 'I am not joining this hunt. Keep ${placeLabel} clear.'],
    ],
    receipts: {
      a: 'The mark held. Your bearing put the trail back together.',
      b: 'Bearing shared. ${voice} kept the original search lead.',
      c: 'You left. The ${noun} trail kept crossing ${placeLabel}.',
    },
    color: [
      'The search grid has a gap where the old beacon failed.',
      '${voice} reads each empty square before moving the scope.',
    ],
  },
  distress: {
    hail: '${voice}: A distress call names the ${noun} near ${placeLabel}. Answer or stand clear.',
    choices: [
      ['Answer the call', 'I have the ${noun} call. Send its last clean bearing.'],
      ['Hold a lamp', 'I can hold a lamp outside the caller’s approach.'],
      ['Leave the call', 'I cannot answer. Keep my hull clear of ${placeLabel}.'],
    ],
    receipts: {
      a: 'Call answered. The bearing stopped moving while you listened.',
      b: 'Lamp held. ${voice} took the caller through the marked gap.',
      c: 'You left. The ${noun} call stayed open on their board.',
    },
    color: [
      'The distress tone repeats on the same damaged second.',
      '${voice} leaves the rescue channel open after the call ends.',
    ],
  },
  salvage: {
    hail: '${voice}: The ${noun} came loose at ${placeLabel}. We have not called it scrap.',
    choices: [
      ['Secure the piece', 'I will secure the ${noun} before it hits the lane.'],
      ['Mark the owner', 'Put the last owner on record before anyone cuts metal.'],
      ['Leave the wreck', 'I will not claim it. Leave the ${noun} at ${placeLabel}.'],
    ],
    receipts: {
      a: 'Piece secured. The cut starts after the ownership mark.',
      b: 'Owner marked. ${voice} kept the saws cold for one shift.',
      c: 'You left it. The ${noun} remains loose at ${placeLabel}.',
    },
    color: [
      'Their salvage clamp has one tooth bent toward the wreck.',
      '${voice} tags loose mass before anyone brings a torch.',
    ],
  },
  trade: {
    hail: '${voice}: The ${noun} is the whole lot. ${placeLabel} has room to bargain.',
    choices: [
      ['Take the lot', 'I will take the ${noun} if the seal still reads clean.'],
      ['Change the terms', 'Cut the price or split the ${noun} across both holds.'],
      ['Pass the trade', 'No deal from me. Keep the ${noun} off my manifest.'],
    ],
    receipts: {
      a: 'Lot transferred. The seal stayed legible through the handoff.',
      b: 'Terms changed. ${voice} wrote the smaller number by hand.',
      c: 'You passed. Their ${noun} goes back under the tarp.',
    },
    color: [
      'The price is chalked on a panel that still has heat.',
      '${voice} weighs the seal before looking at the buyer.',
    ],
  },
  convoy: {
    hail: '${voice}: The ${noun} rides with this convoy through ${placeLabel}. Hold formation.',
    choices: [
      ['Take rear watch', 'I will take the rear and count every convoy lamp.'],
      ['Open a lane', 'I can clear the ${placeLabel} crossing for the last hull.'],
      ['Let them pass', 'I am not joining. Keep the ${noun} inside your formation.'],
    ],
    receipts: {
      a: 'Rear watch held. Every lamp came through in the same order.',
      b: 'Lane opened. The last hull passed without spending its reserve.',
      c: 'You let them pass. The ${noun} stayed in convoy.',
    },
    color: [
      'The convoy keeps one empty slot for a hull that never came.',
      '${voice} calls each lamp by position, not by name.',
    ],
  },
  claim: {
    hail: '${voice}: The ${noun} sits inside our claim at ${placeLabel}. Keep your cutter out.',
    choices: [
      ['Mark the boundary', 'I will mark the ${noun} face and leave your cutters room.'],
      ['Check the survey', 'Show me the survey pin before you call this ground yours.'],
      ['Leave the claim', 'I will not work it. Keep the ${noun} inside your line.'],
    ],
    receipts: {
      a: 'Boundary marked. Both cutter tracks stayed on their own side.',
      b: 'Survey checked. ${voice} added one pin where the line bends.',
      c: 'You left. The ${noun} face remains under their claim.',
    },
    color: [
      'The claim pins lean away from the deepest cut.',
      '${voice} counts a boundary by the gaps between markers.',
    ],
  },
  anomaly: {
    hail: '${voice}: The ${noun} signal repeats from ${placeLabel}. Do not answer its second voice.',
    choices: [
      ['Record the return', 'I will record one return and keep the transmitter closed.'],
      ['Compare the traces', 'Put the first ${noun} trace beside the newest return.'],
      ['Leave it unread', 'I will not answer. Leave the ${noun} signal alone.'],
    ],
    receipts: {
      a: 'Return recorded. The second voice arrived on the old timestamp.',
      b: 'Traces aligned. ${voice} found the same missing interval.',
      c: 'You left it unread. The signal stayed at ${placeLabel}.',
    },
    color: [
      'The instrument needle returns to zero one beat too late.',
      '${voice} keeps the receiver muted between each pass.',
    ],
  },
  wreck: {
    hail: '${voice}: The ${noun} is stamped on a wreck at ${placeLabel}. Do not cut yet.',
    choices: [
      ['Read the plate', 'I will read the ${noun} plate before anyone starts the tow.'],
      ['Hold the wreck', 'I can hold the wreck clear while you check the registry.'],
      ['Leave it drifting', 'I am leaving it here. Keep the ${noun} out of my route.'],
    ],
    receipts: {
      a: 'Plate read. The registry lists a shift, not a final owner.',
      b: 'Wreck held. The next registry pass can happen without drift.',
      c: 'You left it. The ${noun} keeps its slow turn at ${placeLabel}.',
    },
    color: [
      'The hull number stops halfway through the last digit.',
      '${voice} keeps the cutting torch pointed at the deck.',
    ],
  },
  yard: {
    hail: '${voice}: The ${noun} needs a hand at ${placeLabel}. The shift is already short.',
    choices: [
      ['Take the tool', 'I will take the ${noun} tool and finish the loose bracket.'],
      ['Call relief', 'Send the next shift before the yard light goes dark.'],
      ['Leave the shift', 'I cannot stay. Leave the ${noun} for the next crew.'],
    ],
    receipts: {
      a: 'Bracket seated. The work light held through the last turn.',
      b: 'Relief called. ${voice} kept the tool on the bench.',
      c: 'You left. The unfinished ${noun} stayed inside the yard line.',
    },
    color: [
      'The work light marks one empty station on the bench.',
      '${voice} records the tool before recording the delay.',
    ],
  },
  archive: {
    hail: '${voice}: The ${noun} carries a name at ${placeLabel}. Read it without adding one.',
    choices: [
      ['Read the name', 'I will read the ${noun} plate exactly as it is cut.'],
      ['Copy the record', 'Copy the shift mark too; names are not the whole record.'],
      ['Leave the plate', 'I will not alter it. Leave the ${noun} in the archive.'],
    ],
    receipts: {
      a: 'Name read once. The plate gives no second line.',
      b: 'Record copied. ${voice} left the blank field blank.',
      c: 'You left the plate. Its lettering stayed at ${placeLabel}.',
    },
    color: [
      'The archive keeps a space where a crew count should be.',
      '${voice} reads the date before reading the name.',
    ],
  },
  escort: {
    hail: '${voice}: Keep the ${noun} behind your drive through ${placeLabel}. No passing.',
    choices: [
      ['Take the lead', 'I will take the lead and keep the ${noun} in my wake.'],
      ['Cover the flank', 'I can cover the outside while your slow hull crosses.'],
      ['Leave the escort', 'I cannot escort this run. Keep the ${noun} on course.'],
    ],
    receipts: {
      a: 'Lead taken. The escorted hull kept its lamps behind yours.',
      b: 'Flank clear. No second signal followed the crossing.',
      c: 'You left. ${voice} kept the ${noun} on the marked course.',
    },
    color: [
      'The escort beacon has been taped over at the wrong end.',
      '${voice} checks the trailing lamp before calling the lead clear.',
    ],
  },
  puzzle: {
    hail: '${voice}: The ${noun} count fails at ${placeLabel}. Find which mark does not belong.',
    choices: [
      ['Check the first mark', 'I will check the ${noun} mark against the older count.'],
      ['Compare both books', 'Put both ledgers side by side and read the gap aloud.'],
      ['Leave it unsolved', 'I will not guess. Leave the ${noun} count open.'],
    ],
    receipts: {
      a: 'First mark checked. The mismatch begins one line below it.',
      b: 'Books compared. ${voice} found the same missing entry twice.',
      c: 'You left it open. The count still waits at ${placeLabel}.',
    },
    color: [
      'The answer is written in the part the clerk crossed out.',
      '${voice} keeps the pencil beside the blank, not the sum.',
    ],
  },
  wake: {
    hail: '${voice}: Your wake crossed the ${noun} marker at ${placeLabel}. Log it or clear it.',
    choices: [
      ['Log the crossing', 'I crossed the ${noun} marker. Put my hull on the record.'],
      ['Reset the marker', 'I can reset the buoy before another wake hits it.'],
      ['Leave the mark', 'I will not file it. Leave the ${noun} marker where it drifted.'],
    ],
    receipts: {
      a: 'Crossing logged. The wake line is now attached to your hull.',
      b: 'Marker reset. ${voice} watched its light settle back on bearing.',
      c: 'You left the mark. The ${noun} buoy drifted through ${placeLabel}.',
    },
    color: [
      'The buoy records the wake long after the water has gone quiet.',
      '${voice} checks the bearing before clearing the channel.',
    ],
  },
};

function renderText(template, values) {
  return template.replace(/\$\{(noun|voice|placeLabel)\}/g, (_, key) => values[key]);
}

const HAND = [
  scene(372, '372-the-kettle-hold.js', 'cold_kettle', 'trade|civilian_core|none|mule_trader', 'hold_and_talk', 2,
    'KETTLE HOLD', 'BRACK', 'faction_free',
    'BRACK: Kettle\'s on. Pass now, pass dry.',
    C(['Take the mug', 'I\'ll take the mug.'], ['Wave the slot through', 'The slot can move.'], ['Hold clear', 'I\'ll hold outside.']),
    { a: 'Neighbor for a minute. The kettle outranks the slot.', b: 'You waved them through. The kettle still sings.', c: 'You held clear. Weather, not a boarding.' },
    ['The mug is chipped on the station side.', 'Nobody files a kill for hot water.'], null),
  scene(373, '373-the-berth-vows.js', 'berth_vows', 'convoy|civilian_core|named|faction_choir', 'wedding_join', 3,
    'BERTH VOWS', 'CANTOR', 'faction_choir',
    'CANTOR: Two hulls. One berth. The Choir observes. Hold, or the lane does.',
    C(['Witness the berth', 'I witness the berth.'], ['Keep the lane clear', 'I\'ll keep the outside.'], ['Decline the circle', 'Not my vow.']),
    { a: 'Vow logged. The berth has two names for one shift.', b: 'The lane stayed a lane. The berth still married.', c: 'You declined. The circle closed without you.' },
    ['They asked for quiet thrust, not a sermon.', 'The berth number is painted twice.'], null),
  scene(374, '374-the-ash-casket.js', 'ash_casket', 'escort|civilian_core|none|faction_choir', 'procession', 3,
    'ASH CASKET', 'CANTOR', 'faction_choir',
    'CANTOR: No drive. Match burn. Do not pass inside the ash.',
    C(['Take the outside station', 'I\'ll take the outside station.'], ['Match and stay', 'Matching burn.'], ['Pass wide', 'Passing wide.']),
    { a: 'Ash arrives whole. You were the outside station.', b: 'You matched. The lane did not inhale it.', c: 'You passed wide. The casket kept its pace.' },
    ['The casket has no transponder, only a name tape.', 'Half burn is the whole courtesy.'], 'ASH CASKET'),
  scene(375, '375-the-name-plate.js', 'name_plate', 'anomaly|derelict_field|none|faction_archive', 'hold_and_talk', 1,
    'NAME PLATE', 'ARCHIVIST', 'faction_archive',
    'ARCHIVIST: The plate reads. The rock does not. Read, or leave the letters.',
    C(['Read JUNO', 'Reading JUNO.'], ['Copy the shift', 'Copying shift four.'], ['Leave the letters', 'Leaving the letters.']),
    { a: 'One name back in a mouth. JUNO, shift four.', b: 'The shift is copied. The rock stays mute.', c: 'Still only on metal.' },
    ['The plate is bolted where a beacon used to be.', 'Archive does not invent the missing crew.'], null),
  scene(376, '376-the-relief-lamp.js', 'relief_lamp', 'yard|refinery_approach|none|faction_dmc', 'shift_relief', 2,
    'RELIEF LAMP', 'FOREMAN', 'faction_dmc',
    'FOREMAN: Lamp\'s yours. Cone stays red till you say. I ain\'t staying for pretty.',
    C(['Take the lamp', 'Lamp\'s mine.'], ['Make them wait', 'Hold the cone.'], ['Fly the cone', 'I\'m through.']),
    { a: 'Relief owns the face. The red cone finally dies.', b: 'They waited. The cone stayed honest.', c: 'You flew it. The cone belongs to a stranger again.' },
    ['The offgoing hull is already unlatched.', 'Pretty is not a shift change.'], null),
  scene(377, '377-the-invoice-fight.js', 'invoice_fight', 'trade|trade_lane|none|faction_mts', 'argument', 2,
    'INVOICE FIGHT', 'DESK', 'faction_mts',
    'DESK: Your account is standing. His is not. He is in your shadow. Nothing personal.',
    C(['Certify the shadow', 'The shadow is his.'], ['Split the delay', 'Split the minute.'], ['Leave them on the clock', 'Not my invoice.']),
    { a: 'One account eats the minute. The shadow was certified.', b: 'The delay split. Both desks hate you politely.', c: 'You left. The clock kept both of them.' },
    ['Nothing personal is how MTS starts a fight.', 'The shadow is a real occlusion, not a metaphor.'], null),
  scene(378, '378-the-tin-hymn.js', 'tin_hymn', 'trade|civilian_core|none|faction_free', 'busker', 1,
    'TIN HYMN', 'PIP', 'faction_free',
    'PIP: No flag. I play the pin till somebody pays in filters or leaves.',
    C(['Drop filters', 'Filters for the pin.'], ['Listen one verse', 'One verse.'], ['Dark the channel', 'Dark it.']),
    { a: 'The pin keeps a song. Your filter count dropped.', b: 'One verse. No debt.', c: 'Only the chevron. The channel is dark.' },
    ['Free captains do not invoice a hymn.', 'The pin is a navigation mark, not a stage.'], null),
  scene(379, '379-the-loose-cat.js', 'loose_cat', 'distress|colony|none|faction_free', 'search_pattern', 2,
    'LOOSE CAT', 'NELL', 'faction_free',
    'NELL: Answers to none of us. We are temporary. She is not.',
    C(['Sweep the spar', 'Sweeping the spar.'], ['Post a bounty of fish', 'Fish on the board.'], ['Call it drifted', 'She drifted.']),
    { a: 'Visor-flash in a spar. The cat was never temporary.', b: 'A fish bounty. The colony will argue about the price.', c: 'A new rumor. No visor.' },
    ['Suit-orange, last seen on the greenhouse spar.', 'Do not call a tender. She bites tethers.'], null),
  scene(380, '380-the-harvest-orbit.js', 'harvest_orbit', 'convoy|colony|none|faction_choir', 'festival_orbit', 3,
    'HARVEST ORBIT', 'CANTOR', 'faction_choir',
    'CANTOR: One turn for the crop. Join the circle. Do not cut it.',
    C(['Join the circle', 'Joining.'], ['Orbit outside', 'Outside the circle.'], ['Cut through', 'Cutting through.']),
    { a: 'The crop got its turn. You were in the circle.', b: 'You orbited outside. The chord held.', c: 'A chord broken. The barge still turns, angrier.' },
    ['The crop is thin. The turn is not optional.', 'Cutting the circle is how feuds start here.'], null),
  scene(381, '381-the-dark-cones.js', 'dark_cones', 'claim|mining_belt|none|faction_dmc', 'strike_ring', 3,
    'DARK CONES', 'FOREMAN', 'faction_dmc',
    'FOREMAN: Cones dark on purpose. Ore stays. You cut it, you cut us.',
    C(['Hold outside', 'Holding outside.'], ['Carry water', 'I brought water.'], ['Cross a dark face', 'Crossing.']),
    { a: 'Faces stay uncut. You were not the incident.', b: 'Water across the dark. The strike drank.', c: 'You are the incident. The cones stay dark anyway.' },
    ['Work lamps are off. That is the picket.', 'Ore in the face is not abandoned. It is refused.'], null),
  scene(382, '382-the-skiff-saturday.js', 'skiff_saturday', 'patrol|colony|none|mule_trader', 'race_loop', 3,
    'SKIFF SATURDAY', 'HOLLIS', 'faction_free',
    'HOLLIS: No adults in the loop. Hold the outside.',
    C(['Marshal the can', 'I\'ll marshal the can.'], ['Time a lap', 'Timing one lap.'], ['Order it stopped', 'Stop the loop.']),
    { a: 'A can changes hands. Nobody files a kill.', b: 'You timed it. The winner already knew.', c: 'You ordered it stopped. They will do it tomorrow, wider.' },
    ['Three kid skiffs. One water-can buoy. No guns.', 'Adults in the loop become the hazard.'], null),
  scene(383, '383-the-boot-whistle.js', 'boot_whistle', 'distress|ambush_lane|none|faction_reach', 'false_alarm', 1,
    'BOOT WHISTLE', 'SLIP', 'faction_reach',
    'SLIP: Weigh-slip says distress. Boot says joke. Pick the real number.',
    C(['Kill the flash', 'Killing the flash.'], ['Log it false', 'Logging false.'], ['Search anyway', 'Searching anyway.']),
    { a: 'The boot stays. The number goes quiet.', b: 'Logged false. The drum keeps time.', c: 'You searched. The joke had no body in it.' },
    ['Red-white is a boot on a drum, not a hull breach.', 'Reach will not thank you for either choice.'], null),
  scene(384, '384-the-rehearsed-scan.js', 'rehearsed_scan', 'patrol|border_checkpoint|logic|faction_scn', 'customs_theater', 2,
    'REHEARSED SCAN', 'CLERK', 'faction_scn',
    'CLERK: Stand by. This verification is a drill. Ref 44-C still applies.',
    C(['Play the hull', 'Playing along.'], ['Ask who grades drills', 'Who grades this?'], ['Refuse the scene', 'Not your stage.']),
    { a: 'Drill signed. Your hold never opened.', b: 'The grader is a desk you will not meet. The drill still signed.', c: 'You refused. Ref 44-C noted a temperament.' },
    ['They already graded the boarding before you arrived.', 'Theater with a real reference number.'], null),
  scene(385, '385-the-courtesy-honk.js', 'courtesy_honk', 'wake|trade_lane|none|patrol_lawman', 'hold_and_talk', 2,
    'COURTESY HONK', 'WARD', 'faction_scn',
    'WARD: You were inside my number. I flashed. You did not. File, or don\'t.',
    C(['Trade flashes', 'Flashing back.'], ['File both', 'File both of us.'], ['Pretend no overlap', 'No overlap.']),
    { a: 'A horn instead of a report.', b: 'Two reports. The lane learns your name.', c: 'You pretended. The flash is still on their log.' },
    ['Two pins, one near-miss, no mines.', 'Courtesy is a flash, not a fine.'], null),
  scene(386, '386-the-twelve-degrees.js', 'twelve_degrees', 'trade|colony|none|faction_free', 'hold_and_talk', 2,
    'TWELVE DEGREES', 'NELL', 'faction_free',
    'NELL: They took the cans and the grade. Tea is hot. Air is not.',
    C(['Share heat', 'Sharing heat.'], ['Trade a can', 'One can.'], ['Drink and leave', 'Drinking. Leaving.']),
    { a: 'Someone sleeps warmer. The ring does not.', b: 'A can changed hands. Twelve degrees stays twelve.', c: 'You drank. The ring is still cold.' },
    ['Colony ring at twelve. The canisters are already gone.', 'Tea is not air. They know. They offer it anyway.'], null),
  scene(387, '387-the-variance-apron.js', 'variance_apron', 'puzzle|border_checkpoint|none|faction_helix', 'customs_theater', 1,
    'VARIANCE ON THE APRON', 'HX-04', 'faction_helix',
    'HX-04 — VARIANCE FILE OPEN. CREW IS DRINKING. BERTH IS NOT. NO ACTION REQUIRED.',
    C(['Initial the file', 'Initialed.'], ['Wait out the mug', 'I\'ll wait the mug.'], ['Depart unsigned', 'Departing unsigned.']),
    { a: 'The fine and the tea share a hand. You initialed.', b: 'The mug ended. The file noticed you waiting.', c: 'Unsigned. The variance remains open, which is its hobby.' },
    ['Helix does not raise its voice. The file does not blink.', 'No action required is not the same as nothing happened.'], null),
  scene(388, '388-the-file-closed.js', 'file_closed_crew', 'archive|patrol_corridor|none|faction_helix', 'procession', 2,
    'FILE CLOSED, CREW NOT', 'HX-19', 'faction_helix',
    'HX-19 — VARIANCE FILE CLOSED. CREW COUNT DOES NOT MATCH. DO NOT RESOLVE.',
    C(['Join the slow file', 'Joining the file.'], ['Name the missing', 'Naming the missing.'], ['Let it close wrong', 'Close it wrong.']),
    { a: 'You joined. Paper stays shut. A bunk does not.', b: 'You named them. The file did not reopen. The bunk did.', c: 'Closed wrong. Helix will keep the discrepancy as a souvenir.' },
    ['A closure parade whose headcount disagrees with the door.', 'Do not resolve is an order, not a mood.'], null),
  scene(389, '389-the-veil-walk.js', 'veil_walk', 'convoy|nebula_fog|none|faction_choir', 'procession', 3,
    'VEIL WALK', 'CANTOR', 'faction_choir',
    'CANTOR: The fog takes order. Half burn. Pass outside the voices.',
    C(['Escort the last voice', 'I have the last voice.'], ['Parallel outside', 'Paralleling.'], ['Jump the hymn', 'Jumping the hymn.']),
    { a: 'The verse exits the fog together.', b: 'You stayed outside the voices. They still made it.', c: 'One voice short. The fog kept a name.' },
    ['Pilgrims at half burn. The hymn is the formation.', 'Jumping a hymn is a kind of cut.'], null),
  scene(390, '390-the-wrong-berth.js', 'wrong_berth', 'distress|patrol_corridor|none|faction_scn', 'false_alarm', 1,
    'WRONG BERTH', 'CLERK', 'faction_scn',
    'CLERK: You are not the hull on this hail. Ref 44-C. State the hull you are.',
    C(['Correct the name', 'Correcting the name.'], ['Accept their hull', 'I\'ll wear their hull.'], ['Ignore the hail', 'Not my hull.']),
    { a: 'Their missing ship stays missing. You stay you.', b: 'You wore a name that is not yours. Ref 44-C enjoyed it.', c: 'Ignored. The hail keeps looking for a hull you are not.' },
    ['The hail wants a ship that docked yesterday.', 'Accepting their hull is how manifests rot.'], null),
];

// The third choice on wrong_berth was truncated in C() — fix by using full C above.
// Rebuild 390 properly below if length mismatches. Checked: C() needs 3 pairs.
// I passed only 2 to the last scene's C() by mistake. Fixing in a post step if needed.

function ambient(id, grammar, sectors, motion, authority, runner, voice, cast, hail, color, choices, receipts, prop = null) {
  const [situation, place, twist, actor] = grammar.split('|');
  return {
    id, situation, place, twist, actor, sectors, motion, authority, runner, voice, cast,
    hail, color, choices, receipts, prop,
  };
}

const AMBIENT = [
  ambient('fare_dodger_chase', 'patrol|trade_lane|named|faction_scn', ['sector_helios_prime'], 'chase', 'faction_scn', 'faction_free', 'WARD',
    [['mule_trader', 'faction_free', 'UNLICENSED SKIFF'], ['patrol_lawman', 'faction_scn', 'SCN PATROL']],
    'WARD: The Answering Buoy clocks one skiff skipping the harbour fee.',
    'It cuts the freight spine with the fee still unpaid.',
    [['Read the fee', 'I will back the patrol and settle the harbour fee.'], ['Wave it through', 'Let the skiff pass; the harbour can wait one run.'], ['Stay clear', 'I am staying clear; finish the crossing without me.']],
    ['Fee recorded. The skiff keeps its engine and its route.', 'The skiff cleared the spine before the buoy could answer.', 'You stayed out. The patrol kept counting hulls.']),
  ambient('claim_jump_run', 'claim|mining_belt|follow_on|faction_reach', ['sector_ceres_belt', 'sector_hyperion_cut', 'sector_rhea_cinder', 'sector_nereid_shoal'], 'chase', 'faction_dmc', 'faction_reach', 'FOREMAN',
    [['reaver_pirate', 'faction_reach', 'CLAIM JUMPER'], ['patrol_lawman', 'faction_dmc', 'DMC SEAM PATROL'], ['patrol_lawman', 'faction_dmc', 'DMC SEAM PATROL']],
    'FOREMAN: That ore left the Quarry Cathedral without a receipt.',
    'The seam is still loading while the claim mark runs.',
    [['Hold the claim', 'I will help the watch recover the stolen ore.'], ['Cover the jumper', 'I will keep the claim crew looking at the wrong seam.'], ['Leave the seam', 'I am leaving the belt to the crews already there.']],
    ['The watch logged the load. The seam remains open.', 'The jumper kept the ore and lost the clean bearing.', 'You left the claim crew to count the empty cradle.']),
  ambient('manifest_stop_and_search', 'patrol|border_checkpoint|player_echo|faction_scn', ['sector_tethys_junction', 'sector_dione_lane'], 'hold', 'faction_scn', 'faction_mts', 'CLERK',
    [['mule_trader', 'faction_mts', 'HAULER'], ['customs_cutter', 'faction_scn', 'CUSTOMS CUTTER']],
    'CLERK: Opened pod sits at the weigh; read the seal back.',
    'The pod lid is open. The manifest still calls it sealed.',
    [['Back the search', 'I will help customs match the pod to its manifest.'], ['Back the hauler', 'I will keep the cutter from turning a mismatch into seizure.'], ['Stay outside', 'I am not joining a count that has already started.']],
    ['Customs marked the pod opened. The hauler kept its berth.', 'The hauler left with the seal still in its own hand.', 'You watched the weigh slip change desks.'], 'OPENED POD'),
  ambient('press_gang_tow', 'escort|outlaw_zone|depth|faction_reach', ['sector_sker_haven', 'sector_kepler_scar'], 'tow', 'faction_free', 'faction_reach', 'SLIP',
    [['reaver_pirate', 'faction_reach', 'PRESS GANG TUG'], ['mule_trader', 'faction_free', 'PRESSED HAULER']],
    'SLIP: The Concealed Harbour can see this tow. Call it a transfer.',
    'The aft clamps are closed. Nobody aboard signed the release.',
    [['Cut the tow', 'I will help the hauler break free of that line.'], ['Look away', 'I will leave the Reach crew to finish its business.'], ['Keep your distance', 'I will keep clear of both hulls and their paperwork.']],
    ['The tow line went slack. The hauler kept its people.', 'The pirate kept the line and took the quiet approach.', 'You left the harbour to name the transfer.']),
  ambient('paperless_dash', 'trade|nebula_fog|literalized|faction_scn', ['sector_nyx_march', 'sector_eris_margin', 'sector_proteus_well', 'sector_eunomia_gulf'], 'chase', 'faction_scn', 'faction_quiet', 'CLERK',
    [['quiet_ghost', 'faction_quiet', 'PAPERLESS FREIGHT'], ['customs_cutter', 'faction_scn', 'CUSTOMS CUTTER']],
    'CLERK: Freight has no papers. The fog is not a stamp.',
    'The cutter reads the empty manifest into an empty channel.',
    [['Back the cutter', 'I will help customs take the unlisted freight.'], ['Clear a path', 'I will give the paperless hull one clean line into fog.'], ['Stay unlisted', 'I am not adding my name to somebody else’s manifest.']],
    ['The cutter got a bearing. The cargo stayed covered.', 'The ghost went into the fog with its hold shut.', 'You kept your name off the manifest.']),
  ambient('yard_tow', 'yard|refinery_approach|k1|faction_dmc', ['sector_ceres_belt', 'sector_vesta_forge', 'sector_charon_expanse', 'sector_hyperion_cut'], 'tow', 'faction_dmc', 'faction_free', 'FOREMAN',
    [['mule_trader', 'faction_dmc', 'TUG'], ['mule_trader', 'faction_dmc', 'DEAD HAULER']],
    'FOREMAN: Long Berth has a dead hull. One tow line is enough.',
    'The dead hauler is still carrying somebody else’s claim tag.',
    [['Clear the tow', 'I will get the dead hull into the yard intact.'], ['Claim salvage first', 'I will mark the salvage before that tow reaches the yard.'], ['Leave the tag', 'I will leave the claim crews to settle the hull.']],
    ['The tug reached the yard with its claim tag visible.', 'The salvage mark went on before the yard gate.', 'You left the hull between the tug and the yard.']),
  ambient('fresh_wreck_vultures', 'wreck|derelict_field|unique_wreck|faction_reach', ['sector_pallas_drift', 'sector_ashfall_reach', 'sector_kepler_scar', 'sector_io_reach'], 'vulture', 'faction_free', 'faction_reach', 'SLIP',
    [['reaver_pirate', 'faction_reach', 'VULTURE 1'], ['reaver_pirate', 'faction_reach', 'VULTURE 2'], ['reaver_pirate', 'faction_reach', 'VULTURE 3']],
    'SLIP: Fresh wreck. Reach cutters are already measuring the gaps.',
    'The beacon is still warm. The vultures have stopped pretending.',
    [['Protect the claim', 'I will hold the wreck clear until its owner answers.'], ['Back the cutters', 'I will leave the wreck to the Reach salvage crews.'], ['Keep clear', 'I will not enter a field where the claim is still warm.']],
    ['The owner kept the first claim on the beacon.', 'Reach marked three cuts and called the wreck open.', 'You stayed outside the wreck field.'], 'FRESH WRECK'),
  ambient('funeral_column', 'escort|civilian_core|admirers|faction_choir', ['sector_helios_prime', 'sector_veil_nebula', 'sector_phoebe_echo', 'sector_triton_wake'], 'column', 'faction_choir', 'none', 'CANTOR',
    [['choir_zealot', 'faction_choir', 'PILGRIM 1'], ['choir_zealot', 'faction_choir', 'PILGRIM 2'], ['choir_zealot', 'faction_choir', 'PILGRIM 3']],
    'CANTOR: The Candle Fleet held one dark place for this column.',
    'Three hulls keep the same distance from the empty fourth berth.',
    [['Hold the lane', 'I will keep the crossing clear until the column passes.'], ['Cross the column', 'I will cross their line before the dark berth closes.'], ['Wait outside', 'I will wait beyond the route and let them pass.']],
    ['The column crossed without changing its order.', 'The hymn broke once. The column kept its bearing.', 'You waited beyond the empty berth.']),
  ambient('fog_edge_wait', 'hunt|radiation_field|depth|faction_mts', ['sector_pallas_drift', 'sector_io_reach'], 'chase', 'faction_mts', 'faction_quiet', 'DESK',
    [['quiet_ghost', 'faction_quiet', 'PAPERLESS FREIGHT'], ['customs_cutter', 'faction_mts', 'MTS CUSTOMS CUTTER']],
    'DESK: Cutter holds the fog edge. One unlisted freight hull should arrive.',
    'The engines idle where the scan line loses its name.',
    [['Back the cutter', 'I will help customs hold the fog edge for inspection.'], ['Warn the runner', 'I will give the freight hull time to turn away.'], ['Stay quiet', 'I will keep this channel empty and my bearing clear.']],
    ['The cutter kept the edge and logged the empty approach.', 'The ghost turned before the scan line closed.', 'You left the fog to keep its own count.']),
  ambient('lane_racers', 'convoy|trade_lane|admirers|faction_mts', ['sector_dione_lane', 'sector_tethys_junction'], 'chase', 'faction_mts', 'faction_free', 'DESK',
    [['mule_trader', 'faction_free', 'RACER 1'], ['mule_trader', 'faction_free', 'RACER 2'], ['patrol_lawman', 'faction_mts', 'MTS PATROL']],
    'DESK: Two haulers have made the weigh a starting line.',
    'The patrol follows at a speed no freight invoice can explain.',
    [['Clear the lane', 'I will ask the racers to leave room for freight.'], ['Pick a hull', 'I will back the lead hauler through the next marker.'], ['Stay off course', 'I will keep my hull out of their race.']],
    ['The haulers opened one lane for the waiting freight.', 'One mule crossed first. The patrol kept the time.', 'You left the racers to their own marker.']),
  ambient('mail_through_crossfire', 'trade|ambush_lane|named|faction_free', ['sector_io_reach'], 'column', 'faction_free', 'faction_reach', 'MOSS',
    [['mule_trader', 'faction_free', 'COURIER 1'], ['mule_trader', 'faction_free', 'COURIER 2']],
    'MOSS: The Reach mail still runs; keep the packet on the marked bearing.',
    'The dock flag changed. The courier pouch did not.',
    [['Escort the mail', 'I will hold a clear lane for the couriers.'], ['Back the Reach', 'I will let the Reach keep the next bearing.'], ['Stay out', 'I will leave the packet to its own route.']],
    ['Both couriers carried the packet past the held dock.', 'The Reach took the lane. The mail kept moving.', 'You left the courier line unchanged.']),
  ambient('pilgrim_lamp_walk', 'wake|colony|follow_on|faction_choir', ['sector_veil_nebula', 'sector_sedna_dark', 'sector_phoebe_echo'], 'column', 'faction_choir', 'none', 'CANTOR',
    [['choir_zealot', 'faction_choir', 'PILGRIM 1'], ['choir_zealot', 'faction_choir', 'PILGRIM 2'], ['choir_zealot', 'faction_choir', 'PILGRIM 3']],
    'CANTOR: We walk the lamp line where the Veil loses its edges.',
    'Each hull leaves one measured length for the next.',
    [['Keep their passage', 'I will hold the lane while the lamp procession passes.'], ['Cross the line', 'I will cross their bearing before the last lamp fades.'], ['Wait beyond', 'I will wait beyond the procession and its lamps.']],
    ['The last lamp crossed without losing the first.', 'The line opened once, then closed behind your hull.', 'You waited beyond the measured wake.']),
  ambient('refuel_hookup', 'convoy|patrol_corridor|literalized|faction_mts', ['sector_pallas_drift', 'sector_nereid_shoal', 'sector_dione_lane'], 'face', 'faction_mts', 'faction_free', 'DESK',
    [['mule_trader', 'faction_mts', 'MTS TENDER'], ['mule_trader', 'faction_mts', 'FREE HAULER']],
    'DESK: Two hulls are coupled; the lamp-holder still has no shift.',
    'Fuel is moving through the line one quiet measure at a time.',
    [['Take the lamp', 'I will hold the work lamp while they finish refueling.'], ['Back the hauler', 'I will lend the free crew a clear line out.'], ['Leave them coupled', 'I will leave the fuel line to its own hands.']],
    ['The lamp stayed steady until the coupler went dry.', 'The free hauler left with its fuel line capped.', 'You left the two hulls facing each other.']),
  ambient('rescue_drill', 'distress|civilian_core|logic|faction_scn', ['sector_helios_prime'], 'tow', 'faction_scn', 'faction_free', 'WARD',
    [['patrol_lawman', 'faction_scn', 'SCN PATROL'], ['mule_trader', 'faction_scn', 'DRILL CAPSULE']],
    'WARD: Drill capsule under tow. The beacon is not a call for help.',
    'The capsule has a painted hatch and an empty rescue ledger.',
    [['Run the drill', 'I will help the patrol keep the capsule on its line.'], ['Free the tow', 'I will give the capsule a clear path out of the drill.'], ['Keep clear', 'I will leave the exercise to the crews in uniform.']],
    ['The capsule stayed on course. The drill ledger is still blank.', 'The capsule cleared the tow line without a rescue call.', 'You left the drill to finish without another witness.'], 'DRILL CAPSULE'),
  ambient('archive_record_tail', 'archive|anomaly_deep|depth|faction_archive', ['sector_orcus_shadow'], 'chase', 'faction_archive', 'faction_quiet', 'ARCHIVIST',
    [['quiet_ghost', 'faction_quiet', 'RECORD RUNNER'], ['choir_zealot', 'faction_archive', 'ARCHIVE WARDEN']],
    'ARCHIVIST: A stolen record is running. Its last byte names Orcus.',
    'The record skips the same second each time it turns.',
    [['Recover the record', 'I will help the archive bring the record back.'], ['Cover the runner', 'I will keep the quiet hull ahead of the archive.'], ['Leave the file', 'I will not take custody of a moving record.']],
    ['The archive has a bearing. The record is still incomplete.', 'The ghost kept the file and its last missing second.', 'You left the record running into the dark.']),
  ambient('fissure_haul_out', 'salvage|anomaly_deep|k1|faction_free', ['sector_haumea_rift'], 'tow', 'faction_free', 'none', 'MOSS',
    [['mule_trader', 'faction_free', 'FISSURE TUG'], ['mule_trader', 'faction_free', 'DEAD HAULER']],
    'MOSS: Fissure haul is moving. Keep the second hull clear of the seam.',
    'The tow line has one clean pull left before the fissure shifts.',
    [['Guard the line', 'I will keep the haul clear until both hulls are out.'], ['Mark the salvage', 'I will mark the load before it clears the fissure.'], ['Stay above', 'I will keep outside the seam and let them work.']],
    ['Both hulls cleared the fissure with the line still attached.', 'The salvage mark stayed on the load through the pull.', 'You kept above the seam until the tow passed.']),
];

function assertScenes(list) {
  const ids = new Set();
  const keys = new Set();
  const orders = new Set();
  for (const row of list) {
    if (ids.has(row.id)) throw new Error(`dup id ${row.id}`);
    ids.add(row.id);
    const key = `${row.situation}|${row.place}|${row.twist}|${row.actor}`;
    if (keys.has(key)) throw new Error(`dup grammar ${key}`);
    keys.add(key);
    if (orders.has(row.order)) throw new Error(`dup order ${row.order}`);
    orders.add(row.order);
    if (!ARCH[row.actor]) throw new Error(`no arch for ${row.actor}`);
    if (!MOTION[row.verb]) throw new Error(`no motion ${row.verb}`);
    if (!row.choices || row.choices.length < 2) throw new Error(`choices ${row.id}`);
    validateEncounterShape({
      situation: row.situation,
      place: row.place,
      twist: row.twist,
      actor: row.actor,
    }, row.id);
  }
}

// Fix scene 390 if it was built short — reconstruct choices to 3.
{
  const row = HAND[HAND.length - 1];
  if (row.id === 'wrong_berth' && row.choices.length < 3) {
    row.choices = C(
      ['Correct the name', 'Correcting the name.'],
      ['Accept their hull', 'I\'ll wear their hull.'],
      ['Ignore the hail', 'Not my hull.'],
    );
  }
}

function moreScenes(startOrder, usedKeys) {
  const places = ['civilian_core', 'trade_lane', 'patrol_corridor', 'border_checkpoint', 'refinery_approach', 'mining_belt', 'colony', 'derelict_field', 'outlaw_zone', 'radiation_field', 'nebula_fog', 'ambush_lane', 'anomaly_deep', 'planetary_mass'];
  const situations = ['toll', 'patrol', 'hunt', 'distress', 'salvage', 'trade', 'convoy', 'claim', 'anomaly', 'wreck', 'yard', 'archive', 'escort', 'puzzle', 'wake'];
  const twists = ['none', 'named', 'k1', 'depth', 'logic', 'literalized', 'admirers', 'follow_on'];
  const actors = ['faction_choir', 'faction_free', 'faction_dmc', 'faction_archive', 'faction_helix', 'faction_pitborn', 'faction_understory', 'faction_fulfillment', 'faction_vael', 'faction_scn', 'faction_mts', 'faction_reach', 'faction_verge_layers', 'mule_trader', 'patrol_lawman', 'choir_zealot', 'none'];
  const verbs = ['hold_and_talk', 'procession', 'argument', 'busker', 'search_pattern', 'festival_orbit', 'strike_ring', 'false_alarm', 'customs_theater', 'race_loop', 'shift_relief', 'escort', 'wedding_join', 'tow_prop'];
  const voices = {
    faction_choir: 'CANTOR', faction_free: 'NELL', faction_dmc: 'FOREMAN', faction_archive: 'ARCHIVIST',
    faction_helix: 'HX-12', faction_pitborn: 'PIT', faction_understory: 'SABLE', faction_fulfillment: 'DISPATCH',
    faction_vael: 'VAEL', faction_scn: 'CLERK', faction_mts: 'DESK', faction_reach: 'SLIP',
    faction_verge_layers: 'VERGE', mule_trader: 'MOSS', patrol_lawman: 'WARD', choir_zealot: 'CANTOR', none: 'BUOY',
  };
  const nouns = ['kettle', 'casket', 'stamp', 'boot', 'gasket', 'sled', 'hymn', 'cone', 'satchel', 'ribbon', 'plaque', 'scoop', 'filter', 'visor', 'addendum', 'cradle', 'lamp', 'puck', 'tag', 'can', 'winch', 'bell', 'manifest', 'shade', 'slot', 'spar', 'dent', 'gel', 'pin', 'ash'];
  const out = [];
  let order = startOrder;
  // Cap is 176. Walking place-outermost spends that cap on civilian_core and
  // trade_lane and never reaches a mining belt. Bucket first, then zip so every
  // place gets a turn before any place gets a second helping.
  const buckets = places.map(() => []);
  for (let p = 0; p < places.length; p++) {
    for (let slot = 0; slot < situations.length; slot++) {
      const place = places[p];
      const situation = situations[(slot + p) % situations.length];
      let candidate = null;
      for (let rotation = 0; rotation < actors.length * twists.length; rotation++) {
        const actor = actors[(p * 7 + slot * 5 + rotation) % actors.length];
        const twist = twists[(p * 5 + slot * 3 + Math.floor(rotation / actors.length)) % twists.length];
        const key = `${situation}|${place}|${twist}|${actor}`;
        if (usedKeys.has(key)) continue;
        candidate = { place, situation, actor, twist, key };
        usedKeys.add(key);
        break;
      }
      if (!candidate) throw new Error(`no unused grammar for ${situation}|${place}`);
      buckets[p].push(candidate);
    }
  }
  const cursor = buckets.map(() => 0);
  let progressed = true;
  while (out.length < 176 && progressed) {
    progressed = false;
    for (let p = 0; p < places.length; p++) {
      if (out.length >= 176) break;
      const picked = buckets[p][cursor[p]];
      if (!picked) continue;
      cursor[p] += 1;
      progressed = true;
      const { place, situation, actor, twist, key } = picked;
      const verb = verbs[(order + place.length) % verbs.length];
      const voice = voices[actor] || 'CREW';
      const noun = nouns[order % nouns.length];
      const id = `lived_${place}_${situation}_${actor}_${twist}`.replace(/faction_/g, '').slice(0, 72);
      const title = `${noun.toUpperCase()} ON THE ${place.replace(/_/g, ' ').toUpperCase()}`;
      const placeLabel = place.replace(/_/g, ' ');
      const text = SITUATION_TEXT[situation];
      if (!text) throw new Error(`no situation text for ${situation}`);
      const values = { noun, voice, placeLabel };
      const hail = voice.startsWith('HX')
        ? `${voice} — VARIANCE FILE OPEN. ${noun.toUpperCase()} IS IN THE LANE. NO ACTION REQUIRED.`
        : renderText(text.hail, values);
      const factionId = actor.startsWith('faction_') ? actor : 'faction_free';
      out.push(scene(
        order,
        `${order}-${id.replace(/_/g, '-').slice(0, 48)}.js`.replace(/--+/g, '-'),
        id,
        key,
        verb,
        verb === 'busker' || verb === 'false_alarm' || verb === 'tow_prop' ? 1 : 2,
        title,
        voice,
        factionId,
        hail,
        C(...text.choices.map(([label, playerLine]) => [
          renderText(label, values),
          renderText(playerLine, values),
        ])),
        Object.fromEntries(Object.entries(text.receipts)
          .map(([choice, receipt]) => [choice, renderText(receipt, values)])),
        [
          ...text.color.map((line) => renderText(line, values)),
          `The ${noun} has a serial someone still loves.`,
          `${placeLabel} does not get quieter if you boost.`,
        ],
        verb === 'tow_prop' || verb === 'procession' ? noun.toUpperCase() : null,
      ));
      order += 1;
    }
  }
  return out;
}

function phasesFor(row) {
  const motion = MOTION[row.verb];
  const phases = [
    { id: 'spawn', verb: 'spawn', next: row.prop ? 'prop' : 'hail' },
  ];
  if (row.prop) {
    phases.push({
      id: 'prop', verb: 'prop', scanLabel: row.prop, dx: 54, dz: -28, radius: 9, mass: 48, next: 'hail',
    });
  }
  phases.push({ id: 'hail', verb: 'say', line: row.hail, channel: 'info', primary: true, next: 'move' });
  phases.push({ id: 'move', verb: 'motion', seconds: 7, motion, next: 'a0' });
  row.color.forEach((line, index) => {
    const sayId = `a${index}`;
    const pauseId = `p${index}`;
    const next = index === row.color.length - 1 ? 'work' : `a${index + 1}`;
    phases.push({ id: sayId, verb: 'say', line, channel: 'info', next: pauseId });
    phases.push({ id: pauseId, verb: 'motion', seconds: 5, motion, next });
  });
  phases.push({
    id: 'work',
    verb: 'motion',
    seconds: row.verb === 'race_loop' ? 9 : 8,
    motion,
    next: 'work_line',
  });
  phases.push({
    id: 'work_line',
    verb: 'say',
    line: `${row.voice}: Holding. This does not hurry.`,
    channel: 'info',
    next: 'offer',
  });
  const onChoice = {};
  for (const choice of row.choices) onChoice[choice.id] = `say_${choice.id}`;
  phases.push({ id: 'offer', verb: 'offer', windowS: 56, motion, onChoice });
  for (const choice of row.choices) {
    const grant = choice.id === 'a' ? 36 : 0;
    const rep = choice.id === 'c' ? -1 : 2;
    phases.push({ id: `say_${choice.id}`, verb: 'say', line: row.receipts[choice.id], channel: 'info', next: grant ? `grant_${choice.id}` : `rep_${choice.id}` });
    if (grant) phases.push({ id: `grant_${choice.id}`, verb: 'grant', amount: grant, reason: row.id, next: `rep_${choice.id}` });
    phases.push({ id: `rep_${choice.id}`, verb: 'rep', factionId: row.factionId, delta: rep, reason: row.id, next: `done_${choice.id}` });
    phases.push({ id: `done_${choice.id}`, verb: 'resolve', outcome: choice.id });
  }
  return phases;
}

function emit(row) {
  const cast = [];
  const arch = ARCH[row.actor];
  const offsets = [[0, 0], [-150, 90], [160, 70]];
  for (let i = 0; i < row.cast; i++) {
    cast.push({
      role: `hull_${i}`,
      archetype: arch,
      factionId: row.factionId,
      dx: offsets[i][0],
      dz: offsets[i][1],
      scanLabel: `${row.voice} ${i + 1}`,
    });
  }
  const spec = {
    id: row.id,
    title: row.title,
    factionId: row.factionId,
    start: 'spawn',
    cast,
    choices: row.choices,
    timeoutChoice: row.choices[row.choices.length - 1].id,
    phases: phasesFor(row),
  };
  const trigger = {
    id: row.id,
    tier: 'ambient',
    deck: 'civilian',
    weight: 1,
    zoneTypes: [row.place],
    script: 'selfRegistered',
    fallbackScript: 'whisper',
    pressureCost: 6,
    cooldownS: 900,
    proximity: true,
    rare: true,
    gates: { externalOnly: true },
  };
  const body = {
    shape: {
      situation: row.situation,
      place: row.place,
      twist: row.twist,
      actor: row.actor,
    },
    livedVignette: true,
    motive: 'lane_courtesy',
    engagementTrigger: 'hailed',
    title: row.title,
    primaryLine: row.hail,
    factionId: row.factionId,
    choices: row.choices,
    timeoutChoice: spec.timeoutChoice,
    receipts: row.receipts,
  };
  const text = `// ${row.title} — lived vignette. External-only: the day planner must not roll this.\n`
    + `import { deepFreeze, defineEncounter } from './catalog.js';\n`
    + `import { compileVignette } from '../../systems/vignetteInterpreter.js';\n\n`
    + `const spec = ${JSON.stringify(spec, null, 2)};\n\n`
    + `export const encounterOrder = ${row.order};\n`
    + `export const trigger = deepFreeze(${JSON.stringify(trigger, null, 2)});\n`
    + `export const runtime = compileVignette(spec);\n`
    + `export default defineEncounter(trigger, ${JSON.stringify(body, null, 2)});\n`;
  writeFileSync(join(DIR, row.file), text);
}

function emitAmbient(row) {
  const title = row.id.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
  const encounterId = `scene_${row.id}`;
  const offsets = [[0, 0], [-150, 90], [160, 70]];
  const cast = row.cast.map(([archetype, factionId, scanLabel], i) => {
    if (!scanLabel) throw new Error(`ambient ${row.id} cast ${i} is missing a role label`);
    return {
      role: i === 0 ? 'runner' : `ship_${i}`,
      archetype,
      factionId,
      dx: offsets[i][0],
      dz: offsets[i][1],
      scanLabel,
    };
  });
  const phases = [
    { id: 'spawn', verb: 'spawn', next: row.prop ? 'prop' : 'hail' },
  ];
  if (row.prop) phases.push({ id: 'prop', verb: 'prop', scanLabel: row.prop, dx: 54, dz: -28, radius: 9, mass: 48, next: 'hail' });
  phases.push(
    { id: 'hail', verb: 'say', line: row.hail, channel: 'info', primary: true, next: 'run' },
    { id: 'run', verb: 'motion', motion: row.motion, seconds: 6, next: 'a0' },
    { id: 'a0', verb: 'say', line: row.color, channel: 'info', next: 'offer' },
    { id: 'offer', verb: 'offer', motion: row.motion, windowS: 22, onChoice: { a: 'say_a', b: 'say_b', c: 'say_c' } },
  );
  const choiceIds = ['a', 'b', 'c'];
  const choices = choiceIds.map((id, i) => ({
    id, label: row.choices[i][0], playerLine: row.choices[i][1],
  }));
  for (const id of choiceIds) {
    const next = id === 'a' ? 'grant_a' : id === 'b' && row.runner !== 'none' ? 'rep_b_runner' : 'rep_b_authority';
    phases.push({ id: `say_${id}`, verb: 'say', line: row.receipts[choiceIds.indexOf(id)], channel: 'info', next: id === 'c' ? 'resolve_c' : next });
    if (id === 'a') {
      phases.push({ id: 'grant_a', verb: 'grant', amount: 30, reason: encounterId, next: 'rep_a' });
      phases.push({ id: 'rep_a', verb: 'rep', factionId: row.authority, delta: 2, reason: encounterId, next: 'resolve_a' });
    } else if (id === 'b' && row.runner !== 'none') {
      phases.push({ id: 'rep_b_runner', verb: 'rep', factionId: row.runner, delta: 1, reason: encounterId, next: 'rep_b_authority' });
      phases.push({ id: 'rep_b_authority', verb: 'rep', factionId: row.authority, delta: -1, reason: encounterId, next: 'resolve_b' });
    } else if (id === 'b') {
      phases.push({ id: 'rep_b_authority', verb: 'rep', factionId: row.authority, delta: -1, reason: encounterId, next: 'resolve_b' });
    }
    if (id !== 'c') phases.push({ id: `resolve_${id}`, verb: 'resolve', outcome: id });
    else phases.push({ id: 'resolve_c', verb: 'resolve', outcome: 'c' });
  }
  const spec = {
    id: encounterId, title, factionId: row.authority, start: 'spawn', cast, choices,
    timeoutChoice: 'c', phases,
  };
  const trigger = {
    id: encounterId,
    tier: 'ambient',
    deck: 'civilian',
    weight: 1,
    zoneTypes: ZONE_TYPES,
    script: 'selfRegistered',
    fallbackScript: 'whisper',
    pressureCost: 6,
    cooldownS: 1200,
    proximity: true,
    rare: true,
    gates: { externalOnly: true },
  };
  const body = {
    shape: { situation: row.situation, place: row.place, twist: row.twist, actor: row.actor },
    livedVignette: true,
    ambientScene: true,
    sectorIds: row.sectors,
    noCombat: true,
    motive: 'lane_courtesy',
    engagementTrigger: 'hailed',
    title,
    primaryLine: row.hail,
    factionId: row.authority,
    choices,
    timeoutChoice: 'c',
    receipts: { a: row.receipts[0], b: row.receipts[1], c: row.receipts[2] },
  };
  const text = `// ${title} — lived vignette. External-only: ambient world scene.\n`
    + `import { deepFreeze, defineEncounter } from './catalog.js';\n`
    + `import { compileVignette } from '../../systems/vignetteInterpreter.js';\n\n`
    + `export const spec = ${JSON.stringify(spec, null, 2)};\n\n`
    + `export const encounterOrder = ${row.order};\n`
    + `export const trigger = deepFreeze(${JSON.stringify(trigger, null, 2)});\n`
    + `export const runtime = compileVignette(spec);\n`
    + `export default defineEncounter(trigger, ${JSON.stringify(body, null, 2)});\n`;
  writeFileSync(join(DIR, row.file), text);
}

const existingIds = new Set();
for (const name of readdirSync(DIR)) {
  if (!/^\d{3}-/.test(name)) continue;
  const order = Number(name.slice(0, 3));
  if (order >= 372) continue;
  const text = readFileSync(join(DIR, name), 'utf8');
  const id = text.match(/"id":\s*"([a-z0-9_]+)"/) || text.match(/id:\s*'([a-z0-9_]+)'/);
  if (id) existingIds.add(id[1]);
}

assertScenes(HAND);
const used = new Set(HAND.map((row) => `${row.situation}|${row.place}|${row.twist}|${row.actor}`));
for (const row of AMBIENT) {
  const key = `${row.situation}|${row.place}|${row.twist}|${row.actor}`;
  validateEncounterShape({ situation: row.situation, place: row.place, twist: row.twist, actor: row.actor }, row.id);
  if (used.has(key)) throw new Error(`dup grammar ${key}`);
  used.add(key);
}
const extra = moreScenes(HAND[HAND.length - 1].order + 1, used);
const all = [...HAND, ...extra];
assertScenes(all);
for (const row of all) {
  if (existingIds.has(row.id)) throw new Error(`id collides with shipped encounter ${row.id}`);
  if (!/^\d{3}-[a-z0-9-]+\.js$/.test(row.file)) throw new Error(`bad filename ${row.file}`);
}
const names = all.map((row) => row.file);
if (new Set(names).size !== names.length) throw new Error('duplicate vignette filename');
const generatedNames = new Set(names);
let occupiedOrder = extra[extra.length - 1].order;
for (const name of readdirSync(DIR)) {
  if (!/^\d{3}-/.test(name) || generatedNames.has(name)) continue;
  const order = Number(name.slice(0, 3));
  if (order < 372) continue;
  const header = readFileSync(join(DIR, name), 'utf8').split('\n', 1)[0];
  if (/^\/\/ .* — lived vignette\. External-only:/.test(header)) continue;
  occupiedOrder = Math.max(occupiedOrder, order);
}
const ambientStartOrder = occupiedOrder + 1;
const ambientRows = AMBIENT.map((row, i) => ({
  ...row,
  order: ambientStartOrder + i,
  file: `${String(ambientStartOrder + i).padStart(3, '0')}-scene-${row.id.replace(/_/g, '-')}.js`,
  encounterId: `scene_${row.id}`,
}));
for (const row of ambientRows) {
  if (existingIds.has(row.encounterId)) throw new Error(`id collides with shipped encounter ${row.encounterId}`);
}
const keep = new Set([...names, ...ambientRows.map((row) => row.file)]);
for (const name of readdirSync(DIR)) {
  if (!/^\d{3}-/.test(name)) continue;
  const order = Number(name.slice(0, 3));
  if (order >= 372 && !keep.has(name)) {
    const path = join(DIR, name);
    const header = readFileSync(path, 'utf8').split('\n', 1)[0];
    if (/^\/\/ .* — lived vignette\. External-only:/.test(header)) unlinkSync(path);
  }
}
for (const row of all) emit(row);
for (const row of ambientRows) emitAmbient(row);
mkdirSync(join(ROOT, 'src/data/livedWorld'), { recursive: true });
writeFileSync(join(ROOT, 'src/data/livedWorld/roster.js'),
  `// Generated by scripts/build-lived-vignettes.mjs\nexport const LIVED_VIGNETTE_COUNT = ${all.length};\n`);
console.log(`wrote ${all.length} lived vignettes (${HAND.length} authored, ${extra.length} extended) and ${ambientRows.length} ambient scenes`);
