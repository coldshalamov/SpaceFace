#!/usr/bin/env node
// Writes externalOnly lived-vignette encounter modules (orders 372+).
// Re-run is deterministic. Then run scripts/build-encounter-index.mjs.
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEncounterShape } from '../src/data/encounters/shape.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIR = join(ROOT, 'src/data/encounters');

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
  let n = 0;
  for (const situation of situations) {
    for (const actor of actors) {
      for (const twist of twists) {
        for (let p = 0; p < places.length; p++) {
          const place = places[p];
          const key = `${situation}|${place}|${twist}|${actor}`;
          if (usedKeys.has(key)) continue;
          if ((n++ % 3) !== 0) continue;
          buckets[p].push({ place, situation, actor, twist, key });
        }
      }
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
      const hail = voice.startsWith('HX')
        ? `${voice} — VARIANCE FILE OPEN. ${noun.toUpperCase()} IS IN THE LANE. NO ACTION REQUIRED.`
        : `${voice}: The ${noun} is the whole reason we are stopped. Do not improve it.`;
      const factionId = actor.startsWith('faction_') ? actor : 'faction_free';
      usedKeys.add(key);
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
        C(
          [`Tend the ${noun}`, `I'll tend the ${noun}.`],
          [`Witness and leave`, 'Witnessed. Leaving.'],
          [`Refuse the stop`, 'Not my stop.'],
        ),
        {
          a: `You tended the ${noun}. The lane kept its reason.`,
          b: `Witnessed. The ${noun} stays their problem and their pride.`,
          c: `You refused. The stop continues without a guest.`,
        },
        [
          `${voice}: This is not a fight. If it becomes one, you started it.`,
          `${voice}: ${title} has a receipt. Make yours short.`,
          `The ${noun} has a serial someone still loves.`,
          `${place.replace(/_/g, ' ')} does not get quieter if you boost.`,
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
    const id = `a${index}`;
    const next = index === row.color.length - 1 ? 'work' : `a${index + 1}`;
    phases.push({ id, verb: 'say', line, channel: 'info', next });
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
    line: `${row.voice}: Still on the ${row.place.replace(/_/g, ' ')}. The ${row.title.toLowerCase()} does not hurry.`,
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
const extra = moreScenes(HAND[HAND.length - 1].order + 1, used);
const all = [...HAND, ...extra];
assertScenes(all);
for (const row of all) {
  if (existingIds.has(row.id)) throw new Error(`id collides with shipped encounter ${row.id}`);
  if (!/^\d{3}-[a-z0-9-]+\.js$/.test(row.file)) throw new Error(`bad filename ${row.file}`);
}
const names = all.map((row) => row.file);
if (new Set(names).size !== names.length) throw new Error('duplicate vignette filename');
const keep = new Set(names);
for (const name of readdirSync(DIR)) {
  if (!/^\d{3}-/.test(name)) continue;
  const order = Number(name.slice(0, 3));
  if (order >= 372 && !keep.has(name)) unlinkSync(join(DIR, name));
}
for (const row of all) emit(row);
mkdirSync(join(ROOT, 'src/data/livedWorld'), { recursive: true });
writeFileSync(join(ROOT, 'src/data/livedWorld/roster.js'),
  `// Generated by scripts/build-lived-vignettes.mjs\nexport const LIVED_VIGNETTE_COUNT = ${all.length};\n`);
console.log(`wrote ${all.length} lived vignettes (${HAND.length} authored, ${extra.length} extended)`);
