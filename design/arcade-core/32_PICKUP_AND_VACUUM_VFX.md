<!-- LIFETIME: DURABLE -->
# 32 — PICKUP & VACUUM VFX: the "breathing in" feel

Second-highest polish surface: the reward stream. The feel target is Vampire-Survivors
satisfying — a fight ends and the world *inhales* into your hull.

## The stream

- **Pickup identity by color**: scrap amber-grey, alloys silver, electronics cyan, munitions
  red-orange, credit chips gold, XP motes violet. Readable mid-chaos; colorblind-redundant via
  pickup glyph shape (existing accessibility palette).
- **Eruption**: kill-burst pickups eject with random impulse + drag (01) — the *scatter* is
  half the juice; give it 0.3–0.6 s of bloom before vacuum capture.
- **Capture wave**: when the player enters magnet range, pickups don't all home instantly —
  they capture in a ripple (nearest first, ~40 ms stagger), so collection reads as a wave
  rolling toward you.
- **Stream trails**: captured pickups stretch a short comet trail, curve along the homing
  path, and **enter the hull at the nearest surface point** with a tiny intake flash.
- **Density honesty**: a mote-pack (12) produces a *cloud* that streams in over ~1.5 s —
  the signature "inhale" moment. An ace produces a long rich ribbon.

## The audio half (40_AUDIO owns implementation)

- Collection pip ladder: pitch climbs with chained pickups, resets after a gap. Soft cap so
  mote clouds shimmer instead of machine-gunning.
- Credit chips land with a distinctly *rounder* chime than materials — you learn to hear money.

## Rules

- Zero UI involvement (I-4): no counters popping. The cargo/credits readouts tick quietly in
  the HUD corner; that's all.
- All VFX pooled; capture wave is capped per frame and budgeted under 39's pool rules.

## Acceptance

- Metric: capture-wave stagger measurably present; pool ceiling never exceeded in a mote
  cloud + ace ribbon stress route.
- Human gate: owner watches a mote-cloud inhale and rates it "want to do that again."
