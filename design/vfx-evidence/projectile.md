# Projectile VFX — Elite evidence

**Hook:** `visualFactory.js` `buildProjectile` — size + damage-type lanes

## Variants (≥3)

| Variant | Visual | Selection |
|---------|--------|-----------|
| `small` | Flak bead (`proj:flak:core`) | PD / tiny radius |
| `medium` | Pulse laser core+halo | Default energy bolt |
| `faction_tint` | Team fringe on pulse/plasma halos | `e.team` palette multiply |

## Notes

Siege/rail/plasma/autocannon weapon-specific meshes remain; Elite bar groups them into small/medium/faction lanes for evidence. No Phase 1 downgrade — pulse path unchanged.