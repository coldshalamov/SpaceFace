<!-- LIFETIME: RECEIPT -->
# PQ-165.03 — Reduced motion keeps the information

```text
DONE  PQ-165.03 — CHARGE, a hull H chevron, a shield S, TETHER LOADED, and OUTPUT BLOCKED all read on the same-seed Helios pair with motion on and with reduce-motion on. Collision shake stays off when motion is reduced; the word and the glyph stay.

WHAT I FOUND     Reduce-motion already killed camera trauma. The replacement facts were not on the stills: CHARGE needed a live entityId, the H/S chevron only painted after a HUD tick, the taut line is a sim mirror so a fake tether object was overwritten every frame, and a starved mill had no flight-HUD word.

WHAT I CHANGED   Collision always feeds the same directional hull marker the hit uses. A starved, unpowered, or backlogged mill raises OUTPUT BLOCKED as a status pill, counted per machine so a running neighbour cannot hide it. The capture stands off a real rock, latches, and tensions until the instrument reads LOADED.

WHAT YOU WILL FEEL   With shake off you still see who is charging, which side the hit came from, whether that was a shield, that the line is working, and that a mill cannot produce.

THE NUMBERS      bar | before | after | target
                 named facts a critic can read on both strips | TAKING FIRE only | CHARGE, H chevron, S glyph, TETHER LOADED, OUTPUT BLOCKED | same five events on both modes
                 collision feel under reduce-motion | null | null | no shake/FOV/hit-stop
                 per-machine blocked pill | global clear | neighbour running leaves the starved mill's word up | one word while any mill is blocked

THE FRAMES       design/program/roadmap/receipts/PQ-165-03-motion-on-*.png and PQ-165-03-reduce-motion-*.png (telegraph, impact, shield, line, blocked). Pair ledger: PQ-165-03-strip-pair.json. Critic pass: CHARGE, TAKING FIRE+H, TAKING FIRE+S, TETHER LOADED, OUTPUT BLOCKED on both modes.

NEXT             PQ-165.00 presets and frame cap; PQ-165.01 captions and audio cues; PQ-165.02 the checklist.
```

## Review

[Review](79a4ec9f-0b49-4d6e-be31-67af0b63328d) — Bugbot: a running mill cleared a neighbour's OUTPUT BLOCKED pill; first observation of an already-blocked mill never raised it. Fixed with a per-machine set plus a site projection refresh on start/load/install.

[Critic](afd695b4-b282-4c40-9491-f2127c949f3b) — pass. Same five events named from both modes.

## Checks

| Check | Result |
|---|---|
| `node --test test/pq-165-03-reduced-motion-information.test.mjs` | 6 pass |
| `node --test test/first-hour-alert-dedupe.test.mjs` | 11 pass |
| `node scripts/capture-pq165-03-reduced-motion.mjs` | both modes read CHARGE, 1 hull marker, S, LOADED, OUTPUT BLOCKED |
| critic on the ten stills | pass |

Collision shake is still gated in `resolveCollisionFeel` when `motionReduce` is on. The chevron is the information channel, not a second shake.
