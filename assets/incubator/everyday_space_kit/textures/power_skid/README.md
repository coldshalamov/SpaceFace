# Power skid panel textures

These 256 × 256 maps are downsampled from the repository's procedural Forge panel
set in `tools/blender/forge/textures/forge_panel_{albedo,normal,orm}.png`. The
original set is authored by `tools/blender/forge/forge_textures.py`; no external
or image-generated artwork is used. The maps are embedded in the skid source
GLB and compressed by the existing pack release builder.

Regenerate from the repository root with the installed `sharp` dependency:

```sh
node --input-type=module -e "import sharp from 'sharp'; for (const s of ['albedo','normal','orm']) await sharp('tools/blender/forge/textures/forge_panel_'+s+'.png').resize(256,256).png().toFile('assets/incubator/everyday_space_kit/textures/power_skid/forge_panel_'+s+'.png')"
```

SHA-256: albedo `2f71333f3ebc80179399dd80fcf83f2d8ba0dc3d465e5217fb7e3bf0a39d3ad2`;
normal `63b1c529a2aa695f9c33f674d743e2ada11ace82011269ec1101f40cf31899c9`;
ORM `4e00fc6d53ea53d3c5fc132c479c15551f363658d4a63baa93147e3125d79250`.
