# Integration checklist

- Run `node scripts/jules-dispatch.mjs --validate`.
- Run `node --test test/jules-task-bank.test.mjs`.
- Render `JULES-0001` and `JULES-1000`.
- Run `--list` and confirm 1,000 rows.
- Add the routing snippet from `README_CANONICAL_SNIPPET.md` to `CANONICAL_BUILD_MAP.md` during integration if it is not already present on current master.
- Keep this bank outside PQ status and INFERENCE production accounting.
