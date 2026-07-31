<!-- LIFETIME: VOLATILE -->
# H2 review index — seven named decisions

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
| 3 | PQ-019A presentation + counts | **REPAIR PASS / H1 CONTINUATION READY (facility/count evidence survives; capsule stills remain unproven)** | [row3-pq019a-presentation](evidence/h1/row3-pq019a-presentation/EVIDENCE.md) |
| 4 | `pq019-surface-heist` broker manifest | **REPAIR PASS / H1 CONTINUATION READY (DOM abandon + lawful observe survive; remaining routes unproven)** | [row4-pq019-surface-heist](evidence/h1/row4-pq019-surface-heist/EVIDENCE.md) |
| 5 | PQ-020 Ceres functional route | **REPAIR PASS / H1 CONTINUATION READY (valid Helios→Ceres jump survives; remainder unproven)** | [row5-pq020-ceres-route](evidence/h1/row5-pq020-ceres-route/EVIDENCE.md) |
| 6 | PQ-023 cues in motion | **REPAIR PASS / H1 CONTINUATION READY (combat motion survives; Cathedral sequence and Electron parity unproven)** | [row6-pq023-cues](evidence/h1/row6-pq023-cues/EVIDENCE.md) |
| 7 | PQ-022 asset leaves | **PASS — one Browser launch; 11 exact identities, 13 admitted stills** | [row7-pq022-asset-leaves](evidence/h1/row7-pq022-asset-leaves/EVIDENCE.md) |
| 8 | Electron end-to-end smoke | **REPAIR PASS / H1 CONTINUATION READY (Main Menu visibly rendered; New Game→Ledger unproven)** | [row8-electron-e2e](evidence/h1/row8-electron-e2e/EVIDENCE.md) |

---

## Decision 1 — Relay collar: accept, or re-author?

**Question:** Looking at `place_claim_outpost_relay` sitting on a real asteroid on the ordinary
Asteroid Ops exterior route — is the authored collar good enough to ship as the claim-beacon
identity, or does it go back for re-authoring?

Context you need: the PQ-022 receipt carries a re-authoring advisory of its own, and the codex asset
census ranked this leaf in its top five re-author candidates. So the default is *not* "accept
because it renders".

**Evidence:** [Row 7 relay close/default/far and exact-admission receipt](evidence/h1/row7-pq022-asset-leaves/EVIDENCE.md).
The one-use Browser cell passed at fixed seed 47 with the exact release identity admitted and no
readable fallback. Review all three relay framings. The structural receipt's reservation remains live:
this is an authored grey primitive assembly, not a loading failure.

**Unblocks:** relay-collar receipt → `route_accepted`, which is the blob PQ-024 binds as
`evidenceDependencies` before PQ-024 implementation can dispatch.

**Verdict:** BLOCKED — named owner `SpaceFace human visual reviewer`; no independent human art
reviewer is available in this autonomous recovery run

---

## Decision 2 — PQ-019 facility/capsule art and heist-route status

**Question, art:** At the normal game camera, do the launcher, lawful catcher, fence, and physical
cargo capsule read as four *distinct, purposeful* facilities — or as interchangeable greebled boxes?
Is the capsule legible as a thing you could steal?

**Question, function:** Do the five named PQ-019C routes — lawful observe, heist-plus-fence,
confiscation, destruction, and reduced-stake recovery — hold up on the live route, with one composed
witness/WANTED/pursuit floor pill and no competing pill?

**Evidence:**

- [row 3 presentation and counts](evidence/h1/row3-pq019a-presentation/EVIDENCE.md) — facility stills
  and functional counts survive; the capsule question is **not answerable from H1** because the single
  attempt missed the moving subject at all three framings (HARNESS). Do not treat its player/planet
  frames as capsule art evidence.
- [row 4 registered surface-heist attempt](evidence/h1/row4-pq019-surface-heist/EVIDENCE.md) — the DOM
  abandon and lawful-observe evidence survive, but the remaining heist/fence, confiscation,
  destruction, recovery, and final one-voice composition routes are unproven after the HARNESS
  failure.

PQ-019C is deliberately folded into this broader PQ-019 decision; it does **not** receive a seventh
standalone decision. Record useful facility/lawful-observe notes now, but do not promote the parent on
partial evidence.

**Unblocks:** a facility-only art note now. Full PQ-019A/PQ-019C closure and the parent PQ-019
promotion remain blocked on valid capsule and remaining functional-route evidence.

