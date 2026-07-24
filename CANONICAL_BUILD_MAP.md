# CANONICAL BUILD MAP

**Role:** the single **program front door** for agents and controllers.  
**Created:** 2026-07-21 · **Does not replace** original plans, architecture, or GDD.

Point agents here with:

> Read `CANONICAL_BUILD_MAP.md` first. Follow its workflow. Do not invent a new plan system.

---

## 0. What this file is (and is not)

| This file **is** | This file **is not** |
|---|---|
| The map that combines every plan family into one dispatch path | A rewrite or archive of original plans |
| The “do next / check off / retain for review” workflow | A second product design document |
| A routing table into live status, queue, packets, and detail libraries | Permission to ignore live code, checks, or player-route evidence |
| Stable operator doctrine (how work is chosen and proven) | A volatile lease board (that is `design/program/NOW.md`) |

**Original plans stay in place.** This map only says *which surface owns what* and *what to open next*.  
When this map and a detail plan disagree on **intent**, use the authority stack in §1.  
When this map and **live code / checks / git** disagree on **truth**, live evidence wins — then update the program ledgers.

---

## 1. Authority stack (strict order)

When sources conflict, obey this order:

1. **Explicit user direction** for the current session  
2. **`ARCHITECTURE.md`** — technical contracts (determinism, single writers, flight/AI/physics selection, one game path)  
3. **`design/GDD_2_0.md`** — game-design authority  
4. **This file** — program front door and anti-nesting rules  
5. **`design/program/` live status set** — verified / remaining / acceptance / integration / NOW / queue  
6. **Activated detail** for the claimed packet (Alpha row, Depth chunk, graphics brief, revamp BP, spec slice, sequential SF brief, etc.)  
7. Supporting research, archives, transcripts, handoffs, campaign material — **never completion truth**

Also always apply root **`AGENTS.md`** engineering invariants (shared tree safety, input contract, HUD non-diegetic, performance without quality cuts, etc.).

---

## 2. The only control surfaces (do not invent more)

These five surfaces already implement “source of truth + check-off + retention.” **Use them. Do not create a sixth.**

```text
CANONICAL_BUILD_MAP.md          ← you are here (front door)
        │
        ▼
design/program/NOW.md           ← leases, occupied paths, reds, concurrent lanes
        │
        ▼
design/program/roadmap/
  program-queue.json            ← ordered PQ-* dispatch (priority + deps + state)
  00_EXECUTION_PROTOCOL.md      ← claim / implement / prove / integrate
  README.md                     ← 113 stable F/G/T/A/W/R packet identities
        │
        ▼
design/program/03_LIVE_ACCEPTANCE_MATRIX.md
  + 01_VERIFIED_DONE.md
  + 02_REMAINING_WORK.md
  + roadmap/receipts/*.yaml     ← check-off + review retention
```

| Surface | Owns | Does not own |
|---|---|---|
| **`program-queue.json`** | Cross-plan **priority** and dependency order (`PQ-*`) | Final product “done”; Alpha milestone exit; every Depth chunk |
| **`roadmap/` packets** | Stable implementation **identity** (`F/G/T/A/W/R`) | Day-to-day “what’s next” without the queue |
| **`01` / `02` / `03`** | Verified outcomes, admitted remaining work, acceptance truth | Design ambition libraries |
| **`NOW.md`** | Active leases, collisions, worktrees, immediate reds | Long-term backlog |
| **`06_RETAINED_FUTURE_BACKLOG.md`** | Valuable ideas **not** auto-admitted | Automatic next work |

Completion vocabulary (never collapse to a single “done”):

| Term | Meaning |
|---|---|
| committed | On the branch; quality unknown |
| implemented | Code/content exists |
| focused_green | Named narrow checks pass |
| route_accepted | Normal public input + current player-facing evidence |
| integrated / checked off | Reviewed commit on target branch **and** acceptance row + receipt |

Queue schema already enforces check-off only at **`integrated`** / **`historical`**, and requires **`integratedCommit` + `acceptanceRef` + `receipt`**.

---

## 3. Product north star (what “best game” means here)

Build toward a **professional solo space game** with:

