# SpaceFace Common Bugs — Debugging Playbooks

> **What this is:** playbooks for the bugs agents keep failing to fix. Each names the exact files,
> functions, and line numbers — and the *wrong* place agents usually look first.
> Companion to `AGENTS.md` §7 (common-bug routing) and `docs/MODULE_MAP.md`.
>
> **Every claim here was verified first-hand against the working tree on 2026-07-05.** Where the
> working tree and HEAD (committed) differ, that is called out — the divergence is itself a bug source.
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

---

## 1. My fix didn't apply / nothing changed

**Symptom:** You made an edit, the game still behaves the old way. No error.

**There are now TWO likely root causes. Check both before doing anything else.**

### Cause A — You edited a legacy file (the classic trap)
The engine has flag-selected backend swaps. Defaults pick V3/tactical, but docs and file *names* point at legacy.

**The wrong files (editing these has no effect in normal play):**
- `src/systems/flight.js` — legacy flight controller
- `src/systems/ai.js` — legacy AI FSM (**zero importers anywhere**)
- `src/core/flightDynamics.js` — legacy flight math (still imported by `aiPorts.js` for compat, but not by the live flight controller)

**The right files (LIVE — defaults `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`):**
- `src/systems/flightV3.js` + `src/core/flight/` (propulsionCatalog, propulsionKernel, flightTelemetry)
- `src/systems/tacticalAI.js` + `src/ai/*` + `src/systems/aiPorts.js`

**Selection site:** `src/core/registry.js:170-186`. **Confirm before editing:** `grep -rl "systems/<file>" src/ scripts/ test/` — if nothing imports it, it isn't running.

### Cause B — The fix already exists in the uncommitted working tree (the new trap)
`git status` shows ~202 files / ~17k insertions uncommitted. An agent reading HEAD or a stale clone sees an older, buggier game. **Before diagnosing, run `git diff <file>` and `git log -L <func>,<func>:<file>`** — your "fix" may already be there. If so, the bug you're chasing is elsewhere.

**Do NOT run `git checkout`/`git reset --hard`/`git stash`/`git clean`** on tracked files to "get a clean baseline" — you will destroy ~17,000 lines of uncommitted work.

See `AGENTS.md` §3 + §5 for the full picture.

---

## 2. I get attacked on spawn / friendlies hostile

**Symptom:** Player jumps into a sector (especially high-sec) and is swarmed/fired on by lawful patrols or many enemies despite zero wrongdoing. OR a friendly/lawful NPC shows hostile on the radar.

**This bug is subtle and has THREE interacting factors. Read all of this before grepping.**

### Factor 1 — The lawful+heat gate EXISTS in the working tree (but not in HEAD)

The live hostility oracle is `src/systems/aiPorts.js:784` `isHostile(state, self, other)`. **In the working tree** it is NOT just `team !== team` — it has the lawful gate:

```js
function isHostile(state, self, other) {
  if (!self || !other || self.team == null || other.team == null) return false;
  if (self.id === other.id || self.team === other.team) return false;
  const selfIsPlayer = !!(state && self.id === state.playerId);
  const otherIsPlayer = !!(state && other.id === state.playerId);
  const selfAi = self.data && self.data.ai || {};
  const otherAi = other.data && other.data.ai || {};
  if (selfAi.passive || otherAi.passive || self.team === 2 || other.team === 2) return false;  // line 793
  if (selfAi.lawful && otherIsPlayer) return isPlayerWanted(state);  // line 794 ← THE GATE
  if (otherAi.lawful && selfIsPlayer) return isPlayerWanted(state);  // line 795
  return self.team !== other.team;
}
```

So a lawful patrol (`ai.lawful:true`) should only attack the player if `isPlayerWanted(state)` returns true (`state.player.heat >= 0.15`, `heat.js:147,33`).

**BUT in HEAD (committed) this gate does not exist** — `isHostile` was just `self.team !== other.team`. So if you are reading committed code (or a stale clone, or HEAD after a partial revert), you will see lawful patrols attack unconditionally and "fix" something that's already fixed in the working tree. **Always `git diff src/systems/aiPorts.js` first.**

### Factor 2 — The squad fallback clause can override the gate

Even with the gate working, the squad target-vote at `src/ai/squad.js:271-273` has a fallback:

```js
const teamMismatch = contact.team != null && perception.self.team != null && contact.team !== perception.self.team;
const hostile = contact.hostile === true || (contact.hostile !== false && teamMismatch && contact.threat > 0);
if (hostile) record.hostileVotes++;
```

The second clause (`contact.hostile !== false && teamMismatch && contact.threat > 0`) means: **if `contact.hostile` is undefined (not explicitly set true/false) AND there's a team mismatch AND `contact.threat > 0`, vote hostile anyway.**

