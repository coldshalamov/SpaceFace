// G08-02 — the Pit's authored course: thirty rounds, each with a name and a twist, copied
// verbatim from design/program/experience-commissions/12_SWARM_THE_PIT.md's table
// "The Course — thirty rounds with names". A round's name is a promise about what the
// round IS; the twist is the round's own "What it is" text, unaltered.
//
// twistId names an EXISTING mechanic that already does the twist's work — today that is
// always a card id in SWARM_EVENT_BY_ID (src/data/swarmEvents.js), dealt on the round by
// the ordinary event seam: swarmEventFor answers with the course's card on non-band rounds
// (telegraphed 'warn', full authored wager, `install` specs pre-placed by planArenaInstall),
// and swarmMinorEventFor serves it on the ≡2,8-mod-10 band rounds at the band's scaled
// wager and 'info' voice — so a band round may only name a `minor`-tagged card or the
// twist would silently never deal.
//
// twistId: null means no shipped mechanic carries the twist — composition lessons
// (the round IS its roster), freight/traffic rounds, lights, economy and clock twists,
// and the champion rounds (the boss room is the mechanic) stay name + roster rather
// than wearing a borrowed card. These rows are the honest gaps for later mechanics.
//
// question is the round's one-line question (EC-Z01, PR #990), spoken once in the opener and
// shown as the Armory's `inbound:` line. Rounds 2–10 carry one; round 1 stays silent ("Kiln
// explains nothing"), the rest are null, and the open ladder past 30 has no row.
//
// DEMO-SWARM-WORDS-1 (2026): the twist is the brief a pilot reads at round start — one line,
// eight words or fewer, that tells the trick of the round in Madame Kiln's voice (dry,
// theatrical, loves damage). Names pass the doc-12 name test: a stranger shown the clip
// matches it to its name.

function courseRound(round, name, twist, twistId, question = null) {
  return Object.freeze({ round, name, twist, twistId, question });
}

export const SWARM_COURSE = Object.freeze([
  courseRound(1, 'Doors Open', 'Ten Wasps, one gate. Throw a rock.', null),
  courseRound(2, 'Second Helpings', 'Two gates. Let the wall gun work.', null,
    'Second helpings, darling. Mind both doors.'),
  courseRound(3, 'Hot Potato', 'Catch the dart. Throw it home.', null,
    'Hot potato. Hands quick, heart quicker.'),
  // PIT-01 — the lane itself is the reveal: no dealt card or wager rides its debut round.
  courseRound(4, 'Mind the Gap', 'The lane kills for you. Stand clear.', null,
    'Mind the gap. It bites both ways.'),
  courseRound(5, 'Iron Maw', 'Throw right after its broadside.', null,
    'Patience, darling. Let it shout first.'),
  courseRound(6, 'The Charge', 'They charge straight. Be somewhere else.', null,
    'Straight lines, darling. Stand sideways.'),
  // plate_drift is the Foundry's own cover card: cover rocks appear and the sag walks them.
  courseRound(7, 'Long Shots', 'Hide behind rocks. Pick off the edges.', 'plate_drift',
    'Rocks are cover. Use every one.'),
  // mine_drift rides hazards in on a bearing with the player's own team — mines that are
  // also yours to use. Band round, so it serves at the minor voice and scaled wager.
  courseRound(8, 'Breadcrumbs', 'Their mines are yours. Throw them back.', 'mine_drift',
    'Dinner is served. Mind your feet.'),
  courseRound(9, 'Tug of War', 'They hook you. Pull harder. Throw them.', null,
    'Attached already? Pull, darling. Pull.'),
  courseRound(10, 'Corsair Wing', 'Break the wing. Then mind the crusher.', null,
    'Five as one. Ruin the formation.'),
  courseRound(11, 'The Umbrella', 'Kill the Warden. The rest go bare.', null),
  courseRound(12, 'Delivery', 'Cut the container loose before it stops.', 'delivery'),
  courseRound(13, 'Lights Out', 'Follow the lane lights. Fear the dark.', 'lights_out'),
  courseRound(14, 'Pinned Down', 'They pin your toys. Don\'t stop throwing.', null),
  courseRound(15, 'Mirrorjaw Foreman', 'Hit it with a rock, never guns.', null),
  // Rush Hour is the lane again, doubled — the same crosswise pour the course already taught.
  courseRound(16, 'Rush Hour', 'Both lanes run. Let traffic do it.', 'sling_tide'),
  courseRound(17, 'No Small Change', 'Small things die. Throw something big.', null),
  // sprocket_crate is salvage riding in that you lose if you do not go get it — the
  // Highway Robbery's chase-or-lose-it pressure as one authored crate.
  // Review 2026-11-11: sprocket_crate is a supply reward, not theft — the theft mechanic is C01-05's.
  courseRound(18, 'Highway Robbery', 'They steal Scrap. Chase them down.', 'highway_robbery'),
  courseRound(19, 'The Law', 'They stop for lane lights. Bait them.', 'the_law'),
  courseRound(20, 'The Yardmaster', 'Watch the lanes. They\'ll turn mid-fight.', 'the_yardmaster'),
  // reef_surge's own telegraph is the round's lesson: the room moves. Let it throw for you.
  courseRound(21, 'The Wall', 'Guns won\'t help. Let the room kill.', 'reef_surge'),
  courseRound(22, 'Chain Gang', 'Swing one. You\'ll swing them all.', 'chain_gang'),
  // shepherd_pulse's tell — "they fly as one. Break the one." — is the Choir's find-the-singer.
  courseRound(23, 'The Choir', 'Find the singer. Break the song.', 'shepherd_pulse'),
  courseRound(24, 'Everything Must Go', 'Half price. Double trouble. Ninety seconds.', 'everything_must_go'),
  courseRound(25, 'The Anvil', 'It won\'t move. Feed it everything else.', null),
  courseRound(26, 'The Umbrella, Again', 'Two Wardens. Split them. Strip them.', null),
  courseRound(27, 'Tailgate', 'It rides the freight. Hit it from the lane.', null),
  courseRound(28, 'Black Friday', 'Everything falls at once. Grab and throw.', 'black_friday'),
  courseRound(29, 'Quiet', 'Forty quiet seconds. Then every gate opens.', 'quiet'),
  courseRound(30, 'The Forge Regent', 'Feed furnace. Dodge furnace. Kill Regent.', null),
]);

/**
 * The authored row for a course wave — literal rounds 1..30 only. The open ladder past
 * the win recombines names rather than replaying them, so it answers null here.
 */
export function swarmCourseFor(wave) {
  const w = Number.isInteger(wave) ? wave : 0;
  return w >= 1 && w <= SWARM_COURSE.length ? SWARM_COURSE[w - 1] : null;
}
