# Creator's Dock dialects

The dock does not invent a runtime schema. A project (`spaceface.creatorsDock.v1`) is an authoring document. Export writes only fields the live loaders already accept.

## Lab scenario (`spaceface.simScenario.v1`)

Validated by `validateSimScenario` in `src/contracts/simScenarioSchema.js`. Run by `runLabScenario` in `src/testing/lab/runScenario.js`. The canvas does not integrate motion.

Writable on an actor, and applied by `buildEntitySpawnSpec`:

| Profile kind | Applied fields |
|---|---|
| ship (`ship.starter`, `ship.kestrel`, `ship_*`) | pos, vel, heading, angularVelocity, team, factionId, isPlayer, persistent, role, loadout, overrides `mass` `radius` `hull` |
| enemy (an `ENEMY_TYPES` id or `enemy.<id>`) | pos, vel, heading, angularVelocity, factionId, persistent, role, overrides `dynamic` `hull` `level` `mass` `radius`. Team `0` is omitted so the spawner keeps the hostile team. |
| asteroid (`asteroid.light`, `asteroid.mid`, `asteroid.heavy`, `asteroid.spec:radius:mass`) | pos, vel, heading, angularVelocity, team, factionId, persistent, role, overrides `dynamic` `mass` `radius` |

An override the spawner does not apply is an export error. It is not removed.

Also writable on the scenario, because the schema and the runner consume them: `world` (`fixtureProfile`, `sectorId`, `mode`, `physicsBackend`, `flightBackend`, `aiBackend`, `credits`), `frames.input` (`moveX`, `moveZ`, `turnIntent`, `boost`, `fire`, `aimAngle`, `reelDelta`, `masslineHeld`, `lineLength`, `orbitDirection`, `gyreSnare`), keyboard `inputEvents`, attachments with `defId: tether_standard`, metrics and assertions the oracle already implements (`metric`, `holds`, `never`, `eventByTick`, `settles`, `temporal`, `equivalence`, `quantitative`).

`relations` are rejected by the lab when non-empty. A route marked `gameplay: true` fails export. A route marked `gameplay: false` is editor-only and is named in the export manifest.

There is no force-field object in the lab schema. A field with `fieldKind: "force"` fails export. The words are in the error. The force is not copied into the scenario.

Trace signals the runner records are the set in `KNOWN_LAB_SIGNALS` (`lib/mirrors.mjs`), copied from `ASSERTION_KNOWN_SIGNALS`. `player.speed` is only a `trace.max` / `trace.min` / `trace.final` parameter, not a trace signal.

## User content (`spaceface.userContent.v1`)

The directory layout and the merge are the shipped ones: `scripts/lib/userContentStore.cjs` and the merge sites in `src/data/weapons.js`, `modules.js`, `encounters.js`, and `sectorZones.js`. The dock proves a pack by spawning `lib/probeMain.mjs`, which installs `__SF_USER_MODS__` and imports those modules. `listUserMods()` is the accept/reject report.

| Kind | Writable | Not writable from this dock |
|---|---|---|
| encounters | Keys in `ENCOUNTER_KEYS`. `id` lowercase snake, `order` integer >= 1000, tier `major\|minor\|ambient`, deck `combat\|civilian\|mystery\|patrol`, integer `weight`, non-empty `zoneTypes` from `ZONE_TYPES`, `script` that already appears on a shipped encounter and is not `selfRegistered` or `followOnStub`, `shape` from `validateEncounterShape`, squad archetypes from `ENEMY_TYPES`. | New scripts, pose, velocity, triggers, metrics. `bark` is a legal key, but the shipped merge reads `ENCOUNTER_BARKS` before that table is initialized, so a record that sets `bark` aborts the module. Dock encounters omit `bark`. See `ADAPTER.md`. |
| weapons | Keys in the live export `USER_WEAPON_KEYS`. Required combat fields match `userWeaponProblem`. | Any key outside that set. |
| modules | Keys in `MODULE_KEYS` (`lib/mirrors.mjs`), the set read from `mergeUserModules`. | Any key outside that set. The probe is the authority if the mirror drifts. |
| places | Keys in `PLACE_KEYS`. `sectorId` must already exist on `SECTOR_ZONES`. `id` must be a new `zone_*`. | New sectors. A place is not a simulated force. |

Mod manifests are `{ id, name, version, description, author }` as `readManifest` requires. No scripts, no `..` paths, no asset blob over 32kb, no project over 512kb.
