# src/characters/

Pure rules for Bracket, Ravel, Rubric, Ruckus, Solstice, and Red Kite.

- No state, bus, DOM, or `Math.random`. Rubric text may use `hash32`.
- The matching `systems/*.js` file is the sim adapter. Data lives in `src/data/<name>.js`.
- Return forces, scores, or booleans. Do not integrate positions; Rapier does that.
- Gate crossings must use swept tests. Occupancy alone does not score.
