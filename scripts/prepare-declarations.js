// Emit declaration graphs for both Node ESM and CommonJS resolution.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { await visit(path); continue; }
    if (!path.endsWith('.d.ts')) continue;
    const source = (await readFile(path, 'utf8')).replace(/^\/\/# sourceMappingURL=.*$/gm, '');
    // Includes module augmentations and side-effect imports, not just `from`.
    const specifiers = /(['"])(\.{1,2}\/[^'"\n]+)\1/g;
    const esm = source.replace(specifiers, (_, quote, spec) => quote + spec.replace(/\.js$/, '') + '.js' + quote);
    const cjs = source.replace(specifiers, (_, quote, spec) => quote + spec.replace(/\.js$/, '') + '.cjs' + quote);
    await writeFile(path, esm);
    await writeFile(path.replace(/\.d\.ts$/, '.d.cts'), cjs);
  }
}
await visit(new URL('../dist', import.meta.url).pathname);
