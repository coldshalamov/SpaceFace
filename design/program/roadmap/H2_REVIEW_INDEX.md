<!-- LIFETIME: VOLATILE -->
# H2 review index — one sitting, six decisions

Phase H1 produced the **functional headed evidence** for the Gold-Corridor packets. This page is the
agenda for the Phase H2 human-verdict session. Budget ~30 minutes.

Organised **by decision, not by packet**. Each section states the question you must answer, points at
the evidence that answers it, and says what your answer unblocks. Answer the question in the
"Verdict" line; the integrator turns those lines into receipt upgrades in Phase H4.

## How to read the evidence

- **No performance claim appears anywhere in H1.** Frame timings, p95/p99 and hitch counts are Phase
  H3 and were captured on a contended machine here. Where a harness printed timings anyway, the
  committed copy carries `"informational_contended": true` — treat those numbers as *not evidence*.
- What H1 *does* assert is functional: draw and program **counts**, GPU admission and residency
  **booleans**, DOM assertions, and screenshots.
- Rows that failed are listed with the same weight as rows that passed. A failure is still a
  decision: *does this defect block acceptance?*

## Status of the eight H1 rows

| Row | Subject | Result | Evidence |
|---|---|---|---|
| 1 | headed `check:assets:live` | **PASS** | [row1-assets-live](evidence/h1/row1-assets-live/EVIDENCE.md) |
| 2 | PQ-021 broker cell + Electron parity | **PASS** | [row2-pq021-ledger](evidence/h1/row2-pq021-ledger/EVIDENCE.md) |
| 3 | PQ-019A presentation + counts | **FAIL — HARNESS (facility/count evidence survives; capsule stills missed subject)** | [row3-pq019a-presentation](evidence/h1/row3-pq019a-presentation/EVIDENCE.md) |
| 4 | `pq019-surface-heist` broker manifest | **FAIL — HARNESS (DOM abandon + lawful observe survive; remaining routes unproven)** | [row4-pq019-surface-heist](evidence/h1/row4-pq019-surface-heist/EVIDENCE.md) |
| 5 | PQ-020 Ceres functional route | **FAIL — HARNESS (valid Helios→Ceres jump survived; route stopped on unsupported 300-WU threshold)** | [row5-pq020-ceres-route](evidence/h1/row5-pq020-ceres-route/EVIDENCE.md) |
| 6 | PQ-023 cues in motion | _pending_ | |
| 7 | PQ-022 asset leaves | _pending_ | |
| 8 | Electron end-to-end smoke | _pending_ | |

---

## Decision 1 — Relay collar: accept, or re-author?

**Question:** Looking at `place_claim_outpost_relay` sitting on a real asteroid on the ordinary
Asteroid Ops exterior route — is the authored collar good enough to ship as the claim-beacon
identity, or does it go back for re-authoring?

Context you need: the PQ-022 receipt carries a re-authoring advisory of its own, and the codex asset
census ranked this leaf in its top five re-author candidates. So the default is *not* "accept
because it renders".

**Evidence:** _pending (row 7)_

**Unblocks:** relay-collar receipt → `route_accepted`, which is the blob PQ-024 binds as
`evidenceDependencies` before PQ-024 implementation can dispatch.

**Verdict:** _____________

---

## Decision 2 — PQ-019A facility and capsule art

**Question:** At the normal game camera, do the launcher, the lawful catcher, the fence and the
physical cargo capsule read as four *distinct, purposeful* facilities — or as interchangeable
greebled boxes? Is the capsule legible as a thing you could steal?

**Evidence:** [row 3 presentation and counts](evidence/h1/row3-pq019a-presentation/EVIDENCE.md).
The facility stills and all functional counts are reviewable. The capsule question is **not
answerable from H1**: the one attempt missed the moving subject at all three framings (HARNESS), so
do not mistake its player/planet frames for capsule art evidence.

**Unblocks:** a facility-only verdict now; the capsule half and therefore full PQ-019A art closure
remain blocked on a valid future capture. Once that exists, it closes the remaining evidence rows in
`receipts/PQ-019A-facility-embodiment-REPORT.md` and, with Decision 6, unblocks the parent PQ-019
promotion (including the W03/W04/W05 alias replacement).

