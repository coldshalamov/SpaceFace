#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const evidence = __dirname;
const root = path.resolve(evidence, "../../../../..");
const output = path.join(evidence, "reports", "sha256-manifest.json");

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(candidate) : [candidate];
  });
}

function hashFile(filename) {
  const bytes = fs.readFileSync(filename);
  return {
    path: path.relative(root, filename).replaceAll(path.sep, "/"),
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

const required = [
  path.join(root, "assets", "ships", "parts", "blender", "place_landmark_wreck_cathedral.blend"),
  path.join(root, "assets", "ships", "parts", "places", "place_landmark_wreck_cathedral.glb"),
];
const generated = ["textures", "captures", "turntable"].flatMap((name) => walk(path.join(evidence, name)));
const files = [...new Set([...required, ...generated])].filter(fs.existsSync).sort();
const manifest = {
  schema: "spaceface.sha256Manifest.v1",
  assetId: "place_landmark_wreck_cathedral",
  algorithm: "SHA-256",
  coverage: "BLEND, source GLB, all authored PBR textures, all captures, and turntable",
  files: files.map(hashFile),
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ output: path.relative(root, output), count: manifest.files.length })}\n`);
