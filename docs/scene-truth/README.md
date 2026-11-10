# Scene Truth

Semantic 3D scene integrity for the shipping camera. The tool lives in
`tools/scene-truth/` and does not replace `scripts/check-visual-regression.mjs`.

```
node tools/scene-truth/cli.mjs
node --test tools/scene-truth/test/*.test.mjs
```

Captures are semantic projections of lab poses plus render-package metadata.
They are not GPU frames. `runtimeFps` is null. A renderer hook that would copy
object ids without an overlay is described in `tools/scene-truth/ADAPTER.md`
and is not applied.
