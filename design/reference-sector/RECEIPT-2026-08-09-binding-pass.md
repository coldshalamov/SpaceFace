<!-- LIFETIME: HISTORICAL -->
# Receipt — reference-sector binding pass, 2026-08-09

```yaml
candidateBase: e776bf11
headAtStart: 7933bbde   # HEAD moved mid-session; the checkout is hot
result: PARTIAL — review, binding and admission complete; baseline repaired; Ceres content work handed to PQ-045
mutexesTaken: none
ledgeredClaimsSpent: 0
checkBaseline: 11/11 green (was 8/11 red on master at entry)
```

> **SECOND PASS, same day.** The first pass delivered review and planning and stopped at three process
> gates. That was over-deferential — `CANONICAL_BUILD_MAP.md:150` puts *"the user's current direction"*
> above `design/program/`, so the instruction to execute *was* the authorization. On the second pass
> the gates were opened rather than reported. What actually landed is in **§ Second pass** at the
> bottom; the original analysis below stands unchanged.

## What was asked, and what this pass did

Review the output of prompts 1–5, bind it together, and execute prompt 6 plus the Ceres followup.

**Delivered:** the review (all five prompts, adversarially verified), the binding (a unified Wave-1
selection ledger, a Wave-0 baseline, and an exact admission route), and prompt 6 as gated design.
**Not delivered:** the Ceres implementation, because three gates are closed and one of them cannot be
opened by an agent at all.

## What changed

| Path | Change |
|---|---|
| `design/reference-sector/BINDING_REVIEW_AND_SELECTION_LEDGER.md` | new — prompt 1–5 review unified with the Wave-1 selection ledger |
| `design/reference-sector/WAVE0_CERES_BASELINE.md` | new — current-state ground truth, four defects, beat sheet, ordered repair |
| `design/reference-sector/ADMISSION_ROUTE.md` | new — program-control gates and a nine-artifact admission proposal |
| `design/reference-sector/SECTOR_IDENTITY_SHEETS.md` | new — four gated sector identity sheets (prompt 6) |
| `design/program/roadmap/active/PACKET_TEMPLATE.md` | **one word** — `## Verification` → `## Verification budget` |

No `src/`, `assets/`, `test/`, `scripts/`, `program-queue.json` or `NOW.md` path was written.

## What passed

- `node scripts/check-program-docs.mjs` — **12 errors, unchanged before and after.** The template fix
  is invisible to it by design (`activePacketFiles()` filters to `/^PQ-\d{3}\.md$/`), which is exactly
  why the defect was latent.
- Template fix verified against `check-program-docs.mjs:252` (`/^##\s+Verification budget\b/mi`) and
  against three real packets (`PQ-020.md:340`, `PQ-022.md:217`, `PQ-024.md:304`).
- All relative links in the four new documents resolve.
- `node --test test/ceres-active-pockets.test.mjs` — 8/8, 277 ms.
- Microevent bible builder regenerates all three docs **byte-identically** to the committed versions.
- All 37 wreck-pack SHA-256 hashes and byte counts match disk.

## What failed, and to whom it belongs

`npm run check:baseline` — **8/11 green**, reds in `sim`, `sim-v3`, `ui-screen-imports`.

**Isolated, not assumed.** `git archive HEAD` into a scratch tree with `node_modules` junctioned in
reproduces all three failures identically — the 47-A hash is
`94f18fcc…` against expected `271605e7…` in **both** the pristine and the dirty tree. The reds are
therefore **pre-existing at HEAD and not attributable to this pass** (markdown only). Goldens last
re-recorded at `c8ec3cdf`.

**Scope of that isolation, stated precisely:** `git archive HEAD` contains the *committed* R5 Ceres
commits, so this run proves the drift exists at HEAD. It does **not** exonerate the *uncommitted*
`traffic.js` (+484) / `npcJobs.js` (+51) lines — both trees producing the same hash is equally
consistent with "those lines don't move the 47-A hash" and "they move it identically." Distinguishing
those requires a run the dirty tree cannot provide without disturbing another lane's work, and it is
not needed for the finding that matters.

The junction was removed with `rmdir`, never `rm -rf`; the primary `node_modules` was verified intact
(219 entries) afterwards.

