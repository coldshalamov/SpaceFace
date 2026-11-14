// Original Pelican gameplay geometry is authoring input, not a live-file dependency.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const contract = JSON.parse(await fs.readFile(new URL('./protected-nodes.json', import.meta.url)));
const arrays = { Float32Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array };
const paths = process.argv.slice(2);
const provenance = JSON.parse(await fs.readFile(new URL('./provenance.json', import.meta.url)));
for (const input of provenance.inputs) {
  const bytes = await fs.readFile(new URL(input.relativeUrl, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), input.sha256,
    `Stale Pelican reviewed topology: ${input.relativeUrl}. Follow source_assets/pelican/README.md before rebuilding.`);
}
if (paths.length === 1 && paths[0] === '--check-inputs') process.exit(0);
assert.equal(paths.length, 3, 'Pelican export requires all three ordered LODs');
const counts = [];
for (const [lod, file] of paths.entries()) {
  const document = await io.read(file);
  const nodes = document.getRoot().listNodes();
  const buffer = document.getRoot().listBuffers()[0];
  const accessor = (data) => document.createAccessor(data.name).setType(data.type)
    .setNormalized(data.normalized).setArray(new arrays[data.arrayType](data.values)).setBuffer(buffer);
  for (const source of contract.lods[lod].nodes) {
    const node = nodes.find((item) => item.getName() === source.name);
    assert(node, `Missing protected Pelican node: ${source.name}`);
    assert.deepEqual(node.getExtras(), source.extras, `Changed metadata: ${source.name}`);
    if (!source.mesh) {
      assert.equal(node.getMesh(), null, `Unexpected mesh: ${source.name}`);
      assert.deepEqual(node.getMatrix(), source.matrix, `Changed socket/motion transform: ${source.name}`);
      continue;
    }
    node.setMatrix(source.matrix);
    const old = node.getMesh();
    assert(old, `Missing protected mesh: ${source.name}`);
    const mesh = document.createMesh(source.mesh.name);
    for (const primitive of source.mesh.primitives) {
      const copy = document.createPrimitive().setMode(primitive.mode);
      if (primitive.indices) copy.setIndices(accessor(primitive.indices));
      for (const [semantic, data] of Object.entries(primitive.attributes)) copy.setAttribute(semantic, accessor(data));
      if (primitive.material) {
        const material = document.getRoot().listMaterials().find((item) => item.getName() === primitive.material);
        assert(material, `Missing protected material: ${primitive.material}`);
        copy.setMaterial(material);
      }
      mesh.addPrimitive(copy);
    }
    node.setMesh(mesh);
    old.dispose();
  }
  if (lod > 0) {
    const pin = await io.read(fileURLToPath(new URL(`./reviewed-lod${lod}.glb`, import.meta.url)));
    for (const source of pin.getRoot().listNodes()) {
      if (!source.getMesh()) continue;
      const target = nodes.find((node) => node.getName() === source.getName());
      assert(target?.getMesh(), `Missing reviewed tier mesh: ${source.getName()}`);
      const old = target.getMesh(), mesh = document.createMesh(old.getName());
      assert.equal(old.listPrimitives().length, source.getMesh().listPrimitives().length);
      const clone = (data) => document.createAccessor(data.getName()).setType(data.getType())
        .setNormalized(data.getNormalized()).setArray(data.getArray().slice()).setBuffer(buffer);
      for (const [index, primitive] of source.getMesh().listPrimitives().entries()) {
        const copy = document.createPrimitive().setMode(primitive.getMode())
          .setMaterial(old.listPrimitives()[index].getMaterial());
        if (primitive.getIndices()) copy.setIndices(clone(primitive.getIndices()));
        for (const semantic of primitive.listSemantics()) copy.setAttribute(semantic, clone(primitive.getAttribute(semantic)));
        mesh.addPrimitive(copy);
      }
      target.setMesh(mesh);
      old.dispose();
    }
  }
  for (const data of document.getRoot().listAccessors()) {
    if (data.listParents().every((parent) => parent === document.getRoot())) data.dispose();
  }
  await fs.writeFile(file, await io.writeBinary(document));
  counts.push(nodes.filter((node) => node.getMesh() && !node.getExtras().nonRender)
    .reduce((total, node) => total + node.getMesh().listPrimitives()
      .reduce((sum, primitive) => sum + primitive.getIndices().getCount() / 3, 0), 0));
}
console.log(JSON.stringify(counts));
