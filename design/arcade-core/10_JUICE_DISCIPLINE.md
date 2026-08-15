<!-- LIFETIME: DURABLE -->
# 10 — JUICE DISCIPLINE: spectacle that never breaks the pilot

Juice is wanted — the game should feel alive and violent. But agents have repeatedly shipped
"juice" that hijacked the camera and made the ship uncontrollable (I-2). This doc is the
allowed/banned list so juice work stops being a regression lottery.

## Allowed (encouraged)

- **VFX scale with physics truth.** Impact flashes, debris, shockwave rings, and fireball size
  scale with *momentum exchanged*, not damage numbers. A freighter shrugging a fighter off its
  bow looks like truck-vs-bicycle without the camera doing anything.
- **Audio as the juice carrier.** Rising pitch ladder on pickup streams, taut-line hum with
  tension, mass-scaled impact thuds, the burn-up roar. Audio never touches control — put the
  drama here first.
- **Brief hit-stop on genuinely big events only** (style kills, heavy collisions): ≤ 60 ms,
  at most once per ~2 s, never during player boost/dash, and it never swallows input —
  buffered inputs execute on resume.
- **Camera trauma, small and fast-decaying**: amplitude scaled to event momentum, hard-capped
  (suggest ≤ 6–8 px at default zoom), decay ≤ 0.3 s, and **never any zoom pulsing during
  flight.** `bulletTime.js` exists — audit it against these caps before reuse.
- **Ship-state VFX on the player's own hull** (engine flare, shield ripple, heat glow) —
  informative, local, zero camera involvement.

## Banned (each has been shipped before and hurt the game)

- Camera zoom pulses, whips, or forced re-framing during combat.
- Shake strong enough to obscure aim or the ship's motion.
- Slow-mo that fires more than rarely, or that delays/eats player input.
- Any juice that changes ship response feel (I-2).
- Text/word feedback of any kind for combat events (I-4).
- Screen-filling flashes without a reduced-flash-safe variant.

## Settings (already the repo's pattern — wire them)

Screen-shake slider (including 0), reduced-motion respect for hit-stop, reduced-flash variants
for supernova/burn-up signatures. Defaults land in the middle of the caps above.

## Acceptance

- Layer 1: automated caps — no hit-stop > 60 ms, no re-trigger inside 2 s, input buffer
  integrity test (inputs during hit-stop all execute), camera offset ≤ cap in scripted
  heavy-impact route.
- Layer 3: owner plays a fight with defaults and answers one question: "did the camera or
  effects ever make you lose your ship?" — the only acceptable answer is no.
