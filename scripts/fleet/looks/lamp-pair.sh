#!/usr/bin/env bash
# One lock hold: intensity + beam sweep in Swarm round 20, Swarm round 1, and Helios with a hauler parked ahead.
tag=${1:-g3}
node scripts/fleet/looks/lamp-geometry.mjs .devshots/fleet/looks/light/$tag-r20 swarm 20
node scripts/fleet/looks/lamp-geometry.mjs .devshots/fleet/looks/light/$tag-r1 swarm 1
node scripts/fleet/looks/lamp-geometry.mjs .devshots/fleet/looks/light/$tag-helios helios
