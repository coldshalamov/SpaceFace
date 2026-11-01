import { IRON_KRAKEN_PROFILES } from '../../ironKraken.js';
import { freezeDeep, hullActor, sector, lane, packet, beat, score,
  THROW_WINDOW, SUBSYSTEM_ROLES } from './shared.js';

function makeIronKraken(p) {
  const colossus = p.variant === 'colossus';
  const recovery = colossus ? 180 : 150;
  const r = p.coreRadius, reach = p.armReach;
  return freezeDeep({
    id: p.scoreId,
    shape: { situation: 'set_piece', place: 'arena_ring', twist: 'named', actor: p.enemyId },
    placeName: 'Kraken salvage lane',
    twist: 'A salvage machine with eight arms and no concept of personal space. Its mantle opens when it vents.',
    subsystemRoles: SUBSYSTEM_ROLES,
    actors: [hullActor({ label: p.name.toUpperCase(), archetype: p.enemyId, hull: p.hull,
      mass: p.mass, radius: r, speed: p.maxSpeed, doctrine: 'capital_broadside' })],
    // These are attachment records until torn or shed. Only then does the existing capital
    // part owner create a loose slab; no internal geometry or extra live rigid body is paid for.
    plates: [
      { id: 'mantle_port', label: 'port mantle petal', anchor: { x: 0.25, z: -0.72 },
        radius: r * 0.36, mass: p.mass * 0.08, holdTension: 0.65,
        covers: 'subsystem_drive', shedOnAct: 0 },
      { id: 'mantle_starboard', label: 'starboard mantle petal', anchor: { x: 0.25, z: 0.72 },
        radius: r * 0.36, mass: p.mass * 0.08, holdTension: 0.75,
        covers: 'subsystem_weapon', shedOnAct: 1 },
    ],
    score: score({
      name: p.name.toUpperCase(), missionDefinitionId: 'capital_boss', identity: 'eight_arms_one_temper',
      introTicks: 120, transitionTicks: 60, resumeTicks: 120,
      // The character swims between committed attacks. The score owns this velocity intent;
      // the normal tactical/physics path supplies the force, steering and collision response.
      transitMotion: { kind: 'kraken_reposition', preferredRange: reach * 0.86,
        approachSpeed: colossus ? 42 : 52, orbitSpeed: colossus ? 14 : 20,
        recoveryHoldTicks: 60, settleTicks: 30 },
      rangeResponse: { minRange: reach * 1.8, beatId: 'siphon_jet' },
      intro: 'IRON KRAKEN: Salvage claim accepted. Please stop being attached to your ship.',
      lesson: 'Arms spread: leave the flanks. Arms gather: cross the locked jet. Front core opens: shoot the red aperture.',
      lossLesson: 'Leave the painted shape after it locks. The open front core is the next clean shot.',
      victory: 'IRON KRAKEN: Customer disassembly… cancelled.',
      escape: 'IRON KRAKEN: Your salvage appointment remains outstanding.',
      budget: { referenceEffectiveDps: 96 / 12.25,
        gunOnlySeconds: colossus ? [65, 95] : [22, 38], mixedArmsSeconds: colossus ? [40, 65] : [15, 28],
        targetWinnerHullFraction: [0.3, 0.7], intendedMaxSingleMistake: colossus ? 30 : 24,
        note: 'One recurring character per eligible ordinary round; fixed hull, no wing adds, no arm rigid bodies.' },
      arena: { radius: colossus ? 650 : 450, entryBearing: 0, ballastOffsets: [],
        exitHint: 'Prow and stern gaps stay open in the rake and ink ring. The jet locks before it fires.' },
      wings: [],
      acts: [
        { id: 'claim', title: 'I · SALVAGE CLAIM', enter: { hullAtMost: 1.01 },
          bark: 'IRON KRAKEN: All eight manipulators are certified for customer service.',
          doctrine: 'capital_broadside', opening: ['arm_rake'], pattern: ['siphon_jet', 'arm_rake', 'ink_ring'],
          physicalStory: 'Flank arms spread, gather for a committed jet, then open the mantle to vent.' },
        { id: 'disassembly', title: 'II · EXPRESS DISASSEMBLY', enter: { hullAtMost: 0.6 },
          bark: 'IRON KRAKEN: You have selected express disassembly.',
          doctrine: 'capital_broadside', opening: ['ink_ring'], pattern: ['arm_rake', 'siphon_jet', 'ink_ring'],
          physicalStory: 'A broken ink ring makes approach lanes visible; the same tells and recovery remain fair.' },
        { id: 'complaint', title: 'III · COMPLAINT DEPARTMENT', enter: { hullAtMost: 0.28 },
          bark: 'IRON KRAKEN: Please direct all complaints into the glowing aperture.',
          doctrine: 'capital_broadside', opening: ['siphon_jet'], pattern: ['ink_ring', 'siphon_jet', 'arm_rake'],
          physicalStory: 'The last jets still commit and vent. Damage does not secretly shorten the warning.' },
      ],
      beats: [
        beat({ id: 'arm_rake', title: 'EIGHT-ARM RAKE', cue: 'maw.crossing',
          trackTicks: 18, tellTicks: 114, activeTicks: 30, recoverTicks: recovery,
          motion: { forward: 0, brake: true },
          shapes: [sector(Math.PI / 2, 0.83, r * 0.82, reach, 'target'),
            sector(-Math.PI / 2, 0.83, r * 0.82, reach, 'target')],
          packet: packet({ kinetic: colossus ? 22 : 16 }), expose: THROW_WINDOW,
          counter: 'The arms rake both flanks. Move through the clear nose or tail gap, then shoot the open red core.' }),
        beat({ id: 'siphon_jet', title: 'SIPHON JET BURST', cue: 'maw.keel', requires: ['drive'],
          trackTicks: 24, tellTicks: colossus ? 150 : 126, activeTicks: 60,
          recoverTicks: recovery + 36, motion: { forward: 1, brake: false },
          shapes: [lane(0, 0, p.jetLength, r * 2, 0, 'target')],
          packet: packet({ kinetic: colossus ? 30 : 24 }), expose: THROW_WINDOW,
          counter: 'Its arms gather, then a pressure jet fills the locked lane as it lunges. Strafe clear; punish the open front core after the burst.' }),
        beat({ id: 'ink_ring', title: 'BROKEN INK RING', cue: 'maw.stern',
          trackTicks: 0, tellTicks: 120, activeTicks: 36, recoverTicks: recovery,
          motion: { forward: 0, brake: true },
          shapes: [sector(Math.PI / 2, 1.03, reach * 1.15, reach * 1.8, 'target'),
            sector(-Math.PI / 2, 1.03, reach * 1.15, reach * 1.8, 'target')],
          packet: packet({ ion: colossus ? 18 : 12 }), expose: THROW_WINDOW,
          counter: 'The ink field is a broken ring. Stay inside it, outside it, or cross a clear prow/tail gap; the view stays clear.' }),
      ],
    }),
  });
}

export const IRON_KRAKEN_HEAVY = makeIronKraken(IRON_KRAKEN_PROFILES.heavy);
export const IRON_KRAKEN_COLOSSUS = makeIronKraken(IRON_KRAKEN_PROFILES.colossus);
