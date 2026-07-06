# SPEC2/00 — MASTER TASTE CONSTITUTION

**Every spec2 document inherits this file. Read it before implementing anything.**
Where a spec leaves room for interpretation: choose the QUIETER option. Any deviation from a number
in any spec2 file requires editing that spec in the same change, with a one-line justification.
Authority chain: 00_MASTER_TASTE > the specific spec2 file > design/GDD_2_0.md > older docs.
`ARCHITECTURE.md` remains the technical contract (fixed 60 Hz sim, XZ plane, sim never imports
Three.js, UI emits intents only, determinism via state.rng, no per-frame allocations in hot paths).

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

## 3. Visual language — hard tokens
- **Space is dark.** Background luminance between structures must average < 18% sRGB. Depth comes
  from contrast + parallax motion, never from filling the frame with glow.
- **Palette:** UI semantic colors are LOCKED: cyan `#39d0ff` (interactive/friendly/info), amber
  `#ffb35c` (warning/strain/attention), red `#ff5c5c` (danger/hostile), violet `#8d66ff`
  (story/anomaly), white `#d7e6ff` (primary text). Sector world-palettes live in
  `src/data/sectors.js` palette blocks (core=cyan/steel, belt=rust/amber, fringe=sodium-red,
  anomaly=violet/green). Never introduce a new hue without adding it here first.
- **Translucent shells:** any sphere/shell overlay on a structure caps at **0.12 opacity**. The
  0.655-opacity station bubbles were a bug, not a look. (See git history: "sheen, not shell".)
- **Emissives carry the night:** engines, weapon cores, seams, tether, station windows. Bloom is
  selective — raise per-material `emissiveIntensity`, never the global bloom strength above 0.9.
- **Type:** one mono family (existing `--mono`), three sizes only per surface (9/12-14/17 px pattern
  in hud.js). UPPERCASE for labels, sentence case for content. Letterspacing on labels ≥ .12em.
- **Nothing pulses, glows, or animates at rest.** Motion means state change. (Exception: the 4.2 Hz
  seam ember pulse, amplitude ≤ 18%, and engine idle flicker ≤ 8%.)
- **No first-person/visor/cockpit motifs. Ever.** No screen-edge arcs, no helmet frames, no pilot
  avatars on the HUD. This is a standing user decision.
- **No `backdrop-filter`.** Use opaque `rgba(5,9,18,.88)`-class panels (GPU cost, prior perf pass).

## 4. Motion & feel — hard numbers
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
- Rules: ≤ 12 words per comms bark. No exclamation marks outside genuine emergencies. Station names
  and callsigns in caps ("HELIOS DOCKMASTER"). Tutorial lines are imperative and name ONE verb
  ("Thrust to the beacon." not "Try using W to fly toward the beacon!").
- All player-facing strings pass `check:player-facing-labels`.

## 6. The forbidden list (drift-guard — reject any diff that does these)
- ??? markers on charted space (only frontier/anomaly may be undiscovered).
- Text walls: >1 simultaneous new text surface (arbiter/one-voice violation).
- New modal screens for things a HUD chip can say.
- Camera yaw-follow (locked decision: position-follow only, anti-nausea).
- Hard rope/limit joints for gameplay lines (see spec2/01 — springs with damped capture only).
- Restitution ("bounciness") on any player-feel constraint.
- New dependencies without lead sign-off. Editing `test/*.expected.json` goldens to make a check
  pass (fix the code, or flag the golden for a deliberate re-record batch).
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

## 8. Reference map (steal exactly this, nothing else)
- **Freelancer:** travel grammar (thrust<boost<cruise<lanes), station services flow, faction
  consequence, system color identity. NOT its mouse-flight (we are top-down).
- **EVE:** overview list, fitting constraints, market data as knowledge. NOT its pace.
- **No Man's Sky:** scanner pulse cadence, mining beam heat rhythm, POI breadcrumbs. NOT its
  first-person framing or inventory friction.
- **Endless Sky / Escape Velocity:** charted-map philosophy, outfitting clarity.
- **Subspace/Continuum:** newtonian swing feel as the skill ceiling.
- **Hades:** juice discipline — every hit answers, but readability never drowns.
- **DRG:** mining as aim-and-rhythm, not hold-button.
