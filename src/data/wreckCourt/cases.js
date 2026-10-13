// Twelve Wreck Court incidents. Present-day bodies are the integrator's output.
// `correct` / `wrong` are proof labels. The support checker never receives them.

import { balancedRadial, jitterSource, makeBody, runIncident } from './physics.js';

const ENTRY_CASE = 'wc_desperate_rescue';

function scan(target, mode, field, cmp) {
  return { op: 'scan', target, mode, field, ...cmp };
}
function recon(model, cmp) {
  return { op: 'recon', model, ...cmp };
}
function all(...of) {
  return { op: 'all', of };
}

function consequence({ payout, payee, heat, facts, effects, situation }) {
  return {
    payout_cr: payout,
    payee,
    heat: heat || null,
    worldFacts: facts || [],
    effects: effects || [],
    situation,
  };
}

function hypo({ id, statement, requires, falsifiedBy, correct, wrong, consequence: cons }) {
  return { id, statement, requires, falsifiedBy: falsifiedBy || [], correct: !!correct, wrong: !!wrong, consequence: cons };
}

function ancient(target) {
  return hypo({
    id: 'older_than_the_lane',
    statement: 'This is an unregistered loss from long before the lane was drawn. There is nothing recent to file.',
    requires: [scan(target, 'thermal', 'age', { gt: 4000 })],
    consequence: consequence({
      payout: 0,
      payee: 'none',
      situation: 'The court declines. The heat in the metal is too recent for an ancient loss, once anyone takes a temperature.',
      effects: [],
    }),
  });
}

