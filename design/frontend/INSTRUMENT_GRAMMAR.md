<!-- LIFETIME: DURABLE -->
# The Instrument Grammar

**Status:** the shared design language for every 2D surface in SpaceFace. Binding on all frontend
work. Read this before designing or building any screen.

**Why this file exists.** The owner's standing complaint is that frontend work keeps coming back
"cheap and uninspired." That is not a talent problem — it is a **specification** problem. An
instruction to "make the ship screen good" produces slop from any author. This document removes the
guesswork: it fixes the type, the colour roles, the motion contract, the layout skeleton, the
disclosure tiers, and the naming rules. Per-screen documents then only have to supply the
*idea* — the centerpiece and the interaction — because everything else is already decided here.

> **The one-line test for any screen: could you tell what it is from its silhouette with the text
> removed?** If two screens have the same silhouette, one of them has no idea in it.

---

## 1. The thesis

> **Every screen is an instrument that reads the running simulation. The same instrument reads the
> same way wherever it appears. Motion is the needle — it moves only when a named value moves.**

Three consequences that make this a system rather than a mood:

1. **One vocabulary, learned once.** A marching beam means *flow along a causal edge* — whether that
   edge is reactor→module, surplus→deficit, or crime→faction→ally. Learn it in the ship bay, read it
   on the chart and in the rap sheet.
2. **The interface obeys the ship's physics.** Overshoot amplitude is your hull's inertia. A heavy
   ship's menus feel heavy. This is free information and it is the thing nobody else's space game
   does.
3. **The UI never invents.** Every explanatory phrase comes from an enumerated bank. An unknown tag
   renders *nothing* — never a guess. This discipline already exists in `src/ui/causeLedger.js`
   ("never invented text… unknown tag renders NOTHING"); this document promotes it to house law.

---

## 2. Differentiation: same grammar, different archetype

This is the answer to *"thematically connected but different enough not to feel like the same menus
with different text."*

**Screens do not differ by styling. They differ by what the centerpiece object IS and what you
physically DO to it.** Same type, same colour roles, same motion verbs — completely different
objects and manipulation verbs.

| Surface | Archetype | Primary manipulation | Centerpiece object |
|---|---|---|---|
| **THE SHIP** | a stage you orbit | **ORBIT** — drag to rotate, wheel to close in | your actual hull, lit, with your scars on it |
| **THE CHART** | a table you lean over | **PUSH / PLOT** — drag the field, drop pins | the star slab |
| **THE FOOTPRINT** | a board you trace | **TRACE** — follow an edge from cause to consequence | the consequence graph |
| **THE RANGE** | a box you play in | **FLY** — you actually pilot | a live physics sandbox |
| **MARKET** | a beam you tip | **WEIGH** — compare, commit | the price/pressure balance |
| **CONTRACTS** | a rail you take from | **TAKE** — pull a job off the rail | the contract spindle |
| **INDUSTRY** | a line you feed | **FEED** — supply an input, watch it move | the production chain |
| **BAR** | a room you cross | **APPROACH** — choose who to stand in front of | the room and its occupants |
| **FACTIONS** | a constellation you sit inside | **ORIENT** — see where you stand relative to everyone | the standing web |
| **CODEX** | a shelf you pull from | **PULL** — open a record | the archive wall |

**Existence proof that this bar is reachable, not aspirational:** `src/ui/screens/drill.js` is a
**3,154-line playable, full-screen, pausing minigame** already in this repo, and
`src/ui/station/screens/shipworks.js` already ships full direct manipulation on a 3D canvas — pointer
drag orbit, wheel zoom with `deltaMode` normalisation, two-finger orbit vs pinch zoom, and keyboard
`Arrow`/`+`/`-`/`Home` recentre. The techniques below are not a reach for this codebase.

---

## 3. Type

Four roles. **No screen may introduce a fifth.** All faces are already vendored in `styles/fonts/`
and already loaded at boot by `styles/fonts.css`.

