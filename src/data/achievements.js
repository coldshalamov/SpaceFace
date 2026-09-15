// Achievements — the one source of truth (PQ-033.03 store readiness).
//
// Every achievement binds to a signal that genuinely fires on the default player route:
//   • `counter` rules read a LIFETIME counter the achievement ledger (src/systems/achievements.js)
//     keeps from real bus events. The event names and their player filters are the ones the local
//     telemetry sink already verified against live emit sites (design/EVENT_TAXONOMY.md). The ledger
//     keeps its own lifetime copy because telemetry sessions reset every boot and rotate out after 25.
//   • `crucible` rules read the local Crucible profile that survivalRecords settles exactly once per
//     run (sf.save.crucible_meta): lifetime runs, deepest wave, and the daily board.
//
// Ids are forever: they key the saved ledger, the Steam API names and the localization keys. Adding
// an achievement is additive; renaming or removing one strands every player who already earned it.
// After an edit run `npm run steam:achievements`; `npm run check:steam:achievements` fails when the
// Steamworks paste list or the Electron id table has drifted from this file.
//
// `icon` names the Field Hardware kit glyph (assets/ui/kit/icons/) that Steam's achieved and
// unachieved icons are drawn from; `npm run build:store-assets` renders both.

export const ACHIEVEMENT_ID_PATTERN = /^[a-z][a-z0-9_]{2,47}$/;
export const STEAM_API_NAME_PATTERN = /^SF_[A-Z0-9_]{2,60}$/;
export const ACHIEVEMENT_ICON_PATTERN = /^icon-[a-z]+(?:-[a-z]+)*$/;
export const ACHIEVEMENT_NAME_MAX = 48;
export const ACHIEVEMENT_DESCRIPTION_MAX = 120;

export const ACHIEVEMENT_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'adventure', label: 'Adventure' }),
  Object.freeze({ id: 'massline', label: 'Massline' }),
  Object.freeze({ id: 'crucible', label: 'Crucible' }),
  Object.freeze({ id: 'career', label: 'Career' }),
]);

function counter(event, emitSite, meaning) {
  return Object.freeze({ event, emitSite, meaning });
}

/**
 * Lifetime counters. `event` is the bus event the ledger listens to and `emitSite` the live file
 * that emits it (test/pq-033-03-achievements-defs.test.mjs greps the site so a renamed event cannot
 * silently orphan an achievement). The player filters live in the ledger's handler table.
 */
export const ACHIEVEMENT_COUNTERS = Object.freeze({
  docks: counter('dock:docked', 'src/ui/input.js', 'the player confirms a dock at a station'),
  oreUnits: counter('mining:yield', 'src/systems/mining.js', 'ore or salvage released to the player (other miners excluded)'),
  trades: counter('economy:tradeCompleted', 'src/systems/economy.js', 'a buy or a sell settles at a station market'),
  contracts: counter('mission:completed', 'src/systems/missions.js', 'a contract settles as completed'),
  jumps: counter('jump:arrive', 'src/systems/world.js', 'the player arrives in another system'),
  latches: counter('tether:latched', 'src/systems/tetherGameplay.js', 'the Massline latches a body'),
  throws: counter('massline:throw', 'src/systems/masslineThrow.js', 'an armed Massline throw releases its payload'),
  razorReleases: counter('tether:releaseRated', 'src/systems/tetherGameplay.js', 'a swing release is rated razor'),
  crushingImpacts: counter('tether:whipImpact', 'src/systems/masslineImpacts.js', 'a whipped mass strikes a body at crushing speed'),
  wantedTimes: counter('heat:changed', 'src/systems/heat.js', 'heat crosses the WANTED threshold'),
  creditsEarned: counter('credits:changed', 'src/systems/economy.js', 'credits granted to the player (sum of positive deltas)'),
  crucibleBests: counter('run:resultsReady', 'src/systems/survivalResults.js', 'a settled Crucible run beats the best score its challenge held before it'),
  crucibleExtractions: counter('run:resultsReady', 'src/systems/survivalResults.js', 'a settled Crucible run ends by extraction'),
});

function fact(path, meaning) {
  return Object.freeze({ path, meaning });
}

/** Facts read straight from the settled Crucible profile (src/systems/survivalRecords.js). */
export const CRUCIBLE_FACTS = Object.freeze({
  runs: fact('records.lifetime.runs', 'settled Crucible runs'),
  deepestWave: fact('records.lifetime.deepestWave', 'deepest Crucible wave reached'),
  dailyDays: fact('daily.byDate', 'days with a settled Crucible daily run'),
});

function achievement(spec) {
  const id = spec.id;
  return Object.freeze({
    id,
    steamApiName: `SF_${id.toUpperCase()}`,
    category: spec.category,
    name: spec.name,
    description: spec.description,
    hidden: spec.hidden === true,
    icon: spec.icon,
    rule: Object.freeze({ ...spec.rule }),
    nameKey: `achievements.${id}.name`,
    descriptionKey: `achievements.${id}.description`,
  });
}

