<!-- LIFETIME: ACTIVE_PROGRAM -->
# ORRERY_RUBRIC — the judging standard for every SpaceFace menu, screen and HUD surface

This operationalizes [`ORRERY.md`](./ORRERY.md); on any conflict ORRERY.md wins. It judges from
evidence — the opened PNG, the control walk, the machine checks — never from taste. Applies to
every screen in `src/ui/**` and `styles/**`, flight HUD included.

## 1. Evidence rules — how a verdict is made

1. **Shoot the real screen.** `node scripts/ui-bench.mjs --shot=<id>` (ids: `--list`). The bench
   mounts the real module over a frozen still (`docs/UI_VISUAL_ITERATION.md`). One verdict = two
   shots: 1920×1080 and 1366×768 (ORRERY.md §8.1).
2. **Open the PNG and read the image** — the path it prints under `.devshots/ui-bench/` — before
   editing and again after. The overlap/clipped/offscreen list it prints is a floor, not a review;
   a clean list can still be an ugly picture.
3. **Walk the controls.** `node scripts/ui-bench.mjs --shot=<id> --walk` hovers, clicks, re-shoots.
   Raise `--max=` if controls were left untried. Open every PNG the walk adds.
4. **NOT MOUNTABLE** → `node scripts/ui-look.mjs --only=<id>` (boots the game; that screen only).
5. **Machine gates — run them this sitting, quote the output.** A gate you did not run is reported
   as not run, never implied green.
   - `node scripts/check-type-floor.mjs` — nothing renders below 12 px; scans `styles/` live sheets
     **and** all `src/ui/**/*.js` (font shorthand, and canvas `ctx.font` with a `var()` = fail).
   - `node scripts/check-colour-tokens.mjs` — no colour literal within distance 10 of a named
     token; write `var(--token)` or `color-mix(in srgb, var(--token) N%, transparent)`.
   - `node scripts/check-wcag-contrast.mjs` — WCAG AA on composited pixels: 4.5:1 normal, 3:1
     large/UI. The binding case is text on a panel over the brightest nebula; raw-nebula rows are
     informational. For the screen you changed: `node scripts/ui-contrast.mjs` (ORRERY.md §8.2).
   - `node scripts/check-ui-a11y.mjs` — modal `aria-hidden`/`inert`, confirm-dialog focus, keyboard
     sort headers, zoomable viewport, polite toast live region.
   - Existing pins: `test/ui-no-material-imitation.test.mjs`, `test/orrery-speed-dial.test.mjs`
     (the ramp never warms toward amber/red), `test/orrery-decrypt.test.mjs`,
     `test/orrery-arcrail-width.test.mjs`, `test/orrery-hud-adapter.test.mjs`.
     `test/ui-orrery-guard.test.mjs` is named by ORRERY.md §8.7 but does not exist yet — until it
     lands its rules (no borders/cards/box-shadow/`<table>` outside `src/ui/orrery/`) are judged by
     hand from the diff.
6. **Open every reachable state**: tabs, hover, active, disabled, empty, loading, the panel a
   control reveals. A verdict that skipped a reachable state is INCOMPLETE and names which.

A player-facing change lands only with a clean verdict; a FAIL blocks (root AGENTS.md §9 gate).

## 2. The pillars, in judging order

### P1 — Colour discipline
Every colour is a `--dp-*` token from `src/ui/deckplate/tokens.js` + `src/ui/orrery/tokens.js`
(check-colour-tokens green; a new `--xx-` root is a defect). Amber (`--dp-lamp/-hot/-dim`,
alias `--dp-hand` `#f2b950`) lights **at most one leading thing per screen** — the Hand or the Lamp
Key, never both. `--dp-danger` `#ff5038` is **threat only** (hostile, incoming, loss, irreversible)
— never selection, never emphasis. `--dp-ice` `#8fcbff` is **data in motion only** (a beam's pulse,
an event ripple, a route computing) — never a structural line, a rest ring, or a box; the Speed
Dial's ramp may run bone→phos→ice→azure→violet but never warms toward amber or red
(`test/orrery-speed-dial.test.mjs`). Rest-state instrument light is warm bone (`--dp-line*`), never
blue. The only sanctioned colour extensions: the Chart's ground and the radar's contacts — their
structure, words, rails and keys stay bone (ORRERY.md §3.3).

### P2 — Visual hierarchy
Exactly **one primary verb per screen** — at most one Lamp Key (§3.6). The eye lands in the
intended order: hero instrument → its reading → the verb. Scale contrast does the sorting: one
dominant numeral (hero 56–144 px) against 12 px labels, not five medium sizes. Secondary actions
are quieter but still legible; nothing competes with the Hand for "this one".

### P3 — Coherence
The screen **composes the ORRERY library** (`src/ui/orrery/` — the 34 elements, wired through its
`*Layouts.js`) and hand-rolls no chrome: no bordered panel, border-radius card, box-shadow panel,
or raw `<table>`. Light is the only material — no bevel/brushed-metal/LED/screw CSS
(`test/ui-no-material-imitation.test.mjs`). **Glass never has a border**; its edge is a corner
tick, a scale, or nothing. One token root; no new standalone stylesheet in `styles/`.

