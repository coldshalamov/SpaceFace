# Residual freeze (outside plan AC1–AC5 pass)

**Do not greenwash. Do not claim these DONE for this campaign close.**

| Residual | Class | Why open | Not required for |
|---|---|---|---|
| Helix natural fleet carriers | REAL | `faction_helix` fleetClass none, no zones | AC1 matrix |
| E1 membership `supporting:true` | residual | Tier-A sector bootstrap + H7/H8 specials | AC1 wreck matrix |
| GT1 continuous dual-platform / unassisted | REAL / residual | Tier-A full goldenthread marks green (`supporting:false` when candle embodied); **Electron dual-platform** + Tier-B unassisted continuous still open | **AC2** (AC2 = recovery/Helios/HUD only) |
| Electron dual-platform gallery | REAL + HARNESS | procedural-fallback NPCs; no Electron gallery run | AC5 residual docs only |

## Closed this residual pass (do not re-open as freeze)

| Closed | Proof |
|---|---|
| H1c Candle Fleet live embodiment (mark residual) | `poi_memorial` stamps `flavorTargetRef=landmark_c3_candle_fleet` (no new GLB); `check:depth-program:gt1:continuous` fullSpinePass; `returns/G_CANDLE_FLEET_EMBODY.md` |

Candle mark residual is **closed**. Do **not** re-freeze “Candle Fleet not embodied.” Electron dual-platform remains open.

## Plan AC2 clarification

AC2 = first-hour: recovery settle + Helios dock + NAV-HUD hierarchy.  
**Not** golden-thread browser+Electron multi-seed. That is Fable W4 residual.

## Plan AC5 clarification

Browser supporting gallery (42 shots) + classified Electron residual in `platform-limit.log` satisfies campaign AC5 residual documentation.  
PrimaryAcceptance dual-platform golden-thread remains residual.

## Claim honesty (2026-07-17)

Compiler must **never** stamp `dualPlatformPrimaryAcceptance=DONE` from Electron new-game + Tier-A full spine alone.  
Authoritative helpers: `scripts/lib/campaignClaimHonesty.mjs` + `npm run check:campaign-claim-honesty`.  
Fable ratify: `returns/F_CLAIM_HONESTY_RATIFY.md`.
