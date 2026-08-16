// Plan 57 endgame challenge / seeded-run orchestrator.
//
// This is not a mission, wallet, combat, or RNG authority. It keeps one bounded player replay
// record, asks encounterDirector for authored physical fights, and emits reward intents to the
// economy/story owners. postEndingReplay remains the story-chain owner.
import {
  CAPSTONE_REWARD,
  ENDGAME_CHALLENGE_BY_SECTOR,
  ENDGAME_CHALLENGE_SECTORS,
  ENDGAME_REPLAY_SCHEMA,
  LEGENDARY_HUNTS,
  appendSeededSpawnToken,
  challengeRecipeFor,
  commitSeededLeaderboard,
  freshEndgameReplayState,
  normalizeEndgameReplayState,
} from '../data/endgameReplay.js';

const CHALLENGE_ANCHOR_OFFSETS = Object.freeze([
  Object.freeze({ x: 260, z: -180 }),
  Object.freeze({ x: -320, z: 230 }),
]);

const CHALLENGE_SUCCESS_OUTCOMES = new Set(['cleared', 'wing_broken']);
const HUNT_SUCCESS_OUTCOMES = Object.freeze({
  legendary_capital_hulk: 'hulk_silenced',
  legendary_ace_crew: 'double_bounty',
  legendary_gold_wings: 'jackpot_core_exposed',
});

function ended(story) {
  return !!(story && (story.endgameResolved === true || story.endgameChoice
    || (story.flags && story.flags.sandboxContinued)));
}

function seedOf(state) {
  return (Number(state && state.meta && state.meta.seed) >>> 0) || 1;
}

function playerOf(state) {
  return state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
}

function anchorNearPlayer(state, index) {
  const player = playerOf(state);
  const base = player && player.pos || { x: 0, z: 0 };
  const offset = CHALLENGE_ANCHOR_OFFSETS[index % CHALLENGE_ANCHOR_OFFSETS.length];
  return { x: base.x + offset.x, z: base.z + offset.z };
}