**Verdict:** _____________

---

## Decision 3 — PQ-023 cues in motion

**Question:** Watch the frame sequences, not the stills. Does a flak impact read as *different from*
an autocannon impact at a glance? Does a destruction land? Do the Cathedral's damage and recovery
states read as damage and recovery? And do the reduced-motion and reduced-flash variants still carry
the same information?

The PQ-023 receipt argues its headline claim "cannot be photographed" — that objection is about
*suppressed* cues, which by definition do not render. Everything in this section does render; the
committed suppression trace covers the rest.

**Evidence:** _pending (row 6)_

**Unblocks:** cues milestone receipt → `milestone_accepted`, which PQ-025's binding requires.

**Verdict:** _____________

---

## Decision 4 — PQ-020 pocket distinctness and Cathedral presence

**Question, part A:** Flying refinery → Belt Outpost → beacon → Cathedral, does each pocket feel like
a *different place*, or does Ceres read as one undifferentiated field with different labels?

**Question, part B:** Does the Wreck Cathedral have presence — does it land as a landmark worth
travelling to — at close, default and far framing?

**Evidence:** [row 5 Ceres route attempt](evidence/h1/row5-pq020-ceres-route/EVIDENCE.md).
The one Browser attempt made a valid public Helios → Ceres production jump, then stopped immediately
on an unsupported absolute endpoint-distance assertion. It never reached the refinery, outpost,
beacon, Cathedral approach, save/Continue, second endpoint direction, or Electron parity. The two
surviving frames are route/failure diagnostics, not pocket-distinctness or Cathedral-presence art
evidence.

**Unblocks:** nothing from H2 yet. Both visual questions must be **deferred** until a valid future
capture reaches the four pockets and the Cathedral's close/default/far framings. PQ-020 integration
and the relocated PQ-018 Phase-4 closure remain open.

**Verdict:** DEFER — valid presentation evidence not captured

---

## Decision 5 — PQ-021 Ledger legibility

**Question:** With the five Cathedral evidence pages earned on the live route and read through
*both* ordinary hosts (station dock → Ledger destination, and flight `K` → Codex → Ledger tab): is
each authored image legible at its bounded crop, is its provenance clear, and does the same
information genuinely arrive in both hosts?

The H1 route proves keyboard/mouse focus enters each evidence page and returns to its opener. During
this H2 sitting, also perform the still-open **physical-controller pass** (Y/Triangle → Codex →
Ledger → evidence page → Back) rather than treating the shipped mapping assertion as controller
evidence.

**Evidence:** [Browser broker cell + Electron parity](evidence/h1/row2-pq021-ledger/EVIDENCE.md)

**Unblocks:** PQ-021 → `route_accepted` / `integrated`.

**Verdict:** _____________

---

## Decision 6 — PQ-019C heist route acceptance

**Question:** Do the five named heist routes — lawful observe, heist-plus-fence, confiscation,
destruction, reduced-stake recovery — hold up on the live route, with a single one-voice floor pill
carrying the composed witness/WANTED/pursuit line and no competing pill?

**Evidence:** _pending (row 4)_

**Unblocks:** PQ-019C acceptance evidence, and with Decision 2 the parent PQ-019 promotion.

**Verdict:** _____________

---

## Decision 7 — Electron sanity

**Question:** Not an art judgement — a go/no-go. Does the shipped Electron shell carry a player from
menu → New Game → flight → dock → Ledger without a defect that would embarrass a build?

**Evidence:** _pending (rows 2 and 8)_

**Verdict:** _____________

---

## What is deliberately NOT in this session

- **Matched performance** (Phase H3). Every perf row stays open regardless of what you decide here.
  H3 needs a quiet machine, one lane at a time; H1 ran contended by design.
- **The graphics program's outstanding G7s** (debris/hulk/dock, Kestrel V6+stencil, modular hulls,
  Ashline V2). The batch doc offers these for the same sitting if you want them — they are not
  blocked on H1 and are not listed above.
