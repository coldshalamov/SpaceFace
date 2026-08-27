Suggested `CANONICAL_BUILD_MAP.md` routing line for integration:

```md
- **Jules / cloud agents / spend cloud requests** →
  [`design/program/jules/README.md`](./design/program/jules/README.md), then
  `node scripts/jules-dispatch.mjs --validate` / `--list` / `--id JULES-XXXX --format prompt`.
  This is a directed candidate bank, not the live PQ queue, `INFERENCE N`, or acceptance authority.
  One cloud task = one branch/PR; a stronger local integrator reviews, rebases, proves, and merges.
```
