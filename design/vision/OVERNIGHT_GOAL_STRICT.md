# OVERNIGHT GOAL — STRICT (copy-paste this; no early exit)

**Why this exists:** The default `OVERNIGHT_GOAL.md` allowed **partial success** (G0 + B1 + WAKE_REPORT). Agents correctly stopped there. **This prompt does not allow that.**  
**Use when:** you want the pipeline driven until play/QA gates pass or a hard external blocker is proven.

---

## Prompt (copy everything below the line into the agent / goal)

---

You are the sole overnight developer for SpaceFace. Execute the **FULL** autonomous pipeline in `design/vision/07_AUTONOMOUS_PIPELINE.md` under the **STRICT completion contract below**.

### Authority (read fully, in order, before coding)
1. `design/vision/README.md`
2. `design/vision/00_CONSTITUTION.md`
3. `design/vision/06_OPERATING_MODEL.md`
4. `design/vision/07_AUTONOMOUS_PIPELINE.md`
5. `design/vision/03_MASTER_BUILD_PLAN.md`
6. `design/vision/01_CURRENT_STATE.md`
7. `design/vision/04_ASSET_TRUTH.md`
8. `design/vision/WAKE_REPORT.md` (prior run residual P0 — continue from it, do not restart from zero)
9. Root `ARCHITECTURE.md` (technical constraints)
10. Root `Agents.md` §3 (never destroy uncommitted work; stay on `master`)

### STRICT completion contract (non-negotiable)

**You may NOT call the goal complete, and may NOT stop “for the night,” until ALL of the following are true OR a HARD BLOCKER is filed under §Hard blockers.**

#### Gate STRICT-G0 — Docs (required)
- [ ] `SESSION_PLAN.md` rewritten for **this** run (dated keep/skip + ordered work)
- [ ] `01_CURRENT_STATE.md` PLAY columns match reality after your work
- [ ] `WAKE_REPORT.md` fully rewritten for this run (not a partial template)

#### Gate STRICT-G1 — Playable core (required — all bullets)
- [ ] At least **five** of these are shipped **and** covered by automated checks that import real `src/` modules:
  1. massline latch forgiveness / soft acquisition  
  2. nose-lever / front-back massline identity  
  3. starter combat fairness **or** undock/respawn safety  
  4. flight bank / controllability feel  
  5. discoverable MMB course/pursue + G combat computer + F massline (resolver-tested)  
  6. Flyby Focus (or equivalent high-speed latch assist)  
  7. starter sore-thumb (no floating high-intensity white emissive junk on hero hull)  
- [ ] **Live play proof (not optional):** either  
  - (A) headed browser probe / `check:flight:clean` (or equivalent) succeeds with log in `{SCRATCH}`, **and** you write a 15+ minute play note with death count, latch attempts, and fun/lame judgment, **or**  
  - (B) you prove the environment cannot run headed browser after **3** distinct attempts and save failures to `{SCRATCH}/browser-env-limit.log` — then you **must** compensate with extra automated play harnesses that drive flight+tether+combat systems for ≥30 simulated seconds of scripted flyby+fight and assert player hull remaining > 0 and ≥1 successful latch  
- [ ] Independent flight/massline/combat review reports no unresolved critical or major defect in
  controllability, fairness, intention, feedback, or discoverability. If it rejects, keep fixing.

#### Gate STRICT-G2 — Density (required)
- [ ] Starter region has ≥3 named findable destinations (stations/POIs/fields) and rock/traffic presence that is not “one tiny pile in a void”
- [ ] Automated data/spawn check asserts density floors
- [ ] Play note or harness: within 2 minutes sim/player can “find” 3 destinations (radar/map/labels)

#### Gate STRICT-G3 — UI discoverability + anti-prose (required minimum)
- [ ] Flight/combat prompts teach MMB/G/F (already checked) **and** station market/missions have **no** purpose-essay wall of text on the default tab (delete or collapse to hover)
- [ ] Automated check greps/asserts against banned purpose-banner patterns OR drives the real screen module export

#### Gate STRICT-G4 — Identity / assets (required minimum)
- [ ] Starter display name is not Freelancer-clone “Kestrel”
- [ ] Hero sore-thumb fixed (check)
- [ ] Either: (a) ≥1 cinematic portrait regen wired via image-gen pipeline, **or** (b) ASSET_STATUS.json populated for all LIVE place props with honest lifecycle — pick the higher-ROI unfinished of the two and finish it

