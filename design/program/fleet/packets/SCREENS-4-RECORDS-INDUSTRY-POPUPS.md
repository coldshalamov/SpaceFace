# SCREENS-4 — records, industry screens and pop-ups

**For:** a designer-builder with eyes. **Kind:** the remaining screens. **One commit per group.**
The director judges your frames.

## Why

An audit of every screen (`.devshots/director/fable/screens/AUDIT.md`: read sections A to E;
frames under `.devshots/screens-audit/`) grouped the rest of the game's screens into three jobs.
The standard to match is the large near-black "Deckplate" family (title, settings, tech tree,
pilot cards, the Manifest card table). The teal boxed panels on hex grids are being retired.

## Group 1 — Records (statistics, codex, mission log, achievements, replay, clips)

- **Statistics ("Records Wall")** shows five "NOT YET" rows and a blank page. Make it a goal
  board: every counter drawn at its real value, zero included, with its next milestone ("Fly
  10 km: 0 / 10", "Throw 25 rocks: 3 / 25"), grouped by what the player does (fly, fight, haul,
  mine, build). It should make a player want to tick one off.
- **Codex**: locked entries show "Locked: find a signal at Ceres" (the real unlock hint from the
  data), never cipher garbage; the art ring stays populated.
- **Mission log**: each job leads with what to do and what it pays, in plain words; the contract
  code and authorisation fold into "Details". The tracked job is unmistakable; one button:
  Track / Untrack.
- **Achievements**: larger icons, readable labels, a "next three" card at the top.
- **Replay and clips** when empty say what would fill them and how.

## Group 2 — Industry (asteroid works, drill, base, automation)

These are where the owner's building game lives (`design/overhaul/05_ADVENTURE.md` §3 to §5:
building inside rocks, adjacency, drones). This pass is the shell and the words only; the board's
rules are another job.
- **Asteroid Works / drill** look like a different game: thirteen unlabelled tool icons and one
  unexplained "Stake claim". Give the screen the Deckplate shell: a title, one line on what this
  rock is and what it holds, a labelled tool rail (name under every icon, key on hover), and the
  one next step as the primary button. The claim overlay says what a claim gives, what it costs
  and what can go wrong, in three lines. `drill` and `asteroid-works` show the same thing twice:
  keep one.
- **Automation** opens on "-149 cr per minute" and "Conduct the machine". Open instead on a plain
  answer: "You earn N a minute. One thing needs you." with one primary button to go to that
  thing; drones, traders and outposts sit behind tabs.
- **Base** (the claim registry) is one of the best screens: keep it and bring the other three to
  its level.
- One unit vocabulary: `units` for cargo, `cr` for credits, `m`/`km`, no bare `u`, no "cells"
  where "slots" is meant.

## Group 3 — Pop-ups and radials

- **The hail prompt** prints the dock prompt over the speaker's name and first line (the one true
  overlap in the audit). A prompt never draws over an open hail; fix the cause in the prompt
  layering, not with an offset.
- **The cargo pop-up** uses the blue hex-grid style with "≈ 0 CR" and "Drift approving". Restyle
  it to the standard and plain words. (A new cargo bag is coming from another job; keep this
  change small.)
- **One pattern for every pop-up**: a title, one sentence, a primary and a cancel; the danger
  button language is shared with `popup-confirm-danger`; the backdrop dims so the screen behind
  never shows cut-off tabs at the edge. Tooltips never cover the number they describe.
- **Radials** (comms, wingman, the Q wheel): at most eight slices, each with a word and an icon,
  the most-used at the top; number keys 1 to 5 are never taken by a radial while flying (ruling
  R17).

Also across all three groups, from the audit's section D: remove the "MORE" pill and fade that
clip rows mid-screen (scroll properly, with a visible scrollbar), unify page-title size and the
Back position, and give every screen one obvious primary action.

## Look first, and prove

Shoot before and after with
`node scripts/ui-bench.mjs --shot=statistics,codex,codex-record,mission-log,mission-log-receipts,achievements,replay,clips,asteroid-works,drill,drill-claimed,base,base-claimed,automation,automation-outposts,hail-resident,popup-cargo,popup-decision,popup-receipt,popup-story-choice,popup-confirm,popup-confirm-danger,popup-find,popup-tooltip,popup-dossier,comms-radial,wingman-radial --viewports=1280x720,1366x768,1920x1080 --out=.devshots/screens4/<before|after>`
(split into batches of about eight ids; `drill-build` hung the bench in the audit: find out why
and fix the bench cell or the screen). Open every PNG. `--walk` reports no findings. The tests
that touch these screens pass, with any that pin old wording or the removed duplicate rewritten.
In the receipt: frame paths, what was deleted, files changed.

## Files

The screens named above under `src/ui/` and `src/ui/orrery/` (grep each bench id in
`tools/ui-bench.js` to find its module), their CSS sources (regenerate sidecars with
`node scripts/lib/buildUiCssSidecars.mjs`), `tools/ui-bench.js`, tests. Do not change simulation
behaviour. For a shared file use `bash scripts/fleet/own-commit.sh begin <file>` and
`… commit "<message>" <files>`.
