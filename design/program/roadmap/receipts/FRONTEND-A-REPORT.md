<!-- LIFETIME: ACTIVE_RECEIPT -->
# FRONTEND-A — the kit and the title (`PQ-187.02`, `PQ-187.03`)

Task file: `design/frontend/direction/tasks/TASK_A_KIT_AND_TITLE.md`. Spec: `design/frontend/direction/KIT_SPEC.md`.
Authority on looks: `design/frontend/direction/DIRECTION_SHEET.md`. Worker: Cursor Claude frontend-A
(checkpoint `.codex/agent-checkpoints/FRONTEND-A.json`). Date: 2026-09-07. Head at hand-off: `28f0ab32`.

## 1. The sheet's title line

> **Title.** The starter hull in the hangar rig fills the right two-thirds of the frame, lit warm
> key / cool fill against the sky, turning very slowly. Top-left, the game's name in the display
> face at the largest size on the scale. Down the left edge, a column of words — Continue, New game,
> Load, Crucible, Archive, Settings, Quit (Sandbox only in a dev build) — at menu size; the focused
> word is full-strength bone with a short gold rule under it, the rest at 62 %; under Continue, the
> latest save in one fine line. Bottom-left, the version in fine print with Credits as a fine word. No plate, no logo lockup, no
> buttons. The menu arrives after the hull: the words stamp in one after another over a third of a
> second.

(`DIRECTION_SHEET.md` lines 37–43.)

## 2. Captures

All under `.devshots/frontend/A/` (untracked review output, not committed).

