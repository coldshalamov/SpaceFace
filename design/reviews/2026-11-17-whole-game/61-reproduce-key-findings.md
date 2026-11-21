# Reproducing the combat and progression findings

Run these commands from the repository root at `4bbe545d550a4c43e720df18c254b1c8d190d8a1`, with committed assets available. They were executed with Node 24.22.1. Each command uses a fresh process, synthetic state and in-memory storage. They exercise production functions. The browser's complete Daily launch and an ordinary zero-input death still need their own route tests.

## Exhibition settlement

The starting Exhibition purse is 2,400. This simulated defeat has zero kills and zero cleared rounds. [Starting purse](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/data/swarmStakes.js#L18-L25) · [Settlement](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/systems/survivalRecords.js#L1834-L1881)

```sh
node --input-type=module <<'JS'
import { settleCrucibleRun, resetCrucibleMetaForTests } from './src/systems/survivalRecords.js';
resetCrucibleMetaForTests();
const values = new Map();
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};
const run = { kind: 'survival', ruleset: 'swarm', seed: 4242, wave: 1 };
const result = {
  runId: 'observed_1', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core',
  wave: 1, wavesCleared: 0, credits: 2400, swarmStake: 'exhibition',
  outcome: 'defeat', kills: 0, score: 0, xp: 0, picks: [],
};
const settled = settleCrucibleRun({ result, run, storage });
console.log(JSON.stringify({
  bank: settled.result.bankedBounty,
  total: settled.profile.hangar.bounty,
  mode: settled.result.recordRules.mode,
}));
JS
```

Expected pinned output

```json
{"bank":1200,"total":1200,"mode":"swarm"}
```

## Round 26 Warden protection

The course advertises mutually protecting Wardens. The production selector excludes a Warden as the protected target. [Cast](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/data/swarmCourseCast.js#L268-L275) · [Selector](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/ai/swarmSpecialistRuntime.js#L36-L63)

```sh
node --input-type=module <<'JS'
import { swarmWardCandidateId } from './src/ai/swarmSpecialistRuntime.js';
const ship = (id, enemy, x) => ({
  id, type: 'ship', alive: true, team: 2, pos: { x, z: 0 },
  data: { lootTableId: enemy, runCohort: 'survival', runWave: 26 },
});
const a = ship(1, 'warden_escort', 0);
const b = ship(2, 'warden_escort', 5);
const lancer = ship(3, 'lancer_sniper', 15);
for (const actors of [[a, b], [a, b, lancer]]) {
  const state = {
    playerId: 99, entities: new Map(actors.map(actor => [actor.id, actor])),
    entityList: actors,
  };
  console.log(JSON.stringify({
    actors: actors.map(actor => actor.data.lootTableId),
    wards: [swarmWardCandidateId(state, a), swarmWardCandidateId(state, b)],
  }));
}
JS
```

Expected pinned output

```json
{"actors":["warden_escort","warden_escort"],"wards":[null,null]}
{"actors":["warden_escort","warden_escort","lancer_sniper"],"wards":[3,3]}
```

## Profile-sensitive starting stats

A daily date in the run-begin request leaves this owner's profile-sensitive stats in place. The UI's queued Daily challenge still requires a public-route comparison. No stake-funding listener runs here, so the wallet result isolates the War Chest contribution. The full-route follow-up should compare a fresh and a heavily upgraded profile with identical Daily parameters. [Run begin](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/systems/runSession.js#L167-L203) · [Stats](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/systems/swarmHangar.js#L24-L44)

```sh
node --input-type=module <<'JS'
import { createGameState } from './src/core/gameState.js';
import { createBus } from './src/core/eventBus.js';
import { createRunState } from './src/core/runState.js';
import { runSession } from './src/systems/runSession.js';
import {
  emptyCrucibleProfile, saveCrucibleMeta, useCrucibleMetaStorage,
  resetCrucibleMetaForTests,
} from './src/systems/survivalRecords.js';
import { applyHangarToPlayer } from './src/systems/swarmHangar.js';
for (const rank of [0, 5]) {
  resetCrucibleMetaForTests();
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  useCrucibleMetaStorage(storage);
  const profile = emptyCrucibleProfile();
  profile.hangar.ranks = { plating: rank, shield: rank, war_chest: rank };
  saveCrucibleMeta(profile, storage);
  const state = createGameState(4242);
  const bus = createBus();
  state.run = createRunState();
  state.playerId = 1;
  state.entities.set(1, { hull: 100, hullMax: 100, shield: 100, shieldMax: 100, data: {} });
  const session = Object.create(runSession);
  session.init({ state, bus });
  session.begin({
    kind: 'survival', ruleset: 'swarm', seed: 4242,
    arenaId: 'helios_core', dailyDateKey: '2026-11-17',
  });
  applyHangarToPlayer(state, state.run.telemetry.hangar);
  const pilot = state.entities.get(1);
  console.log(JSON.stringify({
    rank, hull: pilot.hull, shield: pilot.shield, purse: state.run.credits,
  }));
  session.destroy();
}
JS
```

Expected pinned output

```json
{"rank":0,"hull":100,"shield":100,"purse":0}
{"rank":5,"hull":125,"shield":125,"purse":500}
```

## Selected action-mode checks

The eleven-file sample produced 170 passes and four failures after supplying the committed asset required by the capital-score contract. All four failures belonged to the older Iron Maw fixture, which expected that boss at round ten. The production course places Corsair Wing there. The passing racing cases exercise simulated rivals.

```sh
node --test --test-concurrency=1 \
  test/massline-input-grammar.test.mjs \
  test/massline-invariants.test.mjs \
  test/massline-release-predictor.test.mjs \
  test/swarm-course-cast.test.mjs \
  test/swarm-course.test.mjs \
  test/rc-02-iron-maw-boss-score.test.mjs \
  test/swarm-quick-start.test.mjs \
  test/crucible-results.test.mjs \
  test/swarm-course-twists.test.mjs \
  test/capital-boss-score-contract.test.mjs \
  test/al-race-1-contested-line-4242.test.mjs
```
