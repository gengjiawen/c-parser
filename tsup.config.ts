import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/adapter/astexplorer.ts'],
  format: ['cjs', 'esm'],
  // dts is emitted by `tsc --emitDeclarationOnly` (see the build script):
  // tsup's bundled rollup-plugin-dts needs the JS compiler API, which the
  // native TypeScript 7 package no longer ships.
  sourcemap: true,
  clean: true,
});
