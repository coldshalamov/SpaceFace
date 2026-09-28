<!-- LIFETIME: RECEIPT -->
# CV-THROW-1 — The cut-grade verdict

```text
DONE  CV-THROW-1 — a deliberate cut now lands a world-anchored verdict pill on the
                  released body naming the grade and the measured cause; breaks and
                  target loss stay silent. The teaching rides the same pill/signature
                  grammar the latch denial already owns.

WHAT I FOUND     The rating authority already existed end-to-end — rateRelease() grades
                 every release (razor/clean/good/messy + technique tow/radial/swing/slack)
                 and tether:releaseRated is emitted on all three paths (deliberate cut,
                 break, target loss). What was missing: nothing distinguished a cut the
                 player chose from a line that snapped, and no surface translated the
                 grade into words at the place the pilot is already looking. The
                 cadence strip teaches the pre-release read; post-release was mute.

WHAT I CHANGED   rateRelease carries `deliberate`; the two player-cut emitters pass it,
                 breaks and target loss do not. masslineHud subscribes to
                 tether:releaseRated and, only for deliberate ratings, writes
                 state.masslineReleaseVerdict into the same signature/pill grammar as the
                 M3 denial: classification, technique, releasedAtApex, the released body's
                 live position (snapshot fallback), quantized 1.8 s expiry. The verdict
                 takes the acquisition slot after a live denial and before acquisition —
                 "RAZOR · AT THE APEX", "MESSY · NEVER SWUNG", "GOOD · NEEDED MORE SPEED",
                 "MESSY · LINE NOT LOADED". Earned grades keep the solid diamond; weaker
                 grades get the broken ring. A latch or expiry clears it. The verdict also
                 exits the quiescent signature fast-path — post-release IS the idle case,
                 so without that the pill could never paint.

WHAT YOU WILL FEEL   Let a line go and the answer is on the body you let go of, in the
                 bracket grammar you already read: the grade, then why. A tow that never
                 swung says NEVER SWUNG; a flat cut says LINE NOT LOADED; a cut that
                 needed the crest says NEEDED MORE SPEED. Snap the line in a rock strike
                 and nothing lectures you — consequence, not coaching.

THE NUMBERS      bar | before | after | target | evidence
                 grade spoken on deliberate cut | none | pill at released body | always | unit
                 grade spoken on break/loss | none | none | none | unit
                 verdict expiry | n/a | 1.8 s quantized | ≤2 s | unit
                 signature repaint on new verdict | n/a | rolls (quiescent exit) | rolls | unit

FILES            src/systems/tetherGameplay.js (rateRelease deliberate flag)
                 src/ui/masslineHud.js (verdict state, renderer, CSS, signature, clears)
                 test/cv-throw-1-release-verdict.test.mjs
                 build_map.md row 42

CHECKS           node --test test/cv-throw-1-release-verdict.test.mjs -> 4/4
                 node --test inf-015-denial-pill massline-acquisition-preview
                   massline-latch-clutter wave-g1-massline-bracket wave-g2-latch-deny-cue
                   inf-062-latch-denial-hint -> 48/48
                 npm run check:player-facing-labels -> OK

UNPROVEN         No in-flight visual capture of the pill over the live scene — the DOM
                 assertions cover state, copy, shape, and class grammar but not the frame.
                 The 1.8 s floor and copy are authored judgment, not measured.
```
