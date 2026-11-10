# devin-infa adoption — progress ledger (COMPLETE)

Adopted dead agent devin-infa's strand (TERRITORY A — dead zcode-inf20 claims). NOW.md row at
design/program/NOW.md ~line 101 updated in place to DONE — no second row added.

## Strand inventory (as found)

- `src/data/modules.js` dirty diff = AL-LG-11 `mod_ram_plate_scarred` def (complete).
- `src/systems/ships.js` dirty diff (~+256 lines) = AL-LG-11 ram history/award/fitting gates ONLY.
  AL-LG-10 (resale quote) was NOT in the diff — sellShip still `Math.floor(base*0.5)`.
- `src/ui/screens/mainMenu.js` dirty diff = ST-01 follow-through (eyebrow gloss writer —
  landed ST-01 left subs aria-only on the arc-rail dial) + same-sitting hunks
  (version-display beta-stutter fix, arrival cascade covering aside+version). All one voice —
  treated as the strand's and committed, named in the commit body.
- `src/ui/screens/newGame.js` dirty diff + untracked `src/ui/orrery/new-gameLayouts.js` =
  seed-field polish — NOT ST-02. FOREIGN → left dirty, untouched.

## Per-line receipts

| Line | Verdict | Commit / evidence |
|---|---|---|
| AL-LG-10 | SHIPPED | 24134c54af — implemented `deedResaleQuote` in ships.js (+2%/renown act cap +10%; open scars by band + 0.5%/patched cap -15%; reasons name deeds; never above buy price); sellShip pays quote, `ship:sold` carries it, toast names deeds. test/al-lg-10-deed-resale-4242 6/6 |
| AL-LG-11 | SHIPPED | 24134c54af — strand's implementation verified complete; all gates present (purchase, grant, defId-fit, fitModule instance-binding, preset eligibility + atomic reject, save reconciliation, impound carry, NG+ souvenir). test/al-lg-11-scarred-ram-plate-4242 2/2 + pre-existing test/al-long-3-scarred-ram-plate-4242 13/13 |
| SEED-ST-01 | SHIPPED | 299346d578 — follow-through finished the "visible not aria-only" bar: awake glossed verb prints "Verb · gloss" on the title eyebrow (arc rail hides .dp-lit__note by contract). Landed base was 3a21675c52 (+ref fix 41d96dfc1a). test/seed-st-01-dial-gloss-eyebrow 5/5 + zc-seed-st-01 green |
| SEED-ST-02 | already true | 0f8fbabd57 — STARTER_LINE_GLOSS on both stat render paths; zc-seed-st-02-line-stat-gloss green |
| SEED-ST-04 | already true | b6b5e68681 — beat lines interpolate live bound keys; zc-seed-st-04-taught-verb-keys green |
| SEED-ST-05 | already true | 380324d1d2 — winch line names the whole reel chord (hold + reel-in + pay-out); same test file green |
| SEED-SW-16 | already true | e3d9e2edde — DASH_IFRAME_S 0.2 on ship:dash, player-only, _invulnUntil sweep; zc-seed-sw-16-dash-iframe green |
| AL-HF-07 | already true | 4ea9ddc8da — capital torpedo latchable/throwable; zc-al-hf-07-torpedo-catch green |

## Bookkeeping landed

- inference-record: `al-lg-10-deed-resale` (WF-07), `al-lg-11-scarred-ram-plate` (WF-05),
  `seed-st-01-dial-gloss-visible` (WF-14) — all implemented/focused_green. The six already-true
  lines already had records naming their production shas; only catalog cells needed flipping.
- INFERENCE_IDEAS.md: all 8 claimed cells → SHIPPED.
- LANDED_REVIEW.md: R-24134c5, R-299346d (OPEN).
- Regression guards: fb-parked-hull-keeps-hold + next-wave-nxb-032 + black-flag-handoff +
  black-flag-market = 37/37 green; all five sibling-landed tests 18/18 green.
