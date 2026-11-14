#!/usr/bin/env bash
# One lock hold: matched lamp A/B in a Swarm round-20 rock pool, then Helios.
tag=${1:-t3}
node scripts/fleet/looks/light-tune.mjs swarm .devshots/fleet/looks/light/$tag-r20 20 x --rock
node scripts/fleet/looks/light-tune.mjs helios .devshots/fleet/looks/light/$tag-helios helios_core x
