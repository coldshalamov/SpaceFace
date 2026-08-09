<!-- LIFETIME: HISTORICAL -->
# Receipt — reference-sector binding pass, 2026-08-09

```yaml
candidateBase: e776bf11
headAtStart: 7933bbde   # HEAD moved mid-session; the checkout is hot
result: PARTIAL — review and binding complete; implementation not authorized
mutexesTaken: none
ledgeredClaimsSpent: 0
```

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