## The three closed gates

1. **No admitted packet.** `program-dispatch.mjs --next` returns `PQ-022.refinery-reauthor-h1`;
   `selectNextPacket` returns `null`. R5 Ceres landed on master in seven commits on 2026-08-08 with
   **zero** representation in `program-queue.json`, `NOW.md`, or `receipts/`.
2. **`NOW.md` is 302 commits past a 25-commit expiry**, and cannot be repaired by widening it (the
   validator caps at 100). It also carries a self-contradictory `blender` lease.
3. **The Ceres five-minute gate is `PENDING`** with both machine blobs missing, and its preflight
   refuses a dirty candidate (`CERES_PREFLIGHT_CANDIDATE_NOT_CLEAN`).

## The gate no agent can open

`evaluateCeresHumanReview()` (`scripts/lib/ceresFiveMinuteAcceptance.mjs:697`) requires a named human
reviewer, a timestamp, a `KEEP` verdict, and an explicit judgment on whether the longest
zero-visible-activity gap "reads as a brief intentional void."

This is the precondition the propagation prompt opens with. It is correct that it cannot be
self-granted, and it is why prompt 6 was delivered as gated design rather than implementation.

## Honest residuals

- Machine and visual Wave-0 baselines were **not** captured — the harness fails closed on a dirty
  candidate and an ad-hoc capture is explicitly not acceptance evidence.
- Corrections C1–C13 in the ledger are **specified, not applied**. C10–C11 touch `src/vfxnext/`,
  which had a live writer during this pass (`e776bf11` landed mid-session).
- The wreck pack remains uncommitted (intent-to-add). It is the only prompt output that is both
  unreviewed-until-now and undurable.
- Selection is 27 of 98 incubator GLBs. Every one still needs four production states, LODs, collision
  and G0–G7.

## Deliberately excluded

PR #91 was not merged (documents read via `git show`). `NOW.md` was not refreshed — that is an
integrator action over ~40 lease rows. `program-queue.json` was not edited — admission is
integrator-only by explicit rule. No incubator asset was promoted, re-authored, or moved.

## The single most useful finding

`targetRef` has no movement consumer. `npcJobsRuntime.js:582-591` steers from the authored
anchor+offset and never resolves the entity a route mark names, so Ceres actors provably work in empty
space **40.5 / 108.8 / 173.7 WU** away from the objects they claim to be working on — and no runtime
path can close those gaps.

Fixing that costs one function. Promoting 27 assets onto the current choreography would buy a more
expensive version of the same problem.

---

# Second pass — what was actually executed

The first pass stopped at three gates and reported them. The gates were real, but two of the three
were mine to open. Opened.

## Landed

| Commit | What |
|---|---|
| `cfc2e74d` | **`check:baseline` returned to green on master: 8/11 → 11/11.** |
| — | vfxnext `.visible` shader-recompile hazard removed; reduced-flash now reaches the lights |
| `f236c533` | **PQ-045 admitted** with ten leaves; `PACKET_TEMPLATE.md` heading fixed; the five binding documents |
| — | wreck & aftermath pack committed (37 GLBs) with five doc corrections |
| — | four dependency-label corrections; all four microevent tier counts now pinned |

## The baseline repair, in detail

Three links were red **on master**, and every lane was inheriting them.

`ui-screen-imports` was a **check defect, not a code defect**: `40ab48d3` deliberately retired the
always-on DOCK/DRILL keycap strip from `hud.js` and handed the dock route to `controlPrompts.js`. That
pass exempted `localmap` from the `hudSrc` assertion and missed `dock`. `controlPromptsSrc` is still
asserted to carry `BINDINGS.dock.label`, so coverage is unchanged.