export const WRECK_COURT_CASES = [
  {
    id: 'wc_faked_collision',
    title: 'The Matched Pair',
    access: 'anthology',
    playerStart: { x: -36, z: -220 },
    briefing: 'Two hulls drift as a pair. The insurer has a mutual-impact claim. The smaller hull\'s owner says they never met. File what the bodies support.',
    uncertainty: 'Crew intent is not a measurement. A coat of polymer can be seen; why it was sprayed cannot. Parallel drifts have a miss distance with a few WU of sample noise.',
    build(ctx) {
      const j = ctx.j;
      return {
        until: 48,
        assayPoints: [],
        bodies: [
          makeBody({
            id: 'hull_a', variant: 'wc_hauler', mass: 820, radius: 22,
            x: -24 + j(), z: 90 + j(), vx: 4, vz: 0.12, heading: 0.05,
            integrity: 1, transponderGroup: 'pair',
            flavor: 'Looping mayday from the larger hull: "we are in contact, we are in contact."',
          }),
          makeBody({
            id: 'hull_b', variant: 'wc_freighter', mass: 510, radius: 18,
            x: -10 + j(), z: -30 + j(), vx: 14, vz: 0.12, heading: 0.08,
            integrity: 1, transponderGroup: 'pair',
            flavor: 'The smaller hull\'s filing says the impact was mutual and already settled.',
          }),
        ],
        events: [
          { t: 0.5, kind: 'thrust', id: 'hull_a', ax: 1, az: 0, duration: 5, note: 'larger hull matched the smaller drift' },
          { t: 0.5, kind: 'thrust', id: 'hull_b', ax: -1, az: 0, duration: 5, note: 'smaller hull matched the larger drift' },
          { t: 8, kind: 'coat', id: 'hull_a', other: 'hull_b', integrity: 0.4, note: 'polymer sprayed on the face toward the other hull' },
          { t: 8.2, kind: 'coat', id: 'hull_b', other: 'hull_a', integrity: 0.58, note: 'matching coat on the facing side' },
        ],
      };
    },
    hypotheses: [
      hypo({
        id: 'staged_nudge',
        correct: true,
        statement: 'The hulls never met. The facing scars are a sprayed coat on two craft that matched drift.',
        requires: [
          scan('hull_a', 'spectro', 'material', { eq: 'polymer_coat' }),
          scan('hull_b', 'spectro', 'material', { eq: 'polymer_coat' }),
          { op: 'compare', a: 'hull_a', b: 'hull_b', field: 'miss', gt: 40 },
        ],
        consequence: consequence({
          payout: 1600,
          payee: 'insurer_recovery',
          heat: { factionId: 'meridian', delta: -2 },
          facts: [{ id: 'wc_faked_collision_ruling', value: 'staged' }],
          effects: [
            { kind: 'stamp', targetId: 'hull_b', stamp: 'COAT FILED — RECOVERY' },
            { kind: 'depart', targetId: 'hull_b', heading: 1.2, seconds: 5 },
          ],
          situation: 'The insurer takes the coat and the miss distance. The smaller hull is ordered off the lane. Both wrecks stay where the physics left them, one of them now moving because it was told to leave.',
        }),
      }),
      hypo({
        id: 'mutual_impact',
        wrong: true,
        statement: 'The two hulls struck each other and share the loss.',
        requires: [
          scan('hull_a', 'visual', 'damaged', { eq: true }),
          scan('hull_b', 'visual', 'damaged', { eq: true }),
          scan('hull_a', 'visual', 'scar.nx', { finite: true }),
        ],
        falsifiedBy: [
          scan('hull_a', 'spectro', 'material', { eq: 'polymer_coat' }),
          { op: 'compare', a: 'hull_a', b: 'hull_b', field: 'miss', gt: 40 },
        ],
        consequence: consequence({
          payout: 420,
          payee: 'shared_loss',
          heat: { factionId: 'meridian', delta: 1 },
          facts: [{ id: 'wc_faked_collision_ruling', value: 'mutual' }],
          effects: [
            { kind: 'stamp', targetId: 'hull_a', stamp: 'MUTUAL LOSS' },
            { kind: 'depart', targetId: 'hull_b', heading: 0.2, seconds: 5 },
          ],
          situation: 'The court splits the loss. The smaller hull is paid as a victim and leaves. Nobody orders the coat sampled.',
        }),
      }),
      ancient('hull_a'),
    ],
  },
  {
    id: ENTRY_CASE,
    title: 'The Burn That Broke the Tug',
    access: 'loss_investigation_communicator',
    playerStart: { x: 40, z: -360 },
    briefing: 'A tug, a pod, and an older hauler are in the same volume. The hauler\'s insurer says the tug rammed it. The pod is still sealed. File what the bodies support.',
    uncertainty: 'Fragment ages come from cooling metal, good to a few seconds inside this window and useless once a piece has reached ambient. The pod\'s occupant is not a witness you can question.',
    build(ctx) {
      const j = ctx.j;
      const haulerPieces = balancedRadial(3, 16, 160, 0.6);
      const tugPieces = balancedRadial(2, 11, 120, 1.1);
      return {
        until: 92,
        assayPoints: [],
        bodies: [
          makeBody({
            id: 'hauler', variant: 'wc_hauler', mass: 480, radius: 18,
            x: 380 + j(), z: 20 + j(), vx: 1.4, vz: 0.2, heading: 0.4,
            transponderGroup: 'hauler', integrity: 0.5,
            flavor: 'Hauler beacon, long dead: "heavy contact."',
          }),
          makeBody({
            id: 'tug', variant: 'wc_tug', mass: 260, radius: 14,
            x: -820 + j(), z: -60 + j(), vx: 16, vz: 3.2, heading: 0.18,
            fuel: 30, fuelCapacity: 40, transponderGroup: 'tug',
            flavor: 'Tug loop: "closing on the pod, hold on."',
          }),
          makeBody({
            id: 'pod', variant: 'wc_pod', mass: 42, radius: 7,
            x: 60 + j(), z: 8 + j(), vx: 2.4, vz: 0.3, heading: 0,
            integrity: 1, cargo: { declared: 'crew', actual: 'crew', sealed: true },
            flavor: 'Pod seals read intact from the outside.',
          }),
        ],
        events: [
          {
            t: 7, kind: 'split', id: 'hauler', note: 'hauler came apart long before the tug arrived',
            children: haulerPieces.map((p, i) => ({
              id: `hauler_${i}`, variant: 'wc_fragment', mass: p.mass, radius: 7,
              dvx: p.dvx, dvz: p.dvz, heading: i * 0.8, integrity: 0.28,
              transponderGroup: 'hauler', flavor: 'Chalked hauler plate.',
            })),
          },
          { t: 12, kind: 'thrust', id: 'tug', ax: 5.5, az: 1.1, duration: 26, note: 'rescue burn toward the pod' },
          {
            t: 44, kind: 'split', id: 'tug', note: 'tug spine failed in the burn',
            children: [
              {
                id: 'tug_bow', variant: 'wc_tug', mass: tugPieces[0].mass, radius: 9,
                dvx: tugPieces[0].dvx, dvz: tugPieces[0].dvz, heading: 0.25,
                integrity: 0.33, transponderGroup: 'tug', fuel: 0, fuelCapacity: 40,
                flavor: 'Bow, torn along the line of the burn.',
              },
              {
                id: 'tug_stern', variant: 'wc_nozzle', mass: tugPieces[1].mass, radius: 7,
                dvx: tugPieces[1].dvx, dvz: tugPieces[1].dvz, heading: 2.4,
                integrity: 0.3, transponderGroup: 'tug',
                flavor: 'Engine section, split on the thrust axis.',
              },
            ],
          },
        ],
      };
    },
    hypotheses: [
      hypo({
        id: 'rescue_boost_failure',
        correct: true,
        statement: 'The tug was burning toward a sealed pod and came apart in that burn. The hauler had already been a wreck.',
        requires: [{ op: 'gap', model: 'ballistic', groupA: 'tug', groupB: 'hauler', gt: 12 }],
        consequence: consequence({
          payout: 980,
          payee: 'pod_rescue',
          heat: { factionId: 'concord', delta: -1 },
          facts: [{ id: 'wc_desperate_rescue_ruling', value: 'boost_failure' }],
          effects: [
            { kind: 'stamp', targetId: 'pod', stamp: 'SEALS HELD — RECOVER' },
            { kind: 'stamp', targetId: 'tug_bow', stamp: 'BURN FAILURE' },
          ],
          situation: 'The pod stays sealed and is marked for recovery. The tug\'s break is filed as a burn failure. The hauler remains an older wreck beside them.',
        }),
      }),
      hypo({
        id: 'tug_rammed_hauler',
        wrong: true,
        statement: 'The tug rammed the hauler.',
        requires: [
          scan('tug_bow', 'visual', 'damaged', { eq: true }),
          scan('hauler_0', 'visual', 'damaged', { eq: true }),
        ],
        falsifiedBy: [{ op: 'gap', model: 'ballistic', groupA: 'tug', groupB: 'hauler', gt: 12 }],
        consequence: consequence({
          payout: 260,
          payee: 'hauler_insurer',
          heat: { factionId: 'concord', delta: 2 },
          facts: [{ id: 'wc_desperate_rescue_ruling', value: 'ram' }],
          effects: [
            { kind: 'stamp', targetId: 'tug_bow', stamp: 'DETAINED' },
            { kind: 'stamp', targetId: 'pod', stamp: 'IMPOUNDED' },
          ],
          situation: 'The tug is detained on a ramming file. The pod is impounded with it. The hauler\'s insurer is paid the smaller schedule.',
        }),
      }),
      ancient('hauler_0'),
    ],
  },
  {
    id: 'wc_smuggling_cleanup',
    title: 'The Early Pod',
    access: 'anthology',
    playerStart: { x: 240, z: 200 },
    briefing: 'A freighter has burst. A buoy is shouting a raid code. One pod is still sealed. File what the bodies support.',
    uncertainty: 'A looped transponder can wear a real faction code. The assay says what the pod contains, not who ordered it ejected. Cooking the pod destroys that reading.',
    build(ctx) {
      const j = ctx.j;
      const pieces = balancedRadial(4, 20, 70, 0.35);
      return {
        until: 84,
        assayPoints: [{ id: 'assay_lane', x: 640, z: -260 }],
        bodies: [
          makeBody({
            id: 'freighter', variant: 'wc_freighter', mass: 360, radius: 20,
            x: j(), z: j(), vx: 5.5, vz: 0.8, heading: 0.2,
            transponderGroup: 'freighter',
            flavor: 'Captain\'s loop: "under fire, under fire."',
          }),
          makeBody({
            id: 'pod', variant: 'wc_isotope_pod', mass: 48, radius: 7,
            x: 0, z: 52, vx: 5.5, vz: 0.8, heading: 0,
            volatile: true, fragile: true,
            cargo: { declared: 'machine_parts', actual: 'isotope_dust', sealed: true },
            flavor: 'The plate on the pod says machine parts.',
          }),
          makeBody({
            id: 'buoy', variant: 'wc_buoy', mass: 2.2, radius: 3,
            x: 210 + j(), z: 36 + j(), vx: 5.5, vz: 0.8,
            transponderHostile: true, integrity: 0.84, thermalLock: 70,
            flavor: 'Reach raid code, loud, no hull behind it.',
          }),
        ],
        events: [
          { t: 9, kind: 'impulse', id: 'pod', jx: 180, jz: 1500, note: 'pod ejected clear before the scuttle' },
          {
            t: 40, kind: 'split', id: 'freighter', note: 'scuttle charge after the pod was already away',
            children: pieces.map((p, i) => ({
              id: `freighter_${i}`, variant: 'wc_fragment', mass: p.mass, radius: 6,
              dvx: p.dvx, dvz: p.dvz, integrity: 0.22, transponderGroup: 'freighter',
              flavor: 'Freighter plate, torn, not painted.',
            })),
          },
        ],
      };
    },
    hypotheses: [
      hypo({
        id: 'pre_ejection_scuttle',
        correct: true,
        statement: 'The sealed pod left the freighter before the burst, and it does not contain what the plate says.',
        requires: [
          recon('ejection', { field: 'lead', gt: 8 }),
          recon('ejection', { field: 'releaseMiss', lt: 50 }),
          { op: 'assay', target: 'pod', field: 'mismatch', eq: true },
        ],
        consequence: consequence({
          payout: 1540,
          payee: 'customs_assay',
          heat: { factionId: 'reach', delta: 3 },
          facts: [{ id: 'wc_smuggling_cleanup_ruling', value: 'pre_ejection' }],
          effects: [
            { kind: 'stamp', targetId: 'pod', stamp: 'ASSAY SEIZED' },
            { kind: 'stamp', targetId: 'buoy', stamp: 'CODE IS A RECORDING' },
          ],
          situation: 'The pod is seized for the assay. The buoy\'s raid code is stamped as a recording. The freighter debris is left in place.',
        }),
      }),
      hypo({
        id: 'pirate_strike',
        wrong: true,
        statement: 'A raid burst the freighter. The buoy is the raider.',
        requires: [
          scan('freighter_0', 'visual', 'damaged', { eq: true }),
          scan('buoy', 'visual', 'transponderHostile', { eq: true }),
        ],
        falsifiedBy: [
          recon('ejection', { field: 'lead', gt: 8 }),
          scan('buoy', 'mass', 'mass', { lt: 20 }),
        ],
        consequence: consequence({
          payout: 640,
          payee: 'raid_bounty',
          heat: { factionId: 'reach', delta: 1 },
          facts: [{ id: 'wc_smuggling_cleanup_ruling', value: 'pirate' }],
          effects: [
            { kind: 'depart', targetId: 'buoy', heading: 2.4, seconds: 6 },
            { kind: 'stamp', targetId: 'freighter_0', stamp: 'RAID FILED' },
          ],
          situation: 'The court pays a raid bounty and lets the buoy\'s code go on its way. The pod\'s plate is never opened.',
        }),
      }),
      ancient('freighter_0'),
    ],
  },
  {
    id: 'wc_industrial_overload',
    title: 'The Core That Let Go',
    access: 'anthology',
    playerStart: { x: 20, z: -340 },
    briefing: 'A refinery barge is a radial field of plate. A yard tender sits scorched nearby. The tender\'s office says they struck the barge. File what the bodies support.',
    uncertainty: 'Momentum closure is only as good as the mass samples. A body that left the scene cannot be weighed. Radiant soot is not a contact fold.',
    build(ctx) {
      const j = ctx.j;
      const pieces = balancedRadial(6, 34, 64, 0.2);
      return {
        until: 68,
        assayPoints: [],
        bodies: [
          makeBody({
            id: 'barge', variant: 'wc_barge', mass: 384, radius: 26,
            x: j(), z: j(), vx: 1.2, vz: 0.3, heading: 0.5,
            transponderGroup: 'barge',
            flavor: 'Barge alarm, clipped: core temperature unreadable.',
          }),
          makeBody({
            id: 'tender', variant: 'wc_tender', mass: 170, radius: 12,
            x: 280 + j(), z: 50 + j(), vx: -2.4, vz: 0.8, heading: Math.PI,
            integrity: 1,
            flavor: 'Tender pilot: "we were alongside when it went."',
          }),
        ],
        events: [
          {
            t: 16, kind: 'split', id: 'barge', note: 'internal release, dvs balanced',
            radiant: 420,
            children: pieces.map((p, i) => ({
              id: `barge_${i}`, variant: 'wc_fragment', mass: p.mass, radius: 6,
              dvx: p.dvx, dvz: p.dvz, integrity: 0.18, transponderGroup: 'barge',
              flavor: 'Plate from the core bay.',
            })),
          },
        ],
      };
    },
    hypotheses: [
      hypo({
        id: 'internal_overload',
        correct: true,
        statement: 'The barge came apart from an internal release. The pieces share an origin and carry no leftover strike momentum.',
        requires: [
          recon('ballistic', { group: 'barge', field: 'residual', lt: 48, minBodies: 5 }),
          recon('ballistic', { group: 'barge', field: 'spreadSpeed', gt: 12, minBodies: 5 }),
        ],
        consequence: consequence({
          payout: 1120,
          payee: 'yard_clearance',
          facts: [{ id: 'wc_industrial_overload_ruling', value: 'internal' }],
          effects: [
            { kind: 'stamp', targetId: 'tender', stamp: 'CLEARED — SCORCH ONLY' },
            { kind: 'stamp', targetId: 'barge_0', stamp: 'INTERNAL RELEASE' },
          ],
          situation: 'The tender is cleared. The barge is filed as an internal release. The tender does not leave under a strike order.',
        }),
      }),
      hypo({
        id: 'tender_struck_barge',
        wrong: true,
        statement: 'The tender struck the barge and burst it.',
        requires: [
          scan('tender', 'visual', 'damaged', { eq: true }),
          scan('barge_0', 'visual', 'damaged', { eq: true }),
        ],
        falsifiedBy: [recon('ballistic', { group: 'barge', field: 'residual', lt: 48, minBodies: 5 })],
        consequence: consequence({
          payout: 340,
          payee: 'tender_bond',
          heat: { factionId: 'meridian', delta: 2 },
          facts: [{ id: 'wc_industrial_overload_ruling', value: 'tender' }],
          effects: [
            { kind: 'stamp', targetId: 'tender', stamp: 'BOND CALLED' },
            { kind: 'depart', targetId: 'tender', heading: 2.8, seconds: 6 },
          ],
          situation: 'The tender\'s bond is called and the tender is ordered away. The radial field is left unexplained.',
        }),
      }),
      ancient('barge_0'),
    ],
  },
  {
    id: 'wc_ambush_as_accident',
    title: 'The Sunward Face',
    access: 'anthology',
    playerStart: { x: 460, z: 24 },
    briefing: 'A hauler sits against a rock and calls it an accident. The rock has two faces. File what the bodies support.',
    uncertainty: 'Anything still in the rock\'s shadow is not evidence yet. Shoving the rock into that shadow can crush what the shadow was hiding. A groove is a shape, not a name.',
    build(ctx) {
      const j = ctx.j;
      // Muzzle at (-70, 2). The round and the skiff leave that point and the step
      // carries them to the present. The far-face groove is cut when the round passes the rock.
      const lead = 20;
      return {
        until: 6 + lead,
        assayPoints: [],
        bodies: [
          makeBody({
            id: 'rock', variant: 'wc_rock', mass: 2800, radius: 38,
            x: 0 - 0.15 * lead, z: 0, vx: 0.15, vz: 0, heading: 0, occults: true,
            thermalLock: 40, integrity: 1,
            scar: {
              nx: 1, nz: 0, material: 'stone',
              faces: [{ kind: 'clean', nx: 1, nz: 0 }],
            },
            flavor: 'The sunward face is what the hauler is looking at.',
          }),
          makeBody({
            id: 'hauler', variant: 'wc_hauler', mass: 740, radius: 18,
            x: 430 + j() - 0.6 * lead, z: 140 + j() - 0.05 * lead, vx: 0.6, vz: 0.05, heading: Math.PI,
            integrity: 0.12,
            scar: { nx: -1, nz: 0, material: 'torn_alloy', faces: [{ kind: 'fold', nx: -1, nz: 0 }] },
            flavor: 'Hauler log: "we struck the rock."',
          }),
          makeBody({
            id: 'shooter', variant: 'wc_skiff', mass: 86, radius: 10,
            x: -70, z: 2, vx: -8, vz: 0.2, heading: Math.PI,
            integrity: 0.86, crushable: true, occultedBy: 'rock',
            magazine: { capacity: 6, remaining: 5 },
            flavor: 'No beacon.',
          }),
          makeBody({
            id: 'round', variant: 'wc_round', mass: 3, radius: 1.4,
            x: -70, z: 2, vx: 11.5, vz: 0.3, heading: 0, noCollide: true,
            flavor: 'A dense splinter standing in the hauler\'s flank.',
          }),
        ],
        events: [],
      };
    },
    hypotheses: [
      hypo({
        id: 'ambush_from_cover',
        correct: true,
        statement: 'The splinter and a departing skiff share a point on the rock\'s far side. The hauler did not die on the sunward face.',
        requires: [{ op: 'compare', a: 'round', b: 'shooter', field: 'miss', lt: 22 }],
        consequence: consequence({
          payout: 1860,
          payee: 'hauler_kin',
          heat: { factionId: 'reach', delta: 4 },
          facts: [{ id: 'wc_ambush_as_accident_ruling', value: 'ambush' }],
          effects: [
            { kind: 'stamp', targetId: 'hauler', stamp: 'AMBUSH FILED' },
            { kind: 'depart', targetId: 'shooter', heading: Math.PI, seconds: 5 },
          ],
          situation: 'The skiff is named and ordered out. The hauler stays. The rock stays. The accident file does not.',
        }),
      }),
      hypo({
        id: 'rock_impact',
        wrong: true,
        statement: 'The hauler struck the rock.',
        requires: [
          scan('hauler', 'visual', 'damaged', { eq: true }),
          scan('rock', 'visual', 'variant', { eq: 'wc_rock' }),
        ],
        falsifiedBy: [
          scan('rock', 'structure', 'hasGroove', { eq: true }),
          { op: 'compare', a: 'round', b: 'shooter', field: 'miss', lt: 22 },
        ],
        consequence: consequence({
          payout: 240,
          payee: 'accident_schedule',
          facts: [{ id: 'wc_ambush_as_accident_ruling', value: 'rock' }],
          effects: [{ kind: 'stamp', targetId: 'hauler', stamp: 'ACCIDENT — ROCK' }],
          situation: 'The hauler is filed as a rock strike. No one is ordered to look at the far face. The schedule pays the minimum.',
        }),
      }),
      ancient('hauler'),
    ],
  },
  {
    id: 'wc_abandoned_tow',
    title: 'The Necked Cable',
    access: 'anthology',
    playerStart: { x: 40, z: -280 },
    briefing: 'A tug is ahead of a hull with its nose pointed away. A cable lies between them. The rumor says the tug cut the tow and ran. File what the bodies support.',
    uncertainty: 'A nose pointed away is a present heading, not a history. Tensile failure and a cut are different ends; the metal has to be read. Empty tanks do not say where the last burn was aimed.',
    build(ctx) {
      const j = ctx.j;
      return {
        until: 46,
        assayPoints: [],
        bodies: [
          makeBody({
            id: 'hull', variant: 'wc_hauler', mass: 880, radius: 20,
            x: -260 + j(), z: 10 + j(), vx: 7, vz: 0.1, heading: 0,
            integrity: 0.62,
            flavor: 'The hull kept the course it had under tow.',
          }),
          makeBody({
            id: 'tug', variant: 'wc_tug', mass: 230, radius: 12,
            x: -260 + j(), z: -36, vx: 7, vz: 0, heading: 0,
            integrity: 0.8, fuel: 10, fuelCapacity: 40,
            flavor: 'From a distance the tug looks like it is leaving.',
          }),
        ],
        events: [
          { t: 0.4, kind: 'tether', a: 'tug', b: 'hull', rest: 'current', stiffness: 4000, breakForce: 500, partOnBreak: true, note: 'tow cable made up, taut' },
          { t: 1, kind: 'thrust_heading', id: 'tug', accel: 4.5, spin: 0, duration: 12, note: 'tug pulled until the neck parted, then kept burning' },
        ],
      };
    },
    hypotheses: [
      hypo({
        id: 'cable_parted_return_failed',
        correct: true,
        statement: 'The cable necked and parted. The tug\'s tanks are empty.',
        requires: [
          scan('cable_end', 'spectro', 'material', { eq: 'tensile_neck' }),
          scan('tug', 'fuel', 'remaining', { eq: 0 }),
        ],
        consequence: consequence({
          payout: 1040,
          payee: 'tow_bond_release',
          facts: [{ id: 'wc_abandoned_tow_ruling', value: 'parted' }],
          effects: [
            { kind: 'stamp', targetId: 'tug', stamp: 'STRANDED — TANKS DRY' },
            { kind: 'stamp', targetId: 'cable_end', stamp: 'TENSILE PART' },
          ],
          situation: 'The tug is filed as stranded, not fleeing. The cable end is kept. The hull continues on the course it already had.',
        }),
      }),
      hypo({
        id: 'tug_cut_and_ran',
        wrong: true,
        statement: 'The tug cut the tow and ran.',
        requires: [
          { op: 'noseAway', target: 'tug', awayFrom: 'hull', gt: 1.2 },
          scan('hull', 'visual', 'damaged', { eq: true }),
        ],
        falsifiedBy: [scan('cable_end', 'spectro', 'material', { eq: 'tensile_neck' })],
        consequence: consequence({
          payout: 380,
          payee: 'hull_owner',
          heat: { factionId: 'concord', delta: 2 },
          facts: [{ id: 'wc_abandoned_tow_ruling', value: 'fled' }],
          effects: [
            { kind: 'stamp', targetId: 'tug', stamp: 'CUT AND RAN' },
            { kind: 'depart', targetId: 'tug', heading: 0.1, seconds: 5 },
          ],
          situation: 'The tug is ordered on, under a flight file. The hull owner takes the smaller payment. The cable end is not read.',
        }),
      }),
      ancient('hull'),
    ],
  },
  {
    id: 'wc_engine_failure',
    title: 'The Walking Nozzle',
    access: 'anthology',
    playerStart: { x: 0, z: -420 },
    briefing: 'A liner is in two pieces that no longer point the same way. Fine vent scale is scattered with it. There is no second hull. File what the bodies support.',
    uncertainty: 'A heading that changes smoothly with age is a burn, not a single strike. Two pieces pointing apart only say the hull rotated; they do not say what forced it.',
    build(ctx) {
      const j = ctx.j;
      const split = balancedRadial(2, 7, 210, 0.4);
      const events = [
        { t: 3, kind: 'thrust_heading', id: 'liner', accel: 3.6, spin: 0.16, duration: 28, note: 'gimbal stuck; thrust walks around the center of mass' },
      ];
      for (let i = 0; i < 6; i += 1) {
        events.push({
          t: 5 + i * 4,
          kind: 'shed',
          from: 'liner',
          note: 'vent scale shed while the nozzle walked',
          child: {
            id: `vent_${i}`, variant: 'wc_vent', mass: 0.35, radius: 1.1,
            dvx: 0, dvz: 0, transponderGroup: 'vent',
          },
        });
      }
      events.push({
        t: 34, kind: 'split', id: 'liner', note: 'hull parted while the heading was still walking',
        children: [
          {
            id: 'liner_bow', variant: 'wc_liner', mass: split[0].mass, radius: 12,
            dvx: split[0].dvx, dvz: split[0].dvz, heading: 0.15, integrity: 0.32,
            transponderGroup: 'liner', flavor: 'Bow section.',
          },
          {
            id: 'liner_stern', variant: 'wc_nozzle', mass: split[1].mass, radius: 8,
            dvx: split[1].dvx, dvz: split[1].dvz, heading: 1.7, integrity: 0.36,
            transponderGroup: 'liner', flavor: 'Stern and the nozzle, still canted off the hull axis.',
          },
        ],
      });
      return {
        until: 58,
        assayPoints: [],
        bodies: [
          makeBody({
            id: 'liner', variant: 'wc_liner', mass: 520, radius: 20,
            x: -180 + j(), z: 20 + j(), vx: 7, vz: 1.5, heading: 0.15,
            transponderGroup: 'liner',
            flavor: 'No second contact. The liner is simply wrong-ended.',
          }),
        ],
        events,
      };
    },
    hypotheses: [
      hypo({
        id: 'stuck_gimbal',
        correct: true,
        statement: 'The nozzle walked. Vent headings change smoothly with age, which is a stuck burn, not a strike.',
        requires: [all(
          recon('heading_rate', { group: 'vent', field: 'r2', gt: 0.72, minBodies: 4 }),
          recon('heading_rate', { group: 'vent', field: 'span', gt: 0.45, minBodies: 4 }),
        )],
        consequence: consequence({
          payout: 860,
          payee: 'yard_failure',
          facts: [{ id: 'wc_engine_failure_ruling', value: 'gimbal' }],
          effects: [
            { kind: 'stamp', targetId: 'liner_stern', stamp: 'GIMBAL WALK' },
            { kind: 'stamp', targetId: 'liner_bow', stamp: 'NO SECOND HULL' },
          ],
          situation: 'The stern is filed as a gimbal failure. No phantom collider is entered in the lane record.',
        }),
      }),
      hypo({
        id: 'unseen_collider',
        wrong: true,
        statement: 'Something unseen struck the liner and spun it.',
        requires: [{ op: 'headingSplit', group: 'liner', gt: 0.5 }],
        falsifiedBy: [all(
          recon('heading_rate', { group: 'vent', field: 'r2', gt: 0.72, minBodies: 4 }),
          recon('heading_rate', { group: 'vent', field: 'span', gt: 0.45, minBodies: 4 }),
        )],
        consequence: consequence({
          payout: 220,
          payee: 'unknown_contact',
          facts: [{ id: 'wc_engine_failure_ruling', value: 'unseen' }],
          effects: [{ kind: 'stamp', targetId: 'liner_bow', stamp: 'UNKNOWN CONTACT' }],
          situation: 'The lane record gains an unknown contact. The liner is paid the minimum accident schedule. The vent scale is not fitted.',
        }),
      }),
      ancient('liner_bow'),
    ],
  },
  {
    id: 'wc_slingshot_disappearance',
    title: 'The Lane That Kept Going Straight',
    access: 'anthology',
    playerStart: { x: -200, z: -700 },
    briefing: 'A ship is missing off this lane. A small debris cluster sits on the straight line. A mass sits beside the lane, and fine vent scale is in the well. File what the bodies support.',
    uncertainty: 'The ship itself is not here. A gravity fit of the vent scale can show a turn; it cannot show who is aboard now. The decoy cluster is a real small charge. Its lie would be the claim that it is the ship.',
    build(ctx) {
      const j = ctx.j;
      const events = [];
      for (let i = 0; i < 6; i += 1) {
        events.push({
          t: 8 + i * 5,
          kind: 'shed',
          from: 'ship',
          note: 'vent scale shed on the coast through the well',
          child: {
            id: `vent_${i}`, variant: 'wc_vent', mass: 0.3, radius: 1,
            dvx: 0, dvz: 0, transponderGroup: 'vent', noCollide: true,
          },
        });
      }
      events.push({
        t: 6, kind: 'eject', from: 'ship', note: 'ballast dropped off the inbound leg',
        child: {
          id: 'ballast', variant: 'wc_ballast', mass: 70, radius: 8,
          dvx: 0, dvz: 16, thermalLock: 48, integrity: 0.9,
          flavor: 'Ballast, cold, still on a straighter path.',
        },
      });
      const decoy = balancedRadial(4, 6, 8, 0.5);
      events.push({
        t: 14, kind: 'split', id: 'decoy', note: 'small charge on the straight lane, not the ship',
        children: decoy.map((p, i) => ({
          id: `decoy_${i}`, variant: 'wc_decoy', mass: p.mass, radius: 3,
          dvx: p.dvx, dvz: p.dvz, integrity: 0.2, transponderGroup: 'decoy',
          thermalLock: 44,
          flavor: 'Cheap shard. It wants to be read as a ship.',
        })),
      });
      return {
        until: 80,
        assayPoints: [],
        gravityIds: ['mass'],
        bodies: [
          makeBody({
            id: 'mass', variant: 'wc_planetoid', mass: 8e8, radius: 90,
            x: 0, z: 0, fixed: true, mu: 1.35e6, thermalLock: 36, integrity: 1,
            flavor: 'An unlit mass. The lane\'s straight line does not bend for it. Ships sometimes do.',
          }),
          makeBody({
            id: 'ship', variant: 'wc_freighter', mass: 280, radius: 16,
            x: -1800, z: 700, vx: 70, vz: -4, heading: -0.05,
            departBeyond: 2000,
            flavor: 'The missing ship.',
          }),
          makeBody({
            id: 'decoy', variant: 'wc_decoy', mass: 32, radius: 6,
            x: -2600 + j(), z: 1100 + j(), vx: 1, vz: 0.2,
            transponderGroup: 'decoy', integrity: 0.4,
            flavor: 'A seeded cluster on the line a straight plot would follow.',
          }),
        ],
        events,
      };
    },
    hypotheses: [
      hypo({
        id: 'slingshot_exit',
        correct: true,
        statement: 'The vent scale fits a turn in the mass\'s gravity and does not fit a straight line. The ship left on that turn. The cluster on the lane is not the ship.',
        requires: [all(
          recon('point_mass', { group: 'vent', field: 'residual', lt: 180, minBodies: 4 }),
          recon('point_mass', { group: 'vent', field: 'ballisticResidual', gt: 200, minBodies: 4 }),
        )],
        consequence: consequence({
          payout: 2100,
          payee: 'lane_search_closed',
          facts: [{ id: 'wc_slingshot_disappearance_ruling', value: 'exit' }],
          effects: [
            { kind: 'stamp', targetId: 'decoy_0', stamp: 'NOT THE SHIP' },
            { kind: 'stamp', targetId: 'ballast', stamp: 'INBOUND LEG' },
          ],
          situation: 'The search on the straight lane is closed. The decoy is stamped as not the ship. The vent scale stays as the record of the turn. The ship is not recovered, because it is not here.',
        }),
      }),
      hypo({
        id: 'destroyed_on_lane',
        wrong: true,
        statement: 'The ship was destroyed on the lane. The cluster is the wreck.',
        requires: [{ op: 'count', group: 'decoy', damaged: true, gte: 3 }],
        falsifiedBy: [recon('point_mass', { group: 'vent', field: 'residual', lt: 180, minBodies: 4 })],
        consequence: consequence({
          payout: 520,
          payee: 'declared_loss',
          facts: [{ id: 'wc_slingshot_disappearance_ruling', value: 'destroyed' }],
          effects: [
            { kind: 'stamp', targetId: 'decoy_0', stamp: 'LANE CLOSED — LOSS' },
          ],
          situation: 'The lane is closed as a loss. The cluster is accepted as the ship. The mass and the vent scale are not fitted.',
        }),
      }),
      ancient('decoy_0'),
    ],
  },
  {
    id: 'wc_massline_snap',
    title: 'The Whip End',
    access: 'anthology',
    playerStart: { x: 260, z: 200 },
    briefing: 'A skiff is dead near a freighter. The freighter shows a scar. A rock sits between you and the far side of the skiff\'s line. File what the bodies support.',
    uncertainty: 'A full magazine means those guns did not fire; it does not say the freighter is innocent of everything. The cable is evidence only after you can see it. A tangent heading is a direction, not a confession.',
    build(ctx) {
      const j = ctx.j;
      // Tangent to the rock at the skiff's start: position (150, 24), radial angle atan2(24, 150).
      const radial = Math.atan2(24, 150);
      const tangent = radial + Math.PI / 2;
      const speed = 10;
      const whipMass = 70;
      return {
        until: 2.2,
        assayPoints: [],
        bodies: [
          makeBody({
            id: 'rock', variant: 'wc_rock', mass: 3200, radius: 34,
            x: 0, z: 0, vx: 0, vz: 0, occults: true, thermalLock: 40, integrity: 1,
            flavor: 'Rock. Something thin is easy to hide against it.',
          }),
          makeBody({
            id: 'skiff', variant: 'wc_skiff', mass: whipMass, radius: 9,
            x: 150 + j(), z: 24, vx: 0.4, vz: 0, heading: tangent, integrity: 1,
            flavor: 'The skiff is open to vacuum.',
          }),
          makeBody({
            id: 'pod', variant: 'wc_pod', mass: 220, radius: 8,
            x: -170, z: 16, vx: -0.4, vz: 0.2, heading: 0, integrity: 0.92,
            cargo: { declared: 'ore', actual: 'ore', sealed: true },
            flavor: 'Heavy pod. A grapple cup is seated in the rim.',
          }),
          makeBody({
            id: 'freighter', variant: 'wc_freighter', mass: 640, radius: 18,
            x: 30 + j(), z: 210, vx: 0.6, vz: 0.2, heading: -0.4,
            integrity: 0.7, magazine: { capacity: 8, remaining: 8 },
            scar: { nx: 0, nz: -1, material: 'soot', faces: [{ kind: 'soot', nx: 0, nz: -1 }] },
            flavor: 'Freighter scar. From here it reads as a shot.',
          }),
        ],
        events: [
          {
            t: 0.35,
            kind: 'impulse',
            id: 'skiff',
            jx: Math.cos(tangent) * speed * whipMass,
            jz: Math.sin(tangent) * speed * whipMass,
            breach: true,
            note: 'parted massline whipped the skiff tangent to the rock',
          },
          {
            t: 0.35,
            kind: 'shed',
            from: 'skiff',
            part: true,
            note: 'the necked end left with the whip',
            child: {
              id: 'cable', variant: 'wc_cable', mass: 4, radius: 4, dvx: 0, dvz: 0,
              integrity: 0.6, noCollide: true,
              flavor: 'Cable remnant. The end is necked, not cut.',
            },
          },
        ],
      };
    },
    hypotheses: [
      hypo({
        id: 'line_whip',
        correct: true,
        statement: 'The skiff\'s velocity is tangent to the rock, the freighter\'s magazine is full, and a cable lies on the rock\'s far side.',
        requires: [
          { op: 'tangent', target: 'skiff', gt: 0.72 },
          scan('freighter', 'magazine', 'unfired', { eq: true }),
          scan('cable', 'visual', 'variant', { eq: 'wc_cable' }),
        ],
        consequence: consequence({
          payout: 1360,
          payee: 'freighter_cleared',
          facts: [{ id: 'wc_massline_snap_ruling', value: 'whip' }],
          effects: [
            { kind: 'stamp', targetId: 'freighter', stamp: 'CLEARED — MAGAZINE FULL' },
            { kind: 'stamp', targetId: 'cable', stamp: 'WHIP END' },
          ],
          situation: 'The freighter is cleared. The cable is kept. The skiff stays where the whip left it.',
        }),
      }),
      hypo({
        id: 'freighter_fired',
        wrong: true,
        statement: 'The freighter shot the skiff.',
        requires: [
          scan('skiff', 'visual', 'dead', { eq: true }),
          scan('freighter', 'visual', 'damaged', { eq: true }),
        ],
        falsifiedBy: [scan('freighter', 'magazine', 'unfired', { eq: true })],
        consequence: consequence({
          payout: 610,
          payee: 'skiff_claim',
          heat: { factionId: 'concord', delta: 3 },
          facts: [{ id: 'wc_massline_snap_ruling', value: 'fired' }],
          effects: [
            { kind: 'stamp', targetId: 'freighter', stamp: 'WEAPONS FILE' },
            { kind: 'depart', targetId: 'freighter', heading: 0.6, seconds: 6 },
          ],
          situation: 'The freighter is filed for the shot and ordered away. The magazine is not counted. The far side of the rock is not walked.',
        }),
      }),
      ancient('freighter'),
    ],
  },
  {
    id: 'wc_clamp_shear',
    title: 'The Pylon Face',
    access: 'anthology',
    playerStart: { x: 420, z: 300 },
    briefing: 'A ship is clear of a station pylon. Both are damaged. The station says the pilot rammed the clamp. File what the bodies support.',
    uncertainty: 'Which face is torn decides the direction of the force. A coarse look only says "damaged." The station is too heavy for this tow.',
    build(ctx) {
      const j = ctx.j;
      return {
        until: 36,
        assayPoints: [],
        bodies: [
          makeBody({
            id: 'pylon', variant: 'wc_station', mass: 5e6, radius: 70,
            x: 0, z: 0, fixed: true, integrity: 0.74, heading: 0,
            flavor: 'Station loop: "the pilot drove into the clamp."',
          }),
          makeBody({
            id: 'ship', variant: 'wc_tug', mass: 380, radius: 14,
            x: 168 + j(), z: j() * 0.2, vx: 0, vz: 0, heading: 0,
            integrity: 0.48, fuel: 8, fuelCapacity: 20,
            flavor: 'The ship is off the pylon, nose outward.',
          }),
        ],
        events: [
          { t: 1, kind: 'tether', a: 'ship', b: 'pylon', rest: 'current', stiffness: 4000, breakForce: 4000, shearOnBreak: true, note: 'clamp held taut' },
          { t: 2, kind: 'thrust_heading', id: 'ship', accel: 7, spin: 0, duration: 18, note: 'ship thrust against the clamp until the line sheared' },
        ],
      };
    },
    hypotheses: [
      hypo({
        id: 'clamp_shear',
        correct: true,
        statement: 'The ship\'s torn face points back at the pylon, and the ship is moving away from it.',
        requires: [
          scan('ship', 'structure', 'facesStation', { eq: true }),
          scan('ship', 'trajectory', 'vx', { gt: 12 }),
        ],
        consequence: consequence({
          payout: 1420,
          payee: 'pilot_cleared',
          facts: [{ id: 'wc_clamp_shear_ruling', value: 'shear' }],
          effects: [
            { kind: 'stamp', targetId: 'ship', stamp: 'CLAMP SHEARED' },
            { kind: 'stamp', targetId: 'pylon', stamp: 'PYLON FAILURE' },
          ],
          situation: 'The pilot is cleared. The pylon is filed as the failure. The ship is not ordered back into the clamp.',
        }),
      }),
      hypo({
        id: 'pilot_rammed_pylon',
        wrong: true,
        statement: 'The pilot rammed the pylon.',
        requires: [
          scan('ship', 'visual', 'damaged', { eq: true }),
          scan('pylon', 'visual', 'damaged', { eq: true }),
        ],
        falsifiedBy: [scan('ship', 'structure', 'facesStation', { eq: true })],
        consequence: consequence({
          payout: 460,
          payee: 'station_bond',
          heat: { factionId: 'concord', delta: 2 },
          facts: [{ id: 'wc_clamp_shear_ruling', value: 'ram' }],
          effects: [
            { kind: 'stamp', targetId: 'ship', stamp: 'RAMMING FILE' },
            { kind: 'depart', targetId: 'ship', heading: 0, seconds: 4 },
          ],
          situation: 'The station\'s bond is paid. The ship is filed for ramming and sent on. The face of the tear is not read.',
        }),
      }),
      ancient('ship'),
    ],
  },
  {
    id: 'wc_cookoff_chain',
    title: 'The Spaced Cooks',
    access: 'anthology',
    playerStart: { x: 80, z: -180 },
    briefing: 'Four pods and an escort. The escort is scorched. The escort\'s office says a missile rake set the pods off. File what the bodies support.',
    uncertainty: 'Cook times are thermal ages, not a weapon log. A gap of seconds along a line is deflagration; a rake would be one instant. A spectro burn on a volatile pod cooks it and removes it from the line.',
    build(ctx) {
      const j = ctx.j;
      const bodies = [
        makeBody({
          id: 'magazine', variant: 'wc_train', mass: 420, radius: 14,
          x: -40, z: 0, vx: 1.2, vz: 0, heading: 0, integrity: 1,
          flavor: 'The train that was still whole when the first pod cooked.',
        }),
        makeBody({
          id: 'escort', variant: 'wc_escort', mass: 210, radius: 11,
          x: 70 + j(), z: 86, vx: 1.2, vz: 0.4, heading: -0.3,
          integrity: 0.6, magazine: { capacity: 10, remaining: 10 },
          scar: { nx: 0, nz: -1, material: 'soot', faces: [{ kind: 'soot', nx: 0, nz: -1 }] },
          flavor: 'Escort: "incoming rake." The voice is steady for a ship under fire.',
        }),
      ];
      const events = [];
      for (let i = 0; i < 4; i += 1) {
        events.push({
          t: 12 + i * 1.7,
          kind: 'shed',
          from: 'magazine',
          note: 'pod cooked off the train',
          child: {
            id: `pod_${i}`, variant: 'wc_pod', mass: 36, radius: 6,
            ox: 30 + i * 48, oz: (i % 2 === 0 ? -4 : 4) + j() * 0.15,
            dvx: 0, dvz: 0, integrity: 0.4, noCollide: true,
            volatile: true, fragile: true, transponderGroup: 'train',
            flavor: 'Pod in the train. The seals are heat-stained.',
          },
        });
      }
      events.push({ t: 18, kind: 'depart', id: 'magazine', note: 'the empty spine left the lane' });
      return { until: 48, assayPoints: [], bodies, events };
    },
    hypotheses: [
      hypo({
        id: 'sympathetic_cookoff',
        correct: true,
        statement: 'The pods cooked in order down the train, seconds apart. That is a deflagration, not a rake.',
        requires: [all(
          recon('deflagration', { group: 'train', field: 'monotonic', eq: true, minBodies: 4 }),
          recon('deflagration', { group: 'train', field: 'medianGap', gt: 0.6, minBodies: 4 }),
        )],
        consequence: consequence({
          payout: 1010,
          payee: 'cargo_underwriter',
          facts: [{ id: 'wc_cookoff_chain_ruling', value: 'cookoff' }],
          effects: [
            { kind: 'stamp', targetId: 'escort', stamp: 'CLEARED — GUNS COLD' },
            { kind: 'stamp', targetId: 'pod_0', stamp: 'COOKOFF TRAIN' },
          ],
          situation: 'The escort is cleared. The train is filed as a cookoff. The pods stay in the order they cooked.',
        }),
      }),
      hypo({
        id: 'escort_missile_rake',
        wrong: true,
        statement: 'The escort raked the pods.',
        requires: [
          scan('escort', 'visual', 'damaged', { eq: true }),
          scan('pod_0', 'visual', 'damaged', { eq: true }),
        ],
        falsifiedBy: [
          all(
            recon('deflagration', { group: 'train', field: 'monotonic', eq: true, minBodies: 4 }),
            recon('deflagration', { group: 'train', field: 'medianGap', gt: 0.6, minBodies: 4 }),
          ),
          scan('escort', 'magazine', 'unfired', { eq: true }),
        ],
        consequence: consequence({
          payout: 540,
          payee: 'escort_bond',
          heat: { factionId: 'concord', delta: 2 },
          facts: [{ id: 'wc_cookoff_chain_ruling', value: 'rake' }],
          effects: [
            { kind: 'stamp', targetId: 'escort', stamp: 'RAKE FILE' },
            { kind: 'depart', targetId: 'escort', heading: 1.4, seconds: 5 },
          ],
          situation: 'The escort\'s bond is called and the escort is ordered off. The pods\' ages are not taken.',
        }),
      }),
      ancient('pod_0'),
    ],
  },
  {
    id: 'wc_ricochet_blame',
    title: 'The Plate in the Middle',
    access: 'anthology',
    playerStart: { x: 360, z: 40 },
    briefing: 'A hauler is dead. A gunship with turrets is in the same volume, and an ore plate hangs between the lines. File what the bodies support.',
    uncertainty: 'A gun that fired is not the gun that killed, until the fragment\'s path is reflected off the plate. Direct back-projection ignores the plate and will point at the wrong place.',
    build(ctx) {
      const j = ctx.j;
      // Outgoing from the plate along (180, 220). Incoming is the reflection of that
      // direction through the plate normal (+X). Shooter sits up-range of the incoming leg
      // and drifts slowly so a straight back-projection of the fragment misses it.
      const ox = 180;
      const oz = 220;
      const olen = Math.hypot(ox, oz);
      const speed = 14;
      const ovx = (ox / olen) * speed;
      const ovz = (oz / olen) * speed;
      const flight = olen / speed;
      const nnx = 1;
      const nnz = 0;
      const dot = ovx * nnx + ovz * nnz;
      const ivx = ovx - 2 * dot * nnx;
      const ivz = ovz - 2 * dot * nnz;
      const il = Math.hypot(ivx, ivz) || 1;
      const range = 340;
      // Shooter at fire time, up-range (opposite incoming travel).
      const sx0 = -(ivx / il) * range;
      const sz0 = -(ivz / il) * range;
      const svx = 1.1;
      const svz = -0.4;
      return {
        until: 30 + flight,
        assayPoints: [],
        bodies: [
          makeBody({
            id: 'plate', variant: 'wc_plate', mass: 9000, radius: 22,
            x: 0, z: 0, fixed: true, integrity: 1, thermalLock: 42,
            flavor: 'Dense ore plate.',
          }),
          makeBody({
            id: 'round', variant: 'wc_round', mass: 2.4, radius: 1.2,
            x: -ivx * flight, z: -ivz * flight, vx: ivx, vz: ivz, heading: Math.atan2(ivz, ivx),
            noCollide: true,
            flavor: 'The fragment that finished the hauler.',
          }),
          makeBody({
            id: 'hauler', variant: 'wc_hauler', mass: 760, radius: 18,
            x: ox + (-220 / olen) * 90 - 0.3 * flight, z: oz + (180 / olen) * 90 - 0.05 * flight,
            vx: 0.3, vz: 0.05, heading: 2,
            integrity: 0.1,
            flavor: 'Hauler, open along one flank.',
          }),
          makeBody({
            id: 'gun_a', variant: 'wc_gunship', mass: 140, radius: 11,
            x: sx0, z: sz0, vx: svx, vz: svz,
            heading: Math.atan2(ivz, ivx), integrity: 0.9, turrets: true,
            magazine: { capacity: 8, remaining: 6 },
            flavor: 'Gunship. The turrets are the first thing a glance finds.',
          }),
          makeBody({
            id: 'gun_b', variant: 'wc_gunship', mass: 150, radius: 11,
            x: -280 + j() + 2 * flight, z: 260 + j() - 3 * flight, vx: -2, vz: 3, heading: 2.2, integrity: 0.88, turrets: true,
            magazine: { capacity: 8, remaining: 7 },
            flavor: 'The other gunship, pointed nowhere near the hauler.',
          }),
        ],
        events: [
          { t: flight, kind: 'reflect', id: 'round', plate: 'plate', nx: nnx, nz: nnz, note: 'the round struck the plate and left on the reflected line' },
        ],
      };
    },
    hypotheses: [
      hypo({
        id: 'ricochet_off_plate',
        correct: true,
        statement: 'The fragment\'s path reflects off the plate onto the gunship. The straight line from the fragment to that gunship is the long way around.',
        requires: [all(
          recon('mirror', { field: 'mirrorMiss', lt: 36 }),
          recon('mirror', { field: 'directMiss', gt: 80 }),
        )],
        consequence: consequence({
          payout: 1740,
          payee: 'hauler_kin',
          facts: [{ id: 'wc_ricochet_blame_ruling', value: 'ricochet' }],
          effects: [
            { kind: 'stamp', targetId: 'plate', stamp: 'RICOCHET FACE' },
            { kind: 'stamp', targetId: 'gun_a', stamp: 'FIRE RICOCHETED' },
            { kind: 'stamp', targetId: 'gun_b', stamp: 'NOT THE LINE' },
          ],
          situation: 'Both gunships stay. The plate is the record. The killing line is the reflected one, and the file says so.',
        }),
      }),
      hypo({
        id: 'direct_shot',
        wrong: true,
        statement: 'The turreted gunship shot the hauler directly.',
        requires: [
          scan('hauler', 'visual', 'damaged', { eq: true }),
          scan('gun_a', 'visual', 'turrets', { eq: true }),
        ],
        falsifiedBy: [all(
          recon('mirror', { field: 'mirrorMiss', lt: 36 }),
          recon('mirror', { field: 'directMiss', gt: 80 }),
        )],
        consequence: consequence({
          payout: 670,
          payee: 'direct_fire_bond',
          heat: { factionId: 'concord', delta: 3 },
          facts: [{ id: 'wc_ricochet_blame_ruling', value: 'direct' }],
          effects: [
            { kind: 'stamp', targetId: 'gun_a', stamp: 'DIRECT FIRE' },
            { kind: 'depart', targetId: 'gun_a', heading: -0.6, seconds: 5 },
          ],
          situation: 'The turreted gunship is filed for a direct shot and ordered away. The plate is scenery. The other gunship is not in the file.',
        }),
      }),
      ancient('hauler'),
    ],
  },
];

