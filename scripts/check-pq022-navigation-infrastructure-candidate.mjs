#!/usr/bin/env node

// Candidate-only admission for PQ-022.billboard-buoy-reauthor. This command is read-only: it
// validates the isolated two-asset producer/evidence bundle and never publishes live artifacts.
import { validateNavigationInfrastructureCandidate } from './lib/pq022NavigationInfrastructureCandidateValidation.mjs';

const bindingArg = process.argv.find((arg) => arg.startsWith('--binding='));
const result = validateNavigationInfrastructureCandidate({
  bindingPath: bindingArg ? bindingArg.slice('--binding='.length) : undefined,
});

console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