#### Gate STRICT-G5 — QA (required)
- [ ] `npm run check:overnight:playable` PASS (extend it as you add gates)
- [ ] `node scripts/check-tether-gameplay.mjs` PASS
- [ ] At least one of: `check:flight:clean`, `check:assets:live`, `check:bundle` PASS with log in `{SCRATCH}`
- [ ] Every new bug class you fix gets a new assertion in an in-repo check that imports shipped code
- [ ] **No** `test/*.expected.json` edits without a named re-record reason in WAKE_REPORT

#### Gate STRICT-G6 — Multi-agent review (required)
You **must** use subagents or terminal agents (spawn_subagent / codex / claude / agy as available) for at least **two** of:
- **Gamer reviewer** — “would I rage-quit in 10 minutes?” with concrete evidence
- **Combat/feel designer** — massline + flight-bank defect review
- **UI designer** — scannability / prose / discoverability  
- **Skeptic engineer** — tests drive real code? false DONE?

Each reviewer uses the critique dimensions in `06_OPERATING_MODEL.md`.
**If any reviewer reports a critical or major defect, fix and re-review.**
Paste reviewer summaries into WAKE_REPORT §Review.

#### Gate STRICT-G7 — Handoff (required)
- [ ] WAKE_REPORT executive table filled  
- [ ] Independent review verdicts pass with no unresolved critical/major defect
- [ ] Residual backlog only contains items **outside** STRICT-G1…G5 (or true HARD BLOCKERs)  
- [ ] You did **not** stop solely because “B1 checks green”

### Forbidden early-exit excuses (explicitly rejected)
- “Partial success is OK per pipeline G0+G1+G7” — **OVERRIDDEN by this STRICT contract**
- “A self-score is honest enough” — **self-scores do not accept the work; fix the named defects**
- “No headed browser so we’re done” — **must use STRICT-G1 compensation harness**
- “Docs + handoff only” — **not completion**
- “Out of time” — **not completion**; leave WAKE_REPORT as FAILED-STRICT with remaining gate checklist, and do **not** claim goal complete

### Hard blockers (only valid complete-with-blocked reasons)
You may stop and mark **blocked** (not complete) only if after multiple attempts:
- Repo will not boot / syntax cascade you cannot fix in-tree  
- Credentials/tools missing for required headed path **and** compensation harness also impossible  
- Destructive git would be required (forbidden)  

Document blocker evidence under `{SCRATCH}/hard-blocker.md` and WAKE_REPORT.

### Process requirements
- Follow phases A→B→C→D; **loop B until STRICT-G1 and G2 pass**
- Prefer fixing play over new features; harvest unfinished **worth-doing** systems (directors, pirate ecology, causal economy) only to make them **felt**, not check-theater
- Use image gen / video gen / Blender MCP when G4 needs it; exclusive Blender lock
- Stay on `master`; no `git reset --hard` / stash that risks the tree
- Commit only if user pre-authorized; otherwise leave files + WAKE_REPORT
- Scratch logs: use the goal’s `{SCRATCH}` / implementer scratch dir — never shared `/tmp`

### Definition of DONE (STRICT)
1. All STRICT-G0…G7 checkboxes satisfied  
2. Flight/massline/combat independent review passes with no critical/major defect
3. Reviewer agents did not reject  
4. WAKE_REPORT says **YES** to “more playable” and **YES or PARTIAL→YES** to “safe 10-min demo” with play evidence  
5. `check:overnight:playable` + tether-gameplay green  

If any item fails → **goal not complete**. Continue iterating.

Begin with Phase A (rewrite SESSION_PLAN from prior WAKE_REPORT P0). End only when STRICT gates pass.

---

## After paste

- Morning: open `design/vision/WAKE_REPORT.md`  
- If it says **FAILED-STRICT** or independent review rejects → continue this same goal
- If executive demo = YES and review/evidence pass → it reached this prompt's exit

## Relationship to soft goal

| File | Behavior |
|---|---|
| `OVERNIGHT_GOAL.md` | Allows partial B1 + handoff |
| **`OVERNIGHT_GOAL_STRICT.md` (this)** | Forbids partial; requires G2–G6, independent review with no critical/major defect, and live/compensated play |

Point the harness/goal at **this file** when you do not want early stop.
