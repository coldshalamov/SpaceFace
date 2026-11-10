// Eight dock compositions. Pose and oracles are lab fields. Encounter, weapon,
// module, and place records use only keys the shipped loaders accept.

import { clone, emptyProject } from './scene.mjs';

const HEADING_Z = 1.570796;
const THRUST = { moveX: 0, moveZ: 1, turnIntent: 0, boost: false, fire: false };
const COAST = { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, fire: false };

function project(meta, fill) {
  const next = emptyProject(meta);
  Object.assign(next, fill);
  next.world = { ...emptyProject().world, ...(meta.world || {}), ...(fill.world || {}) };
  next.notes = { ...next.notes, ...(meta.notes || {}) };
  return next;
}

function actor(fields) {
  return {
    kind: 'actor',
    persistent: true,
    angularVelocity: 0,
    velX: 0,
    velZ: 0,
    heading: 0,
    ...fields,
  };
}

function player(extra = {}) {
  return actor({
    id: 'player',
    role: 'player',
    profile: 'ship.starter',
    x: 0,
    z: 0,
    heading: HEADING_Z,
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    label: 'Hitch',
    ...extra,
  });
}

function alive(id = 'alive') {
  return {
    id,
    kind: 'trigger',
    shape: 'circle',
    x: 0,
    z: 0,
    radius: 12,
    labOnly: true,
    label: 'player stays alive',
    assertion: { kind: 'holds', signal: 'playerAlive', holdsTicks: 60 },
  };
}

function encounter(fields) {
  return {
    pressureCost: 12,
    cooldownS: 480,
    proximity: true,
    weight: 1,
    ...fields,
  };
}

function interceptCargo() {
  return project({
    id: 'dock.intercept-cargo',
    title: 'Moving cargo interception',
    composition: 'moving-cargo-interception',
    seed: 11001,
    ticks: 180,
    description: 'A cargo body crosses ahead of the Hitch. Thrust along +Z and the lab oracle is the player crossing that line.',
    notes: {
      composition: 'moving-cargo-interception',
      expectedObservation: 'Player thrust makes playerZ greater than 0.5 while the cargo actor keeps its authored crossing velocity.',
    },
  }, {
    frames: [{ tick: 0, input: { ...THRUST } }],
    objects: [
      player(),
      actor({
        id: 'cargo',
        role: 'cargo',
        profile: 'asteroid.light',
        x: 30,
        z: 50,
        velX: 16,
        velZ: -4,
        team: 2,
        label: 'crossing cargo',
      }),
      {
        id: 'cross',
        kind: 'trigger',
        shape: 'circle',
        x: 0,
        z: 40,
        radius: 16,
        labOnly: true,
        label: 'playerZ line',
        assertion: { kind: 'eventByTick', signal: 'playerZ', op: '>', value: 0.5, byTick: 179 },
      },
      {
        id: 'final_z',
        kind: 'objective',
        x: -40,
        z: 40,
        metric: 'trace.final',
        signal: 'playerZ',
        op: '>',
        value: 0.5,
        labOnly: true,
        label: 'final playerZ',
      },
      {
        id: 'speed',
        kind: 'objective',
        x: -70,
        z: -10,
        metric: 'flight.finalSpeed',
        op: '>=',
        value: 0.5,
        labOnly: true,
        label: 'still moving',
      },
      { ...alive(), x: -70, z: -30 },
      { id: 'to_cargo', kind: 'route', from: 'player', to: 'cargo', label: 'intercept', gameplay: false },
    ],
    encounter: encounter({
      id: 'dock_intercept_cargo',
      order: 1001,
      tier: 'minor',
      deck: 'combat',
      zoneTypes: ['trade_lane'],
      script: 'convoy',
      shape: { situation: 'convoy', place: ['trade_lane'], twist: 'none', actor: 'mule_trader' },
      factionId: 'faction_mts',
      context: 'encounter',
      squad: { archetypes: ['mule_trader'] },
      title: 'Crossing cargo',
    }),
  });
}

