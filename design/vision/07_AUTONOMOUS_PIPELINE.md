# 07 — Full Autonomous Developer Pipeline

**Status:** LIVE — the “go to bed” contract (2026-07-09)  
**Audience:** One long-running agent (or orchestrator + subagents) executing the entire SpaceFace product uplift without a human in the loop mid-flight.  
**Companion:** `00_CONSTITUTION.md` · `06_OPERATING_MODEL.md` · `03_MASTER_BUILD_PLAN.md` · this file’s wake report.

---

## 0. What “done properly” means when you wake up

The run is **DONE** only if all of the following are true (or honestly **BLOCKED** with evidence):

| Gate | Pass condition |
|---|---|
| **G0 Docs** | Vision pack is authority; stale status docs bannered; `01_CURRENT_STATE` matches tree |
| **G1 Playable** | Independent feel review finds no critical controllability/fairness defect; massline flyby works; flight is not “weird pin-spin” |
| **G2 Density** | Starter region has ≥3 findable landmarks; no 60s void in play belt |
| **G3 UI** | Station/flight scannable; no prose walls; modes discoverable; UI polish direction started or mocked |
| **G4 Assets** | Sore thumbs on starter ship fixed; portraits plan or regen started; ASSET_STATUS populated or partial with honesty |
| **G5 QA** | Named check suite for touched areas green; new tests for fixed bug classes; CI blockers named |
| **G6 Review** | Independent review filed with comparison evidence, named defects, and a reasoned verdict; no self-score acceptance |
| **G7 Handoff** | `design/vision/WAKE_REPORT.md` written for human |

**Partial overnight success is OK** if G0 + G1 + G7 land. G2–G6 may be IN PROGRESS with ranked residual backlog.

---

## 1. Pipeline stages (run in order; loop inside stages)

```
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE A — INTAKE & TRIAGE                                          │
│  Research peers + repo · harvest unfinished work · kill shitty work  │
│  Docs sync · write SESSION_PLAN.md                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE B — BUILD LOOPS (priority order)                             │
│  B1 Playable core → B2 World density → B3 Flight/massline polish    │
│  → B4 UI data-dense → B5 Assets/wonder → B6 Living systems harvest  │
│  → B7 Empire only if B1–B3 play-pass                                 │
│  Each loop: implement → auto-test → screenshot score → fun judge    │
└────────────────────────────┬────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE C — QA & HARDENING                                           │
│  Regression suite · first-15 · soak if time · perf · sore-thumb sweep│
└────────────────────────────┬────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE D — REVIEW & TRIAGE                                          │
│  Adversarial review subagent · residual backlog ranked · WAKE_REPORT │
└─────────────────────────────────────────────────────────────────────┘
```

**Never skip A or D.** Never mark a B-loop DONE without operating-model scores.

---

## 2. Phase A — Intake, triage, docs (always first)

### A1. Authority lock
- Read `design/vision/README.md` fully.
- Confirm product law = constitution + operating model (not MASTER_TASTE minimalism).

### A2. Repo harvest — **worth doing** vs **skip**

Mine unfinished work from:

| Source | What to pull |
|---|---|
| `design/revamp/PROGRESS.md` T6–T9 | Assets, perf, release gates |
| `design/CURRENT_BUILD_STATUS.md` | Historically red checks |
| `assets/QUEUE.md` | Unbuilt props/landmarks |
| `design/spec2` / `spec3` incomplete acceptance | Only if aligns with constitution |
| `design/graphics-sprints` | Process for assets, not conflicting product law |
| Live play pain in `01_CURRENT_STATE` | Highest priority |

#### Worth doing (KEEP / IMPLEMENT)

