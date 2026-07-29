# SpaceFace Common Bugs — Debugging Playbooks

> **What this is:** playbooks for the bugs agents keep failing to fix. Each names the exact files,
> functions and ownership seams — and the *wrong* place agents usually look first. Line numbers are
> deliberately avoided where possible because this file must survive implementation growth.
> Companion to `AGENTS.md` §7 (common-bug routing) and `docs/MODULE_MAP.md`.
>
> Verify every claim against the current working tree before editing; code and live checks outrank
> this playbook.
>
> **Why this exists:** these bugs resisted diagnosis for 10-20 prompts each not because they were
> hard, but because the docs didn't explain the architecture well enough. This file is that
> explanation. If you hit a bug not listed here, add a section when you solve it.

---

## Index

1. [My fix didn't apply / nothing changed](#1-my-fix-didnt-apply--nothing-changed)
2. [I get attacked on spawn / friendlies hostile](#2-i-get-attacked-on-spawn--friendlies-hostile)
3. [My new ship/station model doesn't render](#3-my-new-shipstation-model-doesnt-render)
3b. [After "wire up all assets," the player ship is a turd / floating accessories](#3b-after-wire-up-all-assets-the-player-ship-is-a-turd--floating-accessories)
4. [Game refuses to start ("authored ship assets did not preload")](#4-game-refuses-to-start)
5. [Friendlies labeled as heat / threat](#5-friendlies-labeled-as-heat--threat) (the three meanings of "heat")
6. [I changed a faction/rep number and combat didn't react](#6-i-changed-a-factionrep-number-and-combat-didnt-react)
7. [My perf fix made the frame worse / browser diverged](#7-my-perf-fix-made-the-frame-worse--browser-diverged)
8. [The sim/hash check broke after my change](#8-the-simhash-check-broke-after-my-change)
9. [The Massline breaks during ordinary piloting](#9-the-massline-breaks-during-ordinary-piloting)
10. [Check-tooling traps: hidden links, fail-fast aggregates, golden churn](#10-check-tooling-traps)

---

## 1. My fix didn't apply / nothing changed

**Symptom:** You made an edit, the game still behaves the old way. No error.

**There are now TWO likely root causes. Check both before doing anything else.**

### Cause A — You edited a legacy file (the classic trap)
The engine has flag-selected backend swaps. Defaults pick V3/tactical, but docs and file *names* point at legacy.

**The wrong files (editing these has no effect in normal play):**
- `src/systems/flight.js` — legacy flight controller
- `src/systems/ai.js` — legacy AI FSM, statically imported and compatibility/check-load-bearing,
  but not selected by the default tactical backend
- `src/core/flightDynamics.js` — legacy flight math (still imported by `aiPorts.js` for compat, but not by the live flight controller)

**The right files (LIVE — defaults `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`):**
- `src/systems/flightV3.js` + `src/core/flight/` (propulsionCatalog, propulsionKernel, flightTelemetry)
- `src/systems/tacticalAI.js` + `src/ai/*` + `src/systems/aiPorts.js`

**Selection site:** `src/core/registry.js`. Confirm both static import and default selection before
editing; an imported compatibility fixture may load in CI without owning normal gameplay.

### Cause B — The fix already exists in the uncommitted working tree (the new trap)
The repository may contain substantial uncommitted implementation. An agent reading HEAD or a stale
clone can see a different game. **Before diagnosing, run `git status`, `git diff <file>`, and when
useful `git log -L <func>,<func>:<file>`** — your "fix" may already be in the working tree.

**Do NOT run `git checkout`/`git reset --hard`/`git stash`/`git clean`** on tracked files to "get a
clean baseline" — you can destroy unrelated working-tree implementation.

See `AGENTS.md` §3 + §5 for the full picture.

---

## 2. I get attacked on spawn / friendlies hostile

**Symptom:** Player jumps into a sector (especially high-sec) and is swarmed/fired on by lawful patrols or many enemies despite zero wrongdoing. OR a friendly/lawful NPC shows hostile on the radar.

**This bug is subtle and has THREE interacting factors. Read all of this before grepping.**

### Factor 1 — Selection and execution are separate authorities

`src/ai/engagementAuthority.js` owns the fresh hostility oracle
`isHostileForAI(state, self, other)` and the final fail-closed execution gate
`authorizeAIEngagement(...)`. `src/systems/aiPorts.js` consumes the oracle while building tactical
contacts; it is not the policy owner.

The oracle handles explicit incident/retaliation targets, faction first-fire authority, same-team
rules, player-facing scanner hostility, passive/civilian status, and lawful/WANTED behavior. The
execution gate then revalidates authored motive, escalation trigger, response time, doctrine phase,
leash/jurisdiction, station protection, and the first-session attacker cap. A target can therefore be
selected as tactically relevant and still be forbidden to fire.

Do not repair spawn attacks by adding another team check to weapons or by changing spawn counts.
Trace the denial/allow reason at the final authority first.

### Factor 2 — Squad voting is advisory but stale contacts still mislead movement

Even with the gate working, the squad target-vote at `src/ai/squad.js:271-273` has a fallback:

```js
const teamMismatch = contact.team != null && perception.self.team != null && contact.team !== perception.self.team;
const hostile = contact.hostile === true || (contact.hostile !== false && teamMismatch && contact.threat > 0);
if (hostile) record.hostileVotes++;
```

The second clause means an incomplete contact can receive a hostile vote when team differs and threat
is positive. That vote may distort formation, pursuit, or focus selection, but it does not bypass
`authorizeAIEngagement` at the damage/fire boundary. Check that every contact builder writes an
explicit boolean `hostile` and derives threat through `isHostileForAI`; then separately inspect the
final authorization reason for any actual shot.

### Factor 3 — The team-number model (undocumented until now)

Set at spawn, never changes:
- **team 0** = player + wingmen (`ships.js` `makeShipEntitySpec` default; `wingmen.js`)
- **team 1** = ALL combat-spawned enemies, **including lawful patrols AND fleeing traders** (`combat.js:70` `makeEnemySpawnSpec` hardcodes `team:1`; `ai.lawful = !!def.factionLawful` at line 111 is a separate flag)
- **team 2** = ambient civilian traffic (`traffic.js` all `team:2`, marked `ai.passive`)

So lawful patrols can share the coarse combat team with raiders. Explicit incident targets and the
engagement authority—not team number alone—decide whether they may attack.

### The spawn → aggro flow (for context)

1. **Spawn and authored motive:** world/encounter code chooses actor, location, faction, doctrine,
   motive, trigger, telegraph, and initial activity.
2. **Perception:** `aiPorts.js` calls `isHostileForAI` and writes normalized contact hostility/threat.
3. **Squad/director:** advisory layers choose formation, objective, and candidate focus.
4. **Action/damage boundary:** `authorizeAIEngagement` revalidates the current target and returns a
   named allow/deny result before an offensive action can land.
5. **Presentation:** telegraph and response-window evidence must exist before the authorized fire
   phase; absence is a behavior bug even if damage is technically gated.

### How to actually debug this in one pass

1. Inspect the actor's authored `motive`, `engagementTrigger`, `approachTelegraph`, activity start,
   doctrine/phase, leash/zone, lawful/passive flags, incident target, and station context.
2. Record `isHostileForAI` and `authorizeAIEngagement` results for the exact actor/target/tick.
3. Verify `contact.hostile` is explicit and threat is zero when the oracle says non-hostile.
4. Verify the player received the authored response window and a readable reason before fire.
5. Run the focused law/authority, intentionality, doctrine, and spawn-opening checks named in
   `package.json`, plus a normal public-route reproduction. Do not rely on a headless green alone.

### The dead `ai.playerWanted` field

Do not add a second wanted-state writer to AI records. The canonical player WANTED state is owned by
`heat` and read via `isPlayerWanted(state)`; confirm any legacy compatibility field before trusting it.

---

## 3. My new ship/station model doesn't render

**Symptom:** You added a `.glb`, but the ship looks like a generic placeholder, or invisible, or wrong. No console error.

**Full visual asset catalog (what's live vs reference vs blocked):** `assets/AGENTS.md` §1–§2.

**Root cause:** The asset pipeline is a **5-step chain with 3 separate registries**, and a broken model **fails silently** (`assetLoader.js:117-125` catch → records failure → returns null → `partsLibrary` falls back to procedural geometry → no throw, no log on screen).

### The 5-step pipeline

| Step | What | File/script |
|---|---|---|
| 1. Author | Sculpt in Blender | `assets/ships/parts/blender/*.blend` |
| 2. Export to source | Raw GLB, PNG textures, uncompressed | `assets/ships/parts/<category>/<id>.glb` |
| 3. Finalize (stamp metadata) | Stamps `spacefaceAsset` extras, bakes textures, ensures tangents, audits hull tris (≥800) | `tools/art/finalize_whole_ship.mjs` (npm `build:whole-ships`) / `finalize_part.mjs` |
| 4. Build release (compress + manifest) | meshopt + KTX2; writes release GLB + `release_manifest.json` | `scripts/build-sg04-release-assets.mjs` |
| 5. Runtime load | Fetch + validate contract; null on failure → procedural fallback | `src/render/assetLoader.js` ← `src/render/partsLibrary.js` |

**Runtime loads from RELEASE** (`assets/ships/release/parts/`), not source. `releaseMode.js:1-4` defaults release mode ON; `partsLibrary.js:497` uses `PART_RELEASE_ROOT`.

### The 3 registries (all three, or it won't load)

1. **`assets/ships/parts/parts_manifest.json`** — authoring contract; `parts[]` entry + `runtimeSlots.<category>`. Drives the release build.
2. **`assets/ships/release/release_manifest.json`** — release parity manifest. Auto-written by `build-sg04-release-assets.mjs`.
3. **`src/render/partsLibrary.js`** — runtime declaration. Modular definitions use
   `PART_LIBRARY_CONTRACT.slots.<category>` and `HULL_FILE_BY_DEF_ID`; production whole bodies use
   `WHOLE_SHIP_FILE_BY_DEF_ID`. The current map routes Kestrel and Wasp whole-ship bodies, while
   other ship definitions remain modular unless deliberately promoted.

### The shipId→GLB link lives in partsLibrary.js, NOT ships.js

`src/data/ships.js` defines gameplay stats. `partsLibrary.js` owns both modular hull and production
whole-body routing; inspect the exact `defId` in both maps before assuming which representation loads.

### Ranked failure modes

1. **Forgot the release build** — dropped GLB in `parts/` but never ran `npm run build:whole-ships` + `build-sg04-release-assets.mjs`. Runtime fetches `release/parts/...glb` → 404 → silent fallback. **#1 trap.**
2. **Missing `spacefaceAsset` metadata** — finalize skipped; assetLoader rejects it (`assetLoader.js:114` `validateWholeShipGlbJson`, `:117-125`). Use `getAuthoredAssetDiagnostic(renderer, url)` to see the actual error.
3. **Failed hull-body audit** — the whole-ship finalizer rejects accessory-only exports with no
   credible hull body. Check the current finalizer and exact manifest record; do not carry an old
   family-wide blocked claim forward after a ship has been re-exported and accepted.
4. **Missing `parts_manifest.json` entry** — `build-sg04-release-assets.mjs` won't include it.
5. **Missing `partsLibrary.js` runtime declaration** — even with a perfect release GLB, the runtime
   never requests an unregistered asset. Add a whole-ship route only after exact manifest,
   classification, framing, and normal-route validation; otherwise retain the modular route.
6. **Missing `ships.js` defId mapping** — a new ship id with no partsLibrary entry gets a seed-pick hull.
7. **Texture/contract violations** — wrong normal convention (OpenGL green-up), wrong ORM order (R=AO, G=Roughness, B=Metallic), un-chamfered hard edges. All silently rejected.

### To add a new modular part that renders in ONE pass

1. Author + export to `assets/ships/parts/<category>/<id>.glb`.
2. `node tools/art/finalize_part.mjs` (stamps metadata, bakes textures).
3. Add a `parts[]` entry + `runtimeSlots.<category>` in `assets/ships/parts/parts_manifest.json`.
4. Add the file string to `PART_LIBRARY_CONTRACT.slots.<category>` in `src/render/partsLibrary.js`.
5. `node scripts/build-sg04-release-assets.mjs`.
6. Verify: `npm run check:assets:live` + `npm run check:asset-reachability`.

### Detection commands

- `npm run check:assets:live` — boots Chrome, loads a seeded flight, asserts authored ships render (not fallback). Currently 66/66 pass.
- `npm run check:asset-reachability` — scans src/+styles/ for referenced-but-unbundled assets.
- `npm run check:visual-stability` — 360 sampled frames, no flicker/blank surfaces.
- `getAuthoredAssetDiagnostic(renderer, url, slot)` in `assetLoader.js` — returns the actual contract failure for a specific URL.

### Ownership signals (do not touch `assets/**` or `src/render/**` while active)

`assets/ships/release.__lock/`, `release.__building/`, `release.__previous/`. See `assets/AGENTS.md`.

---

## 3b. After "wire up all assets," the player ship is a turd / floating accessories

**Symptom:** You (or another agent) ran a "make sure all assets are loaded" pass. Now the main ship renders as a low-detail blob, or as floating antennas/canopy with no body.

**Root cause — reachability is not visual acceptance, and file size proves neither.** A whole-ship
candidate can be contract-valid yet badly framed, accessory-heavy, materially weak, or wrong for its
role. Conversely, an older family-wide warning may be stale after a production re-export. Inspect
the exact manifest ID, provenance/classification record, release route, and current captures.

Kestrel and Wasp currently have production whole-ship routes. Other definitions and candidates have
different states; do not copy a status from one family member to another.

**Before wiring an asset, always check its manifest entry:**
```bash
node -e "const m=require('./assets/ships/parts/parts_manifest.json'); console.log(m.parts.filter(p=>p.file.includes('<your-file>')))"
```
If the exact record is blocked, fix and reclassify that export before routing it. If it is accepted,
still verify the normal player camera, silhouette, materials, lighting, attachments, and LOD behavior.
Run the asset-status/reachability/live/stability gates and inspect same-framing browser/Electron
captures. Never bypass a failing classification, and never assume a green loader makes the art good.

---

## 4. Game refuses to start

**Symptom:** Console error "Authored ship asset library did not preload; refusing to start flight with procedural fallback ships" (or "Initial authored ship visuals did not become ready"). New Game hangs or returns to menu.

**Root cause:** This is **intentional, not a bug.** `src/main.js:196-199, 203-206, 216-223` hard-gates entering flight until authored assets are ready (`waitForAuthoredPartLibrary`, `waitForInitialAuthoredVisuals`, `waitForRenderPipelineWarmup`). The game **refuses to silently degrade to procedural-fallback ships.**

**Do not weaken these gates.** If you're hitting this, the asset pipeline is broken — fix the asset (see §3), don't lower the bar. The readiness signal is `ship.mesh.userData.authoredAssetState === 'authored'` for every live ship (`main.js:291-313` `authoredVisualReadiness`).

---

## 5. Friendlies labeled as heat / threat

**Symptom:** Comms/UI/radar text calls a friendly "heat," or radar IFF shows a friendly as hostile.

**Root cause — "heat" means THREE DIFFERENT THINGS:**

| Concept | What it is | Owner file | Field |
|---|---|---|---|
| **WANTED heat** (player criminality) | 0..1 scalar — how hard the law hunts the player. Raised by `faction:aggro`. Gates lawful hostility via `isPlayerWanted`. | `src/systems/heat.js` | `state.player.heat` (`WANTED_THRESHOLD = 0.15` line 33) |
| **Weapon heat** (gun overheat) | Per-weapon accumulator; pegs → vent lockout. | `src/systems/weapons.js` | `w._heat`, `runtime.heat` |
| **Sector danger index** (offscreen sim) | 0..1 difficulty for economy drift + spawn sizing. NOT combat threat. | `src/data/sectors.js:254` `dangerIndex()`, kernel `src/systems/dangerModel.js` | `node.danger` |

`heatFraction` in AI sensor frames (`aiPorts.js:~487`) is **weapon** heat, not WANTED heat — another trap.

**If "lawful patrol shows hostile on radar":** that's §2 — the radar/IFF reads the AI's hostility classification. Fix the hostility gate/fallback and the radar follows.

**If comms/UI text literally calls a friendly "heat":** it's a copy/label bug pulling the wrong field. Check `src/ui/comms.js`, `src/ui/radar.js` IFF rendering, `src/data/enemies.js` labels. Canonical wanted check: `heat.isPlayerWanted(state)` (`heat.js:147`), NOT `ai.playerWanted` (dead field).

---

## 6. I changed a faction/rep number and combat didn't react

**Symptom:** You tuned faction rep / aggro thresholds in `factions.js`/`factions` data, and combat behavior didn't change.

**Root cause:** The live combat AI decides hostility via `aiPorts.isHostile` — which reads `ai.lawful` + team + (via `isPlayerWanted`) `state.player.heat`. **It does NOT read raw `state.factions[id].rep` or the `aggro` flag directly.**

**What faction rep/aggro DOES affect:**
- Docking access (`world.js` / station interaction)
- Reputation-gated missions (`missions.js`)
- The WANTED path: `factions.applyRep` emits `faction:aggro` → `heat.js` raises `state.player.heat` → `world.js:~606` spawns WANTED hunters + `isPlayerWanted` flips lawful hostility.

So rep affects combat **indirectly** through heat. If a design deliberately adds direct faction
first-fire rules, route them through `engagementAuthority.js`; squad voting remains advisory.

---

## 7. My perf fix made the frame worse / browser diverged

**Symptom:** A "performance optimization" made frames worse, or browser vs Electron look/behave differently.

**Root cause:** You violated the performance policy — silently lowered visible quality, disabled an authored asset, or made browser/desktop diverge. Forbidden (`AGENTS.md` §Performance).

**Do this instead:**
1. **Measure before/after** (`npm run check:perf`, `npm run check:flight:clean`). Keep screenshots for render changes.
2. **Prefer structural fixes:** batching, instancing, cache reuse, allocation reduction, frame pacing, avoiding duplicate system work.
3. **Don't roll assets back** to "fix" a graphics conflict during active graphics work — report and leave the graphics lane untouched.

**Specific traps:**
- Removing or banning a visual technique without first attributing its current compositor/GPU cost.
- Per-frame allocations in update loops instead of scratch reuse or bounded pooling.
- Changing bloom/exposure globally without representative material and same-framing review.
- Letting shader precompile coverage drift from the live pooled VFX/material variants.

See `design/PERF_BUDGET.md` and read the current performance artifact; dated numbers in prose are not
the performance truth.

---

## 8. The sim/hash check broke after my change

**Symptom:** `npm run check:sim:compare` reports `hashEqual:false` after your change.

**Root cause:** You changed a sim path affecting determinism. Expected for legitimate sim-shape changes; the question is whether it's *intended*.

**Rules:**
- **Never edit `test/*.expected.json` to pass.** Fix the code, or flag the golden for a deliberate re-record batch.
- All RNG in sim uses `state.rng` / sector-seeded `hash32` — never `Math.random()`.
- Wall-clock time in sim forbidden — use `state.simTime`.
- The `typeof window` heat vent in `weapons.js:31` preserves determinism — don't "fix" it.
- `canonicalStringify` (`simSnapshot.js`) is the hash basis — changing serialization breaks all goldens.

**Current known-stale goldens:** the 47a goldens are stale by design — sim state shape grew (scanner, discovery, tether runtime, mining seams) and Mining 2.0's fracture changed how the recorded tape plays out, tripping the "should exercise projectile collision" coverage precondition. Determinism itself held at every same-shape comparison (`hashEqual:true`, `firstDivergentTick:null`). The re-record is a deliberate named batch (see `design/BUILD_PLAN_2_0.md` "Golden/tape note"). The hashEqual:true comparison (same shape) is the pass bar while pending.

**If your change is a legitimate sim-shape change:** describe in your PR how you preserved or will re-record goldens.

---

## 9. The Massline breaks during ordinary piloting

**Symptom:** A healthy standard Massline snaps after thrust, boost, a slack catch, reel timing, a
reversal, or an ordinary ship/asteroid maneuver. A check treats that snap as desirable.

**This is a regression.** `tether_standard` is normal-play infrastructure, not a timing consumable.
Its base physical envelope is 10× the earlier 1.05M / 19k / 15k tune, and ordinary endpoints do not
enable automatic load breaks. Pilot cut, destroyed/disabled attachment ownership, target loss, and
other intentional severing paths remain valid.

The only reserved automatic overload seam is an explicitly authored future extreme-load endpoint
with `data.masslineBreakPolicy === 'extreme_overload'` (for station-scale or singularity-scale work).
Do not add that flag to ordinary ships, asteroids, payloads, or World Site recovery targets.

**Owning path:**

- `src/data/combatDefs.js` — `tether_standard` envelope and `automaticBreakPolicy`.
- `src/combat/attachments.js` — endpoint opt-in, frozen policy, and old-save rebase.
- `src/core/constraints/masslineController.js` — automatic-break authority and overload debt.
- `scripts/check-sg02-tether-resilience.mjs` — production `action_attach` resilience plus the explicit
  extreme-endpoint break leg.
- `scripts/check-sg06-live-tether-resilience.mjs` — real slack-catch/dash acceptance.

Run `npm run check:massline`, `npm run check:m1:tether-mass`,
`npm run check:sg06:tether-resilience`, `npm run check:core:first-ten-minute`, and
`npm run check:sim:compare`. Never restore a desired-break test for a normal standard line.

---

## 10. Check-tooling traps

Historical incidents with the `check:*` tooling. None of these need to be carried in mind every
turn; they explain the *shape* of the check commands and what a misleading result looks like. Reach
for this section when a check result surprises you.

### 10a. An invisible link is worse than a red one (deleted `precheck` lifecycle hook)

Until 2026-07-27, `package.json` defined a `precheck` npm **lifecycle** script. npm runs lifecycle
hooks automatically, so `npm run check` silently ran three extra gates first — and when one of them
went red, `check` exited 1 having executed **zero** of its own links, for 333 commits, while looking
like an ordinary check failure. That hook is now deleted and its three gates are the first three
links of `check` itself, where you can see them.

If you ever add a `pre*` or `post*` npm script here, you are re-creating that bug.

### 10b. A fail-fast aggregate under-reports

`check:massline` runs 23 children with a fail-fast loop, so it names only the first red one. On
2026-07-27 it had three. **If an aggregate says one thing is broken, that is a lower bound, not a
count.** Run the children individually or use `check:all` to see the full picture.

### 10c. `check:sim:compare` is not a correctness check

A green `check:sim:compare` does not mean the golden is current. `sf-sim compare` returns ok whenever
the two runs agree with *each other*; `scripts/sf-sim.mjs` tolerates `expectedHash` and
`expectedTraceCount` diffs against the expected envelope. It is a **determinism** check, not a
**correctness** check. Only `check:sim` / `check:sim:v3` (the `--hash --expect` path) gate
`test/47a.telemetry*.expected.json`.

### 10d. When a sim golden hash fails, run the diff tool before re-recording

Do not re-record `test/*.expected.json` just to pass. Run `node scripts/sim-golden-diff.mjs` first
(add `--flight-system v3` for the V3 envelope). It exports a reference commit with `git archive`
(read-only, no checkout, safe while other agents hold the working tree), runs the sim on both trees,
diffs the snapshots, and answers the only question that matters:

- **`IDENTICAL`** — nothing moved.
- **`CONTENT_ONLY`** — zero entity `pos`/`vel`/`rot`/`angVel`/`prevPos` fields changed. The physics
  and flight contract is bit-identical and a re-record is bookkeeping. Write the by-key breakdown and
  the words "zero motion fields changed" into the expected file's `notes`.
- **`MOTION_CHANGED`** — something moved differently. If you did not mean to change flight, physics,
  or weapons behaviour, that is a **regression** and re-recording would bury it.

Nine tenths of the churn in that hash is the economy price-cycle table, which is not physics at all,
so "the hash changed" is never by itself a reason to do anything. The verdict is.

---

*Found a bug that took multiple prompts to diagnose? Add a section here so the next agent doesn't repeat the hunt. Verify claims against the working tree (`git diff`) before writing them — HEAD drifts behind.*
