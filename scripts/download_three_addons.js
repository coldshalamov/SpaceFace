import fs from 'fs';
import path from 'path';
import https from 'https';

const filesToDownload = [
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/MaskPass.js',
  'examples/jsm/postprocessing/ClearMaskPass.js',
  'examples/jsm/postprocessing/CopyPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/LUTPass.js',
  'examples/jsm/postprocessing/SSAOPass.js',
  'examples/jsm/shaders/CopyShader.js',
  'examples/jsm/shaders/LuminosityHighPassShader.js',
  'examples/jsm/shaders/SSAOShader.js',
  'examples/jsm/shaders/OutputShader.js',
  'examples/jsm/shaders/LuminosityShader.js',
  'examples/jsm/objects/Lensflare.js',
  'examples/jsm/objects/LensflareElement.js'
];

const baseUrl = 'https://raw.githubusercontent.com/mrdoob/three.js/r160/';
const targetDirBase = path.resolve('vendor/addons');

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: Status ${res.statusCode}`));
        return;
      }
      const dir = path.dirname(destPath);
      fs.mkdirSync(dir, { recursive: true });
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function run() {
  const results = [];
  for (const file of filesToDownload) {
    const url = baseUrl + file;
    // Map examples/jsm/postprocessing/EffectComposer.js -> vendor/addons/postprocessing/EffectComposer.js
    const relativePath = file.replace('examples/jsm/', '');
    const destPath = path.join(targetDirBase, relativePath);
    console.log(`Downloading ${file}...`);
    try {
      await downloadFile(url, destPath);
      results.push({ file, success: true, dest: destPath });
      console.log(`Successfully downloaded and saved to ${destPath}`);
    } catch (err) {
      results.push({ file, success: false, error: err.message });
      console.error(`Error downloading ${file}: ${err.message}`);
    }
  }

  console.log('\n--- Summary ---');
  let successCount = 0;
  for (const res of results) {
    if (res.success) {
      successCount++;
      console.log(`[SUCCESS] ${res.file} -> ${res.dest}`);
    } else {
      console.log(`[FAILED]  ${res.file}: ${res.error}`);
    }
  }
  console.log(`\nDownloaded ${successCount} of ${filesToDownload.length} files.`);
}

run();