1. A trustworthy browser + Electron path and seamless persistent world  
2. Excellent Massline / physics toys that teach mastery  
3. Truthful combat, docking, and industrial interaction  
4. A living Helios → Ceres → Tethys **Gold Corridor** (first ~30–90 minutes)  
5. Readable world depth (jobs, sites, landmarks, factions, ledger) without fake content  
6. Professional visual/audio presentation on the **default route**  
7. Accessibility, performance, save integrity, and release readiness  

Coarse spine (already encoded in the queue synthesis):

```text
Baseline trust → control/physics roots → physical combat & tools
  → living corridor verticals (planet, jobs, sites, cathedral, heist)
  → visual families + Asteroid Ops minimal loop
  → Gold Corridor acceptance
  → deferred specialty physics / story embodiment / release closeout
```

Do **not** skip prerequisites to chase a more exciting later PQ item.

---

## 4. Workflow: “next” / “next N”

### 4.1 Preflight (every agent, every session)

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
git worktree list --porcelain
```

Read, in order:

1. This file (`CANONICAL_BUILD_MAP.md`)  
2. Root `AGENTS.md`  
3. `design/program/NOW.md`  
4. `design/program/roadmap/program-queue.json`  
5. `design/program/roadmap/00_EXECUTION_PROTOCOL.md`  
6. Only the source docs named by the claimed packet(s)  
7. Owning nested `AGENTS.md` / module map for touched code  

If `NOW.md` or worktrees show another controller owns the packets you want, **stop** or take a non-overlapping task. Do not double-assign.

### 4.2 Select work

1. Open `program-queue.json`.  
2. Walk tasks in **priority** order.  
3. Skip only: `integrated`, `historical`, and **blocked** items whose blockers are still real.  
4. Include unfinished **dependencies** (`dependsOn`) before dependents.  
5. Prefer finishing **`focused_green` → route_accepted → integrated`** over starting a shiny new planned row when the green item is the gate.  
6. Map each selected `PQ-*` to its `canonical` roadmap IDs (`F/G/T/A/W/R` or assigned `PROPOSED-*`). Permanent features must not live only under a `PQ-*` label.  
7. Reconcile against **live code** first: partial kernels, unwired modules, and existing tests outrank plan prose.

### 4.3 Dependency waves (current queue shape)

Refresh from the live queue before acting. Current structural intent after the 2026-07-21 closeout:

| Wave | Packets | Notes |
|---|---|---|
| Integrated roots | **PQ-001…PQ-006, PQ-008…PQ-017** | Do not reopen; use receipts and named follow-ups |
| Focused-green correction | **PQ-007** restore auto-target / draw-to-fly | Integrated at `4d00867e`; the unsolicited pursuit-slot implementation remains rejected; current browser/Electron route acceptance is still open |
| Next feature | **PQ-018** Wreck Cathedral runtime promotion | Extend the preserved source candidate through the PQ-017 site substrate without reopening the rejected pursuit direction |
| After PQ-018 | PQ-019–025 corridor | Extend existing partials; do not replace them |
| Deferred | PQ-026–033 | After corridor acceptance unless the user overrides |

The table immediately below is the historical pre-closeout wave shape retained for archaeology; it
is not the current dispatch order.

| Wave | Packets | Notes |
|---|---|---|
| Gate | **PQ-011** close (Mass Seed route/visual + flight-gate debt) | Must clear before dependent physics expansion |
| Wave 1 | **PQ-012** fields ∥ **PQ-015** interaction descriptors | Parallel only if write sets disjoint |
| Wave 2 | **PQ-014** full NPC jobs; **PQ-016** industrial beam | After registry / physics mutexes release; reuse PQ-014 kernel |
| Wave 3 | **PQ-013** planet sling/skim/harvest/reentry | Serialized broad vertical |
| Later | PQ-017 site kernel → PQ-018 cathedral → PQ-019–025 corridor | Partials may already exist — extend, do not replace |
| Deferred | PQ-026–033 | After corridor acceptance unless user overrides |

**Current partial landings already on master (do not re-author from zero):**

