<!-- LIFETIME: DURABLE -->
# What To Build Next

**Status:** sequenced job list for continued frontend work, written after the Phase 0 / Phase 1
implementation review. Companion to [`A_LIST_GAPS.md`](./A_LIST_GAPS.md) (standards) and
[`ADDITIONS.md`](./ADDITIONS.md) (features). This file answers *"what next, in what order, and what
does each one cost."*

---

## 1. What actually inhibits the player's best experience

Established by measurement across the audit, not by opinion. Ranked by how much each one costs the
player.

| # | The inhibitor | Evidence |
|---|---|---|
| 1 | **The simulation is invisible.** The game runs a huge world the player cannot see. | 183 KB of NPC careers, 350 KB of traffic, 124 KB of encounter direction, 78 KB of law, 73 KB of claims — `state.npcJobs` and `state.traffic` are read by **0 UI files**; `player.bounty` appears in **0** UI files. |
| 2 | **You cannot read your own ship.** | `getDerivedStats` returns ~35 fields; the ship screen shows **6**. Every module advertises a power draw against a capacity that is never displayed. Condition is absent. |
| 3 | **Nothing explains a rule.** | `help.js` is four blocks of keybindings; `codex.js` is 8 story-gated narrative tabs; onboarding speaks one 6-second line that cannot be recalled. |
| 4 | **The world does not remember what you did.** | `heat` is a decaying scalar; faction rep is a scalar overwrite; both are emitted with a `reason` and then discarded. No crime log, no standing history. |
| 5 | **The interesting powers are unreachable.** | Start = 5,000 cr; cheapest of 29 tech nodes = 6,000. The Massline's top tier sits behind a 2,500,000 cr capital-ship node. |
| 6 | **The HUD hides what the player can already do.** | Keys `4`–`8` fire five physics powers today; `clearingCone` and `skimCollector` have **zero** references anywhere in `src/ui/`. |
| 7 | **Screens forget everything.** | The map persists no layer toggle, commodity, zoom or tab — every open is a fresh open. |
| 8 | **Correct-but-blank reads as broken.** | Fixed once by hand on THE SHIP (an empty bay for 12 s on a cold open). There is still no shared empty/loading/error/denied policy, so the next screen will repeat it. |
| 9 | **The UI would break in translation.** | A live localization system and a pseudo-loc harness exist; no spec accounted for +40 % string growth until `A_LIST_GAPS.md` #1. |
| 10 | **One breakpoint.** | No ultrawide, 4K or handheld strategy. |

**The through-line: this is a surfacing problem, not a content problem.** Nearly every item is
"the game already computes this and never shows it." That is why frontend work has outsized leverage
here — and why several fixes are assembly rather than invention.

---

## 2. The jobs (Sequenced J01 – J16)

Each job names the A-list pattern it borrows, what the player gets, and what it costs to build.

### Phase 0: Foundational Properties & Shared Tooling (Do First)

**J01 · The four data states, as a shared primitive.** *(Adoption owed)*
*Pattern:* the skeleton/empty-state discipline every shipped consumer app has.
*Player gets:* never a blank screen that is technically correct.
*Cost:* one shared component (`mountDataState` landed `09111881`). Finish adoption across Chart market-feed (ERROR), Ship hull-resolve gate (LOADING), and station dock-refusal (DENIED).
*Prerequisite:* none. Doing it **before** later screens avoids repeating the fix per screen.

**J02 · Screen state memory.** *(Adoption)*
*Pattern:* universal; invisible when present, infuriating when absent.
*Player gets:* the map, ship, and station open where they were left.
*Cost:* small — a per-screen state bag in the save, restored on show (landed `16067c5e`).

**J03 · Everything is a link.** *(Tagging pass owed)*
*Pattern:* EVE Online's "Show Info" and Destiny's inspect — every noun is a door.
*Player gets:* twelve menus stop being twelve menus. Read a contract naming a company → click → their standing, doctrine, territory, history → click sector → chart opens focused there.
*Cost:* one entity resolver + drawer (landed `61497eab`). Finish the tagging pass across jurisdiction values, mission logs, market rows, and codex.

**J04 · Fast Component Snapshot & Visual Iteration Lab (`probe-frontend-snapshot.mjs`).**
*Pattern:* Storybook / Component isolation testbed with instant headless visual capture.
*Player / Developer gets:* agents and developers can iterate on frontend styling, icons, and cards with sub-second visual feedback without booting full 60 FPS Three.js gameplay.
*Cost:* create `scripts/probe-frontend-snapshot.mjs` and wire `package.json` (`npm run probe:frontend-snapshot`). Extend `_uilab.html` with component isolation fixtures for HUD anchors, cards, gauges, and faction roundels. Output clean `.devshots/frontend/<component>.png` and side-by-side visual diffs.
*Prerequisite:* none. Stands up first to empower rapid visual capture for all subsequent visual jobs.

