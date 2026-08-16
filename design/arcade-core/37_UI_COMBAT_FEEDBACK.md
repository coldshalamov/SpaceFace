<!-- LIFETIME: DURABLE -->
# 37 — UI COMBAT FEEDBACK: the quiet HUD

Combat info lives in the world first (I-4); the HUD's job is confirmation and the stuff the
world can't say. Small, fast, consistent.

## The allowed set

- **Reticle states**: idle → acquire (brackets breathe in) → hit (single corner tick flash,
  1 frame + audio tick) → kill (reticle pip + brief ring collapse). The kill pip is the only
  "you did it" UI allowed in-world, and it's 100 ms.
- **Target panel**: three segmented bars (shield/armor/hull per GDD §6.1) with *chunk* loss
  animation — damage takes bites, not gradients. Subsystem icons on heavies (14) grey out as
  you strip them.
- **Radar**: IFF glyphs with shape redundancy (exists); hostile intent telegraph — a contact
  starting an attack run gets a brief radar flare (pairs with 0.5 s engine-flare in-world).
- **Overview strip** (GDD §7.5): closing-speed arrows, specialist icons (15) so the puzzle is
  scannable.
- **Directional damage indicator**: existing radial arcs, contrast ×2 (GDD §6.3 already says
  this — do it).
- **Threat vignette**: at hull critical, a slow edge pulse (reduced-flash safe), silenced by
  any new damage-free 2 s. No alarms after the first 3 seconds of a fight.

## The banned set (recap of I-4)

No floating damage numbers (default off, one settings toggle), no style-kill words, no combo
counters, no kill feed in-world. The codex/post-fight stats screen may show everything —
afterwards, off to the side, by request.

## Acceptance

- Human gate: full-fight capture; owner answers "did you ever look at the HUD and not
  instantly find what you wanted?" — target answer: no.
