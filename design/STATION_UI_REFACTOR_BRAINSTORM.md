# Station UI — refactor brainstorm

Written 2026-08-12 against master `9b711036`. Every claim below was checked against the live code;
where a claim from the earlier handoff pack did **not** survive checking, it is marked.

---

## The short version

The station screens do not have a design problem. They have a **design-system-enforcement**
problem that *presents* as a design problem.

Four rounds of "polish" were done by appending new rules to the bottom of the stylesheet instead of
editing the rules already there. The screens you're looking at are the accumulated sediment of that.
Almost every specific thing you complained about is a downstream symptom of three mechanical faults —
and two of those faults are small, cheap fixes that have nothing to do with visual design at all.

This matters for sequencing. **A redesign applied on top of the current stylesheet becomes override
layer #5 and decays the same way within a few months.** The order of operations below is the real
argument of this document.

---

## The three mechanisms

### M1 — The stylesheet is append-only

`styles/station-workbench.css` has **1,036 selectors, of which 202 are defined more than once at the
top level** — not inside media queries, which would be legitimate. Unconditional redefinitions,
stacked. `.sx-dock` is defined five separate times. `.sx-topbar` four times.

The file's growth tells the story plainly:

| Commit | Lines |
|---|---|
| `f22c193e` "Redesign station to object-centric strategy mode" | 1,136 |
| `9921f1a0` "checkpoint strategy interface polish" | 2,064 |
| `6aac9b48` "polish strategy interface interactions" | 2,345 |
| `5e665f86` → `88f558da` (three more passes) | 2,381 → 2,398 |
| today | 2,411 |

Nobody edited. Everybody appended. Each agent found their change had no effect (because an earlier
duplicate downstream was winning), so they added another block at the bottom.

**The single clearest example is the card you called out by name.** `.sx-mkt__console` — the
buy/confirm panel on the Market screen — is defined four times:

| Line | Rule |
|---|---|
| 497 | `grid-column:2; grid-row:2` ← the original, correct, in-the-grid placement |
| 1093 | `position:absolute; z-index:8; inset:76px 0 0` ← overrides the grid, becomes a floating overlay |
| 1577 | `inset:152px 0 0` ← someone nudged it down to stop it overlapping |
| 1956 | `inset:168px 0 0` ← someone nudged it again |

You said it "is sitting on top of the page like it's just slapped there." It is *literally* slapped
on top. It was designed into the layout, then a later pass lifted it out of the layout, and two
further passes hand-tuned a magic pixel offset trying to stop it colliding with things. That's why
it overlaps the buy/sell/avg boxes, and that's why it can't be closed — it was never a dialog.

The same mechanism produces the rest of the visual complaints:

- **"Colors and borders too similar, can't tell what is what."** There are **407 distinct
  `rgba()` values** hand-written in the station styles. Not 407 colors — 407 *values* that are mostly
  imperceptibly different versions of the same cyan: `rgba(99,205,220,.15)`, `rgba(99,205,220,.13)`,
  `rgba(99,205,220,.10)`, `rgba(103,206,221,.14)`, `rgba(103,208,223,.18)`. You cannot build a visual
  hierarchy out of 407 shades of the same thing. There *is* a proper token set defined
  (`--ink-0..3`, `--line-1..3`, `--surface-1..3`) — it's just losing. Raw literals outnumber token
  references roughly 3 to 2.
- **"Harsh tiny font that looks wiry and hard to read."** **37 distinct font sizes**, of which
  **112 declarations are below 12px** — that's 45% of all type on these screens. Including 6.5px,
  7px, and 8px. And sizes like 11px / 11.5px / 12px / 12.5px / 13px / 13.5px coexist, which are
  indistinguishable to the eye but each one is another thing to maintain.
- **"Clipped off at the bottom" / "can't see what's below."** 91 `position:absolute` declarations
  and **64 `overflow:hidden`** against only 20 scrollable containers. `overflow:hidden` is how you
  make it *look* like content fits when it doesn't. That's the Industry "Requires refinery" button,
  and the Ledger clipping.

### M2 — A global rule breaks every transform-positioned control

This one is a single line, and it is the whole "shipworks targets are broken" complaint.

> **Measured on the live element, 2026-08-12.** The hardpoint's computed transform is
> `matrix(1,0,0,1,-17,-17)`. Under the old press rule it moved **+17px right, +18px down**; under
> the fix it moves **+1px down**. The displacement is exactly the "lower-right" jig described.

`styles/ui.css:171` says, for every button in the entire game:

```
button:active { transform: translateY(1px); }
```

`.sx-hardpoint` — the bullseye targets on the ship — is a `<button>` that is **positioned** by
`transform: translate(-50%, -50%)`, which centers it on its anchor point on the hull.

CSS `transform` is one property. It doesn't merge. On mouse-down the press rule *replaces* the
centering, and a 34px target instantly jumps ~17px right and ~16px down, then snaps back on release.

