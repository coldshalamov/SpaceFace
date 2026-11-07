<!-- LIFETIME: CAMPAIGN -->
# X3 — Adventure glass: status

**State: policy + surfaces landed and tested; the live before/after capture is partial.**

## Done

- `src/ui/attentionGlass.js` — the Adventure flight policy: mode resolution, quiet prose sources,
  plain ≤3-word callouts, a multi-sentence prose gate, station/map untouched.
- Wired into `hudAttention.admitReceipt` (stunt/massline jargon and prose refused in flight),
  `stuntCallout.js` (all Adventure callout lines pass `plainCallout`), `masslineHud.js` (the Line’s
  telemetry words do not draw; the bracket says `GRAB` / `TOO HEAVY` instead of
  `MASS 432 · WON’T BUDGE`), and `orrery/hudAdapter.js` (the rail is icons + key caps in every
  flight context, names on the tip/aria).
- `bandHud.js`: `BAND  OFF` → `RADIO  OFF`; `CENSUS n/m` → `FOUND n/m`.
- Focused checks: `test/adventure-glass.test.mjs` 7/7; `test/swarm-glass.test.mjs` 9/9 (S2 unchanged);
  `test/fb-stunts-named-in-adventure.test.mjs` 3/3; `test/glass-474-494.test.mjs` 4/4.
- Live capture: `.devshots/x3-after/flight_z144.png` — Adventure flight at 1600×1000, rail icons
  with keys, no seven-row words. The top-centre store sentence still shows once at rescue start
  (a deliberate onboarding beat, `onboarding.js:2994`, not a receipt; W5 owns it).

## Not done

- A matched **before** capture of the same Adventure frame. The baseline `swarm/baseline/03` is a
  Swarm frame with the same jargon, not the Adventure frame. Re-shoot after the next stable boot.
- `BAND OFF` and the massline bracket are fixed in source and tests but not re-captured live
  (the boot was intermittent while another agent rewrote `src/data/missions.js`).
- One independent image review of the Adventure glass before/after.

## Next

1. Re-run `node scripts/flight-look.mjs --hud --out=.devshots/x3-before` on a HEAD-only overlay for
   the before, then the same command on the working tree for the after.
2. Review both against the X3 diagnosis and SWARM README §4.
