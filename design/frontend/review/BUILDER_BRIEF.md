# SpaceFace ORRERY builder brief (shared by every meta-screen builder)

Repo: C:/Users/93rob/Documents/GitHub/SpaceFace (Windows; use the Bash tool, Git Bash).
Tools: tools/ui-review/ (shooter, crop helper). Shots and crops: .devshots/ui-review/ (gitignored scratch)

## The job
Bring your assigned screens into the ORRERY design language so an independent art-director critic would
score each at least 8/10 overall with no axis under 7 (axes: Composition, Hierarchy, Legibility, ORRERY
fidelity, Craft/detail, Interaction clarity). The owner wants a bold, A-list 2026 game UI: interactive and
alive, custom SVG instruments, never a wireframe or a web-app card grid, and NO CSS that imitates
materials (no bevels, LEDs, brushed metal, screws, gradient balls, glassy plates).

## Read first (then build)
1. design/frontend/ORRERY.md — the law. Especially §2-§3 (instruments of light over borderless glass; bone
   rest light rgb(236 230 216); ONE amber Hand per screen plus at most one Lamp Key verb; ice/phosphor only
   for readings, gains or motion; red only for threat; Archivo display/labels, Instrument Sans body; contrast
   floor 4.5:1 on composited pixels; circles, arcs and scales; no boxes) and your screen's lines in §6 Meta.
2. design/frontend/ORRERY_HANDOFF.md §3 (the library) and §5 (traps).
3. The library in src/ui/orrery/ — READ what exists before inventing: svg.js (svg(), arcD, polar, ticksD,
   circularText), tokens.js (injectOrrery, --dp-hand, --dp-phos…), motion.js (createSpring), text.js
   (rollTo counters, decrypt), lampKey.js (the one primary verb as a Lamp Key: dressLampKey), arcRail.js
   (menus on an arc with the amber Hand; `grouped`, `place` options), stopDial.js (createStopScale for a
   choice scale), scrollExtent.js (a light cursor for a scrolling list), ledgerTape.js / crestOrbit.js /
   routeOrrery.js / hullRing.js (examples of full instruments), stationTabsLayouts.js (how a composition
   sheet overrides the kit with `!important` scoped rules and the `rail()` ladder helper).
4. Your screen files and how they build their DOM (kit words(), rows, etc.).

## Ownership (other agents are working in this tree at the same time)
- Edit ONLY your assigned screen files plus ONE new composition module you create for them
  (named in your assignment). Inject it from your screen file (see how src/ui/orrery/screenLayouts.js
  exports injectOrreryScreens and screens call it).
