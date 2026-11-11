// inf-lane-horn — CH-12 horns and near-misses (design/program/finish/chaos/IDEAS.md group B).
//
// A fast close pass by the player is a stimulus every civilian on the lane answers in its own
// class: a loaded hull blasts the deep foghorn because it cannot swerve far; a working hull taps a
// gruff mid horn; a light hull beeps bright and jinks. A repeat inside the memory window escalates
// the same voice — tap, then a double, then a held lean on the horn — and the crew's bark climbs
// with it. Pure data + pure selectors: no state, no RNG stream (indices come from hash32 at the
// caller), so the traffic owner and the bark director read the same ladder.
//
// Bark rows carry a `text` field so the localization extractor inventories them; every line is
// eight words or fewer, in the crew's register, never lore.

/** Which horn a role leans on. Unlisted roles never honk (law, raiders, customs, escorts). */
export const LANE_HORN_CLASS_BY_ROLE = Object.freeze({
  // Mass that cannot stop short: the deep two-tone industrial foghorn family.
  hauler: 'heavy',
  ore_carrier: 'heavy',
  tanker: 'heavy',
  arclight: 'heavy',
  express: 'heavy',
  shuttle: 'heavy',
  // Working hulls: the same bright dyad pitched down into a gruff yard honk.
  tug: 'work',
  miner: 'work',
  salvor: 'work',
  sweeper: 'work',
  prospector: 'work',
  surveyor: 'work',
  // Light hulls: a bright nervous beep.
  courier: 'light',
  tender: 'light',
  rescue: 'light',
  smuggler: 'light',
  tourist: 'light',
});

export function laneHornClassForRole(role) {
  const key = typeof role === 'string' ? role.toLowerCase() : '';
  return Object.hasOwn(LANE_HORN_CLASS_BY_ROLE, key) ? LANE_HORN_CLASS_BY_ROLE[key] : null;
}

// Escalation steps are 1 (first pass), 2 (second pass inside the window), 3 (third or later).
export const LANE_HORN_MAX_STEP = 3;

export function clampLaneHornStep(step) {
  const n = Math.floor(Number(step));
  if (!Number.isFinite(n) || n < 1) return 1;
  return n > LANE_HORN_MAX_STEP ? LANE_HORN_MAX_STEP : n;
}

// Literal recipe ids (src/data/audioRecipes.js) — tap, double, held lean per family.
const HEAVY_HORNS = Object.freeze(['sfx_hauler_blast', 'sfx_hauler_blast_double', 'sfx_hauler_blast_lean']);
const DYAD_HORNS = Object.freeze(['sfx_lane_horn_tap', 'sfx_lane_horn_double', 'sfx_lane_horn_lean']);

// Playback rate keeps three classes audibly apart on two authored families; a few roles get their
// own tilt inside the class so a courier and a tender never sound like the same hull.
const CLASS_RATE = Object.freeze({ heavy: 1, work: 0.78, light: 1 });
const ROLE_RATE = Object.freeze({ courier: 1.14, tourist: 1.06, tug: 0.7, ore_carrier: 0.92, shuttle: 1.08 });

/**
 * The horn a role sounds at an escalation step. Null for a role that never honks.
 * `{ id, rate, gain }` — id is a literal recipe id the audio owner resolves directly.
 */
export function laneHornCueFor(role, step) {
  const hornClass = laneHornClassForRole(role);
  if (!hornClass) return null;
  const s = clampLaneHornStep(step);
  const family = hornClass === 'heavy' ? HEAVY_HORNS : DYAD_HORNS;
  const key = String(role).toLowerCase();
  const rate = Object.hasOwn(ROLE_RATE, key) ? ROLE_RATE[key] : CLASS_RATE[hornClass];
  // The held lean is the loud one; a first tap sits under the mix.
  const gain = s === 1 ? 0.7 : s === 2 ? 0.82 : 0.95;
  return Object.freeze({ id: family[s - 1], rate, gain, hornClass, step: s });
}

