#!/usr/bin/env bash
# One lock hold: lamp geometry proof first (short), then the robust feature-cost table.
node scripts/fleet/looks/lamp-geometry.mjs .devshots/fleet/looks/light/geo 20
node scripts/fleet/looks/feature-cost.mjs .devshots/fleet/looks/featurecost/run2.json 20 5