export const WRECK_COURT_CASE_IDS = Object.freeze(WRECK_COURT_CASES.map((c) => c.id));
export const WRECK_COURT_ENTRY_CASE = ENTRY_CASE;

export function caseDef(caseId) {
  return WRECK_COURT_CASES.find((c) => c.id === caseId) || null;
}

export function materializeCase(caseId, seed) {
  const def = caseDef(caseId);
  if (!def) throw new Error(`unknown wreck court case ${caseId}`);
  const numericSeed = (seed >>> 0) || 1;
  const j = jitterSource(numericSeed, def.id);
  const spec = def.build({ seed: numericSeed, j });
  const sim = runIncident({
    bodies: spec.bodies,
    events: spec.events || [],
    until: spec.until,
    assayPoints: spec.assayPoints || [],
    gravityIds: spec.gravityIds || [],
  });
  for (const body of sim.bodies) {
    if (!Number.isFinite(body.x) || !Number.isFinite(body.z) || !Number.isFinite(body.vx) || !Number.isFinite(body.vz)) {
      throw new Error(`non-finite body ${body.id} in ${caseId}`);
    }
  }
  const correct = def.hypotheses.find((h) => h.correct);
  const wrong = def.hypotheses.find((h) => h.wrong);
  return {
    caseId: def.id,
    seed: numericSeed,
    title: def.title,
    access: def.access,
    briefing: def.briefing,
    uncertainty: def.uncertainty,
    playerStart: { ...def.playerStart },
    presentTime: sim.until,
    assayPoints: sim.assayPoints.map((p) => ({ ...p })),
    bodies: sim.bodies,
    hypotheses: def.hypotheses,
    truth: {
      cause: correct ? correct.id : null,
      plausibleWrong: wrong ? wrong.id : null,
      uncertainty: def.uncertainty,
      events: sim.events,
      presentTime: sim.until,
    },
  };
}
