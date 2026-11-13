#!/usr/bin/env bash
# One lock hold: Swarm round-20 and Helios, each with legacy emulation + spot-cost A/B.
# usage: node scripts/fleet/game-lock.mjs run -- bash scripts/fleet/looks/light-pair.sh <tag>
tag=${1:-run}
node scripts/fleet/looks/light-census.mjs swarm .devshots/fleet/looks/light/$tag-r20 20 --legacy --ab
node scripts/fleet/looks/light-census.mjs helios .devshots/fleet/looks/light/$tag-helios helios_core --legacy --ab
