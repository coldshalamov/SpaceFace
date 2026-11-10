import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import * as t from '@babel/types';

const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;

function sourceUrlPath(root, filePath) {
  const absoluteRoot = resolve(root);
  const absoluteFile = resolve(filePath);
  const rel = relative(absoluteRoot, absoluteFile);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || resolve(absoluteRoot, rel) !== absoluteFile) {
    throw new Error(`Dev worker source is outside the served project root: ${filePath}`);
  }
  return `/${rel.split(sep).join('/')}`;
}

function isImportMetaUrl(node) {
  if (!node || node.type !== 'MemberExpression') return false;
  const object = node.object;
  if (!object || object.type !== 'MetaProperty'
      || object.meta?.name !== 'import' || object.property?.name !== 'meta') return false;
  if (!node.computed) return node.property?.type === 'Identifier' && node.property.name === 'url';
  return node.property?.type === 'StringLiteral' && node.property.value === 'url';
}

function sourceUrlExpression(sourcePath, globalBinding) {
  const globalRef = () => t.identifier(globalBinding.name);
  const workerBase = t.logicalExpression(
    '&&',
    t.binaryExpression('===', t.unaryExpression('typeof', t.memberExpression(globalRef(), t.identifier('self'))), t.stringLiteral('object')),
    t.logicalExpression('&&',
      t.binaryExpression('!==', t.memberExpression(globalRef(), t.identifier('self')), t.nullLiteral()),
      t.memberExpression(t.memberExpression(globalRef(), t.identifier('self')), t.identifier('location')),
    ),
  );
  const workerUrl = t.memberExpression(
    t.newExpression(t.memberExpression(globalRef(), t.identifier('URL')), [
      t.stringLiteral(sourcePath),
      t.memberExpression(t.memberExpression(t.memberExpression(globalRef(), t.identifier('self')), t.identifier('location')), t.identifier('href')),
    ]),
    t.identifier('href'),
  );
  return t.conditionalExpression(workerBase, workerUrl, t.memberExpression(
    t.metaProperty(t.identifier('import'), t.identifier('meta')),
    t.identifier('url'),
  ));
}

/** Replace source-module import.meta.url with its same-origin URL in the raw dev tree. */
export function rewriteSourceModuleUrls(sourceText, filePath, root) {
  const sourcePath = sourceUrlPath(root, filePath);
  if (!sourceText.includes('import.meta')) return { contents: sourceText, changed: false, sourcePath };

  const ast = parse(sourceText, {
    sourceType: 'module',
    sourceFilename: filePath,
    plugins: ['importMeta', 'importAttributes'],
  });
  let changed = false;
  let globalBinding = null;
  traverse(ast, {
    Program(programPath) {
      globalBinding = programPath.scope.generateUidIdentifier('sfSourceGlobal');
      programPath.traverse({
        MemberExpression(path) {
          if (!isImportMetaUrl(path.node)) return;
          path.replaceWith(sourceUrlExpression(sourcePath, globalBinding));
          path.skip();
          changed = true;
        },
      });
      if (changed) {
        programPath.unshiftContainer('body', t.variableDeclaration('const', [
          t.variableDeclarator(t.identifier(globalBinding.name), t.identifier('globalThis')),
        ]));
      }
      programPath.stop();
    },
  });
  return {
    contents: changed ? generate(ast, { comments: true, compact: false }).code : sourceText,
    changed,
    sourcePath,
  };
}

/** esbuild onLoad transform and exact source-byte capture for the dev worker provider. */
function loaderForPath(filePath) {
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (['.js', '.mjs', '.cjs'].includes(extension)) return 'js';
  if (extension === '.json') return 'json';
  if (extension === '.css') return 'css';
  if (extension === '.txt') return 'text';
  if (extension === '.base64') return 'base64';
  if (extension === '.binary') return 'binary';
  if (extension === '.dataurl') return 'dataurl';
  return 'file';
}

export function createSourceModuleUrlRewritePlugin({ root, onLoadSource = null, onLoadInput = null } = {}) {
  if (!root) throw new TypeError('source URL rewriter requires the project root');
  return {
    name: 'spaceface-source-module-url',
    setup(build) {
      build.onLoad({ filter: /.*/ }, async (args) => {
        if (args.namespace !== 'file') return null;
        const absolutePath = resolve(root, args.path);
        const rel = relative(resolve(root), absolutePath);
        if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) return null;
        const sourceBytes = await readFile(absolutePath);
        if (typeof onLoadInput === 'function') onLoadInput(absolutePath, sourceBytes);
        if (loaderForPath(absolutePath) !== 'js') {
          return {
            contents: sourceBytes,
            loader: loaderForPath(absolutePath),
            resolveDir: dirname(absolutePath),
            watchFiles: [absolutePath],
          };
        }
        const sourceText = sourceBytes.toString('utf8');
        if (typeof onLoadSource === 'function') onLoadSource(absolutePath, sourceText);
        const rewritten = rewriteSourceModuleUrls(sourceText, absolutePath, root);
        return {
          contents: rewritten.contents,
          loader: 'js',
          resolveDir: dirname(absolutePath),
          watchFiles: [absolutePath],
        };
      });
    },
  };
}