| Item | Why keep | Phase |
|---|---|---|
| Massline ladder CODE exists | Finish **play** not rebuild | B1 |
| Intentional AI maneuver code | Prove in play + fairness | B1 |
| Encounter director + pirate ecology CODE | Wire into dense world feel | B2/B6 |
| Causal economy / cause ledger | Strategy density | B4/B6 |
| Sector atmosphere data (postcards, glyphs) | Identity | B2 |
| Station/place GLBs already in release | Use + expand | B5 |
| T6 asset queue (stations, landmarks, hunters) | Wonder | B5 |
| T7 bloom.js syntax fix + perf gates | Unblocks CI/perf | C |
| T9 first-15 / soak / world-alive green | Trust | C |
| BP-07 flight feel remainders (render/HUD halves skipped in backend) | Piloting joy | B1/B3 |
| Frontend presentation halves of audio/signatures | Polish | B3/B4 |
| Rename derivative ship names | Original identity | B5 |
| Portrait regen (cinematic) | Identity | B5 |
| Data-dense UI polish | Professional front | B4 |
| Flyby Focus + latch assist | Signature toy | B1 |
| Docs unification (this pack) | Continuity | A continuous |

#### Skip or demote (SHITTY / WRONG NOW)

| Item | Why skip |
|---|---|
| Rebuilding massline from zero | Already deep; fix play |
| Visor/cockpit HUD revival | Not product |
| Multiplayer | Non-goal |
| Editing goldens to force green | Forbidden |
| More sectors while Helios empty | Density first |
| Empire/claims as primary overnight goal | After playable |
| Check-only “DONE” without play | False progress |
| Wiring blocked wholeships | Broken exports |
| Prose-wall “dense UI” features | Wrong density |
| Difficulty that makes game harder | Already too lethal |

Write the keep/skip table into `design/vision/SESSION_PLAN.md` at run start.

### A3. Docs cleanup & sync (mandatory)

1. Ensure `design/vision/*` is the front door (Agents.md / design/AGENTS already pointed — re-verify).  
2. Banner any doc that still claims “spec2 only” or “encounterDirector missing” without checking.  
3. Refresh `01_CURRENT_STATE.md` from live tree (file sizes, key checks).  
4. Refresh `04_ASSET_TRUTH.md` counts if assets changed.  
5. Create/update `design/vision/SESSION_PLAN.md` (ordered work for this run).  
6. Create empty `design/vision/WAKE_REPORT.md` skeleton.  
7. Optionally thin-index: add “SEE VISION PACK” to top of `BUILD_PLAN_2_0.md` if not present.

### A4. Environment sanity
- Note branch (`master`), dirty tree status (do not destroy uncommitted work).  
- Run a **smoke** set: `node --check` on critical files if T7 bloom was broken; quick `check:bundle` or lighter import check.  
- Fix **hard blockers** (syntax errors that stop the game) before features.

---

## 3. Phase B — Build loops (priority order)

Each item: **implement → tests → defect-driven capture/play loop → independent fun judge → update
the owning status ledger**.

### B1 — Playable core (P0 — do not leave unfinished if time is short)

1. Combat fairness (TTK, undock grace, early enemy damage/accuracy)  
2. Flight controllability (assist, bank, reduce pin-spin feel)  
3. Massline soft latch + nose lever  
4. Flyby Focus (slow + zoom + magnet)  
5. Modes + autopilot discoverability  
6. Starter ship sore thumbs (white emissive junk)  
7. Expand tests for latch/fairness regressions  

**Exit B1:** independent feel review passes with no critical/major defect, or the run records the
exact unresolved condition and preserves all evidence without claiming completion.

### B2 — World density (P0 after B1 soft-pass)

1. Redesign starter sector placement (landmarks, fields, stations findable)  
2. Traffic/encounters felt (use existing director — don’t rewrite)  
3. Gate travel: no load screen UX; amortize spawn  
4. Radar/map “what’s near”  

### B3 — Signature toy polish

1. Swing/reel/cut loop usable  
2. Juice for latch/strain/kill  
3. Camera composition with Focus  

### B4 — UI (data-dense strategy)

1. Station text purge (data first)  
2. Component tokens / clean panel direction
3. Mode chrome, target data density  
4. Mockups via image gen if redesign large  
5. One-map clarity (reduce dual-map confusion)  