| File | What it is |
|---|---|
| `kit-1280.png`, `kit-1920.png`, `kit-2560.png` | The kit page `_kitlab.html` at three widths (`npm run capture:kit`). Probe line per width: `--k-s=0.750 title=60px`, `--k-s=1.000 title=80px`, `--k-s=1.000 title=80px`, `display=Bricolage Grotesque bricolage=loaded`. |
| `title-default-1280x720.png` | Title, hull visible |
| `title-default-1920x1080.png` | Title, hull visible |
| `title-default-2560x1080.png` | Title, hull visible |
| `title-reduced-motion-1920x1080.png` | Title under `prefers-reduced-motion: reduce`, hull visible, everything present at once |
| `title-arrive-1920.webm` | Boot clip, 1920×1080, `recordVideo`, from `page.goto` to two seconds after the words arrived (44.8 s: this machine was carrying three other agents' Playwright and node work; the boot itself, not the title, is the length) |

The matrix names the surface `title` (`scripts/ui-grammar-surfaces.mjs` id `title`, `screenId: 'mainMenu'`), so the files are
`title-…` rather than the task text's `mainMenu-…`. The full matrix run also left the forced-colors and pseudo-localized title frames and
every other surface's frames in the same folder.

## 3. Checks

| Check | Result |
|---|---|
| `npm run check:title-continue-runtime` | **OK** — "seeded save index → visible latest-save summary → concrete slot load intent" (three consecutive passes, ~25 s each). See §6 for the launch-flag change and why. |
| `npm run check:ui-a11y` | OK (all rows `ok`) |
| `npm run check:responsive` | OK — safe-box anchors and stage clamp contract verified |
| `node scripts/check-ui-screen-imports.mjs` | 53 UI screen imports ok, 0 fail |
| `npm run check:baseline` | 15/15 green. Wall 91.5 s against the 90 s budget under the other agents' load ("BUDGET EXCEEDED", no link red). |
| `npm run probe:frontend-snapshot` | OK — 5 captures, 5 PNGs, 5 diffs (through the `_uilab.html` → `_kitlab.html` shim) |
| `node --test test/kit.test.mjs` | 6 pass |
| `node --test test/startup-loading-presentation.test.mjs` | 11 pass |
| `node --test test/opening-dock-builder-contract.test.mjs test/ship-preview-dock-alignment.test.mjs` | 11 pass |
| Matrix boot `node scripts/capture-ui-matrix.mjs --world --out=.devshots/frontend/A` | Got past the title into the game on all 36 boots: 407/480 frames. 72 of the 73 misses are the six surfaces with no opener (`credits`, `statistics`, `photo-mode`, `crucible-lab`, `localmap-legacy`, `starmap-legacy` × 12), pre-existing and unrelated. The 73rd was `title default@2560x1080` — the very first, cold boot of the run under load; re-shot alone (see §4) it produced with the hull. `--world: every kit screen reported data-k-ready="1" before its frame.` |

## 4. The exact `--world` commands that produced hull-visible frames

```text
node scripts/capture-ui-matrix.mjs --world --out=.devshots/frontend/A
node scripts/capture-ui-matrix.mjs --world --out=.devshots/frontend/A --only=title --mode=default --viewport=2560
node scripts/capture-ui-matrix.mjs --world --out=.devshots/frontend/A --only=title --mode=default,reduced-motion --viewport=1280,1920
```

`--world` launches Chromium with `['--use-gl=angle', '--ignore-gpu-blocklist', '--mute-audio']`, skips
`applyNeutralGround`, and waits for the visible kit screen's `data-k-ready="1"` (15 s, try/catch, `hull absent: <surface>` on timeout).
Without `--world` the script is unchanged.

## 5. What was deleted

- `styles/menu.css` (commit `c360cd16`, 708 → 627 lines): the `.screen.sf-menu.sf-menu--bare` block (old lines 103–125), and
  `.screen.sf-menu .sf-menu-save-summary`, `.sf-menu-save-summary.has-save`, `#screens .sf-menu h1.sf-title-logo`,
  `h1.sf-title-logo::after`, `.screen.sf-menu .sf-title-tag`, `.sf-title-tag::before` (old lines 567–642). Left alone: the
  `:not(.sf-title-logo)` negations on other screens' `h1` rules (menu.css 109, 125, 126) — inert without the class, and they belong to those screens.
- `src/ui/screens/mainMenu.js`: the `STYLE_ID` constant and the whole `injectStyle()` block (old lines 12, 48–78) and its call
  (old line 210). The `.sf-continue-fade` veil rules that lived inside it moved to `styles/ui.css` on kit tokens
  (`--k-text`, `--k-fs-fine`, `--k-bone-62`); `test/startup-loading-presentation.test.mjs` reads them there now.
- `panel`, `sf-menu`, `sf-menu-narrow`, `sf-menu--bare` off the title root; `ATTRACT_IDLE_MS`, `_startIdleAttract`, `_setAttractDrift` gone
  (the hull drifts at 0.06 rad/s via `_startDrift`, never under reduced motion).
- `src/ui/kit/palette.js` (a runtime mutation of audio recipes the spec does not have) — the eight recipes are re-tuned in
  `src/data/audioRecipes.js` and `kit/sound.js` emits `audio:cue` as §8 says.
- `scripts/check-ui-screen-imports.mjs` now lets a kit screen (one importing `../kit/index.js`) have no `STYLE_ID`; legacy screens still must.

Kept as inert hooks the checks query: `data-screen="mainMenu"`, `.sf-menu-save-summary` (+ `has-save`), `data-action` on every word,
button text `Continue` / `New Game`.

## 6. Fonts

`styles/fonts/bricolage-grotesque-var.woff2` (131,548 bytes), licence `styles/fonts/OFL-BricolageGrotesque.txt`, vendored by
`styles/fonts/vendor-kit-font.py`. fontTools readout:

```text
axes [('opsz', 12.0, 96.0, 96.0), ('wght', 200.0, 800.0, 800.0), ('wdth', 75.0, 100.0, 100.0)]
glyphs 268
name Bricolage Grotesque 96pt ExtraBold
```

`styles/fonts.css` declares it `font-weight: 200 800; font-stretch: 75% 100%; font-display: swap`. The older static
`bricolage-grotesque-600.woff2` and its `@font-face` remain for the Asteroid Works crest (Task D removes them); the variable
declaration is later in the file and wins the kit's requests — the capture probe reports `display=Bricolage Grotesque` on the kit page.

## 7. Choices the sheet and spec were silent on (and two places I departed from the spec's text)

1. **`--k-s` is also capped by height.** Spec §3 gives `clamp(0.75, tan(atan2(100vw, 1920px)), 1.25)` — width only, "1.25 at 2560".
   That is written for 16:9. On 2560×1080 (the matrix's third viewport) a 1.25 scale overflows 1080 px of column; the kit uses
   `min(tan(atan2(100vw, 1920px)), tan(atan2(100vh, 1080px)))`, so 2560×1080 holds the 1080-tall geometry at 1.0 and 2560×1440 still reaches 1.25.
   Visible in `kit-2560.png` (`--k-s=1.000` at 2560×1080).
2. **`.k-word-sub` margin.** Spec: −6 px. That pulled the save line up through the word's 2 px underline; 0 put it under the focus ring
   (2 px line, 4 px offset). It is `margin-top: 6px` — exactly the ring's extent, unscaled because the ring is unscaled.
3. **No `role="menu"` / `role="menuitem"`.** Spec §6.1's markup names them. Twenty-odd checks and captures reach the title with
   `getByRole('button', { name })` (`check-title-continue-runtime` among them), and `menuitem` takes the button role away. The words are a
   labelled list of real `<button>`s (`aria-label` kept); disabled words carry `aria-disabled="true"` only, so they can still answer with the `deny` cue.
4. **`data-k-ready="1"` means the authored hull, not the mount's first frame.** The task text says first frame; the first frame is the
   hangar with no body in it, and a capture of that would be an honest DOM and a missing picture. It flips when the authored hull settles.
5. **Arrival order.** "The menu arrives after the hull": the title and words hold at the kit's `.k-in` start pose from show and stamp in
   when the hull settles; if the hull is slow or never comes they arrive `HULL_ARRIVE_GRACE_MS = 3000` after the hangar's first frame
   (or after the show if the mount never frames). On this loaded machine the hull took longer than 3 s, so the clip shows words before hull;
   on a warm machine the hull settles first.
6. **Sorting headers** are the `<th>` itself (`aria-sort`, `tabIndex=0`, Enter/Space), no nested button — the spec's own §6.3 wording, and the
   nested button inherited legacy button paint on the kit page.
7. **`_uilab.html`** is a redirect shim to `_kitlab.html` (query and hash intact) so `probe:frontend-snapshot` and old links keep working.
8. **Version** comes from `package.json` at runtime (`SpaceFace v0.1.0` bottom-left).

## 8. Things fixed on the way that the owner will feel

- **The title no longer freezes while the hull arrives.** Profiled on this machine (Intel Meteor Lake iGPU, ANGLE/D3D11): 15 s of a 20 s hull
  arrival was Three reading program/shader info logs at each program's first draw (`renderer.debug.checkShaderErrors`, on by default),
  then 6 s of the hangar linking its programs synchronously at its own first draw, then the hull's compressed textures uploading inside one
  render call. The preview context leaves the diagnostic reads off, prepares the hangar (programs, then textures, one per task) before it
  joins the scene, and hands the boundary a texture uploader. Main-thread stalls between menu mount and hull ready went from
  6.9 / 10.0 / 2.0 / 3.4 / 5.1 s to a single 2.4 s; the picture is unchanged. (`ac11eb0e`)
- **Continue lights the moment the save store settles** (`save:store-synced`, `save:completed`), not on the next periodic refresh. (`2202ba6c`)
- **`check:title-continue-runtime` launches with the machine's GPU** (the same flags as `capture-kit.mjs`). It was already red at the pre-kit
  base `9c8a9ced~1` — verified in a throwaway worktree — because plain headless pins SwiftShader, which has no
  `KHR_parallel_shader_compile`, and by now the game's boot reaches `window.SF.ctx` in ~30–39 s there against the script's 30 s budget
  (its own comment measured 12 s on 2026-08-23). With ANGLE the same boot reaches `SF.ctx` in ~5–13 s. Nothing the check asserts changed.

## 9. Unproven / left for the reviewer

- The hash-bound visual review of the three title widths and the kit page against the sheet is the reviewer's, not mine.
- The boot got slower between 2026-08-23 and now under software GL (12 s → 30–39 s to `SF.ctx`), and even on the GPU the main thread stalls
  in 1–2 s pieces behind the title while the game's own opening pipelines compile (`presentationRunner` / `renderUpdatePhase` / `bloom` in
  the profile, ~1.7 s each). That is the game's boot, not the title, and outside this packet; the live renderer also leaves
  `renderer.debug.checkShaderErrors` on, which is worth a measured look by whoever owns `PQ-129`.
- The ten-second clip is 44.8 s long because the boot took that long here; a quiet machine's clip will be shorter.
- `check:baseline` exceeded its wall budget by 1.5 s under load (all 15 links green); re-run on a quiet machine to confirm headroom.
- Sound: the eight recipes are re-tuned to spec and the kit emits `audio:cue`; I have not listened to them on speakers.