**Verdict:** _____________

---

## Decision 3 — PQ-023 cues in motion

**Question:** Watch the committed reel and frame sequences. Does a flak impact read as *different from*
an autocannon impact at a glance? Do the small, ordinary and capital destruction lifecycles land? Does
the reduced-motion/reduced-flash ordinary sequence retain the same state information, and does the
dense scene remain readable?

**Evidence:** [row 6 headed cue-motion attempt](evidence/h1/row6-pq023-cues/EVIDENCE.md), including
the original WebM, curated frame sequences, and the deterministic suppression trace. The one Browser
attempt completed the combat/reduced/dense sections, then failed **HARNESS** before the first Cathedral
frame because it waited for authored admission before moving the player into admission range.

The available combat subset is valid for H2 notes. The Cathedral's normal/reduced damage and recovery
states, its `ring` / `bracket` live-route captions, final Browser cleanup assertions, and Electron parity
are **not** evidenced. Suppressed cues remain covered by the committed deterministic trace: all 18
critical cues emitted and 42 flavor cues were intentionally suppressed with an explicit lane-budget
reason.

**Unblocks:** no milestone upgrade yet. A future valid Cathedral capture plus Browser completion,
Electron parity, and the human motion verdict are still required before `milestone_accepted` can bind
into PQ-025.

**Verdict:** DEFER — review combat subset now; Cathedral motion and Electron parity not captured

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

**Verdict:** BLOCKED — named owner `SpaceFace human reviewer with a physical controller`; no such
reviewer/controller is available in this autonomous recovery run

---

## Decision 6 — Electron sanity

**Question:** Not an art judgement — a go/no-go. Does the shipped Electron shell carry a player from
menu → New Game → flight → dock → Ledger without a defect that would embarrass a build?

**Evidence:** [Row 2 Ledger Browser/Electron parity](evidence/h1/row2-pq021-ledger/EVIDENCE.md) and
[Row 8 shipped-shell attempt](evidence/h1/row8-electron-e2e/EVIDENCE.md). Row 2 proves the Ledger
surface in Electron after route preparation. Row 8 proves isolated shell launch, canonical root,
visible Main Menu, and clean owned shutdown, but its single attempt stopped on a **HARNESS** false
negative before New Game: the rejected predicate said the menu was invisible while the screenshot,
`mode: menu`, `visibleScreens: [mainMenu]`, and focused New Game button all showed otherwise.

During H2, perform this short manual chain in the shipped Electron shell: Main Menu → New Game →
Launch → Helios Station waypoint/autopilot → visible `E` dock → Ledger. If any player-visible defect
appears, record it here. If the chain is not performed, keep the decision deferred; do not infer a PASS
from Row 2 or the Row 8 Main Menu frame alone.

**Verdict:** DEFER — automated menu→dock→Ledger chain not captured; manual H2 smoke required

---

## Decision 7 — Corridor stations, lane furniture, and traffic bodies

**Question:** Do the four corridor stations, jump ring/billboard/nav-buoy set, and three Helios
traffic bodies each carry a readable, role-specific identity at the captured game camera, or does any
group need revision before the corridor-required-assets milestone can close?

**Evidence:** [Row 7 exact headed presentation](evidence/h1/row7-pq022-asset-leaves/EVIDENCE.md).
H1 proved exact release identity, authored admission, centered subjects, and no readable fallback.
It did not issue a visual-quality verdict. The traffic frames include the player Kestrel in the
foreground; record `blocked` for any identity whose framing is not sufficient to judge rather than
silently accepting it.

**Unblocks:** the human-disposition half of
`PQ-022.gold-corridor-required-assets` → `milestone_accepted`. Matched performance remains H3.

**Verdict:** BLOCKED — named owner `SpaceFace human visual reviewer`; the required four station,
three furniture, and three traffic dispositions cannot be issued by Codex

---

## What is deliberately NOT in this session

- **Matched performance** (Phase H3). Every perf row stays open regardless of what you decide here.
  H3 needs a quiet machine, one lane at a time; H1 ran contended by design.
- **The graphics program's outstanding G7s** (debris/hulk/dock, Kestrel V6+stencil, modular hulls,
  Ashline V2). The batch doc offers these for the same sitting if you want them — they are not
  blocked on H1 and are not listed above.
