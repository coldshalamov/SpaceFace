#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import recast from 'recast';
import * as babelParser from '@babel/parser';

const { namedTypes: n, builders: b, visit } = recast.types;
const AUDIT_PATH = 'design/program/branch-consolidation/overheating-reference-audit.json';
const OUT_DIR = 'design/program/branch-consolidation';
const SOURCE_CONTEXT = /(?:^|\/)(?:weapon|weapons|mining|drill|hud|targetPanel|audio|equipment|module)[^/]*\.js$/i;
const OWNED_NAME = /(?:overheat|overheated|weaponHeat|weapon_?heat|heatPerShot|heatCapacity|heatLimit|heatMax|maxHeat|coolRate|venting|vented|ventCooldown|thermalSink|miningHeat|beamHeat|drillHeat)/i;
const CONTEXT_GENERIC = /^(?:heat|heatPct|heatRatio|heatFraction|heatBar|heatEl|heatState)$/i;
const USER_COPY = /overheat|overheated|vent(?:ing|ed)?|thermal sink|weapon heat|mining beam heat|drill heat/i;
const ENVIRONMENTAL = /heatZone|reentry|re-entry|atmospher|thermalDamage|heatHaze|heatSignature|temperature|exhaust|enginePlume/i;
const PURE_FEATURE_FILE = /(?:overheat|weapon[-_.]?heat|thermal[-_.]?sink|vent[-_.]?weapon)/i;

function parse(source) {
  return recast.parse(source, {
    parser: {
      parse(text) {
        return babelParser.parse(text, {
          sourceType: 'module',
          allowAwaitOutsideFunction: true,
          allowReturnOutsideFunction: true,
          plugins: [
            'jsx', 'classProperties', 'classPrivateProperties', 'classPrivateMethods',
            'dynamicImport', 'importMeta', 'optionalChaining', 'nullishCoalescingOperator',
            'topLevelAwait', 'objectRestSpread', 'numericSeparator', 'logicalAssignment',
          ],
        });
      },
    },
  });
}

function keyName(node) {
  if (!node) return '';
  if (n.Identifier.check(node)) return node.name;
  if (n.StringLiteral?.check?.(node) || n.Literal.check(node)) return String(node.value ?? '');
  return '';
}

function owned(name, path) {
  const value = String(name || '');
  if (!value || ENVIRONMENTAL.test(value)) return false;
  if (OWNED_NAME.test(value)) return true;
  return SOURCE_CONTEXT.test(path) && CONTEXT_GENERIC.test(value);
}

function ownedMember(node, path) {
  if (!n.MemberExpression.check(node) && !n.OptionalMemberExpression?.check?.(node)) return false;
  const name = node.computed && (n.StringLiteral?.check?.(node.property) || n.Literal.check(node.property))
    ? String(node.property.value)
    : keyName(node.property);
  return owned(name, path);
}

function identifierName(node) {
  if (n.Identifier.check(node)) return node.name;
  if (ownedMember(node, '')) return keyName(node.property);
  return '';
}

function constantValueForName(name) {
  const lower = String(name || '').toLowerCase();
  if (/max|capacity|limit/.test(lower)) return Infinity;
  if (/overheat|venting|vented/.test(lower)) return false;
  return 0;
}

function literalForValue(value) {
  if (value === Infinity) return b.memberExpression(b.identifier('Number'), b.identifier('POSITIVE_INFINITY'));
  return b.literal(value);
}

function literalValue(node) {
  if (n.BooleanLiteral?.check?.(node) || n.NumericLiteral?.check?.(node) || n.Literal.check(node)) return node.value;
  if (
    n.MemberExpression.check(node)
    && !node.computed
    && n.Identifier.check(node.object)
    && node.object.name === 'Number'
    && n.Identifier.check(node.property)
    && node.property.name === 'POSITIVE_INFINITY'
  ) return Infinity;
  return undefined;
}

