# CLAIM — stunt-flight-history-quiet-skip

Quiet `registry.step` → `StuntFlightObserver.update` residual after #49+#40:
nearby-body history (spatialDynamics walk + alloc + push/shift) still ran every
tick while tracks were empty. History only serves needle-gap detection, which
needs open tracks.

Production now skips history while `tracks.size === 0` and the indexed
projectile lane is empty; odd quiet ticks also skip `bodyLife`. Active tracks
or live projectiles keep every-tick recording.

Scratch: `vm-work/hillclimb-20260924h`
Profile cite: `settled-45s-stacked-20260924ac`; `update` @ stuntFlightEvidence
under `registry.step` (~52 self samples pre-cut).
