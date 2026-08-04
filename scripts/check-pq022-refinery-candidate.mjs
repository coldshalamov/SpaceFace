#!/usr/bin/env node

// Candidate-only admission for PQ-022.refinery-reauthor. This never publishes source/release
// artifacts or launches a runtime. It fails closed until the deterministic producer has supplied
// the candidate, Blender source, build report, validator reports, and their hash binding.
import { validateRefineryCandidate } from './lib/pq022RefineryCandidateValidation.mjs';

const bindingArg = process.argv.find((arg) => arg.startsWith('--binding='));
const result = validateRefineryCandidate({
  bindingPath: bindingArg ? bindingArg.slice('--binding='.length) : undefined,
});

console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