export const endgameReplay = {
  name: 'endgameReplay',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.registry = ctx.registry;
    this._unsubs = [];
    this._resumeSpawnTokens = [];
    this._listen('game:started', (payload) => this._onGameStarted(payload || {}));
    this._listen('save:loaded', () => this._onLoaded());
    this._listen('endgame:chosen', () => this.activate());
    this._listen('endgame:sandboxContinued', () => this.activate());
    this._listen('sector:enter', (payload) => this._onSectorEnter(payload || {}));
    this._listen('encounter:spawned', (payload) => this._onEncounterSpawned(payload || {}));
    this._listen('encounter:resolved', (payload) => this._onEncounterResolved(payload || {}));
    this._listen('ui:endgameChallengeReroll', (payload) => this.rerollChallenge(payload && payload.sectorId));
    this._listen('mission:completed', () => this._score(750));
    this._listen('entity:killed', (payload) => {
      if (payload && payload.killerId != null && payload.killerId === this.state.playerId) this._score(100);
    });
    this._listen('postEndingReplay:cycleCompleted', () => this._scoreChain());
    this._listen('endgame:chosen', (payload) => this.finalizeSeededRun(`ending:${payload && payload.choice || 'unknown'}`));
    this._listen('endgame:sandboxContinued', () => this.finalizeSeededRun('ending:sandbox'));
    this._listen('player:death', () => this.finalizeSeededRun('death'));
    this._ensure({ force: true });
  },

  _listen(event, handler) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(event, handler);
    if (typeof off === 'function') this._unsubs.push(off);
  },

  _ensure(options = {}) {
    const player = this.state.player || (this.state.player = {});
    if (options.force !== true && player.endgameReplay
        && player.endgameReplay.schema === ENDGAME_REPLAY_SCHEMA) return player.endgameReplay;
    player.endgameReplay = normalizeEndgameReplayState(player.endgameReplay, seedOf(this.state), options);
    return player.endgameReplay;
  },

  newGame() {
    const player = this.state.player || (this.state.player = {});
    player.endgameReplay = freshEndgameReplayState(seedOf(this.state));
    this._resumeSpawnTokens = [];
  },

  _onGameStarted(payload) {
    const overlayElite = payload.newGamePlus && payload.newGamePlus.eliteComposition;
    const eliteComposition = overlayElite == null ? true : overlayElite !== false;
    const record = freshEndgameReplayState(seedOf(this.state), {
      seededRun: payload.seededRun === true,
      eliteComposition,
    });
    this.state.player.endgameReplay = record;
    this._resumeSpawnTokens = [];
    if (ended(this.state.story)) this.activate();
    this.bus.emit('seededRun:started', { ...record.seededRun });
  },

  _onLoaded() {
    const record = this._ensure({ force: true });
    let rematerializingEncounterCount = 0;
    for (const challenge of Object.values(record.challenges)) {
      if (challenge.status !== 'active') continue;
      rematerializingEncounterCount += challenge.pendingEncounterIds.length;
      challenge.status = 'ready';
      challenge.pendingEncounterIds = [];
      challenge.completedEncounterIds = [];
    }
    for (const hunt of Object.values(record.hunts)) {
      if (hunt.status !== 'active') continue;
      rematerializingEncounterCount += 1;
      hunt.status = 'rumored';
      hunt.encounterId = null;
    }
    this._resumeSpawnTokens = rematerializingEncounterCount > 0
      ? record.seededRun.spawnTokens.slice()
      : [];
    if (ended(this.state.story)) this.activate({ quiet: true });
    if (record.active) {
      this._onSectorEnter({ sectorId: this.state.world && this.state.world.currentSectorId });
    }
    this._resumeSpawnTokens = [];
    this.bus.emit('seededRun:restored', { ...record.seededRun });
  },

  activate(options = {}) {
    const record = this._ensure();
    if (record.active) return record;
    record.active = true;
    for (const challenge of Object.values(record.challenges)) {
      if (challenge.status === 'locked') challenge.status = 'ready';
    }
    for (const hunt of Object.values(record.hunts)) {
      if (hunt.status === 'locked') hunt.status = 'rumored';
    }
    if (!options.quiet) this._publishRumors();
    this.bus.emit('endgameReplay:activated', this.routes());
    return record;
  },

  routes() {
    const record = this._ensure();
    return {
      active: record.active,
      eliteComposition: record.eliteComposition,
      challenges: ENDGAME_CHALLENGE_SECTORS.map((entry) => {
        const progress = record.challenges[entry.sectorId];
        const recipe = challengeRecipeFor(seedOf(this.state), entry.sectorId, progress.roll, record.eliteComposition);
        return { ...recipe, ...progress };
      }),
      hunts: LEGENDARY_HUNTS.map((hunt) => ({ ...hunt, ...record.hunts[hunt.id] })),
      seededRun: { ...record.seededRun, spawnTokens: record.seededRun.spawnTokens.slice() },
    };
  },

  _publishRumors() {
    const routes = this.routes();
    for (const challenge of routes.challenges) {
      this.bus.emit('news:headline', {
        kind: 'endgame-challenge',
        headline: `${challenge.title.toUpperCase()}: ${challenge.sectorName} is running ${challenge.label} through ${challenge.hazardLine}.`,
        text: `${challenge.title}: ${challenge.sectorName} is running ${challenge.label} through ${challenge.hazardLine}.`,
        sectorId: challenge.sectorId,
      });
    }
    for (const hunt of routes.hunts) {
      this.bus.emit('news:headline', {
        kind: 'legendary-hunt',
        headline: `${hunt.title.toUpperCase()}: ${hunt.rumor} Last fix: ${hunt.sectorName}.`,
        text: `${hunt.rumor} Last fix: ${hunt.sectorName}.`,
        sectorId: hunt.sectorId,
        huntId: hunt.id,
      });
    }
  },

  rerollChallenge(sectorId) {
    const record = this._ensure();
    const def = ENDGAME_CHALLENGE_BY_SECTOR.get(sectorId);
    const progress = def && record.challenges[sectorId];
    if (!record.active || !def || !progress || progress.status === 'active') return null;
    progress.roll += 1;
    progress.status = 'ready';
    progress.pendingEncounterIds = [];
    progress.completedEncounterIds = [];
    const recipe = challengeRecipeFor(seedOf(this.state), sectorId, progress.roll, record.eliteComposition);
    progress.recipeId = recipe.recipeId;
    this.bus.emit('endgameReplay:challengeRerolled', recipe);
    this.bus.emit('toast', { text: `${recipe.title} re-rolled: ${recipe.label}`, kind: 'info', ttl: 5 });
    if (this.state.world && this.state.world.currentSectorId === sectorId) this._launchChallenge(recipe, progress);
    return recipe;
  },

  _onSectorEnter(payload) {
    const sectorId = payload.sectorId || (this.state.world && this.state.world.currentSectorId);
    const record = this._ensure();
    if (!record.active || !sectorId) return;
    const challenge = record.challenges[sectorId];
    if (challenge && challenge.status === 'ready') {
      this._launchChallenge(challengeRecipeFor(seedOf(this.state), sectorId, challenge.roll, record.eliteComposition), challenge);
    }
    const huntDef = LEGENDARY_HUNTS.find((hunt) => hunt.sectorId === sectorId);
    const hunt = huntDef && record.hunts[huntDef.id];
    if (huntDef && hunt && hunt.status === 'rumored') this._launchHunt(huntDef, hunt);
  },

  _launchChallenge(recipe, progress) {
    const director = this.registry && this.registry.get && this.registry.get('encounterDirector');
    if (!recipe || !director || typeof director.requestAuthoredEncounter !== 'function') return false;
    const admitted = [];
    for (let index = 0; index < recipe.shapeIds.length; index++) {
      const shapeId = recipe.shapeIds[index];
      const encounterId = `endgame:${recipe.challengeId}:r${recipe.roll}:${index}:${shapeId}`;
      const result = director.requestAuthoredEncounter({
        shapeId,
        encounterId,
        sectorId: recipe.sectorId,
        anchor: anchorNearPlayer(this.state, index),
        zoneType: index === 0 ? 'derelict_field' : 'outlaw_zone',
        zoneName: `${recipe.title} — ${recipe.label}`,
        zoneRadius: 680,
        threat: 4,
        force: true,
        data: { endgameChallengeId: recipe.challengeId, roll: recipe.roll, recipeId: recipe.recipeId },
      });
      if (result && result.ok) admitted.push(encounterId);
    }
    if (!admitted.length) return false;
    progress.status = 'active';
    progress.pendingEncounterIds = admitted;
    progress.completedEncounterIds = [];
    this.bus.emit('endgameReplay:challengeStarted', { ...recipe, encounterIds: admitted.slice() });
    return true;
  },

  _launchHunt(def, progress) {
    const director = this.registry && this.registry.get && this.registry.get('encounterDirector');
    if (!director || typeof director.requestAuthoredEncounter !== 'function') return false;
    const encounterId = `endgame:hunt:${def.id}:${seedOf(this.state)}`;
    const result = director.requestAuthoredEncounter({
      shapeId: def.shapeId,
      encounterId,
      sectorId: def.sectorId,
      anchor: anchorNearPlayer(this.state, 0),
      zoneType: 'outlaw_zone',
      zoneName: def.title,
      zoneRadius: 820,
      threat: 5,
      force: true,
      data: { legendaryHuntId: def.id },
    });
    if (!result || !result.ok) return false;
    progress.status = 'active';
    progress.encounterId = encounterId;
    this.bus.emit('endgameReplay:huntStarted', { ...def, encounterId });
    return true;
  },

  _onEncounterSpawned(payload) {
    const run = this._ensure().seededRun;
    const token = [
      payload.kind,
      payload.sectorId,
      payload.count,
      payload.fingerprint,
      payload.motiveId,
    ].map((value) => String(value == null ? '' : value)).join('|');
    const resumeIndex = this._resumeSpawnTokens.indexOf(token);
    if (resumeIndex >= 0) {
      this._resumeSpawnTokens.splice(resumeIndex, 1);
      return;
    }
    appendSeededSpawnToken(run, token);
  },

  _onEncounterResolved(payload) {
    const record = this._ensure();
    for (const [sectorId, challenge] of Object.entries(record.challenges)) {
      if (challenge.status !== 'active' || !challenge.pendingEncounterIds.includes(payload.encounterId)) continue;
      if (!CHALLENGE_SUCCESS_OUTCOMES.has(String(payload.outcome || ''))) {
        this._interruptChallenge(sectorId, challenge, payload.outcome);
        return;
      }
      challenge.pendingEncounterIds = challenge.pendingEncounterIds.filter((id) => id !== payload.encounterId);
      if (!challenge.completedEncounterIds.includes(payload.encounterId)) challenge.completedEncounterIds.push(payload.encounterId);
      if (challenge.pendingEncounterIds.length) return;
      challenge.status = 'completed';
      challenge.completions += 1;
      challenge.rewardCount += 1;
      this.bus.emit('economy:grantCredits', { amount: CAPSTONE_REWARD.credits, reason: `endgame_challenge:${challenge.challengeId}` });
      this.bus.emit('story:awardPersistentCargo', {
        id: CAPSTONE_REWARD.cargoId,
        name: CAPSTONE_REWARD.name,
        qty: 1,
        mass: 0.02,
        reason: `endgame_challenge:${challenge.challengeId}`,
      });
      this._score(5_000);
      this.bus.emit('endgameReplay:challengeCompleted', {
        sectorId,
        challengeId: challenge.challengeId,
        completions: challenge.completions,
        reward: { ...CAPSTONE_REWARD },
      });
      return;
    }
    for (const hunt of LEGENDARY_HUNTS) {
      const progress = record.hunts[hunt.id];
      if (progress.status !== 'active' || progress.encounterId !== payload.encounterId) continue;
      if (String(payload.outcome || '') !== HUNT_SUCCESS_OUTCOMES[hunt.id]) {
        progress.status = 'rumored';
        progress.encounterId = null;
        progress.outcome = payload.outcome || 'interrupted';
        this.bus.emit('endgameReplay:huntInterrupted', { ...hunt, outcome: progress.outcome });
        return;
      }
      progress.status = 'completed';
      progress.outcome = payload.outcome || 'resolved';
      this.bus.emit('economy:grantCredits', { amount: 28_000, reason: `legendary_hunt:${hunt.id}` });
      this._score(8_000);
      this.bus.emit('endgameReplay:huntCompleted', { ...hunt, outcome: progress.outcome });
      return;
    }
  },

  _interruptChallenge(sectorId, challenge, outcome) {
    const pending = challenge.pendingEncounterIds.slice();
    challenge.pendingEncounterIds = [];
    challenge.completedEncounterIds = [];
    challenge.status = 'ready';
    const director = this.registry && this.registry.get && this.registry.get('encounterDirector');
    for (const encounterId of pending) {
      const live = this.state.encounterDirector && this.state.encounterDirector.live
        && this.state.encounterDirector.live[encounterId];
      if (live && director && typeof director.abort === 'function') director.abort(live, 'challenge_interrupted');
    }
    this.bus.emit('endgameReplay:challengeInterrupted', {
      sectorId,
      challengeId: challenge.challengeId,
      outcome: outcome || 'interrupted',
    });
  },

  _score(points) {
    const run = this._ensure().seededRun;
    if (!run.enabled || run.finalized) return;
    run.score = Math.min(999_999_999, run.score + Math.max(0, Math.floor(Number(points) || 0)));
    this.bus.emit('seededRun:scoreChanged', { score: run.score, chains: run.chains, spawnHash: run.spawnHash });
  },

  _scoreChain() {
    const run = this._ensure().seededRun;
    if (!run.enabled || run.finalized) return;
    run.chains = Math.min(999_999, run.chains + 1);
    this._score(3_000);
  },

  finalizeSeededRun(outcome) {
    const run = this._ensure().seededRun;
    if (!run.enabled || run.finalized) return null;
    run.finalized = true;
    run.outcome = String(outcome || 'complete');
    const leaderboard = commitSeededLeaderboard(run);
    this.bus.emit('seededRun:finalized', { ...run, spawnTokens: run.spawnTokens.slice(), leaderboard });
    return leaderboard;
  },

  serialize() { return this._ensure(); },

  deserialize(data) {
    this.state.player.endgameReplay = normalizeEndgameReplayState(data, seedOf(this.state));
    return this.state.player.endgameReplay;
  },

  destroy() {
    for (const off of this._unsubs) off();
    this._unsubs = [];
  },
};

export default endgameReplay;
