# CLAIM — hitch-opening-drain

Claimed by remote SpaceFace performance machine (Grok Bot VM / Code Work).

- Job: `hitch-opening-drain` (soft-GPU: skip opening.planWait + opening.drainWait polls; slice residency so prepareOpeningGpuResources does not serialize ~2.5 s of concurrent cook)
- Kind: patch
- Claimed: 2026-09-22 22:09 EDT (America/New_York)
- Scratch: `vm-work/hitch-opening-drain` (local only; never pushed)
- Evidence: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Depends: none on bare master (planWait skip was a prior miss that only moved cost; this package addresses drain/residency)

Do not start a second copy.
