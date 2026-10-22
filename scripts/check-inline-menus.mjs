import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export function findNestedMenuDialogs(source, file = 'page.tsx') {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];
  function walk(node, insideMenu = false) {
    const tag = ts.isJsxElement(node)
      ? node.openingElement.tagName.getText(tree)
      : ts.isJsxSelfClosingElement(node)
        ? node.tagName.getText(tree)
        : '';
    if (insideMenu && (tag.endsWith('Dialog') || tag === 'DocumentShareButton')) {
      const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
      violations.push(`${file}:${line + 1}: render ${tag} outside menu content.`);
    }
    ts.forEachChild(node, (child) => walk(child, insideMenu || tag === 'DropdownMenuContent'));
  }
  walk(tree);
  return violations;
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return ['node_modules', '.scratch', 'build', '.git'].includes(entry.name) ? [] : files(path);
    }
    return path.endsWith('.tsx') ? [path] : [];
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const paths = ['apps/remix/app', 'packages/ui'].flatMap((path) => files(resolve(root, path)));
  const violations = paths.flatMap((path) => findNestedMenuDialogs(readFileSync(path, 'utf8'), relative(root, path)));
  if (violations.length) {
    process.stderr.write(`${violations.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Inline menu check passed across ${paths.length} files.\n`);
  }
}
