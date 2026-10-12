// Twelve real journeys. Each one is a fixture plus a cue the persona can see.
// Starting credits, a berth, or a line already on the mass are scenario initial conditions.

const PLAYER = Object.freeze({
  alias: 'player',
  profile: 'ship.starter',
  role: 'player',
  team: 0,
  factionId: 'faction_free',
  isPlayer: true,
  pos: Object.freeze({ x: 0, z: 0 }),
  vel: Object.freeze({ x: 0, z: 0 }),
  heading: Math.PI / 2,
  persistent: true,
});

function playerAt(x, z) {
  return { ...PLAYER, pos: { x, z } };
}

const ROCK = Object.freeze({
  alias: 'rock',
  profile: 'asteroid.heavy',
  role: 'lab_anchor',
  team: 2,
  pos: Object.freeze({ x: 0, z: 36 }),
  vel: Object.freeze({ x: 0, z: 0 }),
  persistent: true,
});

export const JOURNEYS = Object.freeze([
  {
    id: 'launch',
    title: 'Launch',
    cue: 'Leave the cradle under your own thrust.',
    ticks: 90,
    bundle: 'flight',
    extras: [],
    defaultPersona: 'first-time-pilot',
    entities: [PLAYER],
    setup: 'flight',
  },
  {
    id: 'flight',
    title: 'Flight',
    cue: 'Change heading and cover ground.',
    ticks: 120,
    bundle: 'flight',
    extras: [],
    defaultPersona: 'first-time-pilot',
    entities: [PLAYER],
    setup: 'flight',
  },
  {
    id: 'tether-attach-cut',
    title: 'Tether attach and cut',
    cue: 'Put the massline on the rock, then cut it.',
    ticks: 140,
    bundle: 'massline',
    extras: [],
    defaultPersona: 'massline-stunt-pilot',
    entities: [PLAYER],
    setup: 'tether-rock',
  },
  {
    id: 'heavy-object',
    title: 'Heavy-object handling',
    cue: 'The line is already on the heavy rock. Reel and pull.',
    ticks: 140,
    bundle: 'massline',
    extras: [],
    defaultPersona: 'meticulous-cargo-handler',
    entities: [PLAYER, { ...ROCK, overrides: { mass: 8000, radius: 8 } }],
    attachments: [{ ownerAlias: 'player', targetAlias: 'rock' }],
    setup: 'flight',
  },
  {
    id: 'mining',
    title: 'Mining',
    cue: 'Hold the mining beam on the rock in front of you.',
    ticks: 120,
    bundle: 'flight',
    extras: ['mining', 'ships'],
    defaultPersona: 'meticulous-cargo-handler',
    entities: [PLAYER],
    setup: 'mining',
  },
  {
    id: 'docking',
    title: 'Docking',
    cue: 'Approach the station corridor. Do not claim a berth you have not reached.',
    ticks: 600,
    bundle: 'flight',
    extras: ['dockingCorridor'],
    defaultPersona: 'meticulous-cargo-handler',
    entities: [playerAt(0, 0)],
    setup: 'docking',
  },
  {
    id: 'buy-refit',
    title: 'Buy and refit',
    cue: 'You are at the Helios counter. Buy silicate, then fit a cargo scanner.',
    ticks: 60,
    bundle: 'flight',
    extras: ['economy', 'cargo', 'ships'],
    defaultPersona: 'meticulous-cargo-handler',
    entities: [PLAYER],
    setup: 'station-counter',
  },
  {
    id: 'scan',
    title: 'Scan',
    cue: 'Pulse the scanner once.',
    ticks: 90,
    bundle: 'flight',
    extras: ['scanner'],
    defaultPersona: 'first-time-pilot',
    entities: [PLAYER, { ...ROCK, alias: 'contact', pos: { x: 0, z: 80 } }],
    setup: 'flight',
  },
  {
    id: 'mission',
    title: 'Mission accept, complete, or fail',
    cue: 'Take the board offer. Finish it if the objective is already met, otherwise abandon it.',
    ticks: 90,
    bundle: 'flight',
    extras: ['missions', 'economy'],
    defaultPersona: 'mission-runner',
    entities: [PLAYER],
    setup: 'mission-board',
  },
  {
    id: 'combat-death-retry',
    title: 'Combat, death, retry',
    cue: 'Fight the wasp. If you are wrecked, request recovery.',
    ticks: 1800,
    bundle: 'flight',
    extras: ['tacticalAI', 'aiPorts', 'combat'],
    defaultPersona: 'reckless-improvisor',
    entities: [
      playerAt(3000, 0),
      {
        alias: 'wasp',
        profile: 'wasp_swarmer',
        role: 'hostile',
        team: 1,
        factionId: 'faction_reach',
        pos: { x: 3000, z: 160 },
        vel: { x: 0, z: 0 },
        heading: -Math.PI / 2,
        persistent: true,
      },
      {
        alias: 'wasp-b',
        profile: 'wasp_swarmer',
        role: 'hostile',
        team: 1,
        factionId: 'faction_reach',
        pos: { x: 3080, z: 160 },
        vel: { x: 0, z: 0 },
        heading: Math.PI,
        persistent: true,
      },
      {
        alias: 'wasp-c',
        profile: 'wasp_swarmer',
        role: 'hostile',
        team: 1,
        factionId: 'faction_reach',
        pos: { x: 2920, z: 160 },
        vel: { x: 0, z: 0 },
        heading: 0,
        persistent: true,
      },
    ],
    setup: 'flight',
  },
  {
    id: 'crucible-wave',
    title: 'Crucible wave progression',
    cue: 'Begin a survival run and press through loadout and intros.',
    ticks: 180,
    bundle: 'flight',
    extras: ['runSession', 'survivalRun', 'survivalWave'],
    defaultPersona: 'mission-runner',
    entities: [PLAYER],
    setup: 'flight',
  },
  {
    id: 'save-continue',
    title: 'Save and continue after sector travel',
    cue: 'Request the Ceres gate, then save and continue.',
    ticks: 420,
    bundle: 'flight-save',
    extras: ['world'],
    defaultPersona: 'save-continue-skeptic',
    entities: [PLAYER],
    setup: 'sector-home',
  },
]);