- PQ-011 and PQ-014 are integrated; follow only their named receipt defects.
- PQ-007's former pursuit-slot implementation is explicitly rejected by the user. Commit `4d00867e`
  correction restores G auto-target/draw-to-fly, independent weapon aim, and direct granular path
  steering; it removes MMB pursuit selection, autonomous target-relative station keeping, pursuit
  impulses, and pursuit HUD/toasts. Historical plans and receipts do not authorize those mechanics.
- PQ-018's source candidate is preserved and its PQ-017 runtime dependency is now satisfied.
- PQ-021 remains an unwired ledger UI.
- PQ-022 has accepted station/fleet subslices but is not complete across all visual families.

Historical pre-closeout partial table:

| Item | Honest state | Extend by |
|---|---|---|
| PQ-011 | Runtime wired, `focused_green` | Route + visual + adversarial close |
| PQ-014 | Job **kernel** unwired | encounterDirector / sectorSim / AI / save / natural occurrence |
| PQ-018 | **Source** GLB candidate | PQ-017 satisfied; place/wire/save/route next |
| PQ-021 | Ledger UI exists, **unwired** | After cathedral/site path |
| PQ-022 | One station family route-accepted | Continue families via foundry/manifests |
| Fleet foundry | Source-complete | Runtime admission / default-route binding |

### 4.4 Execute

- Prefer **isolated worktrees** for writers; record base commit + exact write set before mutation.  
- At most **three** concurrent writers; **one owner per mutex** (see §7).  
- Workers return **candidates**. Only the integration owner marks queue/acceptance.  
- Preserve unrelated dirty work. Never tree-wide reset/clean/stash.  
- Never rewrite `test/*.expected.json` merely to pass.  
- Never weaken accessibility or default graphics quality for performance.  
- A green source-pattern test is not player-route acceptance. A standalone render is not visual acceptance. A candidate is not a feature until on the **default route**.

### 4.5 Check off (only when all are true)

1. Reviewed logical commit(s) on the target branch (`master` unless user said otherwise)  
2. Required focused checks green; broader checks per risk  
3. Required evidence class present (browser / Electron / save / a11y / perf as named)  
4. Receipt written under `design/program/roadmap/receipts/` (or equivalent hash-bound path)  
5. `03_LIVE_ACCEPTANCE_MATRIX.md` row updated  
6. Queue row: `state: integrated` + `integratedCommit` + `acceptanceRef` + `receipt`  
7. `NOW.md` leases cleared or reduced to remaining defects  
8. `01_VERIFIED_DONE.md` / `02_REMAINING_WORK.md` updated when milestones truly move  

**Partial success:** keep `planned` / `focused_green` / `implemented` and record `partialIntegration` + receipt. Do **not** check off a whole PQ because one subslice landed.

### 4.6 Retain for later review

| Outcome | Where it lives |
|---|---|
| Fully integrated feature | Queue `integrated` + receipt + matrix + `01` |
| Partial kernel / source-only | Queue `partialIntegration` + receipt + honest matrix note |
| Alpha/Depth still admitted but incomplete | `02_REMAINING_WORK.md` |
| Good idea not yet in queue/roadmap | `06_RETAINED_FUTURE_BACKLOG.md` (then admit with ID) |
| Finished build needing re-proof | `07_HISTORICAL_BUILDS.md` HBV rows |
| Rejected experiment | Annotated tag + donor ledger (`09_DONOR_VALUE_LEDGER.md`) — do not merge |

### 4.7 Pasteable controller brief

> You are the SpaceFace program controller. Start at repo-root `CANONICAL_BUILD_MAP.md`. Validate git/worktrees/`NOW.md`. Freeze the next N unchecked outcomes from `design/program/roadmap/program-queue.json`, including prerequisites. Reconcile each against live code; map to stable roadmap IDs. Orchestrate ≤3 worktree workers with disjoint write sets; integrate serially. Workers return candidates only. Check off only after integration + acceptance row + receipt. Preserve unrelated dirty work. Update existing program ledgers only — **do not create a new competing plan, queue, or status folder**. End with exact commits, checks, evidence paths, remaining defects, worktree disposition, and next queue position.

Replace `N` with the user’s count. For a single packet, use the same rules with N = 1.

