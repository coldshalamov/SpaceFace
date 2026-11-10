<!-- LIFETIME: VOLATILE -->
# Agentic run 2026-10-18 — orchestration plan and unit ledger

Owner instruction: ~50-60 completed units, ~2:1 build-map-class work to INFERENCE work,
repo-wide bug sweep + polish, every unit reviewed, commit+push per unit, ≥5 agents active,
run ends only after 3 successive review waves report zero material findings.

Controller: devin-agentic-oct18 (this session). Law: root AGENTS.md, build_map.md §1C/§1.8,
INFERENCE_LANES.md. Read this file before touching any ledger row it owns.

## Pipeline rules (binding on every worker in this run)

1. **The controller alone commits and pushes** (`git commit -m … -- <exact paths>`).
   Workers never run mutating git commands (add/commit/stash/checkout/restore/reset/
   switch/branch/worktree/apply/rm/mv). Read-only git (status/diff/log/show) only.
2. **Never touch a dirty file.** Before editing any file, run `git status --short -- <file>`;
   if it shows any status, STOP and report — that hunk is foreign work. Known foreign sets:
   `src/render/**` (antigravity lane), `src/systems/{mining,npcJobsRuntime,wingmen}.js`,
   `src/ui/screens/{flightFootage,footageVideoCodec}.js`, `test/{flight-footage-*,
   metallic-ore-mining,rigid-opaque-*,wingman-mining-order,npc-starter-seam-mining}.test.mjs`,
   `tools/forge-*.cjs`, `assets/ships/release/render-packages/**`.
3. **Shared surfaces are controller-only**: NOW.md, build_map.md, DEMO_READINESS §6,
   LANDED_REVIEW.md, INFERENCE_IDEAS.md, inference-memory.json, this run dir.
   Workers report ledger text; the controller writes it.
4. Sim invariants: 60 Hz fixed timestep, XZ plane, `state.rng`/`state.simTime`, no Three.js
   in sim code. Never edit `test/*.expected.json`; never retune mass/thrust/weapon/dock/
   camera-governor numbers; never edit a test to make a failure pass (D228's harness-intent
   reconciliation excepted — the *harness* is the bug there).
5. No browser/Electron/GPU probe without the controller's token — one at a time on this host.
6. External CLI workers are READ-ONLY auditors: they may run node tests/checks and write
   exactly one file — their findings file under `findings/`. Nothing else.
7. INFERENCE units follow INFERENCE_GOAL.txt: CONSIDER (3 real alternatives) → COMPLETE
   (the whole playable thing) → PROVE (focused test on seed 4242) → SHIP → ROTATE
   (consecutive units differ on ≥2 of verb/subject/sector/domain). Thin rows don't count.
8. Review: the controller audits every diff pre-commit; each landed unit gets a
   LANDED_REVIEW row; reviewer subagents run in waves; external CLIs do adversarial
   read-only review of landed commits.

## Unit ledger

Statuses: OPEN / CLAIMED <worker> / LANDED <commit> / REVIEWED / PARKED <why>.

### Group A — queue hygiene and defect ledger (build-map class)

| # | Unit | Surface | Files (write set) | Status |
|---|---|---|---|---|
| A1 | Adopt stale rows devin-batch20 + devin-sweep-oct3 | NOW.md | NOW.md | LANDED (this session — no orphan hunks found, rows closed) |
| A2 | Review R-cc46e17 save/input/trade recovery | LANDED_REVIEW | per finding | LANDED 754b7e3a2f0 SMALL-MISS-FIXED + row closed |
| A3 | Review R-48e411f endgame mission choose | LANDED_REVIEW | per finding | LANDED 754b7e3a2f0 CONFIRMED + row closed |
| A4 | Review R-183df8f + R-0df2ec6 asteroid latency pair | LANDED_REVIEW | per finding | CLAIMED rev-b subagent |
| A5 | D228: reconcile ceres corridor harness vs authored ambush pack | ledger §6 | test/ceres-five-minute-acceptance.test.mjs | CLAIMED w-d228 |
| A6 | D213: M11 swarm river contacts after shove | ledger §6 | src/ai/fodderCohort.js + focused test | CLAIMED w-d213 |
| A7 | D222: ui-budgets digest only matrix-rendered files | ledger §6 | scripts/check-ui-budgets.mjs, capture script | CLAIMED w-d222 |
| A8 | D224: serial-route wait allowance for 4 SwiftShader-timeout checks | ledger §6 | the 4 check scripts + harness config | CLAIMED w-d224 |
| A9 | D191 leg: reduce Rapier solve cost by deterministic counters | ledger §6 | physics owner files (TBD by diagnosis) | OPEN |
| A10 | D130 leg: draw-call/state-change reduction, non-render owner | ledger §6 | TBD by diagnosis | OPEN |
| A11 | D229 diagnosis: release-to-reregister gap (renderer.js dirty → diagnose read-only, patch lands after foreign lane) | ledger §6 | findings only | OPEN |
| A12 | D199/D226/D225/D188: blocked (no-host/Blender/foreign) — record and skip | ledger §6 | — | PARKED |