### Phase 1: Unified Vector Iconography & Flight HUD Overhaul

**J05 · Unified Vector Iconography, Faction Crests & Asset Purge.**
*Pattern:* Homeworld / Wipeout precision aerospace vector standard (`currentColor` 24×24 stroke SVG).
*Player gets:* zero cartoonish OS emojis; distinct heraldic vector crests for all 14 galactic factions; unified aerospace symbols across station, outfitting, and flight.
*Cost:*
- Eradicate Unicode emoji symbols (`fitTree.js` ⛴, `accessibility.js` 🛡, ⚡, ♨, ⛔) in favor of 24×24 stroke SVG line art.
- Author 14 distinct geometric vector heraldic crests/roundels for factions (SCN, MTS, DMC, Reach, Quiet Choir, Vael, etc.) to replace `<rect><text>S</text></svg>`.
- Consolidate competing metaphors (`uiPrimitives.js` balance scale, coffee mug, knight shield) into `src/ui/station/icons.js`.
- Purge unreferenced raster reference sheets (`assets/ui/icons_atlas.jpg`, `assets/ui/reticle.jpg`).
*Prerequisite:* J04 (uses snapshot probe to verify icons).

**J06 · The Power Rail.**
*Pattern:* the MMO/looter action bar (WoW, Destiny) — permanent, numbered, and it fills as you grow.
*Player gets:* "I can see what I can do, and I can see it growing." The single most direct answer to *"I can't look at the HUD and see the big game."*
*Cost:* a HUD component plus the `hud:slotClaim` contract — four in-flight prompts already grab digit keys in the capture phase, so the Rail must render a claim it cannot revoke. Icons: 16 prompt files committed; author to 24×24 stroke SVG.
*Prerequisite:* J05 (vector icons). Spec is complete in `SCREENS_A_FLIGHT.md`.

**J07 · Tactical HUD Overhaul — "Ink on Vacuum", Column Grid & Wireframe Ship Condition.**
*Pattern:* DCS / Elite Dangerous high-glancability non-diegetic HUD telemetry.
*Player gets:* instantaneous combat parsing without reading text paragraphs; no misaligned staggered cards; dynamic ship damage wireframes matching the active hull.
*Cost:*
- Lock Right Dock (`.sf-target`, `.sf-overview`, `.sf-radar`) to a unified 220px column width, eliminating the 232px staggered card overhang.
- De-box the UI: replace opaque/semi-transparent cards and 2px borders with "ink on vacuum" open telemetry with hairline corner brackets.
- Streamline Target Panel: move combat hull/shield health into 3D in-world reticle arcs around the enemy target; condense the 8-line monospace paragraph into a compact visual threat badge + range bar.
- Enlarge & upgrade Radar: expand compact diameter from 180px to 220px; replace 4px dots with directional heading chevrons, double-stroke capital ship silhouettes, and high-threat pulsation rings.
- Dynamic Vector Ship Condition: replace static Scout PNG with dynamic SVG wireframes of the active player hull (`SHIP_SILHOUETTES`) with localized damage flash.
- Comms Ribbon: reposition the floating top-left comms button into a quiet, integrated frequency tape above the left contextual stack.
*Prerequisite:* J05, J06. Aligned with `design/HUD_FLIGHT_ATTENTION.md`.

**J08 · Dynamic Combat Reticle & 3D Off-Screen Threat Halo.**
*Pattern:* Ace Combat / Project Wingman dynamic targeting reticle and spatial threat awareness.
*Player gets:* fluid dogfighting without looking away from the crosshair; intuitive reaction to flanking hostiles and incoming missile locks.
*Cost:*
- Dynamic reticle: ballistic lead calculation pips, projectile convergence arcs, and weapon lock-on bloom.
- 360° off-screen threat halo: subtle screen-edge arc showing incoming missiles, flanking interceptors, and high-threat attack vectors.
*Prerequisite:* J07.

### Phase 2: Strategic Pausing Screens & Simulation Surfacing

**J09 · Ship bands 2–3: handling, power, condition, capability.**
*Pattern:* Elite Dangerous' outfitting comparison and Warframe's ghost-preview on hover.
*Player gets:* the answer to *"why does my ship fly like this"*, and a power budget with a capacity to draw against.
*Cost:* mostly assembly — mount `panels/handlingProfile.js` and `panels/massDelta.js`. Mount living-hull scar projections and capability sentences.
*Prerequisite:* J07.

**J10 · THE FOOTPRINT.**
*Pattern:* Red Dead 2's wanted system plus Crusader Kings' "why does this person hate me" causal chain.
*Player gets:* the world visibly remembers. A hostile patrol becomes traceable back to the collision that caused it.
*Cost:* an append-only ledger that only listens to events already emitted (`law:incidentReceipt`, `faction:repChanged{reason}`, `faction:repSpillover{srcFaction}`). Plus a three-pane screen (Rap sheet, Standing with spillover edges, Log with 12 named aces).
*Prerequisite:* J07, J09.

