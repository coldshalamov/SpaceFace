// Twenty-four authored challenges. Layouts are world-unit coordinates on the XZ plane.
// Tapes are tick segments at 60 Hz. Pockets are volumes, not colliders.

function tape(rows) {
  let until = -1;
  return rows.map((row) => {
    until += row.t;
    return {
      until,
      mark: until,
      moveX: row.x || 0,
      moveZ: row.z || 0,
      turnIntent: row.turn || 0,
      boost: !!row.boost,
      brake: !!row.brake,
      cut: !!row.cut,
    };
  });
}

function mass(role, x, z, extra = {}) {
  return {
    role,
    x,
    z,
    radius: extra.r ?? 5,
    mass: extra.m ?? 6,
    kind: extra.kind || 'mass',
    focus: !!extra.focus,
    material: extra.material || 'debris',
    motor: extra.motor || null,
    vx: extra.vx || 0,
    vz: extra.vz || 0,
    dynamic: extra.dynamic,
    hull: extra.hull,
  };
}

function pocket(id, role, x, z, r = 16, minTravel = 12) {
  return { id, role, x, z, r, minTravel };
}

function sc(index, partial) {
  return {
    schema: 'spaceface.orbitalGallery.v1',
    seed: 7300 + index,
    limitTicks: partial.limitTicks || 300,
    player: partial.player || { x: 0, z: 0, rot: 0 },
    bodies: partial.bodies,
    pockets: partial.pockets,
    strategies: partial.strategies,
    lines: partial.lines || [],
    fields: partial.fields || [],
    hazards: partial.hazards || [],
    spoils: partial.spoils || [],
    id: partial.id,
    family: partial.family,
    title: partial.title,
    inference: partial.inference,
    synthesis: partial.synthesis === true,
  };
}

const shuttle = (cruise, periodS, heading = Math.PI / 2) => ({
  heading, cruise, accel: 80, periodS, phaseS: 0,
});

