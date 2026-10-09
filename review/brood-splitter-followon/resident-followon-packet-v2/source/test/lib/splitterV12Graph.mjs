import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** The real Three GLTFLoader decodes vertices, hierarchy, TRS and material primitives.
 * Texture payloads are source-hashed CPU handles: this proof deliberately does not claim
 * image transcoding, shader readiness or a GPU draw. In particular, multi-primitive meshes
 * retain GLTFLoader's actual extra Group/Mesh layer and unique-name allocation. */
export async function splitterSourceGraph(file) {
  const bytes = readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const binOffset = 20 + jsonLength + 8;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // Override only texture transport/transcoding, including BasisU release images. All graph,
  // accessor, primitive, material, extension and meshopt decoding stays in the real loader.
  loader.register(parser => ({
    name: 'KHR_texture_basisu',
    loadTexture(index) {
      const def = parser.json.textures[index];
      const imageIndex = def.extensions?.KHR_texture_basisu?.source ?? def.source;
      const image = parser.json.images[imageIndex];
      if (image?.bufferView == null) throw new Error('source proof requires an embedded image');
      const view = parser.json.bufferViews[image.bufferView];
      const encoded = bytes.subarray(binOffset + (view.byteOffset || 0), binOffset + (view.byteOffset || 0) + view.byteLength);
      const texture = new THREE.Texture();
      texture.name = image.name || `source-image-${imageIndex}`;
      texture.flipY = false;
      texture.userData = { sourceImageSha256: sha(encoded), sourceImageBytes: encoded.length,
        sourceImageMimeType: image.mimeType, cpuOnlyEncodedImage: true };
      return Promise.resolve(texture);
    },
  }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  return { scene: gltf.scene, asset: gltf.asset, parser: gltf.parser,
    sha256: sha(bytes), bytes: bytes.length, textureMode: 'encoded-payload-hash-only' };
}