### B5 — Assets & identity

1. Image gen cinematic portraits → wire  
2. Blender MCP landmarks/props from QUEUE (quality ritual)  
3. Ship rename (display) off Kestrel-class derivatives  
4. Populate `ASSET_STATUS.json`  
5. Fix any new sore thumbs introduced  

### B6 — Living systems harvest (only after B1–B2)

Make **existing** pirate ecology / causal economy / side events **visible and fun** in play — not more invisible backend.

### B7 — Empire (optional)

Only if B1 play-pass and hours remain. Prefer claims visibility over new factory sim.

---

## 4. Phase C — QA & hardening

### C1. Automated
Run and record (pass/fail/log path):

```
# Always
npm run check:massline          # or subset if too long
node scripts/check-tether-gameplay.mjs
npm run check:balance           # warnings OK if no FAIL
# As relevant
npm run check:first-15-runtime
npm run check:release-soak      # if time
npm run check:assets:live
npm run check:visual-stability
npm run check:flight:clean
npm run check:perf              # after bloom fix
npm run check:ui-a11y
npm run check:pirate-ecology    # if B6 touched
# Syntax unblock
node --check src/render/bloom.js
```

Add **new** checks when you fix a class of bug (latch success, undock grace, soft latch).

### C2. Play QA (required)
- 15–30 min continuous play notes in WAKE_REPORT  
- Defect critique using the dimensions from `06_OPERATING_MODEL.md`
- List remaining sore thumbs  

### C3. Perf / hitch
- No quality-lowering “fixes”  
- Fix bloom syntax if still broken (T7a)  

---

## 5. Phase D — Review, triage, wake report

### D1. Adversarial review (spawn subagent if available)

Prompt reviewer:

```
Read design/vision/* and git diff. Score operating model matrices.
List sore thumbs. Reject any DONE claim that is check-only.
Output: APPROVE | REVISE | REJECT with file:line evidence.
```

Implementer must address REVISE items if time remains.

### D2. Residual backlog

Rank remaining work for the human:

| P0 | Must fix next session |
| P1 | High value |
| P2 | Nice |
| CUT | Not worth it |

### D3. Write `design/vision/WAKE_REPORT.md`

Required sections:

1. Executive: playable? yes/no/partial  
2. Score tables  
3. What shipped (files)  
4. Checks run  
5. Play notes  
6. Docs touched  
7. Residual backlog  
8. How to verify in 10 minutes  

---

## 6. Parallelism & subagents

| Lane | Can parallel | Lock |
|---|---|---|
| Play systems (flight/tether/combat) | Art authoring | One writer per file |
| World data | UI tokens | — |
| Blender | Nothing else Blender | Exclusive lock |
| Image gen portraits | Code | Wire carefully |
| Check runner | Always | — |
| Reviewer | End of each B phase | Read-only |

---

## 7. Time budget (example 8-hour overnight)

| Hours | Focus |
|---:|---|
| 0:00–0:45 | Phase A intake + docs + smoke |
| 0:45–3:30 | B1 playable (majority of value) |
| 3:30–5:00 | B2 density |
| 5:00–6:00 | B3 + B4 partial (purge + modes) |
| 6:00–7:00 | B5 sore thumbs + portraits kickoff |
| 7:00–7:40 | Phase C QA |
| 7:40–8:00 | Phase D review + WAKE_REPORT |

If behind: **cut B5–B7**, protect B1 + A + D.

---

## 8. Single goal prompt (paste to start overnight)

See **`design/vision/OVERNIGHT_GOAL.md`** — the only prompt you need.

---

## 9. Human 10-minute morning verify

1. Open `design/vision/WAKE_REPORT.md`  
2. Play 5 minutes cold (undock → station course → any fight)  
3. Glance `.devshots/vision/` latest scores  
4. Run one command they cite as green  
5. Decide: continue residual P0 or ship demo slice  

If WAKE_REPORT missing or only lists green checks with no play scores → **run failed process**, not product.