export const SCENARIOS = [
  // —— momentum: your hull is a cue ——
  sc(1, {
    id: 'og-a1-straight-cue',
    family: 'momentum',
    title: 'Straight cue',
    inference: 'A light mass keeps the momentum your hull spends on it.',
    bodies: [mass('cue', 30, 0, { r: 5, m: 6, focus: true })],
    pockets: [pocket('east', 'cue', 88, 0, 16), pocket('glance', 'cue', 78, -36, 16)],
    strategies: [
      { id: 'astern', tape: tape([{ t: 40, z: 1 }, { t: 140, brake: true }]) },
      { id: 'offset', tape: tape([{ t: 50, z: 1, x: 0.25 }, { t: 120, brake: true }]) },
    ],
  }),
  sc(2, {
    id: 'og-a2-object-ball',
    family: 'momentum',
    title: 'Object ball',
    inference: 'An off-center cue bends the object ball onto a different line.',
    bodies: [
      mass('cue', 26, 0, { r: 4, m: 4, focus: true }),
      mass('object', 46, 0, { r: 6, m: 14 }),
    ],
    pockets: [pocket('ahead', 'object', 96, 0, 16), pocket('low', 'object', 86, -34, 16)],
    strategies: [
      { id: 'through', tape: tape([{ t: 48, z: 1 }, { t: 160, brake: true }]) },
      { id: 'high', tape: tape([{ t: 36, z: 1, x: -0.28 }, { t: 100, brake: true }]) },
    ],
  }),
  sc(3, {
    id: 'og-a3-gate-cue',
    family: 'momentum',
    title: 'Gate cue',
    inference: 'A narrow gate passes a light cue and stops your hull.',
    bodies: [
      mass('cue', 22, 0, { r: 4, m: 4, focus: true }),
      mass('north', 48, 16, { r: 8, m: 9000, kind: 'bumper' }),
      mass('south', 48, -16, { r: 8, m: 9000, kind: 'bumper' }),
      mass('heavy', 68, 0, { r: 6, m: 26 }),
    ],
    pockets: [pocket('berth', 'heavy', 100, 0, 14, 10)],
    strategies: [
      { id: 'slip', tape: tape([{ t: 55, z: 1 }, { t: 180, brake: true }]) },
    ],
  }),
  sc(4, {
    id: 'og-a4-three-ball',
    family: 'momentum',
    title: 'Three-ball billiard',
    inference: 'Glance, mass, and a chain: the last ball is the one that berths.',
    synthesis: true,
    bodies: [
      mass('cue', 22, 8, { r: 4, m: 4, focus: true }),
      mass('mid', 42, 0, { r: 5, m: 8 }),
      mass('last', 64, -6, { r: 5, m: 12 }),
      mass('wall', 78, 22, { r: 8, m: 9000, kind: 'bumper' }),
    ],
    pockets: [pocket('corner', 'last', 96, -28, 16, 14)],
    strategies: [
      { id: 'chain', tape: tape([{ t: 50, z: 1 }, { t: 80, brake: true }]) },
    ],
  }),

  // —— sling: the Massline is a spring you ride or cut ——
  sc(5, {
    id: 'og-b1-orbit-strike',
    family: 'sling',
    title: 'Orbit strike',
    inference: 'A latched anchor turns thrust into an arc that strikes what a straight burn cannot.',
    bodies: [
      mass('anchor', -52, 0, { r: 8, m: 20000, kind: 'anchor' }),
      mass('north', -8, 34, { r: 5, m: 6, focus: true }),
      mass('south', -8, -34, { r: 5, m: 6 }),
    ],
    lines: [{ owner: 'pilot', target: 'anchor', defId: 'tether_standard', restLength: 52 }],
    pockets: [pocket('north-berth', 'north', -24, 78, 14, 12), pocket('south-berth', 'south', -24, -78, 14, 12)],
    strategies: [
      { id: 'plus-z', tape: tape([{ t: 110, x: 1 }, { t: 80, brake: true }]) },
      { id: 'minus-z', tape: tape([{ t: 110, x: -1 }, { t: 80, brake: true }]) },
    ],
    limitTicks: 360,
  }),
  sc(6, {
    id: 'og-b2-apex-cut',
    family: 'sling',
    title: 'Held tangent',
    inference: 'A latched swing carries the slug onto the tangent while the line still holds.',
    bodies: [
      mass('anchor', -40, 0, { r: 8, m: 20000, kind: 'anchor' }),
      mass('slug', -12, 30, { r: 5, m: 6, focus: true }),
    ],
    lines: [{ owner: 'pilot', target: 'anchor', defId: 'tether_standard', restLength: 40 }],
    pockets: [pocket('tangent', 'slug', -42, 70, 14, 14)],
    strategies: [
      { id: 'release', tape: tape([{ t: 63, x: 1 }, { t: 140, brake: true }]) },
    ],
    limitTicks: 360,
  }),
  sc(7, {
    id: 'og-b3-tow-post',
    family: 'sling',
    title: 'Tow the post',
    inference: 'A tow lets the pod take the long way around a post your nose cannot push it through.',
    bodies: [
      mass('pod', 26, 0, { r: 5, m: 9, focus: true, material: 'payload' }),
      mass('post', 58, 0, { r: 10, m: 9000, kind: 'bumper' }),
    ],
    lines: [{ owner: 'pilot', target: 'pod', defId: 'tether_standard', restLength: 26 }],
    pockets: [pocket('high-berth', 'pod', 8, 48, 14, 16), pocket('low-berth', 'pod', 8, -48, 14, 16)],
    strategies: [
      { id: 'high', tape: tape([{ t: 36, z: 0.4, x: 1 }, { t: 40, brake: true }]) },
      { id: 'low', tape: tape([{ t: 36, z: 0.4, x: -1 }, { t: 40, brake: true }]) },
    ],
    limitTicks: 360,
  }),
  sc(8, {
    id: 'og-b4-swing-and-strike',
    family: 'sling',
    title: 'Swing and strike',
    inference: 'The swing loads the strike: the slug berths behind a rock a straight burn never clears.',
    synthesis: true,
    bodies: [
      mass('anchor', -36, 0, { r: 8, m: 20000, kind: 'anchor' }),
      mass('slug', -10, 28, { r: 5, m: 6, focus: true }),
      mass('rock', -26, 58, { r: 8, m: 9000, kind: 'bumper' }),
    ],
    lines: [{ owner: 'pilot', target: 'anchor', defId: 'tether_standard', restLength: 36 }],
    pockets: [pocket('behind', 'slug', 16, 72, 14, 16)],
    strategies: [
      { id: 'arc', tape: tape([{ t: 90, x: 1 }, { t: 120, brake: true }]) },
    ],
    limitTicks: 360,
  }),

  // —— chain: one contact starts the next ——
  sc(9, {
    id: 'og-c1-two-ball',
    family: 'chain',
    title: 'Two-ball chain',
    inference: 'The ball you never touch can be the one that berths, if the ball you do touch hits it.',
    bodies: [
      mass('head', 24, 0, { r: 4, m: 5, focus: true }),
      mass('tail', 44, 0, { r: 5, m: 8 }),
    ],
    pockets: [pocket('berth', 'tail', 96, 0, 16, 16)],
    strategies: [
      { id: 'chain', tape: tape([{ t: 50, z: 1 }, { t: 160, brake: true }]) },
      { id: 'direct', tape: tape([{ t: 30, z: 1, boost: true }, { t: 90, brake: true }]) },
    ],
  }),
  sc(10, {
    id: 'og-c2-timed-crosser',
    family: 'chain',
    title: 'Timed crosser',
    inference: 'A body already in motion berths only if you add the crossing hit while it is in the window.',
    bodies: [
      mass('crosser', 34, -28, {
        r: 5, m: 7, focus: true,
        motor: shuttle(32, 3.2, Math.PI / 2),
      }),
    ],
    pockets: [pocket('early', 'crosser', 78, -8, 16, 14), pocket('late', 'crosser', 78, 28, 16, 14)],
    strategies: [
      { id: 'early', tape: tape([{ t: 18, z: 1, x: 0.2 }, { t: 160, brake: true }]) },
      { id: 'late', tape: tape([{ t: 55 }, { t: 16, z: 1 }, { t: 140, brake: true }]) },
    ],
    limitTicks: 360,
  }),
  sc(11, {
    id: 'og-c3-pin',
    family: 'chain',
    title: 'Pull the pin',
    inference: 'A pin in the gate holds the load; knocking the pin out is what lets the load through.',
    bodies: [
      mass('pin', 24, 0, { r: 4, m: 5, focus: true }),
      mass('load', 46, -14, { r: 6, m: 12 }),
    ],
    pockets: [pocket('through', 'load', 88, -28, 16, 12)],
    strategies: [
      { id: 'knock', tape: tape([{ t: 40, z: 1, x: -0.22 }, { t: 120, brake: true }]) },
    ],
    limitTicks: 360,
  }),
  sc(12, {
    id: 'og-c4-crosser-chain',
    family: 'chain',
    title: 'Crosser into the chain',
    inference: 'Time the crosser so it, not you, is what starts the chain into the berth.',
    synthesis: true,
    bodies: [
      mass('crosser', 30, -24, {
        r: 5, m: 6, focus: true,
        motor: shuttle(28, 3.4, Math.PI / 2),
      }),
      mass('rest', 52, 4, { r: 5, m: 8 }),
    ],
    pockets: [pocket('berth', 'rest', 90, 4, 16, 12)],
    strategies: [
      { id: 'time', tape: tape([{ t: 36, z: 1 }, { t: 180, brake: true }]) },
    ],
    limitTicks: 360,
  }),

  // —— cargo: moving custody ——
  sc(13, {
    id: 'og-d1-intercept',
    family: 'cargo',
    title: 'Intercept the pod',
    inference: 'A pod on a lane berths only when you change its lane while it is still in reach.',
    bodies: [
      mass('pod', 32, -32, {
        r: 5, m: 7, focus: true, kind: 'survivor', material: 'payload',
        motor: shuttle(30, 3.6, Math.PI / 2),
      }),
      mass('decoy', 70, -50, { r: 5, m: 20, kind: 'mass' }),
    ],
    pockets: [pocket('early', 'pod', 72, -12, 16, 12), pocket('late', 'pod', 72, 30, 16, 12)],
    strategies: [
      { id: 'early', tape: tape([{ t: 18, z: 1, x: 0.2 }, { t: 120, brake: true }]) },
      { id: 'late', tape: tape([{ t: 40 }, { t: 22, z: 1, x: 0.15 }, { t: 100, brake: true }]) },
    ],
    limitTicks: 360,
  }),
  sc(14, {
    id: 'og-d2-gap',
    family: 'cargo',
    title: 'Gap in the traffic',
    inference: 'The gap is the verb: wait for the blocker, or take the open end, and the pod still berths.',
    bodies: [
      mass('pod', 24, 0, { r: 5, m: 6, focus: true, material: 'payload', kind: 'survivor' }),
      mass('blocker', 52, -20, {
        r: 7, m: 40, kind: 'traffic',
        motor: shuttle(26, 2.8, Math.PI / 2),
      }),
    ],
    pockets: [pocket('through', 'pod', 88, 0, 14, 20), pocket('around', 'pod', 60, 42, 14, 16)],
    strategies: [
      { id: 'wait', tape: tape([{ t: 50 }, { t: 40, z: 1 }, { t: 140, brake: true }]) },
      { id: 'around', tape: tape([{ t: 18, x: -1 }, { t: 28, z: 1, x: 0.4 }, { t: 60, brake: true }]) },
    ],
    limitTicks: 360,
  }),
  sc(15, {
    id: 'og-d3-lane-change',
    family: 'cargo',
    title: 'Lane change',
    inference: 'A lane motor holds the along-track speed and leaves the sideways shove you gave it.',
    bodies: [
      mass('pod', 22, 0, {
        r: 5, m: 7, focus: true, material: 'payload', kind: 'survivor',
        motor: { heading: 0, cruise: 22, accel: 50, periodS: 0, phaseS: 0 },
      }),
    ],
    pockets: [pocket('side', 'pod', 70, -36, 14, 16)],
    strategies: [
      { id: 'nudge', tape: tape([{ t: 16, x: 1 }, { t: 20, z: 1 }, { t: 28, x: -1 }, { t: 80 }]) },
    ],
    limitTicks: 360,
  }),
  sc(16, {
    id: 'og-d4-bank-the-lane',
    family: 'cargo',
    title: 'Bank the lane',
    inference: 'Lane speed plus one sideways shove banks the pod off a rock into the berth.',
    synthesis: true,
    bodies: [
      mass('pod', 20, 6, {
        r: 5, m: 6, focus: true, material: 'payload', kind: 'survivor',
        motor: { heading: 0, cruise: 24, accel: 55, periodS: 0, phaseS: 0 },
      }),
      mass('bank', 58, 18, { r: 8, m: 9000, kind: 'bumper' }),
    ],
    pockets: [pocket('berth', 'pod', 76, 46, 12, 16)],
    strategies: [
      { id: 'bank', tape: tape([{ t: 16, x: -1 }, { t: 22, z: 1 }, { t: 30, x: 1 }, { t: 90 }]) },
    ],
    limitTicks: 360,
  }),

  // —— fields: the ring is a hand ——
  sc(17, {
    id: 'og-e1-into-the-well',
    family: 'field',
    title: 'Into the well',
    inference: 'Get a light mass across the ring edge and the well finishes the berth.',
    bodies: [mass('pod', 28, 0, { r: 5, m: 5, focus: true, material: 'payload' })],
    fields: [{ id: 'og-e1-well', defKey: 'well', x: 72, z: 0, radius: 34, strength: 220, damping: 4 }],
    pockets: [pocket('eye', 'pod', 72, 0, 16, 18)],
    strategies: [
      { id: 'straight', tape: tape([{ t: 36, z: 1 }, { t: 180, brake: true }]) },
      { id: 'high', tape: tape([{ t: 34, z: 1, x: 0.32 }, { t: 100, brake: true }]) },
    ],
    limitTicks: 360,
  }),
  sc(18, {
    id: 'og-e2-repulsor-berm',
    family: 'field',
    title: 'Repulsor berm',
    inference: 'A repulsor shoves outward: the side you enter is the side you leave.',
    bodies: [mass('pod', 24, 0, { r: 5, m: 5, focus: true, material: 'payload' })],
    fields: [{ id: 'og-e2-repulsor', defKey: 'repulsor', x: 58, z: 0, radius: 28, strength: 260, damping: 0 }],
    pockets: [pocket('out-east', 'pod', 96, 0, 16, 20), pocket('out-high', 'pod', 16, -34, 16, 16)],
    strategies: [
      { id: 'through', tape: tape([{ t: 40, z: 1 }, { t: 160, brake: true }]) },
      { id: 'high', tape: tape([{ t: 30, z: 1, x: 0.35 }, { t: 80, brake: true }]) },
    ],
    limitTicks: 360,
  }),
  sc(19, {
    id: 'og-e3-heavy-shrugs',
    family: 'field',
    title: 'The heavy shrugs',
    inference: 'A light decoy falls into the well; the heavy shrugs, and you walk it around.',
    bodies: [
      mass('heavy', 24, 0, { r: 7, m: 90, focus: true, material: 'payload' }),
      mass('decoy', 36, 22, { r: 4, m: 4, material: 'payload' }),
    ],
    fields: [{ id: 'og-e3-well', defKey: 'well', x: 62, z: 0, radius: 28, strength: 200, damping: 3 }],
    hazards: [{ id: 'well-mouth', role: 'heavy', x: 62, z: 0, r: 16 }],
    pockets: [pocket('around', 'heavy', 62, 52, 16, 20)],
    strategies: [
      { id: 'around', tape: tape([{ t: 18, x: -1 }, { t: 22, z: 1 }, { t: 36, x: 1 }, { t: 50, z: 1 }, { t: 40, brake: true }]) },
    ],
    limitTicks: 360,
  }),
  sc(20, {
    id: 'og-e4-well-cue',
    family: 'field',
    title: 'Well cue',
    inference: 'The well delivers the light cue into the heavy, and that contact is the berth.',
    synthesis: true,
    bodies: [
      mass('cue', 26, 0, { r: 4, m: 4, focus: true }),
      mass('heavy', 70, 0, { r: 6, m: 18 }),
    ],
    fields: [{ id: 'og-e4-well', defKey: 'well', x: 52, z: 0, radius: 30, strength: 200, damping: 2 }],
    pockets: [pocket('berth', 'heavy', 98, 0, 14, 8)],
    strategies: [
      { id: 'feed', tape: tape([{ t: 36, z: 1 }, { t: 120, brake: true }]) },
    ],
    limitTicks: 360,
  }),

  // —— rescue: a clock that is a place, not a menu ——
  sc(21, {
    id: 'og-f1-beat-the-drift',
    family: 'rescue',
    title: 'Beat the drift',
    inference: 'The pod is already drifting into trouble; a sideways hit is how you spend the time you have.',
    bodies: [
      mass('pod', 28, 0, { r: 5, m: 6, focus: true, kind: 'survivor', material: 'payload', vx: 20 }),
    ],
    hazards: [{ id: 'spill', role: 'pod', x: 92, z: 0, r: 12 }],
    pockets: [pocket('south', 'pod', 100, -20, 14, 12), pocket('north', 'pod', 100, 20, 14, 12)],
    strategies: [
      { id: 'high', tape: tape([{ t: 12, x: 1 }, { t: 28, z: 1 }, { t: 80, brake: true }]) },
      { id: 'low', tape: tape([{ t: 12, x: -1 }, { t: 28, z: 1 }, { t: 80, brake: true }]) },
    ],
    limitTicks: 280,
  }),
  sc(22, {
    id: 'og-f2-tow-clear',
    family: 'rescue',
    title: 'Tow clear',
    inference: 'The line outruns the well: tow the pod off the ring before the mouth takes it.',
    bodies: [
      mass('pod', 34, 0, { r: 5, m: 7, focus: true, kind: 'survivor', material: 'payload' }),
    ],
    lines: [{ owner: 'pilot', target: 'pod', defId: 'tether_standard', restLength: 34 }],
    fields: [{ id: 'og-f2-well', defKey: 'well', x: 70, z: 0, radius: 42, strength: 90, damping: 1 }],
    hazards: [{ id: 'mouth', role: 'pod', x: 70, z: 0, r: 12 }],
    pockets: [pocket('clear', 'pod', 0, 18, 14, 14)],
    strategies: [
      { id: 'tow', tape: tape([{ t: 42, x: 1 }, { t: 50, brake: true }]) },
    ],
    limitTicks: 320,
  }),
  sc(23, {
    id: 'og-f3-either-pod',
    family: 'rescue',
    title: 'Either pod',
    inference: 'The clock fits one rescue: the near pod on a shove, or the far pod if you spend the boost.',
    bodies: [
      mass('near', 22, 8, { r: 5, m: 6, focus: true, kind: 'survivor', material: 'payload' }),
      mass('far', 40, -18, { r: 5, m: 6, kind: 'survivor', material: 'payload' }),
    ],
    pockets: [pocket('near-berth', 'near', 80, 36, 14, 16), pocket('far-berth', 'far', 78, -48, 14, 16)],
    strategies: [
      { id: 'near', tape: tape([{ t: 18, z: 1, x: 0.35 }, { t: 40, x: 1 }, { t: 40, brake: true }]) },
      { id: 'far', tape: tape([{ t: 22, x: -1 }, { t: 40, z: 1, boost: true }, { t: 40, brake: true }]) },
    ],
    limitTicks: 240,
  }),
  sc(24, {
    id: 'og-f4-drift-well-line',
    family: 'rescue',
    title: 'Drift, well, line',
    inference: 'Latch the drifting pod and tow it clear of the well before the mouth, or the clock is the well.',
    synthesis: true,
    bodies: [
      mass('pod', 30, 4, { r: 5, m: 6, focus: true, kind: 'survivor', material: 'payload', vx: 12 }),
    ],
    lines: [{ owner: 'pilot', target: 'pod', defId: 'tether_standard', restLength: 30 }],
    fields: [{ id: 'og-f4-well', defKey: 'well', x: 78, z: 4, radius: 50, strength: 70, damping: 1 }],
    hazards: [{ id: 'mouth', role: 'pod', x: 78, z: 4, r: 12 }],
    pockets: [pocket('berth', 'pod', 4, 14, 14, 12)],
    strategies: [
      { id: 'tow', tape: tape([{ t: 40, x: 1, z: -0.2 }, { t: 50, brake: true }]) },
    ],
    limitTicks: 280,
  }),
];

const BY_ID = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));

export function getScenario(id) {
  return BY_ID.get(id) || null;
}

export function listScenarios() {
  return SCENARIOS.map((scenario) => ({
    id: scenario.id,
    family: scenario.family,
    title: scenario.title,
    inference: scenario.inference,
    synthesis: scenario.synthesis === true,
    strategies: scenario.strategies.map((row) => row.id),
  }));
}

/** Opening slice: the first six challenges, directly playable through openSession. */
export const PLAYABLE_SLICE = Object.freeze(SCENARIOS.slice(0, 6).map((scenario) => scenario.id));
