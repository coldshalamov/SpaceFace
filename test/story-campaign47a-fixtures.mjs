// Fixtures for isolated Campaign 47-A sidecar tests (M5 task 1).
// Does not claim full M5 acceptance or default wiring.

export function makeBus() {
  const handlers = new Map();
  const events = [];
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
    },
    emit(event, payload) {
      events.push({ event, payload });
      for (const fn of handlers.get(event) || []) fn(payload);
    },
    events,
  };
}

/**
 * Minimal state with live spine fields on state.story (owned by missions/story).
 * Sidecar may only touch state.story.campaign47a.
 */
export function makeCampaignState(overrides = {}) {
  return {
    simTime: 0,
    mode: 'flight',
    rng: { seed: 0x47a47a },
    player: {
      credits: 5000,
      heat: 0.2,
      cargo: { items: {}, mass: 0, capacity: 40 },
    },
    factions: {
      faction_scn: { rep: 0 },
      faction_mts: { rep: 0 },
      faction_free: { rep: 0 },
      faction_dmc: { rep: 0 },
    },
    story: {
      beatIndex: 0,
      branch: null,
      flags: {},
      chainProgress: 0,
      endgameChoice: null,
      endgameOffered: false,
      endgameDeclined: [],
    },
    ...overrides,
  };
}

/** Snapshot live spine fields for mutation guards. */
export function snapshotCanonicalSpine(state) {
  const s = state.story || {};
  return {
    beatIndex: s.beatIndex,
    branch: s.branch,
    chainProgress: s.chainProgress,
    endgameChoice: s.endgameChoice,
    endgameOffered: s.endgameOffered,
    endgameDeclined: Array.isArray(s.endgameDeclined) ? s.endgameDeclined.slice() : [],
    credits: state.player?.credits,
    heat: state.player?.heat,
    scnRep: state.factions?.faction_scn?.rep,
  };
}

export function assertSpineUnchanged(before, state, label = 'spine') {
  const after = snapshotCanonicalSpine(state);
  if (before.beatIndex !== after.beatIndex) {
    throw new Error(`${label}: beatIndex mutated ${before.beatIndex}→${after.beatIndex}`);
  }
  if (before.branch !== after.branch) {
    throw new Error(`${label}: branch mutated`);
  }
  if (before.chainProgress !== after.chainProgress) {
    throw new Error(`${label}: chainProgress mutated`);
  }
  if (before.endgameChoice !== after.endgameChoice) {
    throw new Error(`${label}: endgameChoice mutated`);
  }
  if (before.endgameOffered !== after.endgameOffered) {
    throw new Error(`${label}: endgameOffered mutated`);
  }
  if (before.credits !== after.credits) {
    throw new Error(`${label}: player.credits mutated`);
  }
  if (before.heat !== after.heat) {
    throw new Error(`${label}: player.heat mutated`);
  }
  if (before.scnRep !== after.scnRep) {
    throw new Error(`${label}: faction_scn.rep mutated`);
  }
}

/** Observation snapshot for ending requirement queries (not endgame choice). */
export function endgameObservation(extra = {}) {
  return {
    netWorthCr: 120_000,
    factionRep: 60,
    hasCapitalHull: true,
    outpostDefended: false,
    sectorId: 'sector_ashfall_reach',
    fullLoad: true,
    hasActiveMissions: false,
    cargoIds: ['cmdty_personal_ledger'],
    ...extra,
  };
}

/** Live-compatible branch intro accept payload. */
export function liveBranchIntroPayload(branch = 'patrol') {
  const map = {
    traders: { type: 'bulk_trade', factionId: 'faction_mts', branch: 'traders' },
    patrol: { type: 'patrol_clear', factionId: 'faction_scn', branch: 'patrol' },
    free: { type: 'smuggling_run', factionId: 'faction_free', branch: 'free' },
  };
  const m = map[branch] || map.patrol;
  return {
    storyTag: 'story.branch_intro',
    type: m.type,
    factionId: m.factionId,
    branch: m.branch,
    id: `mission:test:intro:${m.branch}`,
  };
}

export function findNondeterminism(sourceText) {
  const hits = [];
  if (/\bMath\.random\s*\(/.test(sourceText)) hits.push('Math.random');
  if (/\bDate\.now\s*\(/.test(sourceText)) hits.push('Date.now');
  if (/\bperformance\.now\s*\(/.test(sourceText)) hits.push('performance.now');
  if (/\bnew\s+Date\s*\(/.test(sourceText)) hits.push('new Date');
  return hits;
}

export function scanDirForNondeterminism(fs, pathMod, dir) {
  const hits = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = pathMod.join(dir, ent.name);
    if (ent.isDirectory()) {
      hits.push(...scanDirForNondeterminism(fs, pathMod, full));
      continue;
    }
    if (!ent.name.endsWith('.js') && !ent.name.endsWith('.mjs')) continue;
    const text = fs.readFileSync(full, 'utf8');
    const found = findNondeterminism(text);
    for (const f of found) hits.push({ file: full, kind: f });
  }
  return hits;
}

export function hasIntent(intents, eventName) {
  return (intents || []).some((i) => i.event === eventName);
}

export function intentsOf(intents, eventName) {
  return (intents || []).filter((i) => i.event === eventName);
}