function simplify(node, path) {
  if (!node) return node;
  if (n.Identifier.check(node) && owned(node.name, path)) return literalForValue(constantValueForName(node.name));
  if (ownedMember(node, path)) return literalForValue(constantValueForName(keyName(node.property)));
  if (n.UnaryExpression.check(node) && node.operator === '!') {
    node.argument = simplify(node.argument, path);
    const value = literalValue(node.argument);
    return value !== undefined ? b.literal(!value) : node;
  }
  if (n.BinaryExpression.check(node)) {
    node.left = simplify(node.left, path);
    node.right = simplify(node.right, path);
    const left = literalValue(node.left);
    const right = literalValue(node.right);
    if (left !== undefined && right !== undefined) {
      let value;
      switch (node.operator) {
        case '<': value = left < right; break;
        case '<=': value = left <= right; break;
        case '>': value = left > right; break;
        case '>=': value = left >= right; break;
        case '==': value = left == right; break; // intentional codemod evaluation
        case '===': value = left === right; break;
        case '!=': value = left != right; break; // intentional codemod evaluation
        case '!==': value = left !== right; break;
        default: return node;
      }
      return b.literal(value);
    }
    return node;
  }
  if (n.LogicalExpression.check(node)) {
    node.left = simplify(node.left, path);
    node.right = simplify(node.right, path);
    const left = literalValue(node.left);
    if (node.operator === '&&') {
      if (left === false || left === 0) return b.literal(false);
      if (left === true) return node.right;
    } else if (node.operator === '||') {
      if (left === true || left === Infinity) return b.literal(true);
      if (left === false || left === 0) return node.right;
    }
    return node;
  }
  return node;
}

function pruneOrReplace(path, replacement = b.literal(0)) {
  const parent = path.parent?.node;
  if (parent && n.ExpressionStatement.check(parent)) path.parent.prune();
  else path.replace(replacement);
}

function transformFile(file) {
  const source = readFileSync(file, 'utf8');
  let ast;
  try { ast = parse(source); }
  catch (error) { return { file, changed: false, error: `parse: ${error.message}` }; }

  const removed = [];
  visit(ast, {
    visitImportDeclaration(path) {
      const node = path.node;
      const sourceValue = String(node.source?.value || '');
      if (/weaponHeat|overheat|thermalSink/i.test(sourceValue)) {
        removed.push(`import:${sourceValue}`);
        path.prune();
        return false;
      }
      if (Array.isArray(node.specifiers)) {
        node.specifiers = node.specifiers.filter((specifier) => {
          const name = specifier.local?.name || specifier.imported?.name || '';
          const remove = owned(name, file);
          if (remove) removed.push(`specifier:${name}`);
          return !remove;
        });
        if (!node.specifiers.length && sourceValue.startsWith('.')) {
          path.prune();
          return false;
        }
      }
      this.traverse(path);
    },

    visitFunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (owned(name, file)) {
        removed.push(`function:${name}`);
        path.prune();
        return false;
      }
      this.traverse(path);
    },

    visitVariableDeclaration(path) {
      const node = path.node;
      node.declarations = node.declarations.filter((declaration) => {
        const name = declaration.id?.name;
        const remove = owned(name, file);
        if (remove) removed.push(`variable:${name}`);
        return !remove;
      });
      if (!node.declarations.length) {
        path.prune();
        return false;
      }
      this.traverse(path);
    },

    visitObjectProperty(path) {
      const name = keyName(path.node.key);
      const valueText = recast.print(path.node.value).code;
      if (owned(name, file) || (USER_COPY.test(valueText) && !ENVIRONMENTAL.test(valueText))) {
        removed.push(`property:${name || 'copy'}`);
        path.prune();
        return false;
      }
      this.traverse(path);
    },

    visitProperty(path) {
      const name = keyName(path.node.key);
      const valueText = recast.print(path.node.value).code;
      if (owned(name, file) || (USER_COPY.test(valueText) && !ENVIRONMENTAL.test(valueText))) {
        removed.push(`property:${name || 'copy'}`);
        path.prune();
        return false;
      }
      this.traverse(path);
    },

    visitObjectMethod(path) {
      const name = keyName(path.node.key);
      if (owned(name, file)) {
        removed.push(`method:${name}`);
        path.prune();
        return false;
      }
      this.traverse(path);
    },

    visitAssignmentExpression(path) {
      if (ownedMember(path.node.left, file) || (n.Identifier.check(path.node.left) && owned(path.node.left.name, file))) {
        removed.push(`assignment:${identifierName(path.node.left) || keyName(path.node.left.property)}`);
        pruneOrReplace(path, simplify(path.node.right, file));
        return false;
      }
      this.traverse(path);
    },

    visitUpdateExpression(path) {
      if (ownedMember(path.node.argument, file) || (n.Identifier.check(path.node.argument) && owned(path.node.argument.name, file))) {
        removed.push('update');
        pruneOrReplace(path);
        return false;
      }
      this.traverse(path);
    },

    visitCallExpression(path) {
      const callee = path.node.callee;
      const name = n.Identifier.check(callee)
        ? callee.name
        : (n.MemberExpression.check(callee) ? keyName(callee.property) : '');
      if (owned(name, file)) {
        removed.push(`call:${name}`);
        pruneOrReplace(path, b.literal(false));
        return false;
      }
      this.traverse(path);
    },

    visitIfStatement(path) {
      path.node.test = simplify(path.node.test, file);
      const value = literalValue(path.node.test);
      if (value === true) {
        removed.push('if:true');
        path.replace(path.node.consequent);
        return false;
      }
      if (value === false) {
        removed.push('if:false');
        if (path.node.alternate) path.replace(path.node.alternate);
        else path.prune();
        return false;
      }
      this.traverse(path);
    },

    visitConditionalExpression(path) {
      path.node.test = simplify(path.node.test, file);
      const value = literalValue(path.node.test);
      if (value === true) { path.replace(path.node.consequent); return false; }
      if (value === false) { path.replace(path.node.alternate); return false; }
      this.traverse(path);
    },

    visitMemberExpression(path) {
      if (ownedMember(path.node, file)) {
        const parent = path.parent?.node;
        if (n.AssignmentExpression.check(parent) && parent.left === path.node) return false;
        if (n.UpdateExpression.check(parent)) return false;
        const name = keyName(path.node.property);
        removed.push(`read:${name}`);
        path.replace(literalForValue(constantValueForName(name)));
        return false;
      }
      this.traverse(path);
    },

    visitIdentifier(path) {
      const node = path.node;
      if (!owned(node.name, file)) return this.traverse(path);
      const parent = path.parent?.node;
      if (
        n.ImportSpecifier?.check?.(parent)
        || n.ImportDefaultSpecifier?.check?.(parent)
        || n.VariableDeclarator.check(parent)
        || n.FunctionDeclaration.check(parent)
        || n.ObjectProperty?.check?.(parent)
        || n.Property.check(parent)
        || (n.MemberExpression.check(parent) && parent.property === node && !parent.computed)
      ) return false;
      removed.push(`identifier:${node.name}`);
      path.replace(literalForValue(constantValueForName(node.name)));
      return false;
    },
  });

  // Drop comments that teach or advertise a removed mechanic, while preserving environmental heat.
  visit(ast, {
    visitNode(path) {
      const comments = path.node.comments;
      if (Array.isArray(comments)) {
        path.node.comments = comments.filter((comment) => {
          const text = String(comment.value || '');
          return !USER_COPY.test(text) || ENVIRONMENTAL.test(text);
        });
      }
      this.traverse(path);
    },
  });

  const output = recast.print(ast, { quote: 'single', trailingComma: false }).code;
  if (output === source) return { file, changed: false, removed };
  writeFileSync(file, output);
  return { file, changed: true, removed };
}