### P4 — Accessibility
Focus is visible on every interactive element (the 2 px bone bracket, `:focus-visible`) and is
restored to the opener on close. Keyboard — and gamepad where the surface promises it — reaches
and operates everything. Custom widgets carry ARIA (role, `aria-pressed`/`aria-label`, live
regions; check-ui-a11y green). Reduced motion reaches **every state instantly** (`html.sf-reduce-motion`,
driven by the game's own setting `accessibility.motionPreference` — never the OS hint alone;
`src/ui/accessibility.js`), drift and beams stop, decrypt and rolls resolve at once; flashes honor
`sf-reduce-flash`. Colour is never the sole channel (the SEMANTIC_PALETTE shape/icon redundancy).
Hit targets hold the token heights (`--dp-key-h` 56, `--dp-key-h-2` 40, `--dp-row` 34 px) at both
widths. The 12 px floor holds (check-type-floor green).

### P5 — Intuitiveness
Controls look like what they do (the Lamp Key presses, the Scale drags, the Dock Rail magnifies);
recognition over recall — key hints shown, selection named, state legible without memory. Every
way in has a way out: Esc/back closes, a hold-ring release cancels, dialogs restore focus.
Destructive and irreversible verbs confirm (Hold Ring / confirm dialog) and name the loss; safe
verbs don't nag.

### P6 — Microinteractions
Hover, active, focus-visible, disabled and empty states are **authored** for every control (a
disabled control looks disabled; an empty list says what would be here). Loading is instrumented —
real stage ticks, never a fake timer. **Nothing just appears**: arrival follows the choreography
(0 ms glass+DOF → 60 ms rings draw → 180 ms scales tick → 240 ms decrypt → 300 ms numerals roll →
360 ms Hand swings); leaving reverses in 180 ms. Transforms move on the spring presets — swing
170/16 (the Hand overshoots and settles), settle 260/28 (panels), snap 420/38 (feedback), drift
0.4°/s (idle rings) — never bare easings. Every effect has an in-fiction job: a beam shows a real
relationship, a counter rolls because the number changed, the Hand points at a real choice.

### P7 — Typography & spacing
One type scale — the `--dp-fs-*` tokens and the `.orr-*` roles: display Archivo wdth 125 w800,
numerals tabular wdth 100 w250–280 in `--dp-phos`, labels Archivo wdth 112 w600 caps tracked
.10–.18 em at 12 px, body Instrument Sans 14–17 px, Spline Sans Mono for codes only. Inside
≤48 px dials numerals condense (wdth 76–86). Blocks sit on the shared frame
(`--dp-margin`/`--dp-col`/`--dp-rhythm`). Structural `01/02/03` numbering only on genuine
sequences. Alignment is clean at both widths.

### P8 — Information design
A **quantity** is an arc (Arc Gauge with ghost delta). A **choice set** ≤ 9 sits on a ring/arc
rail; > 9 on a ladder with a light cursor. A **relationship** is a beam with a travelling pulse. A
point label is a leader line, 45° elbow, collision-free. Straight edges appear only as scales and
the Lamp Key's 45° cut. Tables become borderless ladder tables with pictograms. **No bordered
rectangle anywhere in the PNG.**

### P9 — Performance guards
**No `backdrop-filter` anywhere the world is live** (flight HUD, prompt deck, toasts over flight);
glass blur only over a paused/static world. **Bloom is geometry, not a filter**: a second wider
stroke (4–6 px, 18–30 % alpha) under the 1 px core (1.5 px active, 3 px gauge fills); no live
blur/drop-shadow filters in flight — they are allowed only on menus over a paused world. The
flight HUD stays ≤ 0.8 ms script/frame, writes DOM only on change, animates transforms/opacity
only. FX canvases pause off-screen and never run in flight (Threat Channel excepted).

### P10 — Responsive behaviour
At 1366×768 and in squeezed columns the composition **condenses, never shrinks**: Archivo's width
axis (labels wdth 92–100, dials 76–86) and tracking (.01–.08 em) absorb the squeeze; `font-size`
never drops below 12 px (check-type-floor green at the narrow width too). Nothing overlaps,
clips, or leaves the frame at either width (`--walk` and the overlap list prove it). The `--dp-s`
frame factor scales geometry and the floor survives it.

## 3. The per-screen checklist — walk it literally, answer yes/no

A pillar passes only when every line under it is **yes** and its machine gate is green. Any "no"
is a finding at the severity in §4.

**Colour**
1. Are all colours on screen `--dp-*` tokens, with check-colour-tokens green for every file touched?
2. Is there at most one warm amber leader (Hand or Lamp Key), and does red appear only as threat?
3. Does ice appear only on something actually in motion, and does rest light read warm bone, never blue?
4. Does every meaning (hostile/neutral/ally/threat) carry a non-colour channel (shape, icon, word)?

