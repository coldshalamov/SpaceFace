# SPEC2/00 — MASTER TASTE REFERENCE

> **Current authority banner:** root `ARCHITECTURE.md` (technical) > `design/VISION.md` (the
> owner's fantasy and UVP — wins on product emphasis) > `design/GDD_2_0.md`
> (design) > `design/spec2/00_MASTER_TASTE.md` (historical taste reference; visual tokens not binding).
> This file is a historical taste and release-intent reference, not a visual constitution or rejection gate.
> `design/vision/ALPHA_PROGRAM.md` owns current execution order and solo-alpha scope beneath that
> chain.

Read this before implementing a spec2 task for its behavioral principles, release bar, and historical
context. Where a spec leaves room for interpretation, choose the strongest coherent option supported
by current player-facing evidence. Behavioral acceptance values remain targets when an activated spec
or check relies on them. Historical visual values are starting points, not mandatory tokens or ceilings,
and may change without amending this file when screenshots, accessibility, and measured performance
support the result.
Authority is defined by root `AGENTS.md` and `design/PLAN_REGISTRY.md`. This file never outranks the
current program, an activated task spec, or stronger player-facing evidence.

## 1. The one-sentence bar
This game must feel like a **$30 premium PC/browser release**: nothing on screen is unexplained, nothing stutters,
every input answers within 50 ms, and any 10-second clip of play looks deliberate enough to be a
store-page GIF.

## 2. Pillars (unchanged, enforced)
1. **Momentum is the toy** — if a feature can be expressed through physics, it must be.
2. **Read the battlefield at a glance** — nothing on screen may be unidentifiable for >1 second.
3. **One voice at a time** — the game never says two things at once (arbiter priority:
   danger > tutorial > objective > comms > flavor).
4. **The universe was here before you** — charted space is charted; traffic flies its own routes.

## 3. Historical visual language — reference, not tokens
- **Space readability:** the original target kept background luminance between structures below
  roughly 18% sRGB and used contrast plus parallax for depth. Treat that as a tested baseline, not a
  brightness or glow cap; judge the current scene at its real camera and display exposure.
- **Palette reference:** the shipped semantic examples were cyan `#39d0ff` (navigation/action), amber
  `#ffb35c` (warning/strain/attention), red `#ff5c5c` (danger/hostile), violet `#8d66ff`
  (story/anomaly), and white `#d7e6ff` (primary text). Sector palette blocks live in
  `src/data/sectors.js`. They are references, not a closed hue list; new or revised colors must remain
  legible, accessible, coherent, and supported by player-facing evidence.
- **Translucent shells:** any sphere/shell overlay on a structure must earn its opacity through
  readability and performance evidence; **0.12 is not a universal cap**. The
  0.655-opacity station bubbles were a bug, not a look. (See git history: "sheen, not shell".)
- **Emissives and bloom:** engines, weapon cores, seams, tether, and station windows historically
  carried the night. The former 0.9 global-bloom value is a baseline, not a ceiling; tune local and
  global effects by hierarchy, screenshot evidence, stability, and measured performance.
- **Type:** the existing mono family, 9/12–14/17 px pattern, uppercase labels, and spaced labels are
  implementation references. The requirement is readable hierarchy and accessible scaling, not a
  fixed family, size count, case, radius, or spacing recipe.
- **Motion and rest state:** quiet-at-rest was a useful default, not a ban on pulse, glow, or ambient
  animation. Motion must communicate state or atmosphere, respect reduced-motion preferences, and
  survive screenshot/play evidence plus performance measurement.
- **No first-person/visor/cockpit motifs. Ever.** No screen-edge arcs, no helmet frames, no pilot
  avatars on the HUD. This is a standing user decision.
- **Effects are measured, not banned by taste.** Use blur, opacity, panels, or other effects only when
  the player-facing benefit justifies their measured compositor/GPU cost.

## 4. Behavioral feel targets
The values below remain useful acceptance targets when an activated task or check depends on them;
they do not create a universal visual-style law.
- UI transitions: 120–250 ms, ease-out (`--ease` token). Screen pushes ≤ 250 ms. Nothing slower.
- Input answer: any player input produces visible/audible acknowledgment within **50 ms** (one sim
  tick + one frame). If the action itself is delayed (cruise charge), the ACKNOWLEDGMENT is not.
- Hit-stop: 40 ms on shield-break, 60 ms on kill, never on ordinary hits. Respect `motionReduce`
  (all shake/hit-stop/FOV effects ×0.25 or off — read `src/ui/accessibility.js`).
- Camera shake: trauma-based only (existing model). No shake source may set trauma > 0.5 except
  player death (1.0). Shake for OTHER ships' events scales by 1/distance².
- Numbers on screen: damage numbers stay **off by default** (toggle exists). Never add floating
  text for routine events; floaters are for money, loot, and level-ups only.

## 5. Copy voice — how the game talks
Terse, dry, working-space professionalism. Crews talk like riggers, not like marketing.
- Good (existing, keep this energy): "Masslines only. If the spool lies, believe the spool."
- Bad (never): "Welcome, brave pilot! Ready for an epic adventure?"
- Direction: keep comms concise enough for their real display duration and gameplay load, but do not
  enforce a universal word count. Use punctuation, capitalization, and sentence length to serve the
  speaker and moment. Tutorial prompts should make the current verb and objective immediately clear.
- All player-facing strings pass `check:player-facing-labels`.

## 6. Functional and release drift guard
- ??? markers on charted space (only frontier/anomaly may be undiscovered).
- Text walls: >1 simultaneous new text surface (arbiter/one-voice violation).
- New modal screens for things a HUD chip can say.
- Camera yaw-follow (locked decision: position-follow only, anti-nausea).
- Hard rope/limit joints for gameplay lines (see spec2/01 — springs with damped capture only).
- Restitution ("bounciness") on any player-feel constraint.
- Unexamined dependencies with no license, bundle/performance, determinism/save, or maintenance
  record. Editing `test/*.expected.json` goldens to make a check pass (fix the code, or flag the
  golden for a deliberate re-record batch).
- `Math.random()` in sim code (use `state.rng`); wall-clock time in sim (use `state.simTime`).
- Per-frame allocations in update loops (preallocate scratch; the codebase shows the pattern).

## 7. Acceptance rituals (run before claiming any spec2 task done)
1. **Five-second test:** pause, screenshot, ask "can a stranger name every element?" If no → fix.
2. **One-voice audit:** play 3 minutes; if two text surfaces ever animate in simultaneously → fix.
3. **Feel probe:** the spec's numbered acceptance assertions (each spec2 file ends with them) run
   green in the sim harness (`node scripts/check-<name>.mjs`) — write the check if it doesn't exist.
4. **No-regression floor:** `npm run check:sg02:tether && npm run check:mining:2 && node
   scripts/check-tether-gameplay.mjs && npm run check:sim:compare` (hashEqual:true is the pass bar
   while the 47a golden re-record is pending) plus any checks named by your spec.
5. **Screenshot pair** into `.devshots/spec2/<spec>-<item>-{before,after}.png` for anything visual.

## 8. Reference map (lessons to evaluate, not copy)
- **Freelancer:** travel grammar (thrust<boost<cruise<lanes), station services flow, faction
  consequence, system color identity. NOT its mouse-flight (we are top-down).
- **EVE:** overview list, fitting constraints, market data as knowledge. NOT its pace.
- **No Man's Sky:** scanner pulse cadence, mining beam heat rhythm, POI breadcrumbs. NOT its
  first-person framing or inventory friction.
- **Endless Sky / Escape Velocity:** charted-map philosophy, outfitting clarity.
- **Subspace/Continuum:** newtonian swing feel as the skill ceiling.
- **Hades:** juice discipline — every hit answers, but readability never drowns.
- **DRG:** mining as aim-and-rhythm, not hold-button.
