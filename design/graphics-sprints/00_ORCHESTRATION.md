# Graphics Sprint Threads — Orchestration

**Status:** LIVE routing for parallel agent sprints (2026-07-08).  
**Purpose:** Run multiple north-star goals in parallel **without domain overlap**. One Blender owner at a time. Integrate in series.

## Authority chain

1. `Agents.md` §3 (uncommitted tree) + §10 (lane ownership)
2. `design/spec2/00_MASTER_TASTE.md` (taste constitution — Forbidden list rejects diffs)
3. This folder (`design/graphics-sprints/`)
4. **`TOP50_WONDER_BUILD_PLAN.md`** — Top-50 order, slice exits, weighted gates, **anti-lazy master goal** (§9)
5. `FULL_GRAPHICS_REVAMP_GOAL.md` (full-kit quality + process — never lower)
6. `design/revamp/EXECUTION_LANES.md` (backend vs graphics split)

## The five threads (never merge domains)

| Thread | ID | Owner | Blender? | Goal prompt file |
|--------|-----|-------|----------|------------------|
| Kit quality | **A** | Graphics | **YES** (exclusive) | `THREAD_A_KIT_QUALITY.md` |
| World identity | **B** | Graphics | **NO** until A releases lock | `THREAD_B_WORLD_IDENTITY.md` |
| Backend wiring | **C** | Backend | **NO** | `THREAD_C_BACKEND_WIRING.md` |
| Presentation code | **D** | Code / feel | **NO** | `THREAD_D_PRESENTATION_CODE.md` |
| Wholeship repair | **E** | Graphics | **YES** (exclusive; pauses A) | `THREAD_E_WHOLESHIP_REPAIR.md` |

**Blender rule:** Only **one** thread may hold the Blender MCP lock at a time. Thread A and Thread E are mutually exclusive. Thread B uses Blender only after acquiring the lock from A/E (usually same graphics agent, sequential sub-sprints).

Thread C and D never call Blender MCP.

## Lifecycle (every asset)

```
CONCEPT → SOURCE_GLB → RELEASE_BUILT → MANIFEST_SLOT → RUNTIME_MAP → VISIBLE_IN_PLAY
```

See `HANDOFF_TEMPLATE.md` for the machine handoff block between threads.

## Serialization points (one writer)

| Resource | Owner thread | Rule |
|----------|--------------|------|
| Blender MCP session | A or E | `assets/ships/blender.LOCK` must exist; see `BLENDER_EXCLUSIVE_LOCK.md` |
| `assets/ships/parts/**/*.glb` (source) | A, B, or E | Only lock holder |
| `npm run build:sg04:release-assets` | Integrator | After graphics handoff; never parallel |
| `parts_manifest.json` | Integrator or C | C adds rows only from handoff; A/E do not edit manifest (integrator does) |
| `src/render/partsLibrary.js` | **C only** | Graphics threads forbidden |
| `src/data/sectorAnchors.js` | **C only** | Thread B produces GLB; C wires geography |
| `src/render/vfx.js`, `vfxProfiles.js` | **D only** | |
| `test/*.expected.json` | Nobody in graphics sprint | Forbidden |

## Daily integrate window (required)

Once per day (or after any graphics handoff), **one integrator agent** runs:

1. Merge handoff blocks from A/B/E into `assets/ASSET_STATUS.json` (or run `npm run report:asset-status` when script exists).
2. Update `parts_manifest.json` / `runtimeSlots` if new IDs.
3. `npm run build:sg04:release-assets`
4. `npm run check:assets:live`
5. `npm run check:asset-reachability`
6. `npm run check:visual-stability`
7. Thread C may wire **only IDs at `RELEASE_BUILT` or higher**.

## Quality bar (all threads)

- **3D hero assets:** minimum **20 screenshot-driven iterations** per asset (see `QUALITY_RITUAL.md`).
- **Simple parts / props:** minimum **10 iterations**.
- **Code / wiring:** minimum **10 verification cycles** (check run → fix → re-run); no screenshot bar unless visual.
- **Top-50 / M3 wonder:** follow `TOP50_WONDER_BUILD_PLAN.md` — full-view law, weighted rubric, ≥50% rebuild per iter, slice exit shots. Copy-paste goals live in that file §9.

**Transcripts are not proof — checks and screenshots are.**

## Sprint selection (director picks one batch per thread)

| Thread | Pick work from |
|--------|----------------|
| A | `needed-assets.md` §A (manifest 63), one category per sprint (e.g. all engines) |
| B | `needed-assets.md` §B + `assets/QUEUE.md` landmarks/stations |
| C | Handoff inbox + `design/world-identity/PIPELINE.md` §7 |
| D | `design/spec3/SPEC3-F8-graphics-visuals.md`, presentation gaps |
| E | `wholeship_*` blocked rows in manifest only |

## Copy-paste index

All goal prompts for Cursor/Grok threads: **`GOAL_PROMPTS.md`**

## Related docs

- `QUALITY_RITUAL.md` — screenshot angles, deficiency rubric, iteration floors
- `BLENDER_EXCLUSIVE_LOCK.md` — single Blender agent protocol
- `HANDOFF_TEMPLATE.md` — cross-thread handoff block
- `INTEGRATION_GATE.md` — integrator checklist
- `assets/AGENTS.md` — LIVE vs REFERENCE, three registries
- `design/world-identity/PIPELINE.md` — places pipeline (Thread B + C)