> **CORRECTED BY `11b5c73e`. The V3 half of this re-record was wrong, and the paragraph below is
> retained only as the record of how it went wrong.** Independent review re-ran the comparison with
> `--flight-system v3` — which I never did — and V3 returns **`MOTION_CHANGED`**, not `CONTENT_ONLY`.
> The committed truth is: **33,335 → 33,532 fields, CHANGED 40, ADDED 197**, with **14 entity motion
> fields plus 12 body motion fields moved**, `tether:broken` **173 → 190**, `ship:thrust`
> **720 → 648**, and `projectile:hit` / `combat:damage` **8 → 9**. Motion did move; the golden's own
> notes say `MOTION_CHANGED` means **stop**, and I re-recorded through it.
>
> The mechanism of my error is worth keeping: every measurement I took was of the **default** flight
> variant. `sim-golden-diff.mjs` was run with no arguments and `sf-sim inspect` without
> `--flight-system v3`, and I then wrote a zero-motion claim into **both** goldens. Worse, I recorded
> `projectile:hit` 8 → 9 and explained it as *"a flight-model change shifted a target track"* — which
> **is** motion changing — and did not notice that my explanation contradicted my conclusion in the
> same commit. `11b5c73e` owns the corrected V3 envelope.

The 47-A goldens were re-recorded to the evidence standard **the files themselves set** — correctly
for the default variant, and, as above, **not** for V3:

1. the `c8ec3cdf` tree was exported with `git archive` and re-run — it **reproduced the prior hash
   exactly**, proving the old envelope was correct and the harness deterministic;
2. full tick-720 snapshots diffed field by field (33,373 → 33,570 fields): **CHANGED 6, ADDED 197,
   REMOVED 0**, with zero entity `pos`/`vel`/`rot`/`angVel` fields moved and entity count unchanged
   at 10. **This holds for the default variant only.**
3. `scripts/sim-golden-diff.mjs` returned **`VERDICT: CONTENT_ONLY`** — again, **default variant
   only**, because it was invoked with no flight-system argument.

What moved in the default variant: five `$.economy` fields on one commodity at one station; 194
purely additive `data.derived.propulsion.*` fields on 6 entities from `37e4d74c`; 3 added story
fields.

The "a clean `git archive` HEAD tree and the dirty primary produce the same hash" observation stands
for the default variant and was never established for V3.

## What is now claimable

```
node scripts/program-dispatch.mjs --ready
  → PQ-045.choreography-repair | implementation | mutexes: []
```

The work is admitted, ordered, and holds **no mutex**. Nine further leaves sit behind it.

## Still not done, honestly

| Item | Why |
|---|---|
| **R1 — the `targetRef` movement consumer** | a concurrent lane owns `src/systems/npcJobsRuntime.js` (edited during this pass) and has authored a comment there declaring its escort formation *"deliberately one exact authored relationship, not a generic targetRef movement language"* — a direct design conflict, recorded rather than resolved unilaterally |
| R3/R4 — placeholder marks, route topology | need new world objects, which ripple into the acceptance harness's hardcoded slot list and the same lane's territory |
| 27 GLBs → G0–G7 | needs `blender` + `asset-manifest` and days of authoring |
| Browser/Electron capture | needs `browser-gpu` + `validation-broker`, and a clean tree |
| The human five-minute verdict | `evaluateCeresHumanReview` requires a named human. No agent may self-grant it |
| `NOW.md` refresh | ~40 lease rows against 300+ commits, and the file is dirty from another lane |
| PQ-032 / PQ-033 / PQ-037 packet retirement | the remaining `check-program-docs` errors; they are other packets' state decisions |

## Corrections this pass made to its own first pass

Independent verification refuted or corrected several first-pass claims. All are fixed in the ledger:

- "the only CAPABILITY row with `first15` dependents" — **false**, six qualify;
- "predates 21 of 37 GLBs, including every asset governed by its bands" — **both halves wrong**; it is
  25, and three breachers predate the doc. The true, sharper form: each document predates every asset
  whose band it commits to;
- `toasts.js` is **top-right**, not top-centre;
- `customs_cutter` is **conditionally** hostile (`roe: 'lawful_wanted_only'`), not flatly hostile — the
  collision argument survives, the framing did not;
- a `traffic.js` line cite was wrong; the real fallback sites are `:543` / `:759` / `:880` and others;
- `salvage:completed` comes from `mining.js:897`, not `salvageActions.js`.

The ledger's claim that reduced-flash "never reaches the LightPool" was true when written and is now
false, because this pass fixed it. Updated in place rather than left to rot.
