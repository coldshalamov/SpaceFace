<!-- LIFETIME: STABLE -->
# Frontend iteration — see the screen, then fix what you see

You are the reviewer. The picture is the work. Open it in this pass, judge it, and change it until the screen you touched is clean in every state a player can reach. A PNG left on disk for someone else is not a review.

The bench mounts the **real** screen (the same module the game uses) over a frozen backdrop. It does not boot the game, start the sim, or load a sector. One command, one picture, a few seconds.

```
node scripts/ui-bench.mjs --list
node scripts/ui-bench.mjs --shot=pause
node scripts/ui-bench.mjs --shot=pause,settings,flight
node scripts/ui-bench.mjs --shot=station-market --walk
```

PNGs land in `.devshots/ui-bench/`. Open each path the command prints — read the image file — before you edit, and again after. The command also prints overlapping controls, clipped text, and offscreen controls. Those are defects. The picture can still be ugly when that list is empty, so the list does not replace looking.

Backdrops are three committed stills, chosen for you: the title plate, the station shell, and a world plate (`assets/ui/backdrops/`). The interface sits on top. Pass `--bg=path/to/still.png` only when you already have a better plate. Do not boot the game to photograph a menu.

`--walk` puts every visible control back at the arrival screen, hovers it, clicks it, and writes another PNG only when the picture changes. It prints what each control did. Run it on the screens you changed before you call them done. Open every PNG it adds. Raise the cap with `--max=` if it says controls were left untried.

`node scripts/ui-bench.mjs` with no `--shot` serves the page. `?screen=pause&chrome=0` is the same frame the command captures.

## What you owe the screen

For every screen you changed, and every state that screen can open (tabs, panels, hovers, the thing a control reveals):

- Look at the arrival PNG. Name what is wrong: overlap, a word cut off, type too small to read, uneven gaps, a pile of panels, a control with no job, anything that looks unfinished or cheap.
- Fix that in the screen's owner or the kit (`src/ui/AGENTS.md`). Shoot again. Open the new PNG and compare it to the one you just looked at.
- Walk the controls. Every control you can see has to do something you can name, and you have to have seen the state it opens. "No visible change" on a control that is sitting there as a choice is a bug. A disabled control has to look disabled.
- The screen is done when you have opened the after pictures and they are clean: nothing overlapping, nothing clipped, nothing off the frame, no dead control, no state you failed to open, nothing you would be ashamed to show.

The owner's bar (revised 2026-10-30): **organised, legible, dense.** Judge with the slop checklist in [`../design/frontend/STATION_STANDARD.md`](../design/frontend/STATION_STANDARD.md) §7, at 1440×900 as well as 1920×1080; ORRERY ([`../design/frontend/ORRERY.md`](../design/frontend/ORRERY.md)) supplies atmosphere, not rules about borders, buttons or tables. Nothing under `design/archive/frontend-direction/approved/` is an approved frame.

## When the bench is the wrong tool

If the command prints `NOT MOUNTABLE`, that one screen needs the live game:

```
node scripts/ui-look.mjs --only=<id>
```

That boots the game. Use it for that screen only. `npm run ui:stills` is the same boot, for a batch. It is not the way to iterate.

## The whole-board pass, 2026-10-30 (console standard)

All 83 bench ids were shot at 1440×900 and read in one sitting; defects were fixed at the shared
layer so many screens move at once, then every touched screen was re-shot:

- **`src/ui/orrery/consoleStandard.js` (new, carried by `injectOrrery`)** — the STATION_STANDARD
  floor for every non-station screen: one amber `:focus-visible` ring, `.dp-kbd` as a mono code
  chip (no more underlined-word keys), `.sf-fig`/`.sf-panel`/`.sf-key`/`.sf-table` utilities, thin
  bone scrollbars, amber selection, and the station tabs' bare chevron verbs (`.sx-sw-verbs`,
  `.orr-chain__source`/`__wayout`) dressed as secondary keys.