**Hierarchy**
5. Can you name the one primary verb within two seconds of opening the PNG?
6. Is there exactly one Lamp Key, and do secondary actions read quieter without losing legibility?
7. Does scale contrast sort the screen — one hero numeral vs 12 px labels, not five medium sizes?
8. Does the geometry's actual order match the intended reading order (hero → reading → verb)?

**Coherence**
9. Does the diff add zero boxes/cards/bordered panels/`<table>` chrome — only library + `*Layouts.js`?
10. Is glass borderless, on `--dp-glass`, only over a paused/static world?
11. Would every element on screen be at home in the library showcase (`tools/orrery.html`)?
12. Are produced objects (hulls, crests, pictograms) real art at display size — no CSS stand-ins?

**Accessibility**
13. Is focus visible on every interactive element, and restored to the opener when a dialog closes?
14. Can keyboard alone (and gamepad where promised) reach and operate every control?
15. Do custom widgets carry role/`aria-*`, and does check-ui-a11y pass on the files touched?
16. With Reduce on, does every state arrive instantly — drift stopped, beams stopped, text resolved?
17. Do hit targets hold the token key/row heights at both widths, and the 12 px floor hold?

**Intuitiveness**
18. Does each control look actionable (or clearly inert) before you touch it?
19. Is selection/armed/empty state legible without memory — named or lit, not implied?
20. Does every way in have a way out (Esc/back, hold-release cancel), with focus returned?
21. Do destructive verbs confirm through Hold Ring or dialog, naming what is lost?

**Microinteractions**
22. Are hover, active, focus-visible, disabled and empty states all authored — did `--walk` open each?
23. Does arrival follow the choreography and leaving take 180 ms — nothing just appearing?
24. Do transforms move on the spring presets, the Hand overshooting then settling?
25. Does every effect pay rent — a real relationship, a changed number, a real choice?

**Typography & spacing**
26. Are all sizes from the token scale, with nothing below 12 px anywhere?
27. Are numerals tabular, phos-bright, hero-scaled, condensed only inside small dials?
28. Are labels the etched role (Archivo 112/600 caps, .10–.18 em) — not mono, not tiny?
29. Do blocks sit on margin/column/rhythm, aligned cleanly at both widths?

**Information design**
30. Is every quantity an arc, and every choice set a ring (≤9) or a ladder (>9)?
31. Is every relationship a beam with a direction pulse, and every point label a 45° leader line?
32. Are there zero bordered rectangles in the PNG (scales and the 45° cut are the only straight edges)?
33. Are tables ladders or instruments with pictograms and a light cursor?

**Performance**
34. Is `backdrop-filter` absent over live flight, present only over paused/static worlds?
35. Is bloom geometry (a second stroke), with no live blur/drop-shadow filters on flight surfaces?
36. Does the HUD write DOM only on change and animate transforms/opacity only?
37. Do FX canvases pause off-screen and stay out of flight (Threat Channel excepted)?

**Responsive**
38. At 1366×768 does the layout condense via width axis and tracking, with nothing overlapping or clipped?
39. Is the type floor intact at the narrow width — condensed, never shrunk below 12 px?
40. Does the screen still read (hero → reading → verb) at the small size?

## 4. Severity scale

- **S1 — blocker.** A machine gate fails on a file you touched (type floor, colour tokens, WCAG on
  composited pixels, ui-a11y); a control that does nothing visible ("no visible change" on a
  standing choice is a bug); a control keyboard-unreachable; a state unreachable under Reduce; a
  bordered rectangle / second token root / new standalone stylesheet; text below 12 px;
  `backdrop-filter` in flight. Fixes before the screen is called done.
- **S2 — major.** A pillar pass bar missed on the opened PNG: two amber leaders, red as emphasis,
  a hand-rolled box, no escape path, a destructive verb unconfirmed, a missing
  hover/disabled/empty state, arrival choreography absent, broken reading order, overlap or
  off-frame content at either width. Fix in the same sitting.
- **S3 — minor.** Spacing off the rhythm; a condense opportunity missed (shrunk but still ≥ 12 px);
  a label role slightly off (weight/tracking); an effect with a thin justification. Fix now if
  small; otherwise one ledger row.
- **S4 — note.** Taste-level nudges (a better hero size, a nicer bend). Record in the report;
  never blocks.

Small = one cause, minutes: fix in this session (total-fix mode, root AGENTS.md §7). Bigger: ONE
row in the demo defect ledger (`design/program/DEMO_READINESS_2026-09-20.md` §6). A defect left
neither fixed nor logged is the one unacceptable outcome.

## 5. Evidence hygiene

The opened PNG is the verdict's primary evidence: code explains cause, the picture proves the
surface, the walk proves behaviour. Machine gates count only when run this sitting — name the
command, quote the line. Both widths are one verdict, not two. A still is not required for a
non-visual claim (a number, a routing, an ARIA contract) — the focused test or machine check is
the evidence there. Verdicts cite line numbers for causes (`src/ui/orrery/…:123`) and shot ids for
surfaces. "Looks fine" is not a verdict.