---

## 5. Live position snapshot (refresh before acting)

**Snapshot date:** 2026-07-24. **Always re-read the queue and `NOW.md`.**

| Bucket | PQ items (at snapshot) |
|---|---|
| Integrated | PQ-001 … PQ-006 and PQ-008 … PQ-017 |
| Focused-green integrated correction; route acceptance open | PQ-007 auto-target / draw-to-fly restoration at `4d00867e`; pursuit slot rejected |
| Next feature dependency root | PQ-018 Wreck Cathedral runtime promotion |
| Planned active spine | PQ-018 … PQ-025 |
| Deferred post-corridor | PQ-026 … PQ-033 |

**Current checkout reality at the 2026-07-21 closeout:**

- PQ-017 is integrated at `2a9517d8`; PQ-007's user-directed correction is commit-bound at
  `4d00867e` with current browser/Electron route acceptance still open. Re-check registered worktrees
  and live leases before dispatch because protected foreign graphics work may still be active.
- The former `SpaceFace-graphics-overhaul` mixed donor was selectively dispositioned, hash-archived,
  tagged at `archive/graphics-overhaul-donor-20260721`, and physically removed. Never recreate it as a
  whole-merge source; consult `design/program/09_DONOR_VALUE_LEDGER.md` for recoverable value.
- Do not steal leases from a controller recorded in `NOW.md`; always refresh live status because this
  snapshot can age.

**Known debt classes (remeasure; do not “fix” by deleting checks):**

- Mobile / flight probe residuals noted in `NOW.md`  
- Strict performance named rows  
- Historical encounter-director / envelope debt  
- Graphics applied-LOD and broader visual acceptance  
- Half-landed Depth chunks and deferred menu/drill/map verification (`07_HISTORICAL_BUILDS.md`)

---

## 6. Plan directory — originals preserved, how to use them

**Never delete or “replace” these.** Open them as **detail libraries** after the queue selects work.

### 6.1 Dispatch and status (active)

| Path | Use for |
|---|---|
| `design/program/PROGRAM_MAP.md` | Expanded plan-family routing (this file supersedes it only as the *agent entry* pointer) |
| `design/program/NOW.md` | Leases and live reds |
| `design/program/roadmap/program-queue.json` | Ordered next work |
| `design/program/roadmap/*` | Packet IDs, protocol, receipts |
| `design/program/01–05` | Verified / remaining / acceptance / integration / resume |
| `design/program/06_RETAINED_FUTURE_BACKLOG.md` | Unadmitted future |
| `design/program/07_HISTORICAL_BUILDS.md` | Past builds + re-proof debt |
| `design/program/08_GRAPHICS_OVERHAUL_CHECKPOINT.md` | Graphics checkpoint truth |
| `design/program/09_DONOR_VALUE_LEDGER.md` | Donor worktree value / reject record |
| `design/PLAN_REGISTRY.md` | Family-level disposition registry |

### 6.2 Product scope (active)

| Path | Use for |
|---|---|
| `design/vision/ALPHA_PROGRAM.md` | M0–M6 Alpha scope and acceptance framing |
| `design/depth-program/BUILD_PLAN.md` + `PROGRESS_LEDGER.md` | Depth chunks, content roster, evidence detail |
| `design/program/02_REMAINING_WORK.md` | Milestone roll-up of Alpha + Depth still owed |

### 6.3 Synthesis that *fed* the queue (reference, not a second queue)

| Path | Use for |
|---|---|
| `design/sequential-build-plan/REVIEW/BUILD_PLAN_CORRECTED.md` | Corrected SF sequence, absorption ledger, briefs |
| `design/sequential-build-plan/REVIEW/*` | Collision resolutions, critical path, reviewer decisions |
| `design/sequential-build-plan/PLANS/plans/SF-*.md` | Detailed implementation briefs (after PQ maps to them) |
| `design/sequential-build-plan/ORIGINALS/**` | Immutable provenance of depth playbook, gravity package, atlas pack |

### 6.4 Feel, ambition, revamp detail (activate per packet)

