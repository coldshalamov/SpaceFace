# SpaceFace ORRERY builder brief (shared by every meta-screen builder)

> **CURRENT DIRECTION:** Read [`../STATION_STANDARD.md`](../STATION_STANDARD.md) and the amendment at
> the top of [`../ORRERY.md`](../ORRERY.md). Their patterns are guidance, not a mandatory component recipe;
> actual player clarity, controls, accessibility, and screen purpose take priority. The old numeric critic
> score and the no-border/no-table rules below are historical, not build or acceptance requirements.

Repo: C:/Users/93rob/Documents/GitHub/SpaceFace (Windows; use the Bash tool, Git Bash).
Tools: tools/ui-review/ (shooter, crop helper). Shots and crops: .devshots/ui-review/ (gitignored scratch)

## The job
Build the assigned screen so its purpose, information, and controls are clear and it feels at home in
SpaceFace. Use the existing visual language where it helps; no numeric critic score is required. Avoid
fake CSS materials (bevels, brushed metal, screws, LED lenses), while choosing structure and controls for
the actual screen rather than banning familiar patterns such as tables or bordered panels.

## Useful references
1. design/frontend/STATION_STANDARD.md — current visual guidance and review prompts. Use it as a
   starting point, adapting where the screen's purpose or accessibility calls for it.
2. design/frontend/ORRERY.md — historical visual language and screen ideas. The 2026-10-30 amendment
   retires the prescriptive border, table, geometry, and type recipes. Use relevant §2–§3 ideas and
   your screen's §6 intent as adaptable references; choose layout and controls for the screen's purpose.
3. design/frontend/ORRERY_HANDOFF.md for library context; old scores/backlog are historical.
4. The library in src/ui/orrery/ — inspect what exists before inventing: svg.js (svg(), arcD, polar, ticksD,
   circularText), tokens.js (injectOrrery, --dp-hand, --dp-phos…), motion.js (createSpring), text.js
   (rollTo counters, decrypt), lampKey.js (the one primary verb as a Lamp Key: dressLampKey), arcRail.js
   (menus on an arc with the amber Hand; `grouped`, `place` options), stopDial.js (createStopScale for a
   choice scale), scrollExtent.js (a light cursor for a scrolling list), ledgerTape.js / crestOrbit.js /
   routeOrrery.js / hullRing.js (examples of full instruments), stationTabsLayouts.js (how a composition
   sheet overrides the kit with `!important` scoped rules and the `rail()` ladder helper).
5. Your screen files and how they build their DOM (kit words(), rows, etc.).

## Ownership (other agents are working in this tree at the same time)
- Follow the current assignment's path ownership and coordinate before overlapping another owner's
  files. Add a composition module when it fits the screen architecture; wire it through the current
  screen owner rather than adding a parallel registration path.
- Shared library and styling files have existing owners. Edit them only when the current assignment
  grants that path or the owning agent agrees; otherwise use the screen's composition seam and scoped
  overrides where they preserve behavior.
- Shared-checkout and publication rules come from the current repo instructions and Finish Program;
  do not use this historical brief's former commit workflow as authority.
