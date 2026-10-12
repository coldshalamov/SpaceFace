// Twelve Spectrum cases. Truth poses live here so the sim can run the forward
// sensor model. The player-facing row is built without copying these poses.
// Families: 3 navigation, 3 moving hunts, 3 deceptions, 3 salvage disasters.
// Each case uses a different spatial trick. Payoffs are physical (brake, tow,
// block a line, place a decoy), not a ping to collect.

function emitter(spec) {
  return Object.freeze(spec);
}

export const SPECTRUM_CASES = Object.freeze([
  Object.freeze({
    id: 'spectrum_cold_parallax',
    family: 'navigation',
    mechanisms: Object.freeze(['bearing', 'parallax']),
    publicName: 'COLD BUOY',
    situation: 'Uncharted buoy off a charted lane mouth. Parallax from two baselines names it.',
    horizon: 4000,
    search: Object.freeze({ x: 640, z: 280, radius: 1200 }),
    solve: 'fix',
    wantClass: 'STATIONARY',
    payoff: 'brake',
    bodyId: 'buoy',
    emitters: Object.freeze([
      emitter({ id: 'buoy', tone: 11, power: 1, motion: 'fixed', pos: Object.freeze({ x: 1503, z: -137 }) }),
    ]),
    occluders: Object.freeze([]),
    reflectors: Object.freeze([]),
    props: Object.freeze([]),
  }),

  Object.freeze({
    id: 'spectrum_echo_gallery',
    family: 'navigation',
    mechanisms: Object.freeze(['occlusion', 'multipath']),
    publicName: 'GALLERY BEACON',
    situation: 'A rock kills the direct path. A charted mirror wall folds the echo into a fix.',
    horizon: 4000,
    search: Object.freeze({ x: 600, z: 400, radius: 1400 }),
    solve: 'fix',
    wantClass: null,
    payoff: 'tow',
    bodyId: 'beacon',
    towProp: 'relay',
    towRadius: 180,
    emitters: Object.freeze([
      emitter({ id: 'beacon', tone: 12, power: 1, motion: 'fixed', pos: Object.freeze({ x: 400, z: 1500 }) }),
    ]),
    occluders: Object.freeze([
      Object.freeze({ id: 'gallery-rock', r: 260, pos: Object.freeze({ x: 400, z: 780 }) }),
    ]),
    reflectors: Object.freeze([
      Object.freeze({
        id: 'east-wall',
        charted: true,
        a: Object.freeze({ x: 1000, z: 280 }),
        b: Object.freeze({ x: 1000, z: 1680 }),
      }),
    ]),
    props: Object.freeze([
      Object.freeze({ id: 'relay', kind: 'relay', pos: Object.freeze({ x: 80, z: 80 }) }),
    ]),
  }),

  Object.freeze({
    id: 'spectrum_drift_chord',
    family: 'navigation',
    mechanisms: Object.freeze(['chirp', 'bearing']),
    publicName: 'APEX OFF STATION',
    situation: 'Three charted chord buoys. One was knocked off and is drifting. The tone says which.',
    horizon: 5000,
    search: Object.freeze({ x: 400, z: 300, radius: 1600 }),
    solve: 'classify',
    wantClass: 'DRIFTING',
    payoff: 'brake',
    bodyId: 'apex',
    emitters: Object.freeze([
      emitter({
        id: 'west', tone: 21, power: 1, motion: 'fixed', chartLabel: 'BUOY WEST',
        pos: Object.freeze({ x: 40, z: 40 }),
      }),
      emitter({
        id: 'east', tone: 22, power: 1, motion: 'fixed', chartLabel: 'BUOY EAST',
        pos: Object.freeze({ x: 980, z: 60 }),
      }),
      emitter({
        id: 'apex', tone: 23, power: 1, motion: 'linear', chartLabel: 'BUOY APEX',
        pos: Object.freeze({ x: 450, z: 760 }), vel: Object.freeze({ x: 0, z: 16 }),
      }),
    ]),
    occluders: Object.freeze([]),
    reflectors: Object.freeze([]),
    props: Object.freeze([]),
  }),

  Object.freeze({
    id: 'spectrum_courier_shear',
    family: 'hunt',
    mechanisms: Object.freeze(['chirp', 'bearing']),
    publicName: 'COURIER',
    situation: 'A courier crosses on a straight heading. Bearings over time give the intercept velocity.',
    horizon: 5000,
    search: Object.freeze({ x: 800, z: 0, radius: 1800 }),
    solve: 'fix',
    wantClass: null,
    payoff: 'brake',
    bodyId: 'courier',
    emitters: Object.freeze([
      emitter({
        id: 'courier', tone: 31, power: 1, motion: 'linear',
        pos: Object.freeze({ x: 1680, z: -640 }), vel: Object.freeze({ x: -36, z: 22 }),
      }),
    ]),
    occluders: Object.freeze([]),
    reflectors: Object.freeze([]),
    props: Object.freeze([]),
  }),

  Object.freeze({
    id: 'spectrum_skimming_wreck',
    family: 'hunt',
    mechanisms: Object.freeze(['occlusion', 'chirp']),
    publicName: 'SKIMMING WRECK',
    situation: 'A wreck skims a rock and vanishes when the rock covers the line. Clear windows fix the arc.',
    horizon: 4000,
    search: Object.freeze({ x: 200, z: 200, radius: 1600 }),
    solve: 'fix',
    wantClass: null,
    payoff: 'brake',
    bodyId: 'wreck',
    emitters: Object.freeze([
      emitter({
        id: 'wreck', tone: 32, power: 1, motion: 'arc',
        center: Object.freeze({ x: 500, z: 400 }), orbit: 380, omega: 0.03, phase: 0.3,
      }),
    ]),
    occluders: Object.freeze([
      Object.freeze({ id: 'skim-rock', r: 150, pos: Object.freeze({ x: 500, z: 400 }) }),
    ]),
    reflectors: Object.freeze([]),
    props: Object.freeze([]),
  }),

  Object.freeze({
    id: 'spectrum_split_wake',
    family: 'hunt',
    mechanisms: Object.freeze(['chirp', 'spoof']),
    publicName: 'WAKE HULL',
    situation: 'A stationary glint copies the hull tone and shouts louder. The live chirp is the hull.',
    horizon: 4000,
    search: Object.freeze({ x: 600, z: 200, radius: 1400 }),
    solve: 'classify',
    wantClass: 'DRIFTING',
    payoff: 'brake',
    bodyId: 'hull',
    emitters: Object.freeze([
      emitter({
        id: 'hull', tone: 33, power: 0.75, motion: 'linear',
        pos: Object.freeze({ x: 1100, z: 420 }), vel: Object.freeze({ x: 24, z: 4 }),
      }),
      emitter({
        id: 'glint', tone: 33, copies: 'hull', power: 1.45, motion: 'fixed', claim: 'DRIFTING',
        pos: Object.freeze({ x: 620, z: 180 }),
      }),
    ]),
    occluders: Object.freeze([]),
    reflectors: Object.freeze([]),
    props: Object.freeze([]),
  }),

  Object.freeze({
    id: 'spectrum_mirror_mine',
    family: 'deception',
    mechanisms: Object.freeze(['spoof', 'occlusion', 'jam']),
    publicName: 'HAULER',
    situation: 'A stolen buoy claims the hauler and a raider blankets the real hull. Tow a slab and your own buoy to turn their lock.',
    horizon: 4000,
    search: Object.freeze({ x: 700, z: 400, radius: 1600 }),
    solve: 'fix-after-reverse',
    wantClass: 'DRIFTING',
    payoff: 'brake',
    bodyId: 'hauler',
    reverse: Object.freeze({ raiderId: 'raider', fromRole: 'decoy', toRole: 'player-decoy' }),
    emitters: Object.freeze([
      emitter({
        id: 'raider', tone: 40, power: 0, motion: 'fixed', role: 'jammer',
        pos: Object.freeze({ x: 1400, z: 200 }), jamRadius: 720, jamGain: 1, jamUntilReverse: true,
      }),
      emitter({
        id: 'stolen', tone: 41, copies: 'hauler', power: 1.8, motion: 'fixed', role: 'decoy',
        claim: 'DRIFTING', pos: Object.freeze({ x: 400, z: 500 }),
      }),
      emitter({
        id: 'hauler', tone: 41, power: 1, motion: 'linear',
        beforeReverse: 0, afterReverse: 1,
        pos: Object.freeze({ x: 1180, z: 1040 }), vel: Object.freeze({ x: 0, z: 14 }),
      }),
      emitter({
        id: 'mine', tone: 41, copies: 'hauler', power: 2.4, motion: 'fixed', role: 'player-decoy',
        propId: 'player-decoy', armOnTow: true, pos: Object.freeze({ x: 0, z: 0 }),
      }),
    ]),
    occluders: Object.freeze([
      Object.freeze({ id: 'slab', r: 110, propId: 'slab', pos: Object.freeze({ x: 0, z: -320 }) }),
    ]),
    reflectors: Object.freeze([]),
    props: Object.freeze([
      Object.freeze({ id: 'slab', kind: 'slab', pos: Object.freeze({ x: 0, z: -320 }) }),
      Object.freeze({ id: 'player-decoy', kind: 'decoy', pos: Object.freeze({ x: 0, z: 0 }) }),
    ]),
  }),

  Object.freeze({
    id: 'spectrum_jam_curtain',
    family: 'deception',
    mechanisms: Object.freeze(['jam', 'bearing']),
    publicName: 'CURTAIN CACHE',
    situation: 'Inside the jam curtain every bearing is rejected. Outside, the cache fixes like any other buoy.',
    horizon: 3000,
    search: Object.freeze({ x: 200, z: 700, radius: 1400 }),
    solve: 'fix',
    wantClass: 'STATIONARY',
    payoff: 'brake',
    bodyId: 'cache',
    emitters: Object.freeze([
      emitter({
        id: 'jammer', tone: 50, power: 0, motion: 'fixed', role: 'jammer',
        pos: Object.freeze({ x: 0, z: 0 }), jamRadius: 860, jamGain: 1,
      }),
      emitter({
        id: 'cache', tone: 51, power: 1, motion: 'fixed',
        pos: Object.freeze({ x: 80, z: 1280 }),
      }),
    ]),
    occluders: Object.freeze([]),
    reflectors: Object.freeze([]),
    props: Object.freeze([]),
  }),

  Object.freeze({
    id: 'spectrum_false_lantern',
    family: 'deception',
    mechanisms: Object.freeze(['spoof', 'occlusion', 'bearing']),
    publicName: 'LANTERN WRECK',
    situation: 'A lantern repeats the wreck tone from the wrong rock. Step behind the occulter and the lantern goes quiet.',
    horizon: 2400,
    search: Object.freeze({ x: 500, z: 200, radius: 1400 }),
    solve: 'survivor',
    wantClass: 'STATIONARY',
    payoff: 'brake',
    bodyId: 'wreck',
    emitters: Object.freeze([
      emitter({
        id: 'lantern', tone: 52, copies: 'wreck', power: 1.55, motion: 'fixed', role: 'decoy',
        claim: 'WRECK', pos: Object.freeze({ x: 0, z: 0 }),
      }),
      emitter({
        id: 'wreck', tone: 52, power: 0.82, motion: 'fixed',
        pos: Object.freeze({ x: 1040, z: 760 }),
      }),
    ]),
    occluders: Object.freeze([
      Object.freeze({ id: 'split-rock', r: 120, pos: Object.freeze({ x: 300, z: 40 }) }),
    ]),
    reflectors: Object.freeze([]),
    props: Object.freeze([]),
  }),

  Object.freeze({
    id: 'spectrum_black_box',
    family: 'disaster',
    mechanisms: Object.freeze(['chirp', 'bearing']),
    publicName: 'IMPACT SLED',
    situation: 'Three recorders coasted after one impact. Brake to read each frozen tone, then the backtrack agrees.',
    horizon: 5000,
    search: Object.freeze({ x: 250, z: 250, radius: 1600 }),
    solve: 'backtrack',
    silenceS: 10,
    payoff: 'brake',
    bodyId: 'sled',
    // Cargo sits at the impact. It does not transmit. Recorders: impact + velocity * silence.
    sled: Object.freeze({ x: 200, z: 200 }),
    emitters: Object.freeze([
      emitter({
        id: 'box-a', tone: 61, power: 1, motion: 'fixed', modulation: 'recording',
        recordedVel: Object.freeze({ x: 28, z: 0 }), pos: Object.freeze({ x: 480, z: 200 }),
      }),
      emitter({
        id: 'box-b', tone: 62, power: 1, motion: 'fixed', modulation: 'recording',
        recordedVel: Object.freeze({ x: 0, z: 22 }), pos: Object.freeze({ x: 200, z: 420 }),
      }),
      emitter({
        id: 'box-c', tone: 63, power: 1, motion: 'fixed', modulation: 'recording',
        recordedVel: Object.freeze({ x: -18, z: -12 }), pos: Object.freeze({ x: 20, z: 80 }),
      }),
    ]),
    occluders: Object.freeze([]),
    reflectors: Object.freeze([]),
    props: Object.freeze([]),
  }),

  Object.freeze({
    id: 'spectrum_vent_shadow',
    family: 'disaster',
    mechanisms: Object.freeze(['occlusion', 'bearing']),
    publicName: 'LEAKING BAY',
    situation: 'A sweep arm periodically covers the leaking bay. A sample in the shadow is a miss; clear windows fix the bay.',
    horizon: 3000,
    search: Object.freeze({ x: 0, z: 800, radius: 1200 }),
    solve: 'fix',
    wantClass: 'STATIONARY',
    payoff: 'brake',
    bodyId: 'leak',
    emitters: Object.freeze([
      emitter({ id: 'leak', tone: 71, power: 1, motion: 'fixed', pos: Object.freeze({ x: 0, z: 520 }) }),
    ]),
    occluders: Object.freeze([
      Object.freeze({
        id: 'arm', r: 90, motion: 'sweep',
        center: Object.freeze({ x: 0, z: 0 }), orbit: 780, omega: 0.45, phase: 0,
      }),
    ]),
    reflectors: Object.freeze([]),
    props: Object.freeze([]),
  }),

  Object.freeze({
    id: 'spectrum_lifeboat_lie',
    family: 'disaster',
    mechanisms: Object.freeze(['jam', 'chirp', 'spoof']),
    publicName: 'LIVE BOAT',
    situation: 'A recording repeats a survivor header. A jammer covers the start. The live boat is the one whose tone matches its drift.',
    horizon: 2000,
    search: Object.freeze({ x: 600, z: 200, radius: 1400 }),
    solve: 'classify',
    wantClass: 'DRIFTING',
    payoff: 'brake',
    bodyId: 'live',
    emitters: Object.freeze([
      emitter({
        id: 'jammer', tone: 80, power: 0, motion: 'fixed', role: 'jammer',
        pos: Object.freeze({ x: 0, z: 0 }), jamRadius: 740, jamGain: 1,
      }),
      emitter({
        id: 'recording', tone: 81, copies: 'live', power: 1.25, motion: 'fixed',
        modulation: 'recording', claim: 'SURVIVOR',
        recordedVel: Object.freeze({ x: 30, z: 8 }),
        pos: Object.freeze({ x: 860, z: -220 }),
      }),
      emitter({
        id: 'live', tone: 81, power: 0.9, motion: 'linear',
        pos: Object.freeze({ x: 860, z: 760 }), vel: Object.freeze({ x: 12, z: -8 }),
      }),
    ]),
    occluders: Object.freeze([]),
    reflectors: Object.freeze([]),
    props: Object.freeze([]),
  }),
]);

const BY_ID = new Map(SPECTRUM_CASES.map((row) => [row.id, row]));

export function spectrumCaseById(id) {
  return BY_ID.get(String(id || '')) || null;
}

export function spectrumCaseIds() {
  return SPECTRUM_CASES.map((row) => row.id);
}