| Role | Face | Sizes | Used for |
|---|---|---|---|
| **DISPLAY** | Saira SemiCondensed **700** | 28 / 40 / 64 px | Screen identity, hero values, the one thing you read at a glance |
| **SUBHEAD** | Saira SemiCondensed **600** | 15 / 19 / 22 px | Band labels, card titles, verb sentences |
| **BODY** | IBM Plex Sans **400 / 500** | 13 / 14 / 15 px | All prose, labels, descriptions, buttons |
| **DATA** | IBM Plex Mono **500** | 13 / 15 / 20 px, `tabular-nums` | **Numerals only** — never labels, never prose, never titles |

**Hard rules.**
- **12 px is the floor. Nothing renders below it, ever.** The current flight HUD has 96 of 137 size
  declarations at ≤11 px and 49 at ≤9 px. That single fact is most of why it reads as a debug overlay.
- **Letter-spacing above `.06em` is banned** except in one place: the MICRO label — Saira 600,
  uppercase, `.18em`, **12 px minimum**, used only for a band's name. Tracked-out small caps as
  "atmosphere" is the AI-sci-fi tell and is forbidden.
- **Every screen has exactly one DISPLAY-sized element.** If two things are biggest, nothing is.
- **The verb outranks the number.** Where a capability and its statistic both appear, the verb is
  SUBHEAD and the number is DATA at half its size. *"Tows a 40-tonne hauler"* at 19 px above
  *`40 t`* at 13 px — never the reverse.

---

## 4. Colour — roles, not a palette

Colour is assigned by **meaning**, so a screen cannot be "restyled" into incoherence.

**The token block — canonical, binding on every surface.** These five custom properties **do not
exist in `styles/` yet** (verified: zero matches). **Phase 0 adds them to the `:root` block in
`styles/ui.css`** as aliases of existing tokens, so nothing re-themes and contrast stays proven.
Until they land, use the equivalent column.

| Role | Hex | Equals existing token | Contrast on `--panel` `#0b1220` | Means / where it is allowed |
|---|---|---|---|---|
| `--sf-you` | `#7af7d0` | `--accent-2` | 14.3 : 1 | **you** — your hull, your unlocked capability, your route, a gain |
| `--sf-foe` | `#ff5470` | `--danger` | 6.0 : 1 | **against you** — threat, cost, over-budget, damage, a loss, bounty |
| `--sf-goal` | `#ffb347` | `--warn` | 10.5 : 1 | **what you're heading for** — destination, next unlock, opportunity, surplus |
| `--sf-calm` | `#84a0c8` | `--ink-dim` | 6.9 : 1 | **steel** — labels, chrome, structure, everything at rest |
| `--sf-paper` | `#d3e6ff` | `--ink` | ~14 : 1 | all body copy |
| *(surface)* | `#0b1220` | `--panel` | — | screen backdrop base |
| *(edge)* | `#1d3350` | `--panel-edge` | — | 1 px separators, socket rings |

**`--accent` (`#39d0ff`, cyan) is assigned NO role and may not be used on any new surface.** It is
the colour behind the flight HUD's 99 saturated-cyan usages and the "flat blue wash" the owner
rejected. Leaving it roleless is deliberate: a colour with no meaning cannot be spent to look
sci-fi.