function brakeHulk() {
  return project({
    id: 'dock.brake-hulk',
    title: 'Braking a drifting hulk',
    composition: 'braking-drifting-hulk',
    seed: 11002,
    ticks: 180,
    description: 'The Hitch is latched to a heavy drifting mass and the throttle is closed. The lab oracle is the live tether plus the speed trace.',
    notes: {
      composition: 'braking-drifting-hulk',
      expectedObservation: 'attachmentActive holds while the player speed trace stays finite. Initial velocity is on the player; the hulk is the tether target.',
    },
    world: { fixtureProfile: 'massline' },
  }, {
    frames: [{ tick: 0, input: { ...COAST } }],
    objects: [
      player({ velZ: 36, label: 'Hitch on a latch' }),
      actor({
        id: 'hulk',
        role: 'hulk',
        profile: 'asteroid.heavy',
        x: 80,
        z: 0,
        velX: 6,
        team: 2,
        overrides: { mass: 4000, radius: 12 },
        label: 'drifting hulk',
      }),
      {
        id: 'tow',
        kind: 'attachment',
        defId: 'tether_standard',
        ownerAlias: 'player',
        targetAlias: 'hulk',
        label: 'tow',
      },
      {
        id: 'latch',
        kind: 'trigger',
        shape: 'circle',
        x: 80,
        z: 36,
        radius: 12,
        labOnly: true,
        label: 'tether stays active',
        assertion: { kind: 'holds', signal: 'attachmentActive', holdsTicks: 30 },
      },
      {
        id: 'peak_speed',
        kind: 'objective',
        x: -90,
        z: 20,
        metric: 'trace.max',
        signal: 'player.speed',
        op: '>=',
        value: 5,
        labOnly: true,
        label: 'opened with speed',
      },
      {
        id: 'end_speed',
        kind: 'objective',
        x: -90,
        z: 0,
        metric: 'flight.finalSpeed',
        op: '<=',
        value: 80,
        labOnly: true,
        label: 'speed stayed bounded',
      },
      { ...alive('alive_hulk'), x: -90, z: -20 },
      { id: 'to_hulk', kind: 'route', from: 'player', to: 'hulk', label: 'brake the tow', gameplay: false },
    ],
    encounter: encounter({
      id: 'dock_brake_hulk',
      order: 1002,
      tier: 'minor',
      deck: 'civilian',
      zoneTypes: ['derelict_field'],
      script: 'salvageSignal',
      shape: { situation: 'salvage', place: ['derelict_field'], twist: 'none', actor: 'none' },
      factionId: 'faction_free',
      context: 'encounter',
      squad: { archetypes: ['wasp_swarmer'] },
      title: 'Drifting hulk',
    }),
  });
}