| Path | Use for |
|---|---|
| `design/spec2/*` | Polish / feel / release readiness reference |
| `design/spec3/*` | Ambition threads F1–F10 (do not auto-commit all ideas) |
| `design/revamp/BP-*.md` + `detail/` | Outcome detail quarry |
| `design/ASTEROID_OPS_*.md` | Signature industrial loop detail |
| `design/MAP_UX_PLAN.md` + `design/program/atlas/` | Map / Atlas / travel decisions |
| `design/world-identity/*` | Sector and place identity |
| `docs/worldbuilding/*` | Narrative canon (runtime still proves embodiment) |

### 6.5 Graphics and assets (active detail)

| Path | Use for |
|---|---|
| `docs/visual-assets/README.md` | **Canonical** authored-asset craft + G0–G7 acceptance |
| `design/graphics-sprints/README.md` | Graphics program entry (priority / orchestration) |
| `design/graphics-sprints/ASSET_PRODUCTION_LEDGER.md` | PQ-022/PQ-023 asset-family census, audit gaps, subordinate VA/VP packets and graphics controller prompt |
| `design/graphics-sprints/VISUAL_ITERATION_PROTOCOL.md` | Minimum visual scrutiny, valid camera/evidence rules, narrative art brief and defect-driven iteration |
| `LONG_TERM_GRAPHICS_OVERHAUL.md`, `TOP50_WONDER_BUILD_PLAN.md` | Priority and long-term visual bar |
| `assets/QUEUE.md`, `needed-assets.md`, manifests | Asset coverage and admission |
| `design/foundry/*` | Fleet foundry contracts (source vs runtime) |

For graphics, the queue still decides **when** PQ-022/PQ-023 run. The production ledger decides
**which exact asset or presentation family is next** and tracks craft evidence separately from
technical lifecycle. It does not create another global status surface. The canonical G0–G7 craft
and acceptance contract is installed at `docs/visual-assets/`
(`VISUAL_ASSET_PRODUCTION_STANDARD.md`).

### 6.6 History / do not implement by default

| Path | Use for |
|---|---|
| `design/BUILD_PLAN_2_0.md` | Archaeology only |
| `design/vision/03_MASTER_BUILD_PLAN.md` | Historical pre-alpha roadmap |
| `design/CURRENT_BUILD_STATUS.md` | Stale check snapshot |
| `docs/Spec/MASTER_MAKEOVER_PLAN.md` | Historical makeover |
| `design/_ARCHIVE/**` | Superseded plans and handoffs |
| `design/production/**` | Optional evidence/orchestration machinery — not automatic feature scope |

### 6.7 How plans were combined (so agents stop re-merging)

```text
Alpha + Depth + Revamp + Spec2/3 + Graphics + Atlas + Asteroid Ops
        │
        ▼
113-packet roadmap (stable IDs)
        │
        ▼
Sequential SF-00…35 + gravity/depth/atlas packages
        │
        ▼
Reviewer-corrected sequence (BUILD_PLAN_CORRECTED)
        │
        ▼
program-queue.json PQ-001…033   ← day-to-day order
        │
        ▼
This CANONICAL_BUILD_MAP.md   ← single agent front door
```

If tempted to write “Build Plan 3.0,” **stop**. Update the queue / NOW / acceptance / receipts instead.

---

## 7. Mutexes, parallelism, and protected lanes

Common mutex names (from the queue; one writer each):

`git-index` · `browser-gpu` · `blender` · `renderer` · `asset-manifest` · `registry` · `save-schema` · `input` · `physics-authority` · `hud-styles` · `package` · `atlas`

Rules:

- Read-only review may be wide; writers must preflight path lists.  
- Serialize browser/Electron evidence and Blender authoring.  
- An activated graphics batch may use one Blender/source owner, one disjoint non-Blender producer,
  and one read-only/independent reviewer. Release builds, manifests, runtime promotion and GPU
  acceptance remain serial.
- Rejected graphics donor: use its recovery tag/archive only for selective archaeology; never whole-merge it.
- Input system edits require focused rebind/sim validation and coordination.  
- Station shell / non-diegetic HUD: do not replace known-good framing casually.

---

## 8. Proof classes (best implementation quality)

Match proof to risk. Minimums:

