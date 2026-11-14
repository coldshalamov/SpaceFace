# PRI-14 — The screens the bench still flags after the PR wall landed [FE]

**Frontend packet (Sonnet).** Read `docs/UI_VISUAL_ITERATION.md` and `src/ui/AGENTS.md` first, then
`design/program/fleet/PR-INTAKE.md` ("A busy file is never a reason to stop": another agent edits
station/HUD layout files all day — use `bash scripts/fleet/own-commit.sh begin|commit`, never wait, never
report a dirty file as a blocker).

The ui-polish wall (88 PRs) and the Armory/Manifest/Base/popup redesign landed on 2026-11-14. The bench
(`node scripts/ui-bench.mjs`) still measures real defects on these screens. You are the reviewer: shoot,
open the PNG, fix what you see in the layout owner, re-shoot, until the picture is right.

## Fix, one commit each
1. **Crucible results, phone (390×844)** — `crucible-results` / `crucibleResults`: the run stats are buried
   under the "Run it again" foot. The stats must be fully readable above the foot (scroll region ends
   above it, or the foot leaves the flow).
2. **Wingman dial, phone and short windows** — `wingman-radial`: three dial legends overlap "REGROUP 3"
   (PR #1093 claimed this; it persists). Legends read whole and touch nothing.
3. **Dossier popup, phone** — `popup-dossier`: the dossier's verb rows overlap the station tab verbs
   (PR #1114 put them on a two-column rail; the overlap persists). With a dossier open, nothing of the
   screen beneath prints through or collides with its verbs.
4. **Station Ledger at 1440×900** — `station-ledger`: "BOUGHT", "SOLD", "Eligibility Assessment",
   "Assessment is free…", "Net worth", "20,400 / 100,000 cr" are cut off (PR #1071's fix is gated to
   ≥1441 px wide and ≥721 px tall, so 1440×900 misses it). Fix the gate or the layout so the common
   laptop frame is whole; check 1280×720 and 1920×1080 too.
5. **Station Factions, treaty state, phone** — `station-factions-treaty`: "The lamplighters finished their w…"
   is cut off. Wrap it.
6. **Station Industry, desktop** — `station-industry`: "from Mining Laser S", "from Shield Booster S" cut off.
7. **Crucible refit (Swarm), phone** — `crucible-refit-swarm`: "Next — Round 11 — The Wing · clea…" prints on
   top of "Sell · 14 cr" and a blurb.
8. **A bench shot for the hail panel.** PRI-06 landed a resident radio channel (`src/ui/contactHailPrompt.js`,
   styles in `styles/ui.css` `.sf-contact-hail__panel--resident`) that no bench shot mounts. Add a catalog
   entry `hail-resident` (`scripts/lib/uiBenchCatalog.mjs`, fixture in `tools/ui-bench.js` the way
   `seedAutomationShot` seeds the Automation shot): flight view, a station selected, the resident channel
   open with a named resident, the work mark on the HAIL key, two action choices and CLOSE CHANNEL. Shoot it
   at 1440×900 and 390×844; fix what looks wrong (it has never been looked at).

## Rules
- Fix in the screen's layout owner (`src/ui/orrery/*Layouts.js`, `stationStandard.js`, `styles/*.css`).
  Prefer correcting the rule that is wrong over adding another media-query patch on top; if you remove a
  patch, say which.
- Existing tokens only; 12 px type floor (`node scripts/check-type-floor.mjs`); no new glow or backdrop-filter;
  reflow or wrap before shrinking type; controls stay reachable.
- Never touch `test/ui-frame-references/*` (regenerated once, later).
- After the fixes: `--walk` each screen you changed; a control that does nothing visible is a defect — fix or report it.

## Checks
`node --check` each touched file; `node scripts/check-type-floor.mjs`; `node scripts/check-ui-screen-imports.mjs`;
`npm run check:src-imports`. Shots into `.devshots/fleet/pri-14/<viewport>/<id>.png` — before and after for
each item; name every path in the receipt and say, per item, what the picture shows now.

Commits: `ui(<screen>): <what the player now sees>` — one per item.