function bankShot() {
  return project({
    id: 'dock.bank-shot',
    title: 'Field-assisted bank shot',
    composition: 'field-assisted-bank-shot',
    seed: 11003,
    ticks: 180,
    description: 'Thrust and a turn past a stone body, with the shipped Bank Shot module in the utility slot. The coloured disc exports as a place, not as a force the lab does not have. The pack weapon is validated by the user-content loader and is not mounted in this lab fit.',
    notes: {
      composition: 'field-assisted-bank-shot',
      expectedObservation: 'Under turnIntent 0.45 and thrust, playerRot ends below -0.5. The stone is a collider. No force-field object is written.',
    },
  }, {
    frames: [{
      tick: 0,
      input: { moveX: 0, moveZ: 1, turnIntent: 0.45, boost: false, fire: true, aimAngle: 0.4 },
    }],
    objects: [
      player({
        heading: 0,
        label: 'Hitch banking',
        loadout: ['wpn_pulse_laser_s', 'mod_engine_ion_m', 'mod_shield_booster_s', 'mod_bank_shot'],
      }),
      actor({
        id: 'stone',
        role: 'bank',
        profile: 'asteroid.mid',
        x: 40,
        z: 30,
        team: 2,
        overrides: { radius: 8, mass: 800 },
        label: 'bank stone',
      }),
      {
        id: 'bank_zone',
        kind: 'field',
        fieldKind: 'place',
        gameplay: true,
        x: 40,
        z: 30,
        radius: 80,
        label: 'place export, not a sim force',
        note: 'User-content place. The lab has no force-field object. The stone actor is the physical bank.',
        place: {
          sectorId: 'sector_helios_prime',
          id: 'zone_dock_bank_corridor',
          name: 'Bank Corridor',
          type: 'mining_belt',
          factionId: 'faction_scn',
          reason: 'A sanctioned stone lane where a shot can bank off the claim rocks.',
          center: { x: 40, z: 30 },
          radius: 80,
          threat: 1,
        },
      },
      {
        id: 'turned',
        kind: 'objective',
        x: -90,
        z: -10,
        metric: 'trace.final',
        signal: 'playerRot',
        op: '<',
        value: -0.5,
        labOnly: true,
        label: 'heading fell through the bank',
      },
      {
        id: 'along_x',
        kind: 'trigger',
        shape: 'circle',
        x: 70,
        z: -20,
        radius: 18,
        labOnly: true,
        label: 'moved off the start',
        assertion: { kind: 'eventByTick', signal: 'playerX', op: '>', value: 0.5, byTick: 179 },
      },
      {
        id: 'speed',
        kind: 'objective',
        x: -90,
        z: -30,
        metric: 'flight.finalSpeed',
        op: '>=',
        value: 0.5,
        labOnly: true,
        label: 'still moving',
      },
      { ...alive('alive_bank'), x: -90, z: 10 },
      { id: 'to_stone', kind: 'route', from: 'player', to: 'stone', label: 'bank line', gameplay: false },
    ],
    weapon: {
      id: 'wpn_dock_bank_needle',
      name: 'Bank Needle',
      slotType: 'weapon',
      size: 'S',
      tier: 1,
      mass: 2,
      price: 0,
      dmg: 6,
      rof: 4,
      damageType: 'kinetic',
      energyCost: 2,
      projSpeed: 340,
      range: 220,
      tracking: 'fixed',
      sentence: 'A short kinetic bolt meant to kiss stone and leave on a new line.',
      attackTraits: ['mod_bank_shot'],
      purchasable: false,
    },
    encounter: encounter({
      id: 'dock_bank_shot',
      order: 1003,
      tier: 'minor',
      deck: 'combat',
      zoneTypes: ['mining_belt'],
      script: 'ambush',
      shape: { situation: 'ambush', place: ['mining_belt'], twist: 'none', actor: 'field_anchor_controller' },
      factionId: 'faction_reach',
      context: 'encounter',
      squad: { archetypes: ['field_anchor_controller'] },
      title: 'Bank corridor',
    }),
  });
}

