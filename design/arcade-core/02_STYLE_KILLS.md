<!-- LIFETIME: DURABLE -->
# 02 — STYLE KILLS: silent spectacle, honest rewards

The owner wants the game to *recognize* creative physical kills — but silently. The model is a
distinct visual signature per cause plus a credit/XP multiplier, never a text callout (I-4).

## The tumble state (foundation)

`tumbleStates.js` exists; PQ-009's impulse kernel already tumbles ships past `tumbleDeltaV`.
Promote **tumbling** to a first-class, always-readable physical state:

- Any ship overwhelmed by external force (impulse weapon, field, collision, tether drag while
  disabled) visibly **tumbles** — model rotates out of control, engines gutter, no thrust
  vector authority.
- Tumbling is the game's way of saying "this body is now a projectile." All style-kill
detection keys off it: *what the tumbling body hits determines the spectacle.*
- NPC recovery: existing authored recovery beat (`npcCounterthrustDelayS`) applies; heavies
  shrug by mass (coupling rules already in `fields.js`).

## The kill taxonomy (detection → silent signature)

| Cause | Detection (deterministic, from physics state) | Visual signature (distinct, wordless) | Multiplier (credits/XP only) |
|---|---|---|---|
| **Terrain smash** | Tumbling body dies from impact with asteroid/station/rock above a velocity threshold | **Fuel-tank fireball**: big orange-white ball of flame with a supernova-bright flash core, shockwave ring, debris scatter. Their reactor went up — reads instantly. | ×1.5 |
| **Burn-up** | Body dies inside a planet's atmosphere band (04_ATMOSPHERE_EXECUTION) | **Reentry shroud**: flame trail wraps the hull, hull glows through orange → white, breaks apart glowing, fragments rain sunward. | ×2 |
| **Chain kill** | Tumbling body kills *another* ship by collision (direct or via debris) | The struck ship gets the terrain-smash fireball with a **distinct hot-cyan flash core** (vs orange) so a chain reads differently from a wall hit. | ×1.5, compounding per chain link (×1.5, ×2.25, … capped ×4) |
| **Well collapse** | Body dies while captured inside a gravity Well's inner band | **Implosion bloom**: debris and light streak *inward* to a point, then a violet-white detonation ring. | ×1.5 |
| **Ordinary kill** | Direct weapon kill, none of the above | Current breakup VFX, unchanged. | ×1 |

Detection lives in one place (combat outcome / collision consequences owner) as a pure
classifier over the kill event: `{victimId, killerId, cause, tumbleState, impactVelocity,
zone}`. VFX and reward multiply consume the classified event. One classifier, two consumers.

## Reward wiring

- Multiplier applies to **credits and XP channels only** (01_KILL_ECONOMY table). Materials
  never scale.
- Chain kills are the arcade score engine: bowling one swarmer through its wing is the
  highest-value move in the game, and the compounding multiplier is what makes players
  chase it.
- No UI announces any of this. The *size and color of the explosion and the size of the
  credit-chip burst* carry the information. A post-fight codex/stat screen may enumerate
  counts for players who want the detail — optional, never in-world.

## Bans

- No floating words, callout toasts, combo counters, or "SMASHED" banners (I-4).
- No scripted throw/velocity assists to *manufacture* style kills — detection must be over real
  physics outcomes (I-3).
- Multipliers never touch material drops.
- Signatures must remain distinct at the default zoom and honor reduced-flash settings
  (supernova flash gets an accessibility-scaled variant).

## Acceptance

- Headless classifier tests: fabricated kill events → correct cause bucket, including edge
  cases (tumbling ship shot dead mid-air = ordinary kill, not terrain smash).
- Bot route per cause: concussion-cannon a swarmer into a rock → credit payout within
  ×1.5 ± tolerance; chain two → compounding observed.
- Human gate: side-by-side capture of all five death signatures at default zoom; reviewer must
  correctly name the cause of each from the visuals alone. That *is* the acceptance test.