*(Sourced from `SCREENS_B_SHIP_RANGE.md` §0.1, which caught that this grammar specified roles without
defining tokens. Promoted here so all surfaces share one source; that file's local scoping is void.)*

**The 80% rule: at rest, a screen is at least 80 % `calm` + `paper`.** Hot colour is *spent*, not
worn. A screen that is uniformly saturated has no hierarchy, which is the failure mode of the
current flight HUD's 99 saturated-cyan usages.

**Never encode by colour alone.** Every hostile/friendly/threshold state carries a second channel —
shape, position, or a word — because of colour-blind modes and `forced-colors`.

---

## 5. Motion — the contract

**No motion ships without a named state variable behind it.** Anything not on this table is
decoration and gets cut in review.

| Motion | Encodes | Without it the player never learns |
|---|---|---|
| Stage arrival overshoot **amplitude** | `inertia` / `massRatio` | that this hull is heavy |
| Overshoot **settle time** | `flightClass` / `angularBrake` | that it stops badly |
| Beam dash **velocity**, and **reversal** | `capRegen − continuousDrain` | that the fit is unsustainable |
| Gauge **snap-back rate** | `shieldRegenRate` | how fast shields recover |
| Label **scramble duration** | map knowledge staleness | that this intel is old |
| Glyph-field **density** | `heat` | how wanted they are |
| Grid **coverage** | scanned vs unscanned area | where they have not been |
| Ripple **radius** | `magnetRange` / `radarRange` | their actual reach |
| Tree **edge march** | dependency direction | what unlocks what |
| Rail **magnify** | focus | *(the single atmospheric allowance)* |

### The three motion verbs

Only three. Everything is one of these.

- **LATCH** — a discrete state change seats with a short travel and a hard stop. **~90 ms.** Audio:
  `ui_confirm` / `lock_acquired`.
- **SPOOL** — something coming up to speed. **Always bound to real work, never a fixed duration.**
  If the asset resolves in 40 ms the spool is 40 ms. A spinner that outlives its work is a lie.
- **SETTLE** — a value arriving. **Instruments overshoot slightly and return; text never does.**
  Numbers count; they do not snap.

**Nothing exceeds 180 ms.** These transitions are *faster* than the current uniform 150 ms fade, not
slower. Snappiness is the point.

### Reduced motion is a first-class authored channel

The global reduce-motion blanket **only neutralises CSS**, not WAAPI or JS-driven motion — those must
call `prefersReducedMotion()` from `src/ui/effects/effectRuntime.js` themselves.

**Every encoding above must survive statically**, and the static form is authored, not a fallback:

| Motion channel | Static equivalent |
|---|---|
| Overshoot amplitude | the printed verb — `SLUGGISH` |
| Beam reversal | `OVER BUDGET −14/s` in `foe` |
| Scramble duration | `STALE · 340s` |
| Glyph density | `WANTED · TIER 3` |

A reduced-motion build must never be a *blank* build.

---

## 6. The layout skeleton

Every instrument uses the same three zones, so muscle memory transfers between screens even though
the centerpieces differ completely.

```
┌─────────────────────────────────────────────┐
│ CREST   identity · one live state line      │  ~12%   never holds controls
├─────────────────────────────────────────────┤
│                                             │
│ STAGE   the centerpiece object              │  ~60%   direct manipulation lives here
│         (orbit / push / trace / fly …)      │
│                                             │
├─────────────────────────────────────────────┤
│ APRON   readout + verbs                     │  ~28%   ALWAYS holds ≥1 verb
└─────────────────────────────────────────────┘
                                    DRAWER ──▶  slides from an edge, never modal-over-modal
```

**Rules.**
- **The APRON must always contain at least one verb.** A pane the player can only read is a
  document, and documents are what we are replacing. If a screen has nothing to do, it should not
  be a screen.
- **The STAGE is manipulable.** Every instrument's centerpiece responds to pointer, keyboard, and
  gamepad.
- **Full-bleed always.** A centred card floating over a background image is banned — that single
  pattern is most of the current "cheap web game" read. Screens fill the frame.
- **Each screen needs an opaque backdrop of its own.** `#screens` carries a permanent background JPG
  that every screen inherits; without a per-screen backdrop the Ship bay and the Footprint board
  read as the same room.

---

## 7. Progressive disclosure — exactly three tiers

Depth without clutter. **Nothing is ever deeper than tier 3.**

| Tier | Trigger | Holds | Rule |
|---|---|---|---|
| **1 — Decide** | always visible | what you need to make the decision | if it is not needed to decide, it is not tier 1 |
| **2 — Why** | hover / focus, no click | the *reason* — the `[data-why]` affordance | enumerated phrases only, never invented text |
| **3 — Record** | one click → DRAWER | the full history, the raw numbers, the audit trail | never opens a second modal |

**Tier 2 is the mechanism that lets this game be deep without being a spreadsheet.** It already
exists and works: `causeLedger.js` hovers a tooltip over market rows explaining *who moved a price*
from enumerated `classifyDrivers` tags. Generalising that one mechanism to `[data-why]` across
faction rows, contract clauses, crime entries and tech nodes **replaces an entire rules-codex screen**.

---

## 8. Naming — load-bearing, not cosmetic

The accessibility layer sanitises by **class-name substring**. Getting this wrong silently destroys
your work in modes you are not testing.

- **Never** put `pulse`, `blink`, or `flash` in a class name. `sf-reduce-flash` blanket-applies
  `animation: none; opacity: 1` to `[class*=…]` for all three.
- **Never** put `panel`, `card`, `menu`, or `modal` on an element that carries meaning in a
  gradient, shadow, or background image. Under `forced-colors` those are stripped of
  `background-image`, `box-shadow` and `filter`.
- **Approved vocabulary:** `sf-crest` `sf-stage` `sf-apron` `sf-drawer` `sf-rail` `sf-housing`
  `sf-slab` `sf-deck` `sf-tile`, with state suffixes `--latch` `--spool` `--settle` `--live`
  `--spent` `--locked`.

**Do not rename the five `screenManager` functions** (`syncHudAccessibility`, `_isRestorableOpener`,
`_restoreFocus`, `_ensureFocusIn`, and the `hud.inert` line) — `check-ui-a11y` asserts them as
literal source substrings.

---

## 9. Techniques that make a screen feel like a small game

Ranked by payoff ÷ effort. These are the specific answers to *"advanced frontend techniques so the
menus feel like tiny games."* Each per-screen doc must name which of these it uses and why.

1. **Direct manipulation of a real object.** Orbit the hull, drag the star field, trace an edge.
   Already proven in `shipworks.js`. The single largest contributor to "this is a game, not a form."
2. **Labels pinned to 3D.** `shipPreviewMount.projectLocalPoint(localPos) → client {x,y}` sticks DOM
   captions to actual points on the hull. Your scars get named where they are.
3. **Physics-consistent motion.** Overshoot ∝ your ship's inertia (§5). The menu is made of the same
   world as the game.
4. **State-encoding animation.** Beams that reverse when you overdraw power. You see the fault
   before you read it.
5. **Hover-reveals-cause** (tier 2). Depth with no navigation cost.
6. **Ghost-preview on hover.** Hovering a module ghosts the handling bars to where they *would* go.
   Decisions made before commitment. `panels/massDelta.js` already returns exactly this.
7. **Spatial hit-testing over lists.** Pick things by pointing at them in space, not by reading rows.
8. **A playable inset.** A live sandbox in a screen — the Range. Proven by `drill.js`.
9. **Earned reveal.** Elements *arrive* when they become true. An empty socket filling is the single
   most legible expression of progression.
10. **Sound on every state change.** The cue vocabulary already exists
    (`ui_hover/click/open/back/tab/confirm/deny/alert/dock/undock/lock/scan`). **Today only gamepad
    focus emits hover** — one delegated `pointerover` listener on `#screens`, rate-limited ~40 ms,
    makes every surface feel responsive.

**Banned as "polish":** decorative bracket punctuation (`[ TARGET LOCK: ]`), flavour chrome (`SYS`,
`NOMINAL`, `LINK ESTABLISHED`), emoji drawn into canvas or used as icons, more boxed cards to
"organise" clutter, raising z-index to solve overlap, and any first-person visor / cockpit arc /
helmet / pilot-portrait motif (**standing owner preference, non-negotiable**).

---

## 10. Reuse before invention

Existing assets any screen may draw on. **Building a new one of these is a review failure unless
the doc says why the existing one cannot serve.**

| Need | Use |
|---|---|
| 3D object on a screen | `src/ui/shipPreviewMount.js` — own context, hangar rig, ACES+sRGB, mesh LRU, event-rendered, `projectLocalPoint` |
| Ship stage + gauges + beams | `src/ui/shipEngineeringStage.js` — **built, currently unreachable** |
| Handling explanation | `src/ui/panels/handlingProfile.js` — **built, currently unreachable** |
| Fit-change preview | `src/ui/panels/massDelta.js`, `moduleRisk.js` — **built, currently unreachable** |
| Pan / zoom / hit-test | `src/ui/map/mapCamera.js` (`zoomAt` is cursor-anchored and clamp-correct), `pickMapTargetAt` |
| Animated primitives | `src/ui/effects/` — flickerGrid, glyphMatrix, rippleField, routeBeam, supplyTree, hexPattern, circularGauge, dockRail, morphLabel |
| Reusable DOM vocabulary | `src/ui/uiPrimitives.js` + the primitive block at the end of `styles/ui.css` |
| Cause explanation | `src/ui/causeLedger.js` pattern → generalise to `[data-why]` |
| Gamepad navigation | `spatialFocusTarget` in `src/ui/input.js` — works on **any** DOM, no registration |
| Pausing a screen | add its id to `PAUSING_SCREENS` in `src/ui/screenManager.js` |

**Adopt `uiPrimitives.js` in all new work** — it is currently imported by exactly one file, which is
dead code, so the sanctioned design system ships in zero live screens. Do **not** retrofit the 44
private style injectors; let them die with their screens.

---

## 10.5 Entry keys — canonical, single source

**Every letter A–Z is already bound** (`src/systems/input.js` says so in its own comments). New
surfaces therefore use function keys, punctuation, or modifiers — never a letter.

| Key | Surface | Status |
|---|---|---|
| `F2` | **THE SHIP** | free today |
| `F3` | **THE FOOTPRINT** | free today |
| `F4` | **THE RANGE** | free today |
| `M` / `N` | **THE CHART** — local focus / galaxy focus | existing, unchanged |
| `Alt` (held) | **The quick fan** — non-pausing radial | free as a modifier; `altKey` is read nowhere today |
| `1`–`9` | **The Power Rail** | `4`–`8` already bound to real verbs; `9` free; `1`–`3` see below |
| `0` | brake | existing, **keep** — not a Rail slot |
| `[` `]` | Chart commodity cycle | free |
| `F1` | Help | existing |

**Ordered by frequency of use**, so the most-opened instrument is closest to hand: Ship > Footprint >
Range. `F1` (help) and `F7` (debug) are already literal-string cases in the `src/ui/input.js` keydown
switch, so `F2`/`F3`/`F4` follow an established precedent.

**`Digit1`–`Digit3` are contested.** They currently answer modal prompts (`contactHailPrompt.js`,
`lawfulInspectionPrompt.js`) and flight verbs are suppressed under modals, so they *are* usable in
flight — but the input source deliberately avoided them. A spec that claims slots 1–3 must state how
it prevents a prompt keystroke being eaten by the Rail, and vice versa.

> **This table outranks any per-screen document.** Two specs previously assigned `F3` to different
> screens and the Footprint had no key at all; that is exactly the failure this section exists to
> prevent. Add a row here before binding anything.

## 11. Hard constraints

- No remote fonts. No idle `rAF` — every loop self-parks or is cancelled in `onHide()`.
- **There is no `dispose` hook.** `onHide()` is the only teardown and it receives **no arguments**.
- Reduced-motion and `forced-colors` must produce a legible result, not a blank one.
- Must stay green: `check:ui-a11y`, `check:wcag-contrast`, `check:ui-identity`,
  `check:ui-frame-sleep`, `check:ui:perf`, `check:ui-effects`, `check:one-voice`,
  `check-station-tab-navigation-runtime` (pins the dock's 7 destinations, roles, and roving tabindex).
- A new effect primitive must be registered in **three** places, including the `DRIVERS` table inside
  `scripts/check-ui-effects.mjs`. Prefer composing the existing nine.
- **A green check is not proof.** Three demonstrated failures: the clipped Mission Log card passes
  every check; `check:ui-frame-sleep` inspects `rAF` and cannot see compositor-side `infinite` CSS
  keyframes; and the tech tree renders in the wrong font at the wrong size on every frame because
  Canvas 2D silently ignores `var()` in `ctx.font` — with nothing reporting it. **Visual confirmation
  against a captured frame is required.**

---

## 12. Definition of done, per screen

A screen is not finished until all of these are true:

1. Its silhouette is distinguishable from every other screen with the text removed.
2. It has exactly one DISPLAY-sized element, and nothing below 12 px.
3. Its APRON contains at least one verb.
4. Its STAGE responds to pointer, keyboard, **and** gamepad.
5. Every animation on it maps to a row of §5's table.
6. It is legible and complete under reduced-motion **and** `forced-colors`.
7. Tier 2 "why" is wired for every value a player could reasonably question.
8. It has been **looked at** in a captured frame at 1440×900 and 1280×720 — not merely checked.