function legalRelease() {
  return project({
    id: 'dock.legal-release',
    title: 'Legal cargo release',
    composition: 'legal-cargo-release',
    seed: 11004,
    ticks: 180,
    description: 'Fly the pod to the release gate without firing. Credits stay at the authored stake. The pack includes a utility module the loader can accept.',
    notes: {
      composition: 'legal-cargo-release',
      expectedObservation: 'credits stay 5000, the gun is not commanded, and playerZ advances toward the gate.',
    },
  }, {
    frames: [{ tick: 0, input: { ...THRUST } }],
    objects: [
      player({ label: 'Hitch on a legal run' }),
      actor({
        id: 'pod',
        role: 'pod',
        profile: 'asteroid.light',
        x: 0,
        z: 50,
        velZ: 2,
        team: 2,
        overrides: { mass: 40, radius: 4 },
        label: 'released pod',
      }),
      {
        id: 'gate',
        kind: 'trigger',
        shape: 'circle',
        x: 0,
        z: 40,
        radius: 18,
        labOnly: true,
        label: 'release gate',
        assertion: { kind: 'eventByTick', signal: 'playerZ', op: '>', value: 0.5, byTick: 179 },
      },
      {
        id: 'credits',
        kind: 'objective',
        x: -90,
        z: 20,
        metric: 'trace.final',
        signal: 'credits',
        op: '==',
        value: 5000,
        labOnly: true,
        label: 'credits unchanged',
      },
      { ...alive('alive_release'), x: -90, z: -10 },
      { id: 'to_gate', kind: 'route', from: 'player', to: 'pod', label: 'legal release', gameplay: false },
    ],
    module: {
      id: 'mod_dock_lane_note',
      name: 'Lane Note',
      slotType: 'utility',
      size: 'S',
      tier: 1,
      mass: 1,
      price: 0,
      sentence: 'Marks a legal release lane. It does not change thrust, hull, or heat.',
      purchasable: false,
    },
    encounter: encounter({
      id: 'dock_legal_release',
      order: 1004,
      tier: 'ambient',
      deck: 'civilian',
      zoneTypes: ['trade_lane'],
      script: 'traderRun',
      noCombat: true,
      shape: { situation: 'trade', place: ['trade_lane'], twist: 'none', actor: 'mule_trader' },
      factionId: 'faction_mts',
      context: 'encounter',
      squad: { archetypes: ['mule_trader'] },
      title: 'Legal release',
    }),
  });
}

function collisionChain() {
  return project({
    id: 'dock.collision-chain',
    title: 'Collision chain',
    composition: 'collision-chain',
    seed: 11005,
    ticks: 180,
    description: 'The Hitch coasts on an authored velocity into three light masses grouped as one chain.',
    notes: {
      composition: 'collision-chain',
      expectedObservation: 'playerX advances from the authored +X velocity toward the grouped rocks. The group id is editor-only.',
    },
  }, {
    frames: [{ tick: 0, input: { ...COAST } }],
    objects: [
      player({ heading: 0, velX: 30, label: 'Hitch coasting' }),
      actor({
        id: 'rock_a', role: 'debris', profile: 'asteroid.light', x: 40, z: 0, team: 2, groupId: 'chain',
        overrides: { mass: 80, radius: 5 }, label: 'chain 1',
      }),
      actor({
        id: 'rock_b', role: 'debris', profile: 'asteroid.light', x: 60, z: 0, team: 2, groupId: 'chain',
        overrides: { mass: 80, radius: 5 }, label: 'chain 2',
      }),
      actor({
        id: 'rock_c', role: 'debris', profile: 'asteroid.light', x: 80, z: 0, team: 2, groupId: 'chain',
        overrides: { mass: 80, radius: 5 }, label: 'chain 3',
      }),
      {
        id: 'moved',
        kind: 'objective',
        x: 40,
        z: -30,
        metric: 'trace.final',
        signal: 'playerX',
        op: '>',
        value: 1,
        labOnly: true,
        label: 'coasted toward the chain',
      },
      { ...alive('alive_chain'), x: -90, z: -10 },
      { id: 'to_chain', kind: 'route', from: 'player', to: 'rock_a', label: 'into the chain', gameplay: false },
    ],
    encounter: encounter({
      id: 'dock_collision_chain',
      order: 1005,
      tier: 'minor',
      deck: 'combat',
      zoneTypes: ['derelict_field'],
      script: 'ambush',
      shape: { situation: 'wreck', place: ['derelict_field'], twist: 'none', actor: 'reaver_pirate' },
      factionId: 'faction_reach',
      context: 'encounter',
      squad: { archetypes: ['reaver_pirate'] },
      title: 'Collision chain',
    }),
  });
}