if (!existsSync(AUDIT_PATH)) throw new Error(`${AUDIT_PATH} missing`);
const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf8'));
const targetFiles = audit.files
  .filter((row) => row.removeCandidates > 0 && /^src\/.*\.js$/i.test(row.path))
  .map((row) => row.path);

const deleted = [];
const transformed = [];
const errors = [];
for (const file of targetFiles) {
  if (!existsSync(file)) continue;
  if (PURE_FEATURE_FILE.test(basename(file)) && !ENVIRONMENTAL.test(file)) {
    rmSync(file, { force: true });
    deleted.push(file);
    continue;
  }
  const result = transformFile(file);
  transformed.push(result);
  if (result.error) errors.push(result);
}

// Remove tests and checks whose sole contract is the deleted mechanic. Mixed gameplay tests are left
// for AST simplification or manual adaptation instead of being erased wholesale.
for (const row of audit.files) {
  if (!/^(?:test|scripts)\//.test(row.path) || !existsSync(row.path)) continue;
  if (PURE_FEATURE_FILE.test(basename(row.path)) && row.keepEnvironmental === 0) {
    rmSync(row.path, { force: true });
    deleted.push(row.path);
  }
}

// Remove package scripts that point directly at deleted checks.
if (existsSync('package.json')) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const deletedNames = new Set(deleted.map((path) => path.replaceAll('\\', '/')));
  for (const [name, command] of Object.entries(pkg.scripts || {})) {
    if ([...deletedNames].some((path) => String(command).includes(path))) delete pkg.scripts[name];
  }
  writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
}

mkdirSync(OUT_DIR, { recursive: true });
const report = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  transformed: transformed.filter((row) => row.changed),
  unchanged: transformed.filter((row) => !row.changed && !row.error),
  deleted,
  errors,
};
writeFileSync(`${OUT_DIR}/overheating-excision.json`, `${JSON.stringify(report, null, 2)}\n`);

if (errors.length) throw new Error(`overheating codemod could not parse ${errors.length} file(s)`);
console.log(JSON.stringify({ transformed: report.transformed.length, deleted: deleted.length }, null, 2));
