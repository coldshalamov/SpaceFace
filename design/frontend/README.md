<!-- LIFETIME: DURABLE -->
# The Frontend Program

**The screens and the HUD are the strategic half of SpaceFace, not the connective tissue between
the fun parts.** This folder is the design authority for every 2D surface in the game.

---

## Why this program exists

The owner's standing judgement, in their own words:

> "I keep having agents working on the frontend and it's very cheap and uninspired… the moment to
> moment experience is weak right now partially because of the frontend and menu experiences."

And the ambition it is measured against:

> "The frontend screens and HUD **ARE** the gameplay, they're the home of the strategic experience
> that's symbiotic with the fast combat and spaceflight and keeps it grounded and understood. The
> map, menus, everything… The player needs to be able to understand the systems of the game through
> these screens, and understand the world outside the immediate view by the map, their ship by the
> ship menu."

> "Each screen should be inspired… think about what can be shown symbolically somehow and be
> intuitive, think of advanced frontend techniques that you could add in to make it seem like the
> menus themselves are like tiny games."

**Cheap frontend work is a specification failure, not a talent failure.** "Make the ship screen
good" produces slop from any author. These documents remove the guesswork.

---

## The finding that drives the program

**SpaceFace is a very large simulation with almost no windows into it.** Verified by audit:

| Running right now | What the player sees |
|---|---|
| **183 KB** of NPC careers — haulers, miners, salvors, surveyors, patrols, tenders with full job phase machines | `state.npcJobs` is read by **0 UI files** |
| **350 KB** of traffic simulation moving real prices | `state.traffic` is read by **0 UI files** |
| **124 KB** encounter director deciding what attacks you and when | no read on accumulating danger |
| **78 KB** law system with incidents, witnesses, warrants, custody | a **5-second banner** |
| **73 KB** claims system — 15 sites, 6 buildable modules, raids, defenses | undifferentiated dots on a map |
| **53 KB** surrender & custody — capture, prisoners, escape | the player **cannot tell a mercy outcome from a kill** |
| **28 KB** ace memory — 12 named pilots who remember your previous fights and adapt | **nothing ever names them** |
| Your bounty, which decides who hunts you | appears in **zero** UI files |
| `getDerivedStats` returns **~35** ship fields | the ship screen shows **6** |
| Your ship already accumulates kill tallies, patches, scorch, grime and graffiti | the only UI that read it is **dead code** |
| Five physics powers already bound to keys `4`–`8` | `clearingCone` and `skimCollector` have **zero** HUD references |

**The MMO depth the owner wants does not need to be invented. It needs to be revealed.**
That is why the frontend is where the game's remaining value is locked up — and why
*"I can't look at the HUD and see the big game that it will become"* is literally true: the game is
already bigger than the HUD admits.

---

## Read in this order

| Document | What it owns |
|---|---|
| **[`INSTRUMENT_GRAMMAR.md`](./INSTRUMENT_GRAMMAR.md)** | **Read first, binding.** Type roles, colour roles, the motion contract, the CREST/STAGE/APRON/DRAWER skeleton, the three disclosure tiers, class-naming rules that survive the accessibility sanitisers, the technique catalogue, and the per-screen definition of done. |
| [`SCREENS_A_FLIGHT.md`](./SCREENS_A_FLIGHT.md) | The flight HUD, the **Power Bar** (number-key abilities), the non-pausing quick radial, and the hour-1 / hour-10 / hour-50 progression. |
| [`SCREENS_B_SHIP_RANGE.md`](./SCREENS_B_SHIP_RANGE.md) | **THE SHIP** (orbit a stage) and **THE RANGE** (a playable systems explainer). |
| [`SCREENS_C_CHART_FOOTPRINT.md`](./SCREENS_C_CHART_FOOTPRINT.md) | **THE CHART** (the world outside your view) and **THE FOOTPRINT** (what you did and what it cost). |
| [`SCREENS_D_STATION_META.md`](./SCREENS_D_STATION_META.md) | The docked station destinations and the meta layer — title, pause, settings, save, codex, mission log, game over. |
| [`ICON_PIPELINE.md`](./ICON_PIPELINE.md) | The AI icon-generation pipeline: one fixed style anchor, one parameterised template, the conversion target, and the acceptance tests. |
| [`NEXT_JOBS.md`](./NEXT_JOBS.md) | **What to build next.** The sequenced roadmap (J1–J16) across short/medium/long horizons — covering core instruments, vector iconography, tactical HUD overhaul, rapid visual snapshot tooling, combat halos, tactile feel, and quick comms. Read this to pick up work. |
| [`A_LIST_GAPS.md`](./A_LIST_GAPS.md) | **What neither the game nor these specs account for** that a top-tier frontend needs: text expansion, the four data states, screen state memory, responsive/ultrawide strategy, the skill-tree and map needs an A-list build has, data conventions, virtualization, destructive-action policy, notification priority, visual regression testing, and the three absent meta screens. `ADDITIONS.md` lists *features to add*; this lists *standards to meet*. |
| [`ADDITIONS.md`](./ADDITIONS.md) | Candidate additions **beyond** the specced surfaces — entity links, loadout presets, the watch list, the re-entry digest, recallable events, chart notes, global find. Each checked against the codebase as genuinely absent. Includes a deliberately-rejected list. |
| [`icon-prompts/`](./icon-prompts/) | 16 ready-to-run prompt files, one per power. Committed so the set can be regenerated or extended later in the same style. |