**J11 · THE RANGE.**
*Pattern:* Titanfall 2's gauntlet, Hitman's training, Deep Rock's tutorial bays — teaching by doing.
*Player gets:* learns the physics toolkit by flying it, and can come back to the lesson.
*Cost:* reuse `screens/drill.js` pattern (playable pausing minigame). Three drills first: Massline swing, mass-vs-turn slalom, energy-budget hold. Then weak-point bestiary pass.
*Prerequisite:* J07.

**J12 · THE CHART as a dispatch console.**
*Pattern:* X4's map, Total War's campaign layer, Death Stranding's route planning.
*Player gets:* answers *"where should I take this cargo, and is that route survivable?"* in seconds, and can act on the answer without leaving the map.
*Cost:* surgical edits to `src/ui/galaxyMap.js` — economic pressure model, risk estimator, live traffic layer, live conflict zones, and holdings inspection.
*Prerequisite:* J07, J10.

**J13 · Loadout presets and build identity.**
*Pattern:* Destiny loadouts, Monster Hunter equipment sets.
*Player gets:* *"different kinds of gameplay"* becomes real, because switching is cheap enough to experiment with. Each preset is labelled by playstyle — *"Tow & Swing"* — never by stats.
*Cost:* save schema, a preset rail in the ship's apron, and capability-sentence labelling.
*Prerequisite:* J09.

### Phase 3: Sensory Polish, Dynamic Diplomacy & Continuous CI

**J14 · Atmospheric Audio-Visual Feedback & Haptic Micro-Animations.**
*Pattern:* Alien: Isolation / Dead Space analog-tactile interface feel.
*Player gets:* physical, living instruments with inertial needle settling, CRT phosphor decay on capacitor discharge, sound-synced frequency visualizers on comms, and tactile click audio.
*Cost:* physics-based gauge easing, sound-synced comms waveform visualizer, and tactile mechanical switch audio.
*Prerequisite:* J07, J08.

**J15 · Contextual Quick-Comms Radial & Tactical Hail Deck.**
*Pattern:* Mass Effect / Star Wars Squadrons tactical comms and faction diplomacy wheel.
*Player gets:* in-flight dynamic interaction with NPC traffic (demanding surrender, paying bribes, requesting docking clearance) without breaking flight flow.
*Cost:* non-pausing tactical hail radial (`Alt` or `H` key), holographic frequency visualizers, and faction-crested pilot badges.
*Prerequisite:* J05, J07, J08.

**J16 · Visual regression in CI.**
*Pattern:* standard practice at every A-list studio — reference frames diffed automatically.
*Player gets:* nothing silently regresses.
*Cost:* extend the probes into a capture matrix — default / reduced-motion / `forced-colors` / pseudo-localized, at 2560×1080 / 1920×1080 / 1280×720 — and diff against committed references. Runs continuously alongside all jobs.
*Prerequisite:* J04 (uses the snapshot lab harness).

---

## 3. Sequential Execution Order (J01 ➔ J16)

```
PHASE 0: FOUNDATIONS & LAB TOOLING
  J01 (Four Data States) ──┐
  J02 (State Memory)     ──┼─► J04 (Visual Snapshot Lab) ──► J05 (Vector Icons & Crests)
  J03 (Entity Links)     ──┘

PHASE 1: FLIGHT HUD & TELEMETRY
  J05 (Icons) ──► J06 (Power Rail) ──► J07 (Tactical HUD Overhaul) ──► J08 (Combat Reticle & Threat Halo)

PHASE 2: STRATEGIC SCREENS
  J07 (HUD) ──► J09 (Ship Bands) ──► J10 (The Footprint) ──► J12 (The Chart)
                                └──► J11 (The Range)
                                └──► J13 (Loadout Presets)

PHASE 3: POLISH, DIPLOMACY & CI
  J08 (Reticle) & J09 (Ship) ──► J14 (Tactile Haptics & Audio)
                             └──► J15 (Quick-Comms Radial)

  J16 (Visual Regression in CI) diffs reference frames continuously from J06 onward.
```

**Key Execution Rules:**
1. **J01–J03 (Properties) & J04 (Visual Lab) come first**: every screen built after them inherits state safety, linking, and instant visual verification without rework.
2. **J05 & J06–J08 deliver the immediate high-visibility flight upgrade**: eliminating emojis, de-boxing the HUD, and establishing combat glancability.
3. **J09–J13 reveal the deep simulation**: surfacing ship handling, crime history, gauntlet drills, economic flows, and playstyle fits.
4. **J14–J16 finish sensory feedback, diplomacy, and automated regression safety**.