export const ACHIEVEMENTS = Object.freeze([
  // Adventure — the first session's own milestones.
  achievement({
    id: 'berth_assigned',
    category: 'adventure',
    name: 'Berth Assigned',
    description: 'Dock at a station.',
    icon: 'icon-dock',
    rule: { source: 'counter', key: 'docks', target: 1 },
  }),
  achievement({
    id: 'rock_has_a_price',
    category: 'adventure',
    name: 'Rock Has a Price',
    description: 'Mine ore from an asteroid or salvage it from a wreck.',
    icon: 'icon-ore',
    rule: { source: 'counter', key: 'oreUnits', target: 1 },
  }),
  achievement({
    id: 'paper_trail',
    category: 'adventure',
    name: 'Paper Trail',
    description: 'Buy or sell cargo at a station market.',
    icon: 'icon-market',
    rule: { source: 'counter', key: 'trades', target: 1 },
  }),
  achievement({
    id: 'signed_and_delivered',
    category: 'adventure',
    name: 'Signed and Delivered',
    description: 'Complete a contract.',
    icon: 'icon-missions',
    rule: { source: 'counter', key: 'contracts', target: 1 },
  }),
  achievement({
    id: 'out_of_the_pocket',
    category: 'adventure',
    name: 'Out of the Pocket',
    description: 'Jump to another system.',
    icon: 'icon-gate',
    rule: { source: 'counter', key: 'jumps', target: 1 },
  }),

  // Massline — the signature verbs.
  achievement({
    id: 'made_contact',
    category: 'massline',
    name: 'Made Contact',
    description: 'Latch the Massline onto another body.',
    icon: 'icon-line',
    rule: { source: 'counter', key: 'latches', target: 1 },
  }),
  achievement({
    id: 'light_ships_are_ammunition',
    category: 'massline',
    name: 'Light Ships Are Ammunition',
    description: 'Throw a body with the Massline.',
    icon: 'icon-fighter',
    rule: { source: 'counter', key: 'throws', target: 1 },
  }),
  achievement({
    id: 'razor_release',
    category: 'massline',
    name: 'Razor Release',
    description: 'Let go of a swing at the exact moment: a razor-rated release.',
    icon: 'icon-spark',
    rule: { source: 'counter', key: 'razorReleases', target: 1 },
  }),
  achievement({
    id: 'keep_the_speed',
    category: 'massline',
    name: 'Keep the Speed',
    description: 'Whip a tethered mass into something at crushing speed.',
    icon: 'icon-boost',
    rule: { source: 'counter', key: 'crushingImpacts', target: 1 },
  }),

  // Crucible — read from the settled local records.
  achievement({
    id: 'into_the_crucible',
    category: 'crucible',
    name: 'Into the Crucible',
    description: 'Finish a Crucible run, however it ends.',
    icon: 'icon-danger',
    rule: { source: 'crucible', key: 'runs', target: 1 },
  }),
  achievement({
    id: 'tenth_wave',
    category: 'crucible',
    name: 'Tenth Wave',
    description: 'Reach wave 10 in the Crucible.',
    icon: 'icon-scan',
    rule: { source: 'crucible', key: 'deepestWave', target: 10 },
  }),
  achievement({
    id: 'better_than_last_time',
    category: 'crucible',
    name: 'Better Than Last Time',
    description: 'Beat your own best score in a Crucible challenge.',
    icon: 'icon-record',
    rule: { source: 'counter', key: 'crucibleBests', target: 1 },
  }),
  achievement({
    id: 'same_seed_same_day',
    category: 'crucible',
    name: 'Same Seed, Same Day',
    description: 'Finish a Crucible daily run.',
    icon: 'icon-clock',
    rule: { source: 'crucible', key: 'dailyDays', target: 1 },
  }),
  achievement({
    id: 'walked_out',
    category: 'crucible',
    name: 'Walked Out',
    description: 'Extract from a Crucible swarm at the refit bench instead of dying in it.',
    icon: 'icon-undock',
    rule: { source: 'counter', key: 'crucibleExtractions', target: 1 },
  }),

  // Career — the long tail.
  achievement({
    id: 'paperwork_filed',
    category: 'career',
    name: 'Paperwork Filed',
    description: 'Get yourself declared WANTED.',
    hidden: true,
    icon: 'icon-ledger',
    rule: { source: 'counter', key: 'wantedTimes', target: 1 },
  }),
  achievement({
    id: 'six_figures',
    category: 'career',
    name: 'Six Figures',
    description: 'Earn 100,000 credits over your career.',
    icon: 'icon-credits',
    rule: { source: 'counter', key: 'creditsEarned', target: 100000 },
  }),
]);

