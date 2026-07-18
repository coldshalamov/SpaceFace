# Asteroid Ops UI — First-Principles Console Brief

**Status:** implemented alongside this doc, 2026-07-17. Companion to
`design/ASTEROID_OPS_VISION.md`. This is the authority for the drill screen's shell; read it
before touching `src/ui/asteroid/asteroidScreen.js` or `styles/asteroid-ops.css`.

---

## Diagnosis — what was wrong with the old shell

Screenshot evidence (`.devshots/drill-3d/04-site-running-3d.png`, pre-rebuild): the 3D
playfield reads well; everything around it is default-LLM UI.

- **Floating translucent navy cards** over a void background — glassmorphism, no physical
  logic to why panels hover where they do.
- **Cyan-on-navy monospace for everything** — titles, body copy, labels and numbers all in one
  voice, so nothing has hierarchy and long sentences set in mono read like logs.
- **A glowing centered hero title** ("A S T E R O I D  W O R K S") — the screen shouting its
  own name over the operator's sightline. Consoles don't do this.
- **Three competing accents** (cyan, amber, green) used decoratively rather than semantically.
- **Unhoused elements**: legend chips floating under the viewport, a lone RETRACT button
  floating at the bottom, gauges pasted over the scene.
- **No room to grow**: two symmetric sidebars with prose stacks; nowhere for overlays,
  thermal readouts, formation tools, or a cluster view to land without more stacking.

## Principles

1. **A console, not a webpage.** One opaque machined frame; the viewport is a window *cut into*
   the deck. Nothing floats, nothing blurs, nothing is translucent over the scene.
2. **Instruments, not stat walls.** Every number gets a physical form — bars with tick marks,
   segmented bins, a printing tape. If a value matters, you can read it at a glance from
   shape; the digits are confirmation.
3. **Hierarchy by structure, not glow.** Recessed wells hold data; raised plates are pressable;
   1px hard borders; corner-notched bays; shadows only as contact darkness. Radius ≤ 2px.
4. **One accent, semantically loaded.** Amber = attention/power/industry (selection, active
   keys, warnings shade toward it). Cyan appears **only** where it means "material lane /
   command data" (matching the scene's conduits). Green = nominal, red-orange = hazard. Body
   text is never a color.
5. **Three type voices** (all bundled, `styles/fonts.css`): Saira SemiCondensed 600/700 caps,
   tracked — titles, designations, keys. IBM Plex Sans 400/500 — sentences (inspector prose,
   tooltips). IBM Plex Mono 500 — every number and unit. Nothing under 10px.
6. **Command card with printed hotkeys** (the StarCraft law). Build actions are a fixed grid
   of keys, hotkey printed on the key, glyph + name on the face. Clicking a key from DRIVE
   arms BUILD mode — the card *is* the mode switch's second half.
7. **The scene stays sovereign.** DOM over the viewport is limited to spatial annotations the
   renderer owns (depth ruler, yield floaters, alarm washes). Vitals and telemetry live in
   the deck.

