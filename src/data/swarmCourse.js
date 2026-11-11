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

function courseRound(round, name, twist, twistId) {
  return Object.freeze({ round, name, twist, twistId });
}

export const SWARM_COURSE = Object.freeze([
  courseRound(1, 'Doors Open', 'ten Wasps, one gate. Kiln explains nothing', null),
  courseRound(2, 'Second Helpings', 'Wasps from two gates. The first wall gun is lit', null),
  courseRound(3, 'Hot Potato', 'Detonator Darts. The round teaches throwing things back', null),
  // sling_tide is the room pouring crosswise on a lane — the lane running for the first time.
  courseRound(4, 'Mind the Gap', 'the lane runs for the first time, with Wasps on both sides of it', 'sling_tide'),
  courseRound(5, 'Iron Maw', 'Boss. A mouth that eats what you throw — until you throw a Detonator', null),
  courseRound(6, 'The Charge', 'Bruisers. Every wall has a scorch mark by the end', null),
  // plate_drift is the Foundry's own cover card: cover rocks appear and the sag walks them.
  courseRound(7, 'Long Shots', 'Lancers at the edges, Wasps in the middle. Rocks appear for cover', 'plate_drift'),
  // mine_drift rides hazards in on a bearing with the player's own team — mines that are
  // also yours to use. Band round, so it serves at the minor voice and scaled wager.
  courseRound(8, 'Breadcrumbs', 'Jackals. The floor fills with mines that are also yours to use', 'mine_drift'),
  courseRound(9, 'Tug of War', 'Tether Raiders. Half the round you are attached to something', null),
  courseRound(10, 'Corsair Wing', 'Boss: five ships that fly as one. The room changes — the crusher wakes. Bench', null),
  courseRound(11, 'The Umbrella', 'a Warden shielding gunners. Take the handle away', null),
  courseRound(12, 'Delivery', 'enemies arrive on the freight. Cut the container loose before it stops', null),
  courseRound(13, 'Lights Out', 'the arena dims. Ghosts. Your own lamps and the lane lights are all you have', null),
  courseRound(14, 'Hands Off', 'Anchor Controllers pin whatever you pick up. Nothing stays thrown', null),
  courseRound(15, 'Mirrorjaw Foreman', 'Boss. Copies the last gun that hit it. Hit it with a rock', null),
  // Rush Hour is the lane again, doubled — the same crosswise pour the course already taught.
  courseRound(16, 'Rush Hour', 'both lanes, double the traffic, a full pack. The room is the weapon', 'sling_tide'),
  courseRound(17, 'No Small Change', 'Point-Defense Screens shoot down anything small. Find something big', null),
  // sprocket_crate is salvage riding in that you lose if you do not go get it — the
  // Highway Robbery's chase-or-lose-it pressure as one authored crate.
  // Review 2026-11-11: sprocket_crate is a supply reward, not theft — the theft mechanic is C01-05's.
  courseRound(18, 'Highway Robbery', 'Reavers steal your Scrap and run for the gates. Chase or lose it', null),
  courseRound(19, 'The Law', 'Lawmen and Cutters box you in — and stop for the lane lights', null),
  courseRound(20, 'The Yardmaster', 'Boss. It controls the freight. The lanes change direction mid-fight. The room changes again. Bench', null),
  // reef_surge's own telegraph is the round's lesson: the room moves. Let it throw for you.
  courseRound(21, 'The Wall', 'heavies, shoulder to shoulder. Guns do nothing. Use the room', 'reef_surge'),
  courseRound(22, 'Chain Gang', 'every enemy is tethered to another. Swing one, swing them all', null),
  // shepherd_pulse's tell — "they fly as one. Break the one." — is the Choir's find-the-singer.
  courseRound(23, 'The Choir', 'Zealots in rings. Find the singer', 'shepherd_pulse'),
  courseRound(24, 'Everything Must Go', 'prices halved, enemies doubled, ninety seconds', null),
  courseRound(25, 'The Anvil', 'Boss. Too heavy to move. So move everything else into it', null),
  courseRound(26, 'The Umbrella, Again', 'two Wardens covering each other', null),
  courseRound(27, 'Tailgate', 'a heavy rides the freight round and round. It can only be hit from the lane', null),
  courseRound(28, 'Black Friday', 'every drop type falls at once, and so does every enemy type', null),
  courseRound(29, 'Quiet', 'forty seconds of nothing. Then the gates all open together', null),
  courseRound(30, 'The Forge Regent', 'Final boss. It runs the furnace. Three stages: it feeds the room to the furnace, then feeds the furnace to the room, then comes out itself. Win, and the lights come up', null),
]);

/**
 * The authored row for a course wave — literal rounds 1..30 only. The open ladder past
 * the win recombines names rather than replaying them, so it answers null here.
 */
export function swarmCourseFor(wave) {
  const w = Number.isInteger(wave) ? wave : 0;
  return w >= 1 && w <= SWARM_COURSE.length ? SWARM_COURSE[w - 1] : null;
}
