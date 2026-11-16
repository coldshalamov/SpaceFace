# AUDIT-20 — Screen polish batch (frontend, careful)

**Lane 1 frontend.** Read `C:\Users\93rob\AppData\Local\Temp\praudit\FIX-BRIEF.md` first (shared
checkout + commit rules), then `docs/UI_VISUAL_ITERATION.md` and `src/ui/AGENTS.md`. The owner's bar:
organised, legible, dense; nothing overlapping, clipped, off-frame or doubled; one focus mark per
control. Every bench run goes through the lock:
`node scripts/fleet/game-lock.mjs run -- node scripts/ui-bench.mjs --shot=<ids> --viewports=1440x900,390x844`
(batch several ids per call — the lock queue is long). Open every PNG before and after; `--walk`
the screens you change. Commit each item separately: `fix(AUDIT-20<letter>): <plain words>`.

Reference pictures (HEAD vs before the PR merge) are in
`C:\Users\93rob\AppData\Local\Temp\praudit\gates\bench\{head,base}\<viewport>\<id>.png`.

## a. Phone title screen (`title` / `mainMenu` at 390x844)
The bench flags 6 new defects (control reachability) and the picture shows: (1) ADVENTURE draws two
amber frames — the card's border AND a tight box around the word (one focus mark only: keep the
card's); (2) the SPACEFACE logo sits against the top edge with no breathing room; (3) a planet
thumbnail and a corner tab poke through the Adventure card's top-right border — align or clip them
inside the card; (4) find what the 6 reachability defects are (the bench prints them) and fix them —
every menu action must be reachable on a phone (the old menu listed Load, Swarm Setup, Archive,
Circuits, Sandbox, Physics Challenges; check they are all still reachable behind MORE and that MORE
opens visibly). The bottom half of the phone screen is empty: use it sensibly (e.g. let the cards and
actions breathe or anchor the footer) — no new features, just composition.

## b. Armory selected card double frame (`crucible-draft` at 1440x900)
The selected fitting card shows a white outer outline plus an amber inner border. One mark: decide
which state each is (selection vs keyboard focus) and make focus and selection read as one clean
frame when they coincide. Check `crucible-refit`, `crucible-results` use the same pattern and fix
consistently in the shared owner sheet.

## c. Docked law desk on a phone (`station-law-desk` at 390x844)
"LAW DESK · FINE 350 CR" sits right-aligned while its three answers sit left-aligned under it.
Align the label with its answers (left), keep the three answers readable on two lines max.
Owner: the `.sxb-law-fine` rules in src/ui/orrery/stationLayouts.js (added in commit 0caa8dce40).

## d. Factions crest ring at 390 (`station-factions`, `station-factions-treaty` at 390x844)
The crest ring graphic sits above its host box and can print under the reading when the stage
scrolls. Make the ring sit inside its own box in the stacked phone layout (see commit 75b5ce3341 for
the recent sticky→static change in src/ui/orrery/station-factionsLayouts.js).

## e. Consolidate the Factions and Ledger sections of src/ui/orrery/stationTabsLayouts.js
This 2,600-line sheet has 136 @media blocks where later "ROUND 3/4/5" passes re-style the same
selectors and earlier rules are dead or contradictory, e.g. `.sx-fac-row__tier` styled at ~406, 482,
708, 904, 1060; `.sx-fac-overview { padding-right }` set to 0 / 150px / 96px / 200px / 130px;
`.sx-fac-crest` display:none then display:block; `.sx-fac-network` owned with `!important` in two
files (here and station-factionsLayouts.js:81); the Ledger has gate families 651–900×≤640,
1101–1440×461+, 1441×721+ plus station-ledgerLayouts.js's own 1441×721+ rule.
Goal: for the Factions and Ledger sections only, fold each selector into ONE base rule plus one block
per real breakpoint (phone ≤650 / short desktop / desktop / wide), delete the dead rules, and give
`.sx-fac-network` one owner. **Pictures must not change**: before editing, shoot `station-factions`,
`station-factions-treaty`, `station-ledger` at 1440x900, 1280x720, 1920x1080, 960x540, 390x844; after,
shoot the same and pixel-compare (pngjs/pixelmatch if in node_modules, otherwise open both and compare
carefully). Any difference must be an intended fix you name. If a fold is too risky, leave that
selector and say why.

Receipt: per item — what you saw, what you changed, commit hash, before/after PNG paths, bench
defect counts before/after.