Program routing and sequencing live in [`../../CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md).

---

## Live-code delta — read before implementing

These specs were authored against the tree at `41b78339`. A concurrent lane has since landed work
from the earlier direction document, so **two items described in the specs as open defects are
already fixed.** Verify against live code before acting on either:

| Spec says | Live code now |
|---|---|
| Opening a non-pausing screen drives `#hud` to `opacity: 0` over a running sim — the "blindfold" | **Fixed.** `styles/ui.css` now has `body.ui-live-screen #hud { opacity: .5 }` with a lightened backdrop, alongside the original `ui-modal-open` rule which correctly still applies to genuinely modal/pausing screens. |
| Native `<select>` controls must be replaced | **Primitive built.** `sf-select` exists in `src/ui/uiPrimitives.js` and is styled in `styles/ui.css`. **Adoption is incomplete** — native selects remain in `galaxyMap.js`, `screens/automationPanel.js`, `screens/starmap.js` and the dev sandbox. Adopt the existing primitive; do not design another. |

Note that the owner has since ruled that **the four instruments pause the world** (Skyrim-style), so
the `ui-live-screen` treatment now governs the *quick, non-pausing tier* rather than the main
instruments. Both mechanisms are wanted; they serve different tiers.

**General rule for these documents:** they are design authority, not a status report. Where a spec
describes current code, re-verify — this repo moves under you.

## Review pass — what the audit found and fixed

The four per-screen specs were written by parallel authors and then audited against each other and
against the grammar. Four real defects were found and corrected.

**Three of the four were defects in this grammar, not in the specs.** The missing token block, the
missing key table, and `--accent`'s unstated status were all omissions in the shared spine — the
specs diverged *because the thing they were supposed to agree with was incomplete*, and one spec
caught the token omission and patched around it locally. That is the more useful lesson than "agents
produced inconsistent work," and it is the honest one.

**Quality was also checked, not just consistency.** The two highest-stakes sections were read in
full against §12's definition of done: the Power Rail in `SCREENS_A_FLIGHT.md` §2 and the CONDITION
/ symbolic-encoding band in `SCREENS_B_SHIP_RANGE.md` §1.6. Both hold. The Power Rail additionally
surfaced a live defect nothing else had found — **four in-flight prompt surfaces already claim digit
keys on `document` in the capture phase and call `stopPropagation()`, so they silently beat any
flight binding today**, and `encounterChoicePrompt.js` claims `Digit1`–`Digit9`, the entire rank.
Verified directly at `encounterChoicePrompt.js:149` (capture-phase listener) and `:212` (the
`/^(?:Digit|Numpad)([1-9])$/` match), and at `lawfulInspectionPrompt.js:147`, whose own comment
states it owns `Digit1` "so a flight binding cannot fire through it." The spec's response — the
`hud:slotClaim` / `hud:slotRelease` contract, where the Rail *renders* a claim it cannot revoke — is
the correct one and is retained.

| Defect | Fix |
|---|---|
| **`F3` was assigned to two different screens, and THE FOOTPRINT had no entry key at all.** Parallel authors each picked plausibly and nothing reconciled them. | Added **§10.5 Entry keys — canonical** to the grammar as the single source (`F2` Ship · `F3` Footprint · `F4` Range, ordered by frequency of use). Spec B corrected to `F4`; spec C given `F3`. **The table outranks any per-screen document.** |
| **The grammar specified colour roles but never defined the tokens — and they do not exist in `styles/`.** Verified: `--sf-you` and siblings return zero matches. One spec caught this and published a local mapping; the other three diverged, and one used no role tokens at all. | Promoted that mapping into the grammar as the canonical block, with hex, the existing token each equals, and measured contrast on `--panel`. Local scoping voided; conformance headers added to the two specs that had drifted. Adding the tokens to `styles/ui.css` is now **Phase 0 work**. |
| **`--accent` `#39d0ff` had no stated status**, so any author could reach for it — it is the colour behind the flight HUD's 99 saturated-cyan usages. | Explicitly assigned **no role** and banned on new surfaces. A colour with no meaning cannot be spent to look sci-fi. |
| **Three separate additions (entity links, watch list, global find) share one resolver**, and building the screens first would force an expensive retrofit. | Recorded in `ADDITIONS.md` and promoted into **Phase 0** of the build-map sequence. |

**The general lesson, for future parallel authoring:** things that must agree across documents —
keys, tokens, shared primitives — have to be *pre-decided in the shared grammar*, not left for each
author to choose. Every defect above is an instance of that one mistake.

---

## The three rules that prevent cheap work

1. **Screens differ by centerpiece and manipulation verb, never by styling.** The Ship is a *stage
   you orbit*; the Chart is a *table you push things around on*; the Footprint is a *board you
   trace*; the Range is a *box you play in*. Same type, same colour roles, same motion verbs —
   completely different objects. *If two screens share a silhouette, one of them has no idea in it.*
2. **No motion ships without a named state variable behind it.** Overshoot amplitude is your hull's
   inertia. Power beams reverse when you overdraw. Anything that cannot name its variable is
   decoration and gets cut in review.
3. **The UI never invents.** Every explanatory phrase comes from an enumerated bank; an unknown tag
   renders *nothing*. This already exists in `src/ui/causeLedger.js` and is promoted here to house law.

---

## What is already built and unreachable

A recurring pattern worth knowing before writing any new code — several finished renderers sit
behind a dead import chain (`screens/stationHub.js` → `outfitting.js` / `shipyard.js`, neither
registered):

- `src/ui/shipEngineeringStage.js` — 3D stage + beams + ripples + **6 circular gauges** + hull-slot
  projection
- `src/ui/panels/handlingProfile.js` — the exact renderer that answers *"why does my ship fly like
  this"*
- `src/ui/panels/massDelta.js`, `src/ui/panels/moduleRisk.js`
- `src/ui/uiPrimitives.js` + the primitive block at the end of `styles/ui.css` — **the sanctioned
  design system currently ships in zero live screens**

**Check this list before building anything.** Reimplementing one of these is a review failure.