## The frame

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP STRIP 40px   AST-designation · claim chip │ alert ticker │ yield · cargo │ RETRACT ESC │
├──────────────────────────────────────────────────────────┬───────────────────┤
│                                                          │  MANIFEST rail    │
│                3D VIEWPORT (letterboxed, fills)          │  event tape       │
│                                                          │  STRATA swatches  │
├──────────────┬───────────────────────────────┬───────────┴───────────────────┤
│ SITE SYSTEMS │  CONTEXT                      │  COMMAND                      │
│ power bar    │  hovered cell / machine /     │  DRIVE ▮ BUILD toggle         │
│ export rate  │  ghost — prose + the          │  3×3 command card (hotkeys)   │
│ couriers     │  CONTACT RING schematic       │  survey key + cooldown        │
│ rig: temp /  │  (3×3 material diagram —      │                               │
│ energy bars  │  THE primitive as an          │                               │
│ rock budget  │  instrument)                  │                               │
└──────────────┴───────────────────────────────┴───────────────────────────────┘
```

Bay-by-bay:

- **Top strip.** Left: site designation (`AST-<id>` + ASTEROID WORKS) and the claim chip
  (NO CLAIM / UNANCHORED (red) / ANCHORED (green)). Center: the alert ticker — the old modal
  banner demoted to one always-in-the-same-place line, `role=alert`, colored by severity.
  Right: session yield + cargo %, then the RETRACT key. Exit lives here because StarCraft
  puts menu above the theater, and because the deck's bottom edge is for hands, not leaving.
- **Manifest rail** (right of viewport, 264px). The site ledger as a printing tape — newest
  on top, hairline-separated rows, Plex Mono, severity as a left ink bar. Below it STRATA:
  the material swatches (grows as ores are surveyed), housed and quiet instead of floating.
- **Site systems bay.** POWER as a dual instrument (draw needle over generation fill,
  `20.0/28.0 MW` in mono), EXPORT u/min, COURIERS ready/target/out. Then RIG: TEMP and
  ENERGY as ticked horizontal bars (moved here from the scene overlay), ROCK budget.
- **Context bay.** The inspector, re-voiced: kicker + title in Saira, prose in Plex Sans,
  numbers in mono. When the subject has geology (machine or placement ghost), the
  **contact-ring schematic** renders: a 3×3 diagram, center = subject, 8 cells tinted by
  material (ore tint / matrix umber / basalt slate / gas teal / hollow = hatched). The
  game's core primitive, drawn as an instrument, always in the same place.
- **Command bay.** Mode toggle (DRIVE / BUILD B) as a two-position switch; the 3×3 command
  card (6 machines, cable, lane, dismantle) with printed hotkeys 1–9, inline-SVG glyphs,
  amber active state; the survey key with its cooldown readout. The card is always visible
  (dimmed in DRIVE) — clicking any key arms BUILD and selects it.

## Tokens

Defined once on `.ast-screen` in `styles/asteroid-ops.css` (scoped `--ao-*`; class prefix
`ao-`). Deck `#14171d` · recess `#0d0f13` · plate `#1b2027` · border `#2a303a` · hairline
`#20252d`. Ink `#cfd6df` / `#8a94a1` / `#566070`. Accent amber `#e2a13d` · hazard `#e25b45`
· nominal `#63c96f` · lane cyan `#45b7d8`. Bevels: inset 1px `rgba(255,255,255,.04)` top.
One decorative signature only: a low-opacity 45° amber hazard-stripe strip along the deck's
top edge. Reduced motion and forced-colors honored throughout.

## Expansion slots (why this frame scales)

- New machines → new command-card keys (grid grows to 3×4 before anything else changes).
- New overlays (thermal, formations, flow) → a toggle row reserved above the command card.
- Formation language (Wave 1) → the context bay's schematic + a named-formation line.
- Cluster view (Wave 4) → the top strip's designation becomes a tab strip of claimed rocks;
  the manifest rail already reads like a multi-site feed.
- Policies (fleet targets, export mix) already render in the context bay when the site
  itself is the subject.

## Killed, deliberately

- The hero title and kicker over the viewport.
- Free-floating legend chips and the floating RETRACT button.
- Glass panels, `backdrop-filter`, glow shadows, translucent fills over the scene.
- Monospace body copy (mono is for numbers now).
- The scene-overlay TEMP/ENERGY gauges (deck instruments now; the renderer keeps only
  spatial annotations: depth ruler, floaters, alarm washes).

## Implementation map

- `styles/asteroid-ops.css` — the whole system; linked from `index.html` after `menu.css`.
  `asteroidScreen.js` no longer injects shell CSS.
- `src/ui/asteroid/asteroidScreen.js` — owns the frame DOM; all logic (controller, bus,
  session, exit) unchanged.
- `src/ui/asteroid/buildPalette.js` — the command card (glyphs, printed keys, arm-on-click).
- `src/ui/asteroid/inspector.js` — same API + the contact-ring schematic.
- `src/ui/asteroid/asteroidRenderer3d.js` — gauge handoff + gritty rock variants.
- **Do not rename** `.ast-screen` / `.ast-canvas`: `scripts/capture-drill-3d.mjs` and
  `scripts/capture-asteroid-works.mjs` select on them.