const BY_ID = new Map(JOURNEYS.map((journey) => [journey.id, journey]));

export function getJourney(id) {
  const journey = BY_ID.get(id);
  if (!journey) throw new Error(`unknown stranger journey: ${id}`);
  return journey;
}

export function listJourneys() {
  return JOURNEYS.map((journey) => ({
    id: journey.id,
    title: journey.title,
    ticks: journey.ticks,
    bundle: journey.bundle,
    extras: journey.extras || [],
    defaultPersona: journey.defaultPersona,
    cue: journey.cue,
  }));
}

// Completing a route is separate from finding no defect during its prefix.
export function assessJourney({ journeyId, samples = [], commands = [], milestones = {} }) {
  const first = samples[0];
  const last = samples.at(-1);
  const checks = [];
  const need = (label, measured) => checks.push({ label, measured: !!measured });
  const command = (type) => commands.some((row) => row.type === type && row.ok === true && !row.skipped);
  const event = (name) => milestones[name] > 0;
  const flying = samples.some((sample) => sample.mode === 'flight' && sample.alive);
  switch (journeyId) {
    case 'launch':
    case 'flight':
      need('controlled flight motion', flying && first && last && Math.hypot(last.x - first.x, last.z - first.z) > 1);
      break;
    case 'tether-attach-cut':
      need('massline attachment', event('tether:attached') || samples.some((sample) => sample.tetherActive));
      need('massline cut', event('tether:cut'));
      break;
    case 'heavy-object':
      need('loaded massline response', samples.some((sample) => sample.tetherActive && sample.tetherStrain > 0));
      break;
    case 'mining': need('mining yield', event('mining:yield')); break;
    case 'docking': need('berth arrival', samples.some((sample) => sample.berthed || (sample.docked && !first?.docked))); break;
    case 'buy-refit':
      need('purchase settlement', command('buy'));
      need('module refit', command('refit'));
      break;
    case 'scan': need('scanner pulse', event('scan:pulse') || event('scan:completed')); break;
    case 'mission':
      need('mission acceptance', command('accept-mission'));
      need('mission completion or abandonment', event('mission:completed') || command('abandon-mission'));
      break;
    case 'combat-death-retry': {
      const death = samples.find((sample) => sample.alive === false);
      need('player death', death || event('player:death'));
      need('recovery and living control', death && commands.some((row) => row.type === 'recover' && row.ok
        && row.tick > death.tick && samples.some((sample) => sample.tick >= row.tick && sample.alive)));
      break;
    }
    case 'crucible-wave': need('live survival wave', samples.some((sample) => sample.runPhase === 'wave' || sample.runPhase === 'combat') || event('run:waveStarted')); break;
    case 'save-continue':
      need('sector transition', first && samples.some((sample) => sample.sectorId && sample.sectorId !== first.sectorId));
      need('save', command('save'));
      need('Continue', command('continue'));
      break;
    default: need('known route completion', false);
  }
  const missing = checks.filter((check) => !check.measured).map((check) => check.label);
  return { status: missing.length ? 'incomplete' : 'complete', layer: 'headless-sim', checks, missing };
}