| SWP-TXN | transactions/jobs find+fix — mission:expired settle gap + rumor-host filter | LANDED e82fb7a490a, review R-e82fb7a open |
| SWP-BASE | pq020 baseline red = stale digest pin | LANDED 28f33a2cb4c repin honest |

### Group B — §1.8 workflow sweep (build-map class; each finding→fix is a unit)

Audits first (read-only CLI waves), then fixes. Slot ids SWP-01…; one unit per verified
player-facing defect fixed with a focused regression. Target 16-20 landed units.

| Workflow row (build_map §1.8) | Audit owner | Status |
|---|---|---|
| Start, stop and resume | agy gemini-3.8-flash-high | AUDIT |
| Controls and everyday play | opencode-go/grok-4.7 | AUDIT |
| Menus, HUD and text (functional only, ORRERY-consistent) | claude plan-mode | AUDIT |
| The visible world loads and stays there | internal reviewer wave | AUDIT |
| Off-screen work and loading pressure | kimi k3 | AUDIT |
| Hitches and long-session stability | opencode-go/glm-5.3-flash | AUDIT |
| Transactions, jobs and progression | opencode-go/muse-spark-1.3-contributor | AUDIT |
| Visual and audio finish | agy argon (wave 2) | AUDIT |

### Group C — lane slices (build-map class, FINISH_LANES.md)

| # | Lane | Slice | Status |
|---|---|---|---|
| C1 | L-MACHINE | boot/hitch/admission slice per §4 checklist | OPEN |
| C2 | L-HAND | flight/verb slice per §5 | OPEN |
| C3 | L-FIGHTWORLD | world/fight slice per §6/§7 | OPEN |
| C4 | L-LONGGAME | §8 checklist row (M1-M6 bars) | OPEN |
| C5 | L-EAR | audio identity slice per §11 | OPEN |
| C6+ | further lane slices as audits expose them | | OPEN |

### Group D — INFERENCE look-then-rotate (target ~19)

| # | Domain rotation seed | Status |
|---|---|---|
| INF-01 | mission/encounter variety outside Ceres | CLAIMED w-inf1 |
| INF-02 | NPC job life / station texture | OPEN |
| INF-03 | combat consequence readability | OPEN |
| INF-04 | exploration/discovery reward | OPEN |
| INF-05 | economy/jobs texture | OPEN |
| INF-06 | aftermath/salvage ecology | OPEN |
| INF-07 | law/standing consequence | OPEN |
| INF-08 | onboarding/teaching clarity | OPEN |
| INF-09 | world memory / rumors | OPEN |
| INF-10 | fauna/ecology behavior | OPEN |
| INF-11 | machine/precursor presence | OPEN |
| INF-12 | audio/voice feedback (pairs L-EAR) | OPEN |
| INF-13 | death/recovery experience | OPEN |
| INF-14 | racing/swarm side texture | OPEN |
| INF-15 | hauler/towing/industrial life | OPEN |
| INF-16 | social/bar/contacts | OPEN |
| INF-17 | sector identity/landmarks | OPEN |
| INF-18 | player ship identity/upgrades | OPEN |
| INF-19 | controller's choice from weakest observed | OPEN |

### Group E — closing gate

3 successive review waves, each covering commits since the last wave plus one rotated
§1.8 workflow, must report zero material findings (material = reproducible player-facing
defect, regression in a landed commit, or broken contract). Waves mix reviewer subagent +
one strong external model. Nits do not reset the count.

## Findings → unit promotion

An auditor's finding becomes a SWP unit only when it names: player-visible symptom, repro
route or seed, owning file/function, and a bounded fix. Vague style notes go nowhere.
