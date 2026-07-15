# Helios Hub V8 — One-Command Promotion Path

**Status:** ISOLATED CANDIDATE — not ACCEPTED, not live-wired  
**Packet:** M4-HELIOS-V8-NEW-FOUNDATION-GROK-001  
**Lane:** `assets/ships/m4_helios_hub_v8/**`

## Classification

- **CANDIDATE** for independent taste-review + controller promotion decision
- Does **not** self-mark ACCEPTED
- Live release tree intentionally untouched

## Map (candidate → live id)

| Candidate | Live promote target |
|---|---|
| helios_hub_station | place_station_trade_hub |
| helios_gate | place_gate_jump_ring |
| helios_rock_a | place_asteroid_rock_a |
| helios_rock_b | place_asteroid_rock_b |
| helios_rock_c | place_asteroid_rock_c |

## After independent taste ACCEPTED only

```powershell
# 1) Hold graphics lock
# 2) Copy release candidates into authoring source places (transactional):
$ids = @(
  @{c='helios_hub_station'; l='place_station_trade_hub'},
  @{c='helios_gate'; l='place_gate_jump_ring'},
  @{c='helios_rock_a'; l='place_asteroid_rock_a'},
  @{c='helios_rock_b'; l='place_asteroid_rock_b'},
  @{c='helios_rock_c'; l='place_asteroid_rock_c'}
)
foreach ($x in $ids) {
  Copy-Item "assets/ships/m4_helios_hub_v8/source/places/$($x.c).glb" "assets/ships/parts/places/$($x.l).glb" -Force
}
# 3) Rebuild release:
npm run build:sg04:release-assets
# 4) Validate:
npm run check:asset-reachability
npm run check:assets:live
npm run check:asset-status
npm run check:visual-stability
```

Do **not** promote without controller decision.