Normally this is safe because `contact.hostile` IS set explicitly (`aiPorts.js:514,525`) and `threatFor` returns 0 when `!isHostile(...)` (`aiPorts.js:778-782`). But if any code path builds a contact WITHOUT setting `hostile` explicitly, OR computes threat independently of `isHostile`, the fallback can vote a lawful patrol hostile despite the gate. **This is the likely real bug if the gate is in place but the symptom persists.** Check: is `contact.hostile` always set? Is `threatFor` always gated on `isHostile`?

### Factor 3 — The team-number model (undocumented until now)

Set at spawn, never changes:
- **team 0** = player + wingmen (`ships.js` `makeShipEntitySpec` default; `wingmen.js`)
- **team 1** = ALL combat-spawned enemies, **including lawful patrols AND fleeing traders** (`combat.js:70` `makeEnemySpawnSpec` hardcodes `team:1`; `ai.lawful = !!def.factionLawful` at line 111 is a separate flag)
- **team 2** = ambient civilian traffic (`traffic.js` all `team:2`, marked `ai.passive`)

So lawful patrols are `team:1` + `ai.lawful:true`. The gate (Factor 1) is what makes team:1 lawful NPCs not attack a clean player. If the gate is missing (HEAD) or the fallback fires (Factor 2), team:1 alone is enough to trigger hostility.

### The spawn → aggro flow (for context)

1. **Spawn** (`src/systems/world.js:_spawnEnemies` ~line 584): sizes spawn count; pool by sector security. High-sec pool is `LAWFUL_ENEMIES = ['patrol_lawman']`. The WANTED-hunter block (~line 606) correctly gates on `player.heat >= 0.15` — but ambient patrol spawns are NOT heat-gated; they rely on the AI-side gate.
2. **Enemy construction** (`combat.js:65 makeEnemySpawnSpec`): `team:1` (line 70), `ai.lawful = !!def.factionLawful` (line 111).
3. **Hostility** (`aiPorts.js:784 isHostile`): Factor 1 above.
4. **Contact building** (`aiPorts.js:514`): `hostile = isHostile(...)`, `threat = threatFor(...)` (0 if not hostile).
5. **Squad vote** (`squad.js:271-273`): Factor 2 above. `selectFocusTarget` (line 289) picks focus from `hostileVotes > friendlyVotes`.
6. **Firing** (`weapons.js` NPC path): services every ship with `intent.fire`. No additional lawful gate on the NPC firing path — it trusts the AI's directive.

### How to actually debug this in one pass

1. `git diff src/systems/aiPorts.js` — is the lawful gate present? If not, you're on HEAD; the working tree already fixes it.
2. If the gate IS present and the symptom persists: instrument `squad.js:272` — log when the fallback clause fires (i.e. `contact.hostile` is undefined) for a lawful contact. That's your leak.
3. Verify the contact's `hostile` field is explicitly `false` (not undefined) for lawful-not-wanted patrols — if it's undefined, find the contact-builder path that omitted it.
4. Regression floor: `npm run check:sg06:ai` (100 runs × 600 ticks) must stay green; add a scenario spawning a lawful patrol with `player.heat = 0` asserting it does NOT fire within N ticks.

### The dead `ai.playerWanted` field

`ai.playerWanted` is **read** in a few places (e.g. legacy `ai.js`, `weapons.js:~552` player auto-fire) but **never written anywhere** (grep confirms zero assignments). The gameState.js comment (line 31-34) describes the *intent* ("drives the lawful playerWanted AI flag") but the implementation reads heat live via `isPlayerWanted` instead. **Do not try to "wire up" `playerWanted` — use `heat.isPlayerWanted(state)`.**

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
3. **`src/render/partsLibrary.js`** — runtime declaration. **For modular parts:** `PART_LIBRARY_CONTRACT.slots.<category>` (~line 115). **For ship-specific hulls:** `HULL_FILE_BY_DEF_ID` (line 202) — this is the LIVE path. **`WHOLE_SHIP_FILE_BY_DEF_ID` (line 220) is currently EMPTY** — whole-ship bodies are disabled until SPEC3-37.

### The shipId→GLB link lives in partsLibrary.js, NOT ships.js

`src/data/ships.js` defines gameplay stats only. `partsLibrary.js:202` `HULL_FILE_BY_DEF_ID` maps `ship_kestrel → 'hulls/hull_starter.glb'`, etc.

### Ranked failure modes