That is exactly what you described: *"it just jigs the target off to the lower-right while you're
holding the mouse button on it."* It's not a broken click handler — the click usually still fires,
but the target has fled the cursor, so it reads as dead. Same root cause for the Thruster.

This rule affects **every** transform-positioned button in the game, not just the station.

### M3 — Ad-hoc allowlists where there should be a contract

Three separate complaints, one pattern: behaviour was special-cased per-trigger instead of being
defined once.

**The help card that vanishes before you can read it.** In `stationApp.js:293` there's an
app-wide click handler: *if a popover is open and the click wasn't inside it, close it.* It carries a
hand-written exemption list — `[data-act="undock"]` and `[data-hold]`.

The help button is in neither list. So: you click `?` → the help handler opens the popover → that
same click keeps bubbling up to the app handler → the app handler sees an open popover, sees the
click wasn't inside it, sees it's not exempt → closes it. **Open and closed on one click.**

The exemption list has exactly two entries, which means two people already hit this bug and each
patched their own trigger rather than fixing the pattern. Help was the third and nobody noticed.

**The close button that's an up-arrow.** `shipworks.js:923` renders the chooser's close control as
`icon('undock', 18)`. The undock glyph is a launch arrow. Why? Because the station icon set has 21
glyphs — market, shipworks, industry, contracts, factions, bar, ledger, repair, refuel, resupply,
undock, credits, hull, fuel, cargo, info, chevron, spark, target, route, clock — **and no close/×
glyph.** Someone needed a close button, the set didn't have one, they grabbed the nearest arrow.

**"LAUNCH safe to undock" opening the Market.** Confirmed, and it's a one-character bug. The
routing table maps `services → null`, and the lookup is `TARGET_MAP[st.targetTab] || 'market'`. In
JavaScript `null || 'market'` evaluates to `'market'`. The deliberate "this row has no destination"
value gets silently converted into "go to the Market."

---

## Your complaints, mapped

| What you said | Mechanism | Fix size |
|---|---|---|
| Confirm card slapped on top, overlaps buy/sell/avg | M1 | small (delete 3 override blocks) |
| Text overlapping / clipped at bottom / can't see below | M1 | medium |
| Harsh tiny wiry font | M1 | medium (impose a type scale) |
| Borders & colors too similar, can't tell what's what | M1 | medium (enforce existing tokens) |
| Can't tell buttons from information cards | M1 | medium (needs one affordance rule) |
| Bullseye targets jig to the lower-right, do nothing | **M2** | **one line** |
| Thruster click does nothing | **M2** | same line |
| Help card disappears before it's readable | **M3** | **~3 lines** |
| Close button is an off-center up arrow | **M3** | add one glyph |
| "LAUNCH safe to undock" goes to Market | **M3** | **one character** |
| Verbose redundant copy ("CARGO / Sell What You Hauled") | content | small, per-screen |
| Fuel bar and Refuel button duplicated | composition | Stage 2 |
| Generic station logo, no faction emblems | assets | parallel track |
| Bar headshots bad | assets | parallel track |

Everything in the bottom four rows is real design work. Everything above it is repair.

---

## The refactor, in the order it has to happen

### Stage 0 — Repair what's mechanically broken. No visual decisions.

M2 and M3. Roughly a dozen lines total, spread across five files. Nothing here requires a taste
call, and nothing here can be argued about:

1. Scope the global `button:active` transform so it can't clobber transform-positioned controls —
   or better, switch the press feedback to something that doesn't use `transform` at all.
2. Replace the popover's exemption allowlist with a real contract: any element that opens a popover
   marks itself, and the close-on-outside-click handler honours that mark. One rule, no list to
   forget to update.
3. Add a `close` glyph to the icon set and use it.
4. Fix the `|| 'market'` fallback so a row with no destination doesn't invent one.

After Stage 0 the screens still look the same, but the ship targets work, the help text is readable,
the close button reads as close, and Launch launches.

### Stage 1 — Flatten the stylesheet. Appearance deliberately unchanged.

This is the stage that makes everything after it possible, and it is the stage that will be
tempting to skip.

- Collapse the 202 duplicated selectors to one block each, preserving whichever value currently
  wins so the screens don't visually move.
- Replace the 407 raw colour literals with the token set that already exists.
- Impose a type scale — six or seven sizes, minimum 12px for anything a player has to read — and
  replace all 37.
- Convert the Market and Industry consoles from absolute overlays back into real grid placement
  (the correct rule is still sitting there at line 497, buried).
- Audit the 64 `overflow:hidden` declarations; each one is either intentional clipping or a hidden
  bug.

**Success criterion for Stage 1 is "it looks basically the same and the file is half the size."**
If it looks different, something was mis-merged.

### Stage 2 — Now redesign, per screen.

Only now will composition changes stick. This is where the genuinely good ideas from the earlier
handoff belong, and where your specific asks live:

- **One status object per resource.** Your instinct is right and it's the strongest single idea in
  either pack: the fuel bar and the Refuel button are the same thing displayed twice. Merge them —
  a fuel meter that grows a "Refuel · 340 cr" action when it's below full, and doesn't when it
  isn't. Same for hull/repair and hold/resupply. That deletes a whole row of the top bar *and* a
  whole row of the dock.
- **One page, one job.** Market is *select → inspect → transact*. Shipworks is *ship → hardpoint →
  compatible parts → consequence → commit*. Industry is *capability → dependency → commit*. They
  currently share one card-grid grammar that fits none of them.
- **Copy pass.** "CARGO / Sell What You Hauled" → "Sell". "JOBS / Jobs On The Board" → the tab is
  already called Missions. "All stock / In hold / Raw & rare" → these are filters; make them look
  like filters and name them "All / In hold / Rare".
- **One affordance rule, applied everywhere.** Decide what a clickable thing looks like and what an
  informational thing looks like, and never blur them. This is the fix for "I can't tell what's a
  button."

### Parallel track — identity assets

Independent of all of the above, since it's asset work rather than CSS: per-faction emblems, per-
station-type crests, better Bar portraits. Worth starting now because it doesn't collide with
Stages 0–2. One caution the earlier pack got right: whatever generates these must cover **all 32
live station IDs**, not a handful, or it just relocates the "generic star" problem.

---

## Anti-goals

**Do not add a third stylesheet.** The earlier Attempt B proposed exactly this — a new 866-line
sheet carrying 302 `!important` declarations, plus a background process that rewrites the DOM
continuously to enforce it. That is M1 one level worse: it's a fifth override layer that wins
arguments by force, and the next agent who needs to change anything will have to fight it. It would
make the screens look better for about a month and then be unmaintainable.

**Do not skip Stage 1 to get to the visible improvements faster.** Redesigning on top of the
current sheet means your new rules become override block #5. This is precisely how the current mess
was produced, four times in a row, by people who were each individually doing reasonable work.

**Do not wipe and rebuild.** You said this and it's correct. The underlying systems are real —
the Market chart is genuinely interactive with keyboard and hover support, the dock has proper
tablist semantics and gamepad handling, first-dock handoff and departure readiness are wired to
real game state. The presentation layer is what failed, not the machinery.

---

## Corrections to the earlier handoff pack

Three things in it don't survive checking:

- **Ledger is not a station screen.** It's a 32-line adapter that mounts `shipLedger.js`, which is
  the *same panel the Codex uses*. Its layout problems are inherited from a shared component. Fixing
  them inside station CSS either won't reach it or will break the Codex — this needs to be fixed at
  the shared panel, once.
- ~~**"Empty Cargo" as a fake installed ship part** — that string does not exist anywhere in
  `src/`.~~ **Retracted — the pack was right and my grep was too literal.** The label is built at
  `shipworks.js:481` as `` `Empty ${SLOT_LABEL[slot.type]}` ``, so it never appears as a literal
  and only exists at runtime. Confirmed on screen. Fixed: an unfitted mount is now named for the
  slot with an `OPEN` state, instead of a part whose name happens to start with "Empty".
- **The pressed-hardpoint diagnosis was aimed at the wrong file.** The pack attributes it to
  Shipworks' own styles. It's the global `button:active` rule in `ui.css`, which means the same bug
  is latent everywhere else in the game that positions a button with `transform`.

The pack's page-by-page symptom inventory is otherwise sound and worth keeping. Its recommended
design direction — object-centred workspaces per page — is the right Stage 2 target.

---

## What I'd do first

Stage 0. It's about a dozen lines, it's unarguable, and it turns four of your loudest complaints
off. Then Stage 1, which is unglamorous and is the whole ballgame.

---

## Implementation status — 2026-08-12

**Stage 0 is done and verified.** M2 and M3 are fixed at their owning files: the press rule now
uses the individual `translate` property (which composes with `transform` rather than replacing it),
the popover's exemption allowlist is replaced by "whatever opened it is exempt", the icon set has a
real `close` glyph, and `services` resolves to the undock verb instead of falling through to Market.

**Stage 1 is partially done.** `styles/station-berth.css` establishes the type scale, the colour
contract (amber = actionable, cyan = live data, nothing else earns colour) and re-points the legacy
`--ink-`/`--line-`/`--surface-` tokens, which lifts ~330 existing references at once. The worst
sub-12px offenders are raised by name. **The 202 duplicated selectors and 407 raw colour literals in
`station-workbench.css` are NOT yet collapsed** — that is the remaining flatten pass, and it is
still the highest-value unglamorous work in this area.

**Stage 2 is done for the shell only.** The top fascia merges each resource with its service verb,
the dock is destinations-only and seated at the very top, and Market/Industry consoles are back in
the grid. **The interiors of the seven screens are untouched** — Shipworks still wastes its lateral
space, the Market chart is still an unlabelled 400px block, Factions still needs emblems, the Bar
still has two contacts without portraits. Those are the next Stage 2 items.

Evidence: `.devshots/station-restore/berth-final/` (1920×1080, all seven tabs, zero page errors).
