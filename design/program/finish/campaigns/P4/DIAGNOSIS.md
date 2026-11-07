# P4 — fits you can see — diagnosis

**2026-11-06, Lane 4 (SHIP).**

## 1. The player-visible problem

The report card's line: "fits barely show on the hull; paint is unearned". A player can spend
40 000 credits on a fit and the ship looks the same. Nothing on the hull says what he built.

## 2. Measured cause chain

- **[V] The hull does change shape, but only by tier.** `src/data/ships.js` `visuals.tiers[]`
  selects a geometry row by the **sum of fitted module tiers** (`minTier` rows at 0 / 7–15). So a
  full Mk III fit looks different from a bare hull, but *which* parts are fitted changes nothing —
  two entirely different Mk II fits are the same silhouette.
- **[V] Hardpoints exist and carry names.** The hull GLBs expose `SOCKET_Weapon_Front`,
  `SOCKET_Engine_Main`, `SOCKET_Trail_Main` and friends; `src/render/partsLibrary.js` already reads
  them (`hullLocalPositionForSocket`, `modelTruthMountFractions(shipDef.id, 'SOCKET_Weapon_')`).
  The sockets are wired; **no part is ever mounted on one**.
- **[V] The Shipworks already ghosts the hull** on hover (`previewShip(defId, afterFittings, …)`),
  which is the exact moment a mounted part would be legible — and it only re-runs the tier rule.
- **[V] Paint is a shop catalogue, not a reward.** `src/data/shipPaints.js` holds 17 hull paints and
  12 accents; the paint rack sells all of them from the first dock, and no save field gates them.

## 3. The architecture question

Not a bug: the socket pipeline is sound and the appearance model (`src/core/shipAppearance.js`) is
the live owner. The missing piece is a **part → visual** table. Every other lane's constraint is
that `src/render/partsLibrary.js` is being rewritten by the performance work in flight (see
`NOW.md`: "partsLibrary prewarm/admission/controller"), so this campaign must not edit it.

## 4. The road

1. `src/ui/ship/partVisuals.js` — a pure table: part id → `{ mount, socket, scale, tint, glow }`
   and a resolver `partVisualsForFittings(shipId, fittings)` that returns what to mount and where,
   reading the hull's real socket fractions from `data/modelTruth.js`. It draws nothing; it is the
   contract the render lane mounts.
2. **Earned paint** — a gate on the existing paint ids keyed to pilot milestones (P3). This needs
   P3 approved first (the milestones are pilot levels), so it is sequenced after P3.
3. Lane 6 builds the meshes through the Forge route (`docs/visual-assets/README.md`); this campaign
   supplies the table and the socket resolver.

## 5. Honest scope note

This session ships **(1) the table and resolver** and **(2) the diagnosis**. It does **not** edit
`src/render/partsLibrary.js` (perf in flight) and therefore does **not** meet P4's "Verify"
(lineup capture where a reviewer can tell five fits apart) — that needs the mount wired in the
render lane plus the meshes from Lane 6. That is stated as unfinished in `STATUS.md`, not claimed.
