#!/usr/bin/env node

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const sourcePath = 'scripts/remove-overheating-systems.mjs';
const generatedPath = 'scripts/.generated-remove-overheating-systems.mjs';
let source = readFileSync(sourcePath, 'utf8');
const before = `        || n.FunctionDeclaration.check(parent)\n        || n.ObjectProperty?.check?.(parent)\n        || n.Property.check(parent)\n        || (n.MemberExpression.check(parent) && parent.property === node && !parent.computed)\n      ) return false;`;
const after = `        || n.FunctionDeclaration.check(parent)\n        || n.FunctionExpression?.check?.(parent)\n        || n.ArrowFunctionExpression?.check?.(parent)\n        || n.ObjectMethod?.check?.(parent)\n        || n.ClassMethod?.check?.(parent)\n        || n.CatchClause?.check?.(parent)\n        || n.RestElement?.check?.(parent)\n        || n.AssignmentPattern?.check?.(parent)\n        || n.LabeledStatement?.check?.(parent)\n        || n.BreakStatement?.check?.(parent)\n        || n.ContinueStatement?.check?.(parent)\n        || n.ObjectProperty?.check?.(parent)\n        || n.Property.check(parent)\n        || (n.MemberExpression.check(parent) && parent.property === node && !parent.computed)\n      ) return false;`;
if (!source.includes(before)) throw new Error('binding-protection marker missing from overheating codemod');
source = source.replace(before, after);
writeFileSync(generatedPath, source);
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  rmSync(generatedPath, { force: true });
}