function dangerousCrossing() {
  return project({
    id: 'dock.dangerous-crossing',
    title: 'Dangerous crossing',
    composition: 'dangerous-crossing',
    seed: 11006,
    ticks: 180,
    description: 'Hold south of a fast sweeper, then thrust across its line. The sweeper velocity is authored on that body. The oracle is the player trace: stay south, then finish north.',
    notes: {
      composition: 'dangerous-crossing',
      expectedObservation: 'playerZ minimum stays on the south side of the lane, then the final sample is north of 0 after the delayed thrust.',
    },
  }, {
    frames: [
      { tick: 0, input: { ...COAST } },
      { tick: 70, input: { ...THRUST } },
    ],
    objects: [
      player({ z: -20, label: 'Hitch waiting' }),
      actor({
        id: 'sweeper',
        role: 'hazard',
        profile: 'asteroid.mid',
        x: -30,
        z: 0,
        velX: 22,
        team: 2,
        overrides: { mass: 500, radius: 7 },
        label: 'lane sweeper',
      }),
      {
        id: 'lane',
        kind: 'trigger',
        shape: 'circle',
        x: -90,
        z: 0,
        radius: 20,
        labOnly: true,
        label: 'player stays alive through the cross',
        assertion: { kind: 'holds', signal: 'playerAlive', holdsTicks: 60 },
      },
      {
        id: 'south',
        kind: 'objective',
        x: -40,
        z: -20,
        metric: 'trace.min',
        signal: 'playerZ',
        op: '<=',
        value: -5,
        labOnly: true,
        label: 'began south',
      },
      {
        id: 'north',
        kind: 'objective',
        x: 0,
        z: 10,
        metric: 'trace.final',
        signal: 'playerZ',
        op: '>',
        value: 0,
        labOnly: true,
        label: 'finished north',
      },
      { id: 'to_lane', kind: 'route', from: 'player', to: 'sweeper', label: 'cross after the sweep', gameplay: false },
    ],
    encounter: encounter({
      id: 'dock_dangerous_crossing',
      order: 1006,
      tier: 'minor',
      deck: 'combat',
      zoneTypes: ['ambush_lane'],
      script: 'toll',
      shape: { situation: 'toll', place: ['ambush_lane'], twist: 'none', actor: 'customs_cutter' },
      factionId: 'faction_scn',
      context: 'encounter',
      squad: { archetypes: ['customs_cutter'] },
      choices: [
        { id: 'pay', label: 'Pay the lane' },
        { id: 'run', label: 'Cross and burn' },
      ],
      timeoutChoice: 'run',
      title: 'Dangerous crossing',
    }),
  });
}

function convoyRescue() {
  return project({
    id: 'dock.convoy-rescue',
    title: 'Convoy rescue',
    composition: 'convoy-rescue',
    seed: 11007,
    ticks: 180,
    description: 'A mule hauler and a point-defense escort sit up the lane. Thrust toward them. The encounter pack carries the escort recipe.',
    notes: {
      composition: 'convoy-rescue',
      expectedObservation: 'Player thrust increases playerZ toward the hauler and the player stays alive.',
    },
  }, {
    frames: [{ tick: 0, input: { ...THRUST } }],
    objects: [
      player({ label: 'Hitch closing' }),
      actor({
        id: 'hauler',
        role: 'hauler',
        profile: 'ship_mule',
        x: 0,
        z: 70,
        velZ: 4,
        team: 0,
        factionId: 'faction_mts',
        label: 'mule hauler',
      }),
      actor({
        id: 'escort',
        role: 'escort',
        profile: 'pd_screen_escort',
        x: 20,
        z: 60,
        factionId: 'faction_scn',
        label: 'PD screen',
      }),
      {
        id: 'closing',
        kind: 'objective',
        x: -30,
        z: 70,
        metric: 'trace.final',
        signal: 'playerZ',
        op: '>',
        value: 0.5,
        labOnly: true,
        label: 'closed on the convoy',
      },
      {
        id: 'speed',
        kind: 'objective',
        x: -90,
        z: 10,
        metric: 'flight.finalSpeed',
        op: '>=',
        value: 0.5,
        labOnly: true,
        label: 'still moving',
      },
      { ...alive('alive_convoy'), x: -90, z: -10 },
      { id: 'to_hauler', kind: 'route', from: 'player', to: 'hauler', label: 'rescue run', gameplay: false },
    ],
    encounter: encounter({
      id: 'dock_convoy_rescue',
      order: 1007,
      tier: 'minor',
      deck: 'combat',
      zoneTypes: ['trade_lane'],
      script: 'convoy',
      shape: { situation: 'escort', place: ['trade_lane'], twist: 'none', actor: 'pd_screen_escort' },
      factionId: 'faction_scn',
      context: 'encounter',
      squad: { archetypes: ['mule_trader'] },
      escort: { archetypes: ['pd_screen_escort'] },
      title: 'Convoy rescue',
    }),
  });
}