- **`orrery/tokens.js`** — `.orr-label` 12px/.12em → 13px/.06em (the amendment's named slop tell),
  `.orr-svg text` .14em → .07em, `--dp-face-num` on the global root, `.orr-figure`/`.orr-note`.
- **Type-floor sweep** — 74 keycap/ESC-chip runs at `.2em` → `.06em`, the `‹ BACK` footers at
  `.22em` → `.1em` (six sheets), pause brief/dial labels, dense-dial low tier 12px/.14em →
  13px/.06em, settings pane labels and segmented switches (a real two-state control, not bead
  words), comms-fan labels.
- **Verbs became keys** — save-load (`› SAVE HERE / DELETE` → ghost keys, danger kept on Delete),
  mission-log toggles and every `verb()` consumer in the archive family, crucible
  fortify/refit/results foot verbs (amber primary with the cut, hairline secondaries).
- **Structure fixes** — save-load hull-record rows on a ruled grid; codex unlock index from seven
  micro-dials to figure + word + 3px bar (`--cx-p`, STATION_STANDARD §4); new-game ring stats'
  num/label/gloss given their own bands (the LINE column collision); comms fan opens over a real
  bed so it no longer slices the flight verb ladder.
- **Checks**: `check-type-floor` (2311 sizes) OK, `check:player-facing-labels` OK,
  `hull-ring` + `yard-carousel` + the SEED-ST-02 pin (updated for the `u/s` unit rename) green.
  Verification re-shots of all 22 touched screens in `.devshots/ui-bench/`.

## The depth pass, 2026-10-31 (§9 surfaces)

Owner direction 2026-10-31: the style-guide layer itself was feeding the slop — every face in the
game was ONE flat alpha (`--dp-field`, rgb(10 12 16 / .84)), so stacked panels read as one plane
of grey glass and nothing had depth, lighting, or hierarchy. The fix is a surface system, not more
type rules. `consoleStandard.js` §9 now defines:

- **Three lit elevations** (E0 instrument face, E1 raised, E2 floating) as tokens: a key-light
  pool from the panel's own top corner, a vertical light ramp falling to the foot, a 1-in-3px
  dither so large faces don't band, a machined edge (lit top rim, occluded bottom rim, hairline
  all round), and one large soft drop shadow plus a tight contact shadow.
- **Applied to**: every `.dp-mfd` / `.dp-glass` / `.dp-plate-hw` / `.sf-panel` / `.dp-tip` face;
  dialogs (`.dp-dialog`) and the comms fan as E2 floats with an amber (or red, for danger) leading
  edge; the pause flight brief and the save ledger as real seated panels; the crucible cards
  (armory / refit / results lists) as lit E1 cards with an amber selection edge; and a data-row
  hover floor (`#screens .k-rows .k-row`) for lists without their own.
- **Verified on the bench**: pause, popup-confirm/find/tooltip/dossier, comms-radial,
  crucible-draft, save-load, flight (no HUD regression), game-over, mission-log. Perf: the three
  pre-existing PQ-184 grammar-debt entries are unchanged to the third decimal. The budget baseline
  is STALE by design of the gate (the UI source digest changed): `check:ui:perf` reports
  `baseline:stale` and prescribes `capture:ui-matrix --budgets-out`; that capture was started on
  2026-10-31 ~01:16 but stalled with no output alongside the concurrent agent's headed suites —
  re-run it on an uncontended machine. The same `check:ui:perf` chain also fails on
  `check-vfx-frame-sleep` (idle VFX 0.46 ms > 0.25 ms share with 420 inert bodies) — that is the
  concurrent render/vfx work in this tree, not a UI change; it belongs to Lane 1.

Still open from the same audit (next sitting, worst first):

- **Shipworks rack verbs** (`Third socket · 4,500 cr`, restock): real buttons with
  `data-rack-upgrade`/`data-rack-restock`, but the screen's own paint pass re-dresses them
  inline and beats the console standard sheet — the paint pass needs to learn the key look
  (`src/ui/station/screens/shipworks.js` dressing), not another CSS attempt.
- **Shipworks stats footer** collides with the schematic's `Utility 06 EMPTY·S` leader label
  around the pinned verbs row (pre-existing geometry; bench measures no cut-off, the eye does).
- **Contracts tab**: `› DISPATCH THIS JOB risk 2:Forge Fou…` ellipsizes (banned by §6) and the
  RISK/STANDING field rows are cramped; the side rail's price should sit on its own line.
- **Station ledger** tape: empty-state captions fixed to sentence voice; the tape's own
  `BOUGHT/SOLD` dials still rest at very low contrast when the book is empty.
- **Help**: the small `.orr-hkey` keys in the EVERY KEY list still read as underlined words at
  12–13px; a chip treatment (like `.dp-kbd`) for `--word`/`--small` variants would finish it.

Ids match the bench list and the surface ids in `scripts/ui-grammar-surfaces.mjs` (`title`, `station-market`, `chart`, `comms-radial`, …). `--list` is the set you can shoot.
