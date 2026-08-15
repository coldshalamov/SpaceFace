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
| [`icon-prompts/`](./icon-prompts/) | 16 ready-to-run prompt files, one per power. Committed so the set can be regenerated or extended later in the same style. |

Program routing and sequencing live in [`../../CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md).

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
