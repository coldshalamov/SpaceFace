# Model allocation

The generated task IDs are deterministic and split 700/300 by ID range:

- `JULES-0001`–`JULES-0700`: Gemini 3.6 Flash by default.
- `JULES-0701`–`JULES-1000`: Gemini 3.1 Pro by default.

The file-root ordering deliberately places core/system/test/tooling work before later UI/render/audio/presentation/data surfaces, so the heavier model is biased toward work needing more synthesis and judgment. A local dispatcher may override the recommendation when a specific task proves unusually hard or mechanical.