// Register → step → lines. `close` speaks only on a first pass that nearly scraped paint.
export const LANE_HORN_BARKS = Object.freeze({
  heavy: Object.freeze({
    close: Object.freeze([
      { text: "Easy! This much mass doesn't stop." },
      { text: 'Mind the mass, pilot!' },
      { text: "We can't swerve like you can!" },
    ]),
    repeat: Object.freeze([
      { text: 'Again? Give a loaded hull room!' },
      { text: 'Twice now. Find your own lane.' },
      { text: 'Off our bow, pilot!' },
    ]),
    fed: Object.freeze([
      { text: "That's three. Get off my lane!" },
      { text: 'Enough! Go buzz somebody else!' },
      { text: 'Third pass! Are you trying to hit us?' },
    ]),
  }),
  work: Object.freeze({
    close: Object.freeze([
      { text: "Watch the wash! We're working!" },
      { text: 'Whoa! Crew on deck, pilot!' },
      { text: "Careful! You'll shake the load loose!" },
    ]),
    repeat: Object.freeze([
      { text: 'You again? Slow it down!' },
      { text: 'Working crew here! Ease off!' },
      { text: 'Twice? Fly around the work, pilot!' },
    ]),
    fed: Object.freeze([
      { text: 'Third time! Take it somewhere else!' },
      { text: 'Enough! This yard has rules!' },
      { text: 'Buzz this crew again and see.' },
    ]),
  }),
  light: Object.freeze({
    close: Object.freeze([
      { text: 'Whoa! Eyes open!' },
      { text: 'Hey! Watch it!' },
      { text: 'Close one! Easy out there!' },
    ]),
    repeat: Object.freeze([
      { text: 'You again? Back off!' },
      { text: 'Seriously? Twice?' },
      { text: 'Find your own piece of sky!' },
    ]),
    fed: Object.freeze([
      { text: 'Third time! Fly somewhere else!' },
      { text: 'What is your problem, pilot?' },
      { text: 'Enough! Go haunt another lane!' },
    ]),
  }),
  // The sightseer speaks for its passengers, not its drive.
  tourist: Object.freeze({
    close: Object.freeze([
      { text: 'The passengers felt that!' },
      { text: 'Easy! We have sightseers aboard!' },
    ]),
    repeat: Object.freeze([
      { text: "You're frightening our passengers!" },
      { text: 'Again? This is a tour, pilot!' },
    ]),
    fed: Object.freeze([
      { text: 'Enough! Our guests want you gone!' },
      { text: 'Three passes! The whole tour saw!' },
    ]),
  }),
});

/** The bark register a role speaks in: its horn class, except the sightseer's own voice. */
export function laneHornRegisterFor(role) {
  const key = typeof role === 'string' ? role.toLowerCase() : '';
  if (key === 'tourist') return 'tourist';
  return laneHornClassForRole(key);
}

function stepKey(step) {
  const s = clampLaneHornStep(step);
  return s === 1 ? 'close' : s === 2 ? 'repeat' : 'fed';
}

/** One deterministic line for a register and step. Null for an unknown register. */
export function laneHornBarkFor(register, step, index) {
  const pack = register && Object.hasOwn(LANE_HORN_BARKS, register) ? LANE_HORN_BARKS[register] : null;
  if (!pack) return null;
  const lines = pack[stepKey(step)];
  if (!lines || !lines.length) return null;
  const n = Number.isFinite(Number(index)) ? Math.floor(Math.abs(Number(index))) : 0;
  const picked = lines[n % lines.length];
  return picked && typeof picked.text === 'string' && picked.text ? picked.text : null;
}

// Dock control answers the third pass when it happened inside its own traffic shell. The ship
// name comes from the player's live hull identity; the unnamed rows never print a placeholder.
export const LANE_HORN_DOCK_CONTROL_LINES = Object.freeze({
  named: Object.freeze([
    { text: 'Dock control: {ship}, ease off in the pattern.' },
    { text: 'Dock control to {ship}: stop buzzing my traffic.' },
    { text: '{ship}, dock control. Fly like that elsewhere.' },
  ]),
  unnamed: Object.freeze([
    { text: 'Dock control: ease off in the pattern, pilot.' },
    { text: 'Dock control: stop buzzing my traffic.' },
  ]),
});

/** A dock-control template and whether it needs the {ship} value. */
export function laneHornDockControlTemplate(index, hasShip) {
  const lines = hasShip ? LANE_HORN_DOCK_CONTROL_LINES.named : LANE_HORN_DOCK_CONTROL_LINES.unnamed;
  const n = Number.isFinite(Number(index)) ? Math.floor(Math.abs(Number(index))) : 0;
  return lines[n % lines.length].text;
}

/**
 * The spoken dock-control line, same interpolation law as the barks.js corpora: a usable hull
 * name fills {ship}; a missing, raw-id or oversize name picks an unnamed row instead, so the band
 * never reads a placeholder or an id.
 */
export function laneHornDockControlLine(index, shipName) {
  const raw = typeof shipName === 'string' ? shipName.trim() : '';
  const ship = raw && raw.length <= 48 && !/[_:]/.test(raw) && /[A-Za-z]/.test(raw) ? raw : '';
  return laneHornDockControlTemplate(index, !!ship).replace(/\{ship\}/g, ship);
}