const BY_ID = new Map(ACHIEVEMENTS.map((def) => [def.id, def]));

export function achievementById(id) {
  return typeof id === 'string' ? BY_ID.get(id) || null : null;
}

export function isKnownAchievementId(id) {
  return typeof id === 'string' && BY_ID.has(id);
}

/** Masked copy for a hidden achievement the player has not earned yet. */
export const HIDDEN_ACHIEVEMENT_COPY = Object.freeze({
  nameKey: 'achievements.hidden.name',
  descriptionKey: 'achievements.hidden.description',
  name: 'Hidden achievement',
  description: 'Keep playing to reveal it.',
});

/** English source strings for every localization key the achievements surface speaks. */
export const ACHIEVEMENT_COPY_EN = Object.freeze(Object.fromEntries([
  ...ACHIEVEMENTS.flatMap((def) => [[def.nameKey, def.name], [def.descriptionKey, def.description]]),
  [HIDDEN_ACHIEVEMENT_COPY.nameKey, HIDDEN_ACHIEVEMENT_COPY.name],
  [HIDDEN_ACHIEVEMENT_COPY.descriptionKey, HIDDEN_ACHIEVEMENT_COPY.description],
]));

export const ACHIEVEMENT_COPY_KEYS = Object.freeze(Object.keys(ACHIEVEMENT_COPY_EN));

/** Human sentence for the rule, used by the Steamworks paste list and the receipt. */
export function describeAchievementRule(def) {
  const rule = def && def.rule;
  if (!rule) return '';
  if (rule.source === 'counter') {
    const c = ACHIEVEMENT_COUNTERS[rule.key];
    return `${rule.key} >= ${rule.target} (${c ? `${c.event}: ${c.meaning}` : 'unknown counter'})`;
  }
  if (rule.source === 'crucible') {
    const f = CRUCIBLE_FACTS[rule.key];
    return `crucible.${rule.key} >= ${rule.target} (${f ? `${f.path}: ${f.meaning}` : 'unknown fact'})`;
  }
  return 'unknown rule';
}

/** Structural validation shared by the tests and the Steamworks export. */
export function validateAchievementDefinitions(defs = ACHIEVEMENTS) {
  const issues = [];
  const ids = new Set();
  const apiNames = new Set();
  const categories = new Set(ACHIEVEMENT_CATEGORIES.map((c) => c.id));
  for (const def of defs) {
    const at = def && def.id ? def.id : '(missing id)';
    if (!def || typeof def.id !== 'string' || !ACHIEVEMENT_ID_PATTERN.test(def.id)) issues.push(`${at}: id must match ${ACHIEVEMENT_ID_PATTERN}`);
    if (ids.has(def.id)) issues.push(`${at}: duplicate id`);
    ids.add(def.id);
    if (typeof def.steamApiName !== 'string' || !STEAM_API_NAME_PATTERN.test(def.steamApiName)) issues.push(`${at}: bad Steam API name`);
    if (apiNames.has(def.steamApiName)) issues.push(`${at}: duplicate Steam API name`);
    apiNames.add(def.steamApiName);
    if (!categories.has(def.category)) issues.push(`${at}: unknown category ${def.category}`);
    if (typeof def.name !== 'string' || !def.name.trim() || def.name.length > ACHIEVEMENT_NAME_MAX) issues.push(`${at}: name must be 1..${ACHIEVEMENT_NAME_MAX} chars`);
    if (typeof def.description !== 'string' || !def.description.trim() || def.description.length > ACHIEVEMENT_DESCRIPTION_MAX) issues.push(`${at}: description must be 1..${ACHIEVEMENT_DESCRIPTION_MAX} chars`);
    if (typeof def.hidden !== 'boolean') issues.push(`${at}: hidden must be boolean`);
    if (typeof def.icon !== 'string' || !ACHIEVEMENT_ICON_PATTERN.test(def.icon)) issues.push(`${at}: icon must name a kit glyph (icon-*)`);
    const rule = def.rule;
    if (!rule || (rule.source !== 'counter' && rule.source !== 'crucible')) {
      issues.push(`${at}: rule source must be counter or crucible`);
    } else if (rule.source === 'counter' && !ACHIEVEMENT_COUNTERS[rule.key]) {
      issues.push(`${at}: unknown counter ${rule.key}`);
    } else if (rule.source === 'crucible' && !CRUCIBLE_FACTS[rule.key]) {
      issues.push(`${at}: unknown crucible fact ${rule.key}`);
    }
    if (!rule || !Number.isInteger(rule.target) || rule.target < 1) issues.push(`${at}: target must be a positive integer`);
    if (def.nameKey !== `achievements.${def.id}.name` || def.descriptionKey !== `achievements.${def.id}.description`) {
      issues.push(`${at}: localization keys must derive from the id`);
    }
  }
  return { ok: issues.length === 0, issues };
}
