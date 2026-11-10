# FidelityFX Contrast Adaptive Sharpening

MIT. Copyright Advanced Micro Devices. Headers are the upstream algorithm from
[GPUOpen-Effects/FidelityFX-CAS](https://github.com/GPUOpen-Effects/FidelityFX-CAS)
(`ffx_a.h`, `ffx_cas.h`, version noted in `ffx_cas.h`). Do not rewrite `CasFilter`.

This page is WebGL2, not a compute shader. The build-map task **AQ-CAS** wires one
fullscreen pass on the 3D canvas, after the bloom composite in `src/render/bloom.js`,
and only when the render target is smaller than the canvas. The DOM HUD is not on
that canvas.

GPU setup from the header, adapted to a fragment sample:

```glsl
#define A_GPU 1
#define A_GLSL 1
```

Then the contents of `ffx_a.h`, then a `CasLoad` that samples the canvas texture at
an integer pixel (not `imageLoad`), then `CasInput` as a no-op, then `ffx_cas.h`.
Call `CasFilter` for sharpen-only unless the pass is also the upscale. Keep the
copyright notice with the shader.