| Change type | Minimum proof |
|---|---|
| Sim / physics / massline | Owning focused tests + `npm run check:sim:compare` (hashEqual) |
| Save / schema | `check:save-schema` + reload continuity where claimed |
| Flight / render loop | `check:flight:clean` / visual-stability as applicable + measured concern |
| Assets / places | Reachability, live load, Atlas integrity when places change, player-route capture |
| UI / a11y | Focused UI check + a11y/contrast; preserve reduced-motion/flash |
| Launcher | `check:launch-policy` |
| Broad integration | `npm run check` after focused greens — do not start here |
| Player-visible “done” | Normal public route in browser and, when claimed, Electron; current screenshots/metrics |

**Hard bans that protect quality:**

- No fake planets/teleports/cutscene-only verticals for PQ-013-class work  
- No generic RMB mining VFX for every industrial action (PQ-016-class)  
- No checking off PQ-022 because one station family landed  
- No target-relative pursuit slot, MMB pursuit selection, automatic station-keeping around a combat
  target, pursuit impulse controller, or `PURSUIT ASSIST` HUD/toasts. Do not retire or replace the
  user-requested G auto-target/draw-to-fly route from historical plan prose.
- No lowering default quality to pass perf  
- No silent golden re-records  

---

## 9. Anti-nesting rules (mandatory)

1. **Do not create** a new master plan, sequential plan pack, parallel queue, or “status v2” folder.  
2. **Do not treat** Depth ledgers, revamp `PROGRESS.md`, SF ORIGINALS, or chat transcripts as global completion.  
3. **Do not** mark integrated without matrix + receipt + commit.  
4. **Do not** expand scope inside a lease because the original defect was already fixed — return evidence and stop.  
5. **While another controller owns a batch**, other agents only take **disjoint** work or stay read-only.  
6. **User asks for “organize plans” again:** improve *this file* and the existing five surfaces — do not spawn a rival map.  
7. **Detail plans** may be edited when they are wrong about seams; **dispatch order** changes only via explicit queue priority edits with rationale.

---

## 10. Related files quick index

| Need | Open |
|---|---|
| Engineering invariants | `AGENTS.md`, `ARCHITECTURE.md` |
| This front door | `CANONICAL_BUILD_MAP.md` |
| Leases / reds | `design/program/NOW.md` |
| Next ordered work | `design/program/roadmap/program-queue.json` |
| How to claim/prove | `design/program/roadmap/00_EXECUTION_PROTOCOL.md` |
| Packet IDs | `design/program/roadmap/README.md` |
| Acceptance truth | `design/program/03_LIVE_ACCEPTANCE_MATRIX.md` |
| Alpha/Depth remaining | `design/program/02_REMAINING_WORK.md` |
| Unadmitted ideas | `design/program/06_RETAINED_FUTURE_BACKLOG.md` |
| Plan family roles | `design/PLAN_REGISTRY.md` |
| Corrected SF briefs | `design/sequential-build-plan/REVIEW/BUILD_PLAN_CORRECTED.md` |
| Module ownership | `docs/MODULE_MAP.md` |
| Common failures | `docs/COMMON_BUGS.md` |
| Place registration | `src/data/PLACE_REGISTRATION.md` |

---

## 11. Definition of a healthy session end

A controller or agent finishes with:

1. Exact HEAD and dirty/clean status  
2. Packets touched and final queue states  
3. Commits (or explicit “no commit”)  
4. Checks run and results  
5. Evidence paths for any route/visual claim  
6. Remaining defects without rounding down  
7. Worktree/branch disposition  
8. **Exact next PQ id** for the following session  
9. **No new plan system** created  

---

## 12. Maintenance of this map

- Update §5 snapshot when a major batch integrates (or say “snapshot stale — trust queue”).  
- Do not grow this file into a copy of every plan. Link out.  
- If the queue schema or authority model changes, update §2 and §4 in the same commit as the schema change.  
- Root `AGENTS.md` must keep a one-line pointer here for program/next work.

---

*Original plans remain authoritative for their *detail* when activated. This map is authoritative for *how to enter the program and choose next work* without nesting another build system.*