- You MAY add a new library module under src/ui/orrery/ for a new instrument (prefix it with your
  screen's name so no one else collides). You may NOT edit existing shared files: arcRail.js, stopDial.js,
  screenLayouts.js, stationTabsLayouts.js, lampKey.js, svg.js, tokens.js, text.js, deckplate/*, kit/*,
  styles/*. Override the kit/deckplate from your own sheet with scoped selectors instead.
- Never run git add -A, git commit -a, git stash, git reset, git checkout, git clean. Commit only your
  files by pathspec: git add -- <paths> && git commit -m "..." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <paths>
  then run git show --stat HEAD and confirm only your paths are listed. If index.lock exists, wait and
  retry; never delete it.
- Never edit test/*.expected.json.

## How to see your work (mandatory — look, measure, fix)
- Shooter: node tools/ui-review/ui-bench-eval-long.mjs <screen-id> "<js expression>" <out.png> "[pre-js]"
  env RM=1 (reduced motion) and VW=1280 VH=720 for the small size; default 1920x1080; also VW=2560 VH=1440.
  It prints the expression's JSON, then screenshots. Screen ids: scripts/lib/uiBenchCatalog.mjs.
- Write shots to .devshots/ui-review/shots/<yourprefix>-*.png. To LOOK, copy to a NEW filename under
  .devshots/ui-review/view/ first (the image reader caches by path) and open it with the Read tool.
- Measure with sharp: require('C:/Users/93rob/Documents/GitHub/SpaceFace/node_modules/sharp'); use .raw()
  for luminance (Rec.709) and composited contrast (a glyph's peak pixel vs the local ground).
- Shoot each screen at 1920x1080, 1280x720 and 2560x1440 after each meaningful change, open them, fix
  what you see: no text touching text or lines, no clipping, no amber outside the one Hand and the one
  Lamp Key, nothing under 4.5:1. Check the selected, hover, focus and empty states of your controls.
- Walk your controls: node scripts/ui-bench.mjs --shot=<id> --walk (see docs/UI_VISUAL_ITERATION.md);
  every control must stay reachable by keyboard and gamepad (do not break roving focus or data-action
  hooks that tests and probes use).

## Traps (each cost a round)
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
1. Run the tests that import your files: grep -l "<yourfile>" test/*.test.mjs, then
   SPACEFACE_PLAYER_STORE_DIR='' node --test <those files>. Fix what you broke. If a test was already red
   before your change, say so with evidence (git stash is forbidden: compare against `git show HEAD:<file>`).
2. Commit by pathspec as above.
3. Report: the commit hash; for each screen the LAST stills you shot (paths at 1920, 1280, 2560 and any
   state stills); what you built (the instrument, in plain words); measured contrast of the smallest text;
   anything you could not land and why.

## OWNER CRITERIA (added 2026-09-25 late — the critic scores these; build to them)
- NO super-thin wireframe look: structural rings/arcs need real weight (1.5–2px cores with a soft bloom, filled
  luminous bands, lit areas), and objects (emblems, medals, plates, bodies, tokens) should be PRODUCED ART, not
  hairline drawings. Codex can generate transparent PNG art: from a scratch folder (e.g. .devshots/imagen/) run
  `codex exec -m gpt-5.5 -c model_reasoning_effort=low --skip-git-repo-check -s workspace-write "Use your image generation tool to create ONE image and save it in the current directory as <name>.png. Subject: … Transparent background (alpha), centred, … no text, no frame."`
  (it takes ~2–5 min per image; it prints a large model-list error first — ignore it; check the file). Put finished
  art under assets/ui/generated/<your-screen>/ as .webp (convert with sharp) and reference it from your module.
  Keep the no-material-imitation law: produced art is allowed, CSS bevels/LEDs/brushed metal are not.
- Every screen is a MINI-APP with ONE signature interaction that is distinct from every other screen (a dial you
  turn, a strip you scrub, a constellation you pan, a timeline you trace, a mixer you ride…), with Magic-UI-grade
  life: number tickers, beams that travel, shimmer on the primary verb, spotlight/lens under the pointer, staggered
  reveals — all reduced-motion safe. No generic card grids, bordered boxes or stock form controls.

## MEASURED BAR FOR WEIGHT (critics, 2026-09-26) — read before you draw any ring, arc, rail or scale
- The library's default `.orr-band` (7 px at alpha .085) renders at lum ~25-31 on the glass (~10): 1.16:1. The eye
  does not see it; the ring still reads as its 1.5 px core = a thin wire, and fails owner criterion (a).
- A band that counts as BODY is >= 2:1 against the glass: about lum 70 at rest (bone ~27% alpha), ~100 under the
  pointer, ~130 while active/turning. Set it per instrument with `--orr-band-a` / `--orr-w-band`, and MEASURE it
  on the real pixels of your still (sharp .raw()) — put the number in your report.
- For a grip/bezel/dial ring, draw the band as an ANNULUS (inward from the ring edge, 12-16 px at 1920) with the
  ticks CUT THROUGH it and labels riding INSIDE it. That reads as an object you can hold, not a line.
- Stock web shapes also fail (a): rounded slider tracks with a round haloed thumb, corner-bracket frames,
  icon-in-a-box lists, tab grids of boxes, pill chips, underlined focus.
- (b) fails when the signature changes nothing else on screen: a trace that lights a line but previews nothing; a
  scrub control far from the thing it drives. The gesture must DRIVE the hero object.
