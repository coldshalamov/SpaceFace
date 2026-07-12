# Depth Program — actualization pipelines for SpaceFace

**Status:** PLAN · **Authority:** dispatch program (below `GDD_2_0.md`, `design/spec2/00_MASTER_TASTE.md`, `ARCHITECTURE.md`, and any live `design/spec3/` thread). This folder *references* live specs; it does not override them.
**Reads (in order):** `AGENTS.md` §1, §3, §5, §6, §10 · `design/spec2/00_MASTER_TASTE.md` (taste constitution — its Forbidden list rejects diffs) · this file · then the specific pipeline doc you're dispatched on.

---

## 1. Why this program exists

The engine, systems, and data layers are over-built relative to the art and gameplay-*actualization* layers. The single biggest source of "the game feels repetitive" is **not** a missing system — it is **latent content that already exists as data, prose, or definitions but is not yet actualized** into things the player sees, flies to, and does.

Three actualization gaps, on separate axes, compound:

| Axis | What's latent (exists, unused) | What's missing (the actualization) | Pipeline |
|---|---|---|---|
| **Spatial** | 8 factions with distinct identity (`src/data/factions.js`), 24 sectors with named zones ("Cruiser Graveyard," "Iron Maw Approach"), 13 ship defs | Distinct *art* — factions share station skins, sectors dress from ~13 shared prop meshes, 12/13 ships share 10 hull meshes | **P1 Landmarks**, **P3 Faction Kits**, (whole-ship bodies via existing graphics lane) |
| **Narrative** | 8-beat story spine (`src/data/missions.js:212-229`), 5 endings, 17 campaign-47a beats, 10 contacts, 23 worldbuilding docs | *Deeper playable embodiment* — the spine is partially embodied already (`src/story/campaign47a/`) but beats are thin and under-staged | **P2 Story-Beat Embodiment** |
| **Structural** | A 3,170-line mission engine (`src/systems/missions.js`) with 10 archetypes, all single-stage fetch/kill/scan | *New mission shapes* — no multi-stage set-pieces; every activity collapses to one threshold check | **P4 Set-Piece Mission Types** |

A story beat that happens in a station that looks like every other station doesn't land. The spatial and narrative axes **compound**. This program runs them together.

---

## 2. The four pipelines (at a glance)

| # | Pipeline | Axis | Per-iteration output | Parallelizable? | Payoff |
|---|---|---|---|---|---|
| **P1** | Sector Signature Landmarks | spatial | 1 hero landmark GLB + placement wiring for a named zone | YES (one agent per landmark) | Places become place-y; stages P2 beats |
| **P2** | Story-Beat Embodiment | narrative | 1 deepened playable story beat (extends the existing 47-A pattern) | YES after the template beat lands | Highest narrative ROI |
| **P3** | Faction Visual Identity Kit | spatial | 1 faction's station livery (runtime tint + optional hero silhouette) | YES (one agent per faction) | Kills "same station everywhere" — biggest spatial-ROI |
| **P4** | Set-Piece Mission Types | structural | 1 new structurally distinct mission *type* (boarding, blockade run, etc.) | NO (bespoke, small batch of 3–5) | Fixes the activity-shape gap no art fixes |

---

## 3. Sequencing — how to run them

**The compounding move is to run P1 (landmarks) and P2 (story beats) together**, with P3 (faction kits) layered on. They feed each other:

- P1 makes the *places* P2 stages beats in.
- P2 gives the P1 landmarks *something to do* (a story beat set at the landmark).
- P3 makes the stations those beats happen in read as faction-owned.
- P4 is a small, one-time, high-leverage batch. Slot it in whenever; it pays forever because each new *type* creates a *class* of content the generator fills.

```
P1 Landmarks ─┬─► stages ──► P2 Story Beats
              └─► tints  ──► P3 Faction Kits
P4 Mission Types (parallel, independent — new activity shapes)
```

**Recommended first dispatch (the "demo" batch):**
1. P1 first worked example: the **Cruiser Graveyard** landmark (`zone_io_derelict`, `sector_io_reach`) — already promised, currently uses generic `place_dead_hulk`.
2. P2 first worked example: deepen **Beat 2 `first_blood`** (already has the richest embodiment — Elroy, scan→tether, aftermath) as the *template* other beats copy.
3. P3 first worked example: a **runtime faction livery** wiring (no new GLB) for `faction_vael`, the most visually distinct faction (alien, green-cyan) — proves the cheap path before any hero-station sculpting.
4. P4: spec only in the first pass (this doc). Dispatch after P2 template lands so set-piece missions can reuse the staging vocabulary.

**The mistake to avoid:** running whole-ship bodies (existing graphics lane) or new sector *breadth* before P1+P3 differentiate what exists. More samey places and ships deepens the repetition — you'd just have *more* of them to fly through indistinguishably.

---

## 4. Shared rules (apply to every pipeline)

These are non-negotiable across all four pipelines. Each pipeline doc restates the ones specific to it.

