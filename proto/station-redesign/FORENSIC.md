# Station redesign — forensic review

Scope: the live "Orbital Command" station (`src/ui/station/`, `styles/station.css`) versus the previous
working hub (`src/ui/screens/stationHub.js` + sibling panels). This document is a review only; it
changes no live code.

---

## 1. Behavior-parity matrix (every changed station interaction)

Verdicts:
- **PRESERVED** — same destination *and* same task in the same number of steps.
- **DESTINATION-ONLY** — you reach the same screen but the task got longer/harder (the failure you named).
- **REGRESSION** — a task that worked no longer works.
- **INTENTIONAL-CHANGE** — a deliberate model change per the brief (may still be weakly executed; see §2).

| # | Interaction | Old workflow (evidence) | New behavior | Verdict |
|---|---|---|---|---|
| 1 | **Primary navigation** | macOS-style magnify dock: cursor-proximity scaling + neighbour falloff + spring; the one kinetic element | Flat top labelled-icon bar; active = filled box + top bar; no magnification, no physics | **REGRESSION** (kinetic identity destroyed) |
| 2 | **"Sell what you hauled"** (first-dock + departure) | Opens Market in **sell mode filtered to only hold items**, per-row Sell → one-step liquidation (`market.js:822`, `:1803`; `stationHub.js:firstDockHandoffSteps` sets `tradeMode:'sell'`) | `TARGET_MAP` maps `hold→market`, **drops `tradeMode`** → Market opens in buy mode, unfiltered (40+ rows), central console. You hunt for your own cargo. | **DESTINATION-ONLY** |
| 3 | **Cargo Hold** | Dedicated Hold panel: storage meter + manifest + **per-row Sell buttons** (`stationHub.js:1462`, `.st-sell-btn :3543`) | Read-only popover on the Hold readout: qty + unit sell price, **no Sell action** | **DESTINATION-ONLY** (sell workflow gone) |
| 4 | **Departure chip → fix it** (fuel/hull) | Chip routes to Services tab → Refuel/Repair button; you act on the risk in-place | Departure-Check chip for fuel/hull maps `services→null` → **clicking does nothing** | **REGRESSION** (dead control) |
| 5 | **Repair / Refuel / Resupply** | Services tab: quote→confirm→`ui:service`, a "Recommended before undock" row, plus toll/scan/survey services | Dock action tiles: instant, live cost; repair/refuel/ammo only; no recommendation, no toll/scan/survey | **INTENTIONAL-CHANGE** (core kept; recommendation + secondary services dropped) |
| 6 | **Undock / egress** | Explicit Undock (hold-to-confirm on risk); implicit Esc/backdrop → exit owner → confirm | Undock tile (READY/CHECK/RISK) → Departure Check; Esc/backdrop wired | **PRESERVED** (only after the checks-pass fixes; was briefly a REGRESSION — Esc/backdrop were dead) |
| 7 | **Buy a hull** | List + preview + buy | Shipworks Fleet/Buy: 3D preview + spec + buy | **PRESERVED** |
| 8 | **Fit modules** | File-tree fit hierarchy + 3D stage with **hardpoint highlights + power-flow beams + ghost preview on the hull** | Slots are a **list on the right**; click → side drawer of compatible parts; delta text | **REGRESSION of interaction depth** (spatial hardpoint selection on the hull is gone; power-flow/ghost reduced) |
| 9 | **Market trade** | Per-row Buy/Sell buttons + qty + **search + sortable columns** + best-trades planner (Load & Nav / Set Nav) | Central Buy/Sell console + chart + Trade Routes (Set Course) | **INTENTIONAL-CHANGE** (per "not a table"); but per-row quick-trade + search + sort were dropped |
| 10 | **Accept + track a contract** | Board cards → Accept + Track → market callout | Dossier → Accept & Track → market callout | **PRESERVED** |
| 11 | **Manufacture** | Crafting list + guidance | Industry fabrication schematic | **PRESERVED** (destination) |
| 12 | **Factions** | Dense standing cards (you disliked the density) | Radial dial + rail + ladder | **INTENTIONAL-CHANGE** (progressive disclosure per brief) |
| 13 | **Bar** | Contact cards + dialogue + survey/leads | Rebuilt conversation instrument (portraits/dialogue/leads) | **PRESERVED** |
| 14 | **First-dock handoff** | 3 steps with `tradeMode`-aware routing (sell vs buy vs hold) | 3-step strip; `tradeMode` dropped; `hold→market` | **DESTINATION-ONLY** (see #2) |
| 15 | **Station/faction briefing** | Slide-out briefing (station identity, purpose, "what's here", disambiguation) | No equivalent | **INTENTIONAL-CHANGE / dropped** (you disliked the old one, but nothing replaced the "what does this station do" job) |

**Pattern:** the regressions cluster on *doing a task in one place* (sell cargo, act on a departure risk,
fit a part on the hull). Navigation destinations are mostly intact; **workflows were flattened into
"go to a page, then do the work yourself."** That is the router failure, in data.

---

## 2. Visual postmortem — why it reads as a generic dashboard

1. **One template, six times.** Every screen is `rail | central visual | detail/console`. A uniform
   3-column grid repeated across all destinations *is* the "router of pages" gestalt. No surface has
   its own spatial logic; they differ only in what fills the middle.
2. **The dock became the most conventional possible nav.** Evenly-spaced labelled icons; active = a
   filled rectangle. This is the universal top-nav pattern. The single element with kinetic
   personality (proximity magnification, neighbour push, spring) was replaced by its blandest form.
3. **Display over manipulation.** The centrepieces (area chart, single-value dial, ship on a stage)
   are things you *look at*, framed by lists you *click*. Large surface area, low information/agency —
   your exact phrase, "large low-information visualizations instead of deep interactions."
4. **Flat material, no atmosphere.** Hairline-bordered navy panels + faint gradients = the
   shadcn/fintech dark-mode look. No texture, grain, lighting, depth layering, diegetic hardware, or
   "this is machinery." A SaaS palette, not a lived-in station.
5. **One accent, even rhythm.** A single azure on near-identical panels arranged on an even card grid.
   Even spacing + one accent reads calm-corporate; there is no focal hierarchy, no density, no
   cinematic composition to grab the eye.
6. **Web-default interaction vocabulary.** Click-to-swap-page, hover-highlight, one modal popover.
   No kinetic transitions, no spatial selection, no direct manipulation. Nothing an OS/game would do
   that a settings page wouldn't.

**Root cause:** I built a cohesive *component system* (tokens, cards, rails) and applied it uniformly.
Cohesion of a generic vocabulary yields uniform genericness. I never designed a distinct *interaction
architecture* per surface, and I overrode the one instruction that carried identity — "keep the dock."

---

## 3. Three prototype directions (built as isolated, interactive code — see sibling folders)

Each is a *structurally different* navigation architecture + Shipworks interaction, and each must
demonstrate: kinetic navigation · selected-vs-hover · spatial ship-slot selection · compatible-part
disclosure · a task-preserving shortcut (sell-what-you-hauled → hold-filtered sell).

- **A — Live Dock + Zoom-to-Screen (`A-kinetic-dock/`).** Home is a real magnification dock (proximity
  scaling, neighbour falloff, spring). Navigation is a *shared-element zoom*: the destination grows out
  of the clicked icon; the dock recedes — no page swap. Shipworks: the ship floats in a bay, hardpoint
  markers sit *in space on the hull*; hover lifts a marker (≠ select), click dollies the camera in,
  dims the room, and unfolds a compatible-parts arc anchored at that slot.
- **B — Persistent Bridge + Radial Command (`B-radial-stage/`).** No page swap at all: one persistent
  stage (your ship). A radial command wheel rotates a system's controls into the active seat around
  the stage. Shipworks: slots are hardpoints on the persistent hull; selecting one rotates the ship to
  present it and fans out a *paginated card deck* of compatible parts (flick through, live deltas) —
  never a scrolling list.
- **C — Diegetic Console + Fitting Bench (`C-diegetic-console/`).** Home is physical hardware: chunky
  keys with press/hold physics + status LEDs; navigation slides a workspace in like a drawer.
  Shipworks: a blueprint/exploded schematic; slots are annotated callouts; clicking one expands an
  *inline fitting bench* right there — current part + a horizontal reel of alternatives you scrub, with
  live delta bars. Disclosure happens in place, not in a drawer.
