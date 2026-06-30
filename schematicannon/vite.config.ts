import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    dts({
      entryRoot: 'src',
      outDir: 'dist',
      rollupTypes: true
    })
  ],
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        cli: 'src/cli/index.ts'
      },
      name: 'schematicannon',
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: [
        'node:path',
        'node:fs/promises',
        'node:child_process',
        'commander',
        'gl-matrix',
        'deepslate'
      ]
    },
    minify: true
  }
});