- Never edit test/*.expected.json.

## How to inspect your work
- Shooter: node tools/ui-review/ui-bench-eval-long.mjs <screen-id> "<js expression>" <out.png> "[pre-js]"
  env RM=1 (reduced motion) and VW=1280 VH=720 for the small size; default 1920x1080; also VW=2560 VH=1440.
  It prints the expression's JSON, then screenshots. Screen ids: scripts/lib/uiBenchCatalog.mjs.
- Write shots to .devshots/ui-review/shots/<yourprefix>-*.png. To LOOK, copy to a NEW filename under
  .devshots/ui-review/view/ first (the image reader caches by path) and open it with the Read tool.
- Measure with sharp: require('C:/Users/93rob/Documents/GitHub/SpaceFace/node_modules/sharp'); use .raw()
  for luminance (Rec.709) and composited contrast (a glyph's peak pixel vs the local ground).
- Inspect viewports and states relevant to the change, including narrow layouts when responsive behavior
  is affected. Fix concrete overlap, clipping, contrast, or control issues; do not treat a particular
  screenshot set or stylistic pattern as an acceptance quota.
- Walk your controls: node scripts/ui-bench.mjs --shot=<id> --walk (see docs/UI_VISUAL_ITERATION.md);
  every control must stay reachable by keyboard and gamepad (do not break roving focus or data-action
  hooks that tests and probes use).

## Technical gotchas recorded by earlier builders
- CSS inside a JS template literal: NEVER write \203A, \00a0, \00b7 (octal escapes are SyntaxErrors that
  blank every screen). Use the literal character (›, ·) or a doubled backslash (\\00a0). A CSS hex escape
  eats one following space.
- Write patch scripts with the Write tool as .mjs files; never pass backslashes through bash heredocs.
- node --check every touched .js file before shooting.
- Some files are CRLF (check with `file`); keep their line endings.
- The kit's row pseudo-elements carry translate:-50%; override with translate:none; scale:none.
- A canvas or img is a replaced element: `inset` alone leaves it 300x150 — give width/height.
- The deckplate .dp-frame__head and .dp-frame__body are sibling stacking contexts; lift the head, not
  its title, if something in the body must sit under the heading.
- Specificity: an older `!important` rule with more classes beats yours; delete or out-specify it.
- Reduced motion (html.sf-reduce-motion) must leave a correct still; motion is transform/opacity/SMIL,
  nothing per-frame at rest.

## When done
Use the check that directly answers the changed behavior or player-facing claim. Follow the current
Finish Program for publication. Report the change, relevant check results, and material limits; no
fixed screenshot set or commit format is required by this historical brief.

## Historical owner criteria (2026-09-25; not build or acceptance gates)
- NO super-thin wireframe look: structural rings/arcs need real weight (1.5–2px cores with a soft bloom, filled
  luminous bands, lit areas), and objects (emblems, medals, plates, bodies, tokens) should be PRODUCED ART, not
  hairline drawings. Codex can generate transparent PNG art: from a scratch folder (e.g. .devshots/imagen/) run
  `codex exec -m gpt-5.5 -c model_reasoning_effort=low --skip-git-repo-check -s workspace-write "Use your image generation tool to create ONE image and save it in the current directory as <name>.png. Subject: … Transparent background (alpha), centred, … no text, no frame."`
  (it takes ~2–5 min per image; it prints a large model-list error first — ignore it; check the file). Put finished
  art under assets/ui/generated/<your-screen>/ as .webp (convert with sharp) and reference it from your module.
  Keep the no-material-imitation law: produced art is allowed, CSS bevels/LEDs/brushed metal are not.
- The earlier pass asked each screen for a distinct signature interaction and decorative motion. Those can be
  useful design ideas, but they are optional; add them only when they improve the screen's player-facing purpose.
  Reduced-motion behavior and the no-fake-materials guidance remain relevant. Card, panel, table, and control
  patterns are judged by how clearly they serve the screen, not by category.

## Historical weight study (2026-09-26; diagnostic example, not a minimum)
- The library's default `.orr-band` (7 px at alpha .085) rendered at lum ~25-31 on the glass (~10): 1.16:1.
  This example shows why a thin line may disappear in a particular composition; assess the actual element and
  background rather than applying a universal band width or luminance threshold.
- Pixel measurement with sharp `.raw()` can help explain a contrast or visibility issue. Record it when it
  answers the review question; it is not a mandatory report field.
- For a grip/bezel/dial ring, draw the band as an ANNULUS (inward from the ring edge, 12-16 px at 1920) with the
  ticks CUT THROUGH it and labels riding INSIDE it. That reads as an object you can hold, not a line.
- The old ban on sliders, frames, boxed lists, tables, pills, and underlines is retired. Prefer a clear, usable
  control over a prescribed visual form; motion should communicate a meaningful response when present.
