# SG-02 Recovered Source Intake

## Overview
Recovered zip SHA256: `6D3FE3CFC805A6454459E220D24225BE2989C4B3DE3E572BD74EAA4456E474AF`
Upstream reference: `SpaceFace-SG02-recovered-source-partial.zip`

This recovery archive is not a merge-ready SG-02 handoff.

## Boundaries

### Accepted now
- Physics membrane (`src/core/physicsAuthority.js` and `scripts/check-physics-authority.mjs`)
- dynamic-owner lab boundary (`src/core/sg02DynamicBodyOwner.js` and `scripts/check-sg02-dynamic-body-owner.mjs`)

### Not accepted yet
- Unaudited kinematic translation paths
- Bypassing physics authority
