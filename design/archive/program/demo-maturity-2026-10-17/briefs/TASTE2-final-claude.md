# Task TASTE2 — final taste pass over the campaign's player-facing surfaces

Read `AGENTS.md` and `design/frontend/ORRERY.md` first. This is the closing taste pass of the
demo-maturity campaign. You are the last set of eyes on what players will read and feel.

## 1. The known cosmetic defect (fix it)

The phone station services button "Buy Munitions" wraps its final letter (label is one word
wider than the button at phone width). Fix minimally — let the button fit its label (nowrap +
fit, or a touch more min-width); keep the instrument look; verify at phone width via a ui-bench
shot of the station services screen if covered, else computed-style reasoning.

## 2. Taste review of what the campaign landed this sitting (all committed on master)

Walk these with `node scripts/ui-bench.mjs --shot=<id>` where the bench covers them, and by
reading the render paths where it does not:
- Market: SOLD OUT rows with restock estimate, shortage-premium receipt clause, tab clearances.
- Footprint screen: "Toll · settled" rows.
- Customs prompt: CUSTOMS CLEAR / CUSTOMS WAIVED lines.
- Target chips: SURRENDERED wording.
- Station contact cards: "Services: Market · Shipyard · …" lines.
- Photo mode: label/slider alignment (recently fixed).
- HUD: full-hold cue behavior is audio — verify no visual double-fire of the hold-full state.

Improve ONLY what fails the bar (wrong register, overlap, clipped text, mis-sized at phone);
every change must be truthful to the data shown. Do not touch tests except string pins of
strings you changed.

## Hard constraints

No git mutations. No game-logic changes. Keep each edit minimal.

## Deliverable

Per surface: verdict (RIGHT or CHANGED, with what and why in one sentence). The Munitions fix
called out explicitly. Anything that still looks cheap or unfinished — say it plainly.
