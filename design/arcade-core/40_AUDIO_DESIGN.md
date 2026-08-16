<!-- LIFETIME: DURABLE -->
# 40 — AUDIO DESIGN: the half of the game you don't see

Audio carries juice *without touching the camera* (10) — it's the safest dopamine channel and
currently the least specified. `audioRecipes.js`, synth + authored-source hybrid (GDD §9.5).

## Mix priorities (the ducking ladder, highest first)

1. **Player-critical physics**: your impacts, your tether strain, your hull warnings
2. **Weapons** (yours louder than theirs)
3. **Pickup stream** (32's ladders)
4. **Deaths** (31's size ladder = sub-bass ladder)
5. **World events** (distant rumbles, station klaxons)
6. **Barks/radio** (attention-arbiter governed)
7. **Ambience/music** (fills what's left)

## Signature sounds to author/perfect

- **The inhale** (32): pickup capture ripple — the game's ASMR. Priority above almost all.
- **Massline**: taut-hum rising with strain (34's gradient made audible), whip-crack cut.
- **Field presence**: each field kind has a low continuous voice (well = downward drone,
  repulsor = pressure hiss, cone = filtered wind). You can *hear* forces off-screen.
- **Burn-up** (04): building roar with doppler as it falls away sunward.
- **Cook-offs** (31): staggered thumps walking a heavy hull.
- **Empty space** (I-6): near-silence — ship hum, suit-quiet cabin tone, distant radio hiss.
  The contrast *is* the design; fight scenes bloom out of silence.

## Adaptive music

Layers keyed to *sim state*, not timers: threat count, hull band, island vs deep space,
docked. Transitions crossfade on bar boundaries; combat entry has a < 1 s ramp (no slow
builds when you're being shot). Empty space gets sparse ambient — Freelancer's loneliest
trick, on purpose.

## Rules

- Concurrency caps per family (existing bus system); pickup pips and flak get their own high-
  count pools with pitch-variation to avoid machine-gun sameness.
- Every new VFX in 31–39 ships with its sound in the same packet. No silent polish.

## Acceptance

- Human gate: eyes-closed fight capture; owner narrates events correctly from audio alone.
