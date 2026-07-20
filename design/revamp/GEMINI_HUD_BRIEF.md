# Gemini HUD Brief — reference detail for the goal prompt

> This file holds the implementation detail for the medium-horizon HUD goal.
> The goal prompt itself is <3000 chars (success criteria only); this is the reference.

## What this is
A taste-driven frontend polish pass on SpaceFace (semi-3D top-down space game, Three.js + DOM/CSS UI).
The design system exists, the spec is exact, the checks gate the work. Make the player's window into
the game feel professional and legible, and remove design drift that violates the project's
non-negotiable visual rules.

## The non-negotiable rule (read first)
`AGENTS.md §6` "HUD design rule" + `design/spec2/00_MASTER_TASTE.md §3`:
> Clean NON-diegetic HUD. No first-person/visor/cockpit motifs — no screen-edge arcs, no helmet
> avatars, no pilot portraits on the HUD. Non-negotiable.

Palette LOCKED: cyan `#39d0ff`, amber `#ffb35c`, red `#ff5c5c`, violet `#8d66ff`, white `#d7e6ff`.
Space dark (<18% luminance). Nothing pulses/glows/animates at rest (motion = state change). No
`backdrop-filter` (opaque `rgba(5,9,18,.88)` panels). These are LAWS.

## The spec (exact — do not freelance the numbers)
`design/spec2/06_UI_IDENTITY.md` defines, in order:
- **§1 Three-anchor HUD** — bottom-left ship cluster, bottom-center status, bottom-right radar+overview,
  top-center one-voice channel. Nothing permanently outside these. Relocate stragglers.
- **§2 Overview strip** (MISSING — highest-impact piece) — right edge above radar. Collapsible (`O`
  toggles, persists `settings.ui.overviewOpen`). Row: `[IFF chip][class glyph] NAME  dist  ▸closing/▹opening`,
  mono 11px, row height 20px, max 8 rows + "+N" footer, width 188px, no panel border (1px left rule
  in IFF color). Sort hostiles-first by dist, then neutrals, then friendlies. Sensor ghosts hollow.
  Click = target (existing intent). Hover = 1.5× rule width. IFF from `src/ui/accessibility.js`
  SEMANTIC_PALETTE. **5 Hz update, not per-frame; memoize strings.**
- **§3 Target panel v2** — damage triangle as in-world arcs (shield outer→hull inner,
  radius target.radius+6/+9/+12, arc=fraction×300°, 0.55 opacity) + card.
- **§4 Radar honesty** — station/gate/wreck glyphs (square/ring/cross, 5px) replace dots; objective
  diamond 1px white outline; scan pings hollow "?" for TTL; bezel edge-arrows for off-screen objective
  + nearest hostile (max 2).
- **§5 Map polish** — localmap: legend footer, wheel-zoom 150ms ease, hostile velocity ticks. Starmap:
  palette swatch stripe + security pips, price-memory overlay, route line 3px marching dash.
- **§6 Dialog/screen chrome** — modals: 1px `--panel-edge`, `--r-lg` radius, `rgba(8,13,24,.92)` ground,
  drop inset cyan glow on non-interactive. Open/close: 150ms translate-y 6px + fade. Focus ring 2px
  `#39d0ff` offset 1px. Destructive = `#ff5c5c` text, never red fills.

## The design system (use these tokens — don't invent hex)
`styles/ui.css` `:root`: `--accent` `--panel-edge` `--r-lg` `--hull` `--shield` `--energy` `--mono`
`--ink` `--ink-dim` etc. Read the block; use the tokens.

## The drift to remove (TASK 0 — a real rule violation)
`styles/ui.css` contains a block labeled **"Tactical Visor palette — Diegetic helmet-projection HUD"**
(`--visor-cyan`, `--visor-amber`, `--visor-red`, `--text-primary`, visor classes). This DIRECTLY
violates the non-negotiable no-visor rule. `HUD_REVAMP_DESIGN.md` is unmanaged drift (AGENTS §4).
Remove the visor block + migrate every `--visor-*` / visor-class reference in UI code to the
canonical non-diegetic tokens. Grep repo for "visor" (case-insensitive) in `src/ui/**` + `styles/`.
Do not touch design-doc comments (historical) — only live UI code.

## The checks (gate every task; all must stay green)
- `node scripts/check-ui-identity.mjs` (currently 12/12 PASS — keep it ≥12, extend for overview strip)
- `npm run check:ui-a11y`
- `npm run check:wcag-contrast`
- `npm run check:ui:perf`
- `npm run check:launch-policy` (UI touched)

Aliases may differ — check `package.json` `scripts` for exact names.

## Files you may edit
`styles/ui.css`, `src/ui/hud.js`, `src/ui/radar.js`, `src/ui/targetPanel.js` (if exists, else create),
`src/ui/uiRoot.js` (chrome/modal paths only), `src/ui/screens/*.js` (chrome unification only),
`src/ui/accessibility.js` (read SEMANTIC_PALETTE — don't change it), `scripts/check-ui-identity.mjs`
(extend only), `package.json` (if a new check alias is needed).

## Files you must NOT edit
`src/systems/*` (except nothing — UI only), `src/data/*`, `src/render/*`, `test/*.expected.json`,
any sim/golden file. `src/ui/input.js` is lead-locked (AGENTS §6 input contract) — do not edit.

## Protocol
1. After EACH task run the full UI gate; confirm green before next task.
2. `git add -N <new file>` IMMEDIATELY on creation (env deletes untracked between turns).
3. No new runtime deps. No backdrop-filter. No visor motifs. Palette locked.
4. Screenshot evidence into `.devshots/`: flight HUD + station hub + starmap, before & after. The
   taste check is visual — checks prove structure, screenshots prove feel.
5. Overview strip 5Hz update + sort must be deterministic (sort by distance, then id — no random).

## Guardrails
- NEVER run `git checkout .` / `git reset --hard` / `git stash` / `git clean` / `git restore` on
  tracked files — ~17k lines uncommitted (AGENTS §3).
- No first-person/visor/cockpit motifs — EVER.
- Nothing pulses/glows/animates at rest.
- Commit only if asked. Master only, no branches.
- Three-anchor HUD is law (§1).

## Why this matters
The game has deep systems (massline tether, causal economy, living factions) but the player
experiences them ALL through the HUD/screens. Inconsistent chrome = jank. Missing overview strip =
harder-to-read combat. Visor drift = HUD fights its own identity. This pass makes the depth legible.
