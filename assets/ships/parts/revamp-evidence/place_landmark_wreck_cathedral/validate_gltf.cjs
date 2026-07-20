#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const [, , validatorModule, inputPath, outputPath] = process.argv;
  if (!validatorModule || !inputPath || !outputPath) {
    throw new Error("usage: node validate_gltf.cjs <validator-module> <input.glb> <output.json>");
  }
  const validator = require(path.resolve(validatorModule));
  const bytes = new Uint8Array(fs.readFileSync(inputPath));
  const report = await validator.validateBytes(bytes, {
    uri: path.basename(inputPath),
    maxIssues: 10000,
    ignoredIssues: [],
    severityOverrides: {},
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const counts = report.issues?.numErrors ?? -1;
  process.stdout.write(`${JSON.stringify({ validatorVersion: report.validatorVersion, issues: report.issues })}\n`);
  if (counts !== 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