### Authority & taste
- **Taste constitution governs.** `design/spec2/00_MASTER_TASTE.md` §6 Forbidden list rejects diffs. Non-diegetic HUD only (no visor/cockpit motifs). Read it first every dispatch.
- **Don't contradict the GDD pillars.** This program extends `design/GDD_2_0.md`; it never overrides it.

### Repo safety (from `AGENTS.md` §3)
- **Never run `git checkout .`, `git reset --hard`, `git stash`, `git clean`, `git restore` on tracked files.** The working tree has ~17,000 lines of uncommitted work.
- **`git add -N <newfile>` immediately** when you create a file — this environment deletes untracked files between turns.
- **Commit only when asked. Always stay on `master`.**
- **Before diagnosing a bug, check `git diff`** — your fix may already exist in the working tree.

### Two-implementation awareness (from `AGENTS.md` §5)
- Live flight = `flightV3.js`, live AI = `tacticalAI.js` + `aiPorts.js`, live physics = `rapier-dynamic`. Editing `flight.js` / `ai.js` / `flightDynamics.js` has no effect in normal play.
- For these pipelines: **P2/P4 touch missions/story systems (single implementation each) — no legacy trap. P1/P3 touch `src/render/partsLibrary.js` and `src/systems/world.js` (single paths) — also safe.** But always re-check before editing.

### Determinism is sacred (from `AGENTS.md` §6)
- 60Hz fixed-timestep sim. Never `Math.random()` in sim (use `state.rng`). Never wall-clock in sim (use `state.simTime`).
- Never edit `test/*.expected.json` goldens to make a check pass.
- Any sim-affecting change must say how it preserves or deliberately re-records goldens.

### Concurrent-agent ownership (from `AGENTS.md` §10)
- Do **not** edit `assets/**`, ship manifests, release outputs, or `src/render/**` while a graphics/asset lane is active (look for `assets/ships/release.__lock/`, `.__building/`, `.__previous/`, or a running Blender process) unless the user redirects ownership.
- If you see those lock signals: **STOP and report.** Do not roll assets back to "fix" a conflict.

### Wired Feature Policy (from `AGENTS.md` §6)
- Player-facing features/assets must be **reachable in the default game or intentionally removed.** No "sometimes wired" work. If a landmark or beat isn't good enough for default play, improve it or delete it — don't leave it half-wired.
- Browser and desktop must see the same assets and defaults.

### Acceptance ritual (from `00_MASTER_TASTE.md` §7)
- The pipeline's named acceptance check must be green.
- Plus the no-regression floor: `npm run check:sim:compare` (hashEqual:true is the pass bar while the 47a golden re-record is pending) + `node scripts/check-tether-gameplay.mjs`.
- For anything visual: a screenshot pair into `.devshots/`. **Transcripts are not proof — checks are. Never accept an agent's claim without file evidence.**

---

## 5. Pipeline docs in this folder

- [`P1-sector-landmarks.md`](./P1-sector-landmarks.md) — Sector Signature Landmarks (asset + wiring). **Start here — it is the template the others reference.**
- [`P2-story-beat-embodiment.md`](./P2-story-beat-embodiment.md) — Story-Beat Embodiment (narrative + gameplay).
- [`P3-faction-visual-identity.md`](./P3-faction-visual-identity.md) — Faction Visual Identity Kit (asset + runtime wiring).
- [`P4-set-piece-mission-types.md`](./P4-set-piece-mission-types.md) — Set-Piece Mission Types (gameplay/code).

Each doc is self-contained and dispatch-ready: an agent handed one should be able to run a first iteration without reading the others.

---

## 6. Status tracking

Each pipeline doc carries its own `**Status:**` line (`PLAN` / `WIP: <beat/landmark id>` / `DONE: <id>` / `BLOCKED: <reason>`). Update it as work proceeds. The first worked example in each doc is the **template** — once it lands green, copy its shape for the rest of that pipeline's backlog.

When a pipeline's backlog is exhausted, promote the surviving design rationale into `design/spec3/` (as a new spec block in the appropriate thread) or `design/graphics-sprints/` (as a new thread) per the authority chain, then mark the pipeline doc `SUPERSEDED` with a pointer.

---

## 7. How to dispatch (quick recipe)

For each iteration of any pipeline:

1. Copy the **Dispatch block** from the pipeline doc's final section into the agent thread.
2. Replace the `<TARGET_ID>` / `<BEAT>` / `<FACTION>` placeholder with the specific item from that pipeline's backlog table.
3. The agent reads in authority order, runs the worked example as a template if it's the first iteration, produces one unit of output, runs the named acceptance check, screenshots (if visual), prints the 10-line summary.
4. You (or the integrator) review the handoff; if green, queue the next target.

For asset pipelines (P1, P3), respect the single-writer graphics lock (`design/graphics-sprints/BLENDER_EXCLUSIVE_LOCK.md`) — only one Blender-owner thread at a time. P2 and P4 are pure code/data and can run alongside.

---

*Built 2026-07-12. Every file:line reference was verified against the working tree by audit agents. If a cited line has drifted, trust the live `check:*` output and `git status` over this doc — and fix the doc in the same pass.*
