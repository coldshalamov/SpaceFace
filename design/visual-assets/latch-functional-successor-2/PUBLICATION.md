# Latch Nine successor 2: editable, unpromoted review checkpoint

This directory preserves the exact frozen reconstruction, including editable packed Blender source, builders, exports, selected package and registry rows, tests, original failures and independently reviewed corrections. It does not install these postimages into the game. Newer low-poly art studies are separate and are not substituted here.

Start with REVIEW.md, ACCEPTED_CORRECTION.txt and independent-review/correction-review/REVIEW.md. The acceptance note supersedes the older pending-re-review sentence retained in REVIEW.md. The correction review passed 17 adverse and 126 unchanged regression cases. Full ambient piloted flight, current integrated gameplay, game-camera rendering, GPU budget and artistic acceptance remain open. Default promotion remains false.

Current source triangles are 24,040 / 9,606 / 3,414 against proposed 14,000 / 5,600 / 2,500 targets. CPU composition reports 25 visible mesh candidates; the near-10 GPU target is unverified and unmet. These are scoped historical measurements, not new measurements on the current PR runtime.

SOURCE_MAP.json identifies the 57 selected source postimages and their original base identities. MANIFEST.json preserves all 164 original packet files. Postimages and selected registry rows are review inputs; integration must apply owned hunks onto current source and regenerate aggregate registries canonically. Never replace current runtime files wholesale or push the private local preservation ancestry.

Historical logs and test harnesses retain original workspace paths. These are provenance, not portable installation instructions. The packed editable model and relative postimages remain inspectable; recreation requires resolving those paths and the named dependency cohort. Failed reviews and intermediate geometry remain deliberately visible alongside the correction.

## Stage 1: our attempt

Intent: preserve a usable editable Latch checkpoint and its lifecycle fixes so another agent can inspect, reproduce and improve the same work. The implementation uses existing actor/native ownership, docking authority and pooled presentation instead of a parallel flight owner. The source reconstruction and why each change was made are in [REVIEW.md](REVIEW.md); the original failure analysis is in [the first independent review](independent-review/REVIEW.md). The two corrections and their scoped results are in [the correction review](independent-review/correction-review/REVIEW.md) and [acceptance note](ACCEPTED_CORRECTION.txt). Exact source and evidence identities are in the frozen manifests. The limits above remain open.

## Stage 2: collaborating agent review and fixes

Pending the next agent's PR review. Append findings, reproduction results, proposed fixes and resulting commit links here or link them from the shared execution log. Preserve the original attempt and failed evidence; add corrective layers rather than overwriting history. Agree on current path ownership before runtime composition because PR221 is shared. No review response or completed end-to-end acceptance is implied by this placeholder.

Inventory exception: the original outer MANIFEST.json excludes manifest filenames, so the nested correction-review/MANIFEST.json is preserved separately and unchanged (SHA-256 b9216e3c8d6d5d3b1da5ea00a4db6c2dfadc323aa43eb458cfe027663e699e0a).
