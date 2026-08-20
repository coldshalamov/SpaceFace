# PQ-129.08 — Upload-after-present rejection

Status: done by measured invalidation; no production mutation.

PQ-129.02's result-bearing Intel D3D11 flight classified 269 hitches at 97.8% named coverage.
Upload owned zero hitches. Compile, compose, admission, autosave, and VFX were also zero; the named
poles were simulation, bloom, and external scheduling, with a small residual-present tail.

The shader census recorded texture and buffer counters as context, but counter volume is not hitch
ownership. Moving one texture or buffer upload after present without a named upload brick would add
scheduling complexity around a non-pole and could merely delay readiness.

No changes were made to `renderer.js`, `precompile.js`, texture admission, mip generation, buffer
cadence, or default visual quality. A later leaf may be admitted only when a bounded headed window
attributes a hitch to a specific first-use upload owner.

Routing consequence: `PQ-129.09` remains dependent on the now-complete contact-warm disposition.
The next implementation campaign should promote the already measured main HDR scene
render/presentation owner rather than continue speculative Wave B work.