function hawserDrift() {
  return project({
    id: 'dock.hawser-quiet-drift',
    title: 'Hawser and the quiet drift',
    composition: 'hawser-quiet-drift',
    seed: 11008,
    ticks: 180,
    description: 'The live Hawser tug flies a lane where a Quiet Ghost drifts past a heavy mass. Both bodies use shipped profiles.',
    notes: {
      composition: 'hawser-quiet-drift',
      expectedObservation: 'ship_hawser thrust raises playerZ. quiet_ghost keeps its authored drift. The mass is asteroid.heavy.',
    },
  }, {
    frames: [{ tick: 0, input: { ...THRUST } }],
    objects: [
      player({
        profile: 'ship_hawser',
        label: 'Hawser',
        loadout: ['mod_engine_ion_m'],
      }),
      actor({
        id: 'ghost',
        role: 'ghost',
        profile: 'quiet_ghost',
        x: 80,
        z: 40,
        velX: 14,
        velZ: -4,
        factionId: 'faction_quiet',
        label: 'Quiet Ghost',
      }),
      actor({
        id: 'mass',
        role: 'mass',
        profile: 'asteroid.heavy',
        x: 40,
        z: -20,
        team: 2,
        label: 'tow mass',
      }),
      {
        id: 'tug_z',
        kind: 'objective',
        x: -30,
        z: 40,
        metric: 'trace.final',
        signal: 'playerZ',
        op: '>',
        value: 0.5,
        labOnly: true,
        label: 'tug moved +Z',
      },
      {
        id: 'speed',
        kind: 'objective',
        x: -90,
        z: 10,
        metric: 'flight.finalSpeed',
        op: '>=',
        value: 0.5,
        labOnly: true,
        label: 'still moving',
      },
      { ...alive('alive_hawser'), x: -90, z: -10 },
      { id: 'to_ghost', kind: 'route', from: 'player', to: 'ghost', label: 'read the drift', gameplay: false },
    ],
    encounter: encounter({
      id: 'dock_hawser_quiet_drift',
      order: 1008,
      tier: 'minor',
      deck: 'mystery',
      zoneTypes: ['anomaly_deep'],
      script: 'salvageSignal',
      shape: { situation: 'anomaly', place: ['anomaly_deep'], twist: 'none', actor: 'quiet_ghost' },
      factionId: 'faction_quiet',
      context: 'encounter',
      squad: { archetypes: ['quiet_ghost'] },
      title: 'Quiet drift',
    }),
  });
}

const ALL = [
  interceptCargo(),
  brakeHulk(),
  bankShot(),
  legalRelease(),
  collisionChain(),
  dangerousCrossing(),
  convoyRescue(),
  hawserDrift(),
];

export function compositionIds() {
  return ALL.map((row) => row.id);
}

export function getComposition(id) {
  const found = ALL.find((row) => row.id === id);
  return found ? clone(found) : null;
}

export function listCompositions() {
  return ALL.map((row) => ({
    id: row.id,
    title: row.title,
    composition: row.composition,
    seed: row.seed,
    ticks: row.ticks,
  }));
}