1. **Forgot the release build** — dropped GLB in `parts/` but never ran `npm run build:whole-ships` + `build-sg04-release-assets.mjs`. Runtime fetches `release/parts/...glb` → 404 → silent fallback. **#1 trap.**
2. **Missing `spacefaceAsset` metadata** — finalize skipped; assetLoader rejects it (`assetLoader.js:114` `validateWholeShipGlbJson`, `:117-125`). Use `getAuthoredAssetDiagnostic(renderer, url)` to see the actual error.
3. **Failed hull-body audit** — `finalize_whole_ship.mjs:155-156` requires ≥800 tris from `Material_Hull` meshes. If you only exported accessories (antennas, decals, canopy), finalize throws `wholeship:missing hull body`. (Current `assets/QUEUE.md` blocker for Kestrel/Pelican/Wasp.)
4. **Missing `parts_manifest.json` entry** — `build-sg04-release-assets.mjs` won't include it.
5. **Missing `partsLibrary.js` runtime declaration** — even with a perfect release GLB, if it's not in `PART_LIBRARY_CONTRACT.slots.<cat>` OR `HULL_FILE_BY_DEF_ID`, the runtime never requests it. **Do NOT add to `WHOLE_SHIP_FILE_BY_DEF_ID` — it's intentionally empty until SPEC3-37.**
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

**Root cause — file size does NOT distinguish a good model from a broken export.** The repo carried three 10-14MB wholeship GLBs (`kestrel.glb` 14.2MB, `pelican.glb` 10.8MB, `wasp.glb` 10.6MB) that **look like the real detailed models** but are actually **broken exports**: accessory meshes only (antennas, canopies, decals, cargo clamps), **NO `Material_Hull` body**. The 14.2MB kestrel is 14,916 triangles — all of it antenna/canopy detail, zero hull. An agent sees the big file, assumes it's the good model, wires it into `WHOLE_SHIP_FILE_BY_DEF_ID`, and the ship becomes floating accessories.

**The fix is already in place — use it:**
- `parts_manifest.json` `parts[]` now carries a **`status`** field. The three wholeships are marked `"status": "blocked"` with a `statusNote` explaining why.
- **`npm run check:asset-status`** fails if any `status:"blocked"` asset becomes reachable from `HULL_FILE_BY_DEF_ID` / `WHOLE_SHIP_FILE_BY_DEF_ID`. Run it after ANY asset wiring change.

**Before wiring an asset, always check its manifest entry:**
```bash
node -e "const m=require('./assets/ships/parts/parts_manifest.json'); console.log(m.parts.filter(p=>p.file.includes('<your-file>')))"
```
If you see `status: "blocked"`, **do not wire it** — it's a known-broken export. Re-export from Blender with a real `Material_Hull` body (≥800 hull tris) first.

**Why default play uses the "smaller" modular hulls:** the modular `hulls/hull_*.glb` files (1.0-1.5MB, 2,800-4,400 tris) are **complete, contract-valid ship bodies** with real hull meshes. The wholeships are bigger files but broken. Until SPEC3-37 re-exports the wholeships with hull bodies, the modular hulls are the correct, good-looking default — `HULL_FILE_BY_DEF_ID` (partsLibrary.js:202) wires them and that is correct.

**The detection is now machine-enforced:** `check:asset-status` catches the exact mistake that produced the turd. If you're asked to "wire up assets" and that check fails, the failing asset is blocked on purpose — fix the export, don't bypass the check.

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

So rep affects combat **indirectly** through heat. If you want rep to affect combat more directly, the wiring point is `aiPorts.isHostile` (or the squad vote) — it's not there today.

---

## 7. My perf fix made the frame worse / browser diverged

**Symptom:** A "performance optimization" made frames worse, or browser vs Electron look/behave differently.

**Root cause:** You violated the performance policy — silently lowered visible quality, disabled an authored asset, or made browser/desktop diverge. Forbidden (`AGENTS.md` §Performance).

**Do this instead:**
1. **Measure before/after** (`npm run check:perf`, `npm run check:flight:clean`). Keep screenshots for render changes.
2. **Prefer structural fixes:** batching, instancing, cache reuse, allocation reduction, frame pacing, avoiding duplicate system work.
3. **Don't roll assets back** to "fix" a graphics conflict during active graphics work — report and leave the graphics lane untouched.

**Specific traps:**
- **`backdrop-filter: blur()`** — forbidden. Use opaque `rgba(5,9,18,.88)` panels.
- **Per-frame allocations** in update loops — preallocate scratch.
- **Bloom strength > 0.9** — raise per-material `emissiveIntensity` instead.
- **`EVENT_LIGHT_POOL_SIZE`** in `vfx.js` — shader cache key; `precompile.js` must warm against exactly that count.

See `design/PERF_BUDGET.md`. Known-red: `check:perf` strict 60fps p95 is 16.9ms vs 16.7ms target — polish, not asset failure.

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

*Found a bug that took multiple prompts to diagnose? Add a section here so the next agent doesn't repeat the hunt. Verify claims against the working tree (`git diff`) before writing them — HEAD drifts behind.*
