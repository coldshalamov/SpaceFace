# Jules task-bank implementation note

This branch implements the bank as a deterministic live-tree generator rather than freezing a 3 MB static JSON snapshot. `scripts/jules-dispatch.mjs` selects 200 eligible repository files in a stable root/path order and expands each through five bounded task facets, producing exactly 1,000 task IDs for the current tree.

That keeps the bank tied to current owners and avoids silently preserving stale file routes. `--list` writes out all 1,000 concrete task IDs, target files, collision domains, models, and titles for inspection or batch dispatch.
